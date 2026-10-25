# Heavy Rain Backend API Contract

## Runtime and Verification Status
- **Backend API base:** `http://127.0.0.1:43180` (`GET /openapi.json` is the authoritative schema).
- **Preview applications:** Heavy Rain console (`http://127.0.0.1:43170`), AUGI (`http://127.0.0.1:43171`), Rookmere Capital (`http://127.0.0.1:43173`).
- **Persistence:** Local SQLite (`services/relay/data/heavyrain.sqlite3` or `HEAVY_RAIN_SQLITE_PATH`).
- **Verification status:** All 22 backend tests pass, and live HTTP + SSE streaming has been verified to deliver persisted SQLite state mutations.
- **Operating mode:** Defaults to `demo_fixture_replay`. Starting the server with `HEAVY_RAIN_OPERATING_MODE=live_runtime` fails closed (`ValueError`).

## Local Boundary, Headers, and Personas
- **Loopback only:** Middleware rejects non-loopback client hosts (`127.0.0.1`, `::1`, `testclient`) and unknown browser `Origin` headers with `403`.
- **Unauthenticated demo personas:** `X-HeavyRain-Org-Id` (`rookmere` | `augi`) and `X-HeavyRain-Actor-Id` select fixture personas, not production credentials. No password or token authentication is implemented.
- **Tenant and role checks:** The backend enforces consistency across route `{org_id}`, `X-HeavyRain-Org-Id`, payload `org_id`, and the actor's organization, plus capability checks for build authorization and release review:
  - `rookmere` default operator/authorizer: `emp_rm_12` (`X-HeavyRain-Org-Id: rookmere`, `X-HeavyRain-Actor-Id: emp_rm_12`).
  - `augi` default operator/authorizer: `emp_augi_08` (`X-HeavyRain-Org-Id: augi`, `X-HeavyRain-Actor-Id: emp_augi_08`).

## Execution Realities and Non-Claims
- **Work report intake:** `POST /api/v1/orgs/{org_id}/mcp/submit-work-report` is a REST JSON endpoint carrying `mcpToolName: "heavyrain_submit_work_report"`, not a standalone MCP JSON-RPC transport. Attachment checks validate metadata policy and SHA-256 digest strings, not uploaded file bytes.
- **Weekly evaluation:** `POST /api/v1/orgs/{org_id}/batches/evaluate` applies deterministic fixture rules (`CairnOrchestrator.evaluate_batch`) to route clusters to `reuse_existing_app`, `build_in_sandbox`, or `request_missing_evidence`. It does not run live Cairn model inference.
- **Optional Cairn model review:** `POST /api/v1/orgs/{org_id}/batches/review-with-cairn` (`202 Accepted`) and `GET /api/v1/orgs/{org_id}/reviews/{review_id}` remain disabled (`503` unless `HEAVY_RAIN_ENABLE_LIVE_REVIEW=1` and `GEMINI_API_KEY` are configured) and unverified with an actual model.
- **Sandbox builder and verification:** `POST /api/v1/orgs/{org_id}/builds` runs local fixture replay (`executionMode: "local_fixture_replay"`, `remoteExecution: false`, `tokensUsed: 0`). The planned hosted builder path (`antigravity-preview-09-2026`) is not executed during this demo; the user reserved the `agy` key for a later hosted builder demonstration, and no calls were made with the new key beyond an initial `OK` smoke test.
- **Artifact checks:** `POST /api/v1/orgs/{org_id}/builds/{run_id}/verify` extracts a locally exported tar archive, computes real SHA-256 hashes, and runs actual TypeScript and Node checks against the small local fixture candidate artifact, not the entire frontend repository.
- **Demo release approval:** Approving a build records `appReleaseState: "approved_demo"`, `appReleaseStatus: "released"`, `notifiedCount: 0`, `deployed: false`, and `externalNotificationsSent: 0`. No production deployment or external notification occurs.

## Client Routes (`services/relay/relay/app.py`)

