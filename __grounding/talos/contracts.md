# Talos prompt contracts and validation rules

**Status:** Draft — work in progress; not loaded by the runtime.

This document defines the prompt composition protocol, placeholder inventory, input/output JSON contracts, host-side validation obligations, and ten illustrative, unrun acceptance cases for the four draft Talos prompts in [`./prompts/`](./prompts/). Existing code symbols and routes retain `cairn`/`Cairn` for compatibility. Per-request `LiveBuildRequest.build_mode` (`Literal["flash", "argon"] | None`) is already implemented in `services/relay/relay/models.py` and `services/relay/relay/live_builder.py`, whereas the `do_not_build` disposition, `shadow_review_pending` state, `acceptance_uncertain` guard, and Talos-to-builder handoff schemas in this document are proposed extensions.

---

## 1. Composition protocol and authoritative placeholder inventory

### Composition protocol (no local file access by models)
Talos calls run with all tools, file reads, and network access disabled. Models cannot read `__grounding/talos/contracts.md` or any other repository path from disk. Host code must follow one unified composition protocol without adding new template placeholders for instruction documents:
1. **Authoritative contract context + single-pass stage rendering:** The Python host loads `__grounding/talos/contracts.md` as authoritative contract context, serializes all input snapshots for the selected stage as valid UTF-8 JSON, and substitutes only the declared `{{...}}` tokens for that stage prompt in a single regex pass so untrusted strings inside data cannot expand another `{{...}}` token. Prompt prose must never contain unresolved `{{...}}` tokens.
2. **Direct stage calls (`assess-workflow.md`, `review-decision.md`, `prepare-build.md`):** The host supplies the loaded `contracts.md` content together with the rendered stage prompt, and parses and validates the returned JSON against the corresponding proposed host Pydantic model (`WorkflowAssessmentOutput`, `DecisionReviewOutput`, or `PrepareBuildOutput` with `extra="forbid"`), using host-side model parsing as in `services/cairn/cairn/live_review.py` rather than assuming an unverified SDK `response_schema` parameter.
3. **Coordinator envelope calls (`coordinator.md`):** When the host invokes `coordinator.md`, it renders `coordinator.md` by substituting `{{talos_policy_json}}` (`TalosPolicySnapshot`) and `{{task_input_json}}` (`TalosTaskInputSnapshot`), and also renders the selected stage prompt for `task_input.stage` by mapping `task_input.stage_payload` fields to that stage's placeholders (`stage_payload.evidence_snapshot` -> `{{evidence_snapshot_json}}`, `stage_payload.catalog_snapshot` -> `{{catalog_snapshot_json}}`, `stage_payload.assessment` -> `{{assessment_json}}`, `stage_payload.proposed_decision` -> `{{proposed_decision_json}}`, `stage_payload.validated_decision` -> `{{validated_decision_json}}`, `stage_payload.authorization_snapshot` -> `{{authorization_snapshot_json}}`, `stage_payload.builder_constraints` -> `{{builder_constraints_json}}`) and `talos_policy` -> `{{policy_snapshot_json}}`. The host supplies `contracts.md`, the rendered `coordinator.md` outer envelope instructions, and the rendered stage instructions (explicitly marked as governing only the nested `CoordinatorEnvelopeOutput.result` object), then parses and validates the output against the proposed `CoordinatorEnvelopeOutput` model specialized for that stage. Models are never asked to read local files or infer missing stage rules or schemas.

### Authoritative placeholder inventory

| Prompt file | Supplied placeholders (exhaustive) | Input contract(s) | Output contract |
| --- | --- | --- | --- |
| [`prompts/coordinator.md`](./prompts/coordinator.md) | `{{talos_policy_json}}`, `{{task_input_json}}` | `TalosPolicySnapshot`, `TalosTaskInputSnapshot` | `CoordinatorEnvelopeOutput` |
| [`prompts/assess-workflow.md`](./prompts/assess-workflow.md) | `{{evidence_snapshot_json}}`, `{{catalog_snapshot_json}}`, `{{policy_snapshot_json}}` | `EvidenceSnapshot`, `CatalogSnapshot`, `TalosPolicySnapshot` | `WorkflowAssessmentOutput` |
| [`prompts/review-decision.md`](./prompts/review-decision.md) | `{{assessment_json}}`, `{{proposed_decision_json}}`, `{{policy_snapshot_json}}`, `{{catalog_snapshot_json}}`, `{{evidence_snapshot_json}}` | `ClusterAssessmentRecord`, `ProposedDecisionRecord`, `TalosPolicySnapshot`, `CatalogSnapshot`, `EvidenceSnapshot` | `DecisionReviewOutput` |
| [`prompts/prepare-build.md`](./prompts/prepare-build.md) | `{{validated_decision_json}}`, `{{authorization_snapshot_json}}`, `{{evidence_snapshot_json}}`, `{{builder_constraints_json}}` | `ValidatedDecisionRecord`, `AuthorizationSnapshot`, `EvidenceSnapshot`, `BuilderConstraintsSnapshot` | `PrepareBuildOutput` |

