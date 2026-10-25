import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SUBSYSTEMS,
  DEFAULT_WHEELBASE_M,
  SUBSYSTEM_BOUNDS,
  SUBSYSTEM_IDS,
  clamp,
  computeAxleShare,
  computeCenterOfGravity,
  computeMassBalance,
  formatKg,
  formatMeters,
  formatPercent,
  updateSubsystem,
  type Subsystem,
} from "./massBalance.ts";

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

function part(massKg: number, xM: number, yM = 0.5, zM = 0): Subsystem {
  return { id: "payload", massKg, xM, yM, zM, sizeM: [1, 1, 1] };
}

describe("mass balance: weighted center of gravity", () => {
  it("places equal masses symmetric about the origin at the midpoint", () => {
    const cg = computeCenterOfGravity([part(100, -1.2, 0.4), part(100, 1.2, 0.8)]);
    near(cg.totalMassKg, 200);
    near(cg.xM, 0);
    near(cg.yM, 0.6);
    near(cg.zM, 0);
  });

  it("mirroring every x position mirrors the CG exactly", () => {
    const parts = [part(540, -0.05, 0.3), part(160, 1.35, 0.42), part(190, -1.3, 0.4)];
    const mirrored = parts.map((p) => ({ ...p, xM: -p.xM }));
    near(computeCenterOfGravity(mirrored).xM, -computeCenterOfGravity(parts).xM);
  });

  it("moving one mass forward moves the CG forward by m/M times the shift", () => {
    const base = [part(400, 0, 0.3), part(100, -1, 0.5)];
    const before = computeCenterOfGravity(base);
    const shifted = [base[0], { ...base[1], xM: base[1].xM + 0.5 }];
    const after = computeCenterOfGravity(shifted);
    near(after.xM - before.xM, (100 / 500) * 0.5);
    near(after.yM, before.yM);
  });

  it("raising one mass raises the CG by m/M times the lift", () => {
    const base = [part(400, 0, 0.3), part(100, 0, 0.5)];
    const before = computeCenterOfGravity(base);
    const after = computeCenterOfGravity([base[0], { ...base[1], yM: 0.9 }]);
    near(after.yM - before.yM, (100 / 500) * 0.4);
  });

  it("increasing a part's mass pulls the CG toward that part", () => {
    const light = computeCenterOfGravity([part(500, 0), part(100, 1.4)]);
    const heavy = computeCenterOfGravity([part(500, 0), part(300, 1.4)]);
    assert.ok(heavy.xM > light.xM);
  });

  it("ignores zero, negative, and non-finite masses and guards zero total", () => {
    const cg = computeCenterOfGravity([part(0, 5), part(-20, 5), part(Number.NaN, 5), part(Number.POSITIVE_INFINITY, 5)]);
    assert.deepEqual(cg, { totalMassKg: 0, xM: 0, yM: 0, zM: 0 });
    const mixed = computeCenterOfGravity([part(100, 1, 0.5), part(Number.NaN, 9, 9)]);
    near(mixed.totalMassKg, 100);
    near(mixed.xM, 1);
  });

  it("treats a non-finite position as zero instead of poisoning the sum", () => {
    const cg = computeCenterOfGravity([part(100, Number.NaN, Number.POSITIVE_INFINITY)]);
    assert.ok(Number.isFinite(cg.xM) && Number.isFinite(cg.yM));
    near(cg.xM, 0);
    near(cg.yM, 0);
  });
});

