/**
 * AUGI Sable Concept Chassis Analytical Engineering Model
 *
 * Scope & Assumptions:
 * - Computes deterministic, unit-consistent concept approximations using closed-form
 *   Euler-Bernoulli beam bending and Saint-Venant / Bredt-Batho thin-walled box torsion.
 * - Restricted to isotropic metallic structural alloys with documented elastic modulus (E),
 *   Poisson ratio (nu), shear modulus G = E / (2 * (1 + nu)), and density (rho).
 * - Anisotropic composite layups (CFRP) and nonlinear multi-axis combined cornering
 *   dynamics are intentionally excluded from this analytical solver so every reported
 *   figure reflects transparent closed-form mechanics rather than invented FEA numbers.
 * - Not a validated finite-element (FEA), crashworthiness, or regulatory certification model.
 */

export type UnitSystem = "metric" | "imperial";

export type LoadCaseId = "torsion" | "bending";

export type MaterialId =
  | "al-6061-t6"
  | "al-7075-t6"
  | "al-5083-h116"
  | "dp980-steel";

export type NavSectionId = "chassis" | "torsion" | "materials" | "compare";

export type CameraPresetId =
  | "isometric"
  | "side"
  | "top"
  | "front"
  | "underbody";

export interface MaterialSpec {
  id: MaterialId;
  name: string;
  shortLabel: string;
  /** Young's modulus E in GPa */
  youngsModulusGPa: number;
  /** Poisson's ratio nu (dimensionless) */
  poissonRatio: number;
  /** Shear modulus G = E / (2 * (1 + nu)) in GPa */
  shearModulusGPa: number;
  /** Density rho in kg/m^3 */
  densityKgM3: number;
  /** Nominal 0.2% offset yield strength in MPa (reference for strain ratio) */
  yieldStrengthMPa: number;
  /** Metallic tint hex for 3D rendering */
  tintHex: string;
  /** Typical automotive structural application note */
  applicationNote: string;
}

export const MATERIALS: Record<MaterialId, MaterialSpec> = {
  "al-6061-t6": {
    id: "al-6061-t6",
    name: "6061-T6 Aluminum Extrusion",
    shortLabel: "6061-T6 Al",
    youngsModulusGPa: 68.9,
    poissonRatio: 0.33,
    shearModulusGPa: Number((68.9 / (2 * (1 + 0.33))).toFixed(2)), // 25.90 GPa
    densityKgM3: 2700,
    yieldStrengthMPa: 276,
    tintHex: "#C8CFD8",
    applicationNote:
      "Baseline hydroformed multi-cell sill extrusions with A356-T6 cast end nodes.",
  },
  "al-7075-t6": {
    id: "al-7075-t6",
    name: "7075-T6 High-Strength Aluminum",
    shortLabel: "7075-T6 Al",
    youngsModulusGPa: 71.7,
    poissonRatio: 0.33,
    shearModulusGPa: Number((71.7 / (2 * (1 + 0.33))).toFixed(2)), // 26.95 GPa
    densityKgM3: 2810,
    yieldStrengthMPa: 503,
    tintHex: "#BCC5D1",
    applicationNote:
      "High-yield aerospace-grade extruded rocker rails and forged suspension towers.",
  },
  "al-5083-h116": {
    id: "al-5083-h116",
    name: "5083-H116 Structural Aluminum",
    shortLabel: "5083-H116 Al",
    youngsModulusGPa: 70.3,
    poissonRatio: 0.33,
    shearModulusGPa: Number((70.3 / (2 * (1 + 0.33))).toFixed(2)), // 26.43 GPa
    densityKgM3: 2660,
    yieldStrengthMPa: 215,
    tintHex: "#D0D6DE",
    applicationNote:
      "Corrosion-resistant stamped battery floor enclosure and lower shear plate.",
  },
  "dp980-steel": {
    id: "dp980-steel",
    name: "DP980 Dual-Phase Steel",
    shortLabel: "DP980 Steel",
    youngsModulusGPa: 205.0,
    poissonRatio: 0.29,
    shearModulusGPa: Number((205.0 / (2 * (1 + 0.29))).toFixed(2)), // 79.46 GPa
    densityKgM3: 7850,
    yieldStrengthMPa: 650,
    tintHex: "#8F98A6",
    applicationNote:
      "High-modulus roll-formed steel rocker rails and cross-members with higher mass.",
  },
};

