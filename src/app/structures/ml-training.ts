import { CandleWithIndicators } from './candle';

export type MlTrainingStatus = 'Pending' | 'Running' | 'Completed' | 'Failed';
export type MlSplit = 'train' | 'val' | 'test' | 'oos' | string;

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

  inSampleFinalBalance?: number | null;
  inSamplePnlPct?: number | null;
  oosFinalBalance?: number | null;
  oosPnlPct?: number | null;
  oosSharpe?: number | null;
  oosProfitFactor?: number | null;
  oosMaxDrawdownPct?: number | null;
  oosTradeCount?: number | null;
  tradeCount?: number | null;
  schemaVersion?: string | number | null;
  observationDim?: number | null;
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

export interface MlflowRegistryModelVersion {
  version?: string | number | null;
  stage?: string | null;
  source?: string | null;
  storageLocation?: string | null;
  description?: string | null;
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
  registry?: {
    modelName?: string | null;
    currentVersion?: string | number | null;
    allVersions?: MlflowRegistryModelVersion[];
    stage?: string | null;
    source?: string | null;
    storageLocation?: string | null;
    description?: string | null;
  } | null;
  experiment?: Record<string, unknown> | null;
  tags?: Record<string, string> | null;
  evalMetrics?: Record<string, number | null> | null;
}

export interface CreateTrainingRequest {
  mlPolicyId: number;
  from: string;
  to: string;
}

export interface MlTrainStartedResponse {
  trainingRunId: number;
  status: MlTrainingStatus;
  message: string;
}

export interface MlRetrainAllRequest {
  from: string;
  to: string;
}

export interface MlRetrainAllResult {
  mlPolicyId?: number | null;
  policyId?: number | null;
  trainingRunId?: number | null;
  status: 'Started' | 'Skipped' | 'Failed' | string;
  message?: string | null;
}

export interface MlServedModel {
  mlPolicyId: number;
  policyId?: number | null;
  symbolCode?: string | null;
  intervalCode?: string | null;
  served?: boolean | null;
  servedTrainingRunId?: number | null;
  trainingRunId?: number | null;
  modelId?: string | null;
  oosPnl?: number | null;
  oosPnlPct?: number | null;
  oosFinalBalance?: number | null;
  inSamplePnl?: number | null;
  inSamplePnlPct?: number | null;
  inSampleFinalBalance?: number | null;
  tradeCount?: number | null;
  nTrades?: number | null;
  calibrated?: boolean | null;
  calibratedConfidence?: boolean | null;
  observationDim?: number | null;
  schemaVersion?: string | number | null;
  mlflowRunId?: string | null;
}

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
  split?: MlSplit | null;
  direction?: string | null;
  sl?: number | null;
  tp?: number | null;
  slAtrMult?: number | null;
  tpRBracket?: number | null;
  units?: number | null;
  rMultiple?: number | null;
  barsInTrade?: number | null;
  exitReason?: string | null;
}

export interface MlRunPerformance {
  promotionGatePassed?: boolean | null;
  gatePassed?: boolean | null;
  metrics?: Record<string, number | null> | null;
  splitMetrics?: Record<string, Record<string, number | null>> | null;
  [key: string]: unknown;
}

export interface MlLearningCurvePoint {
  step?: number | null;
  timestep?: number | null;
  meanEpisodeReward?: number | null;
  rewardMean?: number | null;
  rewardStd?: number | null;
  meanEpisodeLength?: number | null;
  episodeLengthMean?: number | null;
}

export interface MlCheckpointEval {
  step?: number | null;
  timestep?: number | null;
  trainReward?: number | null;
  validationReward?: number | null;
  trainDrawdown?: number | null;
  validationDrawdown?: number | null;
  score?: number | null;
  eligible?: boolean | null;
  isBest?: boolean | null;
}

export interface MlFoldMetric {
  fold?: number | null;
  returnPct?: number | null;
  sharpe?: number | null;
  profitFactor?: number | null;
  winRatePct?: number | null;
  maxDrawdownPct?: number | null;
  tradeCount?: number | null;
  [key: string]: unknown;
}

export interface MlMetricRow {
  split?: string | null;
  key?: string | null;
  value?: number | null;
  [key: string]: unknown;
}

export interface MlEquityPoint {
  time?: number | string | null;
  timestamp?: number | string | null;
  equity?: number | null;
  balance?: number | null;
  drawdown?: number | null;
  drawdownPct?: number | null;
  split?: string | null;
  [key: string]: unknown;
}

export interface MlPaginatedResponse<T> {
  items?: T[];
  data?: T[];
  rows?: T[];
  total?: number | null;
  limit?: number | null;
  offset?: number | null;
}

export interface MlFeatureQualityRow {
  feature?: string | null;
  name?: string | null;
  spearmanR1Bar?: number | null;
  spearmanP1Bar?: number | null;
  signalP05?: boolean | null;
  missingPct?: number | null;
  [key: string]: unknown;
}

export interface MlChartArtifact {
  name?: string | null;
  title?: string | null;
  url?: string | null;
  path?: string | null;
  type?: string | null;
  [key: string]: unknown;
}

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
  | { type: 'candle'; data: CandleWithIndicators }
  | { type: 'mlDecision'; data: MlStreamDecision };
