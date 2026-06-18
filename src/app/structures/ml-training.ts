import { CandleWithIndicatorsResponse } from './candle';

export type MlTrainingStatus = 'Pending' | 'Running' | 'Completed' | 'Failed';

/** GET /api/ml/training-runs and /{id} — camelCase. */
export interface MlTrainingRun {
  id: number;
  modelId: string;
  symbolCode: string;
  intervalCode: string;
  from: number;
  to: number;
  startedAt: number;
  completedAt: number | null;
  status: MlTrainingStatus;
  totalTimesteps: number | null;
  finalBalance: number | null;
  pnlPct: number | null;
  nTrades: number | null;
  runId: string | null;
}

/**
 * POST /api/ml/train body. NOTE: the backend DTO uses snake_case JSON names (it forwards
 * straight to the Python trainer), so these keys are snake_case on purpose.
 */
export interface CreateTrainingRequest {
  symbol: string;
  interval: string;
  from_date: string;
  to_date: string;
  model_id: string;
  total_timesteps?: number | null;
  initial_balance?: number | null;
  quantity?: number | null;
  stop_loss?: number | null;
  take_profit?: number | null;
  breakeven?: number | null;
  breakeven_stop?: number | null;
  max_candles_per_trade?: number | null;
  daily_profit_target?: number | null;
  daily_drawdown_limit?: number | null;
  fee_rate?: number | null;
  slippage_rate?: number | null;
  max_trailing_drawdown_threshold?: number | null;
}

/** POST /api/ml/train response — camelCase. */
export interface MlTrainStartedResponse {
  trainingRunId: number;
  modelId: string;
  status: MlTrainingStatus;
  message: string;
}

/** GET /api/ml/training-runs/{id}/decisions — snake_case (Python passthrough). */
export interface MlDecisionLog {
  model_id: string;
  symbol: string;
  interval: string;
  from_date: string;
  to_date: string;
  initial_balance: number;
  final_balance: number;
  pnl_pct: number;
  n_trades: number;
  decisions: MlDecision[];
  trades: MlTrainingTrade[];
}

export interface MlDecision {
  candle_index: number;
  open_time: number | null;
  action: number;
  action_name: string;
  confidence: number;
  probs: number[];
  position: number;
  balance: number;
}

export interface MlTrainingTrade {
  entry_step: number;
  entry_time: number | null;
  entry_price: number;
  side: string;
  exit_step: number;
  exit_time: number | null;
  exit_price: number;
  reason: string;
  pnl: number;
}

/** WS /ws/ml/training — the mlDecision payload is camelCase. */
export interface MlStreamDecision {
  time: number;
  action: number;
  actionName: string;
  confidence: number;
  probs: number[];
  position: number;
  balance: number;
}

export type MlTrainingStreamEvent =
  | { type: 'candle'; data: CandleWithIndicatorsResponse }
  | { type: 'mlDecision'; data: MlStreamDecision };
