import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  boundsCenter,
  boundsFitInView,
  fitBoundsToView,
  unionBounds,
  type Bounds3,
} from "./bounds.ts";

const vehicle: Bounds3 = {
  // Roughly a 4.9 m long, 1.95 m wide, 1.55 m tall vehicle sitting on y = 0.
  min: [-2.45, 0, -0.975],
  max: [2.45, 1.55, 0.975],
};

describe("fitBoundsToView", () => {
  it("frames every corner for a wide 1440x900 viewport", () => {
    const fit = fitBoundsToView(vehicle, {
      fovDeg: 34,
      aspect: 1440 / 900,
      direction: [1, 0.55, 0.8],
      margin: 1.1,
    });
    assert.ok(boundsFitInView(vehicle, fit.position, fit.target, 34, 1440 / 900));
    assert.deepEqual(fit.target, boundsCenter(vehicle));
    assert.ok(fit.distance > 5 && fit.distance < 20, `distance ${fit.distance}`);
  });

  it("moves further back for a narrower aspect (1280x800 and portrait)", () => {
    const wide = fitBoundsToView(vehicle, { fovDeg: 34, aspect: 1440 / 900, direction: [0, 0, 1] });
    const mid = fitBoundsToView(vehicle, { fovDeg: 34, aspect: 1280 / 800, direction: [0, 0, 1] });
    const tall = fitBoundsToView(vehicle, { fovDeg: 34, aspect: 0.7, direction: [0, 0, 1] });
    assert.ok(mid.distance > wide.distance - 1e-9);
    assert.ok(tall.distance > mid.distance);
    assert.ok(boundsFitInView(vehicle, tall.position, tall.target, 34, 0.7));
  });

  it("applies margin monotonically and touches the frame at margin 1", () => {
    const tight = fitBoundsToView(vehicle, { fovDeg: 34, aspect: 1.6, direction: [0, 0, 1], margin: 1 });
    const loose = fitBoundsToView(vehicle, { fovDeg: 34, aspect: 1.6, direction: [0, 0, 1], margin: 1.3 });
    assert.ok(loose.distance > tight.distance);
    // Slightly closer than the tight fit must clip a corner.
    const closer: [number, number, number] = [tight.position[0], tight.position[1], tight.position[2] - 0.05];
    assert.equal(boundsFitInView(vehicle, closer, tight.target, 34, 1.6), false);
  });

  it("handles top-down and underbody directions without a degenerate basis", () => {
    for (const direction of [[0, 1, 0], [0, -1, 0]] as const) {
      const fit = fitBoundsToView(vehicle, { fovDeg: 34, aspect: 1.6, direction });
      assert.ok(Number.isFinite(fit.distance) && fit.distance > 0);
      assert.ok(boundsFitInView(vehicle, fit.position, fit.target, 34, 1.6));
    }
  });

  it("unions bounds", () => {
    const u = unionBounds(vehicle, { min: [-3, -1, 0], max: [0, 0, 3] });
    assert.deepEqual(u.min, [-3, -1, -0.975]);
    assert.deepEqual(u.max, [2.45, 1.55, 3]);
  });
});
