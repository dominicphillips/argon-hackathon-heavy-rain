/**
 * Typed client for the local Relay/Cairn backend (http://127.0.0.1:43180).
 *
 * Scope: native `fetch` and `EventSource` only. Every function returns the
 * server's own payload; errors carry the server's status and `detail` text
 * unchanged. Nothing here falls back to fixture data: a failed request rejects.
 *
 * Server-Sent Events are used only as a change signal. On any workspace-affecting
 * event the client refetches `GET /workspace` and hands the caller the canonical
 * server snapshot instead of reducing event frames locally.
 */

import type {
  AppReleaseStatus,
  BuildStageId,
  CheckpointNumber,
  OrganizationFixture,
  OrganizationId,
  OrganizationWorkspaceState,
  RecurrenceCluster,
} from "../types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const DEFAULT_BACKEND_BASE_URL = "http://127.0.0.1:43180";

let backendBaseUrl = DEFAULT_BACKEND_BASE_URL;

/** Override the backend origin (no trailing slash). Returns the value now in use. */
export function configureBackend(options: { baseUrl?: string }): string {
  if (options.baseUrl) {
    backendBaseUrl = options.baseUrl.replace(/\/+$/, "");
  }
  return backendBaseUrl;
}

export function getBackendBaseUrl(): string {
  return backendBaseUrl;
}

// ---------------------------------------------------------------------------
// Org constants and helpers
// ---------------------------------------------------------------------------

export const ORGANIZATION_IDS: readonly OrganizationId[] = ["rookmere", "augi", "meridian"];

export function isOrganizationId(value: unknown): value is OrganizationId {
  return typeof value === "string" && (ORGANIZATION_IDS as readonly string[]).includes(value);
}

export interface OrgAuthorizers {
  /** Cluster that the demo sandbox build targets. */
  buildClusterId: "pat_rm_01" | "wf_augi_01";
  /** Employee allowed to authorize the sandbox build (checked server-side). */
  buildAuthorizerEmployeeId: "emp_rm_07" | "emp_augi_01";
  /** Employee allowed to approve or request changes on the release review. */
  releaseReviewerEmployeeId: "emp_rm_12" | "emp_augi_08";
  /** Deterministic run id the backend assigns to the demo build. */
  runId: "run_rm_var_01" | "run_augi_sable_3d_01";
}

type ScriptedOrganizationId = Exclude<OrganizationId, "meridian">;

// Meridian builds run through the live builder; only the scripted organizations have fixture authorizers.
const ORG_AUTHORIZERS: Record<ScriptedOrganizationId, OrgAuthorizers> = {
  rookmere: {
    buildClusterId: "pat_rm_01",
    buildAuthorizerEmployeeId: "emp_rm_07",
    releaseReviewerEmployeeId: "emp_rm_12",
    runId: "run_rm_var_01",
  },
  augi: {
    buildClusterId: "wf_augi_01",
    buildAuthorizerEmployeeId: "emp_augi_01",
    releaseReviewerEmployeeId: "emp_augi_08",
    runId: "run_augi_sable_3d_01",
  }
};

function scriptedOrg(org: OrganizationId): ScriptedOrganizationId {
  if (org === "meridian") {
    throw new BackendError("Meridian has no scripted sandbox flow; use the live builder.", {
      status: 0,
      url: orgPath(org),
    });
  }
  return org;
}

export function orgAuthorizers(org: OrganizationId): OrgAuthorizers {
  return ORG_AUTHORIZERS[scriptedOrg(org)];
}

