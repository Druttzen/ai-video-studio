"""Hardware detection and an auto-tuning policy.

The whole point of the app is "works on any hardware", so model adapters never
hard-code device/dtype/offload choices. They ask this module for a
:class:`DevicePolicy` derived from what's actually available at runtime.

Torch is imported lazily so the server can boot and report status even before
the heavy ML dependencies are installed.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict


@dataclass
class DeviceInfo:
    backend: str            # "cuda" | "cpu"
    device: str             # "cuda" | "cpu"
    name: str
    total_vram_gb: float
    torch_available: bool
    torch_version: str | None = None
    cuda_version: str | None = None

    def as_dict(self) -> dict:
        return asdict(self)


@dataclass
class DevicePolicy:
    """How a pipeline should be loaded for the detected hardware."""

    device: str             # target device string
    dtype: str              # "bfloat16" | "float16" | "float32"
    enable_model_cpu_offload: bool
    enable_sequential_cpu_offload: bool
    enable_vae_tiling: bool
    enable_vae_slicing: bool
    attention_slicing: bool

    def as_dict(self) -> dict:
        return asdict(self)


def detect_device() -> DeviceInfo:
    try:
        import torch
    except Exception:
        return DeviceInfo(
            backend="cpu",
            device="cpu",
            name="CPU (torch not installed)",
            total_vram_gb=0.0,
            torch_available=False,
        )

    if torch.cuda.is_available():
        props = torch.cuda.get_device_properties(0)
        return DeviceInfo(
            backend="cuda",
            device="cuda",
            name=props.name,
            total_vram_gb=round(props.total_memory / (1024 ** 3), 1),
            torch_available=True,
            torch_version=torch.__version__,
            cuda_version=getattr(torch.version, "cuda", None),
        )

    return DeviceInfo(
        backend="cpu",
        device="cpu",
        name="CPU",
        total_vram_gb=0.0,
        torch_available=True,
        torch_version=torch.__version__,
    )


def _bf16_supported() -> bool:
    try:
        import torch

        return bool(torch.cuda.is_available() and torch.cuda.is_bf16_supported())
    except Exception:
        return False


def build_policy(info: DeviceInfo | None = None) -> DevicePolicy:
    """Pick safe-but-fast defaults based on detected VRAM.

    Tiers (CUDA):
      * >= 16 GB : full speed, keep model resident, only VAE tiling.
      * 10-16 GB : model CPU offload (great fit for 12 GB cards like a 4070).
      * < 10 GB  : sequential offload + every memory saver.
    CPU: float32 with all memory savers (slow, but it runs).
    """
    info = info or detect_device()

    if info.backend != "cuda":
        return DevicePolicy(
            device="cpu",
            dtype="float32",
            enable_model_cpu_offload=False,
            enable_sequential_cpu_offload=False,
            enable_vae_tiling=True,
            enable_vae_slicing=True,
            attention_slicing=True,
        )

    dtype = "bfloat16" if _bf16_supported() else "float16"
    vram = info.total_vram_gb

    if vram >= 16:
        return DevicePolicy(
            device="cuda",
            dtype=dtype,
            enable_model_cpu_offload=False,
            enable_sequential_cpu_offload=False,
            enable_vae_tiling=True,
            enable_vae_slicing=False,
            attention_slicing=False,
        )
    if vram >= 10:
        return DevicePolicy(
            device="cuda",
            dtype="float16",  # float16 + sequential is stable on 12 GB Windows; bf16 can hard-crash
            enable_model_cpu_offload=False,
            enable_sequential_cpu_offload=True,
            enable_vae_tiling=False,
            enable_vae_slicing=True,
            attention_slicing=True,
        )
    return DevicePolicy(
        device="cuda",
        dtype=dtype,
        enable_model_cpu_offload=False,
        enable_sequential_cpu_offload=True,
        enable_vae_tiling=True,
        enable_vae_slicing=True,
        attention_slicing=True,
    )


def torch_dtype(name: str):
    import torch

    return {
        "bfloat16": torch.bfloat16,
        "float16": torch.float16,
        "float32": torch.float32,
    }[name]
