# Heavy Rain

Heavy Rain is an internal tool platform for teams working across AI assistants. Employees submit explicitly reviewed AI workflow reports through **Relay** (intake and builder coordination). When a build is commissioned, **Relay** can launch a live sandbox build through the Google Gen AI Python SDK (`antigravity-preview-09-2026`, `environment="remote"`)—requesting either a quick `Flash` wireframe scaffold (`gemini-3.8-flash`) or an `Argon` high-fidelity interactive application (`gemini-4-argon`)—and serve the resulting self-contained static HTML/CSS/JS bundle locally for human review.

**Talos** (**work in progress**, replacing the earlier `Cairn` product name) is Heavy Rain's planned workflow discovery and decision system for grouping repeated weekly work, checking the approved application catalog first, and routing each recurring need to reuse an existing catalog app, request missing schema or scope evidence, commission a sandbox build, defer to the next cycle, or decline a build. In the current repository, weekly routing runs deterministic fixture rules in `services/cairn` (retained as the Python package and API identifier for compatibility).

Every workflow follows the traceability chain `approved snippets -> weekly work -> evidence and counterevidence -> catalog fit -> decision -> tooling -> verification` ([`__grounding/demo/weekly-work-to-apps.md`](./__grounding/demo/weekly-work-to-apps.md)). All people, avatars, verbatim quotes, organizations (**AUGI** and **Rookmere Capital**), and figures in this demo are synthetic.

## Talos workflow discovery and decision system (work in progress)

**Talos** is **work in progress**. Autonomous workflow discovery and model-driven weekly routing are not active in the running server; weekly batch evaluation currently executes deterministic fixture rules (`coordinatorExecution: "deterministic_fixture_rules"`), and the optional bounded read-only model review path (`google-antigravity==0.1.22` in `services/cairn/cairn/live_review.py`) is disabled (`liveModelReviewEnabled: false`). Saved draft architecture, schemas, and prompts for engineers implementing Talos later live in:

- [`__grounding/talos/README.md`](./__grounding/talos/README.md) — Talos overview, work-in-progress scope, and `services/cairn` compatibility boundaries.
- [`__grounding/talos/system-design.md`](./__grounding/talos/system-design.md) — Planned clustering, catalog-fit evaluation, evidence gating, and builder handoff design.
- [`__grounding/talos/contracts.md`](./__grounding/talos/contracts.md) — Draft data contracts and migration notes (including the proposed `do_not_build` disposition alongside the current `reuse_existing_app`, `build_in_sandbox`, `request_missing_evidence`, and `queued_next_cycle` outcomes).
- [`__grounding/talos/prompts/coordinator.md`](./__grounding/talos/prompts/coordinator.md), [`__grounding/talos/prompts/assess-workflow.md`](./__grounding/talos/prompts/assess-workflow.md), [`__grounding/talos/prompts/review-decision.md`](./__grounding/talos/prompts/review-decision.md), and [`__grounding/talos/prompts/prepare-build.md`](./__grounding/talos/prompts/prepare-build.md) — Draft operational prompts saved for future integration.

## Run the local demo

Requires Node.js `^22.18.0 || >=24.0.0`, npm `>=10.0.0`, and Python `>=3.11`.

```sh
npm install
python3 -m venv .venv
.venv/bin/pip install -e services/cairn -e services/relay pytest
.venv/bin/python -m relay
```

In separate terminals, start any frontend preview servers that are not already running (keep running preview servers active):

```sh
npm run dev:system
npm run dev:augi
npm run dev:rookmere
```

- **Heavy Rain Console (`apps/system`):** `http://127.0.0.1:43170`
- **Sable Studio (`apps/augi-engineering`):** `http://127.0.0.1:43171`
- **Sable Balance (`apps/augi-engineering`):** `http://127.0.0.1:43171/?app=balance`
- **Rookmere Close (`apps/rookmere-finance`):** `http://127.0.0.1:43173`
- **Backend API (`Relay` + `Cairn`):** `http://127.0.0.1:43180`

Validate boundaries, types, builds, and tests from the repository root:

```sh
npm run check:boundaries && npm run typecheck && npm run test && npm run build
.venv/bin/pytest tests/backend
```

## Console views and organization apps

The console places `Build`, `Ingest`, `Apps`, and `Activity` at the top left without an active-state marker. `Ingest` pairs synthetic avatars and verbatim quotes with the recurring need and routing decision. `Build` shows a smoky blurred canvas with worker quote bubbles and a manual approval gate. `Apps` includes each tool's origin quotes and a code or formula illustration, and `Activity` tracks the event timeline.

Organization apps also display their origin quotes and keep concept units and analytical limits beside numbers:

