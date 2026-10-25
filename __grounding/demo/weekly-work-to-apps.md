# Weekly work to apps

All assistant chat excerpts, MCP work reports, local hook manifests, attachment digests, financial figures, and 3D engineering calculations in this file are synthetic demonstration fixtures created for Heavy Rain. They do not represent private employee communications, real automaker or private equity records, undisclosed host vendor integrations, certified finite-element analysis (FEA), or measured production time savings.

Model Context Protocol (MCP) hosts (Claude, Gemini, ChatGPT) retain full conversation history. Heavy Rain receives only employee-selected excerpts, approved schema attachments, or policy-scoped local hook summaries after the employee inspects and confirms the exact outgoing manifest.

[Structured evidence](./work-evidence.json)

- Never claim passive or invisible scraping of host assistant chat history.
- Never derive an application from a single unrepeated prompt without multi-week recurrence evidence.
- Never fabricate production deployment metrics, hours saved, or certified FEA/crashworthiness results.
- Always distinguish implemented prototype features from exploratory mockup/roadmap proposals.

## Monthly Portfolio Budget-vs-Actual Variance & Covenant Normalization

**Rookmere Capital · build_in_sandbox**

Between business days 5 and 10 of every monthly close, Investment Team principals, Operating Partners, and Fund Controllers independently prompt assistants to map heterogeneous ERP exports into Rookmere's standard P&L bridge, separate SEK/NOK/GBP FX translation effects from operational volume/price variance, and check maintenance leverage covenant headroom across 8 portfolio companies.

Produce a consistent, auditable monthly EBITDA, revenue, and net-leverage bridge across RIG-III (EUR 480m) and RIG-IV (EUR 720m) portfolio companies before the Monday Investment Committee review without re-prompting account mappings and FX formulas in chat.

### Conversation evidence

**Lukas Weber · Claude Desktop · 2026-W39 (August Close)** (`xcp_rm_01_w39`)

> **user turn:** Here is the semicolon-delimited German HGB trial balance export for Kelvion Flow Systems GmbH (accounts 4000-4999 revenue, 5000-5999 material cost). Map it to the RIG-III board P&L lines and explain why EBITDA missed budget by EUR 190k.

> **assistant turn summary:** Generated a one-off Python mapping script; initially misclassified HGB account 5420 (external stainless-steel casting scrap) under SG&A instead of COGS until corrected manually by Lukas Weber.

- Re-uploading the 68-row HGB-to-RIG-III account mapping table into a fresh chat context.
- Manually checking sign inversions on German HGB credit balances.
- Re-typing the 3.75x net leverage covenant limit for Kelvion Flow Systems.

**Lukas Weber · Claude Desktop · 2026-W43 (September Close)** (`xcp_rm_01_w43a`)

> **user turn:** Same monthly task for Kelvion Flow Systems September close: HGB trial balance CSV attached. Revenue is EUR 6,420k vs EUR 6,850k budget (-EUR 430k from two delayed chemical-plant valve skids), EBITDA is EUR 1,180k vs EUR 1,410k budget, and stainless casting scrap rose 140 bps. Re-run the RIG-III bridge and check net leverage on EUR 41.2m net debt / EUR 13.1m LTM EBITDA.

> **assistant turn summary:** Produced the September variance table and calculated 3.15x net leverage (0.60x headroom below the 3.75x covenant), requiring manual re-attachment of rig_iii_standard_pnl_mapping.json.

- Re-attaching rig_iii_standard_pnl_mapping.json for the fourth consecutive month.
- Manually reconciling skid-commissioning timing commentary against trial balance deltas.

**Nina Kovacs · ChatGPT Enterprise · 2026-W43 (September Close)** (`xcp_rm_01_w43b`)

> **user turn:** Convert September management accounts for Varn Precision Optics AB (SEK budget 11.20, actual 11.48) and Nordic ColdChain Logistics AS (NOK budget 11.50, actual 11.79) into EUR. Separate constant-currency operational EBITDA variance from FX translation and check Nordic ColdChain's net debt (EUR 39.8m) against LTM EBITDA (EUR 11.05m) and its 3.75x covenant.

> **assistant turn summary:** Computed Varn Optics constant-currency revenue beat (+7.8%) with -EUR 33k SEK translation drag on EBITDA, and flagged Nordic ColdChain at 3.60x net leverage (within 0.15x of its 3.75x maintenance covenant).

- Manually entering budget vs actual ECB closing FX rates for SEK, NOK, and GBP each month.
- Verifying that the assistant applies budget FX to the operational bridge and isolates the cross-term FX effect consistently.

**Gareth Jenkins · Gemini Workspace · 2026-W43 (September Close)** (`xcp_rm_01_w43c`)

> **user turn:** Merge the September variance outputs from Lukas (Kelvion, Ostmark), Nina (Varn, Nordic ColdChain), and Clara (Solvay Grid, Brenthal) into our standard 12-column Monday Partner IC summary table, sorted by covenant headroom.

> **assistant turn summary:** Combined four separate assistant exports into one table, requiring manual column-header alignment because each deal team prompt used slightly different FX variance column labels.

- Re-normalizing column names across deal-team and finance chat exports every month.
- Manually re-computing covenant headroom badges for the Monday IC deck.

### Recurrence and catalog decision

