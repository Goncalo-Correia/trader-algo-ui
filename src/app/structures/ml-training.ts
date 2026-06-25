import { CandleWithIndicatorsResponse } from './candle';

export type MlTrainingStatus = 'Pending' | 'Running' | 'Completed' | 'Failed';

/** GET /api/ml/training-runs and /{id} — camelCase. Model/symbol/interval are resolved through the run's policy. */
export interface MlTrainingRun {
  id: number;
  mlPolicyId: number;
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
  tracking?: MlflowTrackingSummary | null;
}

export interface MlflowMetricPoint {
  step: number;
  value: number | null;
  timestamp: string;
}

export interface MlflowRewardMetric {
  key: string;
  label: string;
  whatItChecks: string;
  latestValue: number | null;
  history: MlflowMetricPoint[];
}

export type MlflowRewardMetricGroup = Record<string, MlflowRewardMetric>;
export type MlflowRewardMetrics = Record<string, MlflowRewardMetricGroup>;

export interface MlflowTrackingSummary {
  trackingAvailable: boolean;
  mlflowRunUuid: string | null;
  runName: string | null;
  status: string | null;
  startTime: string | null;
  endTime: string | null;
  finalBalance: number | null;
  pnlPct: number | null;
  nTrades: number | null;
  params: Record<string, string>;
  message?: string | null;
}

export interface MlflowTrackingResponse {
  trainingRunId: number;
  trackingAvailable: boolean;
  mlflowRunUuid: string | null;
  runName: string | null;
  status: string | null;
  startTime: string | null;
  endTime: string | null;
  artifactUri: string | null;
  params: Record<string, string>;
  rewardMetrics?: MlflowRewardMetrics | null;
  latestMetrics: Record<string, number | null>;
  metricHistory: Record<string, MlflowMetricPoint[]>;
  message?: string | null;
}

/**
 * POST /api/ml/train body — starts a run for an existing policy.
 * The hyperparameters now live on the policy; a run only picks the date range.
 * `from`/`to` are date-only (yyyy-MM-dd); the server normalises from→00:00 and to→23:59.
 */
export interface CreateTrainingRequest {
  mlPolicyId: number;
  from: string;
  to: string;
}

/** POST /api/ml/train response — camelCase. */
export interface MlTrainStartedResponse {
  trainingRunId: number;
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
