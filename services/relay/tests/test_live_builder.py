from __future__ import annotations

import asyncio
from collections import deque
from concurrent.futures import ThreadPoolExecutor
import copy
import io
import json
from pathlib import Path
import sqlite3
import tarfile
import threading
import time
from types import SimpleNamespace
import zipfile

from fastapi.testclient import TestClient
from google.genai.interactions import Interaction, AntigravityAgentConfig
import pytest

from relay.app import create_app
from relay.builder_driver import InvalidAgentConfigError, validate_antigravity_agent_config
from relay.db import RelayDatabase
from relay.fixtures_loader import get_organization_fixture
from relay.live_builder import compose_live_builder_prompt
from relay.models import LiveBuildRequest
from relay.sse import SseEventHub

BASE = "/api/v1/orgs/meridian/builds/live"
SECRET = "test-provider-secret-do-not-log"
SAMPLE = {
    "idempotency_key": "marcus-2026-10-25-dealpulse",
    "requested_by": {"persona_id": "marcus", "name": "Marcus Vance", "role": "VP, Deal Sourcing & Screening"},
    "workflow": {"title": "15-minute pre-call scramble", "summary": "Before every founder call Marcus ...",
                 "tools": ["Outlook", "Affinity", "Claude", "Granola", "Gemini", "Excel", "Slack"], "weekly_hours_saved": 9.2},
    "app": {"name": "DealPulse AutoBrief", "purpose": "One pre-call brief assembled automatically ...",
            "features": ["T-20m auto pre-call brief", "Public comps ticker", "Granola to deal-team email draft"],
            "assumptions": ["Affinity is the CRM of record"]},
}
CARD = {"name": "DealPulse AutoBrief", "tagline": "One pre-call brief", "highlights": ["Brief", "Comps", "Draft"],
        "screens": ["Brief", "Comps", "Draft"]}


def snapshot(status="queued", steps=None, environment="env-test", usage=None, errors=None):
    return Interaction.model_validate({"id": "interaction-test", "status": status, "environment_id": environment,
                                       "steps": steps or [], "usage": usage, "errors": errors})


def archive_bytes(prefix="workspace/app/", fmt="tar", files=None):
    files = files if files is not None else {
        "index.html": b"<!doctype html><html><body>DealPulse preview</body></html>",
        "scaffold.css": b"body { color: black; }", "card.json": json.dumps(CARD).encode(),
        "preview.svg": b'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750"/>',
        "NOTES.md": b"Sample data for review.",
    }
    buf = io.BytesIO()
    if fmt == "zip":
        with zipfile.ZipFile(buf, "w") as zf:
            for name, data in files.items():
                zf.writestr(prefix + name, data)
    else:
        with tarfile.open(fileobj=buf, mode="w") as tf:
            for name, data in files.items():
                info = tarfile.TarInfo(prefix + name)
                info.size = len(data)
                tf.addfile(info, io.BytesIO(data))
    return buf.getvalue()


class FakeClient:
    def __init__(self, snapshots=(), archive=None, initial=None, create_error=None):
        self.snapshots = deque(snapshots)
        self.last = initial or snapshot()
        self.initial = self.last
        self.archive = archive if archive is not None else archive_bytes()
        self.create_error = create_error
        self.creates, self.gets, self.cancels, self.downloads = [], [], [], []
        self.download_fail_paths = set()
        self.workspace_files = {}
        self.listing = []
        self.list_calls = []
        self.on_create = None
        self.on_get = None
        self.interactions = SimpleNamespace(create=self.create, get=self.get, cancel=self.cancel)
        self.environments = SimpleNamespace(files=SimpleNamespace(download=self.download, list=self.list_files))

    def create(self, **kwargs):
        self.creates.append(kwargs)
        config = kwargs["agent_config"]
        assert type(config["max_total_tokens"]) is int
        AntigravityAgentConfig.model_validate(config)
        assert set(config) == {"type", "model", "max_total_tokens"}
        assert kwargs["agent"] == "antigravity-preview-09-2026"
        assert kwargs["environment"] == "remote"
        assert kwargs["background"] is True and kwargs["store"] is True
        if self.on_create:
            self.on_create()
        if self.create_error:
            raise self.create_error
        return self.initial

    def get(self, interaction_id, *, stream=False, last_event_id=None):
        if stream:
            return iter(())
        self.gets.append(interaction_id)
        if self.on_get:
            self.on_get()
        if self.snapshots:
            item = self.snapshots.popleft()
            if isinstance(item, Exception):
                raise item
            self.last = item
        return self.last

    def cancel(self, interaction_id):
        self.cancels.append(interaction_id)
        return snapshot("cancelled")

    def download(self, *, path, environment):
        self.downloads.append((path, environment))
        if path in self.download_fail_paths:
            raise FileNotFoundError(path)
        if path.startswith("workspace/app/"):
            if path not in self.workspace_files:
                raise FileNotFoundError(path)
            return self.workspace_files[path]
        return self.archive

    def list_files(self, *, environment, path):
        self.list_calls.append((environment, path))
        return SimpleNamespace(files=list(self.listing))


