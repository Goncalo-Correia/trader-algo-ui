/**
 * Shared colour palette for the lightweight-charts based components.
 *
 * Previously these hex values were duplicated as magic strings across both
 * chart components; centralising them keeps the two charts visually in sync
 * and makes re-theming a single-file change.
 */
export const CHART_COLORS = {
  background: '#000000',
  text: '#d1d4dc',
  border: '#2a2d3a',

  /** Crosshair labels, MACD line, bullish prediction candles. */
  accent: '#2962ff',

  bullish: '#26a69a',
  bearish: '#ef5350',
  /** Faded variants used for "not growing" histogram bars. */
  bullishFaded: '#26a69a55',
  bearishFaded: '#ef535055',

  /** Trade entry line, RSI moving average, bearish prediction candles. */
  highlight: '#ffd600',

  sma20: '#f59e0b',
  sma100: '#818cf8',
  rsi: '#9c27b0',
  macdSignal: '#ff6d00',
  atr: '#00bcd4',
  zeroLine: '#4a4d5a',

  sessionCurrent: '#42a5f5',
  sessionPrevious: '#9e9e9e',
} as const;
