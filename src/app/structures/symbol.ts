export const SymbolProvider = { Binance: 0, Alpaca: 1 } as const;

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
  provider: number;
}

export function isAlpacaSymbol(symbol: SymbolResponse | null | undefined): boolean {
  return symbol?.provider === SymbolProvider.Alpaca;
}
