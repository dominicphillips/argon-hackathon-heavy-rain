import type { CSSProperties, FC } from "react";

export interface ChamberIntakePersona {
  name: string;
  role: string;
  quote: string;
  avatarAtlasUrl?: string;
  avatarAtlasPosition?: string;
  avatarAtlasSize?: string;
}

export interface ChamberIntakeProps {
  persona: ChamberIntakePersona;
  appName: string;
  decision: string;
  proposed: string;
  /** Once the review step is confirmed, the decision and proposal appear. */
  reviewed: boolean;
}

/** The intake story on the right of the chamber: who asked, what they asked, what Cairn decided. */
export const ChamberIntake: FC<ChamberIntakeProps> = ({
  persona,
  appName,
  decision,
  proposed,
  reviewed,
}) => {
  const avatarStyle: CSSProperties | undefined = persona.avatarAtlasUrl
    ? {
        backgroundImage: `url('${persona.avatarAtlasUrl}')`,
        backgroundPosition: persona.avatarAtlasPosition ?? "0% 0%",
        backgroundSize: persona.avatarAtlasSize ?? "200% 200%",
      }
    : undefined;
  const initials = persona.name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="hr-intake" aria-live="polite">
      <div className="hr-intake__person">
        <span
          className={`hr-intake__avatar${avatarStyle ? "" : " hr-intake__avatar--initials"}`}
          style={avatarStyle}
          role="img"
          aria-label={persona.name}
        >
          {!avatarStyle && initials}
        </span>
        <span>
          <span className="hr-intake__name">{persona.name}</span>
          <span className="hr-intake__role">{persona.role}</span>
        </span>
      </div>
      <blockquote className="hr-intake__quote">“{persona.quote}”</blockquote>
      {reviewed && (
        <div className="hr-intake__decision">
          <span className="hr-intake__decision-label">{decision}</span>
          <span className="hr-intake__app">{appName}</span>
          <p className="hr-intake__proposed">{proposed}</p>
        </div>
      )}
    </div>
  );
};
