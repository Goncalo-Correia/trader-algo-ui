import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, switchMap, takeUntil, timer } from 'rxjs';
import type * as Highcharts from 'highcharts/highstock';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { CandleWithIndicators } from '../../structures/candle';
import {
  MlDecisionLog,
  MlflowMetricPoint,
  MlflowRewardMetric,
  MlflowTrackingResponse,
  MlflowTrackingSummary,
  MlTrainingRun,
} from '../../structures/ml-training';
import { Trade } from '../../structures/trade';
import { HighchartsChartComponent } from '../../components/highcharts-chart/highcharts-chart.component';
import { BacktestChartComponent } from '../../components/backtest-chart/backtest-chart.component';
import { LowerCasePipe, DecimalPipe } from '@angular/common';

function darkThemeBase(): Highcharts.Options {
  return {
    chart: { backgroundColor: '#141414', animation: false, style: { fontFamily: 'inherit' } },
    title: { text: '' },
    credits: { enabled: false },
    legend: { enabled: false },
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
      labels: { style: { color: '#787b86', fontSize: '11px' }, align: 'left', x: 4 },
      title: { text: '' },
    },
    tooltip: { backgroundColor: '#1e2130', borderColor: '#2a2d3a', style: { color: '#d1d4dc', fontSize: '12px' } },
  };
}

interface PerformanceMetricView {
  id: string;
  key: string;
  label: string;
  description: string;
  latestValue: number | null;
  history: MlflowMetricPoint[];
}

