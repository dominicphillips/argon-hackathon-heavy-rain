import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type KeyboardEvent,
} from "react";
import {
  Button,
  Field,
  HeavyRainWordmark,
  Panel,
  Status,
  SYSTEM_NAV_SECTIONS,
  type SystemNavSection,
  type SystemStatusTone,
  type WorkerRole,
} from "@heavy-rain/system-ui";
import {
  createInitialOrgState,
  ORGANIZATION_FIXTURES,
  SYSTEM_OPERATOR_ACCOUNTS,
} from "./data/fixtures";
import type {
  BuildStageId,
  CheckpointNumber,
  InspectorTabId,
  OrganizationId,
  OrganizationWorkspaceState,
  TraceEvent,
} from "./types";
import { TopographicCanvas } from "./components/TopographicCanvas";
import { ChamberWireframe } from "./components/ChamberWireframe";
import { ChamberLiveReadout } from "./components/ChamberLiveReadout";
import { RookmereEmbeddedFrame } from "./components/RookmereEmbeddedFrame";
import { AugiEmbeddedFrame } from "./components/AugiEmbeddedFrame";
import { InspectorDrawer } from "./components/InspectorDrawer";
import { CatalogAppHero } from "./components/CatalogAppHero";
import { copy } from "./copy";
import workCopy from "./copy/work.json";
import workerQuoteCopy from "./copy/worker-quotes.json";
import catalogCopy from "./copy/catalog.json";
import experienceCopy from "./copy/experience.json";
import playbackCopy from "./copy/playback.json";
import workerStatusCopy from "./copy/worker-status.json";
import { useDemoPlayback } from "./demo/useDemoPlayback";
import {
  DemoPlaybackControls,
  type DemoPlaybackCopy,
} from "./demo/DemoPlayback";
import {
  WorkEditorialCards,
  type WorkEditorialCardCopy,
} from "./components/WorkEditorialCards";
import {
  controlBuild,
  decideCluster,
  evaluateBatch,
  getHealth,
  getOrgFixture,
  getWorkspace,
  orgAuthorizers,
  setWeeklySchedule,
  startBuild,
  submitReleaseReview,
  submitReviewedWorkReport,
  subscribeWorkspaceEvents,
  verifyBuild,
  type BackendHealth,
  type WorkReportReceipt,
  type WorkReportSubmission,
} from "./backend/client";
import type { EmployeeReport, OrganizationFixture } from "./types";

// Visible navigation labels; internal SystemNavSection IDs and switch logic stay unchanged.
const NAV_LABELS: Record<SystemNavSection, string> = {
  System: "Build",
  Work: "Ingest",
  Apps: "Apps",
  Activity: "Activity",
};

// Activity is not part of the operator demo; the rail shows Build, Ingest, Apps.
const NAV_SECTIONS = SYSTEM_NAV_SECTIONS.filter(
  (section) => section !== "Activity",
);

// Display-name overrides keyed by catalog appId (backend IDs unchanged).
const CATALOG_DISPLAY: Record<string, { name?: string; purpose?: string }> =
  catalogCopy;

// Canonical fixture report per authorized intake employee (role mapping from the backend contract)
const INTAKE_SOURCE: Record<
  OrganizationId,
  { reportId: string; employeeId: string; roleId: string }
> = {
  rookmere: {
    reportId: "rep_rm_20261022_003",
    employeeId: "emp_rm_07",
    roleId: "role_fund_finance",
  },
  augi: {
    reportId: "rep_augi_20261021_001",
    employeeId: "emp_augi_01",
    roleId: "role_biw_structures",
  },
};

function buildIntakePayload(
  org: OrganizationId,
  report: EmployeeReport,
): WorkReportSubmission {
  const source = INTAKE_SOURCE[org];
  const stamp = Date.now();
  return {
    idempotency_key: `idem_${org}_${report.reportId}_${stamp}`,
    org_id: org,
    employee_id: source.employeeId,
    role_id: source.roleId,
    assistant_surface: report.assistantSurface,
    mcp_tool_name: "heavyrain_submit_work_report",
    session_provenance: {
      session_id: `sess_${org}_${stamp}`,
      captured_at: new Date(stamp).toISOString(),
    },
    user_inspected_outgoing_payload: true,
    host_chat_history_excluded: true,
    redaction_manifest: {
      client_redaction_applied: true,
      excluded_fields: [],
      policy_version: "2026.10",
    },
    data_scope: report.dataScope,
    pattern_hint: report.clusterId,
    task_summary: report.taskSummary,
    outgoing_payload_preview: report.outgoingPayloadPreview,
    attachments: [],
  };
}

// Merge a server snapshot while keeping local view selections that still resolve
function mergeSnapshot(
  prev: OrganizationWorkspaceState,
  next: OrganizationWorkspaceState,
): OrganizationWorkspaceState {
  if (next.orgId !== prev.orgId) return prev;
  const clusterIds = new Set(next.clusters.map((c) => c.clusterId));
  const appIds = new Set(next.catalogApps.map((a) => a.appId));
  const eventIds = new Set(next.events.map((e) => e.eventId));
  return {
    ...next,
    isReplaying: false,
    selectedWorker: prev.selectedWorker,
    selectedReportId: prev.selectedReportId || next.selectedReportId,
    selectedClusterId: clusterIds.has(prev.selectedClusterId)
      ? prev.selectedClusterId
      : next.selectedClusterId,
    selectedAppId: appIds.has(prev.selectedAppId)
      ? prev.selectedAppId
      : next.selectedAppId,
    selectedEventId: eventIds.has(prev.selectedEventId)
      ? prev.selectedEventId
      : next.selectedEventId,
    intakeErrorSimulated: prev.intakeErrorSimulated,
    scopeApprovalSimulated: prev.scopeApprovalSimulated,
  };
}

const STAGE_ORDER: readonly BuildStageId[] = [
  "idle",
  "loading",
  "queued",
  "stage1",
  "stage2",
  "stage3",
  "ready",
];

const OPERATOR_STORAGE_KEY = "heavy_rain_system_demo_operator_v1";

function isEntryScreenRoute(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  return (
    path === "/login" ||
    path.endsWith("/login") ||
    params.get("login") === "1"
  );
}

const REPLAY_SEQUENCE: readonly BuildStageId[] = [
  "queued",
  "stage1",
  "stage2",
  "stage3",
  "ready",
];

