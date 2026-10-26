# Heavy Rain product requirements

**Updated:** 2026-10-25
**Audience:** Product, design, UX, and engineering contributors building the Heavy Rain operator console (`apps/system` on `127.0.0.1:43170`), shared UI and 3D packages (`packages/heavy-rain-ui`, `packages/organization-ui`, `packages/organization-3d`), and organization applications (`apps/augi-engineering` on `127.0.0.1:43171` and `apps/rookmere-finance` on `127.0.0.1:43173`).
**Current status (2026-10-25):** **Talos** is the canonical product name for Heavy Rain's planned workflow discovery and decision system (**work in progress**, replacing `Cairn`; see [`./talos/README.md`](./talos/README.md), [`./talos/system-design.md`](./talos/system-design.md), [`./talos/contracts.md`](./talos/contracts.md), and `./talos/prompts/`). Weekly batch routing in the running server uses deterministic fixture rules in `services/cairn` (retained as the Python package and route identifier), and optional bounded read-only live review (`google-antigravity==0.1.22`) is disabled (`liveModelReviewEnabled: false`). Live sandbox building is implemented in `services/relay/relay/live_builder.py` (`antigravity-preview-09-2026`, `environment="remote"`), supporting `build_mode: "flash" | "argon"` on `POST /api/v1/orgs/{org_id}/builds/live` (`"flash"` requests a low-fidelity wireframe scaffold on `gemini-3.8-flash` capped at 150,000 bytes; `"argon"` requests a high-fidelity interactive application on `gemini-4-argon` capped at 1,048,576 bytes; both are served as self-contained static HTML/CSS/JS bundles with synthetic sample data for local review, and no new paid Argon build has been run yet to verify generated-app quality under `live_builder_argon.md`). Full multi-package builds against `packages/organization-ui` and `packages/organization-3d` and production deployments remain planned.

---

## 1. Product problem and core value proposition

Employees in technical and financial organizations use Claude, Gemini, and ChatGPT to clean data, check compliance rules, and run recurring calculations in isolated sessions. As a result, teams repeatedly prompt the same workflows every week, overlook existing internal tools, and rely on fragile chat scripts that lack organizational identity, permissions, storage, and audit trails.

**Heavy Rain** turns explicitly reported assistant workflows into governed routing decisions or maintainable internal applications:

- **Explicit MCP capture, never passive chat scraping:** Employees submit work reports via an authenticated Model Context Protocol (MCP) tool (`heavyrain_submit_work_report`) or policy-scoped local hooks after inspecting the exact outgoing payload. Host assistants retain ambient chat history.
- **Reuse before build (planned Talos decision layer, work in progress):** At a weekly cutoff, **Talos** (`services/cairn` in current runtime code) is designed to cluster reports, evaluate the organization's `approved_app_catalog` first, and route employees directly to an existing tool when it fits their task and permissions.
- **Evidence gating before sandbox spend:** When a recurring workflow lacks required schemas or restricted data clearance, **Talos** (`services/cairn`) requests the missing evidence from the domain owner before scheduling any builder compute.
- **Managed sandbox Builders:** When a capability gap justifies a build, **Relay** dispatches a **Builder** on the Google-hosted managed Antigravity agent (`antigravity-preview-09-2026`, `environment="remote"`). In the current implementation (`services/relay/relay/live_builder.py`), `POST /api/v1/orgs/{org_id}/builds/live` accepts `build_mode: "flash" | "argon"` (defaulting to `"flash"` in the operator console Start selector) to request either a low-fidelity wireframe scaffold (`gemini-3.8-flash`, `live_builder.md`, 150,000-byte cap) or a high-fidelity interactive application (`gemini-4-argon`, `live_builder_argon.md`, 1,048,576-byte cap), serving the resulting self-contained static HTML/CSS/JS bundle (`workspace/app/`) with synthetic sample data for local review; the planned production target generates full application bundles against `packages/organization-ui` and `packages/organization-3d`.

---

## 2. System actors and functional roles

| Actor / Component | Type | Responsibility |
| --- | --- | --- |
| **Employee** | Human user | Uses Claude, Gemini, or ChatGPT; previews and submits explicit MCP work reports; receives an intake receipt, direct link to an approved app, missing-evidence prompt, or release notice. |
| **Operator / Release Reviewer** | Human admin / domain lead | Reviews weekly recurrence clusters in `apps/system`, authorizes sandbox builds or restricted data scopes, monitors active **Builder** checkpoints (with Pause/Resume control), and approves release promotion. |
| **Relay** | Central coordination service | Receives authenticated MCP submissions, validates policy/redaction rules, issues intake receipts, polls managed `antigravity-preview-09-2026` builder interactions (`background=True`, `store=True`), downloads verified workspace artifacts via `environments.files.download`, and dispatches notifications. |
| **Talos** (legacy code/route identifier: `Cairn` / `services/cairn`) | Planned weekly coordinator (`google-antigravity 0.1.22`, `gemini-4-argon`, `high` thinking; **work in progress**) | Planned to cluster recurring reports, compare against `approved_app_catalog`, and select `reuse_existing_app`, `request_missing_evidence`, `build_in_sandbox`, or `queued_next_cycle` (plus proposed `do_not_build` in [`./talos/contracts.md`](./talos/contracts.md)). Current runtime executes deterministic fixture rules in `services/cairn` with optional live review disabled. |
| **Builders** | Managed production sandbox agents (`antigravity-preview-09-2026`, `environment="remote"`, `model="gemini-4-argon"`) | Execute in Google-hosted Linux sandboxes to assemble, typecheck, and test organization applications built on `packages/organization-ui` and `packages/organization-3d`, producing downloadable artifact bundles for release review. |
| **Researchers & Connectors** | Scoped worker agents | Inspect internal catalog capabilities, documentation, and input/output file schemas without mutating production data. |
| **Notifiers** | Delivery worker agents | Send targeted direct-reuse links, missing-evidence requests, and verified deployment announcements. |
| **Development Workforce (`agy`)** | Local contributor CLI (`agy --model gemini-4-argon-high --effort high`) | Used by contributors and parent orchestration to build and verify this repository's packages, UIs, and documentation. |

