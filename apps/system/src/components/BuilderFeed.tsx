import type { FC } from "react";
import type { LiveBuildProgressEvent } from "../backend/client";

export interface BuilderFeedProps {
  events: LiveBuildProgressEvent[];
  tokensLabel: string | null;
  filesLabel: string | null;
  /** How many editorial bubbles stay on screen; older ones leave. */
  visible?: number;
  reducedMotion?: boolean;
}

/** Narration, reasoning, and status lead the feed; raw tool activity stays in a quiet ticker line. */
const EDITORIAL_KINDS = new Set(["message", "thought", "status", "error"]);
const ACTIVITY_KINDS = new Set(["tool_call", "tool_result", "file"]);

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

/** A streamed message may arrive twice: a partial early emission and the full sentence. Keep the fuller one. */
function dedupe(events: LiveBuildProgressEvent[]): LiveBuildProgressEvent[] {
  const out: LiveBuildProgressEvent[] = [];
  for (const event of events) {
    const prev = out[out.length - 1];
    if (prev && prev.kind === event.kind && event.kind === "message" && prev.detail && event.detail) {
      const a = prev.detail.trim();
      const b = event.detail.trim();
      if (b.startsWith(a) || a.startsWith(b)) {
        out[out.length - 1] = b.length >= a.length ? event : prev;
        continue;
      }
    }
    out.push(event);
  }
  return out;
}

export const BuilderFeed: FC<BuilderFeedProps> = ({
  events,
  tokensLabel,
  filesLabel,
  visible = 5,
  reducedMotion = false,
}) => {
  const editorial = dedupe(events.filter((event) => EDITORIAL_KINDS.has(event.kind))).slice(-visible);
  const activity = [...events].reverse().find((event) => ACTIVITY_KINDS.has(event.kind)) ?? null;
  return (
    <div className={`hr-feed${reducedMotion ? " hr-feed--static" : ""}`} aria-live="polite">
      <div className="hr-feed__head">
        <span className="hr-feed__meta hr-tabular">
          {filesLabel && <span>{filesLabel}</span>}
          {tokensLabel && <span>{tokensLabel}</span>}
        </span>
      </div>
      <ol className="hr-feed__list">
        {editorial.map((event, index) => {
          const { title, detail } = splitThought(event);
          const latest = index === editorial.length - 1;
          const narration = event.kind === "message";
          return (
            <li
              key={event.seq}
              className={`hr-bubble hr-bubble--${event.kind}${latest ? " hr-bubble--latest" : ""}`}
            >
              <span className="hr-bubble__dot" aria-hidden="true" />
              <span className="hr-bubble__body">
                {narration && detail ? (
                  <span className="hr-bubble__narration">{detail}</span>
                ) : (
                  <>
                    <span className="hr-bubble__title">{title}</span>
                    {detail && <span className="hr-bubble__detail">{detail}</span>}
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {activity && (
        <div className="hr-feed__ticker hr-tabular" key={activity.seq}>
          <span className={`hr-feed__ticker-dot hr-feed__ticker-dot--${activity.kind}`} aria-hidden="true" />
          <span>{activity.title}</span>
          {activity.path && <span className="hr-feed__ticker-path">{activity.path}</span>}
          {!activity.path && activity.detail && <span className="hr-feed__ticker-path">{activity.detail}</span>}
        </div>
      )}
    </div>
  );
};
