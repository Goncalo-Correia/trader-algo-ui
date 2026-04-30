import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Observable, Subscription, switchMap } from 'rxjs';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { TradeBotEventsService } from '../../services/trade-bot-events.service';
import { IntervalResponse } from '../../structures/interval';
import { SymbolResponse } from '../../structures/symbol';
import {
  CreateTradeBotRequest,
  TradeBot,
  TradeBotEvent,
  UpdateTradeBotRequest,
} from '../../structures/trade-bot';
import {
  CreateTradeRequest,
  Trade,
  TradeSide,
  TradeOrderType,
  UpdateTradeRequest,
} from '../../structures/trade';
import { TradingAccount } from '../../structures/trading-account';

interface TradeDraft {
  side:       TradeSide;
  orderType:  TradeOrderType;
  quantity:   number | null;
  limitPrice: number | null;
  stopLoss:   number | null;
  takeProfit: number | null;
}

interface TradeBotDraft {
  symbolCode:  string;
  intervalCode: string;
  orderType:   TradeOrderType;
  quantity:    number | null;
  stopLoss:    number | null;
  takeProfit:  number | null;
}

@Component({
  selector: 'app-trade-panel',
  templateUrl: './trade-panel.component.html',
  styleUrls: ['./trade-panel.component.css'],
})
export class TradePanelComponent implements OnInit, OnDestroy {
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

  /** Emitted whenever the user picks a different symbol. */
  @Output() symbolChange = new EventEmitter<string>();

  /** Emitted after every create / stop / update so the parent can sync chart lines. */
  @Output() tradeChange = new EventEmitter<Trade | null>();

  /** Emitted when the user enters or exits price-click adjust mode. */
  @Output() adjustModeChange = new EventEmitter<'stopLoss' | 'takeProfit' | null>();

  // ── State ───────────────────────────────────────────────────────────────────

  accounts: TradingAccount[] = [];
  selectedAccountId: number | null = null;
  selectedSymbol = '';

  tradeDraft: TradeDraft = {
    side:       'Buy',
    orderType:  'Market',
    quantity:   null,
    limitPrice: null,
    stopLoss:   null,
    takeProfit: null,
  };

  tradeBot: TradeBot | null = null;
  tradeBotDraft: TradeBotDraft = {
    symbolCode:   '',
    intervalCode: '',
    orderType:    'Market',
    quantity:     null,
    stopLoss:     null,
    takeProfit:   null,
  };

  isLoadingBot  = false;
  isSavingBot   = false;
  isTogglingBot = false;
  botError      = '';
  botMessage    = '';

  activeTrade:       Trade | null = null;
  isSubmittingTrade  = false;
  isStoppingTrade    = false;
  isUpdatingTrade    = false;
  tradeError         = '';
  tradeMessage       = '';
  adjustMode: 'stopLoss' | 'takeProfit' | null = null;

  private subscription?: Subscription;
  private botEventSubscription?: Subscription;
  private pollingTimer?: ReturnType<typeof setTimeout>;
  private readonly POLL_MS = 3_000;

  constructor(
    private readonly traderAlgoApi: TraderAlgoApiService,
    private readonly tradeBotEvents: TradeBotEventsService,
  ) {}

