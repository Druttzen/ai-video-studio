"""Entry point: ``python -m ave_engine``.

Picks a free port (unless AVE_PORT is set), prints a sentinel line that the
Rust supervisor parses, then serves the FastAPI app.
"""

from __future__ import annotations

import os
import socket
import sys

import uvicorn

from .config import get_settings


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main() -> None:
    settings = get_settings()
    port = settings.port or _free_port()

    # Sentinel consumed by the Rust supervisor (src-tauri/src/sidecar.rs).
    print(f"AVE_ENGINE_PORT={port}", flush=True)
    sys.stdout.flush()

    log_level = os.environ.get("AVE_LOG_LEVEL", "info")
    uvicorn.run(
        "ave_engine.server:app",
        host=settings.host,
        port=port,
        log_level=log_level,
        access_log=False,
    )


if __name__ == "__main__":
    main()
