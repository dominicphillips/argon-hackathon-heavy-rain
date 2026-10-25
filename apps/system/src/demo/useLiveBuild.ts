import { useEffect, useRef, useState } from "react";
import {
  getLiveBuildCurrent,
  type LiveBuildProgressEvent,
  type LiveBuildSnapshot,
} from "../backend/client";
import type { OrganizationId } from "../types";

export interface LiveBuildState extends LiveBuildSnapshot {
  /** True after several consecutive failed polls; the last good snapshot is kept. */
  offline: boolean;
}

const EMPTY: LiveBuildState = { run: null, progress: [], artifact: null, offline: false };

/**
 * Polls the relay for the organization's current live build. Only new progress
 * events are fetched once a run is known; a new run id restarts the feed.
 */
export function useLiveBuild(org: OrganizationId, enabled: boolean, intervalMs = 2500): LiveBuildState {
  const [state, setState] = useState<LiveBuildState>(EMPTY);
  const progressRef = useRef<LiveBuildProgressEvent[]>([]);
  const runIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setState(EMPTY);
      progressRef.current = [];
      runIdRef.current = null;
      return;
    }
    let cancelled = false;
    let timer: number | undefined;
    let failures = 0;
    const controller = new AbortController();

    const tick = async () => {
      try {
        const lastSeq = progressRef.current[progressRef.current.length - 1]?.seq;
        const since = runIdRef.current && lastSeq !== undefined ? lastSeq : undefined;
        const snapshot = await getLiveBuildCurrent(org, since, controller.signal);
        if (cancelled) return;
        failures = 0;
        const sameRun = Boolean(snapshot.run && snapshot.run.runId === runIdRef.current);
        const merged = sameRun
          ? [
              ...progressRef.current,
              ...snapshot.progress.filter((event) => lastSeq === undefined || event.seq > lastSeq),
            ]
          : snapshot.progress;
        progressRef.current = merged;
        runIdRef.current = snapshot.run?.runId ?? null;
        setState({ run: snapshot.run, progress: merged, artifact: snapshot.artifact, offline: false });
      } catch {
        if (cancelled) return;
        failures += 1;
        if (failures >= 3) setState((prev) => ({ ...prev, offline: true }));
      }
      if (!cancelled) timer = window.setTimeout(tick, intervalMs);
    };
    void tick();
    return () => {
      cancelled = true;
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [org, enabled, intervalMs]);

  return state;
}
