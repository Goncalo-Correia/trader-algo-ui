import { DecimalPipe, JsonPipe, KeyValuePipe, LowerCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, Subscription, switchMap, takeUntil, timer } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import type * as Highcharts from 'highcharts/highstock';
import { MlChartComponent } from '../../components/ml-chart/ml-chart.component';
import { HighchartsChartComponent } from '../../components/highcharts-chart/highcharts-chart.component';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { CandleWithIndicators } from '../../structures/candle';
import {
  MlChartArtifact,
  MlCheckpointEval,
  MlDecision,
  MlDecisionLog,
  MlEquityPoint,
  MlFeatureQualityRow,
  MlFoldMetric,
  MlLearningCurvePoint,
  MlMetricRow,
  MlPaginatedResponse,
  MlRunPerformance,
  MlServedModel,
  MlStreamDecision,
  MlTrainingRun,
  MlTrainingTrade,
  MlflowMetricPoint,
  MlflowRewardMetric,
  MlflowTrackingResponse,
  MlflowTrackingSummary,
} from '../../structures/ml-training';
import { Trade } from '../../structures/trade';

type DetailTab = 'replay' | 'performance' | 'decisions' | 'trades' | 'tracking' | 'raw';
type TradeSplitFilter = 'all' | 'in_sample' | 'out_of_sample';

interface RewardMetricView {
  id: string;
  key: string;
  label: string;
  description: string;
  latestValue: number | null;
  history: MlflowMetricPoint[];
}

interface RewardMetricSection {
  key: string;
  title: string;
  metrics: RewardMetricView[];
  chartOptions: Highcharts.Options;
}

