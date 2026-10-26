"""Pydantic models aligned with apps/system/src/types.ts and __grounding/backend-api-contract.md."""

from __future__ import annotations

from typing import Annotated, Any, Literal
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

OrganizationId = Literal["rookmere", "augi", "meridian"]

BuildStageId = Literal[
    "idle",
    "loading",
    "queued",
    "stage1",
    "stage2",
    "stage3",
    "paused",
    "failed",
    "ready",
]

CheckpointNumber = Literal[1, 2, 3]

ClusterDisposition = Literal[
    "build_in_sandbox",
    "reuse_existing_app",
    "request_missing_evidence",
    "queued_next_cycle",
]

ClusterActionState = Literal[
    "pending_triage",
    "building_in_sandbox",
    "routed_to_app",
    "evidence_requested",
    "evidence_received",
    "deferred_next_run",
    "intake_error",
]

AppReleaseStatus = Literal[
    "catalog_approved",
    "in_sandbox_review",
    "scope_approval_needed",
    "released",
    "changes_requested",
    "release_check_failed",
]

WorkerRole = Literal["Builder", "Connector", "Researcher", "Notifier"]

SystemStatusTone = Literal[
    "accepted",
    "queued",
    "running",
    "building",
    "completed",
    "verified",
    "deployed",
    "paused",
    "needs-evidence",
    "failed",
]

WeeklyRunStatusLabel = Literal[
    "Idle",
    "Grouping reports",
    "Awaiting operator decision",
    "Complete",
]

BuilderInteractionStatus = Literal[
    "queued",
    "in_progress",
    "requires_action",
    "completed",
    "incomplete",
    "failed",
    "cancelled",
]

CanonicalReleaseState = Literal[
    "sandbox_preview",
    "pending_release_review",
    "deployed_approved",
    "approved_demo",
]

NotificationDeliveryState = Literal[
    "queued",
    "sent",
    "held_for_release",
    "suppressed_in_demo",
]

DataFreshnessMode = Literal[
    "demo_fixture_replay",
    "cached_snapshot",
    "live_runtime",
]


def normalize_org_id(raw_org_id: str) -> OrganizationId:
    """Normalizes 'org_rookmere'/'rookmere' -> 'rookmere' and 'org_augi'/'augi' -> 'augi'."""
    cleaned = raw_org_id.strip().lower()
    if cleaned in {"rookmere", "org_rookmere"}:
        return "rookmere"
    if cleaned in {"augi", "org_augi"}:
        return "augi"
    if cleaned in {"meridian", "org_meridian"}:
        return "meridian"
    raise ValueError(f"Unsupported organization identifier: '{raw_org_id}'.")


class EvidenceAttachment(BaseModel):
    filename: str
    kind: str
    bytes: int = Field(ge=0)
    sha256: str
    policyStatus: Literal["approved", "blocked_macro"] = "approved"


class EmployeeReport(BaseModel):
    reportId: str
    receiptId: str
    submittedAt: str
    employeeId: str
    employeeName: str
    employeeTitle: str
    departmentLabel: str
    office: str
    assistantSurface: str
    mcpToolName: str = "heavyrain_submit_work_report"
    userInspectedOutgoingPayload: bool
    hostChatHistoryExcluded: bool
    clusterId: str
    dataScope: str
    policyScopeLabel: str
    taskSummary: str
    outgoingPayloadPreview: dict[str, Any]
    attachments: list[EvidenceAttachment] = Field(default_factory=list)
    missingEvidenceNote: str | None = None


class RecurrenceCluster(BaseModel):
    clusterId: str
    title: str
    shortTitle: str
    disposition: ClusterDisposition
    actionState: ClusterActionState
    reportCount: int
    distinctEmployeeCount: int
    departmentsLabel: str
    assistantSurfaces: list[str]
    problemSummary: str
    policyScope: str
    matchedAppId: str | None = None
    matchedAppName: str | None = None
    matchedAppVersion: str | None = None
    gapExplanation: str
    recommendedAction: str
    missingEvidenceDetail: str | None = None
    missingEvidenceAssignee: str | None = None
    reportIds: list[str] = Field(default_factory=list)


class SandboxCheckpoint(BaseModel):
    step: CheckpointNumber
    shortLabel: str
    title: str
    detail: str
    toolVerificationOutput: str
    durationMs: int