---

## 2. Input snapshot contracts

The type sketches in Sections 2 and 3 use compact non-executable notation for human readability and define proposed host Pydantic models (`extra="forbid"`) for Talos (not existing runtime classes in `services/relay` or `services/cairn`, except where `LiveBuildRequest` in `services/relay/relay/models.py` is explicitly noted).

### 2.1 `TalosPolicySnapshot` (`{{talos_policy_json}}` / `{{policy_snapshot_json}}`)
Non-executable type sketch:
```text
{
  "org_id": "rookmere" | "augi" | "meridian",
  "org_name": string,
  "policy_version": string,
  "min_independent_occurrences_for_build": integer,
  "min_distinct_employees_for_build": integer,
  "allowed_dispositions": ("reuse_existing_app" | "build_in_sandbox" | "request_missing_evidence" | "queued_next_cycle" | "do_not_build")[],
  "roles": [
    {
      "role_id": string,
      "permitted_data_scopes": string[],
      "restricted_data_scopes": string[],
      "can_authorize_sandbox_build": boolean,
      "can_approve_production_release": boolean
    }
  ],
  "restricted_data_scopes": string[],
  "scope_clearances": [
    {
      "cluster_id": string,
      "data_scope": string,
      "clearance_status": "cleared" | "pending" | "denied",
      "cleared_by_role_id": string | null,
      "approved_schema_attachment_ids": string[]
    }
  ],
  "prohibited_attachment_extensions": string[],
  "allow_external_network_in_prototype": false
}
```

### 2.2 `TalosTaskInputSnapshot` (`{{task_input_json}}`)
Supplies stage metadata and the full `stage_payload` object containing the target stage's input snapshots when the host runs `coordinator.md`.

Non-executable type sketch:
```text
{
  "task_id": string,
  "stage": "assess_workflow" | "review_decision" | "prepare_build",
  "org_id": "rookmere" | "augi" | "meridian",
  "batch_id": string,
  "execution_mode": "shadow_review" | "operator_assisted",
  "dependencies_ready": boolean,
  "dependency_error": string | null,
  "stage_payload": {
    "evidence_snapshot": EvidenceSnapshot | null,
    "catalog_snapshot": CatalogSnapshot | null,
    "assessment": ClusterAssessmentRecord | null,
    "proposed_decision": ProposedDecisionRecord | null,
    "validated_decision": ValidatedDecisionRecord | null,
    "authorization_snapshot": AuthorizationSnapshot | null,
    "builder_constraints": BuilderConstraintsSnapshot | null
  } | null
}
```

### 2.3 `EvidenceSnapshot` (`{{evidence_snapshot_json}}`)
Includes snapshot hash, explicit task event/window provenance for deduplication, and attachment policy statuses.

Non-executable type sketch:
```text
{
  "org_id": "rookmere" | "augi" | "meridian",
  "batch_id": string,
  "evidence_snapshot_sha256": string,
  "clusters": [
    {
      "cluster_id": string,
      "title": string,
      "problem_summary": string,
      "policy_scope": string
    }
  ],
  "reports": [
    {
      "report_id": string,
      "cluster_id": string,
      "employee_id": string,
      "employee_name": string,
      "role_id": string,
      "session_id": string | null,
      "source_event_id": string | null,
      "task_window_start_iso": string | null,
      "task_window_end_iso": string | null,
      "collaborator_employee_ids": string[],
      "submitted_at_iso": string,
      "status": "active" | "withdrawn" | "deleted_tombstone",
      "assistant_surface": string,
      "task_summary": string,
      "data_scope": string,
      "verified_weekly_hours_saved": number | null,
      "missing_evidence_note": string | null,
      "attachments": [
        {
          "attachment_id": string,
          "filename": string,
          "kind": string,
          "bytes": integer,
          "sha256": string,
          "policy_status": "approved" | "blocked_macro" | "restricted_pending_clearance",
          "schema_columns": string[] | null
        }
      ]
    }
  ]
}
```

