from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class ChannelInfo(BaseModel):
    index: int
    name: str
    unit: str
    sample_rate: float
    n_samples: int
    physical_min: float
    physical_max: float


class FileInfo(BaseModel):
    file_id: str
    filename: str
    start_time: Optional[str] = None
    duration_sec: float
    channels: list[ChannelInfo]


# --- Filters -----------------------------------------------------------
# Each filter spec is one stage in a pipeline applied, in order, to a
# channel's signal at read time. New filter types are added by:
#   1) adding a literal to FilterType
#   2) registering an implementation in app/filters/registry.py
# No other code needs to change.

FilterType = Literal["highpass", "lowpass", "notch"]


class FilterSpec(BaseModel):
    type: FilterType
    enabled: bool = True
    # highpass/lowpass: cutoff frequency in Hz
    # notch: center frequency in Hz (e.g. 50 or 60)
    freq: float = Field(gt=0)
    # Butterworth order for highpass/lowpass; ignored by notch.
    order: int = Field(default=4, ge=1, le=8)
    # Quality factor for the notch filter; ignored by highpass/lowpass.
    q: float = Field(default=30.0, gt=0)


# --- Reference / montage -------------------------------------------------
# "none": as recorded. "car": subtract the average of the requested
# channels from each of them (common average reference). "bipolar":
# sequential (chain) derivations channel[i] - channel[i+1], producing one
# fewer derived channel than the input — see app/montage.py.
ReferenceMode = Literal["none", "car", "bipolar"]


class SignalRequest(BaseModel):
    # Which channels to display. Ignored when reference != "none": the
    # reference/montage is always computed (and returned) over every
    # non-bad channel in the file — see bad_channels below and
    # routers/signal.py.
    channels: list[str]
    start_sec: float = Field(ge=0)
    duration_sec: float = Field(gt=0)
    filters: list[FilterSpec] = Field(default_factory=list)
    reference: ReferenceMode = "none"
    # Channels excluded from the CAR average / bipolar chain whenever
    # reference != "none". Has no effect when reference == "none" (a bad
    # channel can still be viewed as-recorded).
    bad_channels: list[str] = Field(default_factory=list)
    # Max points returned per channel; the server decimates if needed.
    max_points: Optional[int] = None


class ChannelSignal(BaseModel):
    name: str
    sample_rate: float
    values: list[float]


class SignalResponse(BaseModel):
    start_sec: float
    duration_sec: float
    channels: list[ChannelSignal]


# --- Annotations & export -----------------------------------------------
# Bad-channel/bad-segment marks and the operation history are kept
# client-side (this app has no per-file persistence layer) and sent along
# with an export request so the exported file is self-describing.


class BadSegment(BaseModel):
    start_sec: float = Field(ge=0)
    end_sec: float = Field(ge=0)
    label: str = ""


class HistoryEntry(BaseModel):
    timestamp: str
    action: str
    details: dict = Field(default_factory=dict)


class ExportRequest(BaseModel):
    # None = export all channels in the file.
    channels: Optional[list[str]] = None
    filters: list[FilterSpec] = Field(default_factory=list)
    reference: ReferenceMode = "none"
    bad_channels: list[str] = Field(default_factory=list)
    bad_segments: list[BadSegment] = Field(default_factory=list)
    history: list[HistoryEntry] = Field(default_factory=list)
    # None = export the full recording.
    start_sec: Optional[float] = Field(default=None, ge=0)
    end_sec: Optional[float] = Field(default=None, ge=0)


# --- Spectrogram ----------------------------------------------------------


class SpectrogramRequest(BaseModel):
    # The channel to compute. When reference != "none" this may be a
    # derived name (e.g. "EEG1-EEG2" for bipolar) that must appear once
    # `reference` is applied over every non-bad channel in the file.
    channel: str
    start_sec: float = Field(ge=0)
    duration_sec: float = Field(gt=0)
    filters: list[FilterSpec] = Field(default_factory=list)
    reference: ReferenceMode = "none"
    # Channels excluded from the CAR average / bipolar chain whenever
    # reference != "none" — see routers/spectrogram.py.
    bad_channels: list[str] = Field(default_factory=list)
    # Frequencies above this are dropped from the response; EEG-relevant
    # activity lives well under Nyquist, and clipping keeps both the
    # payload and the color scale focused. None = up to Nyquist.
    max_freq: Optional[float] = Field(default=45.0, gt=0)


class SpectrogramResponse(BaseModel):
    channel: str
    start_sec: float
    duration_sec: float
    freqs: list[float]
    times: list[float]
    # power_db[i][j] is the power (dB) at freqs[i], times[j].
    power_db: list[list[float]]
