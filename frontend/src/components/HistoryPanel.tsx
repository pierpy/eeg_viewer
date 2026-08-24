import type { HistoryEntry } from "../types";

interface Props {
  history: HistoryEntry[];
}

const ACTION_LABELS: Record<string, string> = {
  file_loaded: "File caricato",
  filter_updated: "Filtro aggiornato",
  channel_marked_bad: "Canale marcato BAD",
  channel_unmarked_bad: "Canale smarcato",
  segment_marked_bad: "Segmento marcato BAD",
  segment_removed: "Segmento rimosso",
  session_restored: "Sessione ripristinata da annotazioni salvate",
  session_forgotten: "Annotazioni salvate cancellate",
};

function describe(entry: HistoryEntry): string {
  const label = ACTION_LABELS[entry.action] ?? entry.action;
  const parts = Object.entries(entry.details)
    .map(([k, v]) => `${k}=${typeof v === "number" ? v.toFixed(2) : v}`)
    .join(", ");
  return parts ? `${label} (${parts})` : label;
}

export function HistoryPanel({ history }: Props) {
  return (
    <div className="history-panel">
      <div className="history-panel__header">Cronologia operazioni ({history.length})</div>
      <div className="history-panel__items">
        {history
          .slice()
          .reverse()
          .map((entry, idx) => (
            <div key={idx} className="history-panel__item">
              <span className="history-panel__time">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
              <span>{describe(entry)}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
