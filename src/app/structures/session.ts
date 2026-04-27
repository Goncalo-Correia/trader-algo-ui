export interface SessionOhlcvResponse {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sessionStart: number;
  sessionEnd: number;
}

export interface VolumeProfileLevel {
  priceFrom: number;
  priceTo:   number;
  volume:    number;
  buyVolume: number;
}

