# Heavy Rain vs. Organization UI: Design Specification & Component Contracts

Date: `2026-10-25`
Primary visual anchor: [`__grounding/inspiration/references/dribbble/09-tactical-gear-landing-page-anorent.png`](../inspiration/references/dribbble/09-tactical-gear-landing-page-anorent.png) (see sourced analysis in [`__grounding/inspiration/reference-assessment.md`](../inspiration/reference-assessment.md)).

---

## 1. Architectural boundary: System UI vs. Organization UI

Heavy Rain separates the **operator orchestration system** from the **applications it routes or commissions for an organization**:

| Surface | Package Name & Path | Target Apps | Visual Identity & Scope Rule |
| --- | --- | --- | --- |
| **Heavy Rain System Control Plane** | `@heavy-rain/system-ui` (`packages/heavy-rain-ui/`) | `apps/system` | Operator surface for `Cairn` (Argon orchestrator), `Relay` (intake service), and sandbox workers (`Builder`, `Connector`, `Researcher`, `Notifier`). Supports `"ash"` (warm topographic ash control room) and `"rain-dark"` (obsidian spatial orchestration canvas). |
| **Organization Applications** | `@heavy-rain/organization-ui` (`packages/organization-ui/`) | `apps/augi-engineering` and Rookmere Capital tools | Employee-facing applications with separate theme folders for **Rookmere Capital** (`src/themes/rookmere/`) and **AUGI** (`src/themes/augi/`). **Hard boundary:** Organization apps must never import `@heavy-rain/system-ui`. |

---

## 2. Three visual theses for Heavy Rain System + AUGI 3D Workbench

All four mockup prompts (`__grounding/inspiration/mockups/01-system-a.prompt.txt` through `04-augi-chassis.prompt.txt`) share the spatial architecture of Reference 09—a sparse perimeter bar, a floating clicky left vertical navigation rail with a 2px vertical active bar indicator and 2×10 dot-matrix ornament, a dominant central stage, and a restrained right-hand column—while testing genuinely different layout structures:

1. **System Thesis A — Ash Topographic Control Room (`01-system-a.prompt.txt`):**
   - **Layout:** Centered 660×410px dark graphite build chamber (`#14171C`) framed like a precision hardware specimen on a full-bleed warm ash (`#E2E2E4`) topographic canvas, flanked by the floating left vertical navigation rail (`System`, `Work`, `Apps`, `Activity`) and a borderless right-hand four-row worker telemetry column (`Builder`, `Connector`, `Researcher`, `Notifier`).
   - **Strength:** Maximum negative space and immediate focus on the active run (`Cairn` / `Portfolio variance`) and its `Pause build` control.
   - **Tradeoff:** Right-hand vertical worker list shows current worker states cleanly but does not draw directional handoff edges between workers.

2. **System Thesis B — Rain-Dark Spatial Orchestration Canvas (`02-system-b.prompt.txt`):**
   - **Layout:** Asymmetric dual-zone central stage on a deep rain-dark (`#0C0F14`) topographic canvas. The left half of the central stage arranges the four workers (`Researcher`, `Connector`, `Builder`, `Notifier`) as a flat orthographic stepped node cascade with 1px `#263140` routing lines and mint `#34D399` handoff conduits feeding rightward into a 640×430px recessed smoky app-preview viewport.
   - **Strength:** Makes upstream-to-downstream worker handoffs (`Researcher` + `Connector` -> `Builder` -> `Notifier`) explicit at a glance alongside the live sandbox preview.
   - **Tradeoff:** Higher horizontal density across the 1440px viewport than Thesis A.

3. **System Thesis C — Centered Artifact Workbench (`03-system-c.prompt.txt`):**
   - **Layout:** Unified 1080px-wide architectural workbench on stone-ash (`#DCDFE3`) divided into three docked horizontal bands: a top workbench header bar (`Cairn | Portfolio variance` on the left, `Building` status pill and `Pause build` button on the right), a wide 1080×440px central assembly chamber showing layered wireframe planes emerging through localized mist, and a docked bottom 4-cell horizontal pipeline bar (`Researcher` -> `Connector` -> `Builder` -> `Notifier`).
   - **Strength:** Gives the emerging application artifact the widest possible horizontal aspect ratio while turning worker progression into a scannable bottom machine-stage bar.
   - **Tradeoff:** Less vertical breathing room above and below the central frame on 900px-tall viewports.

4. **Organization Thesis — AUGI Sable 3D Chassis Workbench (`04-augi-chassis.prompt.txt`):**
   - **Layout:** Light ceramic-ash (`#E6E8EB`) CAD topographic canvas with the clicky left vertical navigation rail (`Chassis`, `Torsion`, `Materials`, `Compare`), a borderless central 3D turntable stage displaying the exposed `AUGI Sable` electric SUV skateboard chassis and spaceframe with copper `#D97706` torsional stress contours, and a restrained right-hand parameter inspector (`Wheelbase`, `Wall gauge`, `Peak torque`) above the tabular `Torsional stiffness` readout (`41,200 Nm/deg`, `Peak twist 0.44 deg`) paired with the `Concept estimate` disclosure pill.

