import type { ChannelInfo } from "../types";

interface Props {
  channels: ChannelInfo[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
}

export function ChannelList({ channels, selected, onChange }: Props) {
  function toggle(name: string) {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange(next);
  }

  function selectAll() {
    onChange(new Set(channels.map((c) => c.name)));
  }

  function selectNone() {
    onChange(new Set());
  }

  return (
    <div className="channel-list">
      <div className="channel-list__header">
        <span>Canali ({channels.length})</span>
        <div className="channel-list__actions">
          <button type="button" onClick={selectAll}>
            Tutti
          </button>
          <button type="button" onClick={selectNone}>
            Nessuno
          </button>
        </div>
      </div>
      <div className="channel-list__items">
        {channels.map((ch) => (
          <label key={ch.name} className="channel-list__item">
            <input
              type="checkbox"
              checked={selected.has(ch.name)}
              onChange={() => toggle(ch.name)}
            />
            <span>{ch.name}</span>
            <span className="channel-list__meta">
              {ch.sample_rate} Hz
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
