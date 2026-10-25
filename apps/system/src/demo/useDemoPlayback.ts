import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { OrganizationId, OrganizationWorkspaceState } from "../types";
import { executeDemoStep } from "./backendPlayback";
import { PlaybackController } from "./playbackController";

export interface UseDemoPlaybackOptions {
  orgId: OrganizationId;
  enabled: boolean;
  externalBusy?: boolean;
  onWorkspace(org: OrganizationId, workspace: OrganizationWorkspaceState): void;
  onView?(view: "Work" | "System"): void;
  /** Reserves the mutation lane while auto-playing or awaiting an accepted request. */
  onBusyChange?(busy: boolean): void;
}

export function useDemoPlayback(options: UseDemoPlaybackOptions) {
  const callbacks = useRef(options);
  callbacks.current = options;
  const controller = useMemo(() => new PlaybackController({
    orgId: options.orgId,
    execute: executeDemoStep,
    onResult: (workspace, step, org) => {
      callbacks.current.onWorkspace(org, workspace);
      callbacks.current.onView?.(step === "ingest" || step === "review" ? "Work" : "System");
    },
  }), [options.orgId]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);

  useEffect(() => {
    controller.activate();
    return () => controller.dispose();
  }, [controller]);
  useEffect(() => {
    controller.setAvailability(options.enabled, Boolean(options.externalBusy));
  }, [controller, options.enabled, options.externalBusy]);
  useEffect(() => {
    callbacks.current.onBusyChange?.(state.busy || state.playing);
    return () => callbacks.current.onBusyChange?.(false);
  }, [state.busy, state.playing, controller]);

  return { state, play: controller.play, pause: controller.pause, next: controller.next, reset: controller.reset };
}

export type DemoPlaybackHandle = ReturnType<typeof useDemoPlayback>;
