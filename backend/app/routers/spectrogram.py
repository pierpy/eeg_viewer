from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.edf_store import ChannelNotFoundError, EdfNotFoundError, store
from app.filters import apply_filter_pipeline
from app.schemas import SpectrogramRequest, SpectrogramResponse
from app.spectrogram import compute_spectrogram

router = APIRouter(prefix="/api/files", tags=["spectrogram"])


@router.post("/{file_id}/spectrogram", response_model=SpectrogramResponse)
async def get_spectrogram(file_id: str, req: SpectrogramRequest) -> SpectrogramResponse:
    try:
        windows = store.read_window(file_id, [req.channel], req.start_sec, req.duration_sec)
    except EdfNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except ChannelNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown channel: {exc}")

    raw, sr = windows[req.channel]
    try:
        filtered = apply_filter_pipeline(raw, sr, req.filters)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        freqs, times, power_db = compute_spectrogram(filtered, sr, req.max_freq)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return SpectrogramResponse(
        channel=req.channel,
        start_sec=req.start_sec,
        duration_sec=req.duration_sec,
        freqs=freqs.tolist(),
        times=(times + req.start_sec).tolist(),
        power_db=power_db.tolist(),
    )
