"""Bounded, read-only model review of explicitly submitted organization evidence."""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
import tempfile
from typing import Any, Literal

import google.antigravity as ag
from google.antigravity import types as ag_types
from pydantic import BaseModel, ConfigDict, Field

from cairn.config import ARGON_MODEL_NAME

MAX_REVIEW_TOKENS = 16_384
MAX_REVIEW_OUTPUT_TOKENS = 4_096
REVIEW_TIMEOUT_SECONDS = 90


class ReviewDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cluster_id: str
    disposition: Literal["reuse_existing_app", "build_in_sandbox", "request_missing_evidence", "queued_next_cycle"]
    supporting_report_ids: list[str] = Field(max_length=30)
    catalog_app_id: str | None
    decision_summary: str = Field(min_length=5, max_length=1200)
    capability_gap: str | None
    missing_evidence: list[str] = Field(max_length=10)
    counter_evidence: list[str] = Field(max_length=10)


class CairnReviewOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    org_id: Literal["rookmere", "augi"]
    decisions: list[ReviewDecision] = Field(min_length=1, max_length=6)


def review_evidence_snapshot(org_id, clusters, catalog_apps, reports):
    """Select explicit evidence fields; do not include raw transcripts or credentials."""
    snapshot = {
        "org_id": org_id,
        "clusters": [{k: c.get(k) for k in (
            "clusterId", "title", "problemSummary", "policyScope", "gapExplanation", "missingEvidenceDetail"
        )} for c in clusters],
        "catalog_apps": [{k: a.get(k) for k in (
            "appId", "name", "version", "summary", "releaseStatus", "capabilities", "nonCapabilities", "dataScopes", "permittedRoles"
        )} for a in catalog_apps],
        "reports": [{k: r.get(k) for k in (
            "reportId", "clusterId", "employeeId", "taskSummary", "dataScope", "attachments", "missingEvidenceNote"
        )} for r in reports],
    }
    if len(json.dumps(snapshot).encode()) > 80_000:
        raise ValueError("Review evidence exceeds the bounded input size.")
    return snapshot


def validate_review_output(raw, snapshot):
    result = CairnReviewOutput.model_validate(raw)
    if result.org_id != snapshot["org_id"]:
        raise ValueError("Review returned another organization.")
    clusters = {c["clusterId"] for c in snapshot["clusters"]}
    reports = {r["reportId"]: r for r in snapshot["reports"]}
    apps = {a["appId"]: a for a in snapshot["catalog_apps"]}
    seen = set()
    for decision in result.decisions:
        if decision.cluster_id not in clusters or decision.cluster_id in seen:
            raise ValueError("Review returned an unknown or duplicate recurring task.")
        seen.add(decision.cluster_id)
        if any(r not in reports or reports[r]["clusterId"] != decision.cluster_id
               for r in decision.supporting_report_ids):
            raise ValueError("Review cited evidence outside its recurring task.")
        if decision.catalog_app_id is not None and decision.catalog_app_id not in apps:
            raise ValueError("Review cited an unknown catalog app.")
        if decision.disposition == "reuse_existing_app":
            if decision.catalog_app_id is None or apps[decision.catalog_app_id]["releaseStatus"] != "catalog_approved":
                raise ValueError("Reuse requires an approved catalog app.")
        if decision.disposition == "build_in_sandbox":
            if not decision.supporting_report_ids or not decision.capability_gap:
                raise ValueError("Build recommendation needs evidence and a concrete catalog gap.")
    if seen != clusters:
        raise ValueError("Review omitted a recurring task.")
    return result


async def run_live_cairn_review(snapshot: dict[str, Any]) -> dict[str, Any]:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("Model review requires the server API key.")
    prompt_file = Path(__file__).with_name("review_prompt.txt")
    instructions = prompt_file.read_text()
    # The temporary workspace contains no repository files or credentials.
    with tempfile.TemporaryDirectory(prefix="cairn_review_") as workspace:
        model = ag.ModelTarget(
            name=ARGON_MODEL_NAME, types=[ag.ModelType.TEXT],
            endpoint=ag.GeminiAPIEndpoint(api_key=api_key, options=ag.GeminiModelOptions(
                thinking_level=ag.ThinkingLevel.HIGH, max_output_tokens=MAX_REVIEW_OUTPUT_TOKENS)),
        )
        config = ag.LocalAgentConfig(
            system_instructions=ag_types.CustomSystemInstructions(text=instructions),
            capabilities=ag.CapabilitiesConfig(enable_subagents=False, enabled_tools=[]),
            tools=[], subagents=[], workspaces=[workspace], skills_paths=[], inline_skills=[],
            save_dir=workspace, app_data_dir=workspace,
            response_schema=CairnReviewOutput, model=model,
            budget_config=ag_types.BudgetConfig(max_model_calls=1, max_total_tokens=MAX_REVIEW_TOKENS,
                                                max_output_tokens=MAX_REVIEW_OUTPUT_TOKENS),
            retry_config=ag_types.RetryConfig(
                api_retry=ag_types.ModelAPIRetryConfig(max_retries=0),
                model_output_retry=ag_types.ModelOutputRetryConfig(max_retries=0)),
            env={k: v for k, v in os.environ.items() if k not in {
                "GEMINI_API_KEY", "GOOGLE_GEMINI_BASE_URL", "AGY_ADC_AUTH", "GOOGLE_GENAI_USE_VERTEXAI"}},
        )
        async with asyncio.timeout(REVIEW_TIMEOUT_SECONDS):
            async with ag.Agent(config) as agent:
                response = await agent.chat(json.dumps(snapshot))
                raw = await response.structured_output()
                if raw is None:
                    raw = json.loads(await response.text())
                output = validate_review_output(raw, snapshot)
                usage = response.usage_metadata
                return {
                    "output": output.model_dump(),
                    "usage": usage.model_dump(exclude_none=True) if usage else None,
                    "model": ARGON_MODEL_NAME,
                    "sdkPackage": "google-antigravity",
                    "sdkVersion": "0.1.22",
                    "thinkingLevel": "high",
                    "maxTotalTokens": MAX_REVIEW_TOKENS,
                    "maxOutputTokens": MAX_REVIEW_OUTPUT_TOKENS,
                    "maxModelCalls": 1,
                    "executionMode": "live_model_review",
                    "recommendationOnly": True,
                }
