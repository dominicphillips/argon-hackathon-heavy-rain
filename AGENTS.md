Just getting started

# Heavy Rain repository instructions

## 1. Grounding, writing guidance, and visual selections first

1. **Read grounding, writing guidance, and visual decisions before editing code:** Inspect [`copy.md`](./copy.md), `__grounding/README.md`, `__grounding/product.md`, `__grounding/architecture.md`, `__grounding/sdk-research.md`, `__grounding/decisions.md`, `__grounding/design/`, and `__grounding/ux/`. Keep project rules and documentation current whenever owner decisions change.
2. **Writing and prompt discipline ([`copy.md`](./copy.md)):** Apply [`copy.md`](./copy.md) to all UI labels, errors, status updates, documentation, commit messages, and agent prompts. Start with the reader's job, context, and reason to care; lead with the outcome or needed action; use plain verbs, concrete specifics, and verified evidence while preserving genuine uncertainty; keep `accepted`, `queued`, `running`, `completed`, and `deployed` states distinct; make UI copy serve decisions with one primary action and no implementation jargon; use short sentences, focused paragraphs, and flat bullets without promotional slop, patterned opposition (`not X, but Y`), faux Q&A, vague disclaimers, or AI attribution; review via `Brief -> Draft -> Critique -> Revise -> Check` (including read-aloud and units); and write agent prompts as operational specifications defining objective, context boundaries, deliverable schema, verification, and stop conditions.
3. **Permanent example-app traceability rule ([`__grounding/demo/weekly-work-to-apps.md`](./__grounding/demo/weekly-work-to-apps.md)):** Every example application in this repository must be traced end-to-end across: `approved synthetic/consented AI chat snippets -> repeated weekly work -> evidence and counterevidence -> catalog fit -> build / reuse / request-evidence decision -> capabilities and tooling -> verification`. Keep [`__grounding/demo/weekly-work-to-apps.md`](./__grounding/demo/weekly-work-to-apps.md) and the organization fixtures aligned with this chain.
4. **Selected visual anchors:**
   - Spatial layout anchor: `__grounding/inspiration/references/dribbble/09-tactical-gear-landing-page-anorent.png`.
   - First system build design: `__grounding/inspiration/mockups/03-system-c.png`—pale ash and rain-dark surfaces, softly faded inactive left vertical navigation with an active dark tick and crisp click feedback, dominant central artifact stage, smoky blurred build preview with sharp checkpoint/pause controls, and a worker dock beneath the central stage.
   - Final brand wordmark: `__grounding/inspiration/logos/02-wordmark.png` (and `__grounding/design/brand/heavy-rain-mark.svg`), not `04`.
5. **Keep research in `__grounding/`:** Store references and renders in `__grounding/inspiration/`, brand/design specs in `__grounding/design/`, UX flows in `__grounding/ux/`, and synthetic organization fixtures in `__grounding/demo/`. Do not rename `__grounding/` or link to ignored scratch paths in checked-in documentation.

## 2. Frontend stack, package separation, and persistent local ports

1. **Verified workspace stack:** Build with Vite (`^8.3.5`), React (`^19.0.0`), TypeScript (`^7.0.2`), and Three.js (`^0.186.1`). Do not use `shadcn/ui`.
2. **Strict three-package boundary (verified via `npm run check:boundaries`):**
   - `packages/heavy-rain-ui` (`@heavy-rain/system-ui`): Operator console components for `apps/system` only.
   - `packages/organization-ui` (`@heavy-rain/organization-ui`): Shared visual controls, identity/permission headers, audit notices, tables, and organization themes (`rookmere-ash-ledger`, `augi-graphite-atelier`) for organization apps.
   - `packages/organization-3d` (`@heavy-rain/organization-3d`): Reusable 3D WebGL/Three.js toolkit for renderer setup, camera/orbit/pan/zoom/tilt navigation, part selection, spatial measurement, and deformation/assembly animation—kept separate from domain math models, `packages/organization-ui`, and `packages/heavy-rain-ui`.
   - Organization packages and apps (`apps/augi-engineering`, Rookmere tools) must never import `@heavy-rain/system-ui` or `packages/heavy-rain-ui`.
3. **Keep local previews running on fixed high ports:**
   - `apps/system`: `http://127.0.0.1:43170` (`npm run dev:system`, `--host 127.0.0.1 --port 43170 --strictPort`)
   - `apps/augi-engineering`: `http://127.0.0.1:43171` (`npm run dev:augi`, `--host 127.0.0.1 --port 43171 --strictPort`)
   - Preserve running preview processes throughout development unless the owner explicitly asks to stop them.

## 3. Model routing, production builders vs dev workforce, and rate limits

1. **Development workforce (`agy` Argon high):** Run all development subagents, project writing, copy drafting, documentation updates, and commit message authoring through `agy` using `--model gemini-4-argon-high --effort high` with the environment-injected `GEMINI_API_KEY`, following [`copy.md`](./copy.md). Strip `GOOGLE_GEMINI_BASE_URL`, `AGY_ADC_AUTH`, and `GOOGLE_GENAI_USE_VERTEXAI` when spawning workers. Never read, print, or log `.env` files, tokens, or shell history.
2. **Production system architecture:**
   - **Cairn (Orchestrator):** Targets `google-antigravity==0.1.22` on the coordinator runtime with `gemini-4-argon` (`high` thinking, `1,048,576` shared token ceiling, `GeminiModelOptions.max_output_tokens`).
   - **Builders (Production Sandbox Agents):** Target the Google-hosted managed Antigravity agent on the Gemini Interactions API (`agent="antigravity-preview-09-2026"`, `environment="remote"`, `agent_config={"type": "antigravity", "model": "gemini-4-argon"}`, `background=True`, `store=True`), exporting verified workspace files via `environments.files.download` (`GET /v1beta/environments/{env_id}/files?alt=media`). Do not conflate the hosted managed builder with the local `agy` CLI or expose unsupported `thinking_level`/`max_output_tokens` fields in `AntigravityAgentConfig`.
3. **Bounded budgets and `429` staggering:** Push Argon's 3D geometry and visualization capabilities within documented token and spending caps. Stop unchanged failing retries immediately, and stagger secondary background workers behind primary frontend builds if a `429` quota limit occurs.

## 4. Honest demos, observability, and milestone commits

1. **Honest prototype vs backend scope:** Clearly distinguish the intended multiagent backend from the local fixture-backed frontend prototypes. Demo and replay modes must never trigger external notifications or production writes.
2. **Observable traces and inline engineering assumptions:** Show task assignments, tool inputs/outputs, and decision summaries without exposing or fabricating internal chain-of-thought. Place synthetic concept approximations, units, and non-certified scope disclosures directly beside 3D and quantitative readouts.
3. **Milestone commits:** Local commits are authorized at pivotal, reviewable milestones. The parent coordinator verifies checks and commits explicit file paths with `Dominic Phillips` as author and a concise Argon-authored imperative subject (<72 characters) with no `Co-Authored-By`, `Generated with`, or AI attribution footers. Subagent workers do not run `git commit` directly, and no agent may push, open pull requests, or deploy unless explicitly instructed.
