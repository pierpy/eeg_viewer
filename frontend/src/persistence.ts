/**
 * Client-side persistence for per-file annotations (bad channels/segments,
 * active filters, operation history, view state). The backend is
 * deliberately stateless (see edf_store.py) and each upload gets a fresh
 * file_id, so identity here is derived from the file's own content hash
 * rather than the server-assigned id — reopening the same .edf, even
 * after a page reload or a re-upload, recovers the same session.
 */

import type { BadSegment, FilterSpec, HistoryEntry } from "./types";

const STORAGE_PREFIX = "eeg-viewer:session:v1:";
const SESSION_VERSION = 1;

export interface PersistedSession {
  version: typeof SESSION_VERSION;
  savedAt: string;
  selectedChannels: string[];
  filters: FilterSpec[];
  badChannels: string[];
  badSegments: BadSegment[];
  history: HistoryEntry[];
  gain: number;
  startSec: number;
  windowSec: number;
}

export type PersistableSession = Omit<PersistedSession, "version" | "savedAt">;

/**
 * Identifies a file by content hash (SHA-256) when SubtleCrypto is
 * available in a secure context, falling back to a cheap
 * name/size/mtime signature otherwise (older browsers, plain HTTP).
 */
export async function hashFile(file: File): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle && window.isSecureContext) {
    try {
      const buffer = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", buffer);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch {
      // fall through to the cheap fallback below
    }
  }
  return `fallback:${file.name}:${file.size}:${file.lastModified}`;
}

export function loadSession(fileHash: string): PersistedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + fileHash);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSession;
    if (parsed.version !== SESSION_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(fileHash: string, session: PersistableSession): void {
  try {
    const payload: PersistedSession = {
      version: SESSION_VERSION,
      savedAt: new Date().toISOString(),
      ...session,
    };
    localStorage.setItem(STORAGE_PREFIX + fileHash, JSON.stringify(payload));
  } catch {
    // localStorage unavailable (private browsing) or quota exceeded;
    // persistence is a best-effort convenience, not a hard requirement.
  }
}

export function clearSession(fileHash: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + fileHash);
  } catch {
    // ignore
  }
}
