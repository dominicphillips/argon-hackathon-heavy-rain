# Heavy Rain

Heavy Rain is an organization-deployed multiagent system for teams whose employees work across Claude, Gemini, and ChatGPT. Rather than passively scraping employee chat history, Heavy Rain collects explicitly submitted work reports and approved schema evidence through an authenticated Model Context Protocol (MCP) connector and optional policy-scoped local hooks.

At a weekly cutoff, the **Cairn** coordinator (built on `google-antigravity 0.1.22` with **Gemini 4 Argon** at `high` thinking) and **Relay** central service cluster recurring tasks across the organization, check the organization's approved application catalog first, and take one of three actions:

1. **Route to an existing approved app** when a catalog tool already fits the task within the employee's current permissions.
2. **Request missing evidence or scope approval** when required schemas or restricted data clearances are absent.
3. **Commission a managed sandbox build** when a verified capability gap warrants a focused internal tool—dispatching the Google-hosted managed Antigravity agent (`antigravity-preview-09-2026`, `environment="remote"`, `agent_config={"type": "antigravity", "model": "gemini-4-argon"}`) to build against a shared organizational UI, 3D visualization, authentication, permission, storage, and audit baseline (`packages/organization-ui` and `packages/organization-3d`).

---

## Local quickstart and workspace commands

This repository is a Node.js (`^20.19.0 || >=22.12.0`) and npm (`>=10.0.0`) workspace containing the grounding specifications, synthetic organization fixtures, shared UI/3D packages, and local prototype applications.

```sh
# Install workspace dependencies
npm install

# Run the Heavy Rain operator console at http://127.0.0.1:43170 (--strictPort)
npm run dev:system

# Run the AUGI Sable 3D chassis comparator at http://127.0.0.1:43171 (--strictPort)
npm run dev:augi

# Verify UI package import boundaries, TypeScript types, unit tests, and builds
npm run check:boundaries
npm run typecheck
npm run test
npm run build
```

Keep local preview servers running on `http://127.0.0.1:43170` (`apps/system`) and `http://127.0.0.1:43171` (`apps/augi-engineering`) during development unless asked to stop them.

---

## Example workflows across Rookmere Capital and AUGI

Every workflow follows a 12-stage path from employee capture to verified release:

`Employee capture -> Outgoing payload review -> Submission receipt -> Weekly cutoff -> Recurrence grouping -> Catalog match -> Reuse / Build / Need Evidence -> Sandbox work -> Preview & checks -> Release review -> Verified deployment -> Notification & app use`

| Disposition | Rookmere Capital (Private Equity Persona) | AUGI (Electric Vehicle Engineering Persona) |
| --- | --- | --- |
| **1. Reuse existing app (direct routing)** | Deal associates merging advisor diligence request lists (`pat_rm_02`) are routed directly to the approved **Diligence Request List & Q&A Tracker** (`app_rm_diligence_tracker`) with no extra approval gate. | Body-in-White engineers checking aluminum-to-`22MnB5` boron steel rivet and adhesive rules (`wf_augi_02`) are routed directly to the **BIW Mixed-Material Joining & Adhesive Registry** (`app_augi_fastener_weld_matrix`). |
| **2. Request missing evidence (held before sandbox spend)** | Investor Relations and Compliance reports on LP side-letter MFN checks (`pat_rm_03`) are held until General Counsel supplies an anonymized clause schema and `lp_restricted_side_letters` scope sign-off. | Casting engineers requesting a rear shock-tower flow-length porosity check (`wf_augi_03`) are held until an NDA-sanitized runner geometry schema is approved. |
| **3. Commission managed sandbox build (`antigravity-preview-09-2026`)** | Five staff across deal teams, operating partners, and fund finance reconciling monthly ERP trial balances, SEK/NOK/GBP FX bridges, and covenant headroom (`pat_rm_01`) trigger a build of the **Rookmere Portfolio Variance Workbench** (`app_rm_variance_workbench`). | Six engineers comparing skateboard architectures under torsion and bending (`wf_augi_01`) trigger a build of the interactive **AUGI Sable 3D Chassis Architecture Comparator** (`apps/augi-engineering`). |

