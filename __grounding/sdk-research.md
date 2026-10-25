# Antigravity managed builder, coordinator SDK, and Gemini 4 Argon grounding

**Retrieved and verified:** 2026-10-25
**Scope:** Primary documentation grounding for Heavy Rain's production builder service (`antigravity-preview-09-2026` on the Gemini Interactions API), **Cairn** coordinator (`google-antigravity 0.1.22`), and local `agy` development workforce. No paid sandbox API calls were executed during this documentation pass; sections below distinguish verified local tooling, documented API contracts, and unexecuted runtime paths.

---

## 1. Three distinct agent surfaces and their roles in Heavy Rain

| Surface | Package / Endpoint | Execution Environment | Role in Heavy Rain | Token & Thinking Controls |
| --- | --- | --- | --- | --- |
| **1. Production Builders: Gemini API Managed Antigravity Agent** | Gemini Interactions API (`agent="antigravity-preview-09-2026"`, `environment="remote"`) | Google-hosted remote Linux container (4 vCPU, 16 GB RAM) provisioned per interaction or resumed via `environment_id`. | **Selected production Builder architecture:** Generates reviewable organization app artifacts inside a managed remote container and exports files via the Environments API. | `AntigravityAgentConfig` exposes **only** `type` (`"antigravity"`), `model` (`"gemini-4-argon"`), and `max_total_tokens` (int64 string). No `thinking_level` or `max_output_tokens` knob is exposed; reasoning is adaptive server-side. |
| **2. Cairn Coordinator: Antigravity Python SDK** | PyPI `google-antigravity==0.1.22` | Local or server coordinator runtime wrapping the compiled `localharness` binary. | **Weekly batch orchestrator (Cairn):** Clusters MCP work reports, evaluates the approved app catalog, and coordinates workers. | Uses `gemini-4-argon` (`high` thinking) within the `1,048,576` shared token window; exposes `GeminiModelOptions(max_output_tokens=...)` and `CapabilitiesConfig(mcp_max_output_bytes=...)`. |
| **3. Development Workforce: Antigravity CLI (`agy`)** | Local `agy` CLI binary | Developer workstation with optional OS terminal sandbox (`sandbox-exec` on macOS, `bwrap` on Linux) and git worktrees (`Workspace="branch"`). | **Repository development workforce:** Runs all development subagents, copy writing, and local build tasks for this repo. | Runs `--model gemini-4-argon-high --effort high` (`high` is the highest documented thinking level on `gemini-4-argon`). |

> **Do not conflate surfaces:** Production **Builders** use the hosted `antigravity-preview-09-2026` Interactions API service—they do not launch the local `agy` CLI inside a Google container, nor do they accept `LocalAgentConfig` or `GeminiModelOptions`. Neither **Cairn** nor **Builders** use Google Cloud's separate `google-adk` package.

### Primary sources (retrieved 2026-10-25)
- Gemini API Managed Antigravity Agent: <https://ai.google.dev/gemini-api/docs/antigravity-agent>
- Gemini API Managed Agent Environments & File Download: <https://ai.google.dev/gemini-api/docs/agent-environment>
- Gemini 4 Argon Latest Model & Managed Agent Example: <https://ai.google.dev/gemini-api/docs/latest-model>
- `AntigravityAgentConfig` Type Definition (`google-genai` Python SDK): <https://github.com/googleapis/python-genai/blob/cb1408b06c573060f1593023ca320fde9a4fb5f6/google/genai/_gaos/types/interactions/antigravityagentconfig.py#L31>
- Gemini 4 Argon Model, Thinking & Long Decode: <https://ai.google.dev/gemini-api/docs/models/gemini-4-argon> | <https://ai.google.dev/gemini-api/docs/thinking> | <https://ai.google.dev/gemini-api/docs/long-decode>
- Antigravity Python SDK (`0.1.22`, released 2026-10-13) & Changelog (2026-10-12): <https://pypi.org/project/google-antigravity/> | <https://antigravity.google/docs/changelog> | <https://antigravity.google/docs/sdk/overview> | <https://antigravity.google/docs/sdk/subagents/> | <https://antigravity.google/docs/sdk/lifecycle/>
- Antigravity CLI & Terminal Sandbox: <https://antigravity.google/docs/cli/reference> | <https://antigravity.google/docs/sandbox> | <https://antigravity.google/docs/permissions>

---

## 2. Production Builders: Google-hosted `antigravity-preview-09-2026`

### 2.1 Exact `AntigravityAgentConfig` contract and model selection
Per <https://ai.google.dev/gemini-api/docs/antigravity-agent>, <https://ai.google.dev/gemini-api/docs/latest-model>, and [`antigravityagentconfig.py#L31`](https://github.com/googleapis/python-genai/blob/cb1408b06c573060f1593023ca320fde9a4fb5f6/google/genai/_gaos/types/interactions/antigravityagentconfig.py#L31):

