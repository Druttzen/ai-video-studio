"""Analysis layer: turn raw inputs (audio, images, text briefs) into structured
data the generation + compose layers can act on.

These analyzers are intentionally dependency-light and model-free so they run
instantly on CPU; the heavy generative work happens elsewhere.
"""
