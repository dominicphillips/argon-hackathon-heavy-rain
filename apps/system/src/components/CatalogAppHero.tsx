import { useId, type ReactNode } from "react";
import type { OrganizationId } from "../types";
import "../styles/catalog-app-hero.css";

/**
 * CatalogAppHero
 * Low-fidelity, code-native concept sketch for one Apps catalog entry.
 * Pure SVG: no raster, no text, no navigation. The parent card owns layout,
 * copy, CTA, and status. Scenes resolve from the catalog appId; unknown IDs
 * fall back to a stacked part-row / document composition.
 */

export type CatalogHeroScene =
  | "chassis-cutaway"
  | "mass-balance"
  | "joint-matrix"
  | "variance-bridge"
  | "valuation-bridge"
  | "diligence-checklist"
  | "kpi-intake"
  | "supplier-rows";

export interface CatalogAppHeroProps {
  appId: string;
  orgId: OrganizationId;
  className?: string;
  /** Accessible title. When omitted the SVG is decorative (aria-hidden). */
  title?: string;
  /** Force a scene regardless of appId. Useful for previews. */
  scene?: CatalogHeroScene;
}

const SCENE_BY_APP_ID: Record<string, CatalogHeroScene> = {
  app_augi_sable_chassis_3d: "chassis-cutaway",
  app_augi_bom_mass_ledger: "mass-balance",
  app_augi_fastener_weld_matrix: "joint-matrix",
  app_rm_variance_workbench: "variance-bridge",
  app_rm_valuation_bridge: "valuation-bridge",
  app_rm_diligence_tracker: "diligence-checklist",
  app_rm_kpi_ingest: "kpi-intake",
};

export function resolveCatalogHeroScene(
  appId: string,
  orgId: OrganizationId,
): CatalogHeroScene {
  const exact = SCENE_BY_APP_ID[appId];
  if (exact) return exact;
  const id = appId.toLowerCase();
  if (id.includes("chassis") || id.includes("3d")) return "chassis-cutaway";
  if (id.includes("mass") || id.includes("cog")) return "mass-balance";
  if (id.includes("weld") || id.includes("fastener") || id.includes("joint"))
    return "joint-matrix";
  if (id.includes("valuation")) return "valuation-bridge";
  if (id.includes("variance") || id.includes("bridge")) return "variance-bridge";
  if (id.includes("diligence") || id.includes("tracker"))
    return "diligence-checklist";
  if (id.includes("kpi") || id.includes("ingest") || id.includes("collector"))
    return "kpi-intake";
  if (id.includes("supplier") || id.includes("bom")) return "supplier-rows";
  return orgId === "augi" ? "supplier-rows" : "diligence-checklist";
}

const VIEW_W = 320;
const VIEW_H = 240;

/* ---------- shared draw helpers ---------- */

/** Side-profile car body outline: a sculpted fastback on a skateboard floor. */
function carBodyPath(x: number, y: number, w: number): string {
  // y is the sill line; the body rises above it. Proportions tuned for w≈200.
  const h = w * 0.3;
  return [
    `M ${x} ${y}`,
    `L ${x + w * 0.06} ${y - h * 0.3}`,
    `C ${x + w * 0.1} ${y - h * 0.5}, ${x + w * 0.22} ${y - h * 0.55}, ${x + w * 0.32} ${y - h * 0.62}`,
    `C ${x + w * 0.42} ${y - h * 1.0}, ${x + w * 0.62} ${y - h * 1.02}, ${x + w * 0.72} ${y - h * 0.78}`,
    `C ${x + w * 0.82} ${y - h * 0.6}, ${x + w * 0.94} ${y - h * 0.5}, ${x + w * 0.98} ${y - h * 0.3}`,
    `L ${x + w} ${y}`,
  ].join(" ");
}

function Wheel({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <>
      <circle className="hr-catalog-hero__ink" cx={cx} cy={cy} r={r} />
      <circle className="hr-catalog-hero__ash" cx={cx} cy={cy} r={r * 0.45} />
    </>
  );
}

function Frame() {
  return (
    <rect
      className="hr-catalog-hero__frame"
      x={14}
      y={14}
      width={VIEW_W - 28}
      height={VIEW_H - 28}
      rx={6}
    />
  );
}

