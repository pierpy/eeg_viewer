from __future__ import annotations

import numpy as np

from app.filters import apply_filter_pipeline
from app.schemas import FilterSpec


def _sine(freq: float, sample_rate: float = 256.0, duration: float = 4.0) -> np.ndarray:
    t = np.arange(0, duration, 1 / sample_rate)
    return np.sin(2 * np.pi * freq * t)


def test_lowpass_attenuates_high_frequency():
    sr = 256.0
    x = _sine(2, sr) + _sine(60, sr)
    y = apply_filter_pipeline(x, sr, [FilterSpec(type="lowpass", freq=20)])
    # Compare high-frequency energy before/after via FFT magnitude near 60 Hz.
    freqs = np.fft.rfftfreq(len(x), 1 / sr)
    mag_before = np.abs(np.fft.rfft(x))
    mag_after = np.abs(np.fft.rfft(y))
    idx = np.argmin(np.abs(freqs - 60))
    assert mag_after[idx] < 0.1 * mag_before[idx]


def test_highpass_attenuates_low_frequency():
    sr = 256.0
    x = _sine(1, sr) + _sine(40, sr)
    y = apply_filter_pipeline(x, sr, [FilterSpec(type="highpass", freq=10)])
    freqs = np.fft.rfftfreq(len(x), 1 / sr)
    mag_before = np.abs(np.fft.rfft(x))
    mag_after = np.abs(np.fft.rfft(y))
    idx = np.argmin(np.abs(freqs - 1))
    assert mag_after[idx] < 0.1 * mag_before[idx]


def test_notch_attenuates_target_frequency():
    sr = 256.0
    x = _sine(10, sr) + _sine(50, sr)
    y = apply_filter_pipeline(x, sr, [FilterSpec(type="notch", freq=50, q=30)])
    freqs = np.fft.rfftfreq(len(x), 1 / sr)
    mag_before = np.abs(np.fft.rfft(x))
    mag_after = np.abs(np.fft.rfft(y))
    idx50 = np.argmin(np.abs(freqs - 50))
    idx10 = np.argmin(np.abs(freqs - 10))
    assert mag_after[idx50] < 0.2 * mag_before[idx50]
    # the 10 Hz component should survive largely intact
    assert mag_after[idx10] > 0.8 * mag_before[idx10]


def test_disabled_filter_is_noop():
    sr = 256.0
    x = _sine(5, sr)
    y = apply_filter_pipeline(x, sr, [FilterSpec(type="lowpass", freq=1, enabled=False)])
    assert np.allclose(x, y)


def test_pipeline_chains_filters_in_order():
    sr = 256.0
    x = _sine(5, sr) + _sine(50, sr) + _sine(100, sr)
    y = apply_filter_pipeline(
        x,
        sr,
        [
            FilterSpec(type="highpass", freq=2),
            FilterSpec(type="lowpass", freq=60),
            FilterSpec(type="notch", freq=50),
        ],
    )
    freqs = np.fft.rfftfreq(len(x), 1 / sr)
    mag = np.abs(np.fft.rfft(y))
    idx5 = np.argmin(np.abs(freqs - 5))
    idx50 = np.argmin(np.abs(freqs - 50))
    idx100 = np.argmin(np.abs(freqs - 100))
    assert mag[idx5] > mag[idx50]
    assert mag[idx5] > mag[idx100]
