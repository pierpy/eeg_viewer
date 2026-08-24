"""Filter pipeline registry.

To add a new visualization filter in the future:
  1. implement the math in `dsp.py`
  2. add a `FilterType` literal in `schemas.py`
  3. register a small adapter here, keyed by that type name

Everything else (API validation, request/response shape, frontend wiring)
stays untouched.
"""

from __future__ import annotations

from typing import Callable

import numpy as np

from app.schemas import FilterSpec
from . import dsp

_FilterFn = Callable[[np.ndarray, float, FilterSpec], np.ndarray]


def _highpass(x: np.ndarray, sample_rate: float, spec: FilterSpec) -> np.ndarray:
    return dsp.highpass(x, sample_rate, spec.freq, spec.order)


def _lowpass(x: np.ndarray, sample_rate: float, spec: FilterSpec) -> np.ndarray:
    return dsp.lowpass(x, sample_rate, spec.freq, spec.order)


def _notch(x: np.ndarray, sample_rate: float, spec: FilterSpec) -> np.ndarray:
    return dsp.notch(x, sample_rate, spec.freq, spec.q)


FILTER_REGISTRY: dict[str, _FilterFn] = {
    "highpass": _highpass,
    "lowpass": _lowpass,
    "notch": _notch,
}


def apply_filter_pipeline(x: np.ndarray, sample_rate: float, specs: list[FilterSpec]) -> np.ndarray:
    """Apply enabled filters in order, chaining output -> input."""
    out = x
    for spec in specs:
        if not spec.enabled:
            continue
        fn = FILTER_REGISTRY.get(spec.type)
        if fn is None:
            raise ValueError(f"Unknown filter type: {spec.type}")
        # Filtfilt-style filters need a signal longer than a small multiple
        # of the filter order; skip degenerate/too-short chunks gracefully.
        if len(out) < 32:
            continue
        out = fn(out, sample_rate, spec)
    return out