/** Dimension line with end ticks. */
function Dim({
  x1,
  y1,
  x2,
  y2,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}) {
  const horizontal = y1 === y2;
  const t = 4;
  return (
    <g className="hr-catalog-hero__dim">
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      {horizontal ? (
        <>
          <line x1={x1} y1={y1 - t} x2={x1} y2={y1 + t} />
          <line x1={x2} y1={y2 - t} x2={x2} y2={y2 + t} />
        </>
      ) : (
        <>
          <line x1={x1 - t} y1={y1} x2={x1 + t} y2={y1} />
          <line x1={x2 - t} y1={y2} x2={x2 + t} y2={y2} />
        </>
      )}
    </g>
  );
}

/** Document sheet with faint rule lines. */
function Sheet({
  x,
  y,
  w,
  h,
  lines = 3,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  lines?: number;
}) {
  const fold = Math.min(10, w * 0.18);
  return (
    <g>
      <path
        className="hr-catalog-hero__ink-soft"
        d={`M ${x} ${y} H ${x + w - fold} L ${x + w} ${y + fold} V ${y + h} H ${x} Z`}
      />
      <path
        className="hr-catalog-hero__ash"
        d={`M ${x + w - fold} ${y} V ${y + fold} H ${x + w}`}
      />
      {Array.from({ length: lines }, (_, i) => {
        const ly = y + h * 0.3 + i * (h * 0.5) / Math.max(lines - 1, 1);
        return (
          <line
            key={i}
            className="hr-catalog-hero__ash"
            x1={x + w * 0.16}
            y1={ly}
            x2={x + w * (i === lines - 1 ? 0.6 : 0.84)}
            y2={ly}
          />
        );
      })}
    </g>
  );
}

/* ---------- scenes ---------- */

function ChassisCutaway({ clipId }: { clipId: string }) {
  const x = 56;
  const sill = 150;
  const w = 208;
  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect x={x + w * 0.5} y={0} width={w} height={VIEW_H} />
        </clipPath>
      </defs>
      {/* Skateboard floor: battery tray between axles */}
      <rect
        className="hr-catalog-hero__wash"
        x={x + 18}
        y={sill + 6}
        width={w - 36}
        height={14}
        rx={2}
      />
      <rect
        className="hr-catalog-hero__ink-soft"
        x={x + 18}
        y={sill + 6}
        width={w - 36}
        height={14}
        rx={2}
      />
      {Array.from({ length: 7 }, (_, i) => (
        <line
          key={i}
          className="hr-catalog-hero__ash"
          x1={x + 40 + i * 22}
          y1={sill + 6}
          x2={x + 40 + i * 22}
          y2={sill + 20}
        />
      ))}
      {/* Rear half: smooth sculpted skin */}
      <path className="hr-catalog-hero__ink" d={carBodyPath(x, sill, w)} />
      {/* Front half: cutaway revealing structure (clipped) */}
      <g clipPath={`url(#${clipId})`}>
        <path
          className="hr-catalog-hero__accent"
          d={`M ${x + w * 0.5} ${sill - 2} L ${x + w * 0.72} ${sill - 48} L ${x + w * 0.9} ${sill - 24} L ${x + w * 0.98} ${sill - 2}`}
        />
        <path
          className="hr-catalog-hero__accent"
          d={`M ${x + w * 0.56} ${sill - 2} L ${x + w * 0.7} ${sill - 30} L ${x + w * 0.84} ${sill - 2}`}
        />
        <line
          className="hr-catalog-hero__accent"
          x1={x + w * 0.5}
          y1={sill - 18}
          x2={x + w * 0.96}
          y2={sill - 18}
        />
      </g>
      {/* Section plane marker */}
      <line
        className="hr-catalog-hero__dim"
        x1={x + w * 0.5}
        y1={sill - 76}
        x2={x + w * 0.5}
        y2={sill + 30}
      />
      <Wheel cx={x + w * 0.2} cy={sill + 12} r={20} />
      <Wheel cx={x + w * 0.8} cy={sill + 12} r={20} />
      <Dim x1={x + w * 0.2} y1={sill + 46} x2={x + w * 0.8} y2={sill + 46} />
    </g>
  );
}

