import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import type * as Highcharts from 'highcharts/highstock';
import { HighchartsChartComponent } from '../../components/highcharts-chart/highcharts-chart.component';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { MlManualDecisionResponse, MlPolicy, MlPolicyRunTrend } from '../../structures/ml-policy';
import { MlRunPerformance, MlServedModel, MlTrainingRun } from '../../structures/ml-training';

function chartBase(): Highcharts.Options {
  return {
    chart: { backgroundColor: '#141414', animation: false, style: { fontFamily: 'inherit' } },
    title: { text: '' },
    credits: { enabled: false },
    legend: { itemStyle: { color: '#d1d4dc', fontSize: '11px' }, itemHoverStyle: { color: '#fff' } },
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
    tooltip: { backgroundColor: '#1e2130', borderColor: '#2a2d3a', style: { color: '#d1d4dc', fontSize: '12px' } },
  };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ml-policy-detail',
  templateUrl: './ml-policy-detail.component.html',
  styleUrls: ['./ml-policy-detail.component.css'],
  imports: [RouterLink, FormsModule, DecimalPipe, HighchartsChartComponent],
})
export class MlPolicyDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(TraderAlgoApiService);
  private readonly cdr = inject(ChangeDetectorRef);

  policy: MlPolicy | null = null;
  runs: MlTrainingRun[] = [];
  servedModels: MlServedModel[] = [];
  servedModel: MlServedModel | null = null;
  performance: MlRunPerformance | null = null;
  runTrend: MlPolicyRunTrend[] = [];

  isLoading = true;
  notFound = false;
  deleting = false;
  deleteError: string | null = null;

  showRunForm = false;
  fromDate = '';
  toDate = '';
  submitting = false;
  runError: string | null = null;

  probeSymbol = '';
  probeInterval = '';
  probing = false;
  probeError: string | null = null;
  probeResult: MlManualDecisionResponse | null = null;

  pnlTrendOptions: Highcharts.Options = {};
  drawdownTrendOptions: Highcharts.Options = {};
  qualityTrendOptions: Highcharts.Options = {};
  overfitTrendOptions: Highcharts.Options = {};

  readonly trackById = (_: number, run: MlTrainingRun): number => run.id;

  private policyId!: number;

  ngOnInit(): void {
    this.policyId = Number(this.route.snapshot.paramMap.get('id'));
    const today = new Date();
    const monthAgo = new Date(today);
    monthAgo.setMonth(today.getMonth() - 1);
    this.toDate = this.toDateInput(today);
    this.fromDate = this.toDateInput(monthAgo);
    this.load();
  }

  get servedRunId(): number | null {
    return this.servedModel?.servedTrainingRunId ?? this.servedModel?.trainingRunId ?? null;
  }

  get isServed(): boolean {
    return this.servedRunId !== null;
  }

  load(): void {
    this.isLoading = true;
    this.notFound = false;
    forkJoin({
      policy: this.api.getPolicy(this.policyId),
      runs: this.api.getTrainingRuns(this.policyId).pipe(catchError(() => of([] as MlTrainingRun[]))),
      served: this.api.getServedModels().pipe(catchError(() => of([] as MlServedModel[]))),
      performance: this.api.getPolicyPerformance(this.policyId).pipe(catchError(() => of(null))),
      trend: this.api.getPolicyRuns(this.policyId).pipe(catchError(() => of([] as MlPolicyRunTrend[]))),
    }).subscribe({
      next: ({ policy, runs, served, performance, trend }) => {
        this.policy = policy;
        this.runs = runs;
        this.servedModels = served;
        this.servedModel = served.find(model => model.served !== false && this.modelPolicyId(model) === policy.id) ?? null;
        this.performance = performance;
        this.runTrend = trend.length ? trend : this.runs.map(run => this.runToTrend(run));
        this.probeSymbol = policy.symbolCode;
        this.probeInterval = policy.intervalCode;
        this.buildCharts();
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoading = false;
        this.notFound = true;
        this.cdr.markForCheck();
      },
    });
  }

  toggleRunForm(): void {
    this.showRunForm = !this.showRunForm;
    this.runError = null;
  }

  startTraining(): void {
    if (this.submitting || !this.fromDate || !this.toDate) return;
    this.submitting = true;
    this.runError = null;
    this.api.createTraining({ mlPolicyId: this.policyId, from: this.fromDate, to: this.toDate }).subscribe({
      next: res => this.router.navigate(['/ml/training-runs', res.trainingRunId]),
      error: err => {
        this.submitting = false;
        this.runError = this.extractError(err, 'Failed to start training run.');
        this.cdr.markForCheck();
      },
    });
  }

  probeDecision(): void {
    if (!this.policy || this.probing) return;
    this.probing = true;
    this.probeError = null;
    this.probeResult = null;
    this.api
      .decideLatestCandle({
        mlPolicyId: this.policy.id,
        symbol: this.probeSymbol || null,
        interval: this.probeInterval || null,
      })
      .subscribe({
        next: result => {
          this.probeResult = result;
          this.probing = false;
          this.cdr.markForCheck();
        },
        error: err => {
          this.probeError = this.extractError(err, 'Decision probe failed.');
          this.probing = false;
          this.cdr.markForCheck();
        },
      });
  }

  deletePolicy(): void {
    if (this.deleting || !this.policy) return;
    if (this.runs.length > 0) {
      this.deleteError = 'Delete this policy training runs before deleting the policy.';
      return;
    }
    if (!confirm('Delete this ML policy?')) return;
    this.deleting = true;
    this.deleteError = null;
    this.api.deletePolicy(this.policyId).subscribe({
      next: () => this.router.navigate(['/ml/policies']),
      error: err => {
        this.deleting = false;
        this.deleteError = this.extractError(err, 'Failed to delete policy.');
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

  pnlClass(pnl: number | null | undefined): string {
    if (pnl === null || pnl === undefined) return '';
    return pnl >= 0 ? 'positive' : 'negative';
  }

  runOosPnl(run: MlTrainingRun): number | null {
    return run.oosPnlPct ?? this.metricFromTracking(run, 'oos_pnl_pct') ?? null;
  }

  runOosBalance(run: MlTrainingRun): number | null {
    return run.oosFinalBalance ?? this.metricFromTracking(run, 'oos_final_balance') ?? null;
  }

  runInSamplePnl(run: MlTrainingRun): number | null {
    return run.inSamplePnlPct ?? run.pnlPct ?? null;
  }

  runTrades(run: MlTrainingRun): number | null {
    return run.oosTradeCount ?? run.tradeCount ?? run.tracking?.nTrades ?? run.nTrades ?? null;
  }

  actionName(result: MlManualDecisionResponse): string {
    return result.actionName ?? result.action_name ?? String(result.action ?? '-');
  }

  modelId(result: MlManualDecisionResponse): string {
    return result.modelId ?? result.model_id ?? '-';
  }

  slBracket(result: MlManualDecisionResponse): string | number {
    return result.slBracket ?? result.sl_bracket ?? '-';
  }

  tpBracket(result: MlManualDecisionResponse): string | number {
    return result.tpBracket ?? result.tp_bracket ?? '-';
  }

  slAtrMult(result: MlManualDecisionResponse): number | null {
    return result.slAtrMult ?? result.sl_atr_mult ?? null;
  }

  tpRMultiple(result: MlManualDecisionResponse): number | null {
    return result.tpRMultiple ?? result.tp_r_multiple ?? null;
  }

  metric(label: string): number | null {
    const source = this.performance?.metrics ?? {};
    return typeof source[label] === 'number' ? source[label] : null;
  }

  formatDate(unixSeconds: number): string {
    return new Date(unixSeconds * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  }

  formatTs(value: number | null | undefined): string {
    if (value === null || value === undefined) return '-';
    const d = new Date(value > 9_999_999_999 ? value : value * 1000);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  }

  private buildCharts(): void {
    const rows = [...this.runTrend].sort((a, b) => (a.completedAt ?? a.startedAt ?? 0) - (b.completedAt ?? b.startedAt ?? 0));
    const x = (row: MlPolicyRunTrend) => ((row.completedAt ?? row.startedAt ?? 0) > 9_999_999_999 ? row.completedAt ?? row.startedAt ?? 0 : (row.completedAt ?? row.startedAt ?? 0) * 1000);
    this.pnlTrendOptions = this.lineChart('OOS PnL %', rows.map(row => [x(row), row.oosPnlPct ?? null]), '#26a69a');
    this.drawdownTrendOptions = this.lineChart('OOS Max Drawdown %', rows.map(row => [x(row), row.oosMaxDrawdownPct ?? null]), '#ef5350');
    this.qualityTrendOptions = {
      ...chartBase(),
      legend: { enabled: true, itemStyle: { color: '#d1d4dc', fontSize: '11px' } },
      series: [
        { type: 'line', name: 'OOS Sharpe', data: rows.map(row => [x(row), row.oosSharpe ?? null]), color: '#5b9bd5', marker: { enabled: false } },
        { type: 'line', name: 'Profit Factor', data: rows.map(row => [x(row), row.oosProfitFactor ?? null]), color: '#f59e0b', marker: { enabled: false } },
      ],
    };
    this.overfitTrendOptions = {
      ...chartBase(),
      series: [
        {
          type: 'column',
          name: 'In-sample minus OOS PnL',
          data: rows.map(row => [x(row), row.inSamplePnlPct !== null && row.oosPnlPct !== null ? Number(row.inSamplePnlPct) - Number(row.oosPnlPct) : null]),
          color: '#ab47bc',
        },
      ],
    };
  }

  private lineChart(name: string, data: [number, number | null][], color: string): Highcharts.Options {
    return {
      ...chartBase(),
      series: [{ type: 'line', name, data, color, lineWidth: 2, marker: { enabled: false } }],
    };
  }

  private runToTrend(run: MlTrainingRun): MlPolicyRunTrend {
    return {
      id: run.id,
      trainingRunId: run.id,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      inSamplePnlPct: this.runInSamplePnl(run),
      oosPnlPct: this.runOosPnl(run),
      oosFinalBalance: this.runOosBalance(run),
      oosMaxDrawdownPct: run.oosMaxDrawdownPct ?? null,
      oosSharpe: run.oosSharpe ?? null,
      oosProfitFactor: run.oosProfitFactor ?? null,
      tradeCount: this.runTrades(run),
    };
  }

  private modelPolicyId(model: MlServedModel): number {
    return model.mlPolicyId ?? model.policyId ?? 0;
  }

  private metricFromTracking(run: MlTrainingRun, key: string): number | null {
    const value = run.tracking?.params?.[key];
    return value === undefined ? null : Number(value);
  }

  private toDateInput(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  private extractError(err: unknown, fallback: string): string {
    if (typeof err === 'object' && err !== null) {
      const e = err as Record<string, unknown>;
      if (typeof e['error'] === 'string') return e['error'];
      if (typeof e['message'] === 'string') return e['message'];
      if (typeof e['error'] === 'object' && e['error'] !== null) {
        const body = e['error'] as Record<string, unknown>;
        if (typeof body['detail'] === 'string') return body['detail'];
        if (typeof body['message'] === 'string') return body['message'];
        if (typeof body['title'] === 'string') return body['title'];
      }
    }
    return fallback;
  }
}