function chartBase(): Highcharts.Options {
  return {
    chart: { backgroundColor: '#141414', animation: false, style: { fontFamily: 'inherit' } },
    title: { text: '' },
    credits: { enabled: false },
    legend: { enabled: true, itemStyle: { color: '#d1d4dc', fontSize: '11px' }, itemHoverStyle: { color: '#fff' } },
    xAxis: {
      type: 'datetime',
      gridLineColor: '#1e2130',
      lineColor: '#2a2d3a',
      tickColor: '#2a2d3a',
      labels: { style: { color: '#787b86', fontSize: '11px' } },
    },
    yAxis: {
      gridLineColor: '#1e2130',
      lineColor: '#2a2d3a',
      labels: { style: { color: '#787b86', fontSize: '11px' } },
      title: { text: '' },
    },
    tooltip: {
      shared: true,
      backgroundColor: '#1e2130',
      borderColor: '#2a2d3a',
      style: { color: '#d1d4dc', fontSize: '12px' },
    },
  };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ml-training-detail',
  templateUrl: './ml-training-detail.component.html',
  styleUrls: ['./ml-training-detail.component.css'],
  imports: [RouterLink, MlChartComponent, HighchartsChartComponent, LowerCasePipe, DecimalPipe, JsonPipe, KeyValuePipe],
})
export class MlTrainingDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(TraderAlgoApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  run: MlTrainingRun | null = null;
  performance: MlRunPerformance | null = null;
  tracking: MlflowTrackingResponse | null = null;
  decisions: MlDecisionLog | null = null;
  learningCurve: MlLearningCurvePoint[] = [];
  checkpointEvals: MlCheckpointEval[] = [];
  folds: MlFoldMetric[] = [];
  metrics: MlMetricRow[] | Record<string, unknown> | null = null;
  equity: MlEquityPoint[] = [];
  telemetryTrades: MlTrainingTrade[] = [];
  featureQuality: MlFeatureQualityRow[] = [];
  chartArtifacts: MlChartArtifact[] = [];
  servedModels: MlServedModel[] = [];

  candles: CandleWithIndicators[] = [];
  chartTrades: Trade[] = [];

  isLoading = true;
  deleting = false;
  lastRefresh: Date | null = null;
  activeTab: DetailTab = 'replay';
  tradeSplitFilter: TradeSplitFilter = 'all';
  endpointErrors: Record<string, string | null> = {};

  playbackTime: number | null = null;
  replayIndex = 0;
  replaySpeed = 1;
  isPlaying = false;
  streamActive = false;

  summaryChartOptions: Highcharts.Options = {};
  equityChartOptions: Highcharts.Options = {};
  learningCurveOptions: Highcharts.Options = {};
  checkpointOptions: Highcharts.Options = {};
  foldOptions: Highcharts.Options = {};
  tradePnlOptions: Highcharts.Options = {};
  tradeExitOptions: Highcharts.Options = {};
  featureQualityOptions: Highcharts.Options = {};
  metricHistoryOptions: Highcharts.Options = {};
  rewardMetricSections: RewardMetricSection[] = [];

  readonly tabs: { key: DetailTab; label: string }[] = [
    { key: 'replay', label: 'Replay' },
    { key: 'performance', label: 'Performance' },
    { key: 'decisions', label: 'Decisions' },
    { key: 'trades', label: 'Trades' },
    { key: 'tracking', label: 'Tracking' },
    { key: 'raw', label: 'Raw Data' },
  ];

  readonly trackByIndex = (index: number): number => index;
  readonly trackByDecision = (_: number, decision: MlDecision): number => decision.candle_index;

  private runId!: number;
  private readonly stopPolling$ = new Subject<void>();
  private playbackTimer: number | null = null;
  private streamSubscription?: Subscription;

  ngOnInit(): void {
    this.runId = Number(this.route.snapshot.paramMap.get('id'));
    timer(0, 5000)
      .pipe(
        switchMap(() => this.api.getTrainingRun(this.runId)),
        takeUntil(this.stopPolling$),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: run => {
          this.run = run;
          this.isLoading = false;
          this.lastRefresh = new Date();
          this.loadTelemetry(run);
          if (run.status === 'Completed' || run.status === 'Failed') this.stopPolling();
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoading = false;
          this.stopPolling();
          this.cdr.markForCheck();
        },
      });
  }

  ngOnDestroy(): void {
    this.stopPlayback();
    this.streamSubscription?.unsubscribe();
  }

  get isInFlight(): boolean {
    return this.run?.status === 'Pending' || this.run?.status === 'Running';
  }

  get servedModel(): MlServedModel | null {
    if (!this.run) return null;
    return (
      this.servedModels.find(
        model => model.served !== false && (model.servedTrainingRunId ?? model.trainingRunId) === this.run?.id,
      ) ?? null
    );
  }

  get policyServedRunId(): number | null {
    if (!this.run) return null;
    const model = this.servedModels.find(
      row => row.served !== false && (row.mlPolicyId ?? row.policyId) === this.run?.mlPolicyId,
    );
    return model?.servedTrainingRunId ?? model?.trainingRunId ?? null;
  }

  get isServed(): boolean {
    return this.servedModel !== null;
  }

  get trackingSummary(): MlflowTrackingResponse | MlflowTrackingSummary | null {
    return this.tracking ?? this.run?.tracking ?? null;
  }

  get trackingAvailable(): boolean {
    return this.trackingSummary?.trackingAvailable ?? false;
  }

  get mlflowRunUuid(): string | null {
    return this.trackingSummary?.mlflowRunUuid ?? this.run?.runId ?? null;
  }

  get oosPnlPct(): number | null {
    return this.run?.oosPnlPct ?? this.metric('oos_pnl_pct', 'oosPnlPct', 'oos_return_pct');
  }

  get oosFinalBalance(): number | null {
    return this.run?.oosFinalBalance ?? this.metric('oos_final_balance', 'oosFinalBalance');
  }

  get inSamplePnlPct(): number | null {
    return this.run?.inSamplePnlPct ?? this.run?.pnlPct ?? this.metric('in_sample_pnl_pct', 'train_pnl_pct');
  }

  get inSampleFinalBalance(): number | null {
    return (
      this.run?.inSampleFinalBalance ??
      this.run?.finalBalance ??
      this.metric('in_sample_final_balance', 'train_final_balance')
    );
  }

  get oosSharpe(): number | null {
    return this.run?.oosSharpe ?? this.metric('oos_sharpe', 'oosSharpe');
  }

  get oosProfitFactor(): number | null {
    return this.run?.oosProfitFactor ?? this.metric('oos_profit_factor', 'oosProfitFactor');
  }

  get oosMaxDrawdownPct(): number | null {
    return this.run?.oosMaxDrawdownPct ?? this.metric('oos_max_drawdown_pct', 'oosMaxDrawdownPct');
  }

  get tradeCount(): number | null {
    return (
      this.run?.oosTradeCount ??
      this.run?.tradeCount ??
      this.run?.tracking?.nTrades ??
      this.run?.nTrades ??
      this.decisions?.n_trades ??
      null
    );
  }

  get foldCount(): number | null {
    return this.folds.length > 0 ? this.folds.length : (this.performance?.nFolds ?? null);
  }

  get promotionGatePassed(): boolean | null {
    return this.performance?.promotionGatePassed ?? this.performance?.gatePassed ?? null;
  }

  get allTrades(): MlTrainingTrade[] {
    return this.telemetryTrades.length ? this.telemetryTrades : (this.decisions?.trades ?? []);
  }

  get filteredTrades(): MlTrainingTrade[] {
    return this.allTrades.filter(trade => this.matchesTradeSplit(trade, this.tradeSplitFilter));
  }

  get chartDecisions(): MlDecision[] {
    return this.decisions?.decisions ?? [];
  }

  loadTelemetry(run: MlTrainingRun): void {
    this.loadServedModels();
    this.loadOptional('performance', this.api.getTrainingPerformance(run.id), value => {
      this.performance = value;
      this.buildSummaryChart();
    });
    this.loadOptional('tracking', this.api.getTrainingTracking(run.id), value => {
      this.tracking = value;
      this.buildTrackingCharts();
    });
    this.loadOptional('decisions', this.api.getTrainingDecisions(run.id), value => {
      this.decisions = value;
      this.refreshChartTrades();
      this.buildSummaryChart();
      this.buildTradeCharts();
    });
    this.loadOptional('learningCurve', this.api.getTrainingLearningCurve(run.id), value => {
      this.learningCurve = value;
      this.buildLearningCurveChart();
    });
    this.loadOptional('checkpointEvals', this.api.getTrainingCheckpointEvals(run.id), value => {
      this.checkpointEvals = value;
      this.buildCheckpointChart();
    });
    this.loadOptional('folds', this.api.getTrainingFolds(run.id), value => {
      this.folds = value;
      this.buildFoldChart();
    });
    this.loadOptional('metrics', this.api.getTrainingMetrics(run.id), value => {
      this.metrics = value;
    });
    this.loadOptional(
      'equity',
      this.api.getTrainingEquity(run.id, { split: 'oos', stitched: true, limit: 5000, offset: 0 }),
      value => {
        this.equity = this.pageItems(value);
        this.buildEquityChart();
      },
    );
    this.loadOptional('trades', this.api.getTrainingTrades(run.id, { limit: 5000, offset: 0 }), value => {
      this.telemetryTrades = this.pageItems(value);
      this.refreshChartTrades();
      this.buildTradeCharts();
    });
    this.loadOptional('featureQuality', this.api.getTrainingFeatureQuality(run.id), value => {
      this.featureQuality = value;
      this.buildFeatureQualityChart();
    });
    this.loadOptional('charts', this.api.getTrainingCharts(run.id), value => {
      this.chartArtifacts = value;
    });
    if (run.status === 'Completed' || run.status === 'Failed') this.loadCandles(run);
  }

  refresh(): void {
    if (!this.run) return;
    this.loadTelemetry(this.run);
  }

  deleteRun(): void {
    if (this.deleting || !this.run || !confirm('Delete this training run?')) return;
    this.deleting = true;
    this.api.deleteTraining(this.runId).subscribe({
      next: () => this.router.navigate(['/ml/training-runs']),
      error: () => {
        this.deleting = false;
        this.cdr.markForCheck();
      },
    });
  }

  startStreamReplay(): void {
    this.streamSubscription?.unsubscribe();
    this.candles = [];
    this.streamActive = true;
    this.streamSubscription = this.api.streamMlTraining(this.runId, false).subscribe({
      next: event => {
        if (event.type === 'candle') this.candles = [...this.candles, event.data];
        if (event.type === 'mlDecision') this.appendStreamDecision(event.data);
        this.cdr.markForCheck();
      },
      error: () => {
        this.streamActive = false;
        this.endpointErrors['stream'] = 'Training replay stream is not available.';
        this.cdr.markForCheck();
      },
      complete: () => {
        this.streamActive = false;
        this.cdr.markForCheck();
      },
    });
  }

  togglePlayback(): void {
    if (this.isPlaying) {
      this.stopPlayback();
    } else {
      this.isPlaying = true;
      this.playbackTimer = window.setInterval(() => this.stepForward(), Math.max(80, 700 / this.replaySpeed));
    }
  }

  restartReplay(): void {
    this.replayIndex = 0;
    this.playbackTime = this.candles[0]?.time ?? null;
    this.cdr.markForCheck();
  }

  stepForward(): void {
    if (this.candles.length === 0) return;
    this.replayIndex = Math.min(this.candles.length - 1, this.replayIndex + 1);
    this.playbackTime = this.candles[this.replayIndex]?.time ?? null;
    if (this.replayIndex >= this.candles.length - 1) this.stopPlayback();
    this.cdr.markForCheck();
  }

  stepBack(): void {
    if (this.candles.length === 0) return;
    this.replayIndex = Math.max(0, this.replayIndex - 1);
    this.playbackTime = this.candles[this.replayIndex]?.time ?? null;
  }

  jumpNextTrade(): void {
    const current = this.playbackTime ?? 0;
    const next = this.filteredTrades
      .map(trade => trade.entry_time)
      .filter((time): time is number => time !== null && time !== undefined && time > current)
      .sort((a, b) => a - b)[0];
    if (next !== undefined) this.jumpToTime(next);
  }

  jumpNextDecision(): void {
    const next = (this.decisions?.decisions ?? [])
      .filter(decision => !decision.action_name.toLowerCase().includes('hold'))
      .map(decision => this.decisionCandleIndex(decision))
      .filter((index): index is number => index !== null && index > this.replayIndex)
      .sort((a, b) => a - b)[0];
    if (next !== undefined) this.jumpToIndex(next);
  }

  jumpToDecision(decision: MlDecision): void {
    const index = this.decisionCandleIndex(decision);
    if (index !== null) this.jumpToIndex(index);
  }

  setReplaySpeed(value: string): void {
    this.replaySpeed = Number(value);
    if (this.isPlaying) {
      this.stopPlayback();
      this.togglePlayback();
    }
  }

  statusClass(status: string): string {
    return `status-${status.toLowerCase()}`;
  }

  pnlClass(value: number | null): string {
    if (value === null) return 'td-dim';
    return value >= 0 ? 'positive' : 'negative';
  }

  formatDate(unixSeconds: number): string {
    return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  }

  formatTs(value: number | string | null | undefined): string {
    if (value === null || value === undefined) return '-';
    const raw = typeof value === 'string' ? new Date(value).getTime() : value > 9_999_999_999 ? value : value * 1000;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '-';
    return `${d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  }

  formatDuration(run: MlTrainingRun): string {
    if (run.completedAt === null) return '-';
    const seconds = Math.max(0, run.completedAt - run.startedAt);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
  }

  formatMetricValue(value: number | null | undefined, suffix = ''): string {
    if (value === null || value === undefined) return 'Unavailable';
    return `${value.toLocaleString(undefined, { maximumFractionDigits: 3 })}${suffix}`;
  }

  metricValue(metric: RewardMetricView): string {
    if (metric.latestValue === null || metric.latestValue === undefined) return '-';
    const value = metric.key.toLowerCase().includes('pct') ? metric.latestValue : metric.latestValue;
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }

  tradeSide(trade: MlTrainingTrade): string {
    return trade.side || trade.direction || '-';
  }

  tradeReason(trade: MlTrainingTrade): string {
    return trade.exitReason || trade.reason || '-';
  }

  setTradeSplitFilter(filter: TradeSplitFilter): void {
    this.tradeSplitFilter = filter;
    this.refreshChartTrades();
    this.buildTradeCharts();
    this.cdr.markForCheck();
  }

  tradeSplitCount(filter: TradeSplitFilter): number {
    return this.allTrades.filter(trade => this.matchesTradeSplit(trade, filter)).length;
  }

  tradeSplitLabel(trade: MlTrainingTrade): string {
    const split = this.normalizeSplit(trade.split);
    if (split === 'out_of_sample') return 'OOS';
    if (split === 'in_sample') return 'In Sample';
    return trade.split ?? '-';
  }

  private loadServedModels(): void {
    this.api
      .getServedModels()
      .pipe(
        catchError(() => of([] as MlServedModel[])),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(models => {
        this.servedModels = models;
        this.cdr.markForCheck();
      });
  }

  private loadOptional<T>(key: string, source: import('rxjs').Observable<T>, apply: (value: T) => void): void {
    this.endpointErrors[key] = null;
    source.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: value => {
        apply(value);
        this.cdr.markForCheck();
      },
      error: () => {
        this.endpointErrors[key] = this.emptyMessage(key);
        this.cdr.markForCheck();
      },
    });
  }

  private loadCandles(run: MlTrainingRun): void {
    this.api
      .getCandlesWithIndicatorsByDateInterval({
        symbol: run.symbolCode,
        interval: run.intervalCode,
        from: new Date(run.from * 1000).toISOString(),
        to: new Date(run.to * 1000).toISOString(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: candles => {
          this.candles = candles;
          // Trade markers can fall back to step-indexed candles, so rebuild them once candles arrive.
          this.refreshChartTrades();
          this.restartReplay();
          this.cdr.markForCheck();
        },
        error: () => {
          this.endpointErrors['candles'] = 'Candles with indicators are not available for this run.';
          this.cdr.markForCheck();
        },
      });
  }

  private stopPolling(): void {
    this.stopPolling$.next();
  }

  private stopPlayback(): void {
    this.isPlaying = false;
    if (this.playbackTimer !== null) {
      window.clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }
  }

  private jumpToTime(time: number): void {
    this.playbackTime = time;
    const index = this.candles.findIndex(candle => this.toSeconds(candle.time) >= time);
    if (index >= 0) this.replayIndex = index;
    this.cdr.markForCheck();
  }

  private jumpToIndex(index: number): void {
    this.replayIndex = index;
    this.playbackTime = this.candles[index]?.time ?? null;
    this.cdr.markForCheck();
  }

  /** Resolve a decision to its candle index, mirroring the chart's candle_index-with-epoch-fallback anchoring. */
  private decisionCandleIndex(decision: MlDecision): number | null {
    if (decision.candle_index != null && decision.candle_index >= 0 && decision.candle_index < this.candles.length) {
      return decision.candle_index;
    }
    if (decision.open_time != null) {
      const index = this.candles.findIndex(candle => this.toSeconds(candle.time) >= decision.open_time!);
      if (index >= 0) return index;
    }
    return null;
  }

  private metric(...keys: string[]): number | null {
    const latest = this.tracking?.latestMetrics ?? {};
    const perfMetrics = this.performance?.metrics ?? {};
    for (const key of keys) {
      const latestValue = latest[key];
      if (typeof latestValue === 'number') return latestValue;
      const perfValue = perfMetrics[key];
      if (typeof perfValue === 'number') return perfValue;
    }
    return null;
  }

  private buildSummaryChart(): void {
    const decisions = this.decisions?.decisions ?? [];
    this.summaryChartOptions = {
      ...chartBase(),
      series: [
        {
          type: 'line',
          name: 'Balance',
          data: decisions.filter(d => d.open_time != null).map(d => [d.open_time! * 1000, d.balance]),
          color: '#5b9bd5',
          marker: { enabled: false },
        },
        {
          type: 'line',
          name: 'Position',
          data: decisions.filter(d => d.open_time != null).map(d => [d.open_time! * 1000, d.position]),
          color: '#f59e0b',
          marker: { enabled: false },
        },
      ],
    };
  }

  private buildEquityChart(): void {
    const equityData = this.equity.map(point => [this.pointTime(point), point.equity ?? point.balance ?? null]);
    const drawdownData = this.equity.map(point => [this.pointTime(point), point.drawdownPct ?? point.drawdown ?? null]);
    this.equityChartOptions = {
      ...chartBase(),
      yAxis: [
        { title: { text: '' }, labels: { style: { color: '#787b86' } }, gridLineColor: '#1e2130' },
        { title: { text: '' }, labels: { style: { color: '#787b86' } }, opposite: true, gridLineColor: 'transparent' },
      ],
      series: [
        { type: 'line', name: 'Equity', data: equityData, color: '#26a69a', marker: { enabled: false } },
        { type: 'area', name: 'Drawdown', data: drawdownData, color: '#ef5350', yAxis: 1, marker: { enabled: false } },
      ],
    };
  }

  private buildLearningCurveChart(): void {
    this.learningCurveOptions = {
      ...chartBase(),
      xAxis: { ...chartBase().xAxis, type: 'linear' },
      series: [
        {
          type: 'line',
          name: 'Mean Reward',
          data: this.learningCurve.map(point => [
            point.step ?? point.timestep ?? 0,
            point.meanEpisodeReward ?? point.rewardMean ?? null,
          ]),
          color: '#5b9bd5',
          marker: { enabled: false },
        },
        {
          type: 'line',
          name: 'Mean Length',
          data: this.learningCurve.map(point => [
            point.step ?? point.timestep ?? 0,
            point.meanEpisodeLength ?? point.episodeLengthMean ?? null,
          ]),
          color: '#f59e0b',
          marker: { enabled: false },
        },
      ],
    };
  }

  private buildCheckpointChart(): void {
    this.checkpointOptions = {
      ...chartBase(),
      xAxis: { ...chartBase().xAxis, type: 'linear' },
      series: [
        {
          type: 'line',
          name: 'Train Reward',
          data: this.checkpointEvals.map(p => [p.step ?? p.timestep ?? 0, p.trainReward ?? null]),
          color: '#5b9bd5',
          marker: { enabled: false },
        },
        {
          type: 'line',
          name: 'Validation Reward',
          data: this.checkpointEvals.map(p => [p.step ?? p.timestep ?? 0, p.validationReward ?? null]),
          color: '#26a69a',
          marker: { enabled: false },
        },
        {
          type: 'line',
          name: 'Score',
          data: this.checkpointEvals.map(p => [p.step ?? p.timestep ?? 0, p.score ?? null]),
          color: '#f59e0b',
          marker: { enabled: true },
        },
      ],
    };
  }

  private buildFoldChart(): void {
    this.foldOptions = {
      ...chartBase(),
      xAxis: {
        categories: this.folds.map((fold, index) => String(fold.fold ?? index + 1)),
        labels: { style: { color: '#787b86' } },
      },
      series: [
        { type: 'column', name: 'Return %', data: this.folds.map(f => f.returnPct ?? null), color: '#26a69a' },
        { type: 'column', name: 'Sharpe', data: this.folds.map(f => f.sharpe ?? null), color: '#5b9bd5' },
        { type: 'column', name: 'Profit Factor', data: this.folds.map(f => f.profitFactor ?? null), color: '#f59e0b' },
        { type: 'column', name: 'Max DD %', data: this.folds.map(f => f.maxDrawdownPct ?? null), color: '#ef5350' },
      ],
    };
  }

  private buildTradeCharts(): void {
    const trades = this.filteredTrades;
    this.tradePnlOptions = {
      ...chartBase(),
      xAxis: { categories: trades.map((_, index) => String(index + 1)), labels: { style: { color: '#787b86' } } },
      series: [{ type: 'column', name: 'PnL', data: trades.map(trade => trade.pnl ?? null), color: '#5b9bd5' }],
    };
    const reasonCounts = new Map<string, number>();
    for (const trade of trades) {
      const reason = trade.exitReason ?? trade.reason ?? 'Unknown';
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
    this.tradeExitOptions = {
      ...chartBase(),
      series: [
        { type: 'pie', name: 'Exit Reason', data: [...reasonCounts.entries()].map(([name, y]) => ({ name, y })) },
      ],
    };
  }

  private refreshChartTrades(): void {
    const symbol = this.decisions?.symbol ?? this.run?.symbolCode ?? '';
    const interval = this.decisions?.interval ?? this.run?.intervalCode ?? '';
    this.chartTrades = this.toChartTrades(this.filteredTrades, symbol, interval);
  }

  private buildFeatureQualityChart(): void {
    this.featureQualityOptions = {
      ...chartBase(),
      xAxis: {
        title: { text: 'Spearman R 1 Bar', style: { color: '#787b86' } },
        labels: { style: { color: '#787b86' } },
      },
      yAxis: {
        title: { text: 'Spearman P 1 Bar', style: { color: '#787b86' } },
        labels: { style: { color: '#787b86' } },
        gridLineColor: '#1e2130',
      },
      series: [
        {
          type: 'scatter',
          name: 'Features',
          data: this.featureQuality.map(row => ({
            x: row.spearmanR1Bar ?? null,
            y: row.spearmanP1Bar ?? null,
            name: row.feature ?? row.name ?? 'feature',
            color: row.signalP05 ? '#26a69a' : '#787b86',
          })),
        } as Highcharts.SeriesScatterOptions,
      ],
    };
  }

  private buildTrackingCharts(): void {
    const history = this.tracking?.metricHistory ?? {};
    const keys = Object.keys(history).filter(key => history[key].length > 1);
    this.metricHistoryOptions = {
      ...chartBase(),
      xAxis: { ...chartBase().xAxis, type: 'linear' },
      series: keys.slice(0, 12).map((key, index) => ({
        type: 'line',
        name: key,
        data: history[key].filter(point => point.value !== null).map(point => [point.step, point.value as number]),
        color: ['#5b9bd5', '#26a69a', '#f59e0b', '#ab47bc', '#ef5350'][index % 5],
        marker: { enabled: false },
      })),
    };
    this.rewardMetricSections = this.buildRewardMetricSections();
  }

  private buildRewardMetricSections(): RewardMetricSection[] {
    const groups = this.tracking?.rewardMetrics ?? {};
    return Object.entries(groups)
      .map(([groupKey, metrics]) => {
        const metricViews = Object.entries(metrics ?? {}).map(([metricKey, metric]) =>
          this.toMetricView(groupKey, metricKey, metric),
        );
        return {
          key: groupKey,
          title: this.toTitle(groupKey),
          metrics: metricViews,
          chartOptions: this.rewardChart(metricViews),
        };
      })
      .filter(section => section.metrics.length > 0);
  }

  private toMetricView(groupKey: string, metricKey: string, metric: MlflowRewardMetric): RewardMetricView {
    const key = metric.key || metricKey;
    return {
      id: `${groupKey}-${metricKey}`,
      key,
      label: metric.label || this.toTitle(key),
      description: metric.whatItChecks || '',
      latestValue: metric.latestValue ?? null,
      history: [...(metric.history ?? [])].sort((a, b) => a.step - b.step),
    };
  }

  private rewardChart(metrics: RewardMetricView[]): Highcharts.Options {
    return {
      ...chartBase(),
      xAxis: { ...chartBase().xAxis, type: 'linear' },
      series: metrics
        .filter(metric => metric.history.length > 1)
        .map((metric, index) => ({
          type: 'line',
          name: metric.label,
          data: metric.history.filter(point => point.value !== null).map(point => [point.step, point.value as number]),
          color: ['#5b9bd5', '#26a69a', '#f59e0b', '#ab47bc', '#ef5350'][index % 5],
          marker: { enabled: false },
        })),
    };
  }

  private toChartTrades(trades: MlTrainingTrade[], symbol: string, interval: string): Trade[] {
    return trades.map((trade, index) => {
      const openedAt = this.resolveCandleTime(trade.entry_time, trade.entry_step);
      const closedAt = this.resolveCandleTime(trade.exit_time, trade.exit_step);
      return {
        id: index + 1,
        symbolCode: symbol,
        intervalCode: interval,
        side: trade.side === 'long' || trade.direction === 'long' ? 'Buy' : 'Sell',
        orderType: 'Market',
        quantity: trade.units ?? 1,
        requestedPrice: null,
        entryPrice: Number(trade.entry_price),
        stopLoss: trade.sl ?? null,
        takeProfit: trade.tp ?? null,
        status: 'Closed',
        createdAt: openedAt ?? 0,
        openedAt,
        closedAt,
        closedPrice: Number(trade.exit_price),
        closeReason: null,
        fee: null,
        pnl: Number(trade.pnl),
        accountPnl: null,
        unrealizedPnl: null,
        tradingAccountId: null,
        backtestId: null,
      };
    });
  }

  /**
   * Resolves a trade's chart time. A valid absolute epoch (seconds or ms) is authoritative;
   * otherwise fall back to the candle the trade indexes into via its step. The decision log now
   * streams raw stored JSON, so `entry_time`/`exit_time` may arrive absent rather than as a valid
   * epoch — the step fallback keeps trade markers on the correct candle in that case.
   */
  private resolveCandleTime(epoch: number | null | undefined, step: number | null | undefined): number | null {
    if (epoch != null && Number.isFinite(epoch) && epoch > 100_000_000) return epoch;
    if (step != null && step >= 0 && step < this.candles.length) return this.candles[step].time;
    return null;
  }

  private matchesTradeSplit(trade: MlTrainingTrade, filter: TradeSplitFilter): boolean {
    if (filter === 'all') return true;
    return this.normalizeSplit(trade.split) === filter;
  }

  private normalizeSplit(split: string | null | undefined): TradeSplitFilter | null {
    if (!split) return null;
    const value = split.toLowerCase().replace(/[\s-]+/g, '_');
    if (['oos', 'out_sample', 'out_of_sample', 'outsample', 'test'].includes(value)) return 'out_of_sample';
    if (['in_sample', 'insample', 'train', 'training', 'val', 'validation'].includes(value)) return 'in_sample';
    return null;
  }

  private appendStreamDecision(decision: MlStreamDecision): void {
    const mapped = this.toLogDecision(decision);
    const current =
      this.decisions ??
      ({
        model_id: 'stream',
        symbol: this.run?.symbolCode ?? '',
        interval: this.run?.intervalCode ?? '',
        from_date: this.run ? new Date(this.run.from * 1000).toISOString() : '',
        to_date: this.run ? new Date(this.run.to * 1000).toISOString() : '',
        initial_balance: this.run?.inSampleFinalBalance ?? this.run?.finalBalance ?? 0,
        final_balance: decision.balance,
        pnl_pct: 0,
        n_trades: 0,
        decisions: [],
        trades: [],
      } satisfies MlDecisionLog);
    const existingIndex = current.decisions.findIndex(
      row => row.open_time === mapped.open_time && row.action === mapped.action,
    );
    const decisions =
      existingIndex >= 0
        ? current.decisions.map((row, index) => (index === existingIndex ? mapped : row))
        : [...current.decisions, mapped];
    this.decisions = {
      ...current,
      final_balance: decision.balance,
      decisions,
    };
    this.buildSummaryChart();
  }

  private toLogDecision(decision: MlStreamDecision): MlDecision {
    const openTime = this.toSeconds(decision.time);
    const candleIndex = this.candles.findIndex(candle => this.toSeconds(candle.time) === openTime);
    return {
      candle_index: candleIndex >= 0 ? candleIndex : this.chartDecisions.length,
      open_time: openTime,
      action: decision.action,
      action_name: decision.actionName,
      confidence: decision.confidence,
      probs: decision.probs,
      position: decision.position,
      balance: decision.balance,
    };
  }

  private pageItems<T>(value: MlPaginatedResponse<T> | T[]): T[] {
    if (Array.isArray(value)) return value;
    return value.items ?? value.data ?? value.rows ?? value.points ?? value.trades ?? [];
  }

  private pointTime(point: MlEquityPoint): number {
    const value = point.time ?? point.timestamp ?? point.ts ?? 0;
    if (typeof value === 'string') return new Date(value).getTime();
    return value > 9_999_999_999 ? value : value * 1000;
  }

  private toSeconds(value: number): number {
    return value > 9_999_999_999 ? Math.floor(value / 1000) : value;
  }

  private emptyMessage(key: string): string {
    switch (key) {
      case 'decisions':
        return 'Decision log is not available yet.';
      case 'tracking':
        return 'Tracking data is not available yet.';
      case 'performance':
        return 'Performance telemetry has not been written for this run.';
      case 'charts':
        return 'Chart artifacts are not available for this run.';
      default:
        return 'Telemetry is not available for this endpoint.';
    }
  }

  private toTitle(value: string): string {
    return value
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
  }
}
