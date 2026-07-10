import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
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
import { computeAtrValues } from '../../shared/atr';
import { CandleResponse, CandleWithIndicators } from '../../structures/candle';
import { IntervalResponse } from '../../structures/interval';
import { SessionOhlcvResponse, VolumeProfileLevel } from '../../structures/session';
import { Trade } from '../../structures/trade';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-charts-chart',
  templateUrl: './charts-chart.component.html',
  styleUrls: ['./charts-chart.component.css'],
})
export class ChartsChartComponent implements AfterViewInit, OnDestroy {
  private readonly ngZone = inject(NgZone);
  private readonly traderAlgoApi = inject(TraderAlgoApiService);
  private readonly liveChartData = inject(LiveChartDataService);
  private readonly cdr = inject(ChangeDetectorRef);

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

  @Input() set initialInterval(value: string) {
    this.selectedInterval = value;
  }

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
  isLoading = true;
  statusMessage = 'Loading candles...';
  liveStatus = '';
  isConnected = false;
  predictingKey: string | null = null;
  showCurrentSession = true;
  showPreviousSession = true;
  showVolumeProfile = true;
  showVolume = true;
  showRsi = true;
  showMacd = true;
  showAtr = true;
  showPredictMenu = false;
  showTrades = true;

  readonly trackByIntervalId = (_: number, interval: IntervalResponse): number => interval.id;
  readonly trackByKronosKey = (_: number, button: { key: string }): string => button.key;

