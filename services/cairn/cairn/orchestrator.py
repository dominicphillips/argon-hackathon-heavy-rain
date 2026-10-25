"""Cairn multi-worker handoff orchestration with bounded concurrency, checkpoints, and retry rules."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal
from pydantic import BaseModel, Field

from cairn.clustering import ClusterDecisionRecord, evaluate_weekly_batch
from cairn.config import (
    CairnCoordinatorConfig,
    CairnRateLimitGovernor,
    UnchangedRetryBlockedError,
)

WorkerRole = Literal["Researcher", "Connector", "Builder", "Notifier"]
CheckpointNumber = Literal[1, 2, 3]


class EvidenceReference(BaseModel):
    """Untrusted input evidence reference passed in a worker handoff contract."""

    report_id: str
    receipt_id: str
    filename: str
    sha256: str
    bytes: int
    data_scope: str
    untrusted_data_only: bool = True


class WorkerHandoffContract(BaseModel):
    """Typed handoff contract from Cairn to a bounded functional worker."""

    handoff_id: str
    org_id: Literal["rookmere", "augi"]
    batch_id: str
    cluster_id: str
    from_actor: Literal["Cairn", "Relay"] = "Cairn"
    to_worker: WorkerRole
    step_number: Literal[1, 2, 3, 4]
    idempotency_key: str
    headline: str
    runtime_label: str
    assigned_scope: str
    input_evidence_refs: list[EvidenceReference] = Field(default_factory=list)
    token_budget_cap: int = Field(default=65_536, ge=1024, le=1_048_576)
    allow_external_side_effects: bool = False
    checkpoint_step: CheckpointNumber | None = None


class WorkerHandoffResult(BaseModel):
    """Observable result from a functional worker execution without raw chain-of-thought."""

    handoff_id: str
    worker: WorkerRole
    step_number: Literal[1, 2, 3, 4]
    status: Literal["completed", "paused", "failed", "cancelled", "queued"]
    tool_name: str
    tool_output: str
    decision_summary: str
    tokens_used: int = 0
    duration_ms: int = 0
    completed_at: str | None = None
    checkpoint_step: CheckpointNumber | None = None


@dataclass
class OrchestrationRunState:
    """Tracks checkpoint progression, pause/cancel state, and idempotency for a Cairn run."""

    org_id: Literal["rookmere", "augi"]
    batch_id: str
    status: Literal["idle", "running", "paused", "completed", "failed", "cancelled"] = "idle"
    last_verified_checkpoint: int = 0
    tokens_consumed: int = 0
    token_ceiling: int = 262_144
    completed_handoffs: dict[str, WorkerHandoffResult] = field(default_factory=dict)
    uncertain_external_actions: set[str] = field(default_factory=set)
    pause_reason: str | None = None
    failure_reason: str | None = None


class CairnOrchestrator:
    """Coordinates Researcher, Connector, Builder, and Notifier handoffs under hard budgets."""

    def __init__(
        self,
        config: CairnCoordinatorConfig | None = None,
        rate_governor: CairnRateLimitGovernor | None = None,
    ) -> None:
        self.config = config or CairnCoordinatorConfig()
        self.rate_governor = rate_governor or CairnRateLimitGovernor()
        self._semaphore = asyncio.Semaphore(self.config.max_concurrent_workers)
        self._runs: dict[str, OrchestrationRunState] = {}

    def get_or_create_run(
        self, org_id: Literal["rookmere", "augi"], batch_id: str
    ) -> OrchestrationRunState:
        key = f"{org_id}:{batch_id}"
        if key not in self._runs:
            self._runs[key] = OrchestrationRunState(
                org_id=org_id,
                batch_id=batch_id,
                token_ceiling=self.config.max_total_tokens,
            )
        return self._runs[key]

    def evaluate_batch(
        self,
        *,
        org_id: Literal["rookmere", "augi"],
        batch_id: str,
        clusters: list[dict[str, Any]],
        catalog_apps: list[dict[str, Any]],
        reports: list[dict[str, Any]],
    ) -> list[ClusterDecisionRecord]:
        """Runs reuse-first clustering evaluation and records the run state."""
        run = self.get_or_create_run(org_id, batch_id)
        run.status = "running"
        decisions = evaluate_weekly_batch(
            org_id=org_id,
            batch_id=batch_id,
            clusters=clusters,
            catalog_apps=catalog_apps,
            reports=reports,
        )
        run.status = "completed"
        return decisions

    async def dispatch_handoff(
        self,
        contract: WorkerHandoffContract,
        *,
        simulate_tokens: int = 4096,
        uncertain_external_outcome: bool = False,
        simulate_error: str | None = None,
        simulate_status_code: int | None = None,
    ) -> WorkerHandoffResult:
        """Executes a typed worker handoff with bounded concurrency, token caps, and idempotent retry protection."""
        run = self.get_or_create_run(contract.org_id, contract.batch_id)

        # 1. Never blindly re-send uncertain external actions (e.g. Notifier or remote Builder creation)
        if contract.idempotency_key in run.uncertain_external_actions:
            raise UnchangedRetryBlockedError(
                f"Action '{contract.idempotency_key}' for worker '{contract.to_worker}' has an uncertain external "
                "delivery state; refusing blind re-send until reconciliation completes."
            )

        # 2. Return cached result on idempotent replay
        if contract.idempotency_key in run.completed_handoffs:
            return run.completed_handoffs[contract.idempotency_key]

        # 3. Check unchanged failing retry rule
        payload_dict = contract.model_dump()
        self.rate_governor.assert_not_unchanged_failing_retry(contract.handoff_id, payload_dict)

        # 4. Enforce pause/cancel state
        if run.status == "paused":
            return WorkerHandoffResult(
                handoff_id=contract.handoff_id,
                worker=contract.to_worker,
                step_number=contract.step_number,
                status="paused",
                tool_name=f"{contract.to_worker.lower()}_paused",
                tool_output=f"Execution paused at Checkpoint {run.last_verified_checkpoint}.",
                decision_summary=run.pause_reason or "Run is paused at checkpoint.",
                checkpoint_step=contract.checkpoint_step,
            )

        if run.status == "cancelled":
            return WorkerHandoffResult(
                handoff_id=contract.handoff_id,
                worker=contract.to_worker,
                step_number=contract.step_number,
                status="cancelled",
                tool_name=f"{contract.to_worker.lower()}_cancelled",
                tool_output="Run cancelled by operator; grouped task draft preserved.",
                decision_summary="Cancelled cleanly without partial catalog promotion.",
                checkpoint_step=contract.checkpoint_step,
            )

        # 5. Enforce token budget ceiling before execution
        if run.tokens_consumed + simulate_tokens > run.token_ceiling:
            run.status = "failed"
            run.failure_reason = (
                f"Token budget ceiling ({run.token_ceiling}) exceeded by handoff '{contract.handoff_id}'."
            )
            self.rate_governor.record_failure(contract.handoff_id, payload_dict, run.failure_reason)
            return WorkerHandoffResult(
                handoff_id=contract.handoff_id,
                worker=contract.to_worker,
                step_number=contract.step_number,
                status="failed",
                tool_name=f"{contract.to_worker.lower()}_budget_guard",
                tool_output=run.failure_reason,
                decision_summary="Stopped worker execution before exceeding configured token budget cap.",
                tokens_used=0,
                checkpoint_step=contract.checkpoint_step,
            )

        async with self._semaphore:
            if uncertain_external_outcome:
                run.uncertain_external_actions.add(contract.idempotency_key)
                raise UnchangedRetryBlockedError(
                    f"External outcome for '{contract.idempotency_key}' became uncertain; recorded for manual/idempotent reconciliation."
                )

            if simulate_error:
                delay = self.rate_governor.record_failure(
                    contract.handoff_id,
                    payload_dict,
                    simulate_error,
                    status_code=simulate_status_code,
                )
                run.status = "failed"
                run.failure_reason = simulate_error
                return WorkerHandoffResult(
                    handoff_id=contract.handoff_id,
                    worker=contract.to_worker,
                    step_number=contract.step_number,
                    status="failed",
                    tool_name=f"{contract.to_worker.lower()}_execute",
                    tool_output=f"{simulate_error}" + (f" (staggering {delay:.1f}s on 429)" if delay > 0 else ""),
                    decision_summary=f"Worker {contract.to_worker} halted: {simulate_error}",
                    tokens_used=simulate_tokens // 2,
                    checkpoint_step=contract.checkpoint_step,
                )

            run.tokens_consumed += simulate_tokens
            if contract.checkpoint_step and contract.checkpoint_step > run.last_verified_checkpoint:
                run.last_verified_checkpoint = int(contract.checkpoint_step)

            now_label = datetime.now(timezone.utc).strftime("%H:%M:%S UTC")
            result = WorkerHandoffResult(
                handoff_id=contract.handoff_id,
                worker=contract.to_worker,
                step_number=contract.step_number,
                status="completed",
                tool_name=f"{contract.to_worker.lower()}_verified_handoff",
                tool_output=f"Completed {contract.headline} within scope '{contract.assigned_scope}'.",
                decision_summary=f"Verified handoff {contract.handoff_id} at {now_label}.",
                tokens_used=simulate_tokens,
                duration_ms=840,
                completed_at=now_label,
                checkpoint_step=contract.checkpoint_step,
            )
            run.completed_handoffs[contract.idempotency_key] = result
            self.rate_governor.record_success(contract.handoff_id, payload_dict)
            return result

    def pause_run(self, org_id: Literal["rookmere", "augi"], batch_id: str, reason: str = "Operator paused build") -> OrchestrationRunState:
        run = self.get_or_create_run(org_id, batch_id)
        run.status = "paused"
        run.pause_reason = reason
        return run

    def resume_run(self, org_id: Literal["rookmere", "augi"], batch_id: str) -> OrchestrationRunState:
        run = self.get_or_create_run(org_id, batch_id)
        run.status = "running"
        run.pause_reason = None
        return run

    def cancel_run(self, org_id: Literal["rookmere", "augi"], batch_id: str) -> OrchestrationRunState:
        run = self.get_or_create_run(org_id, batch_id)
        run.status = "cancelled"
        return run
