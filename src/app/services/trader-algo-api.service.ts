import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import {
  CandleRequest,
  CandleResponse,
  CandleWithIndicators,
  CandleWithIndicatorsDto,
  toCandleWithIndicators,
} from '../structures/candle';
import { IntervalResponse } from '../structures/interval';
import { SessionOhlcvResponse, VolumeProfileLevel } from '../structures/session';
import { SymbolResponse } from '../structures/symbol';
import { CreateTradeBotRequest, TradeBot, UpdateTradeBotRequest } from '../structures/trade-bot';
import { CreateTradeRequest, Trade, UpdateTradeRequest } from '../structures/trade';
import {
  TradingAccount,
  CreateTradingAccountRequest,
  UpdateTradingAccountRequest,
} from '../structures/trading-account';
import { BacktestCandleRequest, BacktestDetail, BacktestSummary, CreateBacktestRequest } from '../structures/backtest';
import { StrategyResponse } from '../structures/strategy';
import {
  CreateTrainingRequest,
  MlChartArtifact,
  MlCheckpointEval,
  MlDecisionLog,
  MlEquityPoint,
  MlFeatureQualityRow,
  MlFoldMetric,
  MlLearningCurvePoint,
  MlMetricRow,
  MlPaginatedResponse,
  MlRetrainAllRequest,
  MlRetrainAllResult,
  MlRunPerformance,
  MlServedModel,
  MlflowTrackingResponse,
  MlTrainingRun,
  MlTrainingStreamEvent,
  MlTrainingTrade,
  MlTrainStartedResponse,
} from '../structures/ml-training';
import {
  CreatePolicyRequest,
  MlManualDecisionRequest,
  MlManualDecisionResponse,
  MlPolicy,
  MlPolicyRunTrend,
  UpdatePolicyRequest,
} from '../structures/ml-policy';
import { environment } from '../../environments/environment';
import { connectWebSocket } from '../core/websocket';

