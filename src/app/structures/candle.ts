export interface CandleRequest {
  symbol?: string;
  interval?: string;
  lookback?: number;
}

export interface CandleResponse {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
}

export interface CandleWithIndicatorsResponse {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  taker_buy_base_asset_volume: number;
  taker_sell_base_asset_volume: number;
  sma_20: number | null;
  sma_100: number | null;
  rsi: number | null;
  rsi_smooth: number | null;
  /** Reserved for future divergence visualisation — not yet rendered. */
  rsi_divergence: number | null;
  macd_line: number | null;
  macd_signal_line: number | null;
  macd_histogram: number | null;
}
