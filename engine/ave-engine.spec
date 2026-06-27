# PyInstaller spec for the AI Video Studio engine.
#
# Produces a one-folder build (faster startup, easier to debug than one-file)
# named `ave-engine`. Heavy ML packages need their data files / dynamic imports
# collected explicitly, hence the collect_all calls below.
#
# Build with:  pyinstaller ave-engine.spec  (from the engine/ directory)

from PyInstaller.utils.hooks import collect_all, collect_submodules

datas, binaries, hiddenimports = [], [], []

for pkg in (
    "torch",
    "diffusers",
    "transformers",
    "accelerate",
    "safetensors",
    "huggingface_hub",
    "imageio",
    "imageio_ffmpeg",
    "cv2",
    "PIL",
    "sentencepiece",
    "librosa",
    "soundfile",
    "scipy",
    "numpy",
    "demucs",
    "torchaudio",
    "fastapi",
    "pydantic",
):
    try:
        d, b, h = collect_all(pkg)
        datas += d
        binaries += b
        hiddenimports += h
    except Exception:
        pass

# uvicorn loads its protocol/loop implementations dynamically.
hiddenimports += collect_submodules("uvicorn")
hiddenimports += ["ave_engine", "ave_engine.server"]


a = Analysis(
    ["launcher.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="ave-engine",
    console=True,
    disable_windowed_traceback=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="ave-engine",
)
