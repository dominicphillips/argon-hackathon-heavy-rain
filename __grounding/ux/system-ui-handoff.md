# System UI implementation brief (`apps/system` and `packages/heavy-rain-ui`)

**Consumer:** `agy` system-UI builder implementing `packages/heavy-rain-ui` and `apps/system`.
**Grounding date:** 2026-10-25.
**Related files:** [`journey.md`](./journey.md), [`full-flow.mmd`](./full-flow.mmd), [`build-states.mmd`](./build-states.mmd), [`augi-ui-handoff.md`](./augi-ui-handoff.md), and layout anchor [`09-tactical-gear-landing-page-anorent.png`](../inspiration/references/dribbble/09-tactical-gear-landing-page-anorent.png).

---

## 1. Layout architecture and visual rules (`reference09` anchor)

Build `apps/system` using bespoke components from `packages/heavy-rain-ui` (Vite + React + TypeScript; no `shadcn` or generic dashboard templates). Organization applications live in `packages/organization-ui` and must never import `packages/heavy-rain-ui`.

### Spatial allocation (1440 px and 1280 px desktop viewports)

Adapt the composition of [`09-tactical-gear-landing-page-anorent.png`](../inspiration/references/dribbble/09-tactical-gear-landing-page-anorent.png) to an operator workspace:

| Zone | Width / placement | Purpose and visual treatment |
| --- | --- | --- |
| **Top context bar** | Full width, `48 px` height, thin bottom rule | Organization switcher (`Rookmere Capital`, `AUGI`), active weekly run selector (`Week of 2026-10-25 · Sun 18:00 UTC cutoff`), single fixture-replay disclosure (`Sample fixture replay · No production writes`), and reduced-motion toggle. |
| **Left vertical navigation** | `200 px` (1440 px viewport) / `176 px` (1280 px viewport), vertically centered rail | Tactile, sparse vertical navigation with four exact destinations: **`System`**, **`Work`**, **`Apps`**, **`Activity`**. Active item shows a crisp vertical tick bar (`| System`) and subtle numeric badge only when operator action is required. Below a spacer rule, show the contextual checkpoint rail for the active artifact. |
| **Center topographic stage** | `58%–64%` of viewport width, full height | Quiet SVG contour background on rain-dark ash surfaces, generous negative space, and a thin bright technical frame holding the **hero build preview or interactive 3D/app artifact** at center. Never replace this central stage with a multi-card KPI grid. |
| **Right secondary inspector** | `320 px–360 px` right column | Scoped detail panel for the selected task, worker trace, submitted evidence, or release verification. Uses compact pill selectors and flat technical rows inspired by the right-hand customization column in `reference09`. |
| **Bottom status & playback strip** | Full width, `44 px` height | Replay transport controls (`Start / Replay weekly run`, step jump, `Pause build` / `Resume from checkpoint`), schedule status (`Weekly schedule: Active`), and data freshness timestamp. |

### Independent status dimensions

Never flatten system status into one badge. Render these five states separately where relevant:
1. **Weekly schedule status:** `Active` | `Paused` (controls future Sunday 18:00 UTC cutoffs only).
2. **Weekly run status:** `Idle` | `Grouping reports` | `Awaiting operator decision` | `Complete`.
3. **Sandbox build status:** `Queued` | `Stage 1/3: Schema check` | `Stage 2/3: UI assembly` | `Stage 3/3: Verification` | `Paused at checkpoint` | `Failed at checkpoint` | `Ready for review`.
4. **App release status:** `Catalog match (Approved)` | `In sandbox review` | `Released to organization` | `Changes requested`.
5. **Fixture / data freshness:** Single top-bar disclosure `Sample fixture replay · No production writes` plus report cutoff timestamp (`Captured through 2026-10-25 18:00 UTC`). Once visible in the top bar, do not repeat sample-data caveats on every card.

---

## 2. Primary navigation destinations (`System`, `Work`, `Apps`, `Activity`)

Keep the shell persistent across all four views (`packages/heavy-rain-ui` frame) and preserve the selected organization (`Rookmere Capital` or `AUGI`) and active run across navigation changes.

