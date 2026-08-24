import { useEffect, useRef } from "react";
import type { ChannelSignal } from "../types";

interface Props {
  channels: ChannelSignal[];
  gain: number;
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

export function EegCanvas({ channels, gain, rowHeight = 70 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
        const centerY = i * rowHeight + rowHeight / 2;

        // row separator
        ctx.strokeStyle = "#e9ecef";
        ctx.beginPath();
        ctx.moveTo(0, i * rowHeight);
        ctx.lineTo(width, i * rowHeight);
        ctx.stroke();

        // zero line
        ctx.strokeStyle = "#f1f3f5";
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();

        const values = ch.values;
        if (values.length > 0) {
          let maxAbs = 0;
          for (const v of values) maxAbs = Math.max(maxAbs, Math.abs(v));
          const scale = maxAbs > 0 ? ((rowHeight / 2) * 0.85 * gain) / maxAbs : 1;

          ctx.strokeStyle = COLORS[i % COLORS.length];
          ctx.lineWidth = 1;
          ctx.beginPath();
          values.forEach((v, idx) => {
            const x = (idx / Math.max(values.length - 1, 1)) * width;
            const y = centerY - v * scale;
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.stroke();
        }

        ctx.fillStyle = "#212529";
        ctx.font = "12px sans-serif";
        ctx.fillText(ch.name, 6, i * rowHeight + 14);
      });
    }

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(container);
    return () => observer.disconnect();
  }, [channels, gain, rowHeight]);

  return (
    <div className="eeg-canvas" ref={containerRef}>
      <canvas ref={canvasRef} />
    </div>
  );
}
