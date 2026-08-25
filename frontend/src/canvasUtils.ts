/** Shared helpers for the hand-rolled canvas plots (EegCanvas, Spectrogram). */

/** "Nice" axis tick values (1/2/5 * 10^n steps) spanning [min, max]. */
export function niceTicks(min: number, max: number, count: number): number[] {
  if (max <= min) return [min];
  const rawStep = (max - min) / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  const step = (residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1) * magnitude;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}
