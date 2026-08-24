import { useCallback, useEffect, useRef } from "react";
import type { BadSegment, ChannelSignal } from "../types";

interface Props {
  channels: ChannelSignal[];
  gain: number;
  badChannels: Set<string>;
  badSegments: BadSegment[];
  startSec: number;
  windowSec: number;
  onCreateSegment: (startSec: number, endSec: number) => void;
  onRemoveSegment: (id: string) => void;
  rowHeight?: number;
}

const COLORS = [
  "#2b8a3e",
  "#1971c2",
  "#e8590c",
  "#9c36b5",
  "#0c8599",
  "#c92a2a",
  "#5f3dc4",
  "#495057",
];

const BAD_CHANNEL_COLOR = "#adb5bd";
const DRAG_THRESHOLD_PX = 4;

function isTimeInBadSegment(t: number, badSegments: BadSegment[]): boolean {
  return badSegments.some((s) => t >= s.startSec && t <= s.endSec);
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
  onCreateSegment,
  onRemoveSegment,
  rowHeight = 70,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

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

      const ctx = canvas2.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);

      channels.forEach((ch, i) => {
        const isBad = badChannels.has(ch.name);
        const centerY = i * rowHeight + rowHeight / 2;

        if (isBad) {
          ctx.fillStyle = "rgba(201, 42, 42, 0.06)";
          ctx.fillRect(0, i * rowHeight, width, rowHeight);
        }

        ctx.strokeStyle = "#e9ecef";
        ctx.beginPath();
        ctx.moveTo(0, i * rowHeight);
        ctx.lineTo(width, i * rowHeight);
        ctx.stroke();

        ctx.strokeStyle = "#f1f3f5";
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
          ctx.strokeStyle = isBad ? BAD_CHANNEL_COLOR : COLORS[i % COLORS.length];
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
        }

        ctx.fillStyle = isBad ? "#c92a2a" : "#212529";
        ctx.font = "12px sans-serif";
        ctx.fillText(isBad ? `${ch.name} (BAD)` : ch.name, 6, i * rowHeight + 14);
      });

      // bad segment overlays, clipped to the visible time window
      const windowEnd = startSec + windowSec;
      badSegments.forEach((seg) => {
        const overlapStart = Math.max(seg.startSec, startSec);
        const overlapEnd = Math.min(seg.endSec, windowEnd);
        if (overlapEnd <= overlapStart) return;
        const x0 = xAtTime(overlapStart, width);
        const x1 = xAtTime(overlapEnd, width);
        ctx.fillStyle = "rgba(201, 42, 42, 0.15)";
        ctx.fillRect(x0, 0, x1 - x0, height);
        ctx.strokeStyle = "rgba(201, 42, 42, 0.5)";
        ctx.beginPath();
        ctx.moveTo(x0, 0);
        ctx.lineTo(x0, height);
        ctx.moveTo(x1, 0);
        ctx.lineTo(x1, height);
        ctx.stroke();
      });
    }

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(container);
    return () => observer.disconnect();
  }, [channels, gain, rowHeight, badChannels, badSegments, startSec, windowSec, xAtTime]);

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
      <canvas ref={canvasRef} />
      <div className="eeg-canvas__preview" ref={previewRef} />
    </div>
  );
}
