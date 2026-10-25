import type { FC } from "react";
import { AppCard } from "./AppCard";
import liveCopy from "../copy/live.json";
import { useLiveBuild } from "../demo/useLiveBuild";
import type { OrganizationId } from "../types";

export interface LiveAppsViewProps {
  orgId: OrganizationId;
  enabled: boolean;
  emptyTitle: string;
}

/** Apps built by the live builder for this organization: the latest finished build as a card. */
export const LiveAppsView: FC<LiveAppsViewProps> = ({ orgId, enabled, emptyTitle }) => {
  const { run, artifact } = useLiveBuild(orgId, enabled, 5000);
  const ready = Boolean(run && run.phase === "ready" && artifact);
  return (
    <div className="hr-apps-view hr-apps-view--live">
      {ready && run && artifact ? (
        <div className="hr-live-apps">
          <AppCard
            artifact={artifact}
            appName={run.app.name}
            purpose={run.app.purpose}
            copy={{ open: liveCopy.card.open }}
          />
        </div>
      ) : (
        <div className="hr-apps-empty">
          <h2 className="hr-apps-empty__title">{emptyTitle}</h2>
        </div>
      )}
    </div>
  );
};
