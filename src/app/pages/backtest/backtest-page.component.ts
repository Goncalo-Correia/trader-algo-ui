import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { LiveChartDataService } from '../../services/live-chart-data.service';
import { SymbolResponse } from '../../structures/symbol';
import { IntervalResponse } from '../../structures/interval';
import { CandleWithIndicatorsResponse } from '../../structures/candle';
import { BacktestSummary, CreateBacktestRequest } from '../../structures/backtest';

const STRATEGIES = [
  { id: 1, name: 'SMA' },
  { id: 2, name: 'RSI' },
  { id: 3, name: 'MACD' },
];

@Component({
  selector: 'app-backtest-page',
  templateUrl: './backtest-page.component.html',
  styleUrls: ['./backtest-page.component.css'],
})
export class BacktestPageComponent implements OnInit, OnDestroy {
  symbols: SymbolResponse[] = [];
  intervals: IntervalResponse[] = [];
  strategies = STRATEGIES;

  selectedSymbol = '';
  selectedInterval = '';
  selectedStrategyId = 1;
  fromDate = '';
  toDate = '';
  initialBalance = 1000;

  backtestCandles: CandleWithIndicatorsResponse[] = [];
  activePlaybackTime: number | null = null;

  running = false;
  streamDone = false;
  backtestResult: BacktestSummary | null = null;
  errorMessage: string | null = null;

  private streamSub: Subscription | null = null;

  constructor(
    private readonly api: TraderAlgoApiService,
    private readonly liveChart: LiveChartDataService,
  ) {}

  ngOnInit(): void {
    const today = new Date();
    const monthAgo = new Date(today);
    monthAgo.setMonth(today.getMonth() - 1);
    this.toDate   = this.toDatetimeLocal(today);
    this.fromDate = this.toDatetimeLocal(monthAgo);

    this.api.getSymbols().subscribe(s => {
      this.symbols = s;
      this.selectedSymbol = s.find(x => x.isDefault)?.code ?? s[0]?.code ?? '';
    });
    this.api.getIntervals().subscribe(i => {
      this.intervals = i;
      this.selectedInterval = i.find(x => x.isDefault)?.code ?? i[0]?.code ?? '';
    });
  }

  ngOnDestroy(): void {
    this.cancelStream();
  }

  runBacktest(): void {
    if (!this.selectedSymbol || !this.selectedInterval || !this.fromDate || !this.toDate) return;
    if (this.running) return;

    this.running = true;
    this.streamDone = false;
    this.errorMessage = null;
    this.backtestResult = null;
    this.backtestCandles = [];
    this.activePlaybackTime = null;
    this.cancelStream();

    const payload: CreateBacktestRequest = {
      symbol: this.selectedSymbol,
      interval: this.selectedInterval,
      from: new Date(this.fromDate).toISOString(),
      to: new Date(this.toDate).toISOString(),
      initialBalance: this.initialBalance,
    };

    this.api.createBacktest(payload).subscribe({
      next: result => {
        this.backtestResult = result;
        this.openStream(result.id);
      },
      error: (err) => {
        this.running = false;
        this.errorMessage = err?.error?.message ?? 'Failed to create backtest. Ensure a trade bot is enabled.';
      },
    });
  }

  get pnlPositive(): boolean {
    return (this.backtestResult?.pnl ?? 0) >= 0;
  }

  get streamedCandleDate(): string {
    if (!this.activePlaybackTime) return '';
    return new Date(this.activePlaybackTime * 1000).toLocaleString(undefined, {
      month: 'short', day: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  }

  private openStream(backtestId: number): void {
    this.streamSub = this.liveChart.streamBacktest(backtestId).subscribe({
      next: candle => {
        this.backtestCandles = [...this.backtestCandles, candle];
        this.activePlaybackTime = candle.time;
      },
      error: () => {
        this.running = false;
        this.streamDone = true;
        this.refreshSummary(backtestId);
      },
      complete: () => {
        this.running = false;
        this.streamDone = true;
        this.refreshSummary(backtestId);
      },
    });
  }

  private refreshSummary(backtestId: number): void {
    this.api.getBacktest(backtestId).subscribe({
      next: detail => { this.backtestResult = detail; },
    });
  }

  private cancelStream(): void {
    this.streamSub?.unsubscribe();
    this.streamSub = null;
  }

  private toDatetimeLocal(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}
