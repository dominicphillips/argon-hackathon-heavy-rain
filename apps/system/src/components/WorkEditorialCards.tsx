import type { FC } from "react";
import { Button } from "@heavy-rain/system-ui";
import type {
  ClusterDisposition,
  EmployeeReport,
  OrganizationId,
  RecurrenceCluster,
} from "../types";
import "../styles/work-editorial.css";

export interface WorkEditorialPersona {
  name: string;
  role: string;
  quote: string;
  avatarUrl?: string;
  /** Sprite-sheet portrait: image URL plus CSS background-position (e.g. "100% 0%"). */
  avatarAtlasUrl?: string;
  avatarAtlasPosition?: string;
  /** Background-size for the atlas; defaults to "200% 200%" (2x2 sheet). */
  avatarAtlasSize?: string;
}

export type WorkEditorialIllustration = "chassis" | "ledger" | "contour";

/** Verbatim approved chat excerpt. Never derived from host chat history. */
export interface WorkEditorialSourceExcerpt {
  excerptId?: string;
  author: string;
  role?: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Assistant surface the excerpt was selected from, e.g. "Claude Desktop". */
  source?: string;
  /** Source type label, e.g. "Chat excerpt". */
  sourceType?: string;
  text: string;
}

export interface WorkEditorialCardCopy {
  /** Recurring task name. Falls back to cluster.shortTitle. */
  title?: string;
  /** Legacy short summary; used as the reason fallback only. */
  summary?: string;
  /** Longer scope paragraph. Shown inside View details only. */
  details?: string;
  primaryAction?: string;
  /** Approved synthetic excerpt author shown above the quote. */
  persona?: WorkEditorialPersona;
  /** Legacy observed need; used as the reason fallback only. Empty string hides it. */
  observed?: string;
  /** Proposed app sentence. Shown by default only when set (hero uses it). */
  proposed?: string;
  /** Plain decision words. Falls back to the owner-approved word for cluster.disposition. */
  decision?: string;
  /** Short approved reason. Falls back to observed, then summary. Never to cluster text. */
  reason?: string;
  /** Verbatim approved chat excerpts rendered inside View details. */
  sourceExcerpts?: WorkEditorialSourceExcerpt[];
  illustration?: WorkEditorialIllustration;
  imageUrl?: string;
}

export interface WorkEditorialLabels {
  details: string;
  openBuild: string;
  viewApp: string;
  requestEvidence: string;
  openWork: string;
  /** Heading for approved work summaries inside View details. */
  reports?: string;
  /** Heading for verbatim chat excerpts inside View details. Defaults to "Source excerpts". */
  sourceExcerpts?: string;
  /** Optional overrides for the plain decision words. */
  decisionBuild?: string;
  decisionReuse?: string;
  decisionAsk?: string;
  decisionQueued?: string;
}

/** Owner-approved decision words per backend disposition. Presented as-is; no new algorithm. */
const DECISION_WORDS: Record<ClusterDisposition, string | undefined> = {
  build_in_sandbox: "Build a new app",
  reuse_existing_app: "Use an existing app",
  request_missing_evidence: "Ask for more information",
  // No owner-approved word yet for the deferred case; the line is omitted until copy.decision arrives.
  queued_next_cycle: undefined,
};

const DEFAULT_SOURCE_EXCERPTS_LABEL = "Source excerpts";

function resolveDecision(
  disposition: ClusterDisposition,
  labels: WorkEditorialLabels,
  copy: WorkEditorialCardCopy | undefined
): string | undefined {
  if (copy?.decision !== undefined) return copy.decision || undefined;
  switch (disposition) {
    case "build_in_sandbox":
      return labels.decisionBuild ?? DECISION_WORDS.build_in_sandbox;
    case "reuse_existing_app":
      return labels.decisionReuse ?? DECISION_WORDS.reuse_existing_app;
    case "request_missing_evidence":
      return labels.decisionAsk ?? DECISION_WORDS.request_missing_evidence;
    case "queued_next_cycle":
      return labels.decisionQueued ?? DECISION_WORDS.queued_next_cycle;
  }
}

export interface WorkEditorialCardsProps {
  clusters: RecurrenceCluster[];
  selectedClusterId: string;
  orgId: OrganizationId;
  /** Caller-supplied image for the hero card. Falls back to an SVG illustration. */
  imageUrl?: string;
  /** Optional per-cluster copy keyed by clusterId. Missing fields fall back to cluster strings. */
  displayCopy?: Record<string, WorkEditorialCardCopy>;
  /** Approved employee reports; those matching a cluster render as work summaries in View details. */
  reports?: readonly EmployeeReport[];
  labels: WorkEditorialLabels;
  onOpenBuild: (clusterId: string) => void;
  onViewApp: (clusterId: string) => void;
  onRequestEvidence?: (clusterId: string) => void;
  onSelect?: (clusterId: string) => void;
}

