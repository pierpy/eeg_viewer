interface Props {
  startSec: number;
  windowSec: number;
  totalDurationSec: number;
  onStartChange: (start: number) => void;
  onWindowChange: (window: number) => void;
}

const WINDOW_OPTIONS = [2, 5, 10, 20, 30, 60];

export function TimeNavigator({
  startSec,
  windowSec,
  totalDurationSec,
  onStartChange,
  onWindowChange,
}: Props) {
  const maxStart = Math.max(0, totalDurationSec - windowSec);

  function clamp(v: number) {
    return Math.min(Math.max(v, 0), maxStart);
  }

  return (
    <div className="time-navigator">
      <button type="button" onClick={() => onStartChange(clamp(startSec - windowSec))}>
        &laquo; Indietro
      </button>
      <input
        className="time-navigator__slider"
        type="range"
        min={0}
        max={maxStart}
        step={windowSec / 10 || 1}
        value={Math.min(startSec, maxStart)}
        onChange={(e) => onStartChange(clamp(Number(e.target.value)))}
      />
      <button type="button" onClick={() => onStartChange(clamp(startSec + windowSec))}>
        Avanti &raquo;
      </button>
      <span className="time-navigator__range">
        {startSec.toFixed(1)}s – {Math.min(startSec + windowSec, totalDurationSec).toFixed(1)}s
        {" / "}
        {totalDurationSec.toFixed(1)}s
      </span>
      <label className="time-navigator__window">
        Finestra
        <select
          value={windowSec}
          onChange={(e) => onWindowChange(Number(e.target.value))}
        >
          {WINDOW_OPTIONS.map((w) => (
            <option key={w} value={w}>
              {w}s
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
