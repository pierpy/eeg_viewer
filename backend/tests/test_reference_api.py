from __future__ import annotations

import io

import numpy as np
import scipy.io as sio
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _upload(edf_bytes: bytes) -> str:
    resp = client.post(
        "/api/files",
        files={"file": ("synthetic.edf", edf_bytes, "application/octet-stream")},
    )
    return resp.json()["file_id"]


def _cellstrs(arr) -> list[str]:
    return [str(cell[0]) if cell.size else "" for cell in arr[0]]


# The synthetic fixture has 4 channels: EEG1, EEG2, EEG3, EEG4.

# --- /signal ---------------------------------------------------------------


def test_signal_car_reference_spans_all_channels_ignoring_selection(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)
    resp = client.post(
        f"/api/files/{file_id}/signal",
        json={
            # Only 2 channels selected for display...
            "channels": ["EEG1", "EEG2"],
            "start_sec": 0,
            "duration_sec": 4,
            "filters": [],
            "reference": "car",
        },
    )
    assert resp.status_code == 200
    channels = resp.json()["channels"]
    # ...but the reference/output always covers every channel in the file.
    assert {c["name"] for c in channels} == {"EEG1", "EEG2", "EEG3", "EEG4"}
    total = np.sum([c["values"] for c in channels], axis=0)
    # /signal rounds values to 3 decimals on the wire, so the sum is only
    # zero up to that rounding error, not float precision.
    assert np.allclose(total, 0, atol=2e-3)


def test_signal_car_reference_excludes_bad_channels(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)
    resp = client.post(
        f"/api/files/{file_id}/signal",
        json={
            "channels": ["EEG1", "EEG2", "EEG3", "EEG4"],
            "start_sec": 0,
            "duration_sec": 4,
            "filters": [],
            "reference": "car",
            "bad_channels": ["EEG3"],
        },
    )
    assert resp.status_code == 200
    channels = resp.json()["channels"]
    names = {c["name"] for c in channels}
    assert names == {"EEG1", "EEG2", "EEG4"}
    # CAR over the 3 remaining good channels sums to ~0, not over all 4.
    # (Allowing for the /signal endpoint's 3-decimal wire rounding.)
    total = np.sum([c["values"] for c in channels], axis=0)
    assert np.allclose(total, 0, atol=2e-3)


def test_signal_bipolar_reference_spans_all_channels_ignoring_selection(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)
    resp = client.post(
        f"/api/files/{file_id}/signal",
        json={
            "channels": ["EEG1"],
            "start_sec": 0,
            "duration_sec": 4,
            "filters": [],
            "reference": "bipolar",
        },
    )
    assert resp.status_code == 200
    names = {c["name"] for c in resp.json()["channels"]}
    assert names == {"EEG1-EEG2", "EEG2-EEG3", "EEG3-EEG4"}


def test_signal_bipolar_reference_skips_bad_channel_in_chain(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)
    resp = client.post(
        f"/api/files/{file_id}/signal",
        json={
            "channels": ["EEG1"],
            "start_sec": 0,
            "duration_sec": 4,
            "filters": [],
            "reference": "bipolar",
            "bad_channels": ["EEG2"],
        },
    )
    assert resp.status_code == 200
    names = {c["name"] for c in resp.json()["channels"]}
    # EEG2 is dropped entirely, so the chain jumps straight from EEG1 to EEG3.
    assert names == {"EEG1-EEG3", "EEG3-EEG4"}


def test_signal_reference_default_is_none(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)
    resp = client.post(
        f"/api/files/{file_id}/signal",
        json={"channels": ["EEG1"], "start_sec": 0, "duration_sec": 2, "filters": []},
    )
    assert resp.status_code == 200
    assert resp.json()["channels"][0]["name"] == "EEG1"


def test_signal_none_reference_ignores_bad_channels(synthetic_edf_bytes: bytes):
    # bad_channels only affects reference computation; plain "as recorded"
    # viewing of a bad channel is unaffected.
    file_id = _upload(synthetic_edf_bytes)
    resp = client.post(
        f"/api/files/{file_id}/signal",
        json={
            "channels": ["EEG1", "EEG2"],
            "start_sec": 0,
            "duration_sec": 2,
            "filters": [],
            "bad_channels": ["EEG1"],
        },
    )
    assert resp.status_code == 200
    assert {c["name"] for c in resp.json()["channels"]} == {"EEG1", "EEG2"}