function MassBalance() {
  const x = 64;
  const sill = 128;
  const w = 192;
  const cgX = x + w * 0.46;
  const cgY = sill - 22;
  const pivotY = 196;
  return (
    <g>
      <path className="hr-catalog-hero__ink-soft" d={carBodyPath(x, sill, w)} />
      <Wheel cx={x + w * 0.2} cy={sill + 12} r={17} />
      <Wheel cx={x + w * 0.8} cy={sill + 12} r={17} />
      {/* Centre-of-gravity glyph: quartered circle */}
      <circle className="hr-catalog-hero__accent" cx={cgX} cy={cgY} r={9} />
      <path
        className="hr-catalog-hero__accent-fill"
        d={`M ${cgX} ${cgY} L ${cgX + 9} ${cgY} A 9 9 0 0 1 ${cgX} ${cgY + 9} Z M ${cgX} ${cgY} L ${cgX - 9} ${cgY} A 9 9 0 0 1 ${cgX} ${cgY - 9} Z`}
      />
      <line
        className="hr-catalog-hero__dim"
        x1={cgX}
        y1={cgY + 9}
        x2={cgX}
        y2={pivotY - 14}
      />
      {/* Balance beam and fulcrum, slightly tipped */}
      <path
        className="hr-catalog-hero__ink"
        d={`M ${cgX - 12} ${pivotY} L ${cgX} ${pivotY - 14} L ${cgX + 12} ${pivotY} Z`}
      />
      <line
        className="hr-catalog-hero__ink"
        x1={x + 10}
        y1={pivotY - 10}
        x2={x + w - 10}
        y2={pivotY - 18}
      />
      <rect
        className="hr-catalog-hero__wash"
        x={x + 10}
        y={pivotY - 24}
        width={26}
        height={14}
        rx={1}
      />
      <rect
        className="hr-catalog-hero__ink-soft"
        x={x + 10}
        y={pivotY - 24}
        width={26}
        height={14}
        rx={1}
      />
      <rect
        className="hr-catalog-hero__wash"
        x={x + w - 36}
        y={pivotY - 40}
        width={26}
        height={22}
        rx={1}
      />
      <rect
        className="hr-catalog-hero__ink-soft"
        x={x + w - 36}
        y={pivotY - 40}
        width={26}
        height={22}
        rx={1}
      />
      <Dim x1={x + w * 0.2} y1={cgY - 40} x2={cgX} y2={cgY - 40} />
      <Dim x1={cgX} y1={cgY - 40} x2={x + w * 0.8} y2={cgY - 40} />
    </g>
  );
}

function JointMatrix() {
  const ox = 70;
  const oy = 56;
  const step = 36;
  const cols = 5;
  const rows = 4;
  // Which cells carry a welded joint vs a bolted fastener vs adhesive.
  const kinds = [
    "w", "b", "w", "a", "b",
    "b", "w", "a", "w", "w",
    "a", "b", "w", "b", "a",
    "w", "a", "b", "w", "b",
  ];
  return (
    <g>
      {/* Grid rails */}
      {Array.from({ length: rows + 1 }, (_, r) => (
        <line
          key={`r${r}`}
          className="hr-catalog-hero__ash"
          x1={ox}
          y1={oy + r * step}
          x2={ox + cols * step}
          y2={oy + r * step}
        />
      ))}
      {Array.from({ length: cols + 1 }, (_, c) => (
        <line
          key={`c${c}`}
          className="hr-catalog-hero__ash"
          x1={ox + c * step}
          y1={oy}
          x2={ox + c * step}
          y2={oy + rows * step}
        />
      ))}
      {/* Two structural members crossing the grid */}
      <path
        className="hr-catalog-hero__ink"
        d={`M ${ox - 10} ${oy + step * 1.5} H ${ox + cols * step + 10}`}
      />
      <path
        className="hr-catalog-hero__ink"
        d={`M ${ox + step * 2.5} ${oy - 10} V ${oy + rows * step + 10}`}
      />
      {/* Joint glyphs */}
      {kinds.map((k, i) => {
        const cx = ox + (i % cols) * step + step / 2;
        const cy = oy + Math.floor(i / cols) * step + step / 2;
        const onMember =
          Math.floor(i / cols) === 1 || i % cols === 2;
        if (k === "w") {
          return (
            <g key={i} className={onMember ? "hr-catalog-hero__accent" : "hr-catalog-hero__ink-soft"}>
              <path d={`M ${cx - 6} ${cy + 5} Q ${cx} ${cy - 8} ${cx + 6} ${cy + 5}`} />
              <line x1={cx - 7} y1={cy + 5} x2={cx + 7} y2={cy + 5} />
            </g>
          );
        }
        if (k === "b") {
          return (
            <g key={i} className={onMember ? "hr-catalog-hero__accent" : "hr-catalog-hero__ink-soft"}>
              <polygon
                points={`${cx},${cy - 7} ${cx + 6},${cy - 3.5} ${cx + 6},${cy + 3.5} ${cx},${cy + 7} ${cx - 6},${cy + 3.5} ${cx - 6},${cy - 3.5}`}
              />
              <circle cx={cx} cy={cy} r={2.2} />
            </g>
          );
        }
        return (
          <g key={i} className={onMember ? "hr-catalog-hero__accent" : "hr-catalog-hero__ash"}>
            <line x1={cx - 7} y1={cy - 2} x2={cx + 7} y2={cy - 2} />
            <line x1={cx - 7} y1={cy + 2} x2={cx + 7} y2={cy + 2} />
          </g>
        );
      })}
      <Dim x1={ox} y1={oy + rows * step + 22} x2={ox + step} y2={oy + rows * step + 22} />
      <Dim x1={ox + cols * step + 20} y1={oy} x2={ox + cols * step + 20} y2={oy + step} />
    </g>
  );
}

