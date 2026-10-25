import * as React from "react";

export type SystemPanelVariant = "surface" | "elevated" | "flat" | "chamber";

export interface PanelProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  as?: "section" | "div" | "aside" | "article";
  variant?: SystemPanelVariant;
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  actions?: React.ReactNode;
}

export function Panel({
  as: Tag = "section",
  variant = "surface",
  eyebrow,
  title,
  actions,
  className = "",
  children,
  ...props
}: PanelProps) {
  const classes = [
    "hr-panel",
    variant !== "surface" ? `hr-panel--${variant}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag className={classes} {...props}>
      {(eyebrow || title || actions) && (
        <header className="hr-panel__header">
          <div>
            {eyebrow && <p className="hr-panel__eyebrow">{eyebrow}</p>}
            {title && <h2 className="hr-panel__title">{title}</h2>}
          </div>
          {actions && <div>{actions}</div>}
        </header>
      )}
      {children}
    </Tag>
  );
}
