import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, EMPTY, exhaustMap, Subject, takeUntil, timer } from 'rxjs';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { SymbolResponse } from '../../structures/symbol';
import { CreateTradeRequest, Trade, TradeOrderType, TradeSide, UpdateTradeRequest } from '../../structures/trade';
import { TradingAccount } from '../../structures/trading-account';
import { FormsModule } from '@angular/forms';
import { NgClass, DecimalPipe } from '@angular/common';

/**
 * The charts-page trade panel — dedicated sibling of the algo/backtest panels.
 * Owns symbol/account selection, manual order entry, and the active-trade card.
 * No trade-bot configuration (that lives on the algo-trader panel).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-chart-trade-panel',
  templateUrl: './chart-trade-panel.component.html',
  styleUrls: ['./chart-trade-panel.component.css'],
  imports: [FormsModule, NgClass, DecimalPipe],
})
export class ChartTradePanelComponent implements OnInit, OnDestroy {
  private readonly traderAlgoApi = inject(TraderAlgoApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  // ── Inputs ──────────────────────────────────────────────────────────────────

  @Input() symbols: SymbolResponse[] = [];

  @Input() set initialSymbol(value: string) {
    if (!value || value === this.selectedSymbol) return;
    this.selectedSymbol = value;
    this.loadActiveTrade();
  }

  // ── Outputs ─────────────────────────────────────────────────────────────────

  @Output() symbolChange = new EventEmitter<string>();
  @Output() tradeChange = new EventEmitter<Trade | null>();
  @Output() accountChange = new EventEmitter<number | null>();

  // ── State ───────────────────────────────────────────────────────────────────

  accounts: TradingAccount[] = [];

  readonly trackBySymbolId = (_: number, symbol: SymbolResponse): number => symbol.id;
  readonly trackByAccountId = (_: number, account: TradingAccount): number => account.id;
  selectedAccountId: number | null = null;
  selectedSymbol = '';

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

  private readonly stopPolling$ = new Subject<void>();
  private readonly POLL_MS = 3_000;

  ngOnInit(): void {
    this.traderAlgoApi.getTradingAccounts().subscribe({
      next: accounts => {
        this.accounts = accounts.filter(a => a.isActive);
        if (this.accounts.length > 0) {
          this.selectedAccountId = this.accounts[0].id;
          this.accountChange.emit(this.selectedAccountId);
          this.loadActiveTrade();
        }
        this.cdr.markForCheck();
      },
      error: err => console.error('Failed to load trading accounts.', err),
    });
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  // ── Symbol / account ────────────────────────────────────────────────────────

  onSymbolChange(event: Event): void {
    const code = (event.target as HTMLSelectElement).value;
    if (!code || code === this.selectedSymbol) return;
    this.selectedSymbol = code;
    this.symbolChange.emit(code);
    this.clearTradeState();
    this.loadActiveTrade();
  }

  onAccountChange(accountId: number | null): void {
    if (accountId === this.selectedAccountId) return;
    this.selectedAccountId = accountId;
    this.accountChange.emit(accountId);
    this.clearTradeState();
    this.loadActiveTrade();
  }

  // ── Computed ─────────────────────────────────────────────────────────────────

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

  // ── Private ──────────────────────────────────────────────────────────────────

  private loadActiveTrade(): void {
    if (this.selectedAccountId === null) return;
    const accountId = this.selectedAccountId;
    this.traderAlgoApi
      .getActiveTrades(accountId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
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

  private startPolling(): void {
    this.stopPolling();
    if (!this.hasActiveTrade || this.selectedAccountId === null) return;
    const accountId = this.selectedAccountId;

    // `exhaustMap` skips a tick while a request is still in flight (no overlap);
    // `catchError`→`EMPTY` swallows a failed poll so the timer keeps ticking;
    // `takeUntil(stopPolling$)` + `takeUntilDestroyed` guarantee teardown.
    timer(this.POLL_MS, this.POLL_MS)
      .pipe(
        exhaustMap(() => this.traderAlgoApi.getActiveTrades(accountId).pipe(catchError(() => EMPTY))),
        takeUntil(this.stopPolling$),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(trades => {
        if (this.selectedAccountId !== accountId) {
          this.stopPolling();
          return;
        }
        const trade = trades[0] ?? null;
        if (trade?.status === 'Pending' || trade?.status === 'Active') {
          this.activeTrade = trade;
          this.tradeChange.emit(trade);
          this.syncAdjustDraft(trade);
        } else {
          this.activeTrade = null;
          this.tradeChange.emit(null);
          this.refreshSelectedAccount();
          this.stopPolling();
        }
        this.cdr.markForCheck();
      });
  }

  private stopPolling(): void {
    this.stopPolling$.next();
  }

  private clearTradeState(): void {
    this.stopPolling();
    this.activeTrade = null;
    this.tradeError = '';
    this.tradeMessage = '';
  }

  private refreshSelectedAccount(): void {
    if (this.selectedAccountId === null) return;
    const accountId = this.selectedAccountId;
    this.traderAlgoApi
      .getTradingAccount(accountId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
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

  private extractError(err: unknown, fallback: string): string {
    if (typeof err === 'object' && err !== null) {
      const e = err as Record<string, unknown>;
      if (typeof e['error'] === 'string') return e['error'];
      if (typeof e['message'] === 'string') return e['message'];
    }
    return fallback;
  }
}