export const MATERIAL_LIST: readonly MaterialSpec[] = Object.values(MATERIALS);

export interface ParameterBounds {
  min: number;
  max: number;
  step: number;
  default: number;
  unitMetric: string;
  unitImperial: string;
  label: string;
}

export const PARAMETER_BOUNDS = {
  wheelbaseMm: {
    min: 2800,
    max: 3250,
    step: 10,
    default: 2980,
    unitMetric: "mm",
    unitImperial: "in",
    label: "Wheelbase",
  },
  trackWidthMm: {
    min: 1600,
    max: 1780,
    step: 10,
    default: 1680,
    unitMetric: "mm",
    unitImperial: "in",
    label: "Track width",
  },
  wallGaugeMm: {
    min: 2.0,
    max: 5.5,
    step: 0.1,
    default: 2.4,
    unitMetric: "mm",
    unitImperial: "in",
    label: "Wall gauge",
  },
  crossMemberCount: {
    min: 4,
    max: 8,
    step: 1,
    default: 6,
    unitMetric: "beams",
    unitImperial: "beams",
    label: "Cross-members",
  },
  torsionTorqueKNm: {
    min: 5.0,
    max: 35.0,
    step: 0.5,
    default: 18.0,
    unitMetric: "kNm",
    unitImperial: "lbf·ft",
    label: "Peak torque",
  },
  bendingLoadKN: {
    min: 6.0,
    max: 36.0,
    step: 0.5,
    default: 18.0,
    unitMetric: "kN",
    unitImperial: "lbf",
    label: "Vertical load",
  },
} as const satisfies Record<string, ParameterBounds>;

export interface ChassisConfig {
  id: string;
  name: string;
  wheelbaseMm: number;
  trackWidthMm: number;
  wallGaugeMm: number;
  crossMemberCount: number;
  materialId: MaterialId;
  loadCase: LoadCaseId;
  torsionTorqueKNm: number;
  bendingLoadKN: number;
}

export interface PresetDefinition {
  id: string;
  label: string;
  shortLabel: string;
  summary: string;
  config: ChassisConfig;
}

export const CHASSIS_PRESETS: readonly PresetDefinition[] = [
  {
    id: "baseline-a",
    label: "Baseline A · Standard Range SUV",
    shortLabel: "Baseline A",
    summary:
      "2980 mm wheelbase, 1680 mm track, 2.4 mm 6061-T6 hydroformed rails.",
    config: {
      id: "baseline-a",
      name: "Baseline A · Standard Range SUV",
      wheelbaseMm: 2980,
      trackWidthMm: 1680,
      wallGaugeMm: 2.4,
      crossMemberCount: 6,
      materialId: "al-6061-t6",
      loadCase: "torsion",
      torsionTorqueKNm: 18.0,
      bendingLoadKN: 18.0,
    },
  },
  {
    id: "candidate-b",
    label: "Candidate B · Long-Wheelbase Stiffened",
    shortLabel: "Candidate B",
    summary:
      "3120 mm wheelbase, 1710 mm track, 3.4 mm 7075-T6 rails with 7 cross-members.",
    config: {
      id: "candidate-b",
      name: "Candidate B · Long-Wheelbase Stiffened",
      wheelbaseMm: 3120,
      trackWidthMm: 1710,
      wallGaugeMm: 3.4,
      crossMemberCount: 7,
      materialId: "al-7075-t6",
      loadCase: "torsion",
      torsionTorqueKNm: 18.0,
      bendingLoadKN: 18.0,
    },
  },
  {
    id: "candidate-c",
    label: "Candidate C · Lightweight Mass Target",
    shortLabel: "Candidate C",
    summary:
      "2900 mm wheelbase, 1650 mm track, 2.1 mm 5083-H116 rails with 5 cross-members.",
    config: {
      id: "candidate-c",
      name: "Candidate C · Lightweight Mass Target",
      wheelbaseMm: 2900,
      trackWidthMm: 1650,
      wallGaugeMm: 2.1,
      crossMemberCount: 5,
      materialId: "al-5083-h116",
      loadCase: "torsion",
      torsionTorqueKNm: 18.0,
      bendingLoadKN: 18.0,
    },
  },
  {
    id: "candidate-d",
    label: "Candidate D · High-Rigidity Steel Architecture",
    shortLabel: "Candidate D",
    summary:
      "3020 mm wheelbase, 1700 mm track, 2.2 mm DP980 steel rails for maximum stiffness.",
    config: {
      id: "candidate-d",
      name: "Candidate D · High-Rigidity Steel Architecture",
      wheelbaseMm: 3020,
      trackWidthMm: 1700,
      wallGaugeMm: 2.2,
      crossMemberCount: 6,
      materialId: "dp980-steel",
      loadCase: "torsion",
      torsionTorqueKNm: 18.0,
      bendingLoadKN: 18.0,
    },
  },
];

