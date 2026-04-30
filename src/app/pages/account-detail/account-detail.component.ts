import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  AreaSeries,
  createChart,
  IChartApi,
  ISeriesApi,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
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
export class AccountDetailComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('pnlChartContainer', { static: true })
  private readonly pnlContainer!: ElementRef<HTMLDivElement>;

  account: TradingAccount | null = null;
  trades: Trade[] = [];
  isLoading = true;
  editingName = false;
  nameInput = '';
  saving = false;

  private accountId!: number;
  private chart?: IChartApi;
  private areaSeries?: ISeriesApi<'Area'>;
  private chartReady = false;
  private pendingPnlData: { time: Time; value: number }[] | null = null;
  private tradeBotEventSubscription?: Subscription;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly api: TraderAlgoApiService,
    private readonly tradeBotEvents: TradeBotEventsService,
    private readonly ngZone: NgZone,
  ) {}

  ngOnInit(): void {
    this.accountId = Number(this.route.snapshot.paramMap.get('id'));
    this.connectTradeBotEvents();
    this.loadAccountDetail();
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
        this.tryRenderChart();
      },
      error: () => { this.isLoading = false; },
    });
  }

  ngAfterViewInit(): void {
    this.ngZone.runOutsideAngular(() => {
      this.chart = createChart(this.pnlContainer.nativeElement, {
        autoSize: true,
        layout: { background: { color: '#141414' }, textColor: '#d1d4dc' },
        grid: { vertLines: { color: '#1e2130' }, horzLines: { color: '#1e2130' } },
        rightPriceScale: { borderColor: '#2a2d3a' },
        timeScale: { borderColor: '#2a2d3a', timeVisible: true, secondsVisible: false },
        crosshair: {
          vertLine: { labelBackgroundColor: '#2962ff' },
          horzLine: { labelBackgroundColor: '#2962ff' },
        },
      });

      this.areaSeries = this.chart.addSeries(AreaSeries, {
        lineColor: '#2962ff',
        topColor: '#2962ff33',
        bottomColor: 'transparent',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
      });
    });

    this.chartReady = true;
    if (this.pendingPnlData) {
      this.applyPnlData(this.pendingPnlData);
      this.pendingPnlData = null;
    }
  }

  ngOnDestroy(): void {
    this.tradeBotEventSubscription?.unsubscribe();
    this.chart?.remove();
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

  private tryRenderChart(): void {
    const data = this.buildPnlData();
    if (this.chartReady) {
      this.applyPnlData(data);
    } else {
      this.pendingPnlData = data;
    }
  }

  private buildPnlData(): { time: Time; value: number }[] {
    const closed = this.trades
      .filter(t => t.status === 'Closed' && t.closedAt !== null)
      .sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0));

    let cumulative = 0;
    return closed.map(t => {
      cumulative += t.pnl ?? 0;
      return { time: this.toChartTime(t.closedAt!) as Time, value: cumulative };
    });
  }

  private applyPnlData(data: { time: Time; value: number }[]): void {
    this.ngZone.runOutsideAngular(() => {
      this.areaSeries?.setData(data);
      if (data.length > 0) this.chart?.timeScale().fitContent();
    });
  }

  private toChartTime(ms: number): UTCTimestamp {
    return (ms > 9_999_999_999 ? Math.floor(ms / 1000) : ms) as UTCTimestamp;
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
