import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BASELINE_A_CONFIG,
  CHASSIS_PRESETS,
  MATERIAL_LIST,
  PARAMETER_BOUNDS,
  clampParameter,
  compareChassisMetrics,
  computeChassisMetrics,
  formatDeflection,
  formatLength,
  formatMass,
  formatStiffness,
  inToMm,
  kNToLbf,
  kNmToLbfFt,
  kgToLb,
  lbToKg,
  lbfFtToKNm,
  lbfToKN,
  mmToIn,
  mpaToKsi,
  nmPerDegToLbfFtPerDeg,
  validateParameter,
  type ChassisConfig,
} from "./chassisModel.ts";
import {
  createSnapshotRecord,
  sanitizeChassisConfig,
} from "./storage.ts";

describe("AUGI Sable analytical chassis model", () => {
  it("converts between metric and imperial units consistently without drift", () => {
    const wheelbaseMm = 2980;
    const inches = mmToIn(wheelbaseMm);
    assert.ok(Math.abs(inches - 117.3228) < 1e-3);
    assert.ok(Math.abs(inToMm(inches) - wheelbaseMm) < 1e-9);

    const forceKN = 18.0;
    const lbf = kNToLbf(forceKN);
    assert.ok(Math.abs(lbf - 4046.56) < 0.05);
    assert.ok(Math.abs(lbfToKN(lbf) - forceKN) < 1e-9);

    const torqueKNm = 18.0;
    const lbfFt = kNmToLbfFt(torqueKNm);
    assert.ok(Math.abs(lbfFt - 13276.12) < 0.05);
    assert.ok(Math.abs(lbfFtToKNm(lbfFt) - torqueKNm) < 1e-9);

    const massKg = 380;
    const lb = kgToLb(massKg);
    assert.ok(Math.abs(lb - 837.756) < 0.05);
    assert.ok(Math.abs(lbToKg(lb) - massKg) < 1e-9);

    const stiffnessNmDeg = 40000; // 40 kNm/deg
    assert.ok(
      Math.abs(nmPerDegToLbfFtPerDeg(stiffnessNmDeg) - kNmToLbfFt(40)) < 1e-6
    );

    assert.ok(mpaToKsi(276) > 39 && mpaToKsi(276) < 41);

    assert.equal(formatLength(2980, "metric"), "2980 mm");
    assert.equal(formatLength(2980, "imperial"), "117.3 in");
    assert.ok(formatStiffness(41200, "metric").endsWith("Nm/deg"));
    assert.ok(formatStiffness(41200, "imperial").endsWith("lbf·ft/deg"));
    assert.ok(formatMass(380, "metric").endsWith("kg"));
    assert.ok(formatMass(380, "imperial").endsWith("lb"));
    assert.ok(formatDeflection(1.25, "metric").endsWith("mm"));
    assert.ok(formatDeflection(1.25, "imperial").endsWith("in"));
  });

  it("produces finite, positive, non-NaN results across all presets, materials, and boundary extremes", () => {
    for (const preset of CHASSIS_PRESETS) {
      const m = computeChassisMetrics(preset.config);
      assert.ok(Number.isFinite(m.torsionalStiffnessNmPerDeg));
      assert.ok(m.torsionalStiffnessNmPerDeg > 15000);
      assert.ok(Number.isFinite(m.peakTwistDeg) && m.peakTwistDeg > 0);
      assert.ok(
        Number.isFinite(m.peakBendingDeflectionMm) &&
          m.peakBendingDeflectionMm > 0
      );
      assert.ok(
        Number.isFinite(m.bendingStiffnessKNPerMm) &&
          m.bendingStiffnessKNPerMm > 0
      );
      assert.ok(Number.isFinite(m.structuralMassKg) && m.structuralMassKg > 100);
      assert.ok(
        Number.isFinite(m.stiffnessToMassRatioNmDegPerKg) &&
          m.stiffnessToMassRatioNmDegPerKg > 0
      );
      assert.ok(
        Number.isFinite(m.peakConceptStressMPa) && m.peakConceptStressMPa > 0
      );
      assert.ok(
        Number.isFinite(m.yieldUtilizationRatio) && m.yieldUtilizationRatio > 0
      );
    }

    for (const mat of MATERIAL_LIST) {
      const minConfig: ChassisConfig = {
        ...BASELINE_A_CONFIG,
        wheelbaseMm: PARAMETER_BOUNDS.wheelbaseMm.min,
        trackWidthMm: PARAMETER_BOUNDS.trackWidthMm.min,
        wallGaugeMm: PARAMETER_BOUNDS.wallGaugeMm.min,
        crossMemberCount: PARAMETER_BOUNDS.crossMemberCount.min,
        torsionTorqueKNm: PARAMETER_BOUNDS.torsionTorqueKNm.min,
        bendingLoadKN: PARAMETER_BOUNDS.bendingLoadKN.min,
        materialId: mat.id,
      };
      const maxConfig: ChassisConfig = {
        ...BASELINE_A_CONFIG,
        wheelbaseMm: PARAMETER_BOUNDS.wheelbaseMm.max,
        trackWidthMm: PARAMETER_BOUNDS.trackWidthMm.max,
        wallGaugeMm: PARAMETER_BOUNDS.wallGaugeMm.max,
        crossMemberCount: PARAMETER_BOUNDS.crossMemberCount.max,
        torsionTorqueKNm: PARAMETER_BOUNDS.torsionTorqueKNm.max,
        bendingLoadKN: PARAMETER_BOUNDS.bendingLoadKN.max,
        materialId: mat.id,
      };

      for (const cfg of [minConfig, maxConfig]) {
        const res = computeChassisMetrics(cfg);
        for (const [k, v] of Object.entries(res)) {
          if (typeof v === "number") {
            assert.ok(
              Number.isFinite(v) && v > 0,
              `Expected positive finite metric for ${k}, got ${v}`
            );
          }
        }
      }
    }
  });

  it("makes thicker rails strictly stiffer and heavier in both torsion and bending", () => {
    const thin = computeChassisMetrics({
      ...BASELINE_A_CONFIG,
      wallGaugeMm: 2.2,
    });
    const medium = computeChassisMetrics({
      ...BASELINE_A_CONFIG,
      wallGaugeMm: 3.2,
    });
    const thick = computeChassisMetrics({
      ...BASELINE_A_CONFIG,
      wallGaugeMm: 4.6,
    });

    assert.ok(
      thin.torsionalStiffnessNmPerDeg < medium.torsionalStiffnessNmPerDeg &&
        medium.torsionalStiffnessNmPerDeg < thick.torsionalStiffnessNmPerDeg,
      "Torsional stiffness must increase monotonically with wall gauge"
    );
    assert.ok(
      thin.bendingStiffnessKNPerMm < medium.bendingStiffnessKNPerMm &&
        medium.bendingStiffnessKNPerMm < thick.bendingStiffnessKNPerMm,
      "Bending stiffness must increase monotonically with wall gauge"
    );
    assert.ok(
      thin.structuralMassKg < medium.structuralMassKg &&
        medium.structuralMassKg < thick.structuralMassKg,
      "Structural mass must increase monotonically with wall gauge"
    );
    assert.ok(
      thin.peakTwistDeg > medium.peakTwistDeg &&
        medium.peakTwistDeg > thick.peakTwistDeg,
      "Peak twist angle must decrease when wall gauge increases"
    );
    assert.ok(
      thin.peakBendingDeflectionMm > medium.peakBendingDeflectionMm &&
        medium.peakBendingDeflectionMm > thick.peakBendingDeflectionMm,
      "Mid-span bending deflection must decrease when wall gauge increases"
    );
  });

  it("makes longer wheelbase beams strictly more flexible in torsion and bending while increasing mass", () => {
    const shortSpan = computeChassisMetrics({
      ...BASELINE_A_CONFIG,
      wheelbaseMm: 2820,
    });
    const longSpan = computeChassisMetrics({
      ...BASELINE_A_CONFIG,
      wheelbaseMm: 3220,
    });

    assert.ok(
      longSpan.torsionalStiffnessNmPerDeg <
        shortSpan.torsionalStiffnessNmPerDeg,
      "Longer wheelbase must reduce torsional stiffness"
    );
    assert.ok(
      longSpan.peakTwistDeg > shortSpan.peakTwistDeg,
      "Longer wheelbase must increase twist angle under identical torque"
    );
    assert.ok(
      longSpan.peakBendingDeflectionMm > shortSpan.peakBendingDeflectionMm,
      "Longer wheelbase must increase vertical bending sag (L^3 scaling)"
    );
    assert.ok(
      longSpan.structuralMassKg > shortSpan.structuralMassKg,
      "Longer wheelbase must increase structural rail and tray mass"
    );
  });

  it("strictly doubles twist when torque doubles and doubles sag when vertical load doubles", () => {
    const torque12 = computeChassisMetrics({
      ...BASELINE_A_CONFIG,
      torsionTorqueKNm: 12.0,
      bendingLoadKN: 10.0,
    });
    const torque24 = computeChassisMetrics({
      ...BASELINE_A_CONFIG,
      torsionTorqueKNm: 24.0,
      bendingLoadKN: 20.0,
    });

    assert.ok(
      Math.abs(torque24.peakTwistDeg / torque12.peakTwistDeg - 2.0) < 1e-12,
      "Doubling torque must strictly double twist angle"
    );
    assert.ok(
      Math.abs(
        torque24.peakBendingDeflectionMm / torque12.peakBendingDeflectionMm -
          2.0
      ) < 1e-12,
      "Doubling vertical load must strictly double bending deflection"
    );
    assert.equal(
      torque12.torsionalStiffnessNmPerDeg,
      torque24.torsionalStiffnessNmPerDeg,
      "Linear elastic torsional stiffness is independent of applied load magnitude"
    );
  });

  it("validates out-of-bounds inputs with clear recovery guidance and clamps safely", () => {
    assert.equal(validateParameter("wheelbaseMm", 2980, "metric"), null);
    const errHigh = validateParameter("wheelbaseMm", 3900, "metric");
    assert.ok(errHigh !== null && errHigh.includes("2800 mm and 3250 mm"));
    assert.ok(errHigh.includes("Reset parameter"));

    const errNan = validateParameter("wallGaugeMm", Number.NaN, "metric");
    assert.ok(errNan !== null && errNan.includes("requires a number"));

    assert.equal(clampParameter("wheelbaseMm", 3900), 3250);
    assert.equal(clampParameter("wheelbaseMm", 1200), 2800);
    assert.equal(
      clampParameter("wheelbaseMm", Number.NaN),
      PARAMETER_BOUNDS.wheelbaseMm.default
    );
  });

  it("computes accurate signed comparison deltas between Baseline A and Candidate B", () => {
    const base = computeChassisMetrics(CHASSIS_PRESETS[0].config);
    const candB = computeChassisMetrics(CHASSIS_PRESETS[1].config);
    const delta = compareChassisMetrics(base, candB);

    assert.ok(
      delta.stiffnessNmPerDegDiff > 0 && delta.stiffnessPctDiff > 0,
      "Candidate B (3.4 mm 7075-T6) should be stiffer than Baseline A (2.4 mm 6061-T6)"
    );
    assert.ok(
      delta.massKgDiff > 0 && delta.massPctDiff > 0,
      "Candidate B should have higher structural mass than Baseline A"
    );
    assert.ok(
      delta.twistDegDiff < 0,
      "Candidate B should exhibit less twist under the same 18 kNm torque"
    );
  });

  it("sanitizes untrusted or partial snapshot configurations safely", () => {
    const dirty = sanitizeChassisConfig({
      wheelbaseMm: 99999,
      trackWidthMm: -10,
      wallGaugeMm: Number.NaN,
      materialId: "unobtainium-composite",
      loadCase: "invalid-case",
    });

    assert.equal(dirty.wheelbaseMm, PARAMETER_BOUNDS.wheelbaseMm.max);
    assert.equal(dirty.trackWidthMm, PARAMETER_BOUNDS.trackWidthMm.min);
    assert.equal(dirty.wallGaugeMm, PARAMETER_BOUNDS.wallGaugeMm.default);
    assert.equal(dirty.materialId, BASELINE_A_CONFIG.materialId);
    assert.equal(dirty.loadCase, BASELINE_A_CONFIG.loadCase);

    const snap = createSnapshotRecord(BASELINE_A_CONFIG, "Test Study Snapshot");
    assert.equal(snap.label, "Test Study Snapshot");
    assert.equal(snap.config.wheelbaseMm, 2980);
    assert.ok(snap.snapshotId.startsWith("snap_"));
  });
});
