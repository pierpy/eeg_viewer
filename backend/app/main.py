import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

from app.routers import export, files, signal, spectrogram

app = FastAPI(title="EEG Viewer API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)
# The signal/spectrogram responses are JSON arrays of floats — since a
# reference/montage now always spans every good channel, these payloads
# can be large. GZip cuts wire time substantially for the numeric-heavy
# bodies without touching binary responses (like the .mat export) that
# are already compact. A low compresslevel is deliberate: Starlette's
# default (9, max) spends much more CPU than the low levels for barely
# better ratio on this kind of repetitive numeric JSON, which ate the
# transfer-time win it was meant to buy.
app.add_middleware(GZipMiddleware, minimum_size=1024, compresslevel=4)

app.include_router(files.router)
app.include_router(signal.router)
app.include_router(export.router)
app.include_router(spectrogram.router)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


# Serves the built frontend (frontend/dist) from this same process when
# present, so a packaged single-executable build (PyInstaller) needs no
# separate nginx/static server — only the desktop launcher and CI builds
# produce this directory, so a plain `uvicorn app.main:app` dev run (no
# frontend build) is unaffected and just skips this mount.
def _frontend_dist_dir() -> Path:
    # PyInstaller's --onefile mode extracts bundled data under
    # sys._MEIPASS at runtime; outside of that, resolve relative to the
    # repo layout (backend/app/main.py -> ../../frontend/dist).
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[2]))
    return base / "frontend" / "dist"


_dist_dir = _frontend_dist_dir()
if _dist_dir.is_dir():
    app.mount("/", StaticFiles(directory=_dist_dir, html=True), name="frontend")
