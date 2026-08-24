from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.edf_store import ChannelNotFoundError, EdfNotFoundError, store
from app.filters import apply_filter_pipeline
from app.montage import apply_reference
from app.schemas import SpectrogramRequest, SpectrogramResponse
from app.spectrogram import compute_spectrogram

router = APIRouter(prefix="/api/files", tags=["spectrogram"])


@router.post("/{file_id}/spectrogram", response_model=SpectrogramResponse)
async def get_spectrogram(file_id: str, req: SpectrogramRequest) -> SpectrogramResponse:
    if req.reference == "none":
        read_channels = [req.channel]
    else:
        if not req.montage_channels:
            raise HTTPException(
                status_code=400, detail="montage_channels is required when reference is not 'none'"
            )
        read_channels = req.montage_channels

    try:
        windows = store.read_window(file_id, read_channels, req.start_sec, req.duration_sec)
    except EdfNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except ChannelNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown channel: {exc}")

    if req.reference == "none":
        raw, sr = windows[req.channel]
    else:
        rates = {sr for _, sr in windows.values()}
        if len(rates) > 1:
            raise HTTPException(
                status_code=400,
                detail="Il riferimento/montaggio richiede canali con la stessa frequenza di campionamento",
            )
        sr = rates.pop()
        raw_signals = {name: arr for name, (arr, _) in windows.items()}
        try:
            referenced = apply_reference(raw_signals, req.montage_channels, req.reference)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        if req.channel not in referenced:
            raise HTTPException(status_code=404, detail=f"Unknown derived channel: {req.channel}")
        raw = referenced[req.channel]

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
