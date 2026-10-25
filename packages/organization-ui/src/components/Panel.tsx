import * as React from "react";

export type OrganizationPanelVariant = "surface" | "default" | "inset" | "transparent";

export interface PanelProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  as?: "section" | "div" | "aside" | "article";
  variant?: OrganizationPanelVariant;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}

export function Panel({
  as: Tag = "section",
  variant = "surface",
  title,
  subtitle,
  actions,
  className = "",
  children,
  ...props
}: PanelProps) {
  const classes = [
    "org-panel",
    variant !== "surface" && variant !== "default" ? `org-panel--${variant}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag className={classes} {...props}>
      {(title || subtitle || actions) && (
        <header className="org-panel__header">
          <div>
            {title && <h3 className="org-panel__title">{title}</h3>}
            {subtitle && <p className="org-panel__subtitle">{subtitle}</p>}
          </div>
          {actions && <div>{actions}</div>}
        </header>
      )}
      {children}
    </Tag>
  );
}