---

## 3. Typography and numeric discipline

Both component libraries share a disciplined three-role typographic stack with mandatory tabular figures (`font-variant-numeric: tabular-nums`) on all numbers, currency values, timestamps, and engineering units:

| Role | CSS Custom Property | Font Stack | Usage |
| --- | --- | --- | --- |
| **Display** | `--hr-font-display` / `--org-font-display` | `"Space Grotesk", "Inter", -apple-system, BlinkMacSystemFont, sans-serif` | Central stage headlines (`Portfolio variance`, `AUGI Sable`), tight tracking (`-0.02em`), weights `600`. |
| **UI Sans** | `--hr-font-sans` / `--org-font-sans` | `"Inter", -apple-system, BlinkMacSystemFont, sans-serif` | Clicky left navigation items (`15px`), tactile buttons (`13px`), form labels (`13px`), table cells, and inspector descriptions. |
| **Technical Mono** | `--hr-font-mono` / `--org-font-mono` | `"JetBrains Mono", "SFMono-Regular", Consolas, monospace` | Orchestrator eyebrows (`Cairn`), worker statuses (`Running`, `Completed`, `Queued`), engineering readouts (`41,200 Nm/deg`, `2980 mm`), financial variance deltas, and receipt IDs. |

---

## 4. Theme token specifications

### 4.1 `@heavy-rain/system-ui` tokens (`packages/heavy-rain-ui/src/tokens.ts`)

| Token / CSS Variable | `ash` (Control Room Default) | `rain-dark` (Spatial Orchestration) | Purpose |
| --- | --- | --- | --- |
| `--hr-canvas-bg` | `#E2E2E4` | `#0C0F14` | Full-viewport background surface |
| `--hr-contour-line` | `#D2D4D9` | `#151B24` | 1px SVG topographic contour lines |
| `--hr-surface-primary` | `#EAECEF` | `#131820` | Panels, worker node plates, Secondary buttons |
| `--hr-surface-elevated` | `#F4F5F7` | `#181F2A` | Elevated inspectors, active pipeline cells |
| `--hr-chamber-bg` | `#14171C` | `#0E131A` | Central sandbox build chamber interior |
| `--hr-chamber-border` | `#141517` | `#2E3B4E` | Build chamber 1.5px structural bezel frame |
| `--hr-border-subtle` | `#C8CAD0` | `#1F2835` | Hairline dividers and inactive borders |
| `--hr-border-strong` | `#141517` | `#2E3B4E` | Tactile button borders and active frames |
| `--hr-text-primary` | `#141517` | `#F3F5F7` | Headlines, active nav item, primary controls |
| `--hr-text-secondary` | `#4A4D55` | `#94A0B0` | Eyebrows, completed worker labels |
| `--hr-text-muted` | `#737780` | `#5E6877` | Inactive nav items, queued worker state |
| `--hr-signal-mint` | `#10B981` | `#34D399` | Active `Building` / `Running` status signal |
| `--hr-signal-amber` | `#D97706` | `#F59E0B` | `Paused` or `Needs evidence` state |
| `--hr-signal-danger` | `#B91C1C` | `#EF4444` | `Failed` run or service error state |

### 4.2 `@heavy-rain/organization-ui` tokens (`packages/organization-ui/src/themes/`)

| Token / CSS Variable | Rookmere Capital (`data-org-theme="rookmere"`) | AUGI (`data-org-theme="augi"`) | Purpose |
| --- | --- | --- | --- |
| `--org-canvas-bg` | `#F6F5F1` (Warm editorial limestone) | `#E6E8EB` (Light ceramic ash) | Organization app canvas background |
| `--org-contour-line` | `#E8E5DD` | `#D6D9E0` | Subtle background grid/contour lines |
| `--org-surface-primary` | `#FFFFFF` (Crisp ledger sheet) | `#F2F4F7` (Elevated control card) | Primary cards, tables, readout blocks |
| `--org-surface-inset` | `#EFECE6` | `#DCE0E5` | Inset pills, disclosure badges, well backgrounds |
| `--org-border-subtle` | `#DCDAD2` | `#C8CCD4` | 1px table, panel, and slider track borders |
| `--org-border-strong` | `#16202A` | `#111317` | Active nav bar indicator and outline buttons |
| `--org-text-primary` | `#16202A` (Deep slate-navy) | `#111317` (Carbon black) | Primary headings, active nav, metric values |
| `--org-text-secondary` | `#434E5B` | `#4B525C` | Parameter labels, secondary table columns |
| `--org-text-muted` | `#6C7683` | `#767E8A` | Inactive nav items, model limitation notes |
| `--org-accent-control` | `#16202A` | `#2563EB` (Anodized cobalt) | Geometry sliders (`Wheelbase`, `Wall gauge`) |
| `--org-accent-stress` | `#B45309` | `#D97706` (Torsion copper) | Load sliders (`Peak torque`) & twist sublabels |
| `--org-status-positive-text` | `#15803D` | `#0F766E` | Favorable variance / verified check |
| `--org-status-critical-text` | `#B91C1C` | `#B91C1C` | Unfavorable variance / field validation error |

