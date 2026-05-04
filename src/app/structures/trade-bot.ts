import { IntervalResponse } from './interval';
import { SymbolResponse } from './symbol';
import { TradingStrategy } from './trading-account';

export interface TradeBot {
  id: number;
  tradingAccountId: number | null;
  tradingAccountName?: string | null;
  backtestId: number | null;
  tradingStrategy: TradingStrategy;
  symbolId?: number;
  intervalId?: number;
  isEnabled: boolean;
  quantity: number;
  stopLoss: number | null;
  takeProfit: number | null;
  createdAt: number | string;
  updatedAt: number | string;
  lastSignalAt: number | string | null;
  symbol?: SymbolResponse | null;
  interval?: IntervalResponse | null;
  symbolCode?: string | null;
  intervalCode?: string | null;
}

export interface CreateTradeBotRequest {
  tradingAccountId: number;
  symbolCode: string;
  intervalCode: string;
  symbolId?: number;
  intervalId?: number;
  quantity: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  isEnabled?: boolean;
}

export interface UpdateTradeBotRequest {
  symbolCode: string;
  intervalCode: string;
  symbolId?: number;
  intervalId?: number;
  quantity: number;
  stopLoss: number | null;
  takeProfit: number | null;
  isEnabled: boolean;
}

export type TradeBotEventType =
  | 'TradeOpened'
  | 'TradeClosed'
  | 'BotEnabled'
  | 'BotDisabled'
  | 'SignalIgnored';

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
}