@Injectable({ providedIn: 'root' })
export class TraderAlgoApiService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = environment.traderAlgoApi.baseUrl;

  getCandles(request: CandleRequest = {}): Observable<CandleResponse[]> {
    return this.http.get<CandleResponse[]>(`${this.baseUrl}/api/charts/candles`, {
      params: this.toHttpParams(request),
    });
  }

  getCandlesWithIndicators(request: CandleRequest = {}): Observable<CandleWithIndicators[]> {
    return this.http
      .get<CandleWithIndicatorsDto[]>(`${this.baseUrl}/api/charts/candles/indicators`, {
        params: this.toHttpParams(request),
      })
      .pipe(map(dtos => dtos.map(toCandleWithIndicators)));
  }

  getCandlesWithIndicatorsByDateInterval(req: BacktestCandleRequest): Observable<CandleWithIndicators[]> {
    const params = new HttpParams()
      .set('from', req.from)
      .set('to', req.to)
      .set('symbol', req.symbol)
      .set('interval', req.interval);
    return this.http
      .get<CandleWithIndicatorsDto[]>(`${this.baseUrl}/api/charts/candles/indicators/date-interval`, { params })
      .pipe(map(dtos => dtos.map(toCandleWithIndicators)));
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
    const options =
      tradingAccountId === undefined
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

  // ── ML policies ──────────────────────────────────────────────────────────
  getPolicies(): Observable<MlPolicy[]> {
    return this.http.get<MlPolicy[]>(`${this.baseUrl}/api/ml/policies`);
  }

  getPolicy(id: number): Observable<MlPolicy> {
    return this.http.get<MlPolicy>(`${this.baseUrl}/api/ml/policies/${id}`);
  }

  createPolicy(payload: CreatePolicyRequest): Observable<MlPolicy> {
    return this.http.post<MlPolicy>(`${this.baseUrl}/api/ml/policies`, payload);
  }

  updatePolicy(id: number, payload: UpdatePolicyRequest): Observable<MlPolicy> {
    return this.http.put<MlPolicy>(`${this.baseUrl}/api/ml/policies/${id}`, payload);
  }

  deletePolicy(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/api/ml/policies/${id}`);
  }

  getPolicyRuns(id: number): Observable<MlPolicyRunTrend[]> {
    return this.http.get<MlPolicyRunTrend[]>(`${this.baseUrl}/api/ml/policies/${id}/runs`);
  }

  getPolicyPerformance(id: number): Observable<MlRunPerformance> {
    return this.http.get<MlRunPerformance>(`${this.baseUrl}/api/ml/policies/${id}/performance`);
  }

  decideLatestCandle(payload: MlManualDecisionRequest): Observable<MlManualDecisionResponse> {
    return this.http.post<MlManualDecisionResponse>(`${this.baseUrl}/api/ml/decide`, payload);
  }

  getTrainingRuns(mlPolicyId?: number): Observable<MlTrainingRun[]> {
    const options = mlPolicyId === undefined ? {} : { params: new HttpParams().set('mlPolicyId', String(mlPolicyId)) };
    return this.http.get<MlTrainingRun[]>(`${this.baseUrl}/api/ml/training-runs`, options);
  }

  getTrainingRun(id: number): Observable<MlTrainingRun> {
    return this.http.get<MlTrainingRun>(`${this.baseUrl}/api/ml/training-runs/${id}`);
  }

  getTrainingDecisions(id: number): Observable<MlDecisionLog> {
    return this.http.get<MlDecisionLog>(`${this.baseUrl}/api/ml/training-runs/${id}/decisions`);
  }

  getTrainingTracking(id: number): Observable<MlflowTrackingResponse> {
    return this.http.get<MlflowTrackingResponse>(`${this.baseUrl}/api/ml/training-runs/${id}/tracking`);
  }

  getTrainingPerformance(id: number): Observable<MlRunPerformance> {
    return this.http.get<MlRunPerformance>(`${this.baseUrl}/api/ml/training-runs/${id}/performance`);
  }

  getTrainingLearningCurve(id: number): Observable<MlLearningCurvePoint[]> {
    return this.http.get<MlLearningCurvePoint[]>(`${this.baseUrl}/api/ml/training-runs/${id}/learning-curve`);
  }

  getTrainingCheckpointEvals(id: number): Observable<MlCheckpointEval[]> {
    return this.http.get<MlCheckpointEval[]>(`${this.baseUrl}/api/ml/training-runs/${id}/checkpoint-evals`);
  }

  getTrainingFolds(id: number): Observable<MlFoldMetric[]> {
    return this.http.get<MlFoldMetric[]>(`${this.baseUrl}/api/ml/training-runs/${id}/folds`);
  }

  getTrainingMetrics(id: number, split?: string): Observable<MlMetricRow[] | Record<string, unknown>> {
    const options = split ? { params: new HttpParams().set('split', split) } : {};
    return this.http.get<MlMetricRow[] | Record<string, unknown>>(`${this.baseUrl}/api/ml/training-runs/${id}/metrics`, options);
  }

  getTrainingEquity(
    id: number,
    options: { split?: string; stitched?: boolean; limit?: number; offset?: number } = {},
  ): Observable<MlPaginatedResponse<MlEquityPoint> | MlEquityPoint[]> {
    return this.http.get<MlPaginatedResponse<MlEquityPoint> | MlEquityPoint[]>(
      `${this.baseUrl}/api/ml/training-runs/${id}/equity`,
      { params: this.toHttpParams(options) },
    );
  }

  getTrainingTrades(
    id: number,
    options: { split?: string; limit?: number; offset?: number } = {},
  ): Observable<MlPaginatedResponse<MlTrainingTrade> | MlTrainingTrade[]> {
    return this.http.get<MlPaginatedResponse<MlTrainingTrade> | MlTrainingTrade[]>(
      `${this.baseUrl}/api/ml/training-runs/${id}/trades`,
      { params: this.toHttpParams(options) },
    );
  }

  getTrainingFeatureQuality(id: number): Observable<MlFeatureQualityRow[]> {
    return this.http.get<MlFeatureQualityRow[]>(`${this.baseUrl}/api/ml/training-runs/${id}/feature-quality`);
  }

  getTrainingCharts(id: number): Observable<MlChartArtifact[]> {
    return this.http.get<MlChartArtifact[]>(`${this.baseUrl}/api/ml/training-runs/${id}/charts`);
  }

  getServedModels(): Observable<MlServedModel[]> {
    return this.http.get<MlServedModel[]>(`${this.baseUrl}/api/ml/served-models`);
  }

  createTraining(payload: CreateTrainingRequest): Observable<MlTrainStartedResponse> {
    return this.http.post<MlTrainStartedResponse>(`${this.baseUrl}/api/ml/train`, payload);
  }

  retrainAll(payload: MlRetrainAllRequest): Observable<MlRetrainAllResult[]> {
    return this.http.post<MlRetrainAllResult[]>(`${this.baseUrl}/api/ml/retrain-all`, payload);
  }

  deleteTraining(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/api/ml/training-runs/${id}`);
  }

  streamMlTraining(trainingRunId: number, delay = false): Observable<MlTrainingStreamEvent> {
    const url = `${environment.traderAlgoApi.wsUrl}/ws/ml/training?trainingRunId=${trainingRunId}&delay=${delay}`;
    return connectWebSocket<MlTrainingStreamEvent>(url, {
      reconnect: false,
      parse: raw => {
        if (typeof raw !== 'object' || raw === null) return [];
        const frame = raw as { type?: unknown; data?: unknown };
        if (frame.type === 'candle') {
          const candle = this.toStreamCandle(frame.data);
          return candle === null ? [] : [{ type: 'candle', data: candle }];
        }
        if (frame.type === 'mlDecision' && typeof frame.data === 'object' && frame.data !== null) {
          return [frame as MlTrainingStreamEvent];
        }
        return [];
      },
    });
  }

  private kronosGet(path: string, symbol: string, interval: string): Observable<CandleResponse[]> {
    const params = new HttpParams().set('symbol', symbol).set('interval', interval);
    return this.http.get<CandleResponse[]>(`${this.baseUrl}/api/kronos/${path}`, { params });
  }

  private toStreamCandle(data: unknown): CandleWithIndicators | null {
    if (typeof data !== 'object' || data === null) return null;
    const row = data as Record<string, unknown>;
    const time = this.numberField(row, 'time');
    const open = this.numberField(row, 'open');
    const high = this.numberField(row, 'high');
    const low = this.numberField(row, 'low');
    const close = this.numberField(row, 'close');
    const volume = this.numberField(row, 'volume');
    if (time === null || open === null || high === null || low === null || close === null || volume === null) return null;

    return toCandleWithIndicators({
      time,
      open,
      high,
      low,
      close,
      volume,
      taker_buy_base_asset_volume:
        this.numberField(row, 'taker_buy_base_asset_volume') ?? this.numberField(row, 'takerBuyVolume') ?? 0,
      taker_sell_base_asset_volume:
        this.numberField(row, 'taker_sell_base_asset_volume') ?? this.numberField(row, 'takerSellVolume') ?? 0,
      sma_20: this.numberField(row, 'sma_20') ?? this.numberField(row, 'sma20'),
      sma_100: this.numberField(row, 'sma_100') ?? this.numberField(row, 'sma100'),
      rsi: this.numberField(row, 'rsi'),
      rsi_smooth: this.numberField(row, 'rsi_smooth') ?? this.numberField(row, 'rsiSmooth'),
      rsi_divergence: this.numberField(row, 'rsi_divergence') ?? this.numberField(row, 'rsiDivergence'),
      macd_line: this.numberField(row, 'macd_line') ?? this.numberField(row, 'macdLine'),
      macd_signal_line: this.numberField(row, 'macd_signal_line') ?? this.numberField(row, 'macdSignalLine'),
      macd_histogram: this.numberField(row, 'macd_histogram') ?? this.numberField(row, 'macdHistogram'),
    });
  }

  private numberField(row: Record<string, unknown>, key: string): number | null {
    const value = row[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  /** Builds `HttpParams` from a plain object, skipping `null`/`undefined` values. */
  private toHttpParams(source: object): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(source)) {
      if (value !== undefined && value !== null) {
        params = params.set(key, String(value));
      }
    }
    return params;
  }
}
