export interface KronosRequest {
  symbol: string;
  interval: string;
}

export type KronosResponse = import('./candle').CandleResponse[];
