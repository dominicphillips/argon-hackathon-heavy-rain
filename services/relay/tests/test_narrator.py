from types import SimpleNamespace

import pytest
from google.genai.types import GenerateContentConfig

from relay.live_builder import LiveBuilderSettings
from relay.narrator import parse_rewrite, rewrite_feed_line


@pytest.mark.parametrize("text", [
    '{"title":"Review", "detail":"I review the weekly work."}',
    '```json\n{"title":"Review", "detail":"I review the weekly work."}\n```',
    'Here is the result: {"title":"Review", "detail":"I review the weekly work."} End.',
    '{broken} {"title":"Review", "detail":"I review the weekly work."}',
])
def test_lenient_narrator_json(text):
    assert parse_rewrite(text) == {"title": "Review", "detail": "I review the weekly work."}


@pytest.mark.parametrize("text", [None, "unavailable", '[]', '{"title": 1, "detail": "Review"}',
                                   {"title": "x" * 49, "detail": "Review"},
                                   {"title": "Review", "detail": "x" * 221},
                                   {"title": " ", "detail": "Review"}])
def test_invalid_narrator_output(text):
    assert parse_rewrite(text) is None


def test_narrator_wires_template_model_and_timeout_without_expanding_input():
    calls = []
    def generate_content(**kwargs):
        calls.append(kwargs)
        GenerateContentConfig.model_validate(kwargs["config"])
        return SimpleNamespace(text='```json\n{"title":"Review", "detail":"I review the weekly work."}\n```')
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    result = rewrite_feed_line("thought", "Thinking", "{{app_name}} original", {
        "requested_by_name": "Marcus", "requested_by_role": "VP", "app_name": "DealPulse",
        "workflow_title": "Weekly work", "model": "test-model", "client_factory": lambda: client,
    })
    assert result["title"] == "Review"
    call = calls[0]
    assert call["model"] == "test-model"
    assert all(value in call["contents"] for value in ("Marcus", "VP", "DealPulse", "Weekly work", "thought"))
    assert all(token not in call["contents"] for token in ("{{requested_by_name}}", "{{requested_by_role}}", "{{workflow_title}}", "{{kind}}", "{{raw_text}}"))
    assert "{{app_name}} original" in call["contents"]
    assert call["config"]["http_options"] == {"timeout": 6000, "retry_options": {"attempts": 1}}


@pytest.mark.parametrize("response", [SimpleNamespace(text="invalid"), RuntimeError("unavailable")])
def test_narrator_preserves_original_on_failure(response):
    def generate_content(**kwargs):
        if isinstance(response, Exception):
            raise response
        return response
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    assert rewrite_feed_line("thought", "Thinking", "Original", {"client_factory": lambda: client}) == {
        "title": "Thinking", "detail": "Original",
    }


def test_narrator_environment_defaults_and_override(monkeypatch, tmp_path):
    monkeypatch.setenv("HEAVY_RAIN_ARTIFACT_ROOT", str(tmp_path))
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("HEAVY_RAIN_LIVE_BUILDER", "1")
    monkeypatch.delenv("HEAVY_RAIN_NARRATOR", raising=False)
    monkeypatch.delenv("HEAVY_RAIN_NARRATOR_MODEL", raising=False)
    settings = LiveBuilderSettings.from_environment()
    assert settings.enabled and settings.narrator_enabled
    assert settings.narrator_model == "gemini-3.8-flash"
    monkeypatch.setenv("HEAVY_RAIN_NARRATOR", "0")
    assert not LiveBuilderSettings.from_environment().narrator_enabled
    monkeypatch.delenv("HEAVY_RAIN_NARRATOR")
    monkeypatch.setenv("HEAVY_RAIN_LIVE_BUILDER", "0")
    assert not LiveBuilderSettings.from_environment().narrator_enabled
    monkeypatch.setenv("HEAVY_RAIN_NARRATOR", "1")
    monkeypatch.setenv("HEAVY_RAIN_NARRATOR_MODEL", "test-model")
    assert LiveBuilderSettings.from_environment().narrator_model == "test-model"
