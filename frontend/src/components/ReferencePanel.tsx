import type { ReferenceMode } from "../types";

interface Props {
  reference: ReferenceMode;
  onChange: (mode: ReferenceMode) => void;
}

const OPTIONS: { value: ReferenceMode; label: string; hint: string }[] = [
  { value: "none", label: "Nessuno (originale)", hint: "Canali come registrati" },
  {
    value: "car",
    label: "Media comune (CAR)",
    hint: "Sottrae la media dei canali selezionati da ciascun canale",
  },
  {
    value: "bipolar",
    label: "Bipolare (sequenziale)",
    hint: "Coppie in catena: ch1-ch2, ch2-ch3, ... sui canali selezionati",
  },
];

export function ReferencePanel({ reference, onChange }: Props) {
  const current = OPTIONS.find((o) => o.value === reference) ?? OPTIONS[0];
  return (
    <div className="reference-panel">
      <label>
        Montaggio / riferimento
        <select value={reference} onChange={(e) => onChange(e.target.value as ReferenceMode)}>
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <p className="reference-panel__hint">{current.hint}</p>
    </div>
  );
}
