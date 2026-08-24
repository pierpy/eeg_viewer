import { useEffect, useRef, useState } from "react";
import { getSpectrogram } from "../api/client";
import type { FilterSpec, SpectrogramResponse } from "../types";

interface Props {
  fileId: string;
  channel: string;
  startSec: number;
  windowSec: number;
  filters: FilterSpec[];
  onClose: () => void;
}

const DEBOUNCE_MS = 250;
const DYNAMIC_RANGE_DB = 60; // colors span [max - 60dB, max]
const PLOT_HEIGHT = 220;
const MARGIN = { top: 8, right: 56, bottom: 24, left: 44 };

// Sequential single-hue ramp (blue, light -> dark), validated for magnitude
// encoding — see dataviz skill references/palette.md "Sequential hue".
const SEQ_STEPS = [
  "#cde2fb",
  "#b7d3f6",
  "#9ec5f4",
  "#86b6ef",
  "#6da7ec",
  "#5598e7",
  "#3987e5",
  "#2a78d6",
  "#256abf",
  "#1c5cab",
  "#184f95",
  "#104281",
  "#0d366b",
];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerpColor(a: string, b: string, t: number): string {
  const [r0, g0, b0] = hexToRgb(a);
  const [r1, g1, b1] = hexToRgb(b);
  const r = Math.round(r0 + (r1 - r0) * t);
  const g = Math.round(g0 + (g1 - g0) * t);
  const bl = Math.round(b0 + (b1 - b0) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function seqColor(t: number): string {
  const clamped = Math.min(Math.max(t, 0), 1);
  const scaled = clamped * (SEQ_STEPS.length - 1);
  const i0 = Math.floor(scaled);
  const i1 = Math.min(i0 + 1, SEQ_STEPS.length - 1);
  return lerpColor(SEQ_STEPS[i0], SEQ_STEPS[i1], scaled - i0);
}

function niceTicks(min: number, max: number, count: number): number[] {
  if (max <= min) return [min];
  const rawStep = (max - min) / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  const step = (residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1) * magnitude;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

export function Spectrogram({ fileId, channel, startSec, windowSec, filters, onClose }: Props) {
  const [data, setData] = useState<SpectrogramResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number; freq: number; time: number; db: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await getSpectrogram({
          fileId,
          channel,
          startSec,
          durationSec: windowSec,
          filters,
          signal: controller.signal,
        });
        setData(resp);
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
  }, [fileId, channel, startSec, windowSec, JSON.stringify(filters)]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !data) return;

    function draw() {
      const canvas2 = canvasRef.current;
      const container2 = containerRef.current;
      if (!canvas2 || !container2 || !data) return;

      const dpr = window.devicePixelRatio || 1;
      const width = container2.clientWidth;
      const height = PLOT_HEIGHT;
      canvas2.width = width * dpr;
      canvas2.height = height * dpr;
      canvas2.style.width = `${width}px`;
      canvas2.style.height = `${height}px`;

      const ctx = canvas2.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);

      const plotW = width - MARGIN.left - MARGIN.right;
      const plotH = height - MARGIN.top - MARGIN.bottom;
      const { freqs, times, power_db: powerDb } = data;
      const nFreq = freqs.length;
      const nTime = times.length;
      if (nFreq === 0 || nTime === 0) return;

      let maxDb = -Infinity;
      for (const row of powerDb) for (const v of row) if (v > maxDb) maxDb = v;
      const minDb = maxDb - DYNAMIC_RANGE_DB;

      const cellW = plotW / nTime;
      const cellH = plotH / nFreq;
      for (let fi = 0; fi < nFreq; fi++) {
        const y = MARGIN.top + plotH - (fi + 1) * cellH;
        for (let ti = 0; ti < nTime; ti++) {
          const t = (powerDb[fi][ti] - minDb) / (maxDb - minDb);
          ctx.fillStyle = seqColor(t);
          const x = MARGIN.left + ti * cellW;
          ctx.fillRect(x, y, cellW + 0.5, cellH + 0.5);
        }
      }

      // axes
      ctx.strokeStyle = "#495057";
      ctx.fillStyle = "#495057";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const maxFreq = freqs[freqs.length - 1];
      for (const tick of niceTicks(0, maxFreq, 5)) {
        const y = MARGIN.top + plotH - (tick / maxFreq) * plotH;
        ctx.fillText(`${tick}`, MARGIN.left - 6, y);
        ctx.strokeStyle = "#f1f3f5";
        ctx.beginPath();
        ctx.moveTo(MARGIN.left, y);
        ctx.lineTo(MARGIN.left + plotW, y);
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(12, MARGIN.top + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillText("Hz", 0, 0);
      ctx.restore();

      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const tMin = times[0];
      const tMax = times[times.length - 1];
      for (const tick of niceTicks(tMin, tMax, 5)) {
        const x = MARGIN.left + ((tick - tMin) / (tMax - tMin || 1)) * plotW;
        ctx.fillText(`${tick.toFixed(1)}s`, x, MARGIN.top + plotH + 6);
      }

      // colorbar
      const barX = width - MARGIN.right + 14;
      const barW = 12;
      for (let py = 0; py < plotH; py++) {
        const t = 1 - py / plotH;
        ctx.fillStyle = seqColor(t);
        ctx.fillRect(barX, MARGIN.top + py, barW, 1);
      }
      ctx.strokeStyle = "#adb5bd";
      ctx.strokeRect(barX, MARGIN.top, barW, plotH);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#495057";
      ctx.fillText(`${maxDb.toFixed(0)}`, barX + barW + 4, MARGIN.top + 4);
      ctx.fillText(`${minDb.toFixed(0)}`, barX + barW + 4, MARGIN.top + plotH - 4);
      ctx.save();
      ctx.translate(width - 10, MARGIN.top + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillText("dB", 0, 0);
      ctx.restore();
    }

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(container);
    return () => observer.disconnect();
  }, [data]);

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!data) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const plotW = rect.width - MARGIN.left - MARGIN.right;
    const plotH = PLOT_HEIGHT - MARGIN.top - MARGIN.bottom;
    if (x < MARGIN.left || x > MARGIN.left + plotW || y < MARGIN.top || y > MARGIN.top + plotH) {
      setHover(null);
      return;
    }
    const { freqs, times, power_db: powerDb } = data;
    const ti = Math.min(Math.floor(((x - MARGIN.left) / plotW) * times.length), times.length - 1);
    const fi = Math.min(Math.floor(((MARGIN.top + plotH - y) / plotH) * freqs.length), freqs.length - 1);
    setHover({ x, y, freq: freqs[fi], time: times[ti], db: powerDb[fi][ti] });
  }

  return (
    <div className="spectrogram">
      <div className="spectrogram__header">
        <span>Spettrogramma — {channel}</span>
        {loading && <span className="spectrogram__status">Aggiornamento...</span>}
        <button type="button" className="spectrogram__close" onClick={onClose} title="Chiudi spettrogramma">
          ×
        </button>
      </div>
      {error && <div className="app__error">{error}</div>}
      <div className="spectrogram__canvas-wrap" ref={containerRef}>
        <canvas ref={canvasRef} onMouseMove={handleMouseMove} onMouseLeave={() => setHover(null)} />
        {hover && (
          <div
            className="spectrogram__tooltip"
            style={{ left: hover.x + 12, top: hover.y }}
          >
            {hover.time.toFixed(2)}s · {hover.freq.toFixed(1)}Hz · {hover.db.toFixed(1)}dB
          </div>
        )}
      </div>
    </div>
  );
}
