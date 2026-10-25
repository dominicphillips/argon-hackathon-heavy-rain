import type { FC, ReactNode } from "react";

export interface ChamberEmptyStateProps {
  title: string;
  body: string;
  /** Optional primary control, rendered centered in the stage. */
  children?: ReactNode;
}

/** Empty stage before any work has arrived or been run. */
export const ChamberEmptyState: FC<ChamberEmptyStateProps> = ({ title, body, children }) => (
  <div className="hr-chamber-empty">
    <h2 className="hr-chamber-empty__title">{title}</h2>
    <p className="hr-chamber-empty__body">{body}</p>
    {children && <div className="hr-chamber-empty__action">{children}</div>}
  </div>
);
