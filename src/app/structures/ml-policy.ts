/**
 * GET /api/ml/policies and /policies/{id} — camelCase.
 * List rows additionally carry the symbol/interval names and a trainingRunCount.
 */
export interface MlPolicy {
  id: number;
  symbolCode: string;
  intervalCode: string;
  totalTimesteps: number;
  initialBalance: number;
  quantity: number;
  takeProfit: number | null;
  stopLoss: number | null;
  breakeven: number | null;
  breakevenStop: number | null;
  fee: number | null;
  slippage: number | null;
  dailyProfit: number | null;
  dailyDrawdownLimit: number | null;
  maxCandlesPerTrade: number | null;
  maxTrailingDrawdown: number | null;
  createdAt: number;
  trainingRunCount: number;
}

/**
 * POST /api/ml/policies and PUT /policies/{id} body — camelCase.
 * Symbol/interval are sent as codes and resolved to ids server-side.
 * Risk fields are absolute amounts (consistent with backtests).
 */
export interface CreatePolicyRequest {
  symbol: string;
  interval: string;
  totalTimesteps: number;
  initialBalance: number;
  quantity: number;
  takeProfit?: number | null;
  stopLoss?: number | null;
  breakeven?: number | null;
  breakevenStop?: number | null;
  fee?: number | null;
  slippage?: number | null;
  dailyProfit?: number | null;
  dailyDrawdownLimit?: number | null;
  maxCandlesPerTrade?: number | null;
  maxTrailingDrawdown?: number | null;
}