class WorkerSummary(BaseModel):
    id: WorkerRole
    stepNumber: Literal[1, 2, 3, 4]
    role: WorkerRole
    headline: str
    runtimeLabel: str
    assignedScope: str
    latestToolCall: str
    latestToolOutput: str
    decisionSummary: str
    completedAt: str | None = None


class TraceEvent(BaseModel):
    eventId: str
    timestamp: str
    actor: Literal["Cairn", "Relay", "Builder", "Connector", "Researcher", "Notifier"]
    stageLabel: str
    tone: SystemStatusTone
    headline: str
    toolName: str
    inputEvidence: str
    toolOutput: str
    durationMs: int
    decisionSummary: str
    checkpointStep: CheckpointNumber | None = None


class FeedbackEntry(BaseModel):
    id: str
    employeeName: str
    role: str
    submittedAt: str
    comment: str
    routedToWork: bool


class CatalogAppItem(BaseModel):
    appId: str
    name: str
    shortName: str
    slug: str
    url: str
    version: str
    releaseStatus: AppReleaseStatus
    ownerName: str
    ownerTitle: str
    permittedRoles: list[str]
    dataScopes: list[str]
    summary: str
    capabilities: list[str]
    nonCapabilities: list[str]
    notifiedEmployeeCount: int
    lastReleasedAt: str | None = None
    isHeroCandidate: bool | None = None
    feedbackEntries: list[FeedbackEntry] = Field(default_factory=list)


class ApprovedReleaseSnapshot(BaseModel):
    version: str
    releasedAt: str
    approvedBy: str
    notifiedCount: int
    notes: str


class PortfolioCompanyRow(BaseModel):
    companyId: str
    detailLevel: Literal["full", "summary"]
    name: str
    fundId: Literal["fund_rm_iii", "fund_rm_iv"]
    fundShortCode: Literal["RIG-III", "RIG-IV"]
    headquarters: str
    subsector: str
    localCurrency: Literal["EUR", "SEK", "NOK", "GBP"]
    fxRateBudget: float
    fxRateActual: float
    erpSystem: str
    submissionFormat: str
    dealLead: str
    operatingLead: str
    financeReviewer: str
    latestPeriod: str
    revenueActualEur: float
    revenueBudgetEur: float
    ebitdaActualEur: float
    ebitdaBudgetEur: float
    fxTranslationImpactEur: float
    volumeMixImpactEur: float
    costScrapImpactEur: float
    netDebtEur: float
    ltmEbitdaEur: float
    netLeverageRatio: float
    covenantMaxLeverage: float
    primaryVarianceDriver: str


class AugiConfigSummary(BaseModel):
    configId: str
    code: str
    name: str
    architectureSummary: str
    wheelbaseMm: float
    frontTrackMm: float
    rearTrackMm: float
    wallGaugeMm: float
    materialLabel: str
    partCount: int
    structuralMassKg: float
    cogZMm: float
    torsionalStiffnessKnmDeg: float
    twistAt18KnmDeg: float
    bendingStiffnessKnMm: float
    midspanSagMm: float
    firstModeHz: float
    strengths: list[str]
    weaknesses: list[str]


class OrganizationFixture(BaseModel):
    orgId: OrganizationId
    name: str
    shortLabel: str
    legalEntity: str
    sector: str
    headquarters: list[str]
    totalStaffCount: int
    namedRosterCount: int
    weeklyBatchId: str
    weeklyCutoffLabel: str
    capturedThroughLabel: str
    totalReportsIngested: int
    heroTitle: str
    heroFullName: str
    heroOrchestratorEyebrow: str
    heroDecisionSummary: str
    heroFailedHeadline: str
    heroFailedDetail: str
    externalAppUrl: str | None = None
    checkpoints: list[SandboxCheckpoint]
    workers: list[WorkerSummary]
    clusters: list[RecurrenceCluster]
    reports: list[EmployeeReport]
    catalogApps: list[CatalogAppItem]
    initialEvents: list[TraceEvent]
    rookmereCompanies: list[PortfolioCompanyRow] | None = None
    augiConfigs: list[AugiConfigSummary] | None = None
    augiInlineDisclosure: str | None = None


