import { Component, OnInit, ViewChild } from '@angular/core';
import { forkJoin } from 'rxjs';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { TradePanelComponent } from '../../components/trade-panel/trade-panel.component';
import { IntervalResponse } from '../../structures/interval';
import { SymbolResponse } from '../../structures/symbol';
import { Trade } from '../../structures/trade';

@Component({
  selector: 'app-algo-trader-page',
  templateUrl: './algo-trader.component.html',
  styleUrls: ['./algo-trader.component.css'],
})
export class AlgoTraderPageComponent implements OnInit {
  @ViewChild(TradePanelComponent) private readonly tradePanel!: TradePanelComponent;

  symbols:         SymbolResponse[]  = [];
  intervals:       IntervalResponse[] = [];
  selectedSymbol   = '';
  defaultInterval  = '';
  activeTrade:     Trade | null = null;
  adjustMode:      'stopLoss' | 'takeProfit' | null = null;

  constructor(private readonly traderAlgoApi: TraderAlgoApiService) {}

  ngOnInit(): void {
    forkJoin({
      symbols:   this.traderAlgoApi.getSymbols(),
      intervals: this.traderAlgoApi.getIntervals(),
    }).subscribe({
      next: ({ symbols, intervals }) => {
        const activeSymbols   = symbols.filter(s => s.isActive);
        const activeIntervals = intervals.filter(i => i.isActive);
        this.symbols         = activeSymbols;
        this.intervals       = activeIntervals;
        this.selectedSymbol  = (activeSymbols.find(s => s.isDefault)   ?? activeSymbols[0])?.code   ?? '';
        this.defaultInterval = (activeIntervals.find(i => i.isDefault) ?? activeIntervals[0])?.code ?? '';
      },
      error: err => console.error('Failed to load algo-trader configuration.', err),
    });
  }

  onSymbolChange(symbol: string): void {
    this.selectedSymbol = symbol;
  }

  onTradeChange(trade: Trade | null): void {
    this.activeTrade = trade;
  }

  onAdjustModeChange(mode: 'stopLoss' | 'takeProfit' | null): void {
    this.adjustMode = mode;
  }

  onPriceSelected(price: number): void {
    this.tradePanel.applyAdjustment(price);
  }
}
