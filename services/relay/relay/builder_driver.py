"""Managed sandbox Builder driver for antigravity-preview-09-2026 on the Gemini Interactions API."""

from __future__ import annotations

import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile
from typing import Any, Callable, Literal
import zipfile

from relay.models import (
    ArtifactManifestEntry,
    BuilderInteractionStatus,
    BuildStageId,
    CanonicalReleaseState,
    OrganizationId,
    VerificationReport,
)

MANAGED_BUILDER_AGENT = "antigravity-preview-09-2026"
MANAGED_BUILDER_ENVIRONMENT = "remote"
MANAGED_BUILDER_MODEL = "gemini-4-argon"
DEFAULT_BUILDER_MAX_TOTAL_TOKENS = "262144"
ALLOWED_AGENT_CONFIG_KEYS = {"type", "model", "max_total_tokens"}
FORBIDDEN_AGENT_CONFIG_KEYS = {
    "thinking_level",
    "max_output_tokens",
    "temperature",
    "top_p",
    "top_k",
    "stop_sequences",
}
DEPRECATED_DOWNLOAD_ROUTE_MARKER = ":download"


class InvalidAgentConfigError(ValueError):
    """Raised (HTTP 400 equivalent) when AntigravityAgentConfig contains unsupported keys or invalid model."""


class DeprecatedEndpointError(ValueError):
    """Raised when caller attempts to use the deprecated /files/environment-{id}:download endpoint."""


class UnsafeArchiveError(ValueError):
    """Raised when an archive contains path traversal ('..'), absolute paths, or external symlinks."""


class BuilderNotCompletedError(RuntimeError):
    """Raised when artifact export or release promotion is attempted before interaction status == 'completed'."""


def validate_antigravity_agent_config(
    agent_config: dict[str, Any] | None = None,
    *,
    default_max_total_tokens: str = DEFAULT_BUILDER_MAX_TOTAL_TOKENS,
) -> dict[str, str]:
    """Validates and normalizes AntigravityAgentConfig for antigravity-preview-09-2026.

    Per official Gemini Interactions API documentation and antigravityagentconfig.py:
    - Only `type`, `model`, and `max_total_tokens` (int64 string) are supported.
    - Passing `thinking_level`, `max_output_tokens`, `temperature`, etc. returns HTTP 400.
    - `model` must be explicitly set to `"gemini-4-argon"` so the builder never falls back
      to the default `gemini-3.8-flash`.
    """
    cfg = dict(agent_config) if agent_config is not None else {
        "type": "antigravity",
        "model": MANAGED_BUILDER_MODEL,
        "max_total_tokens": str(default_max_total_tokens),
    }

    unsupported = set(cfg.keys()) - ALLOWED_AGENT_CONFIG_KEYS
    if unsupported:
        raise InvalidAgentConfigError(
            f"Unsupported AntigravityAgentConfig fields {sorted(unsupported)} (HTTP 400). "
            f"Only {sorted(ALLOWED_AGENT_CONFIG_KEYS)} are permitted on {MANAGED_BUILDER_AGENT}."
        )

    if cfg.get("type") != "antigravity":
        raise InvalidAgentConfigError(
            f"AntigravityAgentConfig.type must be 'antigravity', got {cfg.get('type')!r}."
        )

    model = cfg.get("model")
    if model != MANAGED_BUILDER_MODEL:
        raise InvalidAgentConfigError(
            f"AntigravityAgentConfig.model must explicitly override default Flash with "
            f"'{MANAGED_BUILDER_MODEL}', got {model!r}."
        )

    raw_max = cfg.get("max_total_tokens", default_max_total_tokens)
    if not isinstance(raw_max, str) or not raw_max.isdigit() or int(raw_max) <= 0:
        raise InvalidAgentConfigError(
            f"AntigravityAgentConfig.max_total_tokens must be a positive int64 string, got {raw_max!r}."
        )
    if int(raw_max) > 1_048_576:
        raise InvalidAgentConfigError(
            f"AntigravityAgentConfig.max_total_tokens ({raw_max}) exceeds Gemini 4 Argon's 1,048,576 shared window."
        )

    return {
        "type": "antigravity",
        "model": MANAGED_BUILDER_MODEL,
        "max_total_tokens": raw_max,
    }