class OrthogonalStatuses(BaseModel):
    """Explicit 6-dimensional orthogonal status representation."""

    orgId: OrganizationId
    weeklyBatchId: str
    weeklySchedule: Literal["active", "paused"]
    weeklyScheduleActive: bool
    batchRunStatus: Literal[
        "collecting",
        "cutoff_locked",
        "grouping_reports",
        "awaiting_operator_decision",
        "complete",
    ]
    weeklyRunStatus: WeeklyRunStatusLabel
    builderInteractionStatus: BuilderInteractionStatus
    buildStage: BuildStageId
    lastActiveCheckpoint: CheckpointNumber
    appReleaseState: CanonicalReleaseState
    appReleaseStatus: AppReleaseStatus
    notificationState: NotificationDeliveryState
    dataFreshness: DataFreshnessMode
    capturedThroughLabel: str


class OrganizationWorkspaceState(BaseModel):
    orgId: OrganizationId
    weeklyScheduleActive: bool
    weeklyRunStatus: WeeklyRunStatusLabel
    buildStage: BuildStageId
    lastActiveCheckpoint: CheckpointNumber
    candidateVersion: str
    appReleaseStatus: AppReleaseStatus
    approvedRelease: ApprovedReleaseSnapshot | None = None
    changeRequestNotes: list[str] = Field(default_factory=list)
    selectedWorker: WorkerRole
    selectedReportId: str
    selectedClusterId: str
    selectedAppId: str
    selectedEventId: str
    clusters: list[RecurrenceCluster]
    catalogApps: list[CatalogAppItem]
    events: list[TraceEvent]
    isReplaying: bool = False
    intakeErrorSimulated: bool = False
    scopeApprovalSimulated: bool = False
    orthogonalStatuses: OrthogonalStatuses | None = None


class SessionProvenance(BaseModel):
    session_id: str
    captured_at: str
    client_version: str = "mcp-2026-07-28"
    org_timezone: str = "UTC"


class RedactionManifest(BaseModel):
    client_redaction_applied: bool
    excluded_fields: list[str] = Field(default_factory=list)
    policy_version: str = "2026.10"


class IncomingAttachmentPayload(BaseModel):
    filename: str
    kind: str
    bytes: int = Field(ge=1, le=10_485_760)
    sha256: str


class McpSubmitWorkReportRequest(BaseModel):
    idempotency_key: str = Field(min_length=6, max_length=128)
    org_id: str
    employee_id: str
    role_id: str
    assistant_surface: str
    mcp_tool_name: str = "heavyrain_submit_work_report"
    session_provenance: SessionProvenance
    user_inspected_outgoing_payload: bool
    host_chat_history_excluded: bool
    redaction_manifest: RedactionManifest
    data_scope: str
    pattern_hint: str | None = None
    task_summary: str = Field(min_length=5, max_length=4000)
    outgoing_payload_preview: dict[str, Any] = Field(default_factory=dict)
    attachments: list[IncomingAttachmentPayload] = Field(default_factory=list)
    missing_evidence_note: str | None = None


class McpSubmissionReceiptResponse(BaseModel):
    reportId: str
    receiptId: str
    orgId: OrganizationId
    batchId: str
    idempotentReplay: bool = False
    status: Literal["queued_for_cutoff"] = "queued_for_cutoff"
    receiptNotice: str = (
        "Intake receipt only: report queued for Sunday 18:00 UTC weekly cutoff. "
        "Does not indicate completed app build or production release."
    )
    revocationWindowHours: int = 72
    report: EmployeeReport


class ScheduleUpdateRequest(BaseModel):
    active: bool


class ClusterDecisionActionRequest(BaseModel):
    action: Literal[
        "route_to_existing_app",
        "request_missing_evidence",
        "start_sandbox_build",
        "defer_next_run",
        "receive_missing_evidence",
    ]
    actor_id: str | None = None
    notes: str | None = None


class StartSandboxBuildRequest(BaseModel):
    cluster_id: str
    authorized_by_employee_id: str
    live_opt_in: bool = False
    max_total_tokens: str = "262144"
    agent_config_override: dict[str, Any] | None = None


class BuildControlRequest(BaseModel):
    action: Literal[
        "pause",
        "resume",
        "cancel",
        "retry_from_checkpoint",
        "reveal_ready",
        "advance_checkpoint",
        "simulate_failure",
    ]
    reason: str | None = None


class ReleaseReviewRequest(BaseModel):
    decision: Literal["approve_for_release", "request_changes", "require_scope_approval"]
    reviewer_employee_id: str
    notes: str = ""


class ArtifactManifestEntry(BaseModel):
    path: str
    bytes: int
    sha256: str


