# Product and App Naming Guide

Use this guide when naming platform components, customer organizations, and generated apps in UI labels, documentation, and agent prompts.

## Protected platform and organization names

Keep platform infrastructure distinct from customer organizations and their programs:

- **Platform infrastructure:** **Heavy Rain** (platform), **Cairn** (build orchestrator), and **Relay** (work-report intake). Never prefix customer apps with platform names.
- **Customer organizations and programs:** **AUGI** (automotive organization), **Sable** (AUGI vehicle program), and **Rookmere Capital** (investment firm).

## Rules for app names

- **Pick one plain name (`<= 24` characters):** Choose a single canonical name that fits top-level navigation and table headers without truncation. Do not publish option catalogs.
- **Name the product, not the process or stack:** Avoid study labels (`chassis study`), implementation terms (`Three.js`, `SQLite`, `MCP`), and compound noun walls (`3D Chassis Architecture Comparator`). Never use `AI-powered`.
- **Separate the name from the purpose line:** Pair the short app name with a separate one-sentence task description when context is needed.
- **Use clear domain terms:** `Chassis` is fine in explanatory copy where accurate; ban internal slang such as `skateboard` from the UI. Label synthetic personas once at the section level rather than repeating caveats in every sentence.

## Canonical names for current apps

- **Sable Studio** (AUGI) — Interactive 3D procedural vehicle, cutaway, and flight-concept view for comparing SABLE-A, SABLE-B, and SABLE-C wheelbase, track, and rocker wall gauge tradeoffs.
- **Rookmere Close** (Rookmere Capital) — Monthly financial close tool that maps HGB and Nordic trial balances to board P&L lines, separates operational EBITDA variance from FX translation, and checks net-leverage covenant headroom.

## Examples for future apps

Base future names on verified weekly workflows without promising unbuilt capabilities:

- **Gate C2 BoM** (AUGI) — Reconcile lower-chassis part counts, fasteners, adhesive lengths, and center-of-gravity height across Sable variants.
- **Covenant Watch** (Rookmere Capital) — Check monthly net-debt-to-LTM-EBITDA headroom against maintenance covenants across RIG-III and RIG-IV companies.
- **Trial Balance Mapper** (Rookmere Capital) — Map local ERP account exports to standardized board P&L lines.

- **Sable Balance** (AUGI) — Interactive 3D X-ray mass and balance tool (`?app=balance`) for adjusting part weights and positions to compute static front/rear axle load share and center-of-gravity height on a concept model.

## Navigation labels

- **Keep top-level navigation labels exact:** Use `Build`, `Ingest`, `Apps`, and `Activity` at the top left without an active-state marker.