export function runId(org: OrganizationId): OrgAuthorizers["runId"] {
  return ORG_AUTHORIZERS[scriptedOrg(org)].runId;
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/** Server payload plus the canonical workspace when the endpoint returned one. */
export interface BackendResult<T> {
  data: T;
  /** Present only when the response body carried a valid `workspace` snapshot. */
  workspace?: OrganizationWorkspaceState;
}

export interface BackendHealth {
  status: string;
  service: string;
  operatingMode: "demo_fixture_replay" | "cached_snapshot" | "live_runtime";
  authenticationMode: string;
  liveRuntimeEnabled: boolean;
  externalNotificationsEnabled: boolean;
  [extra: string]: unknown;
}

export type OrthogonalStatuses = NonNullable<WorkspaceWithStatuses["orthogonalStatuses"]>;

/** Workspace as served by the backend: the UI type plus the optional status block. */
export interface WorkspaceWithStatuses extends OrganizationWorkspaceState {
  orthogonalStatuses?: {
    orgId: OrganizationId;
    weeklyBatchId: string;
    weeklySchedule: "active" | "paused";
    weeklyScheduleActive: boolean;
    batchRunStatus:
      | "collecting"
      | "cutoff_locked"
      | "grouping_reports"
      | "awaiting_operator_decision"
      | "complete";
    weeklyRunStatus: OrganizationWorkspaceState["weeklyRunStatus"];
    builderInteractionStatus: string;
    buildStage: BuildStageId;
    lastActiveCheckpoint: CheckpointNumber;
    appReleaseState: string;
    appReleaseStatus: AppReleaseStatus;
    notificationState: string;
    dataFreshness: string;
    capturedThroughLabel: string;
  } | null;
}

export interface ScheduleResponse {
  orgId: OrganizationId;
  weeklyScheduleActive: boolean;
  buildStage: BuildStageId;
  orthogonalStatuses: OrthogonalStatuses | null;
}

export interface BatchDecision {
  cluster_id: string;
  disposition: string;
  [extra: string]: unknown;
}

export interface EvaluateBatchResponse {
  orgId: OrganizationId;
  batchId: string;
  decisions: BatchDecision[];
  workspace: WorkspaceWithStatuses;
  [extra: string]: unknown;
}

export type ClusterDecisionAction =
  | "route_to_existing_app"
  | "request_missing_evidence"
  | "defer_next_run"
  | "receive_missing_evidence";

export interface ClusterDecisionResponse {
  orgId: OrganizationId;
  cluster: RecurrenceCluster;
  workspace: WorkspaceWithStatuses;
}

export interface StartBuildRequest {
  clusterId?: OrgAuthorizers["buildClusterId"];
  authorizedByEmployeeId?: OrgAuthorizers["buildAuthorizerEmployeeId"];
}

export interface StartBuildResponse {
  runId: string;
  orgId: OrganizationId;
  clusterId: string;
  targetAppId: string | null;
  interactionId: string;
  environmentId: string;
  agent: string;
  environment: string;
  background: boolean;
  store: boolean;
  interactionStatus: string;
  buildStage: BuildStageId;
  operatingMode: string;
  [extra: string]: unknown;
}

export interface BuildStatus {
  runId: string;
  orgId: OrganizationId;
  batchId: string;
  clusterId: string;
  targetAppId: string | null;
  targetAppName: string | null;
  interactionId: string;
  environmentId: string;
  interactionStatus: string;
  buildStage: BuildStageId;
  lastActiveCheckpoint: CheckpointNumber;
  appReleaseState: string;
  appReleaseStatus: AppReleaseStatus;
  deployed: boolean;
  externalNotificationsSent: number;
  requiresActionDetail: string | null;
  errorReason: string | null;
  artifactManifest: ArtifactManifestEntry[] | null;
  verificationReport: VerificationReport | null;
  approvedRelease: OrganizationWorkspaceState["approvedRelease"];
  changeRequestNotes: string[];
  [extra: string]: unknown;
}

export type BuildControlAction =
  | "pause"
  | "resume"
  | "advance_checkpoint"
  | "reveal_ready"
  | "cancel"
  | "retry_from_checkpoint";

export interface ArtifactManifestEntry {
  path: string;
  bytes: number;
  sha256: string;
}

export interface VerificationReport {
  runId: string;
  orgId: OrganizationId;
  interactionId: string;
  environmentId: string;
  exportMethod: string;
  archiveSafetyCheck: Record<string, unknown>;
  artifactManifest: ArtifactManifestEntry[];
  verificationChecks: Record<string, boolean>;
  summaryOutput: string;
  passed: boolean;
}

export type ReleaseReviewDecision = "approve_for_release" | "request_changes";

export interface ReleaseReviewRequest {
  decision: ReleaseReviewDecision;
  reviewerEmployeeId?: OrgAuthorizers["releaseReviewerEmployeeId"];
  notes?: string;
}

export interface ReleaseReviewResponse {
  runId: string;
  orgId: OrganizationId;
  decision: ReleaseReviewDecision;
  build: BuildStatus;
  workspace: WorkspaceWithStatuses;
}

/** Intake payload for `POST /mcp/submit-work-report`. Mirrors the server model field for field. */
export interface WorkReportSubmission {
  idempotency_key: string;
  org_id: OrganizationId | "org_rookmere" | "org_augi";
  employee_id: string;
  role_id: string;
  assistant_surface: string;
  mcp_tool_name?: "heavyrain_submit_work_report";
  session_provenance: {
    session_id: string;
    captured_at: string;
    client_version?: string;
    org_timezone?: string;
  };
  user_inspected_outgoing_payload: true;
  host_chat_history_excluded: true;
  redaction_manifest: {
    client_redaction_applied: true;
    excluded_fields: string[];
    policy_version: string;
  };
  data_scope: string;
  pattern_hint?: string;
  task_summary: string;
  outgoing_payload_preview: Record<string, unknown>;
  attachments: { filename: string; kind: string; bytes: number; sha256: string }[];
  missing_evidence_note?: string;
}

export interface WorkReportReceipt {
  reportId: string;
  receiptId: string;
  orgId: OrganizationId;
  batchId: string;
  idempotentReplay: boolean;
  status: "queued_for_cutoff";
  receiptNotice: string;
  revocationWindowHours: number;
  report: OrganizationFixture["reports"][number];
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** A failed backend call. `message` carries the server's own `detail` text and status. */
export class BackendError extends Error {
  readonly status: number;
  readonly url: string;
  /** Raw `detail` from the server body (string, FastAPI validation list, or undefined). */
  readonly detail: unknown;

  constructor(message: string, options: { status: number; url: string; detail?: unknown }) {
    super(message);
    this.name = "BackendError";
    this.status = options.status;
    this.url = options.url;
    this.detail = options.detail;
  }
}

function formatDetail(detail: unknown): string | undefined {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const lines = detail
      .map((item) => {
        if (item && typeof item === "object") {
          const loc = Array.isArray((item as { loc?: unknown[] }).loc)
            ? (item as { loc: unknown[] }).loc.filter((p) => p !== "body").join(".")
            : "";
          const msg = (item as { msg?: unknown }).msg;
          return [loc, typeof msg === "string" ? msg : JSON.stringify(item)].filter(Boolean).join(": ");
        }
        return String(item);
      })
      .filter(Boolean);
    if (lines.length) return lines.join("; ");
  }
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  return undefined;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

function orgPath(org: OrganizationId, suffix = ""): string {
  if (!isOrganizationId(org)) {
    throw new BackendError(`Unsupported organization identifier: '${String(org)}'.`, {
      status: 0,
      url: `${backendBaseUrl}/api/v1/orgs/${String(org)}${suffix}`,
    });
  }
  return `${backendBaseUrl}/api/v1/orgs/${org}${suffix}`;
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  org?: OrganizationId;
  signal?: AbortSignal;
}

async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.org) headers["X-HeavyRain-Org-Id"] = options.org;
  const init: RequestInit = { method: options.method ?? "GET", headers, signal: options.signal };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new BackendError(`Backend unreachable at ${url}: ${reason}`, { status: 0, url, detail: reason });
  }

  const text = await response.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
  }

  if (!response.ok) {
    const detail =
      parsed && typeof parsed === "object" && "detail" in parsed
        ? (parsed as { detail: unknown }).detail
        : parsed ?? text;
    const detailText = formatDetail(detail) ?? (text || response.statusText || "Request failed");
    throw new BackendError(`${response.status} ${response.statusText || ""}`.trim() + `: ${detailText}`, {
      status: response.status,
      url,
      detail,
    });
  }

  if (parsed === undefined) {
    throw new BackendError(`${response.status}: response body is not JSON`, {
      status: response.status,
      url,
      detail: text,
    });
  }
  return parsed as T;
}

