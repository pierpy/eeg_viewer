import { useCallback, useEffect, useRef } from "react";
import { niceTicks } from "../canvasUtils";
import { CANVAS_COLORS, TRACE_COLORS, type Theme } from "../theme";
import type { BadSegment, ChannelSignal } from "../types";

interface Props {
  channels: ChannelSignal[];
  gain: number;
  badChannels: Set<string>;
  badSegments: BadSegment[];
  startSec: number;
  windowSec: number;
  theme: Theme;
  /** channel name -> physical unit (e.g. "uV"), used for the amplitude label. */
  channelUnits: Record<string, string>;
  onCreateSegment: (startSec: number, endSec: number) => void;
  onRemoveSegment: (id: string) => void;
  rowHeight?: number;
}

const DRAG_THRESHOLD_PX = 4;
const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const RULER_HEIGHT = 22;
// Extra rows painted above/below the visible viewport so a small scroll
// doesn't immediately expose an undrawn row before the next paint.
const ROW_BUFFER = 4;

/** Derived (bipolar "A-B") channels have no unit of their own; fall back
 * to whichever source channel we have a unit for. */
function resolveUnit(name: string, channelUnits: Record<string, string>): string {
  if (channelUnits[name]) return channelUnits[name];
  const dash = name.indexOf("-");
  if (dash <= 0) return "";
  return channelUnits[name.slice(0, dash)] || channelUnits[name.slice(dash + 1)] || "";
}

function formatAmplitude(value: number): string {
  return value >= 10 ? Math.round(value).toString() : (Math.round(value * 10) / 10).toString();
}

function isTimeInBadSegment(t: number, badSegments: BadSegment[]): boolean {
  return badSegments.some((s) => t >= s.startSec && t <= s.endSec);
}

/**
 * A plotted channel is "bad" if it's directly marked, or — for a
 * montage-derived name like "EEG1-EEG2" (bipolar reference) — if either
 * of its two source (raw) channels is marked. badChannels always holds
 * raw channel names, since marking is done from the raw channel list.
 */
function isChannelBad(name: string, badChannels: Set<string>): boolean {
  if (badChannels.has(name)) return true;
  const dash = name.indexOf("-");
  if (dash <= 0) return false;
  return badChannels.has(name.slice(0, dash)) || badChannels.has(name.slice(dash + 1));
}

/**
 * Max absolute amplitude used to auto-scale a channel, ignoring samples
 * that fall inside a bad segment so a marked artifact doesn't dominate
 * the scale and flatten the rest of the trace. Falls back to the full
 * signal if a bad segment covers the entire visible window.
 */
function autoScaleMaxAbs(
  values: number[],
  startSec: number,
  windowSec: number,
  badSegments: BadSegment[]
): number {
  if (badSegments.length === 0) {
    let maxAbs = 0;
    for (const v of values) maxAbs = Math.max(maxAbs, Math.abs(v));
    return maxAbs;
  }

  let maxAbs = 0;
  let sawIncluded = false;
  const denom = Math.max(values.length - 1, 1);
  values.forEach((v, idx) => {
    const t = startSec + (idx / denom) * windowSec;
    if (isTimeInBadSegment(t, badSegments)) return;
    sawIncluded = true;
    maxAbs = Math.max(maxAbs, Math.abs(v));
  });

  if (!sawIncluded) {
    for (const v of values) maxAbs = Math.max(maxAbs, Math.abs(v));
  }
  return maxAbs;
}

