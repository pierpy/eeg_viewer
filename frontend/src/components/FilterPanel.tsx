import type { FilterSpec, FilterType } from "../types";

interface Props {
  filters: FilterSpec[];
  onChange: (filters: FilterSpec[]) => void;
}

const LABELS: Record<FilterType, string> = {
  highpass: "Passa-alto",
  lowpass: "Passa-basso",
  notch: "Notch",
};

// Rendering order in the panel. Adding a new FilterType to the shared
// `types/index.ts` and giving it a row here (plus a default in App.tsx and
// a backend registration) is the whole integration surface.
const ORDER: FilterType[] = ["highpass", "lowpass", "notch"];

export function FilterPanel({ filters, onChange }: Props) {
  function update(type: FilterType, patch: Partial<FilterSpec>) {
    onChange(filters.map((f) => (f.type === type ? { ...f, ...patch } : f)));
  }

  return (
    <div className="filter-panel">
      <div className="filter-panel__header">Filtri di visualizzazione</div>
      {ORDER.map((type) => {
        const spec = filters.find((f) => f.type === type);
        if (!spec) return null;
        return (
          <div key={type} className="filter-panel__row">
            <label className="filter-panel__toggle">
              <input
                type="checkbox"
                checked={spec.enabled}
                onChange={(e) => update(type, { enabled: e.target.checked })}
              />
              {LABELS[type]}
            </label>
            <div className="filter-panel__params">
              <label>
                {type === "notch" ? "Freq (Hz)" : "Cutoff (Hz)"}
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={spec.freq}
                  disabled={!spec.enabled}
                  onChange={(e) => update(type, { freq: Number(e.target.value) })}
                />
              </label>
              {type === "notch" ? (
                <label>
                  Q
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={spec.q}
                    disabled={!spec.enabled}
                    onChange={(e) => update(type, { q: Number(e.target.value) })}
                  />
                </label>
              ) : (
                <label>
                  Ordine
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="8"
                    value={spec.order}
                    disabled={!spec.enabled}
                    onChange={(e) => update(type, { order: Number(e.target.value) })}
                  />
                </label>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