### Health and Workspace State
- `GET /health` — Service status, operating mode, feature flags, and port map.
- `GET /api/v1/orgs` — List persisted organizations and schedule flags.
- `GET /api/v1/orgs/{org_id}/fixture` — Hydrated `OrganizationFixture` with SQLite clusters, catalog apps, reports, and trace events.
- `GET /api/v1/orgs/{org_id}/workspace` — Canonical `OrganizationWorkspaceState` matching the frontend workspace state schema.
- `GET /api/v1/orgs/{org_id}/events/stream?replay_only=true|false` — `text/event-stream` SSE feed emitting `workspace_snapshot`, `trace_event`, `routing_decision`, `worker_assignment`, `checkpoint_update`, `artifact_verification`, `orthogonal_status`, and `cairn_review`. Clients refresh canonical state via `GET /api/v1/orgs/{org_id}/workspace`.
- `GET /api/v1/orgs/{org_id}/audit-logs` — Immutable hash-chained tenant audit log entries.

### Reports, Schedule, and Clustering
- `POST /api/v1/orgs/{org_id}/mcp/submit-work-report` — Submit work report JSON (`idempotency_key`, `employee_id`, `role_id`, `data_scope`, `task_summary`, `redaction_manifest`, `attachments`). Returns `200` (`McpSubmissionReceiptResponse`), `409` on key conflict, or `422` on policy rejection.
- `POST /api/v1/orgs/{org_id}/reports/{report_id}/withdraw` — Author withdraws a report prior to batch cutoff.
- `DELETE /api/v1/orgs/{org_id}/reports/{report_id}` — Admin retention scrub (`status: "deleted_tombstone"`; optional `X-HeavyRain-Role-Id`).
- `POST /api/v1/orgs/{org_id}/schedule` — Body: `{"active": boolean}`. Toggles weekly schedule while preserving active `buildStage`.
- `POST /api/v1/orgs/{org_id}/batches/evaluate` — Runs deterministic weekly batch evaluation and returns updated `decisions` and `workspace`.
- `POST /api/v1/orgs/{org_id}/clusters/{cluster_id}/decision` — Body: `{"action": "route_to_existing_app" | "request_missing_evidence" | "receive_missing_evidence" | "start_sandbox_build" | "defer_next_run", "actor_id"?: string}`.

### Sandbox Builds and Release Review
- `POST /api/v1/orgs/{org_id}/builds` — Body: `{"cluster_id": string, "authorized_by_employee_id": string, "max_total_tokens"?: string, "agent_config_override"?: object, "live_opt_in"?: boolean}`. Starts local build replay (`run_rm_var_01` for `pat_rm_01`, `run_augi_sable_3d_01` for `wf_augi_01`) at `buildStage: "stage1"`.
- `GET /api/v1/orgs/{org_id}/builds/{run_id}` — Returns build run state, manifest, verification report, and release snapshot.
- `POST /api/v1/orgs/{org_id}/builds/{run_id}/control` — Body: `{"action": "pause" | "resume" | "cancel" | "retry_from_checkpoint" | "advance_checkpoint" | "simulate_failure" | "reveal_ready", "reason"?: string}`. Calling `reveal_ready` advances the run to checkpoint 3 (`interactionStatus: "completed"`, `buildStage: "stage3"`).
- `POST /api/v1/orgs/{org_id}/builds/{run_id}/verify` — Requires `interactionStatus == "completed"`. Verifies extracted tar archive and transitions `buildStage` from `stage3` to `ready`.
- `POST /api/v1/orgs/{org_id}/builds/{run_id}/release-review` — Body: `{"decision": "approve_for_release" | "request_changes" | "require_scope_approval", "reviewer_employee_id": string, "notes"?: string}`. `approve_for_release` requires `buildStage == "ready"` and passing verification, transitioning `appReleaseState` to `approved_demo`.

### Optional Model Review
- `POST /api/v1/orgs/{org_id}/batches/review-with-cairn` — Body: `{"idempotency_key": string}`. Returns `202` (`{"reviewId", "status": "queued"}`) when enabled, or `503` by default.
- `GET /api/v1/orgs/{org_id}/reviews/{review_id}` — Poll review status and read-only recommendation payload.
