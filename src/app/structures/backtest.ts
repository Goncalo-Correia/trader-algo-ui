import { CandleWithIndicatorsResponse } from './candle';
import { Trade } from './trade';

export interface BacktestCandleRequest {
  symbol: string;
  interval: string;
  from: string;
  to: string;
}

export interface CreateBacktestRequest {
  symbol: string;
  interval: string;
  from: string;
  to: string;
  initialBalance: number;
}

export type BacktestStatus = 'Pending' | 'Running' | 'Completed' | 'Failed' | 'Cancelled';

export interface BacktestSummary {
  id: number;
  symbolCode: string;
  intervalCode: string;
  strategyName: string;
  tradeBotId: number | null;
  from: number;
  to: number;
  startedAt: number;
  completedAt: number | null;
  status: BacktestStatus;
  initialBalance: number;
  finalBalance: number | null;
  pnl: number | null;
  candleCount: number;
  tradeCount: number;
  quantity: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
}

export interface EquityPoint {
  time: number;
  balance: number;
}

export interface BacktestDetail extends BacktestSummary {
  trades: Trade[];
  candles: CandleWithIndicatorsResponse[];
  equityCurve: EquityPoint[];
}
