import { Component, OnInit } from '@angular/core';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { BacktestSummary } from '../../structures/backtest';

@Component({
  selector: 'app-backtests-page',
  templateUrl: './backtests-page.component.html',
  styleUrls: ['./backtests-page.component.css'],
})
export class BacktestsPageComponent implements OnInit {
  backtests: BacktestSummary[] = [];
  isLoading = true;

  constructor(private readonly api: TraderAlgoApiService) {}

  ngOnInit(): void {
    this.api.getBacktests().subscribe({
      next: data => { this.backtests = data; this.isLoading = false; },
      error: ()   => { this.isLoading = false; },
    });
  }

  pnlClass(pnl: number | null): string {
    if (pnl === null) return '';
    return pnl >= 0 ? 'positive' : 'negative';
  }

  statusClass(status: string): string {
    switch (status) {
      case 'Completed': return 'status-completed';
      case 'Running':   return 'status-running';
      case 'Pending':   return 'status-pending';
      case 'Cancelled': return 'status-cancelled';
      case 'Failed':    return 'status-failed';
      default:          return '';
    }
  }

  formatDate(unixSeconds: number): string {
    return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
    });
  }

  formatTs(unixMs: number | null): string {
    if (unixMs === null) return '—';
    return new Date(unixMs).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
    });
  }
}
