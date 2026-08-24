from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_upload_and_get_info(synthetic_edf_bytes: bytes):
    resp = client.post(
        "/api/files",
        files={"file": ("synthetic.edf", synthetic_edf_bytes, "application/octet-stream")},
    )
    assert resp.status_code == 200
    info = resp.json()
    assert info["filename"] == "synthetic.edf"
    assert len(info["channels"]) == 4
    assert info["channels"][0]["name"] == "EEG1"
    assert info["duration_sec"] == 10.0

    resp2 = client.get(f"/api/files/{info['file_id']}")
    assert resp2.status_code == 200
    assert resp2.json()["file_id"] == info["file_id"]


def test_upload_rejects_non_edf():
    resp = client.post(
        "/api/files",
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert resp.status_code == 400


def test_get_file_info_not_found():
    resp = client.get("/api/files/does-not-exist")
    assert resp.status_code == 404


def test_signal_endpoint_returns_requested_window(synthetic_edf_bytes: bytes):
    upload = client.post(
        "/api/files",
        files={"file": ("synthetic.edf", synthetic_edf_bytes, "application/octet-stream")},
    ).json()
    file_id = upload["file_id"]

    resp = client.post(
        f"/api/files/{file_id}/signal",
        json={"channels": ["EEG1", "EEG2"], "start_sec": 1, "duration_sec": 2, "filters": []},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["duration_sec"] == 2
    assert {c["name"] for c in body["channels"]} == {"EEG1", "EEG2"}
    for ch in body["channels"]:
        assert len(ch["values"]) > 0


def test_signal_endpoint_applies_filters(synthetic_edf_bytes: bytes):
    upload = client.post(
        "/api/files",
        files={"file": ("synthetic.edf", synthetic_edf_bytes, "application/octet-stream")},
    ).json()
    file_id = upload["file_id"]

    resp = client.post(
        f"/api/files/{file_id}/signal",
        json={
            "channels": ["EEG1"],
            "start_sec": 0,
            "duration_sec": 5,
            "filters": [
                {"type": "highpass", "freq": 1, "order": 4},
                {"type": "lowpass", "freq": 40, "order": 4},
                {"type": "notch", "freq": 50, "q": 30},
            ],
        },
    )
    assert resp.status_code == 200
    assert len(resp.json()["channels"][0]["values"]) > 0


def test_signal_endpoint_unknown_channel(synthetic_edf_bytes: bytes):
    upload = client.post(
        "/api/files",
        files={"file": ("synthetic.edf", synthetic_edf_bytes, "application/octet-stream")},
    ).json()
    file_id = upload["file_id"]

    resp = client.post(
        f"/api/files/{file_id}/signal",
        json={"channels": ["NOPE"], "start_sec": 0, "duration_sec": 1, "filters": []},
    )
    assert resp.status_code == 404


def test_signal_endpoint_unknown_file():
    resp = client.post(
        "/api/files/does-not-exist/signal",
        json={"channels": ["EEG1"], "start_sec": 0, "duration_sec": 1, "filters": []},
    )
    assert resp.status_code == 404


def test_signal_endpoint_decimates_large_window(synthetic_edf_bytes: bytes):
    upload = client.post(
        "/api/files",
        files={"file": ("synthetic.edf", synthetic_edf_bytes, "application/octet-stream")},
    ).json()
    file_id = upload["file_id"]

    resp = client.post(
        f"/api/files/{file_id}/signal",
        json={"channels": ["EEG1"], "start_sec": 0, "duration_sec": 10, "filters": [], "max_points": 100},
    )
    assert resp.status_code == 200
    assert len(resp.json()["channels"][0]["values"]) <= 100
