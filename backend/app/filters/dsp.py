"""Low-level signal processing primitives.

Kept separate from the registry so the DSP math can be unit tested and
reused (e.g. by a future export/analysis feature) independently of the
FilterSpec plumbing.
"""

from __future__ import annotations

import numpy as np
from scipy import signal


def _validate_nyquist(freq: float, sample_rate: float, label: str) -> None:
    nyquist = sample_rate / 2.0
    if freq <= 0 or freq >= nyquist:
        raise ValueError(
            f"{label} frequency {freq} Hz must be within (0, {nyquist} Hz) "
            f"for a signal sampled at {sample_rate} Hz"
        )


def highpass(x: np.ndarray, sample_rate: float, cutoff: float, order: int = 4) -> np.ndarray:
    _validate_nyquist(cutoff, sample_rate, "Highpass cutoff")
    sos = signal.butter(order, cutoff, btype="highpass", fs=sample_rate, output="sos")
    return signal.sosfiltfilt(sos, x)


def lowpass(x: np.ndarray, sample_rate: float, cutoff: float, order: int = 4) -> np.ndarray:
    _validate_nyquist(cutoff, sample_rate, "Lowpass cutoff")
    sos = signal.butter(order, cutoff, btype="lowpass", fs=sample_rate, output="sos")
    return signal.sosfiltfilt(sos, x)


def notch(x: np.ndarray, sample_rate: float, freq: float, q: float = 30.0) -> np.ndarray:
    _validate_nyquist(freq, sample_rate, "Notch")
    b, a = signal.iirnotch(freq, q, fs=sample_rate)
    return signal.filtfilt(b, a, x)
