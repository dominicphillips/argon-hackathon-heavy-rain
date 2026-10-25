/// <reference types="node" />
/**
 * Read-only smoke check against the running local backend. Mutates nothing.
 * Run: sh apps/system/src/backend/run-tests.sh --live
 */

import { BackendError, getHealth, getOrgFixture, getWorkspace, setWeeklySchedule, workspaceEventStreamUrl } from "./client.js";

const health = await getHealth();
console.log("health", {
  operatingMode: health.operatingMode,
  authenticationMode: health.authenticationMode,
  liveRuntimeEnabled: health.liveRuntimeEnabled,
  externalNotificationsEnabled: health.externalNotificationsEnabled,
});

for (const org of ["rookmere", "augi"] as const) {
  const [fixture, workspace] = await Promise.all([getOrgFixture(org), getWorkspace(org)]);
  console.log(org, {
    fixtureName: fixture.name,
    reports: fixture.reports.length,
    clusters: workspace.clusters.length,
    buildStage: workspace.buildStage,
    appReleaseStatus: workspace.appReleaseStatus,
    orthogonalBatch: workspace.orthogonalStatuses?.weeklyBatchId ?? null,
  });
}

// Error path: the server rejects an empty body with 422 and changes nothing.
try {
  await setWeeklySchedule("rookmere", undefined as unknown as boolean);
  console.log("unexpected: empty schedule body accepted");
  process.exitCode = 1;
} catch (error) {
  if (error instanceof BackendError) console.log("422 path", error.status, error.message);
  else throw error;
}

// Error path: unknown org id at the server (bypass client-side guard with a direct fetch).
const bad = await fetch("http://127.0.0.1:43180/api/v1/orgs/nope/workspace");
console.log("unknown org", bad.status, (await bad.json()).detail);

// SSE: confirm the stream emits the event names the client listens for.
const controller = new AbortController();
const stream = await fetch(workspaceEventStreamUrl("rookmere"), { signal: controller.signal });
const reader = stream.body!.getReader();
const seen = new Set<string>();
const started = Date.now();
while (Date.now() - started < 1500) {
  const { value, done } = await Promise.race([
    reader.read(),
    new Promise<{ value: undefined; done: true }>((r) => setTimeout(() => r({ value: undefined, done: true }), 400)),
  ]);
  if (done || !value) break;
  for (const m of new TextDecoder().decode(value).matchAll(/^event: (\S+)/gm)) seen.add(m[1]);
}
controller.abort();
console.log("sse content-type", stream.headers.get("content-type"), "event names", [...seen].sort());