---

## Intended backend vs local fixture-backed prototypes

| Area | Intended Production Architecture | Local Prototype in This Repository |
| --- | --- | --- |
| **Employee work capture** | Authenticated custom MCP server connected to Claude Desktop/Web, Gemini Workspace, and ChatGPT Enterprise, with mandatory outgoing payload inspection. | Deterministic MCP report fixtures, SHA-256 attachment metadata, and intake receipts in [`__grounding/demo/rookmere.json`](./__grounding/demo/rookmere.json) and [`__grounding/demo/augi.json`](./__grounding/demo/augi.json). |
| **Weekly coordinator (`Cairn`)** | Python service on `google-antigravity==0.1.22` running `gemini-4-argon` (`high` thinking) within its unified `1,048,576`-token window (`65,536` sync output cap; Long Decode via `GeminiModelOptions.max_output_tokens`). | Grounded against primary docs in [`__grounding/sdk-research.md`](./__grounding/sdk-research.md); `apps/system` (`127.0.0.1:43170`) replays W43 clustering and routing decisions deterministically. |
| **Production Builders (`Builders`)** | Google-hosted managed Antigravity agent (`antigravity-preview-09-2026`, `environment="remote"`, `agent_config={"type": "antigravity", "model": "gemini-4-argon"}`, `background=True`, `store=True`), polled across `queued`/`in_progress` until `completed`, exporting files via `environments.files.download` (`GET /v1beta/environments/{env_id}/files?alt=media`). | Simulated in `apps/system` with interactive checkpoint progression, smoky blurred in-progress previews, sharp `Pause`/inspector controls, and release review without calling paid remote containers on UI replay. Local `agy` (`--model gemini-4-argon-high --effort high`) serves as the repository's development workforce. |
| **AUGI Sable 3D Chassis Comparator** | Generated by managed Argon Builders from parametric engineering envelopes and promoted after release review. | Running local Vite + React + TypeScript + Three.js application (`apps/augi-engineering` on `127.0.0.1:43171`) with orbit/pan/zoom/tilt/reset controls, 3 baseline concept chassis (`SABLE-A`, `SABLE-B`, `SABLE-C`), wheelbase/track/gauge/material tuning, animated torsion/bending/lateral load cases, and inline analytical limitation disclosures. |

---

## Architecture and UI package boundaries

- **Relay & Cairn:** **Relay** manages intake receipts, policy enforcement, managed builder polling (`interaction_id` + `environment_id`), artifact persistence (before the 15-minute idle snapshot / 7-day container expiration), audit logs, and targeted notifications. **Cairn** orchestrates weekly evaluation on `google-antigravity 0.1.22`.
- **Visual design (`03-system-c.png` & `02-wordmark.png`):** Anchored on [`09-tactical-gear-landing-page-anorent.png`](./__grounding/inspiration/references/dribbble/09-tactical-gear-landing-page-anorent.png), first-build mockup [`03-system-c.png`](./__grounding/inspiration/mockups/03-system-c.png), and final wordmark [`02-wordmark.png`](./__grounding/inspiration/logos/02-wordmark.png)—pale ash and rain-dark topographic surfaces, softly faded inactive left navigation (`System`, `Work`, `Apps`, `Activity`) with an active dark tick and click feedback, dominant central artifact stage with smoky blurred build preview, and a worker dock below the stage.
- **Three-package separation (enforced by `npm run check:boundaries`):**
  1. `packages/heavy-rain-ui` (`@heavy-rain/system-ui`) — Operator console components for `apps/system` only.
  2. `packages/organization-ui` (`@heavy-rain/organization-ui`) — Shared visual controls, identity/permission chrome, tables, and organization themes (`rookmere-ash-ledger`, `augi-graphite-atelier`) for organization apps.
  3. `packages/organization-3d` (`@heavy-rain/organization-3d`) — Reusable 3D renderer, camera/navigation, part selection, spatial measurement, and deformation/assembly animation toolkit, kept distinct from domain models, `packages/organization-ui`, and `packages/heavy-rain-ui`.

