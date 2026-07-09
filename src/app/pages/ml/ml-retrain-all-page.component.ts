import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { MlRetrainAllResult } from '../../structures/ml-training';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ml-retrain-all-page',
  templateUrl: './ml-retrain-all-page.component.html',
  styleUrls: ['./ml-retrain-all-page.component.css'],
  imports: [RouterLink, FormsModule],
})
export class MlRetrainAllPageComponent {
  private readonly api = inject(TraderAlgoApiService);
  private readonly cdr = inject(ChangeDetectorRef);

  fromDate = this.toDateInput(this.offsetMonth(-1));
  toDate = this.toDateInput(new Date());
  submitting = false;
  errorMessage: string | null = null;
  results: MlRetrainAllResult[] = [];

  readonly trackByIndex = (index: number): number => index;

  submit(): void {
    if (this.submitting || !this.fromDate || !this.toDate) return;
    this.submitting = true;
    this.errorMessage = null;
    this.results = [];
    this.api.retrainAll({ from: this.fromDate, to: this.toDate }).subscribe({
      next: results => {
        this.results = results;
        this.submitting = false;
        this.cdr.markForCheck();
      },
      error: err => {
        this.errorMessage = this.extractError(err, 'Failed to start bulk retraining.');
        this.submitting = false;
        this.cdr.markForCheck();
      },
    });
  }

  policyId(result: MlRetrainAllResult): number | null {
    return result.mlPolicyId ?? result.policyId ?? null;
  }

  statusClass(status: string): string {
    return `status-${status.toLowerCase()}`;
  }

  private offsetMonth(offset: number): Date {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    return d;
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
