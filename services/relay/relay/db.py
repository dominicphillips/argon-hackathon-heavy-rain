"""SQLite persistence layer for Relay with immutable hash-chained audit logs."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
from typing import Any, Literal

from relay.fixtures_loader import (
    build_initial_workspace_state,
    get_organization_fixture,
)
from relay.models import (
    ApprovedReleaseSnapshot,
    BuilderInteractionStatus,
    BuildStageId,
    CanonicalReleaseState,
    CatalogAppItem,
    EmployeeReport,
    LiveBuildArtifact,
    LiveBuildProgressEvent,
    LiveBuildRequest,
    LiveBuildRun,
    LiveBuildSnapshot,
    OrganizationFixture,
    OrganizationId,
    OrganizationWorkspaceState,
    OrthogonalStatuses,
    RecurrenceCluster,
    TraceEvent,
)


class ImmutableAuditModificationError(PermissionError):
    """Raised when attempting to mutate or delete an immutable audit log record."""


class RelayDatabase:
    """SQLite database backing Heavy Rain Relay and Cairn state."""

    def __init__(
        self,
        db_path: str | Path = ":memory:",
        operating_mode: Literal["demo_fixture_replay", "cached_snapshot", "live_runtime"] = "demo_fixture_replay",
    ) -> None:
        self.db_path = str(db_path)
        self.operating_mode = operating_mode
        if self.db_path != ":memory:":
            Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._init_schema()
        self.seed_fixtures_if_empty()

    def close(self) -> None:
        self._conn.close()

    def _init_schema(self) -> None:
        cur = self._conn.cursor()
        cur.executescript(
            """
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS organizations (
                org_id TEXT PRIMARY KEY CHECK (org_id IN ('rookmere', 'augi', 'meridian')),
                canonical_org_id TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                legal_entity TEXT NOT NULL,
                sector TEXT NOT NULL,
                timezone TEXT NOT NULL DEFAULT 'UTC',
                theme_id TEXT NOT NULL,
                weekly_schedule_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS weekly_batches (
                batch_id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL REFERENCES organizations(org_id),
                cutoff_version INTEGER NOT NULL DEFAULT 1,
                org_timezone TEXT NOT NULL DEFAULT 'UTC',
                window_start TEXT NOT NULL,
                window_cutoff TEXT NOT NULL,
                cutoff_locked INTEGER NOT NULL DEFAULT 0,
                batch_run_status TEXT NOT NULL,
                weekly_run_status_label TEXT NOT NULL,
                replay_idempotency_key TEXT,
                evaluated_at TEXT,
                UNIQUE (org_id, batch_id, cutoff_version)
            );

            CREATE TABLE IF NOT EXISTS mcp_reports (
                report_id TEXT PRIMARY KEY,
                receipt_id TEXT NOT NULL UNIQUE,
                org_id TEXT NOT NULL REFERENCES organizations(org_id),
                batch_id TEXT NOT NULL REFERENCES weekly_batches(batch_id),
                idempotency_key TEXT NOT NULL,
                employee_id TEXT NOT NULL,
                employee_name TEXT NOT NULL,
                employee_title TEXT NOT NULL,
                department_label TEXT NOT NULL,
                office TEXT NOT NULL,
                role_id TEXT NOT NULL,
                assistant_surface TEXT NOT NULL,
                mcp_tool_name TEXT NOT NULL,
                user_inspected_outgoing_payload INTEGER NOT NULL CHECK (user_inspected_outgoing_payload = 1),
                host_chat_history_excluded INTEGER NOT NULL CHECK (host_chat_history_excluded = 1),
                cluster_id TEXT NOT NULL,
                data_scope TEXT NOT NULL,
                policy_scope_label TEXT NOT NULL,
                task_summary TEXT NOT NULL,
                outgoing_payload_preview_json TEXT NOT NULL,
                untrusted_payload_envelope_json TEXT NOT NULL,
                redaction_manifest_json TEXT NOT NULL,
                attachments_json TEXT NOT NULL,
                missing_evidence_note TEXT,
                status TEXT NOT NULL,
                submitted_at TEXT NOT NULL,
                withdrawn_at TEXT,
                deleted_at TEXT,
                UNIQUE (org_id, idempotency_key)
            );

            CREATE TABLE IF NOT EXISTS recurrence_clusters (
                org_id TEXT NOT NULL REFERENCES organizations(org_id),
                cluster_id TEXT NOT NULL,
                batch_id TEXT NOT NULL REFERENCES weekly_batches(batch_id),
                cluster_json TEXT NOT NULL,
                decision_record_json TEXT,
                PRIMARY KEY (org_id, cluster_id)
            );

            CREATE TABLE IF NOT EXISTS catalog_apps (
                org_id TEXT NOT NULL REFERENCES organizations(org_id),
                app_id TEXT NOT NULL,
                app_json TEXT NOT NULL,
                PRIMARY KEY (org_id, app_id)
            );

            CREATE TABLE IF NOT EXISTS builder_runs (
                run_id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL REFERENCES organizations(org_id),
                batch_id TEXT NOT NULL REFERENCES weekly_batches(batch_id),
                cluster_id TEXT NOT NULL,
                target_app_id TEXT NOT NULL,
                target_app_name TEXT NOT NULL,
                interaction_id TEXT NOT NULL,
                environment_id TEXT NOT NULL,
                agent_name TEXT NOT NULL,
                environment_mode TEXT NOT NULL,
                model_name TEXT NOT NULL,
                max_total_tokens TEXT NOT NULL,
                operating_mode TEXT NOT NULL,
                interaction_status TEXT NOT NULL,
                build_stage TEXT NOT NULL,
                last_active_checkpoint INTEGER NOT NULL,
                app_release_state TEXT NOT NULL,
                app_release_status TEXT NOT NULL,
                tokens_used INTEGER NOT NULL DEFAULT 0,
                requires_action_detail TEXT,
                error_reason TEXT,
                artifact_manifest_json TEXT,
                verification_report_json TEXT,
                approved_release_json TEXT,
                change_request_notes_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS trace_events (
                seq_id INTEGER PRIMARY KEY AUTOINCREMENT,
                org_id TEXT NOT NULL REFERENCES organizations(org_id),
                event_id TEXT NOT NULL,
                event_json TEXT NOT NULL,
                UNIQUE (org_id, event_id)
            );

            CREATE TABLE IF NOT EXISTS cairn_reviews (
                review_id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL REFERENCES organizations(org_id),
                idempotency_key TEXT NOT NULL,
                evidence_hash TEXT NOT NULL,
                status TEXT NOT NULL,
                result_json TEXT,
                error_code TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE (org_id, idempotency_key)
            );

            CREATE TABLE IF NOT EXISTS audit_logs (
                audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
                org_id TEXT NOT NULL,
                actor_id TEXT NOT NULL,
                actor_role TEXT NOT NULL,
                action TEXT NOT NULL,
                target_id TEXT NOT NULL,
                operating_mode TEXT NOT NULL,
                detail_json TEXT NOT NULL,
                prev_hash TEXT NOT NULL,
                entry_hash TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS live_builds (
                run_id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL REFERENCES organizations(org_id),
                idempotency_key TEXT NOT NULL,
                status TEXT NOT NULL,
                phase TEXT NOT NULL,
                model TEXT NOT NULL,
                interaction_id TEXT,
                environment_id TEXT,
                requested_by TEXT NOT NULL,
                workflow TEXT NOT NULL,
                app TEXT NOT NULL,
                usage TEXT NOT NULL,
                files_written TEXT NOT NULL,
                artifact TEXT,
                steps_recorded INTEGER NOT NULL DEFAULT 0,
                started_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                completed_at TEXT,
                error_reason TEXT,
                UNIQUE (org_id, idempotency_key)
            );

            CREATE UNIQUE INDEX IF NOT EXISTS live_builds_active_org
            ON live_builds(org_id) WHERE status IN ('queued', 'in_progress');

            CREATE TABLE IF NOT EXISTS live_build_events (
                run_id TEXT NOT NULL REFERENCES live_builds(run_id),
                seq INTEGER NOT NULL,
                at TEXT NOT NULL,
                kind TEXT NOT NULL,
                title TEXT NOT NULL,
                detail TEXT,
                path TEXT,
                PRIMARY KEY (run_id, seq)
            );

            CREATE TRIGGER IF NOT EXISTS prevent_audit_log_update
            BEFORE UPDATE ON audit_logs
            BEGIN
                SELECT RAISE(ABORT, 'audit_logs is immutable: UPDATE prohibited');
            END;

            CREATE TRIGGER IF NOT EXISTS prevent_audit_log_delete
            BEFORE DELETE ON audit_logs
            BEGIN
                SELECT RAISE(ABORT, 'audit_logs is immutable: DELETE prohibited');
            END;
            """
        )
        self._conn.commit()
        self._migrate_organization_ids()

    def _migrate_organization_ids(self) -> None:
        schema = self._conn.execute(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'organizations'"
        ).fetchone()[0]
        if "'meridian'" in schema:
            return
        expanded = schema.replace("organizations", "organizations_expanded", 1).replace(
            "'augi'", "'augi', 'meridian'"
        )
        self._conn.execute("PRAGMA foreign_keys = OFF")
        try:
            self._conn.execute("BEGIN IMMEDIATE")
            self._conn.execute(expanded)
            self._conn.execute("INSERT INTO organizations_expanded SELECT * FROM organizations")
            self._conn.execute("DROP TABLE organizations")
            self._conn.execute("ALTER TABLE organizations_expanded RENAME TO organizations")
            if self._conn.execute("PRAGMA foreign_key_check").fetchone():
                raise sqlite3.IntegrityError("organizations migration failed foreign_key_check")
            self._conn.commit()
        except BaseException:
            self._conn.rollback()
            raise
        finally:
            self._conn.execute("PRAGMA foreign_keys = ON")

    def append_audit_log(
        self,
        *,
        org_id: str,
        actor_id: str,
        actor_role: str,
        action: str,
        target_id: str,
        detail: dict[str, Any],
    ) -> dict[str, Any]:
        """Appends a cryptographically hash-chained immutable audit entry."""
        cur = self._conn.cursor()
        row = cur.execute(
            "SELECT entry_hash FROM audit_logs ORDER BY audit_id DESC LIMIT 1"
        ).fetchone()
        prev_hash = row["entry_hash"] if row else "GENESIS_00000000000000000000000000000000"
        created_at = datetime.now(timezone.utc).isoformat()
        detail_json = json.dumps(detail, sort_keys=True)
        payload_to_hash = f"{prev_hash}|{org_id}|{actor_id}|{actor_role}|{action}|{target_id}|{self.operating_mode}|{detail_json}|{created_at}"
        entry_hash = hashlib.sha256(payload_to_hash.encode("utf-8")).hexdigest()

        cur.execute(
            """
            INSERT INTO audit_logs (
                org_id, actor_id, actor_role, action, target_id,
                operating_mode, detail_json, prev_hash, entry_hash, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                org_id,
                actor_id,
                actor_role,
                action,
                target_id,
                self.operating_mode,
                detail_json,
                prev_hash,
                entry_hash,
                created_at,
            ),
        )
        self._conn.commit()
        return {
            "auditId": cur.lastrowid,
            "orgId": org_id,
            "actorId": actor_id,
            "actorRole": actor_role,
            "action": action,
            "targetId": target_id,
            "operatingMode": self.operating_mode,
            "detail": detail,
            "prevHash": prev_hash,
            "entryHash": entry_hash,
            "createdAt": created_at,
        }

    def list_audit_logs(self, org_id: OrganizationId) -> list[dict[str, Any]]:
        rows = self._conn.execute(
            "SELECT * FROM audit_logs WHERE org_id = ? ORDER BY audit_id ASC",
            (org_id,),
        ).fetchall()
        return [
            {
                "auditId": r["audit_id"],
                "orgId": r["org_id"],
                "actorId": r["actor_id"],
                "actorRole": r["actor_role"],
                "action": r["action"],
                "targetId": r["target_id"],
                "operatingMode": r["operating_mode"],
                "detail": json.loads(r["detail_json"]),
                "prevHash": r["prev_hash"],
                "entryHash": r["entry_hash"],
                "createdAt": r["created_at"],
            }
            for r in rows
        ]

    def seed_fixtures_if_empty(self) -> None:
        now_iso = "2026-10-25T18:00:00Z"
        for org_id in ("rookmere", "augi", "meridian"):
            if self._conn.execute("SELECT 1 FROM organizations WHERE org_id = ?", (org_id,)).fetchone():
                continue
            fixture: OrganizationFixture = get_organization_fixture(org_id)
            canonical_id = f"org_{org_id}"
            tz = {"rookmere": "Europe/London", "augi": "Europe/Berlin", "meridian": "UTC"}[org_id]
            theme_id = "augi-graphite-atelier" if org_id == "augi" else "rookmere-ash-ledger"

            self._conn.execute(
                """
                INSERT INTO organizations (
                    org_id, canonical_org_id, name, legal_entity, sector,
                    timezone, theme_id, weekly_schedule_active, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
                """,
                (
                    org_id,
                    canonical_id,
                    fixture.name,
                    fixture.legalEntity,
                    fixture.sector,
                    tz,
                    theme_id,
                    now_iso,
                ),
            )

            self._conn.execute(
                """
                INSERT INTO weekly_batches (
                    batch_id, org_id, cutoff_version, org_timezone,
                    window_start, window_cutoff, cutoff_locked,
                    batch_run_status, weekly_run_status_label, evaluated_at
                ) VALUES (?, ?, 1, ?, '2026-10-18T18:00:00Z', '2026-10-25T18:00:00Z', 0, ?, ?, ?)
                """,
                (fixture.weeklyBatchId, org_id, tz,
                 "collecting" if org_id == "meridian" else "awaiting_operator_decision",
                 "Idle" if org_id == "meridian" else "Awaiting operator decision", now_iso),
            )

            for rep in fixture.reports:
                self._conn.execute(
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
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'clustered_in_batch', ?)
                    """,
                    (
                        rep.reportId,
                        rep.receiptId,
                        org_id,
                        fixture.weeklyBatchId,
                        f"seed_{rep.reportId}",
                        rep.employeeId,
                        rep.employeeName,
                        rep.employeeTitle,
                        rep.departmentLabel,
                        rep.office,
                        "role_seeded",
                        rep.assistantSurface,
                        rep.mcpToolName,
                        rep.clusterId,
                        rep.dataScope,
                        rep.policyScopeLabel,
                        rep.taskSummary,
                        json.dumps(rep.outgoingPayloadPreview),
                        json.dumps({"_trust_level": "untrusted_employee_evidence_data", "task_summary_data": rep.taskSummary}),
                        json.dumps({"client_redaction_applied": True, "excluded_fields": ["host_chat_history"], "policy_version": "2026.10"}),
                        json.dumps([a.model_dump() for a in rep.attachments]),
                        rep.missingEvidenceNote,
                        rep.submittedAt,
                    ),
                )

            for cluster in fixture.clusters:
                self._conn.execute(
                    """
                    INSERT INTO recurrence_clusters (org_id, cluster_id, batch_id, cluster_json)
                    VALUES (?, ?, ?, ?)
                    """,
                    (org_id, cluster.clusterId, fixture.weeklyBatchId, cluster.model_dump_json()),
                )

            for app in fixture.catalogApps:
                self._conn.execute(
                    """
                    INSERT INTO catalog_apps (org_id, app_id, app_json)
                    VALUES (?, ?, ?)
                    """,
                    (org_id, app.appId, app.model_dump_json()),
                )

            for ev in fixture.initialEvents:
                self._conn.execute(
                    """
                    INSERT INTO trace_events (org_id, event_id, event_json)
                    VALUES (?, ?, ?)
                    """,
                    (org_id, ev.eventId, ev.model_dump_json()),
                )

            if org_id == "meridian":
                continue
            run_id = "run_rm_var_01" if org_id == "rookmere" else "run_augi_sable_3d_01"
            cluster_id = "pat_rm_01" if org_id == "rookmere" else "wf_augi_01"
            target_app_id = "app_rm_variance_workbench" if org_id == "rookmere" else "app_augi_sable_chassis_3d"
            target_app_name = "Rookmere Portfolio Variance Workbench" if org_id == "rookmere" else "AUGI Sable 3D Chassis Architecture Comparator"

            self._conn.execute(
                """
                INSERT INTO builder_runs (
                    run_id, org_id, batch_id, cluster_id, target_app_id, target_app_name,
                    interaction_id, environment_id, agent_name, environment_mode,
                    model_name, max_total_tokens, operating_mode,
                    interaction_status, build_stage, last_active_checkpoint,
                    app_release_state, app_release_status, tokens_used,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'antigravity-preview-09-2026', 'remote', 'gemini-4-argon', '262144', ?, 'in_progress', 'stage2', 2, 'sandbox_preview', 'in_sandbox_review', 18420, ?, ?)
                """,
                (
                    run_id,
                    org_id,
                    fixture.weeklyBatchId,
                    cluster_id,
                    target_app_id,
                    target_app_name,
                    f"inter_demo_{org_id}_{run_id}",
                    f"env_demo_{org_id}_{run_id}",
                    self.operating_mode,
                    now_iso,
                    now_iso,
                ),
            )

        self._conn.commit()

    def get_workspace_state(self, org_id: OrganizationId) -> OrganizationWorkspaceState:
        fixture = get_organization_fixture(org_id)
        org_row = self._conn.execute(
            "SELECT * FROM organizations WHERE org_id = ?", (org_id,)
        ).fetchone()
        batch_row = self._conn.execute(
            "SELECT * FROM weekly_batches WHERE org_id = ? ORDER BY cutoff_version DESC LIMIT 1",
            (org_id,),
        ).fetchone()
        run_row = self._conn.execute(
            "SELECT * FROM builder_runs WHERE org_id = ? ORDER BY created_at DESC LIMIT 1",
            (org_id,),
        ).fetchone()

        clusters = [
            RecurrenceCluster.model_validate_json(r["cluster_json"])
            for r in self._conn.execute(
                "SELECT cluster_json FROM recurrence_clusters WHERE org_id = ? ORDER BY rowid ASC",
                (org_id,),
            ).fetchall()
        ]
        stored_reports = self.list_reports(org_id)
        for cluster in clusters:
            evidence = [r for r in stored_reports if r.clusterId == cluster.clusterId]
            cluster.reportIds = [r.reportId for r in evidence]
            cluster.reportCount = len(evidence)
            cluster.distinctEmployeeCount = len({r.employeeId for r in evidence})
        catalog_apps = [
            CatalogAppItem.model_validate_json(r["app_json"])
            for r in self._conn.execute(
                "SELECT app_json FROM catalog_apps WHERE org_id = ? ORDER BY rowid ASC",
                (org_id,),
            ).fetchall()
        ]
        events = [
            TraceEvent.model_validate_json(r["event_json"])
            for r in self._conn.execute(
                "SELECT event_json FROM trace_events WHERE org_id = ? ORDER BY seq_id ASC",
                (org_id,),
            ).fetchall()
        ]

        schedule_active = bool(org_row["weekly_schedule_active"]) if org_row else True
        weekly_run_status = batch_row["weekly_run_status_label"] if batch_row else "Awaiting operator decision"
        batch_run_status = batch_row["batch_run_status"] if batch_row else "awaiting_operator_decision"

        build_stage: BuildStageId = run_row["build_stage"] if run_row else "idle"
        last_checkpoint = int(run_row["last_active_checkpoint"]) if run_row else 1
        interaction_status: BuilderInteractionStatus = run_row["interaction_status"] if run_row else "queued"
        app_release_state: CanonicalReleaseState = run_row["app_release_state"] if run_row else "sandbox_preview"
        app_release_status = run_row["app_release_status"] if run_row else "in_sandbox_review"

        approved_release = (
            ApprovedReleaseSnapshot.model_validate_json(run_row["approved_release_json"])
            if run_row and run_row["approved_release_json"]
            else None
        )
        change_notes = (
            json.loads(run_row["change_request_notes_json"])
            if run_row and run_row["change_request_notes_json"]
            else []
        )

        notification_state = "suppressed_in_demo"
        orthogonal = OrthogonalStatuses(
            orgId=org_id,
            weeklyBatchId=fixture.weeklyBatchId,
            weeklySchedule="active" if schedule_active else "paused",
            weeklyScheduleActive=schedule_active,
            batchRunStatus=batch_run_status,
            weeklyRunStatus=weekly_run_status,
            builderInteractionStatus=interaction_status,
            buildStage=build_stage,
            lastActiveCheckpoint=last_checkpoint,  # type: ignore[arg-type]
            appReleaseState=app_release_state,
            appReleaseStatus=app_release_status,
            notificationState=notification_state,  # type: ignore[arg-type]
            dataFreshness=self.operating_mode,
            capturedThroughLabel=fixture.capturedThroughLabel,
        )

        base_state = build_initial_workspace_state(org_id, self.operating_mode)
        base_state.weeklyScheduleActive = schedule_active
        base_state.weeklyRunStatus = weekly_run_status
        base_state.buildStage = build_stage
        base_state.lastActiveCheckpoint = last_checkpoint  # type: ignore[assignment]
        base_state.appReleaseStatus = app_release_status
        base_state.approvedRelease = approved_release
        base_state.changeRequestNotes = change_notes
        base_state.clusters = clusters
        base_state.catalogApps = catalog_apps
        base_state.events = events
        base_state.orthogonalStatuses = orthogonal
        return base_state

    def list_reports(self, org_id: OrganizationId) -> list[EmployeeReport]:
        rows = self._conn.execute(
            "SELECT * FROM mcp_reports WHERE org_id = ? AND status NOT IN ('withdrawn', 'deleted_tombstone') ORDER BY submitted_at ASC",
            (org_id,),
        ).fetchall()
        result: list[EmployeeReport] = []
        for r in rows:
            result.append(
                EmployeeReport(
                    reportId=r["report_id"],
                    receiptId=r["receipt_id"],
                    submittedAt=r["submitted_at"],
                    employeeId=r["employee_id"],
                    employeeName=r["employee_name"],
                    employeeTitle=r["employee_title"],
                    departmentLabel=r["department_label"],
                    office=r["office"],
                    assistantSurface=r["assistant_surface"],
                    mcpToolName=r["mcp_tool_name"],
                    userInspectedOutgoingPayload=bool(r["user_inspected_outgoing_payload"]),
                    hostChatHistoryExcluded=bool(r["host_chat_history_excluded"]),
                    clusterId=r["cluster_id"],
                    dataScope=r["data_scope"],
                    policyScopeLabel=r["policy_scope_label"],
                    taskSummary=r["task_summary"],
                    outgoingPayloadPreview=json.loads(r["outgoing_payload_preview_json"]),
                    attachments=json.loads(r["attachments_json"]),
                    missingEvidenceNote=r["missing_evidence_note"],
                )
            )
        return result

    def append_trace_event(self, org_id: OrganizationId, event: TraceEvent) -> None:
        self._conn.execute(
            """
            INSERT OR REPLACE INTO trace_events (org_id, event_id, event_json)
            VALUES (?, ?, ?)
            """,
            (org_id, event.eventId, event.model_dump_json()),
        )
        self._conn.commit()

    def interrupt_live_builds(self) -> None:
        self._conn.execute(
            """UPDATE live_builds SET status = 'incomplete', error_reason = ?, updated_at = ?
               WHERE status IN ('queued', 'in_progress')""",
            ("Server restarted while the build was running.", datetime.now(timezone.utc).isoformat()),
        )
        self._conn.commit()

    @staticmethod
    def _live_run(row: sqlite3.Row) -> LiveBuildRun:
        return LiveBuildRun(
            runId=row["run_id"], orgId=row["org_id"], status=row["status"], phase=row["phase"],
            model=row["model"], interactionId=row["interaction_id"], environmentId=row["environment_id"],
            requestedBy=json.loads(row["requested_by"]), workflow=json.loads(row["workflow"]),
            app=json.loads(row["app"]), usage=json.loads(row["usage"]),
            filesWritten=json.loads(row["files_written"]), startedAt=row["started_at"],
            updatedAt=row["updated_at"], completedAt=row["completed_at"], errorReason=row["error_reason"],
        )

    def get_live_build(self, org_id: OrganizationId, run_id: str) -> LiveBuildRun | None:
        row = self._conn.execute(
            "SELECT * FROM live_builds WHERE org_id = ? AND run_id = ?", (org_id, run_id)
        ).fetchone()
        return self._live_run(row) if row else None

    def reserve_live_build(
        self, org_id: OrganizationId, request: LiveBuildRequest, model: str, run_id: str,
    ) -> tuple[LiveBuildRun | None, bool, str | None]:
        self._conn.execute("BEGIN IMMEDIATE")
        try:
            existing = self._conn.execute(
                "SELECT * FROM live_builds WHERE org_id = ? AND idempotency_key = ?",
                (org_id, request.idempotency_key),
            ).fetchone()
            if existing:
                self._conn.commit()
                return self._live_run(existing), False, None
            active = self._conn.execute(
                "SELECT run_id FROM live_builds WHERE org_id = ? AND status IN ('queued', 'in_progress')",
                (org_id,),
            ).fetchone()
            if active:
                self._conn.commit()
                return None, False, active["run_id"]
            now = datetime.now(timezone.utc).isoformat()
            run = LiveBuildRun(
                runId=run_id, orgId=org_id, status="queued", phase="received", model=model,
                requestedBy={"personaId": request.requested_by.persona_id,
                             "name": request.requested_by.name, "role": request.requested_by.role},
                workflow={"title": request.workflow.title, "summary": request.workflow.summary,
                          "tools": request.workflow.tools, "weeklyHoursSaved": request.workflow.weekly_hours_saved},
                app=request.app, startedAt=now, updatedAt=now,
            )
            self._conn.execute(
                """INSERT INTO live_builds
                   (run_id, org_id, idempotency_key, status, phase, model, requested_by, workflow,
                    app, usage, files_written, started_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (run_id, org_id, request.idempotency_key, run.status, run.phase, model,
                 run.requestedBy.model_dump_json(), run.workflow.model_dump_json(), run.app.model_dump_json(),
                 run.usage.model_dump_json(), "[]", now, now),
            )
            self._conn.commit()
            return run, True, None
        except BaseException:
            self._conn.rollback()
            raise

    def save_live_build(self, run: LiveBuildRun) -> None:
        run.updatedAt = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            """UPDATE live_builds SET status = ?, phase = ?, interaction_id = ?, environment_id = ?,
               usage = ?, files_written = ?, updated_at = ?, completed_at = ?, error_reason = ?
               WHERE org_id = ? AND run_id = ?""",
            (run.status, run.phase, run.interactionId, run.environmentId, run.usage.model_dump_json(),
             json.dumps(run.filesWritten), run.updatedAt, run.completedAt, run.errorReason, run.orgId, run.runId),
        )
        self._conn.commit()

    def live_steps_recorded(self, run_id: str) -> int:
        return self._conn.execute(
            "SELECT steps_recorded FROM live_builds WHERE run_id = ?", (run_id,)
        ).fetchone()[0]

    def record_live_steps(self, run_id: str, count: int) -> None:
        self._conn.execute("UPDATE live_builds SET steps_recorded = ? WHERE run_id = ?", (count, run_id))
        self._conn.commit()

    def save_live_artifact(self, run_id: str, artifact: LiveBuildArtifact) -> None:
        self._conn.execute("UPDATE live_builds SET artifact = ? WHERE run_id = ?", (artifact.model_dump_json(), run_id))
        self._conn.commit()

    def append_live_event(self, run_id: str, **fields: Any) -> LiveBuildProgressEvent:
        seq = self._conn.execute(
            "SELECT COALESCE(MAX(seq), 0) + 1 FROM live_build_events WHERE run_id = ?", (run_id,)
        ).fetchone()[0]
        event = LiveBuildProgressEvent(seq=seq, at=datetime.now(timezone.utc).isoformat(), **fields)
        self._conn.execute(
            "INSERT INTO live_build_events (run_id, seq, at, kind, title, detail, path) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (run_id, seq, event.at, event.kind, event.title, event.detail, event.path),
        )
        self._conn.commit()
        return event

    def live_snapshot(self, org_id: OrganizationId, run_id: str | None = None, since: int = 0) -> LiveBuildSnapshot:
        if run_id is None:
            row = self._conn.execute(
                "SELECT * FROM live_builds WHERE org_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 1", (org_id,)
            ).fetchone()
        else:
            row = self._conn.execute(
                "SELECT * FROM live_builds WHERE org_id = ? AND run_id = ?", (org_id, run_id)
            ).fetchone()
        if not row:
            return LiveBuildSnapshot(run=None, progress=[], artifact=None)
        events = self._conn.execute(
            """SELECT seq, at, kind, title, detail, path FROM live_build_events
               WHERE run_id = ? AND seq > ? ORDER BY seq DESC LIMIT 400""", (row["run_id"], since)
        ).fetchall()
        return LiveBuildSnapshot(
            run=self._live_run(row),
            progress=[LiveBuildProgressEvent(**dict(event)) for event in reversed(events)],
            artifact=LiveBuildArtifact.model_validate_json(row["artifact"]) if row["artifact"] else None,
        )
