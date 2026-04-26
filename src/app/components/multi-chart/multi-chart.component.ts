import { Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { IntervalResponse } from '../../structures/interval';
import { SymbolResponse } from '../../structures/symbol';

interface PaneConfig {
  symbol: string;
  interval: string;
}

@Component({
  selector: 'app-multi-chart',
  templateUrl: './multi-chart.component.html',
  styleUrls: ['./multi-chart.component.css'],
})
export class MultiChartComponent implements OnInit {
  symbols: SymbolResponse[] = [];
  intervals: IntervalResponse[] = [];
  panes: PaneConfig[] = [];

  constructor(private readonly traderAlgoApi: TraderAlgoApiService) {}

  ngOnInit(): void {
    forkJoin({
      symbols: this.traderAlgoApi.getSymbols(),
      intervals: this.traderAlgoApi.getIntervals(),
    }).subscribe({
      next: ({ symbols, intervals }) => {
        const activeSymbols = symbols.filter(s => s.isActive);
        const activeIntervals = intervals.filter(i => i.isActive);
        const defaultInterval = intervals.find(i => i.isDefault) ?? intervals[0];

        this.symbols = activeSymbols;
        this.intervals = activeIntervals;
        this.panes = Array.from({ length: 4 }, (_, i) => ({
          symbol: activeSymbols[i % activeSymbols.length]?.code ?? '',
          interval: defaultInterval.code,
        }));
      },
      error: err => console.error('Failed to load chart configuration.', err),
    });
  }
}
