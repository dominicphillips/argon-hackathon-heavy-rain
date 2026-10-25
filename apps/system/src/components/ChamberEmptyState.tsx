import type { FC, ReactNode } from "react";
import playbackCopy from "../copy/playback.json";

export interface ChamberEmptyStateProps {
  /** The primary run control, rendered centered in the stage. */
  children?: ReactNode;
}

/** Empty stage before any work has been run this session. */
export const ChamberEmptyState: FC<ChamberEmptyStateProps> = ({ children }) => (
  <div className="hr-chamber-empty">
    <span className="hr-chamber-empty__eyebrow">{playbackCopy.empty.eyebrow}</span>
    <h2 className="hr-chamber-empty__title">{playbackCopy.empty.title}</h2>
    <p className="hr-chamber-empty__body">{playbackCopy.empty.body}</p>
    {children && <div className="hr-chamber-empty__action">{children}</div>}
  </div>
);