interface PerformanceMetricSection {
  key: string;
  title: string;
  metrics: PerformanceMetricView[];
  hasChart: boolean;
  chartOptions: Highcharts.Options;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ml-training-detail',
  templateUrl: './ml-training-detail.component.html',
  styleUrls: ['./ml-training-detail.component.css'],
  imports: [RouterLink, HighchartsChartComponent, BacktestChartComponent, LowerCasePipe, DecimalPipe],
})
export class MlTrainingDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(TraderAlgoApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  run: MlTrainingRun | null = null;
  decisions: MlDecisionLog | null = null;
  isLoading = true;
  deleting = false;
  decisionsError: string | null = null;
  candlesError: string | null = null;
  trackingError: string | null = null;
  candlesReady = false;
  tracking: MlflowTrackingResponse | null = null;

  // Price chart (lightweight-charts) inputs.
  candles: CandleWithIndicators[] = [];
  chartTrades: Trade[] = [];

  balanceChartOptions: Highcharts.Options = {};
  metricHistoryChartOptions: Highcharts.Options = {};
  rewardMetricSections: PerformanceMetricSection[] = [];

  private runId!: number;
  // Stops the polling timer once the run settles (Completed/Failed) or errors.
  private readonly stopPolling$ = new Subject<void>();

  ngOnInit(): void {
    this.runId = Number(this.route.snapshot.paramMap.get('id'));
    // Poll while the run is in flight; `switchMap` cancels any request still in
    // flight when the next tick fires (no overlap), and `takeUntil(stopPolling$)`
    // plus `takeUntilDestroyed` guarantee the loop tears down on settle/navigation.
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
          if (run.status === 'Completed') {
            this.stopPolling();
            this.loadTracking(run.id);
            this.loadVisualization(run);
          } else if (run.status === 'Failed') {
            this.stopPolling();
            this.loadTracking(run.id);
          } else {
            this.loadTracking(run.id, false);
          }
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoading = false;
          this.stopPolling();
          this.cdr.markForCheck();
        },
      });
  }

  get isInFlight(): boolean {
    return this.run?.status === 'Pending' || this.run?.status === 'Running';
  }

  get pnlPositive(): boolean {
    return (this.performancePnlPct ?? 0) >= 0;
  }

  get trackingSummary(): MlflowTrackingResponse | MlflowTrackingSummary | null {
    return this.tracking ?? this.run?.tracking ?? null;
  }

  get trackingAvailable(): boolean {
    return this.trackingSummary?.trackingAvailable ?? false;
  }

  get performanceFinalBalance(): number | null {
    return (
      this.tracking?.latestMetrics['final_balance'] ??
      this.run?.tracking?.finalBalance ??
      this.run?.finalBalance ??
      null
    );
  }

  get performancePnlPct(): number | null {
    return this.tracking?.latestMetrics['pnl_pct'] ?? this.run?.tracking?.pnlPct ?? this.run?.pnlPct ?? null;
  }

  get performanceTrades(): number | null {
    return (
      this.toIntegerMetric(this.tracking?.latestMetrics['n_trades']) ??
      this.run?.tracking?.nTrades ??
      this.run?.nTrades ??
      null
    );
  }

  get trackingParams(): Record<string, string> {
    return this.tracking?.params ?? this.trackingSummary?.params ?? {};
  }

  get mlflowRunUuid(): string | null {
    return this.trackingSummary?.mlflowRunUuid ?? this.run?.runId ?? null;
  }

  get artifactUri(): string | null {
    return this.tracking?.artifactUri ?? null;
  }

  get metricHistoryAvailable(): boolean {
    return Object.values(this.tracking?.metricHistory ?? {}).some(points => points.length > 1);
  }

  get hasRewardMetrics(): boolean {
    return this.rewardMetricSections.length > 0;
  }

  get continuedFromRun(): string | null {
    return this.paramValue('continued_from_training_run_id', 'continuedFromTrainingRunId', 'continued_from_run_id');
  }

  get trackedTotalTimesteps(): string | number | null {
    return this.paramValue('total_timesteps', 'totalTimesteps') ?? this.run?.totalTimesteps ?? null;
  }

  deleteRun(): void {
    if (this.deleting || !this.run || !confirm('Delete this training run and its decision log?')) return;
    const policyId = this.run.mlPolicyId;
    this.deleting = true;
    this.api
      .deleteTraining(this.runId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.router.navigate(['/ml/policies', policyId]),
        error: () => {
          this.deleting = false;
          this.cdr.markForCheck();
        },
      });
  }

  statusClass(status: string): string {
    switch (status) {
      case 'Completed':
        return 'status-completed';
      case 'Running':
        return 'status-running';
      case 'Pending':
        return 'status-pending';
      case 'Failed':
        return 'status-failed';
      default:
        return '';
    }
  }

  formatDate(unixSeconds: number): string {
    return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  }

  formatTs(ms: number | null): string {
    if (ms === null) return '—';
    const d = new Date(ms > 9_999_999_999 ? ms : ms * 1000);
    return (
      d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' }) +
      ' ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
    );
  }

  formatIso(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return (
      d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' }) +
      ' ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
    );
  }

  formatMetricValue(metric: PerformanceMetricView): string {
    if (metric.latestValue === null || metric.latestValue === undefined) return '-';
    const key = metric.key.toLowerCase();
    const label = metric.label.toLowerCase();
    const value = metric.latestValue;

    if (key.includes('rate') || key.includes('pct') || label.includes('%') || label.includes('rate')) {
      const pctValue = Math.abs(value) <= 1 ? value * 100 : value;
      return `${pctValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
    }

    return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }

  private stopPolling(): void {
    this.stopPolling$.next();
  }

  private loadVisualization(run: MlTrainingRun): void {
    const range = {
      symbol: run.symbolCode,
      interval: run.intervalCode,
      from: new Date(run.from * 1000).toISOString(),
      to: new Date(run.to * 1000).toISOString(),
    };
    // The price chart renders from the candles alone; the decision log only
    // adds trade markers and the trades table, so the two load independently.
    // The lightweight-charts component reacts to its [candles]/[trades] inputs,
    // so order doesn't matter.
    this.api
      .getCandlesWithIndicatorsByDateInterval(range)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: candles => {
          this.candles = candles;
          this.candlesReady = true;
          this.cdr.markForCheck();
        },
        error: () => {
          this.candlesError = 'Could not load candles for this run.';
          this.cdr.markForCheck();
        },
      });

    this.api
      .getTrainingDecisions(run.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: log => {
          this.decisions = log;
          this.chartTrades = this.toChartTrades(log);
          this.buildBalanceChart(log);
          this.cdr.markForCheck();
        },
        error: () => {
          this.decisionsError = 'Decision log is not available for this run.';
          this.cdr.markForCheck();
        },
      });
  }

  private loadTracking(runId: number, showError = true): void {
    if (showError) this.trackingError = null;
    this.api
      .getTrainingTracking(runId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: tracking => {
          this.tracking = tracking;
          this.rewardMetricSections = this.buildRewardMetricSections(tracking);
          this.buildMetricHistoryChart(tracking);
          this.cdr.markForCheck();
        },
        error: () => {
          if (showError) {
            this.trackingError = 'Tracking data is not available for this run.';
            this.cdr.markForCheck();
          }
        },
      });
  }

  /**
   * Maps the decision log's trades onto the `Trade` shape the shared
   * lightweight-charts component renders as entry/exit markers. ML trades are
   * always historical, so status is `Closed` (no live bracket lines are drawn).
   */
  private toChartTrades(log: MlDecisionLog): Trade[] {
    return log.trades.map((t, i) => ({
      id: i + 1,
      symbolCode: log.symbol,
      intervalCode: log.interval,
      side: t.side === 'long' ? 'Buy' : 'Sell',
      orderType: 'Market',
      quantity: 1,
      requestedPrice: null,
      entryPrice: Number(t.entry_price),
      stopLoss: null,
      takeProfit: null,
      status: 'Closed',
      createdAt: t.entry_time ?? 0,
      openedAt: t.entry_time,
      closedAt: t.exit_time,
      closedPrice: Number(t.exit_price),
      closeReason: null,
      fee: null,
      pnl: Number(t.pnl),
      accountPnl: null,
      unrealizedPnl: null,
      tradingAccountId: null,
      backtestId: null,
    }));
  }

  private buildBalanceChart(log: MlDecisionLog): void {
    this.balanceChartOptions = {
      ...darkThemeBase(),
      series: [
        {
          type: 'area',
          name: 'Balance',
          data: log.decisions.filter(d => d.open_time !== null).map(d => [d.open_time! * 1000, Number(d.balance)]),
          color: '#2962ff',
          fillColor: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [
              [0, 'rgba(41,98,255,0.25)'],
              [1, 'rgba(41,98,255,0)'],
            ],
          },
          lineWidth: 2,
          marker: { enabled: false },
        } as Highcharts.SeriesAreaOptions,
      ],
    };
  }

  private buildMetricHistoryChart(tracking: MlflowTrackingResponse): void {
    const preferred = ['pnl_pct', 'final_balance', 'n_trades'];
    const metricHistory = tracking.metricHistory ?? {};
    const keys = [
      ...preferred.filter(key => (metricHistory[key]?.length ?? 0) > 1),
      ...Object.keys(metricHistory).filter(key => !preferred.includes(key) && metricHistory[key].length > 1),
    ];

    this.metricHistoryChartOptions = {
      ...darkThemeBase(),
      xAxis: {
        type: 'linear',
        gridLineColor: '#1e2130',
        lineColor: '#2a2d3a',
        tickColor: '#2a2d3a',
        labels: { style: { color: '#787b86', fontSize: '11px' } },
        title: { text: 'Step', style: { color: '#787b86' } },
      },
      series: keys.map(
        (key, index) =>
          ({
            type: 'line',
            name: key,
            data: metricHistory[key]
              .filter(point => point.value !== null)
              .map(point => [point.step, point.value as number]),
            color: ['#2962ff', '#26a69a', '#f59e0b', '#ab47bc', '#ef5350'][index % 5],
            lineWidth: 2,
            marker: { enabled: false },
          }) as Highcharts.SeriesLineOptions,
      ),
    };
  }

  private buildRewardMetricSections(tracking: MlflowTrackingResponse): PerformanceMetricSection[] {
    const groups = tracking.rewardMetrics ?? {};
    return Object.entries(groups)
      .map(([groupKey, metrics]) => {
        const metricViews = Object.entries(metrics ?? {})
          .map(([metricKey, metric]) => this.toMetricView(groupKey, metricKey, metric))
          .filter((metric): metric is PerformanceMetricView => metric !== null);

        return {
          key: groupKey,
          title: this.toTitle(groupKey),
          metrics: metricViews,
          hasChart: metricViews.some(metric => metric.history.length > 1),
          chartOptions: this.buildRewardMetricChart(metricViews),
        };
      })
      .filter(section => section.metrics.length > 0);
  }

  private toMetricView(
    groupKey: string,
    metricKey: string,
    metric: MlflowRewardMetric | null | undefined,
  ): PerformanceMetricView | null {
    if (!metric) return null;
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

  private buildRewardMetricChart(metrics: PerformanceMetricView[]): Highcharts.Options {
    const chartableMetrics = metrics.filter(metric => metric.history.length > 1);
    const palette = ['#2962ff', '#26a69a', '#f59e0b', '#ab47bc', '#ef5350', '#00acc1', '#ff7043', '#66bb6a'];
    const base = darkThemeBase();

    return {
      ...base,
      legend: {
        enabled: true,
        itemStyle: { color: '#d1d4dc', fontSize: '11px' },
        itemHoverStyle: { color: '#fff' },
      },
      xAxis: {
        type: 'linear',
        gridLineColor: '#1e2130',
        lineColor: '#2a2d3a',
        tickColor: '#2a2d3a',
        labels: { style: { color: '#787b86', fontSize: '11px' } },
        title: { text: 'Step', style: { color: '#787b86' } },
      },
      tooltip: {
        ...base.tooltip,
        shared: true,
      },
      series: chartableMetrics.map(
        (metric, index) =>
          ({
            type: 'line',
            name: metric.label,
            data: metric.history
              .filter(point => point.value !== null && Number.isFinite(point.value))
              .map(point => [point.step, point.value as number]),
            color: palette[index % palette.length],
            lineWidth: 2,
            marker: { enabled: false },
          }) as Highcharts.SeriesLineOptions,
      ),
    };
  }

  private paramValue(...keys: string[]): string | null {
    for (const key of keys) {
      const value = this.trackingParams[key];
      if (value !== undefined && value !== '') return value;
    }
    return null;
  }

  private toIntegerMetric(value: number | null | undefined): number | null {
    return value === null || value === undefined ? null : Math.round(value);
  }

  private toTitle(value: string): string {
    return value
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
  }
}