function VarianceBridge() {
  const baseY = 170;
  const x0 = 54;
  const bw = 22;
  const gap = 10;
  // Start bar, four variance steps, end bar.
  const start = 70;
  const steps = [18, -30, 12, -8];
  let level = start;
  const bars: { x: number; y: number; h: number; kind: "end" | "up" | "down" }[] = [
    { x: x0, y: baseY - start, h: start, kind: "end" },
  ];
  steps.forEach((s, i) => {
    const x = x0 + (i + 1) * (bw + gap);
    const top = Math.max(level, level + s);
    bars.push({ x, y: baseY - top, h: Math.abs(s), kind: s >= 0 ? "up" : "down" });
    level += s;
  });
  bars.push({ x: x0 + 5 * (bw + gap), y: baseY - level, h: level, kind: "end" });
  return (
    <g>
      {/* Ledger rows to the right */}
      {Array.from({ length: 6 }, (_, i) => {
        const ly = 58 + i * 20;
        return (
          <g key={i}>
            <line className="hr-catalog-hero__ash" x1={236} y1={ly} x2={280} y2={ly} />
            <line
              className="hr-catalog-hero__ink-soft"
              x1={236}
              y1={ly - 6}
              x2={236 + 14 + ((i * 7) % 20)}
              y2={ly - 6}
            />
          </g>
        );
      })}
      <line className="hr-catalog-hero__ink" x1={236} y1={176} x2={280} y2={176} />
      <line className="hr-catalog-hero__ink" x1={236} y1={179} x2={280} y2={179} />
      {/* Baseline */}
      <line className="hr-catalog-hero__ink" x1={x0 - 10} y1={baseY} x2={x0 + 6 * (bw + gap)} y2={baseY} />
      {bars.map((b, i) => (
        <rect
          key={i}
          className={b.kind === "end" ? "hr-catalog-hero__wash" : "hr-catalog-hero__accent-wash"}
          x={b.x}
          y={b.y}
          width={bw}
          height={b.h}
        />
      ))}
      {bars.map((b, i) => (
        <rect
          key={`o${i}`}
          className={b.kind === "end" ? "hr-catalog-hero__ink" : "hr-catalog-hero__accent"}
          x={b.x}
          y={b.y}
          width={bw}
          height={b.h}
        />
      ))}
      {/* Connectors: carry each bar's closing level across to the next bar */}
      {bars.slice(0, -1).map((b, i) => {
        const next = bars[i + 1];
        const level = b.kind === "down" ? b.y + b.h : b.y;
        return (
          <line
            key={`c${i}`}
            className="hr-catalog-hero__dim"
            x1={b.x + bw}
            y1={level}
            x2={next.x}
            y2={level}
          />
        );
      })}
    </g>
  );
}