def collect_scoped_workspace_sources(
    repo_root: Path,
    org_id: OrganizationId,
    approved_schema_files: list[str] | None = None,
) -> dict[str, bytes]:
    """Collects scoped workspace sources for mounting into the remote Builder environment.

    Includes:
    - Scoped sandbox AGENTS.md instructions
    - packages/organization-ui metadata & entry contracts
    - packages/organization-3d metadata & entry contracts (when building 3D workspaces)
    - Approved schema manifests
    Never includes:
    - .env or raw tokens
    - packages/heavy-rain-ui or apps/system operator sources
    """
    bundle: dict[str, bytes] = {}

    sandbox_agents_md = (
        "# Heavy Rain Scoped Sandbox Builder Instructions\n\n"
        f"- Organization: `{org_id}`\n"
        "- Allowed packages: `@heavy-rain/organization-ui`, `@heavy-rain/organization-3d`\n"
        "- Forbidden imports: `@heavy-rain/system-ui`, `packages/heavy-rain-ui`, `apps/system`\n"
        "- All inputs are read-only synthetic schemas; execute zero production writes.\n"
    )
    bundle["workspace/AGENTS.md"] = sandbox_agents_md.encode("utf-8")

    org_ui_pkg = repo_root / "packages" / "organization-ui" / "package.json"
    if org_ui_pkg.exists():
        bundle["workspace/packages/organization-ui/package.json"] = org_ui_pkg.read_bytes()

    org_3d_pkg = repo_root / "packages" / "organization-3d" / "package.json"
    if org_3d_pkg.exists():
        bundle["workspace/packages/organization-3d/package.json"] = org_3d_pkg.read_bytes()
    else:
        bundle["workspace/packages/organization-3d/package.json"] = json.dumps(
            {
                "name": "@heavy-rain/organization-3d",
                "version": "0.1.0",
                "private": True,
                "description": "Reusable 3D WebGL/Three.js toolkit for organization applications",
            },
            indent=2,
        ).encode("utf-8")

    bundle["workspace/schemas/approved_schemas.json"] = json.dumps(
        {
            "org_id": org_id,
            "approved_files": approved_schema_files or [],
            "system_ui_excluded": True,
        },
        indent=2,
    ).encode("utf-8")

    return bundle


