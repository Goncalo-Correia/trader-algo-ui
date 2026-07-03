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

/**
 * Wire shape of a candle-with-indicators as the backend serializes it
 * (snake_case). Only the data services should touch this type; everything
 * else consumes the mapped {@link CandleWithIndicators} domain model.
 */
export interface CandleWithIndicatorsDto {
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
  rsi_divergence: number | null;
  macd_line: number | null;
  macd_signal_line: number | null;
  macd_histogram: number | null;
}

/** Domain model consumed by the chart components (camelCase). */
export interface CandleWithIndicators {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  takerBuyVolume: number;
  takerSellVolume: number;
  sma20: number | null;
  sma100: number | null;
  rsi: number | null;
  rsiSmooth: number | null;
  /** Reserved for future divergence visualisation — not yet rendered. */
  rsiDivergence: number | null;
  macdLine: number | null;
  macdSignalLine: number | null;
  macdHistogram: number | null;
}

export function toCandleWithIndicators(dto: CandleWithIndicatorsDto): CandleWithIndicators {
  return {
    time: dto.time,
    open: dto.open,
    high: dto.high,
    low: dto.low,
    close: dto.close,
    volume: dto.volume,
    takerBuyVolume: dto.taker_buy_base_asset_volume,
    takerSellVolume: dto.taker_sell_base_asset_volume,
    sma20: dto.sma_20,
    sma100: dto.sma_100,
    rsi: dto.rsi,
    rsiSmooth: dto.rsi_smooth,
    rsiDivergence: dto.rsi_divergence,
    macdLine: dto.macd_line,
    macdSignalLine: dto.macd_signal_line,
    macdHistogram: dto.macd_histogram,
  };
}