- **orchestrator:** Cairn (google-antigravity 0.1.22, gemini-4-argon, high thinking)
- **signals matched:** 7 reports from 5 distinct staff (emp_rm_02, emp_rm_03, emp_rm_05, emp_rm_07, emp_rm_08) across 3 assistant hosts within the monthly close window.; Shared output schema targeting ic_monthly_variance_table_columns.json and portfolio_financials scope.; Repeated transformations: ERP GL account mapping + constant-currency FX decomposition (SEK/NOK/GBP -> EUR) + net_debt/ltm_ebitda covenant headroom check.
- **searched catalog ids:** app_rm_kpi_ingest; app_rm_valuation_bridge; app_rm_diligence_tracker; app_rm_expert_call_log
- **closest catalog app id:** app_rm_kpi_ingest
- **closest catalog app name:** Monthly Portfolio KPI Collector v1.1.4
- **reuse gap:** app_rm_kpi_ingest accepts 6 manually typed headline totals from portfolio CFOs; it cannot ingest ERP trial balances, isolate constant-currency vs FX translation variance, or compute maintenance covenant headroom.
- **counterevidence against staying in chat:** In W39, ad-hoc chat prompting misclassified HGB account 5420 (casting scrap) under SG&A and produced inconsistent column headers across deal teams (`rep_rm_20261022_003`).
- **scope decision:** Authorized within existing portfolio_financials read-only fixture scope by Gareth Jenkins (emp_rm_07, role_fund_finance).

### Capabilities and tools

- **Fund & Portfolio Filter Bar (@heavy-rain/organization-ui):** Filters between All Funds (EUR 1.2bn), RIG-III (EUR 480m), and RIG-IV (EUR 720m) across the 4 detailed and 4 summary portfolio fixtures. implemented_in_prototype (`xcp_rm_01_w43c`)
- **Constant-Currency vs FX Translation Variance Table:** Displays Revenue and EBITDA Actual vs Budget in EUR alongside local-currency (SEK 11.48 vs 11.20, NOK 11.79 vs 11.50) operational vs FX translation breakdown. implemented_in_prototype (`xcp_rm_01_w39, xcp_rm_01_w43a, xcp_rm_01_w43b`)
- **Maintenance Covenant Headroom Inspector & Watchlist Callout:** Computes Net Debt / LTM EBITDA against each company's covenant cap and highlights Nordic ColdChain Logistics AS (3.60x vs 3.75x cap, 0.15x headroom) for IC attention. implemented_in_prototype (`xcp_rm_01_w43a, xcp_rm_01_w43b`)

### Verification and feedback

- **builder runtime:** antigravity-preview-09-2026 (environment=remote, model=gemini-4-argon, background=True, store=True) simulated deterministically in local prototype
- **testable acceptance criteria:** Checkpoint 1 (Schema check): Validates all 4 detailed company fixtures (Kelvion, Varn, Solvay Grid, Nordic ColdChain) and rejects unmapped currency columns (as demonstrated in the GBP/EUR failure recovery scenario).; Checkpoint 2 (UI assembly): Renders the Rookmere theme (@heavy-rain/organization-ui rookmere-ash-ledger) without importing @heavy-rain/system-ui (verified via npm run check:boundaries).; Checkpoint 3 (Verification): Reconciles Varn Optics (-EUR 33k FX impact) and Nordic ColdChain (3.60x vs 3.75x covenant) with zero production writes.
- **approvers:** emp_rm_07 (Gareth Jenkins, Head of Fund Finance & Valuation); emp_rm_12 (Marcus Thorne, Head of Technology & Data Operations)
- **post release feedback loop:** Operating Partner Dr. Stefan Kroll (emp_rm_05) requested adding DSO/DIO/DPO working-capital aging columns (`pat_rm_07`) as a phase-2 extension in the next weekly cutoff.

## Commercial & Financial Diligence Request List Deduplication

**Rookmere Capital · reuse_existing_app**

Deal associates working on active RIG-IV buyout screens repeatedly paste external advisor Information Request Lists (IRLs) into chat sessions to merge duplicate questions across commercial, financial, and tax workstreams before sending a unified VDR request sheet to seller management.

Eliminate duplicate VDR document requests and assign seller management owners with aging tracking.

### Conversation evidence

**Henrik Lindqvist · Claude Desktop · 2026-W41** (`xcp_rm_02_w41`)

> **user turn:** Attached are the commercial advisor IRL (82 rows) and financial QoE advisor IRL (94 rows) for Project Alpine. Deduplicate overlapping customer-churn and backlog questions and output a clean CSV with seller owner columns.

> **assistant turn summary:** Merged 29 overlapping rows into a markdown table, but dropped the advisor priority codes and VDR folder indices.

- Re-formatting advisor XLSX request lists into CSV for chat upload.
- Manually restoring VDR index numbers after assistant deduplication.

**Maya Patel · Claude Desktop · 2026-W43** (`xcp_rm_02_w43`)

> **user turn:** I have 140 financial and commercial diligence questions from two advisor workstreams on the Castel Analytical Instruments add-on screen. Merge duplicates, keep the highest priority flag, and group by seller CFO vs VP Sales.

> **assistant turn summary:** Grouped 140 questions into 108 unique requests; Maya submitted the schema headers via MCP to ask for a reusable deduplication tool.

- Prompting chat to reconcile overlapping advisor IRL spreadsheets on every new deal screen.
- Manually tracking which seller responses are overdue >5 business days.

### Recurrence and catalog decision

- **orchestrator:** Cairn (google-antigravity 0.1.22, gemini-4-argon, high thinking)
- **signals matched:** 4 reports from 2 deal-team associates (emp_rm_03, emp_rm_04) across Claude Desktop and ChatGPT Enterprise.; Input schema irl_column_headers_sample.csv matches the VDR IRL importer contract in app_rm_diligence_tracker.
- **searched catalog ids:** app_rm_diligence_tracker; app_rm_expert_call_log
- **closest catalog app id:** app_rm_diligence_tracker
- **closest catalog app name:** Diligence Request List & Q&A Tracker v2.4.1
- **reuse gap:** None. app_rm_diligence_tracker v2.4.1 already supports multi-advisor XLSX/CSV ingestion, question deduplication, seller owner routing, and response aging.
- **counterevidence against new build:** Commissioning a sandbox Builder would duplicate an approved catalog application owned by Lukas Weber (emp_rm_02) and waste sandbox token budget.
- **scope decision:** Both emp_rm_03 and emp_rm_04 already hold role_deal_team with deal_confidential permission. Direct routing requires zero additional approval gates.

