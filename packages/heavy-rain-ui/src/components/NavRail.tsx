import * as React from "react";

export interface NavRailItem {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface NavRailProps extends Omit<React.HTMLAttributes<HTMLElement>, "onSelect"> {
  items: readonly NavRailItem[];
  activeId: string;
  onSelect?: (id: string) => void;
  eyebrow?: React.ReactNode;
  showDotMatrix?: boolean;
  ariaLabel?: string;
}

export function NavRail({
  items,
  activeId,
  onSelect,
  eyebrow,
  showDotMatrix = true,
  ariaLabel = "System navigation",
  className = "",
  ...props
}: NavRailProps) {
  const classes = ["hr-nav-rail", className].filter(Boolean).join(" ");

  return (
    <nav aria-label={ariaLabel} className={classes} {...props}>
      {eyebrow && <p className="hr-nav-rail__eyebrow">{eyebrow}</p>}
      <ul className="hr-nav-rail__list">
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <li key={item.id}>
              <button
                type="button"
                className={`hr-nav-rail__button${
                  isActive ? " hr-nav-rail__button--active" : ""
                }`}
                aria-current={isActive ? "page" : undefined}
                disabled={item.disabled}
                onClick={() => onSelect?.(item.id)}
              >
                <span>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {showDotMatrix && (
        <div className="hr-nav-rail__dot-matrix" aria-hidden="true">
          {Array.from({ length: 20 }).map((_, idx) => (
            <span key={idx} />
          ))}
        </div>
      )}
    </nav>
  );
}
