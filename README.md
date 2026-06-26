# Dj MAD — AI Video Tool

A local-first desktop app for **AI video generation** — text-to-video,
image-to-video, **beat-synced music videos**, and **perfect-looping Spotify
Canvas** clips — branded **Dj MAD**, auto-adapts to your hardware (NVIDIA CUDA
when present, CPU fallback otherwise) and downloads models on demand.

**Project root:** `F:\ai-music-studio`

### Features

- **Generate** — text→video and image→video from any installed model.
- **Music Video** — drop in a track + a brief; the app analyzes tempo/beats,
  generates one clip per scene, and cuts them **on the beat**, matching the video
  length to the song (**beat sync + length sync**). Optional **lip sync** stage.
- **Spotify Canvas** — vertical 9:16 **perfectly-looping** clips (10/20/30 s) via
  seamless boomerang or crossfade, optionally synced to a snippet of a track.
- **Analyzers** — music (librosa), image (palette/brightness), and a chat/brief
  analyzer that turns text into coherent per-scene prompts.

> Status: working scaffold. The full pipeline (UI → orchestration → model engine →
> export) is wired end-to-end. LTX-Video is the default model; CogVideoX and
> Stable Video Diffusion adapters are included.

---

## Architecture

Four decoupled layers, each in the language best suited to it:

```
┌───────────────────────────────────────────────┐
│  UI            React + TypeScript (Vite)        │   app/src
└───────────────▲─────────────────────────────────┘
                │  Tauri commands (typed IPC)
┌───────────────┴─────────────────────────────────┐
│  Orchestrator  Rust (Tauri backend)              │   app/src-tauri
│   - spawns + supervises the engine sidecar       │
│   - proxies UI calls, owns process lifecycle      │
└───────────────▲─────────────────────────────────┘
                │  localhost HTTP (JSON)
┌───────────────┴─────────────────────────────────┐
│  Model Engine  Python + PyTorch + diffusers      │   engine/
│   - device detection & auto-tuning               │
│   - HF model download/cache (Model Manager)      │
│   - diffusion inference + job queue              │
│   - frame → H.264/MP4 export (ffmpeg)            │
└──────────────────────────────────────────────────┘
```

**Why this split:** the UI never imports model code, Python does inference only,
and the Rust layer owns process lifecycle and IPC. Adding a model is a two-file
change (a `ModelSpec` in `registry.py` + an adapter), and nothing else needs to
know about it — the UI is fully data-driven.

### Layout

```
F:\ai-music-studio\
├── engine/                     # Python model engine (FastAPI sidecar)
│   └── ave_engine/
│       ├── device.py           # CUDA/CPU detection + VRAM-tiered policy
│       ├── schemas.py          # request/response models
│       ├── jobs.py             # single-worker job queue (all pipeline kinds)
│       ├── uploads.py          # decode base64/data-URL uploads to files
│       ├── server.py           # FastAPI routes
│       ├── analysis/           # model-free analyzers
│       │   ├── audio.py        # librosa: tempo, beats, downbeats, sections
│       │   ├── image.py        # palette / brightness / aspect
│       │   └── prompt.py       # chat/brief → per-scene prompts + style
│       ├── compose/            # deterministic ffmpeg editing/DSP
│       │   ├── ffmpeg_ops.py   # scale/pad, concat, pingpong, crossfade, mux
│       │   ├── timeline.py     # beat-synced cut points
│       │   ├── assemble.py     # scene clips → beat-cut music video
│       │   └── loop.py         # perfect-loop canvas builder
│       ├── pipelines/          # orchestration (analyze → generate → compose)
│       │   ├── runner.py       # runner registry + cancellable progress ctx
│       │   ├── single.py       # one clip
│       │   ├── music_video.py  # beat-synced music video
│       │   └── canvas.py       # looping Spotify Canvas
│       ├── models/
│       │   ├── registry.py     # catalog of supported models (drives the UI)
│       │   ├── manager.py      # HF download/cache/delete
│       │   ├── base.py         # VideoModel adapter contract
│       │   ├── factory.py      # id → loaded model (1-deep VRAM-safe cache)
│       │   ├── ltx.py          # LTX-Video (text+image → video)
│       │   ├── cogvideox.py    # CogVideoX-2B (text → video)
│       │   ├── svd.py          # Stable Video Diffusion (image → video)
│       │   └── wav2lip.py      # optional lip-sync stage (graceful)
│       └── pipeline/export.py  # frames → mp4
├── app/                        # Tauri desktop app
│   ├── src/                    # React UI (Generate / Models / Library / Settings)
│   └── src-tauri/
│       └── src/
│           ├── engine.rs       # sidecar supervisor + HTTP proxy
│           └── commands.rs     # Tauri commands
└── scripts/                    # dev.ps1, build_engine.ps1, build.ps1
```

