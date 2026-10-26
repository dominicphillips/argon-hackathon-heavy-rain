from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import tarfile
import tempfile
import threading
from typing import Any, Callable
import uuid

from fastapi import HTTPException
from pydantic import ValidationError

from relay.builder_driver import MANAGED_BUILDER_AGENT, safe_extract_archive, validate_antigravity_agent_config
from relay.db import RelayDatabase
from relay.models import (
    LiveBuildAccepted, LiveBuildArtifact, LiveBuildCard, LiveBuildFileProgress, LiveBuildLiveSnapshot,
    LiveBuildRequest, LiveBuildRun,
    LiveBuildUsage, OrganizationFixture, OrganizationId,
)
from relay.narrator import DEFAULT_MODEL, TIMEOUT_SECONDS, parse_rewrite, rewrite_feed_line
from relay.sse import SseEventHub

MODULE_ROOT = Path(__file__).parent
COPY = json.loads((MODULE_ROOT / "live_copy.json").read_text(encoding="utf-8"))
PROMPT_PATH = MODULE_ROOT / "prompts" / "live_builder.md"
ARGON_PROMPT_PATH = MODULE_ROOT / "prompts" / "live_builder_argon.md"
FLASH_MODEL = "gemini-3.8-flash"
ARGON_MODEL = "gemini-4-argon"
CSS_PATH = MODULE_ROOT / "assets" / "scaffold.css"
PLACEHOLDERS = {
    "org_name", "requested_by_name", "requested_by_role", "workflow_title", "workflow_summary",
    "workflow_tools", "app_name", "app_purpose", "app_features", "app_assumptions", "scaffold_css",
}
PLACEHOLDER_PATTERN = re.compile(r"{{\s*([^{}]+?)\s*}}")
TERMINAL_STATUSES = {"completed", "failed", "cancelled", "incomplete", "requires_action"}
STATUS_TITLES = {
    "queued": COPY["queued_title"], "in_progress": "Started working", "requires_action": "Paused: needs input",
    "incomplete": "Stopped early", "completed": "Finished", "failed": "Failed", "cancelled": COPY["cancelled_title"],
}


def validate_live_builder_template(prompt_path: Path | None = None) -> str:
    template = (prompt_path if prompt_path is not None else PROMPT_PATH).read_text(encoding="utf-8")
    found = set(PLACEHOLDER_PATTERN.findall(template))
    if found != PLACEHOLDERS:
        raise ValueError(COPY["template_invalid"].format(placeholders=", ".join(sorted(found ^ PLACEHOLDERS))))
    CSS_PATH.read_text(encoding="utf-8")
    return template


def compose_live_builder_prompt(
    request: LiveBuildRequest, org_fixture: OrganizationFixture, prompt_path: Path | None = None,
) -> str:
    template = validate_live_builder_template(prompt_path)
    values = {
        "org_name": org_fixture.name, "requested_by_name": request.requested_by.name,
        "requested_by_role": request.requested_by.role, "workflow_title": request.workflow.title,
        "workflow_summary": request.workflow.summary, "workflow_tools": ", ".join(request.workflow.tools),
        "app_name": request.app.name, "app_purpose": request.app.purpose,
        "app_features": "\n".join(f"- {item}" for item in request.app.features),
        "app_assumptions": "\n".join(f"- {item}" for item in request.app.assumptions),
        "scaffold_css": CSS_PATH.read_text(encoding="utf-8"),
    }
    # Substitute once, so submitted text cannot expand another template token.
    return PLACEHOLDER_PATTERN.sub(lambda match: values[match.group(1)], template)


@dataclass(frozen=True)
class LiveBuilderSettings:
    enabled: bool
    model: str
    max_total_tokens: int
    poll_seconds: float
    artifact_root: Path
    public_base_url: str
    narrator_enabled: bool = True
    narrator_model: str = DEFAULT_MODEL

    @classmethod
    def from_environment(cls) -> LiveBuilderSettings:
        model = os.environ.get("HEAVY_RAIN_BUILDER_MODEL", "gemini-3.8-flash")
        cap = os.environ.get("HEAVY_RAIN_BUILDER_MAX_TOTAL_TOKENS", "262144")
        config = validate_antigravity_agent_config(
            {"type": "antigravity", "model": model, "max_total_tokens": cap}, live=True,
        )
        poll = float(os.environ.get("HEAVY_RAIN_BUILDER_POLL_SECONDS", "3"))
        if not math.isfinite(poll) or poll <= 0:
            raise ValueError("HEAVY_RAIN_BUILDER_POLL_SECONDS must be positive and finite")
        enabled = os.environ.get("HEAVY_RAIN_LIVE_BUILDER") == "1" and bool(os.environ.get("GEMINI_API_KEY", "").strip())
        return cls(
            narrator_enabled=os.environ.get("HEAVY_RAIN_NARRATOR", "1" if enabled else "0") == "1",
            narrator_model=os.environ.get("HEAVY_RAIN_NARRATOR_MODEL", DEFAULT_MODEL),
            enabled=enabled,
            model=model, max_total_tokens=int(config["max_total_tokens"]), poll_seconds=poll,
            artifact_root=Path(os.environ.get("HEAVY_RAIN_ARTIFACT_ROOT", str(MODULE_ROOT.parent / "data" / "artifacts"))).resolve(),
            public_base_url=os.environ.get("HEAVY_RAIN_PUBLIC_BASE_URL", "http://127.0.0.1:43180").rstrip("/"),
        )


def field(value: Any, name: str, default: Any = None) -> Any:
    return value.get(name, default) if isinstance(value, dict) else getattr(value, name, default)


