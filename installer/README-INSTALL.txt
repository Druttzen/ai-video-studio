Dj MAD - AI Video Tool (AI Video Studio)
Windows install package

VERSION: {{VERSION}}

GITHUB INSTALL (small download, ~3 MB Setup exe)
-----------------------------------------------
1. Run DjMAD-AI-Video-Tool-Setup-{{VERSION}}.exe
2. A console window opens and automatically:
   - Downloads the AI engine (~2 GB) from GitHub with a live progress bar
   - Installs WebView2 if missing
   - Downloads the default LTX-Video model (~28 GB) with progress + ETA
3. The app launches when finished.

Requires internet. Engine asset must be on the matching GitHub release:
  ave-engine-win64.7z  (build with scripts/publish_engine_asset.ps1)

OFFLINE INSTALL (full bundle, no internet during setup)
-------------------------------------------------------
Use the Standalone ZIP or SFX from a full build (scripts/build.ps1).
Extract, run install.exe from the folder that contains payload\ave-engine\.

RE-RUN SETUP
------------
setup.cmd --inst-dir "<your install path>"

UNINSTALL
---------
Windows Settings > Apps > AI Video Tool

REQUIREMENTS
------------
- Windows 10/11 64-bit
- NVIDIA GPU 8+ GB VRAM recommended
- 35+ GB free disk for default model cache

GitHub: https://github.com/Druttzen/ai-video-studio
