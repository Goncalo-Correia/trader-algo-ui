import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, timer } from 'rxjs';
import type * as Highcharts from 'highcharts/highstock';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { CandleWithIndicatorsResponse } from '../../structures/candle';
import { MlDecisionLog, MlTrainingRun } from '../../structures/ml-training';
import { Trade } from '../../structures/trade';

function darkThemeBase(): Highcharts.Options {
  return {
    chart: { backgroundColor: '#141414', animation: false, style: { fontFamily: 'inherit' } },
    title: { text: '' },
    credits: { enabled: false },
    legend: { enabled: false },
    xAxis: {
      type: 'datetime',
      gridLineColor: '#1e2130', lineColor: '#2a2d3a', tickColor: '#2a2d3a',
      labels: { style: { color: '#787b86', fontSize: '11px' } },
    },
    yAxis: {
      gridLineColor: '#1e2130', lineColor: '#2a2d3a',
      labels: { style: { color: '#787b86', fontSize: '11px' }, align: 'left', x: 4 },
      title: { text: '' },
    },
    tooltip: { backgroundColor: '#1e2130', borderColor: '#2a2d3a', style: { color: '#d1d4dc', fontSize: '12px' } },
  };
}

@Component({
  selector: 'app-ml-training-detail',
  templateUrl: './ml-training-detail.component.html',
  styleUrls: ['./ml-training-detail.component.css'],
})
export class MlTrainingDetailComponent implements OnInit, OnDestroy {
  run: MlTrainingRun | null = null;
  decisions: MlDecisionLog | null = null;
  isLoading = true;
  deleting = false;
  decisionsError: string | null = null;
  candlesError: string | null = null;
  candlesReady = false;

  // Price chart (lightweight-charts) inputs.
  candles: CandleWithIndicatorsResponse[] = [];
  chartTrades: Trade[] = [];

  balanceChartOptions: Highcharts.Options = {};

  readonly trackByIndex = (i: number): number => i;

  private runId!: number;
  private pollSub: Subscription | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly api: TraderAlgoApiService,
  ) {}

  ngOnInit(): void {
    this.runId = Number(this.route.snapshot.paramMap.get('id'));
    // Poll while the run is in flight; stop and load the visualization once it settles.
    this.pollSub = timer(0, 5000).subscribe(() => {
      this.api.getTrainingRun(this.runId).subscribe({
        next: run => {
          this.run = run;
          this.isLoading = false;
          if (run.status === 'Completed') {
            this.stopPolling();
            this.loadVisualization(run);
          } else if (run.status === 'Failed') {
            this.stopPolling();
          }
        },
        error: () => { this.isLoading = false; this.stopPolling(); },
      });
    });
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  get isInFlight(): boolean {
    return this.run?.status === 'Pending' || this.run?.status === 'Running';
  }

  get pnlPositive(): boolean {
    return (this.run?.pnlPct ?? 0) >= 0;
  }

  deleteRun(): void {
    if (this.deleting || !this.run || !confirm('Delete this training run and its decision log?')) return;
    const policyId = this.run.mlPolicyId;
    this.deleting = true;
    this.api.deleteTraining(this.runId).subscribe({
      next: () => this.router.navigate(['/ml/policies', policyId]),
      error: () => { this.deleting = false; },
    });
  }

  statusClass(status: string): string {
    switch (status) {
      case 'Completed': return 'status-completed';
      case 'Running':   return 'status-running';
      case 'Pending':   return 'status-pending';
      case 'Failed':    return 'status-failed';
      default:          return '';
    }
  }

  formatDate(unixSeconds: number): string {
    return new Date(unixSeconds * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  }

  formatTs(ms: number | null): string {
    if (ms === null) return '—';
    const d = new Date(ms > 9_999_999_999 ? ms : ms * 1000);
    return d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' })
      + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  private stopPolling(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = null;
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
    this.api.getCandlesWithIndicatorsByDateInterval(range).subscribe({
      next: candles => { this.candles = candles; this.candlesReady = true; },
      error: () => { this.candlesError = 'Could not load candles for this run.'; },
    });

    this.api.getTrainingDecisions(run.id).subscribe({
      next: log => {
        this.decisions = log;
        this.chartTrades = this.toChartTrades(log);
        this.buildBalanceChart(log);
      },
      error: () => { this.decisionsError = 'Decision log is not available for this run.'; },
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
      series: [{
        type: 'area',
        name: 'Balance',
        data: log.decisions
          .filter(d => d.open_time !== null)
          .map(d => [d.open_time! * 1000, Number(d.balance)]),
        color: '#2962ff',
        fillColor: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
          stops: [[0, 'rgba(41,98,255,0.25)'], [1, 'rgba(41,98,255,0)']],
        },
        lineWidth: 2,
        marker: { enabled: false },
      } as Highcharts.SeriesAreaOptions],
    };
  }

}
