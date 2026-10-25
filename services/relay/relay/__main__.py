"""CLI entrypoint to run the Heavy Rain Relay + Cairn server on http://127.0.0.1:43180."""

from __future__ import annotations

import os
import uvicorn


def main() -> None:
    host = os.environ.get("HEAVY_RAIN_HOST", "127.0.0.1")
    if host not in {"127.0.0.1", "localhost", "::1"}:
        raise ValueError("The unauthenticated demo server must bind to loopback.")
    port = int(os.environ.get("HEAVY_RAIN_PORT", "43180"))
    uvicorn.run("relay.app:app", host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
