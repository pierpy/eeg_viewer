from __future__ import annotations

import io
from pathlib import Path

import scipy.io as sio
from fastapi import APIRouter, HTTPException, Response

from app.edf_store import ChannelNotFoundError, EdfNotFoundError, store
from app.filters import apply_filter_pipeline
from app.mat_export import build_export_dict
from app.montage import apply_reference
from app.schemas import ExportRequest

router = APIRouter(prefix="/api/files", tags=["export"])


@router.post("/{file_id}/export/mat")
async def export_mat(file_id: str, req: ExportRequest) -> Response:
    try:
        info = store.get_info(file_id)
    except EdfNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")

    channel_names = req.channels or [c.name for c in info.channels]
    if not channel_names:
        raise HTTPException(status_code=400, detail="At least one channel must be requested")

    start = req.start_sec if req.start_sec is not None else 0.0
    end = req.end_sec if req.end_sec is not None else info.duration_sec
    if end <= start:
        raise HTTPException(status_code=400, detail="end_sec must be greater than start_sec")

    try:
        windows = store.read_window(file_id, channel_names, start, end - start)
    except EdfNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except ChannelNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown channel: {exc}")

    if req.reference == "none":
        referenced = {name: windows[name][0] for name in channel_names}
        rate_by_name = {name: windows[name][1] for name in channel_names}
        ordered_names = channel_names
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
            referenced = apply_reference(raw_signals, channel_names, req.reference)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        rate_by_name = {name: sample_rate for name in referenced}
        ordered_names = list(referenced.keys())

    signals: dict[str, tuple] = {}
    for name in ordered_names:
        sr = rate_by_name[name]
        try:
            filtered = apply_filter_pipeline(referenced[name], sr, req.filters)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        signals[name] = (filtered, sr)

    mat_dict = build_export_dict(info, req, ordered_names, signals, start, end)

    buf = io.BytesIO()
    sio.savemat(buf, mat_dict, do_compression=True)
    buf.seek(0)

    export_name = f"{Path(info.filename).stem}_export.mat"
    return Response(
        content=buf.read(),
        media_type="application/x-matlab-data",
        headers={"Content-Disposition": f'attachment; filename="{export_name}"'},
    )
