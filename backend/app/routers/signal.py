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
    filter result. Works on the last axis so it applies unchanged to a
    single channel (1D) or a batch of channels stacked (2D, n_channels x
    n_samples).
    """
    n_samples = x.shape[-1]
    if max_points <= 0 or n_samples <= max_points:
        return x
    stride = int(np.ceil(n_samples / max_points))
    return x[..., ::stride]


@router.post("/{file_id}/signal", response_model=SignalResponse)
async def get_signal(file_id: str, req: SignalRequest) -> SignalResponse:
    if not req.channels:
        raise HTTPException(status_code=400, detail="At least one channel must be requested")

    try:
        info = store.get_info(file_id)
    except EdfNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")

    if req.reference == "none":
        channel_order = req.channels
    else:
        # The reference/montage is always computed over every non-bad
        # channel in the file, regardless of which ones are selected for
        # display — a channel marked bad should never pollute a common
        # average or a bipolar chain.
        channel_order = [c.name for c in info.channels if c.name not in req.bad_channels]
        if not channel_order:
            raise HTTPException(status_code=400, detail="All channels are marked bad; nothing to reference")

    try:
        windows = store.read_window(file_id, channel_order, req.start_sec, req.duration_sec)
    except EdfNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except ChannelNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown channel: {exc}")

    if req.reference == "none":
        referenced = {name: windows[name][0] for name in channel_order}
        rate_by_name = {name: windows[name][1] for name in channel_order}
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
            referenced = apply_reference(raw_signals, channel_order, req.reference)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        rate_by_name = {name: sample_rate for name in referenced}

    max_points = req.max_points or MAX_POINTS_PER_CHANNEL

    # Channels sharing a sample rate are filtered as one stacked batch
    # instead of looping per channel in Python — scipy's filtfilt/
    # sosfiltfilt filter along the last axis natively, so this is the
    # same total math with far less per-channel call/allocation overhead.
    # A reference/montage always has a single sample rate across every
    # channel (enforced above), so that case is always one batch; "none"
    # mode groups the (usually few) selected channels by their own rate.
    names_by_rate: dict[float, list[str]] = {}
    for name in referenced:
        names_by_rate.setdefault(rate_by_name[name], []).append(name)

    # Grouping by rate can interleave the output relative to the request;
    # remember the original (channel_order-derived) position of each name
    # so the response comes back in that same order regardless of grouping.
    order_index = {name: i for i, name in enumerate(referenced)}

    by_name: dict[str, ChannelSignal] = {}
    for sr, names in names_by_rate.items():
        matrix = np.vstack([referenced[name] for name in names])
        try:
            filtered = apply_filter_pipeline(matrix, sr, req.filters)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        decimated = _decimate(filtered, max_points)
        n_samples = filtered.shape[-1]
        effective_sr = sr * (decimated.shape[-1] / n_samples) if n_samples else sr
        # Rounding trims the JSON payload a lot (raw float64 repr runs to
        # ~17 digits) with no visible effect — display/export precision
        # needs nowhere near that, and this only affects the wire format.
        rounded = np.round(decimated, 3)
        for row, name in zip(rounded, names):
            by_name[name] = ChannelSignal(name=name, sample_rate=effective_sr, values=row.tolist())

    channels = [by_name[name] for name in sorted(by_name, key=order_index.get)]
    return SignalResponse(start_sec=req.start_sec, duration_sec=req.duration_sec, channels=channels)