function ValuationBridge() {
  // Quarter-to-quarter walk: two anchor columns and a rising staircase between.
  const baseY = 176;
  const left = { x: 52, h: 56 };
  const right = { x: 232, h: 96 };
  const stairs = [
    { x: 92, y0: 56, dy: 14 },
    { x: 126, y0: 70, dy: 10 },
    { x: 160, y0: 80, dy: -6 },
    { x: 194, y0: 74, dy: 22 },
  ];
  return (
    <g>
      <line className="hr-catalog-hero__ink" x1={38} y1={baseY} x2={282} y2={baseY} />
      <rect className="hr-catalog-hero__wash" x={left.x} y={baseY - left.h} width={28} height={left.h} />
      <rect className="hr-catalog-hero__ink" x={left.x} y={baseY - left.h} width={28} height={left.h} />
      <rect className="hr-catalog-hero__wash" x={right.x} y={baseY - right.h} width={28} height={right.h} />
      <rect className="hr-catalog-hero__ink" x={right.x} y={baseY - right.h} width={28} height={right.h} />
      {stairs.map((s, i) => {
        const top = baseY - Math.max(s.y0, s.y0 + s.dy);
        const h = Math.abs(s.dy);
        return (
          <g key={i}>
            <rect className="hr-catalog-hero__accent-wash" x={s.x} y={top} width={24} height={h} />
            <rect className="hr-catalog-hero__accent" x={s.x} y={top} width={24} height={h} />
          </g>
        );
      })}
      {/* Tie lines across step tops */}
      <path
        className="hr-catalog-hero__dim"
        d={`M ${left.x + 28} ${baseY - left.h} H ${stairs[0].x} M ${stairs[0].x + 24} ${baseY - 70} H ${stairs[1].x} M ${stairs[1].x + 24} ${baseY - 80} H ${stairs[2].x} M ${stairs[2].x + 24} ${baseY - 74} H ${stairs[3].x} M ${stairs[3].x + 24} ${baseY - 96} H ${right.x}`}
      />
      {/* Quarter ticks under the baseline */}
      {[left.x + 14, right.x + 14].map((tx, i) => (
        <line key={i} className="hr-catalog-hero__ink-soft" x1={tx} y1={baseY} x2={tx} y2={baseY + 8} />
      ))}
      {/* Stamp / seal mark top right, standing in for the valuation sign-off */}
      <circle className="hr-catalog-hero__ash" cx={262} cy={48} r={14} />
      <circle className="hr-catalog-hero__ash" cx={262} cy={48} r={9} />
    </g>
  );
}

function DiligenceChecklist() {
  const x = 60;
  const y = 44;
  const rowH = 24;
  const rows = [true, true, true, false, false, false];
  return (
    <g>
      {/* Request list board */}
      <rect className="hr-catalog-hero__ink-soft" x={x} y={y} width={132} height={rows.length * rowH + 20} rx={3} />
      <line className="hr-catalog-hero__ink-soft" x1={x} y1={y + 16} x2={x + 132} y2={y + 16} />
      {rows.map((done, i) => {
        const ry = y + 28 + i * rowH;
        return (
          <g key={i}>
            <rect
              className={done ? "hr-catalog-hero__accent" : "hr-catalog-hero__ink-soft"}
              x={x + 12}
              y={ry - 6}
              width={12}
              height={12}
              rx={2}
            />
            {done && (
              <path
                className="hr-catalog-hero__accent"
                d={`M ${x + 14.5} ${ry} L ${x + 17.5} ${ry + 3} L ${x + 22} ${ry - 3}`}
              />
            )}
            <line
              className="hr-catalog-hero__ash"
              x1={x + 34}
              y1={ry}
              x2={x + 34 + 50 + ((i * 13) % 36)}
              y2={ry}
            />
          </g>
        );
      })}
      {/* Fanned answer documents coming in from the right */}
      <g transform={`rotate(-8 240 140)`}>
        <Sheet x={214} y={96} w={58} h={76} lines={4} />
      </g>
      <g transform={`rotate(4 240 140)`}>
        <Sheet x={224} y={104} w={58} h={76} lines={4} />
      </g>
      {/* Thread connecting an open item to its answer */}
      <path
        className="hr-catalog-hero__dim"
        d={`M ${x + 132} ${y + 28 + 3 * rowH} C 206 ${y + 28 + 3 * rowH}, 210 140, 226 140`}
      />
      <circle className="hr-catalog-hero__accent-fill" cx={226} cy={140} r={2.6} />
    </g>
  );
}

function KpiIntake() {
  // Three source sheets converging into one collector tray.
  const trayY = 172;
  return (
    <g>
      <g transform="rotate(-10 86 92)">
        <Sheet x={60} y={56} w={52} h={66} lines={3} />
      </g>
      <Sheet x={134} y={46} w={52} h={66} lines={3} />
      <g transform="rotate(10 234 92)">
        <Sheet x={208} y={56} w={52} h={66} lines={3} />
      </g>
      {/* Converging guide lines */}
      <path className="hr-catalog-hero__dim" d={`M 86 128 C 100 150, 140 160, 160 162`} />
      <path className="hr-catalog-hero__dim" d={`M 160 118 V 162`} />
      <path className="hr-catalog-hero__dim" d={`M 234 128 C 220 150, 180 160, 160 162`} />
      {/* Collector tray */}
      <path
        className="hr-catalog-hero__ink"
        d={`M 96 ${trayY} L 104 ${trayY + 30} H 216 L 224 ${trayY} Z`}
      />
      <line className="hr-catalog-hero__ink-soft" x1={108} y1={trayY + 10} x2={212} y2={trayY + 10} />
      {/* Single normalized row emerging */}
      <rect className="hr-catalog-hero__accent-wash" x={118} y={trayY + 16} width={84} height={8} rx={1} />
      <rect className="hr-catalog-hero__accent" x={118} y={trayY + 16} width={84} height={8} rx={1} />
      {/* Monthly cadence ticks */}
      {Array.from({ length: 6 }, (_, i) => (
        <line
          key={i}
          className="hr-catalog-hero__ash"
          x1={120 + i * 16}
          y1={trayY + 38}
          x2={120 + i * 16}
          y2={trayY + 44}
        />
      ))}
      <line className="hr-catalog-hero__ash" x1={120} y1={trayY + 44} x2={200} y2={trayY + 44} />
    </g>
  );
}

