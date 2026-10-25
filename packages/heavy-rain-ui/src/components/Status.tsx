import * as React from "react";
import type { SystemStatusTone, WorkerRole } from "../tokens";

export interface StatusProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: SystemStatusTone;
  label: React.ReactNode;
  showDot?: boolean;
}

export function Status({
  tone = "completed",
  label,
  showDot = true,
  className = "",
  ...props
}: StatusProps) {
  const classes = ["hr-status", `hr-status--${tone}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} {...props}>
      {showDot && <span className="hr-status__dot" aria-hidden="true" />}
      <span>{label}</span>
    </span>
  );
}

export interface WorkerRowProps extends React.HTMLAttributes<HTMLDivElement> {
  roleName: WorkerRole | string;
  statusLabel: React.ReactNode;
  tone?: SystemStatusTone;
}

export function WorkerRow({
  roleName,
  statusLabel,
  tone = "completed",
  className = "",
  ...props
}: WorkerRowProps) {
  const classes = ["hr-worker-row", className].filter(Boolean).join(" ");
  return (
    <div className={classes} {...props}>
      <span className="hr-worker-row__role">{roleName}</span>
      <Status tone={tone} label={statusLabel} />
    </div>
  );
}
