import type { FileInfo, FilterSpec, SignalResponse } from "../types";

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
      max_points: params.maxPoints,
    }),
    signal: params.signal,
  });
  return unwrap<SignalResponse>(resp);
}