### Capabilities and tools

- **Direct Catalog Match Routing Action (apps/system Work & Apps views):** Displays badge 'Existing app match · No new scope required' and triggers Notifier to send an access-checked deep link to app_rm_diligence_tracker with a pre-mapped IRL CSV template. implemented_in_prototype (`xcp_rm_02_w41, xcp_rm_02_w43`)

### Verification and feedback

- **builder runtime:** Not invoked (Catalog reuse path bypasses sandbox build).
- **testable acceptance criteria:** Clicking 'Route to existing app' on pat_rm_02 transitions cluster status to 'Routed to approved app' without opening a sandbox build stage.; Activity log records Notifier delivery to emp_rm_03 and emp_rm_04 referencing app_rm_diligence_tracker v2.4.1.
- **approvers:** Pre-authorized under existing role_deal_team scope (no redundant operator gate)
- **post release feedback loop:** Associates opened app_rm_diligence_tracker directly via the notification link; future IRL submissions use the built-in CSV importer.

## LP Side-Letter MFN & Co-Invest Allocation Obligation Matrix

**Rookmere Capital · request_missing_evidence**

Before every portfolio follow-on equity tranche or co-investment offer, Investor Relations and Compliance staff review RIG-III and RIG-IV LP side-letter clauses to verify right-of-first-offer (ROFO) notice windows, Most-Favored-Nation (MFN) fee tiers, and ESG sector exclusions.

Verify all LP side-letter notice windows and fee/exclusion covenants before issuing co-investment allocation notices without exposing restricted LP legal identities in general chat tools.

### Conversation evidence

**Jonas Bergmann · Gemini Workspace · 2026-W41** (`xcp_rm_03_w41`)

> **user turn:** I paraphrased 14 anonymized LP side-letter co-investment clauses from RIG-IV below. Group them by required notice business days (3 days, 5 days, 10 days) and commitment size threshold.

> **assistant turn summary:** Produced a summary table from the paraphrased text, but Jonas noted that manual paraphrasing of 38 LP side letters per fund is error-prone.

- Manually paraphrasing side-letter clauses to avoid pasting restricted LP names into chat.
- Cross-checking MFN commitment tiers against fund closing schedules by hand.

**Sophie Albers · Claude Desktop · 2026-W43** (`xcp_rm_03_w43a`)

> **user turn:** We are allocating the EUR 12m Solvay Grid Controls follow-on co-investment tranche next week. Which RIG-IV LPs require a <5 business-day ROFO notice or hold grid/defense telemetry ESG opt-out clauses?

> **assistant turn summary:** Could not verify completeness because raw side-letter schedules are restricted under lp_restricted_side_letters; Sophie submitted an MCP work report requesting an approved obligation matrix tool.

- Manually reviewing PDF side-letter binders with Legal before every follow-on allocation.
- Withholding attachments at MCP submission time because unredacted side letters require General Counsel clearance.

**Evelyn Shaw · Claude Desktop · 2026-W43** (`xcp_rm_03_w43b`)

> **user turn:** Draft a checklist of the 6 standard side-letter obligation categories (MFN fee tier, co-invest ROFO window, advisory committee seat, ESG exclusion list, excuse right, custom tax reporting) for RIG-III and RIG-IV.

> **assistant turn summary:** Drafted prose category descriptions, but no structured JSON Schema or redacted sample schedule was attached to the MCP report.

- Answering repetitive ad-hoc IR slack/email queries on side-letter notice periods.

### Recurrence and catalog decision

- **orchestrator:** Cairn (google-antigravity 0.1.22, gemini-4-argon, high thinking)
- **signals matched:** 3 reports from 3 staff across IR and Compliance (emp_rm_09, emp_rm_10, emp_rm_11).; Shared task topic: RIG-III/RIG-IV LP side-letter MFN, ROFO notice window, and ESG exclusion checks.; Zero approved schema attachments (`attached_evidence_artifacts: []`) and restricted scope boundary (`lp_restricted_side_letters`).
- **searched catalog ids:** app_rm_expert_call_log; app_rm_diligence_tracker; app_rm_valuation_bridge; app_rm_kpi_ingest
- **closest catalog app id:** app_rm_expert_call_log
- **closest catalog app name:** Compliance Expert Network Call Register v1.3.2
- **reuse gap:** app_rm_expert_call_log tracks expert network MNPI cooling-off rules only and has no LP fund formation or side-letter schema.
- **counterevidence against immediate build:** Commissioning a sandbox Builder without an approved, redacted obligation schema would force the Builder to guess legal clause fields and violate the lp_restricted_side_letters consent gate.
- **scope decision:** Hold build (`request_missing_evidence`). Queue targeted request to Evelyn Shaw (emp_rm_11) while allowing pat_rm_01 and pat_rm_02 in the same W43 batch to proceed unblocked.

### Capabilities and tools

- **Needs Evidence Recovery Card & Request Action (apps/system Work view):** Shows exact missing artifact ('Needs 1 redacted sample obligation schedule from Legal') and provides 'Send evidence request' and 'Defer to next weekly run' actions without blocking other weekly clusters. implemented_in_prototype (`xcp_rm_03_w41, xcp_rm_03_w43a, xcp_rm_03_w43b`)

### Verification and feedback

- **builder runtime:** Blocked prior to sandbox dispatch (0 builder tokens spent).
- **testable acceptance criteria:** Clicking 'Request missing evidence' transitions pat_rm_03 to 'Needs evidence · Request sent to Legal' while pat_rm_01 ('Portfolio variance report') continues building in System.; Macro attachment error state ('LP_tracker_macro.xlsm') names the exact file constraint and advises exporting a plain .xlsx or .csv file.
- **approvers:** emp_rm_11 (Evelyn Shaw, General Counsel & CCO — pending schema attachment)
- **post release feedback loop:** Once Evelyn Shaw attaches the anonymized obligation schedule in W44, pat_rm_03 re-enters weekly triage with verified schema evidence.

