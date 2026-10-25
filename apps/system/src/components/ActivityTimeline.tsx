import type { FC, KeyboardEvent } from "react";
import type { TraceEvent } from "../types";
import "../styles/activity-timeline.css";

/** Technical fields revealed only inside the per-event disclosure. */
export type ActivityDetailField =
  | "toolName"
  | "inputEvidence"
  | "toolOutput"
  | "durationMs";

const DETAIL_FIELDS: readonly ActivityDetailField[] = [
  "toolName",
  "inputEvidence",
  "toolOutput",
  "durationMs",
];

export interface ActivityTimelineProps {
  /** Rendered in the order given; backend append order is chronological. */
  events: readonly TraceEvent[];
  /** Disclosure summary text for every row, e.g. the owner phrase "View details". */
  detailsLabel: string;
  /** Optional heading above the list. */
  title?: string;
  /** Shown only when there are no events and a string is supplied. */
  emptyState?: string;
  /** Optional caller-supplied labels for the technical fields inside details. Unlabelled fields render value-only. */
  detailLabels?: Partial<Record<ActivityDetailField, string>>;
  selectedEventId?: string;
  onSelect?: (eventId: string) => void;
  /** Disables the opening opacity fade; the media preference is also honoured in CSS. */
  reducedMotion?: boolean;
}

function detailValue(event: TraceEvent, field: ActivityDetailField) {
  if (field === "durationMs") {
    return (
      <data value={String(event.durationMs)}>{event.durationMs} ms</data>
    );
  }
  const value = event[field];
  if (!value) return null;
  return field === "toolName" ? (
    <code>{value}</code>
  ) : (
    <pre className="hr-activity-timeline__pre">{value}</pre>
  );
}

export const ActivityTimeline: FC<ActivityTimelineProps> = ({
  events,
  detailsLabel,
  title,
  emptyState,
  detailLabels,
  selectedEventId,
  onSelect,
  reducedMotion = false,
}) => {
  const selectable = typeof onSelect === "function";

  const handleKey = (event: KeyboardEvent<HTMLElement>, eventId: string) => {
    if (!selectable) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(eventId);
    }
  };

  return (
    <section
      className="hr-activity-timeline"
      data-reduced-motion={reducedMotion ? "true" : undefined}
    >
      {title ? <h2 className="hr-activity-timeline__title">{title}</h2> : null}

      {events.length === 0 ? (
        emptyState ? (
          <p className="hr-activity-timeline__empty">{emptyState}</p>
        ) : null
      ) : (
        <ol className="hr-activity-timeline__list">
          {events.map((event) => {
            const selected = event.eventId === selectedEventId;
            const hasDetails = Boolean(
              event.decisionSummary ||
                event.toolName ||
                event.inputEvidence ||
                event.toolOutput,
            );
            return (
              <li
                key={event.eventId}
                className={[
                  "hr-activity-timeline__row",
                  selected ? "hr-activity-timeline__row--selected" : "",
                  selectable ? "hr-activity-timeline__row--selectable" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-current={selected ? "true" : undefined}
              >
                <span className="hr-activity-timeline__dot" aria-hidden="true" />
                <div
                  className="hr-activity-timeline__entry"
                  role={selectable ? "button" : undefined}
                  tabIndex={selectable ? 0 : undefined}
                  onClick={selectable ? () => onSelect(event.eventId) : undefined}
                  onKeyDown={
                    selectable
                      ? (keyEvent) => handleKey(keyEvent, event.eventId)
                      : undefined
                  }
                >
                  <time
                    className="hr-activity-timeline__time"
                    dateTime={event.timestamp}
                  >
                    {event.timestamp}
                  </time>
                  <span className="hr-activity-timeline__actor">
                    {event.actor}
                  </span>
                  <p className="hr-activity-timeline__headline">
                    {event.headline}
                  </p>
                </div>

                {hasDetails ? (
                  <details className="hr-activity-timeline__details">
                    <summary className="hr-activity-timeline__summary">
                      {detailsLabel}
                    </summary>
                    <div className="hr-activity-timeline__body">
                      {event.decisionSummary ? (
                        <p className="hr-activity-timeline__decision">
                          {event.decisionSummary}
                        </p>
                      ) : null}
                      <dl className="hr-activity-timeline__fields">
                        {DETAIL_FIELDS.map((field) => {
                          const value = detailValue(event, field);
                          if (value === null) return null;
                          const label = detailLabels?.[field];
                          return (
                            <div
                              key={field}
                              className="hr-activity-timeline__field"
                              data-field={field}
                            >
                              {label ? <dt>{label}</dt> : null}
                              <dd>{value}</dd>
                            </div>
                          );
                        })}
                      </dl>
                    </div>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};

export default ActivityTimeline;
