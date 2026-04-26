export interface PredictRequest {
  symbol:       string;
  interval:     string;
  lookback?:    number;   // default: 100
  modelId?:     string;   // default: 'kronos-mini'
  predLen?:     number;   // default: 10
  temperature?: number;   // default: 1
  topK?:        number;   // default: 0
  topP?:        number;   // default: 0.9
  sampleCount?: number;   // default: 1
}

export interface PredictResponse {
  // TODO: populate once the API response shape is known
  [key: string]: unknown;
}