### A. `System` (Default landing view)
- **Job:** Give the operator a single-glance view of what is running in the sandbox and what needs a release decision.
- **Center stage:** Hero artifact viewport.
  - For **Rookmere Capital**: `Portfolio variance report` sandbox build and interactive preview (variance table across 4 detailed sample portfolio companies for Fund I EUR 480m and Fund II EUR 720m).
  - For **AUGI**: `AUGI Sable chassis study` 3D concept engineering viewer embedded in the central frame, with option to expand via `Open organization app`.
- **Left sub-rail (under `System`):** Build checkpoint selector (`1. Schema check`, `2. UI assembly`, `3. Verification`) and review state selector (`Ready for review`, `Approved for release`, `Changes requested`).
- **Right inspector:** Concise decision summary (why Cairn commissioned this build from grouped reports), active worker assignment (`Builder · Sandbox`), verification checklist, and primary decision controls (`Approve for release`, `Request changes`, `Open organization app`).

### B. `Work` (Weekly recurrence grouping & triage)
- **Job:** Inspect employee-submitted work reports after weekly grouping and choose the route (`Reuse`, `Build`, or `Request evidence`).
- **Center stage:** Structured recurrence clusters for the selected organization (no generic kanban or chart wall):
  - **Rookmere Capital clusters:**
    1. `Portfolio variance report` (6 employee reports across Investment Team and Finance; authorized finance template scope) → Primary action: `Start sandbox build` (or `Inspect active build` once running).
    2. `Diligence request tracker` (5 employee reports across Investment Team and Legal; matches approved existing app `Diligence Request Tracker v2.4`, requires no new data scope) → Primary action: `Route to existing app`.
    3. `LP side-letter obligations` (3 employee reports across Compliance and IR; missing redacted sample obligation schedule from Legal) → Primary action: `Request missing evidence`.
  - **AUGI clusters:**
    1. `AUGI Sable chassis study` (7 employee reports from Body & Structures engineers comparing wheelbase, gauge, and torsional stiffness approximations in spreadsheets) → Primary action: `Start sandbox build` / `Reveal ready artifact`.
    2. `Supplier material certificate lookup` (4 employee reports; matches approved catalog app) → Primary action: `Route to existing app`.
- **Right inspector:** Selected report detail (`Inspect report`): shows the exact outgoing payload the employee approved, included sample files, policy scope (`Approved finance templates` or `Concept geometry parameters`), and confirmation that full host chat history was excluded.

### C. `Apps` (Approved organization catalog & release state)
- **Job:** Open live organization applications, verify release status, and inspect post-release employee routing and feedback.
- **Center stage:** Organization application showcase featuring the selected app at center (`Portfolio variance report`, `Diligence request tracker`, or `AUGI Sable chassis study`), with theme preview (`packages/organization-ui` Rookmere or AUGI theme), access scope summary, and `Open organization app` launch trigger.
- **Right inspector:** Release history, notified employee count (`Notifier sent release link to 6 reporting employees`), and post-release feedback entries that link back to `Work` for the next weekly cycle.

### D. `Activity` (Observable event trace & worker assignments)
- **Job:** Inspect real-time or replayed events across `Cairn` (orchestrator), `Relay` (report intake & routing service), and functional workers (`Builders`, `Connectors`, `Researchers`, `Notifiers`).
- **Center stage:** Chronological and stage-grouped execution timeline (informed by Temporal Web UI execution history and Grafana trace spans) connected to the active artifact.
- **Right inspector:** Selected event payload showing input evidence, tool result (`Schema check passed: 12 columns matched`), duration, and concise decision summary. **Never render or invent hidden model chain-of-thought.**

---

## 3. Smoky blur semantics and reduced-motion rules

During sandbox building, the central artifact preview uses a smoky blurred veil driven strictly by build state and checkpoint progress (see [`build-states.mmd`](./build-states.mmd)):