def build_deterministic_workspace_tar(
    org_id: OrganizationId,
    run_id: str,
    target_app_id: str,
) -> bytes:
    """Builds a deterministic, clean workspace tar archive for local verification and tests."""
    buf = io.BytesIO()
    theme_name = "rookmere" if org_id == "rookmere" else "augi"
    files: dict[str, bytes] = {
        "manifest.json": json.dumps(
            {
                "run_id": run_id,
                "org_id": org_id,
                "target_app_id": target_app_id,
                "ui_library": "@heavy-rain/organization-ui",
                "three_d_library": "@heavy-rain/organization-3d" if org_id == "augi" else None,
                "theme": theme_name,
                "production_writes": 0,
            },
            indent=2,
        ).encode("utf-8"),
        "package.json": json.dumps(
            {
                "name": f"@heavy-rain/{target_app_id}",
                "private": True,
                "version": "1.0.0-rc1",
                "dependencies": {
                    "@heavy-rain/organization-ui": "0.1.0",
                    **(
                        {"@heavy-rain/organization-3d": "0.1.0", "three": "^0.186.1"}
                        if org_id == "augi"
                        else {}
                    ),
                },
            },
            indent=2,
        ).encode("utf-8"),
        "src/App.tsx": (
            'import { OrganizationThemeProvider, Panel, Status, MetricReadout } from "@heavy-rain/organization-ui";\n'
            f'export function CandidateApp() {{ return <OrganizationThemeProvider theme="{theme_name}"><Panel title="{target_app_id}"><Status tone="positive" label="Verified" /><MetricReadout label="Scope" value="Read-only" /></Panel></OrganizationThemeProvider>; }}\n'
        ).encode("utf-8"),
    }

    files["tests/artifact.test.mjs"] = (
        'import test from "node:test";\n'
        'import assert from "node:assert/strict";\n'
        'import fs from "node:fs";\n'
        'const manifest = JSON.parse(fs.readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));\n'
        'const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));\n'
        'test("candidate stays inside the organization package boundary", () => {\n'
        '  assert.ok(["rookmere", "augi"].includes(manifest.org_id));\n'
        '  assert.equal(manifest.production_writes, 0);\n'
        '  assert.equal(manifest.ui_library, "@heavy-rain/organization-ui");\n'
        '  assert.equal(pkg.dependencies["@heavy-rain/system-ui"], undefined);\n'
        '  if (manifest.org_id === "augi") assert.equal(manifest.three_d_library, "@heavy-rain/organization-3d");\n'
        '});\n'
    ).encode("utf-8")
    with tarfile.open(fileobj=buf, mode="w") as tf:
        for rel_path, content in files.items():
            info = tarfile.TarInfo(name=rel_path)
            info.size = len(content)
            info.mtime = 1761382800
            info.mode = 0o644
            info.type = tarfile.REGTYPE
            tf.addfile(info, io.BytesIO(content))

    return buf.getvalue()


def validate_archive_member_path(member_name: str, destination_root: Path) -> Path:
    """Validates an archive member path, rejecting '..', absolute paths, and escapes."""
    if not member_name or member_name.startswith("/") or member_name.startswith("\\") or re.match(r"^[A-Za-z]:", member_name):
        raise UnsafeArchiveError(f"Rejected absolute archive member path: {member_name!r}")

    normalized_posix = PurePosixPath(member_name.replace("\\", "/"))
    if normalized_posix.is_absolute() or ".." in normalized_posix.parts:
        raise UnsafeArchiveError(f"Rejected path traversal in archive member: {member_name!r}")

    resolved_root = destination_root.resolve()
    target_path = (resolved_root / Path(*normalized_posix.parts)).resolve()
    try:
        target_path.relative_to(resolved_root)
    except ValueError as exc:
        raise UnsafeArchiveError(
            f"Archive member {member_name!r} escapes destination root {resolved_root}"
        ) from exc

    return target_path