---

## 3. End-to-end workflow and UX state invariants

### 3.1 Twelve-stage operational flow
`Employee capture -> Exact outgoing content review -> Submission receipt -> Weekly cutoff -> Recurrence grouping -> Catalog match -> Reuse / Build / Need Evidence -> Sandbox work -> Preview & checks -> Release-specific review -> Verified deployment -> Notification -> App use & feedback`

1. **Distinct consent and authorization gates:** Keep *evidence submission consent* (employee payload preview), *sandbox build authorization* (domain/tech lead approval), and *production release review* (human verification before catalog promotion) distinct. When Talos (`services/cairn` in current code) matches a task cluster to an existing approved app within the employees' current role permissions, Relay routes them directly without inserting an extra approval gate.
2. **Orthogonal states:** Keep batch schedule state (`collecting`, `cutoff_locked`, `evaluated`), builder interaction state (`queued`, `in_progress`, `requires_action`, `completed`, `incomplete`, `failed`, `cancelled`), app release state (`sandbox_preview`, `pending_release_review`, `deployed_approved`), notification state (`queued`, `sent`), and data freshness (`live_runtime`, `cached_snapshot`, `demo_fixture_replay`) distinct. Receipts confirm intake only, never completed work.
3. **Observable traces without fabricated thoughts:** Display task assignments, tool inputs/outputs, interaction/environment IDs, and concise decision summaries. Never expose or invent internal chain-of-thought.

---

## 4. First-class organization personas and workflows

### 4.1 Rookmere Capital ([`demo/rookmere.json`](./demo/rookmere.json))
- **Profile:** Fictional European lower mid-market private equity firm (`org_rookmere`) with **32 total staff** (12 named employee fixtures), **2 funds** (**EUR 480m** *Rookmere Industrial Growth III* and **EUR 720m** *Rookmere Industrial Growth IV*), and **8 active portfolio companies** (4 full financial/ERP/FX/covenant fixtures: *Kelvion Flow Systems GmbH*, *Varn Precision Optics AB*, *Solvay Grid Controls B.V.*, *Nordic ColdChain Logistics AS*; 4 summary fixtures).
- **Weekly batch outcomes (`batch_rm_2026_w43`):**
  1. **Commissioned build (`pat_rm_01`):** **Rookmere Portfolio Variance Workbench** (`app_rm_variance_workbench`) to normalize monthly ERP trial balances, decompose SEK/NOK/GBP FX translation vs operational variance, and flag maintenance covenant headroom (such as Nordic ColdChain at `3.60x` vs its `3.75x` cap).
  2. **Direct catalog reuse (`pat_rm_02`):** Routes deal associates directly to the approved **Diligence Request List & Q&A Tracker** (`app_rm_diligence_tracker`).
  3. **Missing-evidence hold (`pat_rm_03`):** Holds the **LP Side-Letter MFN & Co-Invest Obligation Matrix** until General Counsel (`emp_rm_11`) supplies an approved anonymized clause schema under `lp_restricted_side_letters`.

### 4.2 AUGI and the AUGI Sable 3D Chassis Comparator ([`demo/augi.json`](./demo/augi.json))
- **Profile:** Fictional electric vehicle manufacturer (`org_augi`) engineering the **AUGI Sable** (`prog_augi_sable`), an 800V premium electric SUV at Gate C2, with 8 named engineers, 3 approved catalog apps, and 3 recurring workflows.
- **Weekly batch outcomes (`batch_augi_2026_w43`):**
  1. **Commissioned build (`wf_augi_01` -> `apps/augi-engineering`):** **AUGI Sable 3D Chassis Architecture Comparator** (`app_augi_sable_chassis_3d`), built on `packages/organization-ui` (`augi-graphite-atelier` theme) and `packages/organization-3d` (Three.js `^0.186.1`).
  2. **Direct catalog reuse (`wf_augi_02`):** Routes BIW engineers to the **BIW Mixed-Material Joining & Adhesive Registry** (`app_augi_fastener_weld_matrix`).
  3. **Missing-evidence hold (`wf_augi_03`):** Holds the **Rear Megacasting Porosity Estimator** pending an NDA-sanitized runner geometry schema.
