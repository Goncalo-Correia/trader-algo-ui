import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { Subscription } from 'rxjs';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { SymbolResponse } from '../../structures/symbol';
import {
  CreateTradeRequest,
  Trade,
  TradeSide,
  TradeOrderType,
  UpdateTradeRequest,
} from '../../structures/trade';

interface TradeDraft {
  side:       TradeSide;
  orderType:  TradeOrderType;
  quantity:   number | null;
  limitPrice: number | null;
  stopLoss:   number | null;
  takeProfit: number | null;
}

@Component({
  selector: 'app-trade-panel',
  templateUrl: './trade-panel.component.html',
  styleUrls: ['./trade-panel.component.css'],
})
export class TradePanelComponent implements OnDestroy {
  // ── Inputs ──────────────────────────────────────────────────────────────────

  @Input() symbols: SymbolResponse[] = [];

  @Input() set initialSymbol(value: string) {
    if (!value || value === this.selectedSymbol) return;
    this.selectedSymbol = value;
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

  selectedSymbol = '';

  tradeDraft: TradeDraft = {
    side:       'Buy',
    orderType:  'Market',
    quantity:   null,
    limitPrice: null,
    stopLoss:   null,
    takeProfit: null,
  };

  activeTrade:       Trade | null = null;
  isSubmittingTrade  = false;
  isStoppingTrade    = false;
  isUpdatingTrade    = false;
  tradeError         = '';
  tradeMessage       = '';
  adjustMode: 'stopLoss' | 'takeProfit' | null = null;

  private subscription?: Subscription;
  private pollingTimer?: ReturnType<typeof setTimeout>;
  private readonly POLL_MS = 3_000;

  constructor(private readonly traderAlgoApi: TraderAlgoApiService) {}

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
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

  // ── Form computed ────────────────────────────────────────────────────────────

  get tradeFormValid(): boolean {
    if (!this.tradeDraft.quantity || this.tradeDraft.quantity <= 0) return false;
    if (this.tradeDraft.orderType === 'Limit') {
      if (!this.tradeDraft.limitPrice || this.tradeDraft.limitPrice <= 0) return false;
    }
    return true;
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
    this.activeTrade = mode === 'stopLoss'
      ? { ...this.activeTrade, stopLoss:   offset }
      : { ...this.activeTrade, takeProfit: offset };
    this.tradeChange.emit(this.activeTrade);

    const payload: UpdateTradeRequest = mode === 'stopLoss' ? { stopLoss: offset } : { takeProfit: offset };

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

  private loadActiveTrade(): void {
    if (!this.selectedSymbol) return;
    this.traderAlgoApi.getActiveTrades(this.selectedSymbol).subscribe({
      next: trades => {
        const trade = trades[0] ?? null;
        this.activeTrade = trade;
        this.tradeChange.emit(trade);
        if (trade) this.startPolling();
      },
      error: err => console.error('Failed to load active trade.', err),
    });
  }

  private startPolling(): void {
    this.stopPolling();
    if (!this.hasActiveTrade) return;

    const poll = () => {
      this.traderAlgoApi.getActiveTrades(this.selectedSymbol).subscribe({
        next: trades => {
          const trade = trades[0] ?? null;
          this.activeTrade = trade;
          this.tradeChange.emit(trade);
          if (trade?.status === 'Pending' || trade?.status === 'Active') {
            this.pollingTimer = setTimeout(poll, this.POLL_MS);
          } else {
            this.activeTrade  = null;
            this.tradeMessage = 'Trade closed.';
            this.tradeChange.emit(null);
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

  private extractError(err: unknown, fallback: string): string {
    if (typeof err === 'object' && err !== null) {
      const e = err as Record<string, unknown>;
      if (typeof e['error']   === 'string') return e['error'];
      if (typeof e['message'] === 'string') return e['message'];
    }
    return fallback;
  }
}
