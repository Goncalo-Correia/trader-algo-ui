import { IntervalResponse } from './interval';
import { SymbolResponse } from './symbol';
import { TradeOrderType } from './trade';

export interface TradeBot {
  id: number;
  tradingAccountId: number;
  symbolId: number;
  intervalId: number;
  isEnabled: boolean;
  quantity: number;
  stopLoss: number | null;
  takeProfit: number | null;
  orderType: TradeOrderType;
  createdAt: number | string;
  updatedAt: number | string | null;
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
  orderType: TradeOrderType;
  isEnabled?: boolean;
}

export interface UpdateTradeBotRequest {
  symbolCode?: string;
  intervalCode?: string;
  symbolId?: number;
  intervalId?: number;
  quantity?: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  orderType?: TradeOrderType;
  isEnabled?: boolean;
}

export type TradeBotEventType =
  | 'TradeOpened'
  | 'TradeClosed'
  | 'BotEnabled'
  | 'BotDisabled'
  | 'SignalIgnored';

export interface TradeBotEvent {
  type: TradeBotEventType;
  tradingAccountId: number;
  tradeId?: number;
  symbolCode?: string;
  side?: string;
  status?: string;
  reason?: string;
}
