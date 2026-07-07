import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { SymbolResponse } from '../../structures/symbol';
import { IntervalResponse } from '../../structures/interval';
import { CreatePolicyRequest } from '../../structures/ml-policy';
import { FormsModule } from '@angular/forms';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ml-policy-form',
  templateUrl: './ml-policy-form.component.html',
  styleUrls: ['./ml-policy-form.component.css'],
  imports: [RouterLink, FormsModule],
})
export class MlPolicyFormComponent implements OnInit {
  private readonly api = inject(TraderAlgoApiService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  symbols: SymbolResponse[] = [];
  intervals: IntervalResponse[] = [];

  readonly trackBySymbolId = (_: number, symbol: SymbolResponse): number => symbol.id;
  readonly trackByIntervalId = (_: number, interval: IntervalResponse): number => interval.id;

  selectedSymbol = '';
  selectedInterval = '';

  totalTimesteps = 100_000;
  // Defaults mirror the backtest trade panel.
  initialBalance = 1000;
  quantity = 1;
  stopLoss: number | null = 100;
  takeProfit: number | null = 100;
  breakeven: number | null = null;
  breakevenStop: number | null = null;
  maxCandlesPerTrade: number | null = null;
  dailyProfit: number | null = null;
  dailyDrawdownLimit: number | null = null;
  // Absolute amounts (not fractions): fee/slippage in cash, drawdown threshold in cash.
  fee: number | null = null;
  slippage: number | null = 0;
  maxTrailingDrawdown: number | null = 2500;

  submitting = false;
  errorMessage: string | null = null;

  ngOnInit(): void {
    this.api.getSymbols().subscribe(s => {
      this.symbols = s;
      this.selectedSymbol = (s.find(x => x.isDefault) ?? s[0])?.code ?? '';
      this.cdr.markForCheck();
    });
    this.api.getIntervals().subscribe(i => {
      this.intervals = i;
      this.selectedInterval = i.find(x => x.isDefault)?.code ?? i[0]?.code ?? '';
      this.cdr.markForCheck();
    });
  }

  createPolicy(): void {
    if (this.submitting) return;
    if (!this.selectedSymbol || !this.selectedInterval) return;

    this.submitting = true;
    this.errorMessage = null;

    // The backend MlPolicyRequest declares breakeven/breakevenStop/fee/slippage/dailyProfit/
    // dailyDrawdownLimit/maxCandlesPerTrade as non-nullable — posting an explicit null 400s.
    // A blank field means "disabled/none", which the backend represents as 0.
    const payload: CreatePolicyRequest = {
      symbol: this.selectedSymbol,
      interval: this.selectedInterval,
      totalTimesteps: this.totalTimesteps,
      initialBalance: this.initialBalance,
      quantity: this.quantity,
      takeProfit: this.takeProfit,
      stopLoss: this.stopLoss,
      breakeven: this.breakeven ?? 0,
      breakevenStop: this.breakevenStop ?? 0,
      fee: this.fee ?? 0,
      slippage: this.slippage ?? 0,
      dailyProfit: this.dailyProfit ?? 0,
      dailyDrawdownLimit: this.dailyDrawdownLimit ?? 0,
      maxCandlesPerTrade: this.maxCandlesPerTrade ?? 0,
      maxTrailingDrawdown: this.maxTrailingDrawdown,
    };

    this.api.createPolicy(payload).subscribe({
      next: policy => this.router.navigate(['/ml/policies', policy.id]),
      error: err => {
        this.submitting = false;
        this.errorMessage = this.extractError(err, 'Failed to create policy.');
        this.cdr.markForCheck();
      },
    });
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
