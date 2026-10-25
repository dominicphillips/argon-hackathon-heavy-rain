import * as React from "react";
import type { SystemStatusTone, WorkerRole } from "../tokens";
import { Status } from "./Status";

export interface WorkerQuoteProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "children"> {
  roleName: WorkerRole | string;
  stepNumber?: number;
  tone?: SystemStatusTone;
  statusLabel: React.ReactNode;
  message: React.ReactNode;
  dismissLabel: string;
  detailsLabel?: string;
  onDismiss: () => void;
  onViewDetails?: () => void;
  reducedMotion?: boolean;
}

/**
 * Small on-canvas worker quote box. Shows the role, its short status, and
 * one plain line of text. Secondary "details" action is optional.
 */
export function WorkerQuote({
  roleName,
  stepNumber,
  tone = "completed",
  statusLabel,
  message,
  dismissLabel,
  detailsLabel,
  onDismiss,
  onViewDetails,
  reducedMotion = false,
  className = "",
  ...props
}: WorkerQuoteProps) {
  const classes = [
    "hr-worker-quote",
    reducedMotion ? "hr-worker-quote--still" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <aside className={classes} aria-label={String(roleName)} {...props}>
      <div className="hr-worker-quote__head">
        <span className="hr-worker-quote__who">
          {stepNumber !== undefined && (
            <span className="hr-worker-quote__num" aria-hidden="true">
              {stepNumber}
            </span>
          )}
          <span className="hr-worker-quote__role">{roleName}</span>
        </span>
        <Status tone={tone} label={statusLabel} className="hr-worker-quote__status" />
        <button
          type="button"
          className="hr-worker-quote__dismiss"
          aria-label={dismissLabel}
          title={dismissLabel}
          onClick={onDismiss}
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path
              d="M2 2l8 8M10 2l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </button>
      </div>
      <p className="hr-worker-quote__message">{message}</p>
      {onViewDetails && detailsLabel ? (
        <button
          type="button"
          className="hr-worker-quote__details"
          onClick={onViewDetails}
        >
          {detailsLabel}
        </button>
      ) : null}
    </aside>
  );
}