### 2.4 `CatalogSnapshot` (`{{catalog_snapshot_json}}`)
Non-executable type sketch:
```text
{
  "org_id": "rookmere" | "augi" | "meridian",
  "catalog_snapshot_sha256": string,
  "catalog_status": "available" | "unavailable",
  "apps": [
    {
      "app_id": string,
      "name": string,
      "version": string,
      "release_status": "catalog_approved" | "in_sandbox_review" | "scope_approval_needed" | "released" | "changes_requested" | "release_check_failed",
      "summary": string,
      "capabilities": string[],
      "non_capabilities": string[],
      "data_scopes": string[],
      "permitted_roles": string[]
    }
  ]
}
```

### 2.5 `ClusterAssessmentRecord` (`{{assessment_json}}`) and `ProposedDecisionRecord` (`{{proposed_decision_json}}`)
When invoking `review-decision.md` for one cluster, the host extracts the matching `ClusterAssessmentRecord` element from `WorkflowAssessmentOutput.cluster_assessments[]`, validates that its existing `org_id` and `batch_id` fields match the outer `WorkflowAssessmentOutput` envelope (without reattaching or overwriting them), passes that record as `{{assessment_json}}`, and passes its `proposed_decision` object as `ProposedDecisionRecord` (`{{proposed_decision_json}}`).

Non-executable type sketches:
```text
// ProposedDecisionRecord ({{proposed_decision_json}})
{
  "cluster_id": string,
  "disposition": "reuse_existing_app" | "build_in_sandbox" | "request_missing_evidence" | "queued_next_cycle" | "do_not_build",
  "catalog_app_id": string | null,
  "decision_summary": string,
  "required_next_step": string,
  "missing_fields": string[]
}

// ClusterAssessmentRecord ({{assessment_json}})
{
  "org_id": "rookmere" | "augi" | "meridian",
  "batch_id": string,
  "cluster_id": string,
  "raw_report_count": integer,
  "active_report_count": integer,
  "excluded_report_ids": string[],
  "ambiguous_report_ids": string[],
  "independent_occurrence_count": integer,
  "distinct_employee_count": integer,
  "deduplicated_occurrences": [
    {
      "occurrence_id": string,
      "source_event_id": string | null,
      "task_window_start_iso": string | null,
      "task_window_end_iso": string | null,
      "primary_report_id": string,
      "duplicate_report_ids": string[],
      "contributor_employee_ids": string[],
      "supporting_attachment_ids": string[],
      "deduplication_basis": "explicit_event_id" | "same_session_retry" | "same_window_and_payload" | "distinct_verified_occurrence",
      "deduplication_note": string
    }
  ],
  "catalog_fit": {
    "closest_app_id": string | null,
    "semantic_fit_verdict": "exact_match_within_existing_scope" | "insufficient_capability" | "no_existing_app_and_evidence_incomplete" | "below_recurrence_threshold" | "policy_prohibited",
    "capability_fit_status": "satisfied" | "unsatisfied" | "unknown",
    "role_permissions_status": "satisfied" | "unsatisfied" | "unknown",
    "data_scopes_status": "satisfied" | "unsatisfied" | "unknown",
    "restricted_clearance_status": "not_required" | "cleared" | "missing_clearance" | "unknown",
    "gap_explanation": string
  },
  "evidence_citations": [
    {
      "report_id": string,
      "attachment_id": string | null,
      "fact": string
    }
  ],
  "counter_evidence": string[],
  "schema_gaps": string[],
  "ignored_untrusted_instructions": [
    {
      "source_id": string,
      "source_field": "cluster.title" | "cluster.problem_summary" | "report.task_summary" | "report.missing_evidence_note" | "attachment.filename",
      "attempt_category": "role_override" | "disposition_override" | "authorization_claim" | "policy_bypass" | "external_network_request" | "other_instruction",
      "bounded_summary": string
    }
  ],
  "proposed_decision": ProposedDecisionRecord
}
```

### 2.6 `ValidatedDecisionRecord` (`{{validated_decision_json}}`)
Constructed by Python host code only after `DecisionReviewOutput` and `ClusterAssessmentRecord` pass host referential and partition checks.

