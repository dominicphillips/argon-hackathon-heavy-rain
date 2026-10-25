import { useEffect, useState, type FC } from "react";
import { Button } from "@heavy-rain/system-ui";
import { listLiveBuilds, type LiveBuildListItem } from "../backend/client";
import liveCopy from "../copy/live.json";
import type { OrganizationId } from "../types";

export interface LiveAppsViewProps {
  orgId: OrganizationId;
  enabled: boolean;
  title: string;
  emptyTitle: string;
}

/** Apps the live builder produced for this organization, in the same catalog rows the scripted organizations use. */
export const LiveAppsView: FC<LiveAppsViewProps> = ({ orgId, enabled, title, emptyTitle }) => {
  const [items, setItems] = useState<LiveBuildListItem[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const controller = new AbortController();
    const load = async () => {
      try {
        const next = await listLiveBuilds(orgId, 20, controller.signal);
        if (!cancelled) setItems(next.filter((item) => item.artifact && item.run.phase === "ready"));
      } catch {
        // Keep the last list; the relay may be restarting.
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 8000);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [orgId, enabled]);

  return (
    <div className="hr-apps-view hr-apps-view--live">
      <header className="hr-section-header">
        <div>
          <h1 className="hr-section-header__title">{title}</h1>
        </div>
      </header>
      {items.length === 0 ? (
        <div className="hr-apps-empty">
          <h2 className="hr-apps-empty__title">{emptyTitle}</h2>
        </div>
      ) : (
        <ul className="hr-catalog-rows">
          {items.map(({ run, artifact }) => {
            const name = artifact?.card?.name || run.app.name;
            const purpose = artifact?.card?.tagline || run.app.purpose;
            return (
              <li key={run.runId} className="hr-catalog-row">
                <div className="hr-catalog-row__hero hr-catalog-row__hero--preview">
                  {artifact?.previewUrl ? <img src={artifact.previewUrl} alt="" /> : null}
                </div>
                <div className="hr-catalog-row__body">
                  <div className="hr-catalog-row__top">
                    <h2 className="hr-catalog-row__name">{name}</h2>
                  </div>
                  <p className="hr-catalog-row__purpose">{purpose}</p>
                  <div className="hr-catalog-row__actions">
                    {artifact && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => window.open(artifact.indexUrl, "_blank", "noopener,noreferrer")}
                      >
                        {liveCopy.card.open}
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
