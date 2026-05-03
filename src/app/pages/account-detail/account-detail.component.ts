import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import * as Highcharts from 'highcharts/highstock';
import { forkJoin, Subscription } from 'rxjs';
import { TradingAccount, UpdateTradingAccountRequest } from '../../structures/trading-account';
import { Trade } from '../../structures/trade';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { TradeBotEventsService } from '../../services/trade-bot-events.service';

const NAMES_OVERRIDE_KEY = 'trader-account-names';

@Component({
  selector: 'app-account-detail',
  templateUrl: './account-detail.component.html',
  styleUrls: ['./account-detail.component.css'],
})
export class AccountDetailComponent implements OnInit, OnDestroy {
  account: TradingAccount | null = null;
  trades: Trade[] = [];
  isLoading = true;
  editingName = false;
  nameInput = '';
  saving = false;

  pnlChartOptions: Highcharts.Options = this.buildEmptyChartOptions();

  private accountId!: number;
  private chartRef: Highcharts.Chart | null = null;
  private pendingData: [number, number][] | null = null;
  private tradeBotEventSubscription?: Subscription;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly api: TraderAlgoApiService,
    private readonly tradeBotEvents: TradeBotEventsService,
  ) {}

  ngOnInit(): void {
    this.accountId = Number(this.route.snapshot.paramMap.get('id'));
    this.connectTradeBotEvents();
    this.loadAccountDetail();
  }

  ngOnDestroy(): void {
    this.tradeBotEventSubscription?.unsubscribe();
  }

  onChartCreated(chart: Highcharts.Chart): void {
    this.chartRef = chart;
    if (this.pendingData) {
      chart.series[0].setData(this.pendingData);
      this.pendingData = null;
    }
  }

  private loadAccountDetail(): void {
    forkJoin({
      account: this.api.getTradingAccount(this.accountId),
      trades:  this.api.getTradeHistory(this.accountId),
    }).subscribe({
      next: ({ account, trades }) => {
        this.account = account;
        this.trades  = trades;
        this.isLoading = false;
        this.applyPnlData();
      },
      error: () => { this.isLoading = false; },
    });
  }

  get accountName(): string {
    return this.storedNames()[this.accountId] ?? this.account?.name ?? `Account #${this.accountId}`;
  }

  get sortedTrades(): Trade[] {
    return [...this.trades].sort((a, b) => a.id - b.id);
  }

  get totalPnl(): number {
    return this.trades
      .filter(t => t.status === 'Closed')
      .reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  }

  startEditName(): void {
    this.nameInput = this.accountName;
    this.editingName = true;
  }

  saveName(): void {
    const names = this.storedNames();
    const trimmed = this.nameInput.trim();
    if (trimmed && trimmed !== this.account?.name) {
      names[this.accountId] = trimmed;
    } else {
      delete names[this.accountId];
    }
    localStorage.setItem(NAMES_OVERRIDE_KEY, JSON.stringify(names));
    this.editingName = false;
  }

  cancelEditName(): void {
    this.editingName = false;
  }

  toggleActive(): void {
    if (!this.account || this.saving) return;
    const payload: UpdateTradingAccountRequest = { isActive: !this.account.isActive };
    this.saving = true;
    this.api.updateTradingAccount(this.accountId, payload).subscribe({
      next: updated => { this.account = updated; this.saving = false; },
      error: ()      => { this.saving = false; },
    });
  }

  getTradePnl(trade: Trade): number | null {
    if (trade.status === 'Closed') return trade.pnl ?? null;
    if (trade.status === 'Active') return trade.unrealizedPnl ?? null;
    return null;
  }

  formatTs(ms: number | null): string {
    if (ms === null) return '—';
    const d = new Date(ms > 9_999_999_999 ? ms : ms * 1000);
    return d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' })
      + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  private applyPnlData(): void {
    const data = this.buildPnlData();
    if (this.chartRef) {
      this.chartRef.series[0].setData(data);
    } else {
      this.pendingData = data;
    }
  }

  private buildPnlData(): [number, number][] {
    const closed = this.trades
      .filter(t => t.status === 'Closed' && t.closedAt !== null)
      .sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0));

    let cumulative = 0;
    return closed.map(t => {
      cumulative += t.pnl ?? 0;
      const ms = t.closedAt! > 9_999_999_999 ? t.closedAt! : t.closedAt! * 1000;
      return [ms, cumulative];
    });
  }

  private buildEmptyChartOptions(): Highcharts.Options {
    return {
      chart: {
        type: 'area',
        backgroundColor: '#141414',
        animation: false,
        style: { fontFamily: 'inherit' },
        margin: [8, 8, 30, 50],
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
        valuePrefix: '$',
        valueDecimals: 2,
      },
      series: [
        {
          type: 'area',
          name: 'Cumulative PNL',
          data: [],
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
  }

  private storedNames(): Record<number, string> {
    try { return JSON.parse(localStorage.getItem(NAMES_OVERRIDE_KEY) ?? '{}'); }
    catch { return {}; }
  }

  private connectTradeBotEvents(): void {
    this.tradeBotEventSubscription = this.tradeBotEvents.connect(this.accountId).subscribe({
      next: event => {
        if (event.tradingAccountId !== this.accountId) return;
        if (event.type === 'TradeOpened' || event.type === 'TradeClosed') {
          this.loadAccountDetail();
        }
      },
    });
  }
}