  readonly kronosButtons = [
    { label: 'Mini P', key: 'mini-precise' },
    { label: 'Mini D', key: 'mini-diverse' },
    { label: 'Small P', key: 'small-precise' },
    { label: 'Small D', key: 'small-diverse' },
    { label: 'Base P', key: 'base-precise' },
    { label: 'Base D', key: 'base-diverse' },
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
  private macdLineSeries?: ISeriesApi<'Line'>;
  private macdSignalSeries?: ISeriesApi<'Line'>;
  private macdHistSeries?: ISeriesApi<'Histogram'>;
  private macdZeroSeries?: ISeriesApi<'Line'>;
  private atrSeries?: ISeriesApi<'Line'>;

  private volumeProfilePlugin?: VolumeProfilePlugin;
  private tradeMarkersPlugin?: ISeriesMarkersPluginApi<Time>;

  private tradeEntryLine?: IPriceLine;
  private tradeSlLine?: IPriceLine;
  private tradeTpLine?: IPriceLine;

  private currentSession?: SessionOhlcvResponse;
  private previousSession?: SessionOhlcvResponse;
  private sessionLines: IPriceLine[] = [];

  private loadedCandles: CandleWithIndicators[] = [];
  private loadedVolumeProfile: VolumeProfileLevel[] = [];

  // Incremental ATR state for the live stream. The full Wilder series is only
  // computed on load / history expansion (see `seedAtrState`); each live candle
  // then rolls ATR forward in O(1) instead of re-scanning the whole array.
  private readonly atrPeriod = 14;
  private atrPrevValue: number | null = null; // ATR of the last *closed* candle
  private atrPrevClose: number | null = null; // close of the last *closed* candle
  private atrCurrentValue: number | null = null; // ATR last emitted for the forming candle
  private atrLastTime: UTCTimestamp | null = null; // chart time of the forming candle

  private candlesSubscription?: Subscription;
  private loadMoreSubscription?: Subscription;
  private liveCandlesSubscription?: Subscription;
  private predictSubscription?: Subscription;
  private sessionSubscription?: Subscription;
  private volumeProfileSubscription?: Subscription;
  private tradeHistorySubscription?: Subscription;

  private lookback = 100;
  private isLoadingMore = false;

  private readonly timeLabelFormatter = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  private readonly dateTimeLabelFormatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
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
        upColor: CHART_COLORS.bullish,
        downColor: CHART_COLORS.bearish,
        borderVisible: false,
        wickUpColor: CHART_COLORS.bullish,
        wickDownColor: CHART_COLORS.bearish,
      });
      this.series.attachPrimitive(new SessionMarkersPlugin());
      this.volumeProfilePlugin = new VolumeProfilePlugin();
      this.series.attachPrimitive(this.volumeProfilePlugin);

      this.predictSeries = this.chart.addSeries(CandlestickSeries, {
        upColor: CHART_COLORS.accent,
        downColor: CHART_COLORS.highlight,
        borderVisible: false,
        wickUpColor: CHART_COLORS.accent,
        wickDownColor: CHART_COLORS.highlight,
      });

      const smaOpts = {
        priceScaleId: 'right',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      } as const;
      this.sma20Series = this.chart.addSeries(LineSeries, { ...smaOpts, color: CHART_COLORS.sma20 });
      this.sma100Series = this.chart.addSeries(LineSeries, { ...smaOpts, color: CHART_COLORS.sma100 });

      // Pane 1 — volume + delta
      this.volumeSeries = this.chart.addSeries(
        HistogramSeries,
        { priceScaleId: 'volume', priceFormat: { type: 'volume' } },
        1,
      );
      this.volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.7, bottom: 0 } });

      this.deltaSeries = this.chart.addSeries(
        HistogramSeries,
        {
          priceScaleId: 'delta',
          priceFormat: { type: 'custom', formatter: (p: number) => p.toFixed(1) + '%', minMove: 0.1 },
        },
        1,
      );
      this.deltaSeries.priceScale().applyOptions({ scaleMargins: { top: 0, bottom: 0.7 }, visible: true });

      // Pane 2 — RSI
      const rsiOpts = { priceScaleId: 'rsi', lineWidth: 1, priceLineVisible: false, lastValueVisible: false } as const;
      this.rsiSeries = this.chart.addSeries(
        LineSeries,
        { ...rsiOpts, color: CHART_COLORS.rsi, lastValueVisible: true },
        2,
      );
      this.rsiMaSeries = this.chart.addSeries(
        LineSeries,
        { ...rsiOpts, color: CHART_COLORS.highlight, lastValueVisible: true },
        2,
      );
      this.rsiOverbought = this.chart.addSeries(LineSeries, { ...rsiOpts, color: CHART_COLORS.bearish }, 2);
      this.rsiOversold = this.chart.addSeries(LineSeries, { ...rsiOpts, color: CHART_COLORS.bullish }, 2);
      this.rsiSeries.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });

      // Pane 3 — MACD
      const macdOpts = {
        priceScaleId: 'macd',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      } as const;
      this.macdLineSeries = this.chart.addSeries(
        LineSeries,
        { ...macdOpts, color: CHART_COLORS.accent, lastValueVisible: true },
        3,
      );
      this.macdSignalSeries = this.chart.addSeries(
        LineSeries,
        { ...macdOpts, color: CHART_COLORS.macdSignal, lastValueVisible: true },
        3,
      );
      this.macdHistSeries = this.chart.addSeries(
        HistogramSeries,
        { priceScaleId: 'macd', priceLineVisible: false, lastValueVisible: false },
        3,
      );
      this.macdZeroSeries = this.chart.addSeries(LineSeries, { ...macdOpts, color: CHART_COLORS.zeroLine }, 3);
      this.macdLineSeries.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });

      // Pane 4 — ATR (Average True Range, computed client-side from OHLC)
      this.atrSeries = this.chart.addSeries(
        LineSeries,
        {
          priceScaleId: 'atr',
          color: CHART_COLORS.atr,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: true,
        },
        4,
      );
      this.atrSeries.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });

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
    this.loadMoreSubscription?.unsubscribe();
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

  toggleAtr(): void {
    this.showAtr = !this.showAtr;
    this.ngZone.runOutsideAngular(() => {
      const pane = this.chart?.panes()[4];
      if (pane) pane.setStretchFactor(this.showAtr ? 1 : 0);
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
        this.cdr.markForCheck();
        this.ngZone.runOutsideAngular(() => this.predictSeries?.setData(candles.map(c => this.toChartCandle(c))));
      },
      error: err => {
        console.error('Predict request failed.', err);
        this.predictingKey = null;
        this.cdr.markForCheck();
      },
    });
  }

  // ── Trade lines ──────────────────────────────────────────────────────────────

  private renderTradeLines(trade: Trade): void {
    this.clearTradeLines();
    if (!this.series) return;

    const entryRef = trade.entryPrice ?? trade.requestedPrice;
    const isBuy = trade.side === 'Buy';

    if (entryRef !== null && entryRef !== undefined) {
      this.tradeEntryLine = this.series.createPriceLine({
        price: Number(entryRef),
        color: CHART_COLORS.highlight,
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: `${trade.side} Entry`,
      });
    }

    if (trade.stopLoss !== null && trade.stopLoss !== undefined && entryRef !== null && entryRef !== undefined) {
      const slPrice = isBuy ? Number(entryRef) - Number(trade.stopLoss) : Number(entryRef) + Number(trade.stopLoss);
      this.tradeSlLine = this.series.createPriceLine({
        price: slPrice,
        color: CHART_COLORS.bearish,
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: 'SL',
      });
    }
    if (trade.takeProfit !== null && trade.takeProfit !== undefined && entryRef !== null && entryRef !== undefined) {
      const tpPrice = isBuy ? Number(entryRef) + Number(trade.takeProfit) : Number(entryRef) - Number(trade.takeProfit);
      this.tradeTpLine = this.series.createPriceLine({
        price: tpPrice,
        color: CHART_COLORS.bullish,
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: 'TP',
      });
    }
  }

  private clearTradeLines(): void {
    if (this.tradeEntryLine) {
      this.series?.removePriceLine(this.tradeEntryLine);
      this.tradeEntryLine = undefined;
    }
    if (this.tradeSlLine) {
      this.series?.removePriceLine(this.tradeSlLine);
      this.tradeSlLine = undefined;
    }
    if (this.tradeTpLine) {
      this.series?.removePriceLine(this.tradeTpLine);
      this.tradeTpLine = undefined;
    }
  }

  private shouldRenderTradeLines(trade: Trade | null): trade is Trade {
    return (
      !!trade && trade.symbolCode === this.selectedSymbol && (trade.status === 'Pending' || trade.status === 'Active')
    );
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
    const symbolTrades = this.historyTrades.filter(t => t.symbolCode === this.selectedSymbol && t.status === 'Closed');
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
    this.loadMoreSubscription?.unsubscribe();
    this.liveCandlesSubscription?.unsubscribe();
    this.predictSubscription?.unsubscribe();
    this.sessionSubscription?.unsubscribe();
    this.volumeProfileSubscription?.unsubscribe();
    this.tradeHistorySubscription?.unsubscribe();

    this.isLoading = true;
    this.isConnected = false;
    this.isLoadingMore = false;
    this.lookback = 100;
    this.loadedCandles = [];
    this.loadedVolumeProfile = [];
    this.currentSession = undefined;
    this.previousSession = undefined;
    this.statusMessage = 'Loading candles...';
    this.liveStatus = '';
    this.predictingKey = null;

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
      this.atrSeries?.setData([]);
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
      .getCandlesWithIndicators({
        symbol: this.selectedSymbol,
        interval: this.selectedInterval,
        lookback: this.lookback,
      })
      .subscribe({
        next: candles => {
          this.isLoading = false;
          this.cdr.markForCheck();
          if (candles.length === 0) {
            this.statusMessage = 'No data available.';
            return;
          }
          this.statusMessage = '';
          this.loadedCandles = candles;
          this.ngZone.runOutsideAngular(() => this.applyAllSeries(candles, true));
        },
        error: err => {
          console.error('Failed to load candles.', err);
          this.isLoading = false;
          this.statusMessage = 'Failed to load candles.';
          this.cdr.markForCheck();
        },
      });
  }

  private loadMoreCandles(): void {
    this.isLoadingMore = true;
    this.lookback += 100;
    this.loadMoreSubscription = this.traderAlgoApi
      .getCandlesWithIndicators({
        symbol: this.selectedSymbol,
        interval: this.selectedInterval,
        lookback: this.lookback,
      })
      .subscribe({
        next: candles => {
          this.isLoadingMore = false;
          this.cdr.markForCheck();
          if (candles.length === 0) return;
          this.loadedCandles = candles;
          this.ngZone.runOutsideAngular(() => this.applyAllSeries(candles, false));
        },
        error: err => {
          console.error('Failed to load more candles.', err);
          this.isLoadingMore = false;
          this.cdr.markForCheck();
        },
      });
  }

  private applyAllSeries(candles: CandleWithIndicators[], fitContent: boolean): void {
    this.series?.setData(candles.map(c => this.toChartCandle(c)));
    this.applyTradeMarkers();
    this.sma20Series?.setData(
      candles.filter(c => c.sma20 !== null).map(c => ({ time: this.toChartTime(c.time), value: c.sma20! })),
    );
    this.sma100Series?.setData(
      candles.filter(c => c.sma100 !== null).map(c => ({ time: this.toChartTime(c.time), value: c.sma100! })),
    );
    this.volumeSeries?.setData(candles.map(c => this.toVolumeBar(c)));
    this.deltaSeries?.setData(this._isAlpaca ? [] : candles.map(c => this.toDeltaBar(c)));
    this.applyDeltaPaneVisibility();
    this.rsiSeries?.setData(
      candles.filter(c => c.rsi !== null).map(c => ({ time: this.toChartTime(c.time), value: c.rsi! })),
    );
    this.rsiMaSeries?.setData(
      candles.filter(c => c.rsiSmooth !== null).map(c => ({ time: this.toChartTime(c.time), value: c.rsiSmooth! })),
    );

    const rsiCandles = candles.filter(c => c.rsi !== null);
    if (rsiCandles.length >= 2) {
      this.rsiOverbought?.setData([
        { time: this.toChartTime(rsiCandles[0].time), value: 70 },
        { time: this.toChartTime(rsiCandles[rsiCandles.length - 1].time), value: 70 },
      ]);
      this.rsiOversold?.setData([
        { time: this.toChartTime(rsiCandles[0].time), value: 30 },
        { time: this.toChartTime(rsiCandles[rsiCandles.length - 1].time), value: 30 },
      ]);
    }

    this.macdLineSeries?.setData(
      candles.filter(c => c.macdLine !== null).map(c => ({ time: this.toChartTime(c.time), value: c.macdLine! })),
    );
    this.macdSignalSeries?.setData(
      candles
        .filter(c => c.macdSignalLine !== null)
        .map(c => ({ time: this.toChartTime(c.time), value: c.macdSignalLine! })),
    );
    this.macdHistSeries?.setData(this.toMacdHistogram(candles));

    const macdCandles = candles.filter(c => c.macdLine !== null);
    if (macdCandles.length >= 2) {
      this.macdZeroSeries?.setData([
        { time: this.toChartTime(macdCandles[0].time), value: 0 },
        { time: this.toChartTime(macdCandles[macdCandles.length - 1].time), value: 0 },
      ]);
    }

    this.seedAtrState(candles);

    if (fitContent) this.chart?.timeScale().fitContent();
  }

  private streamLiveCandles(): void {
    this.liveCandlesSubscription = this.liveChartData
      .streamCandlesWithIndicators(this.selectedSymbol, this.selectedInterval)
      .subscribe({
        next: candle => {
          if (!this.isConnected || this.liveStatus !== 'Live') {
            this.isConnected = true;
            this.liveStatus = 'Live';
            this.cdr.markForCheck();
          }
          this.upsertLiveCandle(candle);
          const t = this.toChartTime(candle.time);
          this.ngZone.runOutsideAngular(() => {
            this.series?.update(this.toChartCandle(candle));
            if (candle.sma20 !== null) this.sma20Series?.update({ time: t, value: candle.sma20 });
            if (candle.sma100 !== null) this.sma100Series?.update({ time: t, value: candle.sma100 });
            this.volumeSeries?.update(this.toVolumeBar(candle));
            if (!this._isAlpaca) this.deltaSeries?.update(this.toDeltaBar(candle));
            if (candle.rsi !== null) {
              this.rsiSeries?.update({ time: t, value: candle.rsi });
              this.rsiOverbought?.update({ time: t, value: 70 });
              this.rsiOversold?.update({ time: t, value: 30 });
            }
            if (candle.rsiSmooth !== null) this.rsiMaSeries?.update({ time: t, value: candle.rsiSmooth });
            if (candle.macdLine !== null) this.macdLineSeries?.update({ time: t, value: candle.macdLine });
            if (candle.macdSignalLine !== null)
              this.macdSignalSeries?.update({ time: t, value: candle.macdSignalLine });
            if (candle.macdHistogram !== null) {
              const prev = this.loadedCandles.at(-2)?.macdHistogram ?? null;
              const h = candle.macdHistogram;
              const growing = prev === null || (h >= 0 ? h >= prev : h <= prev);
              const color =
                h >= 0
                  ? growing
                    ? CHART_COLORS.bullish
                    : CHART_COLORS.bullishFaded
                  : growing
                    ? CHART_COLORS.bearish
                    : CHART_COLORS.bearishFaded;
              this.macdHistSeries?.update({ time: t, value: h, color });
              this.macdZeroSeries?.update({ time: t, value: 0 });
            }
            this.updateLiveAtr(candle);
          });
        },
        error: err => {
          console.error('Live candle stream error.', err);
          this.isConnected = false;
          this.liveStatus = 'Disconnected';
          this.cdr.markForCheck();
        },
        complete: () => {
          this.isConnected = false;
          this.liveStatus = 'Stream closed';
          this.cdr.markForCheck();
        },
      });
  }

  private loadVolumeProfile(): void {
    this.volumeProfileSubscription = this.traderAlgoApi.getSessionVolumeProfile(this.selectedSymbol).subscribe({
      next: levels => {
        this.loadedVolumeProfile = levels;
        if (this.showVolumeProfile) this.ngZone.runOutsideAngular(() => this.volumeProfilePlugin?.setData(levels));
      },
      error: err => console.error('Failed to load volume profile.', err),
    });
  }

  private loadSessionOhlcv(): void {
    this.sessionSubscription = forkJoin({
      current: this.traderAlgoApi.getCurrentSessionOhlcv(this.selectedSymbol),
      previous: this.traderAlgoApi.getPreviousSessionOhlcv(this.selectedSymbol),
    }).subscribe({
      next: ({ current, previous }) => {
        this.currentSession = current;
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
    for (const [key, price] of [
      ['O', s.open],
      ['H', s.high],
      ['L', s.low],
      ['C', s.close],
    ] as [string, number][]) {
      this.sessionLines.push(
        this.series.createPriceLine({
          price,
          color,
          title: `${prefix}-${key}`,
          lineStyle,
          lineWidth: 1,
          axisLabelVisible: true,
        }),
      );
    }
  }

  private clearSessionLines(): void {
    for (const line of this.sessionLines) this.series?.removePriceLine(line);
    this.sessionLines = [];
  }

  // ── Mapping helpers ──────────────────────────────────────────────────────────

  private toChartCandle(c: CandleWithIndicators | CandleResponse): CandlestickData<Time> {
    return { time: this.toChartTime(c.time), open: c.open, high: c.high, low: c.low, close: c.close };
  }

  private toVolumeBar(c: CandleWithIndicators): HistogramData<Time> {
    const takerTotal = c.takerBuyVolume + c.takerSellVolume;
    const vol = takerTotal > 0 ? takerTotal : c.volume;
    return {
      time: this.toChartTime(c.time),
      value: vol,
      color: c.close >= c.open ? CHART_COLORS.bullish : CHART_COLORS.bearish,
    };
  }

  private toDeltaBar(c: CandleWithIndicators): HistogramData<Time> {
    const buy = c.takerBuyVolume;
    const sell = c.takerSellVolume;
    const total = buy + sell;
    const delta = total > 0 ? ((buy - sell) / total) * 100 : 0;
    return {
      time: this.toChartTime(c.time),
      value: delta,
      color: delta >= 0 ? CHART_COLORS.bullish : CHART_COLORS.bearish,
    };
  }

  private applyDeltaPaneVisibility(): void {
    this.deltaSeries?.priceScale().applyOptions({ visible: !this._isAlpaca });
  }

  private toMacdHistogram(candles: CandleWithIndicators[]): HistogramData<Time>[] {
    const result: HistogramData<Time>[] = [];
    for (const c of candles) {
      if (c.macdHistogram === null) continue;
      const h = c.macdHistogram;
      const prev = result.at(-1)?.value ?? null;
      const growing = prev === null || (h >= 0 ? h >= prev : h <= prev);
      const color =
        h >= 0
          ? growing
            ? CHART_COLORS.bullish
            : CHART_COLORS.bullishFaded
          : growing
            ? CHART_COLORS.bearish
            : CHART_COLORS.bearishFaded;
      result.push({ time: this.toChartTime(c.time), value: h, color });
    }
    return result;
  }

  /**
   * Average True Range via Wilder's smoothing. Derived purely from OHLC (the
   * backend does not ship an ATR field), so it stays a chart-local computation.
   * Returns points aligned to each candle from index `period` onward.
   */
  private computeAtr(
    candles: CandleWithIndicators[],
    period = this.atrPeriod,
  ): { time: UTCTimestamp; value: number }[] {
    return computeAtrValues(candles, period).map(({ index, value }) => ({
      time: this.toChartTime(candles[index].time),
      value,
    }));
  }

  /**
   * Draws the full ATR series and primes the incremental state used by
   * {@link updateLiveAtr}. Called on initial load, interval/symbol changes and
   * history expansion — anywhere the whole candle array is (re)applied.
   */
  private seedAtrState(candles: CandleWithIndicators[]): void {
    const series = this.computeAtr(candles, this.atrPeriod);
    this.atrSeries?.setData(series);

    // The last loaded candle is the one the next live frame will update or
    // replace, so treat it as the "forming" bar and confirm from index len-2.
    this.atrCurrentValue = series.at(-1)?.value ?? null;
    this.atrLastTime = candles.length > 0 ? this.toChartTime(candles[candles.length - 1].time) : null;
    this.atrPrevValue = null;
    this.atrPrevClose = null;

    const closedIndex = candles.length - 2;
    if (closedIndex >= this.atrPeriod) {
      // computeAtr aligns result[k] to candles[atrPeriod + k].
      this.atrPrevValue = series[closedIndex - this.atrPeriod]?.value ?? null;
      this.atrPrevClose = candles[closedIndex].close;
    }
  }

  /**
   * Rolls ATR forward for a single live candle in O(1). `loadedCandles` already
   * includes `candle` (via {@link upsertLiveCandle}). Falls back to a one-off
   * full recompute only during cold start, before enough confirmed history exists.
   */
  private updateLiveAtr(candle: CandleWithIndicators): void {
    const candles = this.loadedCandles;
    const current = candles.at(-1);
    if (!current) return;
    const t = this.toChartTime(candle.time);
    const prev = candles.at(-2);

    // A new bar means the previously-forming bar just closed: promote the value
    // we last emitted for it, and its now-final close, into the confirmed state.
    if (this.atrLastTime !== null && t !== this.atrLastTime && this.atrCurrentValue !== null && prev) {
      this.atrPrevValue = this.atrCurrentValue;
      this.atrPrevClose = prev.close;
    }

    let value: number | null;
    if (this.atrPrevValue !== null && this.atrPrevClose !== null) {
      const tr = Math.max(
        current.high - current.low,
        Math.abs(current.high - this.atrPrevClose),
        Math.abs(current.low - this.atrPrevClose),
      );
      value = (this.atrPrevValue * (this.atrPeriod - 1) + tr) / this.atrPeriod;
    } else {
      value = this.computeAtr(candles, this.atrPeriod).at(-1)?.value ?? null;
    }

    this.atrCurrentValue = value;
    this.atrLastTime = t;
    if (value !== null) this.atrSeries?.update({ time: t, value });
  }

  private upsertLiveCandle(candle: CandleWithIndicators): void {
    const last = this.loadedCandles.at(-1);
    if (last?.time === candle.time) this.loadedCandles[this.loadedCandles.length - 1] = candle;
    else this.loadedCandles.push(candle);
  }

  private toChartTime(time: number): UTCTimestamp {
    return (time > 9_999_999_999 ? Math.floor(time / 1000) : time) as UTCTimestamp;
  }

  private formatTimeLabel(time: Time): string {
    return this.timeLabelFormatter.format(this.toDate(time));
  }
  private formatDateTimeLabel(time: Time): string {
    return this.dateTimeLabelFormatter.format(this.toDate(time));
  }

  private toDate(time: Time): Date {
    if (typeof time === 'number') return new Date(time * 1000);
    if (typeof time === 'string') return new Date(`${time}T00:00:00Z`);
    return new Date(Date.UTC(time.year, time.month - 1, time.day));
  }

  private kronosRequest(key: string): ReturnType<TraderAlgoApiService['kronosMiniPrecise']> {
    const s = this.selectedSymbol,
      i = this.selectedInterval;
    switch (key) {
      case 'mini-precise':
        return this.traderAlgoApi.kronosMiniPrecise(s, i);
      case 'mini-diverse':
        return this.traderAlgoApi.kronosMiniDiverse(s, i);
      case 'small-precise':
        return this.traderAlgoApi.kronosSmallPrecise(s, i);
      case 'small-diverse':
        return this.traderAlgoApi.kronosSmallDiverse(s, i);
      case 'base-precise':
        return this.traderAlgoApi.kronosBasePrecise(s, i);
      case 'base-diverse':
        return this.traderAlgoApi.kronosBaseDiverse(s, i);
      default:
        throw new Error(`Unknown kronos variant: ${key}`);
    }
  }
}
