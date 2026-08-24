from __future__ import annotations

import io

import scipy.io as sio
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _cellstrs(arr) -> list[str]:
    """Unwrap a MATLAB cell-array-of-strings as loaded by scipy.io.loadmat."""
    return [str(cell[0]) if cell.size else "" for cell in arr[0]]


def _upload(synthetic_edf_bytes: bytes) -> str:
    resp = client.post(
        "/api/files",
        files={"file": ("synthetic.edf", synthetic_edf_bytes, "application/octet-stream")},
    )
    return resp.json()["file_id"]


def test_export_mat_basic(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)

    resp = client.post(
        f"/api/files/{file_id}/export/mat",
        json={
            "channels": ["EEG1", "EEG2"],
            "filters": [{"type": "lowpass", "freq": 40, "order": 4, "q": 30}],
            "bad_channels": ["EEG2"],
            "bad_segments": [{"start_sec": 1.0, "end_sec": 2.5, "label": "artifact"}],
            "history": [
                {"timestamp": "2026-01-01T00:00:00Z", "action": "file_loaded", "details": {}},
                {
                    "timestamp": "2026-01-01T00:00:05Z",
                    "action": "channel_marked_bad",
                    "details": {"channel": "EEG2"},
                },
            ],
        },
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/x-matlab-data"
    assert "synthetic_export.mat" in resp.headers["content-disposition"]

    mat = sio.loadmat(io.BytesIO(resp.content))

    assert mat["data"].shape == (2, 10 * 256)  # 2 channels, 10s @ 256Hz
    assert _cellstrs(mat["channel_labels"]) == ["EEG1", "EEG2"]
    assert _cellstrs(mat["bad_channels"]) == ["EEG2"]
    assert mat["bad_segments"].tolist() == [[1.0, 2.5]]
    assert _cellstrs(mat["filters_type"]) == ["lowpass"]
    assert mat["history_action"].shape[1] == 2


def test_export_mat_defaults_to_all_channels_and_full_duration(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)

    resp = client.post(f"/api/files/{file_id}/export/mat", json={})
    assert resp.status_code == 200
    mat = sio.loadmat(io.BytesIO(resp.content))
    assert mat["data"].shape == (4, 10 * 256)


def test_export_mat_time_range(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)

    resp = client.post(
        f"/api/files/{file_id}/export/mat",
        json={"channels": ["EEG1"], "start_sec": 2.0, "end_sec": 4.0},
    )
    assert resp.status_code == 200
    mat = sio.loadmat(io.BytesIO(resp.content))
    assert mat["data"].shape == (1, 2 * 256)


def test_export_mat_unknown_channel(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)
    resp = client.post(
        f"/api/files/{file_id}/export/mat",
        json={"channels": ["NOPE"]},
    )
    assert resp.status_code == 404


def test_export_mat_unknown_file():
    resp = client.post("/api/files/does-not-exist/export/mat", json={})
    assert resp.status_code == 404


def test_export_mat_invalid_range(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)
    resp = client.post(
        f"/api/files/{file_id}/export/mat",
        json={"start_sec": 5.0, "end_sec": 3.0},
    )
    assert resp.status_code == 400
