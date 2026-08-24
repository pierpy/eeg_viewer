export interface ChannelInfo {
  index: number;
  name: string;
  unit: string;
  sample_rate: number;
  n_samples: number;
  physical_min: number;
  physical_max: number;
}

export interface FileInfo {
  file_id: string;
  filename: string;
  start_time: string | null;
  duration_sec: number;
  channels: ChannelInfo[];
}

// Keep in sync with backend/app/schemas.py::FilterType. Adding a new
// filter type end-to-end means: add it here, add its default in
// FilterPanel.tsx, and register its implementation in the backend's
// app/filters/registry.py.
export type FilterType = "highpass" | "lowpass" | "notch";

export interface FilterSpec {
  type: FilterType;
  enabled: boolean;
  freq: number;
  order: number;
  q: number;
}

// Keep in sync with backend/app/schemas.py::ReferenceMode.
export type ReferenceMode = "none" | "car" | "bipolar";

export interface ChannelSignal {
  name: string;
  sample_rate: number;
  values: number[];
}

export interface SignalResponse {
  start_sec: number;
  duration_sec: number;
  channels: ChannelSignal[];
}

// --- Annotations & export ------------------------------------------------

export interface BadSegment {
  id: string;
  startSec: number;
  endSec: number;
  label?: string;
}

export interface HistoryEntry {
  timestamp: string;
  action: string;
  details: Record<string, unknown>;
}

export interface ExportParams {
  fileId: string;
  channels?: string[];
  filters: FilterSpec[];
  reference?: ReferenceMode;
  badChannels: string[];
  badSegments: BadSegment[];
  history: HistoryEntry[];
  startSec?: number;
  endSec?: number;
}

// --- Spectrogram -----------------------------------------------------------

export interface SpectrogramResponse {
  channel: string;
  start_sec: number;
  duration_sec: number;
  freqs: number[];
  times: number[];
  // power_db[i][j] is the power (dB) at freqs[i], times[j].
  power_db: number[][];
}
