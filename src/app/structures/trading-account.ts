export interface TradingAccount {
  id:             number;
  name:           string;
  initialBalance: number;
  currentBalance: number;
  isActive:       boolean;
  createdAt:      number;
}

export interface CreateTradingAccountRequest {
  name:           string;
  initialBalance: number;
}

export interface UpdateTradingAccountRequest {
  isActive: boolean;
}