type PrimaryAction = {
  label: string;
  handler: ((clusterId: string) => void) | undefined;
};

function resolvePrimaryAction(
  disposition: ClusterDisposition,
  labels: WorkEditorialLabels,
  props: WorkEditorialCardsProps
): PrimaryAction {
  switch (disposition) {
    case "build_in_sandbox":
      return { label: labels.openBuild, handler: props.onOpenBuild };
    case "reuse_existing_app":
      return { label: labels.viewApp, handler: props.onViewApp };
    case "request_missing_evidence":
      return { label: labels.requestEvidence, handler: props.onRequestEvidence };
    case "queued_next_cycle":
      return { label: labels.openWork, handler: props.onSelect };
  }
}

const INK = "var(--hr-ink, #121417)";
const ASH = "var(--hr-stone-ash, #dcdfe3)";
const CONTOUR = "var(--hr-stone-contour, #bfc4cd)";

function svgClass(hero: boolean): string {
  return `hr-work-editorial__illustration${hero ? " hr-work-editorial__illustration--hero" : ""}`;
}

/** Low-fidelity line drawing of a crossover body over its chassis rails. */
const ChassisIllustration: FC<{ hero: boolean }> = ({ hero }) => (
  <svg
    className={svgClass(hero)}
    viewBox="0 0 360 200"
    preserveAspectRatio="xMidYMid meet"
    aria-hidden="true"
    focusable="false"
  >
    <rect width="360" height="200" fill={ASH} />
    <g fill="none" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      {/* body shell: side profile */}
      <path d="M38 128 L48 108 C60 92 84 84 112 80 L150 60 C166 52 190 50 214 54 L256 66 C286 72 310 84 322 102 L330 118 C336 126 334 132 326 134 L300 136 L60 136 C44 136 36 132 38 128 Z" />
      {/* greenhouse */}
      <path d="M118 82 L150 64 C166 56 190 54 212 58 L248 68 C236 80 228 84 220 84 L128 84 Z" strokeWidth="1.1" />
      <path d="M176 60 L172 84" strokeWidth="1" />
      {/* door line */}
      <path d="M128 84 L124 136" strokeWidth="1" stroke={CONTOUR} />
      <path d="M220 84 L222 136" strokeWidth="1" stroke={CONTOUR} />
      {/* wheel arches */}
      <path d="M58 136 A26 26 0 0 1 110 136" />
      <path d="M252 136 A26 26 0 0 1 304 136" />
      {/* wheels */}
      <circle cx="84" cy="140" r="22" />
      <circle cx="84" cy="140" r="9" strokeWidth="1" />
      <circle cx="278" cy="140" r="22" />
      <circle cx="278" cy="140" r="9" strokeWidth="1" />
      {/* chassis rails + cross-members, drawn under the body as a ghost */}
      <g stroke={INK} strokeWidth="1" strokeDasharray="3 3" opacity="0.7">
        <path d="M66 170 L296 170" />
        <path d="M66 184 L296 184" />
        <path d="M66 170 L66 184 M110 170 L110 184 M154 170 L154 184 M198 170 L198 184 M242 170 L242 184 M296 170 L296 184" />
      </g>
      {/* wheelbase dimension */}
      <g stroke={INK} strokeWidth="1">
        <path d="M84 192 L278 192" />
        <path d="M84 188 L84 196 M278 188 L278 196" />
      </g>
    </g>
  </svg>
);

/** Simple ledger with bars: budget vs actual columns. */
const LedgerIllustration: FC<{ hero: boolean }> = ({ hero }) => (
  <svg
    className={svgClass(hero)}
    viewBox="0 0 360 200"
    preserveAspectRatio="xMidYMid meet"
    aria-hidden="true"
    focusable="false"
  >
    <rect width="360" height="200" fill={ASH} />
    <g fill="none" stroke={INK} strokeWidth="1.4" strokeLinecap="round">
      {/* ledger sheet */}
      <rect x="40" y="28" width="150" height="144" rx="2" />
      <path d="M40 52 L190 52" />
      {[72, 92, 112, 132, 152].map((y) => (
        <path key={y} d={`M52 ${y} L178 ${y}`} stroke={CONTOUR} strokeWidth="1" />
      ))}
      <path d="M130 52 L130 172" stroke={CONTOUR} strokeWidth="1" />
      {/* bars: budget (outline) vs actual (ink) */}
      <path d="M214 160 L330 160" />
      <rect x="222" y="96" width="14" height="64" />
      <rect x="240" y="108" width="14" height="52" fill={INK} />
      <rect x="266" y="78" width="14" height="82" />
      <rect x="284" y="92" width="14" height="68" fill={INK} />
      <rect x="310" y="112" width="14" height="48" />
      <path d="M328 124 L328 160" strokeWidth="1" />
      <rect x="328" y="124" width="2" height="36" fill={INK} />
      {/* variance marker */}
      <path d="M254 70 L254 86 M250 82 L254 86 L258 82" strokeWidth="1" />
    </g>
  </svg>
);