---

## Models

All open-source; weights download from Hugging Face on first use and are cached
under your app-data folder (managed from the **Models** tab).

| Model | Task | License | Commercial | ~Size | Min VRAM |
|---|---|---|---|---|---|
| **LTX-Video** (default) | text→video, image→video | OpenRAIL-M | ✅ | ~9 GB | 8 GB |
| **CogVideoX-2B** | text→video | Apache-2.0 | ✅ | ~12 GB | 8 GB |
| **Stable Video Diffusion XT** | image→video | Stability non-commercial | ❌ | ~9.5 GB | 10 GB |

The app reads VRAM at runtime and picks a memory policy automatically
(full-resident ≥16 GB, model CPU-offload 10–16 GB, sequential offload + tiling
<10 GB, all-savers on CPU).

---

## Prerequisites

- **Node.js** 18+ and npm
- **Rust** (stable) + the platform's Tauri build deps (MSVC build tools on Windows,
  WebView2 — preinstalled on Win10/11)
- **Python** 3.10–3.12 (PyTorch does not yet support 3.13+)

---

## Development

### 1. Set up the engine environment

```powershell
# create an isolated env (conda shown; venv works too)
conda create -y -n avestudio python=3.11
conda activate avestudio

# install PyTorch FIRST with the right backend:
#   NVIDIA / CUDA 12.x:
pip install torch --index-url https://download.pytorch.org/whl/cu124
#   or CPU only:
# pip install torch --index-url https://download.pytorch.org/whl/cpu

pip install -r engine/requirements.txt
```

### 2. Install UI deps

```powershell
cd app
npm install
cd ..
```

### 3. Run

```powershell
cd F:\ai-music-studio
$env:AVE_DATA_DIR = "F:\AIVideoStudio\data"   # optional; E:\ also works
.\scripts\dev.ps1
```

`dev.ps1` points the Rust supervisor at the `avestudio` env (override with
`$env:AVE_PYTHON`) and runs `npm run tauri dev`. The Rust app spawns the engine
automatically; the **Settings** tab shows detected hardware and the engine paths.

> The UI runs even before PyTorch is installed (it reports CPU/“torch not
> installed”), so you can explore the interface immediately — generation needs torch.

---

## Building & shipping

```powershell
cd F:\ai-music-studio
$env:AVE_PYTHON = "$env:USERPROFILE\miniconda3\envs\avestudio\python.exe"
.\scripts\build.ps1              # full build (~30 min for engine)
.\scripts\build.ps1 -SkipEngine  # app + install.exe only
```

Output: `F:\ai-music-studio\release\` (`install.exe`, `payload\ave-engine\`, portable exe).

---

## Music sync, Canvas & lip-sync

- **Beat sync**: the audio analyzer (librosa) extracts beat timestamps; the
  compose layer places cuts on every *N*-th beat (configurable in the UI).
- **Length sync**: the rendered timeline is stretched to the full track length,
  then the original audio is muxed in.
- **Perfect loops**: Canvas uses a *boomerang* (forward + reversed) unit for a
  mathematically seamless loop, or a *crossfade* blend, looped to 10/20/30 s.
- **Lip sync** is an optional, gracefully-degrading stage. To enable it, clone
  [Wav2Lip](https://github.com/Rudrabha/Wav2Lip), set `AVE_WAV2LIP_DIR` to the
  checkout, and place `checkpoints/wav2lip_gan.pth` inside it. If it isn't set
  up, the music-video render still completes and reports "lip-sync skipped".

The analysis + compose layers are model-free and were verified end-to-end on
synthetic media, so beat detection, beat-synced assembly and perfect looping
work even before any AI model is downloaded.

## Environment variables

| Var | Purpose |
|---|---|
| `AVE_PYTHON` | Python interpreter the Rust supervisor launches (dev) |
| `AVE_ENGINE_DIR` | Path to `engine/` (dev; auto-resolved otherwise) |
| `AVE_ENGINE_BIN` | Explicit engine executable (overrides everything) |
| `AVE_DATA_DIR` | Where models + outputs live (set by Rust to the app-data dir) |
| `AVE_PORT` | Force the engine port (default: a free port chosen at startup) |
| `AVE_WAV2LIP_DIR` | Path to a Wav2Lip checkout to enable lip sync (optional) |

---

## Roadmap / extension points

- Add models by appending to `engine/ave_engine/models/registry.py` + an adapter.
- Diffusion speedups: TeaCache/DeepCache step caching, LCM/distilled previews.
- Move MP4 muxing into a Rust crate (`ffmpeg-next`) for a fully native pipeline.
- Frame interpolation (RIFE) and upscaling (Real-ESRGAN) as post-process stages.

## License

Code in this repository: MIT. **Model weights carry their own licenses** — see the
table above; the app surfaces commercial-use status in the Models tab.