function SupplierRows() {
  // Stacked part rows with a swatch, a part silhouette, and a document per row.
  const x = 56;
  const y0 = 54;
  const rowH = 32;
  const parts: ReactNode[] = [
    <path key="p0" className="hr-catalog-hero__ink-soft" d="M 0 0 h 28 v 10 h -28 z" />,
    <path key="p1" className="hr-catalog-hero__ink-soft" d="M 0 10 L 8 0 H 28 V 10 Z" />,
    <path key="p2" className="hr-catalog-hero__ink-soft" d="M 0 5 a 5 5 0 0 1 5 -5 h 18 a 5 5 0 0 1 5 5 a 5 5 0 0 1 -5 5 h -18 a 5 5 0 0 1 -5 -5 z" />,
    <path key="p3" className="hr-catalog-hero__ink-soft" d="M 0 0 h 28 v 4 h -10 v 6 h -8 v -6 h -10 z" />,
  ];
  return (
    <g>
      {parts.map((part, i) => {
        const ry = y0 + i * rowH;
        const highlighted = i === 1;
        return (
          <g key={i}>
            <line className="hr-catalog-hero__ash" x1={x} y1={ry + 24} x2={x + 208} y2={ry + 24} />
            <rect
              className={highlighted ? "hr-catalog-hero__accent-fill" : "hr-catalog-hero__wash"}
              x={x}
              y={ry + 4}
              width={14}
              height={14}
              rx={2}
            />
            <g transform={`translate(${x + 30} ${ry + 6})`}>{part}</g>
            <line
              className="hr-catalog-hero__ink-soft"
              x1={x + 78}
              y1={ry + 11}
              x2={x + 78 + 40 + ((i * 17) % 30)}
              y2={ry + 11}
            />
            <Sheet x={x + 180} y={ry + 1} w={22} h={20} lines={2} />
          </g>
        );
      })}
      <Dim x1={x + 30} y1={y0 + 4 * rowH + 8} x2={x + 58} y2={y0 + 4 * rowH + 8} />
    </g>
  );
}

/* ---------- component ---------- */

export function CatalogAppHero({
  appId,
  orgId,
  className,
  title,
  scene,
}: CatalogAppHeroProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const clipId = `hr-hero-clip-${uid}`;
  const titleId = `hr-hero-title-${uid}`;
  const resolved = scene ?? resolveCatalogHeroScene(appId, orgId);

  let drawing: ReactNode;
  switch (resolved) {
    case "chassis-cutaway":
      drawing = <ChassisCutaway clipId={clipId} />;
      break;
    case "mass-balance":
      drawing = <MassBalance />;
      break;
    case "joint-matrix":
      drawing = <JointMatrix />;
      break;
    case "variance-bridge":
      drawing = <VarianceBridge />;
      break;
    case "valuation-bridge":
      drawing = <ValuationBridge />;
      break;
    case "diligence-checklist":
      drawing = <DiligenceChecklist />;
      break;
    case "kpi-intake":
      drawing = <KpiIntake />;
      break;
    case "supplier-rows":
    default:
      drawing = <SupplierRows />;
  }

  const rootClass = ["hr-catalog-hero", `hr-catalog-hero--${resolved}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass} data-app-id={appId} data-org-id={orgId} data-scene={resolved}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        role={title ? "img" : undefined}
        aria-hidden={title ? undefined : true}
        aria-labelledby={title ? titleId : undefined}
        focusable="false"
      >
        {title ? <title id={titleId}>{title}</title> : null}
        <Frame />
        {drawing}
      </svg>
    </div>
  );
}

export default CatalogAppHero;
