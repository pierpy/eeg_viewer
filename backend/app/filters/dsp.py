"""Low-level signal processing primitives.

Kept separate from the registry so the DSP math can be unit tested and
reused (e.g. by a future export/analysis feature) independently of the
FilterSpec plumbing.
"""

from __future__ import annotations

from functools import lru_cache

import numpy as np
from scipy import signal


def _validate_nyquist(freq: float, sample_rate: float, label: str) -> None:
    nyquist = sample_rate / 2.0
    if freq <= 0 or freq >= nyquist:
        raise ValueError(
            f"{label} frequency {freq} Hz must be within (0, {nyquist} Hz) "
            f"for a signal sampled at {sample_rate} Hz"
        )


# Designing a filter (butter/iirnotch) is pure given (order/Q, cutoff,
# sample_rate) but a reference/montage view now filters every good
# channel on every request, so the same handful of designs get redone a
# lot. Caching the coefficients — not the filtering itself, which still
# runs per channel over that channel's own samples — cuts that repeated
# design overhead. Requests always carry plain floats/ints, so the cache
# key is stable and small (bounded by the distinct filter settings a user
# actually dials in).
@lru_cache(maxsize=256)
def _butter_sos(order: int, cutoff: float, sample_rate: float, btype: str) -> np.ndarray:
    return signal.butter(order, cutoff, btype=btype, fs=sample_rate, output="sos")


@lru_cache(maxsize=256)
def _notch_coeffs(freq: float, sample_rate: float, q: float) -> tuple[np.ndarray, np.ndarray]:
    return signal.iirnotch(freq, q, fs=sample_rate)


def highpass(x: np.ndarray, sample_rate: float, cutoff: float, order: int = 4) -> np.ndarray:
    _validate_nyquist(cutoff, sample_rate, "Highpass cutoff")
    sos = _butter_sos(order, cutoff, sample_rate, "highpass")
    return signal.sosfiltfilt(sos, x)


def lowpass(x: np.ndarray, sample_rate: float, cutoff: float, order: int = 4) -> np.ndarray:
    _validate_nyquist(cutoff, sample_rate, "Lowpass cutoff")
    sos = _butter_sos(order, cutoff, sample_rate, "lowpass")
    return signal.sosfiltfilt(sos, x)


def notch(x: np.ndarray, sample_rate: float, freq: float, q: float = 30.0) -> np.ndarray:
    _validate_nyquist(freq, sample_rate, "Notch")
    b, a = _notch_coeffs(freq, sample_rate, q)
    return signal.filtfilt(b, a, x)