const ContourIllustration: FC<{ seed: number; hero: boolean }> = ({
  seed,
  hero,
}) => {
  // Deterministic contour lines; offset varies by card so cards do not look identical.
  const shift = (seed % 5) * 6;
  const lines = [0, 1, 2, 3, 4, 5].map((i) => {
    const y = 28 + i * 14 + shift * 0.3;
    const a = 10 + i * 3;
    return `M0 ${y} C 60 ${y - a}, 120 ${y + a + shift}, 180 ${y} S 300 ${y - a - shift}, 360 ${y + 4}`;
  });
  return (
    <svg
      className={svgClass(hero)}
      viewBox="0 0 360 140"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="360" height="140" fill={ASH} />
      {lines.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke={CONTOUR}
          strokeWidth={i === 2 ? 1.6 : 1}
        />
      ))}
    </svg>
  );
};

/** Owner wording: cluster fixtures say "skateboard"; the product word is "chassis". */
function clean(text: string | undefined): string | undefined {
  return text?.replace(/skateboard/gi, "chassis");
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const PersonaBlock: FC<{ persona: WorkEditorialPersona }> = ({ persona }) => (
  <figure className="hr-work-editorial__persona">
    <div className="hr-work-editorial__persona-head">
      {persona.avatarAtlasUrl ? (
        <span
          className="hr-work-editorial__avatar hr-work-editorial__avatar--portrait"
          aria-hidden="true"
          style={{
            backgroundImage: `url('${persona.avatarAtlasUrl}')`,
            backgroundSize: persona.avatarAtlasSize ?? "200% 200%",
            backgroundPosition: persona.avatarAtlasPosition ?? "0% 0%",
          }}
        />
      ) : persona.avatarUrl ? (
        <img
          className="hr-work-editorial__avatar"
          src={persona.avatarUrl}
          alt=""
          loading="lazy"
        />
      ) : (
        <span className="hr-work-editorial__avatar" aria-hidden="true">
          {initials(persona.name)}
        </span>
      )}
      <figcaption className="hr-work-editorial__persona-meta">
        <span className="hr-work-editorial__persona-name">{persona.name}</span>
        <span className="hr-work-editorial__persona-role">{persona.role}</span>
      </figcaption>
    </div>
    <blockquote className="hr-work-editorial__quote">
      {persona.quote}
    </blockquote>
  </figure>
);

export const WorkEditorialCards: FC<WorkEditorialCardsProps> = (props) => {
  const {
    clusters,
    selectedClusterId,
    orgId,
    imageUrl,
    displayCopy,
    reports,
    labels,
    onSelect,
  } = props;

  const heroIndex = clusters.findIndex(
    (c) => c.disposition === "build_in_sandbox"
  );

  return (
    <div className="hr-work-editorial" data-org={orgId}>
      {clusters.map((cluster, index) => {
        const copy = displayCopy?.[cluster.clusterId];
        const title = copy?.title ?? cluster.shortTitle;
        // Reason comes from approved short copy only. Cluster text stays in View details.
        const reason = copy?.reason ?? copy?.observed ?? copy?.summary;
        const proposed = copy?.proposed;
        const decision = resolveDecision(cluster.disposition, labels, copy);
        const action = resolvePrimaryAction(cluster.disposition, labels, props);
        const actionLabel = copy?.primaryAction ?? action.label;
        const isHero = index === heroIndex;
        const isSelected = cluster.clusterId === selectedClusterId;
        const cardImage = copy?.imageUrl ?? (isHero ? imageUrl : undefined);
        const detailLines = [
          copy?.details,
          clean(cluster.problemSummary),
          clean(cluster.gapExplanation),
          cluster.matchedAppName
            ? [cluster.matchedAppName, cluster.matchedAppVersion]
                .filter(Boolean)
                .join(" ")
            : undefined,
          cluster.policyScope,
          clean(cluster.missingEvidenceDetail),
        ].filter((line): line is string => Boolean(line));
        const clusterReports =
          reports?.filter((report) => report.clusterId === cluster.clusterId) ??
          [];
        const sourceExcerpts = copy?.sourceExcerpts ?? [];

        const classes = [
          "hr-work-editorial__card",
          isHero ? "hr-work-editorial__card--hero" : "hr-work-editorial__card--compact",
          isSelected ? "hr-work-editorial__card--selected" : "",
          onSelect ? "hr-work-editorial__card--selectable" : "",
        ]
          .filter(Boolean)
          .join(" ");

        const illustration = copy?.illustration ?? "contour";

        return (
          <article
            key={cluster.clusterId}
            className={classes}
            aria-current={isSelected ? "true" : undefined}
            onClick={onSelect ? () => onSelect(cluster.clusterId) : undefined}
          >
            <div className="hr-work-editorial__media">
              {cardImage ? (
                <img
                  className="hr-work-editorial__image"
                  src={cardImage}
                  alt=""
                  loading="lazy"
                />
              ) : illustration === "chassis" ? (
                <ChassisIllustration hero={isHero} />
              ) : illustration === "ledger" ? (
                <LedgerIllustration hero={isHero} />
              ) : (
                <ContourIllustration seed={index} hero={isHero} />
              )}
            </div>

            <div className="hr-work-editorial__body">
              {copy?.persona ? <PersonaBlock persona={copy.persona} /> : null}

              {isHero ? (
                <h2 className="hr-work-editorial__title">{title}</h2>
              ) : (
                <h3 className="hr-work-editorial__title">{title}</h3>
              )}
              {reason ? (
                <p className="hr-work-editorial__reason">{reason}</p>
              ) : null}
              {proposed ? (
                <p className="hr-work-editorial__summary">{proposed}</p>
              ) : null}
              {decision ? (
                <p className="hr-work-editorial__decision">{decision}</p>
              ) : null}

              <div className="hr-work-editorial__actions">
                {action.handler ? (
                  <Button
                    variant="primary"
                    size={isHero ? "md" : "sm"}
                    onClick={(event) => {
                      event.stopPropagation();
                      action.handler?.(cluster.clusterId);
                    }}
                  >
                    {actionLabel}
                  </Button>
                ) : null}
              </div>

              <details
                className="hr-work-editorial__details"
                onClick={(event) => event.stopPropagation()}
              >
                <summary className="hr-work-editorial__details-summary">
                  {labels.details}
                </summary>
                <div className="hr-work-editorial__details-body">
                  {detailLines.map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                  <p className="hr-work-editorial__count">
                    {cluster.reportCount} · {cluster.distinctEmployeeCount} ·{" "}
                    {cluster.departmentsLabel}
                  </p>

                  {clusterReports.length > 0 ? (
                    <section className="hr-work-editorial__evidence">
                      {labels.reports ? (
                        <h4 className="hr-work-editorial__evidence-heading">
                          {labels.reports}
                        </h4>
                      ) : null}
                      <ul className="hr-work-editorial__evidence-list">
                        {clusterReports.map((report) => (
                          <li
                            key={report.reportId}
                            className="hr-work-editorial__evidence-item"
                          >
                            <p className="hr-work-editorial__evidence-meta">
                              <span>{report.employeeName}</span>
                              <span>{report.submittedAt.slice(0, 10)}</span>
                              <span>{report.assistantSurface}</span>
                            </p>
                            <p className="hr-work-editorial__evidence-text">
                              {clean(report.taskSummary)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {sourceExcerpts.length > 0 ? (
                    <section className="hr-work-editorial__evidence">
                      <h4 className="hr-work-editorial__evidence-heading">
                        {labels.sourceExcerpts ?? DEFAULT_SOURCE_EXCERPTS_LABEL}
                      </h4>
                      <ul className="hr-work-editorial__evidence-list">
                        {sourceExcerpts.map((excerpt, i) => (
                          <li
                            key={excerpt.excerptId ?? i}
                            className="hr-work-editorial__evidence-item"
                          >
                            <p className="hr-work-editorial__evidence-meta">
                              <span>{excerpt.author}</span>
                              <span>{excerpt.date}</span>
                              {excerpt.source ? <span>{excerpt.source}</span> : null}
                              {excerpt.sourceType ? (
                                <span>{excerpt.sourceType}</span>
                              ) : null}
                            </p>
                            <blockquote className="hr-work-editorial__evidence-quote">
                              {excerpt.text}
                            </blockquote>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </div>
              </details>
            </div>
          </article>
        );
      })}
    </div>
  );
};

export default WorkEditorialCards;
