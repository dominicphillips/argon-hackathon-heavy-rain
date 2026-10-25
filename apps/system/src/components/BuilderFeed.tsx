import type { FC } from "react";
import type { LiveBuildProgressEvent } from "../backend/client";

export interface BuilderFeedProps {
  events: LiveBuildProgressEvent[];
  tokensLabel: string | null;
  filesLabel: string | null;
  /** How many bubbles stay on screen; older ones leave. */
  visible?: number;
  reducedMotion?: boolean;
}

/** The builder's own steps as small bubbles, newest at the bottom, over the smoky stage. */
export const BuilderFeed: FC<BuilderFeedProps> = ({
  events,
  tokensLabel,
  filesLabel,
  visible = 6,
  reducedMotion = false,
}) => {
  const shown = events.slice(-visible);
  return (
    <div className={`hr-feed${reducedMotion ? " hr-feed--static" : ""}`} aria-live="polite">
      <div className="hr-feed__head">
        <span className="hr-feed__meta hr-tabular">
          {filesLabel && <span>{filesLabel}</span>}
          {tokensLabel && <span>{tokensLabel}</span>}
        </span>
      </div>
      <ol className="hr-feed__list">
        {shown.map((event, index) => (
          <li
            key={event.seq}
            className={`hr-bubble hr-bubble--${event.kind}${
              index === shown.length - 1 ? " hr-bubble--latest" : ""
            }`}
          >
            <span className="hr-bubble__dot" aria-hidden="true" />
            <span className="hr-bubble__body">
              <span className="hr-bubble__title">{event.title}</span>
              {event.path && <span className="hr-bubble__path">{event.path}</span>}
              {event.detail && <span className="hr-bubble__detail">{event.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
};
