"""Regression checks for persisted demo work and review boundaries."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
import sys
import threading

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
for folder in (ROOT / "services/relay", ROOT / "services/cairn"):
    sys.path.insert(0, str(folder))

from relay.app import create_app
from relay.sse import SseEventHub
from relay.fixtures_loader import build_initial_workspace_state


def report_payload(key="persistence-report-001"):
    return {
        "idempotency_key": key, "org_id": "rookmere", "employee_id": "emp_rm_02",
        "role_id": "role_deal_team", "assistant_surface": "Claude Desktop",
        "session_provenance": {"session_id": "approved-demo-session", "captured_at": "2026-10-25T17:00:00Z"},
        "user_inspected_outgoing_payload": True, "host_chat_history_excluded": True,
        "redaction_manifest": {"client_redaction_applied": True, "excluded_fields": ["chat_history"]},
        "data_scope": "portfolio_financials", "pattern_hint": "pat_rm_01",
        "task_summary": "Compare the approved monthly variance columns again this week.",
        "outgoing_payload_preview": {"chat_transcript_included": False}, "attachments": [],
    }


def test_intake_survives_restart_and_reaches_weekly_evidence(tmp_path):
    path = tmp_path / "persist.sqlite3"
    first_app = create_app(db_path=path)
    with TestClient(first_app) as client:
        response = client.post("/api/v1/orgs/rookmere/mcp/submit-work-report", json=report_payload())
        assert response.status_code == 200
        report_id = response.json()["reportId"]
        assert client.post("/api/v1/orgs/rookmere/mcp/submit-work-report", json=report_payload()).json()["idempotentReplay"]
        changed = report_payload()
        changed["task_summary"] = "A different report with the same key must not overwrite the original."
        assert client.post("/api/v1/orgs/rookmere/mcp/submit-work-report", json=changed).status_code == 409
    first_app.state.db.close()
    second_app = create_app(db_path=path)
    with TestClient(second_app) as client:
        fixture = client.get("/api/v1/orgs/rookmere/fixture").json()
        assert report_id in {r["reportId"] for r in fixture["reports"]}
        evaluation = client.post("/api/v1/orgs/rookmere/batches/evaluate").json()
        decision = next(d for d in evaluation["decisions"] if d["cluster_id"] == "pat_rm_01")
        assert report_id in decision["supporting_report_ids"]
        assert decision["report_count"] == len(decision["supporting_report_ids"])
        workspace_cluster = next(c for c in evaluation["workspace"]["clusters"] if c["clusterId"] == "pat_rm_01")
        assert report_id in workspace_cluster["reportIds"]
        assert client.post(f"/api/v1/orgs/rookmere/reports/{report_id}/withdraw").status_code == 200
        reevaluation = client.post("/api/v1/orgs/rookmere/batches/evaluate").json()
        assert all(report_id not in d["supporting_report_ids"] for d in reevaluation["decisions"])
        assert client.post("/api/v1/orgs/rookmere/mcp/submit-work-report", json=report_payload()).status_code == 409
    second_app.state.db.close()


def test_demo_review_requires_actual_verification_and_sends_nothing(tmp_path):
    with TestClient(create_app(db_path=tmp_path / "review.sqlite3")) as client:
        base = "/api/v1/orgs/augi/builds/run_augi_sable_3d_01"
        review = {"decision": "approve_for_release", "reviewer_employee_id": "emp_augi_08"}
        assert client.post(base + "/control", json={"action": "reveal_ready"}).json()["buildStage"] == "stage3"
        assert client.post(base + "/release-review", json=review).status_code == 409
        checks = client.post(base + "/verify").json()
        assert checks["passed"] is True
        assert checks["verificationChecks"]["typecheckPassed"] is True
        assert checks["exportMethod"] == "local_fixture_archive"
        approved = client.post(base + "/release-review", json=review).json()
        assert approved["build"]["appReleaseState"] == "approved_demo"
        assert approved["build"]["deployed"] is False
        assert approved["build"]["tokensUsed"] == 0
        assert approved["build"]["approvedRelease"]["notifiedCount"] == 0
        assert approved["workspace"]["orthogonalStatuses"]["notificationState"] == "suppressed_in_demo"
        stream = client.get("/api/v1/orgs/augi/events/stream?replay_only=true").text
        assert '"toolName": "verify_local_artifacts"' in stream


def test_live_mode_is_closed_and_demo_rejects_actor_mismatch(tmp_path):
    with pytest.raises(ValueError, match="Live mode is disabled"):
        create_app(db_path=tmp_path / "live.sqlite3", operating_mode="live_runtime")
    with TestClient(create_app(db_path=tmp_path / "auth.sqlite3")) as client:
        assert client.post("/api/v1/orgs/rookmere/schedule", json={"active": False},
                           headers={"Origin": "https://untrusted.example"}).status_code == 403
        assert client.post("/api/v1/orgs/rookmere/mcp/submit-work-report", json=report_payload(),
                           headers={"X-HeavyRain-Actor-Id": "emp_rm_07"}).status_code == 403
        assert client.post("/api/v1/orgs/rookmere/builds", json={"cluster_id": "pat_rm_01", "authorized_by_employee_id": "emp_rm_07"},
                           headers={"X-HeavyRain-Actor-Id": "emp_rm_02"}).status_code == 403
        assert client.post("/api/v1/orgs/rookmere/builds", json={"cluster_id": "pat_rm_03", "authorized_by_employee_id": "emp_rm_07"}).status_code == 409


def test_live_sse_wakes_from_worker_thread_and_scrubs_nested_thoughts():
    async def scenario():
        hub = SseEventHub()
        stream = hub.stream_initial_and_live("rookmere", build_initial_workspace_state("rookmere"), replay_only=False)
        await anext(stream)
        worker = threading.Thread(target=lambda: hub.publish("rookmere", "worker_assignment", {
            "marker": "actual-worker-event", "nested": {"thought_delta": "private", "result": "ready"}
        }))
        worker.start()
        worker.join()
        for _ in range(50):
            frame = await asyncio.wait_for(anext(stream), timeout=2)
            if "actual-worker-event" in frame:
                assert "thought_delta" not in frame
                assert "private" not in frame
                assert "ready" in frame
                break
        else:
            pytest.fail("Worker event did not reach live SSE")
        await stream.aclose()
        assert not hub._subscribers["rookmere"]
    asyncio.run(scenario())


def test_model_review_is_queued_validated_persisted_and_advisory(tmp_path):
    import time
    calls = []
    async def runner(snapshot):
        calls.append(snapshot)
        await asyncio.sleep(0.05)
        return {"output": {"org_id": snapshot["org_id"], "decisions": [
            {"cluster_id": cluster["clusterId"], "disposition": "request_missing_evidence",
             "supporting_report_ids": [r["reportId"] for r in snapshot["reports"] if r["clusterId"] == cluster["clusterId"]],
             "catalog_app_id": None, "decision_summary": "Check the approved schema before allocating a build.",
             "capability_gap": None, "missing_evidence": ["Approved schema"], "counter_evidence": []}
            for cluster in snapshot["clusters"]]}, "usage": {"total_token_count": 100}, "model": "test-double"}
    app = create_app(db_path=tmp_path / "review-model.sqlite3", live_review_runner=runner, live_review_enabled=True)
    with TestClient(app) as client:
        before = client.get("/api/v1/orgs/rookmere/workspace").json()
        result = client.post("/api/v1/orgs/rookmere/batches/review-with-cairn", json={"idempotency_key": "review-test-001"})
        assert result.status_code == 202
        assert result.json()["status"] == "queued"
        review_id = result.json()["reviewId"]
        for _ in range(100):
            job = client.get(f"/api/v1/orgs/rookmere/reviews/{review_id}").json()
            if job["status"] in {"completed", "failed"}:
                break
            time.sleep(0.01)
        assert job["status"] == "completed"
        assert job["result"]["usage"]["total_token_count"] == 100
        assert job["recommendationOnly"] is True
        after = client.get("/api/v1/orgs/rookmere/workspace").json()
        assert before["buildStage"] == after["buildStage"]
        assert before["appReleaseStatus"] == after["appReleaseStatus"]
        assert before["clusters"] == after["clusters"]
        assert client.get(f"/api/v1/orgs/augi/reviews/{review_id}").status_code == 404
        replay = client.post("/api/v1/orgs/rookmere/batches/review-with-cairn", json={"idempotency_key": "review-test-001"})
        assert replay.json()["status"] == "completed"
        assert len(calls) == 1


def test_model_review_rejects_untrusted_ids_without_retry(tmp_path):
    import time
    calls = []
    async def invalid_runner(snapshot):
        calls.append(snapshot)
        return {"output": {"org_id": "augi", "decisions": []}}
    app = create_app(db_path=tmp_path / "invalid-review.sqlite3", live_review_runner=invalid_runner, live_review_enabled=True)
    with TestClient(app) as client:
        result = client.post("/api/v1/orgs/rookmere/batches/review-with-cairn", json={"idempotency_key": "invalid-review-001"})
        review_id = result.json()["reviewId"]
        for _ in range(100):
            job = client.get(f"/api/v1/orgs/rookmere/reviews/{review_id}").json()
            if job["status"] == "failed":
                break
            time.sleep(0.01)
        assert job["errorCode"] == "review_validation_failed"
        assert job["result"] is None
        assert client.post("/api/v1/orgs/rookmere/batches/review-with-cairn", json={"idempotency_key": "invalid-review-002"}).status_code == 409
        assert len(calls) == 1


def test_artifact_checks_fail_on_bad_types_and_hash_changes(tmp_path):
    from relay.builder_driver import build_deterministic_workspace_tar, safe_extract_archive, verify_extracted_artifacts
    archive = build_deterministic_workspace_tar("rookmere", "run_test", "app_rm_variance_workbench")
    manifest = safe_extract_archive(archive, tmp_path)
    component = tmp_path / "src/App.tsx"
    component.write_text(component.read_text() + '\nconst invalid: number = "wrong type";\n')
    checks, output = verify_extracted_artifacts(tmp_path, manifest, ROOT)
    assert checks["typecheckPassed"] is False
    assert checks["artifactHashesPassed"] is False
    assert "not assignable" in output


def test_archive_rejects_windows_paths_and_duplicate_entries(tmp_path):
    import io
    import tarfile
    from relay.builder_driver import safe_extract_archive, UnsafeArchiveError
    for paths, error in [(["C:/Windows/escape.txt"], "absolute"), (["same.txt", "same.txt"], "duplicate")]:
        payload = io.BytesIO()
        with tarfile.open(fileobj=payload, mode="w") as archive:
            for name in paths:
                item = tarfile.TarInfo(name)
                item.size = 1
                archive.addfile(item, io.BytesIO(b"x"))
        with pytest.raises(UnsafeArchiveError, match=error):
            safe_extract_archive(payload.getvalue(), tmp_path / error)
