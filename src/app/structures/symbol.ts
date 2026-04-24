export interface SymbolResponse {
  id: number;
  code: string;
  baseAsset: string;
  quoteAsset: string;
  displayName: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  klines: unknown[];
}
