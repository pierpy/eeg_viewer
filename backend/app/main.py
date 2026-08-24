from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import export, files, signal

app = FastAPI(title="EEG Viewer API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

app.include_router(files.router)
app.include_router(signal.router)
app.include_router(export.router)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
