import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { LiveChartDataService } from '../../services/live-chart-data.service';
import { isAlpacaSymbol, SymbolResponse } from '../../structures/symbol';
import { IntervalResponse } from '../../structures/interval';
import { StrategyResponse } from '../../structures/strategy';
import { CandleWithIndicatorsResponse } from '../../structures/candle';
import { BacktestSummary, CreateBacktestRequest } from '../../structures/backtest';
import { Trade } from '../../structures/trade';
import { BacktestChartComponent } from '../../components/backtest-chart/backtest-chart.component';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-backtest-page',
  templateUrl: './backtest-page.component.html',
  styleUrls: ['./backtest-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BacktestChartComponent, FormsModule, RouterLink, DecimalPipe],
})
export class BacktestPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(TraderAlgoApiService);
  private readonly liveChart = inject(LiveChartDataService);
  private readonly cdr = inject(ChangeDetectorRef);

  symbols: SymbolResponse[] = [];
  intervals: IntervalResponse[] = [];
  strategies: StrategyResponse[] = [];

  readonly trackBySymbolId = (_: number, symbol: SymbolResponse): number => symbol.id;
  readonly trackByIntervalId = (_: number, interval: IntervalResponse): number => interval.id;
  readonly trackByStrategyId = (_: number, strategy: StrategyResponse): number => strategy.id;

  selectedSymbol = '';
  selectedInterval = '';
  selectedStrategy: number | null = null;
  fromDate = '';
  toDate = '';
  initialBalance = 1000;
  quantity: number | null = 1;
  stopLoss: number | null = 100;
  takeProfit: number | null = 100;
  breakeven: number | null = null;
  breakevenStop: number | null = null;
  fee: number | null = null;
  isNySessionOnly = false;
  delay = false;
  dailyProfitGoal: number | null = null;
  maxLossesPerDay: number | null = null;
  maxCandlesPerTrade: number | null = null;

  backtestCandles: CandleWithIndicatorsResponse[] = [];
  backtestTrades: Trade[] = [];
  activePlaybackTime: number | null = null;

  running = false;
  streamDone = false;
  backtestResult: BacktestSummary | null = null;
  errorMessage: string | null = null;

  private streamSub: Subscription | null = null;

  ngOnInit(): void {
    const today = new Date();
    const monthAgo = new Date(today);
    monthAgo.setMonth(today.getMonth() - 1);
    this.toDate = this.toDatetimeLocal(today);
    this.fromDate = this.toDatetimeLocal(monthAgo);

    this.api.getSymbols().subscribe(s => {
      this.symbols = s;
      const def = s.find(x => x.isDefault) ?? s[0];
      this.selectedSymbol = def?.code ?? '';
      this.isNySessionOnly = isAlpacaSymbol(def);
      this.cdr.markForCheck();
    });
    this.api.getIntervals().subscribe(i => {
      this.intervals = i;
      this.selectedInterval = i.find(x => x.isDefault)?.code ?? i[0]?.code ?? '';
      this.cdr.markForCheck();
    });
    this.api.getStrategies().subscribe(s => {
      this.strategies = s;
      this.selectedStrategy = s[0]?.id ?? null;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.cancelStream();
  }

  onSymbolChange(code: string): void {
    this.selectedSymbol = code;
    this.isNySessionOnly = isAlpacaSymbol(this.symbols.find(s => s.code === code));
  }

  runBacktest(): void {
    if (!this.selectedSymbol || !this.selectedInterval || !this.fromDate || !this.toDate) return;
    if (!this.quantity || this.quantity <= 0) {
      this.errorMessage = 'Quantity must be greater than zero.';
      return;
    }
    if (this.running) return;

    this.running = true;
    this.streamDone = false;
    this.errorMessage = null;
    this.backtestResult = null;
    this.backtestCandles = [];
    this.backtestTrades = [];
    this.activePlaybackTime = null;
    this.cancelStream();

    const payload: CreateBacktestRequest = {
      symbol: this.selectedSymbol,
      interval: this.selectedInterval,
      from: new Date(this.fromDate).toISOString(),
      to: new Date(this.toDate).toISOString(),
      initialBalance: this.initialBalance,
      tradingStrategyId: this.selectedStrategy,
      quantity: this.quantity,
      stopLoss: this.stopLoss ?? null,
      takeProfit: this.takeProfit ?? null,
      breakeven: this.breakeven ?? null,
      breakevenStop: this.breakevenStop ?? null,
      fee: this.fee ?? null,
      isNySessionOnly: this.isNySessionOnly,
      dailyProfitGoal: this.dailyProfitGoal ?? null,
      maxLossesPerDay: this.maxLossesPerDay ?? null,
      maxCandlesPerTrade: this.maxCandlesPerTrade ?? null,
    };

    this.api.createBacktest(payload).subscribe({
      next: result => {
        this.backtestResult = result;
        this.openStream(result.id, this.delay);
        this.cdr.markForCheck();
      },
      error: err => {
        this.running = false;
        this.errorMessage = this.extractError(err, 'Failed to create backtest.');
        this.cdr.markForCheck();
      },
    });
  }

  get pnlPositive(): boolean {
    return (this.backtestResult?.pnl ?? 0) >= 0;
  }

  get streamedCandleDate(): string {
    if (!this.activePlaybackTime) return '';
    return new Date(this.activePlaybackTime * 1000).toLocaleString(undefined, {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  get activeTrade(): Trade | null {
    return this.backtestTrades.find(t => t.status === 'Active' || t.status === 'Pending') ?? null;
  }

  get breakevenActive(): boolean {
    const trade = this.activeTrade;
    return trade !== null && trade.stopLoss === 0;
  }

  get activeTradePnl(): number | null {
    const trade = this.activeTrade;
    if (!trade) return null;

    const entry = this.toNumber(trade.entryPrice ?? trade.requestedPrice);
    const current = this.latestClose;
    const quantity = this.toNumber(trade.quantity);
    if (entry !== null && current !== null && quantity !== null) {
      return trade.side === 'Buy' ? (current - entry) * quantity : (entry - current) * quantity;
    }

    return this.toNumber(trade.pnl ?? trade.unrealizedPnl);
  }

  get backtestTotalPnl(): number | null {
    if (this.backtestTrades.length === 0) return this.backtestResult?.pnl ?? null;
    const realized = this.backtestTrades.reduce((sum, trade) => sum + (this.toNumber(trade.pnl) ?? 0), 0);
    return realized + (this.activeTradePnl ?? 0);
  }

  private openStream(backtestId: number, delay: boolean): void {
    this.streamSub = this.liveChart.streamBacktest(backtestId, delay).subscribe({
      next: event => {
        switch (event.type) {
          case 'candle':
            this.appendCandles([event.data]);
            break;
          case 'candleBatch':
            this.appendCandles(event.data);
            break;
          case 'tradeOpened':
          case 'tradeClosed':
            this.upsertTrade(event.data);
            break;
          case 'tradeBracketUpdate':
            this.applyBracketUpdate(event.data.tradeId, event.data.stopLoss, event.data.takeProfit);
            break;
        }
        // One change-detection pass per frame (a candle batch covers up to 250 candles),
        // rather than one per candle.
        this.cdr.markForCheck();
      },
      error: () => {
        this.running = false;
        this.streamDone = true;
        this.refreshSummary(backtestId);
        this.cdr.markForCheck();
      },
      complete: () => {
        this.running = false;
        this.streamDone = true;
        this.refreshSummary(backtestId);
        this.cdr.markForCheck();
      },
    });
  }

  private appendCandles(candles: CandleWithIndicatorsResponse[]): void {
    if (candles.length === 0) return;
    this.backtestCandles = this.backtestCandles.concat(candles);
    this.activePlaybackTime = candles[candles.length - 1].time;
  }

  /** Inserts a newly-opened trade or replaces an existing one by id (close/update). */
  private upsertTrade(trade: Trade): void {
    const index = this.backtestTrades.findIndex(t => t.id === trade.id);
    this.backtestTrades =
      index === -1
        ? [...this.backtestTrades, trade]
        : [...this.backtestTrades.slice(0, index), trade, ...this.backtestTrades.slice(index + 1)];
  }

  private applyBracketUpdate(tradeId: number, stopLoss: number | null, takeProfit: number | null): void {
    const index = this.backtestTrades.findIndex(t => t.id === tradeId);
    if (index === -1) return;
    const updated = { ...this.backtestTrades[index], stopLoss, takeProfit };
    this.backtestTrades = [...this.backtestTrades.slice(0, index), updated, ...this.backtestTrades.slice(index + 1)];
  }

  private refreshSummary(backtestId: number): void {
    this.api.getBacktest(backtestId).subscribe({
      next: detail => {
        this.backtestResult = detail;
        this.cdr.markForCheck();
      },
    });
    // Reconcile once against the persisted set in case the socket dropped mid-run.
    this.api.getBacktestTrades(backtestId).subscribe({
      next: trades => {
        this.backtestTrades = trades;
        this.cdr.markForCheck();
      },
      error: err => console.error('Failed to load backtest trades.', err),
    });
  }

  private get latestClose(): number | null {
    return this.toNumber(this.backtestCandles.at(-1)?.close);
  }

  private toNumber(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private cancelStream(): void {
    this.streamSub?.unsubscribe();
    this.streamSub = null;
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
        if (typeof body['message'] === 'string') return body['message'];
        if (typeof body['title'] === 'string') return body['title'];
      }
    }
    return fallback;
  }
}
