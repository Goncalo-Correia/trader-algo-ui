export interface MlPolicy {
  id: number;
  symbolCode: string;
  intervalCode: string;
  totalTimesteps: number;
  initialBalance: number;
  riskPerTrade: number | null;
  fee: number | null;
  slippage: number | null;
  dailyProfit: number | null;
  dailyDrawdownLimit: number | null;
  maxCandlesPerTrade: number | null;
  createdAt: number;
  trainingRunCount: number;

  // Legacy fields may still be present on older API responses.
  quantity?: number | null;
  takeProfit?: number | null;
  stopLoss?: number | null;
  breakeven?: number | null;
  breakevenStop?: number | null;
  maxTrailingDrawdown?: number | null;
}

export interface CreatePolicyRequest {
  symbol: string;
  interval: string;
  totalTimesteps: number;
  initialBalance: number;
  riskPerTrade?: number | null;
  fee?: number | null;
  slippage?: number | null;
  dailyProfit?: number | null;
  dailyDrawdownLimit?: number | null;
  maxCandlesPerTrade: number;
}

export type UpdatePolicyRequest = CreatePolicyRequest;

export interface MlPolicyRunTrend {
  id: number;
  trainingRunId?: number | null;
  status?: string | null;
  startedAt?: number | null;
  completedAt?: number | null;
  inSamplePnlPct?: number | null;
  oosPnlPct?: number | null;
  oosFinalBalance?: number | null;
  oosMaxDrawdownPct?: number | null;
  oosSharpe?: number | null;
  oosProfitFactor?: number | null;
  tradeCount?: number | null;
}

export interface MlManualDecisionRequest {
  mlPolicyId: number;
  symbol?: string | null;
  interval?: string | null;
}

export interface MlManualDecisionResponse {
  action?: number | null;
  actionName?: string | null;
  action_name?: string | null;
  confidence?: number | null;
  modelId?: string | null;
  model_id?: string | null;
  slBracket?: string | number | null;
  sl_bracket?: string | number | null;
  tpBracket?: string | number | null;
  tp_bracket?: string | number | null;
  slAtrMult?: number | null;
  sl_atr_mult?: number | null;
  tpRMultiple?: number | null;
  tp_r_multiple?: number | null;
}