- **Default model caveat:** `antigravity-preview-09-2026` defaults to `gemini-3.8-flash` unless `model` is explicitly overridden in `agent_config`. Heavy Rain always sets `"model": "gemini-4-argon"`.
- **Supported `agent_config` properties (exhaustive):**
  1. `type`: `"antigravity"` (required literal)
  2. `model`: `"gemini-4-argon"` (explicitly required so the builder does not fall back to Flash)
  3. `max_total_tokens`: optional `int64` string (for example, `"262144"`) setting a best-effort cap across `input + output + thinking` tokens for the interaction (cached tokens do not count toward this cap).
- **Unsupported parameters (return HTTP `400` if passed):** `thinking_level`, `max_output_tokens`, `temperature`, `top_p`, `top_k`, and `stop_sequences` are rejected on the managed agent route. While the local CLI (`agy --effort high`) and coordinator (`google-antigravity 0.1.22`) explicitly set `high` thinking, the hosted `antigravity-preview-09-2026` orchestrator manages reasoning depth adaptively server-side without an exposed thinking knob.

### 2.2 Asynchronous interaction lifecycle (`background=True`, `store=True`)
When **Relay** commissions a production **Builder** run on `antigravity-preview-09-2026`:

```python
from google import genai

client = genai.Client()
interaction = client.interactions.create(
    agent="antigravity-preview-09-2026",
    environment="remote",
    background=True,
    store=True,
    agent_config={
        "type": "antigravity",
        "model": "gemini-4-argon",
        "max_total_tokens": "262144",
    },
    input=builder_prompt,
)
# Persist both IDs immediately in Relay state
interaction_id = interaction.id
environment_id = interaction.environment_id
```

- **Polling and state handling:**
  - `queued` / `in_progress`: Poll `client.interactions.get(interaction_id)` at bounded intervals while rendering the smoky blurred build preview and live checkpoint status in `apps/system`.
  - `completed`: The **only** terminal success state. Proceed to artifact download and verification checks.
  - `requires_action`: Agent paused awaiting tool or policy confirmation; surface the required action in **Relay** for operator decision or configured hook resolution.
  - `incomplete`: Execution stopped before completion (for example, reaching `max_total_tokens` or step timeout). Preserve `interaction_id` and `environment_id` so the operator can inspect partial files or resume in the same `environment_id`.
  - `failed` / `cancelled`: Record the error reason and token usage in Relay's audit log without blind retries.

### 2.3 Artifact export and environment lifecycle (`v1beta/environments`)
Per <https://ai.google.dev/gemini-api/docs/agent-environment>:

- **Current artifact download API (SDK and REST):**
  - **Python SDK:**
    ```python
    archive_bytes = client.environments.files.download(
        environment=environment_id,
        path="workspace",
    )
    ```
    Individual file paths returned by the interaction can also be passed to `path`.
  - **REST API:**
    ```sh
    curl -L -X GET "https://generativelanguage.googleapis.com/v1beta/environments/${ENVIRONMENT_ID}/files?alt=media" \
      -H "x-goog-api-key: ${GEMINI_API_KEY}" \
      -o workspace-snapshot.tar
    ```
  - **Deprecation notice:** The older `/files/environment-{id}:download` endpoint is **deprecated** and must not be used as the default export path.
  - **File uploads & overwrite protection:** Mounting or updating files via `PUT https://generativelanguage.googleapis.com/upload/v1beta/environments/{environment}/files/{path}` returns `409 Conflict` on existing paths unless `overwrite=true` is specified.
- **Hosted container lifecycle and persistence requirement:**
  - Each remote environment is allocated **4 vCPUs and 16 GB RAM**.
  - **Active -> Idle (15 minutes):** After **15 minutes** of inactivity, the environment automatically snapshots and stops.
  - **Offline retention (7 days):** Retained in `Offline` state for **7 days** from last activity and resumable by passing `environment_id`.
  - **Deletion (7 days):** Purged after 7 days of inactivity. Because hosted environments expire, **Relay** downloads and persists verified artifact bundles into durable organization storage immediately upon build completion.
- **Network allowlists and managed credentials:** Outbound network access in the remote container is unrestricted by default unless locked down by a network **allowlist**. Any external API keys needed inside the sandbox must be stored as **managed credentials** referenced by ID so Google's egress proxy injects them at request time without exposing raw secrets inside the container.

---

## 3. Cairn coordinator (`google-antigravity 0.1.22`) and Gemini 4 Argon limits