---

## 5. 3D, motion, and smoky blur state policy

### 5.1 Smoky blur confinement rule (`<BuildChamber />`)
- **Where blur is allowed:** Gaussian blur (`filter: blur(15px)`) and smoky radial mist (`hr-build-chamber__smoke-veil`) occur **strictly inside `.hr-build-chamber__stage-inner`** when `isBuilding === true`.
- **What must never blur:** The top bar, clicky left navigation rail (`System`, `Work`, `Apps`, `Activity`), stage headlines (`Cairn`, `Portfolio variance`), the chamber's own top bezel (`.hr-build-chamber__bezel`), the `Building` status pill, the `Pause build` button, and all worker/evidence inspectors remain razor-sharp (`filter: none`) at all times.
- **State transitions:** Switching a run from `building` to `paused`, `preview`, or `completed` removes `.hr-build-chamber__stage-inner--building` so the operator can inspect the unblurred artifact immediately.

### 5.2 Motion and reduced-motion policy
- **State-driven motion only:** Motion communicates real state transitions or explicit user replay (`hr-pulse` on `running`/`building` status dots, smooth parameter interpolation on 3D chassis deformation). Static states (`queued`, `completed`, `verified`, `paused`) use zero looping animation.
- **Reduced motion (`prefers-reduced-motion: reduce` or `reducedMotion={true}`):** Disables keyframe pulses, transitions, and smoky blur transitions while preserving all structural borders, status indicator shapes (solid dot vs. hollow ring), and textual labels so no information is lost.

### 5.3 3D viewport and inline disclosure policy (`apps/augi-engineering`)
- **Real interactive 3D geometry:** The central `AUGI Sable` viewport renders actual interactive Three.js / React Three Fiber geometry (exposed skateboard chassis, front/rear cast subframes, longitudinal hydroformed rails, battery floor cross-members, double-wishbone suspension) with orbit, pan, zoom, tilt, and an explicit `Reset view` button (`<Button>Reset view</Button>`).
- **Keyboard and slider accessibility:** Every 3D parameter adjustment (`Wheelbase` in `mm`, `Wall gauge` in `mm`, `Peak torque` in `kNm`) is driven by native `<RangeField />` (`<input type="range">`) and `<Button />` controls that work with keyboard arrow keys and screen readers.
- **Inline model limitation disclosure:** Engineering numbers (`41,200 Nm/deg`, `Peak twist 0.44 deg`) are concept approximations. Place `<Status tone="estimate" label="Concept estimate" />` and the model assumptions note directly inside `<MetricReadout />` beside the numbers—never as a page-wide warning banner, and never claiming crashworthiness, certification, or validated FEA.

---

## 6. Brand SVG marks (`__grounding/design/brand/`)

All three marks use original geometry in `32×32` viewBoxes with `currentColor` fills so they adapt cleanly to light and dark surfaces:

1. **Heavy Rain (`__grounding/design/brand/heavy-rain-mark.svg`):** Three parallel diagonal rain vector conduits (`M10.5 5L5.5 20...`) converging above a horizontal datum base bar (`rect x="4" y="24" width="24" height="3"`). Exported in `@heavy-rain/system-ui` as `<HeavyRainMark />` and `HEAVY_RAIN_MARK_PATH`.
2. **Rookmere Capital (`__grounding/design/brand/rookmere-capital.svg`):** Stepped architectural rook crenellation above twin vertical capital ledger columns framed by a solid base plinth. Exported in `@heavy-rain/organization-ui` as `<RookmereLogo />` and `ROOKMERE_LOGO_PATH`.
3. **AUGI (`__grounding/design/brand/augi-mark.svg`):** Precision-chamfered hexagonal spaceframe ring bisecting a horizontal structural axle bar and central vertical hub pin. Exported in `@heavy-rain/organization-ui` as `<AugiLogo />` and `AUGI_LOGO_PATH`.

---

## 7. Component library export contracts

### 7.1 `@heavy-rain/system-ui` (`packages/heavy-rain-ui/src/index.tsx`)

```tsx
import {
  SystemShell,
  NavRail,
  BuildChamber,
  Button,
  Panel,
  Status,
  WorkerRow,
  Field,
  RangeField,
  HeavyRainMark,
  SYSTEM_TOKENS,
  SYSTEM_NAV_SECTIONS,
  WORKER_ROLES,
  HEAVY_RAIN_MARK_PATH,
} from "@heavy-rain/system-ui";
```

### 7.2 `@heavy-rain/organization-ui` (`packages/organization-ui/src/index.tsx`)

```tsx
import {
  OrganizationThemeProvider,
  NavRail,
  Button,
  Panel,
  Status,
  Field,
  RangeField,
  MetricReadout,
  RookmereLogo,
  ROOKMERE_TOKENS,
  ROOKMERE_LOGO_PATH,
  AugiLogo,
  AUGI_TOKENS,
  AUGI_LOGO_PATH,
} from "@heavy-rain/organization-ui";
```
