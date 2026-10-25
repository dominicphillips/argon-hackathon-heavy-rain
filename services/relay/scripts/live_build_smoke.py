from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("base_url", nargs="?", default="http://127.0.0.1:43180")
    parser.add_argument("--base-url", dest="base_url_override")
    args = parser.parse_args()
    base = (args.base_url_override or args.base_url).rstrip("/")
    endpoint = f"{base}/api/v1/orgs/meridian/builds/live"
    sample = {
        "idempotency_key": f"marcus-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')}-dealpulse",
        "requested_by": {"persona_id": "marcus", "name": "Marcus Vance", "role": "VP, Deal Sourcing & Screening"},
        "workflow": {
            "title": "15-minute pre-call scramble", "summary": "Before every founder call Marcus ...",
            "tools": ["Outlook", "Affinity", "Claude", "Granola", "Gemini", "Excel", "Slack"],
            "weekly_hours_saved": 9.2,
        },
        "app": {
            "name": "DealPulse AutoBrief", "purpose": "One pre-call brief assembled automatically ...",
            "features": ["T-20m auto pre-call brief", "Public comps ticker", "Granola to deal-team email draft"],
            "assumptions": ["Affinity is the CRM of record"],
        },
    }
    def request(url, payload=None):
        body = json.dumps(payload).encode() if payload is not None else None
        req = Request(url, data=body, headers={"Content-Type": "application/json"})
        with urlopen(req, timeout=120) as response:
            return json.load(response)
    try:
        accepted = request(endpoint, sample)
        print(f"{accepted['runId']} {accepted['status']}", flush=True)
        since = 0
        while True:
            snapshot = request(f"{endpoint}/current?since={since}")
            run = snapshot["run"]
            if not run or run["runId"] != accepted["runId"]:
                snapshot = request(f"{endpoint}/{accepted['runId']}?since={since}")
                run = snapshot["run"]
            for event in snapshot["progress"]:
                print(f"{event['seq']} {event['kind']} {' '.join(event['title'].splitlines())}", flush=True)
                since = max(since, event["seq"])
            if run["phase"] in {"ready", "failed"} or run["status"] in {"incomplete", "requires_action", "failed", "cancelled"}:
                artifact = snapshot["artifact"]
                if artifact:
                    print(artifact["indexUrl"])
                    if artifact["previewUrl"]:
                        print(artifact["previewUrl"])
                return 0 if run["phase"] == "ready" else 1
            time.sleep(3)
    except HTTPError as exc:
        print(f"HTTP {exc.code}")
        return 1
    except (URLError, TimeoutError):
        print("Connection failed")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
