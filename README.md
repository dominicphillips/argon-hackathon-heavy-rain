# Heavy Rain

Heavy Rain is an internal tool platform for teams working across AI assistants. Employees submit approved weekly AI chat excerpts through **Relay** (intake). **Cairn** (the coordinating brain) groups repeated work, checks the approved application catalog first, and routes each recurring need to one of three outcomes: reuse an existing catalog app, request missing schema or scope evidence, or commission a sandbox build.

Every workflow follows the traceability chain `approved snippets -> weekly work -> evidence and counterevidence -> catalog fit -> decision -> tooling -> verification` ([`__grounding/demo/weekly-work-to-apps.md`](./__grounding/demo/weekly-work-to-apps.md)). All people, avatars, verbatim quotes, organizations (**AUGI** and **Rookmere Capital**), and figures in this demo are synthetic.

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

The local server on `127.0.0.1:43180` persists SQLite state and applies deterministic fixture rules with no live model inference. `POST /api/v1/orgs/{org_id}/mcp/submit-work-report` is a REST JSON route that carries the `heavyrain_submit_work_report` tool name; no standalone MCP transport runs in this demo. Persona headers (`X-HeavyRain-Org-Id`, `X-HeavyRain-Actor-Id`) are unauthenticated demo selectors. Candidate verification performs real local tar extraction, SHA-256 checks, and TypeScript/Node fixture checks. Release approval records `approved_demo` without deployment or external notifications, and optional live Cairn review stays disabled and unverified. In the planned hosted architecture, Cairn (`google-antigravity 0.1.22`) will coordinate weekly evaluation and Relay will dispatch Google-hosted `antigravity-preview-09-2026` builders; the new builder key has passed only an initial `OK` smoke test with no hosted build executed.

`npm run check:boundaries` enforces three React/TypeScript/Three.js packages (no `shadcn/ui`): `packages/heavy-rain-ui` (`apps/system` only), `packages/organization-ui` (shared organization controls), and `packages/organization-3d` (reusable 3D toolkit, keeping domain math inside each app). Research and generated persona images live in `__grounding/inspiration/`.

See [`CONTRIBUTING.md`](./CONTRIBUTING.md), [`AGENTS.md`](./AGENTS.md), [`naming.md`](./naming.md), [`copy.md`](./copy.md), [`__grounding/README.md`](./__grounding/README.md), [`__grounding/product.md`](./__grounding/product.md), [`__grounding/architecture.md`](./__grounding/architecture.md), [`__grounding/backend-api-contract.md`](./__grounding/backend-api-contract.md), and [`__grounding/decisions.md`](./__grounding/decisions.md).
