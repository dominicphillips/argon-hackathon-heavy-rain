# Contributing

## Environment setup

Requires Node.js (`^20.19.0 || >=22.12.0`) and npm (`>=10.0.0`).

If `.env` does not exist and you are running `agy` development workers locally, copy `.env.example` to `.env`:

```sh
[ -e .env ] || cp .env.example .env
```

Set `GEMINI_API_KEY` in `.env`. Never print, log, or commit `.env`, API keys, or other credentials. When spawning `agy` workers, strip `GOOGLE_GEMINI_BASE_URL`, `AGY_ADC_AUTH`, and `GOOGLE_GENAI_USE_VERTEXAI` so calls route through the Gemini API key.

## Workspace commands and persistent local previews

Install workspace dependencies from the repository root:

```sh
npm install
```

Start the local prototype applications on their fixed localhost ports (`--strictPort`):

```sh
# Heavy Rain operator console -> http://127.0.0.1:43170
npm run dev:system

# AUGI Sable 3D chassis comparator -> http://127.0.0.1:43171
npm run dev:augi
```

Keep both local preview servers running on `127.0.0.1:43170` and `127.0.0.1:43171` during development unless the project owner asks to stop them.

## Validation checks

Run the workspace verification scripts from the repository root:

```sh
# Assert organization packages/apps never import @heavy-rain/system-ui or packages/heavy-rain-ui
npm run check:boundaries

# Run UI boundary check and TypeScript typechecking across workspaces
npm run typecheck

# Run UI boundary check and workspace unit tests (e.g., AUGI chassis model tests)
npm run test

# Run UI boundary check and production workspace builds
npm run build
```

Report the exact checks you ran and any remaining unverified paths (such as unexecuted live backend calls). Passing local static checks or fixture tests does not establish live hosted service behavior.

## Milestone commits

Commit locally at pivotal, reviewable milestones after verification:

- The parent coordinator verifies the work and commits explicit file paths using `Dominic Phillips` as the Git author (`git commit -m "<subject>" -- <files>`).
- Use a concise, Gemini 4 Argon-authored imperative subject line under 72 characters.
- Omit promotional language, `Co-Authored-By` trailers, `Generated with` lines, and AI attribution footers.
- Do not push, open pull requests, or deploy unless explicitly instructed by the owner.
