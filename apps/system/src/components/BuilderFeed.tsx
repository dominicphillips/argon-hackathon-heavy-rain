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

/**
 * Thought summaries arrive as short titled paragraphs. Use the first short line
 * as the bubble title so the audience reads what the builder is reasoning about.
 */
function splitThought(event: LiveBuildProgressEvent): { title: string; detail: string | null } {
  const detail = event.detail?.trim() ?? "";
  if (event.kind !== "thought" || !detail) return { title: event.title, detail: event.detail };
  const [first, ...rest] = detail.split(/\n+/);
  const heading = first.replace(/^\*+|\*+$/g, "").trim();
  if (heading.length > 0 && heading.length <= 64 && rest.length > 0) {
    return { title: heading, detail: rest.join("\n").trim() || null };
  }
  return { title: event.title, detail };
}

/** The builder's own steps as bubbles, newest at the bottom, over the smoky stage. */
export const BuilderFeed: FC<BuilderFeedProps> = ({
  events,
  tokensLabel,
  filesLabel,
  visible = 7,
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
        {shown.map((event, index) => {
          const { title, detail } = splitThought(event);
          const latest = index === shown.length - 1;
          return (
            <li
              key={event.seq}
              className={`hr-bubble hr-bubble--${event.kind}${latest ? " hr-bubble--latest" : ""}`}
            >
              <span className="hr-bubble__dot" aria-hidden="true" />
              <span className="hr-bubble__body">
                <span className="hr-bubble__title">{title}</span>
                {event.path && <span className="hr-bubble__path">{event.path}</span>}
                {detail && <span className="hr-bubble__detail">{detail}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
