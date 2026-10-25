import type { Vec3 } from "../math/vec.ts";

export type CameraDirectionId =
  | "isometric"
  | "front"
  | "rear"
  | "side"
  | "top"
  | "underbody";

/** Unit-ish directions from the target toward the camera (normalized on use). */
export const CAMERA_DIRECTIONS: Record<CameraDirectionId, Vec3> = {
  isometric: [1, 0.58, 0.95],
  front: [1, 0.28, 0.42],
  rear: [-1, 0.3, -0.45],
  side: [0.02, 0.16, 1],
  top: [0.001, 1, 0.001],
  underbody: [0.75, -0.75, 0.55],
};

export const CAMERA_DIRECTION_IDS = Object.keys(CAMERA_DIRECTIONS) as CameraDirectionId[];
