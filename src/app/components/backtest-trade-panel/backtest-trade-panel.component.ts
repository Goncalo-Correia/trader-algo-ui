import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { isAlpacaSymbol, SymbolResponse } from '../../structures/symbol';
import { IntervalResponse } from '../../structures/interval';
import { StrategyResponse } from '../../structures/strategy';
import { BacktestSummary } from '../../structures/backtest';
import { Trade } from '../../structures/trade';

/**
 * The backtest configuration + status panel — the dedicated backtest sibling of
 * the algo/chart trade panels. It owns the config form (two-way `model()` fields)
 * and renders the live run status/result cards from parent-supplied inputs, but
 * leaves backtest creation + streaming orchestration to the page (via `runBacktest`).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-backtest-trade-panel',
  templateUrl: './backtest-trade-panel.component.html',
  styleUrls: ['./backtest-trade-panel.component.css'],
  imports: [FormsModule, RouterLink, DecimalPipe],
})
export class BacktestTradePanelComponent {
  // ── Reference data ────────────────────────────────────────────────────────
  readonly symbols = input<SymbolResponse[]>([]);
  readonly intervals = input<IntervalResponse[]>([]);
  readonly strategies = input<StrategyResponse[]>([]);

  // ── Config form (two-way bound to the page) ───────────────────────────────
  readonly selectedSymbol = model('');
  readonly selectedInterval = model('');
  readonly selectedStrategy = model<number | null>(null);
  readonly fromDate = model('');
  readonly toDate = model('');
  readonly initialBalance = model(1000);
  readonly quantity = model<number | null>(1);
  readonly stopLoss = model<number | null>(100);
  readonly takeProfit = model<number | null>(100);
  readonly breakeven = model<number | null>(null);
  readonly breakevenStop = model<number | null>(null);
  readonly fee = model<number | null>(null);
  readonly isNySessionOnly = model(false);
  readonly delay = model(false);
  readonly dailyProfitGoal = model<number | null>(null);
  readonly maxLossesPerDay = model<number | null>(null);
  readonly maxCandlesPerTrade = model<number | null>(null);

  // ── Live run status (owned by the page) ───────────────────────────────────
  readonly running = input(false);
  readonly streamDone = input(false);
  readonly errorMessage = input<string | null>(null);
  readonly backtestResult = input<BacktestSummary | null>(null);
  readonly backtestCandlesCount = input(0);
  readonly activePlaybackTime = input<number | null>(null);
  readonly backtestTotalPnl = input<number | null>(null);
  readonly activeTrade = input<Trade | null>(null);
  readonly activeTradePnl = input<number | null>(null);
  readonly breakevenActive = input(false);

  // ── Actions ───────────────────────────────────────────────────────────────
  readonly runBacktest = output<void>();

  get pnlPositive(): boolean {
    return (this.backtestResult()?.pnl ?? 0) >= 0;
  }

  get streamedCandleDate(): string {
    const time = this.activePlaybackTime();
    if (!time) return '';
    return new Date(time * 1000).toLocaleString(undefined, {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  onSymbolChange(code: string): void {
    this.selectedSymbol.set(code);
    this.isNySessionOnly.set(isAlpacaSymbol(this.symbols().find(s => s.code === code)));
  }
}
