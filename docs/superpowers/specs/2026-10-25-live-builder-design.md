# Live builder: real sandbox builds for Meridian Crest Capital

Date: 2026-10-25. Owner: Dom. Backend implementation: Codex Astra. Frontend: Claude Fable. Copy and builder prompt wording: Gemini 4 Argon via sol-copy.

## Intent

A button in the colleague's HeavyRain app (`HeavyRain_BDMD/`, Vite on `http://localhost:5173`, FastAPI on `:8000`) sends one weekly workflow and its proposed MVP to our relay. The relay commissions a real Google-hosted Antigravity agent run, follows it while it works, exposes what the agent is doing in plain language, downloads the finished app, and serves it so the operator console can show an app card and open the application. The operator console shows nothing for this organization until work arrives.

## Goals

- One HTTP call starts a real build on `antigravity-preview-09-2026` with model `gemini-3.8-flash` by default (configurable), `background=True`, `store=True`.
- While the agent works, the relay records a readable progress feed: status changes, thought summaries, tool actions, files written, errors, token usage. No fabricated steps.
- On completion the relay downloads the workspace, extracts it safely, verifies `index.html` exists, and serves the files over HTTP.
- The fixture-replay path for `augi` keeps working unchanged. The operator console's existing playback for AUGI must not break.
- The new organization `meridian` (display name "Meridian Crest Capital") starts empty: no reports, no clusters, no catalog apps, no events.

## Non-goals

- No Cairn evaluation or clustering for the live path. The colleague's app already decided what to build.
- No release notifications, no production writes, no deployment.
- No changes under `apps/`, `packages/`, or `HeavyRain_BDMD/` by the backend implementer.
- Do not restart or kill the running relay processes. The coordinator restarts the server.

## Environment and configuration

Read from the process environment (a gitignored `services/relay/.env.live` holds local values; never print them):

| Variable | Default | Meaning |
| --- | --- | --- |
| `GEMINI_API_KEY` | unset | Required for live builds. |
| `HEAVY_RAIN_LIVE_BUILDER` | `0` | `1` enables the live build endpoints. |
| `HEAVY_RAIN_BUILDER_MODEL` | `gemini-3.8-flash` | Model passed in `agent_config`. `gemini-4-argon` also allowed. |
| `HEAVY_RAIN_BUILDER_MAX_TOTAL_TOKENS` | `262144` | Best-effort cap for the interaction. |
| `HEAVY_RAIN_BUILDER_POLL_SECONDS` | `3` | Poll interval. |
| `HEAVY_RAIN_ARTIFACT_ROOT` | `services/relay/data/artifacts` | Where extracted apps are stored and served from. |
| `HEAVY_RAIN_PUBLIC_BASE_URL` | `http://127.0.0.1:43180` | Used to build absolute artifact URLs. |

The process-wide `HEAVY_RAIN_OPERATING_MODE` stays `demo_fixture_replay`. The live builder is a separate capability gated by `HEAVY_RAIN_LIVE_BUILDER=1` plus the key. Remove the `ValueError` that blocks `live_runtime` only if needed; preferred: leave operating mode alone and gate the new endpoints independently.

## SDK facts (verified in `.venv`, google-genai 2.33.0)

- `client.interactions.create(**body)` returns `Interaction`. Relevant fields: `id`, `status` (`queued | in_progress | requires_action | incomplete | completed | failed | cancelled`), `environment_id`, `steps: list[Step]`, `usage` (`total_tokens`, `total_thought_tokens`, `total_output_tokens`, `total_input_tokens`), `errors`, `output_text`, `created`, `updated`.
- `client.interactions.get(id)` returns the same shape. `client.interactions.cancel(id)` exists.
- Step variants by `type`: `thought` (`summary: list[ThoughtSummaryContent]`), `function_call` (`id`, `name`, `arguments: dict`), `function_result` (`call_id`, `name`, `result`, `is_error`), `code_execution_call` (`arguments`), `code_execution_result`, `model_output` (`content: list[Content]` where text content has `.text`), `processing_call`, `processing_result`, `user_input`, plus search/url variants. Treat unknown variants as `status` events with the type name.
- `AntigravityAgentConfig` fields: `type: "antigravity"`, `model: str`, `max_total_tokens: int`. Inspect the installed type and pass the accepted integer type. The existing validator in `builder_driver.py` insists on a string and on Argon; adapt it so the live path accepts the configured model and the SDK's integer, without breaking the fixture path or its tests.
- `client.environments.files.upload(path=..., file=bytes, environment=env_id, overwrite=True)` and `client.environments.files.download(path=..., environment=env_id) -> bytes`. `client.environments.create` and `files.list` are thin wrappers (`*args, **kwargs`); inspect `google/genai/environments.py` before relying on them. If an environment cannot be created before the interaction, do not upload files at all: put the brief and the stylesheet inline in the prompt. The run must never block on uploads.
- Environments idle after 15 minutes and are purged after 7 days; download artifacts immediately on completion.

