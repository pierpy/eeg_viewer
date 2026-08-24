from __future__ import annotations

import numpy as np

from app.spectrogram import compute_spectrogram


def _sine(freq: float, sample_rate: float = 256.0, duration: float = 8.0) -> np.ndarray:
    t = np.arange(0, duration, 1 / sample_rate)
    return np.sin(2 * np.pi * freq * t)


def test_spectrogram_detects_dominant_frequency():
    sr = 256.0
    x = _sine(12, sr)
    freqs, times, power_db = compute_spectrogram(x, sr)

    assert power_db.shape == (len(freqs), len(times))
    avg_power = power_db.mean(axis=1)
    peak_freq = freqs[np.argmax(avg_power)]
    assert abs(peak_freq - 12) <= 1.5


def test_spectrogram_respects_max_freq():
    sr = 256.0
    x = _sine(10, sr)
    freqs, _, power_db = compute_spectrogram(x, sr, max_freq=30)
    assert freqs.max() <= 30
    assert power_db.shape[0] == len(freqs)


def test_spectrogram_rejects_too_short_signal():
    sr = 256.0
    x = np.zeros(4)
    try:
        compute_spectrogram(x, sr)
        assert False, "expected ValueError"
    except ValueError:
        pass


def test_spectrogram_times_are_within_window():
    sr = 256.0
    duration = 5.0
    x = _sine(10, sr, duration)
    _, times, _ = compute_spectrogram(x, sr)
    assert times[0] >= 0
    assert times[-1] <= duration
