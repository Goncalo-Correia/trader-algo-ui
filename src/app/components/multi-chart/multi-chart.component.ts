import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { IntervalResponse } from '../../structures/interval';
import { SymbolResponse } from '../../structures/symbol';
import { Trade } from '../../structures/trade';

interface PaneConfig {
  interval: string;
}

@Component({
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-multi-chart',
  templateUrl: './multi-chart.component.html',
  styleUrls: ['./multi-chart.component.css'],
})
export class MultiChartComponent implements OnInit {
  symbols:   SymbolResponse[]  = [];
  intervals: IntervalResponse[] = [];
  panes:     PaneConfig[]       = [];

  selectedSymbol = '';
  activeTrade:  Trade | null = null;

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

        this.panes = Array.from({ length: 4 }, (_, i) => ({
          interval: activeIntervals[i]?.code ?? defaultInterval.code,
        }));

        this.selectedSymbol = defaultSymbol?.code ?? '';
      },
      error: err => console.error('Failed to load chart configuration.', err),
    });
  }

  onSymbolChange(symbol: string): void {
    this.selectedSymbol = symbol;
  }

  onTradeChange(trade: Trade | null): void {
    this.activeTrade = trade;
  }
}
