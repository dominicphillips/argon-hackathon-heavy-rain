"""FastAPI application for Heavy Rain Relay and Cairn on http://127.0.0.1:43180."""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
import asyncio
import hashlib
import uuid
import json
import os
from pathlib import Path
import sys
import tempfile
from typing import Any, Literal

from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

# Ensure services/cairn is importable when running from repository root or services/relay
REPO_ROOT = Path(__file__).resolve().parents[3]
CAIRN_ROOT = REPO_ROOT / "services" / "cairn"
if str(CAIRN_ROOT) not in sys.path:
    sys.path.insert(0, str(CAIRN_ROOT))

from cairn.clustering import ClusterDecisionRecord  # noqa: E402
from cairn.config import (  # noqa: E402
    ARGON_MODEL_NAME,
    ARGON_SHARED_TOKEN_WINDOW,
    ARGON_SYNC_OUTPUT_CAP,
    CAIRN_SDK_VERSION,
    CairnCoordinatorConfig,
)
from cairn.live_review import run_live_cairn_review, review_evidence_snapshot, validate_review_output
from cairn.orchestrator import CairnOrchestrator  # noqa: E402

from relay.builder_driver import (  # noqa: E402
    BuilderNotCompletedError,
    DeprecatedEndpointError,
    InvalidAgentConfigError,
    MANAGED_BUILDER_AGENT,
    MANAGED_BUILDER_ENVIRONMENT,
    MANAGED_BUILDER_MODEL,
    ManagedBuilderClient,
    UnsafeArchiveError,
    collect_scoped_workspace_sources,
    map_interaction_to_build_stage,
    safe_extract_archive,
    validate_antigravity_agent_config,
    verify_extracted_artifacts,
)
from relay.db import RelayDatabase  # noqa: E402
from relay.fixtures_loader import get_organization_fixture  # noqa: E402
from relay.models import (  # noqa: E402
    ApprovedReleaseSnapshot,
    BuildControlRequest,
    BuilderInteractionStatus,
    BuildStageId,
    CanonicalReleaseState,
    CatalogAppItem,
    CairnReviewRequest,
    ClusterDecisionActionRequest,
    EmployeeReport,
    McpSubmissionReceiptResponse,
    McpSubmitWorkReportRequest,
    OrganizationFixture,
    OrganizationId,
    OrganizationWorkspaceState,
    RecurrenceCluster,
    ReleaseReviewRequest,
    ScheduleUpdateRequest,
    StartSandboxBuildRequest,
    TraceEvent,
    VerificationReport,
)
from relay.security import (  # noqa: E402
    McpIntakePolicyError,
    ReportRevocationError,
    RolePermissionError,
    TenantIsolationError,
    validate_mcp_submission,
    verify_pre_cutoff_revocation_allowed,
    verify_role_permission,
    verify_tenant_isolation,
)
from relay.sse import SseEventHub  # noqa: E402


