import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { MlPolicy } from '../../structures/ml-policy';
import { MlTrainingRun } from '../../structures/ml-training';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-ml-policy-detail',
  templateUrl: './ml-policy-detail.component.html',
  styleUrls: ['./ml-policy-detail.component.css'],
  imports: [RouterLink, FormsModule, DecimalPipe],
})
export class MlPolicyDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(TraderAlgoApiService);

  policy: MlPolicy | null = null;
  runs: MlTrainingRun[] = [];
  isLoading = true;
  notFound = false;

  deleting = false;
  deleteError: string | null = null;

  // Inline "new training run" form — a run only needs a date range; everything else is on the policy.
  showRunForm = false;
  fromDate = '';
  toDate = '';
  submitting = false;
  runError: string | null = null;

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

  private load(): void {
    // No per-policy runs endpoint exists, so fetch all and filter to this policy.
    forkJoin({
      policy: this.api.getPolicy(this.policyId),
      runs: this.api.getTrainingRuns(),
    }).subscribe({
      next: ({ policy, runs }) => {
        this.policy = policy;
        this.runs = runs.filter(r => r.mlPolicyId === this.policyId);
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.notFound = true;
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
      next: res => this.router.navigate(['/ml/runs', res.trainingRunId]),
      error: err => {
        this.submitting = false;
        this.runError = this.extractError(err, 'Failed to start training run.');
      },
    });
  }

  deletePolicy(): void {
    if (this.deleting || !this.policy) return;
    if (this.runs.length > 0) {
      this.deleteError = 'Delete this policy’s training runs before deleting the policy.';
      return;
    }
    if (!confirm('Delete this policy?')) return;
    this.deleting = true;
    this.deleteError = null;
    this.api.deletePolicy(this.policyId).subscribe({
      next: () => this.router.navigate(['/ml']),
      error: err => {
        this.deleting = false;
        this.deleteError = this.isConflict(err)
          ? 'Delete this policy’s training runs first.'
          : this.extractError(err, 'Failed to delete policy.');
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

  pnlClass(pnl: number | null): string {
    if (pnl === null) return '';
    return pnl >= 0 ? 'positive' : 'negative';
  }

  runFinalBalance(run: MlTrainingRun): number | null {
    return run.tracking?.finalBalance ?? run.finalBalance;
  }

  runPnlPct(run: MlTrainingRun): number | null {
    return run.tracking?.pnlPct ?? run.pnlPct;
  }

  runTrades(run: MlTrainingRun): number | null {
    return run.tracking?.nTrades ?? run.nTrades;
  }

  formatDate(unixSeconds: number): string {
    return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  }

  formatTs(value: number | null): string {
    if (value === null) return '—';
    const d = new Date(value > 9_999_999_999 ? value : value * 1000);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  }

  private toDateInput(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  private isConflict(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { status?: number }).status === 409;
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
