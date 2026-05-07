import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CandleRequest, CandleResponse, CandleWithIndicatorsResponse } from '../structures/candle';
import { IntervalResponse } from '../structures/interval';
import { SessionOhlcvResponse, VolumeProfileLevel } from '../structures/session';
import { SymbolResponse } from '../structures/symbol';
import { CreateTradeBotRequest, TradeBot, UpdateTradeBotRequest } from '../structures/trade-bot';
import { CreateTradeRequest, Trade, UpdateTradeRequest } from '../structures/trade';
import { TradingAccount, CreateTradingAccountRequest, UpdateTradingAccountRequest } from '../structures/trading-account';
import { BacktestCandleRequest, BacktestDetail, BacktestSummary, CreateBacktestRequest } from '../structures/backtest';
import { StrategyResponse } from '../structures/strategy';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TraderAlgoApiService {
  private readonly baseUrl = environment.traderAlgoApi.baseUrl;

  constructor(private readonly http: HttpClient) {}

  getCandles(request: CandleRequest = {}): Observable<CandleResponse[]> {
    let params = new HttpParams();
    Object.entries(request).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params = params.set(key, String(value));
      }
    });
    return this.http.get<CandleResponse[]>(`${this.baseUrl}/api/charts/candles`, { params });
  }

  getCandlesWithIndicators(request: CandleRequest = {}): Observable<CandleWithIndicatorsResponse[]> {
    let params = new HttpParams();
    Object.entries(request).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params = params.set(key, String(value));
      }
    });
    return this.http.get<CandleWithIndicatorsResponse[]>(`${this.baseUrl}/api/charts/candles/indicators`, { params });
  }

  kronosMiniPrecise(symbol: string, interval: string): Observable<CandleResponse[]> {
    return this.kronosGet('mini/precise', symbol, interval);
  }

  kronosMiniDiverse(symbol: string, interval: string): Observable<CandleResponse[]> {
    return this.kronosGet('mini/diverse', symbol, interval);
  }

  kronosSmallPrecise(symbol: string, interval: string): Observable<CandleResponse[]> {
    return this.kronosGet('small/precise', symbol, interval);
  }

  kronosSmallDiverse(symbol: string, interval: string): Observable<CandleResponse[]> {
    return this.kronosGet('small/diverse', symbol, interval);
  }

  kronosBasePrecise(symbol: string, interval: string): Observable<CandleResponse[]> {
    return this.kronosGet('base/precise', symbol, interval);
  }

  kronosBaseDiverse(symbol: string, interval: string): Observable<CandleResponse[]> {
    return this.kronosGet('base/diverse', symbol, interval);
  }

  getIntervals(): Observable<IntervalResponse[]> {
    return this.http.get<IntervalResponse[]>(`${this.baseUrl}/api/intervals`);
  }

  getSymbols(): Observable<SymbolResponse[]> {
    return this.http.get<SymbolResponse[]>(`${this.baseUrl}/api/symbols`);
  }

  getStrategies(): Observable<StrategyResponse[]> {
    return this.http.get<StrategyResponse[]>(`${this.baseUrl}/api/trading-strategies`);
  }

  getSessionVolumeProfile(symbol: string, buckets = 30): Observable<VolumeProfileLevel[]> {
    return this.http.get<VolumeProfileLevel[]>(`${this.baseUrl}/api/session/volume-profile`, {
      params: { symbol, buckets },
    });
  }

  getCurrentSessionOhlcv(symbol: string): Observable<SessionOhlcvResponse> {
    return this.http.get<SessionOhlcvResponse>(`${this.baseUrl}/api/session/current`, { params: { symbol } });
  }

  getPreviousSessionOhlcv(symbol: string): Observable<SessionOhlcvResponse> {
    return this.http.get<SessionOhlcvResponse>(`${this.baseUrl}/api/session/previous`, { params: { symbol } });
  }

  createTrade(payload: CreateTradeRequest): Observable<Trade> {
    return this.http.post<Trade>(`${this.baseUrl}/api/trades`, payload);
  }

  stopTrade(id: number): Observable<Trade> {
    return this.http.post<Trade>(`${this.baseUrl}/api/trades/${id}/stop`, {});
  }

  updateTrade(id: number, payload: UpdateTradeRequest): Observable<Trade> {
    return this.http.patch<Trade>(`${this.baseUrl}/api/trades/${id}`, payload);
  }

  getActiveTrades(tradingAccountId: number): Observable<Trade[]> {
    return this.http.get<Trade[]>(`${this.baseUrl}/api/trades/account/${tradingAccountId}/active`);
  }

  getTradeHistory(tradingAccountId: number): Observable<Trade[]> {
    return this.http.get<Trade[]>(`${this.baseUrl}/api/trades/account/${tradingAccountId}/history`);
  }

  getBacktestTrades(backtestId: number): Observable<Trade[]> {
    return this.http.get<Trade[]>(`${this.baseUrl}/api/trades/backtest/${backtestId}`);
  }

  getTradingAccounts(): Observable<TradingAccount[]> {
    return this.http.get<TradingAccount[]>(`${this.baseUrl}/api/trading-accounts`);
  }

  getTradingAccount(id: number): Observable<TradingAccount> {
    return this.http.get<TradingAccount>(`${this.baseUrl}/api/trading-accounts/${id}`);
  }

  createTradingAccount(payload: CreateTradingAccountRequest): Observable<TradingAccount> {
    return this.http.post<TradingAccount>(`${this.baseUrl}/api/trading-accounts`, payload);
  }

  updateTradingAccount(id: number, payload: UpdateTradingAccountRequest): Observable<TradingAccount> {
    return this.http.patch<TradingAccount>(`${this.baseUrl}/api/trading-accounts/${id}`, payload);
  }

  getTradeBots(tradingAccountId?: number): Observable<TradeBot[]> {
    const options = tradingAccountId === undefined
      ? {}
      : { params: new HttpParams().set('tradingAccountId', String(tradingAccountId)) };
    return this.http.get<TradeBot[]>(`${this.baseUrl}/api/tradebots`, options);
  }

  getTradeBot(id: number): Observable<TradeBot> {
    return this.http.get<TradeBot>(`${this.baseUrl}/api/tradebots/${id}`);
  }

  createTradeBot(payload: CreateTradeBotRequest): Observable<TradeBot> {
    return this.http.post<TradeBot>(`${this.baseUrl}/api/tradebots`, payload);
  }

  updateTradeBot(id: number, payload: UpdateTradeBotRequest): Observable<TradeBot> {
    return this.http.patch<TradeBot>(`${this.baseUrl}/api/tradebots/${id}`, payload);
  }

  enableTradeBot(id: number): Observable<TradeBot> {
    return this.http.post<TradeBot>(`${this.baseUrl}/api/tradebots/${id}/enable`, {});
  }

  disableTradeBot(id: number): Observable<TradeBot> {
    return this.http.post<TradeBot>(`${this.baseUrl}/api/tradebots/${id}/disable`, {});
  }

  getBacktestCandles(req: BacktestCandleRequest): Observable<CandleResponse[]> {
    const params = new HttpParams()
      .set('symbol', req.symbol)
      .set('interval', req.interval)
      .set('from', req.from)
      .set('to', req.to);
    return this.http.get<CandleResponse[]>(`${this.baseUrl}/api/backtests/candles`, { params });
  }

  getBacktestCandlesWithIndicators(req: BacktestCandleRequest): Observable<CandleWithIndicatorsResponse[]> {
    const params = new HttpParams()
      .set('symbol', req.symbol)
      .set('interval', req.interval)
      .set('from', req.from)
      .set('to', req.to);
    return this.http.get<CandleWithIndicatorsResponse[]>(`${this.baseUrl}/api/backtests/candles/indicators`, { params });
  }

  createBacktest(payload: CreateBacktestRequest): Observable<BacktestSummary> {
    return this.http.post<BacktestSummary>(`${this.baseUrl}/api/backtests`, payload);
  }

  deleteTradingAccount(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/api/trading-accounts/${id}`);
  }

  getBacktests(): Observable<BacktestSummary[]> {
    return this.http.get<BacktestSummary[]>(`${this.baseUrl}/api/backtests`);
  }

  getBacktest(id: number): Observable<BacktestDetail> {
    return this.http.get<BacktestDetail>(`${this.baseUrl}/api/backtests/${id}`);
  }

  deleteBacktest(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/api/backtests/${id}`);
  }

  private kronosGet(path: string, symbol: string, interval: string): Observable<CandleResponse[]> {
    const params = new HttpParams().set('symbol', symbol).set('interval', interval);
    return this.http.get<CandleResponse[]>(`${this.baseUrl}/api/kronos/${path}`, { params });
  }
}