- **3D comparator requirements (`apps/augi-engineering` on `127.0.0.1:43171`):**
  - **Interactive browser 3D geometry:** Orbit, pan, zoom, tilt, camera presets, part selection, spatial measurement, and reset view over three baseline concept configurations: **`SABLE-A`** (modular `6082-T6` multi-extrusion, `142` parts, `384 kg`, `34.2 kN·m/deg` torsional stiffness), **`SABLE-B`** (Cell-to-Body + `22MnB5` boron torque rings, `86` parts, `356 kg`, `44.6 kN·m/deg`), and **`SABLE-C`** (front/rear HPDC `AlSi7Mg` megacastings + CTB pack, `31` parts, `338 kg`, `49.8 kN·m/deg`).
  - **Parametric controls & load cases:** Wheelbase (`2920–3160 mm`), front/rear track (`1640–1750 mm`), rocker wall gauge (`2.2–4.5 mm`), and material selection across *Static Axle-Twist Torsion (`18,000 N·m`)*, *Symmetric 3-Point Vertical Bending (`32,000 N`)*, and *Quasi-Static Cornering Subframe Shear (`24,000 N`)*.
  - **Inline model limitation disclosure:** Placed directly beside stiffness and deflection figures (not a page-wide warning), stating that numbers are analytical beam-and-shell concept approximations (`mm`, `kg`, `kN·m/deg`) with visual deformation amplification (`45x–60x`) and make no finite-element solver, physical rig, or crashworthiness certification claims.

---

## 5. Operator console (`apps/system` on `127.0.0.1:43170`) layout requirements

Anchored on [`09-tactical-gear-landing-page-anorent.png`](./inspiration/references/dribbble/09-tactical-gear-landing-page-anorent.png), selected first-build mockup [`03-system-c.png`](./inspiration/mockups/03-system-c.png), and final wordmark [`02-wordmark.png`](./inspiration/logos/02-wordmark.png):

1. **Tactile left vertical navigation:** `System`, `Work`, `Apps`, and `Activity` with softly faded inactive labels, an active dark tick indicator, crisp click feedback, and contextual organization/run selection.
2. **Dominant central artifact stage & lower worker dock:** Pale ash and rain-dark topographic surfaces where the central stage displays the active cluster, smoky blurred build preview (while checkpoints run), or sharp verified preview, with the **worker dock positioned below the central stage** and detailed trace inspection on the side.

---

## 6. Intended multiagent backend vs local fixture-backed prototypes

| Capability | Intended Production Backend | Local Prototype Built in This Repository |
| --- | --- | --- |
| **MCP evidence intake (`Relay`)** | Authenticated MCP endpoints in Claude, Gemini, and ChatGPT transmitting user-previewed reports to **Relay**. | Deterministic MCP report fixtures, SHA-256 hashes, and intake receipts in [`demo/rookmere.json`](./demo/rookmere.json) and [`demo/augi.json`](./demo/augi.json). |
| **Weekly coordinator (`Talos`, work in progress; `services/cairn` runtime)** | Planned Python service on `google-antigravity 0.1.22` (`gemini-4-argon`, `high` thinking, `1,048,576` shared token ceiling) per [`./talos/system-design.md`](./talos/system-design.md). | Deterministic fixture rules in `services/cairn` (`coordinatorExecution: "deterministic_fixture_rules"`). An optional bounded read-only review path using `google-antigravity==0.1.22` (`services/cairn/cairn/live_review.py`) exists in code and is disabled (`liveModelReviewEnabled: false`). |
| **Production Builders (`Builders`)** | Google-hosted managed agent (`antigravity-preview-09-2026`, `environment="remote"`, `model="gemini-4-argon"`, `background=True`, `store=True`) assembling full organization apps with artifact export via `environments.files.download`. | Two paths in this repo: (1) deterministic checkpoint replay in `apps/system`, and (2) an active live sandbox builder in `services/relay/relay/live_builder.py` (`liveBuilderEnabled: true`, observed `liveBuilderModel: "gemini-4-argon"`, default `gemini-3.8-flash`) that calls `antigravity-preview-09-2026` (`environment="remote"`), accepts `build_mode: "flash" | "argon"` (`"flash"` on `gemini-3.8-flash` for a 150,000-byte scaffold via `live_builder.md`; `"argon"` on `gemini-4-argon` for a 1,048,576-byte interactive app via `live_builder_argon.md`), downloads `workspace/app/` files, and serves a self-contained static HTML/CSS/JS bundle with synthetic sample data locally for human review (with optional `models.generate_content` progress narration in `services/relay/relay/narrator.py`). |
| **Organization apps & 3D toolkit** | Promoted artifact bundles served on the organization portal (`apps.rookmere.example`, `apps.augi.example`). | Running local Vite + React + TypeScript + Three.js workspaces (`packages/heavy-rain-ui`, `packages/organization-ui`, `packages/organization-3d`, `apps/system` on `:43170`, `apps/augi-engineering` on `:43171`). |
