import { useEffect, useMemo, useState } from "react";
import { exportMat, getFileInfo, getSignal } from "./api/client";
import { BadSegmentsList } from "./components/BadSegmentsList";
import { ChannelList } from "./components/ChannelList";
import { EegCanvas } from "./components/EegCanvas";
import { FileUpload } from "./components/FileUpload";
import { FilterPanel } from "./components/FilterPanel";
import { HistoryPanel } from "./components/HistoryPanel";
import { ReferencePanel } from "./components/ReferencePanel";
import { Spectrogram } from "./components/Spectrogram";
import { TimeNavigator } from "./components/TimeNavigator";
import {
  clearLastFile,
  clearSession,
  hashFile,
  loadLastFile,
  loadSession,
  saveLastFile,
  saveSession,
} from "./persistence";
import { useTheme } from "./theme";
import type { BadSegment, FileInfo, FilterSpec, HistoryEntry, ReferenceMode, SignalResponse } from "./types";

const DEFAULT_FILTERS: FilterSpec[] = [
  { type: "highpass", enabled: true, freq: 0.5, order: 4, q: 30 },
  { type: "lowpass", enabled: true, freq: 40, order: 4, q: 30 },
  { type: "notch", enabled: true, freq: 50, order: 4, q: 30 },
];

const DEBOUNCE_MS = 200;
const MAX_HISTORY_ENTRIES = 500;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<FilterSpec[]>(DEFAULT_FILTERS);
  const [reference, setReference] = useState<ReferenceMode>("none");
  const [startSec, setStartSec] = useState(0);
  const [windowSec, setWindowSec] = useState(10);
  const [gain, setGain] = useState(1);
  const [signalData, setSignalData] = useState<SignalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [badChannels, setBadChannels] = useState<Set<string>>(new Set());
  const [badSegments, setBadSegments] = useState<BadSegment[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [spectrogramChannel, setSpectrogramChannel] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [reconnecting, setReconnecting] = useState(true);
  const [reconnectFailedFor, setReconnectFailedFor] = useState<string | null>(null);

  const selectedChannels = useMemo(() => Array.from(selected), [selected]);

  function appendHistory(action: string, details: Record<string, unknown> = {}) {
    setHistory((h) => {
      const next = [...h, { timestamp: new Date().toISOString(), action, details }];
      return next.length > MAX_HISTORY_ENTRIES ? next.slice(next.length - MAX_HISTORY_ENTRIES) : next;
    });
  }

  // Applies a saved annotation session for this file (channel selection,
  // filters, bad channels/segments, gain, time window, history), or falls
  // back to defaults if none was saved yet. Shared between opening a file
  // by hand and auto-reconnecting to the last one on page load.
  function applySessionOrDefaults(hash: string, info: FileInfo) {
    setSpectrogramChannel(null);
    const saved = loadSession(hash);
    const validChannelNames = new Set(info.channels.map((c) => c.name));
    if (saved) {
      const restoredSelection = saved.selectedChannels.filter((name) => validChannelNames.has(name));
      setSelected(new Set(restoredSelection.length > 0 ? restoredSelection : Array.from(validChannelNames).slice(0, 8)));
      setFilters(saved.filters.length > 0 ? saved.filters : DEFAULT_FILTERS);
      setReference(saved.reference || "none");
      setBadChannels(new Set(saved.badChannels.filter((name) => validChannelNames.has(name))));
      setBadSegments(saved.badSegments);
      setGain(saved.gain || 1);
      setWindowSec(saved.windowSec || 10);
      setStartSec(Math.min(saved.startSec || 0, Math.max(info.duration_sec - (saved.windowSec || 10), 0)));
      setHistory([
        ...saved.history,
        { timestamp: new Date().toISOString(), action: "session_restored", details: { filename: info.filename } },
      ]);
      setRestoredAt(saved.savedAt);
    } else {
      setSelected(new Set(info.channels.slice(0, Math.min(8, info.channels.length)).map((c) => c.name)));
      setFilters(DEFAULT_FILTERS);
      setReference("none");
      setBadChannels(new Set());
      setBadSegments([]);
      setStartSec(0);
      setWindowSec(10);
      setGain(1);
      setHistory([{ timestamp: new Date().toISOString(), action: "file_loaded", details: { filename: info.filename } }]);
      setRestoredAt(null);
    }
  }

  // On mount, try to reconnect to the last file that was open: the
  // backend keeps an uploaded .edf (and its file_id) for the life of the
  // server process, but a browser reload can't restore a <input
  // type="file"> selection, so without this a reload would otherwise
  // always land back on the empty "open a file" screen even though the
  // annotation session for it is still saved.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pointer = loadLastFile();
      if (!pointer) {
        setReconnecting(false);
        return;
      }
      try {
        const info = await getFileInfo(pointer.fileId);
        if (cancelled) return;
        setFileInfo(info);
        setFileHash(pointer.fileHash);
        setError(null);
        applySessionOrDefaults(pointer.fileHash, info);
      } catch {
        if (cancelled) return;
        clearLastFile();
        setReconnectFailedFor(pointer.filename);
      } finally {
        if (!cancelled) setReconnecting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFileLoaded(info: FileInfo, file: File) {
    const hash = await hashFile(file);
    setFileInfo(info);
    setFileHash(hash);
    setSignalData(null);
    setError(null);
    setReconnectFailedFor(null);
    saveLastFile({ fileId: info.file_id, fileHash: hash, filename: info.filename });
    applySessionOrDefaults(hash, info);
  }

  function handleForgetSession() {
    if (!fileHash || !fileInfo) return;
    clearSession(fileHash);
    setBadChannels(new Set());
    setBadSegments([]);
    setFilters(DEFAULT_FILTERS);
    setReference("none");
    setGain(1);
    setRestoredAt(null);
    setHistory([
      { timestamp: new Date().toISOString(), action: "session_forgotten", details: { filename: fileInfo.filename } },
    ]);
  }

  function handleReferenceChange(mode: ReferenceMode) {
    if (mode === reference) return;
    setReference(mode);
    appendHistory("reference_changed", { reference: mode });
  }

  function toggleSpectrogram(name: string) {
    setSpectrogramChannel((current) => (current === name ? null : name));
  }

  function handleFiltersChange(next: FilterSpec[]) {
    next.forEach((n) => {
      const prev = filters.find((f) => f.type === n.type);
      if (!prev) return;
      if (prev.enabled !== n.enabled) {
        appendHistory("filter_updated", { filter: n.type, enabled: n.enabled });
      } else if (prev.freq !== n.freq || prev.order !== n.order || prev.q !== n.q) {
        appendHistory("filter_updated", { filter: n.type, freq: n.freq, order: n.order, q: n.q });
      }
    });
    setFilters(next);
  }

  function toggleBadChannel(name: string) {
    const wasBad = badChannels.has(name);
    const next = new Set(badChannels);
    if (wasBad) next.delete(name);
    else next.add(name);
    setBadChannels(next);
    appendHistory(wasBad ? "channel_unmarked_bad" : "channel_marked_bad", { channel: name });
  }

  function addBadSegment(segStart: number, segEnd: number) {
    const seg: BadSegment = { id: newId(), startSec: segStart, endSec: segEnd };
    setBadSegments((prev) => [...prev, seg]);
    appendHistory("segment_marked_bad", {
      start_sec: Number(segStart.toFixed(2)),
      end_sec: Number(segEnd.toFixed(2)),
    });
  }

  function removeBadSegment(id: string) {
    const seg = badSegments.find((s) => s.id === id);
    setBadSegments(badSegments.filter((s) => s.id !== id));
    if (seg) {
      appendHistory("segment_removed", {
        start_sec: Number(seg.startSec.toFixed(2)),
        end_sec: Number(seg.endSec.toFixed(2)),
      });
    }
  }

  async function handleExport() {
    if (!fileInfo) return;
    setExporting(true);
    setError(null);
    try {
      const { blob, filename } = await exportMat({
        fileId: fileInfo.file_id,
        // Export all channels in the file, not just the ones currently
        // shown in the viewer.
        channels: undefined,
        filters,
        reference,
        badChannels: Array.from(badChannels),
        badSegments,
        history,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    if (!fileInfo || selectedChannels.length === 0) {
      setSignalData(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getSignal({
          fileId: fileInfo.file_id,
          channels: selectedChannels,
          startSec,
          durationSec: windowSec,
          filters,
          reference,
          signal: controller.signal,
        });
        setSignalData(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileInfo, selectedChannels.join(","), startSec, windowSec, JSON.stringify(filters), reference]);

  // Persist the current annotation/view state for this file whenever it
  // changes, so reopening the same .edf later (even after a reload)
  // restores bad channels/segments, filters and the operation history.
  useEffect(() => {
    if (!fileHash) return;
    saveSession(fileHash, {
      selectedChannels,
      filters,
      reference,
      badChannels: Array.from(badChannels),
      badSegments,
      history,
      gain,
      startSec,
      windowSec,
    });
  }, [fileHash, selectedChannels, filters, reference, badChannels, badSegments, history, gain, startSec, windowSec]);

  return (
    <div className="app">
      <header className="app__header">
        <h1>EEG Viewer</h1>
        <FileUpload onLoaded={handleFileLoaded} />
        <div className="app__header-right">
          {fileInfo && (
            <>
              <span className="app__filename">
                {fileInfo.filename} · {fileInfo.channels.length} canali · {fileInfo.duration_sec.toFixed(1)}s
              </span>
              <button
                type="button"
                className="app__export-button"
                onClick={handleExport}
                disabled={exporting}
                title="Esporta tutti i canali del file, non solo quelli selezionati nel visualizzatore"
              >
                {exporting ? "Esportazione..." : "Esporta .mat (tutti i canali)"}
              </button>
            </>
          )}
          <button
            type="button"
            className="app__theme-toggle"
            onClick={toggleTheme}
            title={theme === "dark" ? "Passa al tema chiaro" : "Passa al tema scuro"}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      {!fileInfo && reconnecting && (
        <div className="app__empty">Verifica sessione precedente...</div>
      )}

      {!fileInfo && !reconnecting && (
        <div className="app__empty">
          Carica un file .edf per iniziare.
          {reconnectFailedFor && (
            <div className="app__reconnect-hint">
              Il file "{reconnectFailedFor}" caricato in precedenza non è più disponibile sul
              server (es. dopo un riavvio). Riaprilo per continuare: le tue annotazioni sono
              state conservate e verranno ripristinate.
            </div>
          )}
        </div>
      )}

      {fileInfo && restoredAt && (
        <div className="app__restored-banner">
          Sessione ripristinata (annotazioni salvate il {new Date(restoredAt).toLocaleString()}).
          <button type="button" onClick={handleForgetSession}>
            Dimentica e riparti da zero
          </button>
        </div>
      )}

      {fileInfo && (
        <div className="app__body">
          <aside className="app__sidebar">
            <ChannelList
              channels={fileInfo.channels}
              selected={selected}
              badChannels={badChannels}
              spectrogramChannel={spectrogramChannel}
              onChange={setSelected}
              onToggleBad={toggleBadChannel}
              onToggleSpectrogram={toggleSpectrogram}
            />
            <FilterPanel filters={filters} onChange={handleFiltersChange} />
            <ReferencePanel reference={reference} onChange={handleReferenceChange} />
            <div className="gain-control">
              <label>
                Guadagno ({gain.toFixed(2)}x)
                <input
                  type="range"
                  min="0.1"
                  max="5"
                  step="0.1"
                  value={gain}
                  onChange={(e) => setGain(Number(e.target.value))}
                />
              </label>
            </div>
            <BadSegmentsList segments={badSegments} onRemove={removeBadSegment} />
            <HistoryPanel history={history} />
          </aside>

          <main className="app__main">
            <TimeNavigator
              startSec={startSec}
              windowSec={windowSec}
              totalDurationSec={fileInfo.duration_sec}
              onStartChange={setStartSec}
              onWindowChange={setWindowSec}
            />
            {error && <div className="app__error">{error}</div>}
            {loading && <div className="app__loading">Aggiornamento...</div>}
            {signalData && signalData.channels.length > 0 ? (
              <EegCanvas
                channels={signalData.channels}
                gain={gain}
                badChannels={badChannels}
                badSegments={badSegments}
                startSec={startSec}
                windowSec={windowSec}
                theme={theme}
                onCreateSegment={addBadSegment}
                onRemoveSegment={removeBadSegment}
              />
            ) : (
              <div className="app__empty">Seleziona almeno un canale.</div>
            )}
            {spectrogramChannel && (
              <Spectrogram
                fileId={fileInfo.file_id}
                channel={spectrogramChannel}
                startSec={startSec}
                windowSec={windowSec}
                filters={filters}
                reference={reference}
                montageChannels={selectedChannels}
                theme={theme}
                onClose={() => setSpectrogramChannel(null)}
              />
            )}
          </main>
        </div>
      )}
    </div>
  );
}
