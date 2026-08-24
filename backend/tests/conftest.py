from __future__ import annotations

from pathlib import Path

import numpy as np
import pyedflib
import pytest


def _write_synthetic_edf(path: Path, n_channels: int = 4, sample_rate: int = 256, duration_sec: int = 10) -> None:
    n_samples = sample_rate * duration_sec
    t = np.arange(n_samples) / sample_rate

    writer = pyedflib.EdfWriter(str(path), n_channels, file_type=pyedflib.FILETYPE_EDFPLUS)
    headers = []
    signals = []
    rng = np.random.default_rng(42)
    for i in range(n_channels):
        headers.append(
            {
                "label": f"EEG{i + 1}",
                "dimension": "uV",
                "sample_frequency": sample_rate,
                "physical_max": 500,
                "physical_min": -500,
                "digital_max": 32767,
                "digital_min": -32768,
                "transducer": "",
                "prefilter": "",
            }
        )
        # 10 Hz sine + 50 Hz "mains noise" + white noise, distinct per channel
        sig = (
            50 * np.sin(2 * np.pi * 10 * t)
            + 20 * np.sin(2 * np.pi * 50 * t)
            + rng.normal(0, 5, size=n_samples)
            + i * 5
        )
        signals.append(sig)

    writer.setSignalHeaders(headers)
    writer.writeSamples(signals)
    writer.close()


@pytest.fixture()
def synthetic_edf_path(tmp_path: Path) -> Path:
    path = tmp_path / "synthetic.edf"
    _write_synthetic_edf(path)
    return path


@pytest.fixture()
def synthetic_edf_bytes(synthetic_edf_path: Path) -> bytes:
    return synthetic_edf_path.read_bytes()


def _write_mixed_rate_edf(path: Path, duration_sec: int = 10) -> None:
    rates = [256, 128]
    writer = pyedflib.EdfWriter(str(path), len(rates), file_type=pyedflib.FILETYPE_EDFPLUS)
    headers = []
    signals = []
    for i, sr in enumerate(rates):
        n_samples = sr * duration_sec
        t = np.arange(n_samples) / sr
        headers.append(
            {
                "label": f"EEG{i + 1}",
                "dimension": "uV",
                "sample_frequency": sr,
                "physical_max": 500,
                "physical_min": -500,
                "digital_max": 32767,
                "digital_min": -32768,
                "transducer": "",
                "prefilter": "",
            }
        )
        signals.append(10 * np.sin(2 * np.pi * 10 * t))
    writer.setSignalHeaders(headers)
    writer.writeSamples(signals)
    writer.close()


@pytest.fixture()
def mixed_rate_edf_bytes(tmp_path: Path) -> bytes:
    path = tmp_path / "mixed_rate.edf"
    _write_mixed_rate_edf(path)
    return path.read_bytes()