// ---------------------------------------------------------------------------
// Shape validation (enough to keep invalid payloads out of UI state)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const BUILD_STAGES: readonly BuildStageId[] = [
  "idle", "loading", "queued", "stage1", "stage2", "stage3", "paused", "failed", "ready",
];

function describeMissing(label: string, problems: string[], url: string): BackendError {
  return new BackendError(`${label} from ${url} has an unexpected shape: ${problems.join(", ")}`, {
    status: 200,
    url,
    detail: problems,
  });
}

export function assertWorkspaceShape(value: unknown, url = "workspace"): WorkspaceWithStatuses {
  const problems: string[] = [];
  if (!isRecord(value)) {
    throw describeMissing("Workspace", ["body is not an object"], url);
  }
  if (!isOrganizationId(value.orgId)) problems.push("orgId");
  if (typeof value.weeklyScheduleActive !== "boolean") problems.push("weeklyScheduleActive");
  if (typeof value.weeklyRunStatus !== "string") problems.push("weeklyRunStatus");
  if (!BUILD_STAGES.includes(value.buildStage as BuildStageId)) problems.push("buildStage");
  if (![1, 2, 3].includes(value.lastActiveCheckpoint as number)) problems.push("lastActiveCheckpoint");
  if (typeof value.candidateVersion !== "string") problems.push("candidateVersion");
  if (typeof value.appReleaseStatus !== "string") problems.push("appReleaseStatus");
  if (!(value.approvedRelease === null || isRecord(value.approvedRelease))) problems.push("approvedRelease");
  for (const key of ["clusters", "catalogApps", "events", "changeRequestNotes"] as const) {
    if (!Array.isArray(value[key])) problems.push(key);
  }
  for (const key of [
    "selectedWorker", "selectedReportId", "selectedClusterId", "selectedAppId", "selectedEventId",
  ] as const) {
    if (typeof value[key] !== "string") problems.push(key);
  }
  if (problems.length) throw describeMissing("Workspace", problems, url);
  return value as unknown as WorkspaceWithStatuses;
}