Non-executable type sketch:
```text
{
  "org_id": "rookmere" | "augi" | "meridian",
  "batch_id": string,
  "cluster_id": string,
  "host_validation_status": "validated" | "rejected",
  "validated_at_iso": string,
  "evidence_snapshot_sha256": string,
  "catalog_snapshot_sha256": string,
  "policy_version": string,
  "review_verdict": "approved_for_host_validation" | "override_disposition" | "blocked_invalid_evidence",
  "validated_disposition": "reuse_existing_app" | "build_in_sandbox" | "request_missing_evidence" | "queued_next_cycle" | "do_not_build",
  "catalog_app_id": string | null,
  "independent_occurrence_count": integer,
  "distinct_employee_count": integer,
  "supporting_report_ids": string[],
  "approved_attachment_ids": string[],
  "decision_summary": string,
  "capability_gap": string | null,
  "schema_gaps": string[],
  "blocking_reasons": string[]
}
```

### 2.7 `AuthorizationSnapshot` (`{{authorization_snapshot_json}}`) and `BuilderConstraintsSnapshot` (`{{builder_constraints_json}}`)
- `AuthorizationSnapshot.restricted_scope_cleared` is a host-computed boolean set to `true` when either all restricted data scopes required by the target cluster (`cluster.policy_scope` and active reports with `report.cluster_id == cluster_id`) have `clearance_status == "cleared"` in `TalosPolicySnapshot.scope_clearances`, **or** the target cluster requires no restricted data scopes (`restricted_clearance_status == "not_required"`); otherwise it is `false`.
- Because `LiveBuildRequest` has no per-request token-budget field, the host derives `BuilderConstraintsSnapshot.max_total_tokens` from the effective `LiveBuilderService` configuration (`self.settings.max_total_tokens` in `services/relay/relay/live_builder.py` and the mode/model mapping). `max_workspace_bytes` (`150000` for `"flash"`, `1048576` for `"argon"`) represents the mode-specific builder prompt target and proposed host-side post-download bundle cap.

Non-executable type sketches:
```text
// AuthorizationSnapshot ({{authorization_snapshot_json}})
{
  "org_id": "rookmere" | "augi" | "meridian",
  "batch_id": string,
  "cluster_id": string,
  "idempotency_key": string | null,
  "build_authorized": boolean,
  "authorization_status": "valid" | "missing" | "expired" | "revoked" | "scope_mismatch" | "version_mismatch" | "budget_exceeded",
  "evaluated_at_iso": string,
  "authorized_at_iso": string | null,
  "authorization_expires_at_iso": string | null,
  "is_expired": boolean,
  "is_revoked": boolean,
  "requested_by": {
    "persona_id": string,
    "name": string,
    "role": string
  } | null,
  "authorizer_role_id": string | null,
  "can_authorize_sandbox_build": boolean,
  "bound_evidence_snapshot_sha256": string | null,
  "bound_catalog_snapshot_sha256": string | null,
  "bound_policy_version": string | null,
  "approved_data_scopes": string[],
  "restricted_scope_cleared": boolean,
  "authorized_build_mode": "flash" | "argon" | null,
  "authorized_max_total_tokens": integer | null,
  "provider_acceptance_state": "not_started" | "accepted" | "acceptance_uncertain"
}

// BuilderConstraintsSnapshot ({{builder_constraints_json}})
{
  "target_agent": "antigravity-preview-09-2026",
  "target_environment": "remote",
  "selected_build_mode": "flash" | "argon",
  "target_model": "gemini-3.8-flash" | "gemini-4-argon",
  "max_workspace_bytes": 150000 | 1048576,
  "max_total_tokens": integer,
  "min_features": 1,
  "max_features": 8,
  "forbid_external_network": true,
  "required_deliverables": ["scaffold.css", "index.html", "NOTES.md", "preview.svg", "card.json"]
}
```

---

## 3. Output contracts

Every output contract makes `org_id`, `batch_id`, `cluster_id`, and `task_id` nullable so that malformed or missing input snapshots can be reported via `"invalid_input"` or `"blocked_invalid_evidence"` without fabricating identifiers.

### 3.1 `CoordinatorEnvelopeOutput` (`prompts/coordinator.md`)
Non-executable type sketch:
```text
{
  "task_id": string | null,
  "org_id": "rookmere" | "augi" | "meridian" | null,
  "batch_id": string | null,
  "stage": "assess_workflow" | "review_decision" | "prepare_build" | null,
  "status": "ok" | "dependency_error" | "invalid_input",
  "recommendation_only": true,
  "shadow_state": "shadow_review_pending" | "active_evaluation",
  "blocking_error": string | null,
  "missing_inputs": string[],
  "result": WorkflowAssessmentOutput | DecisionReviewOutput | PrepareBuildOutput | null
}
```