  ngOnInit(): void {
    this.traderAlgoApi.getTradingAccounts().subscribe({
      next: accounts => {
        this.accounts = accounts.filter(a => a.isActive);
        if (this.accounts.length > 0) {
          this.selectedAccountId = this.accounts[0].id;
          this.loadActiveTrade();
          if (this.showTradeBot) {
            this.loadTradeBot();
            this.connectTradeBotEvents();
          }
        }
      },
      error: err => console.error('Failed to load trading accounts.', err),
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.botEventSubscription?.unsubscribe();
    this.stopPolling();
  }

  // ── Symbol ───────────────────────────────────────────────────────────────────

  onSymbolChange(event: Event): void {
    const symbol = (event.target as HTMLSelectElement).value;
    if (!symbol || symbol === this.selectedSymbol) return;
    this.selectedSymbol = symbol;
    this.symbolChange.emit(symbol);
    this.clearTradeState();
    this.loadActiveTrade();
  }

  onAccountChange(accountId: number | null): void {
    if (accountId === this.selectedAccountId) return;
    this.selectedAccountId = accountId;
    this.clearTradeState();
    this.clearBotState();
    this.loadActiveTrade();
    if (this.showTradeBot) {
      this.loadTradeBot();
      this.connectTradeBotEvents();
    }
  }

  // ── Form computed ────────────────────────────────────────────────────────────

  get tradeFormValid(): boolean {
    if (this.selectedAccountId === null) return false;
    if (!this.tradeDraft.quantity || this.tradeDraft.quantity <= 0) return false;
    if (this.tradeDraft.orderType === 'Limit') {
      if (!this.tradeDraft.limitPrice || this.tradeDraft.limitPrice <= 0) return false;
    }
    return true;
  }

  get tradeBotFormValid(): boolean {
    if (this.selectedAccountId === null) return false;
    if (!this.showTradeBot) return false;
    if (!this.findSymbol(this.tradeBotDraft.symbolCode)) return false;
    if (!this.findInterval(this.tradeBotDraft.intervalCode)) return false;
    if (!this.tradeBotDraft.quantity || this.tradeBotDraft.quantity <= 0) return false;
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

  /** Absolute SL price level (entry ± offset). Null if SL or entry not set. */
  get absoluteSlPrice(): number | null {
    const t = this.activeTrade;
    if (!t || t.stopLoss === null || t.stopLoss === undefined) return null;
    const entry = t.entryPrice ?? t.requestedPrice;
    if (entry === null || entry === undefined) return null;
    return t.side === 'Buy'
      ? Number(entry) - Number(t.stopLoss)
      : Number(entry) + Number(t.stopLoss);
  }

  /** Absolute TP price level (entry ± offset). Null if TP or entry not set. */
  get absoluteTpPrice(): number | null {
    const t = this.activeTrade;
    if (!t || t.takeProfit === null || t.takeProfit === undefined) return null;
    const entry = t.entryPrice ?? t.requestedPrice;
    if (entry === null || entry === undefined) return null;
    return t.side === 'Buy'
      ? Number(entry) + Number(t.takeProfit)
      : Number(entry) - Number(t.takeProfit);
  }

  // ── Trade actions ────────────────────────────────────────────────────────────

  startTrade(): void {
    if (!this.tradeFormValid || this.isSubmittingTrade) return;
    if (this.selectedAccountId === null) return;
    this.isSubmittingTrade = true;
    this.tradeError   = '';
    this.tradeMessage = '';

    const d = this.tradeDraft;
    const request: CreateTradeRequest = {
      symbolCode:   this.selectedSymbol,
      side:         d.side,
      orderType:    d.orderType,
      quantity:     d.quantity!,
      ...(d.orderType === 'Limit' && d.limitPrice  ? { limitPrice:  d.limitPrice  } : {}),
      ...(d.stopLoss   ? { stopLoss:   d.stopLoss   } : {}),
      ...(d.takeProfit ? { takeProfit: d.takeProfit } : {}),
      tradingAccountId: this.selectedAccountId,
    };

    this.subscription = this.traderAlgoApi.createTrade(request).subscribe({
      next: trade => {
        this.isSubmittingTrade = false;
        this.activeTrade  = trade;
        this.tradeMessage = trade.status === 'Active' ? 'Trade opened.' : 'Order placed, waiting for fill.';
        this.tradeChange.emit(trade);
        this.startPolling();
      },
      error: err => {
        this.isSubmittingTrade = false;
        this.tradeError = this.extractError(err, 'Failed to start trade.');
      },
    });
  }

  stopActiveTrade(): void {
    if (!this.activeTrade || this.isStoppingTrade) return;
    this.isStoppingTrade = true;
    this.tradeError = '';

    this.subscription = this.traderAlgoApi.stopTrade(this.activeTrade.id).subscribe({
      next: () => {
        this.isStoppingTrade = false;
        this.stopPolling();
        this.activeTrade  = null;
        this.tradeMessage = 'Trade closed.';
        this.tradeChange.emit(null);
        this.refreshSelectedAccount();
      },
      error: err => {
        this.isStoppingTrade = false;
        this.tradeError = this.extractError(err, 'Failed to stop trade.');
      },
    });
  }

  enterAdjustMode(mode: 'stopLoss' | 'takeProfit'): void {
    const next = this.adjustMode === mode ? null : mode;
    this.adjustMode = next;
    this.adjustModeChange.emit(next);
  }

  cancelAdjustMode(): void {
    this.adjustMode = null;
    this.adjustModeChange.emit(null);
  }

  /**
   * Called by the parent when the user clicks a price on a chart while in adjust mode.
   */
  applyAdjustment(price: number): void {
    if (!this.activeTrade || !this.adjustMode) return;

    const entryRef = this.activeTrade.entryPrice ?? this.activeTrade.requestedPrice;
    if (entryRef === null || entryRef === undefined) return;

    // Convert clicked absolute price to a positive unit offset from entry.
    const offset  = Math.abs(price - Number(entryRef));
    const mode    = this.adjustMode;
    const prev    = mode === 'stopLoss' ? this.activeTrade.stopLoss : this.activeTrade.takeProfit;
    const tradeId = this.activeTrade.id;

    this.adjustMode = null;
    this.adjustModeChange.emit(null);
    this.isUpdatingTrade = true;
    this.tradeError = '';

    // Optimistic update (store offset, same as backend)
    const updatedTrade = mode === 'stopLoss'
      ? { ...this.activeTrade, stopLoss:   offset }
      : { ...this.activeTrade, takeProfit: offset };
    this.activeTrade = updatedTrade;
    this.tradeChange.emit(this.activeTrade);

    const payload: UpdateTradeRequest = {
      stopLoss:   updatedTrade.stopLoss,
      takeProfit: updatedTrade.takeProfit,
    };

    this.traderAlgoApi.updateTrade(tradeId, payload).subscribe({
      next: trade => {
        this.isUpdatingTrade = false;
        this.activeTrade     = trade;
        this.tradeChange.emit(trade);
      },
      error: err => {
        this.isUpdatingTrade = false;
        this.tradeError = this.extractError(err, 'Failed to update trade.');
        if (this.activeTrade) {
          this.activeTrade = mode === 'stopLoss'
            ? { ...this.activeTrade, stopLoss:   prev }
            : { ...this.activeTrade, takeProfit: prev };
          this.tradeChange.emit(this.activeTrade);
        }
      },
    });
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

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
      },
      error: err => {
        this.isSavingBot = false;
        this.botError = this.extractError(err, 'Failed to save bot settings.');
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
      },
      error: err => {
        this.isTogglingBot = false;
        this.botError = this.extractError(err, 'Failed to change bot state.');
      },
    });
  }