## AUGI Sable Parametric Chassis Dimension, Gauge & Material Comparison

**AUGI · build_in_sandbox**

Leading up to Concept Architecture Freeze (Gate C2) for the 800V AUGI Sable SUV, Body-in-White (BIW) architects, extrusion engineers, and mass analysts repeatedly prompt assistants to re-evaluate closed-box beam/torsion equations and structural mass deltas whenever wheelbase, track width, sill wall gauge, or alloy selections change across the three candidate skateboard architectures (SABLE-A, SABLE-B, SABLE-C).

Interactively sweep wheelbase (2920-3160 mm), front/rear track (1640-1750 mm), rocker wall gauge (2.2-4.5 mm), and structural material options in a real 3D browser viewport while comparing SABLE-A, SABLE-B, and SABLE-C side-by-side.

### Conversation evidence

**Lukas Lindner · Claude Desktop · 2026-W41** (`xcp_augi_01_w41`)

> **user turn:** Using our Bredt-Batho closed-section torsion approximation for the AUGI Sable skateboard, compare SABLE-A (modular 6082-T6 extrusion + bolt-in pack, 3040 mm wheelbase, 1690/1700 mm track, 3.2 mm wall) against SABLE-B (Cell-to-Body 82% pack shear coupling + 22MnB5 boron torque rings, 3.0 mm wall). What happens if we stretch wheelbase to 3120 mm?

> **assistant turn summary:** Computed SABLE-A at 384 kg and 34.2 kN·m/deg vs SABLE-B at 356 kg and 44.6 kN·m/deg at 3040 mm, and showed a -2.2% stiffness dip at 3120 mm—as a static text table with no 3D spatial overlay.

- Pasting the 3-configuration section-property JSON block into chat every time packaging changes wheelbase or track by 10-20 mm.
- Mentally translating 1D tabular stiffness deltas onto 3D sill and crossmember geometry.

**Kenji Takahashi · Claude Desktop · 2026-W42** (`xcp_augi_01_w42`)

> **user turn:** Sweep the 6-chamber AA 6082-T6 rocker extrusion wall gauge from 2.2 mm to 4.5 mm in 0.2 mm steps on SABLE-B (195x135 mm section) and SABLE-C (200x135 mm section with AlSi7Mg C611 megacastings). Plot structural mass (kg) vs torsional stiffness (kN·m/deg).

> **assistant turn summary:** Generated a static CSV table for the 12 gauge steps; Kenji had to re-run the prompt when Vehicle Dynamics asked to widen rear track from 1700 mm to 1720 mm.

- Re-running whole chat scripts whenever a single parameter (wall gauge or rear track) is adjusted during design reviews.

**Claire Dubois · ChatGPT Enterprise · 2026-W43** (`xcp_augi_01_w43`)

> **user turn:** Reconcile the lower-chassis part count, SPR count, structural adhesive length, and CoG Z-height across SABLE-A (142 parts, 384 kg, Z=248 mm), SABLE-B (86 parts, 356 kg, Z=234 mm), and SABLE-C (31 parts, 338 kg, Z=229 mm) for the Gate C2 architecture deck.

> **assistant turn summary:** Formatted a comparison table; Claire submitted the parametric envelope and mass-scaling equations via MCP so teams could inspect the 3D geometry and mass/stiffness tradeoffs in one shared tool.

- Manually synchronizing spreadsheet mass rollups with BIW stiffness scripts after each geometry tweak.

### Recurrence and catalog decision

- **orchestrator:** Cairn (google-antigravity 0.1.22, gemini-4-argon, high thinking)
- **signals matched:** Part of 9 weekly reports from 6 distinct engineers (emp_augi_01..05, emp_augi_07) referencing prog_augi_sable and Gate C2 chassis tradeoffs.; Identical parametric axes (wheelbase_mm 2920-3160, track_mm 1640-1750, rocker_wall_gauge_mm 2.2-4.5) and analytical Bredt-Batho / Euler-Bernoulli scaling formulas.
- **searched catalog ids:** app_augi_bom_mass_ledger; app_augi_fastener_weld_matrix; app_augi_pack_thermal_clearance
- **closest catalog app id:** app_augi_bom_mass_ledger
- **closest catalog app name:** Sable Subsystem Mass & Center-of-Gravity Ledger v3.1.0
- **reuse gap:** app_augi_bom_mass_ledger tracks static tabular part masses only; it has no interactive 3D WebGL geometry, no parametric dimension/gauge sliders, and no torsional/bending stiffness calculations.
- **counterevidence against staying in chat:** Static chat tables cannot show spatial 3D proportion changes (wheelbase stretch, track widening, sill gauge thickening) or maintain synchronized Baseline vs Candidate comparisons during live Gate C2 engineering reviews.
- **scope decision:** Authorized for sandbox build by Lukas Lindner (emp_augi_01, role_biw_structures) and Devendra Rao (emp_augi_08, role_engineering_it).

### Capabilities and tools

- **Interactive 3D Chassis Viewport & 6 Camera Presets (@heavy-rain/organization-3d):** Real-time Three.js / WebGL procedural chassis mesh with Orbit, Pan, Zoom, Tilt, Reset View, and 6 one-click presets (Isometric, Side profile, Top plan, Front bay, Underbody, Reset view). implemented_in_prototype (`xcp_augi_01_w41`)
- **Parametric Geometry & Material Control Dock (@heavy-rain/organization-ui):** Sliders and validated numeric inputs for Wheelbase, Track width, Wall gauge, and Material alloy with out-of-range recovery. implemented_in_prototype (`xcp_augi_01_w41, xcp_augi_01_w42`)
- **Baseline vs Candidate 3D Wireframe Overlay & Delta Table:** Compares SABLE-A, SABLE-B, and SABLE-C (or custom candidate edits) side-by-side in the right dock and overlays a ghost reference wireframe in 3D space. implemented_in_prototype (`xcp_augi_01_w41, xcp_augi_01_w43`)

