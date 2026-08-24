import { useEffect, useMemo, useState } from "react";
import { getSignal } from "./api/client";
import { ChannelList } from "./components/ChannelList";
import { EegCanvas } from "./components/EegCanvas";
import { FileUpload } from "./components/FileUpload";
import { FilterPanel } from "./components/FilterPanel";
import { TimeNavigator } from "./components/TimeNavigator";
import type { FileInfo, FilterSpec, SignalResponse } from "./types";

const DEFAULT_FILTERS: FilterSpec[] = [
  { type: "highpass", enabled: true, freq: 0.5, order: 4, q: 30 },
  { type: "lowpass", enabled: true, freq: 40, order: 4, q: 30 },
  { type: "notch", enabled: true, freq: 50, order: 4, q: 30 },
];

const DEBOUNCE_MS = 200;

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

  const selectedChannels = useMemo(() => Array.from(selected), [selected]);

  function handleFileLoaded(info: FileInfo) {
    setFileInfo(info);
    setSelected(new Set(info.channels.slice(0, Math.min(8, info.channels.length)).map((c) => c.name)));
    setStartSec(0);
    setSignalData(null);
    setError(null);
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
          <span className="app__filename">
            {fileInfo.filename} · {fileInfo.channels.length} canali · {fileInfo.duration_sec.toFixed(1)}s
          </span>
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
              onChange={setSelected}
            />
            <FilterPanel filters={filters} onChange={setFilters} />
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
              <EegCanvas channels={signalData.channels} gain={gain} />
            ) : (
              <div className="app__empty">Seleziona almeno un canale.</div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