  private loadActiveTrade(): void {
    if (this.selectedAccountId === null) return;
    const accountId = this.selectedAccountId;
    this.traderAlgoApi.getActiveTrades(accountId).subscribe({
      next: trades => {
        if (this.selectedAccountId !== accountId) return;
        const trade = trades[0] ?? null;
        this.activeTrade = trade;
        this.tradeChange.emit(trade);
        if (trade) this.startPolling();
      },
      error: err => console.error('Failed to load active trade.', err),
    });
  }

  private loadTradeBot(): void {
    if (!this.showTradeBot) return;
    if (this.selectedAccountId === null) return;
    const accountId = this.selectedAccountId;
    this.isLoadingBot = true;
    this.botError = '';

    this.traderAlgoApi.getTradeBots().subscribe({
      next: bots => {
        if (this.selectedAccountId !== accountId) return;
        this.isLoadingBot = false;
        this.tradeBot = bots.find(bot => bot.tradingAccountId === accountId) ?? null;
        if (this.tradeBot) {
          this.applyTradeBotToDraft(this.tradeBot);
        } else {
          this.applyDefaultTradeBotDraft();
        }
      },
      error: err => {
        if (this.selectedAccountId !== accountId) return;
        this.isLoadingBot = false;
        this.botError = this.extractError(err, 'Failed to load bot settings.');
        this.applyDefaultTradeBotDraft();
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
      symbolCode: symbol.code,
      intervalCode: interval.code,
      symbolId: symbol.id,
      intervalId: interval.id,
      quantity: this.tradeBotDraft.quantity,
      orderType: this.tradeBotDraft.orderType,
      stopLoss: this.tradeBotDraft.stopLoss ?? null,
      takeProfit: this.tradeBotDraft.takeProfit ?? null,
    };

    if (!this.tradeBot) return this.traderAlgoApi.createTradeBot(payload);

    const update: UpdateTradeBotRequest = {
      symbolCode: payload.symbolCode,
      intervalCode: payload.intervalCode,
      symbolId: payload.symbolId,
      intervalId: payload.intervalId,
      quantity: payload.quantity,
      orderType: payload.orderType,
      stopLoss: payload.stopLoss,
      takeProfit: payload.takeProfit,
    };

    return this.traderAlgoApi.updateTradeBot(this.tradeBot.id, update);
  }

  private connectTradeBotEvents(): void {
    this.botEventSubscription?.unsubscribe();
    if (!this.showTradeBot) return;
    if (this.selectedAccountId === null) return;

    const accountId = this.selectedAccountId;
    this.botEventSubscription = this.tradeBotEvents.connect(accountId).subscribe({
      next: event => {
        if (this.selectedAccountId !== accountId || event.tradingAccountId !== accountId) return;
        this.handleTradeBotEvent(event);
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
      case 'SignalIgnored':
        this.botMessage = event.reason ? `Signal ignored: ${event.reason}.` : 'Signal ignored.';
        break;
    }
  }

  private startPolling(): void {
    this.stopPolling();
    if (!this.hasActiveTrade) return;

    const accountId = this.selectedAccountId;
    if (accountId === null) return;

    const poll = () => {
      if (this.selectedAccountId !== accountId) return;
      this.traderAlgoApi.getActiveTrades(accountId).subscribe({
        next: trades => {
          if (this.selectedAccountId !== accountId) return;
          const trade = trades[0] ?? null;
          this.activeTrade = trade;
          this.tradeChange.emit(trade);
          if (trade?.status === 'Pending' || trade?.status === 'Active') {
            this.pollingTimer = setTimeout(poll, this.POLL_MS);
          } else {
            this.activeTrade  = null;
            this.tradeMessage = 'Trade closed.';
            this.tradeChange.emit(null);
            this.refreshSelectedAccount();
          }
        },
        error: () => { this.pollingTimer = setTimeout(poll, this.POLL_MS); },
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
    this.activeTrade       = null;
    this.tradeError        = '';
    this.tradeMessage      = '';
    this.adjustMode        = null;
    this.isSubmittingTrade = false;
    this.isStoppingTrade   = false;
    this.isUpdatingTrade   = false;
    this.adjustModeChange.emit(null);
  }

  private clearBotState(): void {
    this.botEventSubscription?.unsubscribe();
    this.tradeBot      = null;
    this.isLoadingBot  = false;
    this.isSavingBot   = false;
    this.isTogglingBot = false;
    this.botError      = '';
    this.botMessage    = '';
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
          this.accounts = [
            ...this.accounts.slice(0, index),
            account,
            ...this.accounts.slice(index + 1),
          ];
        } else if (account.isActive) {
          this.accounts = [...this.accounts, account];
        }
      },
      error: err => console.error('Failed to refresh trading account.', err),
    });
  }

  private applyTradeBotToDraft(bot: TradeBot): void {
    this.tradeBotDraft = {
      symbolCode:   this.tradeBotSymbolCode(bot),
      intervalCode: this.tradeBotIntervalCode(bot),
      orderType:    bot.orderType,
      quantity:     bot.quantity,
      stopLoss:     bot.stopLoss,
      takeProfit:   bot.takeProfit,
    };
  }

  private applyDefaultTradeBotDraft(): void {
    this.tradeBotDraft = {
      symbolCode:   this.selectedSymbol || this.symbols[0]?.code || '',
      intervalCode: this.defaultInterval || this.intervals.find(i => i.isDefault)?.code || this.intervals[0]?.code || '',
      orderType:    'Market',
      quantity:     this.tradeBotDraft.quantity,
      stopLoss:     this.tradeBotDraft.stopLoss,
      takeProfit:   this.tradeBotDraft.takeProfit,
    };
  }

  private tradeBotSymbolCode(bot: TradeBot): string {
    return bot.symbolCode
      ?? bot.symbol?.code
      ?? this.symbols.find(symbol => symbol.id === bot.symbolId)?.code
      ?? this.selectedSymbol
      ?? '';
  }

  private tradeBotIntervalCode(bot: TradeBot): string {
    return bot.intervalCode
      ?? bot.interval?.code
      ?? this.intervals.find(interval => interval.id === bot.intervalId)?.code
      ?? this.defaultInterval
      ?? '';
  }

  private findSymbol(code: string): SymbolResponse | undefined {
    return this.symbols.find(symbol => symbol.code === code);
  }

  private findInterval(code: string): IntervalResponse | undefined {
    return this.intervals.find(interval => interval.code === code);
  }

  private extractError(err: unknown, fallback: string): string {
    if (typeof err === 'object' && err !== null) {
      const e = err as Record<string, unknown>;
      if (typeof e['error']   === 'string') return e['error'];
      if (typeof e['message'] === 'string') return e['message'];
    }
    return fallback;
  }
}