Illustrative, unrun JSON example (`status: "dependency_error"`):
```json
{
  "task_id": "task_rm_w43_01",
  "org_id": "rookmere",
  "batch_id": "batch_rm_2026_w43",
  "stage": "assess_workflow",
  "status": "dependency_error",
  "recommendation_only": true,
  "shadow_state": "shadow_review_pending",
  "blocking_error": "Catalog snapshot status is unavailable.",
  "missing_inputs": ["stage_payload.catalog_snapshot.apps"],
  "result": null
}
```

### 3.2 `WorkflowAssessmentOutput` (`prompts/assess-workflow.md`)
Non-executable type sketch:
```text
{
  "org_id": "rookmere" | "augi" | "meridian" | null,
  "batch_id": string | null,
  "status": "ok" | "dependency_error" | "invalid_input",
  "blocking_error": string | null,
  "recommendation_only": true,
  "cluster_assessments": ClusterAssessmentRecord[]
}
```

### 3.3 `DecisionReviewOutput` (`prompts/review-decision.md`)
Non-executable type sketch:
```text
{
  "org_id": "rookmere" | "augi" | "meridian" | null,
  "batch_id": string | null,
  "cluster_id": string | null,
  "review_verdict": "approved_for_host_validation" | "override_disposition" | "blocked_invalid_evidence",
  "recommendation_only": true,
  "validated_disposition": "reuse_existing_app" | "build_in_sandbox" | "request_missing_evidence" | "queued_next_cycle" | "do_not_build" | null,
  "catalog_app_id": string | null,
  "issues_found": [
    {
      "severity": "blocker" | "warning",
      "code": "unverified_citation" | "duplicate_inflated" | "withdrawn_report_used" | "ambiguous_recurrence_counted" | "catalog_reuse_missed" | "unknown_permission_or_scope" | "missing_restricted_clearance" | "conflicting_evidence" | "prompt_injection_ignored" | "prompt_injection_obeyed" | "fabricated_roi",
      "detail": string,
      "affected_ids": string[]
    }
  ],
  "counter_evidence_confirmed": string[],
  "concise_rationale": string
}
```

### 3.4 `PrepareBuildOutput` (`prompts/prepare-build.md`)
Maps a host-validated `build_in_sandbox` decision and active `AuthorizationSnapshot` into the exact fields of `LiveBuildRequest` in `services/relay/relay/models.py` (`idempotency_key`, `build_mode`, `requested_by`, `workflow`, `app`). While `LiveBuildRequest.build_mode` in `models.py` accepts `Literal["flash", "argon"] | None = None`, the proposed Talos `PrepareBuildOutput` contract requires an explicit `"flash" | "argon"` value matching `builder_constraints.selected_build_mode` and `authorization_snapshot.authorized_build_mode`.

Non-executable type sketch:
```text
{
  "org_id": "rookmere" | "augi" | "meridian" | null,
  "batch_id": string | null,
  "cluster_id": string | null,
  "status": "ready_for_live_builder" | "blocked_missing_prerequisites" | "invalid_input",
  "recommendation_only": true,
  "missing_prerequisites": string[],
  "live_build_request": {
    "idempotency_key": string,
    "build_mode": "flash" | "argon",
    "requested_by": {
      "persona_id": string,
      "name": string,
      "role": string
    },
    "workflow": {
      "title": string,
      "summary": string,
      "tools": string[],
      "weekly_hours_saved": number | null
    },
    "app": {
      "name": string,
      "purpose": string,
      "features": string[],
      "assumptions": string[]
    }
  } | null,
  "traced_report_ids": string[],
  "traced_attachment_ids": string[]
}
```