export const BASELINE_A_CONFIG: ChassisConfig = CHASSIS_PRESETS[0].config;

export interface MassBreakdownKg {
  sideRailsKg: number;
  crossMembersKg: number;
  batteryTrayEnclosureKg: number;
  castSubframesKg: number;
  unsprungSuspensionRefKg: number;
  totalStructuralMassKg: number;
}

export interface ChassisMetrics {
  /** Rotational torsional stiffness in Nm/deg */
  torsionalStiffnessNmPerDeg: number;
  /** Rotational torsional stiffness in kNm/deg */
  torsionalStiffnessKNmPerDeg: number;
  /** Peak torsional twist angle in degrees under applied torsionTorqueKNm */
  peakTwistDeg: number;
  /** Mid-span vertical bending deflection in mm under applied bendingLoadKN */
  peakBendingDeflectionMm: number;
  /** Effective vertical bending stiffness in kN/mm */
  bendingStiffnessKNPerMm: number;
  /** Estimated structural chassis mass in kg (excluding battery cells & body shell) */
  structuralMassKg: number;
  /** Detailed component mass breakdown in kg */
  massBreakdown: MassBreakdownKg;
  /** Stiffness-to-mass efficiency index in (Nm/deg) per kg */
  stiffnessToMassRatioNmDegPerKg: number;
  /** Concept peak von Mises equivalent wall stress in MPa for active load case */
  peakConceptStressMPa: number;
  /** Ratio of peak concept stress to nominal alloy yield strength (0..1+) */
  yieldUtilizationRatio: number;
  /** Section second moment of area I_total in mm^4 */
  sectionInertiaMm4: number;
  /** Torsional constant J_total in mm^4 */
  torsionalConstantMm4: number;
}

export interface ComparisonDelta {
  stiffnessNmPerDegDiff: number;
  stiffnessPctDiff: number;
  twistDegDiff: number;
  bendingDeflectionMmDiff: number;
  massKgDiff: number;
  massPctDiff: number;
  stiffnessToMassPctDiff: number;
}

/**
 * Unit conversion constants (exact NIST / SI definitions)
 */
export const MM_PER_INCH = 25.4;
export const LBF_PER_KN = 224.8089431;
export const LBF_FT_PER_KNM = 737.5621493;
export const LB_PER_KG = 2.20462262185;
export const KSI_PER_MPA = 0.14503773773;

export function mmToIn(mm: number): number {
  return mm / MM_PER_INCH;
}

export function inToMm(inches: number): number {
  return inches * MM_PER_INCH;
}

export function kNToLbf(kN: number): number {
  return kN * LBF_PER_KN;
}

export function lbfToKN(lbf: number): number {
  return lbf / LBF_PER_KN;
}

export function kNmToLbfFt(kNm: number): number {
  return kNm * LBF_FT_PER_KNM;
}

export function lbfFtToKNm(lbfFt: number): number {
  return lbfFt / LBF_FT_PER_KNM;
}

export function nmPerDegToLbfFtPerDeg(nmPerDeg: number): number {
  return (nmPerDeg / 1000) * LBF_FT_PER_KNM;
}

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}

export function mpaToKsi(mpa: number): number {
  return mpa * KSI_PER_MPA;
}

/**
 * Validates a numeric input against parameter bounds.
 * Returns null if valid, or a specific actionable recovery message if out of bounds.
 */
