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
    return this.http
      .get<MlRunPerformance[]>(`${this.baseUrl}/api/ml/policies/${id}/runs`)
      .pipe(map(rows => rows.map(row => this.normalizePolicyRunTrend(row))));
  }

  getPolicyPerformance(id: number): Observable<MlRunPerformance> {
    return this.http
      .get<MlRunPerformance>(`${this.baseUrl}/api/ml/policies/${id}/performance`)
      .pipe(map(row => this.normalizePerformance(row)));
  }

  decideLatestCandle(payload: MlManualDecisionRequest): Observable<MlManualDecisionResponse> {
    return this.http.post<MlManualDecisionResponse>(`${this.baseUrl}/api/ml/decide`, payload);
  }

  getTrainingRuns(mlPolicyId?: number): Observable<MlTrainingRun[]> {
    const options = mlPolicyId === undefined ? {} : { params: new HttpParams().set('mlPolicyId', String(mlPolicyId)) };
    return this.http
      .get<MlTrainingRun[]>(`${this.baseUrl}/api/ml/training-runs`, options)
      .pipe(map(runs => runs.map(run => this.normalizeTrainingRun(run))));
  }

  getTrainingRun(id: number): Observable<MlTrainingRun> {
    return this.http
      .get<MlTrainingRun>(`${this.baseUrl}/api/ml/training-runs/${id}`)
      .pipe(map(run => this.normalizeTrainingRun(run)));
  }

  getTrainingDecisions(id: number): Observable<MlDecisionLog> {
    return this.http
      .get<MlDecisionLog>(`${this.baseUrl}/api/ml/training-runs/${id}/decisions`)
      .pipe(map(value => this.normalizeDecisionLog(value)));
  }

  getTrainingTracking(id: number): Observable<MlflowTrackingResponse> {
    return this.http.get<MlflowTrackingResponse>(`${this.baseUrl}/api/ml/training-runs/${id}/tracking`);
  }

  getTrainingPerformance(id: number): Observable<MlRunPerformance> {
    return this.http
      .get<MlRunPerformance>(`${this.baseUrl}/api/ml/training-runs/${id}/performance`)
      .pipe(map(row => this.normalizePerformance(row)));
  }

  getTrainingLearningCurve(id: number): Observable<MlLearningCurvePoint[]> {
    return this.http
      .get<MlLearningCurvePoint[]>(`${this.baseUrl}/api/ml/training-runs/${id}/learning-curve`)
      .pipe(map(rows => rows.map(row => this.normalizeLearningCurvePoint(row))));
  }

  getTrainingCheckpointEvals(id: number): Observable<MlCheckpointEval[]> {
    return this.http
      .get<MlCheckpointEval[]>(`${this.baseUrl}/api/ml/training-runs/${id}/checkpoint-evals`)
      .pipe(map(rows => rows.map(row => this.normalizeCheckpointEval(row))));
  }

  getTrainingFolds(id: number): Observable<MlFoldMetric[]> {
    return this.http
      .get<MlFoldMetric[]>(`${this.baseUrl}/api/ml/training-runs/${id}/folds`)
      .pipe(map(rows => rows.map(row => this.normalizeFoldMetric(row))));
  }

  getTrainingMetrics(id: number, split?: string): Observable<MlMetricRow[] | Record<string, unknown>> {
    const options = split ? { params: new HttpParams().set('split', split) } : {};
    return this.http.get<MlMetricRow[] | Record<string, unknown>>(`${this.baseUrl}/api/ml/training-runs/${id}/metrics`, options);
  }

  getTrainingEquity(
    id: number,
    options: { split?: string; stitched?: boolean; limit?: number; offset?: number } = {},
  ): Observable<MlPaginatedResponse<MlEquityPoint> | MlEquityPoint[]> {
    return this.http
      .get<MlPaginatedResponse<MlEquityPoint> | MlEquityPoint[]>(`${this.baseUrl}/api/ml/training-runs/${id}/equity`, {
        params: this.toHttpParams(options),
      })
      .pipe(map(value => this.normalizeEquityResponse(value)));
  }

  getTrainingTrades(
    id: number,
    options: { split?: string; limit?: number; offset?: number } = {},
  ): Observable<MlPaginatedResponse<MlTrainingTrade> | MlTrainingTrade[]> {
    return this.http
      .get<MlPaginatedResponse<MlTrainingTrade> | MlTrainingTrade[]>(`${this.baseUrl}/api/ml/training-runs/${id}/trades`, {
        params: this.toHttpParams(options),
      })
      .pipe(map(value => this.normalizeTradeResponse(value)));
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

  private normalizeTrainingRun(run: MlTrainingRun): MlTrainingRun {
    return {
      ...run,
      inSampleFinalBalance: run.inSampleFinalBalance ?? run.finalBalance ?? null,
      inSamplePnlPct: run.inSamplePnlPct ?? run.pnlPct ?? null,
      oosFinalBalance: run.oosFinalBalance ?? run.finalBalanceOos ?? null,
      oosPnlPct: run.oosPnlPct ?? run.pnlPctOos ?? null,
      oosMaxDrawdownPct: run.oosMaxDrawdownPct ?? run.oosMaxDdPct ?? null,
      observationDim: run.observationDim ?? run.obsDim ?? null,
    };
  }

  private normalizePerformance(row: MlRunPerformance): MlRunPerformance {
    const oosMaxDrawdownPct = row.oosMaxDrawdownPct ?? row.oosMaxDdPct ?? null;
    const metrics = { ...(row.metrics ?? {}) };
    this.setMetricAlias(metrics, 'in_sample_pnl_pct', row.inSamplePnlPct);
    this.setMetricAlias(metrics, 'inSamplePnlPct', row.inSamplePnlPct);
    this.setMetricAlias(metrics, 'oos_pnl_pct', row.oosPnlPct);
    this.setMetricAlias(metrics, 'oosPnlPct', row.oosPnlPct);
    this.setMetricAlias(metrics, 'oos_sharpe', row.oosSharpe);
    this.setMetricAlias(metrics, 'oosSharpe', row.oosSharpe);
    this.setMetricAlias(metrics, 'oos_profit_factor', row.oosProfitFactor);
    this.setMetricAlias(metrics, 'oosProfitFactor', row.oosProfitFactor);
    this.setMetricAlias(metrics, 'oos_max_drawdown_pct', oosMaxDrawdownPct);
    this.setMetricAlias(metrics, 'oosMaxDrawdownPct', oosMaxDrawdownPct);
    this.setMetricAlias(metrics, 'oosMaxDdPct', row.oosMaxDdPct);

    return {
      ...row,
      promotionGatePassed: row.promotionGatePassed ?? row.gatePassed ?? null,
      oosMaxDrawdownPct,
      metrics,
    };
  }

  private normalizePolicyRunTrend(row: MlRunPerformance): MlPolicyRunTrend {
    const normalized = this.normalizePerformance(row);
    const rawRunId = normalized['runId'];
    const trainingRunId = typeof rawRunId === 'number' ? rawRunId : Number(rawRunId);
    const createdAt = typeof normalized['createdAt'] === 'string' ? Date.parse(normalized['createdAt']) : null;
    const timestamp = createdAt !== null && Number.isFinite(createdAt) ? createdAt : null;

    return {
      id: Number.isFinite(trainingRunId) ? trainingRunId : 0,
      trainingRunId: Number.isFinite(trainingRunId) ? trainingRunId : null,
      status: typeof normalized['status'] === 'string' ? normalized['status'] : null,
      startedAt: timestamp,
      completedAt: timestamp,
      inSamplePnlPct: normalized.inSamplePnlPct ?? null,
      oosPnlPct: normalized.oosPnlPct ?? null,
      oosMaxDrawdownPct: normalized.oosMaxDrawdownPct ?? null,
      oosSharpe: normalized.oosSharpe ?? null,
      oosProfitFactor: normalized.oosProfitFactor ?? null,
    };
  }

  private normalizeLearningCurvePoint(row: MlLearningCurvePoint): MlLearningCurvePoint {
    return {
      ...row,
      step: row.step ?? row.timesteps ?? row.timestep ?? null,
      timestep: row.timestep ?? row.timesteps ?? row.step ?? null,
      meanEpisodeReward: row.meanEpisodeReward ?? row.meanEpReward ?? row.rewardMean ?? null,
      rewardMean: row.rewardMean ?? row.meanEpReward ?? row.meanEpisodeReward ?? null,
      rewardStd: row.rewardStd ?? row.stdEpReward ?? null,
      meanEpisodeLength: row.meanEpisodeLength ?? row.meanEpLength ?? row.episodeLengthMean ?? null,
      episodeLengthMean: row.episodeLengthMean ?? row.meanEpLength ?? row.meanEpisodeLength ?? null,
    };
  }

  private normalizeCheckpointEval(row: MlCheckpointEval): MlCheckpointEval {
    return {
      ...row,
      step: row.step ?? row.timesteps ?? row.timestep ?? null,
      timestep: row.timestep ?? row.timesteps ?? row.step ?? null,
      trainReward: row.trainReward ?? row.trainEvalR ?? null,
      validationReward: row.validationReward ?? row.valR ?? null,
      trainDrawdown: row.trainDrawdown ?? row.trainDdPct ?? null,
      validationDrawdown: row.validationDrawdown ?? row.valDdPct ?? null,
    };
  }

  private normalizeFoldMetric(row: MlFoldMetric): MlFoldMetric {
    return {
      ...row,
      maxDrawdownPct: row.maxDrawdownPct ?? row.maxDdPct ?? null,
      tradeCount: row.tradeCount ?? row.nTrades ?? null,
    };
  }

  private normalizeEquityResponse(
    value: MlPaginatedResponse<MlEquityPoint> | MlEquityPoint[],
  ): MlPaginatedResponse<MlEquityPoint> | MlEquityPoint[] {
    if (Array.isArray(value)) return value.map(point => this.normalizeEquityPoint(point));
    return {
      ...value,
      points: value.points?.map(point => this.normalizeEquityPoint(point)),
      items: value.items?.map(point => this.normalizeEquityPoint(point)),
      data: value.data?.map(point => this.normalizeEquityPoint(point)),
      rows: value.rows?.map(point => this.normalizeEquityPoint(point)),
    };
  }

  private normalizeEquityPoint(point: MlEquityPoint): MlEquityPoint {
    return {
      ...point,
      time: point.time ?? point.ts ?? point.timestamp ?? null,
      timestamp: point.timestamp ?? point.ts ?? point.time ?? null,
    };
  }

  private normalizeDecisionLog(value: MlDecisionLog): MlDecisionLog {
    return {
      ...value,
      decisions: value.decisions?.map(decision => ({
        ...decision,
        open_time: this.normalizeEpochSeconds(decision.open_time),
      })) ?? [],
      trades: value.trades?.map(trade => this.normalizeTrainingTrade(trade)) ?? [],
    };
  }

  private normalizeTradeResponse(
    value: MlPaginatedResponse<MlTrainingTrade> | MlTrainingTrade[],
  ): MlPaginatedResponse<MlTrainingTrade> | MlTrainingTrade[] {
    if (Array.isArray(value)) return value.map(trade => this.normalizeTrainingTrade(trade));
    return {
      ...value,
      trades: value.trades?.map(trade => this.normalizeTrainingTrade(trade)),
      items: value.items?.map(trade => this.normalizeTrainingTrade(trade)),
      data: value.data?.map(trade => this.normalizeTrainingTrade(trade)),
      rows: value.rows?.map(trade => this.normalizeTrainingTrade(trade)),
    };
  }

  private normalizeTrainingTrade(trade: MlTrainingTrade): MlTrainingTrade {
    const direction = trade.side ?? trade.direction ?? '';
    return {
      ...trade,
      side: direction,
      direction,
      entry_step: trade.entry_step ?? trade.entryStep ?? null,
      entry_time: this.normalizeEpochSeconds(trade.entry_time ?? trade.entryTime),
      entry_price: trade.entry_price ?? trade.entryPrice ?? null,
      exit_step: trade.exit_step ?? trade.exitStep ?? null,
      exit_time: this.normalizeEpochSeconds(trade.exit_time ?? trade.exitTime),
      exit_price: trade.exit_price ?? trade.exitPrice ?? null,
      reason: trade.reason ?? trade.exitReason ?? '',
      rMultiple: trade.rMultiple ?? trade.rMult ?? null,
    };
  }

  private normalizeEpochSeconds(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined || value === '') return null;

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return null;
      return value > 9_999_999_999 ? Math.floor(value / 1000) : value;
    }

    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric > 9_999_999_999 ? Math.floor(numeric / 1000) : numeric;
    }

    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
  }

  private setMetricAlias(metrics: Record<string, number | null>, key: string, value: number | null | undefined): void {
    if (metrics[key] === undefined && value !== undefined) metrics[key] = value;
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
      rsi_divergence: this.booleanField(row, 'rsi_divergence') ?? this.booleanField(row, 'rsiDivergence'),
      macd_line: this.numberField(row, 'macd_line') ?? this.numberField(row, 'macdLine'),
      macd_signal_line: this.numberField(row, 'macd_signal_line') ?? this.numberField(row, 'macdSignalLine'),
      macd_histogram: this.numberField(row, 'macd_histogram') ?? this.numberField(row, 'macdHistogram'),
      atr_period: this.numberField(row, 'atr_period') ?? this.numberField(row, 'atrPeriod'),
      atr_true_range: this.numberField(row, 'atr_true_range') ?? this.numberField(row, 'atrTrueRange'),
      atr: this.numberField(row, 'atr'),
    });
  }

  private booleanField(row: Record<string, unknown>, key: string): boolean | null {
    const value = row[key];
    return typeof value === 'boolean' ? value : null;
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