| Build state | Central preview layer | Smoky veil layer | Always-sharp overlay & surrounding UI |
| --- | --- | --- | --- |
| **`Queued`** | Wireframe structural outline of target app | Blur `16 px`, veil opacity `0.85` (ash-dark matte) | Left nav, top bar, checkpoint rail, right inspector, and `Start sandbox build` button stay 100% sharp (`filter: none`). |
| **`Stage 1/3: Schema check`** | Data contract and table/viewport skeleton | Blur `14 px`, veil opacity `0.75`, slow horizontal drift tied to stage events | Checkpoint `1. Schema check` pulses mint (`#66DFC2`); `Pause build` and `Inspect worker activity` remain crisp. |
| **`Stage 2/3: UI assembly`** | Actual live React/Three.js preview rendering underneath | Blur `8 px`, veil opacity `0.48` | Checkpoint `1` shows `Complete`; Checkpoint `2. UI assembly` shows `Running`. |
| **`Stage 3/3: Verification`** | Assembled interactive candidate | Blur `3 px`, veil opacity `0.22` | Checkpoint `3. Verification` shows live sandbox check count (`3/3 checks passing`). |
| **`Paused at checkpoint`** | Frozen at last verified checkpoint frame | Static frost border (`blur 8 px`, zero drift animation) | Badge reads `Paused at Checkpoint 2`; primary button changes to `Resume from checkpoint`. |
| **`Failed at checkpoint`** | Frozen at failing stage with inline callout | Static matte (`blur 10 px`, zero drift) | Amber/coral callout names the exact failed check and offers `Retry from checkpoint` or `Request changes`. |
| **`Ready for review`** | **100% sharp, unblurred interactive artifact** | Blur `0 px`, veil opacity `0` (completely unmounted/hidden) | Operator can interact with the preview directly or click `Open organization app` / `Approve for release`. |

### Reduced-motion variant (`prefers-reduced-motion: reduce` or top-bar toggle)
- Replace any continuous smoke drift animation with a static translucent matte layer whose opacity steps discretely (`0.85 → 0.65 → 0.35 → 0`) as checkpoints complete.
- Disable camera auto-orbit and layout slide transitions; keep instant focus rings and explicit text status badges (`Stage 2 of 3 running`).

---

## 4. Required interactive prototype actions (acceptance checklist)

Every action below must update application state coherently without page reloads or dead buttons:

1. **Select organization:** Switch between `Rookmere Capital` and `AUGI` in the top context bar. Updates the `Work` clusters, `System` hero artifact (`Portfolio variance report` vs `AUGI Sable chassis study`), `Apps` catalog, and `Activity` trace.
2. **Start / replay weekly run (`Replay weekly run`):** Steps or plays through the deterministic fixture sequence (`Grouping reports` → `Triage ready` → `Stage 1/3` → `Stage 2/3` → `Stage 3/3` → `Artifact ready for review`), updating the smoky blur and worker trace in sync.
3. **Inspect report (`Inspect report`):** Selecting any employee report in `Work` opens the outgoing payload summary in the right inspector, displaying the employee name, role, task description, approved sample attachment, and privacy boundary.
4. **Choose reuse / build / request evidence:**
   - Clicking `Route to existing app` on a matched cluster (`Diligence request tracker` or `Supplier material certificate lookup`) transitions that cluster to `Routed to approved app` and logs a `Notifier` event in `Activity`.
   - Clicking `Start sandbox build` on `Portfolio variance report` or `AUGI Sable chassis study` focuses `System` and starts the 3-stage sandbox build.
   - Clicking `Request missing evidence` on `LP side-letter obligations` transitions the cluster to `Needs evidence · Request sent to Legal` while leaving other clusters unblocked.
5. **Pause and resume build (`Pause build` / `Resume from checkpoint`):** Freezes progress at the active checkpoint, stops smoke motion, and resumes from that exact checkpoint without restarting Stage 1.
6. **Inspect worker activity (`Inspect worker activity`):** Opens `Activity` (or expands the right trace tab) pre-filtered to the active run and worker (`Cairn`, `Relay`, `Builder`, `Connector`, `Researcher`, `Notifier`).
7. **Reveal ready artifact (`Reveal ready artifact`):** Advances a running replay directly to `Ready for review`, clearing the smoky veil so the operator can test the unblurred preview immediately.
8. **Open organization app (`Open organization app`):** Opens the full organization application view (`packages/organization-ui`) for the selected organization (`Portfolio variance report` in Rookmere theme or `AUGI Sable chassis study` in AUGI theme) with a clear `Back to Heavy Rain System` return bar.
9. **Change review state:** In `System` when the artifact is `Ready for review`, operator can choose `Approve for release` (marks app `Released to organization`, updates `Apps`, and logs `Notifier` delivery) or `Request changes` (adds operator note and returns build to Stage 2).