def test_signal_reference_rejects_mixed_sample_rates(mixed_rate_edf_bytes: bytes):
    file_id = _upload(mixed_rate_edf_bytes)
    resp = client.post(
        f"/api/files/{file_id}/signal",
        json={
            "channels": ["EEG1", "EEG2"],
            "start_sec": 0,
            "duration_sec": 2,
            "filters": [],
            "reference": "car",
        },
    )
    assert resp.status_code == 400


def test_signal_reference_rejects_all_channels_bad(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)
    resp = client.post(
        f"/api/files/{file_id}/signal",
        json={
            "channels": ["EEG1"],
            "start_sec": 0,
            "duration_sec": 2,
            "filters": [],
            "reference": "car",
            "bad_channels": ["EEG1", "EEG2", "EEG3", "EEG4"],
        },
    )
    assert resp.status_code == 400


# --- /spectrogram ------------------------------------------------------


def test_spectrogram_bipolar_reference_spans_all_channels(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)
    resp = client.post(
        f"/api/files/{file_id}/spectrogram",
        json={
            "channel": "EEG3-EEG4",
            "start_sec": 0,
            "duration_sec": 6,
            "filters": [],
            "reference": "bipolar",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["channel"] == "EEG3-EEG4"


def test_spectrogram_bipolar_reference_excludes_bad_channel(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)
    # With EEG2 excluded, the valid chain pairs become EEG1-EEG3 and EEG3-EEG4.
    resp = client.post(
        f"/api/files/{file_id}/spectrogram",
        json={
            "channel": "EEG1-EEG3",
            "start_sec": 0,
            "duration_sec": 6,
            "filters": [],
            "reference": "bipolar",
            "bad_channels": ["EEG2"],
        },
    )
    assert resp.status_code == 200
    assert resp.json()["channel"] == "EEG1-EEG3"


def test_spectrogram_unknown_derived_channel(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)
    resp = client.post(
        f"/api/files/{file_id}/spectrogram",
        json={
            "channel": "EEG1-EEG4",  # not adjacent in the chain -> not a valid pair
            "start_sec": 0,
            "duration_sec": 6,
            "filters": [],
            "reference": "bipolar",
        },
    )
    assert resp.status_code == 404


def test_spectrogram_reference_rejects_all_channels_bad(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)
    resp = client.post(
        f"/api/files/{file_id}/spectrogram",
        json={
            "channel": "EEG1-EEG2",
            "start_sec": 0,
            "duration_sec": 6,
            "filters": [],
            "reference": "bipolar",
            "bad_channels": ["EEG1", "EEG2", "EEG3", "EEG4"],
        },
    )
    assert resp.status_code == 400


# --- /export/mat ---------------------------------------------------------


def test_export_car_reference_spans_all_channels_ignoring_selection(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)
    resp = client.post(
        f"/api/files/{file_id}/export/mat",
        json={"channels": ["EEG1", "EEG2"], "reference": "car"},
    )
    assert resp.status_code == 200
    mat = sio.loadmat(io.BytesIO(resp.content))
    assert _cellstrs(mat["channel_labels"]) == ["EEG1", "EEG2", "EEG3", "EEG4"]
    total = mat["data"].sum(axis=0)
    assert np.allclose(total, 0, atol=1e-6)
    assert mat["export_info"]["reference_mode"][0][0][0] == "car"


def test_export_car_reference_excludes_bad_channels(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)
    resp = client.post(
        f"/api/files/{file_id}/export/mat",
        json={"reference": "car", "bad_channels": ["EEG2"]},
    )
    assert resp.status_code == 200
    mat = sio.loadmat(io.BytesIO(resp.content))
    assert _cellstrs(mat["channel_labels"]) == ["EEG1", "EEG3", "EEG4"]
    total = mat["data"].sum(axis=0)
    assert np.allclose(total, 0, atol=1e-6)


def test_export_bipolar_reference_channel_labels(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)
    resp = client.post(
        f"/api/files/{file_id}/export/mat",
        json={"channels": ["EEG1", "EEG2", "EEG3"], "reference": "bipolar"},
    )
    assert resp.status_code == 200
    mat = sio.loadmat(io.BytesIO(resp.content))
    labels = _cellstrs(mat["channel_labels"])
    assert labels == ["EEG1-EEG2", "EEG2-EEG3", "EEG3-EEG4"]
    assert mat["data"].shape[0] == 3