### Verification and feedback

- **builder runtime:** antigravity-preview-09-2026 (environment=remote, model=gemini-4-argon, background=True, store=True) simulated deterministically in local prototype; local workspace verified via npm run test and npm run build.
- **testable acceptance criteria:** Unit tests in apps/augi-engineering/src/model/chassisModel.test.ts verify directional monotonicity of mass, torsional stiffness, and bending deflection across parameter sweeps.; UI boundary check (npm run check:boundaries) confirms zero imports from @heavy-rain/system-ui.; Out-of-bounds numeric input (e.g., 3900 mm wheelbase) preserves the last valid 3D mesh while displaying a specific recovery message.
- **approvers:** emp_augi_01 (Lukas Lindner, Lead Chassis & BIW Architect); emp_augi_08 (Devendra Rao, Head of Engineering Tooling & Sandbox Operations)
- **post release feedback loop:** Saved study snapshots in apps/augi-engineering sync back to the operator review inspector in apps/system.

## AUGI Sable Underbody Exploded Assembly & Pack-to-Sill Clearance Review

**AUGI · build_in_sandbox**

Battery enclosure, megacasting, and BIW engineers repeatedly ask assistants to generate ad-hoc 3D/2D exploded diagrams separating the 5 lower-chassis subsystems (front subframe, rear megacasting, side sill extrusions, crossmember ladder, and 800V battery pack tray) so they can review seal-flange interfaces, part consolidation (142 parts -> 86 parts -> 31 parts), and fastener tool access.

Separate the 5 major chassis subassemblies interactively along axial vectors (0%-100% exploded timeline), select individual subsystems to inspect their mass/material/joining contribution, and check cross-sectional clearances.

### Conversation evidence

**Matteo Conti · Claude Desktop · 2026-W41** (`xcp_augi_02_w41`)

> **user turn:** Generate a Three.js snippet that explodes the AUGI Sable lower skateboard along X, Y, and Z: drop the 108 kWh 800V battery pack downward (-Z), push the left and right 6082-T6 side sills outward (±Y), lift the crossmember ladder (+Z), and translate the front and rear subframes along ±X so we can explain the SABLE-A bolt-in tray vs SABLE-B Cell-to-Body top-cover shear seal.

> **assistant turn summary:** Produced an uncalibrated snippet where the sill extrusions overlapped the front shock towers because subassembly bounding boxes were not tied to the parametric wheelbase.

- Hand-editing translation offsets in one-off Three.js scripts whenever wheelbase or track width changes.
- Manually annotating part counts and adhesive bond lengths (48.5 m vs 74.0 m vs 61.0 m) on static screenshots.

**Dr. Astrid Vestergaard · Gemini Workspace · 2026-W43** (`xcp_augi_02_w43`)

> **user turn:** For the SABLE-C review, we need to isolate the single-piece HPDC AlSi7Mg rear megacasting (with integral shock towers and variable 2.6-4.8 mm ribs) from the extruded 6082-T6 side sills and bolt-on outer crush cans, showing how it replaces 38 stamped/welded rear cradle parts from SABLE-A.

> **assistant turn summary:** Listed the consolidated part breakdown in text; Astrid submitted the subassembly explosion vectors and part-group metadata via MCP to include interactive exploded-view and part selection in the 3D comparator.

- Exporting static subassembly screenshots for every Gate C2 design review.
- Switching between the 2D pack clearance checker and separate BoM spreadsheets to explain subassembly interfaces.

### Recurrence and catalog decision

- **orchestrator:** Cairn (google-antigravity 0.1.22, gemini-4-argon, high thinking)
- **signals matched:** Co-clustered into wf_augi_01 because reports share the exact SABLE-A / SABLE-B / SABLE-C parametric geometry tree and target the same 3D browser inspection workbench.
- **searched catalog ids:** app_augi_pack_thermal_clearance; app_augi_bom_mass_ledger
- **closest catalog app id:** app_augi_pack_thermal_clearance
- **closest catalog app name:** 800V Pack Envelope & Skid-Plate Clearance Checker v1.4.2
- **reuse gap:** app_augi_pack_thermal_clearance validates static 2D cross-section tolerance tables only; it cannot render 3D subassemblies, animate axial exploded separation, or highlight individual structural subsystems.
- **counterevidence against separate app:** Building a standalone exploded viewer separate from the 3D stiffness comparator would force engineers to maintain two duplicate 3D chassis scene graphs.
- **scope decision:** Included as an integrated capability inside app_augi_sable_chassis_3d (apps/augi-engineering).

### Capabilities and tools

- **5-Subassembly Exploded View Slider (0%-100%) & Leader Labels:** Smoothly translates Front Cradle (+X), Rear Megacasting (-X), Left/Right Sill Extrusions (±Y), Crossmember Ladder (+Z), and 800V Structural Battery Tray (-Z) in proportion to the explosion slider (or steps discretely under reduced motion). implemented_in_prototype (`xcp_augi_02_w41, xcp_augi_02_w43`)
- **Interactive 3D Part / Subassembly Selection & Inspector Readout:** Allows selecting a subassembly in the 3D viewport or inspector to inspect its alloy, part count consolidation (142 -> 86 -> 31), adhesive length, and SPR count. implemented_in_prototype (`xcp_augi_02_w43`)
- **Arbitrary 3D Plane Section Clipping & Seal-Bead Cross-Section Slicer:** Exploratory proposal shown in advanced 3D design mockups for slicing arbitrary X/Y/Z planes through the sill-to-pack adhesive flange; documented on the packages/organization-3d roadmap while the current prototype implements camera presets (Front bay, Underbody) and axial exploded separation. exploratory_roadmap_proposal (`xcp_augi_02_w41`)

