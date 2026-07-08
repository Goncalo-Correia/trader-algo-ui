import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { TradeBotEventsService } from '../../services/trade-bot-events.service';
import { TradeBot, TradeBotEvent, UpdateTradeBotRequest } from '../../structures/trade-bot';
import { Trade } from '../../structures/trade';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-tradebot-detail',
  templateUrl: './tradebot-detail.component.html',
  styleUrls: ['./tradebot-detail.component.css'],
  imports: [RouterLink, FormsModule, DecimalPipe],
})
export class TradebotDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(TraderAlgoApiService);
  private readonly eventsSvc = inject(TradeBotEventsService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  bot: TradeBot | null = null;
  isLoading = true;
  isToggling = false;
  isSaving = false;
  saveError = '';
  saveMessage = '';

  trades: Trade[] = [];
  isLoadingTrades = false;
  readonly trackByTradeId = (_: number, trade: Trade): number => trade.id;

  eventLog: (TradeBotEvent & { receivedAt: number })[] = [];
  readonly trackByReceivedAt = (_: number, event: { receivedAt: number }): number => event.receivedAt;

  draftQuantity: number | null = null;
  draftStopLoss: number | null = null;
  draftTakeProfit: number | null = null;

  private eventSub: Subscription | null = null;

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.api.getTradeBot(id).subscribe({
      next: bot => {
        this.bot = bot;
        this.isLoading = false;
        this.syncDraft(bot);
        this.loadTradeHistory(bot);
        this.connectEvents(bot);
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  ngOnDestroy(): void {
    this.eventSub?.unsubscribe();
  }

  toggleBot(): void {
    if (!this.bot || this.isToggling) return;
    this.isToggling = true;
    const action = this.bot.isEnabled ? this.api.disableTradeBot(this.bot.id) : this.api.enableTradeBot(this.bot.id);
    action.subscribe({
      next: bot => {
        this.bot = bot;
        this.syncDraft(bot);
        this.isToggling = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isToggling = false;
        this.cdr.markForCheck();
      },
    });
  }

  saveConfig(): void {
    if (!this.bot || this.isSaving) return;
    this.isSaving = true;
    this.saveError = '';
    this.saveMessage = '';

    const payload: UpdateTradeBotRequest = {
      symbolCode: this.bot.symbolCode ?? '',
      intervalCode: this.bot.intervalCode ?? '',
      quantity: this.draftQuantity ?? this.bot.quantity,
      stopLoss: this.draftStopLoss,
      takeProfit: this.draftTakeProfit,
      breakeven: this.bot.breakeven,
      breakevenStop: this.bot.breakevenStop ?? null,
      isNySessionOnly: this.bot.isNySessionOnly,
      delay: this.bot.delay ?? false,
      dailyProfitGoal: this.bot.dailyProfitGoal,
      maxLossesPerDay: this.bot.maxLossesPerDay,
      maxCandlesPerTrade: this.bot.maxCandlesPerTrade,
      fee: this.bot.fee ?? null,
      isEnabled: this.bot.isEnabled,
    };

    this.api.updateTradeBot(this.bot.id, payload).subscribe({
      next: bot => {
        this.bot = bot;
        this.syncDraft(bot);
        this.isSaving = false;
        this.saveMessage = 'Settings saved.';
        this.cdr.markForCheck();
      },
      error: () => {
        this.isSaving = false;
        this.saveError = 'Failed to save settings.';
        this.cdr.markForCheck();
      },
    });
  }

  get recentTrades(): Trade[] {
    return [...this.trades].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, 50);
  }

  tradePnlClass(trade: Trade): string {
    if (trade.pnl === null || trade.pnl === undefined) return '';
    return trade.pnl >= 0 ? 'positive' : 'negative';
  }

  sideClass(side: string): string {
    return side === 'Buy' ? 'side-buy' : 'side-sell';
  }

  eventTypeClass(type: string): string {
    switch (type) {
      case 'TradeOpened':
        return 'evt-opened';
      case 'TradeClosed':
        return 'evt-closed';
      case 'BotEnabled':
        return 'evt-enabled';
      case 'BotDisabled':
        return 'evt-disabled';
      case 'SignalIgnored':
        return 'evt-ignored';
      default:
        return '';
    }
  }

  get scopeLabel(): string {
    if (!this.bot) return '';
    if (this.bot.tradingAccountId !== null) {
      return this.bot.tradingAccountName ?? `Account #${this.bot.tradingAccountId}`;
    }
    if (this.bot.backtestId !== null) return `Backtest #${this.bot.backtestId}`;
    return 'Unscoped';
  }

  get tradeHistoryTitle(): string {
    if (this.bot?.backtestId !== null && this.bot?.backtestId !== undefined) return 'Backtest Trades';
    return 'Trade History';
  }

  formatTs(ts: number | string | null): string {
    if (!ts) return '—';
    const ms = typeof ts === 'number' ? (ts > 9_999_999_999 ? ts : ts * 1000) : Number(ts);
    return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  }

  formatDateTime(ts: number | string | null): string {
    if (!ts) return '—';
    const ms = typeof ts === 'number' ? (ts > 9_999_999_999 ? ts : ts * 1000) : Number(ts);
    const d = new Date(ms);
    return (
      d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' }) +
      ' ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
    );
  }

  private syncDraft(bot: TradeBot): void {
    this.draftQuantity = bot.quantity;
    this.draftStopLoss = bot.stopLoss;
    this.draftTakeProfit = bot.takeProfit;
  }

  private loadTradeHistory(bot: TradeBot): void {
    this.isLoadingTrades = true;
    const request =
      bot.tradingAccountId !== null
        ? this.api.getTradeHistory(bot.tradingAccountId)
        : bot.backtestId !== null
          ? this.api.getBacktestTrades(bot.backtestId)
          : null;

    if (!request) {
      this.trades = [];
      this.isLoadingTrades = false;
      return;
    }

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: trades => {
        this.trades = trades;
        this.isLoadingTrades = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoadingTrades = false;
        this.cdr.markForCheck();
      },
    });
  }

  private connectEvents(bot: TradeBot): void {
    if (bot.tradingAccountId === null) return;
    const accountId = bot.tradingAccountId;
    this.eventSub = this.eventsSvc.connect(accountId).subscribe({
      next: event => {
        this.eventLog = [{ ...event, receivedAt: Date.now() }, ...this.eventLog].slice(0, 100);
        this.cdr.markForCheck();
        if (event.type === 'BotEnabled' || event.type === 'BotDisabled') {
          this.api
            .getTradeBot(this.bot!.id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(bot => {
              this.bot = bot;
              this.cdr.markForCheck();
            });
        }
        if (event.type === 'TradeClosed') {
          this.loadTradeHistory(this.bot!);
        }
      },
    });
  }
}
