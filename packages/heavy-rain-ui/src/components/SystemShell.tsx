import * as React from "react";
import type { SystemSurfaceMode } from "../tokens";

export interface SystemShellProps extends React.HTMLAttributes<HTMLDivElement> {
  surface?: SystemSurfaceMode;
  reducedMotion?: boolean;
  topBar?: React.ReactNode;
  leftNav?: React.ReactNode;
  rightRail?: React.ReactNode;
  children: React.ReactNode;
}

export function SystemShell({
  surface = "ash",
  reducedMotion = false,
  topBar,
  leftNav,
  rightRail,
  className = "",
  children,
  ...props
}: SystemShellProps) {
  const classes = ["hr-shell", className].filter(Boolean).join(" ");

  return (
    <div
      className={classes}
      data-hr-surface={surface}
      data-hr-reduced-motion={reducedMotion ? "true" : "false"}
      {...props}
    >
      {topBar}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: rightRail
            ? "180px minmax(0, 1fr) 260px"
            : "180px minmax(0, 1fr)",
          gap: "32px",
          alignItems: "center",
          padding: "24px 40px 40px",
          maxWidth: "1440px",
          margin: "0 auto",
        }}
      >
        <div>{leftNav}</div>
        <main>{children}</main>
        {rightRail && <aside>{rightRail}</aside>}
      </div>
    </div>
  );
}