- **Sable Studio** (`43171`) — Procedural 3D vehicle, cutaway, and flight-concept view comparing `SABLE-A`, `SABLE-B`, and `SABLE-C` geometry and gauge tradeoffs.
- **Sable Balance** (`43171/?app=balance`) — 3D mass and balance view computing static center of gravity and front/rear axle load shares with no flight-dynamics or FEA validation.
- **Rookmere Close** (`43173`) — Trial-balance mapping, FX vs operating EBITDA variance, and covenant leverage headroom workbench.

## Architecture, local backend limits, and packages

The local server on `127.0.0.1:43180` persists SQLite state and separates live prototype building from deterministic demo routing:

- **Live sandbox builder and build modes (`services/relay/relay/live_builder.py`):** Enabled in the observed local server (`liveBuilderEnabled: true`, `liveBuilderModel: "gemini-4-argon"` in `/health`; `LiveBuilderSettings` defaults to `gemini-3.8-flash` in code). In the console, the `Build mode` dropdown beside `Start` (`apps/system/src/copy/live.json`) defaults to `Flash · Quick scaffold` (`Start with Flash`) and can be switched to `Argon · High-fidelity app` (`Start with Argon`); changing the menu selection does not start a build until the operator clicks the start button, which sends an explicit `build_mode` (`"flash" | "argon"`) to `POST /api/v1/orgs/{org_id}/builds/live`. Explicit `"flash"` routes the remote Antigravity run to `gemini-3.8-flash` with `services/relay/relay/prompts/live_builder.md` (requesting a low-fidelity wireframe scaffold capped at 150,000 bytes across `workspace/app/`); explicit `"argon"` routes to `gemini-4-argon` with `services/relay/relay/prompts/live_builder_argon.md` (requesting a high-fidelity interactive application capped at 1,048,576 bytes across `workspace/app/`). Omitting `build_mode` uses `HEAVY_RAIN_BUILDER_MODEL` and its matching prompt template, and retrying an already accepted `(org_id, idempotency_key)` returns the original run with its initial `model` and prompt unchanged. Relay calls `client.interactions.create` (`agent="antigravity-preview-09-2026"`, `environment="remote"`, `background=True`, `store=True`), polls `interactions.get`, supports cancellation, downloads `workspace/app/` files, records run and event state in SQLite, and serves the static HTML/CSS/JS bundle locally for human review, while `services/relay/relay/narrator.py` optionally rewrites progress lines via `models.generate_content` (default `gemini-3.8-flash`). Observed SQLite state records one earlier completed `gemini-4-argon` run and two completed `gemini-3.8-flash` runs with artifacts; no new paid Argon build has been run yet to verify generated-app quality under `live_builder_argon.md`. Both modes produce self-contained static bundles backed by labeled sample data, forbid external network calls, and do not connect live credentials or deploy to production.
- **Deterministic demo decisions and fixture verification (`services/cairn` and `services/relay`):** Weekly cluster evaluation (`POST /api/v1/orgs/{org_id}/batches/evaluate`) applies deterministic fixture rules (`coordinatorExecution: "deterministic_fixture_rules"`), while the broader **Talos** decision system remains work in progress ([`__grounding/talos/README.md`](./__grounding/talos/README.md)). Optional bounded read-only live review (`google-antigravity==0.1.22` via `/review-with-cairn`) is disabled (`liveModelReviewEnabled: false`). `POST /api/v1/orgs/{org_id}/mcp/submit-work-report` is a REST JSON route carrying `heavyrain_submit_work_report` (no standalone MCP transport runs in this demo), persona headers (`X-HeavyRain-Org-Id`, `X-HeavyRain-Actor-Id`) act as unauthenticated loopback selectors, fixture candidate verification performs local tar extraction, SHA-256 checks, and TypeScript/Node fixture checks, and release approval records `approved_demo` without deployment or external notifications.

`npm run check:boundaries` enforces three React/TypeScript/Three.js packages (no `shadcn/ui`): `packages/heavy-rain-ui` (`apps/system` only), `packages/organization-ui` (shared organization controls), and `packages/organization-3d` (reusable 3D toolkit, keeping domain math inside each app). Research and generated persona images live in `__grounding/inspiration/`.

See [`CONTRIBUTING.md`](./CONTRIBUTING.md), [`AGENTS.md`](./AGENTS.md), [`naming.md`](./naming.md), [`copy.md`](./copy.md), [`__grounding/README.md`](./__grounding/README.md), [`__grounding/talos/README.md`](./__grounding/talos/README.md), [`__grounding/product.md`](./__grounding/product.md), [`__grounding/architecture.md`](./__grounding/architecture.md), [`__grounding/backend-api-contract.md`](./__grounding/backend-api-contract.md), and [`__grounding/decisions.md`](./__grounding/decisions.md).
