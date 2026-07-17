/**
 * High-level choice of how a training run is validated before a model can be promoted.
 * Fold counts, window sizes, embargo bars, and promotion thresholds are engine-owned
 * defaults in the Python sidecar and are intentionally not exposed here.
 */
export type ValidationScheme = 'single' | 'block';

export const VALIDATION_SCHEMES: readonly ValidationScheme[] = ['single', 'block'];

export const VALIDATION_SCHEME_LABELS: Record<ValidationScheme, string> = {
  single: 'Single split',
  block: 'Block walk-forward',
};

/** Map a (possibly unknown/legacy) wire value to a friendly label, defaulting to Single split. */
export function validationSchemeLabel(value: string | null | undefined): string {
  const scheme = (value ?? 'single').trim().toLowerCase() as ValidationScheme;
  return VALIDATION_SCHEME_LABELS[scheme] ?? VALIDATION_SCHEME_LABELS.single;
}

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
  validationScheme: ValidationScheme;
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
  validationScheme?: ValidationScheme;
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
  oosMaxDdPct?: number | null;
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
  tpRMult?: number | null;
  tp_r_mult?: number | null;
  quantity?: number | null;
}
