import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { SymbolResponse } from '../../structures/symbol';
import { IntervalResponse } from '../../structures/interval';
import { CreateTrainingRequest } from '../../structures/ml-training';

@Component({
  selector: 'app-ml-train-page',
  templateUrl: './ml-train-page.component.html',
  styleUrls: ['./ml-train-page.component.css'],
})
export class MlTrainPageComponent implements OnInit {
  symbols: SymbolResponse[] = [];
  intervals: IntervalResponse[] = [];

  readonly trackBySymbolId = (_: number, symbol: SymbolResponse): number => symbol.id;
  readonly trackByIntervalId = (_: number, interval: IntervalResponse): number => interval.id;

  selectedSymbol = '';
  selectedInterval = '';
  fromDate = '';
  toDate = '';

  modelId = 'ppo-v1';
  totalTimesteps = 100_000;
  initialBalance = 10_000;
  quantity = 0.01;
  stopLoss: number | null = null;
  takeProfit: number | null = null;
  breakeven: number | null = null;
  breakevenStop: number | null = null;
  maxCandlesPerTrade: number | null = null;
  dailyProfitTarget: number | null = null;
  dailyDrawdownLimit: number | null = null;
  // Absolute amounts (not fractions): fee/slippage in cash, drawdown threshold in cash.
  feeRate = 0;
  slippageRate = 0;
  maxTrailingDrawdownThreshold = 2500;

  submitting = false;
  errorMessage: string | null = null;

  constructor(
    private readonly api: TraderAlgoApiService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    const today = new Date();
    const monthAgo = new Date(today);
    monthAgo.setMonth(today.getMonth() - 1);
    this.toDate = this.toDatetimeLocal(today);
    this.fromDate = this.toDatetimeLocal(monthAgo);

    this.api.getSymbols().subscribe(s => {
      this.symbols = s;
      this.selectedSymbol = (s.find(x => x.isDefault) ?? s[0])?.code ?? '';
    });
    this.api.getIntervals().subscribe(i => {
      this.intervals = i;
      this.selectedInterval = i.find(x => x.isDefault)?.code ?? i[0]?.code ?? '';
    });
  }

  startTraining(): void {
    if (this.submitting) return;
    if (!this.selectedSymbol || !this.selectedInterval || !this.fromDate || !this.toDate) return;
    if (!this.modelId.trim()) { this.errorMessage = 'Model id is required.'; return; }

    this.submitting = true;
    this.errorMessage = null;

    const payload: CreateTrainingRequest = {
      symbol: this.selectedSymbol,
      interval: this.selectedInterval,
      from_date: new Date(this.fromDate).toISOString(),
      to_date: new Date(this.toDate).toISOString(),
      model_id: this.modelId.trim(),
      total_timesteps: this.totalTimesteps,
      initial_balance: this.initialBalance,
      quantity: this.quantity,
      stop_loss: this.stopLoss,
      take_profit: this.takeProfit,
      breakeven: this.breakeven,
      breakeven_stop: this.breakevenStop,
      max_candles_per_trade: this.maxCandlesPerTrade,
      daily_profit_target: this.dailyProfitTarget,
      daily_drawdown_limit: this.dailyDrawdownLimit,
      fee_rate: this.feeRate,
      slippage_rate: this.slippageRate,
      max_trailing_drawdown_threshold: this.maxTrailingDrawdownThreshold,
    };

    this.api.createTraining(payload).subscribe({
      next: res => this.router.navigate(['/ml', res.trainingRunId]),
      error: err => {
        this.submitting = false;
        this.errorMessage = this.extractError(err, 'Failed to start training run.');
      },
    });
  }

  private toDatetimeLocal(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