## Tenant

- Add `"meridian"` to `OrganizationId` in `services/relay/relay/models.py` and wherever the literal is enumerated (security, fixtures loader, db seeding, `/api/v1/orgs`).
- `fixtures_loader.build_meridian_fixture()` returns an `OrganizationFixture` with `orgId="meridian"`, `name="Meridian Crest Capital"`, `shortLabel="Meridian"`, sector private equity, and empty `clusters`, `reports`, `catalogApps`, `initialEvents`, `rookmereCompanies`, `augiConfigs`. Checkpoints and workers may mirror the other fixtures. `heroTitle` and similar strings must be plain and short; no Rookmere or AUGI text.
- Tenant isolation: actors for `meridian` may be BDMD persona ids (`marcus`, `elena`, `devon`, `priya`, `claire`) or ids prefixed `emp_mc_`. Keep the existing rules for the other two tenants.
- `GET /api/v1/orgs/meridian/workspace` returns an empty workspace with `buildStage: "idle"`.

## HTTP contract

All routes sit behind the existing loopback-only boundary. Add `http://localhost:5173` and `http://127.0.0.1:5173` to both the CORS middleware origins and the `local_demo_boundary` allowed origins so the colleague's app can call us.

### `POST /api/v1/orgs/{org_id}/builds/live` → 202

Request body (`LiveBuildRequest`):

```json
{
  "idempotency_key": "marcus-2026-10-25-dealpulse",
  "requested_by": { "persona_id": "marcus", "name": "Marcus Vance", "role": "VP, Deal Sourcing & Screening" },
  "workflow": { "title": "15-minute pre-call scramble", "summary": "Before every founder call Marcus ...", "tools": ["Outlook", "Affinity", "Claude", "Granola", "Gemini", "Excel", "Slack"], "weekly_hours_saved": 9.2 },
  "app": { "name": "DealPulse AutoBrief", "purpose": "One pre-call brief assembled automatically ...", "features": ["T-20m auto pre-call brief", "Public comps ticker", "Granola to deal-team email draft"], "assumptions": ["Affinity is the CRM of record"] }
}
```

Validation: `idempotency_key` 6–128 chars; `app.name` 2–80 chars; `app.features` 1–8 items; strings trimmed; reject unknown fields silently (ignore). The same `idempotency_key` for the same org returns the existing run with 200 instead of starting a second build.

Response 202 (`LiveBuildAccepted`): `{ "runId", "orgId", "status": "accepted", "interactionId", "environmentId", "model", "createdAt" }`.

Errors: 503 `{"detail": "Live builder is disabled on this relay."}` when the flag or key is missing; 409 when a run for the org is `queued` or `in_progress` (detail names the active `runId`); 502 with the provider's error message if the create call fails (also persist a failed run with `errorReason`).

Behavior: persist the run row first (`status: "queued"`, `phase: "received"`), then call the SDK in a thread (`asyncio.to_thread`), persist `interactionId` and `environmentId` as soon as they exist, append a `status` progress event ("Request received", detail naming the app and requester), then start the poller task.

### `GET /api/v1/orgs/{org_id}/builds/live/current` → 200

```json
{ "run": LiveBuildRun | null, "progress": [LiveBuildProgressEvent], "artifact": LiveBuildArtifact | null }
```

`run` is the most recent run for the org. `progress` is ascending by `seq`, capped at the last 400 events. Supports `?since=<seq>` to return only newer events (run and artifact always included).

### `GET /api/v1/orgs/{org_id}/builds/live/{run_id}` → same shape for one run. 404 if unknown.

### `POST /api/v1/orgs/{org_id}/builds/live/{run_id}/cancel` → 200 with the run. Calls `interactions.cancel` in a thread; status `cancelled`, phase `failed`, `errorReason: "Cancelled by operator"`.

### `GET /artifacts/{org_id}/{run_id}/{path}` → static files

Mount `HEAVY_RAIN_ARTIFACT_ROOT` with `StaticFiles(html=True)` at `/artifacts`. No directory listings. Serve `index.html` for the run root.

### Health

Add `"liveBuilderEnabled": bool` and `"liveBuilderModel": str` to `/health`. Leave `liveRuntimeEnabled` as is.

