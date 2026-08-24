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
