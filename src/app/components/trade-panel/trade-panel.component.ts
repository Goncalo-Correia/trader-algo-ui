import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { Observable, Subscription, switchMap } from 'rxjs';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { TradeBotEventsService } from '../../services/trade-bot-events.service';
import { IntervalResponse } from '../../structures/interval';
import { isAlpacaSymbol, SymbolResponse } from '../../structures/symbol';
import { StrategyResponse } from '../../structures/strategy';
import { CreateTradeBotRequest, TradeBot, TradeBotEvent, UpdateTradeBotRequest } from '../../structures/trade-bot';
import { CreateTradeRequest, Trade, TradeOrderType, TradeSide, UpdateTradeRequest } from '../../structures/trade';
import { TradingAccount } from '../../structures/trading-account';
import { FormsModule } from '@angular/forms';
import { NgClass, DecimalPipe } from '@angular/common';

interface TradeBotDraft {
  tradingStrategyId: number | null;
  symbolCode: string;
  intervalCode: string;
  quantity: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  breakeven: number | null;
  breakevenStop: number | null;
  isNySessionOnly: boolean;
  dailyProfitGoal: number | null;
  maxLossesPerDay: number | null;
  maxCandlesPerTrade: number | null;
  fee: number | null;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-trade-panel',
  templateUrl: './trade-panel.component.html',
  styleUrls: ['./trade-panel.component.css'],
  imports: [FormsModule, NgClass, DecimalPipe],
})
export class TradePanelComponent implements OnInit, OnDestroy {
  private readonly traderAlgoApi = inject(TraderAlgoApiService);
  private readonly tradeBotEvents = inject(TradeBotEventsService);
  private readonly cdr = inject(ChangeDetectorRef);

  // ── Inputs ──────────────────────────────────────────────────────────────────

  @Input() symbols: SymbolResponse[] = [];
  @Input() intervals: IntervalResponse[] = [];
  @Input() defaultInterval = '';
  @Input() showTradeBot = false;

  @Input() set initialSymbol(value: string) {
    if (!value || value === this.selectedSymbol) return;
    this.selectedSymbol = value;
    if (!this.tradeBot) this.tradeBotDraft.symbolCode = value;
    this.loadActiveTrade();
  }

  // ── Outputs ─────────────────────────────────────────────────────────────────

  @Output() symbolChange = new EventEmitter<string>();
  @Output() tradeChange = new EventEmitter<Trade | null>();
  @Output() accountChange = new EventEmitter<number | null>();

  // ── State ───────────────────────────────────────────────────────────────────

  accounts: TradingAccount[] = [];
  strategies: StrategyResponse[] = [];

  readonly trackBySymbolId = (_: number, symbol: SymbolResponse): number => symbol.id;
  readonly trackByAccountId = (_: number, account: TradingAccount): number => account.id;
  readonly trackByStrategyId = (_: number, strategy: StrategyResponse): number => strategy.id;
  readonly trackByIntervalId = (_: number, interval: IntervalResponse): number => interval.id;
  selectedAccountId: number | null = null;
  selectedSymbol = '';

  tradeBot: TradeBot | null = null;
  tradeBotDraft: TradeBotDraft = {
    tradingStrategyId: null,
    symbolCode: '',
    intervalCode: '',
    quantity: 1,
    stopLoss: 100,
    takeProfit: 100,
    breakeven: null,
    breakevenStop: null,
    isNySessionOnly: false,
    dailyProfitGoal: null,
    maxLossesPerDay: null,
    maxCandlesPerTrade: null,
    fee: null,
  };

  isLoadingBot = false;
  isSavingBot = false;
  isTogglingBot = false;
  botError = '';
  botMessage = '';

  activeTrade: Trade | null = null;

  // ── Manual trade entry ───────────────────────────────────────────────────────

  tradeSide: TradeSide = 'Buy';
  tradeOrderType: TradeOrderType = 'Market';
  tradeQuantity: number | null = null;
  tradeLimitPrice: number | null = null;
  tradeStopLoss: number | null = null;
  tradeTakeProfit: number | null = null;
  isSubmittingTrade = false;
  isClosingTrade = false;
  tradeError = '';
  tradeMessage = '';

