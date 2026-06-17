import { IntervalResponse } from './interval';
import { SymbolResponse } from './symbol';

export interface TradeBot {
  id: number;
  tradingAccountId: number | null;
  tradingAccountName?: string | null;
  backtestId: number | null;
  tradingStrategyId?: number | null;
  tradingStrategy: string;
  symbolId?: number;
  intervalId?: number;
  isEnabled: boolean;
  quantity: number;
  stopLoss: number | null;
  takeProfit: number | null;
  breakeven: number | null;
  breakevenStop: number | null;
  isNySessionOnly: boolean;
  delay: boolean;
  dailyProfitGoal: number | null;
  maxLossesPerDay: number | null;
  maxCandlesPerTrade: number | null;
  fee: number | null;
  createdAt: number | string;
  updatedAt: number | string;
  lastSignalAt: number | string | null;
  symbol?: SymbolResponse | null;
  interval?: IntervalResponse | null;
  symbolCode?: string | null;
  intervalCode?: string | null;
}

export interface CreateTradeBotRequest {
  tradingAccountId:  number;
  tradingStrategyId: number;
  symbolCode: string;
  intervalCode: string;
  symbolId?: number;
  intervalId?: number;
  quantity: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  breakeven?: number | null;
  breakevenStop?: number | null;
  isNySessionOnly?: boolean;
  delay?: boolean;
  dailyProfitGoal?: number | null;
  maxLossesPerDay?: number | null;
  maxCandlesPerTrade?: number | null;
  fee?: number | null;
  isEnabled?: boolean;
}

export interface UpdateTradeBotRequest {
  tradingStrategyId?: number | null;
  symbolCode: string;
  intervalCode: string;
  symbolId?: number;
  intervalId?: number;
  quantity: number;
  stopLoss: number | null;
  takeProfit: number | null;
  breakeven: number | null;
  breakevenStop: number | null;
  isNySessionOnly: boolean;
  delay: boolean;
  dailyProfitGoal: number | null;
  maxLossesPerDay: number | null;
  maxCandlesPerTrade: number | null;
  fee: number | null;
  isEnabled: boolean;
}

export type TradeBotEventType =
  | 'TradeOpened'
  | 'TradeClosed'
  | 'BotEnabled'
  | 'BotDisabled'
  | 'SignalIgnored'
  | 'TradeBracketUpdate';

export interface TradeBotEvent {
  type: TradeBotEventType;
  tradingAccountId: number | null;
  tradeId?: number;
  symbolCode?: string;
  side?: string;
  status?: string;
  reason?: string;
  message?: string;
  createdAt?: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
}
