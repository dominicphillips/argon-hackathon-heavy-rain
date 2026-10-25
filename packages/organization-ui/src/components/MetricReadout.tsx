import * as React from "react";
import { Status } from "./Status";

export interface MetricReadoutProps
  extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  sublabel?: React.ReactNode;
  disclosureLabel?: React.ReactNode;
  limitationNote?: React.ReactNode;
}

/**
 * Tabular metric readout card that places model limitation or concept-estimate
 * context directly beside the result rather than in a page-wide warning banner.
 */
export function MetricReadout({
  label,
  value,
  sublabel,
  disclosureLabel,
  limitationNote,
  className = "",
  ...props
}: MetricReadoutProps) {
  const classes = ["org-metric", className].filter(Boolean).join(" ");

  return (
    <div className={classes} {...props}>
      <div className="org-metric__header">
        <span className="org-metric__label">{label}</span>
        {disclosureLabel && (
          <Status tone="estimate" label={disclosureLabel} />
        )}
      </div>
      <div className="org-metric__value">{value}</div>
      {sublabel && <div className="org-metric__sublabel">{sublabel}</div>}
      {limitationNote && (
        <p className="org-metric__limitation">{limitationNote}</p>
      )}
    </div>
  );
}
