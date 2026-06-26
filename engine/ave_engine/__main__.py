"""Entry point: ``python -m ave_engine``.

Subcommands (for setup wizard / automation):
  models-status  JSON catalog on stdout
  download ID    sync model download with AVE_DL_PROGRESS lines

Default (no subcommand): pick a free port, print AVE_ENGINE_PORT sentinel, serve API.
"""

from __future__ import annotations

import os
import socket
import sys

import uvicorn

from .cli import dispatch
from .config import get_settings


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _serve() -> None:
    settings = get_settings()
    port = settings.port or _free_port()

    # Sentinel consumed by the Rust supervisor (src-tauri/src/engine.rs).
    print(f"AVE_ENGINE_PORT={port}", flush=True)
    sys.stdout.flush()

    log_level = os.environ.get("AVE_LOG_LEVEL", "warning")
    uvicorn.run(
        "ave_engine.server:app",
        host=settings.host,
        port=port,
        log_level=log_level,
        access_log=False,
    )


def main() -> None:
    code = dispatch(sys.argv[1:])
    if code == -1:
        _serve()
        return
    raise SystemExit(code)


if __name__ == "__main__":
    main()
