import type { SystemNavSection, SystemStatusTone, WorkerRole } from "@heavy-rain/system-ui";

export type OrganizationId = "rookmere" | "augi";

export type BuildStageId =
  | "idle"
  | "loading"
  | "queued"
  | "stage1"
  | "stage2"
  | "stage3"
  | "paused"
  | "failed"
  | "ready";

export type CheckpointNumber = 1 | 2 | 3;

export type ClusterDisposition =
  | "build_in_sandbox"
  | "reuse_existing_app"
  | "request_missing_evidence"
  | "queued_next_cycle";

export type ClusterActionState =
  | "pending_triage"
  | "building_in_sandbox"
  | "routed_to_app"
  | "evidence_requested"
  | "evidence_received"
  | "deferred_next_run"
  | "intake_error";

export type AppReleaseStatus =
  | "catalog_approved"
  | "in_sandbox_review"
  | "scope_approval_needed"
  | "released"
  | "changes_requested"
  | "release_check_failed";

export interface EvidenceAttachment {
  filename: string;
  kind: string;
  bytes: number;
  sha256: string;
  policyStatus: "approved" | "blocked_macro";
}

export interface EmployeeReport {
  reportId: string;
  receiptId: string;
  submittedAt: string;
  employeeId: string;
  employeeName: string;
  employeeTitle: string;
  departmentLabel: string;
  office: string;
  assistantSurface: string;
  mcpToolName: string;
  userInspectedOutgoingPayload: boolean;
  hostChatHistoryExcluded: boolean;
  clusterId: string;
  dataScope: string;
  policyScopeLabel: string;
  taskSummary: string;
  outgoingPayloadPreview: Record<string, unknown>;
  attachments: EvidenceAttachment[];
  missingEvidenceNote?: string;
}

export interface RecurrenceCluster {
  clusterId: string;
  title: string;
  shortTitle: string;
  disposition: ClusterDisposition;
  actionState: ClusterActionState;
  reportCount: number;
  distinctEmployeeCount: number;
  departmentsLabel: string;
  assistantSurfaces: string[];
  problemSummary: string;
  policyScope: string;
  matchedAppId?: string;
  matchedAppName?: string;
  matchedAppVersion?: string;
  gapExplanation: string;
  recommendedAction: string;
  missingEvidenceDetail?: string;
  missingEvidenceAssignee?: string;
  reportIds: string[];
}

export interface SandboxCheckpoint {
  step: CheckpointNumber;
  shortLabel: string;
  title: string;
  detail: string;
  toolVerificationOutput: string;
  durationMs: number;
}

export interface WorkerSummary {
  id: WorkerRole;
  stepNumber: 1 | 2 | 3 | 4;
  role: WorkerRole;
  headline: string;
  runtimeLabel: string;
  assignedScope: string;
  latestToolCall: string;
  latestToolOutput: string;
  decisionSummary: string;
  completedAt?: string;
}

export interface TraceEvent {
  eventId: string;
  timestamp: string;
  actor: "Cairn" | "Relay" | WorkerRole;
  stageLabel: string;
  tone: SystemStatusTone;
  headline: string;
  toolName: string;
  inputEvidence: string;
  toolOutput: string;
  durationMs: number;
  decisionSummary: string;
  checkpointStep?: CheckpointNumber;
}

export interface CatalogAppItem {
  appId: string;
  name: string;
  shortName: string;
  slug: string;
  url: string;
  version: string;
  releaseStatus: AppReleaseStatus;
  ownerName: string;
  ownerTitle: string;
  permittedRoles: string[];
  dataScopes: string[];
  summary: string;
  capabilities: string[];
  nonCapabilities: string[];
  notifiedEmployeeCount: number;
  lastReleasedAt?: string;
  isHeroCandidate?: boolean;
  feedbackEntries: {
    id: string;
    employeeName: string;
    role: string;
    submittedAt: string;
    comment: string;
    routedToWork: boolean;
  }[];
}

