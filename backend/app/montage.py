"""Re-referencing / montage transforms.

Kept separate from the routers so the math can be unit tested directly.
Each mode consumes a dict of already-read, same-length signals and the
order of channels to use, and returns a new dict — for "none"/"car" the
keys are unchanged; for "bipolar" the keys become "A-B" derived channel
names (one fewer than the input, chained sequentially).
"""

from __future__ import annotations

import numpy as np

ReferenceMode = str  # "none" | "car" | "bipolar" — validated by the schema


def bipolar_pairs(channel_order: list[str]) -> list[tuple[str, str]]:
    """The sequential ("chain"/"double banana"-style) bipolar pairing."""
    return list(zip(channel_order, channel_order[1:]))


def apply_reference(
    signals: dict[str, np.ndarray], channel_order: list[str], mode: ReferenceMode
) -> dict[str, np.ndarray]:
    if mode == "none":
        return {name: signals[name] for name in channel_order}

    if mode == "car":
        if len(channel_order) < 2:
            raise ValueError("Common average reference requires at least 2 channels")
        stack = np.vstack([signals[name] for name in channel_order])
        average = stack.mean(axis=0)
        return {name: signals[name] - average for name in channel_order}

    if mode == "bipolar":
        if len(channel_order) < 2:
            raise ValueError("Bipolar reference requires at least 2 channels")
        return {f"{a}-{b}": signals[a] - signals[b] for a, b in bipolar_pairs(channel_order)}

    raise ValueError(f"Unknown reference mode: {mode}")
