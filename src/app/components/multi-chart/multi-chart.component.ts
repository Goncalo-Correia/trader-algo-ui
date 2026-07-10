import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { forkJoin } from 'rxjs';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { IntervalResponse } from '../../structures/interval';
import { SymbolResponse } from '../../structures/symbol';
import { Trade } from '../../structures/trade';
import { ChartsChartComponent } from '../charts-chart/charts-chart.component';
import { TradePanelComponent } from '../trade-panel/trade-panel.component';

interface PaneConfig {
  interval: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-multi-chart',
  templateUrl: './multi-chart.component.html',
  styleUrls: ['./multi-chart.component.css'],
  imports: [ChartsChartComponent, TradePanelComponent],
})
export class MultiChartComponent implements OnInit {
  private readonly traderAlgoApi = inject(TraderAlgoApiService);
  private readonly cdr = inject(ChangeDetectorRef);

  symbols: SymbolResponse[] = [];
  intervals: IntervalResponse[] = [];
  panes: PaneConfig[] = [];

  selectedSymbol = '';
  activeTrade: Trade | null = null;
  configError: string | null = null;

  ngOnInit(): void {
    forkJoin({
      symbols: this.traderAlgoApi.getSymbols(),
      intervals: this.traderAlgoApi.getIntervals(),
    }).subscribe({
      next: ({ symbols, intervals }) => {
        const activeSymbols = symbols.filter(s => s.isActive);
        const activeIntervals = intervals.filter(i => i.isActive);

        // Without at least one active symbol and interval there is nothing to
        // chart — bail out with an empty state instead of dereferencing an
        // undefined default and crashing the whole page.
        if (activeSymbols.length === 0 || activeIntervals.length === 0) {
          this.configError =
            'No active symbols or intervals are configured. Add and activate at least one of each to view charts.';
          this.cdr.markForCheck();
          return;
        }

        const defaultInterval = activeIntervals.find(i => i.isDefault) ?? activeIntervals[0];
        const defaultSymbol = activeSymbols.find(s => s.isDefault) ?? activeSymbols[0];

        this.symbols = activeSymbols;
        this.intervals = activeIntervals;

        this.panes = Array.from({ length: 4 }, (_, i) => ({
          interval: activeIntervals[i]?.code ?? defaultInterval.code,
        }));

        this.selectedSymbol = defaultSymbol.code;
        this.cdr.markForCheck();
      },
      error: err => {
        console.error('Failed to load chart configuration.', err);
        this.configError = 'Failed to load chart configuration. Please try again.';
        this.cdr.markForCheck();
      },
    });
  }

  onSymbolChange(symbol: string): void {
    this.selectedSymbol = symbol;
  }

  onTradeChange(trade: Trade | null): void {
    this.activeTrade = trade;
  }
}
