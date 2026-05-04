import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import * as Highcharts from 'highcharts/highstock';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { BacktestDetail } from '../../structures/backtest';
import { Trade } from '../../structures/trade';

function darkThemeBase(): Highcharts.Options {
  return {
    chart: {
      backgroundColor: '#141414',
      animation: false,
      style: { fontFamily: 'inherit' },
    },
    title: { text: '' },
    credits: { enabled: false },
    legend: { enabled: false },
    xAxis: {
      type: 'datetime',
      gridLineColor: '#1e2130',
      lineColor: '#2a2d3a',
      tickColor: '#2a2d3a',
      labels: { style: { color: '#787b86', fontSize: '11px' } },
    },
    yAxis: {
      gridLineColor: '#1e2130',
      lineColor: '#2a2d3a',
      labels: { style: { color: '#787b86', fontSize: '11px' }, align: 'left', x: 4 },
      title: { text: '' },
    },
    tooltip: {
      backgroundColor: '#1e2130',
      borderColor: '#2a2d3a',
      style: { color: '#d1d4dc', fontSize: '12px' },
    },
  };
}

@Component({
  selector: 'app-backtest-detail',
  templateUrl: './backtest-detail.component.html',
  styleUrls: ['./backtest-detail.component.css'],
})
export class BacktestDetailComponent implements OnInit {
  detail: BacktestDetail | null = null;
  isLoading = true;
  deleting = false;
  private backtestId!: number;

  equityChartOptions: Highcharts.Options = {};
  candleChartOptions: Highcharts.Options = {};

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly api: TraderAlgoApiService,
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.backtestId = id;
    this.api.getBacktest(id).subscribe({
      next: detail => {
        this.detail = detail;
        this.isLoading = false;
        this.buildCharts(detail);
      },
      error: () => { this.isLoading = false; },
    });
  }

  deleteBacktest(): void {
    if (this.deleting || !confirm('Delete this backtest and all its trades?')) return;
    this.deleting = true;
    this.api.deleteBacktest(this.backtestId).subscribe({
      next: () => this.router.navigate(['/backtests']),
      error: () => { this.deleting = false; },
    });
  }

  get sortedTrades(): Trade[] {
    return [...(this.detail?.trades ?? [])].sort((a, b) => (a.openedAt ?? 0) - (b.openedAt ?? 0));
  }

  get pnlPositive(): boolean {
    return (this.detail?.pnl ?? 0) >= 0;
  }

  formatDate(unixSeconds: number): string {
    return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
    });
  }

  formatTs(ms: number | null): string {
    if (ms === null) return '—';
    const d = new Date(ms > 9_999_999_999 ? ms : ms * 1000);
    return d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' })
      + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  getTradePnl(trade: Trade): number | null {
    if (trade.status === 'Closed') return trade.pnl ?? null;
    return null;
  }

  private buildCharts(detail: BacktestDetail): void {
    this.equityChartOptions = {
      ...darkThemeBase(),
      series: [
        {
          type: 'area',
          name: 'Balance',
          data: detail.equityCurve.map(p => [p.time * 1000, Number(p.balance)]),
          color: '#2962ff',
          fillColor: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [
              [0, 'rgba(41,98,255,0.25)'],
              [1, 'rgba(41,98,255,0)'],
            ],
          },
          lineWidth: 2,
          marker: { enabled: false },
        } as Highcharts.SeriesAreaOptions,
      ],
    };

    const candleData: [number, number, number, number, number][] =
      detail.candles.map(c => [c.time * 1000, c.open, c.high, c.low, c.close]);

    const buyEntries = detail.trades
      .filter(t => t.side === 'Buy' && t.entryPrice !== null && t.openedAt !== null)
      .map(t => ({ x: this.msTime(t.openedAt!), y: Number(t.entryPrice), name: `Buy #${t.id}` }));

    const sellEntries = detail.trades
      .filter(t => t.side === 'Sell' && t.entryPrice !== null && t.openedAt !== null)
      .map(t => ({ x: this.msTime(t.openedAt!), y: Number(t.entryPrice), name: `Sell #${t.id}` }));

    const exits = detail.trades
      .filter(t => t.closedPrice !== null && t.closedAt !== null)
      .map(t => ({ x: this.msTime(t.closedAt!), y: Number(t.closedPrice), name: `Close #${t.id}` }));

    this.candleChartOptions = {
      ...darkThemeBase(),
      navigator: { enabled: false },
      scrollbar: { enabled: false },
      rangeSelector: { enabled: false },
      legend: { enabled: true, itemStyle: { color: '#787b86', fontSize: '11px' } },
      series: [
        {
          type: 'candlestick',
          name: 'Price',
          data: candleData,
          upColor: '#26a69a',
          upLineColor: '#26a69a',
          color: '#ef5350',
          lineColor: '#ef5350',
          dataGrouping: { enabled: false },
          showInLegend: false,
        } as Highcharts.SeriesCandlestickOptions,
        {
          type: 'scatter',
          name: 'Buy Entry',
          data: buyEntries,
          color: '#26a69a',
          marker: { symbol: 'triangle', radius: 6 },
          tooltip: { pointFormat: '{point.name}: {point.y:.4f}' },
        } as Highcharts.SeriesScatterOptions,
        {
          type: 'scatter',
          name: 'Sell Entry',
          data: sellEntries,
          color: '#ef5350',
          marker: { symbol: 'triangle-down', radius: 6 },
          tooltip: { pointFormat: '{point.name}: {point.y:.4f}' },
        } as Highcharts.SeriesScatterOptions,
        {
          type: 'scatter',
          name: 'Exit',
          data: exits,
          color: '#f59e0b',
          marker: { symbol: 'diamond', radius: 5 },
          tooltip: { pointFormat: '{point.name}: {point.y:.4f}' },
        } as Highcharts.SeriesScatterOptions,
      ],
    };
  }

  private msTime(ts: number): number {
    return ts > 9_999_999_999 ? ts : ts * 1000;
  }
}