@pytest.fixture
def app_factory(tmp_path, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", SECRET)
    monkeypatch.setenv("HEAVY_RAIN_LIVE_BUILDER", "1")
    monkeypatch.setenv("HEAVY_RAIN_BUILDER_MODEL", "gemini-3.8-flash")
    monkeypatch.setenv("HEAVY_RAIN_BUILDER_POLL_SECONDS", "0.01")
    monkeypatch.setenv("HEAVY_RAIN_BUILDER_MAX_TOTAL_TOKENS", "262144")
    monkeypatch.setenv("HEAVY_RAIN_ARTIFACT_ROOT", str(tmp_path / "artifacts"))
    monkeypatch.setenv("HEAVY_RAIN_PUBLIC_BASE_URL", "http://127.0.0.1:43180")
    apps = []
    def make(fake=None, db_path=None, narrator=None):
        fake = fake or FakeClient()
        app = create_app(db_path=db_path or tmp_path / f"test-{len(apps)}.sqlite3",
                         operating_mode="demo_fixture_replay", live_builder_client_factory=lambda: fake,
                         live_builder_narrator=narrator or (lambda kind, title, detail, context: {"title": title, "detail": detail}))
        apps.append(app)
        return app
    yield make
    for app in apps:
        app.state.db.close()


def wait_snapshot(client, predicate, run_id=None):
    url = f"{BASE}/{run_id}" if run_id else f"{BASE}/current"
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        response = client.get(url)
        assert response.status_code == 200
        value = response.json()
        if predicate(value):
            return value
        time.sleep(0.005)
    pytest.fail(f"Build did not reach the expected state: {value['run']['status']}, {value['run']['phase']}")


def wait_terminal(client):
    return wait_snapshot(client, lambda value: value["run"]["phase"] in {"ready", "failed"}
                         or value["run"]["status"] in {"incomplete", "requires_action"})


@pytest.mark.parametrize("flag,key", [("0", SECRET), ("1", ""), ("1", "   ")])
def test_disabled_requires_both_flag_and_key(app_factory, monkeypatch, flag, key):
    monkeypatch.setenv("HEAVY_RAIN_LIVE_BUILDER", flag)
    monkeypatch.setenv("GEMINI_API_KEY", key)
    fake = FakeClient()
    with TestClient(app_factory(fake)) as client:
        result = client.post(BASE, json=SAMPLE)
        assert result.status_code == 503
        assert result.json() == {"detail": "Live builder is disabled on this relay."}
        assert client.get(BASE + "/current").status_code == 503
        health = client.get("/health").json()
        assert health["liveBuilderEnabled"] is False
        assert health["liveRuntimeEnabled"] is False
    assert not fake.creates


def test_accept_persists_first_and_replays_without_second_build(app_factory):
    fake = FakeClient(initial=snapshot(environment=None))
    app = app_factory(fake)
    def check_reserved():
        row = app.state.db._conn.execute("SELECT * FROM live_builds").fetchone()
        assert row["status"] == "queued" and row["phase"] == "received"
        assert row["interaction_id"] is None
    fake.on_create = check_reserved
    with TestClient(app) as client:
        assert client.get(BASE + "/current").json() == {"run": None, "progress": [], "artifact": None}
        result = client.post(BASE, json=SAMPLE)
        assert result.status_code == 202
        accepted = result.json()
        assert set(accepted) == {"runId", "orgId", "status", "interactionId", "environmentId", "model", "createdAt"}
        assert accepted["status"] == "accepted" and accepted["orgId"] == "meridian"
        assert accepted["model"] == "gemini-3.8-flash" and accepted["environmentId"] is None
        replay = client.post(BASE, json=SAMPLE)
        assert replay.status_code == 200 and replay.json()["runId"] == accepted["runId"]
        assert replay.json()["status"] == "queued"
        assert replay.json()["requestedBy"]["personaId"] == "marcus"
        assert replay.json()["workflow"]["weeklyHoursSaved"] == 9.2
        conflict = client.post(BASE, json={**SAMPLE, "idempotency_key": "second-run"})
        assert conflict.status_code == 409 and accepted["runId"] in conflict.json()["detail"]
        assert client.get(f"{BASE}/{accepted['runId']}").json()["run"]["interactionId"] == "interaction-test"
        assert client.get(BASE + "/unknown").status_code == 404
    assert len(fake.creates) == 1


def test_progress_uses_sdk_snapshots_and_publishes_sse(app_factory):
    thought = {"type": "thought", "summary": [{"type": "text", "text": "Reviewing the requested workflow"}]}
    write = {"type": "function_call", "id": "call-1", "name": "write_file",
             "arguments": {"path": "workspace/app/index.html", "content": "PRIVATE FILE BODY", "description": "x" * 201}}
    result = {"type": "function_result", "call_id": "call-1", "name": "write_file", "result": "Saved"}
    message = {"type": "model_output", "content": [{"type": "text", "text": "The preview shell is ready."}]}
    fake = FakeClient([snapshot("in_progress", [thought])])
    app = app_factory(fake)
    published = []
    original = app.state.sse_hub.publish
    def publish(org, event_type, data):
        published.append((org, event_type, data))
        return original(org, event_type, data)
    app.state.sse_hub.publish = publish
    with TestClient(app) as client:
        run_id = client.post(BASE, json=SAMPLE).json()["runId"]
        reading = wait_snapshot(client, lambda v: v["run"]["phase"] == "reading")
        fake.snapshots.append(snapshot("in_progress", [thought, write, result, message], usage={
            "total_tokens": 99, "total_thought_tokens": 40, "total_output_tokens": 30, "total_input_tokens": 29,
        }))
        building = wait_snapshot(client, lambda v: v["run"]["usage"]["totalTokens"] == 99)
        assert building["run"]["phase"] == "building"
        assert building["run"]["filesWritten"] == ["workspace/app/index.html"]
        assert building["run"]["usage"] == {"totalTokens": 99, "totalThoughtTokens": 40, "totalOutputTokens": 30}
        events = building["progress"]
        assert {"thought", "tool_call", "tool_result", "message", "file", "status"} <= {e["kind"] for e in events}
        assert sum(e["kind"] == "thought" for e in events) == 1
        assert "PRIVATE FILE BODY" not in json.dumps(events)
        assert all(len(e.get("detail") or "") <= 600 for e in events)
        assert all(len(e["title"]) <= 80 and len(e["detail"] or "") <= 600 for e in events)
        cursor = reading["progress"][-1]["seq"]
        newer = client.get(BASE + f"/current?since={cursor}").json()
        assert all(e["seq"] > cursor for e in newer["progress"])
        assert newer["run"]["runId"] == run_id
        count = len(events)
        time.sleep(0.03)
        assert len(client.get(BASE + "/current").json()["progress"]) == count
        fake.snapshots.append(snapshot("completed", [thought, write, result, message]))
        ready = wait_terminal(client)
        assert ready["run"]["phase"] == "ready"
    live_events = [data for org, kind, data in published if kind == "live_build_progress" and org == "meridian"]
    assert live_events and all(event["runId"] == run_id for event in live_events)
    assert [e["seq"] for e in live_events] == list(range(1, len(live_events) + 1))


@pytest.mark.parametrize("fmt,prefix", [("tar", "app/"), ("zip", "workspace/app/"), ("tar", ""), ("tar", "output/")])
def test_completion_serves_normalized_archive_card_and_run_root(app_factory, fmt, prefix):
    fake = FakeClient([snapshot("completed")], archive=archive_bytes(prefix, fmt))
    with TestClient(app_factory(fake)) as client:
        run_id = client.post(BASE, json=SAMPLE).json()["runId"]
        ready = wait_terminal(client)
        assert ready["run"]["phase"] == "ready" and ready["run"]["completedAt"]
        artifact = ready["artifact"]
        assert artifact["card"] == CARD and artifact["fileCount"] == 5 and artifact["bytes"] > 0
        assert artifact["notes"] == "Sample data for review."
        assert artifact["previewUrl"].endswith("/preview.svg")
        assert artifact["indexUrl"] == f"http://127.0.0.1:43180/artifacts/meridian/{run_id}/index.html"
        assert "DealPulse preview" in client.get(artifact["indexUrl"]).text
        assert client.get(f"/artifacts/meridian/{run_id}/").status_code == 200
        assert client.get("/artifacts/meridian/").status_code == 404
        assert client.get(f"/artifacts/meridian/{run_id}/scaffold.css").status_code == 200
        assert "sandbox allow-scripts" in client.get(artifact["indexUrl"]).headers["content-security-policy"]
        assert [e["title"] for e in ready["progress"]][-2:] == ["Downloaded 5 files", "Preview ready"]
    assert fake.downloads == [("workspace/app", "env-test")]


def test_download_fallbacks_and_optional_metadata(app_factory):
    fake = FakeClient([snapshot("completed")], archive=archive_bytes(files={"index.html": b"preview", "card.json": b'{"name":42}'}))
    fake.download_fail_paths = {"workspace/app", "workspace"}
    with TestClient(app_factory(fake)) as client:
        client.post(BASE, json=SAMPLE)
        artifact = wait_terminal(client)["artifact"]
        assert artifact["card"] is None and artifact["notes"] is None and artifact["previewUrl"] is None
    assert [path for path, _ in fake.downloads] == ["workspace/app", "workspace", "/"]


def test_missing_index_keeps_files_and_fails(app_factory):
    fake = FakeClient([snapshot("completed")], archive=archive_bytes(prefix="", files={"NOTES.md": b"Partial"}))
    app = app_factory(fake)
    with TestClient(app) as client:
        run_id = client.post(BASE, json=SAMPLE).json()["runId"]
        failed = wait_terminal(client)
        assert failed["artifact"] is None
        assert failed["run"]["phase"] == "failed"
        assert failed["run"]["errorReason"] == "The builder finished without an index.html."
        assert (app.state.live_builder.settings.artifact_root / "meridian" / run_id / "NOTES.md").read_text() == "Partial"


@pytest.mark.parametrize("status,phase,reason", [
    ("failed", "failed", "Provider could not build"), ("cancelled", "failed", "cancelled"),
    ("incomplete", "reading", "Stopped before finishing (token or time limit)."),
    ("requires_action", "reading", "Waiting for input the relay cannot provide."),
    ("budget_exceeded", "reading", "Stopped before finishing (token or time limit)."),
])
def test_provider_terminal_states_keep_ids_and_reason(app_factory, status, phase, reason):
    thought = {"type": "thought", "summary": [{"type": "text", "text": "Checking requirements"}]}
    errors = [{"message": reason}] if status == "failed" else None
    fake = FakeClient([snapshot(status, [thought], errors=errors)])
    with TestClient(app_factory(fake)) as client:
        client.post(BASE, json=SAMPLE)
        terminal = wait_terminal(client)
        assert terminal["run"]["phase"] == phase and terminal["run"]["errorReason"] == reason
        assert terminal["run"]["environmentId"] == "env-test"
        calls = len(fake.gets)
        time.sleep(0.03)
        assert len(fake.gets) == calls
    assert fake.downloads == []


def test_create_failure_is_persisted_and_redacted_without_retry(app_factory):
    fake = FakeClient(create_error=RuntimeError(f"Provider rejected the request: {SECRET}"))
    with TestClient(app_factory(fake)) as client:
        result = client.post(BASE, json=SAMPLE)
        assert result.status_code == 502
        assert "Provider rejected" in result.json()["detail"] and SECRET not in result.text
        failed = client.get(BASE + "/current").json()
        assert failed["run"]["status"] == "failed" and failed["run"]["phase"] == "failed"
        assert SECRET not in json.dumps(failed)
        replay = client.post(BASE, json=SAMPLE)
        assert replay.status_code == 200 and replay.json()["status"] == "failed"
    assert len(fake.creates) == 1


def test_cancel_stops_poller(app_factory):
    fake = FakeClient([snapshot("in_progress")])
    app = app_factory(fake)
    with TestClient(app) as client:
        run_id = client.post(BASE, json=SAMPLE).json()["runId"]
        wait_snapshot(client, lambda value: value["run"]["status"] == "in_progress")
        response = client.post(f"{BASE}/{run_id}/cancel")
        assert response.status_code == 200
        assert response.json()["status"] == "cancelled"
        assert response.json()["phase"] == "failed"
        assert response.json()["errorReason"] == "Cancelled by operator"
        assert run_id not in app.state.live_builder_tasks
        count = len(fake.gets)
        time.sleep(0.03)
        assert len(fake.gets) == count
        assert client.post(BASE + "/unknown/cancel").status_code == 404
    assert fake.cancels == ["interaction-test"]


def test_meridian_empty_and_existing_tenants_preserved(app_factory):
    with TestClient(app_factory()) as client:
        orgs = client.get("/api/v1/orgs").json()["organizations"]
        assert {org["orgId"] for org in orgs} == {"rookmere", "augi", "meridian"}
        fixture = client.get("/api/v1/orgs/meridian/fixture").json()
        assert fixture["name"] == "Meridian Crest Capital" and fixture["shortLabel"] == "Meridian"
        for key in ("clusters", "reports", "catalogApps", "initialEvents", "rookmereCompanies", "augiConfigs"):
            assert fixture[key] == []
        workspace = client.get("/api/v1/orgs/meridian/workspace").json()
        assert workspace["buildStage"] == "idle"
        assert workspace["events"] == [] and workspace["clusters"] == [] and workspace["catalogApps"] == []
        assert workspace["selectedReportId"] == workspace["selectedAppId"] == workspace["selectedClusterId"] == ""
        for org in ("rookmere", "augi"):
            other = client.get(f"/api/v1/orgs/{org}/workspace").json()
            assert other["buildStage"] == "stage2" and other["clusters"] and other["catalogApps"] and other["events"]
            assert "event: trace_event" in client.get(f"/api/v1/orgs/{org}/events/stream").text
        assert client.get("/api/v1/orgs/meridian/events/stream").status_code == 200


@pytest.mark.parametrize("origin", ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"])
def test_origins_pass_cors_and_loopback_boundary(app_factory, origin):
    with TestClient(app_factory()) as client:
        preflight = client.options(BASE, headers={"Origin": origin, "Access-Control-Request-Method": "POST",
                                                  "Access-Control-Request-Headers": "content-type"})
        assert preflight.status_code == 200
        assert preflight.headers["access-control-allow-origin"] == origin
        result = client.post(BASE, json=SAMPLE, headers={"Origin": origin})
        assert result.status_code == 202 and result.headers["access-control-allow-origin"] == origin
        assert client.get(BASE + "/current", headers={"Origin": "https://untrusted.example"}).status_code == 403


def test_meridian_actor_isolation_and_run_ownership(app_factory):
    with TestClient(app_factory()) as client:
        for actor in ("marcus", "elena", "devon", "priya", "claire", "emp_mc_001"):
            assert client.get("/api/v1/orgs/meridian/workspace", headers={"X-HeavyRain-Actor-Id": actor}).status_code == 200
            assert client.get("/api/v1/orgs/augi/workspace", headers={"X-HeavyRain-Actor-Id": actor}).status_code == 403
        for actor in ("emp_rm_01", "emp_augi_01", "stranger"):
            assert client.get(BASE + "/current", headers={"X-HeavyRain-Actor-Id": actor}).status_code == 403
        assert client.post(BASE, json=SAMPLE, headers={"X-HeavyRain-Actor-Id": "elena"}).status_code == 403
        assert client.post(BASE, json=SAMPLE, headers={"X-HeavyRain-Org-Id": "augi"}).status_code == 403
        run_id = client.post(BASE, json=SAMPLE).json()["runId"]
        assert client.get(f"/api/v1/orgs/augi/builds/live/{run_id}").status_code == 404
        assert client.post(f"/api/v1/orgs/augi/builds/live/{run_id}/cancel").status_code == 404


def test_request_trimming_validation_and_prompt_wiring(app_factory):
    request = copy.deepcopy(SAMPLE)
    request["idempotency_key"] = "  trimmed-key  "
    request["app"]["name"] = "  DealPulse AutoBrief  "
    request["app"]["features"] = ["  First feature  "]
    request["workflow"]["tools"] = [" Outlook "]
    request["requested_by"]["name"] = " Marcus Vance "
    request["ignored"] = "not passed"
    request["app"]["ignored"] = "not passed"
    model = LiveBuildRequest.model_validate(request)
    assert model.idempotency_key == "trimmed-key" and model.app.features == ["First feature"]
    assert model.workflow.tools == ["Outlook"] and model.requested_by.name == "Marcus Vance"
    prompt = compose_live_builder_prompt(model, get_organization_fixture("meridian"))
    assert "{{" not in prompt and "Meridian Crest Capital" in prompt and "- First feature" in prompt
    assert "--sf-bg: #f3f2ee" in prompt and "not passed" not in prompt
    fake = FakeClient()
    with TestClient(app_factory(fake)) as client:
        for key in ("short", "x" * 129):
            assert client.post(BASE, json={**SAMPLE, "idempotency_key": key}).status_code == 422
        for features in ([], ["feature"] * 9):
            assert client.post(BASE, json={**SAMPLE, "app": {**SAMPLE["app"], "features": features}}).status_code == 422
        for name in ("  a  ", "a" * 81):
            assert client.post(BASE, json={**SAMPLE, "app": {**SAMPLE["app"], "name": name}}).status_code == 422
        assert client.post(BASE, json=request).status_code == 202
    assert fake.creates[0]["input"] == prompt


def test_template_checked_at_startup_without_changing_owned_prompt(app_factory, monkeypatch, tmp_path):
    import relay.live_builder as live
    template = tmp_path / "bad-prompt.md"
    template.write_text("{{org_name}}")
    monkeypatch.setattr(live, "PROMPT_PATH", template)
    with pytest.raises(ValueError, match="placeholders"):
        app_factory()


def test_live_sdk_config_keeps_fixture_rules():
    fixture = validate_antigravity_agent_config()
    assert fixture["model"] == "gemini-4-argon" and fixture["max_total_tokens"] == "262144"
    for model in ("gemini-3.8-flash", "gemini-4-argon"):
        result = validate_antigravity_agent_config({"type": "antigravity", "model": model, "max_total_tokens": 1234}, live=True)
        assert result["max_total_tokens"] == 1234
    with pytest.raises(InvalidAgentConfigError):
        validate_antigravity_agent_config({"type": "antigravity", "model": "gemini-3.8-flash", "max_total_tokens": "1234"})
    for cap in (True, 0, -1, 1_048_577, "not-an-integer"):
        with pytest.raises(InvalidAgentConfigError):
            validate_antigravity_agent_config({"type": "antigravity", "model": "gemini-3.8-flash", "max_total_tokens": cap}, live=True)
    for forbidden in ("thinking_level", "max_output_tokens"):
        with pytest.raises(InvalidAgentConfigError):
            validate_antigravity_agent_config({**fixture, forbidden: "high"}, live=True)


def test_late_environment_and_configured_model(app_factory, monkeypatch):
    monkeypatch.setenv("HEAVY_RAIN_BUILDER_MODEL", "gemini-4-argon")
    monkeypatch.setenv("HEAVY_RAIN_BUILDER_MAX_TOTAL_TOKENS", "8192")
    monkeypatch.setenv("HEAVY_RAIN_PUBLIC_BASE_URL", "http://localhost:43180/")
    fake = FakeClient([snapshot("completed", environment="late-env")], initial=snapshot(environment=None))
    with TestClient(app_factory(fake)) as client:
        accepted = client.post(BASE, json=SAMPLE).json()
        assert accepted["environmentId"] is None and accepted["model"] == "gemini-4-argon"
        result = wait_terminal(client)
        assert result["run"]["environmentId"] == "late-env"
        assert result["artifact"]["indexUrl"].startswith("http://localhost:43180/artifacts/")
        assert client.get("/health").json()["liveBuilderModel"] == "gemini-4-argon"
    assert fake.creates[0]["agent_config"]["max_total_tokens"] == 8192
    assert fake.downloads == [("workspace/app", "late-env")]


def test_five_poll_errors_fail_and_redact(app_factory):
    fake = FakeClient([RuntimeError(f"Unavailable {SECRET}") for _ in range(5)])
    with TestClient(app_factory(fake)) as client:
        client.post(BASE, json=SAMPLE)
        result = wait_terminal(client)
        assert result["run"]["status"] == "failed"
        assert "Unavailable" in result["run"]["errorReason"]
        assert SECRET not in json.dumps(result)
    assert len(fake.gets) == 5


def test_poll_failure_counter_resets_after_success(app_factory):
    fake = FakeClient([*[RuntimeError("Temporary failure")] * 4, snapshot("in_progress"),
                       *[RuntimeError("Temporary failure")] * 4, snapshot("completed")])
    with TestClient(app_factory(fake)) as client:
        client.post(BASE, json=SAMPLE)
        result = wait_terminal(client)
        assert result["run"]["phase"] == "ready"
    assert len(fake.gets) == 10


def test_time_limit_cancels_provider_and_fails(app_factory):
    fake = FakeClient()
    app = app_factory(fake)
    app.state.live_builder.max_run_seconds = 0.025
    with TestClient(app) as client:
        client.post(BASE, json=SAMPLE)
        result = wait_terminal(client)
        assert result["run"]["status"] == "failed"
        assert result["run"]["errorReason"] == "Build exceeded 40 minutes"
    assert fake.cancels == ["interaction-test"]


def test_poll_shutdown_and_restart_preserve_run_and_events(app_factory, tmp_path):
    fake = FakeClient([snapshot("in_progress")])
    db_path = tmp_path / "restart.sqlite3"
    first = app_factory(fake, db_path)
    with TestClient(first) as client:
        run_id = client.post(BASE, json=SAMPLE).json()["runId"]
        prior = wait_snapshot(client, lambda value: value["run"]["status"] == "in_progress")
    assert first.state.live_builder_tasks == {}
    count = len(fake.gets)
    time.sleep(0.025)
    assert len(fake.gets) == count
    second_fake = FakeClient()
    with TestClient(app_factory(second_fake, db_path)) as client:
        resumed = client.get(BASE + "/current").json()
        assert resumed["run"]["runId"] == run_id and resumed["run"]["status"] == "incomplete"
        assert resumed["run"]["errorReason"] == "Server restarted while the build was running."
        assert resumed["progress"] == prior["progress"]
        assert client.post(BASE, json=SAMPLE).status_code == 200
    assert not second_fake.creates and not second_fake.gets


def test_progress_limit_and_since_always_include_run_and_artifact(app_factory):
    steps = [{"type": "model_output", "content": [{"type": "text", "text": f"Progress {i}"}]} for i in range(410)]
    fake = FakeClient([snapshot("completed", steps)])
    with TestClient(app_factory(fake)) as client:
        run_id = client.post(BASE, json=SAMPLE).json()["runId"]
        final = wait_terminal(client)
        assert len(final["progress"]) == 400
        assert [e["seq"] for e in final["progress"]] == sorted(e["seq"] for e in final["progress"])
        cursor = final["progress"][-1]["seq"]
        empty = client.get(f"{BASE}/{run_id}?since={cursor}").json()
        assert empty["progress"] == [] and empty["run"] == final["run"] and empty["artifact"] == final["artifact"]


@pytest.mark.parametrize("fmt,path", [("tar", "../../escape.html"), ("zip", "../escape.html"), ("tar", "/tmp/escape.html")])
def test_unsafe_archives_never_publish_artifacts(app_factory, tmp_path, fmt, path):
    fake = FakeClient([snapshot("completed")], archive=archive_bytes("", fmt, {path: b"unsafe"}))
    app = app_factory(fake)
    with TestClient(app) as client:
        run_id = client.post(BASE, json=SAMPLE).json()["runId"]
        result = wait_terminal(client)
        assert result["run"]["phase"] == "failed" and result["artifact"] is None
        assert not (app.state.live_builder.settings.artifact_root / "meridian" / run_id).exists()
        assert not (tmp_path / "escape.html").exists()


def test_existing_database_migrates_without_losing_fixture_state(app_factory, tmp_path):
    path = tmp_path / "legacy.sqlite3"
    db = RelayDatabase(path)
    db.append_audit_log(org_id="augi", actor_id="emp_augi_01", actor_role="operator",
                        action="test-preserve", target_id="augi", detail={})
    db._conn.execute("UPDATE builder_runs SET build_stage = 'paused' WHERE org_id = 'augi'")
    db._conn.execute("DELETE FROM weekly_batches WHERE org_id = 'meridian'")
    db._conn.execute("DELETE FROM organizations WHERE org_id = 'meridian'")
    db._conn.commit()
    schema = db._conn.execute("SELECT sql FROM sqlite_master WHERE name = 'organizations'").fetchone()[0]
    db._conn.execute("PRAGMA foreign_keys = OFF")
    db._conn.execute(schema.replace("organizations", "legacy_orgs", 1).replace(", 'meridian'", ""))
    db._conn.execute("INSERT INTO legacy_orgs SELECT * FROM organizations")
    db._conn.execute("DROP TABLE organizations")
    db._conn.execute("ALTER TABLE legacy_orgs RENAME TO organizations")
    db._conn.commit()
    before = db._conn.execute("SELECT COUNT(*) FROM mcp_reports").fetchone()[0]
    db.close()
    app = app_factory(db_path=path)
    with TestClient(app) as client:
        assert client.get("/api/v1/orgs/augi/workspace").json()["buildStage"] == "paused"
        assert client.get("/api/v1/orgs/meridian/workspace").json()["buildStage"] == "idle"
        assert app.state.db._conn.execute("SELECT COUNT(*) FROM mcp_reports").fetchone()[0] == before
        assert app.state.db._conn.execute("PRAGMA foreign_key_check").fetchall() == []
        assert app.state.db._conn.execute("SELECT COUNT(*) FROM audit_logs").fetchone()[0] == 1
        with pytest.raises(sqlite3.IntegrityError):
            app.state.db._conn.execute("DELETE FROM audit_logs")
        app.state.db._conn.rollback()


def test_inflight_create_can_be_read_and_cancelled(app_factory):
    entered, release = threading.Event(), threading.Event()
    fake = FakeClient()
    def hold_create():
        entered.set()
        assert release.wait(3)
    fake.on_create = hold_create
    app = app_factory(fake)
    with TestClient(app) as client, ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(client.post, BASE, json=SAMPLE)
        try:
            assert entered.wait(2)
            pending = client.get(BASE + "/current").json()["run"]
            assert pending["status"] == "queued" and pending["interactionId"] is None
            replay = client.post(BASE, json=SAMPLE)
            assert replay.status_code == 200 and replay.json()["runId"] == pending["runId"]
            assert client.get("/health").status_code == 200
            cancelled = client.post(f"{BASE}/{pending['runId']}/cancel").json()
            assert cancelled["status"] == "cancelled"
        finally:
            release.set()
        assert future.result(timeout=3).status_code == 202
        final = client.get(BASE + "/current").json()["run"]
        assert final["status"] == "cancelled" and final["interactionId"] == "interaction-test"
    assert fake.cancels == ["interaction-test"] and not fake.gets


def test_more_step_types_redact_file_bodies_and_credentials(app_factory):
    steps = [
        {"type": "thought", "signature": "private-signature", "summary": []},
        {"type": "function_call", "id": "r", "name": "read_file", "arguments": {"path": "workspace/app/NOTES.md"}},
        {"type": "function_result", "call_id": "r", "result": "PRIVATE READ FILE BODY"},
        {"type": "function_call", "id": "b", "name": "bash", "arguments": {"command": "pwd", "api_key": SECRET}},
        {"type": "function_result", "call_id": "b", "is_error": True, "result": "x" * 400},
        {"type": "code_execution_call", "id": "code", "arguments": {"code": "print(1)\nprint(2)\nprint(3)\nprint(4)", "language": "python"}},
        {"type": "future_tool_type", "data": "PRIVATE UNKNOWN BODY"},
        {"type": "model_output", "content": [{"type": "text", "text": f"Key: {SECRET}\n```html\nPRIVATE FENCED BODY\n```"}]},
    ]
    final = snapshot("completed", [step for step in steps if step["type"] != "future_tool_type"])
    final.steps.insert(6, {"type": "future_tool_type", "data": "PRIVATE UNKNOWN BODY"})
    fake = FakeClient([final])
    with TestClient(app_factory(fake)) as client:
        client.post(BASE, json=SAMPLE)
        events = wait_terminal(client)["progress"]
    serialized = json.dumps(events)
    for private in (SECRET, "PRIVATE READ FILE BODY", "PRIVATE UNKNOWN BODY", "private-signature", "PRIVATE FENCED BODY", "print(4)"):
        assert private not in serialized
    assert any(event["title"] == "Status: future tool type" for event in events)
    assert any(event["title"] == "Running code" and event["detail"] == "print(1)\nprint(2)\nprint(3)" for event in events)
    assert any(event["kind"] == "error" and len(event["detail"]) == 300 for event in events)
    assert not any(event["kind"] == "thought" for event in events)


def test_live_progress_reaches_meridian_sse():
    from relay.fixtures_loader import build_initial_workspace_state
    async def scenario():
        hub = SseEventHub()
        stream = hub.stream_initial_and_live("meridian", build_initial_workspace_state("meridian"), replay_only=False)
        await anext(stream)
        hub.publish("meridian", "live_build_progress", {"runId": "live-test", "seq": 1, "kind": "status", "title": "Request received"})
        frame = await asyncio.wait_for(anext(stream), timeout=1)
        assert "event: live_build_progress" in frame and "live-test" in frame
        await stream.aclose()
        assert not hub._subscribers["meridian"]
    asyncio.run(scenario())


def stream_event(event_type, **kwargs):
    from google.genai._gaos.types.interactions.interactionsseevent import InteractionSSEEvent
    from pydantic import TypeAdapter
    return TypeAdapter(InteractionSSEEvent).validate_python({"event_type": event_type, **kwargs})


class StreamingClient(FakeClient):
    def __init__(self, streams, **kwargs):
        super().__init__(**kwargs)
        self.streams = deque(streams)
        self.stream_calls, self.list_calls = [], []
        self.listing = []
        self.environments.files.list = self.list_files
        self.closed = threading.Event()

    def get(self, interaction_id, *, stream=False, last_event_id=None):
        if not stream:
            return super().get(interaction_id)
        self.stream_calls.append((interaction_id, last_event_id))
        script = self.streams.popleft()
        def events():
            try:
                for event in script:
                    if callable(event):
                        event()
                    elif isinstance(event, Exception):
                        raise event
                    else:
                        yield event
            finally:
                self.closed.set()
        return events()

    def list_files(self, *, environment, path):
        self.list_calls.append((environment, path))
        return SimpleNamespace(files=self.listing)


def test_streamed_steps_update_phases_usage_files_and_artifact(app_factory):
    from google.genai._gaos.types.interactions.interactionssestreamevent import InteractionSSEStreamEvent
    from google.genai._gaos.types.environments.environmentfile import EnvironmentFile
    release_thought, release_write, release_complete = threading.Event(), threading.Event(), threading.Event()
    thought = {"type": "thought", "summary": [{"type": "text", "text": "**Review**\nWorkflow. **Plan**\nA brief."}]}
    message = {"type": "model_output", "content": [{"type": "text", "text": "Starting the preview."}]}
    write = {"type": "function_call", "id": "write-1", "name": "write_file",
             "arguments": {"path": "workspace/app/index.html", "content": "PRIVATE STREAM FILE BODY", "api_key": SECRET}}
    usage = {"total_tokens": 42, "total_thought_tokens": 20, "total_output_tokens": 10}
    script = [
        InteractionSSEStreamEvent(data=stream_event("interaction.created", interaction={"id": "interaction-test", "status": "in_progress"})),
        stream_event("step.start", index=0, step={"type": "thought", "summary": []}),
        stream_event("step.delta", index=0, delta={"type": "thought_summary", "content": {"type": "text", "text": "**Review**\nWorkflow. "}}),
        stream_event("step.delta", index=0, delta={"type": "thought_summary", "content": {"type": "text", "text": "**Plan**\nA brief."}}),
        stream_event("step.stop", index=0, usage=usage),
        lambda: release_thought.wait(3),
        stream_event("step.start", index=1, step={"type": "model_output", "content": []}),
        stream_event("step.delta", index=1, delta={"type": "text", "text": "Starting "}),
        stream_event("step.delta", index=1, delta={"type": "text", "text": "the preview."}),
        stream_event("step.stop", index=1),
        lambda: release_write.wait(3),
        stream_event("step.start", index=2, step={"type": "function_call", "id": "write-1", "name": "write_file", "arguments": {}}),
        stream_event("step.delta", index=2, delta={"type": "arguments_delta", "arguments": json.dumps(write["arguments"])[:25]}),
        stream_event("step.delta", index=2, delta={"type": "arguments_delta", "arguments": json.dumps(write["arguments"])[25:]}),
        stream_event("step.stop", index=2),
        lambda: release_complete.wait(3),
        stream_event("interaction.status_update", interaction_id="interaction-test", status="completed", usage=usage),
        stream_event("interaction.completed", interaction={"id": "interaction-test", "status": "completed", "steps": [thought, message, write],
                                                           "usage": {**usage, "total_tokens": 99}}),
    ]
    fake = StreamingClient([script])
    app = app_factory(fake)
    app.state.live_builder.file_scan_seconds = 0.01
    published = []
    original = app.state.sse_hub.publish
    def publish(org, kind, data):
        published.append((kind, data))
        return original(org, kind, data)
    app.state.sse_hub.publish = publish
    try:
        with TestClient(app) as client:
            run_id = client.post(BASE, json=SAMPLE).json()["runId"]
            reading = wait_snapshot(client, lambda v: v["run"]["phase"] == "reading")
            assert reading["run"]["usage"]["totalTokens"] == 42
            assert [e["detail"] for e in reading["progress"] if e["kind"] == "thought"] == ["Review\nWorkflow. Plan\nA brief."]
            release_thought.set()
            note = wait_snapshot(client, lambda v: any(e["kind"] == "message" for e in v["progress"]))
            assert note["run"]["phase"] == "reading"
            release_write.set()
            building = wait_snapshot(client, lambda v: v["run"]["phase"] == "building")
            assert building["run"]["filesWritten"] == ["workspace/app/index.html"]
            fake.listing = [EnvironmentFile(path="workspace/app/index.html", type="file"),
                            EnvironmentFile(path="workspace/app/scaffold.css", type="file"),
                            EnvironmentFile(path="workspace/app/assets", type="directory"),
                            EnvironmentFile(path="workspace/app/../secret", type="file")]
            discovered = wait_snapshot(client, lambda v: len(v["run"]["filesWritten"]) == 2)
            assert discovered["run"]["filesWritten"] == ["workspace/app/index.html", "workspace/app/scaffold.css"]
            release_complete.set()
            ready = wait_terminal(client)
            assert ready["run"]["phase"] == "ready" and ready["run"]["usage"]["totalTokens"] == 99
            assert ready["artifact"]["card"] == CARD
            assert client.get(ready["artifact"]["indexUrl"]).status_code == 200
            assert client.get(f"/artifacts/meridian/{run_id}/").status_code == 200
            for kind in ("thought", "message", "tool_call"):
                assert sum(e["kind"] == kind for e in ready["progress"]) == 1
            assert sum(e["path"] == "workspace/app/index.html" for e in ready["progress"]) == 1
            assert SECRET not in json.dumps(ready["progress"])
            assert "PRIVATE STREAM FILE BODY" not in json.dumps(ready["progress"])
        assert not fake.gets
        assert fake.stream_calls == [("interaction-test", None)]
        assert fake.list_calls and set(fake.list_calls) == {("env-test", "workspace/app")}
        assert all(data["runId"] == run_id for kind, data in published if kind == "live_build_progress")
    finally:
        release_thought.set(); release_write.set(); release_complete.set()


def test_stream_resumes_mid_step_and_ignores_replayed_event_ids(app_factory):
    first_delta = stream_event("step.delta", index=0, event_id="event-2",
                               delta={"type": "thought_summary", "content": {"type": "text", "text": "First "}})
    fake = StreamingClient([
        [stream_event("step.start", index=0, event_id="event-1", step={"type": "thought", "summary": []}), first_delta],
        [first_delta,
         stream_event("step.delta", index=0, event_id="event-3", delta={"type": "thought_summary", "content": {"type": "text", "text": "second"}}),
         stream_event("step.stop", index=0, event_id="event-4"),
         stream_event("interaction.completed", event_id="event-5", interaction={"id": "interaction-test", "status": "completed"})],
    ])
    with TestClient(app_factory(fake)) as client:
        client.post(BASE, json=SAMPLE)
        ready = wait_terminal(client)
        assert ready["run"]["phase"] == "ready"
        assert [e["detail"] for e in ready["progress"] if e["kind"] == "thought"] == ["First second"]
    assert fake.stream_calls == [("interaction-test", None), ("interaction-test", "event-2")]
    assert not fake.gets


def test_stream_without_event_ids_falls_back_without_duplicate_steps(app_factory):
    thought = {"type": "thought", "summary": [{"type": "text", "text": "A summary"}]}
    fake = StreamingClient([[
        stream_event("step.start", index=0, step=thought), stream_event("step.stop", index=0),
    ]], snapshots=[snapshot("completed", [thought])])
    with TestClient(app_factory(fake)) as client:
        client.post(BASE, json=SAMPLE)
        ready = wait_terminal(client)
        assert ready["run"]["phase"] == "ready"
        assert sum(e["kind"] == "thought" for e in ready["progress"]) == 1
    assert fake.gets == ["interaction-test"]


def test_long_stream_step_emits_early_then_final_and_cancel_stays_responsive(app_factory):
    release = threading.Event()
    fake = StreamingClient([[
        stream_event("step.start", index=0, step={"type": "thought", "summary": []}),
        stream_event("step.delta", index=0, delta={"type": "thought_summary", "content": {"type": "text", "text": "**Review** A long step"}}),
        lambda: release.wait(3),
        stream_event("step.stop", index=0),
        stream_event("interaction.completed", interaction={"id": "interaction-test", "status": "completed"}),
    ]])
    app = app_factory(fake)
    app.state.live_builder.early_progress_seconds = 0.02
    try:
        with TestClient(app) as client:
            client.post(BASE, json=SAMPLE)
            early = wait_snapshot(client, lambda v: any(e["kind"] == "thought" for e in v["progress"]))
            assert early["run"]["phase"] == "reading" and early["artifact"] is None
            release.set()
            ready = wait_terminal(client)
            assert [e["detail"] for e in ready["progress"] if e["kind"] == "thought"] == ["Review A long step"] * 2
    finally:
        release.set()

    release = threading.Event()
    fake = StreamingClient([[
        stream_event("interaction.created", interaction={"id": "interaction-test", "status": "in_progress"}),
        lambda: release.wait(3),
        stream_event("interaction.completed", interaction={"id": "interaction-test", "status": "completed"}),
    ]])
    app = app_factory(fake)
    try:
        with TestClient(app) as client:
            run_id = client.post(BASE, json={**SAMPLE, "idempotency_key": "cancel-stream"}).json()["runId"]
            wait_snapshot(client, lambda v: v["run"]["status"] == "in_progress")
            started = time.monotonic()
            response = client.post(f"{BASE}/{run_id}/cancel")
            assert time.monotonic() - started < 1
            assert response.json()["status"] == "cancelled"
            assert not app.state.live_builder_tasks
            release.set()
            assert fake.closed.wait(1)
            assert not fake.downloads
    finally:
        release.set()


def test_streamed_results_code_and_status_usage_keep_existing_redaction(app_factory):
    release = threading.Event()
    fake = StreamingClient([[
        stream_event("step.start", index=0, step={"type": "function_call", "id": "read-1", "name": "read_file", "arguments": {"path": "workspace/app/index.html"}}),
        stream_event("step.stop", index=0),
        stream_event("step.start", index=1, step={"type": "function_result", "call_id": "read-1", "result": ""}),
        stream_event("step.delta", index=1, delta={"type": "function_result", "result": "PRIVATE READ BODY"}),
        stream_event("step.stop", index=1),
        stream_event("step.start", index=2, step={"type": "function_result", "call_id": "other", "result": ""}),
        stream_event("step.delta", index=2, delta={"type": "function_result", "name": "check", "is_error": True, "result": "Failed "}),
        stream_event("step.delta", index=2, delta={"type": "function_result", "result": SECRET}),
        stream_event("step.stop", index=2),
        stream_event("step.start", index=3, step={"type": "code_execution_call", "id": "code-1", "arguments": {"code": "", "language": "python"}}),
        stream_event("step.delta", index=3, delta={"type": "code_execution_call", "arguments": {"code": "print(1)\n", "language": "python"}}),
        stream_event("step.delta", index=3, delta={"type": "code_execution_call", "arguments": {"code": "print(2)", "language": "python"}}),
        stream_event("step.stop", index=3, step_usage={"total_tokens": 12}),
        lambda: release.wait(3),
        stream_event("interaction.status_update", interaction_id="interaction-test", status="incomplete", usage={"total_tokens": 50}),
    ]])
    try:
        with TestClient(app_factory(fake)) as client:
            client.post(BASE, json=SAMPLE)
            working = wait_snapshot(client, lambda v: v["run"]["usage"]["totalTokens"] == 12)
            assert working["run"]["phase"] == "building"
            assert any(e["title"] == "Running code" and e["detail"] == "print(1)\nprint(2)" for e in working["progress"])
            assert any(e["title"] == "Read file" for e in working["progress"])
            assert any(e["title"] == "Failed to run check" and e["detail"] == "Failed [redacted]" for e in working["progress"])
            assert "PRIVATE READ BODY" not in json.dumps(working["progress"])
            release.set()
            stopped = wait_terminal(client)
            assert stopped["run"]["status"] == "incomplete" and stopped["run"]["phase"] == "building"
            assert stopped["run"]["usage"]["totalTokens"] == 50
            assert not fake.downloads
    finally:
        release.set()


def test_stream_error_retries_are_bounded_and_redacted(app_factory):
    fake = StreamingClient([
        [stream_event("interaction.created", event_id="created", interaction={"id": "interaction-test", "status": "in_progress"}),
         stream_event("error", error={"message": SECRET})],
        *[[stream_event("error", error={"message": SECRET})] for _ in range(4)],
    ])
    with TestClient(app_factory(fake)) as client:
        client.post(BASE, json=SAMPLE)
        failed = wait_terminal(client)
        assert failed["run"]["status"] == "failed" and failed["run"]["errorReason"] == "[redacted]"
        assert SECRET not in json.dumps(failed)
    assert len(fake.stream_calls) == 5 and not fake.gets


def test_stream_deadline_cancels_blocked_read(app_factory):
    release = threading.Event()
    fake = StreamingClient([[
        stream_event("interaction.created", interaction={"id": "interaction-test", "status": "in_progress"}),
        lambda: release.wait(3),
    ]])
    app = app_factory(fake)
    app.state.live_builder.max_run_seconds = 0.1
    app.state.live_builder.early_progress_seconds = 0.02
    try:
        with TestClient(app) as client:
            client.post(BASE, json=SAMPLE)
            failed = wait_terminal(client)
            assert failed["run"]["errorReason"] == "Build exceeded 40 minutes"
            assert fake.cancels == ["interaction-test"] and not fake.downloads
            release.set()
            assert fake.closed.wait(1)
    finally:
        release.set()


def test_cancel_closes_sdk_stream_response_while_read_is_blocked(app_factory):
    from google.genai._gaos.utils.eventstreaming import Stream
    entered, closed, finished = threading.Event(), threading.Event(), threading.Event()
    class Response:
        def iter_bytes(self):
            yield b'data: {"event_type":"interaction.created","interaction":{"id":"interaction-test","status":"in_progress"}}\n\n'
            entered.set()
            try:
                closed.wait(3)
            finally:
                finished.set()
        def close(self):
            closed.set()
    fake = FakeClient()
    provider_stream = Stream(Response(), decoder=lambda value: json.loads(value))
    fake.interactions.get = lambda *args, **kwargs: provider_stream
    app = app_factory(fake)
    try:
        with TestClient(app) as client:
            run_id = client.post(BASE, json=SAMPLE).json()["runId"]
            wait_snapshot(client, lambda v: v["run"]["status"] == "in_progress")
            assert entered.wait(1)
            assert client.post(f"{BASE}/{run_id}/cancel").json()["status"] == "cancelled"
            assert closed.wait(0.1) and finished.wait(1)
            assert not fake.downloads
    finally:
        closed.set()


def test_stream_replay_of_create_steps_and_late_environment_id(app_factory):
    thought = {"type": "thought", "summary": [{"type": "text", "text": "Reviewing requirements"}]}
    fake = StreamingClient([[
        stream_event("step.start", index=0, step=thought),
        stream_event("step.stop", index=0),
        stream_event("interaction.completed", interaction={"id": "interaction-test", "status": "completed"}),
    ]], initial=snapshot("in_progress", [thought], environment=None),
       snapshots=[snapshot("completed", [thought])])
    with TestClient(app_factory(fake)) as client:
        client.post(BASE, json=SAMPLE)
        ready = wait_terminal(client)
        assert ready["run"]["phase"] == "ready" and ready["run"]["environmentId"] == "env-test"
        assert sum(e["kind"] == "thought" for e in ready["progress"]) == 1
        assert client.get(ready["artifact"]["indexUrl"]).status_code == 200
    assert fake.gets == ["interaction-test"] and fake.downloads == [("workspace/app", "env-test")]


def test_live_progress_and_snapshots_poll_alongside_stream_and_persist(app_factory, tmp_path):
    release = threading.Event()
    fake = StreamingClient([[
        lambda: release.wait(5),
        stream_event("interaction.completed", interaction={"id": "interaction-test", "status": "completed"}),
    ]], initial=snapshot("in_progress"))
    db_path = tmp_path / "progress.sqlite3"
    app = app_factory(fake, db_path=db_path)
    service = app.state.live_builder
    assert service.progress_poll_seconds == 10 and service.file_scan_seconds == 15
    service.progress_poll_seconds = service.file_scan_seconds = 0.02
    progress_path = "workspace/app/progress.json"
    index_path, css_path = "workspace/app/index.html", "workspace/app/scaffold.css"
    try:
        with TestClient(app) as client:
            run_id = client.post(BASE, json=SAMPLE).json()["runId"]
            missing = wait_snapshot(client, lambda v: (progress_path, "env-test") in fake.downloads)
            assert missing["run"]["progress"] is None and missing["run"]["snapshot"] is None
            fake.workspace_files.update({
                progress_path: json.dumps({"step": "1", "of": "3", "doing": "Build the page",
                                           "done": ["Read brief", SECRET], "next": "Check the page"}).encode(),
                index_path: b"<html>First preview</html>", css_path: b"body {color:black}",
            })
            fake.listing = [{"path": index_path, "type": "file"}, {"path": css_path, "type": "file"}]
            first = wait_snapshot(client, lambda v: v["run"]["progress"] and v["run"]["snapshot"])
            progress, live = first["run"]["progress"], first["run"]["snapshot"]
            assert progress["step"] == 1 and progress["of"] == 3
            assert progress["done"] == ["Read brief", "[redacted]"] and progress["next"] == ["Check the page"]
            assert progress["updatedAt"] and live["updatedAt"] and live["version"] == 1
            assert live["indexUrl"] == f"http://127.0.0.1:43180/artifacts/meridian/{run_id}/live/index.html"
            response = client.get(live["indexUrl"])
            assert response.status_code == 200 and response.content == fake.workspace_files[index_path]
            assert "sandbox allow-scripts" in response.headers["content-security-policy"]
            assert client.get(live["indexUrl"].replace("index.html", "scaffold.css")).content == fake.workspace_files[css_path]

            # A new size downloads; identical bytes without size metadata do not advance the version.
            before = len(fake.downloads)
            wait_snapshot(client, lambda v: len(fake.downloads) >= before + 6)
            unchanged = client.get(BASE + "/current").json()
            assert unchanged["run"]["snapshot"]["version"] == 1
            assert sum(e["title"] == "Step 1 of 3: Build the page" for e in unchanged["progress"]) == 1
            fake.workspace_files[index_path] = b"<html>Second preview with more content</html>"
            fake.workspace_files[progress_path] = json.dumps({"step": 2, "of": 3, "doing": "Build the page"}).encode()
            second = wait_snapshot(client, lambda v: v["run"]["snapshot"]["version"] == 2 and v["run"]["progress"]["step"] == 2)
            assert sum(e["title"].startswith("Step ") for e in second["progress"]) == 1
            assert client.get(live["indexUrl"]).content == fake.workspace_files[index_path]

            fake.workspace_files[css_path] = b"body {color:green}"
            fake.workspace_files[progress_path] = b'```json\n{"step":3,"of":3,"doing":"Check the page"}\n```'
            third = wait_snapshot(client, lambda v: v["run"]["snapshot"]["version"] == 3 and v["run"]["progress"]["step"] == 3)
            assert sum(e["title"].startswith("Step ") for e in third["progress"]) == 2
            assert client.get(live["indexUrl"].replace("index.html", "scaffold.css")).content == fake.workspace_files[css_path]
            assert not fake.gets
            assert set(fake.list_calls) == {("env-test", "workspace/app")}

            release.set()
            ready = wait_terminal(client)
            assert ready["run"]["snapshot"]["version"] == 3
            assert client.get(live["indexUrl"]).status_code == 200
            assert ready["artifact"]["fileCount"] == 5
            assert ready["artifact"]["bytes"] == sum(len(data) for data in (
                b"<!doctype html><html><body>DealPulse preview</body></html>", b"body { color: black; }",
                json.dumps(CARD).encode(), b'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750"/>',
                b"Sample data for review.",
            ))
            stored = app.state.db.get_live_build("meridian", run_id)
            assert stored.progress.model_dump() == ready["run"]["progress"]
            assert stored.snapshot.model_dump() == ready["run"]["snapshot"]
            with sqlite3.connect(db_path) as connection:
                row = connection.execute("SELECT progress, snapshot FROM live_builds WHERE run_id = ?", (run_id,)).fetchone()
                assert json.loads(row[0]) == ready["run"]["progress"]
                assert json.loads(row[1]) == ready["run"]["snapshot"]
    finally:
        release.set()


def test_live_snapshot_skips_matching_sizes_but_downloads_changed_files(app_factory):
    from google.genai.environments import EnvironmentFile
    release = threading.Event()
    fake = StreamingClient([[lambda: release.wait(5)]], initial=snapshot("in_progress"))
    index_path, css_path = "workspace/app/index.html", "workspace/app/scaffold.css"
    fake.workspace_files = {index_path: b"<html>First</html>", css_path: b"body {}"}
    def listing():
        return [EnvironmentFile(path=path, type="file", size_bytes=len(content)) for path, content in fake.workspace_files.items()]
    fake.listing = listing()
    app = app_factory(fake)
    app.state.live_builder.file_scan_seconds = 0.02
    try:
        with TestClient(app) as client:
            run_id = client.post(BASE, json=SAMPLE).json()["runId"]
            wait_snapshot(client, lambda v: v["run"]["snapshot"])
            before = len(fake.list_calls)
            wait_snapshot(client, lambda v: len(fake.list_calls) >= before + 3)
            assert fake.downloads == [(index_path, "env-test"), (css_path, "env-test")]
            fake.workspace_files[css_path] = b"body {color: blue}"
            fake.listing = listing()
            updated = wait_snapshot(client, lambda v: v["run"]["snapshot"]["version"] == 2)
            assert fake.downloads.count((index_path, "env-test")) == 1
            assert fake.downloads.count((css_path, "env-test")) == 2
            assert client.get(updated["run"]["snapshot"]["indexUrl"].replace("index.html", "scaffold.css")).content == fake.workspace_files[css_path]
            assert client.post(f"{BASE}/{run_id}/cancel").json()["status"] == "cancelled"
            release.set()
    finally:
        release.set()


def test_live_progress_tolerates_invalid_files_without_losing_last_value(app_factory):
    release = threading.Event()
    fake = StreamingClient([[lambda: release.wait(5)]], initial=snapshot("in_progress"))
    path = "workspace/app/progress.json"
    app = app_factory(fake)
    app.state.live_builder.progress_poll_seconds = 0.01
    try:
        with TestClient(app) as client:
            run_id = client.post(BASE, json=SAMPLE).json()["runId"]
            for invalid in (b"{", b"[]", b'{"doing":"Working"}', b'{"step":1,"of":3,"doing":{}}', b"\xff"):
                fake.workspace_files[path] = invalid
                before = len(fake.downloads)
                result = wait_snapshot(client, lambda v: len(fake.downloads) >= before + 2)
                assert result["run"]["progress"] is None and result["run"]["status"] == "in_progress"
            fake.workspace_files[path] = b'{"step":1,"of":3,"doing":"Working"}'
            valid = wait_snapshot(client, lambda v: v["run"]["progress"])
            fake.workspace_files[path] = b"{"
            before = len(fake.downloads)
            result = wait_snapshot(client, lambda v: len(fake.downloads) >= before + 2)
            assert result["run"]["progress"] == valid["run"]["progress"]
            assert not [event for event in result["progress"] if event["kind"] == "error"]
            client.post(f"{BASE}/{run_id}/cancel")
            release.set()
    finally:
        release.set()


@pytest.mark.parametrize("blocked_path", ["progress.json", "index.html"])
def test_live_polls_cannot_publish_after_cancel(app_factory, blocked_path):
    release_stream, release_download, entered = threading.Event(), threading.Event(), threading.Event()
    fake = StreamingClient([[lambda: release_stream.wait(5)]], initial=snapshot("in_progress"))
    fake.workspace_files = {"workspace/app/progress.json": b'{"step":1,"of":2,"doing":"Working"}',
                            "workspace/app/index.html": b"<html>Preview</html>", "workspace/app/scaffold.css": b"body {}"}
    fake.listing = [{"path": "workspace/app/index.html", "type": "file"}]
    original_download = fake.download
    def download(*, path, environment):
        if path == f"workspace/app/{blocked_path}":
            entered.set()
            release_download.wait(5)
        return original_download(path=path, environment=environment)
    fake.environments.files.download = download
    app = app_factory(fake)
    service = app.state.live_builder
    if blocked_path == "progress.json":
        service.progress_poll_seconds = 0.01
    else:
        service.file_scan_seconds = 0.01
    try:
        with TestClient(app) as client:
            run_id = client.post(BASE, json=SAMPLE).json()["runId"]
            assert entered.wait(1)
            cancelled = client.post(f"{BASE}/{run_id}/cancel").json()
            assert cancelled["status"] == "cancelled" and cancelled["progress"] is None and cancelled["snapshot"] is None
            assert not service.tasks
            release_download.set()
            release_stream.set()
        run = app.state.db.get_live_build("meridian", run_id)
        assert run.progress is None and run.snapshot is None
        assert not (service.settings.artifact_root / "meridian" / run_id / "live").exists()
    finally:
        release_download.set()
        release_stream.set()


def test_live_columns_migrate_existing_database(app_factory, tmp_path):
    path = tmp_path / "migration.sqlite3"
    app = app_factory(db_path=path)
    run, created, _ = app.state.db.reserve_live_build("meridian", LiveBuildRequest.model_validate(SAMPLE), "gemini-3.8-flash", "migration-run")
    assert created
    app.state.db.close()
    with sqlite3.connect(path) as connection:
        connection.execute("ALTER TABLE live_builds DROP COLUMN progress")
        connection.execute("ALTER TABLE live_builds DROP COLUMN snapshot")
    migrated = RelayDatabase(path)
    try:
        run = migrated.get_live_build("meridian", "migration-run")
        assert run.progress is None and run.snapshot is None
        migrated.save_live_build(run)
        assert migrated.get_live_build("meridian", "migration-run") == run
    finally:
        migrated.close()


def test_completed_bundle_counts_exclude_preserved_snapshot(app_factory):
    from relay.models import LiveBuildLiveSnapshot
    files = {"index.html": b"<html>Completed</html>", "live/index.html": b"Other page", "live/extra.txt": b"Extra file"}
    fake = FakeClient(archive=archive_bytes(files=files))
    app = app_factory(fake)
    service = app.state.live_builder
    run, _, _ = app.state.db.reserve_live_build("meridian", LiveBuildRequest.model_validate(SAMPLE), "gemini-3.8-flash", "count-run")
    run.environmentId = "env-test"
    run.snapshot = LiveBuildLiveSnapshot(indexUrl="/artifacts/meridian/count-run/live/index.html", updatedAt=run.startedAt, version=1)
    live = service.settings.artifact_root / "meridian" / run.runId / "live"
    live.mkdir(parents=True)
    (live / "index.html").write_bytes(b"<html>Last snapshot</html>")
    artifact, count = service._download_artifact(run)
    assert count == artifact.fileCount == len(files)
    assert artifact.bytes == sum(map(len, files.values()))
    assert (live / "index.html").read_bytes() == b"<html>Last snapshot</html>"


def test_live_snapshot_rejects_symlinks_before_downloading(app_factory, tmp_path):
    fake = FakeClient()
    app = app_factory(fake)
    service = app.state.live_builder
    run, _, _ = app.state.db.reserve_live_build("meridian", LiveBuildRequest.model_validate(SAMPLE), "gemini-3.8-flash", "safe-run")
    run.status, run.environmentId = "in_progress", "env-test"
    app.state.db.save_live_build(run)
    outside = tmp_path / "outside"
    outside.mkdir()
    live = service.settings.artifact_root / "meridian" / run.runId / "live"
    live.parent.mkdir(parents=True)
    live.symlink_to(outside, target_is_directory=True)
    with pytest.raises(ValueError, match="Unsafe snapshot path|not in the subpath"):
        asyncio.run(service._snapshot_files("meridian", run.runId, "env-test", [{"path": "workspace/app/index.html"}]))
    assert not fake.downloads and not list(outside.iterdir())
    assert app.state.db.get_live_build("meridian", run.runId).snapshot is None


@pytest.mark.parametrize("failure", [False, True])
def test_narration_rewrites_both_kinds_and_keeps_full_redacted_raw(app_factory, failure):
    raw = "  **Review** " + "weekly work " * 65 + SECRET + " tail  "
    thought_raw = raw.strip().replace("**", "")
    steps = [{"type": "thought", "summary": [{"type": "text", "text": raw}]},
             {"type": "model_output", "content": [{"type": "text", "text": raw}]}]
    calls = []
    def narrator(kind, title, detail, context):
        calls.append((kind, title, detail, context))
        if failure:
            raise RuntimeError("unavailable")
        return {"title": "Reviewing weekly work", "detail": "I am reviewing the weekly work."}
    app = app_factory(FakeClient([snapshot("completed", steps)]), narrator=narrator)
    with TestClient(app) as client:
        client.post(BASE, json=SAMPLE)
        value = wait_snapshot(client, lambda s: s["run"]["phase"] == "ready")
        events = [event for event in value["progress"] if event["kind"] in {"thought", "message"}]
        assert len(events) == 2
        assert [event["raw"] for event in events] == [thought_raw.replace(SECRET, "[redacted]"), raw.replace(SECRET, "[redacted]")]
        assert all(len(event["raw"]) > 600 for event in events)
        if failure:
            assert [event["title"] for event in events] == ["Thinking", "Note from the builder"]
            assert all(event["detail"] == event["raw"][:600] for event in events)
        else:
            assert all(event["title"] == "Reviewing weekly work" for event in events)
            assert all(event["detail"] == "I am reviewing the weekly work." for event in events)
        assert len(calls) == 2 and {call[0] for call in calls} == {"thought", "message"}
        assert calls[0][3]["requested_by_name"] == SAMPLE["requested_by"]["name"]
        assert calls[0][3]["workflow_title"] == SAMPLE["workflow"]["title"]
        assert SECRET not in json.dumps(value)


@pytest.mark.parametrize("failure", [False, True])
def test_narrator_cache_is_per_run_and_preserves_each_fallback_title(app_factory, failure):
    steps = [{"type": "thought", "summary": [{"type": "text", "text": "Weekly work"}]},
             {"type": "model_output", "content": [{"type": "text", "text": "Weekly work"}]}]
    calls = []
    def narrator(*args):
        calls.append(args)
        if failure:
            raise RuntimeError("unavailable")
        return {"title": "Reviewing weekly work", "detail": "I am reviewing the weekly work."}
    app = app_factory(FakeClient([snapshot("completed", steps)]), narrator=narrator)
    with TestClient(app) as client:
        for index in range(2):
            payload = copy.deepcopy(SAMPLE)
            payload["idempotency_key"] += str(index)
            run_id = client.post(BASE, json=payload).json()["runId"]
            value = wait_snapshot(client, lambda s: s["run"]["phase"] == "ready", run_id)
            events = [event for event in value["progress"] if event["kind"] in {"thought", "message"}]
            assert len(events) == 2
            if failure:
                assert [event["title"] for event in events] == ["Thinking", "Note from the builder"]
            assert len(calls) == index + 1


def test_narrator_timeout_does_not_overwrite_fallback(app_factory, monkeypatch):
    import relay.live_builder as live
    monkeypatch.setattr(live, "TIMEOUT_SECONDS", 0.02)
    release, finished = threading.Event(), threading.Event()
    calls = []
    def narrator(*args):
        calls.append(args)
        release.wait(2)
        finished.set()
        return {"title": "Late rewrite", "detail": "Late rewrite."}
    steps = [{"type": "thought", "summary": [{"type": "text", "text": "Weekly work"}]}] * 2
    app = app_factory(FakeClient([snapshot("completed", steps)]), narrator=narrator)
    with TestClient(app) as client:
        try:
            client.post(BASE, json=SAMPLE)
            value = wait_snapshot(client, lambda s: s["run"]["phase"] == "ready")
            events = [event for event in value["progress"] if event["kind"] == "thought"]
            assert len(calls) == 1 and len(events) == 2
            assert all(event["title"] == "Thinking" and event["raw"] == "Weekly work" for event in events)
        finally:
            release.set()
        assert finished.wait(1)
        assert client.get(BASE + "/current").json()["progress"] == value["progress"]


def test_cancellation_and_reads_continue_while_narrator_waits(app_factory):
    entered, release = threading.Event(), threading.Event()
    def narrator(*args):
        entered.set()
        release.wait(2)
        return {"title": "Late rewrite", "detail": "Late rewrite."}
    steps = [{"type": "thought", "summary": [{"type": "text", "text": "Weekly work"}]}]
    app = app_factory(FakeClient([snapshot("in_progress", steps)]), narrator=narrator)
    with TestClient(app) as client:
        try:
            run_id = client.post(BASE, json=SAMPLE).json()["runId"]
            assert entered.wait(1)
            started = time.monotonic()
            assert client.get(BASE + "/current").status_code == 200
            cancelled = client.post(f"{BASE}/{run_id}/cancel")
            assert cancelled.status_code == 200 and cancelled.json()["status"] == "cancelled"
            assert time.monotonic() - started < 1
        finally:
            release.set()
        value = client.get(f"{BASE}/{run_id}").json()
        assert not any(event["title"] == "Late rewrite" for event in value["progress"])


def test_live_build_list_ready_newest_first_all_limit_and_tenant(app_factory):
    from relay.models import LiveBuildArtifact
    app = app_factory()
    with TestClient(app) as client:
        db = app.state.db
        for index, (org, phase) in enumerate([("meridian", "ready"), ("meridian", "ready"),
                                             ("meridian", "failed"), ("rookmere", "ready")]):
            request = LiveBuildRequest.model_validate({**SAMPLE, "idempotency_key": f"list-key-{index}"})
            run, _, _ = db.reserve_live_build(org, request, "gemini-3.8-flash", f"list-{index}")
            run.status, run.phase = ("failed" if phase == "failed" else "completed"), phase
            db.save_live_build(run)
            db._conn.execute("UPDATE live_builds SET started_at = ? WHERE run_id = ?", ("2026-10-25T12:00:00+00:00", run.runId))
            db._conn.commit()
            if phase == "ready":
                db.save_live_artifact(run.runId, LiveBuildArtifact(indexUrl=f"/artifacts/{run.runId}/index.html", fileCount=1, bytes=1))
        value = client.get(BASE).json()
        assert [entry["run"]["runId"] for entry in value["runs"]] == ["list-1", "list-0"]
        assert all(entry["artifact"] is not None for entry in value["runs"])
        assert len(client.get(BASE + "?limit=1").json()["runs"]) == 1
        all_runs = client.get(BASE + "?all=1").json()["runs"]
        assert [entry["run"]["runId"] for entry in all_runs] == ["list-2", "list-1", "list-0"]
        assert all_runs[0]["artifact"] is None
        assert client.get(BASE, headers={"X-HeavyRain-Org-Id": "augi"}).status_code == 403
        assert client.get(BASE + "?limit=0").status_code == 422
        assert client.get(BASE + "?limit=101").status_code == 422


def test_live_event_raw_migrates_existing_database(app_factory, tmp_path):
    path = tmp_path / "old-events.sqlite3"
    app = app_factory(db_path=path)
    db = app.state.db
    db._conn.execute("ALTER TABLE live_build_events DROP COLUMN raw")
    db._conn.commit()
    migrated = RelayDatabase(db_path=path, operating_mode="demo_fixture_replay")
    try:
        assert "raw" in {row["name"] for row in migrated._conn.execute("PRAGMA table_info(live_build_events)")}
    finally:
        migrated.close()


@pytest.mark.parametrize("disabled", [False, True])
def test_stream_narration_caches_partial_emission_and_stop(app_factory, monkeypatch, disabled):
    if disabled:
        monkeypatch.setenv("HEAVY_RAIN_NARRATOR", "0")
    release = threading.Event()
    script = [
        stream_event("step.start", index=0, step={"type": "thought", "summary": []}),
        stream_event("step.delta", index=0, delta={"type": "thought_summary", "content": {"type": "text", "text": "Weekly work"}}),
        lambda: release.wait(2),
        stream_event("step.stop", index=0),
        stream_event("step.start", index=1, step={"type": "model_output", "content": [{"type": "text", "text": "Brief"}]}),
        stream_event("step.stop", index=1),
        stream_event("interaction.completed", interaction={"id": "interaction-test", "status": "completed"}),
    ]
    calls = []
    def narrator(*args):
        calls.append(args)
        return {"title": "Reviewing weekly work", "detail": "I am reviewing the weekly work."}
    app = app_factory(StreamingClient([script]), narrator=narrator)
    app.state.live_builder.early_progress_seconds = 0.01
    published = []
    publish = app.state.live_builder.hub.publish
    def capture(org_id, kind, data):
        published.append((kind, data))
        return publish(org_id, kind, data)
    app.state.live_builder.hub.publish = capture
    with TestClient(app) as client:
        try:
            client.post(BASE, json=SAMPLE)
            value = wait_snapshot(client, lambda s: any(event["kind"] == "thought" for event in s["progress"]))
            thought = next(event for event in value["progress"] if event["kind"] == "thought")
            assert thought["raw"] == "Weekly work"
            assert thought["title"] == ("Thinking" if disabled else "Reviewing weekly work")
        finally:
            release.set()
        value = wait_snapshot(client, lambda s: s["run"]["phase"] == "ready")
        assert len(calls) == (0 if disabled else 2)
        events = [event for event in value["progress"] if event["kind"] in {"thought", "message"}]
        assert len(events) == 3
        feed = [data for kind, data in published if kind == "live_build_progress" and data["kind"] in {"thought", "message"}]
        assert [event["raw"] for event in feed] == ["Weekly work", "Weekly work", "Brief"]
        assert all(event["runId"] == value["run"]["runId"] for event in feed)
        if not disabled:
            assert all(event["title"] == "Reviewing weekly work" for event in events)


@pytest.mark.parametrize("provider_status", ["in_progress", "completed"])
def test_expiry_during_narration_keeps_original_event(app_factory, provider_status):
    entered, release, finished = threading.Event(), threading.Event(), threading.Event()
    def narrator(*args):
        entered.set()
        release.wait(2)
        finished.set()
        return {"title": "Late rewrite", "detail": "Late rewrite."}
    steps = [{"type": "thought", "summary": [{"type": "text", "text": "Weekly work"}]}]
    fake = FakeClient([snapshot(provider_status, steps)])
    app = app_factory(fake, narrator=narrator)
    app.state.live_builder.max_run_seconds = 0.1
    with TestClient(app) as client:
        try:
            client.post(BASE, json=SAMPLE)
            assert entered.wait(1)
            value = wait_snapshot(client, lambda s: s["run"]["status"] == "failed")
            assert value["run"]["errorReason"] == "Build exceeded 40 minutes"
            assert fake.cancels == ["interaction-test"]
            assert value["artifact"] is None
            assert not any(path in {"workspace/app", "workspace", "/"} for path, _ in fake.downloads)
            event = next(event for event in value["progress"] if event["kind"] == "thought")
            assert event["title"] == "Thinking" and event["detail"] == event["raw"] == "Weekly work"
        finally:
            release.set()
        assert finished.wait(1)
        assert client.get(BASE + "/current").json()["progress"] == value["progress"]
