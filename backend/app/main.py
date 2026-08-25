from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

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