def create_app(
    *,
    db_path: str | Path | None = None,
    operating_mode: Literal["demo_fixture_replay", "cached_snapshot", "live_runtime"] | None = None,
    builder_client: ManagedBuilderClient | None = None,
    live_review_runner=None,
    live_review_enabled: bool | None = None,
) -> FastAPI:
    resolved_mode: Literal["demo_fixture_replay", "cached_snapshot", "live_runtime"] = (
        operating_mode
        or os.environ.get("HEAVY_RAIN_OPERATING_MODE", "demo_fixture_replay")  # type: ignore[assignment]
    )
    if resolved_mode not in {"demo_fixture_replay", "cached_snapshot", "live_runtime"}:
        resolved_mode = "demo_fixture_replay"

    if resolved_mode == "live_runtime":
        raise ValueError("Live mode is disabled until authenticated tenant identities and managed runtime verification are implemented.")

    default_sqlite = REPO_ROOT / "services" / "relay" / "data" / "heavyrain.sqlite3"
    resolved_db_path = db_path or os.environ.get("HEAVY_RAIN_SQLITE_PATH", str(default_sqlite))

    db = RelayDatabase(db_path=resolved_db_path, operating_mode=resolved_mode)
    cairn_cfg = CairnCoordinatorConfig()
    cairn = CairnOrchestrator(config=cairn_cfg)
    builder = builder_client or ManagedBuilderClient(operating_mode=resolved_mode)
    sse_hub = SseEventHub()

    @asynccontextmanager
    async def lifespan(application):
        db._conn.execute("UPDATE cairn_reviews SET status = 'failed', error_code = 'server_restarted_outcome_unknown' WHERE status IN ('queued', 'running')")
        db._conn.commit()
        try:
            yield
        finally:
            tasks = list(application.state.review_tasks)
            for task in tasks:
                task.cancel()
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)

    app = FastAPI(
        lifespan=lifespan,
        title="Heavy Rain Relay & Cairn Backend Service",
        version="0.1.0",
        description=(
            "Explicit MCP work report intake (Relay), weekly recurrence clustering and reuse-first "
            "evaluation (Cairn on google-antigravity 0.1.22 / gemini-4-argon high), and managed "
            "sandbox Builder orchestration (antigravity-preview-09-2026)."
        ),
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://127.0.0.1:43170",
            "http://localhost:43170",
            "http://127.0.0.1:43171",
            "http://localhost:43171",
            "http://127.0.0.1:43172",
            "http://localhost:43172",
            "http://127.0.0.1:43173",
            "http://localhost:43173",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    request_lock = asyncio.Lock()

    @app.middleware("http")
    async def local_demo_boundary(request: Request, call_next):
        if request.client and request.client.host not in {"127.0.0.1", "::1", "testclient"}:
            return JSONResponse(status_code=403, content={"detail": "This demo accepts loopback connections only."})
        origin = request.headers.get("origin")
        allowed_origins = {"http://127.0.0.1:43170", "http://localhost:43170",
                           "http://127.0.0.1:43171", "http://localhost:43171",
                           "http://127.0.0.1:43172", "http://localhost:43172",
                           "http://127.0.0.1:43173", "http://localhost:43173"}
        if origin and origin not in allowed_origins:
            return JSONResponse(status_code=403, content={"detail": "This local demo accepts requests only from its preview apps."})
        async with request_lock:
            return await call_next(request)

    app.state.db = db
    app.state.cairn = cairn
    app.state.builder = builder
    app.state.sse_hub = sse_hub
    app.state.operating_mode = resolved_mode
    app.state.live_review_enabled = (live_review_enabled if live_review_enabled is not None else
        os.environ.get("HEAVY_RAIN_ENABLE_LIVE_REVIEW") == "1" and bool(os.environ.get("GEMINI_API_KEY")))
    app.state.live_review_runner = live_review_runner or run_live_cairn_review
    app.state.review_tasks = set()

    def _resolve_tenant(
        org_id: str,
        x_heavyrain_org_id: str | None = None,
        x_heavyrain_actor_id: str | None = None,
        payload_org_id: str | None = None,
    ) -> OrganizationId:
        try:
            return verify_tenant_isolation(
                route_org_id=org_id,
                header_org_id=x_heavyrain_org_id,
                payload_org_id=payload_org_id,
                actor_id=x_heavyrain_actor_id,
            )
        except TenantIsolationError as exc:
            db.append_audit_log(
                org_id=org_id,
                actor_id=x_heavyrain_actor_id or "anonymous",
                actor_role="unverified",
                action="tenant_isolation_violation",
                target_id=org_id,
                detail={"error": str(exc), "header_org_id": x_heavyrain_org_id, "payload_org_id": payload_org_id},
            )
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/health")
    def get_health() -> dict[str, Any]:
        return {
            "status": "ok",
            "service": "heavy-rain-relay-cairn",
            "operatingMode": app.state.operating_mode,
            "externalNotificationsEnabled": False,
            "authenticationMode": "local_demo_only",
            "liveRuntimeEnabled": False,
            "liveModelReviewEnabled": app.state.live_review_enabled,
            "coordinatorExecution": "deterministic_fixture_rules",
            "databaseStatus": "ok" if db._conn.execute("SELECT 1").fetchone()[0] == 1 else "error",
            "paidRemoteContainersEnabled": False,
            "cairn": {
                "sdkPackage": "google-antigravity",
                "sdkVersion": CAIRN_SDK_VERSION,
                "model": ARGON_MODEL_NAME,
                "thinkingLevel": "high",
                "sharedTokenCeiling": ARGON_SHARED_TOKEN_WINDOW,
                "syncOutputTokenCap": ARGON_SYNC_OUTPUT_CAP,
            },
            "builder": {
                "agent": MANAGED_BUILDER_AGENT,
                "environment": MANAGED_BUILDER_ENVIRONMENT,
                "model": MANAGED_BUILDER_MODEL,
                "defaultMaxTotalTokens": "262144",
                "exportApi": "environments.files.download",
            },
            "ports": {
                "backend": "http://127.0.0.1:43180",
                "systemUi": "http://127.0.0.1:43170",
                "augiEngineering": "http://127.0.0.1:43171",
            },
        }

    @app.get("/api/v1/orgs")
    def list_organizations() -> dict[str, Any]:
        rows = db._conn.execute("SELECT * FROM organizations ORDER BY org_id DESC").fetchall()
        return {
            "operatingMode": app.state.operating_mode,
            "organizations": [
                {
                    "orgId": r["org_id"],
                    "canonicalOrgId": r["canonical_org_id"],
                    "name": r["name"],
                    "legalEntity": r["legal_entity"],
                    "sector": r["sector"],
                    "timezone": r["timezone"],
                    "themeId": r["theme_id"],
                    "weeklyScheduleActive": bool(r["weekly_schedule_active"]),
                }
                for r in rows
            ],
        }

    @app.get("/api/v1/orgs/{org_id}/fixture", response_model=OrganizationFixture)
    def get_org_fixture(
        org_id: str,
        x_heavyrain_org_id: str | None = Header(default=None),
        x_heavyrain_actor_id: str | None = Header(default=None),
    ) -> OrganizationFixture:
        tenant = _resolve_tenant(org_id, x_heavyrain_org_id, x_heavyrain_actor_id)
        fixture = get_organization_fixture(tenant)
        ws = db.get_workspace_state(tenant)
        fixture.clusters = ws.clusters
        fixture.catalogApps = ws.catalogApps
        fixture.reports = db.list_reports(tenant)
        fixture.totalReportsIngested = len(fixture.reports)
        fixture.initialEvents = ws.events
        return fixture

    @app.get("/api/v1/orgs/{org_id}/workspace", response_model=OrganizationWorkspaceState)
    def get_org_workspace(
        org_id: str,
        x_heavyrain_org_id: str | None = Header(default=None),
        x_heavyrain_actor_id: str | None = Header(default=None),
    ) -> OrganizationWorkspaceState:
        tenant = _resolve_tenant(org_id, x_heavyrain_org_id, x_heavyrain_actor_id)
        return db.get_workspace_state(tenant)

    @app.post("/api/v1/orgs/{org_id}/mcp/submit-work-report", response_model=McpSubmissionReceiptResponse)
    def submit_mcp_work_report(
        org_id: str,
        payload: McpSubmitWorkReportRequest,
        x_heavyrain_org_id: str | None = Header(default=None),
        x_heavyrain_actor_id: str | None = Header(default=None),
    ) -> McpSubmissionReceiptResponse | JSONResponse:
        tenant = _resolve_tenant(
            org_id,
            x_heavyrain_org_id,
            x_heavyrain_actor_id or payload.employee_id,
            payload_org_id=payload.org_id,
        )

        if x_heavyrain_actor_id and x_heavyrain_actor_id != payload.employee_id:
            raise HTTPException(status_code=403, detail="Report employee must match the selected actor.")
        try:
            validate_mcp_submission(tenant, payload)
        except (TenantIsolationError, RolePermissionError) as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except McpIntakePolicyError as exc:
            return JSONResponse(status_code=422, content={"error": exc.error_code,
                "policyStatus": exc.policy_status or "rejected", "offendingFilename": exc.offending_filename,
                "message": exc.message, "recoveryActions": exc.recovery_actions})

        if payload.pattern_hint and not db._conn.execute(
            "SELECT 1 FROM recurrence_clusters WHERE org_id = ? AND cluster_id = ?",
            (tenant, payload.pattern_hint),
        ).fetchone():
            raise HTTPException(status_code=422, detail="Choose a known recurring task for this organization.")

        # 1. Check idempotency key per tenant first
        existing = db._conn.execute(
            "SELECT * FROM mcp_reports WHERE org_id = ? AND idempotency_key = ?",
            (tenant, payload.idempotency_key),
        ).fetchone()
        if existing and existing["employee_id"] != payload.employee_id:
            raise HTTPException(status_code=409, detail="Idempotency key belongs to another report author.")
        if existing and existing["status"] in {"withdrawn", "deleted_tombstone"}:
            raise HTTPException(status_code=409, detail="This report was withdrawn or deleted. Use a new submission key.")
        request_hash = hashlib.sha256(payload.model_dump_json().encode()).hexdigest()
        if existing:
            prior_hash = json.loads(existing["untrusted_payload_envelope_json"]).get("request_sha256")
            if prior_hash and prior_hash != request_hash:
                raise HTTPException(status_code=409, detail="This submission key already identifies a different payload. Use a new key.")
            existing_report = EmployeeReport(
                reportId=existing["report_id"],
                receiptId=existing["receipt_id"],
                submittedAt=existing["submitted_at"],
                employeeId=existing["employee_id"],
                employeeName=existing["employee_name"],
                employeeTitle=existing["employee_title"],
                departmentLabel=existing["department_label"],
                office=existing["office"],
                assistantSurface=existing["assistant_surface"],
                mcpToolName=existing["mcp_tool_name"],
                userInspectedOutgoingPayload=bool(existing["user_inspected_outgoing_payload"]),
                hostChatHistoryExcluded=bool(existing["host_chat_history_excluded"]),
                clusterId=existing["cluster_id"],
                dataScope=existing["data_scope"],
                policyScopeLabel=existing["policy_scope_label"],
                taskSummary=existing["task_summary"],
                outgoingPayloadPreview=json.loads(existing["outgoing_payload_preview_json"]),
                attachments=json.loads(existing["attachments_json"]),
                missingEvidenceNote=existing["missing_evidence_note"],
            )
            return McpSubmissionReceiptResponse(
                reportId=existing["report_id"],
                receiptId=existing["receipt_id"],
                orgId=tenant,
                batchId=existing["batch_id"],
                idempotentReplay=True,
                report=existing_report,
            )

        # 2. Validate policy, redaction manifest, role scope, and macro check
        try:
            actor_ctx, validated_attachments, untrusted_envelope = validate_mcp_submission(tenant, payload)
        except TenantIsolationError as exc:
            db.append_audit_log(
                org_id=tenant,
                actor_id=payload.employee_id,
                actor_role=payload.role_id,
                action="mcp_intake_tenant_rejected",
                target_id=payload.idempotency_key,
                detail={"error": str(exc)},
            )
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except RolePermissionError as exc:
            db.append_audit_log(
                org_id=tenant,
                actor_id=payload.employee_id,
                actor_role=payload.role_id,
                action="mcp_intake_permission_rejected",
                target_id=payload.idempotency_key,
                detail={"error": str(exc), "data_scope": payload.data_scope},
            )
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except McpIntakePolicyError as exc:
            db.append_audit_log(
                org_id=tenant,
                actor_id=payload.employee_id,
                actor_role=payload.role_id,
                action="mcp_intake_policy_rejected",
                target_id=payload.idempotency_key,
                detail={
                    "error": exc.message,
                    "errorCode": exc.error_code,
                    "offendingFilename": exc.offending_filename,
                    "policyStatus": exc.policy_status,
                },
            )
            return JSONResponse(
                status_code=422,
                content={
                    "error": exc.error_code,
                    "policyStatus": exc.policy_status or "rejected",
                    "offendingFilename": exc.offending_filename,
                    "message": exc.message,
                    "recoveryActions": exc.recovery_actions,
                },
            )

        untrusted_envelope["request_sha256"] = request_hash
        emp = actor_ctx["employee"]
        role = actor_ctx["role"]
        fixture = get_organization_fixture(tenant)
        digest_short = hashlib.sha256(f"{tenant}:{payload.idempotency_key}".encode("utf-8")).hexdigest()[:16]
        prefix = "rm" if tenant == "rookmere" else "augi"
        report_id = f"rep_{prefix}_{digest_short}"
        receipt_id = f"rcpt_{prefix}_{digest_short[:12]}"
        cluster_id = payload.pattern_hint or (
            "pat_rm_01" if tenant == "rookmere" else "wf_augi_01"
        )
        submitted_at = datetime.now(timezone.utc).isoformat()

        report = EmployeeReport(
            reportId=report_id,
            receiptId=receipt_id,
            submittedAt=submitted_at,
            employeeId=emp["employee_id"],
            employeeName=emp["name"],
            employeeTitle=emp["title"],
            departmentLabel=role["title"],
            office=emp.get("office") or emp.get("location") or "HQ",
            assistantSurface=payload.assistant_surface,
            mcpToolName="heavyrain_submit_work_report",
            userInspectedOutgoingPayload=True,
            hostChatHistoryExcluded=True,
            clusterId=cluster_id,
            dataScope=payload.data_scope,
            policyScopeLabel=f"Verified {payload.data_scope}",
            taskSummary=payload.task_summary,
            outgoingPayloadPreview=untrusted_envelope["outgoing_payload_preview"],
            attachments=validated_attachments,
            missingEvidenceNote=payload.missing_evidence_note,
        )

        db._conn.execute(
            """
            INSERT INTO mcp_reports (
                report_id, receipt_id, org_id, batch_id, idempotency_key,
                employee_id, employee_name, employee_title, department_label,
                office, role_id, assistant_surface, mcp_tool_name,
                user_inspected_outgoing_payload, host_chat_history_excluded,
                cluster_id, data_scope, policy_scope_label, task_summary,
                outgoing_payload_preview_json, untrusted_payload_envelope_json,
                redaction_manifest_json, attachments_json, missing_evidence_note,
                status, submitted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued_for_cutoff', ?)
            """,
            (
                report.reportId,
                report.receiptId,
                tenant,
                fixture.weeklyBatchId,
                payload.idempotency_key,
                report.employeeId,
                report.employeeName,
                report.employeeTitle,
                report.departmentLabel,
                report.office,
                payload.role_id,
                report.assistantSurface,
                report.mcpToolName,
                report.clusterId,
                report.dataScope,
                report.policyScopeLabel,
                report.taskSummary,
                json.dumps(report.outgoingPayloadPreview),
                json.dumps(untrusted_envelope),
                payload.redaction_manifest.model_dump_json(),
                json.dumps([a.model_dump() for a in validated_attachments]),
                report.missingEvidenceNote,
                report.submittedAt,
            ),
        )
        db._conn.commit()

        trace_ev = TraceEvent(
            eventId=f"evt_{receipt_id}",
            timestamp=datetime.now(timezone.utc).strftime("%H:%M:%S UTC"),
            actor="Relay",
            stageLabel="MCP work report intake",
            tone="accepted",
            headline=f"Issued intake receipt {receipt_id} for {report.employeeName}",
            toolName="heavyrain_submit_work_report",
            inputEvidence=f"{len(validated_attachments)} approved attachments; host chat history excluded",
            toolOutput=f"Queued {report_id} for {fixture.weeklyBatchId} cutoff under scope {payload.data_scope}.",
            durationMs=0,
            decisionSummary="Stored immutable report snapshot as untrusted evidence data; receipt confirms intake only.",
        )
        db.append_trace_event(tenant, trace_ev)
        sse_hub.publish(tenant, "trace_event", trace_ev.model_dump(exclude_none=True))

        db.append_audit_log(
            org_id=tenant,
            actor_id=report.employeeId,
            actor_role=payload.role_id,
            action="mcp_report_submitted",
            target_id=report.reportId,
            detail={
                "receiptId": report.receiptId,
                "clusterId": report.clusterId,
                "dataScope": report.dataScope,
                "attachmentCount": len(validated_attachments),
                "untrustedDataEnvelope": True,
            },
        )

        return McpSubmissionReceiptResponse(
            reportId=report.reportId,
            receiptId=report.receiptId,
            orgId=tenant,
            batchId=fixture.weeklyBatchId,
            idempotentReplay=False,
            report=report,
        )

    @app.post("/api/v1/orgs/{org_id}/reports/{report_id}/withdraw")
    def withdraw_mcp_report(
        org_id: str,
        report_id: str,
        x_heavyrain_org_id: str | None = Header(default=None),
        x_heavyrain_actor_id: str | None = Header(default=None),
    ) -> dict[str, Any]:
        tenant = _resolve_tenant(org_id, x_heavyrain_org_id, x_heavyrain_actor_id)
        row = db._conn.execute(
            "SELECT * FROM mcp_reports WHERE org_id = ? AND report_id = ?",
            (tenant, report_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Report '{report_id}' not found in '{tenant}'.")

        if x_heavyrain_actor_id and x_heavyrain_actor_id != row["employee_id"]:
            raise HTTPException(status_code=403, detail="Only the report author may withdraw this report.")
        batch_row = db._conn.execute(
            "SELECT * FROM weekly_batches WHERE batch_id = ?",
            (row["batch_id"],),
        ).fetchone()
        cutoff_locked = bool(batch_row["cutoff_locked"]) if batch_row else False

        try:
            verify_pre_cutoff_revocation_allowed(
                submitted_at_iso=row["submitted_at"],
                cutoff_locked=cutoff_locked,
                now_utc=datetime.now(timezone.utc),
            )
        except ReportRevocationError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

        now_iso = datetime.now(timezone.utc).isoformat()
        db._conn.execute(
            "UPDATE mcp_reports SET status = 'withdrawn', withdrawn_at = ? WHERE org_id = ? AND report_id = ?",
            (now_iso, tenant, report_id),
        )
        db._conn.commit()

        audit = db.append_audit_log(
            org_id=tenant,
            actor_id=x_heavyrain_actor_id or row["employee_id"],
            actor_role=row["role_id"],
            action="mcp_report_withdrawn",
            target_id=report_id,
            detail={"receiptId": row["receipt_id"], "withdrawnAt": now_iso},
        )
        return {
            "reportId": report_id,
            "receiptId": row["receipt_id"],
            "status": "withdrawn",
            "withdrawnAt": now_iso,
            "auditEntryHash": audit["entryHash"],
        }

    @app.delete("/api/v1/orgs/{org_id}/reports/{report_id}")
    def delete_mcp_report_retention(
        org_id: str,
        report_id: str,
        x_heavyrain_org_id: str | None = Header(default=None),
        x_heavyrain_actor_id: str | None = Header(default=None),
        x_heavyrain_role_id: str | None = Header(default=None),
    ) -> dict[str, Any]:
        tenant = _resolve_tenant(org_id, x_heavyrain_org_id, x_heavyrain_actor_id)
        actor_id = x_heavyrain_actor_id or ("emp_rm_11" if tenant == "rookmere" else "emp_augi_08")
        try:
            verify_role_permission(
                tenant,
                employee_id=actor_id,
                role_id=x_heavyrain_role_id,
                required_capability="can_approve_production_release",
            )
        except RolePermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc

        row = db._conn.execute(
            "SELECT * FROM mcp_reports WHERE org_id = ? AND report_id = ?",
            (tenant, report_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Report '{report_id}' not found in '{tenant}'.")

        now_iso = datetime.now(timezone.utc).isoformat()
        db._conn.execute(
            """
            UPDATE mcp_reports
            SET status = 'deleted_tombstone',
                task_summary = '[REDACTED_BY_RETENTION_POLICY]',
                outgoing_payload_preview_json = '{}',
                untrusted_payload_envelope_json = '{"_deleted": true}',
                attachments_json = '[]',
                deleted_at = ?
            WHERE org_id = ? AND report_id = ?
            """,
            (now_iso, tenant, report_id),
        )
        db._conn.commit()

        audit = db.append_audit_log(
            org_id=tenant,
            actor_id=actor_id,
            actor_role=x_heavyrain_role_id or "admin",
            action="mcp_report_retention_deleted",
            target_id=report_id,
            detail={"deletedAt": now_iso, "tombstonePreserved": True},
        )
        return {
            "reportId": report_id,
            "status": "deleted_tombstone",
            "deletedAt": now_iso,
            "auditEntryHash": audit["entryHash"],
        }

    @app.post("/api/v1/orgs/{org_id}/schedule")
    def update_weekly_schedule(
        org_id: str,
        payload: ScheduleUpdateRequest,
        x_heavyrain_org_id: str | None = Header(default=None),
        x_heavyrain_actor_id: str | None = Header(default=None),
    ) -> dict[str, Any]:
        tenant = _resolve_tenant(org_id, x_heavyrain_org_id, x_heavyrain_actor_id)
        db._conn.execute(
            "UPDATE organizations SET weekly_schedule_active = ? WHERE org_id = ?",
            (1 if payload.active else 0, tenant),
        )
        db._conn.commit()
        ws = db.get_workspace_state(tenant)
        if ws.orthogonalStatuses:
            sse_hub.publish(tenant, "orthogonal_status", ws.orthogonalStatuses.model_dump())

        db.append_audit_log(
            org_id=tenant,
            actor_id=x_heavyrain_actor_id or "operator",
            actor_role="operator",
            action="weekly_schedule_updated",
            target_id=tenant,
            detail={
                "weeklyScheduleActive": payload.active,
                "inFlightBuildStagePreserved": ws.buildStage,
            },
        )
        return {
            "orgId": tenant,
            "weeklyScheduleActive": ws.weeklyScheduleActive,
            "buildStage": ws.buildStage,
            "orthogonalStatuses": ws.orthogonalStatuses,
        }

    @app.post("/api/v1/orgs/{org_id}/batches/evaluate")
    def evaluate_weekly_cutoff_batch(
        org_id: str,
        x_heavyrain_org_id: str | None = Header(default=None),
        x_heavyrain_actor_id: str | None = Header(default=None),
    ) -> dict[str, Any]:
        tenant = _resolve_tenant(org_id, x_heavyrain_org_id, x_heavyrain_actor_id)
        ws = db.get_workspace_state(tenant)
        reports = db.list_reports(tenant)

        decisions: list[ClusterDecisionRecord] = cairn.evaluate_batch(
            org_id=tenant,
            batch_id=ws.orthogonalStatuses.weeklyBatchId if ws.orthogonalStatuses else f"batch_{tenant}_2026_w43",
            clusters=[c.model_dump() for c in ws.clusters],
            catalog_apps=[a.model_dump() for a in ws.catalogApps],
            reports=[r.model_dump() for r in reports],
        )

        for dec in decisions:
            cluster = next(c for c in ws.clusters if c.clusterId == dec.cluster_id)
            cluster.reportIds = dec.supporting_report_ids
            cluster.reportCount = dec.report_count
            cluster.distinctEmployeeCount = dec.distinct_employee_count
            cluster.disposition = dec.disposition
            cluster.actionState = dec.action_state
            db._conn.execute(
                "UPDATE recurrence_clusters SET cluster_json = ? WHERE org_id = ? AND cluster_id = ?",
                (cluster.model_dump_json(), tenant, cluster.clusterId),
            )
            db._conn.execute(
                """
                UPDATE recurrence_clusters
                SET decision_record_json = ?
                WHERE org_id = ? AND cluster_id = ?
                """,
                (dec.model_dump_json(), tenant, dec.cluster_id),
            )
            sse_hub.publish(tenant, "routing_decision", dec.model_dump())

        db._conn.commit()
        db.append_audit_log(
            org_id=tenant,
            actor_id=x_heavyrain_actor_id or "cairn",
            actor_role="coordinator",
            action="weekly_batch_evaluated",
            target_id=ws.orthogonalStatuses.weeklyBatchId if ws.orthogonalStatuses else tenant,
            detail={
                "evaluatedClusterCount": len(decisions),
                "dispositions": {d.cluster_id: d.disposition for d in decisions},
            },
        )
        _record_trace(tenant, "Cairn", "Weekly review", "completed", "Evaluated stored work reports",
                      "evaluate_weekly_batch", f"{len(reports)} persisted reports",
                      f"{len(decisions)} recurring tasks reviewed", "Applied deterministic fixture rules; no model request occurred.")
        return {
            "orgId": tenant,
            "batchId": ws.orthogonalStatuses.weeklyBatchId if ws.orthogonalStatuses else f"batch_{tenant}_2026_w43",
            "cairnSdkVersion": CAIRN_SDK_VERSION,
            "model": ARGON_MODEL_NAME,
            "thinkingLevel": "high",
            "decisions": [d.model_dump() for d in decisions],
            "workspace": db.get_workspace_state(tenant),
        }

    @app.post("/api/v1/orgs/{org_id}/clusters/{cluster_id}/decision")
    def apply_cluster_decision_action(
        org_id: str,
        cluster_id: str,
        payload: ClusterDecisionActionRequest,
        x_heavyrain_org_id: str | None = Header(default=None),
        x_heavyrain_actor_id: str | None = Header(default=None),
    ) -> dict[str, Any]:
        tenant = _resolve_tenant(org_id, x_heavyrain_org_id, x_heavyrain_actor_id)
        row = db._conn.execute(
            "SELECT cluster_json FROM recurrence_clusters WHERE org_id = ? AND cluster_id = ?",
            (tenant, cluster_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Cluster '{cluster_id}' not found in '{tenant}'.")

        cluster = RecurrenceCluster.model_validate_json(row["cluster_json"])
        now_label = datetime.now(timezone.utc).strftime("%H:%M:%S UTC")

        if payload.action == "route_to_existing_app" and not cluster.matchedAppId:
            raise HTTPException(status_code=409, detail="Choose a cluster with an approved catalog match.")
        if payload.action == "route_to_existing_app":
            cluster.actionState = "routed_to_app"
            cluster.disposition = "reuse_existing_app"
            ev = TraceEvent(
                eventId=f"evt_route_{cluster_id}_{uuid.uuid4().hex[:8]}",
                timestamp=now_label,
                actor="Notifier",
                stageLabel="Direct catalog reuse",
                tone="completed",
                headline=f"Prepared demo routing for {cluster.reportCount} reports directly to {cluster.matchedAppName or 'approved catalog app'}",
                toolName="prepare_local_catalog_link",
                inputEvidence=f"Cluster {cluster_id} · Existing role permissions verified",
                toolOutput=f"Prepared local catalog link for {cluster.matchedAppId}; external delivery suppressed.",
                durationMs=0,
                decisionSummary="Reused existing approved catalog application; 0 sandbox build tokens spent.",
            )
            db.append_trace_event(tenant, ev)
            sse_hub.publish(tenant, "trace_event", ev.model_dump(exclude_none=True))

        elif payload.action == "request_missing_evidence":
            cluster.actionState = "evidence_requested"
            cluster.disposition = "request_missing_evidence"
            ev = TraceEvent(
                eventId=f"evt_evreq_{cluster_id}_{uuid.uuid4().hex[:8]}",
                timestamp=now_label,
                actor="Relay",
                stageLabel="Missing evidence hold",
                tone="needs-evidence",
                headline=f"Requested missing schema evidence for {cluster.shortTitle}",
                toolName="relay_request_missing_evidence",
                inputEvidence=cluster.missingEvidenceDetail or "Missing approved schema attachment",
                toolOutput=f"Recorded evidence request for {cluster.missingEvidenceAssignee or 'domain owner'}; external delivery suppressed.",
                durationMs=0,
                decisionSummary="Held cluster before sandbox compute allocation until sanitized schema arrives.",
            )
            db.append_trace_event(tenant, ev)
            sse_hub.publish(tenant, "trace_event", ev.model_dump(exclude_none=True))

        elif payload.action == "receive_missing_evidence":
            cluster.actionState = "evidence_received"

        elif payload.action == "start_sandbox_build":
            cluster.actionState = "building_in_sandbox"
            cluster.disposition = "build_in_sandbox"

        elif payload.action == "defer_next_run":
            cluster.actionState = "deferred_next_run"
            cluster.disposition = "queued_next_cycle"

        db._conn.execute(
            "UPDATE recurrence_clusters SET cluster_json = ? WHERE org_id = ? AND cluster_id = ?",
            (cluster.model_dump_json(), tenant, cluster_id),
        )
        db._conn.commit()

        db.append_audit_log(
            org_id=tenant,
            actor_id=payload.actor_id or x_heavyrain_actor_id or "operator",
            actor_role="operator",
            action=f"cluster_decision_{payload.action}",
            target_id=cluster_id,
            detail={"actionState": cluster.actionState, "disposition": cluster.disposition},
        )
        return {
            "orgId": tenant,
            "cluster": cluster.model_dump(),
            "workspace": db.get_workspace_state(tenant),
        }

    @app.post("/api/v1/orgs/{org_id}/builds")
    def start_managed_sandbox_build(
        org_id: str,
        payload: StartSandboxBuildRequest,
        x_heavyrain_org_id: str | None = Header(default=None),
        x_heavyrain_actor_id: str | None = Header(default=None),
    ) -> dict[str, Any]:
        tenant = _resolve_tenant(
            org_id,
            x_heavyrain_org_id,
            x_heavyrain_actor_id or payload.authorized_by_employee_id,
        )

        if x_heavyrain_actor_id and x_heavyrain_actor_id != payload.authorized_by_employee_id:
            raise HTTPException(status_code=403, detail="Build authorizer must match the selected actor.")
        expected_cluster = "pat_rm_01" if tenant == "rookmere" else "wf_augi_01"
        if payload.cluster_id != expected_cluster:
            raise HTTPException(status_code=409, detail="This cluster has no verified sandbox build scope.")

        # Verify that the authorizing employee holds can_authorize_sandbox_build
        try:
            verify_role_permission(
                tenant,
                employee_id=payload.authorized_by_employee_id,
                required_capability="can_authorize_sandbox_build",
            )
        except RolePermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc

        workspace = db.get_workspace_state(tenant)
        decisions = cairn.evaluate_batch(org_id=tenant, batch_id=workspace.orthogonalStatuses.weeklyBatchId,
            clusters=[c.model_dump() for c in workspace.clusters],
            catalog_apps=[a.model_dump() for a in workspace.catalogApps],
            reports=[r.model_dump() for r in db.list_reports(tenant)])
        decision = next((d for d in decisions if d.cluster_id == payload.cluster_id), None)
        if not decision or decision.disposition != "build_in_sandbox":
            raise HTTPException(status_code=409, detail="This recurring task needs a verified capability gap and approved evidence before a build.")

        # Validate AntigravityAgentConfig strictly (rejects thinking_level / max_output_tokens with HTTP 400)
        raw_cfg = payload.agent_config_override or {
            "type": "antigravity",
            "model": MANAGED_BUILDER_MODEL,
            "max_total_tokens": payload.max_total_tokens,
        }
        try:
            validated_agent_cfg = validate_antigravity_agent_config(raw_cfg)
        except InvalidAgentConfigError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        run_id = "run_rm_var_01" if tenant == "rookmere" else "run_augi_sable_3d_01"
        target_app_id = "app_rm_variance_workbench" if tenant == "rookmere" else "app_augi_sable_chassis_3d"
        target_app_name = (
            "Rookmere Portfolio Variance Workbench"
            if tenant == "rookmere"
            else "AUGI Sable 3D Chassis Architecture Comparator"
        )
        fixture = get_organization_fixture(tenant)
        now_iso = datetime.now(timezone.utc).isoformat()

        def _persist_ids_immediately(interaction_id: str, environment_id: str, status: str) -> None:
            db._conn.execute(
                """
                INSERT OR REPLACE INTO builder_runs (
                    run_id, org_id, batch_id, cluster_id, target_app_id, target_app_name,
                    interaction_id, environment_id, agent_name, environment_mode,
                    model_name, max_total_tokens, operating_mode,
                    interaction_status, build_stage, last_active_checkpoint,
                    app_release_state, app_release_status, tokens_used,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'stage1', 1, 'sandbox_preview', 'in_sandbox_review', 0, ?, ?)
                """,
                (
                    run_id,
                    tenant,
                    fixture.weeklyBatchId,
                    payload.cluster_id,
                    target_app_id,
                    target_app_name,
                    interaction_id,
                    environment_id,
                    MANAGED_BUILDER_AGENT,
                    MANAGED_BUILDER_ENVIRONMENT,
                    validated_agent_cfg["model"],
                    validated_agent_cfg["max_total_tokens"],
                    app.state.operating_mode,
                    status,
                    now_iso,
                    now_iso,
                ),
            )
            db._conn.commit()

        scoped_sources = collect_scoped_workspace_sources(REPO_ROOT, tenant)
        created = builder.create_interaction(
            org_id=tenant,
            run_id=run_id,
            prompt=f"Build {target_app_name} ({target_app_id}) on @heavy-rain/organization-ui.",
            agent_config=validated_agent_cfg,
            live_opt_in=payload.live_opt_in,
            persist_immediately_cb=_persist_ids_immediately,
        )
        uploaded_paths = builder.upload_workspace_sources(
            environment_id=created["environment_id"],
            sources=scoped_sources,
            overwrite=True,
            live_opt_in=payload.live_opt_in,
        )

        db.append_audit_log(
            org_id=tenant,
            actor_id=payload.authorized_by_employee_id,
            actor_role="build_authorizer",
            action="sandbox_builder_commissioned",
            target_id=run_id,
            detail={
                "interactionId": created["interaction_id"],
                "environmentId": created["environment_id"],
                "agent": MANAGED_BUILDER_AGENT,
                "environment": MANAGED_BUILDER_ENVIRONMENT,
                "agentConfig": validated_agent_cfg,
                "uploadedPaths": uploaded_paths,
            },
        )
        _record_trace(tenant, "Builder", "Local fixture build", "running", "Started local candidate replay",
                      "local_fixture_builder", payload.cluster_id, f"Prepared {len(uploaded_paths)} scoped source paths",
                      "Local replay started. No remote environment or model tokens were used.", 1)
        sse_hub.publish(tenant, "worker_assignment", {"orgId": tenant, "runId": run_id, "toWorker": "Builder",
                         "runtimeLabel": "Local fixture replay", "inputEvidenceRefs": [payload.cluster_id]})
        _publish_status(tenant)
        return {
            "runId": run_id,
            "orgId": tenant,
            "clusterId": payload.cluster_id,
            "targetAppId": target_app_id,
            "interactionId": created["interaction_id"],
            "environmentId": created["environment_id"],
            "agent": MANAGED_BUILDER_AGENT,
            "environment": MANAGED_BUILDER_ENVIRONMENT,
            "background": True,
            "store": True,
            "agentConfig": validated_agent_cfg,
            "interactionStatus": created["status"],
            "buildStage": "stage1",
            "uploadedWorkspacePaths": uploaded_paths,
            "operatingMode": created["operating_mode"],
            "executionMode": "local_fixture_replay",
            "remoteExecution": False,
            "tokensUsed": 0,
        }

    @app.get("/api/v1/orgs/{org_id}/builds/{run_id}")
    def get_sandbox_build_status(
        org_id: str,
        run_id: str,
        x_heavyrain_org_id: str | None = Header(default=None),
        x_heavyrain_actor_id: str | None = Header(default=None),
    ) -> dict[str, Any]:
        tenant = _resolve_tenant(org_id, x_heavyrain_org_id, x_heavyrain_actor_id)
        row = db._conn.execute(
            "SELECT * FROM builder_runs WHERE org_id = ? AND run_id = ?",
            (tenant, run_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Build run '{run_id}' not found for '{tenant}'.")
        return {
            "runId": row["run_id"],
            "orgId": row["org_id"],
            "batchId": row["batch_id"],
            "clusterId": row["cluster_id"],
            "targetAppId": row["target_app_id"],
            "targetAppName": row["target_app_name"],
            "interactionId": row["interaction_id"],
            "environmentId": row["environment_id"],
            "agent": row["agent_name"],
            "environment": row["environment_mode"],
            "model": row["model_name"],
            "maxTotalTokens": row["max_total_tokens"],
            "operatingMode": row["operating_mode"],
            "interactionStatus": row["interaction_status"],
            "buildStage": row["build_stage"],
            "lastActiveCheckpoint": row["last_active_checkpoint"],
            "appReleaseState": row["app_release_state"],
            "appReleaseStatus": row["app_release_status"],
            "tokensUsed": 0 if app.state.operating_mode != "live_runtime" else row["tokens_used"],
            "deployed": False,
            "externalNotificationsSent": 0,
            "artifactScope": "local_fixture_candidate",
            "requiresActionDetail": row["requires_action_detail"],
            "errorReason": row["error_reason"],
            "artifactManifest": json.loads(row["artifact_manifest_json"]) if row["artifact_manifest_json"] else None,
            "verificationReport": json.loads(row["verification_report_json"]) if row["verification_report_json"] else None,
            "approvedRelease": json.loads(row["approved_release_json"]) if row["approved_release_json"] else None,
            "changeRequestNotes": json.loads(row["change_request_notes_json"]),
        }

    @app.post("/api/v1/orgs/{org_id}/builds/{run_id}/control")
    def control_sandbox_build(
        org_id: str,
        run_id: str,
        payload: BuildControlRequest,
        x_heavyrain_org_id: str | None = Header(default=None),
        x_heavyrain_actor_id: str | None = Header(default=None),
    ) -> dict[str, Any]:
        tenant = _resolve_tenant(org_id, x_heavyrain_org_id, x_heavyrain_actor_id)
        row = db._conn.execute(
            "SELECT * FROM builder_runs WHERE org_id = ? AND run_id = ?",
            (tenant, run_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Build run '{run_id}' not found for '{tenant}'.")

        checkpoint = int(row["last_active_checkpoint"])
        interaction_status: BuilderInteractionStatus = row["interaction_status"]
        build_stage: BuildStageId = row["build_stage"]
        release_state: CanonicalReleaseState = row["app_release_state"]
        release_status = row["app_release_status"]
        error_reason = row["error_reason"]

        if payload.action == "pause":
            build_stage = "paused"
            cairn.pause_run(tenant, row["batch_id"], payload.reason or "Paused by operator")
        elif payload.action == "resume":
            interaction_status = "in_progress"
            build_stage = "stage1" if checkpoint == 1 else ("stage3" if checkpoint == 3 else "stage2")
            error_reason = None
            cairn.resume_run(tenant, row["batch_id"])
        elif payload.action == "cancel":
            interaction_status = "cancelled"
            build_stage = "idle"
            release_state = "sandbox_preview"
            error_reason = payload.reason or "Cancelled by operator; task draft preserved in Work."
            cairn.cancel_run(tenant, row["batch_id"])
            # Return cluster to pending_triage with reports intact
            c_row = db._conn.execute(
                "SELECT cluster_json FROM recurrence_clusters WHERE org_id = ? AND cluster_id = ?",
                (tenant, row["cluster_id"]),
            ).fetchone()
            if c_row:
                c_obj = RecurrenceCluster.model_validate_json(c_row["cluster_json"])
                c_obj.actionState = "pending_triage"
                db._conn.execute(
                    "UPDATE recurrence_clusters SET cluster_json = ? WHERE org_id = ? AND cluster_id = ?",
                    (c_obj.model_dump_json(), tenant, row["cluster_id"]),
                )
        elif payload.action == "retry_from_checkpoint":
            interaction_status = "in_progress"
            build_stage = "stage1" if checkpoint == 1 else ("stage3" if checkpoint == 3 else "stage2")
            error_reason = None
        elif payload.action == "advance_checkpoint":
            if checkpoint < 3:
                checkpoint += 1
                interaction_status = "in_progress"
                build_stage = "stage2" if checkpoint == 2 else "stage3"
            else:
                interaction_status = "completed"
                build_stage = "stage3"
        elif payload.action == "simulate_failure":
            interaction_status = "failed"
            build_stage = "failed"
            error_reason = payload.reason or "Sandbox verification failed on schema bounds check."
        elif payload.action == "reveal_ready":
            checkpoint = 3
            interaction_status = "completed"
            build_stage = "stage3"
            release_state = "sandbox_preview"
            release_status = "in_sandbox_review"

        now_iso = datetime.now(timezone.utc).isoformat()
        db._conn.execute(
            """
            UPDATE builder_runs
            SET interaction_status = ?, build_stage = ?, last_active_checkpoint = ?,
                app_release_state = ?, app_release_status = ?, error_reason = ?, updated_at = ?
            WHERE org_id = ? AND run_id = ?
            """,
            (
                interaction_status,
                build_stage,
                checkpoint,
                release_state,
                release_status,
                error_reason,
                now_iso,
                tenant,
                run_id,
            ),
        )
        db._conn.commit()

        sse_hub.publish(
            tenant,
            "checkpoint_update",
            {
                "orgId": tenant,
                "runId": run_id,
                "action": payload.action,
                "interactionStatus": interaction_status,
                "buildStage": build_stage,
                "lastActiveCheckpoint": checkpoint,
                "appReleaseState": release_state,
            },
        )
        db.append_audit_log(
            org_id=tenant,
            actor_id=x_heavyrain_actor_id or "operator",
            actor_role="operator",
            action=f"build_control_{payload.action}",
            target_id=run_id,
            detail={
                "interactionStatus": interaction_status,
                "buildStage": build_stage,
                "lastActiveCheckpoint": checkpoint,
            },
        )
        _record_trace(tenant, "Builder", "Build checkpoint", "paused" if build_stage == "paused" else "completed",
                      f"Recorded {payload.action.replace('_', ' ')}", "local_build_control", run_id,
                      f"Stage {checkpoint}; interaction {interaction_status}",
                      "Checkpoint state persisted. Artifact verification is required before review.", checkpoint)
        _publish_status(tenant)
        return get_sandbox_build_status(org_id=tenant, run_id=run_id, x_heavyrain_org_id=None, x_heavyrain_actor_id=None)

    @app.post("/api/v1/orgs/{org_id}/builds/{run_id}/verify", response_model=VerificationReport)
    def verify_completed_sandbox_build(
        org_id: str,
        run_id: str,
        x_heavyrain_org_id: str | None = Header(default=None),
        x_heavyrain_actor_id: str | None = Header(default=None),
    ) -> VerificationReport:
        tenant = _resolve_tenant(org_id, x_heavyrain_org_id, x_heavyrain_actor_id)
        row = db._conn.execute(
            "SELECT * FROM builder_runs WHERE org_id = ? AND run_id = ?",
            (tenant, run_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Build run '{run_id}' not found for '{tenant}'.")

        interaction_status: BuilderInteractionStatus = row["interaction_status"]
        try:
            archive_bytes, export_method = builder.download_workspace_archive(
                org_id=tenant,
                run_id=run_id,
                target_app_id=row["target_app_id"],
                environment_id=row["environment_id"],
                interaction_status=interaction_status,
            )
        except (BuilderNotCompletedError, DeprecatedEndpointError) as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

        with tempfile.TemporaryDirectory(prefix=f"hr_verify_{run_id}_") as tmp_dir:
            staging_root = Path(tmp_dir)
            try:
                manifest = safe_extract_archive(archive_bytes, staging_root, archive_format="tar")
            except UnsafeArchiveError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc

            checks, summary_output = verify_extracted_artifacts(staging_root, manifest, REPO_ROOT)

        all_passed = all(checks.values())
        new_stage, new_release_state = map_interaction_to_build_stage(
            interaction_status,
            checkpoint=3,
            verification_passed=all_passed,
        )
        new_release_status = "in_sandbox_review" if all_passed else "release_check_failed"

        report = VerificationReport(
            runId=run_id,
            orgId=tenant,
            interactionId=row["interaction_id"],
            environmentId=row["environment_id"],
            exportMethod=export_method,
            archiveSafetyCheck={
                "pathTraversalRejected": True,
                "absolutePathsRejected": True,
                "externalSymlinksRejected": True,
                "extractedFileCount": len(manifest),
            },
            artifactManifest=manifest,
            verificationChecks=checks,
            summaryOutput=summary_output,
            passed=all_passed,
        )

        now_iso = datetime.now(timezone.utc).isoformat()
        db._conn.execute(
            """
            UPDATE builder_runs
            SET build_stage = ?, last_active_checkpoint = 3,
                app_release_state = ?, app_release_status = ?,
                artifact_manifest_json = ?, verification_report_json = ?, updated_at = ?
            WHERE org_id = ? AND run_id = ?
            """,
            (
                new_stage,
                new_release_state,
                new_release_status,
                json.dumps([m.model_dump() for m in manifest]),
                report.model_dump_json(),
                now_iso,
                tenant,
                run_id,
            ),
        )
        db._conn.commit()

        sse_hub.publish(tenant, "artifact_verification", report.model_dump())
        db.append_audit_log(
            org_id=tenant,
            actor_id=x_heavyrain_actor_id or "relay_verifier",
            actor_role="system",
            action="sandbox_artifact_verified",
            target_id=run_id,
            detail={
                "interactionId": row["interaction_id"],
                "environmentId": row["environment_id"],
                "passed": all_passed,
                "fileCount": len(manifest),
                "checks": checks,
            },
        )
        _record_trace(tenant, "Builder", "Artifact verification", "verified" if all_passed else "failed",
                      "Checked local candidate artifacts", "verify_local_artifacts", f"{len(manifest)} extracted files",
                      json.dumps(checks), "TypeScript and Node checks ran on the local fixture artifact.", 3)
        _publish_status(tenant)
        return report

    @app.post("/api/v1/orgs/{org_id}/builds/{run_id}/release-review")
    def submit_human_release_review(
        org_id: str,
        run_id: str,
        payload: ReleaseReviewRequest,
        x_heavyrain_org_id: str | None = Header(default=None),
        x_heavyrain_actor_id: str | None = Header(default=None),
    ) -> dict[str, Any]:
        tenant = _resolve_tenant(
            org_id,
            x_heavyrain_org_id,
            x_heavyrain_actor_id or payload.reviewer_employee_id,
        )
        if x_heavyrain_actor_id and x_heavyrain_actor_id != payload.reviewer_employee_id:
            raise HTTPException(status_code=403, detail="Reviewer must match the selected actor.")
        try:
            reviewer_ctx = verify_role_permission(
                tenant,
                employee_id=payload.reviewer_employee_id,
                required_capability="can_approve_production_release",
            )
        except RolePermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc

        row = db._conn.execute(
            "SELECT * FROM builder_runs WHERE org_id = ? AND run_id = ?",
            (tenant, run_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Build run '{run_id}' not found for '{tenant}'.")

        now_iso = datetime.now(timezone.utc).isoformat()
        now_label = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        reviewer_name = reviewer_ctx["employee"]["name"]

        if payload.decision == "approve_for_release":
            if row["interaction_status"] != "completed" or row["build_stage"] != "ready":
                raise HTTPException(
                    status_code=409,
                    detail="Complete artifact verification before approving the local demo candidate.",
                )

            verification = json.loads(row["verification_report_json"] or "{}")
            if not verification.get("passed"):
                raise HTTPException(status_code=409, detail="Run artifact verification before approving the demo candidate.")
            notified_count = 0
            snapshot = ApprovedReleaseSnapshot(
                version="1.0.0",
                releasedAt=now_label,
                approvedBy=reviewer_name,
                notifiedCount=notified_count,
                notes=payload.notes or "Verified sandbox artifact promoted after passing boundary and schema checks.",
            )
            db._conn.execute(
                """
                UPDATE builder_runs
                SET app_release_state = 'approved_demo',
                    app_release_status = 'released',
                    approved_release_json = ?,
                    updated_at = ?
                WHERE org_id = ? AND run_id = ?
                """,
                (snapshot.model_dump_json(), now_iso, tenant, run_id),
            )
            db._conn.execute(
                """
                UPDATE weekly_batches
                SET batch_run_status = 'complete', weekly_run_status_label = 'Complete'
                WHERE org_id = ? AND batch_id = ?
                """,
                (tenant, row["batch_id"]),
            )
            # Update catalog app status
            app_row = db._conn.execute(
                "SELECT app_json FROM catalog_apps WHERE org_id = ? AND app_id = ?",
                (tenant, row["target_app_id"]),
            ).fetchone()
            if app_row:
                app_obj = CatalogAppItem.model_validate_json(app_row["app_json"])
                app_obj.releaseStatus = "released"
                app_obj.version = "1.0.0"
                app_obj.notifiedEmployeeCount = notified_count
                app_obj.lastReleasedAt = now_label
                db._conn.execute(
                    "UPDATE catalog_apps SET app_json = ? WHERE org_id = ? AND app_id = ?",
                    (app_obj.model_dump_json(), tenant, row["target_app_id"]),
                )
            db._conn.commit()

            ev = TraceEvent(
                eventId=f"evt_rel_{run_id}",
                timestamp=datetime.now(timezone.utc).strftime("%H:%M:%S UTC"),
                actor="Notifier",
                stageLabel="Verified release promotion",
                tone="completed",
                headline=f"Approved demo candidate {row['target_app_name']} v1.0.0 after approval by {reviewer_name}",
                toolName="record_demo_release_review",
                inputEvidence=f"Recorded demo approval by {reviewer_name} ({payload.reviewer_employee_id})",
                toolOutput=f"Queued role-verified launch links for {notified_count} reporting employees ({app.state.operating_mode}).",
                durationMs=0,
                decisionSummary="Demo review recorded. No deployment or external notifications occurred.",
            )
            db.append_trace_event(tenant, ev)
            sse_hub.publish(tenant, "trace_event", ev.model_dump(exclude_none=True))

        elif payload.decision == "request_changes":
            notes = json.loads(row["change_request_notes_json"])
            if payload.notes:
                notes.append(payload.notes)
            db._conn.execute(
                """
                UPDATE builder_runs
                SET interaction_status = 'in_progress',
                    build_stage = 'stage2',
                    last_active_checkpoint = 2,
                    app_release_state = 'sandbox_preview',
                    app_release_status = 'changes_requested',
                    change_request_notes_json = ?,
                    updated_at = ?
                WHERE org_id = ? AND run_id = ?
                """,
                (json.dumps(notes), now_iso, tenant, run_id),
            )
            db._conn.commit()

        elif payload.decision == "require_scope_approval":
            db._conn.execute(
                """
                UPDATE builder_runs
                SET app_release_status = 'scope_approval_needed',
                    updated_at = ?
                WHERE org_id = ? AND run_id = ?
                """,
                (now_iso, tenant, run_id),
            )
            db._conn.commit()

        db.append_audit_log(
            org_id=tenant,
            actor_id=payload.reviewer_employee_id,
            actor_role=reviewer_ctx["role"]["role_id"],
            action=f"release_review_{payload.decision}",
            target_id=run_id,
            detail={"reviewerName": reviewer_name, "notes": payload.notes},
        )
        _publish_status(tenant)
        return {
            "runId": run_id,
            "orgId": tenant,
            "decision": payload.decision,
            "build": get_sandbox_build_status(org_id=tenant, run_id=run_id, x_heavyrain_org_id=None, x_heavyrain_actor_id=None),
            "workspace": db.get_workspace_state(tenant),
        }

    @app.post("/api/v1/orgs/{org_id}/batches/review-with-cairn", status_code=202)
    async def request_cairn_model_review(org_id: str, payload: CairnReviewRequest,
                                       x_heavyrain_org_id: str | None = Header(default=None),
                                       x_heavyrain_actor_id: str | None = Header(default=None)):
        tenant = _resolve_tenant(org_id, x_heavyrain_org_id, x_heavyrain_actor_id)
        if not app.state.live_review_enabled:
            raise HTTPException(status_code=503, detail="Model review is disabled on this server. The local weekly review remains available.")
        existing = db._conn.execute("SELECT * FROM cairn_reviews WHERE org_id = ? AND idempotency_key = ?",
                                    (tenant, payload.idempotency_key)).fetchone()
        if existing:
            return _review_row(existing)
        active = db._conn.execute("SELECT 1 FROM cairn_reviews WHERE status IN ('queued', 'running')").fetchone()
        if active:
            raise HTTPException(status_code=409, detail="A model review is already running. Wait for its result.")
        if db._conn.execute("SELECT COUNT(*) FROM cairn_reviews").fetchone()[0] >= 6:
            raise HTTPException(status_code=429, detail="This local demo has reached its six-review model budget.")
        ws = db.get_workspace_state(tenant)
        snapshot = review_evidence_snapshot(tenant, [c.model_dump() for c in ws.clusters],
                    [a.model_dump() for a in ws.catalogApps], [r.model_dump() for r in db.list_reports(tenant)])
        fingerprint = hashlib.sha256(json.dumps(snapshot, sort_keys=True).encode()).hexdigest()
        prior = db._conn.execute("SELECT 1 FROM cairn_reviews WHERE org_id = ? AND evidence_hash = ? AND status = 'failed'",
                                 (tenant, fingerprint)).fetchone()
        if prior:
            raise HTTPException(status_code=409, detail="This evidence review already failed. Resolve the cause before submitting changed evidence.")
        review_id = f"review_{uuid.uuid4().hex}"
        now = datetime.now(timezone.utc).isoformat()
        db._conn.execute("INSERT INTO cairn_reviews (review_id, org_id, idempotency_key, evidence_hash, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'queued', ?, ?)",
                         (review_id, tenant, payload.idempotency_key, fingerprint, now, now))
        db._conn.commit()
        task = asyncio.create_task(_run_review_job(tenant, review_id, snapshot))
        app.state.review_tasks.add(task)
        task.add_done_callback(app.state.review_tasks.discard)
        return {"reviewId": review_id, "orgId": tenant, "status": "queued", "executionMode": "live_model_review", "recommendationOnly": True}

    @app.get("/api/v1/orgs/{org_id}/reviews/{review_id}")
    def get_cairn_model_review(org_id: str, review_id: str,
                             x_heavyrain_org_id: str | None = Header(default=None),
                             x_heavyrain_actor_id: str | None = Header(default=None)):
        tenant = _resolve_tenant(org_id, x_heavyrain_org_id, x_heavyrain_actor_id)
        row = db._conn.execute("SELECT * FROM cairn_reviews WHERE org_id = ? AND review_id = ?", (tenant, review_id)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Review not found in this organization.")
        return _review_row(row)

    def _review_row(row):
        return {"reviewId": row["review_id"], "orgId": row["org_id"], "status": row["status"],
                "executionMode": "live_model_review", "recommendationOnly": True,
                "result": json.loads(row["result_json"]) if row["result_json"] else None,
                "errorCode": row["error_code"], "createdAt": row["created_at"], "updatedAt": row["updated_at"]}

    async def _run_review_job(tenant, review_id, snapshot):
        async with request_lock:
            db._conn.execute("UPDATE cairn_reviews SET status = 'running', updated_at = ? WHERE review_id = ?",
                             (datetime.now(timezone.utc).isoformat(), review_id))
            db._conn.commit()
            _record_trace(tenant, "Cairn", "Model review", "running", "Reviewing approved work evidence with Cairn",
                          "cairn_model_review", f"{len(snapshot['reports'])} submitted reports", review_id,
                          "Read-only model review started. No build or release action is authorized.")
        error_code = None
        result = None
        try:
            result = await app.state.live_review_runner(snapshot)
            validate_review_output(result["output"], snapshot)
        except asyncio.CancelledError:
            error_code = "review_interrupted_outcome_unknown"
        except TimeoutError:
            error_code = "review_timeout_outcome_unknown"
        except Exception as exc:
            # Do not persist provider exception text, which can contain request credentials.
            error_code = "review_validation_failed" if isinstance(exc, (ValueError, KeyError)) else "model_request_failed"
        async with request_lock:
            status = "failed" if error_code else "completed"
            db._conn.execute("UPDATE cairn_reviews SET status = ?, result_json = ?, error_code = ?, updated_at = ? WHERE review_id = ?",
                (status, json.dumps(result) if not error_code else None, error_code, datetime.now(timezone.utc).isoformat(), review_id))
            db._conn.commit()
            _record_trace(tenant, "Cairn", "Model review", "failed" if error_code else "completed",
                          "Model review failed" if error_code else "Cairn review completed", "cairn_model_review",
                          review_id, error_code or json.dumps(result["output"]),
                          "No build, release, or notification was triggered.")
            sse_hub.publish(tenant, "cairn_review", {"reviewId": review_id, "status": status, "errorCode": error_code})
            db.append_audit_log(org_id=tenant, actor_id="cairn", actor_role="read_only_reviewer",
                action=f"cairn_review_{status}", target_id=review_id,
                detail={"model": ARGON_MODEL_NAME, "errorCode": error_code, "recommendationOnly": True,
                        "usage": result.get("usage") if result and not error_code else None})

    @app.get("/api/v1/orgs/{org_id}/audit-logs")
    def get_tenant_audit_logs(
        org_id: str,
        x_heavyrain_org_id: str | None = Header(default=None),
        x_heavyrain_actor_id: str | None = Header(default=None),
    ) -> dict[str, Any]:
        tenant = _resolve_tenant(org_id, x_heavyrain_org_id, x_heavyrain_actor_id)
        logs = db.list_audit_logs(tenant)
        return {
            "orgId": tenant,
            "immutable": True,
            "count": len(logs),
            "entries": logs,
        }

    @app.get("/api/v1/orgs/{org_id}/events/stream")
    async def stream_org_events(
        org_id: str,
        request: Request,
        replay_only: bool = Query(default=True),
        x_heavyrain_org_id: str | None = Header(default=None),
        x_heavyrain_actor_id: str | None = Header(default=None),
    ) -> StreamingResponse:
        tenant = _resolve_tenant(org_id, x_heavyrain_org_id, x_heavyrain_actor_id)
        ws = db.get_workspace_state(tenant)
        generator = sse_hub.stream_initial_and_live(tenant, ws, replay_only=replay_only)
        return StreamingResponse(
            generator,
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-HeavyRain-Operating-Mode": app.state.operating_mode,
            },
        )

    def _publish_status(tenant):
        status = db.get_workspace_state(tenant).orthogonalStatuses
        if status:
            sse_hub.publish(tenant, "orthogonal_status", status.model_dump())

    def _record_trace(tenant, actor, stage, tone, headline, tool, inputs, output, summary, checkpoint=None):
        ev = TraceEvent(eventId=f"evt_{uuid.uuid4().hex}", timestamp=datetime.now(timezone.utc).isoformat(),
                        actor=actor, stageLabel=stage, tone=tone, headline=headline, toolName=tool,
                        inputEvidence=inputs, toolOutput=output, durationMs=0,
                        decisionSummary=summary, checkpointStep=checkpoint)
        db.append_trace_event(tenant, ev)
        sse_hub.publish(tenant, "trace_event", ev.model_dump(exclude_none=True))

    return app


app = create_app()
