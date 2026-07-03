import { AfterViewInit, Component, ElementRef, EventEmitter, Input, NgZone, OnDestroy, Output, ViewChild } from '@angular/core';
import {
  CandlestickData,
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  HistogramData,
  HistogramSeries,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  LineSeries,
  LineStyle,
  LogicalRange,
  MouseEventParams,
  SeriesMarker,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import { forkJoin, Subscription } from 'rxjs';
import { LiveChartDataService } from '../../services/live-chart-data.service';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { SessionMarkersPlugin } from '../../chart-plugins/session-markers.plugin';
import { VolumeProfilePlugin } from '../../chart-plugins/volume-profile.plugin';
import { CHART_COLORS } from '../../shared/chart-theme';
import { CandleResponse, CandleWithIndicatorsResponse } from '../../structures/candle';
import { IntervalResponse } from '../../structures/interval';
import { SessionOhlcvResponse, VolumeProfileLevel } from '../../structures/session';
import { Trade } from '../../structures/trade';

@Component({
  standalone: false,
  selector: 'app-chart',
  templateUrl: './chart.component.html',
  styleUrls: ['./chart.component.css'],
})
export class ChartComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chartContainer', { static: true })
  private readonly chartContainer!: ElementRef<HTMLDivElement>;

  @Input() availableIntervals: IntervalResponse[] = [];

  @Input() set symbol(value: string) {
    const changed = value !== this.selectedSymbol;
    this.selectedSymbol = value;
    if (changed && this.chart) this.resetAndReload();
  }

  @Input() set symbolProvider(value: number) {
    const newAlpaca = value === 1;
    if (newAlpaca !== this._isAlpaca) {
      this._isAlpaca = newAlpaca;
      if (this.chart) this.ngZone.runOutsideAngular(() => this.applyDeltaPaneVisibility());
    }
  }

  @Input() set initialInterval(value: string) { this.selectedInterval = value; }

  @Input() set activeTrade(trade: Trade | null) {
    this._activeTrade = trade;
    if (!this.chart) return;
    this.ngZone.runOutsideAngular(() => {
      if (this.shouldRenderTradeLines(trade)) {
        this.renderTradeLines(trade);
      } else {
        this.clearTradeLines();
      }
    });
  }

  @Input() set adjustMode(mode: 'stopLoss' | 'takeProfit' | null) {
    this._adjustMode = mode;
  }

  @Input() set tradingAccountId(id: number | null) {
    if (id === this._tradingAccountId) return;
    this._tradingAccountId = id;
    this.loadTradeHistory();
  }

  @Output() priceSelected = new EventEmitter<number>();

  // ── Public UI state ──────────────────────────────────────────────────────────
  selectedInterval = '';
  isLoading        = true;
  statusMessage    = 'Loading candles...';
  liveStatus       = '';
  isConnected      = false;
  predictingKey: string | null = null;
  showCurrentSession  = true;
  showPreviousSession = true;
  showVolumeProfile   = true;
  showVolume          = true;
  showRsi             = true;
  showMacd            = true;
  showPredictMenu     = false;
  showTrades          = true;

  readonly trackByIntervalId = (_: number, interval: IntervalResponse): number => interval.id;
  readonly trackByKronosKey = (_: number, button: { key: string }): string => button.key;

  readonly kronosButtons = [
    { label: 'Mini P',  key: 'mini-precise'  },
    { label: 'Mini D',  key: 'mini-diverse'  },
    { label: 'Small P', key: 'small-precise' },
    { label: 'Small D', key: 'small-diverse' },
    { label: 'Base P',  key: 'base-precise'  },
    { label: 'Base D',  key: 'base-diverse'  },
  ];

  // ── Private state ────────────────────────────────────────────────────────────
  private selectedSymbol = '';
  private _isAlpaca = false;
  private _activeTrade: Trade | null = null;
  protected _adjustMode: 'stopLoss' | 'takeProfit' | null = null;
  private _tradingAccountId: number | null = null;
  private historyTrades: Trade[] = [];

  private chart?: IChartApi;
  private series?: ISeriesApi<'Candlestick'>;
  private predictSeries?: ISeriesApi<'Candlestick'>;
  private sma20Series?: ISeriesApi<'Line'>;
  private sma100Series?: ISeriesApi<'Line'>;
  private volumeSeries?: ISeriesApi<'Histogram'>;
  private deltaSeries?: ISeriesApi<'Histogram'>;
  private rsiSeries?: ISeriesApi<'Line'>;
  private rsiMaSeries?: ISeriesApi<'Line'>;
  private rsiOverbought?: ISeriesApi<'Line'>;
  private rsiOversold?: ISeriesApi<'Line'>;
  private macdLineSeries?:   ISeriesApi<'Line'>;
  private macdSignalSeries?: ISeriesApi<'Line'>;
  private macdHistSeries?:   ISeriesApi<'Histogram'>;
  private macdZeroSeries?:   ISeriesApi<'Line'>;

  private volumeProfilePlugin?: VolumeProfilePlugin;
  private tradeMarkersPlugin?: ISeriesMarkersPluginApi<Time>;

  private tradeEntryLine?: IPriceLine;
  private tradeSlLine?:    IPriceLine;
  private tradeTpLine?:    IPriceLine;

  private currentSession?:  SessionOhlcvResponse;
  private previousSession?: SessionOhlcvResponse;
  private sessionLines: IPriceLine[] = [];

  private loadedCandles:       CandleWithIndicatorsResponse[] = [];
  private loadedVolumeProfile: VolumeProfileLevel[]           = [];

  private candlesSubscription?:       Subscription;
  private liveCandlesSubscription?:   Subscription;
  private predictSubscription?:       Subscription;
  private sessionSubscription?:       Subscription;
  private volumeProfileSubscription?: Subscription;
  private tradeHistorySubscription?:  Subscription;

  private lookback      = 100;
  private isLoadingMore = false;

  private readonly timeLabelFormatter = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  private readonly dateTimeLabelFormatter = new Intl.DateTimeFormat(undefined, {
    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });

  private readonly onVisibleRangeChange = (range: LogicalRange | null) => {
    if (!range || this.isLoadingMore || this.isLoading) return;
    if (range.from <= 0) this.ngZone.run(() => this.loadMoreCandles());
  };

  private readonly onChartClickHandler = (params: MouseEventParams<Time>) => {
    this.ngZone.run(() => {
      if (!this._adjustMode || !params.point || !this.series) return;
      const price = this.series.coordinateToPrice(params.point.y);
      if (price !== null) this.priceSelected.emit(price);
    });
  };

  constructor(
    private readonly ngZone: NgZone,
    private readonly traderAlgoApi: TraderAlgoApiService,
    private readonly liveChartData: LiveChartDataService,
  ) {}

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  ngAfterViewInit(): void {
    this.ngZone.runOutsideAngular(() => {
      this.chart = createChart(this.chartContainer.nativeElement, {
        autoSize: true,
        layout: { background: { color: CHART_COLORS.background }, textColor: CHART_COLORS.text },
        grid: { vertLines: { color: 'transparent' }, horzLines: { color: 'transparent' } },
        rightPriceScale: { borderColor: CHART_COLORS.border },
        timeScale: {
          borderColor: CHART_COLORS.border,
          timeVisible: true,
          secondsVisible: false,
          tickMarkFormatter: (time: Time) => this.formatTimeLabel(time),
        },
        localization: { timeFormatter: (time: Time) => this.formatDateTimeLabel(time) },
        crosshair: {
          vertLine: { labelBackgroundColor: CHART_COLORS.accent },
          horzLine: { labelBackgroundColor: CHART_COLORS.accent },
        },
      });

      // Pane 0 — candlesticks + SMAs
      this.series = this.chart.addSeries(CandlestickSeries, {
        upColor: CHART_COLORS.bullish, downColor: CHART_COLORS.bearish, borderVisible: false,
        wickUpColor: CHART_COLORS.bullish, wickDownColor: CHART_COLORS.bearish,
      });
      this.series.attachPrimitive(new SessionMarkersPlugin());
      this.volumeProfilePlugin = new VolumeProfilePlugin();
      this.series.attachPrimitive(this.volumeProfilePlugin);

      this.predictSeries = this.chart.addSeries(CandlestickSeries, {
        upColor: CHART_COLORS.accent, downColor: CHART_COLORS.highlight, borderVisible: false,
        wickUpColor: CHART_COLORS.accent, wickDownColor: CHART_COLORS.highlight,
      });

      const smaOpts = { priceScaleId: 'right', lineWidth: 1, priceLineVisible: false, lastValueVisible: false } as const;
      this.sma20Series  = this.chart.addSeries(LineSeries, { ...smaOpts, color: CHART_COLORS.sma20 });
      this.sma100Series = this.chart.addSeries(LineSeries, { ...smaOpts, color: CHART_COLORS.sma100 });

      // Pane 1 — volume + delta
      this.volumeSeries = this.chart.addSeries(HistogramSeries, { priceScaleId: 'volume', priceFormat: { type: 'volume' } }, 1);
      this.volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.7, bottom: 0 } });

      this.deltaSeries = this.chart.addSeries(HistogramSeries, {
        priceScaleId: 'delta',
        priceFormat: { type: 'custom', formatter: (p: number) => p.toFixed(1) + '%', minMove: 0.1 },
      }, 1);
      this.deltaSeries.priceScale().applyOptions({ scaleMargins: { top: 0, bottom: 0.7 }, visible: true });

      // Pane 2 — RSI
      const rsiOpts = { priceScaleId: 'rsi', lineWidth: 1, priceLineVisible: false, lastValueVisible: false } as const;
      this.rsiSeries     = this.chart.addSeries(LineSeries, { ...rsiOpts, color: CHART_COLORS.rsi, lastValueVisible: true }, 2);
      this.rsiMaSeries   = this.chart.addSeries(LineSeries, { ...rsiOpts, color: CHART_COLORS.highlight, lastValueVisible: true }, 2);
      this.rsiOverbought = this.chart.addSeries(LineSeries, { ...rsiOpts, color: CHART_COLORS.bearish }, 2);
      this.rsiOversold   = this.chart.addSeries(LineSeries, { ...rsiOpts, color: CHART_COLORS.bullish }, 2);
      this.rsiSeries.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });

      // Pane 3 — MACD
      const macdOpts = { priceScaleId: 'macd', lineWidth: 1, priceLineVisible: false, lastValueVisible: false } as const;
      this.macdLineSeries   = this.chart.addSeries(LineSeries,      { ...macdOpts, color: CHART_COLORS.accent, lastValueVisible: true }, 3);
      this.macdSignalSeries = this.chart.addSeries(LineSeries,      { ...macdOpts, color: CHART_COLORS.macdSignal, lastValueVisible: true }, 3);
      this.macdHistSeries   = this.chart.addSeries(HistogramSeries, { priceScaleId: 'macd', priceLineVisible: false, lastValueVisible: false }, 3);
      this.macdZeroSeries   = this.chart.addSeries(LineSeries,      { ...macdOpts, color: CHART_COLORS.zeroLine }, 3);
      this.macdLineSeries.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });

      this.chart.timeScale().subscribeVisibleLogicalRangeChange(this.onVisibleRangeChange);
      this.chart.subscribeClick(this.onChartClickHandler);
    });

    this.loadCandles();
    this.loadSessionOhlcv();
    this.loadVolumeProfile();
    this.streamLiveCandles();
    this.loadTradeHistory();

    if (this.shouldRenderTradeLines(this._activeTrade)) {
      this.ngZone.runOutsideAngular(() => this.renderTradeLines(this._activeTrade!));
    }
  }

  ngOnDestroy(): void {
    this.candlesSubscription?.unsubscribe();
    this.liveCandlesSubscription?.unsubscribe();
    this.predictSubscription?.unsubscribe();
    this.sessionSubscription?.unsubscribe();
    this.volumeProfileSubscription?.unsubscribe();
    this.tradeHistorySubscription?.unsubscribe();
    this.chart?.timeScale().unsubscribeVisibleLogicalRangeChange(this.onVisibleRangeChange);
    this.chart?.unsubscribeClick(this.onChartClickHandler);
    this.chart?.remove();
  }

  // ── Toolbar actions ──────────────────────────────────────────────────────────

  onIntervalChange(code: string): void {
    if (code === this.selectedInterval) return;
    this.selectedInterval = code;
    this.resetAndReload();
  }

  toggleCurrentSession(): void {
    this.showCurrentSession = !this.showCurrentSession;
    this.ngZone.runOutsideAngular(() => this.applyVisibleSessionLines());
  }

  togglePreviousSession(): void {
    this.showPreviousSession = !this.showPreviousSession;
    this.ngZone.runOutsideAngular(() => this.applyVisibleSessionLines());
  }

  toggleVolumeProfile(): void {
    this.showVolumeProfile = !this.showVolumeProfile;
    this.ngZone.runOutsideAngular(() =>
      this.volumeProfilePlugin?.setData(this.showVolumeProfile ? this.loadedVolumeProfile : []),
    );
  }

  toggleVolume(): void {
    this.showVolume = !this.showVolume;
    this.ngZone.runOutsideAngular(() => {
      const pane = this.chart?.panes()[1];
      if (pane) pane.setStretchFactor(this.showVolume ? 1 : 0);
    });
  }

  toggleRsi(): void {
    this.showRsi = !this.showRsi;
    this.ngZone.runOutsideAngular(() => {
      const pane = this.chart?.panes()[2];
      if (pane) pane.setStretchFactor(this.showRsi ? 1 : 0);
    });
  }

  toggleMacd(): void {
    this.showMacd = !this.showMacd;
    this.ngZone.runOutsideAngular(() => {
      const pane = this.chart?.panes()[3];
      if (pane) pane.setStretchFactor(this.showMacd ? 1 : 0);
    });
  }

  toggleTrades(): void {
    this.showTrades = !this.showTrades;
    this.ngZone.runOutsideAngular(() => this.applyTradeMarkers());
  }

  togglePredictMenu(): void {
    this.showPredictMenu = !this.showPredictMenu;
  }

  runPredict(key: string): void {
    if (this.predictingKey !== null) return;
    this.showPredictMenu = false;
    this.predictingKey = key;
    this.predictSubscription?.unsubscribe();
    this.predictSubscription = this.kronosRequest(key).subscribe({
      next: candles => {
        this.predictingKey = null;
        this.ngZone.runOutsideAngular(() => this.predictSeries?.setData(candles.map(c => this.toChartCandle(c))));
      },
      error: err => { console.error('Predict request failed.', err); this.predictingKey = null; },
    });
  }

  // ── Trade lines ──────────────────────────────────────────────────────────────

  private renderTradeLines(trade: Trade): void {
    this.clearTradeLines();
    if (!this.series) return;

    const entryRef = trade.entryPrice ?? trade.requestedPrice;
    const isBuy    = trade.side === 'Buy';

    if (entryRef !== null && entryRef !== undefined) {
      this.tradeEntryLine = this.series.createPriceLine({
        price: Number(entryRef),
        color: CHART_COLORS.highlight,
        lineWidth: 1, lineStyle: LineStyle.Solid,
        axisLabelVisible: true, title: `${trade.side} Entry`,
      });
    }

    if (trade.stopLoss !== null && trade.stopLoss !== undefined && entryRef !== null && entryRef !== undefined) {
      const slPrice = isBuy
        ? Number(entryRef) - Number(trade.stopLoss)
        : Number(entryRef) + Number(trade.stopLoss);
      this.tradeSlLine = this.series.createPriceLine({
        price: slPrice,
        color: CHART_COLORS.bearish, lineWidth: 1, lineStyle: LineStyle.Solid,
        axisLabelVisible: true, title: 'SL',
      });
    }
    if (trade.takeProfit !== null && trade.takeProfit !== undefined && entryRef !== null && entryRef !== undefined) {
      const tpPrice = isBuy
        ? Number(entryRef) + Number(trade.takeProfit)
        : Number(entryRef) - Number(trade.takeProfit);
      this.tradeTpLine = this.series.createPriceLine({
        price: tpPrice,
        color: CHART_COLORS.bullish, lineWidth: 1, lineStyle: LineStyle.Solid,
        axisLabelVisible: true, title: 'TP',
      });
    }
  }

  private clearTradeLines(): void {
    if (this.tradeEntryLine) { this.series?.removePriceLine(this.tradeEntryLine); this.tradeEntryLine = undefined; }
    if (this.tradeSlLine)    { this.series?.removePriceLine(this.tradeSlLine);    this.tradeSlLine    = undefined; }
    if (this.tradeTpLine)    { this.series?.removePriceLine(this.tradeTpLine);    this.tradeTpLine    = undefined; }
  }

  private shouldRenderTradeLines(trade: Trade | null): trade is Trade {
    return !!trade
      && trade.symbolCode === this.selectedSymbol
      && (trade.status === 'Pending' || trade.status === 'Active');
  }

  // ── Trade history markers ────────────────────────────────────────────────────

  private loadTradeHistory(): void {
    this.tradeHistorySubscription?.unsubscribe();
    if (this._tradingAccountId === null) {
      this.historyTrades = [];
      this.ngZone.runOutsideAngular(() => this.applyTradeMarkers());
      return;
    }
    this.tradeHistorySubscription = this.traderAlgoApi.getTradeHistory(this._tradingAccountId).subscribe({
      next: trades => {
        this.historyTrades = trades;
        this.ngZone.runOutsideAngular(() => this.applyTradeMarkers());
      },
      error: err => console.error('Failed to load trade history.', err),
    });
  }

  private applyTradeMarkers(): void {
    if (!this.series) return;
    if (!this.tradeMarkersPlugin) {
      this.tradeMarkersPlugin = createSeriesMarkers(this.series, []);
    }
    if (!this.showTrades) {
      this.tradeMarkersPlugin.setMarkers([]);
      return;
    }
    const markers: SeriesMarker<Time>[] = [];
    const symbolTrades = this.historyTrades.filter(
      t => t.symbolCode === this.selectedSymbol && t.status === 'Closed',
    );
    for (const t of symbolTrades) {
      if (t.openedAt !== null && t.entryPrice !== null) {
        const isBuy = t.side === 'Buy';
        markers.push({
          time: this.toChartTime(t.openedAt) as Time,
          position: isBuy ? 'belowBar' : 'aboveBar',
          color: isBuy ? CHART_COLORS.bullish : CHART_COLORS.bearish,
          shape: isBuy ? 'arrowUp' : 'arrowDown',
          text: t.side,
          size: 1,
        });
      }
      if (t.closedAt !== null && t.closedPrice !== null) {
        const isBuy = t.side === 'Buy';
        const pnlText = t.pnl !== null ? ` ${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}` : '';
        markers.push({
          time: this.toChartTime(t.closedAt) as Time,
          position: isBuy ? 'aboveBar' : 'belowBar',
          color: CHART_COLORS.sma20,
          shape: 'circle',
          text: `✕${pnlText}`,
          size: 1,
        });
      }
    }
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    this.tradeMarkersPlugin.setMarkers(markers);
  }

  // ── Load / reset ─────────────────────────────────────────────────────────────

  private resetAndReload(): void {
    this.candlesSubscription?.unsubscribe();
    this.liveCandlesSubscription?.unsubscribe();
    this.predictSubscription?.unsubscribe();
    this.sessionSubscription?.unsubscribe();
    this.volumeProfileSubscription?.unsubscribe();
    this.tradeHistorySubscription?.unsubscribe();

    this.isLoading           = true;
    this.isConnected         = false;
    this.isLoadingMore       = false;
    this.lookback            = 100;
    this.loadedCandles       = [];
    this.loadedVolumeProfile = [];
    this.currentSession      = undefined;
    this.previousSession     = undefined;
    this.statusMessage       = 'Loading candles...';
    this.liveStatus          = '';
    this.predictingKey       = null;

    this.ngZone.runOutsideAngular(() => {
      this.series?.setData([]);
      this.predictSeries?.setData([]);
      this.sma20Series?.setData([]);
      this.sma100Series?.setData([]);
      this.volumeSeries?.setData([]);
      this.deltaSeries?.setData([]);
      this.rsiSeries?.setData([]);
      this.rsiMaSeries?.setData([]);
      this.rsiOverbought?.setData([]);
      this.rsiOversold?.setData([]);
      this.macdLineSeries?.setData([]);
      this.macdSignalSeries?.setData([]);
      this.macdHistSeries?.setData([]);
      this.macdZeroSeries?.setData([]);
      this.volumeProfilePlugin?.setData([]);
      this.clearSessionLines();
      this.tradeMarkersPlugin?.setMarkers([]);
      if (this.shouldRenderTradeLines(this._activeTrade)) {
        this.renderTradeLines(this._activeTrade!);
      } else {
        this.clearTradeLines();
      }
    });

    this.loadCandles();
    this.loadSessionOhlcv();
    this.loadVolumeProfile();
    this.streamLiveCandles();
    this.loadTradeHistory();
  }

  private loadCandles(): void {
    this.candlesSubscription = this.traderAlgoApi
      .getCandlesWithIndicators({ symbol: this.selectedSymbol, interval: this.selectedInterval, lookback: this.lookback })
      .subscribe({
        next: candles => {
          this.isLoading = false;
          if (candles.length === 0) { this.statusMessage = 'No data available.'; return; }
          this.statusMessage = '';
          this.loadedCandles = candles;
          this.ngZone.runOutsideAngular(() => this.applyAllSeries(candles, true));
        },
        error: err => {
          console.error('Failed to load candles.', err);
          this.isLoading    = false;
          this.statusMessage = 'Failed to load candles.';
        },
      });
  }

  private loadMoreCandles(): void {
    this.isLoadingMore = true;
    this.lookback += 100;
    this.traderAlgoApi
      .getCandlesWithIndicators({ symbol: this.selectedSymbol, interval: this.selectedInterval, lookback: this.lookback })
      .subscribe({
        next: candles => {
          this.isLoadingMore = false;
          if (candles.length === 0) return;
          this.loadedCandles = candles;
          this.ngZone.runOutsideAngular(() => this.applyAllSeries(candles, false));
        },
        error: err => { console.error('Failed to load more candles.', err); this.isLoadingMore = false; },
      });
  }

  private applyAllSeries(candles: CandleWithIndicatorsResponse[], fitContent: boolean): void {
    this.series?.setData(candles.map(c => this.toChartCandle(c)));
    this.applyTradeMarkers();
    this.sma20Series?.setData(
      candles.filter(c => c.sma_20 !== null).map(c => ({ time: this.toChartTime(c.time), value: c.sma_20! })),
    );
    this.sma100Series?.setData(
      candles.filter(c => c.sma_100 !== null).map(c => ({ time: this.toChartTime(c.time), value: c.sma_100! })),
    );
    this.volumeSeries?.setData(candles.map(c => this.toVolumeBar(c)));
    this.deltaSeries?.setData(this._isAlpaca ? [] : candles.map(c => this.toDeltaBar(c)));
    this.applyDeltaPaneVisibility();
    this.rsiSeries?.setData(
      candles.filter(c => c.rsi !== null).map(c => ({ time: this.toChartTime(c.time), value: c.rsi! })),
    );
    this.rsiMaSeries?.setData(
      candles.filter(c => c.rsi_smooth !== null).map(c => ({ time: this.toChartTime(c.time), value: c.rsi_smooth! })),
    );

    const rsiCandles = candles.filter(c => c.rsi !== null);
    if (rsiCandles.length >= 2) {
      this.rsiOverbought?.setData([
        { time: this.toChartTime(rsiCandles[0].time),                value: 70 },
        { time: this.toChartTime(rsiCandles[rsiCandles.length - 1].time), value: 70 },
      ]);
      this.rsiOversold?.setData([
        { time: this.toChartTime(rsiCandles[0].time),                value: 30 },
        { time: this.toChartTime(rsiCandles[rsiCandles.length - 1].time), value: 30 },
      ]);
    }

    this.macdLineSeries?.setData(
      candles.filter(c => c.macd_line !== null).map(c => ({ time: this.toChartTime(c.time), value: c.macd_line! })),
    );
    this.macdSignalSeries?.setData(
      candles.filter(c => c.macd_signal_line !== null).map(c => ({ time: this.toChartTime(c.time), value: c.macd_signal_line! })),
    );
    this.macdHistSeries?.setData(this.toMacdHistogram(candles));

    const macdCandles = candles.filter(c => c.macd_line !== null);
    if (macdCandles.length >= 2) {
      this.macdZeroSeries?.setData([
        { time: this.toChartTime(macdCandles[0].time),                value: 0 },
        { time: this.toChartTime(macdCandles[macdCandles.length - 1].time), value: 0 },
      ]);
    }

    if (fitContent) this.chart?.timeScale().fitContent();
  }

  private streamLiveCandles(): void {
    this.liveCandlesSubscription = this.liveChartData
      .streamCandlesWithIndicators(this.selectedSymbol, this.selectedInterval)
      .subscribe({
        next: candle => {
          this.isConnected = true;
          this.liveStatus  = 'Live';
          this.upsertLiveCandle(candle);
          const t = this.toChartTime(candle.time);
          this.ngZone.runOutsideAngular(() => {
            this.series?.update(this.toChartCandle(candle));
            if (candle.sma_20 !== null)         this.sma20Series?.update({ time: t, value: candle.sma_20 });
            if (candle.sma_100 !== null)        this.sma100Series?.update({ time: t, value: candle.sma_100 });
            this.volumeSeries?.update(this.toVolumeBar(candle));
            if (!this._isAlpaca) this.deltaSeries?.update(this.toDeltaBar(candle));
            if (candle.rsi !== null) {
              this.rsiSeries?.update({ time: t, value: candle.rsi });
              this.rsiOverbought?.update({ time: t, value: 70 });
              this.rsiOversold?.update({ time: t, value: 30 });
            }
            if (candle.rsi_smooth !== null)      this.rsiMaSeries?.update({ time: t, value: candle.rsi_smooth });
            if (candle.macd_line !== null)        this.macdLineSeries?.update({ time: t, value: candle.macd_line });
            if (candle.macd_signal_line !== null) this.macdSignalSeries?.update({ time: t, value: candle.macd_signal_line });
            if (candle.macd_histogram !== null) {
              const prev = this.loadedCandles.at(-2)?.macd_histogram ?? null;
              const h = candle.macd_histogram;
              const growing = prev === null || (h >= 0 ? h >= prev : h <= prev);
              const color = h >= 0
                ? (growing ? CHART_COLORS.bullish : CHART_COLORS.bullishFaded)
                : (growing ? CHART_COLORS.bearish : CHART_COLORS.bearishFaded);
              this.macdHistSeries?.update({ time: t, value: h, color });
              this.macdZeroSeries?.update({ time: t, value: 0 });
            }
          });
        },
        error: err => { console.error('Live candle stream error.', err); this.isConnected = false; this.liveStatus = 'Disconnected'; },
        complete: () => { this.isConnected = false; this.liveStatus = 'Stream closed'; },
      });
  }

  private loadVolumeProfile(): void {
    this.volumeProfileSubscription = this.traderAlgoApi
      .getSessionVolumeProfile(this.selectedSymbol)
      .subscribe({
        next: levels => {
          this.loadedVolumeProfile = levels;
          if (this.showVolumeProfile) this.ngZone.runOutsideAngular(() => this.volumeProfilePlugin?.setData(levels));
        },
        error: err => console.error('Failed to load volume profile.', err),
      });
  }

  private loadSessionOhlcv(): void {
    this.sessionSubscription = forkJoin({
      current:  this.traderAlgoApi.getCurrentSessionOhlcv(this.selectedSymbol),
      previous: this.traderAlgoApi.getPreviousSessionOhlcv(this.selectedSymbol),
    }).subscribe({
      next: ({ current, previous }) => {
        this.currentSession  = current;
        this.previousSession = previous;
        this.ngZone.runOutsideAngular(() => this.applyVisibleSessionLines());
      },
      error: err => console.error('Failed to load session OHLCV.', err),
    });
  }

  // ── Session lines ────────────────────────────────────────────────────────────

  private applyVisibleSessionLines(): void {
    this.clearSessionLines();
    if (this.showCurrentSession && this.currentSession)
      this.applySessionLines(this.currentSession, 'D', CHART_COLORS.sessionCurrent, LineStyle.Solid);
    if (this.showPreviousSession && this.previousSession)
      this.applySessionLines(this.previousSession, 'P', CHART_COLORS.sessionPrevious, LineStyle.Dashed);
  }

  private applySessionLines(s: SessionOhlcvResponse, prefix: string, color: string, lineStyle: LineStyle): void {
    if (!this.series) return;
    for (const [key, price] of [['O', s.open], ['H', s.high], ['L', s.low], ['C', s.close]] as [string, number][]) {
      this.sessionLines.push(
        this.series.createPriceLine({ price, color, title: `${prefix}-${key}`, lineStyle, lineWidth: 1, axisLabelVisible: true }),
      );
    }
  }

  private clearSessionLines(): void {
    for (const line of this.sessionLines) this.series?.removePriceLine(line);
    this.sessionLines = [];
  }

  // ── Mapping helpers ──────────────────────────────────────────────────────────

  private toChartCandle(c: CandleWithIndicatorsResponse | CandleResponse): CandlestickData<Time> {
    return { time: this.toChartTime(c.time), open: c.open, high: c.high, low: c.low, close: c.close };
  }

  private toVolumeBar(c: CandleWithIndicatorsResponse): HistogramData<Time> {
    const takerTotal = c.taker_buy_base_asset_volume + c.taker_sell_base_asset_volume;
    const vol = takerTotal > 0 ? takerTotal : c.volume;
    return { time: this.toChartTime(c.time), value: vol, color: c.close >= c.open ? CHART_COLORS.bullish : CHART_COLORS.bearish };
  }

  private toDeltaBar(c: CandleWithIndicatorsResponse): HistogramData<Time> {
    const buy   = c.taker_buy_base_asset_volume;
    const sell  = c.taker_sell_base_asset_volume;
    const total = buy + sell;
    const delta = total > 0 ? ((buy - sell) / total) * 100 : 0;
    return { time: this.toChartTime(c.time), value: delta, color: delta >= 0 ? CHART_COLORS.bullish : CHART_COLORS.bearish };
  }

  private applyDeltaPaneVisibility(): void {
    this.deltaSeries?.priceScale().applyOptions({ visible: !this._isAlpaca });
  }

  private toMacdHistogram(candles: CandleWithIndicatorsResponse[]): HistogramData<Time>[] {
    const result: HistogramData<Time>[] = [];
    for (const c of candles) {
      if (c.macd_histogram === null) continue;
      const h    = c.macd_histogram;
      const prev = result.at(-1)?.value ?? null;
      const growing = prev === null || (h >= 0 ? h >= prev : h <= prev);
      const color = h >= 0
        ? (growing ? CHART_COLORS.bullish : CHART_COLORS.bullishFaded)
        : (growing ? CHART_COLORS.bearish : CHART_COLORS.bearishFaded);
      result.push({ time: this.toChartTime(c.time), value: h, color });
    }
    return result;
  }

  private upsertLiveCandle(candle: CandleWithIndicatorsResponse): void {
    const last = this.loadedCandles.at(-1);
    if (last?.time === candle.time) this.loadedCandles[this.loadedCandles.length - 1] = candle;
    else this.loadedCandles.push(candle);
  }

  private toChartTime(time: number): UTCTimestamp {
    return (time > 9_999_999_999 ? Math.floor(time / 1000) : time) as UTCTimestamp;
  }

  private formatTimeLabel(time: Time): string     { return this.timeLabelFormatter.format(this.toDate(time)); }
  private formatDateTimeLabel(time: Time): string { return this.dateTimeLabelFormatter.format(this.toDate(time)); }

  private toDate(time: Time): Date {
    if (typeof time === 'number') return new Date(time * 1000);
    if (typeof time === 'string') return new Date(`${time}T00:00:00Z`);
    return new Date(Date.UTC(time.year, time.month - 1, time.day));
  }

  private kronosRequest(key: string): ReturnType<TraderAlgoApiService['kronosMiniPrecise']> {
    const s = this.selectedSymbol, i = this.selectedInterval;
    switch (key) {
      case 'mini-precise':  return this.traderAlgoApi.kronosMiniPrecise(s, i);
      case 'mini-diverse':  return this.traderAlgoApi.kronosMiniDiverse(s, i);
      case 'small-precise': return this.traderAlgoApi.kronosSmallPrecise(s, i);
      case 'small-diverse': return this.traderAlgoApi.kronosSmallDiverse(s, i);
      case 'base-precise':  return this.traderAlgoApi.kronosBasePrecise(s, i);
      case 'base-diverse':  return this.traderAlgoApi.kronosBaseDiverse(s, i);
      default: throw new Error(`Unknown kronos variant: ${key}`);
    }
  }
}
