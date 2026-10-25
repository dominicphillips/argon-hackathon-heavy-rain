import type { CSSProperties, FC } from "react";
import type { SystemStatusTone } from "@heavy-rain/system-ui";

export interface ChamberLiveEntry {
  role: string;
  stepNumber: number;
  tone: SystemStatusTone;
  label: string;
  isActive: boolean;
  message: string;
}

export interface ChamberLiveReadoutProps {
  entries: ChamberLiveEntry[];
  reducedMotion?: boolean;
}

const DONE_TONES: ReadonlySet<SystemStatusTone> = new Set<SystemStatusTone>([
  "completed",
  "verified",
  "deployed",
]);

/**
 * Centered, always-sharp readout above the smoky veil. Shows which worker is
 * active, what it is doing right now, and what the earlier workers finished.
 * Remounts the "now" block on every handoff so the enter animation replays.
 */
export const ChamberLiveReadout: FC<ChamberLiveReadoutProps> = ({
  entries,
  reducedMotion = false,
}) => {
  const active =
    entries.find((entry) => entry.isActive) ??
    entries.find((entry) => !DONE_TONES.has(entry.tone));
  if (!active) return null;

  const done = entries.filter(
    (entry) => entry !== active && DONE_TONES.has(entry.tone),
  );
  const working = active.tone === "running" || active.tone === "building";

  return (
    <div
      className={`hr-chamber-live${
        reducedMotion ? " hr-chamber-live--static" : ""
      }`}
      role="status"
      aria-live="polite"
    >
      <div
        className="hr-chamber-live__now"
        key={`${active.role}-${active.tone}-${active.message}`}
      >
        <span className="hr-chamber-live__eyebrow hr-tabular">
          <span
            className={`hr-chamber-live__dot hr-chamber-live__dot--${active.tone}`}
            aria-hidden="true"
          />
          Step {active.stepNumber} of {entries.length} · {active.role} ·{" "}
          {active.label}
        </span>
        <p className="hr-chamber-live__headline">{active.message}</p>
        {working && (
          <span className="hr-chamber-live__sweep" aria-hidden="true" />
        )}
      </div>

      {done.length > 0 && (
        <ul className="hr-chamber-live__done">
          {done.map((entry, index) => (
            <li
              key={entry.role}
              className="hr-chamber-live__done-item"
              style={{ "--hr-live-i": index } as CSSProperties}
            >
              <span className="hr-chamber-live__check" aria-hidden="true">
                ✓
              </span>
              <span className="hr-chamber-live__done-role">{entry.role}</span>
              <span className="hr-chamber-live__done-text">
                {entry.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
