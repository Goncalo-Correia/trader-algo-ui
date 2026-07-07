import { CandleWithIndicators } from './candle';
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
  tradingStrategyId?: number | null;
  quantity?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  breakeven?: number | null;
  breakevenStop?: number | null;
  fee?: number | null;
  isNySessionOnly?: boolean;
  dailyProfitGoal?: number | null;
  maxLossesPerDay?: number | null;
  maxCandlesPerTrade?: number | null;
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
  maxDrawdown: number | null;
  maxTrailingDrawdown: number | null;
  candleCount: number;
  tradeCount: number;
  quantity: number;
  stopLoss: number | null;
  takeProfit: number | null;
  breakeven: number | null;
  breakevenStop: number | null;
  fee: number | null;
  isNySessionOnly: boolean;
  delay: boolean;
  dailyProfitGoal: number | null;
  maxLossesPerDay: number | null;
  maxCandlesPerTrade: number | null;
}

export interface TradeBracketUpdate {
  tradeId: number;
  stopLoss: number | null;
  takeProfit: number | null;
}

export type BacktestStreamEvent =
  | { type: 'candle'; data: CandleWithIndicators }
  | { type: 'candleBatch'; data: CandleWithIndicators[] }
  | { type: 'tradeOpened'; data: Trade }
  | { type: 'tradeClosed'; data: Trade }
  | { type: 'tradeBracketUpdate'; data: TradeBracketUpdate };

export interface EquityPoint {
  time:     number;
  balance:  number;
  tradePnl: number | null;
}

// The detail endpoint returns summary fields plus trades and the equity curve.
// Candles are no longer part of this payload (compute/replay split) — fetch them
// separately from the candles-by-date-interval endpoint when a price chart is needed.
export interface BacktestDetail extends BacktestSummary {
  trades: Trade[];
  equityCurve: EquityPoint[];
}
