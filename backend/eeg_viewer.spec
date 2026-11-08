# PyInstaller spec for the packaged desktop build. Build with:
#   pyinstaller eeg_viewer.spec
# from inside backend/, with the venv active and frontend/dist already
# built (`cd ../frontend && npm run build`). See BUILD.md for the full
# per-OS walkthrough (this spec is OS-agnostic, but PyInstaller itself
# must run on the same OS/architecture you want the executable for).

from PyInstaller.utils.hooks import collect_all

block_cipher = None

datas = [("../frontend/dist", "frontend/dist")]
binaries = []
hiddenimports = []

# These packages each have native extensions and/or dynamic imports that
# PyInstaller's default import-scanning misses; collect_all pulls in
# their submodules, binaries and data files so the frozen build doesn't
# fail at runtime with a missing-module error far from any obvious cause.
for pkg in ("scipy", "numpy", "pyedflib", "uvicorn"):
    pkg_datas, pkg_binaries, pkg_hiddenimports = collect_all(pkg)
    datas += pkg_datas
    binaries += pkg_binaries
    hiddenimports += pkg_hiddenimports

a = Analysis(
    ["launcher.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="eeg-viewer",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
)