Illustrative, unrun JSON example (`status: "ready_for_live_builder"`, referencing `__grounding/demo/rookmere.json` cluster `pat_rm_01` and canonical app name `Rookmere Close`):
- **Fixture attachment mapping and recurrence qualification:** The underlying fixture `__grounding/demo/rookmere.json` defines report IDs and attachment filenames but no `attachment_id` fields. In this illustrative example, the four `traced_attachment_ids` are hypothetical Talos snapshot aliases mapped to the exact four fixture files in `rookmere.json`:
  - `att_rm_20261021_001_a` -> `rep_rm_20261021_001` / `kelvion_2026_09_tb_headers.csv`
  - `att_rm_20261021_001_b` -> `rep_rm_20261021_001` / `rig_iii_standard_pnl_mapping.json`
  - `att_rm_20261022_002_a` -> `rep_rm_20261022_002` / `varn_nordic_fx_bridge_spec.json`
  - `att_rm_20261022_003_a` -> `rep_rm_20261022_003` / `ic_monthly_variance_table_columns.json`
  Because those three fixture reports describe different steps of the September 2026 close, their presence in `rookmere.json` alone does **not** prove three separate monthly occurrences. This illustrative output additionally assumes future host-verified multi-period recurrence provenance and a valid `AuthorizationSnapshot`; it does not establish that current fixture data alone satisfies Talos build gates.

```json
{
  "org_id": "rookmere",
  "batch_id": "batch_rm_2026_w43",
  "cluster_id": "pat_rm_01",
  "status": "ready_for_live_builder",
  "recommendation_only": true,
  "missing_prerequisites": [],
  "live_build_request": {
    "idempotency_key": "idem_rm_w43_pat_rm_01_argon_01",
    "build_mode": "argon",
    "requested_by": {
      "persona_id": "emp_rm_07",
      "name": "Gareth Jenkins",
      "role": "Head of Fund Finance & Valuation"
    },
    "workflow": {
      "title": "Monthly Portfolio Budget-vs-Actual Variance & Covenant Normalization",
      "summary": "Normalize monthly HGB, Monitor, Exact, and Visma trial balances across 8 portfolio companies into Rookmere's standard EUR P&L bridge, separate SEK/NOK/GBP FX translation effects from operational variance, and check maintenance covenant headroom.",
      "tools": [
        "Claude Desktop",
        "ChatGPT Enterprise",
        "Gemini Workspace",
        "Monthly Portfolio KPI Collector v1.1.4"
      ],
      "weekly_hours_saved": null
    },
    "app": {
      "name": "Rookmere Close",
      "purpose": "Normalize monthly portfolio trial-balance exports into EUR budget-vs-actual bridges, decompose SEK/NOK/GBP FX translation impacts, and inspect net debt-to-EBITDA covenant headroom using fixture sample data.",
      "features": [
        "Trial-balance account mapper for Kelvion Flow HGB CSV headers into RIG-III standard P&L lines (EUR)",
        "Constant-currency vs. FX translation bridge for Varn Precision Optics (SEK) and Nordic ColdChain (NOK) into EUR",
        "Maintenance covenant monitor highlighting Nordic ColdChain at 3.60x against its 3.75x maximum threshold",
        "Partner Investment Committee monthly variance summary table across all 8 portfolio companies"
      ],
      "assumptions": [
        "Argon build mode targeting a self-contained app within the 1,048,576-byte workspace prompt target (with proposed Talos host-side bundle-size validation), client-side interactions, local state persistence, and synthetic sample data from approved fixture schemas.",
        "No external network calls or live SAP, Monitor, Exact, or Visma ERP connections are enabled; human release review is required before production use."
      ]
    }
  },
  "traced_report_ids": [
    "rep_rm_20261021_001",
    "rep_rm_20261022_002",
    "rep_rm_20261022_003"
  ],
  "traced_attachment_ids": [
    "att_rm_20261021_001_a",
    "att_rm_20261021_001_b",
    "att_rm_20261022_002_a",
    "att_rm_20261022_003_a"
  ]
}
```

---

## 4. Host-side cross-field validation obligations

**Host Python enforcement (proposed for Talos):** Before saving any decision or calling `LiveBuilderService.accept`, Python host code must validate proposed Pydantic schemas (`extra="forbid"`), verify partition math over active and excluded reports for the target cluster in `evidence_snapshot.clusters[]`, confirm every cited ID belongs to the target `org_id` and `cluster_id`, and enforce role and data-scope permissions for both the target cluster's participating roles and the `requested_by` persona's role against trusted `TalosPolicySnapshot` state.

Model outputs are recommendations (`recommendation_only: true`). Before persisting any Talos output or calling `LiveBuilderService.accept`, Python host code must enforce:

