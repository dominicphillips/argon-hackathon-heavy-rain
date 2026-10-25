/**
 * Concept mass-balance math for the AUGI Sable mass and center-of-gravity ledger.
 *
 * Coordinate convention (matches the 3D body): +X points to the front of the
 * vehicle, +Y points up, Z is lateral. Positions are in meters measured from
 * the wheelbase midpoint at ground level. Masses are in kilograms.
 *
 * These are weighted-average estimates for early packaging trade-offs, not a
 * certified vehicle dynamics or homologation calculation.
 */

export type SubsystemId = "battery" | "body" | "frontDrive" | "rearDrive" | "cabin" | "payload" | "wheels";

export interface Subsystem {
  id: SubsystemId;
  /** Mass in kg. */
  massKg: number;
  /** Longitudinal center in meters, +X toward the front, 0 at the wheelbase midpoint. */
  xM: number;
  /** Height of the mass center above ground in meters. */
  yM: number;
  /** Lateral center in meters; concept defaults are symmetric about the centerline. */
  zM: number;
  /** Approximate visual envelope (meters) for the distribution marker: [length, height, width]. */
  sizeM: [number, number, number];
}

export interface SubsystemBounds {
  massKg: { min: number; max: number; step: number };
  xM: { min: number; max: number; step: number };
  yM: { min: number; max: number; step: number };
}

export interface CenterOfGravity {
  totalMassKg: number;
  xM: number;
  yM: number;
  zM: number;
}

export interface AxleShare {
  /** Fraction of total mass carried by the front axle, 0..1. */
  front: number;
  /** Fraction of total mass carried by the rear axle, 0..1. */
  rear: number;
  frontKg: number;
  rearKg: number;
}

export interface MassBalanceMetrics extends CenterOfGravity {
  share: AxleShare;
  wheelbaseM: number;
}

/** Baseline A wheelbase (2980 mm) in meters, shared with the chassis study. */
export const DEFAULT_WHEELBASE_M = 2.98;

export const SUBSYSTEM_IDS: readonly SubsystemId[] = ["battery", "body", "frontDrive", "rearDrive", "cabin", "payload", "wheels"];

/**
 * Concept defaults for a mid-size battery-electric four-seat body on the 2980 mm
 * wheelbase. Values are rounded packaging estimates in kg and meters, chosen to
 * land near a typical 2.1 t curb mass with a slightly rear-biased static split.
 */
export const DEFAULT_SUBSYSTEMS: readonly Subsystem[] = [
  { id: "battery", massKg: 540, xM: -0.05, yM: 0.3, zM: 0, sizeM: [2.1, 0.14, 1.4] },
  { id: "body", massKg: 520, xM: 0.1, yM: 0.72, zM: 0, sizeM: [3.9, 0.7, 1.6] },
  { id: "frontDrive", massKg: 160, xM: 1.35, yM: 0.42, zM: 0, sizeM: [0.5, 0.36, 0.7] },
  { id: "rearDrive", massKg: 190, xM: -1.3, yM: 0.4, zM: 0, sizeM: [0.5, 0.36, 0.7] },
  { id: "cabin", massKg: 210, xM: -0.15, yM: 0.62, zM: 0, sizeM: [1.8, 0.5, 1.3] },
  { id: "payload", massKg: 300, xM: -0.05, yM: 0.68, zM: 0, sizeM: [1.4, 0.4, 1.1] },
  { id: "wheels", massKg: 150, xM: 0, yM: 0.37, zM: 0, sizeM: [3.0, 0.74, 1.7] },
];

/** Slider ranges per subsystem. Positions stay inside the body envelope. */
export const SUBSYSTEM_BOUNDS: Record<SubsystemId, SubsystemBounds> = {
  battery: { massKg: { min: 300, max: 800, step: 5 }, xM: { min: -0.6, max: 0.6, step: 0.01 }, yM: { min: 0.22, max: 0.5, step: 0.01 } },
  body: { massKg: { min: 350, max: 750, step: 5 }, xM: { min: -0.4, max: 0.4, step: 0.01 }, yM: { min: 0.55, max: 0.95, step: 0.01 } },
  frontDrive: { massKg: { min: 0, max: 260, step: 5 }, xM: { min: 1.0, max: 1.7, step: 0.01 }, yM: { min: 0.3, max: 0.6, step: 0.01 } },
  rearDrive: { massKg: { min: 0, max: 260, step: 5 }, xM: { min: -1.7, max: -1.0, step: 0.01 }, yM: { min: 0.3, max: 0.6, step: 0.01 } },
  cabin: { massKg: { min: 120, max: 320, step: 5 }, xM: { min: -0.6, max: 0.4, step: 0.01 }, yM: { min: 0.45, max: 0.85, step: 0.01 } },
  payload: { massKg: { min: 0, max: 600, step: 5 }, xM: { min: -1.2, max: 1.0, step: 0.01 }, yM: { min: 0.3, max: 1.0, step: 0.01 } },
  wheels: { massKg: { min: 80, max: 240, step: 5 }, xM: { min: -0.2, max: 0.2, step: 0.01 }, yM: { min: 0.3, max: 0.45, step: 0.01 } },
};

