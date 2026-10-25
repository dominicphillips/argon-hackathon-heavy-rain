import { useState, type FC } from "react";
import liveCopy from "../copy/live.json";
import {
  Button,
  Field,
  Panel,
  Status,
  WORKER_ROLES,
  type SystemStatusTone,
  type WorkerRole,
} from "@heavy-rain/system-ui";
import type {
  InspectorTabId,
  OrganizationFixture,
  OrganizationWorkspaceState,
} from "../types";

export interface InspectorDrawerProps {
  isOpen: boolean;
  activeTab: InspectorTabId;
  onSelectTab: (tab: InspectorTabId) => void;
  onClose: () => void;
  fixture: OrganizationFixture;
  orgState: OrganizationWorkspaceState;
  getWorkerStatus: (role: WorkerRole) => {
    tone: SystemStatusTone;
    label: string;
  };
  onSelectWorker: (role: WorkerRole) => void;
  onSelectReport: (reportId: string) => void;
  onApproveRelease: () => void;
  onRequestChanges: (note: string) => void;
  onRevealReady: () => void;
  onOpenOrgApp: () => void;
  onNavigateActivity?: (workerFilter?: WorkerRole) => void;
}

export const InspectorDrawer: FC<InspectorDrawerProps> = ({
  isOpen,
  activeTab,
  onSelectTab,
  onClose,
  fixture,
  orgState,
  getWorkerStatus,
  onSelectWorker,
  onSelectReport,
  onApproveRelease,
  onRequestChanges,
  onRevealReady,
  onOpenOrgApp,
  onNavigateActivity,
}) => {
  const [changeNote, setChangeNote] = useState<string>(
    orgState.orgId === "rookmere"
      ? "Add GBP-to-EUR fallback conversion column for Brenthal Packaging and highlight covenant headroom under 0.20x."
      : "Clamp wheelbase input at 3160 mm Gate C2 upper limit and highlight SABLE-B vs SABLE-C torsion delta.",
  );

  if (!isOpen) {
    return null;
  }

  const activeWorkerSummary =
    fixture.workers.find((w) => w.id === orgState.selectedWorker) ??
    fixture.workers[2];
  const activeWorkerStatus = getWorkerStatus(orgState.selectedWorker);

  const selectedReport =
    fixture.reports.find((r) => r.reportId === orgState.selectedReportId) ??
    fixture.reports[0];

  const workerEvents = orgState.events.filter(
    (evt) => evt.actor === orgState.selectedWorker,
  );

  function handleRequestChangesSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = changeNote.trim();
    if (!trimmed) return;
    onRequestChanges(trimmed);
  }

  return (
    <aside
      className="hr-inspector-drawer"
      aria-label="Contextual system inspector"
    >
      <div className="hr-inspector-drawer__header">
        <div>
          <p className="hr-inspector-drawer__eyebrow">
            {fixture.shortLabel} · Inspector
          </p>
          <h2 className="hr-inspector-drawer__title">
            {activeTab === "decision"
              ? "Release & Checkpoints"
              : activeTab === "worker"
              ? `Worker · ${orgState.selectedWorker}`
              : "Outgoing Report Manifest"}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label="Close inspector drawer"
        >
          Close [Esc]
        </Button>
      </div>

      {/* Reference 09 pill tab selector */}
      <div
        className="hr-inspector-drawer__tabs"
        role="tablist"
        aria-label="Inspector sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "decision"}
          className={`hr-inspector-tab${
            activeTab === "decision" ? " hr-inspector-tab--active" : ""
          }`}
          onClick={() => onSelectTab("decision")}
        >
          Decision & Release
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "worker"}
          className={`hr-inspector-tab${
            activeTab === "worker" ? " hr-inspector-tab--active" : ""
          }`}
          onClick={() => onSelectTab("worker")}
        >
          Worker Detail
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "report"}
          className={`hr-inspector-tab${
            activeTab === "report" ? " hr-inspector-tab--active" : ""
          }`}
          onClick={() => onSelectTab("report")}
        >
          Report & Manifest
        </button>
      </div>

      <div className="hr-inspector-drawer__body">
        {activeTab === "decision" && (
          <div className="hr-inspector-stack">
            <Panel
              eyebrow={`Cairn · ${fixture.weeklyBatchId}`}
              title={fixture.heroFullName}
            >
              <p className="hr-inspector-copy">{fixture.heroDecisionSummary}</p>
              <div className="hr-inspector-kv-list">
                <div className="hr-inspector-kv">
                  <span>Candidate version</span>
                  <strong className="hr-tabular">
                    v{orgState.candidateVersion}
                  </strong>
                </div>
                <div className="hr-inspector-kv">
                  <span>App release status</span>
                  <Status
                    tone={
                      orgState.appReleaseStatus === "released"
                        ? "deployed"
                        : orgState.appReleaseStatus === "changes_requested"
                        ? "paused"
                        : "running"
                    }
                    label={
                      orgState.appReleaseStatus === "released"
                        ? "Released to organization"
                        : orgState.appReleaseStatus === "changes_requested"
                        ? "Changes requested · Rebuilding"
                        : "In sandbox review"
                    }
                  />
                </div>
              </div>
            </Panel>

            {orgState.approvedRelease && (
              <Panel
                variant="elevated"
                eyebrow="Preserved Live Organization Release"
                title={`Active release v${orgState.approvedRelease.version}`}
              >
                <p className="hr-inspector-copy">
                  {orgState.approvedRelease.notes}
                </p>
                <div className="hr-inspector-kv-list">
                  <div className="hr-inspector-kv">
                    <span>Approved at</span>
                    <strong className="hr-tabular">
                      {orgState.approvedRelease.releasedAt}
                    </strong>
                  </div>
                  <div className="hr-inspector-kv">
                    <span>Notifier delivery</span>
                    <strong className="hr-tabular">
                      {orgState.approvedRelease.notifiedCount} employees
                      notified
                    </strong>
                  </div>
                </div>
              </Panel>
            )}

            <Panel eyebrow="Sandbox Verification" title="Checkpoints (1–3)">
              <ul className="hr-checkpoint-list">
                {fixture.checkpoints.map((cp) => {
                  const isPassed =
                    orgState.buildStage === "ready" ||
                    (orgState.buildStage === "stage2" && cp.step === 1) ||
                    (orgState.buildStage === "stage3" && cp.step <= 2) ||
                    (orgState.buildStage === "paused" &&
                      cp.step < orgState.lastActiveCheckpoint) ||
                    (orgState.buildStage === "failed" && cp.step < 3);

                  const isCurrent =
                    (orgState.buildStage === "stage1" && cp.step === 1) ||
                    (orgState.buildStage === "stage2" && cp.step === 2) ||
                    (orgState.buildStage === "stage3" && cp.step === 3) ||
                    ((orgState.buildStage === "paused" ||
                      orgState.buildStage === "failed") &&
                      cp.step === orgState.lastActiveCheckpoint);

                  const tone: SystemStatusTone =
                    orgState.buildStage === "failed" && cp.step === 3
                      ? "failed"
                      : isPassed
                      ? "completed"
                      : isCurrent && orgState.buildStage === "paused"
                      ? "paused"
                      : isCurrent
                      ? "building"
                      : "queued";

                  const statusText =
                    orgState.buildStage === "failed" && cp.step === 3
                      ? "Check failed"
                      : isPassed
                      ? "Verified"
                      : isCurrent && orgState.buildStage === "paused"
                      ? "Paused"
                      : isCurrent
                      ? "Running"
                      : "Queued";

                  return (
                    <li key={cp.step} className="hr-checkpoint-item">
                      <div className="hr-checkpoint-item__top">
                        <strong>{cp.shortLabel}</strong>
                        <Status tone={tone} label={statusText} />
                      </div>
                      <p className="hr-checkpoint-item__detail">{cp.detail}</p>
                      {isPassed && (
                        <p className="hr-checkpoint-item__output">
                          {cp.toolVerificationOutput}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Panel>

            <Panel eyebrow="Operator Release Decision" title="Review actions">
              <div className="hr-inspector-actions">
                {orgState.buildStage !== "ready" ? (
                  <Button variant="primary" onClick={onRevealReady}>
                    Reveal ready artifact
                  </Button>
                ) : (
                  <Button variant="primary" onClick={onApproveRelease}>
                    Approve for release
                  </Button>
                )}
                <Button variant="secondary" onClick={onOpenOrgApp}>
                  Open organization app
                </Button>
              </div>

              <form
                className="hr-inspector-change-form"
                onSubmit={handleRequestChangesSubmit}
              >
                <Field
                  label="Request changes (returns candidate to Stage 2 UI assembly)"
                  htmlFor="hr-change-note-input"
                >
                  <textarea
                    id="hr-change-note-input"
                    className="hr-field__input hr-inspector-textarea"
                    rows={3}
                    value={changeNote}
                    onChange={(e) => setChangeNote(e.target.value)}
                  />
                </Field>
                <Button type="submit" variant="secondary" size="sm">
                  Request changes
                </Button>
              </form>

              {orgState.changeRequestNotes.length > 0 && (
                <div className="hr-inspector-notes">
                  <p className="hr-inspector-notes__label">
                    Recorded operator change requests:
                  </p>
                  <ul>
                    {orgState.changeRequestNotes.map((note, idx) => (
                      <li key={idx}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>
          </div>
        )}

        {activeTab === "worker" && (
          <div className="hr-inspector-stack">
            <div
              className="hr-worker-pill-group"
              role="group"
              aria-label="Select worker role"
            >
              {WORKER_ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  className={`hr-worker-pill${
                    orgState.selectedWorker === role
                      ? " hr-worker-pill--active"
                      : ""
                  }`}
                  onClick={() => onSelectWorker(role)}
                >
                  {role}
                </button>
              ))}
            </div>

            {activeWorkerSummary && (
              <Panel
                eyebrow={`Step ${activeWorkerSummary.stepNumber} of 4 · ${activeWorkerSummary.runtimeLabel}`}
                title={
                  (liveCopy.workers as Record<string, string>)[activeWorkerSummary.role] ??
                  activeWorkerSummary.role
                }
                actions={
                  <Status
                    tone={activeWorkerStatus.tone}
                    label={activeWorkerStatus.label}
                  />
                }
              >
                <p className="hr-inspector-copy">
                  <strong>{activeWorkerSummary.headline}</strong>
                </p>
                <div className="hr-inspector-kv-list">
                  <div className="hr-inspector-kv">
                    <span>Assigned scope</span>
                    <strong>{activeWorkerSummary.assignedScope}</strong>
                  </div>
                  <div className="hr-inspector-kv">
                    <span>Latest tool call</span>
                    <code className="hr-inspector-code">
                      {activeWorkerSummary.latestToolCall}
                    </code>
                  </div>
                </div>
                <div className="hr-inspector-code-block">
                  <span className="hr-inspector-code-block__label">
                    Tool output
                  </span>
                  <p>{activeWorkerSummary.latestToolOutput}</p>
                </div>
                <div className="hr-inspector-code-block">
                  <span className="hr-inspector-code-block__label">
                    Decision summary
                  </span>
                  <p>{activeWorkerSummary.decisionSummary}</p>
                </div>
                {onNavigateActivity && (
                  <div className="hr-inspector-actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        onNavigateActivity(activeWorkerSummary.role)
                      }
                    >
                      Inspect worker activity in trace
                    </Button>
                  </div>
                )}
              </Panel>
            )}

            <Panel
              eyebrow="Observable Worker Events"
              title={`Recorded ${orgState.selectedWorker} events (${workerEvents.length})`}
            >
              {workerEvents.length === 0 ? (
                <p className="hr-inspector-copy">
                  No events emitted yet for {orgState.selectedWorker} at this
                  checkpoint. Advance or complete the build to record downstream
                  events.
                </p>
              ) : (
                <ul className="hr-checkpoint-list">
                  {workerEvents.map((evt) => (
                    <li key={evt.eventId} className="hr-checkpoint-item">
                      <div className="hr-checkpoint-item__top">
                        <span className="hr-tabular">{evt.timestamp}</span>
                        <Status tone={evt.tone} label={evt.stageLabel} />
                      </div>
                      <p className="hr-checkpoint-item__detail">
                        <strong>{evt.headline}</strong>
                      </p>
                      <p className="hr-checkpoint-item__output">
                        {evt.toolOutput}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        )}

        {activeTab === "report" && (
          <div className="hr-inspector-stack">
            <Field label="Submitted employee report" htmlFor="hr-report-select">
              <select
                id="hr-report-select"
                className="hr-field__select"
                value={selectedReport?.reportId ?? ""}
                onChange={(e) => onSelectReport(e.target.value)}
              >
                {fixture.reports.map((rep) => (
                  <option key={rep.reportId} value={rep.reportId}>
                    {rep.employeeName} ({rep.receiptId} · {rep.assistantSurface}
                    )
                  </option>
                ))}
              </select>
            </Field>

            {selectedReport && (
              <>
                <Panel
                  eyebrow={`${selectedReport.receiptId} · ${selectedReport.submittedAt}`}
                  title={selectedReport.employeeName}
                  actions={
                    <Status
                      tone="verified"
                      label="Outgoing payload inspected"
                    />
                  }
                >
                  <p className="hr-inspector-subtitle">
                    {selectedReport.employeeTitle} · {selectedReport.office} ·{" "}
                    {selectedReport.assistantSurface}
                  </p>
                  <p className="hr-inspector-copy">
                    {selectedReport.taskSummary}
                  </p>

                  <div className="hr-inspector-kv-list">
                    <div className="hr-inspector-kv">
                      <span>Policy scope</span>
                      <strong>{selectedReport.policyScopeLabel}</strong>
                    </div>
                    <div className="hr-inspector-kv">
                      <span>Privacy boundary</span>
                      <strong>
                        Host chat history excluded (MCP outgoing sheet only)
                      </strong>
                    </div>
                  </div>

                  {selectedReport.missingEvidenceNote && (
                    <div className="hr-inspector-callout hr-inspector-callout--amber">
                      <strong>Missing evidence:</strong>{" "}
                      {selectedReport.missingEvidenceNote}
                    </div>
                  )}
                </Panel>

                <Panel
                  eyebrow="Approved Attachment Manifest"
                  title={`Included sample files (${selectedReport.attachments.length})`}
                >
                  {selectedReport.attachments.length === 0 ? (
                    <p className="hr-inspector-copy">
                      No sample file attached. Sender withheld restricted file
                      pending General Counsel / NDA schema sign-off.
                    </p>
                  ) : (
                    <ul className="hr-checkpoint-list">
                      {selectedReport.attachments.map((att) => (
                        <li
                          key={att.filename}
                          className="hr-checkpoint-item"
                        >
                          <div className="hr-checkpoint-item__top">
                            <code className="hr-inspector-code">
                              {att.filename}
                            </code>
                            <Status
                              tone={
                                att.policyStatus === "approved"
                                  ? "completed"
                                  : "failed"
                              }
                              label={
                                att.policyStatus === "approved"
                                  ? `${(att.bytes / 1024).toFixed(1)} KB`
                                  : "Blocked (.xlsm)"
                              }
                            />
                          </div>
                          <p className="hr-checkpoint-item__detail">
                            {att.kind}
                          </p>
                          <p className="hr-checkpoint-item__output">
                            SHA-256: {att.sha256}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>

                <Panel
                  eyebrow="MCP Tool Boundary (heavyrain_submit_work_report)"
                  title="Approved outgoing JSON manifest"
                >
                  <pre className="hr-inspector-json">
                    {JSON.stringify(
                      selectedReport.outgoingPayloadPreview,
                      null,
                      2,
                    )}
                  </pre>
                </Panel>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
