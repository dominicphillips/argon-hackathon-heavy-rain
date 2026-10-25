import * as React from "react";
import {
  BASELINE_A_CONFIG,
  MATERIALS,
  computeChassisMetrics,
  formatDeflection,
  formatLength,
  formatMass,
  formatStiffness,
  type CameraPresetId,
  type ChassisConfig,
  type UnitSystem,
} from "../model/chassisModel.ts";

export interface FallbackSchematicProps {
  config: ChassisConfig;
  unitSystem: UnitSystem;
  cameraPreset: CameraPresetId;
  explosionFactor: number;
  showBodySilhouette: boolean;
  showBaselineGhost: boolean;
  reason?: string;
}

export function FallbackSchematic({
  config,
  unitSystem,
  cameraPreset,
  explosionFactor,
  showBodySilhouette,
  showBaselineGhost,
  reason,
}: FallbackSchematicProps) {
  const metrics = computeChassisMetrics(config);
  const material = MATERIALS[config.materialId] ?? MATERIALS["al-6061-t6"];

  // Map wheelbase (2800..3250) and track (1600..1780) to SVG coordinates
  const scaleX = (config.wheelbaseMm / 2980) * 270;
  const scaleY = (config.trackWidthMm / 1680) * 140;
  const baseScaleX = (BASELINE_A_CONFIG.wheelbaseMm / 2980) * 270;
  const baseScaleY = (BASELINE_A_CONFIG.trackWidthMm / 1680) * 140;
  const railStroke = 4 + (config.wallGaugeMm - 2.0) * 1.8;
  const expOffset = explosionFactor * 28;
  const cx = 300;
  const cy = 190;

  const nCm = Math.round(config.crossMemberCount);
  const crossMemberXs = Array.from({ length: nCm }, (_, idx) => {
    const t = nCm === 1 ? 0.5 : idx / (nCm - 1);
    return cx - scaleX * 0.34 + t * (scaleX * 0.68);
  });

  return (
    <div
      className="augi-fallback-stage"
      role="region"
      aria-label="AUGI Sable parametric technical schematic"
    >
      {reason && (
        <div className="augi-fallback-notice" role="status">
          <strong>2D Parametric Engineering Schematic Active:</strong> {reason}{" "}
          All geometry sliders, load cases, unit conversions, and analytical
          results remain interactive.
        </div>
      )}

      <svg
        viewBox="0 0 600 380"
        className="augi-fallback-svg"
        role="img"
        aria-label={`AUGI Sable ${cameraPreset} orthographic schematic at ${config.wheelbaseMm} mm wheelbase`}
      >
        <defs>
          <radialGradient id="augiTurntableGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#DCE0E5" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#E6E8EB" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="augiTorsionGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#D97706" />
            <stop offset="50%" stopColor={material.tintHex} />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>
        </defs>

        {/* Turntable datum rings */}
        <circle
          cx={cx}
          cy={cy}
          r={168}
          fill="url(#augiTurntableGrad)"
          stroke="#B8BEC8"
          strokeWidth="1"
        />
        <circle
          cx={cx}
          cy={cy}
          r={154}
          fill="none"
          stroke="#C8CCD4"
          strokeWidth="1"
          strokeDasharray="3 5"
        />
        <line
          x1={cx - 185}
          y1={cy}
          x2={cx + 185}
          y2={cy}
          stroke="#B8BEC8"
          strokeWidth="1"
        />
        <line
          x1={cx}
          y1={cy - 175}
          x2={cx}
          y2={cy + 175}
          stroke="#B8BEC8"
          strokeWidth="1"
        />

        {/* Optional Baseline A ghost wireframe */}
        {showBaselineGhost && (
          <g
            stroke="#2563EB"
            strokeWidth="1.5"
            strokeDasharray="5 4"
            fill="none"
            opacity="0.7"
          >
            <rect
              x={cx - baseScaleX / 2}
              y={cy - baseScaleY / 2}
              width={baseScaleX}
              height={baseScaleY}
              rx="14"
            />
          </g>
        )}

        {/* Optional translucent SUV body envelope */}
        {showBodySilhouette && (
          <rect
            x={cx - scaleX * 0.62}
            y={cy - scaleY * 0.62}
            width={scaleX * 1.24}
            height={scaleY * 1.24}
            rx="28"
            fill="#DBEAFE"
            fillOpacity="0.28"
            stroke="#2563EB"
            strokeWidth="1.2"
          />
        )}

        {/* Structural battery tray */}
        <rect
          x={cx - scaleX * 0.36}
          y={cy - scaleY * 0.42}
          width={scaleX * 0.72}
          height={scaleY * 0.84}
          rx="4"
          fill="#DCE0E5"
          stroke="#4B525C"
          strokeWidth="1.5"
        />

        {/* Lateral cross-members */}
        {crossMemberXs.map((xPos, i) => (
          <line
            key={i}
            x1={xPos}
            y1={cy - scaleY * 0.44}
            x2={xPos}
            y2={cy + scaleY * 0.44}
            stroke="#4B525C"
            strokeWidth={Math.max(3, railStroke * 0.7)}
          />
        ))}

        {/* Left & Right longitudinal hydroformed rails */}
        <line
          x1={cx - scaleX * 0.54}
          y1={cy - scaleY * 0.44 - expOffset}
          x2={cx + scaleX * 0.54}
          y2={cy - scaleY * 0.44 - expOffset}
          stroke="url(#augiTorsionGrad)"
          strokeWidth={railStroke}
          strokeLinecap="round"
        />
        <line
          x1={cx - scaleX * 0.54}
          y1={cy + scaleY * 0.44 + expOffset}
          x2={cx + scaleX * 0.54}
          y2={cy + scaleY * 0.44 + expOffset}
          stroke="url(#augiTorsionGrad)"
          strokeWidth={railStroke}
          strokeLinecap="round"
        />

        {/* Front & Rear Cast Subframes */}
        <rect
          x={cx + scaleX * 0.38 + expOffset}
          y={cy - scaleY * 0.36}
          width={scaleX * 0.16}
          height={scaleY * 0.72}
          rx="4"
          fill={material.tintHex}
          stroke="#111317"
          strokeWidth="1.5"
        />
        <rect
          x={cx - scaleX * 0.54 - expOffset}
          y={cy - scaleY * 0.36}
          width={scaleX * 0.16}
          height={scaleY * 0.72}
          rx="4"
          fill={material.tintHex}
          stroke="#111317"
          strokeWidth="1.5"
        />

        {/* 4 Wheel Hubs & Brake Rotors */}
        {[
          [cx + scaleX / 2, cy - scaleY / 2],
          [cx + scaleX / 2, cy + scaleY / 2],
          [cx - scaleX / 2, cy - scaleY / 2],
          [cx - scaleX / 2, cy + scaleY / 2],
        ].map(([hx, hy], idx) => (
          <g key={idx}>
            <rect
              x={hx - 18}
              y={hy - 8}
              width={36}
              height={16}
              rx="4"
              fill="#111317"
            />
            <circle cx={hx} cy={hy} r="5" fill="#D97706" />
          </g>
        ))}

        {/* Dimension callouts */}
        <text
          x={cx}
          y={366}
          textAnchor="middle"
          fontFamily="JetBrains Mono, monospace"
          fontSize="11"
          fill="#111317"
        >
          Wheelbase {formatLength(config.wheelbaseMm, unitSystem)} · Track{" "}
          {formatLength(config.trackWidthMm, unitSystem)} · Stiffness{" "}
          {formatStiffness(metrics.torsionalStiffnessNmPerDeg, unitSystem)} ·
          Deflection {formatDeflection(metrics.peakBendingDeflectionMm, unitSystem)}{" "}
          · Mass {formatMass(metrics.structuralMassKg, unitSystem)}
        </text>
      </svg>
    </div>
  );
}
