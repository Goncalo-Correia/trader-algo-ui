import { Component, OnInit, ViewChild } from '@angular/core';
import { forkJoin } from 'rxjs';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { IntervalResponse } from '../../structures/interval';
import { SymbolResponse } from '../../structures/symbol';
import { Trade } from '../../structures/trade';
import { TradePanelComponent } from '../trade-panel/trade-panel.component';

interface PaneConfig {
  interval: string;
}

@Component({
  selector: 'app-multi-chart',
  templateUrl: './multi-chart.component.html',
  styleUrls: ['./multi-chart.component.css'],
})
export class MultiChartComponent implements OnInit {
  @ViewChild(TradePanelComponent) private readonly tradePanel!: TradePanelComponent;

  symbols:   SymbolResponse[]  = [];
  intervals: IntervalResponse[] = [];
  panes:     PaneConfig[]       = [];

  selectedSymbol = '';
  activeTrade:  Trade | null = null;
  adjustMode: 'stopLoss' | 'takeProfit' | null = null;

  constructor(private readonly traderAlgoApi: TraderAlgoApiService) {}

  ngOnInit(): void {
    forkJoin({
      symbols:   this.traderAlgoApi.getSymbols(),
      intervals: this.traderAlgoApi.getIntervals(),
    }).subscribe({
      next: ({ symbols, intervals }) => {
        const activeSymbols   = symbols.filter(s => s.isActive);
        const activeIntervals = intervals.filter(i => i.isActive);
        const defaultInterval = activeIntervals.find(i => i.isDefault) ?? activeIntervals[0];
        const defaultSymbol   = activeSymbols.find(s => s.isDefault) ?? activeSymbols[0];

        this.symbols   = activeSymbols;
        this.intervals = activeIntervals;

        // Assign a distinct interval to each of the 4 panes (cycling if needed)
        this.panes = Array.from({ length: 4 }, (_, i) => ({
          interval: activeIntervals[i]?.code ?? defaultInterval.code,
        }));

        this.selectedSymbol = defaultSymbol?.code ?? '';
      },
      error: err => console.error('Failed to load chart configuration.', err),
    });
  }

  // ── Event handlers from TradePanelComponent ─────────────────────────────────

  onSymbolChange(symbol: string): void {
    this.selectedSymbol = symbol;
  }

  onTradeChange(trade: Trade | null): void {
    this.activeTrade = trade;
  }

  onAdjustModeChange(mode: 'stopLoss' | 'takeProfit' | null): void {
    this.adjustMode = mode;
  }

  // ── Event handler from LightweightChartComponent ─────────────────────────────

  onPriceSelected(price: number): void {
    // Forward to the trade panel, which owns the update logic
    this.tradePanel.applyAdjustment(price);
    // adjustMode will be cleared by the trade panel via adjustModeChange output
  }
}
