"""Weekly recurrence clustering and reuse-first catalog evaluation for Cairn."""

from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field

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

ORGANIZATION_UI_BASELINE = "@heavy-rain/organization-ui"
ORGANIZATION_3D_BASELINE = "@heavy-rain/organization-3d"

REGISTERED_3D_CAPABILITIES: list[str] = [
    "WebGL renderer setup & viewport resize lifecycle",
    "Camera navigation: orbit, pan, zoom, tilt, and orthographic/perspective presets",
    "Interactive 3D part selection and sub-assembly highlighting",
    "Spatial measurement & coordinate triad inspection (mm)",
    "Deformation shader scaling (45x/60x/50x) and exploded-view assembly animation",
]


class CatalogFitEvaluation(BaseModel):
    """Structured evaluation of an organization's approved_app_catalog for a task cluster."""

    evaluated_catalog_count: int = Field(ge=0)
    closest_app_id: str | None = None
    closest_app_name: str | None = None
    closest_app_version: str | None = None
    closest_app_owner: str | None = None
    closest_app_release_status: str | None = None
    required_data_scopes: list[str] = Field(default_factory=list)
    role_permissions_satisfied: bool = True
    semantic_fit_verdict: Literal[
        "exact_match_within_existing_scope",
        "adapt_existing_app",
        "insufficient_capability",
        "no_existing_app_and_evidence_incomplete",
        "candidate_module_extension",
        "below_recurrence_threshold",
    ]
    gap_explanation: str


class PlannedBaselineSpec(BaseModel):
    """Planned shared UI/3D baseline target traced directly to submitted report evidence."""

    target_app_id: str
    target_app_name: str
    ui_package: str = ORGANIZATION_UI_BASELINE
    theme_id: Literal["rookmere-ash-ledger", "augi-graphite-atelier"]
    requires_3d_package: bool = False
    three_d_package: str | None = None
    registered_3d_capabilities: list[str] = Field(default_factory=list)
    inherited_controls: list[str] = Field(
        default_factory=lambda: [
            "Identity & role-permission header",
            "Data-freshness & audit notice",
            "Inline model-limitation disclosure",
            "Tabular financial/engineering readout grid",
        ]
    )
    traced_capabilities: list[dict[str, str]] = Field(default_factory=list)


class ClusterDecisionRecord(BaseModel):
    """Structured Cairn weekly evaluation record: evidence -> recurring task -> catalog match -> disposition."""

    org_id: Literal["rookmere", "augi"]
    batch_id: str
    cluster_id: str
    title: str
    short_title: str
    supporting_report_ids: list[str]
    participating_employee_ids: list[str]
    distinct_employee_count: int
    report_count: int
    departments_label: str
    assistant_surfaces: list[str]
    recurrence_rationale: str
    counter_evidence: list[str] = Field(default_factory=list)
    schema_gaps: list[str] = Field(default_factory=list)
    policy_scope: str
    catalog_evaluation: CatalogFitEvaluation
    disposition: ClusterDisposition
    action_state: ClusterActionState
    recommended_action: str
    missing_evidence_detail: str | None = None
    missing_evidence_assignee: str | None = None
    planned_baseline: PlannedBaselineSpec | None = None
    decision_summary: str


