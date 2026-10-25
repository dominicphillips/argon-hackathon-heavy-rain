import * as React from "react";
import { Status } from "./Status";
import type { SystemStatusTone } from "../tokens";

export interface BuildChamberProps extends React.HTMLAttributes<HTMLElement> {
  stageLabel?: React.ReactNode;
  stageTone?: SystemStatusTone;
  isBuilding?: boolean;
  reducedMotion?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Central build chamber enforcing the Heavy Rain blur policy:
 * Smoky blur and atmospheric mist apply strictly to the inner stage preview
 * when `isBuilding` is true; the bezel, status pill, and action controls remain sharp.
 */
export function BuildChamber({
  stageLabel = "Building",
  stageTone = "building",
  isBuilding = true,
  reducedMotion = false,
  actions,
  className = "",
  children,
  ...props
}: BuildChamberProps) {
  const classes = ["hr-build-chamber", className].filter(Boolean).join(" ");
  const innerClasses = [
    "hr-build-chamber__stage-inner",
    isBuilding && !reducedMotion
      ? "hr-build-chamber__stage-inner--building"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={classes} {...props}>
      <header className="hr-build-chamber__bezel">
        <Status tone={stageTone} label={stageLabel} />
        {actions && <div>{actions}</div>}
      </header>
      <div className="hr-build-chamber__viewport">
        <div className={innerClasses} aria-busy={isBuilding}>
          {children}
        </div>
        {isBuilding && (
          <div className="hr-build-chamber__smoke-veil" aria-hidden="true" />
        )}
      </div>
    </section>
  );
}