export function validateParameter(
  key: keyof typeof PARAMETER_BOUNDS,
  rawValue: number,
  unitSystem: UnitSystem = "metric"
): string | null {
  const bounds = PARAMETER_BOUNDS[key];
  if (!Number.isFinite(rawValue)) {
    return `${bounds.label} requires a number. Enter a value between ${bounds.min} and ${bounds.max} ${bounds.unitMetric} or click Reset parameter.`;
  }
  if (rawValue < bounds.min || rawValue > bounds.max) {
    if (unitSystem === "imperial" && bounds.unitMetric === "mm") {
      const minIn = mmToIn(bounds.min).toFixed(1);
      const maxIn = mmToIn(bounds.max).toFixed(1);
      return `${bounds.label} must be between ${bounds.min} mm (${minIn} in) and ${bounds.max} mm (${maxIn} in). Enter a value in that range or click Reset parameter.`;
    }
    return `${bounds.label} must be between ${bounds.min} ${bounds.unitMetric} and ${bounds.max} ${bounds.unitMetric}. Enter a value in that range or click Reset parameter.`;
  }
  return null;
}

export function clampParameter(
  key: keyof typeof PARAMETER_BOUNDS,
  value: number
): number {
  const bounds = PARAMETER_BOUNDS[key];
  if (!Number.isFinite(value)) {
    return bounds.default;
  }
  return Math.min(bounds.max, Math.max(bounds.min, value));
}

/**
 * Computes deterministic concept structural metrics for a given AUGI Sable configuration.
 */
