import type { FC } from "react";
import { Button } from "@heavy-rain/system-ui";
import type { LiveBuildArtifact } from "../backend/client";

export interface AppCardProps {
  artifact: LiveBuildArtifact;
  appName: string;
  purpose: string;
  requesterName: string;
  copy: {
    eyebrow: string;
    view: string;
    notes: string;
    highlights: string;
    screens: string;
    madeFor: string;
    sampleNote: string;
  };
}

/** The finished app as a card: the builder's low-fidelity preview, what it does, and one button to open it. */
export const AppCard: FC<AppCardProps> = ({ artifact, appName, purpose, requesterName, copy }) => {
  const card = artifact.card;
  const name = card?.name || appName;
  const tagline = card?.tagline || purpose;
  const highlights = card?.highlights?.slice(0, 3) ?? [];
  const screens = card?.screens ?? [];
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
        <span className="hr-app-card__eyebrow">{copy.eyebrow}</span>
        <h2 className="hr-app-card__name">{name}</h2>
        <p className="hr-app-card__tagline">{tagline}</p>
        {highlights.length > 0 && (
          <div className="hr-app-card__section">
            <span className="hr-app-card__label">{copy.highlights}</span>
            <ul className="hr-app-card__highlights">
              {highlights.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}
        {screens.length > 0 && (
          <div className="hr-app-card__section hr-app-card__section--inline">
            <span className="hr-app-card__label">{copy.screens}</span>
            <span className="hr-app-card__screens">
              {screens.map((screen) => (
                <span key={screen} className="hr-app-card__screen">
                  {screen}
                </span>
              ))}
            </span>
          </div>
        )}
        <div className="hr-app-card__actions">
          <Button
            variant="primary"
            onClick={() => window.open(artifact.indexUrl, "_blank", "noopener,noreferrer")}
          >
            {copy.view}
          </Button>
          <span className="hr-app-card__made-for">{copy.madeFor.replace("{name}", requesterName)}</span>
        </div>
        <p className="hr-app-card__sample">{copy.sampleNote}</p>
        {artifact.notes && (
          <details className="hr-app-card__notes">
            <summary>{copy.notes}</summary>
            <pre>{artifact.notes}</pre>
          </details>
        )}
      </div>
    </article>
  );
};
