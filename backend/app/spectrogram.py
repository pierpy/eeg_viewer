"""Time-frequency (spectrogram) computation, kept separate from the
router so the DSP math can be unit tested directly.
"""

from __future__ import annotations

import numpy as np
from scipy import signal

# Power values are converted to dB; this floor avoids log(0) for silent/zero
# segments without materially affecting the visible dynamic range.
_POWER_FLOOR = 1e-12


def compute_spectrogram(
    x: np.ndarray, sample_rate: float, max_freq: float | None = None
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Returns (freqs, times, power_db) with power_db shaped [len(freqs), len(times)].

    Uses ~1-second analysis windows (50% overlap) by default, a reasonable
    balance of time/frequency resolution for EEG-length viewing windows
    (seconds to tens of seconds).
    """
    if len(x) < 16:
        raise ValueError("Signal window is too short to compute a spectrogram")

    nperseg = min(int(sample_rate), len(x))
    nperseg = max(nperseg, 8)
    noverlap = nperseg // 2

    freqs, times, sxx = signal.spectrogram(
        x, fs=sample_rate, nperseg=nperseg, noverlap=noverlap, scaling="density"
    )
    power_db = 10 * np.log10(sxx + _POWER_FLOOR)

    if max_freq is not None:
        mask = freqs <= max_freq
        freqs = freqs[mask]
        power_db = power_db[mask, :]

    return freqs, times, power_db