export function computeChassisMetrics(config: ChassisConfig): ChassisMetrics {
  const L = clampParameter("wheelbaseMm", config.wheelbaseMm) * 1e-3; // m
  const W = clampParameter("trackWidthMm", config.trackWidthMm) * 1e-3; // m
  const t = clampParameter("wallGaugeMm", config.wallGaugeMm) * 1e-3; // m
  const nCm = Math.round(
    clampParameter("crossMemberCount", config.crossMemberCount)
  );
  const T_kNm = clampParameter("torsionTorqueKNm", config.torsionTorqueKNm);
  const F_kN = clampParameter("bendingLoadKN", config.bendingLoadKN);

  const material = MATERIALS[config.materialId] ?? MATERIALS["al-6061-t6"];
  const E = material.youngsModulusGPa * 1e9; // Pa (N/m^2)
  const G = material.shearModulusGPa * 1e9; // Pa (N/m^2)
  const rho = material.densityKgM3; // kg/m^3

  // 1. Longitudinal hydroformed side rail section geometry (hollow 3-cell box per side)
  // Outer section: width b_s = 180 mm, height h_s = 220 mm, plus two internal shear webs of thickness t
  const b_s = 0.18;
  const h_s = 0.22;
  const innerB = Math.max(0.01, b_s - 2 * t);
  const innerH = Math.max(0.01, h_s - 2 * t);

  const areaSingleRail = b_s * h_s - innerB * innerH + 2 * t * innerH; // m^2
  const inertiaSingleRail =
    (b_s * Math.pow(h_s, 3) - innerB * Math.pow(innerH, 3)) / 12 +
    (2 * t * Math.pow(innerH, 3)) / 12; // m^4

  // Bredt-Batho thin-walled closed box torsional constant for single rail
  const AmRail = (b_s - t) * (h_s - t);
  const perimeterRail = 2 * (b_s - t) + 2 * (h_s - t);
  const jSingleRail = (4 * Math.pow(AmRail, 2) * t) / perimeterRail; // m^4

  // 2. Spaceframe coupled box section (twin rails + structural battery tray + cross-member ladder)
  // Effective center-to-center span between longitudinal sill rails scales with track width
  const b_rail = 0.86 * W;
  const h_pack = 0.185; // structural battery enclosure depth (m)
  const L_eff = 0.72 * L; // effective torsional span between front and rear damper tower bulkheads

  // Cross-member ladder shear-bay coupling factor increases with number of lateral cross-members
  const ladderCoupling = 0.58 * (1 + 0.065 * (nCm - 6));

  // Effective closed-cell shear flow thickness of the battery tray + upper/lower shear skins
  const t_box_eff = 1.12 * t;
  const AmBox = b_rail * h_pack;
  const perimeterBox = 2 * (b_rail + h_pack);
  const jSpaceframeBox =
    ladderCoupling * ((4 * Math.pow(AmBox, 2) * t_box_eff) / perimeterBox);

  // Differential bending torsion contribution of the two longitudinal rails + torque boxes separated by b_rail
  const jDiffBending =
    2 * inertiaSingleRail * Math.pow(b_rail / L_eff, 2) * 1.85;

  const jTotal = 2 * jSingleRail + jSpaceframeBox + jDiffBending; // m^4

  // 3. Rotational torsional stiffness K_t
  const ktRad = (G * jTotal) / L_eff; // N*m / rad
  const ktNmPerDeg = ktRad * (Math.PI / 180); // N*m / deg
  const ktKNmPerDeg = ktNmPerDeg / 1000; // kN*m / deg

  // Peak twist angle under applied torque couple T_kNm
  const peakTwistDeg = (T_kNm * 1000) / ktNmPerDeg;

  // 4. Vertical beam bending stiffness and mid-span deflection
  // Battery tray top/bottom skins + longitudinal pack dividers contribute to longitudinal I_total
  const inertiaPackTray =
    2 * (b_rail * (0.95 * t)) * Math.pow(h_pack / 2, 2) +
    (5 * t * Math.pow(h_pack, 3)) / 12;
  const inertiaTotal = 2 * inertiaSingleRail + inertiaPackTray; // m^4

  // Semi-rigid subframe end-support coefficient (between 5/384 simply supported and 1/384 fixed-fixed)
  const beamSupportCoeff = 3.1 / 384;
  const peakBendingDeflectionM =
    (beamSupportCoeff * (F_kN * 1000) * Math.pow(L, 3)) / (E * inertiaTotal);
  const peakBendingDeflectionMm = peakBendingDeflectionM * 1000;
  const bendingStiffnessKNPerMm = F_kN / peakBendingDeflectionMm;

  // 5. Structural mass breakdown from material density and geometric volume
  const volSideRails = 2 * areaSingleRail * (L * 1.08);
  const areaCrossMember = 2 * (0.125 + 0.095) * (1.15 * t);
  const volCrossMembers = nCm * areaCrossMember * b_rail;
  const volBatteryTray =
    L * 0.78 * b_rail * (2.65 * t) + 4 * (L * 0.78) * h_pack * (1.15 * t);
  // Front and rear megacast subframes, shock towers, and crash beams scale with track width and gauge
  const volSubframes =
    2 * (0.0225 * (W / 1.68) * (0.62 + 0.38 * (t / 0.0024)));

  const sideRailsKg = rho * volSideRails;
  const crossMembersKg = rho * volCrossMembers;
  const batteryTrayEnclosureKg = rho * volBatteryTray;
  const castSubframesKg = rho * volSubframes;
  // Reference unsprung corner hardware (wishbones, uprights, dampers, rotors) for display context
  const unsprungSuspensionRefKg = 64.0;

  const structuralMassKg =
    sideRailsKg + crossMembersKg + batteryTrayEnclosureKg + castSubframesKg;

  const stiffnessToMassRatioNmDegPerKg = ktNmPerDeg / structuralMassKg;

  // 6. Concept peak stress approximation (MPa)
  // Torsion shear stress tau = T / (2 * Am_eff * t), von Mises sigma = sqrt(3) * tau
  const AmEff = 2 * AmRail + 0.32 * AmBox;
  const tauTorsionMPa = (T_kNm * 1000) / (2 * AmEff * t) / 1e6;
  const sigmaTorsionMPa = Math.sqrt(3) * tauTorsionMPa;

  // Bending stress sigma = M_max * c / I_total, where M_max = F * L / 10 for semi-rigid ends
  const momentMaxNm = (F_kN * 1000 * L) / 10;
  const sigmaBendingMPa = (momentMaxNm * (h_s / 2)) / inertiaTotal / 1e6;

  const peakConceptStressMPa =
    config.loadCase === "torsion" ? sigmaTorsionMPa : sigmaBendingMPa;
  const yieldUtilizationRatio =
    peakConceptStressMPa / material.yieldStrengthMPa;

  return {
    torsionalStiffnessNmPerDeg: ktNmPerDeg,
    torsionalStiffnessKNmPerDeg: ktKNmPerDeg,
    peakTwistDeg,
    peakBendingDeflectionMm,
    bendingStiffnessKNPerMm,
    structuralMassKg,
    massBreakdown: {
      sideRailsKg,
      crossMembersKg,
      batteryTrayEnclosureKg,
      castSubframesKg,
      unsprungSuspensionRefKg,
      totalStructuralMassKg: structuralMassKg,
    },
    stiffnessToMassRatioNmDegPerKg,
    peakConceptStressMPa,
    yieldUtilizationRatio,
    sectionInertiaMm4: inertiaTotal * 1e12,
    torsionalConstantMm4: jTotal * 1e12,
  };
}