## Shapes

```ts
type LiveBuildStatus = "queued" | "in_progress" | "requires_action" | "incomplete" | "completed" | "failed" | "cancelled";
type LiveBuildPhase = "received" | "reading" | "building" | "checking" | "ready" | "failed";

interface LiveBuildRun {
  runId: string; orgId: "meridian"; status: LiveBuildStatus; phase: LiveBuildPhase;
  model: string; interactionId: string | null; environmentId: string | null;
  requestedBy: { personaId: string; name: string; role: string };
  workflow: { title: string; summary: string; tools: string[]; weeklyHoursSaved: number | null };
  app: { name: string; purpose: string; features: string[]; assumptions: string[] };
  startedAt: string; updatedAt: string; completedAt: string | null; errorReason: string | null;
  usage: { totalTokens: number; totalThoughtTokens: number; totalOutputTokens: number };
  filesWritten: string[];
}

interface LiveBuildProgressEvent {
  seq: number; at: string;
  kind: "status" | "thought" | "tool_call" | "tool_result" | "file" | "message" | "error";
  title: string;      // <= 80 chars, plain language, no secrets, no file bodies
  detail: string | null; // <= 600 chars
  path: string | null;   // for file events
}

interface LiveBuildArtifact {
  indexUrl: string; previewUrl: string | null; notes: string | null;
  card: { name: string; tagline: string; highlights: string[]; screens: string[] } | null;
  fileCount: number; bytes: number;
}
```

Phase derivation: `received` until the first non-status step arrives; `reading` while only thoughts/messages have arrived; `building` once any `function_call`, `code_execution_call`, or file event exists; `checking` once the interaction is `completed` and download/extract is running; `ready` when the artifact is served; `failed` for `failed`, `cancelled`, provider errors, or a completed run without `index.html`. `incomplete` and `requires_action` keep the last phase and set `errorReason` to a short explanation.

## Poller

One asyncio task per run, started on accept, registered on `app.state` so shutdown cancels it. Loop every `HEAVY_RAIN_BUILDER_POLL_SECONDS`:

1. `interaction = await asyncio.to_thread(client.interactions.get, interaction_id)`.
2. Diff `interaction.steps` against the count already recorded; for each new step append a progress event:
   - `thought` → kind `thought`, title "Thinking", detail = joined summary texts, truncated to 600 chars. Skip if there is no summary text.
   - `function_call` → kind `tool_call`, title = a short human verb from the tool name (`write_file` → "Writing {path}", `read_file` → "Reading {path}", `run_command`/`bash`/`execute` → "Running a command", `list_dir` → "Looking around the workspace", other → the name with underscores replaced by spaces). Detail = arguments with any value longer than 200 chars replaced by "[n chars]". If the arguments contain a path under `workspace/`, also append a `file` event and add the path to `filesWritten` (deduplicated).
   - `function_result` → kind `tool_result` (or `error` when `is_error`), title "Finished {name}" / "Failed {name}", detail = result truncated to 300 chars.
   - `code_execution_call` → kind `tool_call`, title "Running code", detail = first 3 lines of the code.
   - `model_output` → kind `message`, title "Note from the builder", detail = text truncated to 600 chars.
   - other → kind `status`, title = type name humanised.
3. If `interaction.usage` changed, update `usage` on the run (no event).
4. If status changed, append a `status` event ("Started working", "Paused: needs input", "Stopped early", "Finished", "Failed") and update the run.
5. On `completed`: set phase `checking`; download `workspace/app` (fall back to `workspace`, then `/`); `safe_extract_archive` into `ARTIFACT_ROOT/{org}/{run_id}/`; if the download is not a tar, try zip; locate `index.html` (prefer `app/index.html`, then any depth-1 `index.html`) and move the containing directory's files to the run root so `/artifacts/{org}/{run}/index.html` works; read `card.json` (validate shape, tolerate missing), `preview.svg`, `NOTES.md`; append events "Downloaded {n} files", "Preview ready"; set phase `ready`, `completedAt`. If no `index.html`: phase `failed`, `errorReason: "The builder finished without an index.html."`, keep the extracted files.
6. On `failed` / `cancelled`: phase `failed`, `errorReason` from `interaction.errors` or the status. On `incomplete`: keep the environment id, `errorReason: "Stopped before finishing (token or time limit)."`. On `requires_action`: `errorReason: "Waiting for input the relay cannot provide."`.
7. Stop polling on terminal states. Any exception inside the loop appends an `error` event and keeps polling up to 5 consecutive failures, then marks the run `failed`.
8. Hard stop after 40 minutes: cancel the interaction and mark `failed` with "Build exceeded 40 minutes".

