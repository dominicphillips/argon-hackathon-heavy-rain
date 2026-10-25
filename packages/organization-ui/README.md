# `@heavy-rain/organization-ui`

Bespoke React + TypeScript component library for **organization-deployed applications** (`Rookmere Capital` and `AUGI`).

> **Scope rule:** Organization applications (`apps/augi-engineering` and Rookmere Capital tools) import `@heavy-rain/organization-ui` and must **never** import `@heavy-rain/system-ui`.

## Separate organization themes

Each organization theme lives in its own folder under `src/themes/`:

1. **Rookmere Capital (`src/themes/rookmere/`):**
   - Activated via `<OrganizationThemeProvider theme="rookmere">` (`data-org-theme="rookmere"`).
   - Palette: Warm editorial limestone (`#F6F5F1`), crisp ledger surface (`#FFFFFF`), deep slate-navy primary (`#16202A`), positive variance emerald (`#15803D`), negative variance burgundy (`#B91C1C`), hairline borders (`#DCDAD2`), tabular numerals.
   - Brand SVG: `__grounding/design/brand/rookmere-capital.svg` (`ROOKMERE_LOGO_PATH`, `<RookmereLogo />`).
2. **AUGI (`src/themes/augi/`):**
   - Activated via `<OrganizationThemeProvider theme="augi">` (`data-org-theme="augi"`).
   - Palette: Light ceramic ash (`#E6E8EB`), elevated control surface (`#F2F4F7`), carbon-black primary (`#111317`), anodized cobalt control accent (`#2563EB`), copper torsion stress accent (`#D97706`), CAD datum borders (`#C8CCD4`), tabular numerals.
   - Brand SVG: `__grounding/design/brand/augi-mark.svg` (`AUGI_LOGO_PATH`, `<AugiLogo />`).

## Export contract (`src/index.tsx`)

- **Themes & brand marks:**
  - `ROOKMERE_TOKENS`, `ROOKMERE_LOGO_PATH`, `<RookmereLogo />`
  - `AUGI_TOKENS`, `AUGI_LOGO_PATH`, `<AugiLogo />`
  - `<OrganizationThemeProvider theme="rookmere" | "augi" reducedMotion={boolean} />`
- **`<NavRail />`:** Tactile left vertical navigation rail (`<nav>` + native `<button aria-current="page">`) with a 2px vertical left bar on the active item and optional 2×10 dot-matrix ornament.
- **`<Button />`:** Native `<button>` with `variant?: "primary" | "secondary" | "outline" | "ghost"` and `size?: "sm" | "md"`.
- **`<Panel />`:** Semantic container (`as?: "section" | "div" | "aside" | "article"`) with `variant?: "surface" | "inset" | "transparent"`, `title`, `subtitle`, and `actions`.
- **`<Status />`:** Disclosure and status badge (`tone?: "neutral" | "estimate" | "positive" | "warning" | "critical"`), including `"estimate"` for `"Concept estimate"`.
- **`<Field />` & `<RangeField />`:** Accessible native inputs and sliders (`<input type="range">`) with automatic tabular unit formatting (`unit="mm"`, `unit="kNm"`), `accent?: "control" | "stress"`, and field-specific validation error messages.
- **`<MetricReadout />`:** Tabular engineering or financial readout card with inline `disclosureLabel` (`"Concept estimate"`) and `limitationNote` positioned directly beside the computed number rather than as a page-wide warning banner.