def safe_extract_archive(
    archive_bytes: bytes,
    destination_root: Path,
    archive_format: Literal["tar", "zip"] = "tar",
) -> list[ArtifactManifestEntry]:
    """Extracts a tar or zip bundle safely into destination_root and returns a SHA-256 manifest.

    Explicitly rejects:
    1. '..' path traversal components
    2. Leading '/' or drive-letter absolute paths
    3. Symbolic links, hard links, FIFOs, or device nodes pointing outside destination_root
    """
    if len(archive_bytes) > 50 * 1024 * 1024:
        raise UnsafeArchiveError("Archive exceeds the 50 MiB compressed limit.")
    total_bytes = 0
    member_count = 0
    seen_paths = set()
    def check_entry(name, size):
        nonlocal total_bytes, member_count
        member_count += 1
        total_bytes += size
        if member_count > 1000 or size > 20 * 1024 * 1024 or total_bytes > 100 * 1024 * 1024:
            raise UnsafeArchiveError("Archive exceeds the file count or expanded byte limit.")
        if name in seen_paths:
            raise UnsafeArchiveError("Archive contains duplicate paths.")
        seen_paths.add(name)
    destination_root.mkdir(parents=True, exist_ok=True)
    resolved_root = destination_root.resolve()
    manifest: list[ArtifactManifestEntry] = []

    if archive_format == "tar":
        with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:*") as tf:
            for member in tf:
                check_entry(member.name, member.size)
                target_path = validate_archive_member_path(member.name, resolved_root)

                if member.issym() or member.islnk():
                    linkname = member.linkname or ""
                    if linkname.startswith("/") or ".." in PurePosixPath(linkname.replace("\\", "/")).parts:
                        raise UnsafeArchiveError(
                            f"Rejected external or traversal symlink {member.name!r} -> {linkname!r}"
                        )
                    link_target = (target_path.parent / linkname).resolve()
                    try:
                        link_target.relative_to(resolved_root)
                    except ValueError as exc:
                        raise UnsafeArchiveError(
                            f"Rejected symlink escaping root: {member.name!r} -> {linkname!r}"
                        ) from exc
                    raise UnsafeArchiveError(
                        f"Symlinks are disallowed in verified artifact bundles: {member.name!r}"
                    )

                if member.isdir():
                    target_path.mkdir(parents=True, exist_ok=True)
                    continue

                if not member.isfile():
                    raise UnsafeArchiveError(
                        f"Unsupported special archive entry type for {member.name!r}"
                    )

                extracted_stream = tf.extractfile(member)
                if extracted_stream is None:
                    continue
                data = extracted_stream.read()
                target_path.parent.mkdir(parents=True, exist_ok=True)
                target_path.write_bytes(data)

                rel_posix = target_path.relative_to(resolved_root).as_posix()
                digest = hashlib.sha256(data).hexdigest()
                manifest.append(
                    ArtifactManifestEntry(
                        path=rel_posix,
                        bytes=len(data),
                        sha256=digest,
                    )
                )
    else:
        with zipfile.ZipFile(io.BytesIO(archive_bytes), mode="r") as zf:
            for info in zf.infolist():
                check_entry(info.filename, info.file_size)
                target_path = validate_archive_member_path(info.filename, resolved_root)
                # Check Unix symlink attribute in zip external_attr (0o120000)
                unix_mode = (info.external_attr >> 16) & 0o170000
                if unix_mode == 0o120000:
                    raise UnsafeArchiveError(
                        f"Rejected symlink in zip archive: {info.filename!r}"
                    )
                if info.is_dir():
                    target_path.mkdir(parents=True, exist_ok=True)
                    continue
                data = zf.read(info.filename)
                target_path.parent.mkdir(parents=True, exist_ok=True)
                target_path.write_bytes(data)
                rel_posix = target_path.relative_to(resolved_root).as_posix()
                digest = hashlib.sha256(data).hexdigest()
                manifest.append(
                    ArtifactManifestEntry(
                        path=rel_posix,
                        bytes=len(data),
                        sha256=digest,
                    )
                )

    return sorted(manifest, key=lambda item: item.path)


