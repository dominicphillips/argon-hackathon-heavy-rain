import { controlBuild, evaluateBatch, getHealth, getWorkspace, startBuild, verifyBuild } from "../backend/client";
import type { WorkspaceWithStatuses } from "../backend/client";
import type { DemoOrg, DemoStep } from "./playbackController";

export class DemoVerificationError extends Error {
  constructor() { super("verification_failed"); this.name = "DemoVerificationError"; }
}

/** Only local demo endpoints are called. Release review is deliberately absent. */
export async function executeDemoStep(step: DemoStep, org: DemoOrg, signal: AbortSignal): Promise<WorkspaceWithStatuses> {
  signal.throwIfAborted();
  const health = await getHealth(signal);
  if (health.operatingMode !== "demo_fixture_replay" || health.liveRuntimeEnabled || health.externalNotificationsEnabled) {
    throw new Error("demo_unavailable");
  }
  signal.throwIfAborted();
  switch (step) {
    case "ingest":
      // The presentation uses reports already approved in this demo. It submits nothing.
      break;
    case "review":
      await evaluateBatch(org);
      break;
    case "build":
      await startBuild(org);
      break;
    case "assemble":
    case "check":
      await controlBuild(org, "advance_checkpoint");
      break;
    case "ready": {
      await controlBuild(org, "advance_checkpoint");
      signal.throwIfAborted();
      const verified = await verifyBuild(org);
      if (!verified.data.passed) throw new DemoVerificationError();
      break;
    }
  }
  // A mutation already accepted by the server may finish after pause/unmount. Never
  // issue the next command or publish a late snapshot into a different organization.
  signal.throwIfAborted();
  return getWorkspace(org, signal);
}