class VerificationReport(BaseModel):
    runId: str
    orgId: OrganizationId
    interactionId: str
    environmentId: str
    exportMethod: Literal["local_fixture_archive", "environments.files.download", "v1beta/environments/{env_id}/files?alt=media"]
    archiveSafetyCheck: dict[str, Any]
    artifactManifest: list[ArtifactManifestEntry]
    verificationChecks: dict[str, bool]
    summaryOutput: str
    passed: bool


class CairnReviewRequest(BaseModel):
    idempotency_key: str = Field(min_length=8, max_length=128)


LiveBuildPhase = Literal["received", "reading", "building", "checking", "ready", "failed"]
LiveBuildMode = Literal["flash", "argon"]
TrimmedString = Annotated[str, StringConstraints(strip_whitespace=True)]


class LiveBuildInput(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)


class LiveBuildRequester(LiveBuildInput):
    persona_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    role: str


class LiveBuildWorkflow(LiveBuildInput):
    title: str
    summary: str
    tools: list[TrimmedString] = Field(default_factory=list)
    weekly_hours_saved: float | None = Field(default=None, allow_inf_nan=False)


class LiveBuildApp(LiveBuildInput):
    name: str = Field(min_length=2, max_length=80)
    purpose: str
    features: list[TrimmedString] = Field(min_length=1, max_length=8)
    assumptions: list[TrimmedString] = Field(default_factory=list)


class LiveBuildRequest(LiveBuildInput):
    idempotency_key: str = Field(min_length=6, max_length=128)
    requested_by: LiveBuildRequester
    workflow: LiveBuildWorkflow
    app: LiveBuildApp
    build_mode: LiveBuildMode | None = None


class LiveBuildAccepted(BaseModel):
    runId: str
    orgId: OrganizationId
    status: Literal["accepted"] = "accepted"
    interactionId: str | None
    environmentId: str | None
    model: str
    createdAt: str


class LiveBuildRequestedBy(BaseModel):
    personaId: str
    name: str
    role: str


class LiveBuildWorkflowSnapshot(BaseModel):
    title: str
    summary: str
    tools: list[str]
    weeklyHoursSaved: float | None


class LiveBuildUsage(BaseModel):
    totalTokens: int = 0
    totalThoughtTokens: int = 0
    totalOutputTokens: int = 0


class LiveBuildFileProgress(BaseModel):
    step: int
    of: int
    doing: str
    done: list[str] = Field(default_factory=list)
    next: list[str] = Field(default_factory=list)
    updatedAt: str


class LiveBuildLiveSnapshot(BaseModel):
    indexUrl: str
    updatedAt: str
    version: int


class LiveBuildRun(BaseModel):
    runId: str
    orgId: OrganizationId
    status: BuilderInteractionStatus
    phase: LiveBuildPhase
    model: str
    interactionId: str | None = None
    environmentId: str | None = None
    requestedBy: LiveBuildRequestedBy
    workflow: LiveBuildWorkflowSnapshot
    app: LiveBuildApp
    startedAt: str
    updatedAt: str
    completedAt: str | None = None
    errorReason: str | None = None
    usage: LiveBuildUsage = Field(default_factory=LiveBuildUsage)
    filesWritten: list[str] = Field(default_factory=list)
    progress: LiveBuildFileProgress | None = None
    snapshot: LiveBuildLiveSnapshot | None = None


class LiveBuildProgressEvent(BaseModel):
    seq: int
    at: str
    kind: Literal["status", "thought", "tool_call", "tool_result", "file", "message", "error"]
    title: str = Field(max_length=80)
    detail: str | None = Field(default=None, max_length=600)
    path: str | None = None
    raw: str | None = None


class LiveBuildCard(BaseModel):
    model_config = ConfigDict(extra="ignore", strict=True)
    name: str
    tagline: str = Field(max_length=90)
    highlights: list[Annotated[str, StringConstraints(max_length=70)]] = Field(min_length=3, max_length=3)
    screens: list[str]


class LiveBuildArtifact(BaseModel):
    indexUrl: str
    previewUrl: str | None = None
    notes: str | None = None
    card: LiveBuildCard | None = None
    fileCount: int
    bytes: int


class LiveBuildSnapshot(BaseModel):
    run: LiveBuildRun | None
    progress: list[LiveBuildProgressEvent]
    artifact: LiveBuildArtifact | None


class LiveBuildListEntry(BaseModel):
    run: LiveBuildRun
    artifact: LiveBuildArtifact | None


class LiveBuildList(BaseModel):
    runs: list[LiveBuildListEntry]