### Verification and feedback

- **builder runtime:** antigravity-preview-09-2026 (environment=remote, model=gemini-4-argon) simulated in local prototype.
- **testable acceptance criteria:** Adjusting the Exploded View control separates the 5 subassembly groups along their defined ±X, ±Y, ±Z vectors without corrupting wheelbase or track dimensions.; Enabling Reduced Motion disables continuous oscillation while preserving direct exploded pose inspection.
- **approvers:** emp_augi_03 (Matteo Conti, 800V Structural Battery Enclosure Lead); emp_augi_01 (Lukas Lindner, Lead Chassis & BIW Architect)
- **post release feedback loop:** Engineers requested adding interactive arbitrary clipping planes in a future iteration (`tool_org3d_clipping_plane`), tracked as an explicit roadmap item.

## Suspension Hardpoint Load-Case & Twist/Bending Deformation Comparison

**AUGI · build_in_sandbox**

Vehicle dynamics and NVH engineers repeatedly prompt assistants to evaluate how static axle-twist torsion (18,000 N·m couple), 3-point vertical curb bending (32,000 N pack/cabin load), and quasi-static cornering shear (24,000 N lateral load) deform the chassis along the wheelbase, and how visual amplification should be scaled so millimeter-level elastic deflections are legible in design reviews.

Switch between Torsion, Vertical Bending, and Lateral Cornering load cases, animate exaggerated elastic deformation with an explicit amplification badge (e.g., 45x-60x), and inspect unscaled physical engineering values (deg, mm, kN·m/deg, Hz) beside a clear model-limitations notice.

### Conversation evidence

**Hannah Bergström · ChatGPT Enterprise · 2026-W41** (`xcp_augi_03_w41`)

> **user turn:** Apply an opposing vertical wheel couple of 18,000 N·m (±10.65 kN across the 1690 mm front track) with the rear shock towers pinned. Compute the twist angle profile theta(x) from rear axle to front axle for SABLE-A (34.2 kN·m/deg), SABLE-B (44.6 kN·m/deg), and SABLE-C (49.8 kN·m/deg), and also compute mid-span vertical sag under a 32,000 N distributed load.

> **assistant turn summary:** Returned peak twist angles (0.526 deg, 0.404 deg, 0.361 deg) and mid-span sag (2.16 mm, 1.69 mm, 1.57 mm), plus a 2D matplotlib chart that had to be regenerated whenever sill gauge changed.

- Re-generating static 2D deflection plots in chat every time BIW updates rocker wall gauge or wheelbase.
- Adding manual slide footnotes explaining that visual mesh deformation is amplified 45x-60x while numbers stay in physical units.

**Viktor Novak · Gemini Workspace · 2026-W43** (`xcp_augi_03_w43`)

> **user turn:** Estimate the first global body torsion mode frequency (f_1 approx proportional to sqrt(K_t / M_eff)) and lateral subframe compliance under a 24,000 N cornering load (52% front / 48% rear) across SABLE-A, SABLE-B, and SABLE-C. Make sure the summary states this is a lumped-beam concept approximation and not a Nastran normal-modes FEA run.

> **assistant turn summary:** Calculated concept modal frequencies (36.5 Hz, 42.1 Hz, 45.4 Hz) and lateral cradle deflections (1.42 mm, 1.08 mm, 0.89 mm); Viktor submitted the load-case definitions and required limitation wording via MCP.

- Manually copying limitation disclaimers onto every concept stiffness table so program management does not confuse beam approximations with Nastran/LS-DYNA crash or modal solver sign-off.

### Recurrence and catalog decision

- **orchestrator:** Cairn (google-antigravity 0.1.22, gemini-4-argon, high thinking)
- **signals matched:** Co-clustered into wf_augi_01: links directly to the SABLE-A/B/C parametric model and supplies the 3 load-case formulas (`lc_torsion_axle_twist`, `lc_bending_curb_sag`, `lc_lateral_subframe_shear`) and inline limitation notice.
- **searched catalog ids:** app_augi_bom_mass_ledger; app_augi_fastener_weld_matrix; app_augi_pack_thermal_clearance
- **closest catalog app id:** None
- **closest catalog app name:** None
- **reuse gap:** No approved catalog app computes static torsion/bending/lateral load cases or renders 3D deformed meshes and strain color ramps.
- **counterevidence against unqualified numbers:** Displaying stiffness or deflection numbers without an adjacent analytical scope notice risks misinterpretation as certified FEA; hence the inline disclosure requirement from emp_augi_07 is mandatory.
- **scope decision:** Included in app_augi_sable_chassis_3d with mandatory inline limitation block.

### Capabilities and tools

- **Load-Case Selector, Force Vectors & Animated 3D Elastic Deformation:** Switches between Static Axle-Twist Torsion (18,000 N·m), Symmetric 3-Point Vertical Bending (32,000 N), and Cornering Subframe Shear (24,000 N), rendering directional load arrows, relative strain shading, and explicit visual amplification badges (e.g., 45x, 60x, 50x or user-selected scale). implemented_in_prototype (`xcp_augi_03_w41, xcp_augi_03_w43`)
- **Adjacent Concept Approximation Scope & Non-Claims Notice:** Placed directly beside the stiffness and deflection readouts in the right dock, stating units (mm, kg, kN·m/deg) and clarifying that outputs are analytical beam/shell approximations—never FEA solver validation or crashworthiness certification. implemented_in_prototype (`xcp_augi_03_w43`)
- **Spanwise Deflection / Twist Profile Curve & KPI Delta Readout:** Displays quantitative twist/sag/compliance readouts and comparative profile charts across longitudinal chassis stations (full multi-axis modal frequency waterfall plots seen in exploratory mockups remain on the future roadmap). implemented_in_prototype_with_advanced_plots_on_roadmap (`xcp_augi_03_w41`)