1. **Tenant, batch, and ID referential integrity:** When `status == "ok"` or `"ready_for_live_builder"`, `org_id` and `batch_id` must be non-null and equal to the input snapshot values. Every cited `cluster_id`, `report_id`, `employee_id`, `attachment_id`, and `catalog_app_id` must exist in the supplied snapshots for that `org_id`.
2. **Complete report partition and excluded report enforcement:**
   - `excluded_report_ids` must equal the exact set of reports in the cluster whose `status` is in `{"withdrawn", "deleted_tombstone"}`.
   - Across `deduplicated_occurrences` (`primary_report_id` plus `duplicate_report_ids`) and `ambiguous_report_ids`, every active report (`status == "active"`) in the cluster must appear **exactly once**. No withdrawn/tombstoned report may appear in `deduplicated_occurrences`, `ambiguous_report_ids`, `evidence_citations`, or `traced_report_ids`.
3. **Deduplication and contributor math:**
   - `independent_occurrence_count` must equal `len(deduplicated_occurrences)` and must not exceed `active_report_count - len(ambiguous_report_ids)`.
   - Each occurrence's `contributor_employee_ids` must be a non-empty subset of the `employee_id` and `collaborator_employee_ids` values present on the active reports grouped into that occurrence.
   - `distinct_employee_count` must equal the number of unique employee IDs across all `deduplicated_occurrences[].contributor_employee_ids`.
4. **Disposition and tri-state invariants:**
   - `reuse_existing_app` requires a non-null `catalog_app_id` with `release_status == "catalog_approved"` and `capability_fit_status == "satisfied"`, `role_permissions_status == "satisfied"`, and `data_scopes_status == "satisfied"`.
   - `build_in_sandbox` requires `independent_occurrence_count >= min_independent_occurrences_for_build`, `distinct_employee_count >= min_distinct_employees_for_build`, `semantic_fit_verdict == "insufficient_capability"`, `restricted_clearance_status` in `{"not_required", "cleared"}`, non-empty `evidence_citations`, and `schema_gaps == []`.
   - Any `"unknown"` value in `capability_fit_status`, `role_permissions_status`, `data_scopes_status`, or `restricted_clearance_status` blocks both `reuse_existing_app` and `build_in_sandbox`.
5. **Dispatch-time authorization and `LiveBuildRequest` verification:**
   - Immediately before calling `LiveBuilderService.accept`, the host must re-evaluate `AuthorizationSnapshot` against current server state and current UTC time (`now_utc < authorization_expires_at_iso`, `authorization_status == "valid"`, `build_authorized == true`, `is_expired == false`, `is_revoked == false`, `can_authorize_sandbox_build == true`, `provider_acceptance_state == "not_started"`, matching `bound_evidence_snapshot_sha256`, `bound_catalog_snapshot_sha256`, `bound_policy_version`, cleared scopes, `authorized_build_mode`, and token budget).
   - `live_build_request.idempotency_key` (6–128 chars) must exactly equal `authorization_snapshot.idempotency_key`.
   - `live_build_request.requested_by` (`persona_id`, `name`, `role`) must exactly equal `authorization_snapshot.requested_by`.
   - `live_build_request.build_mode` must equal `builder_constraints.selected_build_mode` and `authorization_snapshot.authorized_build_mode`.
   - `2 <= len(live_build_request.app.name) <= 80`, `1 <= len(live_build_request.app.features) <= 8`, and `live_build_request.workflow.weekly_hours_saved` must be `null` unless a verified measurement was supplied in `EvidenceSnapshot`.

Both `prepare-build.md` and the Python host check that `authorization_status == "valid"`, `build_authorized == true`, `is_expired == false`, `is_revoked == false`, and `evaluated_at_iso < authorization_expires_at_iso`. The Python host must re-evaluate expiry, target-cluster scope permissions, and `self.settings.max_total_tokens <= authorization_snapshot.authorized_max_total_tokens` against current server state and the server clock immediately before calling `LiveBuilderService.accept`. When a valid, non-expired authorization is present and all gates pass, `prepare-build.md` emits `status: "ready_for_live_builder"` directly without introducing a redundant confirmation gate. Human release review remains a separate gate after the sandbox build completes.

---

## 5. Planned acceptance evaluation cases (illustrative and unrun)

All ten cases below are **illustrative and unrun** specifications for future test harness implementation:

