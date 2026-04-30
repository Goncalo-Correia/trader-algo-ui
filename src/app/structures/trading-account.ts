export type TradingStrategy = 'Sma' | 'Rsi' | 'Macd';

export interface TradingAccount {
  id:               number;
  name:             string;
  initialBalance:   number;
  currentBalance:   number;
  tradingStrategy:  TradingStrategy;
  isActive:         boolean;
  createdAt:        number;
}

export interface CreateTradingAccountRequest {
  name:             string;
  initialBalance:   number;
  tradingStrategy:  TradingStrategy;
}

export interface UpdateTradingAccountRequest {
  isActive: boolean;
}
