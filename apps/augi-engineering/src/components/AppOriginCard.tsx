import * as React from "react";
import origin from "../copy/augi-origin.json";
import "./AppOriginCard.css";

/** Persona strings come verbatim from the approved Argon output. */
export interface AppOriginPersona {
  name: string;
  role: string;
  quote: string;
  need: string;
  proposal: string;
}

export interface AppOriginCardProps {
  /** Defaults to the Argon persona in `copy/augi-origin.json`. */
  persona?: AppOriginPersona;
  /** Appended to the card root for layout placement. */
  className?: string;
  /** Opens the need disclosure on first render. */
  defaultOpen?: boolean;
}

const PORTRAIT_ATLAS_URL = "/people/employee-portraits.png";

export const DEFAULT_ORIGIN_PERSONA: AppOriginPersona = origin;

export function AppOriginCard({
  persona = DEFAULT_ORIGIN_PERSONA,
  className,
  defaultOpen = false,
}: AppOriginCardProps) {
  const rootClassName = className
    ? `augi-origin-card ${className}`
    : "augi-origin-card";

  return (
    <aside className={rootClassName}>
      <div
        className="augi-origin-card__avatar"
        role="img"
        aria-label={persona.name}
        style={{ backgroundImage: `url(${PORTRAIT_ATLAS_URL})` }}
      />
      <div className="augi-origin-card__body">
        <details className="augi-origin-card__details" open={defaultOpen || undefined}>
          <summary className="augi-origin-card__summary">
            <span className="augi-origin-card__quote">{persona.quote}</span>
            <svg
              className="augi-origin-card__chevron"
              viewBox="0 0 12 12"
              width="12"
              height="12"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M2.5 4.25 6 7.75l3.5-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </summary>
          <p className="augi-origin-card__need">{persona.need}</p>
        </details>
        <p className="augi-origin-card__attribution">
          <span className="augi-origin-card__name">{persona.name}</span>
          <span className="augi-origin-card__role">{persona.role}</span>
        </p>
        <p className="augi-origin-card__proposal">{persona.proposal}</p>
      </div>
    </aside>
  );
}

export default AppOriginCard;