function formatUtcNow(): string {
  const d = new Date();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss} UTC`;
}

const workerQuoteMessages = workerQuoteCopy.messages as Partial<
  Record<OrganizationId, Partial<Record<WorkerRole, string>>>
>;
// State-specific worker text keyed by role; per-org overrides above win when present.
const workerStatusMessages = workerStatusCopy as Partial<
  Record<WorkerRole, { queued: string; working: string; completed: string }>
>;
const demoPlaybackCopy: DemoPlaybackCopy = playbackCopy;

// Explicit catalog app routing. Only implemented local apps get a URL; other cards keep View details.
const CATALOG_APP_URLS: Record<string, string> = {
  app_augi_bom_mass_ledger: "http://127.0.0.1:43171/?app=balance",
};

export const App: FC = () => {
  // Entry screen route (/login or ?login=1); direct / opens the signed-in demo workspace
  const [showEntryScreen, setShowEntryScreen] = useState<boolean>(() =>
    isEntryScreenRoute(),
  );

  // Fictional platform operator identity (persisted locally on 127.0.0.1:43170; independent of organization scope)
  const [selectedOperatorId, setSelectedOperatorId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem(OPERATOR_STORAGE_KEY);
        if (
          saved &&
          SYSTEM_OPERATOR_ACCOUNTS.some((acc) => acc.operatorId === saved)
        ) {
          return saved;
        }
      } catch {
        // Ignore storage read errors
      }
    }
    return SYSTEM_OPERATOR_ACCOUNTS[0].operatorId;
  });

  // Active organization scope ("rookmere" | "augi")
  const [activeOrgId, setActiveOrgId] = useState<OrganizationId>("rookmere");

  // Active navigation destination ("System" | "Work" | "Apps" | "Activity")
  const [activeNav, setActiveNav] = useState<SystemNavSection>("System");

  // Isolated per-organization state map so switching cannot cross-contaminate or release wrong artifact
  const [orgStates, setOrgStates] = useState<
    Record<OrganizationId, OrganizationWorkspaceState>
  >(() => ({
    rookmere: createInitialOrgState("rookmere"),
    augi: createInitialOrgState("augi"),
  }));

  // Local backend connection (http://127.0.0.1:43180); false means explicit offline fixture fallback
  const [backendConnected, setBackendConnected] = useState<boolean>(false);
  const [backendHealth, setBackendHealth] = useState<BackendHealth | null>(null);
  const [fixtures, setFixtures] = useState<
    Record<OrganizationId, OrganizationFixture>
  >(() => ({ ...ORGANIZATION_FIXTURES }));
  const [backendBusy, setBackendBusy] = useState<
    Record<OrganizationId, string | null>
  >({ rookmere: null, augi: null });
  const busyRef = useRef<Record<OrganizationId, string | null>>({
    rookmere: null,
    augi: null,
  });
  // Demo playback owns the mutation lane while playing or awaiting an accepted request.
  // Never fed back into the playback hook's externalBusy; that would deadlock it.
  const [demoBusy, setDemoBusy] = useState<boolean>(false);
  const playbackLaneRef = useRef<boolean>(false);
  const [backendErrors, setBackendErrors] = useState<
    Record<OrganizationId, string | null>
  >({ rookmere: null, augi: null });
  const [intakeDrafts, setIntakeDrafts] = useState<
    Record<OrganizationId, WorkReportSubmission | null>
  >({ rookmere: null, augi: null });
  const [intakeReceipts, setIntakeReceipts] = useState<
    Record<OrganizationId, WorkReportReceipt | null>
  >({ rookmere: null, augi: null });

  // Reduced motion preference (initializes from OS prefers-reduced-motion, toggleable in account menu)
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function"
    ) {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    return false;
  });

  // Contextual right inspector drawer state (does not permanently shrink center workbench)
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(false);
  const [inspectorTab, setInspectorTab] =
    useState<InspectorTabId>("decision");

  useEffect(() => {
    function handlePopState() {
      setShowEntryScreen(isEntryScreenRoute());
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const activeOperator = useMemo(
    () =>
      SYSTEM_OPERATOR_ACCOUNTS.find(
        (op) => op.operatorId === selectedOperatorId,
      ) ?? SYSTEM_OPERATOR_ACCOUNTS[0],
    [selectedOperatorId],
  );

  function handleSelectOperator(operatorId: string) {
    setSelectedOperatorId(operatorId);
    try {
      window.localStorage.setItem(OPERATOR_STORAGE_KEY, operatorId);
    } catch {
      // Ignore storage write errors
    }
  }

  function handleEnterWorkspace(event?: React.FormEvent) {
    event?.preventDefault();
    try {
      window.localStorage.setItem(
        OPERATOR_STORAGE_KEY,
        activeOperator.operatorId,
      );
    } catch {
      // Ignore storage write errors
    }
    if (typeof window !== "undefined") {
      window.history.pushState({}, "", "/");
    }
    setShowEntryScreen(false);
  }

  function handleOpenStandaloneOrgApp(targetOrgId: OrganizationId = activeOrgId) {
    const url =
      ORGANIZATION_FIXTURES[targetOrgId].externalAppUrl ??
      (targetOrgId === "rookmere"
        ? "http://127.0.0.1:43173"
        : "http://127.0.0.1:43171");
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }


  // Apps view filter state
  const [appsFilter, setAppsFilter] = useState<
    "all" | "released" | "sandbox"
  >("all");

  const navButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activeFixture = fixtures[activeOrgId];
  const activeOrgState = orgStates[activeOrgId];
  const activeBackendBusy = backendBusy[activeOrgId];

  // Current heading name: catalog display override for the hero app, falling back to the fixture title
  const heroDisplayName = useMemo(() => {
    const heroApp = activeFixture.catalogApps.find(
      (app) => app.isHeroCandidate === true,
    );
    return (
      (heroApp ? CATALOG_DISPLAY[heroApp.appId]?.name : undefined) ??
      activeFixture.heroTitle
    );
  }, [activeFixture]);

  // Helper to update a specific organization's isolated state
  const updateOrgState = useCallback(
    (
      targetOrgId: OrganizationId,
      updater: (
        prev: OrganizationWorkspaceState,
      ) => OrganizationWorkspaceState,
    ) => {
      setOrgStates((prevMap) => ({
        ...prevMap,
        [targetOrgId]: updater(prevMap[targetOrgId]),
      }));
    },
    [],
  );

  const applySnapshot = useCallback(
    (org: OrganizationId, snapshot: OrganizationWorkspaceState) => {
      updateOrgState(org, (prev) => mergeSnapshot(prev, snapshot));
    },
    [updateOrgState],
  );

  const refreshFixture = useCallback(async (org: OrganizationId) => {
    const next = await getOrgFixture(org);
    setFixtures((prev) => ({ ...prev, [org]: next }));
  }, []);

  // Run one backend operation per org at a time; apply the server workspace, surface the server error text
  const runBackend = useCallback(
    async <T,>(
      org: OrganizationId,
      key: string,
      op: () => Promise<{ data: T; workspace?: OrganizationWorkspaceState }>,
      after?: (data: T) => Promise<void> | void,
    ): Promise<T | null> => {
      // Manual mutations wait while demo playback owns the lane; the controller calls the client directly.
      if (busyRef.current[org] || playbackLaneRef.current) return null;
      busyRef.current = { ...busyRef.current, [org]: key };
      setBackendBusy((prev) => ({ ...prev, [org]: key }));
      setBackendErrors((prev) => ({ ...prev, [org]: null }));
      try {
        const result = await op();
        const snapshot = result.workspace ?? (await getWorkspace(org));
        applySnapshot(org, snapshot);
        if (after) await after(result.data);
        return result.data;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setBackendErrors((prev) => ({ ...prev, [org]: message }));
        return null;
      } finally {
        busyRef.current = { ...busyRef.current, [org]: null };
        setBackendBusy((prev) => ({ ...prev, [org]: null }));
      }
    },
    [applySnapshot],
  );

  // One App-level demo playback hook so Build -> Ingest navigation does not stop it.
  // Steps stop at verified ready; release review and approval stay explicit human actions.
  const demoPlaybackEnabled =
    !showEntryScreen &&
    backendConnected &&
    backendHealth?.operatingMode === "demo_fixture_replay";
  const playback = useDemoPlayback({
    orgId: activeOrgId,
    enabled: demoPlaybackEnabled,
    externalBusy: Boolean(activeBackendBusy),
    onWorkspace: applySnapshot,
    onView: setActiveNav,
    onBusyChange: setDemoBusy,
  });
  const playbackOwnsLane =
    demoBusy || playback.state.playing || playback.state.busy;
  playbackLaneRef.current = playbackOwnsLane;
  // Combined UI busy state: backend request in flight or playback holding the lane.
  const manualLocked = Boolean(activeBackendBusy) || playbackOwnsLane;
  const playbackControls = backendConnected ? (
    <DemoPlaybackControls
      playback={playback}
      enabled={demoPlaybackEnabled}
      externalBusy={Boolean(activeBackendBusy)}
      copy={demoPlaybackCopy}
    />
  ) : null;

  // Hydrate both tenants from the local backend; stay on fixtures if it is unreachable
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const health = await getHealth();
        const [rf, af, rw, aw] = await Promise.all([
          getOrgFixture("rookmere"),
          getOrgFixture("augi"),
          getWorkspace("rookmere"),
          getWorkspace("augi"),
        ]);
        if (cancelled) return;
        setFixtures({ rookmere: rf, augi: af });
        setOrgStates((prev) => ({
          rookmere: mergeSnapshot(prev.rookmere, rw),
          augi: mergeSnapshot(prev.augi, aw),
        }));
        setBackendHealth(health);
        setBackendConnected(true);
      } catch {
        if (!cancelled) {
          setBackendConnected(false);
          setBackendHealth(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Subscribe to the active org's SSE stream; the client refetches the canonical workspace per event
  useEffect(() => {
    if (!backendConnected) return;
    const org = activeOrgId;
    return subscribeWorkspaceEvents(org, (snapshot) =>
      applySnapshot(org, snapshot),
    );
  }, [backendConnected, activeOrgId, applySnapshot]);

  // Cleanup & advance deterministic replay timer strictly for the active replaying org
  useEffect(() => {
    if (!activeOrgState.isReplaying || backendConnected) {
      return;
    }

    const targetOrgId = activeOrgId;
    const fixture = ORGANIZATION_FIXTURES[targetOrgId];

    const timerId = window.setInterval(() => {
      updateOrgState(targetOrgId, (prev) => {
        if (!prev.isReplaying) return prev;

        const currentIndex = REPLAY_SEQUENCE.indexOf(prev.buildStage);
        const nextStage =
          currentIndex >= 0 && currentIndex < REPLAY_SEQUENCE.length - 1
            ? REPLAY_SEQUENCE[currentIndex + 1]
            : "ready";

        const nextCheckpoint: CheckpointNumber =
          nextStage === "stage1"
            ? 1
            : nextStage === "stage2"
            ? 2
            : nextStage === "stage3" || nextStage === "ready"
            ? 3
            : prev.lastActiveCheckpoint;

        const newEvent: TraceEvent = {
          eventId: `evt_${targetOrgId}_replay_${Date.now()}`,
          timestamp: formatUtcNow(),
          actor:
            nextStage === "stage1"
              ? "Connector"
              : nextStage === "ready"
              ? "Cairn"
              : "Builder",
          stageLabel:
            nextStage === "stage1"
              ? "Checkpoint 1 · Schema check"
              : nextStage === "stage2"
              ? "Checkpoint 2 · UI assembly"
              : nextStage === "stage3"
              ? "Checkpoint 3 · Verification"
              : "Artifact ready for review",
          tone: nextStage === "ready" ? "completed" : "building",
          headline:
            nextStage === "stage1"
              ? `Stage 1/3 running: Verifying ${fixture.heroFullName} schema contract`
              : nextStage === "stage2"
              ? `Stage 2/3 running: Assembling ${fixture.heroFullName} components in sandbox`
              : nextStage === "stage3"
              ? `Stage 3/3 running: Executing 3 automated sandbox verification checks`
              : `Sandbox checks passed · ${fixture.heroFullName} ready for review`,
          toolName:
            nextStage === "stage1"
              ? "schema_contract_check"
              : nextStage === "stage2"
              ? "sandbox_assemble_ui"
              : nextStage === "stage3"
              ? "sandbox_run_verification"
              : "cairn_mark_artifact_ready",
          inputEvidence: `${fixture.weeklyBatchId} · Candidate v${prev.candidateVersion}`,
          toolOutput:
            nextStage === "ready"
              ? "3 of 3 verification checks passed on read-only sample data. 0 production writes executed."
              : `Checkpoint ${nextCheckpoint} active in isolated sandbox.`,
          durationMs: 1250,
          decisionSummary:
            nextStage === "ready"
              ? "Cleared smoky build veil; candidate awaits operator release review."
              : `Advancing deterministic replay through ${nextStage}.`,
          checkpointStep: nextCheckpoint,
        };

        return {
          ...prev,
          buildStage: nextStage,
          lastActiveCheckpoint: nextCheckpoint,
          weeklyRunStatus:
            nextStage === "ready"
              ? "Awaiting operator decision"
              : "Grouping reports",
          isReplaying: nextStage !== "ready",
          selectedWorker:
            nextStage === "stage1" ? "Connector" : "Builder",
          events: [...prev.events, newEvent],
          selectedEventId: newEvent.eventId,
        };
      });
    }, 2200);

    return () => {
      window.clearInterval(timerId);
    };
  }, [activeOrgId, activeOrgState.isReplaying, backendConnected, updateOrgState]);

  // Global keyboard shortcuts (Escape closes the inspector drawer)
  useEffect(() => {
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape" && inspectorOpen) {
        setInspectorOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [inspectorOpen]);

  // Compute each worker's status for the 4-worker horizontal dock below the chamber
  const getWorkerStatus = useCallback(
    (
      role: WorkerRole,
    ): {
      tone: SystemStatusTone;
      label: string;
      isActiveCell: boolean;
    } => {
      const stage = activeOrgState.buildStage;
      if (role === "Researcher") {
        if (stage === "idle" || stage === "loading") {
          return {
            tone: "running",
            label: "Running",
            isActiveCell: true,
          };
        }
        return {
          tone: "completed",
          label: "Completed",
          isActiveCell: false,
        };
      }

      if (role === "Connector") {
        if (stage === "idle" || stage === "loading" || stage === "queued") {
          return { tone: "queued", label: "Queued", isActiveCell: false };
        }
        if (stage === "stage1") {
          return {
            tone: "running",
            label: "Running",
            isActiveCell: true,
          };
        }
        return {
          tone: "completed",
          label: "Completed",
          isActiveCell: false,
        };
      }

      if (role === "Builder") {
        if (
          stage === "idle" ||
          stage === "loading" ||
          stage === "queued" ||
          stage === "stage1"
        ) {
          return { tone: "queued", label: "Queued", isActiveCell: false };
        }
        if (stage === "stage2" || stage === "stage3") {
          return {
            tone: "running",
            label: "Running",
            isActiveCell: true,
          };
        }
        if (stage === "paused") {
          return {
            tone: "paused",
            label: "Paused",
            isActiveCell: true,
          };
        }
        if (stage === "failed") {
          return {
            tone: "failed",
            label: "Check failed",
            isActiveCell: true,
          };
        }
        return {
          tone: "completed",
          label: "Completed",
          isActiveCell: activeOrgState.appReleaseStatus !== "released",
        };
      }

      // Notifier
      if (activeOrgState.appReleaseStatus === "released") {
        return {
          tone: "completed",
          label: "Completed",
          isActiveCell: true,
        };
      }
      const anyRouted = activeOrgState.clusters.some(
        (c) => c.actionState === "routed_to_app",
      );
      if (anyRouted) {
        return {
          tone: "completed",
          label: "Sent route link",
          isActiveCell: false,
        };
      }
      return { tone: "queued", label: "Queued", isActiveCell: false };
    },
    [
      activeOrgState.buildStage,
      activeOrgState.appReleaseStatus,
      activeOrgState.clusters,
    ],
  );

  // Switch organization cleanly (stops any active replay timer on previous org, preserves each org's state)
  function handleSelectOrganization(nextOrgId: OrganizationId) {
    if (nextOrgId === activeOrgId) return;
    updateOrgState(activeOrgId, (prev) => ({
      ...prev,
      isReplaying: false,
    }));
    setActiveOrgId(nextOrgId);
  }

  // Action: Pause or Resume sandbox build at exact checkpoint
  function handleTogglePauseBuild() {
    const targetOrgId = activeOrgId;
    if (backendConnected) {
      const action =
        orgStates[targetOrgId].buildStage === "paused" ? "resume" : "pause";
      void runBackend(targetOrgId, action, () =>
        controlBuild(targetOrgId, action),
      );
      return;
    }
    const fixture = ORGANIZATION_FIXTURES[targetOrgId];

    updateOrgState(targetOrgId, (prev) => {
      if (prev.buildStage === "paused") {
        const resumeStage: BuildStageId =
          prev.lastActiveCheckpoint === 1
            ? "stage1"
            : prev.lastActiveCheckpoint === 3
            ? "stage3"
            : "stage2";
        const resumeEvt: TraceEvent = {
          eventId: `evt_${targetOrgId}_resume_${Date.now()}`,
          timestamp: formatUtcNow(),
          actor: "Builder",
          stageLabel: `Resumed at Stage ${prev.lastActiveCheckpoint}`,
          tone: "building",
          headline: `Resumed ${fixture.heroFullName} build from Checkpoint ${prev.lastActiveCheckpoint}`,
          toolName: "sandbox_resume_checkpoint",
          inputEvidence: `Checkpoint ${prev.lastActiveCheckpoint} snapshot`,
          toolOutput: `Skipped already verified stages; continuing from Stage ${prev.lastActiveCheckpoint} of 3.`,
          durationMs: 310,
          decisionSummary:
            "Idempotent checkpoint resume completed without restarting Stage 1.",
          checkpointStep: prev.lastActiveCheckpoint,
        };
        return {
          ...prev,
          buildStage: resumeStage,
          events: [...prev.events, resumeEvt],
          selectedEventId: resumeEvt.eventId,
        };
      }

      const activeCp: CheckpointNumber =
        prev.buildStage === "stage1"
          ? 1
          : prev.buildStage === "stage3"
          ? 3
          : 2;

      const pauseEvt: TraceEvent = {
        eventId: `evt_${targetOrgId}_pause_${Date.now()}`,
        timestamp: formatUtcNow(),
        actor: "Builder",
        stageLabel: `Paused at Checkpoint ${activeCp}`,
        tone: "paused",
        headline: `Sandbox build paused at Stage ${activeCp} (${
          activeCp === 1
            ? "Schema check"
            : activeCp === 2
            ? "UI assembly"
            : "Verification"
        })`,
        toolName: "sandbox_pause_checkpoint",
        inputEvidence: `Operator pause command on ${fixture.heroFullName}`,
        toolOutput: `Checkpoint ${Math.max(
          1,
          activeCp - 1,
        )} remains saved. Smoke drift frozen at last verified frame.`,
        durationMs: 190,
        decisionSummary:
          "Build frozen at checkpoint; weekly schedule remains independent.",
        checkpointStep: activeCp,
      };

      return {
        ...prev,
        buildStage: "paused",
        lastActiveCheckpoint: activeCp,
        isReplaying: false,
        events: [...prev.events, pauseEvt],
        selectedEventId: pauseEvt.eventId,
      };
    });
  }

  // Action: Cancel build; keep draft
  function handleCancelBuildKeepDraft() {
    const targetOrgId = activeOrgId;
    if (backendConnected) {
      void runBackend(targetOrgId, "cancel", () =>
        controlBuild(targetOrgId, "cancel"),
      );
      return;
    }
    const fixture = ORGANIZATION_FIXTURES[targetOrgId];
    updateOrgState(targetOrgId, (prev) => {
      const cancelEvt: TraceEvent = {
        eventId: `evt_${targetOrgId}_cancel_${Date.now()}`,
        timestamp: formatUtcNow(),
        actor: "Cairn",
        stageLabel: "Draft preserved",
        tone: "queued",
        headline: `Cancelled active sandbox run; preserved ${fixture.heroFullName} grouped draft in Ingest`,
        toolName: "cairn_cancel_keep_draft",
        inputEvidence: `${fixture.weeklyBatchId} · Checkpoint ${prev.lastActiveCheckpoint}`,
        toolOutput:
          "Sandbox worker stopped cleanly; employee reports and Checkpoint 1 schema remain intact.",
        durationMs: 240,
        decisionSummary:
          "Zero partial release state written to Apps; operator can restart from Work anytime.",
      };
      return {
        ...prev,
        buildStage: "idle",
        isReplaying: false,
        clusters: prev.clusters.map((c) =>
          c.disposition === "build_in_sandbox"
            ? { ...c, actionState: "pending_triage" }
            : c,
        ),
        events: [...prev.events, cancelEvt],
        selectedEventId: cancelEvt.eventId,
      };
    });
  }

  // Action: Reveal ready artifact immediately
  function handleRevealReadyArtifact() {
    const targetOrgId = activeOrgId;
    if (backendConnected) {
      // reveal_ready only marks Stage 3 pending; verify must pass before the veil clears
      void runBackend(targetOrgId, "reveal_ready", async () => {
        await controlBuild(targetOrgId, "reveal_ready");
        const verified = await verifyBuild(targetOrgId);
        const workspace = await getWorkspace(targetOrgId);
        return { data: verified.data, workspace };
      });
      setActiveNav("System");
      return;
    }
    const fixture = ORGANIZATION_FIXTURES[targetOrgId];
    updateOrgState(targetOrgId, (prev) => {
      const readyEvt: TraceEvent = {
        eventId: `evt_${targetOrgId}_reveal_${Date.now()}`,
        timestamp: formatUtcNow(),
        actor: "Builder",
        stageLabel: "Ready for review",
        tone: "completed",
        headline: `Sandbox checks passed · ${fixture.heroFullName} ready for review`,
        toolName: "sandbox_verify_complete",
        inputEvidence: `Candidate v${prev.candidateVersion} · Checkpoints 1–3`,
        toolOutput:
          "3 of 3 verification checks passed on read-only sample data. 0 production writes executed.",
        durationMs: 1640,
        decisionSummary:
          "Smoky veil cleared (blur 0px); interactive candidate unlocked for operator review.",
        checkpointStep: 3,
      };
      return {
        ...prev,
        buildStage: "ready",
        lastActiveCheckpoint: 3,
        isReplaying: false,
        weeklyRunStatus: "Awaiting operator decision",
        events: [...prev.events, readyEvt],
        selectedEventId: readyEvt.eventId,
      };
    });
    setActiveNav("System");
  }

  // Action: Jump directly to a specific build stage (for checkpoint rail / error recovery inspection)
  function handleSelectBuildStage(nextStage: BuildStageId) {
    const targetOrgId = activeOrgId;
    if (backendConnected) {
      // Only a forward checkpoint advance is authoritative; backward jumps and failure views are not sent
      const current = STAGE_ORDER.indexOf(orgStates[targetOrgId].buildStage);
      const target = STAGE_ORDER.indexOf(nextStage);
      if (target > current && nextStage !== "ready") {
        void runBackend(targetOrgId, "advance_checkpoint", () =>
          controlBuild(targetOrgId, "advance_checkpoint"),
        );
      }
      return;
    }
    const fixture = ORGANIZATION_FIXTURES[targetOrgId];
    updateOrgState(targetOrgId, (prev) => {
      const cp: CheckpointNumber =
        nextStage === "stage1"
          ? 1
          : nextStage === "stage2"
          ? 2
          : nextStage === "stage3" ||
            nextStage === "failed" ||
            nextStage === "ready"
          ? 3
          : prev.lastActiveCheckpoint;

      const stageEvt: TraceEvent = {
        eventId: `evt_${targetOrgId}_stage_${nextStage}_${Date.now()}`,
        timestamp: formatUtcNow(),
        actor: nextStage === "stage1" ? "Connector" : "Builder",
        stageLabel:
          nextStage === "failed"
            ? "Check failed"
            : nextStage === "ready"
            ? "Ready for review"
            : `Stage: ${nextStage}`,
        tone:
          nextStage === "failed"
            ? "failed"
            : nextStage === "ready"
            ? "completed"
            : nextStage === "paused"
            ? "paused"
            : "building",
        headline:
          nextStage === "failed"
            ? fixture.heroFailedHeadline
            : nextStage === "ready"
            ? `Sandbox checks passed · ${fixture.heroFullName} ready for review`
            : `Switched sandbox view to ${nextStage}`,
        toolName: "sandbox_checkpoint_select",
        inputEvidence: `${fixture.heroFullName} · Checkpoint ${cp}`,
        toolOutput:
          nextStage === "failed"
            ? fixture.heroFailedDetail
            : `Checkpoint ${cp} active.`,
        durationMs: 320,
        decisionSummary:
          nextStage === "failed"
            ? "Prior checkpoints remain saved; operator can Retry from checkpoint or Request changes."
            : "Updated sandbox build stage.",
        checkpointStep: cp,
      };

      return {
        ...prev,
        buildStage: nextStage,
        lastActiveCheckpoint: cp,
        isReplaying: false,
        events: [...prev.events, stageEvt],
        selectedEventId: stageEvt.eventId,
      };
    });
  }

  // Action: Retry from checkpoint after a failed check
  function handleRetryFromCheckpoint() {
    const targetOrgId = activeOrgId;
    if (backendConnected) {
      void runBackend(targetOrgId, "retry", () =>
        controlBuild(targetOrgId, "retry_from_checkpoint"),
      );
      return;
    }
    const fixture = ORGANIZATION_FIXTURES[targetOrgId];
    updateOrgState(targetOrgId, (prev) => {
      const retryEvt: TraceEvent = {
        eventId: `evt_${targetOrgId}_retry_${Date.now()}`,
        timestamp: formatUtcNow(),
        actor: "Builder",
        stageLabel: "Retrying Stage 3",
        tone: "building",
        headline: `Retrying verification from saved Checkpoint 2 for ${fixture.heroFullName}`,
        toolName: "sandbox_retry_from_checkpoint",
        inputEvidence: "Saved Checkpoint 1 & 2 artifacts + updated column mapping",
        toolOutput:
          "Applied fallback currency/bounds mapping; re-running Stage 3 verification checks without repeating Stage 1.",
        durationMs: 890,
        decisionSummary:
          "Idempotent retry started from last verified checkpoint.",
        checkpointStep: 3,
      };
      return {
        ...prev,
        buildStage: "ready",
        lastActiveCheckpoint: 3,
        events: [...prev.events, retryEvt],
        selectedEventId: retryEvt.eventId,
      };
    });
  }

  // Action: Approve for release (strictly scoped to activeOrgId)
  function handleApproveForRelease() {
    if (backendConnected) {
      const org = activeOrgId;
      void runBackend(org, "release_review", () =>
        submitReleaseReview(org, {
          decision: "approve_for_release",
          reviewerEmployeeId: orgAuthorizers(org).releaseReviewerEmployeeId,
        }),
      );
      return;
    }
    const targetOrgId = activeOrgId;
    const fixture = ORGANIZATION_FIXTURES[targetOrgId];
    const notifiedCount = targetOrgId === "rookmere" ? 6 : 7;

    updateOrgState(targetOrgId, (prev) => {
      const releasedVersion = prev.candidateVersion.replace("-rc1", "");
      const releaseTime = formatUtcNow();

      const approveEvt: TraceEvent = {
        eventId: `evt_${targetOrgId}_release_${Date.now()}`,
        timestamp: releaseTime,
        actor: "Notifier",
        stageLabel: backendConnected
          ? copy.backend.approvedInDemo
          : "Released to organization",
        tone: "deployed",
        headline: `Promoted ${fixture.heroFullName} v${releasedVersion} to ${fixture.name} catalog`,
        toolName: "notifier_dispatch_release_links",
        inputEvidence: `Verified candidate v${prev.candidateVersion} · 3/3 sandbox checks passed`,
        toolOutput: backendConnected
          ? copy.backend.noNotifications
          : `Notifier delivered access-checked launch links to ${notifiedCount} reporting employees (Demo replay: 0 external emails sent).`,
        durationMs: 520,
        decisionSummary: backendConnected
          ? `${fixture.heroFullName}: ${copy.backend.approvedInDemo}`
          : `Marked ${fixture.heroFullName} Released to organization in Apps catalog.`,
      };

      return {
        ...prev,
        buildStage: "ready",
        weeklyRunStatus: "Complete",
        appReleaseStatus: "released",
        candidateVersion: releasedVersion,
        approvedRelease: {
          version: releasedVersion,
          releasedAt: releaseTime,
          approvedBy:
            targetOrgId === "rookmere"
              ? "Gareth Jenkins & Marcus Thorne"
              : "Lukas Lindner & Devendra Rao",
          notifiedCount,
          notes: `Verified sandbox artifact v${releasedVersion} active for authorized ${fixture.name} roles.`,
        },
        catalogApps: prev.catalogApps.map((app) =>
          app.isHeroCandidate
            ? {
                ...app,
                version: releasedVersion,
                releaseStatus: "released",
                notifiedEmployeeCount: notifiedCount,
                lastReleasedAt: `2026-10-25 ${releaseTime}`,
              }
            : app,
        ),
        events: [...prev.events, approveEvt],
        selectedEventId: approveEvt.eventId,
      };
    });
  }

  // Action: Request changes (returns candidate to Stage 2 UI assembly while preserving any previous approvedRelease!)
  function handleRequestChanges(note: string) {
    if (backendConnected) {
      const org = activeOrgId;
      void runBackend(org, "release_review", () =>
        submitReleaseReview(org, {
          decision: "request_changes",
          reviewerEmployeeId: orgAuthorizers(org).releaseReviewerEmployeeId,
          notes: note,
        }),
      );
      return;
    }
    const targetOrgId = activeOrgId;
    const fixture = ORGANIZATION_FIXTURES[targetOrgId];

    updateOrgState(targetOrgId, (prev) => {
      const nextCandidateVersion = prev.approvedRelease
        ? "1.1.0-rc1"
        : "1.0.1-rc1";

      const changeEvt: TraceEvent = {
        eventId: `evt_${targetOrgId}_changes_${Date.now()}`,
        timestamp: formatUtcNow(),
        actor: "Builder",
        stageLabel: "Changes requested · Stage 2",
        tone: "building",
        headline: `Operator requested changes on ${fixture.heroFullName}; rebuilding Stage 2 (UI assembly)`,
        toolName: "sandbox_apply_change_request",
        inputEvidence: `Operator note: "${note}"`,
        toolOutput: prev.approvedRelease
          ? `Candidate v${nextCandidateVersion} entered Stage 2 in sandbox; prior approved release v${prev.approvedRelease.version} remains live in Apps.`
          : `Candidate v${nextCandidateVersion} returned to Stage 2 (UI assembly); Checkpoint 1 schema preserved.`,
        durationMs: 640,
        decisionSummary:
          "Re-applied smoky build veil to candidate while preserving Checkpoint 1 and any prior approved release.",
        checkpointStep: 2,
      };

      return {
        ...prev,
        buildStage: "stage2",
        lastActiveCheckpoint: 2,
        candidateVersion: nextCandidateVersion,
        appReleaseStatus: "changes_requested",
        weeklyRunStatus: "Awaiting operator decision",
        changeRequestNotes: [note, ...prev.changeRequestNotes],
        catalogApps: prev.catalogApps.map((app) =>
          app.isHeroCandidate
            ? {
                ...app,
                version: prev.approvedRelease
                  ? prev.approvedRelease.version
                  : nextCandidateVersion,
                releaseStatus: prev.approvedRelease
                  ? "released"
                  : "changes_requested",
              }
            : app,
        ),
        events: [...prev.events, changeEvt],
        selectedEventId: changeEvt.eventId,
      };
    });
  }

  // Work Triage Action 1: Route matched cluster to existing catalog app
  function handleRouteClusterToApp(clusterId: string) {
    if (backendConnected) {
      const org = activeOrgId;
      void runBackend(org, `route_${clusterId}`, () =>
        decideCluster(org, clusterId, "route_to_existing_app"),
      );
      return;
    }
    const targetOrgId = activeOrgId;
    updateOrgState(targetOrgId, (prev) => {
      const cluster = prev.clusters.find((c) => c.clusterId === clusterId);
      if (!cluster) return prev;

      const routeEvt: TraceEvent = {
        eventId: `evt_${targetOrgId}_route_${Date.now()}`,
        timestamp: formatUtcNow(),
        actor: "Notifier",
        stageLabel: "Catalog match routed",
        tone: "completed",
        headline: `Routed ${cluster.reportCount} reporting employees directly to ${
          cluster.matchedAppName ?? "approved catalog app"
        } v${cluster.matchedAppVersion ?? "2.4"}`,
        toolName: "notifier_route_existing_app",
        inputEvidence: `${cluster.clusterId} · No new permission scope required`,
        toolOutput: `Sent access-checked deep link to ${cluster.distinctEmployeeCount} employees; no duplicate app build commissioned.`,
        durationMs: 380,
        decisionSummary:
          "Reused approved catalog application directly without adding redundant approval gates.",
      };

      const nextClusters = prev.clusters.map((c) =>
        c.clusterId === clusterId
          ? { ...c, actionState: "routed_to_app" as const }
          : c,
      );

      const allDecided = nextClusters.every(
        (c) => c.actionState !== "pending_triage",
      );

      return {
        ...prev,
        clusters: nextClusters,
        weeklyRunStatus: allDecided
          ? "Complete"
          : prev.weeklyRunStatus,
        events: [...prev.events, routeEvt],
        selectedEventId: routeEvt.eventId,
      };
    });
  }

  // Work Triage Action 2: Start sandbox build from Work cluster
  function handleStartBuildFromWork(clusterId: string) {
    if (backendConnected) {
      const org = activeOrgId;
      const auth = orgAuthorizers(org);
      if (clusterId !== auth.buildClusterId) return;
      void runBackend(org, `build_${clusterId}`, () =>
        startBuild(org, {
          clusterId: auth.buildClusterId,
          authorizedByEmployeeId: auth.buildAuthorizerEmployeeId,
        }),
      );
      setActiveNav("System");
      return;
    }
    const targetOrgId = activeOrgId;
    const fixture = ORGANIZATION_FIXTURES[targetOrgId];
    updateOrgState(targetOrgId, (prev) => {
      const startEvt: TraceEvent = {
        eventId: `evt_${targetOrgId}_start_build_${Date.now()}`,
        timestamp: formatUtcNow(),
        actor: "Cairn",
        stageLabel: "Sandbox build commissioned",
        tone: "building",
        headline: `Started 3-stage sandbox build for ${fixture.heroFullName}`,
        toolName: "cairn_start_sandbox_build",
        inputEvidence: `${clusterId} · Authorized read-only scope`,
        toolOutput:
          "Builder executing Stage 2 of 3 (UI assembly) behind smoky veil.",
        durationMs: 460,
        decisionSummary:
          "Focused System workbench on active sandbox build.",
        checkpointStep: 2,
      };

      return {
        ...prev,
        buildStage:
          prev.buildStage === "idle" || prev.buildStage === "queued"
            ? "stage2"
            : prev.buildStage,
        lastActiveCheckpoint: 2,
        clusters: prev.clusters.map((c) =>
          c.clusterId === clusterId
            ? { ...c, actionState: "building_in_sandbox" as const }
            : c,
        ),
        events: [...prev.events, startEvt],
        selectedEventId: startEvt.eventId,
      };
    });
    setActiveNav("System");
  }

  // Work Triage Action 3: Request missing evidence (leaves other clusters unblocked!)
  function handleRequestMissingEvidence(clusterId: string) {
    if (backendConnected) {
      const org = activeOrgId;
      void runBackend(org, `evidence_${clusterId}`, () =>
        decideCluster(org, clusterId, "request_missing_evidence"),
      );
      return;
    }
    const targetOrgId = activeOrgId;
    updateOrgState(targetOrgId, (prev) => {
      const cluster = prev.clusters.find((c) => c.clusterId === clusterId);
      if (!cluster) return prev;

      const evEvt: TraceEvent = {
        eventId: `evt_${targetOrgId}_evidence_req_${Date.now()}`,
        timestamp: formatUtcNow(),
        actor: "Relay",
        stageLabel: "Needs evidence",
        tone: "needs-evidence",
        headline: `Sent missing-evidence request for ${cluster.shortTitle} to ${
          cluster.missingEvidenceAssignee ?? "Legal / Compliance"
        }`,
        toolName: "relay_request_missing_evidence",
        inputEvidence: `${cluster.clusterId} (${cluster.reportCount} reports)`,
        toolOutput: `${
          cluster.missingEvidenceDetail ??
          "Requested 1 redacted sample schedule."
        } Other weekly clusters continue unblocked.`,
        durationMs: 340,
        decisionSummary:
          "Isolated missing-evidence cluster into recoverable request loop without blocking the weekly run.",
      };

      const nextClusters = prev.clusters.map((c) =>
        c.clusterId === clusterId
          ? { ...c, actionState: "evidence_requested" as const }
          : c,
      );
      const allDecided = nextClusters.every(
        (c) => c.actionState !== "pending_triage",
      );

      return {
        ...prev,
        clusters: nextClusters,
        weeklyRunStatus: allDecided
          ? "Complete"
          : prev.weeklyRunStatus,
        events: [...prev.events, evEvt],
        selectedEventId: evEvt.eventId,
      };
    });
  }

  // Work Triage Action 3b: Defer cluster to next weekly run
  function handleDeferCluster(clusterId: string) {
    if (backendConnected) {
      const org = activeOrgId;
      void runBackend(org, `defer_${clusterId}`, () =>
        decideCluster(org, clusterId, "defer_next_run"),
      );
      return;
    }
    const targetOrgId = activeOrgId;
    updateOrgState(targetOrgId, (prev) => ({
      ...prev,
      clusters: prev.clusters.map((c) =>
        c.clusterId === clusterId
          ? { ...c, actionState: "deferred_next_run" as const }
          : c,
      ),
    }));
  }

  // Inspect a specific employee report in the contextual right drawer
  // Intake: build the outgoing payload from the canonical fixture report for the authorized employee
  function handlePrepareIntakePayload() {
    const org = activeOrgId;
    const source = INTAKE_SOURCE[org];
    const report =
      fixtures[org].reports.find((r) => r.reportId === source.reportId) ??
      fixtures[org].reports.find((r) => r.employeeId === source.employeeId);
    if (!report) return;
    setIntakeDrafts((prev) => ({
      ...prev,
      [org]: buildIntakePayload(org, report),
    }));
  }

  function handleSubmitIntakePayload() {
    const org = activeOrgId;
    const payload = intakeDrafts[org];
    if (!payload || !backendConnected) return;
    void runBackend(
      org,
      "intake",
      async () => {
        const receipt = await submitReviewedWorkReport(org, payload);
        const workspace = await getWorkspace(org);
        return { data: receipt.data, workspace };
      },
      async (receipt) => {
        setIntakeReceipts((prev) => ({ ...prev, [org]: receipt }));
        setIntakeDrafts((prev) => ({ ...prev, [org]: null }));
        await refreshFixture(org);
      },
    );
  }

  function handleInspectReport(reportId: string) {
    updateOrgState(activeOrgId, (prev) => ({
      ...prev,
      selectedReportId: reportId,
    }));
    setInspectorTab("report");
    setInspectorOpen(true);
  }

  // Quote text: explicit per-org override, else the state variant for the worker's current tone.
  // Paused or failed workers show their short status label instead of a completion claim.
  function resolveWorkerMessage(
    role: WorkerRole,
    status: { tone: SystemStatusTone; label: string },
  ): string {
    const override = workerQuoteMessages[activeOrgId]?.[role];
    if (override) return override;
    const variants = workerStatusMessages[role];
    switch (status.tone) {
      case "queued":
      case "accepted":
        return variants?.queued ?? status.label;
      case "running":
      case "building":
        return variants?.working ?? status.label;
      case "completed":
      case "verified":
      case "deployed":
        return variants?.completed ?? status.label;
      default:
        return status.label;
    }
  }

  // Left navigation keyboard roving handler
  function handleNavKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      const nextIndex = (index + 1) % NAV_SECTIONS.length;
      const nextSection = NAV_SECTIONS[nextIndex];
      setActiveNav(nextSection);
      navButtonRefs.current[nextIndex]?.focus();
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      const prevIndex =
        (index - 1 + NAV_SECTIONS.length) %
        NAV_SECTIONS.length;
      const prevSection = NAV_SECTIONS[prevIndex];
      setActiveNav(prevSection);
      navButtonRefs.current[prevIndex]?.focus();
    }
  }

  // Count how many Work clusters still need operator triage
  const pendingWorkCount = useMemo(
    () =>
      activeOrgState.clusters.filter(
        (c) =>
          c.actionState === "pending_triage" ||
          c.actionState === "evidence_requested",
      ).length,
    [activeOrgState.clusters],
  );

  // Determine exact System screen state copy from UX handoff table
  const systemStateCopy = useMemo(() => {
    const stage = activeOrgState.buildStage;
    const appName = heroDisplayName;
    switch (stage) {
      case "idle":
        return {
          tone: "queued" as SystemStatusTone,
          badgeLabel: "Idle",
          chamberPill: "Idle",
          headline: "No sandbox build selected",
          detail:
            "Select a grouped task in Ingest or replay the weekly run to inspect a sandbox build.",
        };
      case "loading":
        return {
          tone: "running" as SystemStatusTone,
          badgeLabel: "Loading",
          chamberPill: "Loading",
          headline: "Loading sandbox workspace",
          detail:
            "Fetching checkpoint state and sample evidence for the selected run.",
        };
      case "queued":
        return {
          tone: "queued" as SystemStatusTone,
          badgeLabel: "Queued",
          chamberPill: "Queued",
          headline: `Queued ${appName} for sandbox build`,
          detail:
            "Spec and sample evidence locked. Start sandbox build to verify schema and assemble UI.",
        };
      case "stage1":
        return {
          tone: "building" as SystemStatusTone,
          badgeLabel: "Running · Stage 1 of 3",
          chamberPill: "Building",
          headline: `Building ${appName} in sandbox`,
          detail:
            "Stage 1/3 (Schema check): Verifying data contract and sample headers before UI assembly.",
        };
      case "stage2":
        return {
          tone: "building" as SystemStatusTone,
          badgeLabel: "Running · Stage 2 of 3",
          chamberPill: "Building",
          headline: `Building ${appName} in sandbox`,
          detail:
            "Preview obscured while Builder assembles components against sample data. Checkpoints stay verifiable.",
        };
      case "stage3":
        return {
          tone: "building" as SystemStatusTone,
          badgeLabel: "Running · Stage 3 of 3",
          chamberPill: "Building",
          headline: `Building ${appName} in sandbox`,
          detail:
            "Stage 3/3 (Verification): Running 3 automated checks on read-only sample data.",
        };
      case "paused":
        return {
          tone: "paused" as SystemStatusTone,
          badgeLabel: "Paused at checkpoint",
          chamberPill: `Paused at Checkpoint ${activeOrgState.lastActiveCheckpoint}`,
          headline: `Sandbox build paused at Stage ${activeOrgState.lastActiveCheckpoint} (UI assembly)`,
          detail:
            "Checkpoint 1 (Schema check) is saved. Resuming continues from Stage 2 without repeating completed checks.",
        };
      case "failed":
        return {
          tone: "failed" as SystemStatusTone,
          badgeLabel: "Check failed",
          chamberPill: "Check failed",
          headline: activeFixture.heroFailedHeadline,
          detail: activeFixture.heroFailedDetail,
        };
      case "ready":
      default:
        return {
          tone:
            activeOrgState.appReleaseStatus === "released"
              ? ("deployed" as SystemStatusTone)
              : ("completed" as SystemStatusTone),
          badgeLabel:
            activeOrgState.appReleaseStatus === "released"
              ? backendConnected
                ? copy.backend.approvedInDemo
                : "Released to organization"
              : "Ready for review",
          chamberPill:
            activeOrgState.appReleaseStatus === "released"
              ? "Released"
              : "Ready for review",
          headline: "Sandbox checks passed · Artifact ready for review",
          detail:
            "3 of 3 verification checks passed on read-only sample data. 0 production writes executed.",
        };
    }
  }, [
    activeOrgState.buildStage,
    activeOrgState.lastActiveCheckpoint,
    activeOrgState.appReleaseStatus,
    activeFixture,
    heroDisplayName,
  ]);

  const isVeiled = activeOrgState.buildStage !== "ready";

  // Filtered Activity events
  // Filtered Apps catalog
  const visibleCatalogApps = useMemo(() => {
    return activeOrgState.catalogApps.filter((app) => {
      if (appsFilter === "released") {
        return (
          app.releaseStatus === "catalog_approved" ||
          app.releaseStatus === "released"
        );
      }
      if (appsFilter === "sandbox") {
        return (
          app.releaseStatus === "in_sandbox_review" ||
          app.releaseStatus === "changes_requested" ||
          app.releaseStatus === "scope_approval_needed"
        );
      }
      return true;
    });
  }, [activeOrgState.catalogApps, appsFilter]);

  // Entry screen (/login or ?login=1): demo identity only, no password validation
  if (showEntryScreen) {
    return (
      <div
        className="hr-shell hr-app-root hr-entry-shell"
        data-hr-surface="ash"
        data-hr-reduced-motion={reducedMotion ? "true" : "false"}
      >
        <TopographicCanvas />
        <main className="hr-entry-stage" aria-labelledby="hr-entry-heading">
          <form className="hr-entry-card" onSubmit={handleEnterWorkspace}>
            <div className="hr-entry-card__brand">
              <h1 id="hr-entry-heading" className="hr-entry-card__title">
                <HeavyRainWordmark
                  height={28}
                  title="Heavy Rain"
                  className="hr-brand__wordmark-svg"
                />
              </h1>
              <Status tone="queued" label={copy.entry.demoBadge} />
            </div>

            <Field
              label={copy.entry.operatorLabel}
              htmlFor="hr-entry-operator-select"
            >
              <select
                id="hr-entry-operator-select"
                className="hr-select"
                value={activeOperator.operatorId}
                onChange={(e) => handleSelectOperator(e.target.value)}
              >
                {SYSTEM_OPERATOR_ACCOUNTS.map((op) => (
                  <option key={op.operatorId} value={op.operatorId}>
                    {op.name} — {op.title}
                  </option>
                ))}
              </select>
            </Field>
            <p className="hr-entry-card__hint">{copy.entry.operatorHint}</p>

            <div className="hr-entry-card__identity-summary hr-tabular">
              <div>
                <span>{copy.entry.scopeLabel}</span>
                <strong>{activeOperator.scopeLabel}</strong>
              </div>
            </div>

            <div className="hr-entry-card__actions">
              <Button type="submit" variant="primary">
                {copy.entry.enterAction}
              </Button>
            </div>

            <footer className="hr-entry-card__footer">
              <span className="hr-entry-card__footer-label">
                {copy.entry.switchLabel}
              </span>
              <nav
                aria-label={copy.account.linksEyebrow}
                className="hr-entry-card__links"
              >
                <a href="http://127.0.0.1:43170/login" aria-current="page">
                  {copy.entry.links.heavyRain}
                </a>
                <a href="http://127.0.0.1:43173/login">
                  {copy.entry.links.rookmere}
                </a>
                <a href="http://127.0.0.1:43171/login">
                  {copy.entry.links.augi}
                </a>
              </nav>
            </footer>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div
      className="hr-shell hr-app-root"
      data-hr-surface="ash"
      data-hr-reduced-motion={reducedMotion ? "true" : "false"}
    >
      {/* Top Context Bar (03-system-c.png + 02-wordmark.png anchor) */}
      <header className="hr-topbar">
        <div className="hr-topbar__left">
          <div className="hr-brand">
            <HeavyRainWordmark
              height={24}
              className="hr-brand__wordmark-svg"
            />
          </div>

          {/* Organization scope select; changes the operator's view, not the signed-in operator */}
          <div className="hr-scope-select">
            <label htmlFor="hr-scope-select" className="hr-scope-select__label">
              {copy.scope.label}
            </label>
            <select
              id="hr-scope-select"
              className="hr-select hr-scope-select__control"
              value={activeOrgId}
              onChange={(e) =>
                handleSelectOrganization(e.target.value as OrganizationId)
              }
            >
              <option value="rookmere">{copy.scope.rookmere}</option>
              <option value="augi">{copy.scope.augi}</option>
            </select>
          </div>
        </div>

        <div className="hr-topbar__right">{playbackControls}</div>
      </header>

      {/* Main Topographic Stage (03-system-c.png layout) */}
      <div className="hr-stage-canvas">
        <TopographicCanvas />

        <div className="hr-stage-layout">
          {/* Tactile Left Vertical Navigation Rail */}
          <aside className="hr-left-rail">
            <nav aria-label="Primary navigation" className="hr-tactile-nav">
              <ul className="hr-tactile-nav__list">
                {NAV_SECTIONS.map((section, idx) => {
                  const isActive = activeNav === section;
                  return (
                    <li key={section}>
                      <button
                        ref={(el) => {
                          navButtonRefs.current[idx] = el;
                        }}
                        type="button"
                        className={`hr-tactile-nav__item${
                          isActive ? " hr-tactile-nav__item--active" : ""
                        }`}
                        aria-current={isActive ? "page" : undefined}
                        onClick={() => setActiveNav(section)}
                        onKeyDown={(e) => handleNavKeyDown(e, idx)}
                      >
                        <span className="hr-tactile-nav__label">
                          {NAV_LABELS[section]}
                        </span>
                        {section === "Work" && pendingWorkCount > 0 && (
                          <span
                            className="hr-tactile-nav__badge hr-tabular"
                            aria-label={`${pendingWorkCount} task groups need review`}
                          >
                            {pendingWorkCount}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>

              {/* 2x10 Dot-Matrix Ornament from 03-system-c.png & Reference 09 */}
              <div
                className="hr-tactile-nav__dots"
                aria-hidden="true"
              >
                {Array.from({ length: 20 }).map((_, idx) => (
                  <span key={idx} />
                ))}
              </div>
            </nav>
          </aside>

          {/* Dominant Center Workbench Stage */}
          <main className="hr-center-stage" id="main-workspace">
            <div
              className="hr-backend-notice hr-tabular"
              role="status"
              aria-live="polite"
            >
              {backendErrors[activeOrgId] ? (
                <Status tone="failed" label={backendErrors[activeOrgId] ?? ""} />
              ) : activeBackendBusy ? (
                <Status tone="running" label={activeBackendBusy} />
              ) : null}
            </div>
            {/* ============================================================
                DESTINATION 1: SYSTEM (03-system-c.png 3-Band Artifact Workbench)
                ============================================================ */}
            {activeNav === "System" && (
              <div className="hr-workbench-c">
                {/* BAND 1: Slim Top Workbench Header / Control Bar (03-system-c.png) */}
                <header className="hr-workbench-c__header">
                  <div className="hr-workbench-c__title-group">
                    <span className="hr-workbench-c__eyebrow">
                      {activeFixture.heroOrchestratorEyebrow}
                    </span>
                    <span
                      className="hr-workbench-c__divider"
                      aria-hidden="true"
                    />
                    <h1 className="hr-workbench-c__title">
                      {heroDisplayName}
                    </h1>
                  </div>

                  <div className="hr-workbench-c__controls">
                    <Status
                      tone={systemStateCopy.tone}
                      label={systemStateCopy.chamberPill}
                    />
                    {activeOrgState.buildStage === "ready" &&
                      (activeOrgState.appReleaseStatus !== "released" ? (
                        <Button
                          variant="primary"
                          disabled={manualLocked}
                          onClick={handleApproveForRelease}
                        >
                          Approve for release
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          onClick={() => handleOpenStandaloneOrgApp(activeOrgId)}
                        >
                          {copy.account.openOrgApp}
                        </Button>
                      ))}
                  </div>
                </header>

                {/* BAND 2: Framed Dark Build Glass / Artifact Chamber (03-system-c.png) */}
                <section
                  className={`hr-workbench-c__chamber hr-workbench-c__chamber--${activeOrgState.buildStage}`}
                  aria-label={`${heroDisplayName} artifact chamber`}
                >
                  {/* Always-sharp inline failure recovery banner when in failed state */}
                  {activeOrgState.buildStage === "failed" && (
                    <div
                      className="hr-chamber-failure-banner"
                      role="alert"
                    >
                      <div>
                        <strong>{activeFixture.heroFailedHeadline}</strong>
                        <p>{activeFixture.heroFailedDetail}</p>
                      </div>
                      <div className="hr-chamber-failure-banner__actions">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleRetryFromCheckpoint}
                        >
                          Retry from checkpoint
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setInspectorTab("decision");
                            setInspectorOpen(true);
                          }}
                        >
                          Request changes
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Inner Artifact Viewport: blurs ONLY when isVeiled is true */}
                  <div className="hr-chamber-stage">
                    <div
                      className={`hr-chamber-stage__artifact hr-chamber-stage__artifact--${activeOrgState.buildStage}`}
                      aria-busy={isVeiled}
                      inert={isVeiled}
                    >
                      {activeOrgId === "rookmere" ? (
                        <RookmereEmbeddedFrame
                          companies={activeFixture.rookmereCompanies ?? []}
                          externalUrl={
                            activeFixture.externalAppUrl ||
                            ORGANIZATION_FIXTURES[activeOrgId].externalAppUrl
                          }
                          mode="embedded"
                          reducedMotion={reducedMotion}
                          isObscured={isVeiled}
                        />
                      ) : (
                        <AugiEmbeddedFrame
                          configs={activeFixture.augiConfigs ?? []}
                          externalUrl={
                            activeFixture.externalAppUrl ||
                            ORGANIZATION_FIXTURES[activeOrgId].externalAppUrl
                          }
                          inlineDisclosure={
                            activeFixture.augiInlineDisclosure ?? ""
                          }
                          mode="embedded"
                          reducedMotion={reducedMotion}
                          isObscured={isVeiled}
                        />
                      )}
                    </div>

                    {/* Architectural build wireframe & localized smoky mist ONLY while veiled */}
                    {isVeiled && (
                      <>
                        <ChamberWireframe
                          orgId={activeOrgId}
                          buildStage={activeOrgState.buildStage}
                        />
                        <div
                          className={`hr-chamber-smoke-veil hr-chamber-smoke-veil--${activeOrgState.buildStage}`}
                          aria-hidden="true"
                        />
                      </>
                    )}

                    {/* Live readout: what the active worker is doing, sharp and centered above the veil */}
                    {isVeiled && (
                      <ChamberLiveReadout
                        entries={activeFixture.workers.map((worker) => {
                          const st = getWorkerStatus(worker.role);
                          return {
                            role: worker.role,
                            stepNumber: worker.stepNumber,
                            tone: st.tone,
                            label: st.label,
                            isActive: st.isActiveCell,
                            message: resolveWorkerMessage(worker.role, st),
                          };
                        })}
                        reducedMotion={reducedMotion}
                      />
                    )}
                  </div>
                </section>

                {/* BAND 3: Docked Horizontal Four-Worker Pipeline Bar BELOW the Chamber (03-system-c.png) */}
                <div
                  className="hr-workbench-c__worker-dock"
                  role="group"
                  aria-label="Four-stage worker pipeline"
                >
                  {activeFixture.workers.map((worker) => {
                    const st = getWorkerStatus(worker.role);
                    const isWorking =
                      st.tone === "running" || st.tone === "building";

                    return (
                      <div
                        key={worker.id}
                        className={`hr-worker-cell${
                          st.isActiveCell ? " hr-worker-cell--active" : ""
                        }${isWorking ? " hr-worker-cell--running" : ""}`}
                        aria-current={st.isActiveCell ? "step" : undefined}
                      >
                        <span className="hr-worker-cell__left">
                          <span className="hr-worker-cell__num hr-tabular">
                            {worker.stepNumber}
                          </span>
                          <span className="hr-worker-cell__name">
                            {worker.role}
                          </span>
                        </span>
                        <span className="hr-worker-cell__right">
                          <span
                            className={`hr-worker-cell__dot hr-worker-cell__dot--${st.tone}`}
                            aria-hidden="true"
                          />
                          <span className="hr-worker-cell__status hr-tabular">
                            {st.label}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ============================================================
                DESTINATION 2: WORK (Weekly Recurrence Grouping & Triage)
                ============================================================ */}
            {activeNav === "Work" && (
              <div className="hr-work-view">
                <header className="hr-section-header">
                  <div>
                    <h1 className="hr-section-header__title">Ingest</h1>
                    <p className="hr-ingest-intro">
                      <strong>{experienceCopy.ingestIntro.title}.</strong>{" "}
                      {experienceCopy.ingestIntro.body}
                    </p>
                  </div>
                  <div className="hr-section-header__actions">
                    <Status
                      tone="queued"
                      label={experienceCopy.ingestIntro.demoLabel}
                    />
                  </div>
                </header>

                {/* Optional recoverable attachment error state from UX handoff matrix */}
                {activeOrgState.intakeErrorSimulated && (
                  <Panel
                    variant="elevated"
                    eyebrow="Intake error · Recoverable attachment check"
                    title="Report attachment check failed on 1 submission"
                    actions={<Status tone="failed" label="Intake error" />}
                  >
                    <p className="hr-work-cluster__summary">
                      Attachment <code>LP_tracker_macro.xlsm</code> uses macros
                      outside organization policy. Ask the sender for a plain{" "}
                      <code>.xlsx</code> or <code>.csv</code> export.
                    </p>
                    <div className="hr-work-cluster__actions">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() =>
                          updateOrgState(activeOrgId, (prev) => ({
                            ...prev,
                            intakeErrorSimulated: false,
                          }))
                        }
                      >
                        Request supported file format
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          updateOrgState(activeOrgId, (prev) => ({
                            ...prev,
                            intakeErrorSimulated: false,
                          }))
                        }
                      >
                        Keep report text only
                      </Button>
                    </div>
                  </Panel>
                )}

                <WorkEditorialCards
                  clusters={activeOrgState.clusters}
                  selectedClusterId={activeOrgState.selectedClusterId}
                  orgId={activeOrgId}
                  displayCopy={
                    workCopy.cards as Record<string, WorkEditorialCardCopy>
                  }
                  labels={workCopy.labels}
                  reports={activeFixture.reports}
                  onOpenBuild={(clusterId) => {
                    updateOrgState(activeOrgId, (prev) => ({
                      ...prev,
                      selectedClusterId: clusterId,
                    }));
                    setActiveNav("System");
                  }}
                  onViewApp={handleRouteClusterToApp}
                  onRequestEvidence={handleRequestMissingEvidence}
                  onSelect={(clusterId) =>
                    updateOrgState(activeOrgId, (prev) => ({
                      ...prev,
                      selectedClusterId: clusterId,
                    }))
                  }
                />

                {backendConnected && (
                  <details className="hr-work-reports">
                    <summary className="hr-work-reports__summary">
                      {copy.backend.submitSample}
                    </summary>
                      <Panel
                        variant="elevated"
                        title={copy.backend.submitSample}
                        actions={
                          intakeReceipts[activeOrgId] ? (
                            <Status
                              tone="completed"
                              label={intakeReceipts[activeOrgId]?.status ?? ""}
                            />
                          ) : undefined
                        }
                      >
                        <div className="hr-work-cluster__actions">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={manualLocked}
                            onClick={handlePrepareIntakePayload}
                          >
                            {copy.backend.outgoingPayload}
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={
                              !intakeDrafts[activeOrgId] || manualLocked
                            }
                            onClick={handleSubmitIntakePayload}
                          >
                            {copy.backend.submitSample}
                          </Button>
                        </div>
                        {intakeDrafts[activeOrgId] && (
                          <pre className="hr-backend-payload hr-tabular">
                            {JSON.stringify(intakeDrafts[activeOrgId], null, 2)}
                          </pre>
                        )}
                        {intakeReceipts[activeOrgId] && (
                          <pre className="hr-backend-payload hr-tabular">
                            {JSON.stringify(
                              {
                                reportId: intakeReceipts[activeOrgId]?.reportId,
                                receiptId: intakeReceipts[activeOrgId]?.receiptId,
                                batchId: intakeReceipts[activeOrgId]?.batchId,
                                status: intakeReceipts[activeOrgId]?.status,
                                idempotentReplay:
                                  intakeReceipts[activeOrgId]?.idempotentReplay,
                                receiptNotice:
                                  intakeReceipts[activeOrgId]?.receiptNotice,
                              },
                              null,
                              2,
                            )}
                          </pre>
                        )}
                      </Panel>
                  </details>
                )}

                <details className="hr-work-reports">
                  <summary className="hr-work-reports__summary">
                    {workCopy.labels.reports} ({activeFixture.reports.length})
                  </summary>
                  <div className="hr-report-row-list">
                    {activeFixture.reports.map((rep) => (
                      <div key={rep.reportId} className="hr-report-row">
                        <div className="hr-report-row__main">
                          <span className="hr-report-row__receipt hr-tabular">
                            {rep.receiptId}
                          </span>
                          <strong>{rep.employeeName}</strong>
                          <span className="hr-report-row__role">
                            {rep.employeeTitle} · {rep.assistantSurface}
                          </span>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleInspectReport(rep.reportId)}
                        >
                          {workCopy.labels.inspectReport}
                        </Button>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}

            {/* ============================================================
                DESTINATION 3: APPS (Organization Catalog & Release State)
                ============================================================ */}
            {activeNav === "Apps" && (
              <div className="hr-apps-view">
                <header className="hr-section-header">
                  <div>
                    <h1 className="hr-section-header__title">
                      {workCopy.labels.apps}
                    </h1>
                  </div>
                  <div className="hr-section-header__actions">
                    <div
                      className="hr-filter-pills"
                      role="group"
                      aria-label="Filter catalog applications"
                    >
                      {(
                        [
                          { id: "all", label: "All apps" },
                          { id: "released", label: "Released & approved" },
                          { id: "sandbox", label: "In sandbox review" },
                        ] as const
                      ).map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          className={`hr-worker-pill${
                            appsFilter === f.id
                              ? " hr-worker-pill--active"
                              : ""
                          }`}
                          onClick={() => setAppsFilter(f.id)}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </header>

                {visibleCatalogApps.length === 0 ? (
                  <Panel
                    eyebrow="No apps"
                    title="No released applications in this view"
                  >
                    <div className="hr-work-cluster__actions">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setAppsFilter("all")}
                      >
                        Clear filter
                      </Button>
                    </div>
                  </Panel>
                ) : (
                  <ul className="hr-catalog-rows">
                    {visibleCatalogApps.map((app) => {
                      const isSelected =
                        activeOrgState.selectedAppId === app.appId;
                      const isReleased =
                        app.releaseStatus === "catalog_approved" ||
                        app.releaseStatus === "released";
                      const display = CATALOG_DISPLAY[app.appId];
                      const displayName = display?.name ?? app.name;
                      const purpose = display?.purpose ?? app.summary;
                      // Only the implemented hero app for this organization opens a live build.
                      const opensHeroApp = app.isHeroCandidate === true;
                      // Other implemented local apps route by explicit app ID, never a blanket org URL.
                      const explicitAppUrl = CATALOG_APP_URLS[app.appId];
                      const opensLiveApp = opensHeroApp || Boolean(explicitAppUrl);
                      const openLiveApp = () => {
                        if (explicitAppUrl) {
                          if (typeof window !== "undefined") {
                            window.open(explicitAppUrl, "_blank", "noopener,noreferrer");
                          }
                          return;
                        }
                        handleOpenStandaloneOrgApp(activeOrgId);
                      };
                      const selectApp = () =>
                        updateOrgState(activeOrgId, (prev) => ({
                          ...prev,
                          selectedAppId: app.appId,
                        }));
                      return (
                        <li
                          key={app.appId}
                          className={`hr-catalog-row${
                            isSelected ? " hr-catalog-row--selected" : ""
                          }`}
                          data-app-id={app.appId}
                          aria-current={isSelected ? "true" : undefined}
                        >
                          <div className="hr-catalog-row__hero">
                            <CatalogAppHero
                              appId={app.appId}
                              orgId={activeOrgId}
                            />
                          </div>
                          <div className="hr-catalog-row__body">
                            <div className="hr-catalog-row__top">
                              <h2 className="hr-catalog-row__name">
                                {displayName}
                              </h2>
                              <Status
                                tone={
                                  isReleased
                                    ? backendConnected
                                      ? "completed"
                                      : "deployed"
                                    : app.releaseStatus === "changes_requested"
                                    ? "paused"
                                    : "building"
                                }
                                label={
                                  isReleased
                                    ? backendConnected
                                      ? copy.backend.approvedInDemo
                                      : `Released · v${app.version}`
                                    : `Sandbox · v${app.version}`
                                }
                              />
                            </div>
                            <p className="hr-catalog-row__purpose">
                              {purpose}
                            </p>

                            {opensLiveApp && (
                              <div className="hr-catalog-row__actions">
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => {
                                    selectApp();
                                    openLiveApp();
                                  }}
                                >
                                  {copy.account.openOrgApp}
                                </Button>
                              </div>
                            )}

                            <details
                              className="hr-apps-details"
                              onToggle={(e) => {
                                if (e.currentTarget.open) selectApp();
                              }}
                            >
                              <summary
                                className={`hr-apps-details__summary${
                                  opensLiveApp
                                    ? ""
                                    : " hr-apps-details__summary--primary"
                                }`}
                              >
                                {workCopy.labels.details}
                              </summary>
                              <div className="hr-apps-details__body">
                                {opensHeroApp &&
                                  activeOrgState.approvedRelease &&
                                  activeOrgState.buildStage !== "ready" && (
                                    <p className="hr-inspector-copy">
                                      v{activeOrgState.approvedRelease.version}{" "}
                                      stays available while candidate v
                                      {activeOrgState.candidateVersion} runs in
                                      sandbox.
                                    </p>
                                  )}
                                <p className="hr-inspector-copy">
                                  {app.ownerName} · {app.ownerTitle}
                                </p>
                                <p className="hr-inspector-copy">
                                  {app.permittedRoles.join(" · ")}
                                </p>
                                <p className="hr-inspector-copy">
                                  {app.dataScopes.join(", ")}
                                </p>
                                <p className="hr-inspector-copy hr-tabular">
                                  {backendConnected
                                    ? app.releaseStatus === "released"
                                      ? `${copy.backend.approvedInDemo} · ${copy.backend.notDeployed} · ${copy.backend.noNotifications}`
                                      : copy.backend.noNotifications
                                    : app.notifiedEmployeeCount > 0
                                    ? `Notifier sent release link to ${app.notifiedEmployeeCount} reporting employees`
                                    : "Awaiting release approval in Build before sending links"}
                                </p>
                                <ul>
                                  {app.capabilities.map((c, i) => (
                                    <li key={i}>{c}</li>
                                  ))}
                                </ul>
                                <ul>
                                  {app.nonCapabilities.map((nc, i) => (
                                    <li key={i}>{nc}</li>
                                  ))}
                                </ul>
                                {activeOrgId === "augi" &&
                                  opensHeroApp &&
                                  activeFixture.externalAppUrl && (
                                    <a
                                      href={activeFixture.externalAppUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="hr-button hr-button--secondary hr-button--sm"
                                    >
                                      {copy.account.openOrgApp}
                                    </a>
                                  )}
                                {app.feedbackEntries.length > 0 && (
                                  <ul className="hr-checkpoint-list">
                                    {app.feedbackEntries.map((fb) => (
                                      <li
                                        key={fb.id}
                                        className="hr-checkpoint-item"
                                      >
                                        <div className="hr-checkpoint-item__top">
                                          <strong>
                                            {fb.employeeName} ({fb.role})
                                          </strong>
                                          <span className="hr-tabular">
                                            {fb.submittedAt}
                                          </span>
                                        </div>
                                        <p className="hr-checkpoint-item__detail">
                                          {fb.comment}
                                        </p>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    selectApp();
                                    setInspectorTab("decision");
                                    setInspectorOpen(true);
                                  }}
                                >
                                  Report issue or suggest change
                                </Button>
                              </div>
                            </details>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

          </main>

          {/* Contextual Right Inspector Drawer (opens on demand without permanently shrinking center) */}
          <InspectorDrawer
            isOpen={inspectorOpen}
            activeTab={inspectorTab}
            onSelectTab={setInspectorTab}
            onClose={() => setInspectorOpen(false)}
            fixture={activeFixture}
            orgState={activeOrgState}
            getWorkerStatus={(role) => {
              const st = getWorkerStatus(role);
              return { tone: st.tone, label: st.label };
            }}
            onSelectWorker={(role) =>
              updateOrgState(activeOrgId, (prev) => ({
                ...prev,
                selectedWorker: role,
              }))
            }
            onSelectReport={(reportId) =>
              updateOrgState(activeOrgId, (prev) => ({
                ...prev,
                selectedReportId: reportId,
              }))
            }
            onApproveRelease={handleApproveForRelease}
            onRequestChanges={handleRequestChanges}
            onRevealReady={handleRevealReadyArtifact}
            onOpenOrgApp={() => handleOpenStandaloneOrgApp(activeOrgId)}
          />
        </div>
      </div>
    </div>
  );
};
