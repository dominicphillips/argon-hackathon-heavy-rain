import type { FC } from "react";
import { Button } from "@heavy-rain/system-ui";
import type { LiveBuildArtifact } from "../backend/client";

export interface AppCardProps {
  artifact: LiveBuildArtifact;
  appName: string;
  purpose: string;
  copy: { open: string };
}

/** The finished app as a card: the builder's low-fidelity preview, the name, one line, one button. */
export const AppCard: FC<AppCardProps> = ({ artifact, appName, purpose, copy }) => {
  const name = artifact.card?.name || appName;
  const tagline = artifact.card?.tagline || purpose;
  return (
    <article className="hr-app-card" aria-label={name}>
      <div className="hr-app-card__preview">
        {artifact.previewUrl ? (
          <img src={artifact.previewUrl} alt="" className="hr-app-card__image" />
        ) : (
          <div className="hr-app-card__placeholder" aria-hidden="true" />
        )}
      </div>
      <div className="hr-app-card__body">
        <h2 className="hr-app-card__name">{name}</h2>
        <p className="hr-app-card__tagline">{tagline}</p>
        <div className="hr-app-card__actions">
          <Button
            variant="primary"
            onClick={() => window.open(artifact.indexUrl, "_blank", "noopener,noreferrer")}
          >
            {copy.open}
          </Button>
        </div>
      </div>
    </article>
  );
};
