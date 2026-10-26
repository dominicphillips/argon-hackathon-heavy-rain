# Heavy Rain grounding index

**Updated:** 2026-10-25
**Purpose:** Central index for product requirements, system architecture, managed Antigravity builder and coordinator SDK research, architectural decisions, synthetic organization fixtures, visual selections, and UX specifications. Read these documents before modifying packages or applications.

---

## 1. Core specification documents

| Document | Subject & Scope |
| --- | --- |
| [`product.md`](./product.md) | Product problem, current implementation status, functional roles (**Talos** planned coordinator [work in progress, `services/cairn` runtime], **Relay**, **Builders**, **Researchers**, **Connectors**, **Notifiers**), 12-stage operational workflow, first-class personas (**Rookmere Capital** and **AUGI**), 3D chassis comparator requirements, and planned backend vs implemented live prototype builder and local fixture scope. |
| [`architecture.md`](./architecture.md) | System topology, current implementation vs planned architecture, explicit MCP work capture, organization access/consent policies, planned **Talos** reuse-first weekly gating (`services/cairn`), implemented live prototype builder and managed **Builders** (`antigravity-preview-09-2026`, `environment="remote"`), `v1beta/environments` artifact download, three-way UI/3D package separation, and persistent local ports (`43170`, `43171`, `43173`, `43180`). |
| [`backend-api-contract.md`](./backend-api-contract.md) | Local FastAPI/SQLite API contract on `127.0.0.1:43180`, **Talos** product naming vs unchanged `cairn`/`Cairn` runtime and route identifiers, live sandbox prototype builder boundary (`services/relay/relay/live_builder.py`), deterministic batch evaluation, and fixture verification routes. |
| [`sdk-research.md`](./sdk-research.md) | Dated primary documentation grounding (retrieved 2026-10-25) for managed `antigravity-preview-09-2026` (`AntigravityAgentConfig`, `background=True`, `store=True`, polling statuses, and `environments.files.download`), coordinator SDK (`google-antigravity 0.1.22`), local `agy` CLI, Gemini 4 Argon token/thinking controls, and a dated status addendum on **Talos** naming and live builder implementation. |
| [`decisions.md`](./decisions.md) | Recorded architectural, visual, and runtime decisions (ADR-01 through ADR-08, plus the October 25 Marcus Vance surface decision), including **Talos** work-in-progress naming, saved draft design/prompts, unchanged `services/cairn` identifiers, and observed live prototype builder state. |
| [`talos/README.md`](./talos/README.md) | Index for **Talos** (planned workflow discovery and decision system, **work in progress**), covering scope, non-activation in the current runtime, and `services/cairn` compatibility. |
| [`talos/system-design.md`](./talos/system-design.md) & [`talos/contracts.md`](./talos/contracts.md) | Saved draft system design and data contracts for **Talos**, including evidence clustering, catalog fit, governance gates, and migration notes for the proposed `do_not_build` disposition. |
| [`talos/prompts/coordinator.md`](./talos/prompts/coordinator.md), [`talos/prompts/assess-workflow.md`](./talos/prompts/assess-workflow.md), [`talos/prompts/review-decision.md`](./talos/prompts/review-decision.md), [`talos/prompts/prepare-build.md`](./talos/prompts/prepare-build.md) | Saved draft operational prompt specifications for future **Talos** implementation (not wired into active runtime execution). |
| [`submission/google-products.md`](./submission/google-products.md) | Submission summary (`__grounding/submission/google-products.md`) of how Heavy Rain uses the Google Gen AI Python SDK, Gemini API (`Interactions` and `Environments`), managed Antigravity sandbox agent, Gemini models, and **Talos** (work in progress). |

---

## 2. Synthetic organization demo fixtures (`./demo/`)

Both files contain invented demonstration data clearly labeled at the root `fixture_metadata.scope_notice` field:

- **[`demo/rookmere.json`](./demo/rookmere.json) — Rookmere Capital (`org_rookmere`):**
  - Lower mid-market European private equity firm with **32 total staff** (12 named employee fixtures), **2 funds** (**EUR 480m** *Rookmere Industrial Growth III* and **EUR 720m** *Rookmere Industrial Growth IV*), and **8 active portfolio companies** (4 full financial/ERP/FX/covenant fixtures + 4 summary fixtures).
  - **4 approved catalog apps**, **8 recurring task patterns**, **5 explicit MCP evidence reports**, and **1 weekly batch (`batch_rm_2026_w43`)** covering a sandbox build (*Portfolio Variance Workbench*), direct reuse (*Diligence Request List & Q&A Tracker*), and a missing-evidence hold (*LP Side-Letter MFN & Co-Invest Obligation Matrix*).
