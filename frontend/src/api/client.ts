import type { ExportParams, FileInfo, FilterSpec, ReferenceMode, SignalResponse, SpectrogramResponse } from "../types";

const BASE = "/api";

async function unwrap<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const body = await resp.json();
      detail = body.detail ?? detail;
    } catch {
      // response wasn't JSON; fall back to statusText
    }
    throw new Error(detail);
  }
  return resp.json() as Promise<T>;
}

export async function uploadEdf(file: File): Promise<FileInfo> {
  const form = new FormData();
  form.append("file", file);
  const resp = await fetch(`${BASE}/files`, { method: "POST", body: form });
  return unwrap<FileInfo>(resp);
}

export async function getFileInfo(fileId: string): Promise<FileInfo> {
  const resp = await fetch(`${BASE}/files/${fileId}`);
  return unwrap<FileInfo>(resp);
}

export interface GetSignalParams {
  fileId: string;
  channels: string[];
  startSec: number;
  durationSec: number;
  filters: FilterSpec[];
  reference?: ReferenceMode;
  maxPoints?: number;
  signal?: AbortSignal;
}

export async function getSignal(params: GetSignalParams): Promise<SignalResponse> {
  const resp = await fetch(`${BASE}/files/${params.fileId}/signal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      channels: params.channels,
      start_sec: params.startSec,
      duration_sec: params.durationSec,
      filters: params.filters,
      reference: params.reference ?? "none",
      max_points: params.maxPoints,
    }),
    signal: params.signal,
  });
  return unwrap<SignalResponse>(resp);
}

export interface ExportResult {
  blob: Blob;
  filename: string;
}

function filenameFromContentDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const match = /filename="?([^"]+)"?/.exec(header);
  return match ? match[1] : fallback;
}

export async function exportMat(params: ExportParams): Promise<ExportResult> {
  const resp = await fetch(`${BASE}/files/${params.fileId}/export/mat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      channels: params.channels ?? null,
      filters: params.filters,
      reference: params.reference ?? "none",
      bad_channels: params.badChannels,
      bad_segments: params.badSegments.map((s) => ({
        start_sec: s.startSec,
        end_sec: s.endSec,
        label: s.label ?? "",
      })),
      history: params.history,
      start_sec: params.startSec ?? null,
      end_sec: params.endSec ?? null,
    }),
  });
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const body = await resp.json();
      detail = body.detail ?? detail;
    } catch {
      // response wasn't JSON
    }
    throw new Error(detail);
  }
  const blob = await resp.blob();
  const filename = filenameFromContentDisposition(resp.headers.get("Content-Disposition"), "export.mat");
  return { blob, filename };
}

export interface GetSpectrogramParams {
  fileId: string;
  channel: string;
  startSec: number;
  durationSec: number;
  filters: FilterSpec[];
  reference?: ReferenceMode;
  montageChannels?: string[];
  maxFreq?: number;
  signal?: AbortSignal;
}

export async function getSpectrogram(params: GetSpectrogramParams): Promise<SpectrogramResponse> {
  const resp = await fetch(`${BASE}/files/${params.fileId}/spectrogram`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      channel: params.channel,
      start_sec: params.startSec,
      duration_sec: params.durationSec,
      filters: params.filters,
      reference: params.reference ?? "none",
      montage_channels: params.montageChannels ?? [],
      max_freq: params.maxFreq,
    }),
    signal: params.signal,
  });
  return unwrap<SpectrogramResponse>(resp);
}
