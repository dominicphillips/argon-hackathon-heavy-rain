import { add, cross, dot, normalize, scale, sub, type Vec3 } from "./vec.ts";

/** Axis-aligned bounds in meters, Y-up. */
export interface Bounds3 {
  min: Vec3;
  max: Vec3;
}

export interface FitOptions {
  /** Vertical field of view in degrees (PerspectiveCamera.fov). */
  fovDeg: number;
  /** Viewport width / height. */
  aspect: number;
  /** Unit direction from the target toward the camera. */
  direction: Vec3;
  /** Multiplier applied to the projected half-extents (1.0 = touch the frame edges). */
  margin?: number;
  /** World up used to orient the frame. Defaults to +Y. */
  up?: Vec3;
}

export interface FitResult {
  position: Vec3;
  target: Vec3;
  distance: number;
}

export function boundsCenter(b: Bounds3): Vec3 {
  return [
    (b.min[0] + b.max[0]) / 2,
    (b.min[1] + b.max[1]) / 2,
    (b.min[2] + b.max[2]) / 2,
  ];
}

export function boundsSize(b: Bounds3): Vec3 {
  return sub(b.max, b.min);
}

export function boundsCorners(b: Bounds3): Vec3[] {
  const out: Vec3[] = [];
  for (const x of [b.min[0], b.max[0]]) {
    for (const y of [b.min[1], b.max[1]]) {
      for (const z of [b.min[2], b.max[2]]) {
        out.push([x, y, z]);
      }
    }
  }
  return out;
}

export function unionBounds(a: Bounds3, b: Bounds3): Bounds3 {
  return {
    min: [
      Math.min(a.min[0], b.min[0]),
      Math.min(a.min[1], b.min[1]),
      Math.min(a.min[2], b.min[2]),
    ],
    max: [
      Math.max(a.max[0], b.max[0]),
      Math.max(a.max[1], b.max[1]),
      Math.max(a.max[2], b.max[2]),
    ],
  };
}

/**
 * Computes the camera pose that frames every corner of `bounds` inside a
 * perspective frustum. The result is aspect-aware: wide viewports are limited
 * by the vertical field of view, narrow viewports by the horizontal one.
 */
export function fitBoundsToView(bounds: Bounds3, options: FitOptions): FitResult {
  const margin = options.margin ?? 1.12;
  const up = normalize(options.up ?? [0, 1, 0]);
  const dir = normalize(options.direction);

  // Camera basis: forward is -dir (looking at the target), right/up span the image plane.
  let right = cross(up, dir);
  if (dot(right, right) < 1e-9) {
    // Looking straight down or up: pick a stable right vector.
    right = [1, 0, 0];
  }
  right = normalize(right);
  const camUp = normalize(cross(dir, right));

  const halfV = (options.fovDeg * Math.PI) / 360;
  const tanV = Math.tan(halfV);
  const tanH = tanV * Math.max(1e-6, options.aspect);

  const target = boundsCenter(bounds);
  let distance = 0;
  for (const corner of boundsCorners(bounds)) {
    const rel = sub(corner, target);
    const x = Math.abs(dot(rel, right)) * margin;
    const y = Math.abs(dot(rel, camUp)) * margin;
    const depth = dot(rel, dir); // positive = closer to the camera
    distance = Math.max(distance, depth + y / tanV, depth + x / tanH);
  }
  distance = Math.max(distance, 1e-3);
  const position = add(target, scale(dir, distance));
  return { position, target, distance };
}

/**
 * Returns true when every bounds corner projects inside the frustum of a camera
 * at `position` looking at `target`. Used by tests and by fit verification.
 */
export function boundsFitInView(
  bounds: Bounds3,
  position: Vec3,
  target: Vec3,
  fovDeg: number,
  aspect: number,
  up: Vec3 = [0, 1, 0]
): boolean {
  const dir = normalize(sub(position, target));
  let right = cross(normalize(up), dir);
  if (dot(right, right) < 1e-9) right = [1, 0, 0];
  right = normalize(right);
  const camUp = normalize(cross(dir, right));
  const tanV = Math.tan((fovDeg * Math.PI) / 360);
  const tanH = tanV * aspect;
  for (const corner of boundsCorners(bounds)) {
    const rel = sub(corner, position);
    const depth = -dot(rel, dir);
    if (depth <= 0) return false;
    if (Math.abs(dot(rel, right)) > depth * tanH + 1e-9) return false;
    if (Math.abs(dot(rel, camUp)) > depth * tanV + 1e-9) return false;
  }
  return true;
}
