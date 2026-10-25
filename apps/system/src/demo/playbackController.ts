export const DEMO_STEPS = ["ingest", "review", "build", "assemble", "check", "ready"] as const;
export type DemoStep = (typeof DEMO_STEPS)[number];
export type DemoOrg = "rookmere" | "augi";

export interface PlaybackState {
  /** Number of confirmed steps, never inferred from a timer. */
  completedSteps: number;
  playing: boolean;
  busy: boolean;
  error: string | null;
  complete: boolean;
}

export interface PlaybackClock {
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface PlaybackOptions<T> {
  orgId: DemoOrg;
  execute(step: DemoStep, org: DemoOrg, signal: AbortSignal): Promise<T>;
  onResult(result: T, step: DemoStep, org: DemoOrg): void;
  delayMs?: number;
  clock?: PlaybackClock;
}

/** Serial presentation playback. Pausing stops future steps, not an accepted mutation. */
export class PlaybackController<T> {
  private state: PlaybackState = { completedSteps: 0, playing: false, busy: false, error: null, complete: false };
  private listeners = new Set<() => void>();
  private timer: unknown;
  private request: AbortController | undefined;
  private disposed = false;
  private enabled = true;
  private externalBusy = false;
  private generation = 0;
  private delayMs: number;
  private clock: PlaybackClock;
  private options: PlaybackOptions<T>;

  constructor(options: PlaybackOptions<T>) {
    this.options = options;
    this.delayMs = options.delayMs ?? 2600;
    this.clock = options.clock ?? {
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    };
  }

  getState = (): PlaybackState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(patch: Partial<PlaybackState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private clearTimer() {
    if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** React's development effect replay may reactivate an otherwise unused instance. */
  activate() { this.disposed = false; }

  setAvailability(enabled: boolean, externalBusy: boolean) {
    this.enabled = enabled;
    this.externalBusy = externalBusy;
    if (!enabled || externalBusy) this.pause();
  }

  setDelay(delayMs: number) { this.delayMs = Math.max(250, delayMs); }

  play = () => {
    if (this.disposed || !this.enabled || this.externalBusy || this.state.busy || this.state.complete) return;
    this.publish({ playing: true, error: null });
    void this.advance();
  };

  pause = () => {
    this.clearTimer();
    if (this.state.playing) this.publish({ playing: false });
  };

  next = () => {
    this.pause();
    void this.advance();
  };

  /** Rewinds presentation position only; it does not erase reports or cancel a build. */
  reset = () => {
    if (this.disposed || this.state.busy) return;
    this.pause();
    this.publish({ completedSteps: 0, complete: false, error: null });
  };

  private advance = async () => {
    if (this.disposed || !this.enabled || this.externalBusy || this.state.busy || this.state.complete) return;
    this.clearTimer();
    const step = DEMO_STEPS[this.state.completedSteps];
    if (!step) return;
    const generation = this.generation;
    const request = new AbortController();
    this.request = request;
    this.publish({ busy: true, error: null });
    try {
      const result = await this.options.execute(step, this.options.orgId, request.signal);
      if (this.disposed || generation !== this.generation || request.signal.aborted) return;
      this.options.onResult(result, step, this.options.orgId);
      const completedSteps = this.state.completedSteps + 1;
      const complete = completedSteps === DEMO_STEPS.length;
      this.publish({ completedSteps, complete, busy: false, playing: complete ? false : this.state.playing });
      if (this.state.playing) {
        this.timer = this.clock.setTimeout(() => {
          this.timer = undefined;
          void this.advance();
        }, this.delayMs);
      }
    } catch (error) {
      if (this.disposed || generation !== this.generation || request.signal.aborted) return;
      this.publish({ busy: false, playing: false, error: error instanceof Error ? error.message : String(error) });
    } finally {
      if (this.request === request) this.request = undefined;
    }
  };

  dispose() {
    this.disposed = true;
    this.generation += 1;
    this.clearTimer();
    this.request?.abort();
    this.request = undefined;
    this.publish({ playing: false, busy: false });
  }
}
