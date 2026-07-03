import { Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { IntervalResponse } from '../../structures/interval';
import { SymbolResponse } from '../../structures/symbol';
import { Trade } from '../../structures/trade';

@Component({
  standalone: false,
  selector: 'app-algo-trader-page',
  templateUrl: './algo-trader.component.html',
  styleUrls: ['./algo-trader.component.css'],
})
export class AlgoTraderPageComponent implements OnInit {
  symbols:          SymbolResponse[]  = [];
  intervals:        IntervalResponse[] = [];
  selectedSymbol    = '';
  defaultInterval   = '';
  activeTrade:      Trade | null = null;
  tradingAccountId: number | null = null;

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

  get selectedSymbolProvider(): number {
    return this.symbols.find(s => s.code === this.selectedSymbol)?.provider ?? 0;
  }

  onSymbolChange(symbol: string): void {
    this.selectedSymbol = symbol;
  }

  onTradeChange(trade: Trade | null): void {
    this.activeTrade = trade;
  }

  onAccountChange(accountId: number | null): void {
    this.tradingAccountId = accountId;
  }
}
