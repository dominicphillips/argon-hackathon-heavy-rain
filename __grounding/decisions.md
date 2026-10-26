# Heavy Rain architectural and design decisions

**Updated:** 2026-10-25
**Scope:** Recorded owner decisions governing visual selections, frontend package separation, persistent local preview ports, managed production builders vs coordinator SDK vs local development workforce, MCP evidence capture, and milestone commit workflow.

---

## ADR-01: Visual anchor (`09`), selected system mockup (`03-system-c.png`), and final wordmark (`02-wordmark.png`)

- **Spatial layout anchor:** [`09-tactical-gear-landing-page-anorent.png`](./inspiration/references/dribbble/09-tactical-gear-landing-page-anorent.png) (*tactical gear landing page \ anorent®* by Fantik Studio®, <https://dribbble.com/shots/26831532-tactical-gear-landing-page-anorent>, retrieved 2026-10-25).
- **Selected first system build mockup:** [`03-system-c.png`](./inspiration/mockups/03-system-c.png):
  1. **Pale ash and rain-dark topographic surfaces** with sparse technical hairlines and generous negative space (never a generic SaaS metric-card grid).
  2. **Tactile left vertical navigation** (`System`, `Work`, `Apps`, `Activity`) with softly faded inactive items, an active dark tick indicator, and crisp click feedback.
  3. **Dominant central artifact stage** with a **worker dock positioned below the central stage** and a secondary evidence/trace inspector.
- **Selected final brand wordmark:** [`02-wordmark.png`](./inspiration/logos/02-wordmark.png) (and vectorized [`heavy-rain-mark.svg`](./design/brand/heavy-rain-mark.svg)), not `04`. Additional AUGI 3D mockups are queued behind the active frontend builds.

---

## ADR-02: Smoky blurred central preview during builds with sharp operational controls

- **Decision:** While a **Builder** is actively executing checkpoints, render the central application preview canvas with a smoky blur while keeping left navigation, checkpoint status labels, `Pause`/`Resume`, the lower worker dock, and trace inspectors sharp and interactive.
- **Provenance and motion rules:** Carries forward the visual ideas from the owner's early concept reference (which is intentionally neither saved nor embedded in the repository). Transitions respond only to real state changes or explicit user replay, with static high-contrast equivalents under `prefers-reduced-motion`.

---

## ADR-03: Three-way package separation (`heavy-rain-ui`, `organization-ui`, `organization-3d`) and persistent local ports (`43170`, `43171`)

- **Verified stack:** Vite (`^8.3.5`), `@vitejs/plugin-react` (`^6.1.2`), React (`^19.0.0`), TypeScript (`^7.0.2`), and Three.js (`^0.186.1` / `@types/three@^0.186.0`), with zero `shadcn/ui` dependencies (aligned after verifying that `vite@7.8.0` does not exist in the npm registry).
- **Three distinct workspace packages:**
  1. `packages/heavy-rain-ui` (`@heavy-rain/system-ui`): Operator console components exclusively for `apps/system`.
  2. `packages/organization-ui` (`@heavy-rain/organization-ui`): Shared visual controls, identity/permission chrome, audit/freshness notices, tables, and organization themes (`rookmere-ash-ledger`, `augi-graphite-atelier`) for organization apps.
  3. `packages/organization-3d` (`@heavy-rain/organization-3d`): Reusable 3D toolkit for WebGL renderer setup, camera/orbit/pan/zoom/tilt navigation, part selection, spatial measurement, and deformation/assembly animation—kept separate from domain models (such as AUGI Sable chassis math), `packages/organization-ui` controls, and `packages/heavy-rain-ui`.
- **Enforced boundary:** Organization packages and apps (`apps/augi-engineering`, Rookmere tools) never import `@heavy-rain/system-ui` or `packages/heavy-rain-ui` (enforced via `npm run check:boundaries`).
- **Persistent local preview ports:** Keep `apps/system` running on `http://127.0.0.1:43170` (`npm run dev:system`) and `apps/augi-engineering` on `http://127.0.0.1:43171` (`npm run dev:augi`) with `--strictPort` throughout work until the owner asks to stop them.

---

## ADR-04: Production Builders (`antigravity-preview-09-2026`), Cairn Coordinator (`google-antigravity 0.1.22`), and Development Workforce (`agy` Argon high)

- **Production Builders (explicit owner selection):** Production application **Builders** run on the Google-hosted managed Antigravity agent via the Gemini Interactions API (<https://ai.google.dev/gemini-api/docs/antigravity-agent>, <https://ai.google.dev/gemini-api/docs/latest-model>):
  - Invoked with `agent="antigravity-preview-09-2026"`, `environment="remote"`, `background=True`, `store=True`, and `agent_config={"type": "antigravity", "model": "gemini-4-argon", "max_total_tokens": "..."}`.
  - Because the managed service defaults to `gemini-3.8-flash`, `"model": "gemini-4-argon"` is always set explicitly.
  - Per [`antigravityagentconfig.py#L31`](https://github.com/googleapis/python-genai/blob/cb1408b06c573060f1593023ca320fde9a4fb5f6/google/genai/_gaos/types/interactions/antigravityagentconfig.py#L31), `AntigravityAgentConfig` exposes only `type`, `model`, and `max_total_tokens` (no `thinking_level` or `max_output_tokens` knob; reasoning depth is managed adaptively server-side).
  - **Relay** retains `interaction.id` and `interaction.environment_id`, polls across `queued` and `in_progress`, treats `completed` as the sole success state, handles `requires_action`, `incomplete`, `failed`, and `cancelled`, and downloads verified artifacts via `client.environments.files.download(environment=env_id, path="workspace")` or `GET /v1beta/environments/{env_id}/files?alt=media` (<https://ai.google.dev/gemini-api/docs/agent-environment>, replacing deprecated `/files/environment-{id}:download`) before the 15-minute idle snapshot / 7-day expiration window.
- **Cairn Coordinator:** Uses the Antigravity Python SDK `google-antigravity==0.1.22` (<https://pypi.org/project/google-antigravity/>, <https://antigravity.google/docs/changelog>) on the local/server coordinator runtime with `gemini-4-argon` at `high` thinking within the `1,048,576` shared token ceiling (`GeminiModelOptions.max_output_tokens`).
- **Development Workforce (`agy`):** All repository development subagents, product copy, and commit subjects use local `agy` (`--model gemini-4-argon-high --effort high`) with the injected `GEMINI_API_KEY`. When hitting HTTP `429` rate limits, secondary background jobs are staggered behind primary frontend builds.

---

## ADR-05: Explicit MCP work capture, reuse-first routing, and distinct consent gates

- **Explicit intake:** Employees submit work reports via an authenticated MCP tool (`heavyrain_submit_work_report`) or policy-scoped local hooks after inspecting the exact outgoing payload (<https://modelcontextprotocol.io/specification/2026-07-28/architecture>). Host assistants retain ambient chat history.
- **Reuse before build:** Weekly evaluation checks `approved_app_catalog` first and routes users directly when an approved app fits within existing role permissions, holds for missing schemas/approvals when evidence is incomplete, and commissions a managed sandbox **Builder** only for verified capability gaps.

---

## ADR-06: Two first-class personas (Rookmere Capital and AUGI) and milestone commit workflow

- **Calm functional naming:** **Cairn**, **Relay**, **Builders**, **Researchers**, **Connectors**, and **Notifiers**, with zero references to entertainment franchises.
- **Personas:** **Rookmere Capital** ([`demo/rookmere.json`](./demo/rookmere.json)) and **AUGI** ([`demo/augi.json`](./demo/augi.json), featuring the interactive Three.js **AUGI Sable 3D Chassis Comparator** with inline analytical assumptions beside results).
- **Milestone commits:** Local commits are authorized at pivotal, reviewable milestones. The parent coordinator verifies checks and commits explicit file lists with `Dominic Phillips` as author and a concise Argon-authored imperative subject (<72 chars) without `Co-Authored-By` or AI footers. No push or deploy is performed unless explicitly instructed.

---

## ADR-07: Top-left console navigation, canonical app names and ports, role-scoped model routing, and SQLite demo runtime (2026-10-25)

- **Date:** 2026-10-25
- **Status:** Active; explicitly supersedes earlier navigation labels and active-tick indicators in `ADR-01` and `ADR-02`, the two-port and early app naming conventions in `ADR-03` and `ADR-06`, the local `agy` development workforce routing in `ADR-04`, and any implied live model execution in the local demo while preserving the intended hosted production architecture.
- **Console navigation and editorial surfaces (supersedes `ADR-01` and `ADR-02` navigation details):**
  - Top-left navigation uses the exact labels `Build`, `Ingest`, `Apps`, and `Activity` without an active-state tick marker.
  - Layout reference [`09-tactical-gear-landing-page-anorent.png`](./inspiration/references/dribbble/09-tactical-gear-landing-page-anorent.png), system mockup [`03-system-c.png`](./inspiration/mockups/03-system-c.png) (with the navigation tick removed), wordmark [`02-wordmark.png`](./inspiration/logos/02-wordmark.png), and vector [`heavy-rain-wordmark.svg`](./design/brand/heavy-rain-wordmark.svg) remain the visual anchors. Research references and generated synthetic employee portraits belong under `./inspiration/`.
  - `Ingest` pairs synthetic employee avatars and verbatim quotes with the recurring task need and routing decision. `Build` displays a smoky blurred canvas with worker quote bubbles and a manual release-approval gate. `Apps` pairs each organization app with its origin quotes and a concise code or formula illustration, and `Activity` presents the event timeline.
  - Every workflow and app preserves the traceability chain `approved snippets -> weekly work -> evidence and counterevidence -> catalog fit -> decision -> tooling -> verification` ([`./demo/weekly-work-to-apps.md`](./demo/weekly-work-to-apps.md)).
- **Canonical app names and local ports (supersedes `ADR-03` and `ADR-06` app names and port list):**
  - **Heavy Rain Console (`apps/system`):** `http://127.0.0.1:43170` (`npm run dev:system`).
  - **Sable Studio (`apps/augi-engineering`):** `http://127.0.0.1:43171` (`npm run dev:augi`) — AUGI 3D procedural vehicle, cutaway, and flight-concept view.
  - **Sable Balance (`apps/augi-engineering`):** `http://127.0.0.1:43171/?app=balance` — AUGI static 3D mass, center of gravity, and front/rear axle load share view with inline concept units and no flight-dynamics or FEA validation.
  - **Rookmere Close (`apps/rookmere-finance`):** `http://127.0.0.1:43173` (`npm run dev:rookmere`) — Rookmere Capital monthly trial-balance mapping, FX vs operating EBITDA variance, and covenant leverage headroom workbench.
  - **Backend API (`services/relay` + `services/cairn`):** `http://127.0.0.1:43180` (`.venv/bin/python -m relay`).
- **Development workforce and credential boundaries (supersedes `ADR-04` local `agy` workforce rule):**
  - Frontend development routes to Claude CLI (`Fable`) through the `ask_claude` subscription guard with no API-backed Claude fallback.
  - Backend development and troubleshooting route to `Astra`.
  - All UI copy, documentation, product names, prompts, and commit subjects route to Gemini 4 Argon (`gemini-4-argon` at `high` thinking) via `ask_gemini --provider google`, using the separate copy-only Gemini key in `~/.env`.
  - `agy` and the project builder key are never used for copywriting, review, or repository development and remain reserved for the later hosted builder demonstration (the new builder key has passed only an initial `OK` smoke test). Calls never fall back to another model or provider on failure.
  - Subagents never run `git commit`; explicit owner authorization is required to push, open pull requests, or deploy, and existing task/session authorization remains valid.
- **Local backend runtime vs planned hosted builders ([`./backend-api-contract.md`](./backend-api-contract.md)):**
  - The local server on `127.0.0.1:43180` persists SQLite state and applies deterministic fixture rules with no live model inference.
  - `POST /api/v1/orgs/{org_id}/mcp/submit-work-report` is a REST JSON route carrying the `heavyrain_submit_work_report` tool name rather than a standalone MCP transport, and persona headers (`X-HeavyRain-Org-Id`, `X-HeavyRain-Actor-Id`) act as unauthenticated loopback demo selectors.
  - Candidate artifact verification runs real local tar extraction, SHA-256 checks, and TypeScript/Node fixture checks. Release approval records `approved_demo` in SQLite without production deployment or external notifications, and optional live Cairn review stays disabled (`503`) and unverified.
  - The planned hosted production architecture—**Cairn** on `google-antigravity 0.1.22` (`gemini-4-argon` at `high` thinking) and remote **Builders** on Google-hosted `antigravity-preview-09-2026` containers—remains future tense until the hosted builder demo is executed.

---

## Owner Correction and Scoped Implementation Decision (October 25, 2026)

### 1. Owner Correction on Marcus Vance Surface Scope
On October 25, 2026, the product owner reviewed the reduced Marcus Vance transfer screen in [`HeavyRain_BDMD/frontend/src/App.tsx`](../HeavyRain_BDMD/frontend/src/App.tsx) and directed two changes:
- **Remove overlap badge:** Delete the `"68% Shared DNA"` badge element and its `sharedDnaLabel` key from [`HeavyRain_BDMD/frontend/src/App.tsx`](../HeavyRain_BDMD/frontend/src/App.tsx) and [`HeavyRain_BDMD/frontend/src/copy/en.json`](../HeavyRain_BDMD/frontend/src/copy/en.json).
- **Restore substantive persona context and scoping rationale:** Replace the over-pruned view with a single-column white editorial narrative (`760px`–`900px` max width) that explains Marcus Vance's workflow and the reasoning behind the proposed build before the user submits the context transfer:
  1. **Identity header:** Keep `Marcus Vance` (`MV`, `VP, Deal Sourcing & Screening`) with a single `Sample persona` notice and no persona switcher or executive dashboard.
  2. **Concrete use-case story:** Present a short first-person summary of preparing for and following up on 14+ weekly founder calls across Outlook, Affinity CRM, Google Search/News, Claude/Gemini, and Granola as a synthetic example without unverified ROI or time-saved scores.
  3. **Verbatim pre-call prompt:** Display the exact prompt from the synthetic fixture (`"Here are my messy CRM notes from 4 months ago, 3 Google News headlines on VeloceAI, and text from Liam's email. Run my deal screening skill and give me 5 questions to ask."`) with a label naming its purpose.
  4. **Seven numbered workflow rows:** Render all seven steps from the fragmented workflow in flat, self-contained rows (`title`, `tools`, `action`, `reason`) explaining the repeated manual handoffs in plain language.
  5. **Proposed app block (`DealPulse AutoBrief`):** Describe the planned pre-call brief, editable post-call summary with three diligence risks, and reviewable email/CRM update drafts clearly as a proposed app to build rather than an active integration.
  6. **Three rationale items:** Explain why the scope retains existing AI prompts while connecting their inputs, why it prioritizes three diligence risks and follow-up drafts, and why it omits the unused public market comps ticker.
  7. **Pre-filled editable `Context` field:** Pre-fill the protected `Context` textarea with a 120–180-word sandbox build brief matching the narrative when no persisted session exists in `sessionStorage`, while preserving priority for restored drafts or accepted runs and never auto-submitting on page load.

### 2. Scoped `agy` Argon Implementation Override
- Under an explicit owner routing override for this task, the existing `agy` (Gemini 4 Argon) worker session is authorized to update the frontend copy files ([`HeavyRain_BDMD/frontend/src/copy/keys.json`](../HeavyRain_BDMD/frontend/src/copy/keys.json), [`HeavyRain_BDMD/frontend/src/copy/en.json`](../HeavyRain_BDMD/frontend/src/copy/en.json)), the editorial layout ([`HeavyRain_BDMD/frontend/src/App.tsx`](../HeavyRain_BDMD/frontend/src/App.tsx)), the transfer controller ([`HeavyRain_BDMD/frontend/src/transfer/transferContext.ts`](../HeavyRain_BDMD/frontend/src/transfer/transferContext.ts)), and the frontend test suite.
- This override is scoped strictly to `HeavyRain_BDMD/frontend` and includes two functional controller requirements identified during parent review:
  1. Providing a working `consoleUrl` on `HTTP 409` responses so the `Open Heavy Rain` recovery action in `copy.errorConflict` renders an active link.
  2. Enforcing a bounded 30-second fetch timeout that transitions to `ambiguous_error` while retaining the active `idempotency_key` for retry.

- `HeavyRain_BDMD/frontend` remains a lightweight context-capture and handoff client. Clicking `Transfer Context` validates the user-reviewed text and sends `POST /api/v1/orgs/meridian/builds/live` ([`HeavyRain_BDMD/frontend/src/transfer/transferContext.ts`](../HeavyRain_BDMD/frontend/src/transfer/transferContext.ts)) with headers `X-HeavyRain-Org-Id: meridian` and `X-HeavyRain-Actor-Id: marcus`.

- Owner-directed tightening caps the idle page outside Context at 280–340 words and supersedes the 120–180-word default-context target with a 70–95-word budget.

---

## ADR-08: Talos decision-layer naming (work in progress), saved draft design and prompts, unchanged Cairn runtime identifiers, and observed live prototype builder state (2026-10-25)

- **Date:** 2026-10-25
- **Status:** Active; updates product naming for the planned decision coordinator from `Cairn` to **Talos** (**work in progress**) and records the implemented live prototype builder boundary while preserving `ADR-01` through `ADR-07` and the October 25 Marcus Vance surface decision.
- **Canonical naming and explicit work-in-progress status:**
  - The owner named Heavy Rain's broader workflow discovery and decision system **Talos** and directed that it be explicitly labeled **work in progress**.
  - **Heavy Rain** remains the platform name and **Relay** remains the intake and builder-coordination backend name.
- **Saved draft system design, contracts, and prompt specifications:**
  - Draft system design, data contracts, and prompt specifications are saved for future engineering implementation at [`./talos/README.md`](./talos/README.md), [`./talos/system-design.md`](./talos/system-design.md), [`./talos/contracts.md`](./talos/contracts.md), [`./talos/prompts/coordinator.md`](./talos/prompts/coordinator.md), [`./talos/prompts/assess-workflow.md`](./talos/prompts/assess-workflow.md), [`./talos/prompts/review-decision.md`](./talos/prompts/review-decision.md), and [`./talos/prompts/prepare-build.md`](./talos/prompts/prepare-build.md).
  - Saving these documents does not activate Talos at runtime. Current runtime decision dispositions remain `reuse_existing_app`, `build_in_sandbox`, `request_missing_evidence`, and `queued_next_cycle`; the `do_not_build` disposition in [`./talos/contracts.md`](./talos/contracts.md) is a proposed contract extension requiring a future schema and runtime migration.
- **Unchanged `cairn`/`Cairn` runtime identifiers:**
  - Existing Python package and import paths (`services/cairn`, `cairn.*`), classes (`CairnOrchestrator`, `CairnReviewOutput`), `/health` payload fields (`service: "heavy-rain-relay-cairn"`, `cairn`), SSE event types (`cairn_review`), demo fixtures, and the `/api/v1/orgs/{org_id}/batches/review-with-cairn` route retain `cairn`/`Cairn` identifiers for compatibility.
  - Weekly batch evaluation continues to execute deterministic fixture rules (`coordinatorExecution: "deterministic_fixture_rules"`), and optional bounded read-only model review via `google-antigravity==0.1.22` (`services/cairn/cairn/live_review.py`) remains disabled (`liveModelReviewEnabled: false`) in the observed server.
- **Observed live prototype builder and narrator state (`services/relay`):**
  - `services/relay/relay/live_builder.py` implements live remote sandbox builds using the Google Gen AI Python SDK (`client.interactions.create` with `agent="antigravity-preview-09-2026"`, `environment="remote"`, `background=True`, `store=True`), progress polling via `interactions.get`, cancellation, remote file listing/downloading, SQLite run/event persistence, and local static preview serving.
  - `POST /api/v1/orgs/{org_id}/builds/live` accepts an optional `build_mode` (`"flash" | "argon"`): `"flash"` routes to `gemini-3.8-flash` and renders `services/relay/relay/prompts/live_builder.md` (requesting a low-fidelity wireframe scaffold capped at 150,000 bytes), `"argon"` routes to `gemini-4-argon` and renders `services/relay/relay/prompts/live_builder_argon.md` (requesting a high-fidelity interactive application capped at 1,048,576 bytes), and omitting `build_mode` uses `HEAVY_RAIN_BUILDER_MODEL` (default `gemini-3.8-flash` in `LiveBuilderSettings`, observed as `gemini-4-argon` in `/health`) and its matching prompt. The console Start selector (`apps/system/src/copy/live.json`) defaults to `"flash"`, changing the menu option does not start a run until clicked, and retrying an accepted `(org_id, idempotency_key)` keeps the original run's `model` and prompt unchanged.
  - Observed SQLite state includes one earlier completed `gemini-4-argon` run with an artifact and two completed `gemini-3.8-flash` runs with artifacts; these reflect persisted provider/run completion states rather than independent functional verification of the generated prototypes, and no new paid Argon build has been run yet to verify generated-app quality under `live_builder_argon.md`.
  - `services/relay/relay/narrator.py` optionally rewrites brief progress lines via `models.generate_content` (default `gemini-3.8-flash`) and falls back to the original text on failure.
  - Generated build artifacts in both modes are self-contained static HTML/CSS/JS bundles with synthetic sample data standing in for external systems and no external network calls, production deployment, or live third-party integrations.
