import { Component, OnInit } from '@angular/core';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { MlTrainingRun } from '../../structures/ml-training';

@Component({
  selector: 'app-ml-page',
  templateUrl: './ml-page.component.html',
  styleUrls: ['./ml-page.component.css'],
})
export class MlPageComponent implements OnInit {
  runs: MlTrainingRun[] = [];
  readonly trackById = (_: number, run: MlTrainingRun): number => run.id;
  isLoading = true;

  constructor(private readonly api: TraderAlgoApiService) {}

  ngOnInit(): void {
    this.api.getTrainingRuns().subscribe({
      next: data => { this.runs = data; this.isLoading = false; },
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