def plain(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    return value


class LiveBuilderService:
    max_run_seconds = 40 * 60
    file_scan_seconds = 15
    progress_poll_seconds = 10
    early_progress_seconds = 20

    def __init__(self, db: RelayDatabase, hub: SseEventHub, lock: asyncio.Lock,
                 settings: LiveBuilderSettings, genai_client_factory: Callable[[], Any] | None = None,
                 narrator: Callable[..., dict[str, str]] | None = None):
        validate_live_builder_template()
        if ARGON_PROMPT_PATH.exists():
            validate_live_builder_template(ARGON_PROMPT_PATH)
        self.db, self.hub, self.lock, self.settings = db, hub, lock, settings
        self.tasks: dict[str, asyncio.Task] = {}
        self._narrator = narrator or rewrite_feed_line
        self._narration_cache: dict[str, dict[str, dict[str, str] | None]] = {}
        self._factory = genai_client_factory
        self._client = None
        self._client_lock = threading.Lock()
        self._secret = os.environ.get("GEMINI_API_KEY", "")
        settings.artifact_root.mkdir(parents=True, exist_ok=True)

    def require_enabled(self) -> None:
        if not self.settings.enabled:
            raise HTTPException(status_code=503, detail="Live builder is disabled on this relay.")

    def _get_client(self):
        with self._client_lock:
            if self._client is None:
                if self._factory:
                    self._client = self._factory()
                else:
                    from google import genai
                    self._client = genai.Client(
                        api_key=self._secret, http_options={"api_version": "v1beta", "timeout": 60000},
                    )
            return self._client

    def _create(self, prompt: str, model: str | None = None):
        return self._get_client().interactions.create(
            agent=MANAGED_BUILDER_AGENT, environment="remote", background=True, store=True,
            agent_config=validate_antigravity_agent_config({
                "type": "antigravity", "model": model if model is not None else self.settings.model,
                "max_total_tokens": self.settings.max_total_tokens,
            }, live=True), input=prompt,
        )

    def redact(self, value: Any, limit: int | None = 600) -> str:
        value = plain(value)
        text = value if isinstance(value, str) else json.dumps(value, default=str, ensure_ascii=False)
        if self._secret:
            text = text.replace(self._secret, "[redacted]")
        text = re.sub(r"AIza[\w-]{20,}", "[redacted]", text)
        text = re.sub(r"(?i)((?:gemini_api_key|google_api_key|x-goog-api-key|api_key|api-key|authorization|access_token)\s*[\"']?\s*[:=]\s*[\"']?)([^\s\"'&,}]+)", r"\1[redacted]", text)
        text = re.sub(r"(?i)bearer\s+[^\s\"',}]+", "Bearer [redacted]", text)
        text = re.sub(r"```[\s\S]*?(?:```|$)", COPY["file_body_omitted"], text)
        text = re.sub(r"(?is)<(?:!doctype|html|head|body|script|style|svg)\b.*", COPY["file_body_omitted"], text)
        return text[:limit]

    def _safe_value(self, value: Any, key: str = "", *, shorten: bool = True) -> Any:
        value = plain(value)
        if re.search(r"(?i)(secret|password|api.?key|authorization|token)", key):
            return "[redacted]"
        if key.lower() in {"content", "contents", "body", "file_content", "file_contents", "source", "code", "patch", "diff", "new_text", "old_text", "text", "data"}:
            return COPY["file_body_omitted"]
        if isinstance(value, dict):
            return {self.redact(k, 80): self._safe_value(v, str(k), shorten=shorten) for k, v in value.items()}
        if isinstance(value, list):
            return [self._safe_value(item, shorten=shorten) for item in value]
        if isinstance(value, str):
            if key.lower() in {"command", "cmd", "script"} and re.search(
                r"(?i)(<<|\becho\b|\bprintf\b|write_text|write_bytes|\.write\(|\bcat\s+[^|]*\.(html|css|js|md|json))", value,
            ):
                return COPY["file_body_omitted"]
            if shorten and len(value) > 200:
                return f"[{len(value)} chars]"
            return self.redact(value)
        return value

    def _raw_text(self, detail: Any) -> str:
        text = detail if isinstance(detail, str) else json.dumps(plain(detail), default=str, ensure_ascii=False)
        return self.redact(text, None)

    @staticmethod
    def _narration_key(raw: str) -> str:
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    @staticmethod
    def _feed_line(step: Any) -> tuple[str, str, str] | None:
        kind = field(step, "type")
        if kind == "UNKNOWN":
            kind = field(field(step, "raw", {}), "type")
        if kind == "thought":
            text = "\n".join(field(item, "text", "") or "" for item in field(step, "summary", []) or []).strip().replace("**", "")
            return ("thought", "Thinking", text) if text else None
        if kind == "model_output":
            text = "\n".join(field(item, "text", "") or "" for item in field(step, "content", []) or [])
            return "message", "Note from the builder", text
        return None

    async def _prepare_narration(self, run: LiveBuildRun, steps: list[Any], deadline: float):
        if not self.settings.narrator_enabled:
            return
        cache = self._narration_cache.setdefault(run.runId, {})
        context = {
            "requested_by_name": self._raw_text(run.requestedBy.name),
            "requested_by_role": self._raw_text(run.requestedBy.role),
            "app_name": self._raw_text(run.app.name), "workflow_title": self._raw_text(run.workflow.title),
            "model": self.settings.narrator_model, "client_factory": self._get_client,
        }
        for step in steps:
            line = self._feed_line(step)
            if line is None:
                continue
            kind, title, detail = line
            raw = self._raw_text(detail)
            key = self._narration_key(raw)
            if key in cache:
                continue
            original = {"title": title, "detail": raw}
            remaining = deadline - asyncio.get_running_loop().time()
            if remaining <= 0:
                cache[key] = None
                continue
            try:
                result = await asyncio.wait_for(
                    asyncio.to_thread(self._narrator, kind, title, raw, context),
                    timeout=min(TIMEOUT_SECONDS, remaining),
                )
                cache[key] = parse_rewrite(result) if result != original else None
            except Exception:
                cache[key] = None

    def _snapshot_narration_steps(self, run: LiveBuildRun, snapshot: Any, completed_steps: set[int]) -> list[Any]:
        steps = field(snapshot, "steps", []) or []
        count = self.db.live_steps_recorded(run.runId)
        return [step for index, step in enumerate(steps) if index >= count and index not in completed_steps]

    def _stream_narration_steps(self, run, event, buffers, completed_steps, now):
        kind = field(event, "event_type")
        steps = []
        if kind in {"interaction.created", "interaction.completed", "interaction.status_update"}:
            snapshot = event if kind == "interaction.status_update" else field(event, "interaction", {})
            steps.extend(self._snapshot_narration_steps(run, snapshot, completed_steps))
        # Preview only text changes; the normal stream handler remains the sole buffer writer.
        candidates = {index: dict(buffer) for index, buffer in buffers.items()}
        index = field(event, "index")
        if kind == "step.delta" and index in candidates:
            delta = field(event, "delta", {})
            if field(delta, "type") == "thought_summary":
                candidates[index]["text"] += field(field(delta, "content", {}), "text", "") or ""
            elif field(delta, "type") == "text":
                candidates[index]["text"] += field(delta, "text", "") or ""
        if kind == "step.stop":
            buffer = candidates.pop(index, None)
            if buffer is not None and index not in completed_steps:
                steps.append(self._buffered_step(buffer))
        for buffer in candidates.values():
            if (buffer["step"].get("type") in {"thought", "model_output"}
                    and buffer["text"] and buffer["text"] != buffer["emitted_text"]
                    and now - buffer["last_emit"] >= self.early_progress_seconds):
                steps.append(self._buffered_step(buffer))
        return steps

    def _event(self, run: LiveBuildRun, kind: str, title: str, detail: Any = None, path: str | None = None):
        raw = self._raw_text(detail) if kind in {"thought", "message"} and detail is not None else None
        if raw is not None and self.settings.narrator_enabled:
            rewritten = self._narration_cache.get(run.runId, {}).get(self._narration_key(raw))
            if rewritten is not None:
                title, detail = rewritten["title"], rewritten["detail"]
        event = self.db.append_live_event(
            run.runId, kind=kind, title=self.redact(title, 80),
            detail=self.redact(detail) if detail is not None else None,
            path=self.redact(path, 1024) if path else None, raw=raw,
        )
        self.hub.publish(run.orgId, "live_build_progress", {**event.model_dump(), "runId": run.runId})
        return event

    async def accept(self, org: OrganizationFixture, request: LiveBuildRequest):
        self.require_enabled()
        effective_model = {"flash": FLASH_MODEL, "argon": ARGON_MODEL}.get(request.build_mode, self.settings.model)
        prompt_path = ARGON_PROMPT_PATH if effective_model == ARGON_MODEL else PROMPT_PATH
        prompt = compose_live_builder_prompt(request, org, prompt_path)
        async with self.lock:
            run, created, active_id = self.db.reserve_live_build(
                org.orgId, request, effective_model, f"live_{uuid.uuid4().hex}",
            )
        if active_id:
            raise HTTPException(status_code=409, detail=COPY["conflict"].format(run_id=active_id))
        assert run is not None
        if not created:
            return run, False
        try:
            interaction = await asyncio.to_thread(self._create, prompt, run.model)
            async with self.lock:
                run = self.db.get_live_build(org.orgId, run.runId)
                assert run is not None
                run.interactionId = field(interaction, "id") or None
                run.environmentId = field(interaction, "environment_id") or None
                self.db.save_live_build(run)
            if not run.interactionId:
                raise ValueError(COPY["provider_missing_id"].split(". Retry")[0] + ".")
        except Exception as exc:
            async with self.lock:
                run = self.db.get_live_build(org.orgId, run.runId)
                assert run is not None
                if run.status != "cancelled":
                    self._fail(run, self.redact(str(exc)))
            raise HTTPException(status_code=502, detail=run.errorReason) from None
        async with self.lock:
            self._event(run, "status", "Request received", COPY["request_detail"].format(
                app_name=request.app.name, requester=request.requested_by.name,
            ))
        accepted = LiveBuildAccepted(
            runId=run.runId, orgId=run.orgId, interactionId=run.interactionId,
            environmentId=run.environmentId, model=run.model, createdAt=run.startedAt,
        )
        if run.status == "cancelled":
            # Cancellation may arrive while the create call is still in flight.
            try:
                await asyncio.to_thread(self._get_client().interactions.cancel, run.interactionId)
            except Exception as exc:
                async with self.lock:
                    self._event(run, "error", "Failed", str(exc))
            return accepted, True
        task = asyncio.create_task(self._poll(run, interaction))
        self.tasks[run.runId] = task
        task.add_done_callback(lambda done: self.tasks.pop(run.runId, None))
        return accepted, True

    def _fail(self, run: LiveBuildRun, reason: str):
        run.status, run.phase, run.errorReason = "failed", "failed", self.redact(reason)
        run.completedAt = datetime.now(timezone.utc).isoformat()
        self.db.save_live_build(run)
        self._event(run, "error", "Failed", run.errorReason)

    @staticmethod
    def _paths(arguments: Any) -> list[str]:
        paths = []
        def visit(value):
            value = plain(value)
            if isinstance(value, dict):
                for key, item in value.items():
                    if key.lower() in {"path", "file", "filename", "file_path", "filepath", "target_path", "target_file", "destination"} and isinstance(item, str):
                        normalized = item.replace("\\", "/").lstrip("/").removeprefix("./")
                        path = PurePosixPath(normalized)
                        if path.parts and path.parts[0] == "workspace" and len(path.parts) > 1 and ".." not in path.parts:
                            paths.append(path.as_posix())
                    elif isinstance(item, (dict, list)):
                        visit(item)
            elif isinstance(value, list):
                for item in value:
                    visit(item)
        visit(arguments)
        return list(dict.fromkeys(paths))

    @staticmethod
    def _tool_group(name: str) -> str:
        if name in {"list_dir", "ls", "list_directory"}:
            return "list_dir"
        if name in {"read_file", "view_file", "get_file", "cat", "view_file_outline", "grep_search", "find_by_name"}:
            return "read"
        if name in {"write_file", "write_to_file", "create_file", "save_file"}:
            return "write"
        if name in {"edit_file", "replace_in_file", "replace_file_content", "multi_replace_file_content", "apply_patch"}:
            return "edit"
        if name in {"run_command", "bash", "execute", "shell", "run_terminal_cmd", "exec"}:
            return "command"
        return "other"

    @staticmethod
    def _feed(key: str, default: str, **tokens: str) -> str:
        feed = COPY.get("feed", {})
        template = feed.get(key) or default
        try:
            return template.format(**tokens).strip()
        except (KeyError, IndexError):
            return default.format(**tokens).strip()

    def _argument_detail(self, arguments: Any) -> Any:
        """Prefer the command or path the audience can read, taken from the already redacted arguments."""
        safe = self._safe_value(arguments)
        if isinstance(safe, dict):
            for key in ("command", "cmd", "Command", "CommandLine", "path", "file_path", "filepath", "TargetFile",
                        "AbsolutePath", "DirectoryPath", "target_file", "filename", "query", "Query"):
                item = safe.get(key)
                if isinstance(item, str) and item.strip():
                    return item
        return safe

    def _step(self, run: LiveBuildRun, step: Any, call_names: dict[str, str]):
        kind = field(step, "type", "status")
        if kind == "UNKNOWN":
            kind = field(field(step, "raw", {}), "type", "status")
        if kind in {"function_call", "code_execution_call"}:
            run.phase = "building"
        elif kind in {"thought", "model_output"} and run.phase == "received":
            run.phase = "reading"
        if kind == "thought":
            line = self._feed_line(step)
            if line is not None:
                self._event(run, *line)
        elif kind == "function_call":
            name = field(step, "name", "")
            call_names[field(step, "id", "")] = name
            arguments = field(step, "arguments", {}) or {}
            paths = self._paths(arguments)
            path = paths[0] if paths else ""
            group = self._tool_group(name)
            words = name.replace("_", " ").strip()
            defaults = {"list_dir": "Looking around the workspace", "read": "Reading {path}", "write": "Writing {path}",
                        "edit": "Editing {path}", "command": "Running a command", "other": "{tool}"}
            title = self._feed(f"call.{group}", defaults[group], path=path, tool=words)
            self._event(run, "tool_call", title, self._argument_detail(arguments))
            for path in paths:
                path = self.redact(path, 1024)
                if path not in run.filesWritten:
                    run.filesWritten.append(path)
                self._event(run, "file", self._feed("call.write", "Writing {path}", path=path) if group == "write" else path, path=path)
        elif kind == "function_result":
            name = field(step, "name") or call_names.get(field(step, "call_id", ""), "")
            is_error = field(step, "is_error", False)
            result = field(step, "result", "")
            group = self._tool_group(name)
            words = name.replace("_", " ").strip()
            if group == "read":
                detail = COPY["file_body_omitted"]
            else:
                detail = self.redact(self._safe_value(result, shorten=False), 300)
            if is_error:
                title = self._feed("result.failed", "Failed {tool}", tool=words, path="")
            else:
                defaults = {"list_dir": "Looked around the workspace", "read": "Read the file", "write": "Saved the file",
                            "edit": "Updated the file", "command": "Command finished", "other": "Finished {tool}"}
                title = self._feed(f"result.{group}", defaults[group], tool=words, path="")
            self._event(run, "error" if is_error else "tool_result", title, detail)
        elif kind == "code_execution_call":
            code = field(field(step, "arguments", {}), "code", "") or ""
            detail = "\n".join(code.splitlines()[:3])
            if re.search(r"(?i)(write_text|write_bytes|write_file|<<|\.write\(|<html|<svg)", code):
                detail = COPY["file_body_omitted"]
            self._event(run, "tool_call", self._feed("call.code", "Running code"), detail)
        elif kind == "code_execution_result":
            outcome = field(step, "result", None) or field(step, "output", None) or field(step, "stdout", None)
            detail = self.redact(self._safe_value(outcome, shorten=False), 300) if outcome else None
            self._event(run, "tool_result", self._feed("result.code", "Finished running code"), detail)
        elif kind == "model_output":
            self._event(run, *self._feed_line(step))
        else:
            words = str(kind).replace("_", " ")
            self._event(run, "status", self._feed("status.other", "{kind}", kind=words))

    def _apply_snapshot(self, run: LiveBuildRun, interaction: Any, call_names: dict[str, str],
                        streamed_steps: set[int] | None = None):
        run.environmentId = field(interaction, "environment_id") or run.environmentId
        # Persist a newly available environment before processing provider steps.
        self.db.save_live_build(run)
        steps = field(interaction, "steps", []) or []
        count = self.db.live_steps_recorded(run.runId)
        for index in range(count, len(steps)):
            if streamed_steps is None or index not in streamed_steps:
                self._step(run, steps[index], call_names)
            if streamed_steps is not None:
                streamed_steps.add(index)
            self.db.save_live_build(run)
            self.db.record_live_steps(run.runId, index + 1)
        self._update_usage(run, field(interaction, "usage"))
        status = field(interaction, "status", run.status)
        if status == "budget_exceeded":
            status = "incomplete"
        if status not in STATUS_TITLES:
            raise ValueError(f"Unsupported interaction status: {status}")
        if status != run.status:
            self._event(run, "status", STATUS_TITLES[status])
        run.status = status
        if status == "completed":
            run.phase = "checking"
        elif status in {"failed", "cancelled"}:
            run.phase = "failed"
            errors = field(interaction, "errors", []) or []
            run.errorReason = self.redact("; ".join(str(field(error, "message") or field(error, "code") or status) for error in errors) or status)
            run.completedAt = datetime.now(timezone.utc).isoformat()
        elif status == "incomplete":
            run.errorReason = "Stopped before finishing (token or time limit)."
        elif status == "requires_action":
            run.errorReason = "Waiting for input the relay cannot provide."
        self.db.save_live_build(run)

    def _update_usage(self, run: LiveBuildRun, usage: Any):
        if usage is not None:
            run.usage = LiveBuildUsage(
                totalTokens=field(usage, "total_tokens", 0) or 0,
                totalThoughtTokens=field(usage, "total_thought_tokens", 0) or 0,
                totalOutputTokens=field(usage, "total_output_tokens", 0) or 0,
            )

    async def _stream(self, interaction_id: str, last_event_id: str | None):
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue()
        stopped = threading.Event()
        stream_handle = [None]

        def close_stream():
            stream = stream_handle[0]
            if stream is not None and hasattr(stream, "close"):
                try:
                    stream.close()
                except Exception:
                    pass

        def send(kind, value=None):
            if not stopped.is_set():
                try:
                    loop.call_soon_threadsafe(queue.put_nowait, (kind, value))
                except RuntimeError:
                    pass  # Shutdown may finish before a blocked provider read returns.

        def read():
            stream = None
            try:
                kwargs = {"stream": True}
                if last_event_id:
                    kwargs["last_event_id"] = last_event_id
                stream = self._get_client().interactions.get(interaction_id, **kwargs)
                stream_handle[0] = stream
                if stopped.is_set():
                    return
                for event in stream:
                    if stopped.is_set():
                        break
                    send("event", event)
            except Exception as exc:
                send("error", exc)
            finally:
                close_stream()
                send("end")

        # A blocked network read must not hold up cancellation or loop shutdown.
        threading.Thread(target=read, daemon=True, name="live-builder-stream").start()
        try:
            while True:
                try:
                    kind, value = await asyncio.wait_for(queue.get(), timeout=min(1, self.early_progress_seconds))
                except TimeoutError:
                    yield None
                    continue
                if kind == "end":
                    return
                if kind == "error":
                    raise value
                yield field(value, "data", value)
        finally:
            stopped.set()
            await asyncio.to_thread(close_stream)

    @staticmethod
    def _buffered_step(buffer: dict) -> dict:
        step = dict(buffer["step"])
        if step.get("type") == "thought":
            step["summary"] = [{"text": buffer["text"]}]
        elif step.get("type") == "model_output":
            step["content"] = [{"text": buffer["text"]}]
        if buffer["arguments"]:
            try:
                step["arguments"] = json.loads(buffer["arguments"])
            except ValueError:
                # Never publish incomplete argument JSON: it can contain file bodies.
                step["arguments"] = {}
        return step

    def _stream_event(self, run, event, buffers, completed_steps, call_names, now):
        kind = field(event, "event_type")
        if kind in {"interaction.created", "interaction.completed"}:
            self._apply_snapshot(run, field(event, "interaction", {}), call_names, completed_steps)
        elif kind == "interaction.status_update":
            self._apply_snapshot(run, event, call_names, completed_steps)
        elif kind == "step.start":
            index = field(event, "index")
            if index not in completed_steps and index not in buffers:
                step = dict(plain(field(event, "step", {})))
                texts = step.get("summary" if step.get("type") == "thought" else "content") or []
                buffers[index] = {"step": step, "text": "\n".join(field(t, "text", "") or "" for t in texts),
                                  "arguments": "", "last_emit": now, "emitted_text": ""}
        elif kind == "step.delta":
            buffer = buffers.get(field(event, "index"))
            if buffer is not None:
                delta = field(event, "delta", {})
                delta_kind = field(delta, "type")
                if delta_kind == "thought_summary":
                    buffer["text"] += field(field(delta, "content", {}), "text", "") or ""
                elif delta_kind == "text":
                    buffer["text"] += field(delta, "text", "") or ""
                elif delta_kind == "arguments_delta":
                    buffer["arguments"] += field(delta, "arguments", "") or ""
                elif delta_kind == "code_execution_call":
                    arguments = buffer["step"].setdefault("arguments", {}) or {}
                    delta_arguments = plain(field(delta, "arguments", {}))
                    arguments["code"] = (arguments.get("code") or "") + (delta_arguments.get("code") or "")
                    if delta_arguments.get("language"):
                        arguments["language"] = delta_arguments["language"]
                    buffer["step"]["arguments"] = arguments
                elif delta_kind in {"function_result", "code_execution_result"}:
                    step = buffer["step"]
                    result = plain(field(delta, "result", ""))
                    previous = step.get("result")
                    step["result"] = previous + result if isinstance(previous, str) and isinstance(result, str) else result
                    for key in ("name", "is_error"):
                        value = field(delta, key)
                        if value is not None:
                            step[key] = value
        elif kind == "step.stop":
            index = field(event, "index")
            buffer = buffers.pop(index, None)
            if buffer is not None and index not in completed_steps:
                self._step(run, self._buffered_step(buffer), call_names)
                completed_steps.add(index)
            self._update_usage(run, field(event, "usage") or field(event, "step_usage"))
        elif kind == "error":
            error = field(event, "error", {})
            raise RuntimeError(field(error, "message") or field(error, "code") or "Failed")
        self.db.save_live_build(run)
        return kind == "interaction.completed" or run.status in TERMINAL_STATUSES - {"completed"}

    async def _poll_progress(self, org_id, run_id):
        while True:
            await asyncio.sleep(self.progress_poll_seconds)
            async with self.lock:
                run = self.db.get_live_build(org_id, run_id)
                if run is None or run.status in TERMINAL_STATUSES:
                    return
                if run.status != "in_progress" or not run.environmentId:
                    continue
                environment_id = run.environmentId
            try:
                content = await asyncio.to_thread(
                    self._get_client().environments.files.download,
                    environment=environment_id, path="workspace/app/progress.json",
                )
                text = content.decode("utf-8-sig").strip()
                if text.startswith("```"):
                    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text).strip()
                value = json.loads(text)
                if not isinstance(value, dict) or not isinstance(value.get("doing"), str):
                    continue
                lists = {}
                for name in ("done", "next"):
                    items = value.get(name) or []
                    if isinstance(items, str):
                        items = [items]
                    lists[name] = [self.redact(item) for item in items if isinstance(item, str)] if isinstance(items, list) else []
                progress = LiveBuildFileProgress(
                    step=value.get("step"), of=value.get("of"), doing=self.redact(value["doing"]),
                    **lists, updatedAt=datetime.now(timezone.utc).isoformat(),
                )
                async with self.lock:
                    run = self.db.get_live_build(org_id, run_id)
                    if run is None or run.status != "in_progress":
                        return
                    changed = run.progress is None or run.progress.doing != progress.doing
                    run.progress = progress
                    self.db.save_live_build(run)
                    if changed:
                        self._event(run, "status", f"Step {progress.step} of {progress.of}: {progress.doing}")
            except Exception:
                pass  # The file may be missing or only partly written between builder steps.

    def _live_snapshot_root(self, org_id, run_id):
        root = self.settings.artifact_root
        live = root / org_id / run_id / "live"
        live.resolve().relative_to(root)
        for path in (live.parent.parent, live.parent, live, live / "index.html", live / "scaffold.css"):
            if path.is_symlink():
                raise ValueError("Unsafe snapshot path")
        return live

    async def _snapshot_files(self, org_id, run_id, environment_id, items):
        entries = {field(item, "path", item if isinstance(item, str) else ""): item for item in items
                   if field(item, "type") != "directory" and not field(item, "is_directory", False)}
        if "workspace/app/index.html" not in entries:
            return
        async with self.lock:
            run = self.db.get_live_build(org_id, run_id)
            if run is None or run.status != "in_progress":
                return
            live = self._live_snapshot_root(org_id, run_id)
        downloads = {}
        for name in ("index.html", "scaffold.css"):
            path = f"workspace/app/{name}"
            size = field(entries.get(path), "size_bytes")
            destination = live / name
            if isinstance(size, int) and destination.is_file() and destination.stat().st_size == size:
                continue
            try:
                content = await asyncio.to_thread(
                    self._get_client().environments.files.download, environment=environment_id, path=path,
                )
                if isinstance(content, bytes):
                    downloads[name] = content
            except Exception:
                pass  # HTML can arrive before the stylesheet; keep the last usable files.
        async with self.lock:
            run = self.db.get_live_build(org_id, run_id)
            if run is None or run.status != "in_progress":
                return
            live = self._live_snapshot_root(org_id, run_id)
            if "index.html" not in downloads and not (live / "index.html").is_file():
                return
            changed = False
            live.mkdir(parents=True, exist_ok=True)
            for name, content in downloads.items():
                destination = live / name
                if not destination.is_file() or destination.read_bytes() != content:
                    destination.write_bytes(content)
                    changed = True
            if changed:
                run.snapshot = LiveBuildLiveSnapshot(
                    indexUrl=f"{self.settings.public_base_url}/artifacts/{org_id}/{run_id}/live/index.html",
                    updatedAt=datetime.now(timezone.utc).isoformat(),
                    version=run.snapshot.version + 1 if run.snapshot else 1,
                )
                self.db.save_live_build(run)

    async def _scan_files(self, org_id, run_id):
        while True:
            await asyncio.sleep(self.file_scan_seconds)
            async with self.lock:
                run = self.db.get_live_build(org_id, run_id)
                if run is None or run.status in TERMINAL_STATUSES:
                    return
                environment_id = run.environmentId
            if not environment_id:
                continue
            try:
                listing = await asyncio.to_thread(
                    self._get_client().environments.files.list, environment=environment_id, path="workspace/app",
                )
                items = listing if isinstance(listing, list) else field(listing, "files", []) or []
                paths = []
                for item in items:
                    if field(item, "type") == "directory" or field(item, "is_directory", False):
                        continue
                    path = item if isinstance(item, str) else field(item, "path", "")
                    paths.extend(self._paths({"path": path}))
                async with self.lock:
                    run = self.db.get_live_build(org_id, run_id)
                    if run is None or run.status in TERMINAL_STATUSES:
                        return
                    for path in paths:
                        path = self.redact(path, 1024)
                        if path.startswith("workspace/app/") and path not in run.filesWritten:
                            run.filesWritten.append(path)
                            run.phase = "building"
                            self._event(run, "file", path, path=path)
                    self.db.save_live_build(run)
                await self._snapshot_files(org_id, run_id, environment_id, items)
            except Exception:
                pass  # Listing is supplementary; a missing workspace is normal early in a run.

    async def _complete(self, run, deadline):
        artifact, count = await asyncio.wait_for(
            asyncio.to_thread(self._download_artifact, run),
            timeout=max(0.001, deadline - asyncio.get_running_loop().time()),
        )
        async with self.lock:
            run = self.db.get_live_build(run.orgId, run.runId)
            if run is None or run.status in {"failed", "cancelled"}:
                return
            self._event(run, "status", f"Downloaded {count} files")
            if artifact is None:
                self._fail(run, "The builder finished without an index.html.")
            else:
                self.db.save_live_artifact(run.runId, artifact)
                run.phase = "ready"
                run.completedAt = datetime.now(timezone.utc).isoformat()
                run.errorReason = None
                self.db.save_live_build(run)
                self._event(run, "status", "Preview ready")

    async def _poll(self, initial_run: LiveBuildRun, snapshot: Any):
        org_id, run_id = initial_run.orgId, initial_run.runId
        loop = asyncio.get_running_loop()
        elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(initial_run.startedAt)).total_seconds()
        deadline = loop.time() + max(0, self.max_run_seconds - elapsed)
        failures = 0
        call_names: dict[str, str] = {}
        buffers, completed_steps, event_ids = {}, set(), set()
        last_event_id = None
        streaming = True
        scanner = asyncio.create_task(self._scan_files(org_id, run_id))
        progress_poller = asyncio.create_task(self._poll_progress(org_id, run_id))
        try:
            while True:
                if loop.time() >= deadline:
                    await self._expire(org_id, run_id)
                    return
                try:
                    if snapshot is not None or not streaming:
                        if snapshot is None:
                            snapshot = await asyncio.wait_for(asyncio.to_thread(
                                self._get_client().interactions.get, initial_run.interactionId,
                            ), timeout=max(0.001, deadline - loop.time()))
                        await self._prepare_narration(initial_run,
                            self._snapshot_narration_steps(initial_run, snapshot, completed_steps), deadline)
                        async with self.lock:
                            run = self.db.get_live_build(org_id, run_id)
                            if run is None or run.status in {"failed", "cancelled"}:
                                return
                            self._apply_snapshot(run, snapshot, call_names, completed_steps)
                        if loop.time() >= deadline:
                            await self._expire(org_id, run_id)
                            return
                        snapshot = None
                    else:
                        stream = self._stream(initial_run.interactionId, last_event_id)
                        try:
                            async for event in stream:
                                if loop.time() >= deadline:
                                    await self._expire(org_id, run_id)
                                    return
                                event_id = field(event, "event_id") if event is not None else None
                                if event_id and event_id in event_ids:
                                    continue
                                event_now = loop.time()
                                await self._prepare_narration(initial_run,
                                    self._stream_narration_steps(initial_run, event, buffers, completed_steps, event_now), deadline)
                                async with self.lock:
                                    run = self.db.get_live_build(org_id, run_id)
                                    if run is None or run.status in {"failed", "cancelled"}:
                                        return
                                    terminal = False
                                    if event is not None:
                                        event_id = field(event, "event_id")
                                        if event_id and event_id in event_ids:
                                            continue
                                        terminal = self._stream_event(run, event, buffers, completed_steps, call_names, event_now)
                                        if event_id:
                                            last_event_id = event_id
                                            event_ids.add(event_id)
                                    for buffer in buffers.values():
                                        if (buffer["step"].get("type") in {"thought", "model_output"}
                                                and buffer["text"] and buffer["text"] != buffer["emitted_text"]
                                                and event_now - buffer["last_emit"] >= self.early_progress_seconds):
                                            self._step(run, self._buffered_step(buffer), call_names)
                                            buffer["last_emit"], buffer["emitted_text"] = event_now, buffer["text"]
                                            self.db.save_live_build(run)
                                if loop.time() >= deadline:
                                    await self._expire(org_id, run_id)
                                    return
                                if terminal:
                                    break
                        finally:
                            await stream.aclose()
                        streaming = last_event_id is not None
                    if run.status == "completed" and not run.environmentId:
                        # Lifecycle stream payloads omit environment_id in this SDK.
                        final_snapshot = await asyncio.wait_for(asyncio.to_thread(
                            self._get_client().interactions.get, initial_run.interactionId,
                        ), timeout=max(0.001, deadline - loop.time()))
                        await self._prepare_narration(initial_run,
                            self._snapshot_narration_steps(initial_run, final_snapshot, completed_steps), deadline)
                        async with self.lock:
                            run = self.db.get_live_build(org_id, run_id)
                            if run is None or run.status in {"failed", "cancelled"}:
                                return
                            self._apply_snapshot(run, final_snapshot, call_names, completed_steps)
                        if loop.time() >= deadline:
                            await self._expire(org_id, run_id)
                            return
                    if run.status == "completed":
                        await self._complete(run, deadline)
                        return
                    if run.status in TERMINAL_STATUSES:
                        return
                    failures = 0
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    if loop.time() >= deadline:
                        await self._expire(org_id, run_id)
                        return
                    streaming = last_event_id is not None
                    failures += 1
                    async with self.lock:
                        run = self.db.get_live_build(org_id, run_id)
                        if run is None or run.status in {"failed", "cancelled"}:
                            return
                        self._event(run, "error", COPY["poll_error_title"] if failures < 5 else COPY["poll_failed_title"], str(exc))
                        if failures >= 5:
                            self._fail(run, self.redact(str(exc)))
                            return
                await asyncio.sleep(min(self.settings.poll_seconds, max(0, deadline - loop.time())))
        finally:
            self._narration_cache.pop(run_id, None)
            scanner.cancel()
            progress_poller.cancel()
            await asyncio.gather(scanner, progress_poller, return_exceptions=True)

    def _download_artifact(self, run: LiveBuildRun) -> tuple[LiveBuildArtifact | None, int]:
        if not run.environmentId:
            raise ValueError(COPY["provider_missing_environment"])
        archive = None
        for path in ("workspace/app", "workspace", "/"):
            try:
                archive = self._get_client().environments.files.download(path=path, environment=run.environmentId)
                break
            except Exception:
                if path == "/":
                    raise
        if not isinstance(archive, bytes):
            raise ValueError(COPY["download_failed"])
        run_root = self.settings.artifact_root / run.orgId / run.runId
        with tempfile.TemporaryDirectory(prefix=".live-build-", dir=self.settings.artifact_root) as temporary:
            extracted = Path(temporary) / "extracted"
            try:
                safe_extract_archive(archive, extracted, archive_format="tar")
            except tarfile.ReadError:
                if extracted.exists():
                    shutil.rmtree(extracted)
                safe_extract_archive(archive, extracted, archive_format="zip")
            preferred = [extracted / "app/index.html", extracted / "index.html", extracted / "workspace/app/index.html"]
            candidates = sorted(extracted.rglob("index.html"), key=lambda item: (len(item.relative_to(extracted).parts), str(item)))
            index = next((path for path in preferred + candidates if path.is_file()), None)
            source = index.parent if index else extracted
            normalized = Path(temporary) / "normalized"
            shutil.copytree(source, normalized)
            run_root.parent.mkdir(parents=True, exist_ok=True)
            saved_live = Path(temporary) / "live"
            if run.snapshot and self._live_snapshot_root(run.orgId, run.runId).is_dir():
                (run_root / "live").replace(saved_live)
            if run_root.exists():
                shutil.rmtree(run_root)
            normalized.replace(run_root)
            files = [path for path in run_root.rglob("*") if path.is_file()]
            artifact_bytes = sum(path.stat().st_size for path in files)
            if saved_live.exists():
                if (run_root / "live").is_dir():
                    shutil.rmtree(run_root / "live")
                elif (run_root / "live").exists():
                    (run_root / "live").unlink()
                saved_live.replace(run_root / "live")
        if index is None:
            return None, len(files)
        card = None
        card_path = run_root / "card.json"
        if card_path.is_file():
            try:
                card = LiveBuildCard.model_validate_json(card_path.read_bytes())
            except (ValidationError, ValueError, UnicodeError):
                pass
        notes_path = run_root / "NOTES.md"
        base = f"{self.settings.public_base_url}/artifacts/{run.orgId}/{run.runId}"
        artifact = LiveBuildArtifact(
            indexUrl=f"{base}/index.html", previewUrl=f"{base}/preview.svg" if (run_root / "preview.svg").is_file() else None,
            notes=notes_path.read_text(encoding="utf-8", errors="replace") if notes_path.is_file() else None,
            card=card, fileCount=len(files), bytes=artifact_bytes,
        )
        return artifact, len(files)

    async def _expire(self, org_id: OrganizationId, run_id: str):
        async with self.lock:
            run = self.db.get_live_build(org_id, run_id)
            if run is None or run.phase in {"ready", "failed"}:
                return
        try:
            if run.interactionId:
                await asyncio.wait_for(asyncio.to_thread(self._get_client().interactions.cancel, run.interactionId), timeout=60)
        except Exception as exc:
            async with self.lock:
                self._event(run, "error", "Failed", str(exc))
        async with self.lock:
            current = self.db.get_live_build(org_id, run_id)
            if current is not None and current.status != "cancelled":
                self._fail(current, "Build exceeded 40 minutes")

    async def cancel(self, org_id: OrganizationId, run_id: str) -> LiveBuildRun:
        self.require_enabled()
        async with self.lock:
            run = self.db.get_live_build(org_id, run_id)
            if run is None:
                raise HTTPException(status_code=404, detail=COPY["unknown_run"])
            if run.status in {"failed", "cancelled"} or run.phase == "ready":
                return run
        # Best effort on the provider side: the operator's cancel must always clear the run locally.
        try:
            if run.interactionId:
                await asyncio.to_thread(self._get_client().interactions.cancel, run.interactionId)
        except Exception as exc:
            async with self.lock:
                self._event(run, "error", COPY.get("cancel_remote_failed_title", "Could not stop the remote run"), self.redact(str(exc)))
        task = self.tasks.get(run_id)
        if task:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        async with self.lock:
            run = self.db.get_live_build(org_id, run_id)
            assert run is not None
            run.status, run.phase, run.errorReason = "cancelled", "failed", "Cancelled by operator"
            run.completedAt = datetime.now(timezone.utc).isoformat()
            self.db.save_live_build(run)
            self._event(run, "status", COPY["cancelled_title"], run.errorReason)
            return run

    async def shutdown(self):
        tasks = list(self.tasks.values())
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        if self._client is not None and self._factory is None:
            await asyncio.to_thread(self._client.close)
