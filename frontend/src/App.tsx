import { useEffect, useMemo, useState } from "react";
import { exportMat, getSignal } from "./api/client";
import { BadSegmentsList } from "./components/BadSegmentsList";
import { ChannelList } from "./components/ChannelList";
import { EegCanvas } from "./components/EegCanvas";
import { FileUpload } from "./components/FileUpload";
import { FilterPanel } from "./components/FilterPanel";
import { HistoryPanel } from "./components/HistoryPanel";
import { TimeNavigator } from "./components/TimeNavigator";
import type { BadSegment, FileInfo, FilterSpec, HistoryEntry, SignalResponse } from "./types";

const DEFAULT_FILTERS: FilterSpec[] = [
  { type: "highpass", enabled: true, freq: 0.5, order: 4, q: 30 },
  { type: "lowpass", enabled: true, freq: 40, order: 4, q: 30 },
  { type: "notch", enabled: true, freq: 50, order: 4, q: 30 },
];

const DEBOUNCE_MS = 200;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function App() {
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<FilterSpec[]>(DEFAULT_FILTERS);
  const [startSec, setStartSec] = useState(0);
  const [windowSec, setWindowSec] = useState(10);
  const [gain, setGain] = useState(1);
  const [signalData, setSignalData] = useState<SignalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [badChannels, setBadChannels] = useState<Set<string>>(new Set());
  const [badSegments, setBadSegments] = useState<BadSegment[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [exporting, setExporting] = useState(false);

  const selectedChannels = useMemo(() => Array.from(selected), [selected]);

  function appendHistory(action: string, details: Record<string, unknown> = {}) {
    setHistory((h) => [...h, { timestamp: new Date().toISOString(), action, details }]);
  }

  function handleFileLoaded(info: FileInfo) {
    setFileInfo(info);
    setSelected(new Set(info.channels.slice(0, Math.min(8, info.channels.length)).map((c) => c.name)));
    setStartSec(0);
    setSignalData(null);
    setError(null);
    setBadChannels(new Set());
    setBadSegments([]);
    setHistory([{ timestamp: new Date().toISOString(), action: "file_loaded", details: { filename: info.filename } }]);
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
  }, [fileInfo, selectedChannels.join(","), startSec, windowSec, JSON.stringify(filters)]);

  return (
    <div className="app">
      <header className="app__header">
        <h1>EEG Viewer</h1>
        <FileUpload onLoaded={handleFileLoaded} />
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
      </header>

      {!fileInfo && (
        <div className="app__empty">Carica un file .edf per iniziare.</div>
      )}

      {fileInfo && (
        <div className="app__body">
          <aside className="app__sidebar">
            <ChannelList
              channels={fileInfo.channels}
              selected={selected}
              badChannels={badChannels}
              onChange={setSelected}
              onToggleBad={toggleBadChannel}
            />
            <FilterPanel filters={filters} onChange={handleFiltersChange} />
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
                onCreateSegment={addBadSegment}
                onRemoveSegment={removeBadSegment}
              />
            ) : (
              <div className="app__empty">Seleziona almeno un canale.</div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
