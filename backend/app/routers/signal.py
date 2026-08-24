from __future__ import annotations

import numpy as np
from fastapi import APIRouter, HTTPException

from app.config import MAX_POINTS_PER_CHANNEL
from app.edf_store import ChannelNotFoundError, EdfNotFoundError, store
from app.filters import apply_filter_pipeline
from app.montage import apply_reference
from app.schemas import ChannelSignal, SignalRequest, SignalResponse

router = APIRouter(prefix="/api/files", tags=["signal"])


def _decimate(x: np.ndarray, max_points: int) -> np.ndarray:
    """Simple stride-based decimation for display.

    Filters have already been applied to the full-resolution signal before
    this runs, so decimation only affects rendering density, not the
    filter result.
    """
    if max_points <= 0 or len(x) <= max_points:
        return x
    stride = int(np.ceil(len(x) / max_points))
    return x[::stride]


@router.post("/{file_id}/signal", response_model=SignalResponse)
async def get_signal(file_id: str, req: SignalRequest) -> SignalResponse:
    if not req.channels:
        raise HTTPException(status_code=400, detail="At least one channel must be requested")

    try:
        windows = store.read_window(file_id, req.channels, req.start_sec, req.duration_sec)
    except EdfNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except ChannelNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown channel: {exc}")

    if req.reference == "none":
        referenced = {name: windows[name][0] for name in req.channels}
        rate_by_name = {name: windows[name][1] for name in req.channels}
    else:
        rates = {sr for _, sr in windows.values()}
        if len(rates) > 1:
            raise HTTPException(
                status_code=400,
                detail="Il riferimento/montaggio richiede canali con la stessa frequenza di campionamento",
            )
        sample_rate = rates.pop()
        raw_signals = {name: arr for name, (arr, _) in windows.items()}
        try:
            referenced = apply_reference(raw_signals, req.channels, req.reference)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        rate_by_name = {name: sample_rate for name in referenced}

    max_points = req.max_points or MAX_POINTS_PER_CHANNEL
    channels: list[ChannelSignal] = []
    for name, raw in referenced.items():
        sr = rate_by_name[name]
        try:
            filtered = apply_filter_pipeline(raw, sr, req.filters)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        decimated = _decimate(filtered, max_points)
        effective_sr = sr * (len(decimated) / len(filtered)) if len(filtered) else sr
        channels.append(
            ChannelSignal(name=name, sample_rate=effective_sr, values=decimated.tolist())
        )

    return SignalResponse(start_sec=req.start_sec, duration_sec=req.duration_sec, channels=channels)