- **[`demo/augi.json`](./demo/augi.json) — AUGI (`org_augi`):**
  - Electric vehicle manufacturer developing the **AUGI Sable** (`prog_augi_sable`) 800V premium electric SUV, with 8 named engineers, 3 approved catalog apps, and 3 recurring workflows.
  - Specifications for the **AUGI Sable 3D Chassis Architecture Comparator** (`apps/augi-engineering` on `127.0.0.1:43171`), including **3 baseline concept chassis configurations** (`SABLE-A` modular multi-extrusion, `SABLE-B` Cell-to-Body + `22MnB5` boron torque rings, `SABLE-C` front/rear HPDC `AlSi7Mg` megacastings + CTB pack), parametric tuning ranges, 3 illustrative load cases (static axle-twist torsion, 3-point vertical bending, lateral subframe shear), and documented synthetic beam/shell equations and inline limitations.

---

## 3. Selected design, UX, and visual inspiration artifacts

- **Selected visual anchors (`./inspiration/` & `./design/`):**
  - Spatial reference anchor: [`inspiration/references/dribbble/09-tactical-gear-landing-page-anorent.png`](./inspiration/references/dribbble/09-tactical-gear-landing-page-anorent.png) ([`index.json`](./inspiration/references/dribbble/index.json), [`reference-assessment.md`](./inspiration/reference-assessment.md))
  - Selected first system build mockup: [`inspiration/mockups/03-system-c.png`](./inspiration/mockups/03-system-c.png) (and AUGI 3D mockup [`inspiration/mockups/04-augi-chassis.png`](./inspiration/mockups/04-augi-chassis.png), with additional AUGI 3D mockups queued)
  - Selected final brand wordmark: [`inspiration/logos/02-wordmark.png`](./inspiration/logos/02-wordmark.png) and [`design/brand/heavy-rain-mark.svg`](./design/brand/heavy-rain-mark.svg) (alongside [`rookmere-capital.svg`](./design/brand/rookmere-capital.svg) and [`augi-mark.svg`](./design/brand/augi-mark.svg))
  - Design system specs: [`design/README.md`](./design/README.md) and [`design/design-spec.md`](./design/design-spec.md)
- **UX journeys, state machines, and handoffs (`./ux/`):**
  - [`ux/journey.md`](./ux/journey.md), [`ux/system-ui-handoff.md`](./ux/system-ui-handoff.md), and [`ux/augi-ui-handoff.md`](./ux/augi-ui-handoff.md)
  - Mermaid diagrams: [`ux/full-flow.mmd`](./ux/full-flow.mmd), [`ux/build-states.mmd`](./ux/build-states.mmd), [`ux/augi-flow.mmd`](./ux/augi-flow.mmd)

---

## 4. Verified external primary sources (retrieved 2026-10-25)

- **Gemini API Managed Antigravity Agent & Environments:** <https://ai.google.dev/gemini-api/docs/antigravity-agent> | <https://ai.google.dev/gemini-api/docs/agent-environment> | <https://ai.google.dev/gemini-api/docs/latest-model> | [`antigravityagentconfig.py#L31`](https://github.com/googleapis/python-genai/blob/cb1408b06c573060f1593023ca320fde9a4fb5f6/google/genai/_gaos/types/interactions/antigravityagentconfig.py#L31)
- **Gemini 4 Argon, Thinking & Long Decode:** <https://ai.google.dev/gemini-api/docs/models/gemini-4-argon> | <https://ai.google.dev/gemini-api/docs/thinking> | <https://ai.google.dev/gemini-api/docs/long-decode>
- **Antigravity Python SDK (`0.1.22`):** <https://pypi.org/project/google-antigravity/> | <https://antigravity.google/docs/changelog> | <https://antigravity.google/docs/sdk/overview> | <https://antigravity.google/docs/sdk/subagents/> | <https://antigravity.google/docs/sdk/lifecycle/>
- **Antigravity CLI & Terminal Sandbox:** <https://antigravity.google/docs/cli/reference> | <https://antigravity.google/docs/sandbox> | <https://antigravity.google/docs/permissions>
- **Model Context Protocol (MCP) & Host Connectors:** <https://modelcontextprotocol.io/specification/2026-07-28/architecture> | <https://claude.com/docs/connectors/building> | <https://support.google.com/gemini/answer/17209137?hl=en-VU> | <https://developers.openai.com/plugins/deploy/connect-chatgpt>
- **UI & Workflow Structural References:** <https://docs.langchain.com/langsmith/use-studio> | <https://docs.temporal.io/web-ui> | <https://linear.app/docs/custom-views> | <https://retool.com/blog/introducing-the-sidebar-frame-create-intuitive-interfaces-for-complex-apps> | <https://grafana.com/docs/grafana/latest/visualizations/explore/trace-integration/>
