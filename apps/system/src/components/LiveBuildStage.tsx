import type { FC } from "react";
import { ChamberWireframe } from "./ChamberWireframe";
import { ChamberAtmosphere } from "./ChamberAtmosphere";
import { ChamberEmptyState } from "./ChamberEmptyState";
import { BuildProgressPanel, type BuildProgressRow } from "./BuildProgressPanel";
import { BuilderFeed } from "./BuilderFeed";
import { AppCard } from "./AppCard";
import liveCopy from "../copy/live.json";
import { useLiveBuild } from "../demo/useLiveBuild";
import type { OrganizationId } from "../types";

export interface LiveBuildStageProps {
  orgId: OrganizationId;
  orgName: string;
  enabled: boolean;
  reducedMotion?: boolean;
}

const PHASES = ["received", "reading", "building", "checking", "ready"] as const;
type Phase = (typeof PHASES)[number];

function fill(template: string, tokens: Record<string, string>): string {
  return Object.entries(tokens).reduce((text, [key, value]) => text.split(`{${key}}`).join(value), template);
}

/** Real builds for one organization: empty until work arrives, then the panel, the builder's feed, and the app card. */
export const LiveBuildStage: FC<LiveBuildStageProps> = ({ orgId, orgName, enabled, reducedMotion = false }) => {
  const { run, progress, artifact } = useLiveBuild(orgId, enabled);
  const active = run && run.phase !== "ready" && run.phase !== "failed";
  const ready = Boolean(run && run.phase === "ready" && artifact);
  const failed = Boolean(run && run.phase === "failed");

  // Fidelity rises with what the builder has actually written.
  const filesWritten = run?.filesWritten.length ?? 0;
  const veilStage: "queued" | "stage1" | "stage2" | "stage3" =
    !run || run.phase === "received"
      ? "queued"
      : run.phase === "reading"
        ? "stage1"
        : run.phase === "checking" || filesWritten >= 3
          ? "stage3"
          : "stage2";

  const phaseIndex = run ? PHASES.indexOf(run.phase as Phase) : -1;
  const rows: BuildProgressRow[] = PHASES.map((phase, index) => ({
    key: phase,
    label: liveCopy.panel.phases[phase],
    state: failed
      ? index === 0
        ? "done"
        : index === 1
          ? "paused"
          : "queued"
      : index < phaseIndex || (ready && index === phaseIndex)
        ? "done"
        : index === phaseIndex
          ? "active"
          : "queued",
  }));

  const title = run
    ? run.phase === "received"
      ? fill(liveCopy.panel.receivedTitle, { app: run.app.name })
      : fill(liveCopy.panel.buildingTitle, { app: run.app.name })
    : "";
  const subtitle = run
    ? fill(liveCopy.panel.requestedBy, { name: run.requestedBy.name, role: run.requestedBy.role })
    : null;
  const notice = run
    ? run.status === "incomplete"
      ? { tone: "failed" as const, title: liveCopy.panel.failedTitle, body: liveCopy.panel.stoppedBody }
      : run.status === "requires_action"
        ? { tone: "info" as const, body: liveCopy.panel.waitingInputBody }
        : failed
          ? {
              tone: "failed" as const,
              title: liveCopy.panel.failedTitle,
              body: fill(liveCopy.panel.failedBody, { reason: run.errorReason ?? "" }),
            }
          : null
    : null;

  const tokens = run?.usage.totalTokens ?? 0;
  const tokensLabel = tokens > 0 ? fill(liveCopy.feed.tokens, { n: tokens.toLocaleString("en-US") }) : null;
  const filesLabel = filesWritten > 0 ? fill(liveCopy.feed.files, { n: String(filesWritten) }) : null;

  return (
    <div className="hr-workbench-c hr-workbench-c--live">
      <section className={`hr-workbench-c__chamber hr-workbench-c__chamber--${ready ? "ready" : veilStage}${run ? "" : " hr-workbench-c__chamber--clear"}`} aria-label={run ? run.app.name : orgName}>
        <div className="hr-chamber-stage">
          <ChamberAtmosphere reducedMotion={reducedMotion} />

          {!run && (
            <ChamberEmptyState title={liveCopy.empty.liveTitle} body={liveCopy.empty.liveBody} />
          )}

          {run && !ready && (
            <>
              {(run.phase === "building" || run.phase === "checking") && (
                <ChamberWireframe orgId={orgId} buildStage={veilStage} />
              )}
              <div className={`hr-chamber-smoke-veil hr-chamber-smoke-veil--${veilStage}`} aria-hidden="true" />
              <BuilderFeed
                events={progress}
                tokensLabel={tokensLabel}
                filesLabel={filesLabel}
                reducedMotion={reducedMotion}
              />
              <BuildProgressPanel
                title={title}
                subtitle={subtitle}
                rows={rows}
                notice={notice}
                reducedMotion={reducedMotion}
              />
            </>
          )}

          {run && ready && artifact && (
            <AppCard
              artifact={artifact}
              appName={run.app.name}
              purpose={run.app.purpose}
              requesterName={run.requestedBy.name}
              copy={liveCopy.card}
            />
          )}
        </div>
      </section>
    </div>
  );
};
