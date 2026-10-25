# `@heavy-rain/system-ui`

Bespoke React + TypeScript component library for the **Heavy Rain operator control plane** (`apps/system`).

> **Scope rule:** Only Heavy Rain operator views (`apps/system`) may import `@heavy-rain/system-ui`. Organization applications (`Rookmere Capital` and `AUGI`) must import `@heavy-rain/organization-ui` instead.

## Surface modes and tokens

`@heavy-rain/system-ui` provides two system surface modes via `data-hr-surface="ash" | "rain-dark"` (or `<SystemShell surface="ash" | "rain-dark">`):
- `"ash"` (default): Warm architectural ash (`#E2E2E4`) control room with carbon-black (`#141517`) typography, slate secondary copy (`#4A4D55`), and a deep graphite (`#14171C`) central build chamber.
- `"rain-dark"`: Deep obsidian (`#0C0F14`) spatial orchestration canvas with elevated slate node plates (`#131820`), thin bright borders (`#2E3B4E`), and mint active signals (`#34D399`).

Brand mark SVG path: `__grounding/design/brand/heavy-rain-mark.svg` (also exported as `<HeavyRainMark />` and `HEAVY_RAIN_MARK_PATH`).

## Export contract (`src/index.tsx`)

- **Tokens & constants (`src/tokens.ts`):**
  - `SYSTEM_TOKENS`, `SYSTEM_NAV_SECTIONS` (`["System", "Work", "Apps", "Activity"]`), `WORKER_ROLES` (`["Builder", "Connector", "Researcher", "Notifier"]`), `HEAVY_RAIN_MARK_PATH`
  - Types: `SystemSurfaceMode`, `SystemNavSection`, `WorkerRole`, `SystemStatusTone`, `SystemSurfacePalette`
- **`<SystemShell />`:** Sets `data-hr-surface` and `data-hr-reduced-motion`, arranging `topBar`, `leftNav`, central `children`, and optional `rightRail`.
- **`<NavRail />`:** Reference-09 clicky vertical navigation list using native `<button aria-current="page">` with a 2px vertical bar indicator on the selected item and optional 2×10 dot-matrix ornament.
- **`<BuildChamber />`:** Central sandbox build chamber. Enforces the smoky blur policy: only `.hr-build-chamber__stage-inner` is blurred when `isBuilding && !reducedMotion`, while the chamber bezel, `<Status />` pill (`"Building"`), and action button (`"Pause build"`) remain sharp.
- **`<Button />`:** Native `<button>` with `variant?: "primary" | "secondary" | "ghost" | "danger"` and `size?: "sm" | "md"`.
- **`<Panel />`:** Semantic container (`as?: "section" | "div" | "aside" | "article"`) with `variant?: "surface" | "elevated" | "flat" | "chamber"`, `eyebrow`, `title`, and `actions`.
- **`<Status />` & `<WorkerRow />`:** Distinct execution state badges (`"accepted" | "queued" | "running" | "building" | "completed" | "verified" | "deployed" | "paused" | "needs-evidence" | "failed"`) and worker telemetry rows.
- **`<Field />` & `<RangeField />`:** Accessible native form controls with tabular numeric readouts and explicit field error alerts.
