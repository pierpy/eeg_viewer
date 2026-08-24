"""Storage and access layer for uploaded EDF files.

Responsible for:
  - persisting uploaded files to disk
  - caching parsed header metadata (channel list, sample rates, ...)
  - reading arbitrary time windows of one or more channels

Kept independent of FastAPI so it could be swapped out (e.g. for a
database-backed registry) without touching the routers.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from pathlib import Path
from threading import Lock

import numpy as np
import pyedflib

from app.config import UPLOAD_DIR
from app.schemas import ChannelInfo, FileInfo


class EdfNotFoundError(KeyError):
    pass


class ChannelNotFoundError(KeyError):
    pass


@dataclass
class StoredFile:
    file_id: str
    filename: str
    path: Path
    channels: list[ChannelInfo]
    duration_sec: float
    start_time: str | None


class EdfStore:
    """Process-local registry of uploaded EDF files.

    Thread-safe for the simple dict operations used here; actual EDF reads
    open a fresh `EdfReader` per call, which is what pyedflib expects for
    safe concurrent access.
    """

    def __init__(self) -> None:
        self._files: dict[str, StoredFile] = {}
        self._lock = Lock()

    def save_upload(self, filename: str, data: bytes) -> FileInfo:
        file_id = uuid.uuid4().hex
        dest = UPLOAD_DIR / f"{file_id}.edf"
        dest.write_bytes(data)

        try:
            reader = pyedflib.EdfReader(str(dest))
        except Exception as exc:  # pyedflib raises plain OSError/Exception on bad files
            dest.unlink(missing_ok=True)
            raise ValueError(f"Could not parse EDF file: {exc}") from exc

        try:
            n_signals = reader.signals_in_file
            labels = reader.getSignalLabels()
            channels: list[ChannelInfo] = []
            max_duration = 0.0
            for i in range(n_signals):
                sample_rate = float(reader.getSampleFrequency(i))
                n_samples = int(reader.getNSamples()[i])
                duration = n_samples / sample_rate if sample_rate else 0.0
                max_duration = max(max_duration, duration)
                channels.append(
                    ChannelInfo(
                        index=i,
                        name=labels[i].strip() or f"ch{i}",
                        unit=reader.getPhysicalDimension(i).strip(),
                        sample_rate=sample_rate,
                        n_samples=n_samples,
                        physical_min=float(reader.getPhysicalMinimum(i)),
                        physical_max=float(reader.getPhysicalMaximum(i)),
                    )
                )
            try:
                start_time = reader.getStartdatetime().isoformat()
            except Exception:
                start_time = None
        finally:
            reader.close()

        stored = StoredFile(
            file_id=file_id,
            filename=filename,
            path=dest,
            channels=channels,
            duration_sec=max_duration,
            start_time=start_time,
        )
        with self._lock:
            self._files[file_id] = stored

        return self.get_info(file_id)

    def get_info(self, file_id: str) -> FileInfo:
        stored = self._get(file_id)
        return FileInfo(
            file_id=stored.file_id,
            filename=stored.filename,
            start_time=stored.start_time,
            duration_sec=stored.duration_sec,
            channels=stored.channels,
        )

    def delete(self, file_id: str) -> None:
        with self._lock:
            stored = self._files.pop(file_id, None)
        if stored is not None:
            stored.path.unlink(missing_ok=True)

    def _get(self, file_id: str) -> StoredFile:
        with self._lock:
            stored = self._files.get(file_id)
        if stored is None:
            raise EdfNotFoundError(file_id)
        return stored

    def read_window(
        self, file_id: str, channel_names: list[str], start_sec: float, duration_sec: float
    ) -> dict[str, tuple[np.ndarray, float]]:
        """Return {channel_name: (samples, sample_rate)} for the requested window."""
        stored = self._get(file_id)
        by_name = {c.name: c for c in stored.channels}
        for name in channel_names:
            if name not in by_name:
                raise ChannelNotFoundError(name)

        result: dict[str, tuple[np.ndarray, float]] = {}
        reader = pyedflib.EdfReader(str(stored.path))
        try:
            for name in channel_names:
                ch = by_name[name]
                sr = ch.sample_rate
                start_sample = int(round(start_sec * sr))
                n_samples = int(round(duration_sec * sr))
                start_sample = max(0, min(start_sample, ch.n_samples))
                n_samples = max(0, min(n_samples, ch.n_samples - start_sample))
                if n_samples == 0:
                    result[name] = (np.array([], dtype=np.float64), sr)
                    continue
                data = reader.readSignal(ch.index, start=start_sample, n=n_samples)
                result[name] = (np.asarray(data, dtype=np.float64), sr)
        finally:
            reader.close()
        return result


store = EdfStore()
