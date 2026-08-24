"""Builds the MATLAB (.mat) export payload.

Kept separate from the router so the MATLAB-shaping logic can be unit
tested directly against a plain dict, without going through HTTP.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import numpy as np

from app.schemas import BadSegment, ExportRequest, FileInfo


def _cellstr(items: list[str]) -> np.ndarray:
    """A numpy object array of Python strings becomes a MATLAB cell array of char vectors."""
    return np.array(items, dtype=object)


def build_export_dict(
    info: FileInfo,
    req: ExportRequest,
    channel_names: list[str],
    signals: dict[str, tuple[np.ndarray, float]],
    export_start_sec: float,
    export_end_sec: float,
) -> dict[str, Any]:
    lengths = {len(signals[name][0]) for name in channel_names}
    rates = {signals[name][1] for name in channel_names}
    uniform = len(lengths) == 1 and len(rates) == 1

    if uniform:
        data: Any = np.vstack([signals[name][0] for name in channel_names]) if channel_names else np.zeros((0, 0))
    else:
        # Mixed sample rates/lengths: fall back to one cell per channel
        # (a MATLAB cell array of row vectors) instead of a rectangular matrix.
        data = np.empty((len(channel_names),), dtype=object)
        for i, name in enumerate(channel_names):
            data[i] = signals[name][0].reshape(1, -1)

    bad_segments: list[BadSegment] = req.bad_segments
    bad_segments_arr = (
        np.array([[s.start_sec, s.end_sec] for s in bad_segments], dtype=float)
        if bad_segments
        else np.zeros((0, 2))
    )

    filters_dicts = [f.model_dump() for f in req.filters]
    history_dicts = [h.model_dump() for h in req.history]

    return {
        "data": data,
        "data_layout": "channels_x_samples" if uniform else "cell_per_channel",
        "channel_labels": _cellstr(channel_names),
        "sample_rate": np.array([signals[name][1] for name in channel_names], dtype=float),
        "bad_channels": _cellstr(req.bad_channels),
        "bad_segments": bad_segments_arr,
        "bad_segments_columns": _cellstr(["start_sec", "end_sec"]),
        "bad_segments_labels": _cellstr([s.label for s in bad_segments]),
        "filters_type": _cellstr([f["type"] for f in filters_dicts]),
        "filters_enabled": np.array([f["enabled"] for f in filters_dicts], dtype=bool),
        "filters_freq": np.array([f["freq"] for f in filters_dicts], dtype=float),
        "filters_order": np.array([f["order"] for f in filters_dicts], dtype=float),
        "filters_q": np.array([f["q"] for f in filters_dicts], dtype=float),
        "filters_json": json.dumps(filters_dicts),
        "history_timestamp": _cellstr([h["timestamp"] for h in history_dicts]),
        "history_action": _cellstr([h["action"] for h in history_dicts]),
        "history_json": json.dumps(history_dicts),
        "export_info": {
            "source_filename": info.filename,
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "start_sec": export_start_sec,
            "end_sec": export_end_sec,
            "recording_start_time": info.start_time or "",
        },
    }