export function EegCanvas({
  channels,
  gain,
  badChannels,
  badSegments,
  startSec,
  windowSec,
  theme,
  channelUnits,
  onCreateSegment,
  onRemoveSegment,
  rowHeight = 70,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rulerRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; active: boolean } | null>(null);

  const timeAtX = useCallback(
    (x: number, width: number) => startSec + Math.min(Math.max(x / width, 0), 1) * windowSec,
    [startSec, windowSec]
  );

  const xAtTime = useCallback(
    (t: number, width: number) => ((t - startSec) / windowSec) * width,
    [startSec, windowSec]
  );

  // Rows currently painted onto canvasRef for the dataset/settings in the
  // active effect run. A full reset (new data, gain, theme, ...) clears
  // this and repaints only what's on screen; scrolling then fills in
  // whichever additional rows come into view, without ever repainting a
  // row that's already correctly on the canvas.
  const drawnRowsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    function visibleRowRange(container2: HTMLDivElement): [number, number] {
      const total = channels.length;
      if (total === 0) return [0, -1];
      const viewportTop = Math.max(container2.scrollTop - RULER_HEIGHT, 0);
      const viewportHeight = Math.max(container2.clientHeight - RULER_HEIGHT, 0);
      const first = Math.max(0, Math.floor(viewportTop / rowHeight) - ROW_BUFFER);
      const last = Math.min(total - 1, Math.ceil((viewportTop + viewportHeight) / rowHeight) + ROW_BUFFER);
      return [first, last];
    }

    // Draws one channel's row (tint, gridlines, trace, labels) at its
    // fixed y = i * rowHeight — this is the O(points-per-channel) work
    // that virtualization exists to skip for rows that are off-screen.
    function drawRow(ctx: CanvasRenderingContext2D, i: number, width: number, timeTicks: number[]) {
      const ch = channels[i];
      const colors = CANVAS_COLORS[theme];
      const traceColors = TRACE_COLORS[theme];
      const isBad = isChannelBad(ch.name, badChannels);
      const centerY = i * rowHeight + rowHeight / 2;

      // the row's own background must be repainted first since it may
      // already hold stale pixels from a previous dataset at this slot
      ctx.fillStyle = colors.background;
      ctx.fillRect(0, i * rowHeight, width, rowHeight);
      if (isBad) {
        ctx.fillStyle = colors.badRowTint;
        ctx.fillRect(0, i * rowHeight, width, rowHeight);
      }

      // vertical time gridlines, scoped to this row since the background
      // fill above just erased whatever was there before
      ctx.strokeStyle = colors.gridWeak;
      timeTicks.forEach((t) => {
        const x = xAtTime(t, width);
        ctx.beginPath();
        ctx.moveTo(x, i * rowHeight);
        ctx.lineTo(x, (i + 1) * rowHeight);
        ctx.stroke();
      });

      ctx.strokeStyle = colors.gridStrong;
      ctx.beginPath();
      ctx.moveTo(0, i * rowHeight);
      ctx.lineTo(width, i * rowHeight);
      ctx.stroke();

      ctx.strokeStyle = colors.gridWeak;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();

      const values = ch.values;
      if (values.length > 0) {
        const maxAbs = autoScaleMaxAbs(values, startSec, windowSec, badSegments);
        const scale = maxAbs > 0 ? ((rowHeight / 2) * 0.85 * gain) / maxAbs : 1;

        // clip so a sample excluded from the scale (e.g. inside a bad
        // segment) can't visually bleed into neighboring channel rows
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, i * rowHeight, width, rowHeight);
        ctx.clip();

        // Samples inside a bad segment are left out of the path
        // entirely (a gap) instead of being drawn under the red
        // overlay, so a marked/excluded stretch of signal isn't shown.
        ctx.strokeStyle = isBad ? colors.badTrace : traceColors[i % traceColors.length];
        ctx.lineWidth = 1;
        ctx.beginPath();
        const denom = Math.max(values.length - 1, 1);
        let needsMoveTo = true;
        values.forEach((v, idx) => {
          const t = startSec + (idx / denom) * windowSec;
          if (isTimeInBadSegment(t, badSegments)) {
            needsMoveTo = true;
            return;
          }
          const x = (idx / denom) * width;
          const y = centerY - v * scale;
          if (needsMoveTo) {
            ctx.moveTo(x, y);
            needsMoveTo = false;
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
        ctx.restore();

        // Peak amplitude reached at the row's drawn edge, in the
        // channel's physical unit — lets the reader read real values
        // off an otherwise unlabeled, auto-scaled trace.
        if (maxAbs > 0) {
          const edgeValue = maxAbs / gain;
          const unit = resolveUnit(ch.name, channelUnits);
          ctx.fillStyle = colors.mutedText;
          ctx.font = "10.5px " + FONT_STACK;
          ctx.textAlign = "right";
          ctx.fillText(`±${formatAmplitude(edgeValue)} ${unit}`.trim(), width - 6, i * rowHeight + 14);
          ctx.textAlign = "left";
        }
      }

      ctx.fillStyle = isBad ? colors.badLabel : colors.text;
      ctx.font = "12px " + FONT_STACK;
      ctx.fillText(isBad ? `${ch.name} (BAD)` : ch.name, 6, i * rowHeight + 14);
    }

    // Bad-segment overlays only depend on time (x), never on which rows
    // are painted, so they're cheap to redraw in full every time —
    // unlike per-row content there is nothing here to virtualize.
    function drawBadSegmentOverlays(ctx: CanvasRenderingContext2D, width: number, height: number) {
      const colors = CANVAS_COLORS[theme];
      const windowEnd = startSec + windowSec;
      badSegments.forEach((seg) => {
        const overlapStart = Math.max(seg.startSec, startSec);
        const overlapEnd = Math.min(seg.endSec, windowEnd);
        if (overlapEnd <= overlapStart) return;
        const x0 = xAtTime(overlapStart, width);
        const x1 = xAtTime(overlapEnd, width);
        ctx.fillStyle = colors.badSegmentFill;
        ctx.fillRect(x0, 0, x1 - x0, height);
        ctx.strokeStyle = colors.badSegmentStroke;
        ctx.beginPath();
        ctx.moveTo(x0, 0);
        ctx.lineTo(x0, height);
        ctx.moveTo(x1, 0);
        ctx.lineTo(x1, height);
        ctx.stroke();
      });
    }

    // Full reset: resize (which clears the pixel buffer), fill the shared
    // background, then paint only the rows currently scrolled into view.
    // Any other row is filled in lazily by fillVisibleRows() as the user
    // scrolls to it.
    function draw() {
      const canvas2 = canvasRef.current;
      const container2 = containerRef.current;
      if (!canvas2 || !container2) return;

      const dpr = window.devicePixelRatio || 1;
      const width = container2.clientWidth;
      const height = Math.max(channels.length, 1) * rowHeight;

      canvas2.width = width * dpr;
      canvas2.height = height * dpr;
      canvas2.style.width = `${width}px`;
      canvas2.style.height = `${height}px`;

      const colors = CANVAS_COLORS[theme];
      const timeTicks = niceTicks(startSec, startSec + windowSec, Math.max(Math.round(width / 90), 2));

      const ctx = canvas2.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = colors.background;
      ctx.fillRect(0, 0, width, height);

      drawnRowsRef.current = new Set();
      const [first, last] = visibleRowRange(container2);
      for (let i = first; i <= last; i++) {
        drawRow(ctx, i, width, timeTicks);
        drawnRowsRef.current.add(i);
      }

      drawBadSegmentOverlays(ctx, width, height);
    }

    // Scroll-triggered incremental fill: paints only rows newly exposed
    // by scrolling that haven't been drawn yet for this dataset. Rows
    // already drawn keep their existing (correct) pixels untouched.
    function fillVisibleRows() {
      const canvas2 = canvasRef.current;
      const container2 = containerRef.current;
      if (!canvas2 || !container2) return;
      const ctx = canvas2.getContext("2d");
      if (!ctx) return;

      const width = container2.clientWidth;
      const height = Math.max(channels.length, 1) * rowHeight;
      const timeTicks = niceTicks(startSec, startSec + windowSec, Math.max(Math.round(width / 90), 2));
      const [first, last] = visibleRowRange(container2);
      let drewAny = false;
      for (let i = first; i <= last; i++) {
        if (drawnRowsRef.current.has(i)) continue;
        drawRow(ctx, i, width, timeTicks);
        drawnRowsRef.current.add(i);
        drewAny = true;
      }
      // a newly-painted row's background fill can cover part of an
      // overlay band that was already drawn over a neighboring row
      if (drewAny) drawBadSegmentOverlays(ctx, width, height);
    }

    // Sticky time ruler drawn into its own small canvas so it stays
    // pinned to the top of the scrollable panel via CSS position:sticky.
    function drawRuler() {
      const ruler = rulerRef.current;
      const container2 = containerRef.current;
      if (!ruler || !container2) return;

      const dpr = window.devicePixelRatio || 1;
      const width = container2.clientWidth;
      ruler.width = width * dpr;
      ruler.height = RULER_HEIGHT * dpr;
      ruler.style.width = `${width}px`;
      ruler.style.height = `${RULER_HEIGHT}px`;

      const ctx = ruler.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const colors = CANVAS_COLORS[theme];
      ctx.clearRect(0, 0, width, RULER_HEIGHT);
      ctx.fillStyle = colors.background;
      ctx.fillRect(0, 0, width, RULER_HEIGHT);
      ctx.strokeStyle = colors.gridStrong;
      ctx.beginPath();
      ctx.moveTo(0, RULER_HEIGHT - 0.5);
      ctx.lineTo(width, RULER_HEIGHT - 0.5);
      ctx.stroke();

      ctx.font = "10.5px " + FONT_STACK;
      ctx.fillStyle = colors.mutedText;
      ctx.textBaseline = "middle";
      const timeTicks = niceTicks(startSec, startSec + windowSec, Math.max(Math.round(width / 90), 2));
      timeTicks.forEach((t) => {
        const x = xAtTime(t, width);
        ctx.strokeStyle = colors.gridStrong;
        ctx.beginPath();
        ctx.moveTo(x, RULER_HEIGHT - 7);
        ctx.lineTo(x, RULER_HEIGHT);
        ctx.stroke();
        ctx.textAlign = x < 16 ? "left" : x > width - 16 ? "right" : "center";
        ctx.fillText(`${t}s`, x, RULER_HEIGHT / 2 - 4);
      });
    }

    draw();
    drawRuler();
    const observer = new ResizeObserver(() => {
      draw();
      drawRuler();
    });
    observer.observe(container);

    // Scrolling never needs a full redraw — only whichever rows just
    // came into view. rAF-coalesced so a fast scroll fills in once per
    // frame instead of once per scroll event.
    let scrollFillQueued = false;
    function onScroll() {
      if (scrollFillQueued) return;
      scrollFillQueued = true;
      requestAnimationFrame(() => {
        scrollFillQueued = false;
        fillVisibleRows();
      });
    }
    container.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      observer.disconnect();
      container.removeEventListener("scroll", onScroll);
    };
  }, [channels, gain, rowHeight, badChannels, badSegments, startSec, windowSec, xAtTime, theme, channelUnits]);

  function findSegmentAtTime(t: number): BadSegment | undefined {
    return badSegments.find((s) => t >= s.startSec && t <= s.endSec);
  }

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    dragRef.current = { startX: x, active: true };
    if (previewRef.current) {
      const contentHeight = canvasRef.current?.clientHeight ?? rect.height;
      previewRef.current.style.display = "block";
      previewRef.current.style.top = "0px";
      previewRef.current.style.height = `${contentHeight}px`;
      previewRef.current.style.left = `${x}px`;
      previewRef.current.style.width = "0px";
    }
    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
  }

  function handleWindowMouseMove(e: MouseEvent) {
    const rect = containerRef.current?.getBoundingClientRect();
    const drag = dragRef.current;
    if (!rect || !drag) return;
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    const left = Math.min(drag.startX, x);
    const width = Math.abs(x - drag.startX);
    if (previewRef.current) {
      previewRef.current.style.left = `${left}px`;
      previewRef.current.style.width = `${width}px`;
    }
  }

  function handleWindowMouseUp(e: MouseEvent) {
    window.removeEventListener("mousemove", handleWindowMouseMove);
    window.removeEventListener("mouseup", handleWindowMouseUp);
    if (previewRef.current) previewRef.current.style.display = "none";

    const drag = dragRef.current;
    dragRef.current = null;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!drag || !rect) return;

    const endX = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    const movedPx = Math.abs(endX - drag.startX);

    if (movedPx < DRAG_THRESHOLD_PX) {
      // treated as a click: remove an existing segment under the cursor, if any
      const t = timeAtX(drag.startX, rect.width);
      const hit = findSegmentAtTime(t);
      if (hit) onRemoveSegment(hit.id);
      return;
    }

    const t0 = timeAtX(Math.min(drag.startX, endX), rect.width);
    const t1 = timeAtX(Math.max(drag.startX, endX), rect.width);
    onCreateSegment(t0, t1);
  }

  // avoid leaking window listeners if the component unmounts mid-drag
  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="eeg-canvas" ref={containerRef} onMouseDown={handleMouseDown}>
      <canvas className="eeg-canvas__ruler" ref={rulerRef} />
      <canvas ref={canvasRef} />
      <div className="eeg-canvas__preview" ref={previewRef} />
    </div>
  );
}