Also publish each new event on the SSE hub as `live_build_progress` (payload = event plus `runId`), reusing `sse_hub.publish(tenant, ...)`.

## Prompt composition

`services/relay/relay/prompts/live_builder.md` is the template. Its wording is owned by Argon; the implementer only wires placeholders `{{org_name}}`, `{{requested_by_name}}`, `{{requested_by_role}}`, `{{workflow_title}}`, `{{workflow_summary}}`, `{{workflow_tools}}`, `{{app_name}}`, `{{app_purpose}}`, `{{app_features}}` (bulleted), `{{app_assumptions}}` (bulleted), `{{scaffold_css}}` (contents of `services/relay/relay/assets/scaffold.css`). Provide `compose_live_builder_prompt(request, org_fixture) -> str`. Missing placeholders are an error at startup.

Deliverables the prompt asks the agent for (the implementer relies on these paths): `workspace/app/index.html` (self-contained, no network, system fonts, uses `scaffold.css` inline or next to it), `workspace/app/card.json` with `{ "name", "tagline", "highlights": [3 strings], "screens": [strings] }`, `workspace/app/preview.svg` (1200×750 low-fidelity wireframe of the main screen), `workspace/app/NOTES.md` (plain-language build notes).

## Persistence

New tables in `db.py` (SQLite, created in `_init_schema`): `live_builds` (one row per run; JSON columns for `requested_by`, `workflow`, `app`, `usage`, `files_written`, `artifact`) and `live_build_events` (`run_id`, `seq`, `at`, `kind`, `title`, `detail`, `path`; primary key `(run_id, seq)`). Add helper methods; do not change `builder_runs`. On server start, mark any `queued`/`in_progress` live run as `incomplete` with `errorReason: "Server restarted while the build was running."`.

## Tests

Add `services/relay/tests/test_live_builder.py` (pytest is available in `.venv`). Use `create_app(...)` with a fake genai client injected through a factory on `ManagedBuilderClient` or a new `LiveBuilderService` so no network is used. Cover: 503 when disabled; 202 accept and idempotent replay; progress events derived from a scripted sequence of interaction snapshots (thought, function_call with a workspace path, function_result, model_output); completion downloads a tar produced in the test, serves `/artifacts/meridian/<run>/index.html`, and returns an artifact with a parsed card; failed interaction marks the run failed; `meridian` appears in `/api/v1/orgs` and its workspace is empty; CORS and boundary accept `http://localhost:5173`. Run the new tests and the whole `services/relay` test session, plus `python -c "import relay.app"` to prove startup.

Also add `services/relay/scripts/live_build_smoke.py`: a CLI that posts the Marcus Vance sample above to a running relay (base URL argument, default `http://127.0.0.1:43180`), then polls `/builds/live/current` every 3 seconds printing new events as one line each (`seq kind title`) until a terminal phase, then prints the artifact URLs. It must never print environment variables.

## Constraints for the implementer

- Python 3.14, FastAPI, SQLite, no new dependencies.
- Never log or print `GEMINI_API_KEY`. Never include file bodies in progress events.
- Do not run `git commit --author="Dominic Phillips <dom@dominicphillips.de>"`, do not touch `apps/`, `packages/`, `HeavyRain_BDMD/`, or running processes.
- Keep every existing endpoint and test passing.
- Report back: files changed, how to enable (env), test command and output summary, anything unverified (the live call is unverified until the coordinator runs the smoke script).

## Addendum A (2026-10-25, after the first live run): stream the agent's events instead of polling snapshots

Observed on the first real run (interaction `in_progress` for several minutes): `client.interactions.get(id)` returns `steps: []` and `usage: None` until the agent finishes, so the poller recorded nothing but "Started working". `client.interactions.get(id, stream=True)` returns a live event stream immediately. Verified event shapes (SDK objects with `event_type`):

- `interaction.created` (`interaction.status`), `interaction.status_update` (`status`, optional `usage`), `interaction.completed` (final interaction with steps and usage), error events.
- `step.start` with `index` and `step` (a typed step with empty content: `ThoughtStep`, `ModelOutputStep`, `FunctionCallStep`, `CodeExecutionCallStep`, ...).
- `step.delta` with `index` and `delta`: `ThoughtSummaryDelta(content=TextContent(text=...))`, `TextDelta(text=...)`, `ArgumentsDelta` for function arguments, result deltas for tool results.
- `step.stop` with `index`, optional `step_usage` and `usage`.

Also: `client.environments.files.list(environment=env_id, path="workspace/app")` requires `path`.