---

## 5. Exact user-facing copy and state matrix

Do not expose internal implementation terms (`ag_sandbox_id`, `max_output_tokens`, `MCP_STDIO`, `llm_thought_trace`) in the UI. Use these exact labels and state strings:

### Global navigation and header labels
- Primary nav items: `System`, `Work`, `Apps`, `Activity`
- Organization switcher label: `Organization` (`Rookmere Capital`, `AUGI`)
- Active run selector label: `Weekly run` (`2026-10-25 · Cutoff Sun 18:00 UTC`)
- Fixture disclosure badge (shown once in top bar): `Sample fixture replay · No production writes`
- Schedule status pill: `Weekly schedule: Active` | `Weekly schedule: Paused`
- Motion toggle label: `Reduced motion: Off` | `Reduced motion: On`

### Screen-by-screen state content (`empty`, `loading`, `running`, `blocked`, `ready`, `failed`)

| Surface | State | Status badge | Headline / primary message | Supporting detail | Primary & secondary actions |
| --- | --- | --- | --- | --- | --- |
| **`System`** | `empty` | `Idle` | `No sandbox build selected` | `Select a grouped task in Work or replay the weekly run to inspect a sandbox build.` | Primary: `Open Work queue` · Secondary: `Replay weekly run` |
| **`System`** | `loading` | `Loading` | `Loading sandbox workspace` | `Fetching checkpoint state and sample evidence for the selected run.` | Secondary: `Cancel` |
| **`System`** | `running` | `Running · Stage 2 of 3` | `Building Portfolio variance report in sandbox` *(or `Building AUGI Sable chassis study in sandbox`)* | `Preview obscured while Builder assembles components against sample data. Checkpoints stay verifiable.` | Primary: `Pause build` · Secondary: `Inspect worker activity` · Quick demo action: `Reveal ready artifact` |
| **`System`** | `blocked` | `Paused at checkpoint` | `Sandbox build paused at Stage 2 (UI assembly)` | `Checkpoint 1 (Schema check) is saved. Resuming continues from Stage 2 without repeating completed checks.` | Primary: `Resume from checkpoint` · Secondary: `Cancel build; keep draft` |
| **`System`** | `failed` | `Check failed` | `Sandbox verification failed on currency column mapping` | `Portfolio sample row 4 uses GBP without an EUR conversion column in the draft schema. Checkpoint 1 remains saved.` | Primary: `Retry from checkpoint` · Secondary: `Request changes` |
| **`System`** | `ready` | `Ready for review` | `Sandbox checks passed · Artifact ready for review` | `3 of 3 verification checks passed on read-only sample data. 0 production writes executed.` | Primary: `Approve for release` · Secondary: `Open organization app`, `Request changes` |
| **`Work`** | `empty` | `No reports` | `No work reports queued for this cutoff` | `Employees submit reports from their assistant when a recurring task is ready to review.` | Primary: `Load sample weekly reports` |
| **`Work`** | `loading` | `Grouping` | `Grouping weekly work reports` | `Relay is matching 14 submitted reports against approved organization apps.` | Secondary: `Inspect worker activity` |
| **`Work`** | `running` | `Triage active` | `3 recurring task groups identified from 14 reports` | `1 matches an approved catalog app, 1 is authorized for sandbox build, and 1 needs a sample schedule.` | Per-row primary: `Route to existing app`, `Start sandbox build`, `Request missing evidence` |
| **`Work`** | `blocked` | `Needs evidence` | `LP side-letter obligations needs 1 redacted sample schedule` | `3 Compliance reports describe this task, but no approved sample file is attached. Other weekly tasks continue.` | Primary: `Send evidence request` · Secondary: `Defer to next weekly run` |
| **`Work`** | `ready` | `Decisions recorded` | `Weekly triage decisions recorded for all 3 task groups` | `1 routed to catalog app, 1 building in sandbox, 1 awaiting Legal sample file.` | Primary: `Open System build` · Secondary: `Inspect worker activity` |
| **`Work`** | `failed` | `Intake error` | `Report attachment check failed on 1 submission` | `Attachment 'LP_tracker_macro.xlsm' uses macros outside organization policy. Ask the sender for a plain '.xlsx' or '.csv' export.` | Primary: `Request supported file format` · Secondary: `Keep report text only` |
| **`Apps`** | `empty` | `No apps` | `No released applications in this view` | `Clear the current filter or approve a ready sandbox artifact in System.` | Primary: `Clear filter` · Secondary: `Open System review` |
| **`Apps`** | `loading` | `Loading` | `Loading organization application catalog` | `Checking release states and access permissions for the selected organization.` | None |
| **`Apps`** | `running` | `Update in sandbox` | `Candidate update running in sandbox` | `The current released version remains available to employees while the sandbox update runs.` | Primary: `Open organization app` · Secondary: `Inspect sandbox build` |
| **`Apps`** | `blocked` | `Scope approval needed` | `Release waiting on read-only connector approval` | `The sandbox artifact passed checks, but organization release requires Finance admin sign-off on portfolio table read scope.` | Primary: `Send scope request to admin` · Secondary: `Open sandbox preview` |
| **`Apps`** | `ready` | `Released` | `Available to authorized organization members` | `Released after sandbox verification. Notifier delivered access-checked links to reporting employees.` | Primary: `Open organization app` · Secondary: `Report issue or suggest change` |
| **`Apps`** | `failed` | `Release check failed` | `Organization theme or permission check failed` | `The candidate remains in sandbox preview; the existing released app was not modified.` | Primary: `Return to System review` |
| **`Activity`** | `empty` | `No events` | `No worker events recorded for this filter` | `Reset the worker filter or start the weekly run replay to inspect trace events.` | Primary: `Reset filters` · Secondary: `Replay weekly run` |
| **`Activity`** | `loading` | `Loading trace` | `Loading worker event timeline` | `Retrieving recorded checkpoints and tool outcomes.` | None |
| **`Activity`** | `running` | `Live trace` | `Workers executing sandbox build checkpoints` | `Showing observable assignments, tool outputs, and decision summaries for the active run.` | Primary: `Pause build` · Secondary: `Filter by worker` |
| **`Activity`** | `blocked` | `Waiting on input` | `Trace paused at operator or evidence handoff` | `Waiting for missing Legal sample file or operator resume action.` | Primary: `Open blocked item` |
| **`Activity`** | `ready` | `Run complete` | `All scheduled checkpoints and notifications recorded` | `Every stage links to its input evidence and verified sandbox check output.` | Primary: `Open System review` |
| **`Activity`** | `failed` | `Step failed` | `Worker step stopped on verification check` | `Draft artifact and prior checkpoints are preserved. Fix the input mapping and retry from the last checkpoint.` | Primary: `Retry from checkpoint` · Secondary: `Open failing step in System` |

---

## 6. Keyboard, accessibility, and responsive behavior

- **Keyboard navigation:** Left rail items (`System`, `Work`, `Apps`, `Activity`) use arrow-key roving tabindex or standard tab order with visible high-contrast mint focus outlines (`#66DFC2`). Provide keyboard shortcuts only with visible hints (`Space` to pause/resume replay when the transport bar is focused; `Escape` to close modals or return from expanded app preview).
- **Status beyond color:** Every mint (`#66DFC2`), amber (`#F2C57C`), or coral (`#FF929B`) status indicator must pair with an explicit text label (`Running`, `Needs attention`, `Check failed`, `Ready for review`).
- **Viewport fit (1440 px and 1280 px):** At `1280 px`, narrow the left rail to `176 px` and right inspector to `300 px` so the central topographic stage retains at least `800 px` width without horizontal scrolling or truncated button labels.