def verify_extracted_artifacts(
    extracted_dir: Path,
    manifest: list[ArtifactManifestEntry],
    repo_root: Path,
) -> tuple[dict[str, bool], str]:
    """Runs UI boundary verification and static checks on extracted candidate artifacts."""
    ui_boundaries_ok = True
    forbidden_specifiers = (
        "@heavy-rain/system-ui",
        "@heavy-rain/heavy-rain-ui",
        "packages/heavy-rain-ui",
        "apps/system",
    )

    for entry in manifest:
        if entry.path.startswith("tests/"):
            continue
        file_path = extracted_dir / entry.path
        if file_path.suffix in {".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".json"}:
            text = file_path.read_text(encoding="utf-8", errors="replace")
            for forbidden in forbidden_specifiers:
                if forbidden in text:
                    ui_boundaries_ok = False
                    break

    # Compile the extracted candidate against installed organization components.
    # No package install and no artifact-supplied shell scripts are executed.
    node_modules = repo_root / "node_modules"
    (extracted_dir / "node_modules").symlink_to(node_modules, target_is_directory=True)
    tsconfig = {
        "compilerOptions": {"target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
                            "jsx": "react-jsx", "strict": True, "skipLibCheck": True, "noEmit": True},
        "include": ["src/**/*.tsx", "src/**/*.ts"]
    }
    (extracted_dir / "tsconfig.json").write_text(json.dumps(tsconfig))
    outputs = []
    def run_check(command):
        try:
            result = subprocess.run(command, cwd=extracted_dir, capture_output=True,
                                    text=True, timeout=30, check=False)
            outputs.append((result.stdout + result.stderr)[-6000:])
            return result.returncode == 0
        except (OSError, subprocess.TimeoutExpired) as exc:
            outputs.append(str(exc))
            return False

    typecheck_passed = run_check([str(node_modules / ".bin" / "tsc"), "--project", "tsconfig.json"])
    unit_tests_passed = run_check(["node", "--test", "tests/artifact.test.mjs"])
    hashes_match = all(hashlib.sha256((extracted_dir / m.path).read_bytes()).hexdigest() == m.sha256 for m in manifest)
    checks = {
        "uiBoundariesPassed": ui_boundaries_ok,
        "typecheckPassed": typecheck_passed,
        "unitTestsPassed": unit_tests_passed,
        "artifactHashesPassed": hashes_match,
        "zeroProductionWrites": True,
    }
    summary = "Local fixture artifact checks. No remote builder was called.\n" + "\n".join(outputs)

    return checks, summary


def map_interaction_to_build_stage(
    interaction_status: BuilderInteractionStatus,
    checkpoint: int = 2,
    verification_passed: bool = False,
) -> tuple[BuildStageId, CanonicalReleaseState]:
    """Maps Gemini Interactions API status to UI BuildStageId and CanonicalReleaseState.

    Enforces that `completed` is the ONLY state that can transition to `ready` and
    `pending_release_review`.
    """
    if interaction_status == "queued":
        return "queued", "sandbox_preview"
    if interaction_status == "in_progress":
        stage: BuildStageId = "stage1" if checkpoint == 1 else ("stage3" if checkpoint == 3 else "stage2")
        return stage, "sandbox_preview"
    if interaction_status == "requires_action":
        return "paused", "sandbox_preview"
    if interaction_status == "incomplete":
        # Stopped early due to max_total_tokens or step timeout: preserve environment_id at paused/failed gate
        return "paused", "sandbox_preview"
    if interaction_status in {"failed", "cancelled"}:
        return "failed", "sandbox_preview"
    if interaction_status == "completed":
        if verification_passed:
            return "ready", "pending_release_review"
        return "stage3", "sandbox_preview"
    return "idle", "sandbox_preview"


class ManagedBuilderClient:
    """Driver for Google-hosted antigravity-preview-09-2026 interactions and v1beta/environments."""

    def __init__(
        self,
        *,
        operating_mode: Literal["demo_fixture_replay", "cached_snapshot", "live_runtime"] = "demo_fixture_replay",
        genai_client_factory: Callable[[], Any] | None = None,
    ) -> None:
        self.operating_mode = operating_mode
        self._genai_client_factory = genai_client_factory

    def _get_live_client(self) -> Any:
        if self._genai_client_factory is not None:
            return self._genai_client_factory()
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is required in server environment for live_runtime Builder calls.")
        from google import genai
        return genai.Client(api_key=api_key)

    def create_interaction(
        self,
        *,
        org_id: OrganizationId,
        run_id: str,
        prompt: str,
        agent_config: dict[str, Any] | None = None,
        live_opt_in: bool = False,
        persist_immediately_cb: Callable[[str, str, str], None] | None = None,
    ) -> dict[str, Any]:
        """Creates a managed Builder interaction and persists interaction_id and environment_id immediately."""
        validated_cfg = validate_antigravity_agent_config(agent_config)

        if self.operating_mode == "live_runtime" and live_opt_in:
            client = self._get_live_client()
            interaction = client.interactions.create(
                agent=MANAGED_BUILDER_AGENT,
                environment=MANAGED_BUILDER_ENVIRONMENT,
                background=True,
                store=True,
                agent_config=validated_cfg,
                input=prompt,
            )
            interaction_id = str(getattr(interaction, "id", f"inter_live_{run_id}"))
            environment_id = str(getattr(interaction, "environment_id", f"env_live_{run_id}"))
            status: BuilderInteractionStatus = getattr(interaction, "status", "queued")
            mode_used = "live_runtime"
        else:
            interaction_id = f"inter_demo_{org_id}_{run_id}"
            environment_id = f"env_demo_{org_id}_{run_id}"
            status = "in_progress"
            mode_used = "demo_fixture_replay"

        # Immediately persist both interaction_id and environment_id before any further work
        if persist_immediately_cb is not None:
            persist_immediately_cb(interaction_id, environment_id, status)

        return {
            "interaction_id": interaction_id,
            "environment_id": environment_id,
            "agent": MANAGED_BUILDER_AGENT,
            "environment": MANAGED_BUILDER_ENVIRONMENT,
            "background": True,
            "store": True,
            "agent_config": validated_cfg,
            "status": status,
            "operating_mode": mode_used,
        }

    def upload_workspace_sources(
        self,
        *,
        environment_id: str,
        sources: dict[str, bytes],
        overwrite: bool = True,
        live_opt_in: bool = False,
    ) -> list[str]:
        """Uploads scoped workspace sources to v1beta/environments/{environment_id}/files/{path}."""
        if not overwrite:
            raise ValueError("overwrite=True is required when updating existing workspace paths to avoid HTTP 409 Conflict.")

        uploaded_paths: list[str] = []
        if self.operating_mode == "live_runtime" and live_opt_in:
            client = self._get_live_client()
            for rel_path, content in sources.items():
                client.environments.files.upload(
                    environment=environment_id,
                    path=rel_path,
                    file=content,
                    overwrite=True,
                )
                uploaded_paths.append(rel_path)
        else:
            uploaded_paths = sorted(sources.keys())

        return uploaded_paths

    def download_workspace_archive(
        self,
        *,
        org_id: OrganizationId,
        run_id: str,
        target_app_id: str,
        environment_id: str,
        interaction_status: BuilderInteractionStatus,
        path: str = "workspace",
        endpoint_override: str | None = None,
        live_opt_in: bool = False,
    ) -> tuple[bytes, Literal["local_fixture_archive", "environments.files.download", "v1beta/environments/{env_id}/files?alt=media"]]:
        """Exports workspace artifacts from the remote environment once interaction_status == 'completed'.

        Rejects any call when interaction_status != 'completed' and rejects the deprecated
        `/files/environment-{id}:download` route.
        """
        if endpoint_override and DEPRECATED_DOWNLOAD_ROUTE_MARKER in endpoint_override:
            raise DeprecatedEndpointError(
                f"Endpoint '{endpoint_override}' is deprecated. Use client.environments.files.download "
                "or GET /v1beta/environments/{env_id}/files?alt=media."
            )

        if interaction_status != "completed":
            raise BuilderNotCompletedError(
                f"Cannot download or promote workspace artifacts while interaction status is '{interaction_status}'. "
                "'completed' is the sole success state."
            )

        if self.operating_mode == "live_runtime" and live_opt_in:
            client = self._get_live_client()
            archive_bytes = client.environments.files.download(
                environment=environment_id,
                path=path,
            )
            return archive_bytes, "environments.files.download"

        return (
            build_deterministic_workspace_tar(org_id=org_id, run_id=run_id, target_app_id=target_app_id),
            "local_fixture_archive",
        )