function finiteOrZero(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

/** Clamps a value into [min, max]; non-finite inputs fall back to `min`. */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Mass-weighted center of gravity. Non-finite or negative masses count as zero.
 * With zero total mass the CG is reported at the origin with zero mass.
 */
export function computeCenterOfGravity(parts: readonly Pick<Subsystem, "massKg" | "xM" | "yM" | "zM">[]): CenterOfGravity {
  let total = 0;
  let mx = 0;
  let my = 0;
  let mz = 0;
  for (const p of parts) {
    const m = Math.max(0, finiteOrZero(p.massKg));
    if (m === 0) continue;
    total += m;
    mx += m * finiteOrZero(p.xM);
    my += m * finiteOrZero(p.yM);
    mz += m * finiteOrZero(p.zM);
  }
  if (total <= 0) return { totalMassKg: 0, xM: 0, yM: 0, zM: 0 };
  return { totalMassKg: total, xM: mx / total, yM: my / total, zM: mz / total };
}

/**
 * Static axle split from longitudinal CG position. With +X toward the front and
 * the origin at the wheelbase midpoint, the front axle sits at +L/2 and the rear
 * at -L/2. Front share = (xCG + L/2) / L. Values outside the wheelbase are
 * clamped to 0..1 so a CG beyond an axle reads as a full transfer, not a
 * negative load. Zero or non-finite wheelbase returns an even split.
 */
export function computeAxleShare(xCgM: number, wheelbaseM: number, totalMassKg: number): AxleShare {
  const mass = Math.max(0, finiteOrZero(totalMassKg));
  if (!Number.isFinite(wheelbaseM) || wheelbaseM <= 0 || !Number.isFinite(xCgM)) {
    return { front: 0.5, rear: 0.5, frontKg: mass / 2, rearKg: mass / 2 };
  }
  const front = clamp((xCgM + wheelbaseM / 2) / wheelbaseM, 0, 1);
  const rear = 1 - front;
  return { front, rear, frontKg: mass * front, rearKg: mass * rear };
}

export function computeMassBalance(parts: readonly Subsystem[], wheelbaseM: number = DEFAULT_WHEELBASE_M): MassBalanceMetrics {
  const cg = computeCenterOfGravity(parts);
  const share = computeAxleShare(cg.xM, wheelbaseM, cg.totalMassKg);
  return { ...cg, share, wheelbaseM };
}

/** Returns a copy of `parts` with one subsystem's fields replaced and clamped to its bounds. */
export function updateSubsystem(parts: readonly Subsystem[], id: SubsystemId, patch: Partial<Pick<Subsystem, "massKg" | "xM" | "yM">>): Subsystem[] {
  const bounds = SUBSYSTEM_BOUNDS[id];
  return parts.map((p) => {
    if (p.id !== id) return p;
    return {
      ...p,
      massKg: patch.massKg === undefined ? p.massKg : clamp(patch.massKg, bounds.massKg.min, bounds.massKg.max),
      xM: patch.xM === undefined ? p.xM : clamp(patch.xM, bounds.xM.min, bounds.xM.max),
      yM: patch.yM === undefined ? p.yM : clamp(patch.yM, bounds.yM.min, bounds.yM.max),
    };
  });
}

export function formatKg(kg: number): string {
  return `${Math.round(finiteOrZero(kg)).toLocaleString("en-US")} kg`;
}

export function formatMeters(m: number, digits = 2): string {
  const v = finiteOrZero(m);
  const text = v.toFixed(digits);
  return `${v > 0 && digits > 0 ? "+" : ""}${text} m`;
}

export function formatPercent(fraction: number): string {
  return `${(finiteOrZero(fraction) * 100).toFixed(1)}%`;
}
