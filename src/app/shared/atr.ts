/**
 * Average True Range via Wilder's smoothing, as a pure numeric core so it can
 * be unit-tested independently of the chart component. The backend does not
 * ship an ATR field, so it is derived client-side from OHLC.
 *
 * Returns one point per input bar from index `period` onward, each carrying the
 * source-bar `index` so callers can map it back to their own time axis.
 */
export interface AtrPoint {
  index: number;
  value: number;
}

export function computeAtrValues(
  bars: readonly { high: number; low: number; close: number }[],
  period = 14,
): AtrPoint[] {
  if (bars.length < period + 1) return [];

  // trueRanges[i] is the TR of bars[i + 1] (it needs the previous close).
  const trueRanges: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const c = bars[i];
    const prevClose = bars[i - 1].close;
    trueRanges.push(Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose)));
  }

  const result: AtrPoint[] = [];
  let atr = 0;
  for (let i = 0; i < period; i++) atr += trueRanges[i];
  atr /= period; // seed: simple average of the first `period` true ranges
  result.push({ index: period, value: atr });
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
    result.push({ index: i + 1, value: atr });
  }
  return result;
}
