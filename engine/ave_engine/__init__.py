"""AI Video Studio — Python model engine.

A small FastAPI sidecar that the Tauri/Rust backend spawns and talks to over
localhost HTTP. It owns model download/caching and diffusion inference, and
hands finished frames to the export step. The UI and orchestration logic live
elsewhere; this package is intentionally a stateless-ish inference worker.
"""

__version__ = "0.2.1"
