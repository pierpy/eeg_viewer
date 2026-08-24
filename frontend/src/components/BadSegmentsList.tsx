import type { BadSegment } from "../types";

interface Props {
  segments: BadSegment[];
  onRemove: (id: string) => void;
}

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1);
  return `${m}:${s.padStart(4, "0")}`;
}

export function BadSegmentsList({ segments, onRemove }: Props) {
  return (
    <div className="bad-segments">
      <div className="bad-segments__header">Bad Segments ({segments.length})</div>
      <p className="bad-segments__hint">Trascina sul grafico per marcare un segmento come bad.</p>
      {segments.length > 0 && (
        <div className="bad-segments__items">
          {segments.map((s) => (
            <div key={s.id} className="bad-segments__item">
              <span>
                {fmt(s.startSec)} – {fmt(s.endSec)}
              </span>
              <button type="button" onClick={() => onRemove(s.id)} title="Rimuovi">
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
