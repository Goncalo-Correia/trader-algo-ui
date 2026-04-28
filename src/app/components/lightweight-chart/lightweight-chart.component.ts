import { AfterViewInit, Component, ElementRef, EventEmitter, Input, NgZone, OnDestroy, Output, ViewChild } from '@angular/core';
import {
  CandlestickData,
  CandlestickSeries,
  createChart,
  HistogramData,
  HistogramSeries,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  LineData,
  LineSeries,
  LineStyle,
  LogicalRange,
  MouseEventParams,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import { forkJoin, Subscription } from 'rxjs';
import { LiveChartDataService } from '../../services/live-chart-data.service';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { SessionMarkersPlugin } from '../../chart-plugins/session-markers.plugin';
import { VolumeProfilePlugin } from '../../chart-plugins/volume-profile.plugin';
import { CandleResponse } from '../../structures/candle';
import { IntervalResponse } from '../../structures/interval';
import { SessionOhlcvResponse, VolumeProfileLevel } from '../../structures/session';
import { Trade } from '../../structures/trade';

@Component({
  selector: 'app-lightweight-chart',
  templateUrl: './lightweight-chart.component.html',
  styleUrls: ['./lightweight-chart.component.css'],
})
export class LightweightChartComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chartContainer', { static: true })
  private readonly chartContainer!: ElementRef<HTMLDivElement>;

  @Input() availableIntervals: IntervalResponse[] = [];

  // ── Reactive symbol input — change triggers full reload ──────────────────────
  @Input() set symbol(value: string) {
    const changed = value !== this.selectedSymbol;
    this.selectedSymbol = value;
    if (changed && this.chart) this.resetAndReload();
  }

  @Input() set initialInterval(value: string) { this.selectedInterval = value; }

  // ── Trade overlays ───────────────────────────────────────────────────────────
  @Input() set activeTrade(trade: Trade | null) {
    this._activeTrade = trade;
    if (!this.chart) return;
    this.ngZone.runOutsideAngular(() => {
      if (trade?.status === 'Pending' || trade?.status === 'Active') {
        this.renderTradeLines(trade);
      } else {
        this.clearTradeLines();
      }
    });
  }

  // ── Adjust mode — sets chart cursor and enables price-click ──────────────────
  @Input() set adjustMode(mode: 'stopLoss' | 'takeProfit' | null) {
    this._adjustMode = mode;
  }

  /** Emitted when the user clicks a price while adjustMode is active. */
  @Output() priceSelected = new EventEmitter<number>();

  // ── Public UI state (bound in template) ──────────────────────────────────────
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
  private _activeTrade: Trade | null = null;
  protected _adjustMode: 'stopLoss' | 'takeProfit' | null = null;

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

  private tradeEntryLine?: IPriceLine;
  private tradeSlLine?:    IPriceLine;
  private tradeTpLine?:    IPriceLine;

  private currentSession?:  SessionOhlcvResponse;
  private previousSession?: SessionOhlcvResponse;
  private sessionLines: IPriceLine[] = [];

  private loadedCandles:       CandleResponse[]     = [];
  private loadedVolumeProfile: VolumeProfileLevel[] = [];

  private candlesSubscription?:       Subscription;
  private liveCandlesSubscription?:   Subscription;
  private predictSubscription?:       Subscription;
  private sessionSubscription?:       Subscription;
  private volumeProfileSubscription?: Subscription;

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
        layout: { background: { color: '#000000' }, textColor: '#d1d4dc' },
        grid: { vertLines: { color: 'transparent' }, horzLines: { color: 'transparent' } },
        rightPriceScale: { borderColor: '#2a2d3a' },
        timeScale: {
          borderColor: '#2a2d3a',
          timeVisible: true,
          secondsVisible: false,
          tickMarkFormatter: (time: Time) => this.formatTimeLabel(time),
        },
        localization: { timeFormatter: (time: Time) => this.formatDateTimeLabel(time) },
        crosshair: {
          vertLine: { labelBackgroundColor: '#2962ff' },
          horzLine: { labelBackgroundColor: '#2962ff' },
        },
      });

      // Pane 0
      this.series = this.chart.addSeries(CandlestickSeries, {
        upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
        wickUpColor: '#26a69a', wickDownColor: '#ef5350',
      });
      this.series.attachPrimitive(new SessionMarkersPlugin());
      this.volumeProfilePlugin = new VolumeProfilePlugin();
      this.series.attachPrimitive(this.volumeProfilePlugin);

      this.predictSeries = this.chart.addSeries(CandlestickSeries, {
        upColor: '#2962ff', downColor: '#ffd600', borderVisible: false,
        wickUpColor: '#2962ff', wickDownColor: '#ffd600',
      });

      const smaOpts = { priceScaleId: 'right', lineWidth: 1, priceLineVisible: false, lastValueVisible: false } as const;
      this.sma20Series  = this.chart.addSeries(LineSeries, { ...smaOpts, color: '#f59e0b' });
      this.sma100Series = this.chart.addSeries(LineSeries, { ...smaOpts, color: '#818cf8' });

      // Pane 1
      this.volumeSeries = this.chart.addSeries(HistogramSeries, { priceScaleId: 'volume', priceFormat: { type: 'volume' } }, 1);
      this.volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.7, bottom: 0 } });

      this.deltaSeries = this.chart.addSeries(HistogramSeries, {
        priceScaleId: 'delta',
        priceFormat: { type: 'custom', formatter: (p: number) => p.toFixed(1) + '%', minMove: 0.1 },
      }, 1);
      this.deltaSeries.priceScale().applyOptions({ scaleMargins: { top: 0, bottom: 0.7 }, visible: true });

      // Pane 2
      const rsiOpts = { priceScaleId: 'rsi', lineWidth: 1, priceLineVisible: false, lastValueVisible: false } as const;
      this.rsiSeries     = this.chart.addSeries(LineSeries, { ...rsiOpts, color: '#9c27b0', lastValueVisible: true }, 2);
      this.rsiMaSeries   = this.chart.addSeries(LineSeries, { ...rsiOpts, color: '#ffd600', lastValueVisible: true }, 2);
      this.rsiOverbought = this.chart.addSeries(LineSeries, { ...rsiOpts, color: '#ef5350' }, 2);
      this.rsiOversold   = this.chart.addSeries(LineSeries, { ...rsiOpts, color: '#26a69a' }, 2);
      this.rsiSeries.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });

      // Pane 3 — MACD
      const macdOpts = { priceScaleId: 'macd', lineWidth: 1, priceLineVisible: false, lastValueVisible: false } as const;
      this.macdLineSeries   = this.chart.addSeries(LineSeries,      { ...macdOpts, color: '#2962ff', lastValueVisible: true }, 3);
      this.macdSignalSeries = this.chart.addSeries(LineSeries,      { ...macdOpts, color: '#ff6d00', lastValueVisible: true }, 3);
      this.macdHistSeries   = this.chart.addSeries(HistogramSeries, { priceScaleId: 'macd', priceLineVisible: false, lastValueVisible: false }, 3);
      this.macdZeroSeries   = this.chart.addSeries(LineSeries,      { ...macdOpts, color: '#4a4d5a' }, 3);
      this.macdLineSeries.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });

      this.chart.timeScale().subscribeVisibleLogicalRangeChange(this.onVisibleRangeChange);
      this.chart.subscribeClick(this.onChartClickHandler);
    });

    this.loadCandles();
    this.loadSessionOhlcv();
    this.loadVolumeProfile();
    this.streamLiveCandles();

    // Restore any trade lines that arrived before chart init
    if (this._activeTrade?.status === 'Pending' || this._activeTrade?.status === 'Active') {
      this.ngZone.runOutsideAngular(() => this.renderTradeLines(this._activeTrade!));
    }
  }

  ngOnDestroy(): void {
    this.candlesSubscription?.unsubscribe();
    this.liveCandlesSubscription?.unsubscribe();
    this.predictSubscription?.unsubscribe();
    this.sessionSubscription?.unsubscribe();
    this.volumeProfileSubscription?.unsubscribe();
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
        color: '#ffd600',
        lineWidth: 1, lineStyle: LineStyle.Solid,
        axisLabelVisible: true, title: `${trade.side} Entry`,
      });
    }

    // SL / TP are stored as positive unit offsets — compute absolute price levels.
    if (trade.stopLoss !== null && trade.stopLoss !== undefined && entryRef !== null && entryRef !== undefined) {
      const slPrice = isBuy
        ? Number(entryRef) - Number(trade.stopLoss)
        : Number(entryRef) + Number(trade.stopLoss);
      this.tradeSlLine = this.series.createPriceLine({
        price: slPrice,
        color: '#ef5350', lineWidth: 1, lineStyle: LineStyle.Solid,
        axisLabelVisible: true, title: 'SL',
      });
    }
    if (trade.takeProfit !== null && trade.takeProfit !== undefined && entryRef !== null && entryRef !== undefined) {
      const tpPrice = isBuy
        ? Number(entryRef) + Number(trade.takeProfit)
        : Number(entryRef) - Number(trade.takeProfit);
      this.tradeTpLine = this.series.createPriceLine({
        price: tpPrice,
        color: '#26a69a', lineWidth: 1, lineStyle: LineStyle.Solid,
        axisLabelVisible: true, title: 'TP',
      });
    }
  }

  private clearTradeLines(): void {
    if (this.tradeEntryLine) { this.series?.removePriceLine(this.tradeEntryLine); this.tradeEntryLine = undefined; }
    if (this.tradeSlLine)    { this.series?.removePriceLine(this.tradeSlLine);    this.tradeSlLine    = undefined; }
    if (this.tradeTpLine)    { this.series?.removePriceLine(this.tradeTpLine);    this.tradeTpLine    = undefined; }
  }

  // ── Load / reset ─────────────────────────────────────────────────────────────

  private resetAndReload(): void {
    this.candlesSubscription?.unsubscribe();
    this.liveCandlesSubscription?.unsubscribe();
    this.predictSubscription?.unsubscribe();
    this.sessionSubscription?.unsubscribe();
    this.volumeProfileSubscription?.unsubscribe();

    this.isLoading        = true;
    this.isConnected      = false;
    this.isLoadingMore    = false;
    this.lookback         = 100;
    this.loadedCandles    = [];
    this.loadedVolumeProfile = [];
    this.currentSession   = undefined;
    this.previousSession  = undefined;
    this.statusMessage    = 'Loading candles...';
    this.liveStatus       = '';
    this.predictingKey    = null;

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
      // Re-render trade lines for current symbol after reload
      if (this._activeTrade?.status === 'Pending' || this._activeTrade?.status === 'Active') {
        this.renderTradeLines(this._activeTrade!);
      } else {
        this.clearTradeLines();
      }
    });

    this.loadCandles();
    this.loadSessionOhlcv();
    this.loadVolumeProfile();
    this.streamLiveCandles();
  }

  private loadCandles(): void {
    this.candlesSubscription = this.traderAlgoApi
      .getCandles({ symbol: this.selectedSymbol, interval: this.selectedInterval, lookback: this.lookback })
      .subscribe({
        next: candles => {
          this.isLoading   = false;
          if (candles.length === 0) { this.statusMessage = 'No data available.'; return; }
          this.statusMessage = '';
          this.loadedCandles = candles;
          this.ngZone.runOutsideAngular(() => {
            this.series?.setData(candles.map(c => this.toChartCandle(c)));
            this.sma20Series?.setData(this.computeSma(candles, 20));
            this.sma100Series?.setData(this.computeSma(candles, 100));
            this.volumeSeries?.setData(candles.map(c => this.toVolumeBar(c)));
            this.deltaSeries?.setData(candles.map(c => this.toDeltaBar(c)));
            const rsiData = this.computeRsi(candles);
            this.rsiSeries?.setData(rsiData);
            this.rsiMaSeries?.setData(this.computeRsiMa(rsiData));
            this.rsiOverbought?.setData(this.makeRefLine(candles, 70));
            this.rsiOversold?.setData(this.makeRefLine(candles, 30));
            const { macdLine, signalLine, histogram } = this.computeMacd(candles);
            this.macdLineSeries?.setData(macdLine);
            this.macdSignalSeries?.setData(signalLine);
            this.macdHistSeries?.setData(histogram);
            this.macdZeroSeries?.setData(this.makeRefLine(candles, 0));
            this.chart?.timeScale().fitContent();
          });
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
      .getCandles({ symbol: this.selectedSymbol, interval: this.selectedInterval, lookback: this.lookback })
      .subscribe({
        next: candles => {
          this.isLoadingMore = false;
          if (candles.length === 0) return;
          this.loadedCandles = candles;
          this.ngZone.runOutsideAngular(() => {
            this.series?.setData(candles.map(c => this.toChartCandle(c)));
            this.sma20Series?.setData(this.computeSma(candles, 20));
            this.sma100Series?.setData(this.computeSma(candles, 100));
            this.volumeSeries?.setData(candles.map(c => this.toVolumeBar(c)));
            this.deltaSeries?.setData(candles.map(c => this.toDeltaBar(c)));
            const rsiData = this.computeRsi(candles);
            this.rsiSeries?.setData(rsiData);
            this.rsiMaSeries?.setData(this.computeRsiMa(rsiData));
            this.rsiOverbought?.setData(this.makeRefLine(candles, 70));
            this.rsiOversold?.setData(this.makeRefLine(candles, 30));
            const { macdLine, signalLine, histogram } = this.computeMacd(candles);
            this.macdLineSeries?.setData(macdLine);
            this.macdSignalSeries?.setData(signalLine);
            this.macdHistSeries?.setData(histogram);
            this.macdZeroSeries?.setData(this.makeRefLine(candles, 0));
          });
        },
        error: err => { console.error('Failed to load more candles.', err); this.isLoadingMore = false; },
      });
  }

  private streamLiveCandles(): void {
    this.liveCandlesSubscription = this.liveChartData
      .streamCandles(this.selectedSymbol, this.selectedInterval)
      .subscribe({
        next: candle => {
          this.isConnected = true;
          this.liveStatus  = 'Live';
          this.upsertLiveCandle(candle);
          this.ngZone.runOutsideAngular(() => {
            this.series?.update(this.toChartCandle(candle));
            this.sma20Series?.update(this.lastSmaPoint(this.loadedCandles, 20));
            this.sma100Series?.update(this.lastSmaPoint(this.loadedCandles, 100));
            this.volumeSeries?.update(this.toVolumeBar(candle));
            this.deltaSeries?.update(this.toDeltaBar(candle));
            const lastRsi = this.lastRsiPoint(this.loadedCandles);
            if (lastRsi) {
              this.rsiSeries?.update(lastRsi);
              const lastRsiMa = this.lastRsiMaPoint(this.loadedCandles);
              if (lastRsiMa) this.rsiMaSeries?.update(lastRsiMa);
              this.rsiOverbought?.update({ time: lastRsi.time, value: 70 });
              this.rsiOversold?.update({ time: lastRsi.time, value: 30 });
            }
            const lastMacd = this.lastMacdPoints(this.loadedCandles);
            if (lastMacd) {
              this.macdLineSeries?.update(lastMacd.macd);
              this.macdSignalSeries?.update(lastMacd.signal);
              this.macdHistSeries?.update(lastMacd.hist);
              this.macdZeroSeries?.update({ time: lastMacd.macd.time, value: 0 });
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
      this.applySessionLines(this.currentSession, 'D', '#42a5f5', LineStyle.Solid);
    if (this.showPreviousSession && this.previousSession)
      this.applySessionLines(this.previousSession, 'P', '#9e9e9e', LineStyle.Dashed);
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

  // ── Indicator helpers ────────────────────────────────────────────────────────

  private toChartCandle(c: CandleResponse): CandlestickData<Time> {
    return { time: this.toChartTime(c.time), open: c.open, high: c.high, low: c.low, close: c.close };
  }

  private toVolumeBar(c: CandleResponse): HistogramData<Time> {
    return { time: this.toChartTime(c.time), value: c.volume, color: c.close >= c.open ? '#26a69a' : '#ef5350' };
  }

  private toDeltaBar(c: CandleResponse): HistogramData<Time> {
    const delta = c.volume > 0 ? ((c.buyVolume - c.sellVolume) / c.volume) * 100 : 0;
    return { time: this.toChartTime(c.time), value: delta, color: delta >= 0 ? '#26a69a' : '#ef5350' };
  }

  private upsertLiveCandle(candle: CandleResponse): void {
    const last = this.loadedCandles.at(-1);
    if (last?.time === candle.time) this.loadedCandles[this.loadedCandles.length - 1] = candle;
    else this.loadedCandles.push(candle);
  }

  private computeSma(candles: CandleResponse[], period: number): LineData<Time>[] {
    const result: LineData<Time>[] = [];
    for (let i = period - 1; i < candles.length; i++) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
      result.push({ time: this.toChartTime(candles[i].time), value: sum / period });
    }
    return result;
  }

  private lastSmaPoint(candles: CandleResponse[], period: number): LineData<Time> {
    const slice = candles.slice(-period);
    return { time: this.toChartTime(candles.at(-1)!.time), value: slice.reduce((s, c) => s + c.close, 0) / slice.length };
  }

  private computeRsi(candles: CandleResponse[], period = 14): LineData<Time>[] {
    if (candles.length < period + 1) return [];
    const result: LineData<Time>[] = [];
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= period; i++) {
      const d = candles[i].close - candles[i - 1].close;
      if (d > 0) avgGain += d; else avgLoss -= d;
    }
    avgGain /= period; avgLoss /= period;
    result.push({ time: this.toChartTime(candles[period].time), value: this.rsiValue(avgGain, avgLoss) });
    for (let i = period + 1; i < candles.length; i++) {
      const d = candles[i].close - candles[i - 1].close;
      avgGain = (avgGain * (period - 1) + Math.max(0,  d)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
      result.push({ time: this.toChartTime(candles[i].time), value: this.rsiValue(avgGain, avgLoss) });
    }
    return result;
  }

  private lastRsiPoint(candles: CandleResponse[], period = 14): LineData<Time> | null {
    return this.computeRsi(candles, period).at(-1) ?? null;
  }

  private computeRsiMa(rsiData: LineData<Time>[], period = 9): LineData<Time>[] {
    const result: LineData<Time>[] = [];
    for (let i = period - 1; i < rsiData.length; i++) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += rsiData[j].value;
      result.push({ time: rsiData[i].time, value: sum / period });
    }
    return result;
  }

  private lastRsiMaPoint(candles: CandleResponse[], rsiPeriod = 14, maPeriod = 9): LineData<Time> | null {
    const rsiData = this.computeRsi(candles, rsiPeriod);
    return this.computeRsiMa(rsiData, maPeriod).at(-1) ?? null;
  }

  private rsiValue(avgGain: number, avgLoss: number): number {
    return avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }

  private computeEma(values: number[], period: number): number[] {
    if (values.length < period) return [];
    const k = 2 / (period + 1);
    const result: number[] = new Array(values.length).fill(NaN);
    let seed = 0;
    for (let i = 0; i < period; i++) seed += values[i];
    result[period - 1] = seed / period;
    for (let i = period; i < values.length; i++)
      result[i] = values[i] * k + result[i - 1] * (1 - k);
    return result;
  }

  private computeMacd(candles: CandleResponse[]): {
    macdLine: LineData<Time>[]; signalLine: LineData<Time>[]; histogram: HistogramData<Time>[];
  } {
    if (candles.length < 34) return { macdLine: [], signalLine: [], histogram: [] };

    const closes  = candles.map(c => c.close);
    const ema12   = this.computeEma(closes, 12);
    const ema26   = this.computeEma(closes, 26);
    const macdRaw = closes.map((_, i) =>
      isNaN(ema12[i]) || isNaN(ema26[i]) ? NaN : ema12[i] - ema26[i],
    );

    const firstValid  = macdRaw.findIndex(v => !isNaN(v));  // index 25
    const signalRaw   = this.computeEma(macdRaw.slice(firstValid), 9);

    const macdLine:   LineData<Time>[]     = [];
    const signalLine: LineData<Time>[]     = [];
    const histogram:  HistogramData<Time>[] = [];

    for (let i = firstValid; i < candles.length; i++) {
      const macdVal = macdRaw[i];
      if (isNaN(macdVal)) continue;
      const t = this.toChartTime(candles[i].time);
      macdLine.push({ time: t, value: macdVal });

      const sigVal = signalRaw[i - firstValid];
      if (isNaN(sigVal)) continue;
      signalLine.push({ time: t, value: sigVal });
      const histVal  = macdVal - sigVal;
      const prevHist = histogram.length > 0 ? histogram.at(-1)!.value : null;
      const growing  = prevHist === null || (histVal >= 0 ? histVal >= prevHist : histVal <= prevHist);
      const color    = histVal >= 0
        ? (growing ? '#26a69a' : '#26a69a55')
        : (growing ? '#ef5350' : '#ef535055');
      histogram.push({ time: t, value: histVal, color });
    }

    return { macdLine, signalLine, histogram };
  }

  private lastMacdPoints(candles: CandleResponse[]): {
    macd: LineData<Time>; signal: LineData<Time>; hist: HistogramData<Time>;
  } | null {
    const { macdLine, signalLine, histogram } = this.computeMacd(candles);
    if (!macdLine.length || !signalLine.length || !histogram.length) return null;
    return { macd: macdLine.at(-1)!, signal: signalLine.at(-1)!, hist: histogram.at(-1)! };
  }

  private makeRefLine(candles: CandleResponse[], value: number): LineData<Time>[] {
    if (candles.length === 0) return [];
    return [
      { time: this.toChartTime(candles[0].time),      value },
      { time: this.toChartTime(candles.at(-1)!.time), value },
    ];
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
