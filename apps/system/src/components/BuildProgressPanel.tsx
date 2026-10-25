import type { FC } from "react";

export type BuildProgressRowState = "done" | "active" | "paused" | "queued";

export interface BuildProgressSubItem {
  key: string;
  label: string;
  state: "done" | "active" | "queued";
}

export interface BuildProgressRow {
  key: string;
  label: string;
  state: BuildProgressRowState;
  /** Shown under the row while it is active; items animate in and tick off. */
  items?: BuildProgressSubItem[];
}

export interface BuildProgressPanelProps {
  eyebrow?: string | null;
  title: string;
  subtitle?: string | null;
  progressLabel?: string | null;
  rows: BuildProgressRow[];
  footer?: string | null;
  /** A short notice when the build stopped; replaces the footer. */
  notice?: { tone: "failed" | "info"; title?: string; body: string } | null;
  reducedMotion?: boolean;
}

/**
 * Left-docked, always-sharp progress panel over the smoky chamber: what is being
 * built, who asked, and which steps are done. Rows are supplied by the caller so
 * the same panel serves the scripted demo and real builds.
 */
export const BuildProgressPanel: FC<BuildProgressPanelProps> = ({
  eyebrow,
  title,
  subtitle,
  progressLabel,
  rows,
  footer,
  notice,
  reducedMotion = false,
}) => (
  <aside
    className={`hr-build-panel${reducedMotion ? " hr-build-panel--static" : ""}`}
    aria-live="polite"
  >
    <header className="hr-build-panel__head">
      {eyebrow && <span className="hr-build-panel__eyebrow">{eyebrow}</span>}
      <h2 className="hr-build-panel__title" key={title}>
        {title}
      </h2>
      {subtitle && <p className="hr-build-panel__subtitle">{subtitle}</p>}
    </header>

    <section className="hr-build-panel__section">
      {progressLabel && <h3 className="hr-build-panel__label">{progressLabel}</h3>}
      <ol className="hr-build-panel__steps">
        {rows.map((row) => (
          <li key={row.key} className={`hr-build-step hr-build-step--${row.state}`}>
            <span className="hr-build-step__icon" aria-hidden="true">
              {row.state === "done" && (
                <svg viewBox="0 0 16 16" focusable="false">
                  <path
                    d="M3.5 8.5l3 3 6-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </span>
            <span className="hr-build-step__label">{row.label}</span>
            {row.state === "active" && row.items && row.items.length > 0 && (
              <ul className="hr-build-step__items">
                {row.items.map((item, index) => (
                  <li
                    key={item.key}
                    className={`hr-build-step__item hr-build-step__item--${item.state}`}
                    style={{ animationDelay: `${index * 90}ms` }}
                  >
                    <span className="hr-build-step__item-icon" aria-hidden="true">
                      {item.state === "done" && (
                        <svg viewBox="0 0 16 16" focusable="false">
                          <path d="M3.5 8.5l3 3 6-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    {item.label}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>

    {notice ? (
      <div className={`hr-build-panel__notice hr-build-panel__notice--${notice.tone}`} role="status">
        {notice.title && <strong>{notice.title}</strong>}
        <p>{notice.body}</p>
      </div>
    ) : (
      footer && (
        <footer className="hr-build-panel__footer">
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M8 7v4M8 5v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          {footer}
        </footer>
      )
    )}
  </aside>
);
