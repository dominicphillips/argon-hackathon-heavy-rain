import { Button } from "@heavy-rain/system-ui";
import { useDemoPlayback } from "./useDemoPlayback";
import type { DemoPlaybackHandle, UseDemoPlaybackOptions } from "./useDemoPlayback";
import "./demo-playback.css";

export interface DemoPlaybackCopy {
  run: string;
  pause: string;
  resume: string;
  runAgain: string;
  controls: string;
  unavailable: string;
  stopped: string;
  verificationFailed: string;
}

export interface DemoPlaybackProps extends UseDemoPlaybackOptions { copy: DemoPlaybackCopy; }

export interface DemoPlaybackControlsProps {
  playback: DemoPlaybackHandle;
  enabled: boolean;
  externalBusy?: boolean;
  copy: DemoPlaybackCopy;
  /** Render nothing before the first run (the stage carries the primary control). */
  hideIdle?: boolean;
  size?: "md" | "lg";
}

/** Mount once for the selected organization; do not hide/unmount it between demo steps. */
export function DemoPlayback({ copy, ...options }: DemoPlaybackProps) {
  const playback = useDemoPlayback(options);
  return <DemoPlaybackControls playback={playback} enabled={options.enabled} externalBusy={options.externalBusy} copy={copy} />;
}

/** One control drives the whole weekly cycle: run, pause, resume, run again. */
export function DemoPlaybackControls({ playback, enabled, externalBusy, copy, hideIdle = false, size = "md" }: DemoPlaybackControlsProps) {
  const { state } = playback;
  const blocked = !enabled || Boolean(externalBusy);
  const started = state.completedSteps > 0;
  const idle = !started && !state.playing && !state.busy && !state.complete && !state.error;
  if (hideIdle && idle) return null;
  const restart = () => {
    playback.reset();
    playback.play();
  };

  let label = copy.run;
  let onClick: () => void = playback.play;
  let variant: "primary" | "secondary" = "primary";
  let glyph = "▶";
  if (state.playing) {
    label = copy.pause;
    onClick = playback.pause;
    variant = "secondary";
    glyph = "Ⅱ";
  } else if (state.complete || state.error) {
    label = copy.runAgain;
    onClick = restart;
    variant = state.error ? "primary" : "secondary";
    glyph = "↻";
  } else if (started) {
    label = copy.resume;
  }

  const notice = !enabled
    ? copy.unavailable
    : state.error === "verification_failed"
      ? copy.verificationFailed
      : state.error
        ? copy.stopped
        : null;

  return (
    <div className={`hr-demo-playback hr-demo-playback--${size}`} role="group" aria-label={copy.controls}>
      {notice && <span className="hr-demo-playback__notice" role="status">{notice}</span>}
      <Button variant={variant} onClick={onClick} disabled={blocked || (!state.playing && state.busy)}>
        <span className="hr-demo-playback__glyph" aria-hidden="true">{glyph}</span>
        {label}
      </Button>
    </div>
  );
}
