export type TradeSide       = 'Buy' | 'Sell';
export type TradeOrderType  = 'Market' | 'Limit';
export type TradeStatus     = 'Pending' | 'Active' | 'Closed' | 'Cancelled';
export type TradeCloseReason = 'Manual' | 'StopLoss' | 'TakeProfit';

export interface Trade {
  id:             number;
  symbolCode:     string;
  intervalCode:   string | null;
  side:           TradeSide;
  orderType:      TradeOrderType;
  quantity:       number;
  requestedPrice: number | null;
  entryPrice:     number | null;
  stopLoss:       number | null;
  takeProfit:     number | null;
  status:         TradeStatus;
  createdAt:      number;
  openedAt:       number | null;
  closedAt:       number | null;
  closedPrice:    number | null;
  closeReason:      TradeCloseReason | null;
  pnl:              number | null;
  unrealizedPnl:    number | null;
  tradingAccountId: number | null;
  backtestId:       number | null;
}

export interface CreateTradeRequest {
  symbolCode:   string;
  intervalCode?: string;
  side:         TradeSide;
  orderType:    TradeOrderType;
  quantity:     number;
  limitPrice?:  number;
  stopLoss?:    number;
  takeProfit?:  number;
  tradingAccountId?: number;
}

export interface UpdateTradeRequest {
  stopLoss?:   number | null;
  takeProfit?: number | null;
}
