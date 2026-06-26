"""Headless CLI for setup wizard and automation.

Commands:
  serve          Start the FastAPI sidecar (default when no subcommand).
  models-status  Print JSON model catalog + download state on stdout.
  download ID    Download one model; emits AVE_DL_PROGRESS lines for setup UI.
"""

from __future__ import annotations

import json
import sys


def cmd_models_status() -> int:
    from .models.manager import get_manager

    print(json.dumps(get_manager().status_all(), indent=2))
    return 0


def cmd_download(model_id: str) -> int:
    from .models.manager import get_manager

    mgr = get_manager()

    def on_progress(pct: float, done: int, total: int, message: str) -> None:
        # Parsed by installer/ave-setup.ps1 for live CMD progress + ETA.
        line = f"AVE_DL_PROGRESS|{pct:.6f}|{done}|{total}|{message}"
        print(line, flush=True)

    try:
        mgr.download_sync(model_id, on_progress=on_progress)
    except Exception as exc:  # noqa: BLE001 - surfaced to setup wizard
        print(f"AVE_DL_ERROR|{exc}", flush=True)
        return 1
    return 0


def print_usage() -> None:
    print(
        "Usage:\n"
        "  ave-engine.exe                 Start API server\n"
        "  ave-engine.exe models-status   List models (JSON)\n"
        "  ave-engine.exe download <id>   Download model weights\n",
        file=sys.stderr,
    )


def dispatch(argv: list[str]) -> int:
    if not argv:
        return -1  # caller should start server
    if argv[0] in ("-h", "--help", "help"):
        print_usage()
        return 0
    if argv[0] == "models-status":
        return cmd_models_status()
    if argv[0] == "download":
        if len(argv) < 2:
            print("missing model id", file=sys.stderr)
            return 2
        return cmd_download(argv[1])
    print(f"unknown command: {argv[0]}", file=sys.stderr)
    print_usage()
    return 2
