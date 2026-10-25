"""Server-Sent Events (SSE) broadcaster and deterministic replay stream for Relay & Cairn."""

from __future__ import annotations

import asyncio
import json
import threading
from typing import Any, AsyncIterator

from relay.models import OrganizationId, OrganizationWorkspaceState


class SseEventHub:
    """Manages per-tenant SSE subscribers and formats observable event frames without chain-of-thought."""

    def __init__(self) -> None:
        self._subscribers: dict[OrganizationId, list[tuple[asyncio.AbstractEventLoop, asyncio.Queue[dict[str, Any]]]]] = {
            "rookmere": [],
            "augi": [],
        }
        self._counter = 0
        self._lock = threading.RLock()

    def _next_id(self, org_id: OrganizationId) -> str:
        with self._lock:
            self._counter += 1
            prefix = "rm" if org_id == "rookmere" else "augi"
            return f"sse_{prefix}_{self._counter:04d}"

    @staticmethod
    def format_sse_frame(event_id: str, event_type: str, data: dict[str, Any]) -> str:
        # Ensure we never emit internal chain-of-thought fields
        blocked = {"thought_delta", "thoughts", "internal_chain_of_thought", "llm_thought_trace"}
        def scrub(value):
            if isinstance(value, dict):
                return {k: scrub(v) for k, v in value.items() if k not in blocked}
            if isinstance(value, list):
                return [scrub(item) for item in value]
            return value
        sanitized = scrub(data)
        return f"id: {event_id}\nevent: {event_type}\ndata: {json.dumps(sanitized)}\n\n"

    def publish(self, org_id: OrganizationId, event_type: str, data: dict[str, Any]) -> dict[str, Any]:
        frame = {
            "id": self._next_id(org_id),
            "event": event_type,
            "data": data,
        }
        with self._lock:
            subscribers = list(self._subscribers.get(org_id, []))
        for loop, q in subscribers:
            if not loop.is_closed():
                loop.call_soon_threadsafe(q.put_nowait, frame)
        return frame

    async def stream_initial_and_live(
        self,
        org_id: OrganizationId,
        workspace: OrganizationWorkspaceState,
        *,
        replay_only: bool = True,
    ) -> AsyncIterator[str]:
        """Streams orthogonal status, cluster routing decisions, and trace events as SSE frames."""
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        subscriber = (asyncio.get_running_loop(), queue)
        if not replay_only:
            with self._lock:
                self._subscribers[org_id].append(subscriber)
        try:
            async for frame in self._initial_frames(org_id, workspace):
                yield frame
            if replay_only:
                return
            while True:
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=15)
                    yield self.format_sse_frame(item["id"], item["event"], item["data"])
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            with self._lock:
                if subscriber in self._subscribers[org_id]:
                    self._subscribers[org_id].remove(subscriber)

    async def _initial_frames(self, org_id, workspace):
        if workspace.orthogonalStatuses:
            yield self.format_sse_frame(
                self._next_id(org_id),
                "orthogonal_status",
                workspace.orthogonalStatuses.model_dump(),
            )

        for cluster in workspace.clusters:
            yield self.format_sse_frame(
                self._next_id(org_id),
                "routing_decision",
                {
                    "orgId": org_id,
                    "clusterId": cluster.clusterId,
                    "title": cluster.title,
                    "disposition": cluster.disposition,
                    "actionState": cluster.actionState,
                    "matchedAppId": cluster.matchedAppId,
                    "matchedAppName": cluster.matchedAppName,
                    "matchedAppVersion": cluster.matchedAppVersion,
                    "gapExplanation": cluster.gapExplanation,
                    "recommendedAction": cluster.recommendedAction,
                    "reportIds": cluster.reportIds,
                },
            )

        for ev in workspace.events:
            yield self.format_sse_frame(
                self._next_id(org_id),
                "trace_event",
                ev.model_dump(exclude_none=True),
            )