describe("mass balance: axle share", () => {
  it("front and rear shares always sum to 100 percent", () => {
    for (const x of [-2, -1.49, -0.3, 0, 0.42, 1.49, 2.5]) {
      const s = computeAxleShare(x, DEFAULT_WHEELBASE_M, 2000);
      near(s.front + s.rear, 1);
      near(s.frontKg + s.rearKg, 2000);
    }
  });

  it("uses +X front: CG at the midpoint is 50/50, at the front axle 100/0, at the rear axle 0/100", () => {
    const L = 3;
    near(computeAxleShare(0, L, 1000).front, 0.5);
    near(computeAxleShare(L / 2, L, 1000).front, 1);
    near(computeAxleShare(-L / 2, L, 1000).rear, 1);
    near(computeAxleShare(0.3, L, 1000).front, 0.6);
    near(computeAxleShare(0.3, L, 1000).frontKg, 600);
  });

  it("clamps CG positions beyond an axle to a full transfer", () => {
    near(computeAxleShare(5, 3, 1000).front, 1);
    near(computeAxleShare(-5, 3, 1000).rear, 1);
  });

  it("falls back to an even split for zero or non-finite wheelbase or CG", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) near(computeAxleShare(0.2, bad, 1000).front, 0.5);
    near(computeAxleShare(Number.NaN, 3, 1000).rear, 0.5);
    near(computeAxleShare(0, 3, Number.NaN).frontKg, 0);
  });

  it("is unit consistent: scaling meters to millimeters for both CG and wheelbase leaves the share unchanged", () => {
    const a = computeAxleShare(0.42, 2.98, 2100);
    const b = computeAxleShare(420, 2980, 2100);
    near(a.front, b.front);
  });
});

describe("mass balance: defaults, update, and formatting", () => {
  it("default subsystems cover every id once, sit inside their bounds, and give a plausible concept vehicle", () => {
    assert.deepEqual(DEFAULT_SUBSYSTEMS.map((p) => p.id), SUBSYSTEM_IDS);
    for (const p of DEFAULT_SUBSYSTEMS) {
      const b = SUBSYSTEM_BOUNDS[p.id];
      assert.ok(p.massKg >= b.massKg.min && p.massKg <= b.massKg.max, p.id);
      assert.ok(p.xM >= b.xM.min && p.xM <= b.xM.max, p.id);
      assert.ok(p.yM >= b.yM.min && p.yM <= b.yM.max, p.id);
    }
    const m = computeMassBalance(DEFAULT_SUBSYSTEMS);
    assert.ok(m.totalMassKg > 1800 && m.totalMassKg < 2400, `total ${m.totalMassKg}`);
    assert.ok(m.share.front > 0.4 && m.share.front < 0.6, `front ${m.share.front}`);
    assert.ok(m.yM > 0.3 && m.yM < 0.7, `height ${m.yM}`);
    assert.ok(Math.abs(m.xM) < DEFAULT_WHEELBASE_M / 2);
  });

  it("updateSubsystem clamps to bounds, leaves other parts untouched, and never mutates input", () => {
    const next = updateSubsystem(DEFAULT_SUBSYSTEMS, "battery", { massKg: 5000, xM: Number.NaN });
    const battery = next.find((p) => p.id === "battery")!;
    assert.equal(battery.massKg, SUBSYSTEM_BOUNDS.battery.massKg.max);
    assert.equal(battery.xM, SUBSYSTEM_BOUNDS.battery.xM.min);
    assert.equal(battery.yM, DEFAULT_SUBSYSTEMS[0].yM);
    assert.deepEqual(next.filter((p) => p.id !== "battery"), DEFAULT_SUBSYSTEMS.filter((p) => p.id !== "battery"));
    assert.equal(DEFAULT_SUBSYSTEMS[0].massKg, 540);
  });

  it("clamp guards non-finite values", () => {
    assert.equal(clamp(Number.NaN, 1, 2), 1);
    assert.equal(clamp(9, 1, 2), 2);
    assert.equal(clamp(-9, 1, 2), 1);
  });

  it("formatters carry units and tolerate non-finite input", () => {
    assert.equal(formatKg(2069.6), "2,070 kg");
    assert.equal(formatKg(Number.NaN), "0 kg");
    assert.equal(formatMeters(0.123), "+0.12 m");
    assert.equal(formatMeters(-0.5), "-0.50 m");
    assert.equal(formatMeters(Number.NaN), "0.00 m");
    assert.equal(formatPercent(0.4825), "48.3%");
  });
});