---

## Synthetic organization contexts

All organization entities, employees, funds, portfolio companies, and vehicle engineering figures are invented demonstration fixtures:

1. **Rookmere Capital ([`__grounding/demo/rookmere.json`](./__grounding/demo/rookmere.json)):** Fictional lower mid-market European private equity firm with **32 staff** (12 named employee fixtures), **2 funds** (**EUR 480m** *Rookmere Industrial Growth III* and **EUR 720m** *Rookmere Industrial Growth IV*), **8 active portfolio companies** (4 detailed fixtures), 4 approved catalog apps, 8 recurring task patterns, and weekly batch `batch_rm_2026_w43`.
2. **AUGI ([`__grounding/demo/augi.json`](./__grounding/demo/augi.json)):** Fictional electric vehicle manufacturer engineering the **AUGI Sable** 800V premium electric SUV (`prog_augi_sable`), with 8 named engineers, 3 approved catalog apps, 3 recurring workflows, and 3 baseline concept chassis configurations (`SABLE-A` modular multi-extrusion, `SABLE-B` Cell-to-Body + `22MnB5` boron torque rings, and `SABLE-C` front/rear HPDC `AlSi7Mg` megacastings + CTB pack). Stiffness (`kN·m/deg`, `kN/mm`), mass (`kg`), and deflection (`mm`) outputs are analytical beam-and-shell concept approximations with documented equations and inline limitation disclosures—never certified finite-element analysis or crashworthiness claims.

---

## Repository navigation

- [`AGENTS.md`](./AGENTS.md) & [`CONTRIBUTING.md`](./CONTRIBUTING.md) — Contributor rules, workspace scripts, persistent preview ports (`43170`, `43171`), model routing, and milestone commit guidelines.
- [`__grounding/README.md`](./__grounding/README.md) — Index of all grounding specifications, fixtures, design/UX handoffs, and dated external citations.
- [`__grounding/product.md`](./__grounding/product.md) — Product requirements, actor responsibilities, 12-stage workflow invariants, and persona specifications.
- [`__grounding/architecture.md`](./__grounding/architecture.md) — System topology, MCP explicit capture, access/consent policies, reuse-first gating, managed `antigravity-preview-09-2026` Builder lifecycle, and three-package UI/3D baseline.
- [`__grounding/sdk-research.md`](./__grounding/sdk-research.md) — Primary source grounding (2026-10-25) for managed `antigravity-preview-09-2026` (`AntigravityAgentConfig`, `environments.files.download`), `google-antigravity 0.1.22`, `agy` CLI, and Gemini 4 Argon's shared 1M token window and Long Decode behavior.
- [`__grounding/decisions.md`](./__grounding/decisions.md) — Architectural and visual decisions (ADR-01 through ADR-06).
- [`__grounding/demo/rookmere.json`](./__grounding/demo/rookmere.json) & [`__grounding/demo/augi.json`](./__grounding/demo/augi.json) — Synthetic fixtures for Rookmere Capital and AUGI.
- [`__grounding/design/`](./__grounding/design/), [`__grounding/ux/`](./__grounding/ux/), & [`__grounding/inspiration/`](./__grounding/inspiration/) — Visual design specs, SVG brand marks (`heavy-rain-mark.svg`, `rookmere-capital.svg`, `augi-mark.svg`), UX journeys, Mermaid diagrams, and selected mockups (`03-system-c.png`, `02-wordmark.png`).
- `packages/heavy-rain-ui/`, `packages/organization-ui/`, & `packages/organization-3d/` — Bespoke operator UI, organization UI, and reusable 3D visualization packages.
- `apps/system/` & `apps/augi-engineering/` — Vite + React + TypeScript prototype applications for the Heavy Rain operator console (`:43170`) and the AUGI Sable 3D Chassis Comparator (`:43171`).
