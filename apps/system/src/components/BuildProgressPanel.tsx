import type { FC } from "react";
import playbackCopy from "../copy/playback.json";
import { DEMO_STEPS } from "../demo/playbackController";

export interface BuildProgressPanelProps {
  appName: string;
  /** Confirmed steps from the playback controller, never a timer estimate. */
  completedSteps: number;
  /** True while a step is running or auto-advancing; false when paused. */
  active: boolean;
  reducedMotion?: boolean;
}

type StepState = "done" | "active" | "paused" | "queued";

/**
 * Left-docked, always-sharp progress panel over the smoky chamber: what is being
 * built, which steps are done, and the latest checkpoint. Row labels and
 * checkpoint sentences come from copy/playback.json and map 1:1 to DEMO_STEPS.
 */
export const BuildProgressPanel: FC<BuildProgressPanelProps> = ({
  appName,
  completedSteps,
  active,
  reducedMotion = false,
}) => {
  const currentIndex = Math.min(completedSteps, DEMO_STEPS.length - 1);
  const currentStep = DEMO_STEPS[currentIndex];
  const title =
    completedSteps < 2
      ? playbackCopy.panel.reviewTitle
      : playbackCopy.panel.buildTitle.replace("{app}", appName);
  const checkpoint = playbackCopy.steps[currentStep].checkpoint;

  return (
    <aside
      className={`hr-build-panel${reducedMotion ? " hr-build-panel--static" : ""}`}
      aria-live="polite"
    >
      <header className="hr-build-panel__head">
        <span className="hr-build-panel__eyebrow">{playbackCopy.panel.eyebrow}</span>
        <h2 className="hr-build-panel__title" key={title}>
          {title}
        </h2>
      </header>

      <section className="hr-build-panel__section">
        <h3 className="hr-build-panel__label">{playbackCopy.panel.progress}</h3>
        <ol className="hr-build-panel__steps">
          {DEMO_STEPS.map((step, index) => {
            const state: StepState =
              index < completedSteps
                ? "done"
                : index === completedSteps
                  ? active
                    ? "active"
                    : "paused"
                  : "queued";
            return (
              <li key={step} className={`hr-build-step hr-build-step--${state}`}>
                <span className="hr-build-step__icon" aria-hidden="true">
                  {state === "done" && (
                    <svg viewBox="0 0 16 16" focusable="false">
                      <path
                        d="M3.5 8.5l3 3 6-6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span className="hr-build-step__label">
                  {playbackCopy.steps[step].label}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="hr-build-panel__section">
        <h3 className="hr-build-panel__label">{playbackCopy.panel.latest}</h3>
        <p className="hr-build-panel__checkpoint" key={currentStep}>
          <span
            className={`hr-build-panel__dot${active ? " hr-build-panel__dot--live" : ""}`}
            aria-hidden="true"
          />
          {checkpoint}
        </p>
      </section>

      <footer className="hr-build-panel__footer">
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8 7v4M8 5v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        {playbackCopy.panel.footer}
      </footer>
    </aside>
  );
};
