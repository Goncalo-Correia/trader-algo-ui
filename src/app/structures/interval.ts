export interface IntervalResponse {
  id: number;
  code: string;
  displayName: string;
  duration: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  klines: unknown[];
}
