import { Button } from "@heavy-rain/system-ui";
import type { DemoStep } from "./playbackController";
import { DEMO_STEPS } from "./playbackController";
import { useDemoPlayback } from "./useDemoPlayback";
import type { DemoPlaybackHandle, UseDemoPlaybackOptions } from "./useDemoPlayback";
import "./demo-playback.css";

export interface DemoPlaybackCopy {
  play: string;
  pause: string;
  next: string;
  restart: string;
  controls: string;
  progress: string;
  unavailable: string;
  waitingForApproval: string;
  stopped: string;
  verificationFailed: string;
  steps: Record<DemoStep, string>;
}

export interface DemoPlaybackProps extends UseDemoPlaybackOptions { copy: DemoPlaybackCopy; }

export interface DemoPlaybackControlsProps {
  playback: DemoPlaybackHandle;
  enabled: boolean;
  externalBusy?: boolean;
  copy: DemoPlaybackCopy;
}

/** Mount once for the selected organization; do not hide/unmount it between demo steps. */
export function DemoPlayback({ copy, ...options }: DemoPlaybackProps) {
  const playback = useDemoPlayback(options);
  return <DemoPlaybackControls playback={playback} enabled={options.enabled} externalBusy={options.externalBusy} copy={copy} />;
}

/** Pair with an App-level hook when demo steps navigate between screens. */
export function DemoPlaybackControls({ playback, enabled, externalBusy, copy }: DemoPlaybackControlsProps) {
  const { state } = playback;
  const blocked = !enabled || Boolean(externalBusy);
  const currentStep = DEMO_STEPS[Math.min(state.completedSteps, DEMO_STEPS.length - 1)];
  const status = !enabled ? copy.unavailable : state.complete ? copy.waitingForApproval : copy.steps[currentStep];
  return (
    <div className="hr-demo-playback" role="group" aria-label={copy.controls}>
      <Button
        size="sm"
        variant="secondary"
        onClick={state.playing ? playback.pause : playback.play}
        disabled={blocked || state.complete || (!state.playing && state.busy)}
      >
        <span aria-hidden="true">{state.playing ? "Ⅱ" : "▶"}</span>
        {state.playing ? copy.pause : copy.play}
      </Button>
      <span className="hr-demo-playback__progress" aria-label={copy.progress}>
        {state.completedSteps}/{DEMO_STEPS.length}
      </span>
      <details className="hr-demo-playback__more">
        <summary aria-label={copy.controls} title={copy.controls}>···</summary>
        <div className="hr-demo-playback__menu">
          <Button size="sm" variant="ghost" onClick={playback.next} disabled={blocked || state.busy || state.complete}>{copy.next}</Button>
          <Button size="sm" variant="ghost" onClick={playback.reset} disabled={state.busy}>{copy.restart}</Button>
        </div>
      </details>
      <span className="hr-demo-playback__status" role="status" aria-live="polite">{status}</span>
      {state.error && (
        <details className="hr-demo-playback__error" role="alert">
          <summary>{copy.stopped}</summary>
          <span>{state.error === "verification_failed" ? copy.verificationFailed : state.error === "demo_unavailable" ? copy.unavailable : state.error}</span>
        </details>
      )}
    </div>
  );
}
