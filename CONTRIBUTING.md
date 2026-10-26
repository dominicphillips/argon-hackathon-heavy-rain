# Contributing to Heavy Rain

## 1. Read grounding and writing rules first

Before editing code or copy, read [`AGENTS.md`](./AGENTS.md), [`copy.md`](./copy.md), [`naming.md`](./naming.md), [`__grounding/README.md`](./__grounding/README.md), [`__grounding/product.md`](./__grounding/product.md), [`__grounding/architecture.md`](./__grounding/architecture.md), [`__grounding/backend-api-contract.md`](./__grounding/backend-api-contract.md), and [`__grounding/decisions.md`](./__grounding/decisions.md).

- Keep the traceability chain intact (`approved snippets -> weekly work -> evidence and counterevidence -> catalog fit -> decision -> tooling -> verification` in [`__grounding/demo/weekly-work-to-apps.md`](./__grounding/demo/weekly-work-to-apps.md)).
- Store visual references and generated synthetic persona portraits under `__grounding/inspiration/`.
- Update documentation and repository instructions whenever owner decisions change.

## 2. Local setup and persistent preview ports

Requires Node.js (`^22.18.0 || >=24.0.0`), npm (`>=10.0.0`), and Python (`>=3.11`).

Install workspace dependencies and set up the Python virtual environment from the repository root:

```sh
npm install
python3 -m venv .venv
.venv/bin/pip install -e services/cairn -e services/relay pytest
```

Start the backend and frontend dev servers in separate terminals (keep already-running preview servers active unless the owner asks to stop them):

```sh
# Relay + Talos (WIP; services/cairn runtime package) SQLite backend -> http://127.0.0.1:43180
.venv/bin/python -m relay

# Heavy Rain operator console -> http://127.0.0.1:43170
npm run dev:system

# Sable Studio (http://127.0.0.1:43171) and Sable Balance (http://127.0.0.1:43171/?app=balance)
npm run dev:augi

# Rookmere Close -> http://127.0.0.1:43173
npm run dev:rookmere
```

`Relay` persists state in `services/relay/data/heavyrain.sqlite3` (or `HEAVY_RAIN_SQLITE_PATH`). Preserve existing database state during development; do not run destructive reset commands to wipe SQLite files.

## 3. Package separation

`npm run check:boundaries` enforces strict boundaries across the three workspace libraries (built without `shadcn/ui`):

- `packages/heavy-rain-ui` (`@heavy-rain/system-ui`) — Operator console UI imported only by `apps/system`.
- `packages/organization-ui` (`@heavy-rain/organization-ui`) — Shared controls, headers, tables, and themes for organization apps (`apps/augi-engineering`, `apps/rookmere-finance`).
- `packages/organization-3d` (`@heavy-rain/organization-3d`) — Reusable Three.js renderer, camera, part selection, measurement, and animation toolkit. Keep domain math models inside their application workspace.

## 4. Model routing and credential boundaries

- **Frontend engineering:** Route to Claude CLI (`Fable`) through the `ask_claude` subscription guard. Never use API-backed Claude runs or fallback.
- **Backend engineering:** Route to `Astra`.
- **Copy, docs, names, prompts, and commit subjects:** Route to Gemini 4 Argon (`gemini-4-argon` with `high` thinking) via `ask_gemini --provider google`, using the separate copy-only Gemini key in `~/.env`.
- **Reserved builder credentials:** Never use `agy` or the project builder key for copywriting, code review, or repository development. Reserve `agy` and the new builder key for the later hosted builder demonstration (the new builder key has run only an initial `OK` smoke test).
- **Failure handling and secrets:** Do not fall back to another model or provider when a call fails; stop unchanged retries and report blockers directly. Never print, log, or commit `.env` files or API keys.

## 5. Validation and milestone commits

Run all checks from the repository root before handing off work:

```sh
npm run check:boundaries
npm run typecheck
npm run test
npm run build
.venv/bin/pytest tests/backend
```

Report the exact checks executed and any unverified paths (for example, disabled live model review routes). Passing local static and fixture tests does not establish live hosted service behavior.

Commit rules:

- Subagents never run `git commit`.
- The parent coordinator verifies changes and commits explicit file paths (`git commit -m "<subject>" -- <files>`) with `Dominic Phillips` as author.
- Use a Gemini 4 Argon imperative commit subject under 72 characters with no `Co-Authored-By`, `Generated with`, or AI attribution footers.
- Explicit owner authorization is required to push, open pull requests, or deploy; existing task/session authorization remains valid.
