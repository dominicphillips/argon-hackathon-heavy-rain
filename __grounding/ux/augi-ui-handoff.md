# AUGI Sable 3D concept chassis study implementation brief (`apps/augi-engineering` and `packages/organization-ui`)

**Consumer:** `agy` UI builder implementing `packages/organization-ui` (AUGI theme) and `apps/augi-engineering` (also embedded/launched from `apps/system` via `Open organization app`).
**Grounding date:** 2026-10-25.
**Related files:** [`journey.md`](./journey.md), [`augi-flow.mmd`](./augi-flow.mmd), [`system-ui-handoff.md`](./system-ui-handoff.md).

---

## 1. Purpose, library boundary, and brand rules

- **Fictional organization:** **AUGI** (automotive manufacturer). Do not reference any real automaker, trademark, or external vehicle line anywhere in UI text, code comments, or preset names.
- **Subject:** **AUGI Sable** (premium electric SUV concept skateboard/spaceframe chassis study).
- **Package boundary:** Build all AUGI interface shells, parameter panels, comparison tables, and badges inside `packages/organization-ui` using the **AUGI theme** (distinct from Rookmere Capital's theme and completely separate from `packages/heavy-rain-ui`). `apps/augi-engineering` and `packages/organization-ui` must **never** import `packages/heavy-rain-ui`.
- **Interactive 3D requirement:** Render actual procedural/parametric 3D chassis geometry in the browser using **Three.js / React Three Fiber (`@react-three/fiber` and `@react-three/drei`)**—including front and rear cast subframes, longitudinal sill extrusions, cross-members, structural battery pack tray, and shock towers. Never substitute a pre-rendered video or static image for the 3D viewport.

---

## 2. Spatial layout and return navigation

When opened standalone (`apps/augi-engineering`) or launched from Heavy Rain (`Open organization app` in `System` or `Apps`), the interface uses a 3D-first engineering workbench layout at 1440 px and 1280 px:

| Zone | Dimensions | Controls and content |
| --- | --- | --- |
| **Top application bar** | Full width, `48 px` height | App title (`AUGI Sable · Concept Chassis Stiffness & Mass Study`), active configuration badge (`Baseline A` or `Candidate B`), unit system selector (`Metric: mm · kN · kNm/deg` default, optional `Imperial: in · lbf` conversion), `Save configuration`, `Reset to Baseline A`, and conditional `Back to Heavy Rain System` button when opened from the operator UI. |
| **Left engineering parameter dock** | `280 px–300 px` width | Preset configuration selector, parametric sliders/inputs (`Wheelbase`, `Track width`, `Extrusion wall gauge`, `Cross-member count`), material specification selector, and load-case selector (`Torsional twist`, `Vertical beam bending`, `Combined cornering`). |
| **Center 3D WebGL stage** | `55%–62%` of viewport width, full height | Interactive Three.js canvas with ground reference grid, coordinate triad (`X Roll / Longitudinal`, `Y Pitch / Lateral`, `Z Yaw / Vertical`), floating camera preset bar, exploded-view slider, and deformation animation playback controls. |
| **Right results & comparison dock** | `320 px–340 px` width | Calculated concept metrics (`Estimated torsional stiffness`, `Peak vertical deflection`, `Estimated structural mass`, `Stiffness-to-mass ratio`), side-by-side `Baseline A vs Candidate B` delta table, and **adjacent model assumptions & limitations note**. |

---

## 3. 3D camera controls, presets, and accessibility

### Pointer, wheel, and keyboard camera manipulation
- **Orbit:** Left-click drag (or one-finger drag) rotates azimuth and elevation smoothly around the chassis center of mass (`OrbitControls` with damping). Keyboard equivalent when canvas is focused: `ArrowLeft` / `ArrowRight` (azimuth `±5°`), `ArrowUp` / `ArrowDown` (elevation `±5°`).
- **Pan:** Right-click drag or `Shift + Left-click drag` translates the look-at target along the view plane. Keyboard equivalent: `W` `A` `S` `D`.
- **Zoom:** Scroll wheel or pinch zooms between `1.8 m` (subframe joint close-up) and `9.0 m` (full bay overview). Keyboard equivalent: `+` / `=` and `-`.
- **Tilt / roll inspection:** Preset underbody and oblique angles allow clear inspection of battery tray cross-members and longitudinal rails without camera gimbal lock.

### Quick camera presets (floating HUD pill bar at top-center of 3D stage)
Provide six explicit one-click buttons with visible active state and keyboard shortcuts:
1. `Isometric` (`1` — default 3/4 front-left elevated engineering view)
2. `Side profile` (`2` — orthographic-style lateral view showing wheelbase and sill height)
3. `Top plan` (`3` — plan view showing track width, cross-members, and load paths)
4. `Front bay` (`4` — front cast subframe, shock towers, and crush-rail geometry)
5. `Underbody` (`5` — upward view of structural battery tray and shear plate)
6. `Reset view` (`R` — restores `Isometric` framing and re-centers target at `[0, 0, 0]`)

---

## 4. Parametric chassis configurations, materials, and units

Changing any parameter immediately updates the 3D mesh dimensions/colors and recomputes the concept structural formulas:

### Preset configurations (for instant one-click comparison)
| Preset ID | Label | Wheelbase | Front/Rear Track | Rail wall gauge | Primary material | Intended trade-off |
| --- | --- | --- | --- | --- | --- | --- |
| `baseline-a` | `Baseline A · Standard Range SUV` | `2980 mm` | `1680 mm` | `3.2 mm` | `6061-T6 Aluminum extrusion + megacastings` | Balanced mass (`384 kg`) and torsional rigidity (`34.2 kNm/deg`). |
| `candidate-b` | `Candidate B · Long-Wheelbase Stiffened` | `3120 mm` | `1710 mm` | `4.0 mm` | `7075-T6 Aluminum + UHSS cross-members` | Higher torsional rigidity (`41.8 kNm/deg`) and longer cabin span at `+38 kg` mass penalty. |
| `candidate-c` | `Candidate C · Lightweight Mass Target` | `2920 mm` | `1660 mm` | `2.6 mm` | `6061-T6 Aluminum + CFRP shear panel` | Lower structural mass (`341 kg`), increased vertical bending deflection under load. |

### Adjustable geometry and material controls (with validation ranges)
- **Wheelbase (`mm`):** Range `2800 mm` to `3250 mm` (step `10 mm`). Stretches longitudinal sill extrusions and battery tray bay length in real time.
- **Track width (`mm`):** Range `1600 mm` to `1780 mm` (step `10 mm`). Adjusts subframe width and cross-member span.
- **Extrusion wall gauge (`mm`):** Range `2.0 mm` to `5.5 mm` (step `0.2 mm`). Updates section modulus in the beam calculation and thickens rendered rail cross-sections.
- **Structural material selection:**
  - `6061-T6 Aluminum Alloy` ($E = 68.9\text{ GPa}$, $\rho = 2.70\text{ g/cm}^3$)
  - `7075-T6 High-Strength Aluminum` ($E = 71.7\text{ GPa}$, $\rho = 2.81\text{ g/cm}^3$)
  - `Dual-Phase Steel + Aluminum Hybrid` ($E_{\text{eff}} = 135.0\text{ GPa}$, $\rho_{\text{eff}} = 4.65\text{ g/cm}^3$)
  - `Aluminum + Carbon-Fiber Shear Tray` ($E_{\text{eff}} = 88.0\text{ GPa}$, $\rho_{\text{eff}} = 2.42\text{ g/cm}^3$)

If a user types an out-of-range number into a numeric input, keep their typed value visible, highlight the field with a specific constraint message (`Wheelbase must be between 2800 mm and 3250 mm. Enter a value in that range or click Reset parameter.`), and do not corrupt the 3D scene.

---

## 5. Concept torsion and bending model, exploded view, and deformation animation

### Illustrative analytical engineering model (real math, transparent assumptions)
Compute deterministic concept approximations from beam and torsion theory so every slider change produces physically directional, repeatable output:
- **Torsional load case (`Torsional twist · ±15 kNm front axle couple`):** Applies opposite vertical forces at the front left and front right damper towers while constraining the rear axle mounts. Computes concept torsional stiffness $K_t$ ($\text{kNm/deg}$), maximum twist angle $\theta$ ($\text{deg}$), and relative strain shading across the sill rails and battery shear tray.
- **Vertical bending load case (`Vertical beam bending · 18 kN distributed pack + cabin load`):** Applies downward distributed load along the wheelbase between front and rear axle supports ($\delta \propto \frac{F \cdot L^3}{E \cdot I}$). Computes mid-span vertical sag ($\text{mm}$) and longitudinal rail bending strain.
- **Combined cornering load case (`Combined 1.1g lateral + bump load`):** Superimposes asymmetric vertical and lateral strut loads for visual strain-path inspection.

### Exploded view and force/deformation animation controls
- **Assembly / Exploded view (`Exploded view` toggle + `0%–100%` separation slider):** Separates the 5 major sub-assemblies along clear axial vectors with leader labels:
  1. `Front cast subframe & shock towers` (moves forward along $+X$)
  2. `Rear cast subframe & motor cradle` (moves aft along $-X$)
  3. `Left & right longitudinal sill extrusions` (move outward along $\pm Y$)
  4. `Cross-member ladder & seat beams` (lifts upward along $+Z$)
  5. `Structural battery tray & bottom shear plate` (drops downward along $-Z$)
- **Force & deformation animation (`Play deformation` / `Pause` + amplification factor `1x Real scale` | `15x Visualized` | `30x Visualized`):**
  - Renders directional load arrows at the front/rear strut mounts and animates elastic mesh displacement (twist or mid-span sag) with a normalized strain color ramp (` Low`, `Moderate`, `Peak concept strain` — paired with numeric legend in $\text{MPa (approx.)}$).
  - Clearly label the visual amplification factor (`Deformation scaled 20x for visibility`) right on the viewport HUD so users never mistake exaggerated visual displacement for literal millimeter sag.
- **Reduced motion (`prefers-reduced-motion: reduce` or toggle):** Disables continuous oscillation of the deformation cycle; switching load cases or moving the exploded-view slider steps directly to the target static displaced/exploded pose.

---

## 6. Configuration compare, save, and reset flows

1. **Pin and compare (`Compare with Baseline A`):**
   - Users can edit parameters as `Candidate B` and toggle `Compare configurations`.
   - **3D viewport compare mode:** Renders `Baseline A` as a crisp ghost wireframe overlay (`#8FAEFF` outline) simultaneously with the solid shaded `Candidate B` mesh so wheelbase, track width, and deflection differences are immediately visible in 3D space.
   - **Right dock comparison table:** Shows `Baseline A`, `Candidate B`, and signed delta (`+22.2% torsional stiffness`, `+38.0 kg mass`, `-0.42 mm peak bending deflection`).
2. **Save configuration (`Save configuration to study`):**
   - Saves the current parameter set and comparison snapshot to the study state, updates the badge from `Unsaved edits` to `Saved to study`, and records the snapshot so returning to `apps/system` shows the updated configuration in the review inspector.
3. **Reset flows (`Reset parameter` / `Reset to Baseline A`):**
   - Each modified slider has a single-parameter reset action; `Reset to Baseline A` restores default geometry, material, and `Isometric` camera framing while keeping saved snapshots accessible in the preset dropdown.

---

## 7. Required model limitations placement (no unsupported safety claims)

Per owner requirements in [`product.md`](../product.md):
- **Do not make crashworthiness, regulatory certification, production FEA validation, or occupant safety claims anywhere in the UI.**
- **Place a concise, factual model-limitations block directly beside the numerical results in the right dock** (not as a page-blocking modal or top-of-page alarm banner):

> **Concept approximation scope**
> Stiffness, deflection, and mass values are simplified Euler-Bernoulli beam and Saint-Venant torsion approximations for early packaging trade-offs (`mm`, `kN`, `kNm/deg`). They do not model joint weld compliance, nonlinear buckling, crash impulse, or validated finite-element (FEA) certification.
