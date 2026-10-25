import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { convertLength, formatLength, measureDistance } from "./measure.ts";

describe("measureDistance", () => {
  it("measures a wheelbase in millimeters", () => {
    const r = measureDistance([-1.49, 0.3, 0.84], [1.49, 0.3, 0.84], "mm");
    assert.ok(Math.abs(r.meters - 2.98) < 1e-9);
    assert.equal(r.label, "2980 mm");
    assert.deepEqual(r.delta.map((v) => Number(v.toFixed(6))), [2.98, 0, 0]);
  });

  it("converts to inches and feet without drift", () => {
    assert.ok(Math.abs(convertLength(0.0254, "in") - 1) < 1e-12);
    assert.ok(Math.abs(convertLength(0.3048, "ft") - 1) < 1e-12);
    assert.equal(formatLength(2.98, "in", 1), "117.3 in");
    assert.equal(formatLength(2.98, "m"), "2.980 m");
  });

  it("is symmetric and zero for identical points", () => {
    const a = measureDistance([0, 1, 2], [3, 4, 5]);
    const b = measureDistance([3, 4, 5], [0, 1, 2]);
    assert.ok(Math.abs(a.meters - b.meters) < 1e-12);
    assert.equal(measureDistance([1, 1, 1], [1, 1, 1]).meters, 0);
  });
});