export function assertFixtureShape(value: unknown, url = "fixture"): OrganizationFixture {
  const problems: string[] = [];
  if (!isRecord(value)) {
    throw describeMissing("Fixture", ["body is not an object"], url);
  }
  if (!isOrganizationId(value.orgId)) problems.push("orgId");
  for (const key of ["name", "shortLabel", "weeklyBatchId", "heroTitle"] as const) {
    if (typeof value[key] !== "string") problems.push(key);
  }
  for (const key of ["checkpoints", "workers", "clusters", "reports", "catalogApps", "initialEvents"] as const) {
    if (!Array.isArray(value[key])) problems.push(key);
  }
  if (problems.length) throw describeMissing("Fixture", problems, url);
  return value as unknown as OrganizationFixture;
}

/** Pull a validated `workspace` out of a mutation body when the endpoint includes one. */
function extractWorkspace(body: unknown, url: string): WorkspaceWithStatuses | undefined {
  if (isRecord(body) && body.workspace !== undefined) {
    return assertWorkspaceShape(body.workspace, url);
  }
  return undefined;
}

function wrap<T>(body: T, url: string): BackendResult<T> {
  const workspace = extractWorkspace(body, url);
  return workspace ? { data: body, workspace } : { data: body };
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export async function getHealth(signal?: AbortSignal): Promise<BackendHealth> {
  const url = `${backendBaseUrl}/health`;
  const body = await request<unknown>(url, { signal });
  if (!isRecord(body) || typeof body.operatingMode !== "string" || typeof body.authenticationMode !== "string") {
    throw describeMissing("Health", ["operatingMode", "authenticationMode"], url);
  }
  return body as unknown as BackendHealth;
}

export async function getOrgFixture(org: OrganizationId, signal?: AbortSignal): Promise<OrganizationFixture> {
  const url = orgPath(org, "/fixture");
  return assertFixtureShape(await request<unknown>(url, { org, signal }), url);
}

export async function getWorkspace(org: OrganizationId, signal?: AbortSignal): Promise<WorkspaceWithStatuses> {
  const url = orgPath(org, "/workspace");
  return assertWorkspaceShape(await request<unknown>(url, { org, signal }), url);
}

/** Same as `getWorkspace`; named for call sites that re-sync after an event or action. */
export const refreshWorkspace = getWorkspace;

export async function getBuild(org: OrganizationId, run: string = runId(org), signal?: AbortSignal): Promise<BuildStatus> {
  return request<BuildStatus>(orgPath(org, `/builds/${encodeURIComponent(run)}`), { org, signal });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function setWeeklySchedule(org: OrganizationId, active: boolean): Promise<BackendResult<ScheduleResponse>> {
  const url = orgPath(org, "/schedule");
  return wrap(await request<ScheduleResponse>(url, { method: "POST", org, body: { active } }), url);
}

export async function evaluateBatch(org: OrganizationId): Promise<BackendResult<EvaluateBatchResponse>> {
  const url = orgPath(org, "/batches/evaluate");
  const body = await request<EvaluateBatchResponse>(url, { method: "POST", org });
  if (!Array.isArray(body.decisions)) throw describeMissing("Batch evaluation", ["decisions"], url);
  return wrap(body, url);
}

export async function decideCluster(
  org: OrganizationId,
  clusterId: string,
  action: ClusterDecisionAction,
  notes?: string,
): Promise<BackendResult<ClusterDecisionResponse>> {
  const url = orgPath(org, `/clusters/${encodeURIComponent(clusterId)}/decision`);
  const payload: Record<string, unknown> = { action };
  if (notes !== undefined) payload.notes = notes;
  const body = await request<ClusterDecisionResponse>(url, { method: "POST", org, body: payload });
  if (!isRecord(body.cluster) || typeof body.cluster.clusterId !== "string") {
    throw describeMissing("Cluster decision", ["cluster"], url);
  }
  return wrap(body, url);
}

export async function startBuild(org: OrganizationId, input: StartBuildRequest = {}): Promise<BackendResult<StartBuildResponse>> {
  const defaults = orgAuthorizers(org);
  const url = orgPath(org, "/builds");
  const body = await request<StartBuildResponse>(url, {
    method: "POST",
    org,
    body: {
      cluster_id: input.clusterId ?? defaults.buildClusterId,
      authorized_by_employee_id: input.authorizedByEmployeeId ?? defaults.buildAuthorizerEmployeeId,
    },
  });
  if (typeof body.runId !== "string") throw describeMissing("Build start", ["runId"], url);
  return wrap(body, url);
}

export async function controlBuild(
  org: OrganizationId,
  action: BuildControlAction,
  options: { runId?: string; reason?: string } = {},
): Promise<BackendResult<BuildStatus>> {
  const run = options.runId ?? runId(org);
  const url = orgPath(org, `/builds/${encodeURIComponent(run)}/control`);
  const payload: Record<string, unknown> = { action };
  if (options.reason !== undefined) payload.reason = options.reason;
  const body = await request<BuildStatus>(url, { method: "POST", org, body: payload });
  if (typeof body.buildStage !== "string") throw describeMissing("Build control", ["buildStage"], url);
  return wrap(body, url);
}

/** Runs the server's real artifact checks. No request body. */
export async function verifyBuild(org: OrganizationId, run: string = runId(org)): Promise<BackendResult<VerificationReport>> {
  const url = orgPath(org, `/builds/${encodeURIComponent(run)}/verify`);
  const body = await request<VerificationReport>(url, { method: "POST", org });
  if (typeof body.passed !== "boolean" || !isRecord(body.verificationChecks)) {
    throw describeMissing("Verification report", ["passed", "verificationChecks"], url);
  }
  return wrap(body, url);
}

export async function submitReleaseReview(
  org: OrganizationId,
  input: ReleaseReviewRequest,
  run: string = runId(org),
): Promise<BackendResult<ReleaseReviewResponse>> {
  const url = orgPath(org, `/builds/${encodeURIComponent(run)}/release-review`);
  const body = await request<ReleaseReviewResponse>(url, {
    method: "POST",
    org,
    body: {
      decision: input.decision,
      reviewer_employee_id: input.reviewerEmployeeId ?? orgAuthorizers(org).releaseReviewerEmployeeId,
      notes: input.notes ?? "",
    },
  });
  if (!isRecord(body.build)) throw describeMissing("Release review", ["build"], url);
  return wrap(body, url);
}

/**
 * Submit one caller-supplied, already reviewed work report to intake.
 * The payload must already be redacted and approved by the submitting user;
 * this function adds nothing and sends it unchanged.
 */
export async function submitReviewedWorkReport(
  org: OrganizationId,
  payload: WorkReportSubmission,
): Promise<BackendResult<WorkReportReceipt>> {
  const url = orgPath(org, "/mcp/submit-work-report");
  const body = await request<WorkReportReceipt>(url, { method: "POST", org, body: payload });
  if (typeof body.reportId !== "string" || typeof body.receiptId !== "string") {
    throw describeMissing("Intake receipt", ["reportId", "receiptId"], url);
  }
  return wrap(body, url);
}

// ---------------------------------------------------------------------------
// Server-Sent Events -> canonical workspace refetch
// ---------------------------------------------------------------------------

/** Event names that change workspace state and therefore trigger a refetch. */
export const WORKSPACE_EVENT_TYPES = [
  "orthogonal_status",
  "routing_decision",
  "trace_event",
  "checkpoint_update",
  "artifact_verification",
] as const;

export type WorkspaceEventType = (typeof WORKSPACE_EVENT_TYPES)[number];

export type WorkspaceStreamStatus = "connecting" | "open" | "reconnecting" | "closed";

export interface WorkspaceStreamConnection {
  status: WorkspaceStreamStatus;
  /** Last refetch or stream failure, kept until the next successful update. */
  lastError?: BackendError;
  /** Count of workspace-affecting events received since subscribing. */
  eventCount: number;
}

export interface SubscribeOptions {
  /** Quiet period before refetching after a burst of events. Default 150 ms. */
  debounceMs?: number;
  /** Fetch a snapshot immediately on subscribe. Default true. */
  fetchOnOpen?: boolean;
}

export function workspaceEventStreamUrl(org: OrganizationId): string {
  return orgPath(org, "/events/stream?replay_only=false");
}

/**
 * Open the live SSE stream for `org` and call `onUpdate` with a fresh server
 * workspace snapshot whenever workspace-affecting events arrive. Events are
 * debounced and refetches are serialized: at most one `GET /workspace` is in
 * flight, and a burst during a fetch collapses into one follow-up fetch.
 *
 * Returns a cleanup function that closes the stream, cancels pending timers,
 * and guarantees no callback fires afterwards.
 */
export function subscribeWorkspaceEvents(
  org: OrganizationId,
  onUpdate: (workspace: WorkspaceWithStatuses) => void,
  onConnectionChange?: (connection: WorkspaceStreamConnection) => void,
  options: SubscribeOptions = {},
): () => void {
  const debounceMs = options.debounceMs ?? 150;
  const url = workspaceEventStreamUrl(org);

  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fetching = false;
  let refetchQueued = false;
  let abort: AbortController | undefined;
  const connection: WorkspaceStreamConnection = { status: "connecting", eventCount: 0 };

  const emitConnection = (patch: Partial<WorkspaceStreamConnection>) => {
    if (closed) return;
    Object.assign(connection, patch);
    onConnectionChange?.({ ...connection });
  };

  const runRefetch = async () => {
    if (closed || fetching) {
      refetchQueued = !closed;
      return;
    }
    fetching = true;
    refetchQueued = false;
    abort = new AbortController();
    try {
      const snapshot = await getWorkspace(org, abort.signal);
      if (closed) return;
      onUpdate(snapshot);
      if (connection.lastError) emitConnection({ lastError: undefined });
    } catch (error) {
      if (closed) return;
      const failure =
        error instanceof BackendError
          ? error
          : new BackendError(error instanceof Error ? error.message : String(error), { status: 0, url });
      emitConnection({ lastError: failure });
    } finally {
      fetching = false;
      abort = undefined;
      if (refetchQueued && !closed) scheduleRefetch();
    }
  };

  const scheduleRefetch = () => {
    if (closed) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void runRefetch();
    }, debounceMs);
  };

  const source = new EventSource(url);
  const onEvent = () => {
    if (closed) return;
    connection.eventCount += 1;
    scheduleRefetch();
  };
  for (const type of WORKSPACE_EVENT_TYPES) {
    source.addEventListener(type, onEvent);
  }
  source.onopen = () => {
    const wasReconnecting = connection.status === "reconnecting";
    emitConnection({ status: "open" });
    if (options.fetchOnOpen !== false || wasReconnecting) scheduleRefetch();
  };
  source.onerror = () => {
    if (closed) return;
    if (source.readyState === EventSource.CLOSED) {
      emitConnection({
        status: "closed",
        lastError: new BackendError(`Event stream closed by server: ${url}`, { status: 0, url }),
      });
    } else {
      emitConnection({ status: "reconnecting" });
    }
  };

  emitConnection({ status: "connecting" });

  return () => {
    if (closed) return;
    closed = true;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    abort?.abort();
    for (const type of WORKSPACE_EVENT_TYPES) {
      source.removeEventListener(type, onEvent);
    }
    source.onopen = null;
    source.onerror = null;
    source.close();
    connection.status = "closed";
  };
}

