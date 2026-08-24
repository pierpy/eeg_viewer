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


# --- /signal ---------------------------------------------------------------


def test_signal_car_reference_sums_to_near_zero(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)
    resp = client.post(
        f"/api/files/{file_id}/signal",
        json={
            "channels": ["EEG1", "EEG2", "EEG3"],
            "start_sec": 0,
            "duration_sec": 4,
            "filters": [],
            "reference": "car",
        },
    )
    assert resp.status_code == 200
    channels = resp.json()["channels"]
    assert {c["name"] for c in channels} == {"EEG1", "EEG2", "EEG3"}
    total = np.sum([c["values"] for c in channels], axis=0)
    assert np.allclose(total, 0, atol=1e-6)


def test_signal_bipolar_reference_produces_derived_channels(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)
    resp = client.post(
        f"/api/files/{file_id}/signal",
        json={
            "channels": ["EEG1", "EEG2", "EEG3"],
            "start_sec": 0,
            "duration_sec": 4,
            "filters": [],
            "reference": "bipolar",
        },
    )
    assert resp.status_code == 200
    names = {c["name"] for c in resp.json()["channels"]}
    assert names == {"EEG1-EEG2", "EEG2-EEG3"}


def test_signal_reference_default_is_none(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)
    resp = client.post(
        f"/api/files/{file_id}/signal",
        json={"channels": ["EEG1"], "start_sec": 0, "duration_sec": 2, "filters": []},
    )
    assert resp.status_code == 200
    assert resp.json()["channels"][0]["name"] == "EEG1"


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


# --- /spectrogram ------------------------------------------------------


def test_spectrogram_bipolar_reference(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)
    resp = client.post(
        f"/api/files/{file_id}/spectrogram",
        json={
            "channel": "EEG1-EEG2",
            "start_sec": 0,
            "duration_sec": 6,
            "filters": [],
            "reference": "bipolar",
            "montage_channels": ["EEG1", "EEG2", "EEG3"],
        },
    )
    assert resp.status_code == 200
    assert resp.json()["channel"] == "EEG1-EEG2"


def test_spectrogram_reference_requires_montage_channels(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)
    resp = client.post(
        f"/api/files/{file_id}/spectrogram",
        json={
            "channel": "EEG1-EEG2",
            "start_sec": 0,
            "duration_sec": 6,
            "filters": [],
            "reference": "bipolar",
        },
    )
    assert resp.status_code == 400


def test_spectrogram_unknown_derived_channel(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)
    resp = client.post(
        f"/api/files/{file_id}/spectrogram",
        json={
            "channel": "EEG1-EEG3",  # not adjacent in the chain -> not a valid pair
            "start_sec": 0,
            "duration_sec": 6,
            "filters": [],
            "reference": "bipolar",
            "montage_channels": ["EEG1", "EEG2", "EEG3"],
        },
    )
    assert resp.status_code == 404


# --- /export/mat ---------------------------------------------------------


def test_export_car_reference(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)
    resp = client.post(
        f"/api/files/{file_id}/export/mat",
        json={"channels": ["EEG1", "EEG2", "EEG3"], "reference": "car"},
    )
    assert resp.status_code == 200
    mat = sio.loadmat(io.BytesIO(resp.content))
    total = mat["data"].sum(axis=0)
    assert np.allclose(total, 0, atol=1e-6)
    assert mat["export_info"]["reference_mode"][0][0][0] == "car"


def test_export_bipolar_reference_channel_labels(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)
    resp = client.post(
        f"/api/files/{file_id}/export/mat",
        json={"channels": ["EEG1", "EEG2", "EEG3"], "reference": "bipolar"},
    )
    assert resp.status_code == 200
    mat = sio.loadmat(io.BytesIO(resp.content))
    labels = [cell[0] for cell in mat["channel_labels"][0]]
    assert labels == ["EEG1-EEG2", "EEG2-EEG3"]
    assert mat["data"].shape[0] == 2
