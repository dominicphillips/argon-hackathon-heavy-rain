import { length, sub, type Vec3 } from "./vec.ts";

export type LengthUnit = "m" | "mm" | "cm" | "in" | "ft";

export const METERS_PER_UNIT: Record<LengthUnit, number> = {
  m: 1,
  mm: 1e-3,
  cm: 1e-2,
  in: 0.0254,
  ft: 0.3048,
};

export interface MeasureResult {
  /** Straight-line distance in meters. */
  meters: number;
  /** Distance converted to the requested unit. */
  value: number;
  unit: LengthUnit;
  /** Per-axis deltas in meters (b - a). */
  delta: Vec3;
  /** Human-readable label, e.g. `2980 mm`. */
  label: string;
}

export function convertLength(meters: number, unit: LengthUnit): number {
  return meters / METERS_PER_UNIT[unit];
}

export function formatLength(meters: number, unit: LengthUnit, digits?: number): string {
  const value = convertLength(meters, unit);
  const places = digits ?? (unit === "mm" ? 0 : unit === "m" ? 3 : 2);
  return `${value.toFixed(places)} ${unit}`;
}

/** Measures the straight-line distance between two points given in meters. */
export function measureDistance(a: Vec3, b: Vec3, unit: LengthUnit = "mm", digits?: number): MeasureResult {
  const delta = sub(b, a);
  const meters = length(delta);
  return {
    meters,
    value: convertLength(meters, unit),
    unit,
    delta,
    label: formatLength(meters, unit, digits),
  };
}
