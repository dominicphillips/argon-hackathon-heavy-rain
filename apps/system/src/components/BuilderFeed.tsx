import type { FC } from "react";
import type { LiveBuildProgressEvent } from "../backend/client";

export interface BuilderFeedProps {
  events: LiveBuildProgressEvent[];
  /** A fixed first card explaining the handoff to the sandbox worker. */
  opening?: { title: string; detail: string } | null;
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
/** Presentation only: drop code spans and workspace paths the audience should not have to read. */
function tidy(text: string): string {
  return text
    .replace(/`[^`]*`/g, "")
    .replace(/\bworkspace\/app\/?[\w./-]*/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
}

function splitThought(event: LiveBuildProgressEvent): { title: string; detail: string | null } {
  const detail = tidy(event.detail ?? "");
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
  opening = null,
  tokensLabel,
  filesLabel,
  visible = 5,
  reducedMotion = false,
}) => {
  const streamed = dedupe(events.filter((event) => EDITORIAL_KINDS.has(event.kind) && event.title !== "Request received"));
  const openingEvent: LiveBuildProgressEvent | null = opening
    ? { seq: 0, at: "", kind: "status", title: opening.title, detail: opening.detail, path: null }
    : null;
  const editorial = [...(openingEvent ? [openingEvent] : []), ...streamed].slice(-visible);
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
              className={`hr-bubble hr-bubble--${event.kind}${latest ? " hr-bubble--latest" : ""}${event.seq === 0 ? " hr-bubble--opening" : ""}`}
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
          {activity.path && activity.path !== activity.title && (
            <span className="hr-feed__ticker-path">{activity.path}</span>
          )}
        </div>
      )}
    </div>
  );
};
