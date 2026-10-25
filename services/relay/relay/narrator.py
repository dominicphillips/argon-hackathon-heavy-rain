from __future__ import annotations

import json
import os
from pathlib import Path
import re
from typing import Any

PROMPT_PATH = Path(__file__).parent / "prompts" / "live_narrator.md"
PLACEHOLDER_PATTERN = re.compile(r"{{\s*([^{}]+?)\s*}}")
DEFAULT_MODEL = "gemini-3.8-flash"
TIMEOUT_SECONDS = 6.0


def parse_rewrite(value: Any) -> dict[str, str] | None:
    if isinstance(value, str):
        decoder = json.JSONDecoder()
        for match in re.finditer(r"\{", value):
            try:
                candidate, _ = decoder.raw_decode(value[match.start():])
            except ValueError:
                continue
            parsed = parse_rewrite(candidate)
            if parsed is not None:
                return parsed
        return None
    if not isinstance(value, dict):
        return None
    title, detail = value.get("title"), value.get("detail")
    if not isinstance(title, str) or not isinstance(detail, str):
        return None
    title, detail = title.strip(), detail.strip()
    if not title or not detail or len(title) > 48 or len(detail) > 220:
        return None
    return {"title": title, "detail": detail}


def rewrite_feed_line(kind: str, title: str, detail: str, context: dict[str, Any]) -> dict[str, str]:
    original = {"title": title, "detail": detail}
    try:
        values = {key: str(context.get(key, "")) for key in (
            "requested_by_name", "requested_by_role", "app_name", "workflow_title",
        )}
        values.update(kind=kind, raw_text=detail)
        template = PROMPT_PATH.read_text(encoding="utf-8")
        prompt = PLACEHOLDER_PATTERN.sub(lambda match: values[match.group(1)], template)
        factory = context.get("client_factory")
        if factory is None:
            from google import genai
            client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
        else:
            client = factory()
        response = client.models.generate_content(
            model=context.get("model") or os.environ.get("HEAVY_RAIN_NARRATOR_MODEL", DEFAULT_MODEL),
            contents=prompt,
            config={"response_mime_type": "application/json", "automatic_continuation": False,
                    "http_options": {"timeout": int(TIMEOUT_SECONDS * 1000), "retry_options": {"attempts": 1}}},
        )
        return parse_rewrite(response.text) or original
    except Exception:
        return original
