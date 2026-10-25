"""Security, tenant isolation, role-scoped access, and explicit MCP intake validation."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import re
from typing import Any

from relay.fixtures_loader import load_raw_demo_json
from relay.models import (
    EvidenceAttachment,
    McpSubmitWorkReportRequest,
    OrganizationId,
    normalize_org_id,
)

ALLOWED_ASSISTANT_SURFACES = {
    "Claude Desktop",
    "Claude Web",
    "Claude Desktop (MCP v2026-07-28)",
    "Gemini Workspace",
    "ChatGPT Enterprise",
    "Policy-Scoped Local Hook",
    "Antigravity CLI (agy)",
}

ALLOWED_EXTENSIONS = {".csv", ".json", ".xlsx", ".pdf", ".txt", ".md"}
MACRO_EXTENSIONS = {".xlsm", ".xlsb", ".docm", ".pptm", ".vba", ".vbs", ".exe", ".sh", ".bat"}
SHA256_PATTERN = re.compile(r"^[a-fA-F0-9]{64}$")

PROMPT_INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(all\s+)?(previous|prior)\s+instructions", re.IGNORECASE),
    re.compile(r"grant\s+admin", re.IGNORECASE),
    re.compile(r"override\s+policy", re.IGNORECASE),
    re.compile(r"system\s+prompt", re.IGNORECASE),
]


class TenantIsolationError(PermissionError):
    """Raised when an actor or request crosses the Rookmere vs AUGI tenant boundary."""


class RolePermissionError(PermissionError):
    """Raised when an employee or role lacks permission for the requested action or data scope."""


class McpIntakePolicyError(ValueError):
    """Raised when an MCP submission fails explicit consent, redaction, or attachment policy checks."""

    def __init__(
        self,
        message: str,
        *,
        error_code: str = "mcp_policy_violation",
        offending_filename: str | None = None,
        policy_status: str | None = None,
        recovery_actions: list[str] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.offending_filename = offending_filename
        self.policy_status = policy_status
        self.recovery_actions = recovery_actions or []


class ReportRevocationError(ValueError):
    """Raised when report withdrawal is attempted after weekly cutoff lock or past the 72-hour window."""


def verify_tenant_isolation(
    route_org_id: str,
    header_org_id: str | None = None,
    payload_org_id: str | None = None,
    actor_id: str | None = None,
) -> OrganizationId:
    """Enforces strict tenant isolation between Rookmere Capital ('rookmere') and AUGI ('augi')."""
    target_org = normalize_org_id(route_org_id)

    if header_org_id:
        try:
            hdr_org = normalize_org_id(header_org_id)
        except ValueError as exc:
            raise TenantIsolationError(str(exc)) from exc
        if hdr_org != target_org:
            raise TenantIsolationError(
                f"Cross-tenant access denied: header org '{hdr_org}' cannot access route org '{target_org}'."
            )

    if payload_org_id:
        try:
            body_org = normalize_org_id(payload_org_id)
        except ValueError as exc:
            raise TenantIsolationError(str(exc)) from exc
        if body_org != target_org:
            raise TenantIsolationError(
                f"Cross-tenant payload denied: payload org '{body_org}' does not match route org '{target_org}'."
            )

    if actor_id:
        cleaned_actor = actor_id.strip().lower()
        if cleaned_actor.startswith("emp_rm_") and target_org != "rookmere":
            raise TenantIsolationError(
                f"Cross-tenant actor denied: Rookmere employee '{actor_id}' cannot access AUGI tenant."
            )
        if cleaned_actor.startswith("emp_augi_") and target_org != "augi":
            raise TenantIsolationError(
                f"Cross-tenant actor denied: AUGI employee '{actor_id}' cannot access Rookmere tenant."
            )

    return target_org


def get_org_security_catalog(org_id: OrganizationId) -> dict[str, Any]:
    """Loads roles, employees, and capture policy from canonical demo JSON."""
    raw = load_raw_demo_json(org_id)
    roles_list = raw.get("roles_and_access", {}).get("roles", [])
    roles_by_id = {r["role_id"]: r for r in roles_list}
    employees_by_id = {e["employee_id"]: e for e in raw.get("employees", [])}
    capture_policy = raw.get("roles_and_access", {}).get("capture_policy", {})
    return {
        "roles_by_id": roles_by_id,
        "employees_by_id": employees_by_id,
        "capture_policy": capture_policy,
    }


def verify_role_permission(
    org_id: OrganizationId,
    *,
    employee_id: str,
    role_id: str | None = None,
    required_capability: str | None = None,
    required_data_scope: str | None = None,
) -> dict[str, Any]:
    """Verifies employee tenant membership, role assignment, capability flags, and data scope permissions."""
    verify_tenant_isolation(org_id, actor_id=employee_id)
    sec = get_org_security_catalog(org_id)
    employees_by_id = sec["employees_by_id"]
    roles_by_id = sec["roles_by_id"]

    emp = employees_by_id.get(employee_id)
    if not emp:
        raise RolePermissionError(
            f"Employee '{employee_id}' is not registered in organization '{org_id}'."
        )

    effective_role_id = role_id or emp.get("role_id")
    if emp.get("role_id") != effective_role_id:
        raise RolePermissionError(
            f"Employee '{employee_id}' holds role '{emp.get('role_id')}', not '{effective_role_id}'."
        )

    role = roles_by_id.get(effective_role_id)
    if not role:
        raise RolePermissionError(
            f"Role '{effective_role_id}' is not defined in organization '{org_id}'."
        )

    if required_capability and not role.get(required_capability, False):
        raise RolePermissionError(
            f"Role '{effective_role_id}' ({role.get('title')}) lacks required capability '{required_capability}'."
        )

    if required_data_scope:
        permitted = set(role.get("permitted_data_scopes", []))
        restricted = set(role.get("restricted_data_scopes", []))
        if required_data_scope in restricted or (permitted and required_data_scope not in permitted):
            raise RolePermissionError(
                f"Role '{effective_role_id}' is not cleared for data scope '{required_data_scope}'."
            )

    return {"employee": emp, "role": role}


def sanitize_untrusted_evidence_envelope(
    task_summary: str,
    outgoing_payload_preview: dict[str, Any],
    attachments: list[EvidenceAttachment],
) -> dict[str, Any]:
    """Wraps submitted conversation excerpts, attachments, and tool outputs strictly as untrusted data.

    Never treats submitted text or JSON fields as executable instructions or permission grants.
    """
    flagged_patterns: list[str] = []
    for pattern in PROMPT_INJECTION_PATTERNS:
        if pattern.search(task_summary):
            flagged_patterns.append(pattern.pattern)

    # Strip any keys attempting to self-grant permissions inside outgoing_payload_preview
    forbidden_grant_keys = {
        "grant_permissions",
        "override_role",
        "bypass_policy",
        "execute_shell",
        "system_instructions",
    }
    sanitized_preview = {
        k: v
        for k, v in outgoing_payload_preview.items()
        if k not in forbidden_grant_keys
    }
    sanitized_preview["chat_transcript_included"] = False

    return {
        "_trust_level": "untrusted_employee_evidence_data",
        "_executable_instructions_allowed": False,
        "_permission_grants_allowed": False,
        "injection_patterns_neutralized": flagged_patterns,
        "task_summary_data": task_summary,
        "outgoing_payload_preview": sanitized_preview,
        "attachment_digests": [
            {"filename": a.filename, "sha256": a.sha256, "bytes": a.bytes, "policyStatus": a.policyStatus}
            for a in attachments
        ],
    }


def validate_mcp_submission(
    org_id: OrganizationId,
    request: McpSubmitWorkReportRequest,
) -> tuple[dict[str, Any], list[EvidenceAttachment], dict[str, Any]]:
    """Validates an explicit MCP work report submission against organizational consent and file policies."""
    # 1. Tenant isolation check
    verify_tenant_isolation(org_id, payload_org_id=request.org_id, actor_id=request.employee_id)

    # 2. Explicit MCP tool name & consent invariants (never passive scraping)
    if request.mcp_tool_name != "heavyrain_submit_work_report":
        raise McpIntakePolicyError(
            f"Unsupported MCP tool '{request.mcp_tool_name}'. Use 'heavyrain_submit_work_report'.",
            error_code="invalid_mcp_tool",
        )
    if not request.user_inspected_outgoing_payload:
        raise McpIntakePolicyError(
            "Explicit outgoing payload inspection (user_inspected_outgoing_payload=true) is required before submission.",
            error_code="uninspected_outgoing_payload",
            recovery_actions=["Preview and confirm the exact outgoing work report payload in your assistant client."],
        )
    if not request.host_chat_history_excluded:
        raise McpIntakePolicyError(
            "Full host chat history must be excluded (host_chat_history_excluded=true). Heavy Rain never ingests passive chat transcripts.",
            error_code="passive_chat_history_rejected",
            recovery_actions=["Remove raw chat transcripts and submit only the user-inspected task summary and approved schema files."],
        )
    if not request.redaction_manifest.client_redaction_applied:
        raise McpIntakePolicyError(
            "Client redaction manifest must confirm client_redaction_applied=true.",
            error_code="redaction_manifest_incomplete",
        )
    if request.outgoing_payload_preview.get("chat_transcript_included") is True:
        raise McpIntakePolicyError(
            "outgoing_payload_preview indicates chat_transcript_included=true, which violates organization capture policy.",
            error_code="passive_chat_history_rejected",
        )

    # 3. Assistant surface validation
    if request.assistant_surface not in ALLOWED_ASSISTANT_SURFACES:
        raise McpIntakePolicyError(
            f"Assistant surface '{request.assistant_surface}' is not registered under organization policy.",
            error_code="unsupported_assistant_surface",
        )

    # 4. Role & scope verification
    actor_ctx = verify_role_permission(
        org_id,
        employee_id=request.employee_id,
        role_id=request.role_id,
        required_capability="can_submit_mcp_reports",
        required_data_scope=request.data_scope,
    )

    # 5. Attachment SHA-256, byte size, and macro policy check
    validated_attachments: list[EvidenceAttachment] = []
    for att in request.attachments:
        fname = att.filename.strip()
        lower_name = fname.lower()
        ext = "." + lower_name.rsplit(".", 1)[-1] if "." in lower_name else ""

        if ext in MACRO_EXTENSIONS:
            raise McpIntakePolicyError(
                f"Attachment '{fname}' uses macros outside organization policy. Ask the sender for a plain '.xlsx' or '.csv' export.",
                error_code="attachment_policy_violation",
                offending_filename=fname,
                policy_status="blocked_macro",
                recovery_actions=[
                    "Export the sheet as a macro-free '.xlsx' or '.csv' file and resubmit.",
                    "Keep the report text only and attach the sanitized schema later.",
                ],
            )

        if ext not in ALLOWED_EXTENSIONS:
            raise McpIntakePolicyError(
                f"Attachment '{fname}' has unsupported extension '{ext}'. Allowed extensions: {sorted(ALLOWED_EXTENSIONS)}.",
                error_code="attachment_extension_violation",
                offending_filename=fname,
                recovery_actions=["Convert the sample file to .xlsx, .csv, .json, or .pdf before submitting."],
            )

        if not SHA256_PATTERN.match(att.sha256):
            raise McpIntakePolicyError(
                f"Attachment '{fname}' is missing a valid hexadecimal SHA-256 digest.",
                error_code="invalid_attachment_sha256",
                offending_filename=fname,
            )

        validated_attachments.append(
            EvidenceAttachment(
                filename=fname,
                kind=att.kind,
                bytes=att.bytes,
                sha256=att.sha256.lower(),
                policyStatus="approved",
            )
        )

    envelope = sanitize_untrusted_evidence_envelope(
        request.task_summary,
        request.outgoing_payload_preview,
        validated_attachments,
    )
    return actor_ctx, validated_attachments, envelope


def verify_pre_cutoff_revocation_allowed(
    *,
    submitted_at_iso: str,
    cutoff_locked: bool,
    now_utc: datetime | None = None,
    revocation_window_hours: int = 72,
) -> None:
    """Enforces that report withdrawal happens before weekly cutoff lock and within the 72-hour window."""
    if cutoff_locked:
        raise ReportRevocationError(
            "Cannot withdraw report after the weekly cutoff batch has been locked. "
            "Submit a revision for the next weekly cutoff cycle or request admin deletion."
        )
    now = now_utc or datetime.now(timezone.utc)
    try:
        cleaned = submitted_at_iso.replace(" UTC", "Z").replace(" ", "T")
        if not cleaned.endswith("Z") and "+" not in cleaned:
            cleaned += "Z"
        submitted_dt = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
    except ValueError:
        submitted_dt = now

    if now - submitted_dt > timedelta(hours=revocation_window_hours):
        raise ReportRevocationError(
            f"Report withdrawal window ({revocation_window_hours} hours) has expired."
        )