Required change to `relay/live_builder.py` (keep the HTTP contract, tables, and event shapes unchanged):

1. Replace the snapshot poll loop with a stream consumer. Run the blocking iteration in a worker thread (`asyncio.to_thread` or a dedicated thread) and hand events to the event loop with `loop.call_soon_threadsafe` or an `asyncio.Queue`. Keep one consumer per run, registered like the current task.
2. Maintain a per-index step buffer: on `step.start` record the step type (and name/id for function calls); on `step.delta` append text (thought summaries, model output text, function arguments); on `step.stop` emit one progress event using the existing mapping in `_step` (thought → `thought` "Thinking" with the accumulated summary; model_output → `message` "Note from the builder" with the text; function_call → `tool_call` plus `file` events for workspace paths parsed from the accumulated arguments; function_result → `tool_result` or `error`; code_execution_call → `tool_call` "Running code"). Thought summaries arrive as several bold-titled paragraphs; keep them as one event per step, trimmed to 600 chars, with the bold markers removed.
3. Additionally emit a `thought` or `message` event early for long steps: if a step has been open for more than 20 seconds with accumulated text, emit the text so far as an event and continue (mark the final event normally). This keeps the feed moving on slow steps.
4. On `interaction.status_update` apply the status rules already in `_apply_snapshot`. On `interaction.completed` take the final interaction object and run the existing completion path (download, extract, artifact). If the stream ends without a terminal status, reconnect with `last_event_id` when the SDK provides event ids, otherwise fall back to one `interactions.get` snapshot every poll interval until terminal, as today.
5. Every 15 seconds while the run is active, call `environments.files.list(environment=env_id, path="workspace/app")` in a thread (tolerate errors), and emit a `file` event for each new path under `workspace/app/` not yet in `filesWritten`. Add the path to `filesWritten`. This is the fidelity signal the console uses.
6. Usage: take `usage` from `step.stop`, `interaction.status_update`, or the completed interaction whenever present and keep the run's `usage` current.
7. Phase rules stay: `reading` once any thought or message arrives; `building` once any function call, code execution, or file event exists; `checking` on completion; `ready` when the artifact is served.
8. Tests: extend `services/relay/tests/test_live_builder.py` with a fake client whose `interactions.get(id, stream=True)` yields a scripted sequence (created, step.start thought, two thought deltas, step.stop, step.start model_output, text deltas, step.stop, step.start function_call with an arguments delta naming `workspace/app/index.html`, step.stop, status_update completed / interaction.completed) and whose `files.list` returns two paths; assert the resulting progress events, `filesWritten`, phases, and that the artifact path still works. Keep all existing tests green.

Nothing else changes: endpoints, shapes, redaction, CSP, idempotency, cancellation, expiry, origins.

## Addendum B (2026-10-25, after the second live run): live snapshots and a progress file

Goal: while the agent works, the console shows the page it is building taking shape, and knows which sub-step it is on. The sandbox cannot reach this machine, so the relay pulls.

1. **Progress file.** The prompt (owned by Argon) now asks the agent to keep `workspace/app/progress.json` current after every step: `{"step": int, "of": int, "doing": string, "done": [string], "next": [string]}`. Every 10 seconds while a run is `in_progress`, download `workspace/app/progress.json` (`environments.files.download(path=..., environment=...)`, tolerate 404/errors), parse it leniently, and store it on the run as `progress: { step, of, doing, done, next, updatedAt } | null`. Emit a `status` event "Step {step} of {of}: {doing}" only when `doing` changes.
2. **Live snapshot.** Every 15 seconds while a run is `in_progress`, if `workspace/app/index.html` exists (per `files.list`), download `workspace/app/index.html` and `workspace/app/scaffold.css` and write them to `ARTIFACT_ROOT/{org}/{run_id}/live/` (same safe-path rules, overwrite in place). Set `snapshot: { indexUrl, updatedAt, version }` on the run, where `version` increments on every changed download (compare bytes). Serve it through the existing `/artifacts` mount with the same CSP. Skip the download when the listing shows the file unchanged in size since the last snapshot, if the listing exposes sizes.
3. **Shapes.** Add `progress` and `snapshot` to `LiveBuildRun` (both nullable), persisted in `live_builds` as JSON columns. Everything else unchanged.
4. **Tests.** Fake client gains `files.download` for the progress file and index/css, and `files.list` output that changes between polls; assert the run exposes `progress` and `snapshot` with increasing `version`, that `/artifacts/{org}/{run}/live/index.html` serves, and that a missing progress file is tolerated.