export interface ApprovedReleaseSnapshot {
  version: string;
  releasedAt: string;
  approvedBy: string;
  notifiedCount: number;
  notes: string;
}

export interface PortfolioCompanyRow {
  companyId: string;
  detailLevel: "full" | "summary";
  name: string;
  fundId: "fund_rm_iii" | "fund_rm_iv";
  fundShortCode: "RIG-III" | "RIG-IV";
  headquarters: string;
  subsector: string;
  localCurrency: "EUR" | "SEK" | "NOK" | "GBP";
  fxRateBudget: number;
  fxRateActual: number;
  erpSystem: string;
  submissionFormat: string;
  dealLead: string;
  operatingLead: string;
  financeReviewer: string;
  latestPeriod: string;
  revenueActualEur: number;
  revenueBudgetEur: number;
  ebitdaActualEur: number;
  ebitdaBudgetEur: number;
  fxTranslationImpactEur: number;
  volumeMixImpactEur: number;
  costScrapImpactEur: number;
  netDebtEur: number;
  ltmEbitdaEur: number;
  netLeverageRatio: number;
  covenantMaxLeverage: number;
  primaryVarianceDriver: string;
}

export interface AugiConfigSummary {
  configId: string;
  code: string;
  name: string;
  architectureSummary: string;
  wheelbaseMm: number;
  frontTrackMm: number;
  rearTrackMm: number;
  wallGaugeMm: number;
  materialLabel: string;
  partCount: number;
  structuralMassKg: number;
  cogZMm: number;
  torsionalStiffnessKnmDeg: number;
  twistAt18KnmDeg: number;
  bendingStiffnessKnMm: number;
  midspanSagMm: number;
  firstModeHz: number;
  strengths: string[];
  weaknesses: string[];
}

export interface OrganizationFixture {
  orgId: OrganizationId;
  name: string;
  shortLabel: string;
  legalEntity: string;
  sector: string;
  headquarters: string[];
  totalStaffCount: number;
  namedRosterCount: number;
  weeklyBatchId: string;
  weeklyCutoffLabel: string;
  capturedThroughLabel: string;
  totalReportsIngested: number;
  heroTitle: string;
  heroFullName: string;
  heroOrchestratorEyebrow: string;
  heroDecisionSummary: string;
  heroFailedHeadline: string;
  heroFailedDetail: string;
  externalAppUrl?: string;
  checkpoints: SandboxCheckpoint[];
  workers: WorkerSummary[];
  clusters: RecurrenceCluster[];
  reports: EmployeeReport[];
  catalogApps: CatalogAppItem[];
  initialEvents: TraceEvent[];
  rookmereCompanies?: PortfolioCompanyRow[];
  augiConfigs?: AugiConfigSummary[];
  augiInlineDisclosure?: string;
}

export type InspectorTabId = "decision" | "worker" | "report";

export interface SystemOperatorAccount {
  operatorId: string;
  name: string;
  title: string;
  scopeLabel: string;
}

export interface OrganizationWorkspaceState {
  orgId: OrganizationId;
  weeklyScheduleActive: boolean;
  weeklyRunStatus: "Idle" | "Grouping reports" | "Awaiting operator decision" | "Complete";
  buildStage: BuildStageId;
  lastActiveCheckpoint: CheckpointNumber;
  candidateVersion: string;
  appReleaseStatus: AppReleaseStatus;
  approvedRelease: ApprovedReleaseSnapshot | null;
  changeRequestNotes: string[];
  selectedWorker: WorkerRole;
  selectedReportId: string;
  selectedClusterId: string;
  selectedAppId: string;
  selectedEventId: string;
  clusters: RecurrenceCluster[];
  catalogApps: CatalogAppItem[];
  events: TraceEvent[];
  isReplaying: boolean;
  intakeErrorSimulated: boolean;
  scopeApprovalSimulated: boolean;
}

export type NavigationDestination = SystemNavSection;
