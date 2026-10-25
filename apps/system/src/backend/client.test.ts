/// <reference types="node" />
/**
 * Unit checks for the backend client using node:test with mocked `fetch` and `EventSource`.
 *
 * Run (from repo root, no extra dependencies):
 *   npx tsc -p apps/system/src/backend/tsconfig.test.json && node --test /tmp/heavyrain-backend-client-test/client.test.js
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  BackendError,
  assertWorkspaceShape,
  controlBuild,
  decideCluster,
  evaluateBatch,
  getWorkspace,
  orgAuthorizers,
  runId,
  setWeeklySchedule,
  startBuild,
  submitReleaseReview,
  subscribeWorkspaceEvents,
  workspaceEventStreamUrl,
} from "./client.js";

// ---------------------------------------------------------------------------
// Fixtures and mocks
// ---------------------------------------------------------------------------

function validWorkspace(overrides: Record<string, unknown> = {}) {
  return {
    orgId: "rookmere",
    weeklyScheduleActive: true,
    weeklyRunStatus: "Awaiting operator decision",
    buildStage: "stage2",
    lastActiveCheckpoint: 2,
    candidateVersion: "v1.3.0-rc1",
    appReleaseStatus: "in_sandbox_review",
    approvedRelease: null,
    changeRequestNotes: [],
    selectedWorker: "Builder",
    selectedReportId: "rep_rm_01",
    selectedClusterId: "pat_rm_01",
    selectedAppId: "app_rm_01",
    selectedEventId: "evt_rm_01",
    clusters: [],
    catalogApps: [],
    events: [],
    isReplaying: false,
    intakeErrorSimulated: false,
    scopeApprovalSimulated: false,
    orthogonalStatuses: { orgId: "rookmere", weeklyBatchId: "batch_rm_2026_w43" },
    ...overrides,
  };
}

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

const calls: RecordedCall[] = [];
let responder: (call: RecordedCall) => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>;

const originalFetch = globalThis.fetch;
const originalEventSource = (globalThis as { EventSource?: unknown }).EventSource;

beforeEach(() => {
  calls.length = 0;
  responder = () => ({ status: 200, body: validWorkspace() });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: RecordedCall = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: (init?.headers as Record<string, string>) ?? {},
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const { status, body } = await responder(call);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  (globalThis as { EventSource?: unknown }).EventSource = originalEventSource;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

test("org helpers return the documented demo ids", () => {
  assert.equal(runId("rookmere"), "run_rm_var_01");
  assert.equal(runId("augi"), "run_augi_sable_3d_01");
  assert.deepEqual(orgAuthorizers("augi"), {
    buildClusterId: "wf_augi_01",
    buildAuthorizerEmployeeId: "emp_augi_01",
    releaseReviewerEmployeeId: "emp_augi_08",
    runId: "run_augi_sable_3d_01",
  });
  assert.equal(
    workspaceEventStreamUrl("augi"),
    "http://127.0.0.1:43180/api/v1/orgs/augi/events/stream?replay_only=false",
  );
});

// ---------------------------------------------------------------------------
// Transport and error surfacing
// ---------------------------------------------------------------------------

test("getWorkspace sends the org header, never an actor header, and validates the body", async () => {
  const workspace = await getWorkspace("rookmere");
  assert.equal(workspace.orgId, "rookmere");
  assert.equal(workspace.orthogonalStatuses?.weeklyBatchId, "batch_rm_2026_w43");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:43180/api/v1/orgs/rookmere/workspace");
  assert.equal(calls[0].headers["X-HeavyRain-Org-Id"], "rookmere");
  assert.equal(calls[0].headers["X-HeavyRain-Actor-Id"], undefined);
});

test("server detail strings are returned verbatim with the status", async () => {
  responder = () => ({
    status: 404,
    body: { detail: "Unsupported organization identifier: 'nope'. Expected 'rookmere' or 'augi'." },
  });
  await assert.rejects(getWorkspace("rookmere"), (error: unknown) => {
    assert.ok(error instanceof BackendError);
    assert.equal(error.status, 404);
    assert.match(error.message, /^404\b.*Unsupported organization identifier: 'nope'\./);
    assert.equal(error.detail, "Unsupported organization identifier: 'nope'. Expected 'rookmere' or 'augi'.");
    return true;
  });
});

test("FastAPI validation lists are flattened into field: message text", async () => {
  responder = () => ({
    status: 422,
    body: { detail: [{ type: "missing", loc: ["body", "active"], msg: "Field required", input: {} }] },
  });
  await assert.rejects(setWeeklySchedule("rookmere", true), (error: unknown) => {
    assert.ok(error instanceof BackendError);
    assert.equal(error.status, 422);
    assert.match(error.message, /active: Field required/);
    assert.ok(Array.isArray(error.detail));
    return true;
  });
});

test("network failures become BackendError with status 0", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  await assert.rejects(getWorkspace("augi"), (error: unknown) => {
    assert.ok(error instanceof BackendError);
    assert.equal(error.status, 0);
    assert.match(error.message, /Backend unreachable .*fetch failed/);
    return true;
  });
});

test("invalid organization ids are rejected before any request", async () => {
  await assert.rejects(getWorkspace("nope" as never), (error: unknown) => {
    assert.ok(error instanceof BackendError);
    assert.match(error.message, /Unsupported organization identifier: 'nope'/);
    return true;
  });
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------------------
// Shape validation
// ---------------------------------------------------------------------------

test("assertWorkspaceShape rejects bodies missing core fields", () => {
  assert.throws(
    () => assertWorkspaceShape({ orgId: "rookmere", clusters: "nope" }),
    (error: unknown) => {
      assert.ok(error instanceof BackendError);
      assert.match(error.message, /unexpected shape/);
      assert.match(error.message, /clusters/);
      assert.match(error.message, /buildStage/);
      return true;
    },
  );
  assert.throws(() => assertWorkspaceShape(validWorkspace({ buildStage: "exploded" })), /buildStage/);
  assert.throws(() => assertWorkspaceShape(validWorkspace({ orgId: "other" })), /orgId/);
  assert.throws(() => assertWorkspaceShape("not an object"), /not an object/);
});

test("a 200 with an invalid workspace does not resolve", async () => {
  responder = () => ({ status: 200, body: { orgId: "rookmere" } });
  await assert.rejects(getWorkspace("rookmere"), /unexpected shape/);
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

test("setWeeklySchedule posts {active} and returns data without a workspace", async () => {
  responder = () => ({
    status: 200,
    body: { orgId: "rookmere", weeklyScheduleActive: false, buildStage: "stage2", orthogonalStatuses: null },
  });
  const result = await setWeeklySchedule("rookmere", false);
  assert.equal(calls[0].method, "POST");
  assert.deepEqual(calls[0].body, { active: false });
  assert.equal(result.data.weeklyScheduleActive, false);
  assert.equal(result.workspace, undefined);
});

test("evaluateBatch extracts a validated workspace from the response", async () => {
  responder = () => ({
    status: 200,
    body: { orgId: "rookmere", batchId: "batch_rm_2026_w43", decisions: [], workspace: validWorkspace() },
  });
  const result = await evaluateBatch("rookmere");
  assert.equal(calls[0].url, "http://127.0.0.1:43180/api/v1/orgs/rookmere/batches/evaluate");
  assert.deepEqual(result.data.decisions, []);
  assert.equal(result.workspace?.orgId, "rookmere");
});

test("evaluateBatch rejects when the embedded workspace is malformed", async () => {
  responder = () => ({
    status: 200,
    body: { orgId: "rookmere", decisions: [], workspace: { orgId: "rookmere" } },
  });
  await assert.rejects(evaluateBatch("rookmere"), /unexpected shape/);
});

test("decideCluster posts the action to the cluster path", async () => {
  responder = () => ({
    status: 200,
    body: { orgId: "augi", cluster: { clusterId: "wf_augi_01" }, workspace: validWorkspace({ orgId: "augi" }) },
  });
  const result = await decideCluster("augi", "wf_augi_01", "defer_next_run");
  assert.equal(calls[0].url, "http://127.0.0.1:43180/api/v1/orgs/augi/clusters/wf_augi_01/decision");
  assert.deepEqual(calls[0].body, { action: "defer_next_run" });
  assert.equal(result.data.cluster.clusterId, "wf_augi_01");
  assert.equal(result.workspace?.orgId, "augi");
});

test("startBuild fills in the org's cluster and authorizer by default", async () => {
  responder = () => ({ status: 200, body: { runId: "run_augi_sable_3d_01", buildStage: "stage1" } });
  const result = await startBuild("augi");
  assert.deepEqual(calls[0].body, { cluster_id: "wf_augi_01", authorized_by_employee_id: "emp_augi_01" });
  assert.equal(result.data.runId, "run_augi_sable_3d_01");
});

test("controlBuild targets the org's run id and posts the action", async () => {
  responder = () => ({ status: 200, body: { runId: "run_rm_var_01", buildStage: "paused" } });
  const result = await controlBuild("rookmere", "pause", { reason: "operator hold" });
  assert.equal(calls[0].url, "http://127.0.0.1:43180/api/v1/orgs/rookmere/builds/run_rm_var_01/control");
  assert.deepEqual(calls[0].body, { action: "pause", reason: "operator hold" });
  assert.equal(result.data.buildStage, "paused");
});

test("submitReleaseReview uses the org reviewer and empty notes by default", async () => {
  responder = () => ({
    status: 200,
    body: {
      runId: "run_rm_var_01",
      orgId: "rookmere",
      decision: "approve_for_release",
      build: { runId: "run_rm_var_01" },
      workspace: validWorkspace({ appReleaseStatus: "released" }),
    },
  });
  const result = await submitReleaseReview("rookmere", { decision: "approve_for_release" });
  assert.deepEqual(calls[0].body, {
    decision: "approve_for_release",
    reviewer_employee_id: "emp_rm_12",
    notes: "",
  });
  assert.equal(result.workspace?.appReleaseStatus, "released");
});

// ---------------------------------------------------------------------------
// SSE subscription
// ---------------------------------------------------------------------------

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  readonly url: string;
  readyState = 0;
  closed = false;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private listeners = new Map<string, Set<() => void>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  listenerCount(type: string) {
    return this.listeners.get(type)?.size ?? 0;
  }

  open() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  fail(closedByServer: boolean) {
    this.readyState = closedByServer ? 2 : 0;
    this.onerror?.(new Event("error"));
  }

  close() {
    this.closed = true;
    this.readyState = 2;
  }
}

function installFakeEventSource() {
  FakeEventSource.instances.length = 0;
  (globalThis as { EventSource?: unknown }).EventSource = FakeEventSource;
}

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("events are debounced into one serialized workspace refetch", async () => {
  installFakeEventSource();
  const updates: unknown[] = [];
  const statuses: string[] = [];
  const stop = subscribeWorkspaceEvents(
    "rookmere",
    (ws) => updates.push(ws),
    (conn) => statuses.push(conn.status),
    { debounceMs: 10, fetchOnOpen: false },
  );
  const source = FakeEventSource.instances[0];
  assert.equal(source.url, "http://127.0.0.1:43180/api/v1/orgs/rookmere/events/stream?replay_only=false");
  for (const type of ["orthogonal_status", "routing_decision", "trace_event", "checkpoint_update", "artifact_verification"]) {
    assert.equal(source.listenerCount(type), 1, `listener for ${type}`);
  }
  source.open();
  assert.deepEqual(statuses, ["connecting", "open"]);

  source.emit("trace_event");
  source.emit("trace_event");
  source.emit("checkpoint_update");
  await tick(40);
  assert.equal(calls.length, 1, "burst collapses into one fetch");
  assert.equal(updates.length, 1);

  stop();
  assert.equal(source.closed, true);
});

test("events arriving during a fetch queue exactly one follow-up fetch", async () => {
  installFakeEventSource();
  let release: (() => void) | undefined;
  let fetchCount = 0;
  responder = async () => {
    fetchCount += 1;
    if (fetchCount === 1) {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
    return { status: 200, body: validWorkspace({ candidateVersion: `v${fetchCount}` }) };
  };
  const updates: { candidateVersion: string }[] = [];
  const stop = subscribeWorkspaceEvents("rookmere", (ws) => updates.push(ws), undefined, {
    debounceMs: 5,
    fetchOnOpen: false,
  });
  const source = FakeEventSource.instances[0];
  source.open();
  source.emit("orthogonal_status");
  await tick(20);
  assert.equal(fetchCount, 1, "first fetch in flight");
  source.emit("routing_decision");
  source.emit("artifact_verification");
  await tick(20);
  assert.equal(fetchCount, 1, "no concurrent fetch while one is in flight");
  release?.();
  await tick(30);
  assert.equal(fetchCount, 2, "one follow-up fetch after the first completes");
  assert.deepEqual(
    updates.map((u) => u.candidateVersion),
    ["v1", "v2"],
  );
  stop();
});

test("cleanup closes the stream and suppresses late callbacks", async () => {
  installFakeEventSource();
  let release: (() => void) | undefined;
  responder = async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return { status: 200, body: validWorkspace() };
  };
  const updates: unknown[] = [];
  const connections: unknown[] = [];
  const stop = subscribeWorkspaceEvents("augi", (ws) => updates.push(ws), (c) => connections.push(c), {
    debounceMs: 5,
    fetchOnOpen: false,
  });
  const source = FakeEventSource.instances[0];
  source.open();
  source.emit("trace_event");
  await tick(15);
  assert.equal(calls.length, 1);
  const connectionEventsBeforeStop = connections.length;
  stop();
  release?.();
  await tick(15);
  assert.equal(updates.length, 0, "no update after cleanup");
  assert.equal(source.closed, true);
  assert.equal(source.listenerCount("trace_event"), 0);
  source.emit("trace_event");
  source.fail(true);
  await tick(15);
  assert.equal(calls.length, 1, "no refetch after cleanup");
  assert.equal(connections.length, connectionEventsBeforeStop, "no connection callback after cleanup");
});

test("refetch failures are reported through the connection callback and cleared on success", async () => {
  installFakeEventSource();
  let failNext = true;
  responder = () =>
    failNext
      ? { status: 500, body: { detail: "database locked" } }
      : { status: 200, body: validWorkspace() };
  const updates: unknown[] = [];
  const connections: { status: string; lastError?: BackendError }[] = [];
  const stop = subscribeWorkspaceEvents("rookmere", (ws) => updates.push(ws), (c) => connections.push(c), {
    debounceMs: 5,
    fetchOnOpen: false,
  });
  const source = FakeEventSource.instances[0];
  source.open();
  source.emit("trace_event");
  await tick(20);
  assert.equal(updates.length, 0);
  const failed = connections.at(-1);
  assert.ok(failed?.lastError instanceof BackendError);
  assert.equal(failed?.lastError?.status, 500);
  assert.match(failed?.lastError?.message ?? "", /database locked/);

  failNext = false;
  source.emit("trace_event");
  await tick(20);
  assert.equal(updates.length, 1);
  assert.equal(connections.at(-1)?.lastError, undefined);
  stop();
});

test("stream errors map to reconnecting or closed, and reopening refetches", async () => {
  installFakeEventSource();
  const statuses: string[] = [];
  const stop = subscribeWorkspaceEvents("rookmere", () => undefined, (c) => statuses.push(c.status), {
    debounceMs: 5,
    fetchOnOpen: false,
  });
  const source = FakeEventSource.instances[0];
  source.open();
  source.fail(false);
  assert.equal(statuses.at(-1), "reconnecting");
  source.open();
  assert.equal(statuses.at(-1), "open");
  await tick(20);
  assert.equal(calls.length, 1, "reopen after reconnect refetches once");
  source.fail(true);
  assert.equal(statuses.at(-1), "closed");
  stop();
});
