import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { IntervalResponse } from '../../structures/interval';
import {
  CreatePolicyRequest,
  MlPolicy,
  VALIDATION_SCHEMES,
  VALIDATION_SCHEME_LABELS,
  ValidationScheme,
} from '../../structures/ml-policy';
import { SymbolResponse } from '../../structures/symbol';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ml-policy-form',
  templateUrl: './ml-policy-form.component.html',
  styleUrls: ['./ml-policy-form.component.css'],
  imports: [RouterLink, FormsModule],
})
export class MlPolicyFormComponent implements OnInit {
  private readonly api = inject(TraderAlgoApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  symbols: SymbolResponse[] = [];
  intervals: IntervalResponse[] = [];
  policy: MlPolicy | null = null;
  policyId: number | null = null;

  selectedSymbol = '';
  selectedInterval = '';
  totalTimesteps = 100_000;
  initialBalance = 1000;
  maxCandlesPerTrade: number | null = 10;
  riskPerTrade: number | null = 25;
  fee: number | null = 0;
  slippage: number | null = 0;
  dailyProfit: number | null = null;
  dailyDrawdownLimit: number | null = null;
  validationScheme: ValidationScheme = 'single';

  readonly validationSchemes = VALIDATION_SCHEMES;
  readonly validationSchemeLabels = VALIDATION_SCHEME_LABELS;

  isLoading = true;
  submitting = false;
  errorMessage: string | null = null;
  validationErrors: string[] = [];

  readonly trackBySymbolId = (_: number, symbol: SymbolResponse): number => symbol.id;
  readonly trackByIntervalId = (_: number, interval: IntervalResponse): number => interval.id;

  ngOnInit(): void {
    const rawId = this.route.snapshot.paramMap.get('id');
    this.policyId = rawId === null ? null : Number(rawId);

    const sources = {
      symbols: this.api.getSymbols(),
      intervals: this.api.getIntervals(),
      policy: this.policyId === null ? this.api.getPolicies() : this.api.getPolicy(this.policyId),
    };

    forkJoin(sources).subscribe({
      next: ({ symbols, intervals, policy }) => {
        this.symbols = symbols;
        this.intervals = intervals;
        if (this.policyId !== null && !Array.isArray(policy)) {
          this.policy = policy;
          this.applyPolicy(policy);
        } else {
          this.selectedSymbol = (symbols.find(x => x.isDefault) ?? symbols[0])?.code ?? '';
          this.selectedInterval = intervals.find(x => x.isDefault)?.code ?? intervals[0]?.code ?? '';
        }
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: err => {
        this.isLoading = false;
        this.errorMessage = this.extractError(err, 'Could not load policy form data.');
        this.cdr.markForCheck();
      },
    });
  }

  get isEdit(): boolean {
    return this.policyId !== null;
  }

  get riskWarning(): string | null {
    return this.riskPerTrade === null || Number(this.riskPerTrade) <= 0
      ? 'Risk per trade is empty or zero. ML inference will size trades to zero unless a served model overrides it.'
      : null;
  }

  savePolicy(): void {
    if (this.submitting) return;
    this.validationErrors = this.validate();
    if (this.validationErrors.length > 0) {
      this.cdr.markForCheck();
      return;
    }

    this.submitting = true;
    this.errorMessage = null;

    const payload = this.toPayload();
    const request =
      this.policyId === null ? this.api.createPolicy(payload) : this.api.updatePolicy(this.policyId, payload);

    request.subscribe({
      next: policy => this.router.navigate(['/ml/policies', policy.id]),
      error: err => {
        this.submitting = false;
        this.errorMessage = this.extractError(err, `Failed to ${this.isEdit ? 'update' : 'create'} policy.`);
        this.cdr.markForCheck();
      },
    });
  }

  private applyPolicy(policy: MlPolicy): void {
    this.selectedSymbol = policy.symbolCode;
    this.selectedInterval = policy.intervalCode;
    this.totalTimesteps = policy.totalTimesteps;
    this.initialBalance = policy.initialBalance;
    this.riskPerTrade = policy.riskPerTrade ?? null;
    this.fee = policy.fee ?? null;
    this.slippage = policy.slippage ?? null;
    this.dailyProfit = policy.dailyProfit ?? null;
    this.dailyDrawdownLimit = policy.dailyDrawdownLimit ?? null;
    this.maxCandlesPerTrade = policy.maxCandlesPerTrade ?? 1;
    this.validationScheme = policy.validationScheme ?? 'single';
  }

  private validate(): string[] {
    const errors: string[] = [];
    if (!this.selectedSymbol) errors.push('Symbol is required.');
    if (!this.selectedInterval) errors.push('Interval is required.');
    if (!Number.isFinite(this.totalTimesteps) || this.totalTimesteps <= 0) errors.push('Total timesteps must be positive.');
    if (!Number.isFinite(this.initialBalance) || this.initialBalance <= 0) errors.push('Initial balance must be positive.');
    if (!Number.isFinite(this.maxCandlesPerTrade) || Number(this.maxCandlesPerTrade) <= 0) {
      errors.push('Max candles per trade must be positive.');
    }
    for (const [label, value] of [
      ['Risk per trade', this.riskPerTrade],
      ['Fee', this.fee],
      ['Slippage', this.slippage],
      ['Daily profit target', this.dailyProfit],
      ['Daily drawdown limit', this.dailyDrawdownLimit],
    ] as const) {
      if (value !== null && value !== undefined && Number(value) < 0) errors.push(`${label} cannot be negative.`);
    }
    return errors;
  }

  private toPayload(): CreatePolicyRequest {
    return {
      symbol: this.selectedSymbol,
      interval: this.selectedInterval,
      totalTimesteps: Number(this.totalTimesteps),
      initialBalance: Number(this.initialBalance),
      maxCandlesPerTrade: Number(this.maxCandlesPerTrade),
      validationScheme: this.validationScheme,
      riskPerTrade: this.nullableNumber(this.riskPerTrade),
      fee: this.nullableNumber(this.fee),
      slippage: this.nullableNumber(this.slippage),
      dailyProfit: this.nullableNumber(this.dailyProfit),
      dailyDrawdownLimit: this.nullableNumber(this.dailyDrawdownLimit),
    };
  }

  private nullableNumber(value: number | null): number | null {
    return value === null || value === undefined || value === ('' as unknown as number) ? null : Number(value);
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
