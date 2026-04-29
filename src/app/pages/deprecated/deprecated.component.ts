import { Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { IntervalResponse } from '../../structures/interval';
import { SymbolResponse } from '../../structures/symbol';

@Component({
  selector: 'app-deprecated-page',
  templateUrl: './deprecated.component.html',
  styleUrls: ['./deprecated.component.css'],
})
export class DeprecatedPageComponent implements OnInit {
  symbols:        SymbolResponse[]  = [];
  intervals:      IntervalResponse[] = [];
  selectedSymbol  = '';
  defaultInterval = '';

  constructor(private readonly traderAlgoApi: TraderAlgoApiService) {}

  ngOnInit(): void {
    forkJoin({
      symbols:   this.traderAlgoApi.getSymbols(),
      intervals: this.traderAlgoApi.getIntervals(),
    }).subscribe({
      next: ({ symbols, intervals }) => {
        const activeSymbols   = symbols.filter(s => s.isActive);
        const activeIntervals = intervals.filter(i => i.isActive);
        this.symbols        = activeSymbols;
        this.intervals      = activeIntervals;
        this.selectedSymbol  = (activeSymbols.find(s => s.isDefault)   ?? activeSymbols[0])?.code   ?? '';
        this.defaultInterval = (activeIntervals.find(i => i.isDefault) ?? activeIntervals[0])?.code ?? '';
      },
      error: err => console.error('Failed to load deprecated page configuration.', err),
    });
  }
}