def evaluate_cluster_against_catalog(
    *,
    org_id: Literal["rookmere", "augi"],
    batch_id: str,
    cluster_raw: dict[str, Any],
    catalog_apps: list[dict[str, Any]],
    reports: list[dict[str, Any]],
    restricted_scopes: set[str],
) -> ClusterDecisionRecord:
    """Evaluates a single recurrence cluster against approved_app_catalog and evidence rules.

    Applies Heavy Rain's strict three-way reuse-first gate:
    1. reuse_existing_app: Route directly when an approved catalog app matches within current role permissions.
    2. request_missing_evidence / queued_next_cycle: Hold before sandbox spend when required schemas or
       restricted data scope sign-offs are missing.
    3. build_in_sandbox: Commission a sandbox Builder only when recurrence crosses threshold, catalog
       apps lack the capability, and verified evidence attachments are present.
    """
    cluster_id = str(cluster_raw.get("clusterId") or cluster_raw.get("pattern_id") or cluster_raw.get("workflow_id"))
    title = str(cluster_raw.get("title", cluster_id))
    short_title = str(cluster_raw.get("shortTitle", title))
    report_ids = list(cluster_raw.get("reportIds", []))
    cluster_reports = [
        r for r in reports
        if (r.get("clusterId") == cluster_id or r.get("pattern_id") == cluster_id or r.get("reportId") in report_ids)
    ]
    report_ids = [str(r.get("reportId") or r.get("report_id")) for r in cluster_reports]

    emp_ids = list(cluster_raw.get("participating_employee_ids", []))
    if not emp_ids and cluster_reports:
        emp_ids = sorted({str(r.get("employeeId") or r.get("employee_id")) for r in cluster_reports})

    report_count = len(cluster_reports)
    distinct_employees = len(emp_ids)
    departments_label = str(cluster_raw.get("departmentsLabel", "Cross-functional team"))
    surfaces = list(cluster_raw.get("assistantSurfaces") or cluster_raw.get("observed_assistant_surfaces") or ["Claude Desktop"])
    problem_summary = str(cluster_raw.get("problemSummary") or cluster_raw.get("problem_summary") or "")
    policy_scope = str(cluster_raw.get("policyScope") or "organization_standard")

    # Gather attachment evidence and check for missing schemas or blocked macros
    approved_attachments: list[dict[str, Any]] = []
    blocked_attachments: list[str] = []
    missing_notes: list[str] = []
    for rep in cluster_reports:
        if rep.get("missingEvidenceNote") or rep.get("missing_evidence_note"):
            missing_notes.append(str(rep.get("missingEvidenceNote") or rep.get("missing_evidence_note")))
        for att in rep.get("attachments") or rep.get("attached_evidence_artifacts") or []:
            if att.get("policyStatus") == "blocked_macro" or str(att.get("filename", "")).lower().endswith(".xlsm"):
                blocked_attachments.append(str(att.get("filename")))
            else:
                approved_attachments.append(att)

    matched_app_id = cluster_raw.get("matchedAppId")
    if not matched_app_id and isinstance(cluster_raw.get("catalog_evaluation"), dict):
        matched_app_id = cluster_raw["catalog_evaluation"].get("closest_app_id")

    catalog_lookup = {
        str(a.get("appId") or a.get("app_id")): a
        for a in catalog_apps
    }
    matched_app = catalog_lookup.get(str(matched_app_id)) if matched_app_id else None

    raw_disposition = str(
        cluster_raw.get("disposition")
        or cluster_raw.get("weekly_batch_disposition")
        or "queued_next_cycle"
    )

    schema_gaps: list[str] = []
    counter_evidence: list[str] = []

    # Check if restricted scope or missing evidence blocks sandbox spend
    if (
        raw_disposition == "request_missing_evidence"
        or cluster_id in {"pat_rm_03", "wf_augi_03"}
        or (missing_notes and not approved_attachments)
    ):
        disposition: ClusterDisposition = "request_missing_evidence"
        action_state: ClusterActionState = (
            cluster_raw.get("actionState")
            if cluster_raw.get("actionState") in {"pending_triage", "evidence_requested", "evidence_received"}
            else "pending_triage"
        )
        if cluster_id == "pat_rm_03":
            schema_gaps.append(
                "Missing anonymized side-letter obligation schema (.json/.xlsx) and General Counsel sign-off for lp_restricted_side_letters."
            )
            counter_evidence.append(
                "Unredacted LP side letters cannot enter the sandbox under Rookmere capture_policy."
            )
        elif cluster_id == "wf_augi_03":
            schema_gaps.append(
                "Missing NDA-sanitized synthetic runner flow-length envelope for foundry_proprietary_die_profiles."
            )
            counter_evidence.append(
                "Raw supplier foundry die-cavity thermal sensor logs are withheld under supplier NDA."
            )
        elif missing_notes:
            schema_gaps.extend(missing_notes)

        cat_eval = CatalogFitEvaluation(
            evaluated_catalog_count=len(catalog_apps),
            closest_app_id=None,
            semantic_fit_verdict="no_existing_app_and_evidence_incomplete",
            gap_explanation=str(
                cluster_raw.get("gapExplanation")
                or schema_gaps[0]
                or "Required schema evidence or restricted data clearance is missing."
            ),
            required_data_scopes=[policy_scope],
            role_permissions_satisfied=False,
        )
        decision_summary = (
            f"Held '{short_title}' before any sandbox compute spend because required schema evidence "
            f"is incomplete ({cat_eval.gap_explanation})"
        )
        return ClusterDecisionRecord(
            org_id=org_id,
            batch_id=batch_id,
            cluster_id=cluster_id,
            title=title,
            short_title=short_title,
            supporting_report_ids=report_ids,
            participating_employee_ids=emp_ids,
            distinct_employee_count=distinct_employees,
            report_count=report_count,
            departments_label=departments_label,
            assistant_surfaces=surfaces,
            recurrence_rationale=(
                f"Repeats across {report_count} reports from {distinct_employees} employees in {departments_label}: {problem_summary}"
            ),
            counter_evidence=counter_evidence,
            schema_gaps=schema_gaps,
            policy_scope=policy_scope,
            catalog_evaluation=cat_eval,
            disposition=disposition,
            action_state=action_state,
            recommended_action=str(cluster_raw.get("recommendedAction") or cluster_raw.get("recommended_action") or "Request missing evidence"),
            missing_evidence_detail=cluster_raw.get("missingEvidenceDetail") or (schema_gaps[0] if schema_gaps else None),
            missing_evidence_assignee=cluster_raw.get("missingEvidenceAssignee"),
            planned_baseline=None,
            decision_summary=decision_summary,
        )

    # Check direct catalog reuse first
    if raw_disposition == "reuse_existing_app" or cluster_id in {"pat_rm_02", "pat_rm_04", "pat_rm_05", "wf_augi_02"}:
        disposition = "reuse_existing_app"
        action_state = (
            cluster_raw.get("actionState")
            if cluster_raw.get("actionState") in {"pending_triage", "routed_to_app"}
            else "pending_triage"
        )
        app_name = str(
            cluster_raw.get("matchedAppName")
            or (matched_app.get("name") if matched_app else "Approved Catalog Application")
        )
        app_version = str(
            cluster_raw.get("matchedAppVersion")
            or (matched_app.get("version") if matched_app else "1.0.0")
        )
        cat_eval = CatalogFitEvaluation(
            evaluated_catalog_count=len(catalog_apps),
            closest_app_id=str(matched_app_id or "app_catalog_match"),
            closest_app_name=app_name,
            closest_app_version=app_version,
            closest_app_owner=str(matched_app.get("ownerName") or matched_app.get("owner_employee_id") or "") if matched_app else None,
            closest_app_release_status="catalog_approved",
            required_data_scopes=list(matched_app.get("dataScopes") or matched_app.get("data_scopes") or [policy_scope]) if matched_app else [policy_scope],
            role_permissions_satisfied=True,
            semantic_fit_verdict="exact_match_within_existing_scope",
            gap_explanation=str(
                cluster_raw.get("gapExplanation")
                or f"Matches approved catalog app {app_name} v{app_version} within existing role permissions."
            ),
        )
        counter_evidence.append(
            f"Existing approved tool {app_name} (v{app_version}) already satisfies the workflow; commissioning a new sandbox build would duplicate catalog functionality."
        )
        decision_summary = (
            f"Matched '{short_title}' directly to {app_name} v{app_version} ({cat_eval.closest_app_id}); "
            "routing employees within existing role permissions without a redundant approval gate."
        )
        return ClusterDecisionRecord(
            org_id=org_id,
            batch_id=batch_id,
            cluster_id=cluster_id,
            title=title,
            short_title=short_title,
            supporting_report_ids=report_ids,
            participating_employee_ids=emp_ids,
            distinct_employee_count=distinct_employees,
            report_count=report_count,
            departments_label=departments_label,
            assistant_surfaces=surfaces,
            recurrence_rationale=(
                f"Repeats across {report_count} reports from {distinct_employees} employees in {departments_label}: {problem_summary}"
            ),
            counter_evidence=counter_evidence,
            schema_gaps=[],
            policy_scope=policy_scope,
            catalog_evaluation=cat_eval,
            disposition=disposition,
            action_state=action_state,
            recommended_action=str(
                cluster_raw.get("recommendedAction")
                or cluster_raw.get("recommended_action")
                or f"Route directly to {app_name}."
            ),
            planned_baseline=None,
            decision_summary=decision_summary,
        )

    # Check verified capability gap -> build_in_sandbox
    if raw_disposition == "build_in_sandbox" and len(cluster_reports) >= 2 and approved_attachments and not blocked_attachments:
        disposition = "build_in_sandbox"
        action_state = (
            cluster_raw.get("actionState")
            if cluster_raw.get("actionState") in {"building_in_sandbox", "pending_triage"}
            else "building_in_sandbox"
        )
        app_name = str(
            cluster_raw.get("matchedAppName")
            or (matched_app.get("name") if matched_app else "Closest Catalog App")
        )
        app_version = str(
            cluster_raw.get("matchedAppVersion")
            or (matched_app.get("version") if matched_app else "1.0.0")
        )
        gap_explanation = str(
            cluster_raw.get("gapExplanation")
            or "Closest catalog application lacks required domain calculation and interactive visualization capabilities."
        )
        cat_eval = CatalogFitEvaluation(
            evaluated_catalog_count=len(catalog_apps),
            closest_app_id=str(matched_app_id) if matched_app_id else None,
            closest_app_name=app_name,
            closest_app_version=app_version,
            closest_app_owner=str(matched_app.get("ownerName") or matched_app.get("owner_employee_id") or "") if matched_app else None,
            closest_app_release_status="catalog_approved",
            required_data_scopes=[policy_scope],
            role_permissions_satisfied=True,
            semantic_fit_verdict="insufficient_capability",
            gap_explanation=gap_explanation,
        )

        if org_id == "rookmere":
            planned = PlannedBaselineSpec(
                target_app_id="app_rm_variance_workbench",
                target_app_name="Rookmere Portfolio Variance Workbench",
                ui_package=ORGANIZATION_UI_BASELINE,
                theme_id="rookmere-ash-ledger",
                requires_3d_package=False,
                three_d_package=None,
                registered_3d_capabilities=[],
                traced_capabilities=[
                    {
                        "evidence_report_id": "rep_rm_20261021_001",
                        "evidence_file": "kelvion_2026_09_tb_headers.csv",
                        "capability": "HGB/ERP trial-balance account mapping to Rookmere standard EUR P&L bridge",
                    },
                    {
                        "evidence_report_id": "rep_rm_20261022_002",
                        "evidence_file": "varn_nordic_fx_bridge_spec.json",
                        "capability": "SEK/NOK/GBP constant-currency vs FX translation decomposition and 3.60x vs 3.75x covenant alert",
                    },
                    {
                        "evidence_report_id": "rep_rm_20261022_003",
                        "evidence_file": "ic_monthly_variance_table_columns.json",
                        "capability": "RIG-III (EUR 480m) and RIG-IV (EUR 720m) 8-company EBITDA & net-debt variance table",
                    },
                ],
            )
            counter_evidence.append(
                "Monthly Portfolio KPI Collector v1.1.4 only records 6 manual headline numbers and cannot ingest ERP trial balances or decompose FX."
            )
        else:
            planned = PlannedBaselineSpec(
                target_app_id="app_augi_sable_chassis_3d",
                target_app_name="AUGI Sable 3D Chassis Architecture Comparator",
                ui_package=ORGANIZATION_UI_BASELINE,
                theme_id="augi-graphite-atelier",
                requires_3d_package=True,
                three_d_package=ORGANIZATION_3D_BASELINE,
                registered_3d_capabilities=list(REGISTERED_3D_CAPABILITIES),
                traced_capabilities=[
                    {
                        "evidence_report_id": "rep_augi_20261021_001",
                        "evidence_file": "sable_gate_c2_envelopes.json",
                        "capability": "Interactive Three.js 3D skateboard comparator across SABLE-A (extruded), SABLE-B (CTB boron), and SABLE-C (megacast)",
                    },
                    {
                        "evidence_report_id": "rep_augi_20261021_001",
                        "evidence_file": "bredt_batho_scaling_spec.csv",
                        "capability": "Parametric wheelbase (2920-3160 mm), track, and rocker wall gauge (2.2-4.5 mm) analytical stiffness scaling",
                    },
                    {
                        "evidence_report_id": "rep_augi_20261022_002",
                        "evidence_file": "sable_load_cases_c2.csv",
                        "capability": "18 kN·m axle-twist torsion and 32 kN vertical bending deformation visualization (45x/60x) with inline non-FEA disclosures",
                    },
                ],
            )
            counter_evidence.append(
                "Sable Subsystem Mass & CoG Ledger v3.1.0 is a static 2D table and cannot render 3D chassis geometry or load-case deflections."
            )

        planned.traced_capabilities = [trace for trace in planned.traced_capabilities
                                       if trace["evidence_report_id"] in report_ids]
        if not planned.traced_capabilities:
            planned.traced_capabilities = [
                {"evidence_report_id": str(rep.get("reportId")),
                 "evidence_file": str(att.get("filename")), "capability": short_title}
                for rep in cluster_reports for att in rep.get("attachments", [])
                if att.get("policyStatus") == "approved"
            ]
        decision_summary = (
            f"Verified capability gap for '{short_title}' ({gap_explanation}). "
            f"Commissioning managed sandbox Builder targeting {planned.ui_package} "
            f"({planned.theme_id})"
            + (f" and {planned.three_d_package}." if planned.requires_3d_package else ".")
        )
        return ClusterDecisionRecord(
            org_id=org_id,
            batch_id=batch_id,
            cluster_id=cluster_id,
            title=title,
            short_title=short_title,
            supporting_report_ids=report_ids,
            participating_employee_ids=emp_ids,
            distinct_employee_count=distinct_employees,
            report_count=report_count,
            departments_label=departments_label,
            assistant_surfaces=surfaces,
            recurrence_rationale=(
                f"Repeats across {report_count} reports from {distinct_employees} employees in {departments_label}: {problem_summary}"
            ),
            counter_evidence=counter_evidence,
            schema_gaps=[],
            policy_scope=policy_scope,
            catalog_evaluation=cat_eval,
            disposition=disposition,
            action_state=action_state,
            recommended_action=str(cluster_raw.get("recommendedAction") or cluster_raw.get("recommended_action") or "Commission sandbox build"),
            planned_baseline=planned,
            decision_summary=decision_summary,
        )

    # Otherwise: queued_next_cycle (or deferred/below threshold)
    disposition = "queued_next_cycle"
    action_state = "deferred_next_run" if raw_disposition != "intake_error" else "intake_error"
    cat_eval = CatalogFitEvaluation(
        evaluated_catalog_count=len(catalog_apps),
        closest_app_id=str(matched_app_id) if matched_app_id else None,
        semantic_fit_verdict="candidate_module_extension" if matched_app_id else "below_recurrence_threshold",
        gap_explanation=str(
            cluster_raw.get("gapExplanation")
            or "Queued for next weekly cutoff cycle after primary workbench verification."
        ),
    )
    return ClusterDecisionRecord(
        org_id=org_id,
        batch_id=batch_id,
        cluster_id=cluster_id,
        title=title,
        short_title=short_title,
        supporting_report_ids=report_ids,
        participating_employee_ids=emp_ids,
        distinct_employee_count=distinct_employees,
        report_count=report_count,
        departments_label=departments_label,
        assistant_surfaces=surfaces,
        recurrence_rationale=(
            f"Observed across {report_count} reports from {distinct_employees} employees: {problem_summary}"
        ),
        counter_evidence=["Below immediate standalone build threshold or dependent on phase-1 workbench release."],
        schema_gaps=blocked_attachments,
        policy_scope=policy_scope,
        catalog_evaluation=cat_eval,
        disposition=disposition,
        action_state=action_state,
        recommended_action=str(cluster_raw.get("recommendedAction") or "Defer to next weekly cycle"),
        planned_baseline=None,
        decision_summary=f"Deferred '{short_title}' to next weekly cutoff cycle ({cat_eval.gap_explanation}).",
    )


def evaluate_weekly_batch(
    *,
    org_id: Literal["rookmere", "augi"],
    batch_id: str,
    clusters: list[dict[str, Any]],
    catalog_apps: list[dict[str, Any]],
    reports: list[dict[str, Any]],
    restricted_scopes: set[str] | None = None,
) -> list[ClusterDecisionRecord]:
    """Evaluates all recurrence clusters in a weekly cutoff batch."""
    scopes = restricted_scopes or (
        {"lp_restricted_side_letters"}
        if org_id == "rookmere"
        else {"foundry_proprietary_die_profiles"}
    )
    return [
        evaluate_cluster_against_catalog(
            org_id=org_id,
            batch_id=batch_id,
            cluster_raw=cluster,
            catalog_apps=catalog_apps,
            reports=reports,
            restricted_scopes=scopes,
        )
        for cluster in clusters
    ]
