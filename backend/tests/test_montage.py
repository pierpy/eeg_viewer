from __future__ import annotations

import numpy as np
import pytest

from app.montage import apply_reference, bipolar_pairs


def test_none_reference_is_passthrough():
    signals = {"A": np.array([1.0, 2.0]), "B": np.array([3.0, 4.0])}
    out = apply_reference(signals, ["A", "B"], "none")
    assert list(out.keys()) == ["A", "B"]
    assert np.array_equal(out["A"], signals["A"])
    assert np.array_equal(out["B"], signals["B"])


def test_car_subtracts_mean_across_channels():
    a = np.array([1.0, 2.0, 3.0])
    b = np.array([3.0, 4.0, 5.0])
    c = np.array([5.0, 0.0, 1.0])
    signals = {"A": a, "B": b, "C": c}
    out = apply_reference(signals, ["A", "B", "C"], "car")
    avg = (a + b + c) / 3
    assert np.allclose(out["A"], a - avg)
    assert np.allclose(out["B"], b - avg)
    assert np.allclose(out["C"], c - avg)
    # the referenced channels should sum to (near) zero at every sample
    total = out["A"] + out["B"] + out["C"]
    assert np.allclose(total, 0)


def test_car_requires_at_least_two_channels():
    with pytest.raises(ValueError):
        apply_reference({"A": np.array([1.0])}, ["A"], "car")


def test_bipolar_chain_pairs():
    assert bipolar_pairs(["A", "B", "C", "D"]) == [("A", "B"), ("B", "C"), ("C", "D")]


def test_bipolar_computes_sequential_differences():
    a = np.array([5.0, 5.0])
    b = np.array([2.0, 3.0])
    c = np.array([1.0, 1.0])
    signals = {"A": a, "B": b, "C": c}
    out = apply_reference(signals, ["A", "B", "C"], "bipolar")
    assert set(out.keys()) == {"A-B", "B-C"}
    assert np.allclose(out["A-B"], a - b)
    assert np.allclose(out["B-C"], b - c)


def test_bipolar_requires_at_least_two_channels():
    with pytest.raises(ValueError):
        apply_reference({"A": np.array([1.0])}, ["A"], "bipolar")


def test_unknown_reference_mode_raises():
    with pytest.raises(ValueError):
        apply_reference({"A": np.array([1.0]), "B": np.array([1.0])}, ["A", "B"], "nonsense")
