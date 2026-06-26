"""Compose layer: deterministic, model-free video editing/DSP.

Everything here runs through the static ffmpeg binary shipped by
imageio-ffmpeg, so there is no system dependency. This is the natural seam to
later port to a native Rust crate (ffmpeg-next) for a fully native pipeline.
"""