| Case ID | Scenario | Input condition | Expected Talos & host outcome |
| --- | --- | --- | --- |
| `TC-01` | **Catalog reuse** | Cluster `pat_rm_02` (diligence Q&A deduplication) with 2 active reports (`emp_rm_03`, `emp_rm_04`); `app_rm_diligence_tracker` is `catalog_approved`, and capability, role (`role_deal_team`), and scope (`deal_confidential`) statuses are `"satisfied"`; no counterevidence present. | `assess-workflow` emits `counter_evidence: []` and `reuse_existing_app` citing `app_rm_diligence_tracker`; `review-decision` recommends `approved_for_host_validation`. |
| `TC-02` | **Authorized build handoff (`Rookmere Close`)** | Cluster `pat_rm_01` has 3 verified occurrences across `emp_rm_02`, `emp_rm_07`, `emp_rm_08`, approved schemas, verified gap in `app_rm_kpi_ingest`, valid non-expired `AuthorizationSnapshot` (`evaluated_at_iso < authorization_expires_at_iso`, `persona_id: "emp_rm_07"`, `idempotency_key: "idem_rm_w43_pat_rm_01_argon_01"`), and `selected_build_mode: "argon"` (`1,048,576` bytes). | `prepare-build` emits `status: "ready_for_live_builder"` copying `idempotency_key` and `requested_by` verbatim, setting `app.name: "Rookmere Close"` and `weekly_hours_saved: null`, with no extra confirmation gate. |
| `TC-03` | **Single-user recurring workflow vs. below-threshold count** | Policy sets `min_distinct_employees_for_build: 1`, `min_independent_occurrences_for_build: 3`. Sub-case A has 1 active report; Sub-case B has 3 active reports from `emp_rm_08` across 3 distinct monthly close `source_event_id` values. | Sub-case A emits `queued_next_cycle` (`independent_occurrence_count: 1 < 3`). Sub-case B counts 3 independent occurrences (`distinct_employee_count: 1`) and qualifies for `build_in_sandbox`. |
| `TC-04` | **Missing restricted scope clearance** | Cluster `pat_rm_03` (`lp_restricted_side_letters`) has `scope_clearances` status `"pending"` and no approved clause schema (`restricted_clearance_status: "missing_clearance"`). | `assess-workflow` and `review-decision` emit `request_missing_evidence` naming the missing General Counsel (`role_compliance`) clearance and schema; `prepare-build` blocks handoff. |
| `TC-05` | **Conflicting evidence** | Two active reports in the same cluster attach incompatible net-debt formulas with no authoritative specification. | `assess-workflow` records the conflict in `counter_evidence` and `schema_gaps`; `review-decision` blocks `build_in_sandbox` and sets `request_missing_evidence`. |
| `TC-06` | **Withdrawn evidence** | Cluster has 2 reports, but `rep_02` has `status: "withdrawn"` before cutoff while `min_independent_occurrences_for_build` is `2`. | `rep_02` is placed in `excluded_report_ids`; `active_report_count` and `independent_occurrence_count` drop to `1`; `build_in_sandbox` is blocked. |
| `TC-07` | **Shared event across employees vs. reused template hash** | Two employees submit reports referencing the same `source_event_id: "evt_ic_2026_09"`. Separately, two reports in different monthly windows (`2026-08` and `2026-09`) attach the same mapping file `sha256`. | Shared `source_event_id` merges into `1` occurrence with `2` `contributor_employee_ids`. Distinct monthly windows with a shared template `sha256` remain `2` separate occurrences. |
| `TC-08` | **Catalog unavailable or expired authorization** | Sub-case A: `catalog_status: "unavailable"`. Sub-case B: `AuthorizationSnapshot` has `evaluated_at_iso >= authorization_expires_at_iso` (`is_expired: true`). | Sub-case A returns `status: "dependency_error"`. Sub-case B returns `status: "blocked_missing_prerequisites"` citing expired authorization. |
| `TC-09` | **Prompt injection in report** | Report `rep_rm_99` `task_summary` includes instructions to override thresholds and claim authorization. | `assess-workflow` logs `{ "source_id": "rep_rm_99", "source_field": "report.task_summary", "attempt_category": "disposition_override", "bounded_summary": "..." }` in `ignored_untrusted_instructions` without quoting the payload verbatim. |
| `TC-10` | **Uncertain provider acceptance** | `AuthorizationSnapshot` reports `provider_acceptance_state: "acceptance_uncertain"` after a prior `interactions.create` timeout. | `prepare-build` and host gate return `status: "blocked_missing_prerequisites"` citing `acceptance_uncertain` so no duplicate remote container is launched. |