/**
 * Computes signed delta between a candidate configuration and a baseline configuration.
 */
export function compareChassisMetrics(
  baseline: ChassisMetrics,
  candidate: ChassisMetrics
): ComparisonDelta {
  const stiffnessNmPerDegDiff =
    candidate.torsionalStiffnessNmPerDeg - baseline.torsionalStiffnessNmPerDeg;
  const stiffnessPctDiff =
    (stiffnessNmPerDegDiff / baseline.torsionalStiffnessNmPerDeg) * 100;
  const twistDegDiff = candidate.peakTwistDeg - baseline.peakTwistDeg;
  const bendingDeflectionMmDiff =
    candidate.peakBendingDeflectionMm - baseline.peakBendingDeflectionMm;
  const massKgDiff = candidate.structuralMassKg - baseline.structuralMassKg;
  const massPctDiff = (massKgDiff / baseline.structuralMassKg) * 100;
  const stiffnessToMassPctDiff =
    ((candidate.stiffnessToMassRatioNmDegPerKg -
      baseline.stiffnessToMassRatioNmDegPerKg) /
      baseline.stiffnessToMassRatioNmDegPerKg) *
    100;

  return {
    stiffnessNmPerDegDiff,
    stiffnessPctDiff,
    twistDegDiff,
    bendingDeflectionMmDiff,
    massKgDiff,
    massPctDiff,
    stiffnessToMassPctDiff,
  };
}

/**
 * Formatting helpers for metric vs imperial display
 */
export function formatLength(mm: number, unitSystem: UnitSystem): string {
  if (unitSystem === "imperial") {
    return `${mmToIn(mm).toFixed(1)} in`;
  }
  return `${Math.round(mm)} mm`;
}

export function formatGauge(mm: number, unitSystem: UnitSystem): string {
  if (unitSystem === "imperial") {
    return `${mmToIn(mm).toFixed(3)} in`;
  }
  return `${mm.toFixed(1)} mm`;
}

export function formatTorque(kNm: number, unitSystem: UnitSystem): string {
  if (unitSystem === "imperial") {
    return `${Math.round(kNmToLbfFt(kNm)).toLocaleString("en-US")} lbf·ft`;
  }
  return `${kNm.toFixed(1)} kNm`;
}

export function formatForce(kN: number, unitSystem: UnitSystem): string {
  if (unitSystem === "imperial") {
    return `${Math.round(kNToLbf(kN)).toLocaleString("en-US")} lbf`;
  }
  return `${kN.toFixed(1)} kN`;
}

export function formatStiffness(
  nmPerDeg: number,
  unitSystem: UnitSystem
): string {
  if (unitSystem === "imperial") {
    const lbfFt = Math.round(nmPerDegToLbfFtPerDeg(nmPerDeg));
    return `${lbfFt.toLocaleString("en-US")} lbf·ft/deg`;
  }
  const rounded = Math.round(nmPerDeg / 50) * 50;
  return `${rounded.toLocaleString("en-US")} Nm/deg`;
}

export function formatMass(kg: number, unitSystem: UnitSystem): string {
  if (unitSystem === "imperial") {
    return `${Math.round(kgToLb(kg)).toLocaleString("en-US")} lb`;
  }
  return `${kg.toFixed(1)} kg`;
}

export function formatDeflection(mm: number, unitSystem: UnitSystem): string {
  if (unitSystem === "imperial") {
    return `${mmToIn(mm).toFixed(3)} in`;
  }
  return `${mm.toFixed(2)} mm`;
}

export function formatStress(mpa: number, unitSystem: UnitSystem): string {
  if (unitSystem === "imperial") {
    return `${mpaToKsi(mpa).toFixed(1)} ksi`;
  }
  return `${Math.round(mpa)} MPa`;
}
