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
