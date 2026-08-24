import type { ChannelInfo } from "../types";

interface Props {
  channels: ChannelInfo[];
  selected: Set<string>;
  badChannels: Set<string>;
  onChange: (selected: Set<string>) => void;
  onToggleBad: (name: string) => void;
}

export function ChannelList({ channels, selected, badChannels, onChange, onToggleBad }: Props) {
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
        <span>
          Canali ({channels.length})
          {badChannels.size > 0 && (
            <span className="channel-list__bad-count"> · {badChannels.size} bad</span>
          )}
        </span>
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
        {channels.map((ch) => {
          const isBad = badChannels.has(ch.name);
          return (
            <div key={ch.name} className={`channel-list__item${isBad ? " channel-list__item--bad" : ""}`}>
              <label className="channel-list__checkbox">
                <input
                  type="checkbox"
                  checked={selected.has(ch.name)}
                  onChange={() => toggle(ch.name)}
                />
                <span className="channel-list__name">{ch.name}</span>
              </label>
              <span className="channel-list__meta">{ch.sample_rate} Hz</span>
              <button
                type="button"
                className={`channel-list__bad-toggle${isBad ? " channel-list__bad-toggle--active" : ""}`}
                title={isBad ? "Rimuovi marcatura BAD" : "Marca come BAD channel"}
                onClick={() => onToggleBad(ch.name)}
              >
                BAD
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