  // ── SL/TP adjustment for active trade ───────────────────────────────────────

  adjustSlDraft: number | null = null;
  adjustTpDraft: number | null = null;
  isAdjusting = false;

  private subscription?: Subscription;
  private botEventSubscription?: Subscription;
  private pollingTimer?: ReturnType<typeof setTimeout>;
  private readonly POLL_MS = 3_000;

  ngOnInit(): void {
    this.traderAlgoApi.getStrategies().subscribe({
      next: strategies => {
        this.strategies = strategies;
        if (this.tradeBot) {
          this.applyTradeBotToDraft(this.tradeBot);
        } else if (!this.tradeBotDraft.tradingStrategyId && strategies.length > 0) {
          this.tradeBotDraft = { ...this.tradeBotDraft, tradingStrategyId: strategies[0].id };
        }
        this.cdr.markForCheck();
      },
    });

    this.traderAlgoApi.getTradingAccounts().subscribe({
      next: accounts => {
        this.accounts = accounts.filter(a => a.isActive);
        if (this.accounts.length > 0) {
          this.selectedAccountId = this.accounts[0].id;
          this.accountChange.emit(this.selectedAccountId);
          this.loadActiveTrade();
          if (this.showTradeBot) {
            this.loadTradeBot();
            this.connectTradeBotEvents();
          }
        }
        this.cdr.markForCheck();
      },
      error: err => console.error('Failed to load trading accounts.', err),
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.botEventSubscription?.unsubscribe();
    this.stopPolling();
  }

  // ── Symbol / account ────────────────────────────────────────────────────────

  onSymbolChange(event: Event): void {
    const code = (event.target as HTMLSelectElement).value;
    if (!code || code === this.selectedSymbol) return;
    this.selectedSymbol = code;
    this.symbolChange.emit(code);
    if (!this.tradeBot) {
      this.tradeBotDraft.isNySessionOnly = isAlpacaSymbol(this.findSymbol(code));
    }
    this.clearTradeState();
    this.loadActiveTrade();
  }

  onAccountChange(accountId: number | null): void {
    if (accountId === this.selectedAccountId) return;
    this.selectedAccountId = accountId;
    this.accountChange.emit(accountId);
    this.clearTradeState();
    this.clearBotState();
    this.loadActiveTrade();
    if (this.showTradeBot) {
      this.loadTradeBot();
      this.connectTradeBotEvents();
    }
  }

  // ── Computed ─────────────────────────────────────────────────────────────────

  get tradeBotFormValid(): boolean {
    if (this.selectedAccountId === null) return false;
    if (!this.showTradeBot) return false;
    if (!this.findSymbol(this.tradeBotDraft.symbolCode)) return false;
    if (!this.findInterval(this.tradeBotDraft.intervalCode)) return false;
    if (!this.tradeBotDraft.quantity || this.tradeBotDraft.quantity <= 0) return false;
    if (!this.tradeBot && !this.tradeBotDraft.tradingStrategyId) return false;
    return true;
  }

  get canUseTradeBot(): boolean {
    return this.selectedAccount?.isActive === true;
  }

  get tradeBotStatusLabel(): string {
    if (this.isLoadingBot) return 'Loading';
    if (!this.tradeBot) return 'Not configured';
    return this.tradeBot.isEnabled ? 'Enabled' : 'Disabled';
  }

  get selectedAccount(): TradingAccount | null {
    return this.accounts.find(a => a.id === this.selectedAccountId) ?? null;
  }

  get hasActiveTrade(): boolean {
    return this.activeTrade?.status === 'Pending' || this.activeTrade?.status === 'Active';
  }

  get tradeFormValid(): boolean {
    if (this.selectedAccountId === null) return false;
    if (!this.tradeQuantity || this.tradeQuantity <= 0) return false;
    if (this.tradeOrderType === 'Limit' && (!this.tradeLimitPrice || this.tradeLimitPrice <= 0)) return false;
    return true;
  }

  get absoluteSlPrice(): number | null {
    const t = this.activeTrade;
    if (!t || t.stopLoss === null || t.stopLoss === undefined) return null;
    const entry = t.entryPrice ?? t.requestedPrice;
    if (entry === null || entry === undefined) return null;
    return t.side === 'Buy' ? Number(entry) - Number(t.stopLoss) : Number(entry) + Number(t.stopLoss);
  }

  get absoluteTpPrice(): number | null {
    const t = this.activeTrade;
    if (!t || t.takeProfit === null || t.takeProfit === undefined) return null;
    const entry = t.entryPrice ?? t.requestedPrice;
    if (entry === null || entry === undefined) return null;
    return t.side === 'Buy' ? Number(entry) + Number(t.takeProfit) : Number(entry) - Number(t.takeProfit);
  }

  // ── Manual trade actions ─────────────────────────────────────────────────────

  submitTrade(): void {
    if (!this.tradeFormValid || this.isSubmittingTrade) return;
    this.isSubmittingTrade = true;
    this.tradeError = '';
    this.tradeMessage = '';

    const payload: CreateTradeRequest = {
      symbolCode: this.selectedSymbol,
      side: this.tradeSide,
      orderType: this.tradeOrderType,
      quantity: this.tradeQuantity!,
      tradingAccountId: this.selectedAccountId ?? undefined,
    };
    if (this.tradeOrderType === 'Limit' && this.tradeLimitPrice) {
      payload.limitPrice = this.tradeLimitPrice;
    }
    if (this.tradeStopLoss) payload.stopLoss = this.tradeStopLoss;
    if (this.tradeTakeProfit) payload.takeProfit = this.tradeTakeProfit;

    this.traderAlgoApi.createTrade(payload).subscribe({
      next: trade => {
        this.isSubmittingTrade = false;
        this.activeTrade = trade;
        this.tradeChange.emit(trade);
        this.tradeMessage = `${trade.side} trade opened.`;
        this.syncAdjustDraft(trade);
        this.startPolling();
        this.cdr.markForCheck();
      },
      error: err => {
        this.isSubmittingTrade = false;
        this.tradeError = this.extractError(err, 'Failed to submit trade.');
        this.cdr.markForCheck();
      },
    });
  }

  closeTrade(): void {
    if (!this.activeTrade || this.isClosingTrade) return;
    this.isClosingTrade = true;
    this.traderAlgoApi.stopTrade(this.activeTrade.id).subscribe({
      next: () => {
        this.isClosingTrade = false;
        this.stopPolling();
        this.loadActiveTrade();
        this.cdr.markForCheck();
      },
      error: () => {
        this.isClosingTrade = false;
        this.cdr.markForCheck();
      },
    });
  }

  saveAdjustment(): void {
    if (!this.activeTrade || this.isAdjusting) return;
    this.isAdjusting = true;
    const update: UpdateTradeRequest = {
      stopLoss: this.adjustSlDraft ?? undefined,
      takeProfit: this.adjustTpDraft ?? undefined,
    };
    this.traderAlgoApi.updateTrade(this.activeTrade.id, update).subscribe({
      next: trade => {
        this.isAdjusting = false;
        this.activeTrade = trade;
        this.syncAdjustDraft(trade);
        this.tradeChange.emit(trade);
        this.cdr.markForCheck();
      },
      error: () => {
        this.isAdjusting = false;
        this.cdr.markForCheck();
      },
    });
  }

  // ── Bot actions ──────────────────────────────────────────────────────────────

  saveTradeBot(): void {
    if (!this.tradeBotFormValid || this.isSavingBot) return;
    this.isSavingBot = true;
    this.botError = '';
    this.botMessage = '';

    this.persistTradeBot().subscribe({
      next: bot => {
        this.isSavingBot = false;
        this.tradeBot = bot;
        this.applyTradeBotToDraft(bot);
        this.botMessage = 'Bot settings saved.';
        this.cdr.markForCheck();
      },
      error: err => {
        this.isSavingBot = false;
        this.botError = this.extractError(err, 'Failed to save bot settings.');
        this.cdr.markForCheck();
      },
    });
  }

  toggleTradeBot(): void {
    if (!this.tradeBotFormValid || this.isTogglingBot) return;
    this.isTogglingBot = true;
    this.botError = '';
    this.botMessage = '';

    const request = this.tradeBot?.isEnabled
      ? this.traderAlgoApi.disableTradeBot(this.tradeBot.id)
      : this.persistTradeBot().pipe(switchMap(bot => this.traderAlgoApi.enableTradeBot(bot.id)));

    request.subscribe({
      next: bot => {
        this.isTogglingBot = false;
        this.tradeBot = bot;
        this.applyTradeBotToDraft(bot);
        this.botMessage = bot.isEnabled ? 'Bot enabled.' : 'Bot disabled.';
        this.cdr.markForCheck();
      },
      error: err => {
        this.isTogglingBot = false;
        this.botError = this.extractError(err, 'Failed to change bot state.');
        this.cdr.markForCheck();
      },
    });
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private loadActiveTrade(): void {
    if (this.selectedAccountId === null) return;
    const accountId = this.selectedAccountId;
    this.traderAlgoApi.getActiveTrades(accountId).subscribe({
      next: trades => {
        if (this.selectedAccountId !== accountId) return;
        const trade = trades[0] ?? null;
        this.activeTrade = trade;
        this.tradeChange.emit(trade);
        if (trade) {
          this.syncAdjustDraft(trade);
          this.startPolling();
        }
        this.cdr.markForCheck();
      },
      error: err => console.error('Failed to load active trade.', err),
    });
  }

  private syncAdjustDraft(trade: Trade): void {
    this.adjustSlDraft = trade.stopLoss ?? null;
    this.adjustTpDraft = trade.takeProfit ?? null;
  }

  private loadTradeBot(): void {
    if (!this.showTradeBot || this.selectedAccountId === null) return;
    const accountId = this.selectedAccountId;
    this.isLoadingBot = true;
    this.botError = '';

    this.traderAlgoApi.getTradeBots(accountId).subscribe({
      next: bots => {
        if (this.selectedAccountId !== accountId) return;
        this.isLoadingBot = false;
        this.tradeBot = bots.find(b => b.tradingAccountId === accountId && b.backtestId === null) ?? null;
        if (this.tradeBot) this.applyTradeBotToDraft(this.tradeBot);
        else this.applyDefaultTradeBotDraft();
        this.cdr.markForCheck();
      },
      error: err => {
        if (this.selectedAccountId !== accountId) return;
        this.isLoadingBot = false;
        this.botError = this.extractError(err, 'Failed to load bot settings.');
        this.applyDefaultTradeBotDraft();
        this.cdr.markForCheck();
      },
    });
  }

  private persistTradeBot(): Observable<TradeBot> {
    if (this.selectedAccountId === null) throw new Error('Trading account is required.');
    const symbol = this.findSymbol(this.tradeBotDraft.symbolCode);
    const interval = this.findInterval(this.tradeBotDraft.intervalCode);
    if (!symbol || !interval || !this.tradeBotDraft.quantity) {
      throw new Error('Valid bot settings are required.');
    }

    const payload: CreateTradeBotRequest = {
      tradingAccountId: this.selectedAccountId,
      tradingStrategyId: this.tradeBotDraft.tradingStrategyId ?? this.strategies[0]?.id ?? 0,
      symbolCode: symbol.code,
      intervalCode: interval.code,
      symbolId: symbol.id,
      intervalId: interval.id,
      quantity: this.tradeBotDraft.quantity,
      stopLoss: this.tradeBotDraft.stopLoss ?? null,
      takeProfit: this.tradeBotDraft.takeProfit ?? null,
      breakeven: this.tradeBotDraft.breakeven ?? null,
      breakevenStop: this.tradeBotDraft.breakevenStop ?? null,
      isNySessionOnly: this.tradeBotDraft.isNySessionOnly,
      dailyProfitGoal: this.tradeBotDraft.dailyProfitGoal ?? null,
      maxLossesPerDay: this.tradeBotDraft.maxLossesPerDay ?? null,
      maxCandlesPerTrade: this.tradeBotDraft.maxCandlesPerTrade ?? null,
      fee: this.tradeBotDraft.fee ?? null,
      isEnabled: this.tradeBot?.isEnabled ?? false,
    };

    if (!this.tradeBot) return this.traderAlgoApi.createTradeBot(payload);

    const update: UpdateTradeBotRequest = {
      tradingStrategyId: payload.tradingStrategyId,
      symbolCode: payload.symbolCode,
      intervalCode: payload.intervalCode,
      symbolId: payload.symbolId,
      intervalId: payload.intervalId,
      quantity: payload.quantity,
      stopLoss: payload.stopLoss ?? null,
      takeProfit: payload.takeProfit ?? null,
      breakeven: payload.breakeven ?? null,
      breakevenStop: payload.breakevenStop ?? null,
      isNySessionOnly: payload.isNySessionOnly ?? false,
      delay: payload.delay ?? false,
      dailyProfitGoal: payload.dailyProfitGoal ?? null,
      maxLossesPerDay: payload.maxLossesPerDay ?? null,
      maxCandlesPerTrade: payload.maxCandlesPerTrade ?? null,
      fee: payload.fee ?? null,
      isEnabled: this.tradeBot.isEnabled,
    };
    return this.traderAlgoApi.updateTradeBot(this.tradeBot.id, update);
  }

  private connectTradeBotEvents(): void {
    this.botEventSubscription?.unsubscribe();
    if (!this.showTradeBot || this.selectedAccountId === null) return;
    const accountId = this.selectedAccountId;
    this.botEventSubscription = this.tradeBotEvents.connect(accountId).subscribe({
      next: event => {
        if (this.selectedAccountId !== accountId || event.tradingAccountId !== accountId) return;
        this.handleTradeBotEvent(event);
        this.cdr.markForCheck();
      },
    });
  }

  private handleTradeBotEvent(event: TradeBotEvent): void {
    switch (event.type) {
      case 'TradeOpened':
        this.botMessage = event.tradeId ? `Bot opened trade #${event.tradeId}.` : 'Bot opened a trade.';
        this.loadActiveTrade();
        this.refreshSelectedAccount();
        break;
      case 'TradeClosed':
        this.botMessage = event.tradeId ? `Trade #${event.tradeId} closed.` : 'Trade closed.';
        this.loadActiveTrade();
        this.refreshSelectedAccount();
        break;
      case 'BotEnabled':
      case 'BotDisabled':
        this.loadTradeBot();
        break;
      case 'TradeBracketUpdate':
        if (this.activeTrade && event.tradeId === this.activeTrade.id) {
          this.activeTrade = {
            ...this.activeTrade,
            stopLoss: event.stopLoss !== undefined ? event.stopLoss : this.activeTrade.stopLoss,
            takeProfit: event.takeProfit !== undefined ? event.takeProfit : this.activeTrade.takeProfit,
          };
          this.syncAdjustDraft(this.activeTrade);
        }
        break;
      case 'SignalIgnored':
        this.botMessage = event.reason ? `Signal ignored: ${event.reason}.` : 'Signal ignored.';
        break;
    }
  }

  private startPolling(): void {
    this.stopPolling();
    if (!this.hasActiveTrade || this.selectedAccountId === null) return;
    const accountId = this.selectedAccountId;

    const poll = () => {
      if (this.selectedAccountId !== accountId) return;
      this.traderAlgoApi.getActiveTrades(accountId).subscribe({
        next: trades => {
          if (this.selectedAccountId !== accountId) return;
          const trade = trades[0] ?? null;
          this.activeTrade = trade;
          this.tradeChange.emit(trade);
          if (trade?.status === 'Pending' || trade?.status === 'Active') {
            this.syncAdjustDraft(trade);
            this.pollingTimer = setTimeout(poll, this.POLL_MS);
          } else {
            this.activeTrade = null;
            this.tradeChange.emit(null);
            this.refreshSelectedAccount();
          }
          this.cdr.markForCheck();
        },
        error: () => {
          this.pollingTimer = setTimeout(poll, this.POLL_MS);
        },
      });
    };

    this.pollingTimer = setTimeout(poll, this.POLL_MS);
  }

  private stopPolling(): void {
    if (this.pollingTimer !== undefined) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = undefined;
    }
  }

  private clearTradeState(): void {
    this.stopPolling();
    this.activeTrade = null;
    this.tradeError = '';
    this.tradeMessage = '';
  }

  private clearBotState(): void {
    this.botEventSubscription?.unsubscribe();
    this.tradeBot = null;
    this.isLoadingBot = false;
    this.isSavingBot = false;
    this.isTogglingBot = false;
    this.botError = '';
    this.botMessage = '';
    this.applyDefaultTradeBotDraft();
  }

  private refreshSelectedAccount(): void {
    if (this.selectedAccountId === null) return;
    const accountId = this.selectedAccountId;
    this.traderAlgoApi.getTradingAccount(accountId).subscribe({
      next: account => {
        if (this.selectedAccountId !== accountId) return;
        const index = this.accounts.findIndex(a => a.id === account.id);
        if (index >= 0) {
          this.accounts = [...this.accounts.slice(0, index), account, ...this.accounts.slice(index + 1)];
        } else if (account.isActive) {
          this.accounts = [...this.accounts, account];
        }
        this.cdr.markForCheck();
      },
      error: err => console.error('Failed to refresh trading account.', err),
    });
  }

  private applyTradeBotToDraft(bot: TradeBot): void {
    this.tradeBotDraft = {
      tradingStrategyId: bot.tradingStrategyId ?? this.strategies.find(s => s.name === bot.tradingStrategy)?.id ?? null,
      symbolCode: this.tradeBotSymbolCode(bot),
      intervalCode: this.tradeBotIntervalCode(bot),
      quantity: bot.quantity,
      stopLoss: bot.stopLoss,
      takeProfit: bot.takeProfit,
      breakeven: bot.breakeven,
      breakevenStop: bot.breakevenStop ?? null,
      isNySessionOnly: bot.isNySessionOnly,
      dailyProfitGoal: bot.dailyProfitGoal,
      maxLossesPerDay: bot.maxLossesPerDay,
      maxCandlesPerTrade: bot.maxCandlesPerTrade,
      fee: bot.fee ?? null,
    };
  }

  private applyDefaultTradeBotDraft(): void {
    const symbolCode = this.selectedSymbol || this.symbols[0]?.code || '';
    this.tradeBotDraft = {
      tradingStrategyId: this.strategies[0]?.id ?? null,
      symbolCode,
      intervalCode:
        this.defaultInterval || this.intervals.find(i => i.isDefault)?.code || this.intervals[0]?.code || '',
      quantity: 1,
      stopLoss: 100,
      takeProfit: 100,
      breakeven: null,
      breakevenStop: null,
      isNySessionOnly: isAlpacaSymbol(this.findSymbol(symbolCode)),
      dailyProfitGoal: null,
      maxLossesPerDay: null,
      maxCandlesPerTrade: null,
      fee: null,
    };
  }

  private tradeBotSymbolCode(bot: TradeBot): string {
    return (
      bot.symbolCode ??
      bot.symbol?.code ??
      this.symbols.find(s => s.id === bot.symbolId)?.code ??
      this.selectedSymbol ??
      ''
    );
  }

  private tradeBotIntervalCode(bot: TradeBot): string {
    return (
      bot.intervalCode ??
      bot.interval?.code ??
      this.intervals.find(i => i.id === bot.intervalId)?.code ??
      this.defaultInterval ??
      ''
    );
  }

  private findSymbol(code: string): SymbolResponse | undefined {
    return this.symbols.find(s => s.code === code);
  }

  private findInterval(code: string): IntervalResponse | undefined {
    return this.intervals.find(i => i.code === code);
  }

  private extractError(err: unknown, fallback: string): string {
    if (typeof err === 'object' && err !== null) {
      const e = err as Record<string, unknown>;
      if (typeof e['error'] === 'string') return e['error'];
      if (typeof e['message'] === 'string') return e['message'];
    }
    return fallback;
  }
}
