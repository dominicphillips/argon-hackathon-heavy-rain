import type { LiveBuildAccepted, LiveBuildMode, LiveBuildRequest } from "../backend/client";

export const DEFAULT_BUILD_MODE: LiveBuildMode = "flash";

export interface BuildStartState {
  mode: LiveBuildMode;
  /** True from the click until the server accepts or rejects; blocks a second request. */
  starting: boolean;
  /** Message from the last failed start; cleared when the next attempt begins. */
  error: string | null;
}

export interface BuildStartOptions {
  request(): LiveBuildRequest;
  start(payload: LiveBuildRequest): Promise<LiveBuildAccepted>;
}

export interface BuildStartLabels {
  startFlash: string;
  startArgon: string;
}

/** Start button text for the chosen mode. */
export function buildStartLabel(mode: LiveBuildMode, labels: BuildStartLabels): string {
  return mode === "argon" ? labels.startArgon : labels.startFlash;
}

/** Holds the operator's build-mode choice and sends one start request at a time. */
export class BuildStartController {
  private state: BuildStartState = { mode: DEFAULT_BUILD_MODE, starting: false, error: null };
  private listeners = new Set<() => void>();
  private options: BuildStartOptions;

  constructor(options: BuildStartOptions) {
    this.options = options;
  }

  getState = (): BuildStartState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(patch: Partial<BuildStartState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  /** Records the choice only; nothing is sent until `start`. Ignored while a request is pending. */
  selectMode = (mode: LiveBuildMode) => {
    if (this.state.starting || mode === this.state.mode) return;
    this.publish({ mode });
  };

  /** Sends one request carrying the explicit mode. Resolves to the accepted run, or null after a failure. */
  start = async (): Promise<LiveBuildAccepted | null> => {
    if (this.state.starting) return null;
    this.publish({ starting: true, error: null });
    try {
      const accepted = await this.options.start({ ...this.options.request(), build_mode: this.state.mode });
      this.publish({ starting: false });
      return accepted;
    } catch (error) {
      this.publish({ starting: false, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  };
}