### 3.1 Coordinator SDK (`google-antigravity==0.1.22`)
Per <https://pypi.org/project/google-antigravity/> and <https://antigravity.google/docs/changelog>:

- **`Agent` & `LocalAgentConfig`:** Manages the coordinator's multi-turn lifecycle, declarative policy rules, and read-only vs write tool sets (`CapabilitiesConfig`).
- **`GeminiModelOptions(max_output_tokens=...)` (new in `0.1.22`):** Allows the local/server **Cairn** coordinator to configure per-step output token limits above `65,536` tokens for Long Decode workflows.
- **`CapabilitiesConfig(mcp_max_output_bytes=..., force_all_tools_eager=...)` (`0.1.22`):** Prevents truncation on large MCP evidence batches and supports eager MCP tool registration.
- **`BuiltinTools.INVOKE_SUBAGENT` & `SubagentConfig` (`0.1.22`):** Standardizes subagent dispatch (`Workspace="branch"` or `"share"`, incorporating the `0.1.13` worktree isolation fix and the `0.1.22` `CVE-2026-12537` security fix).

### 3.2 Gemini 4 Argon (`gemini-4-argon`) shared token window and Long Decode
Per <https://ai.google.dev/gemini-api/docs/models/gemini-4-argon>, <https://ai.google.dev/gemini-api/docs/thinking>, and <https://ai.google.dev/gemini-api/docs/long-decode>:

- **Unified 1,048,576-token window:** Shared across `input_tokens + thinking_tokens + output_tokens` on direct Gemini API and coordinator calls.
- **Standard synchronous cap vs Long Decode:** Single-hop synchronous output is capped at **65,536 tokens** (streaming) or **32,768 tokens** (non-streaming). Generating beyond 65,536 tokens up to the remaining 1M window requires `max_output_tokens > 65536` and background multi-hop continuation (`background=True` or SDK `2.30.1+` / `google-antigravity 0.1.22`).
- **Thinking levels (`low`, `medium`, `high`) and thinking-only hops:** On direct API/coordinator calls and `agy --effort high`, `high` is the highest documented model thinking level. At `high` thinking, Argon may spend entire 32K or 64K hops solely on internal reasoning before emitting visible text; stream consumers must not treat an empty visible text delta on an intermediate hop as stream completion. Every thinking token and output token is billed.

---

## 4. Development workforce (`agy` CLI) and MCP host boundaries

- **Local `agy` development workforce:** Contributors and coordinator scripts build this repository using `/Users/dominicphillips/.local/bin/agy` with `--model gemini-4-argon-high --effort high --output-format stream-json` (<https://antigravity.google/docs/cli/reference>). Local terminal sandboxing (`--sandbox`, <https://antigravity.google/docs/sandbox>) uses Apple Seatbelt (`sandbox-exec`) on macOS and Bubblewrap (`bwrap`) on Linux.When a `429` quota error occurs during parallel development runs, secondary tasks are staggered behind critical frontend builds.
- **MCP host privacy (<https://modelcontextprotocol.io/specification/2026-07-28/architecture>):** Host assistants (Claude, Gemini, ChatGPT) retain full conversation history; Heavy Rain's MCP connector receives only explicit, user-previewed report payloads.

---

## 5. Implementation status and next verification steps

| Component | Current Status in Repository (2026-10-25) | Remaining Verification & Owner |
| --- | --- | --- |
| **Workspace UI & 3D packages (`packages/*`, `apps/*`)** | **Implemented locally.** `npm run check:boundaries`, `npm run typecheck`, `npm run test`, and `npm run build` are wired in root `package.json`; local dev servers run on `127.0.0.1:43170` (`apps/system`) and `127.0.0.1:43171` (`apps/augi-engineering`). | **Parent / Frontend owner:** Extract reusable 3D camera, navigation, selection, measurement, and animation primitives into `packages/organization-3d` as the workspace modularizes. |
| **Production Builder (`antigravity-preview-09-2026`)** | **Grounded against primary docs; simulated via deterministic fixtures in local UI.** No paid remote container calls are triggered by UI preview/replay clicks. | **Backend / Relay owner:** Wire the `genai.Client().interactions.create` (`background=True`, `store=True`) and `environments.files.download` driver behind an explicit live-mode flag with `max_total_tokens` budget guards. |
| **Cairn Coordinator (`google-antigravity==0.1.22`)** | **Grounded against PyPI/docs (`0.1.22`).** Weekly batch clustering (`batch_rm_2026_w43`, `batch_augi_2026_w43`) is represented via deterministic fixtures. | **Backend / Coordinator owner:** Install `google-antigravity==0.1.22` in the backend Python environment and verify `GeminiModelOptions` and `CapabilitiesConfig` integration. |