// ---------------------------------------------------------------------------
// Live builds (real sandbox runs; see docs/superpowers/specs/2026-10-25-live-builder-design.md)
// ---------------------------------------------------------------------------

export type LiveBuildStatus =
  | "queued"
  | "in_progress"
  | "requires_action"
  | "incomplete"
  | "completed"
  | "failed"
  | "cancelled";
export type LiveBuildPhase = "received" | "reading" | "building" | "checking" | "ready" | "failed";
export type LiveBuildEventKind = "status" | "thought" | "tool_call" | "tool_result" | "file" | "message" | "error";

export interface LiveBuildRun {
  runId: string;
  orgId: OrganizationId;
  status: LiveBuildStatus;
  phase: LiveBuildPhase;
  model: string;
  interactionId: string | null;
  environmentId: string | null;
  requestedBy: { personaId: string; name: string; role: string };
  workflow: { title: string; summary: string; tools: string[]; weeklyHoursSaved: number | null };
  app: { name: string; purpose: string; features: string[]; assumptions: string[] };
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  errorReason: string | null;
  usage: { totalTokens: number; totalThoughtTokens: number; totalOutputTokens: number };
  filesWritten: string[];
}

export interface LiveBuildProgressEvent {
  seq: number;
  at: string;
  kind: LiveBuildEventKind;
  title: string;
  detail: string | null;
  path: string | null;
}

export interface LiveBuildArtifact {
  indexUrl: string;
  previewUrl: string | null;
  notes: string | null;
  card: { name: string; tagline: string; highlights: string[]; screens: string[] } | null;
  fileCount: number;
  bytes: number;
}

export interface LiveBuildSnapshot {
  run: LiveBuildRun | null;
  progress: LiveBuildProgressEvent[];
  artifact: LiveBuildArtifact | null;
}

export async function getLiveBuildCurrent(
  org: OrganizationId,
  since?: number,
  signal?: AbortSignal,
): Promise<LiveBuildSnapshot> {
  const query = since !== undefined ? `?since=${encodeURIComponent(String(since))}` : "";
  const url = orgPath(org, `/builds/live/current${query}`);
  const body = await request<Partial<LiveBuildSnapshot>>(url, { org, signal });
  return {
    run: body.run ?? null,
    progress: Array.isArray(body.progress) ? body.progress : [],
    artifact: body.artifact ?? null,
  };
}
