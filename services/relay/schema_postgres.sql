-- Heavy Rain Production PostgreSQL Schema (services/relay/schema_postgres.sql)
-- Enforces tenant isolation (rookmere vs augi), versioned weekly cutoffs,
-- organization timezones, idempotent MCP intake, managed builder interaction
-- persistence, verified artifact SHA-256 manifests, and immutable audit logs.

CREATE TABLE IF NOT EXISTS organizations (
    org_id TEXT PRIMARY KEY CHECK (org_id IN ('rookmere', 'augi')),
    canonical_org_id TEXT NOT NULL UNIQUE CHECK (canonical_org_id IN ('org_rookmere', 'org_augi')),
    name TEXT NOT NULL,
    legal_entity TEXT NOT NULL,
    sector TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    theme_id TEXT NOT NULL,
    weekly_schedule_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS weekly_batches (
    batch_id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(org_id) ON DELETE RESTRICT,
    cutoff_version INTEGER NOT NULL DEFAULT 1,
    org_timezone TEXT NOT NULL DEFAULT 'UTC',
    window_start TIMESTAMPTZ NOT NULL,
    window_cutoff TIMESTAMPTZ NOT NULL,
    cutoff_locked BOOLEAN NOT NULL DEFAULT FALSE,
    batch_run_status TEXT NOT NULL CHECK (
        batch_run_status IN (
            'collecting',
            'cutoff_locked',
            'grouping_reports',
            'awaiting_operator_decision',
            'complete'
        )
    ),
    weekly_run_status_label TEXT NOT NULL CHECK (
        weekly_run_status_label IN (
            'Idle',
            'Grouping reports',
            'Awaiting operator decision',
            'Complete'
        )
    ),
    replay_idempotency_key TEXT,
    evaluated_at TIMESTAMPTZ,
    UNIQUE (org_id, batch_id, cutoff_version)
);

CREATE TABLE IF NOT EXISTS mcp_reports (
    report_id TEXT PRIMARY KEY,
    receipt_id TEXT NOT NULL UNIQUE,
    org_id TEXT NOT NULL REFERENCES organizations(org_id) ON DELETE RESTRICT,
    batch_id TEXT NOT NULL REFERENCES weekly_batches(batch_id) ON DELETE RESTRICT,
    idempotency_key TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    employee_name TEXT NOT NULL,
    employee_title TEXT NOT NULL,
    department_label TEXT NOT NULL,
    office TEXT NOT NULL,
    role_id TEXT NOT NULL,
    assistant_surface TEXT NOT NULL,
    mcp_tool_name TEXT NOT NULL DEFAULT 'heavyrain_submit_work_report',
    user_inspected_outgoing_payload BOOLEAN NOT NULL CHECK (user_inspected_outgoing_payload = TRUE),
    host_chat_history_excluded BOOLEAN NOT NULL CHECK (host_chat_history_excluded = TRUE),
    cluster_id TEXT NOT NULL,
    data_scope TEXT NOT NULL,
    policy_scope_label TEXT NOT NULL,
    task_summary TEXT NOT NULL,
    untrusted_payload_envelope JSONB NOT NULL,
    redaction_manifest JSONB NOT NULL,
    attachments_json JSONB NOT NULL,
    missing_evidence_note TEXT,
    status TEXT NOT NULL CHECK (
        status IN ('queued_for_cutoff', 'clustered_in_batch', 'routed_to_existing_app', 'awaiting_missing_evidence', 'withdrawn', 'deleted_tombstone')
    ),
    submitted_at TIMESTAMPTZ NOT NULL,
    withdrawn_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    UNIQUE (org_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS recurrence_clusters (
    cluster_id TEXT NOT NULL,
    org_id TEXT NOT NULL REFERENCES organizations(org_id) ON DELETE RESTRICT,
    batch_id TEXT NOT NULL REFERENCES weekly_batches(batch_id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    short_title TEXT NOT NULL,
    disposition TEXT NOT NULL CHECK (
        disposition IN ('build_in_sandbox', 'reuse_existing_app', 'request_missing_evidence', 'queued_next_cycle')
    ),
    action_state TEXT NOT NULL CHECK (
        action_state IN (
            'pending_triage',
            'building_in_sandbox',
            'routed_to_app',
            'evidence_requested',
            'evidence_received',
            'deferred_next_run',
            'intake_error'
        )
    ),
    report_count INTEGER NOT NULL,
    distinct_employee_count INTEGER NOT NULL,
    departments_label TEXT NOT NULL,
    assistant_surfaces_json JSONB NOT NULL,
    problem_summary TEXT NOT NULL,
    policy_scope TEXT NOT NULL,
    matched_app_id TEXT,
    matched_app_name TEXT,
    matched_app_version TEXT,
    gap_explanation TEXT NOT NULL,
    recommended_action TEXT NOT NULL,
    missing_evidence_detail TEXT,
    missing_evidence_assignee TEXT,
    report_ids_json JSONB NOT NULL,
    decision_record_json JSONB,
    PRIMARY KEY (org_id, cluster_id)
);

CREATE TABLE IF NOT EXISTS builder_runs (
    run_id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(org_id) ON DELETE RESTRICT,
    batch_id TEXT NOT NULL REFERENCES weekly_batches(batch_id) ON DELETE RESTRICT,
    cluster_id TEXT NOT NULL,
    target_app_id TEXT NOT NULL,
    target_app_name TEXT NOT NULL,
    interaction_id TEXT NOT NULL,
    environment_id TEXT NOT NULL,
    agent_name TEXT NOT NULL DEFAULT 'antigravity-preview-09-2026',
    environment_mode TEXT NOT NULL DEFAULT 'remote',
    model_name TEXT NOT NULL DEFAULT 'gemini-4-argon',
    max_total_tokens TEXT NOT NULL DEFAULT '262144',
    operating_mode TEXT NOT NULL CHECK (operating_mode IN ('demo_fixture_replay', 'cached_snapshot', 'live_runtime')),
    interaction_status TEXT NOT NULL CHECK (
        interaction_status IN ('queued', 'in_progress', 'requires_action', 'completed', 'incomplete', 'failed', 'cancelled')
    ),
    build_stage TEXT NOT NULL CHECK (
        build_stage IN ('idle', 'loading', 'queued', 'stage1', 'stage2', 'stage3', 'paused', 'failed', 'ready')
    ),
    last_active_checkpoint INTEGER NOT NULL DEFAULT 1 CHECK (last_active_checkpoint IN (1, 2, 3)),
    app_release_state TEXT NOT NULL CHECK (
        app_release_state IN ('sandbox_preview', 'pending_release_review', 'deployed_approved')
    ),
    app_release_status TEXT NOT NULL CHECK (
        app_release_status IN (
            'catalog_approved',
            'in_sandbox_review',
            'scope_approval_needed',
            'released',
            'changes_requested',
            'release_check_failed'
        )
    ),
    tokens_used INTEGER NOT NULL DEFAULT 0,
    requires_action_detail TEXT,
    error_reason TEXT,
    artifact_manifest_json JSONB,
    verification_report_json JSONB,
    approved_release_json JSONB,
    change_request_notes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    audit_id BIGSERIAL PRIMARY KEY,
    org_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    target_id TEXT NOT NULL,
    operating_mode TEXT NOT NULL,
    detail_json JSONB NOT NULL,
    prev_hash TEXT NOT NULL,
    entry_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
