from __future__ import annotations

import io
from pathlib import Path

import scipy.io as sio
from fastapi import APIRouter, HTTPException, Response

from app.edf_store import ChannelNotFoundError, EdfNotFoundError, store
from app.filters import apply_filter_pipeline
from app.mat_export import build_export_dict
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

    signals: dict[str, tuple] = {}
    for name in channel_names:
        raw, sr = windows[name]
        try:
            filtered = apply_filter_pipeline(raw, sr, req.filters)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        signals[name] = (filtered, sr)

    mat_dict = build_export_dict(info, req, channel_names, signals, start, end)

    buf = io.BytesIO()
    sio.savemat(buf, mat_dict, do_compression=True)
    buf.seek(0)

    export_name = f"{Path(info.filename).stem}_export.mat"
    return Response(
        content=buf.read(),
        media_type="application/x-matlab-data",
        headers={"Content-Disposition": f'attachment; filename="{export_name}"'},
    )
