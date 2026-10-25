import * as React from "react";

export type OrganizationThemeId = "rookmere" | "augi";

export interface OrganizationThemeProviderProps
  extends React.HTMLAttributes<HTMLDivElement> {
  theme: OrganizationThemeId;
  reducedMotion?: boolean;
  children: React.ReactNode;
}

export function OrganizationThemeProvider({
  theme,
  reducedMotion = false,
  className = "",
  children,
  ...props
}: OrganizationThemeProviderProps) {
  const classes = ["org-theme-root", className].filter(Boolean).join(" ");

  return (
    <div
      className={classes}
      data-org-theme={theme}
      data-org-reduced-motion={reducedMotion ? "true" : "false"}
      {...props}
    >
      {children}
    </div>
  );
}
