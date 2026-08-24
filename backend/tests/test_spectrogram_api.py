from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _upload(synthetic_edf_bytes: bytes) -> str:
    resp = client.post(
        "/api/files",
        files={"file": ("synthetic.edf", synthetic_edf_bytes, "application/octet-stream")},
    )
    return resp.json()["file_id"]


def test_spectrogram_endpoint_basic(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)

    resp = client.post(
        f"/api/files/{file_id}/spectrogram",
        json={"channel": "EEG1", "start_sec": 0, "duration_sec": 8, "filters": []},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["channel"] == "EEG1"
    n_freqs = len(body["freqs"])
    n_times = len(body["times"])
    assert n_freqs > 0 and n_times > 0
    assert len(body["power_db"]) == n_freqs
    assert all(len(row) == n_times for row in body["power_db"])
    # default max_freq clip
    assert max(body["freqs"]) <= 45.0


def test_spectrogram_endpoint_applies_filters(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)

    resp = client.post(
        f"/api/files/{file_id}/spectrogram",
        json={
            "channel": "EEG1",
            "start_sec": 0,
            "duration_sec": 8,
            "filters": [{"type": "lowpass", "freq": 20, "order": 4}],
        },
    )
    assert resp.status_code == 200


def test_spectrogram_endpoint_unknown_channel(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)
    resp = client.post(
        f"/api/files/{file_id}/spectrogram",
        json={"channel": "NOPE", "start_sec": 0, "duration_sec": 2, "filters": []},
    )
    assert resp.status_code == 404


def test_spectrogram_endpoint_unknown_file():
    resp = client.post(
        "/api/files/does-not-exist/spectrogram",
        json={"channel": "EEG1", "start_sec": 0, "duration_sec": 2, "filters": []},
    )
    assert resp.status_code == 404


def test_spectrogram_endpoint_custom_max_freq(synthetic_edf_bytes: bytes):
    file_id = _upload(synthetic_edf_bytes)
    resp = client.post(
        f"/api/files/{file_id}/spectrogram",
        json={"channel": "EEG1", "start_sec": 0, "duration_sec": 8, "filters": [], "max_freq": 20},
    )
    assert resp.status_code == 200
    assert max(resp.json()["freqs"]) <= 20