### Verification and feedback

- **builder runtime:** antigravity-preview-09-2026 (environment=remote, model=gemini-4-argon) simulated in local prototype; analytical formulas tested via npm run test.
- **testable acceptance criteria:** Switching load cases updates the 3D force vectors, strain shading, and numerical readouts deterministically.; The inline Concept Approximation Scope disclosure is rendered directly adjacent to the numerical metrics in the right dock.
- **approvers:** emp_augi_04 (Hannah Bergström, Principal Engineer, Torsional Stiffness & Ride Dynamics); emp_augi_08 (Devendra Rao, Head of Engineering Tooling & Sandbox Operations)
- **post release feedback loop:** Dynamics engineers requested coupling the static lateral compliance output to bush-stiffness sensitivity tables in a subsequent cycle.

## Aluminum-to-Boron Flange Joining & Supplier Material Certificate Reuse

**AUGI · reuse_existing_app**

Materials, casting, and BIW engineers repeatedly paste supplier alloy mill-certificate parameters (AA 6082-T6, AlSi7Mg C611, 22MnB5 hot-stamped boron steel) and mixed-material flange thickness pairs into chat to check approved self-piercing rivet (SPR) die combinations, flow-drill screw (FDS) stackups, and galvanic structural epoxy bead rules.

Verify approved SPR/FDS fastener codes, galvanic isolation adhesive thickness, and supplier alloy yield/elongation bounds for mixed aluminum-to-boron-steel joints.

### Conversation evidence

**Kenji Takahashi · Claude Desktop · 2026-W41** (`xcp_augi_04_w41`)

> **user turn:** We are joining a 3.0 mm AA 6082-T6 top sill flange to a 1.8 mm 22MnB5 boron steel B-pillar torque ring on SABLE-B. Which self-piercing rivet (SPR) or flow-drill screw (FDS) stackup and structural epoxy bond-line thickness prevent galvanic corrosion and die cracking?

> **assistant turn summary:** Suggested a generic semi-tubular rivet that cannot pierce 1,500 MPa hot-stamped 22MnB5 boron steel without a pre-punched pilot hole or bush transition.

- Prompting general chat models on mixed-material joining rules and having to manually correct UHSS boron steel piercing constraints.

**Dr. Astrid Vestergaard · Gemini Workspace · 2026-W43** (`xcp_augi_04_w43`)

> **user turn:** Check supplier heat-batch certificate spec AlSi7Mg-C611-F (0.2% proof stress >= 195 MPa, elongation A5 >= 10%) for the SABLE-C rear megacasting flange where it bonds and rivets to the 3.4 mm 6082-T6 rocker extrusion.

> **assistant turn summary:** Validated the alloy batch numbers against the pasted prompt text; Astrid submitted the flange stackup query via MCP to route engineers to the authoritative registry.

- Pasting alloy certificate tables and flange thickness pairs into chat instead of querying the internal joining & material registry.

### Recurrence and catalog decision

- **orchestrator:** Cairn (google-antigravity 0.1.22, gemini-4-argon, high thinking)
- **signals matched:** 4 reports from 2 engineers (emp_augi_02, emp_augi_05) matching joining_schedules and material_cards scopes.; Distinct from wf_augi_03 (rear megacasting vacuum-assist runner porosity, which requires NDA-restricted foundry thermal sensor logs and is held under request_missing_evidence).
- **searched catalog ids:** app_augi_fastener_weld_matrix; app_augi_bom_mass_ledger; app_augi_pack_thermal_clearance
- **closest catalog app id:** app_augi_fastener_weld_matrix
- **closest catalog app name:** BIW Mixed-Material Joining & Adhesive Registry v2.0.3
- **reuse gap:** None. app_augi_fastener_weld_matrix v2.0.3 already catalogs approved SPR die sets, pre-hole FDS rules for 22MnB5 boron steel, structural epoxy bead tolerances, and supplier alloy certificate acceptance windows.
- **counterevidence against new build:** General chat prompts hallucinated unworkable direct SPR piercing through hot-stamped 22MnB5 boron steel (`xcp_augi_04_w41`), whereas the approved catalog registry (`app_augi_fastener_weld_matrix`) already enforces validated BIW joining rules.
- **scope decision:** Both emp_augi_02 (`role_materials_joining`) and emp_augi_05 (`role_biw_structures`) already hold access to `app_augi_fastener_weld_matrix`. Route directly with no extra approval gate.

### Capabilities and tools

- **Direct Catalog Reuse Routing Action (apps/system Work & Apps views):** Routes reporting engineers directly to app_augi_fastener_weld_matrix v2.0.3 with pre-populated SABLE-B and SABLE-C flange stackup filters, while keeping wf_augi_03 (foundry porosity) held separately for missing NDA schema evidence. implemented_in_prototype (`xcp_augi_04_w41, xcp_augi_04_w43`)

### Verification and feedback

- **builder runtime:** Not invoked (Catalog reuse path bypasses sandbox build).
- **testable acceptance criteria:** Clicking 'Route to existing app' on the AUGI reuse cluster transitions status to 'Routed to approved app' and logs a Notifier delivery event in Activity without spawning a Builder run.
- **approvers:** Pre-authorized under existing role_biw_structures and role_materials_joining scopes
- **post release feedback loop:** Engineers linked joint IDs from app_augi_fastener_weld_matrix back to the 5 subassembly groups in app_augi_sable_chassis_3d.

## Marcus Vance Context Transfer

