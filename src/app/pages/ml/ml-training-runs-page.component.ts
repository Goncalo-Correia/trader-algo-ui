import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { MlPolicy } from '../../structures/ml-policy';
import { MlServedModel, MlTrainingRun } from '../../structures/ml-training';

type RunSortKey = 'startedAt' | 'oosPnl' | 'oosDrawdown' | 'tradeCount' | 'duration';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ml-training-runs-page',
  templateUrl: './ml-training-runs-page.component.html',
  styleUrls: ['./ml-training-runs-page.component.css'],
  imports: [RouterLink, FormsModule, DecimalPipe],
})
export class MlTrainingRunsPageComponent implements OnInit {
  private readonly api = inject(TraderAlgoApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  runs: MlTrainingRun[] = [];
  policies: MlPolicy[] = [];
  servedModels: MlServedModel[] = [];
  isLoading = true;
  loadError: string | null = null;

  policyFilter = '';
  symbolFilter = '';
  intervalFilter = '';
  statusFilter = '';
  servedFilter: 'all' | 'served' | 'not-served' = 'all';
  hasOosFilter: 'all' | 'yes' | 'no' = 'all';
  hasDecisionFilter: 'all' | 'yes' | 'no' = 'all';
  hasTrackingFilter: 'all' | 'yes' | 'no' = 'all';
  fromFilter = '';
  toFilter = '';
  sortKey: RunSortKey = 'startedAt';
  sortDir: 'asc' | 'desc' = 'desc';

  showNewRun = false;
  selectedPolicyId: number | null = null;
  runFrom = '';
  runTo = '';
  submitting = false;
  runError: string | null = null;

  readonly statuses = ['Pending', 'Running', 'Completed', 'Failed'];
  readonly trackById = (_: number, run: MlTrainingRun): number => run.id;
  readonly trackByPolicyId = (_: number, policy: MlPolicy): number => policy.id;

  ngOnInit(): void {
    const policyId = this.route.snapshot.queryParamMap.get('mlPolicyId');
    this.policyFilter = policyId ?? '';
    const today = new Date();
    const monthAgo = new Date(today);
    monthAgo.setMonth(today.getMonth() - 1);
    this.runTo = this.toDateInput(today);
    this.runFrom = this.toDateInput(monthAgo);
    this.load();
  }

  get symbols(): string[] {
    return [...new Set(this.runs.map(run => run.symbolCode).filter(Boolean))].sort();
  }

  get intervals(): string[] {
    return [...new Set(this.runs.map(run => run.intervalCode).filter(Boolean))].sort();
  }

  get filteredRuns(): MlTrainingRun[] {
    const from = this.fromFilter ? new Date(`${this.fromFilter}T00:00:00Z`).getTime() / 1000 : null;
    const to = this.toFilter ? new Date(`${this.toFilter}T23:59:59Z`).getTime() / 1000 : null;
    const rows = this.runs.filter(run => {
      const served = this.isServed(run);
      if (this.policyFilter && run.mlPolicyId !== Number(this.policyFilter)) return false;
      if (this.symbolFilter && run.symbolCode !== this.symbolFilter) return false;
      if (this.intervalFilter && run.intervalCode !== this.intervalFilter) return false;
      if (this.statusFilter && run.status !== this.statusFilter) return false;
      if (this.servedFilter === 'served' && !served) return false;
      if (this.servedFilter === 'not-served' && served) return false;
      if (this.hasOosFilter === 'yes' && this.oosPnl(run) === null) return false;
      if (this.hasOosFilter === 'no' && this.oosPnl(run) !== null) return false;
      if (this.hasDecisionFilter === 'yes' && !this.hasDecisionLog(run)) return false;
      if (this.hasDecisionFilter === 'no' && this.hasDecisionLog(run)) return false;
      if (this.hasTrackingFilter === 'yes' && !run.tracking?.trackingAvailable) return false;
      if (this.hasTrackingFilter === 'no' && run.tracking?.trackingAvailable) return false;
      if (from !== null && run.from < from) return false;
      if (to !== null && run.to > to) return false;
      return true;
    });
    return [...rows].sort((a, b) => {
      const av = this.sortValue(a);
      const bv = this.sortValue(b);
      const result = av === bv ? b.id - a.id : av > bv ? 1 : -1;
      return this.sortDir === 'asc' ? result : -result;
    });
  }

  load(): void {
    this.isLoading = true;
    this.loadError = null;
    const policyId = this.policyFilter ? Number(this.policyFilter) : undefined;
    forkJoin({
      runs: this.api.getTrainingRuns(policyId),
      policies: this.api.getPolicies().pipe(catchError(() => of([] as MlPolicy[]))),
      served: this.api.getServedModels().pipe(catchError(() => of([] as MlServedModel[]))),
    }).subscribe({
      next: ({ runs, policies, served }) => {
        this.runs = runs;
        this.policies = policies;
        this.servedModels = served;
        this.selectedPolicyId = this.selectedPolicyId ?? (policyId ?? policies[0]?.id ?? null);
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadError = 'Could not load training runs.';
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  setSort(key: RunSortKey): void {
    if (this.sortKey === key) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortKey = key;
      this.sortDir = 'desc';
    }
  }

  startTraining(): void {
    if (!this.selectedPolicyId || this.submitting) return;
    this.submitting = true;
    this.runError = null;
    this.api.createTraining({ mlPolicyId: this.selectedPolicyId, from: this.runFrom, to: this.runTo }).subscribe({
      next: response => this.router.navigate(['/ml/training-runs', response.trainingRunId]),
      error: err => {
        this.submitting = false;
        this.runError = this.extractError(err, 'Failed to start training run.');
        this.cdr.markForCheck();
      },
    });
  }

  deleteRun(run: MlTrainingRun, event: Event): void {
    event.stopPropagation();
    if (!confirm(`Delete training run #${run.id}?`)) return;
    this.api.deleteTraining(run.id).subscribe({
      next: () => {
        this.runs = this.runs.filter(row => row.id !== run.id);
        this.cdr.markForCheck();
      },
      error: () => undefined,
    });
  }

  isServed(run: MlTrainingRun): boolean {
    return this.servedModels.some(model => model.served !== false && (model.servedTrainingRunId ?? model.trainingRunId) === run.id);
  }

  hasDecisionLog(run: MlTrainingRun): boolean {
    return run.status === 'Completed' || this.runTrades(run) !== null;
  }

  oosPnl(run: MlTrainingRun): number | null {
    return run.oosPnlPct ?? null;
  }

  oosBalance(run: MlTrainingRun): number | null {
    return run.oosFinalBalance ?? null;
  }

  inSamplePnl(run: MlTrainingRun): number | null {
    return run.inSamplePnlPct ?? run.pnlPct ?? null;
  }

  inSampleBalance(run: MlTrainingRun): number | null {
    return run.inSampleFinalBalance ?? run.finalBalance ?? null;
  }

  runTrades(run: MlTrainingRun): number | null {
    return run.oosTradeCount ?? run.tradeCount ?? run.tracking?.nTrades ?? run.nTrades ?? null;
  }

  duration(run: MlTrainingRun): number | null {
    return run.completedAt === null ? null : Math.max(0, (run.completedAt ?? 0) - run.startedAt);
  }

  statusClass(status: string): string {
    return `status-${status.toLowerCase()}`;
  }

  pnlClass(value: number | null): string {
    if (value === null) return 'td-dim';
    return value >= 0 ? 'positive' : 'negative';
  }

  formatDate(unixSeconds: number): string {
    return new Date(unixSeconds * 1000).toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' });
  }

  formatTs(value: number | null | undefined): string {
    if (value === null || value === undefined) return '-';
    const d = new Date(value > 9_999_999_999 ? value : value * 1000);
    return `${d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  }

  formatDuration(seconds: number | null): string {
    if (seconds === null) return '-';
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  }

  private sortValue(run: MlTrainingRun): number {
    switch (this.sortKey) {
      case 'oosPnl':
        return this.oosPnl(run) ?? Number.NEGATIVE_INFINITY;
      case 'oosDrawdown':
        return run.oosMaxDrawdownPct ?? Number.NEGATIVE_INFINITY;
      case 'tradeCount':
        return this.runTrades(run) ?? 0;
      case 'duration':
        return this.duration(run) ?? 0;
      case 'startedAt':
      default:
        return run.startedAt;
    }
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
      }
    }
    return fallback;
  }
}
