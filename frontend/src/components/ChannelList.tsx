import type { ChannelInfo } from "../types";

interface Props {
  channels: ChannelInfo[];
  selected: Set<string>;
  badChannels: Set<string>;
  spectrogramChannel: string | null;
  // True while a reference/montage is active: the view then always shows
  // every good channel regardless of selection, so the checkboxes (and
  // Tutti/Nessuno) have no effect and are disabled to avoid confusion.
  selectionDisabled: boolean;
  onChange: (selected: Set<string>) => void;
  onToggleBad: (name: string) => void;
  onToggleSpectrogram: (name: string) => void;
}

export function ChannelList({
  channels,
  selected,
  badChannels,
  spectrogramChannel,
  selectionDisabled,
  onChange,
  onToggleBad,
  onToggleSpectrogram,
}: Props) {
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
          <button type="button" onClick={selectAll} disabled={selectionDisabled}>
            Tutti
          </button>
          <button type="button" onClick={selectNone} disabled={selectionDisabled}>
            Nessuno
          </button>
        </div>
      </div>
      {selectionDisabled && (
        <p className="channel-list__hint">
          Montaggio attivo: vengono mostrati tutti i canali non-bad, la selezione è ignorata.
        </p>
      )}
      <div className="channel-list__items">
        {channels.map((ch) => {
          const isBad = badChannels.has(ch.name);
          return (
            <div key={ch.name} className={`channel-list__item${isBad ? " channel-list__item--bad" : ""}`}>
              <label
                className="channel-list__checkbox"
                title={selectionDisabled ? "Selezione ignorata mentre un montaggio è attivo" : undefined}
              >
                <input
                  type="checkbox"
                  checked={selected.has(ch.name)}
                  disabled={selectionDisabled}
                  onChange={() => toggle(ch.name)}
                />
                <span className="channel-list__name">{ch.name}</span>
              </label>
              <span className="channel-list__meta">{ch.sample_rate} Hz</span>
              <button
                type="button"
                className={`channel-list__spec-toggle${spectrogramChannel === ch.name ? " channel-list__spec-toggle--active" : ""}`}
                title="Mostra/nascondi spettrogramma per questo canale"
                onClick={() => onToggleSpectrogram(ch.name)}
              >
                SPEC
              </button>
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