### 1. Synthetic Persona Prompt and Weekly Workflow Source
- **Persona identity:** Marcus Vance (`MV`), `VP, Deal Sourcing & Screening` on the Growth Equity Deal Team ([Marcus fixture](../../HeavyRain_BDMD/backend/mock_org_data.py), `workspace_messages.m_msg_3` and `fragmented_workflow`). All scenario facts represent a synthetic sample persona rather than measured production surveillance.
- **Pre-call prompt evidence:** In the sample VeloceAI Series B intro call scenario (CEO Liam Chen), Marcus manually combines four-month-old Affinity CRM notes, three Google News headlines, and text from Liam's email (`$8.4M ARR`, up `140% YoY`, two Fortune 500 logistics logos) into a custom screening skill using the verbatim prompt:
  > "Here are my messy CRM notes from 4 months ago, 3 Google News headlines on VeloceAI, and text from Liam's email. Run my deal screening skill and give me 5 questions to ask."
- **Seven-step workflow:** Across 14+ weekly founder calls, the synthetic workflow spans:
  1. Outlook Calendar 15-minute meeting reminder with no brief prepared.
  2. Manual search across Affinity CRM and Outlook for prior notes and teaser decks.
  3. Manual Google Search and Google News queries for company and competitor updates.
  4. Manual paste into Claude or Gemini to generate five pre-call screening questions.
  5. Call recording and shorthand note capture in Zoom and Granola.
  6. Manual transcript export from Granola into Gemini/Claude to format an investment committee deal note.
  7. Manual copy of the summary into an Outlook email to the deal team and manual entry of six Affinity CRM fields.

### 2. Scenario Evidence, Counterevidence, and Scope Adjustments
- **Evidence for connected pre-call and post-call views:** Marcus's existing AI prompts (Claude/Gemini screening skill and Granola transcription) already produce useful outputs; the friction comes from re-collecting inputs before the call and re-formatting outputs afterward.
- **Counterevidence 1 — Manual diligence risk additions:** In the synthetic Week 1 beta feedback, Marcus manually added a three-bullet diligence risks and open questions list to 11 of 14 post-call emails (capturing items from the Granola transcript such as `$280k/mo` burn, a `$22M` Series B target, and a 60-day enterprise security review bottleneck). The proposed `DealPulse AutoBrief` scope therefore elevates three editable diligence risks into the core post-call summary.
- **Counterevidence 2 — Unused public market comps ticker:** The synthetic fixture records that the public market comp ticker went unused during early-stage Series A/B screening calls (the fixture contains an internal discrepancy between `"0 clicks"` in its narrative diff and `4` in `usage_rate_pct`). To avoid overclaiming or repeating conflicting synthetic numbers, the UI rationale states plainly that the public comps ticker went unused and added visual clutter in sample feedback, and excludes the ticker from both the proposed app description and the default build brief.

### 3. Catalog and Shared-Processing Fit
- **Fixture overlap context:** The underlying synthetic fixture notes potential shared subtasks with Elena Rostova's `DiscoveryOS: Persona & Call Aggregator` (calendar trigger, Granola transcript ingestion, and Gemini post-call synthesis) alongside persona-specific output adapters (Marcus outputs to a deal-team email and six Affinity CRM fields).
- **Current runtime boundary:** Per the October 25 owner correction, the `"68% Shared DNA"` badge is removed from [`HeavyRain_BDMD/frontend/src/App.tsx`](../../HeavyRain_BDMD/frontend/src/App.tsx), and [`HeavyRain_BDMD/frontend/src/transfer/transferContext.ts`](../../HeavyRain_BDMD/frontend/src/transfer/transferContext.ts) submits `LiveBuildRequestPayload` directly to `/api/v1/orgs/meridian/builds/live` without executing an automated catalog deduplication check in the frontend.

### 4. Operator-Directed Build Decision and Planned Sandbox Capabilities
- **Operator-directed submission:** Mounting [`HeavyRain_BDMD/frontend/src/App.tsx`](../../HeavyRain_BDMD/frontend/src/App.tsx) pre-fills the `Context` textarea with the 70–95-word `DealPulse AutoBrief` brief only when `sessionStorage` (`heavyrain.bdmd.marcus.transfer.v1`) holds no existing draft or accepted record. Page load never initiates a build; the operator can inspect and edit the full brief before activating `Transfer Context`.
- **Planned capabilities in the default brief:**
  - Local editable pre-call inputs pre-loaded with synthetic VeloceAI CRM notes, founder email metrics, and news headlines paired with five screening questions.
  - Local editable post-call Granola notes generating a structured deal summary and three diligence risks.
  - Local reviewable deal-team email draft and six Affinity field updates, with no live calendar/CRM integrations and no external sends.

### 5. Verification Requirements
Completion of this frontend update requires verifying:
1. **Copy and static checks:** `copy-check.mjs --strict`, TypeScript typechecking (`tsc --noEmit`), and production build (`vite build`) in `HeavyRain_BDMD/frontend`.
2. **Controller and UI unit tests ([`HeavyRain_BDMD/frontend/src/transfer/transferContext.ts`](../../HeavyRain_BDMD/frontend/src/transfer/transferContext.ts), [`HeavyRain_BDMD/frontend/src/App.tsx`](../../HeavyRain_BDMD/frontend/src/App.tsx)):**
   - Default context pre-populates when storage is empty and yields to restored `pending`, `ambiguous_error`, or `accepted` session records.
   - Rendering `<App />` performs zero automatic `POST` requests.
   - The `Context` textarea is disabled while `viewState.inFlight` is `true`.
   - `HTTP 409` conflict responses populate a non-null `consoleUrl` so the `Open Heavy Rain` link renders and points to the Meridian console.
   - Requests exceeding the bounded 30-second timeout abort cleanly, surface `copy.errorUnknownOutcome`, persist `ambiguous_error`, and retain the same `idempotency_key` on retry (verified via injected short timeout and mocked `fetchFn` without paid live builds).
3. **Responsive layout checks:** Visual inspection of the single-column white layout at `390px`, `1280px`, and `1440px` viewports.
