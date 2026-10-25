import * as React from "react";

export type OrganizationStatusTone =
  | "neutral"
  | "estimate"
  | "positive"
  | "warning"
  | "critical";

export interface StatusProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: OrganizationStatusTone;
  label: React.ReactNode;
}

export function Status({
  tone = "neutral",
  label,
  className = "",
  ...props
}: StatusProps) {
  const classes = [
    "org-status",
    tone !== "neutral" ? `org-status--${tone}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} {...props}>
      {label}
    </span>
  );
}
