import { AfterViewInit, Component, ElementRef, Input, NgZone, OnDestroy, ViewChild } from '@angular/core';
import {
  CandlestickData,
  CandlestickSeries,
  createChart,
  createTextWatermark,
  HistogramData,
  HistogramSeries,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  ITextWatermarkPluginApi,
  LineData,
  LineSeries,
  LineStyle,
  LogicalRange,
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
import { SymbolResponse } from '../../structures/symbol';

@Component({
  selector: 'app-lightweight-chart',
  templateUrl: './lightweight-chart.component.html',
  styleUrls: ['./lightweight-chart.component.css'],
})
export class LightweightChartComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chartContainer', { static: true })
  private readonly chartContainer!: ElementRef<HTMLDivElement>;

  @Input() availableSymbols: SymbolResponse[] = [];
  @Input() availableIntervals: IntervalResponse[] = [];

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

  readonly kronosButtons = [
    { label: 'Mini P',  key: 'mini-precise'  },
    { label: 'Mini D',  key: 'mini-diverse'  },
    { label: 'Small P', key: 'small-precise' },
    { label: 'Small D', key: 'small-diverse' },
    { label: 'Base P',  key: 'base-precise'  },
    { label: 'Base D',  key: 'base-diverse'  },
  ];

  @Input() set initialSymbol(value: string) { this.selectedSymbol = value; }
  @Input() set initialInterval(value: string) { this.selectedInterval = value; }

  selectedSymbol = '';
  selectedInterval = '';
  isLoading = true;
  statusMessage = 'Loading candles...';
  liveStatus = '';
  isConnected = false;
  predictingKey: string | null = null;

  private chart?: IChartApi;
  private series?: ISeriesApi<'Candlestick'>;
  private predictSeries?: ISeriesApi<'Candlestick'>;
  private sma20Series?: ISeriesApi<'Line'>;
  private sma100Series?: ISeriesApi<'Line'>;
  private volumeSeries?: ISeriesApi<'Histogram'>;
  private deltaSeries?: ISeriesApi<'Histogram'>;
  private rsiSeries?: ISeriesApi<'Line'>;
  private rsiOverbought?: ISeriesApi<'Line'>;
  private rsiOversold?: ISeriesApi<'Line'>;
  private watermark?: ITextWatermarkPluginApi<Time>;
  showCurrentSession  = true;
  showPreviousSession = true;
  showVolumeProfile   = true;

  private currentSession?: SessionOhlcvResponse;
  private previousSession?: SessionOhlcvResponse;
  private sessionLines: IPriceLine[] = [];
  private loadedVolumeProfile: VolumeProfileLevel[] = [];
  private volumeProfilePlugin?: VolumeProfilePlugin;
  private candlesSubscription?: Subscription;
  private liveCandlesSubscription?: Subscription;
  private predictSubscription?: Subscription;
  private sessionSubscription?: Subscription;
  private volumeProfileSubscription?: Subscription;

  private loadedCandles: CandleResponse[] = [];
  private lookback = 100;
  private isLoadingMore = false;
  private readonly onVisibleRangeChange = (range: LogicalRange | null) => {
    if (!range || this.isLoadingMore || this.isLoading) return;
    if (range.from <= 0) {
      this.ngZone.run(() => this.loadMoreCandles());
    }
  };

  constructor(
    private readonly ngZone: NgZone,
    private readonly traderAlgoApi: TraderAlgoApiService,
    private readonly liveChartData: LiveChartDataService,
  ) {}

  ngAfterViewInit(): void {
    this.ngZone.runOutsideAngular(() => {
      this.chart = createChart(this.chartContainer.nativeElement, {
        autoSize: true,
        layout: {
          background: { color: '#131722' },
          textColor: '#d1d4dc',
        },
        grid: {
          vertLines: { color: '#1e2433' },
          horzLines: { color: '#1e2433' },
        },
        rightPriceScale: {
          borderColor: '#2a2d3a',
        },
        timeScale: {
          borderColor: '#2a2d3a',
          timeVisible: true,
          secondsVisible: false,
          tickMarkFormatter: (time: Time) => this.formatTimeLabel(time),
        },
        localization: {
          timeFormatter: (time: Time) => this.formatDateTimeLabel(time),
        },
        crosshair: {
          vertLine: { labelBackgroundColor: '#2962ff' },
          horzLine: { labelBackgroundColor: '#2962ff' },
        },
      });

      this.series = this.chart.addSeries(CandlestickSeries, {
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
      });
      this.series.attachPrimitive(new SessionMarkersPlugin());
      this.volumeProfilePlugin = new VolumeProfilePlugin();
      this.series.attachPrimitive(this.volumeProfilePlugin);

      this.predictSeries = this.chart.addSeries(CandlestickSeries, {
        upColor: '#2962ff',
        downColor: '#ffd600',
        borderVisible: false,
        wickUpColor: '#2962ff',
        wickDownColor: '#ffd600',
      });

      const smaLineOptions = { priceScaleId: 'right', lineWidth: 1, priceLineVisible: false, lastValueVisible: false } as const;
      this.sma20Series  = this.chart.addSeries(LineSeries, { ...smaLineOptions, color: '#f59e0b' });
      this.sma100Series = this.chart.addSeries(LineSeries, { ...smaLineOptions, color: '#818cf8' });

      this.volumeSeries = this.chart.addSeries(HistogramSeries, {
        priceScaleId: 'volume',
        priceFormat: { type: 'volume' },
      }, 1);
      this.volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.7, bottom: 0 },
      });

      this.deltaSeries = this.chart.addSeries(HistogramSeries, {
        priceScaleId: 'delta',
        priceFormat: {
          type: 'custom',
          formatter: (price: number) => price.toFixed(1) + '%',
          minMove: 0.1,
        },
      }, 1);
      this.deltaSeries.priceScale().applyOptions({
        scaleMargins: { top: 0, bottom: 0.7 },
        visible: true,
      });

      const rsiRefOptions = { priceScaleId: 'rsi', lineWidth: 1, priceLineVisible: false, lastValueVisible: false } as const;
      this.rsiSeries = this.chart.addSeries(LineSeries, { ...rsiRefOptions, color: '#b39ddb', lastValueVisible: true }, 2);
      this.rsiOverbought = this.chart.addSeries(LineSeries, { ...rsiRefOptions, color: '#ef5350' }, 2);
      this.rsiOversold   = this.chart.addSeries(LineSeries, { ...rsiRefOptions, color: '#26a69a' }, 2);
      this.rsiSeries.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });

      this.chart.timeScale().subscribeVisibleLogicalRangeChange(this.onVisibleRangeChange);
      this.watermark = createTextWatermark(this.chart.panes()[0], {
        horzAlign: 'left',
        vertAlign: 'top',
        lines: [{ text: this.selectedSymbol, color: 'rgba(209, 212, 220, 0.5)', fontSize: 18, fontFamily: 'inherit' }],
      });
    });

    this.loadCandles();
    this.loadSessionOhlcv();
    this.loadVolumeProfile();
    this.streamLiveCandles();
  }

  ngOnDestroy(): void {
    this.candlesSubscription?.unsubscribe();
    this.liveCandlesSubscription?.unsubscribe();
    this.predictSubscription?.unsubscribe();
    this.sessionSubscription?.unsubscribe();
    this.volumeProfileSubscription?.unsubscribe();
    this.chart?.timeScale().unsubscribeVisibleLogicalRangeChange(this.onVisibleRangeChange);
    this.chart?.remove();
  }

  onSymbolSelect(event: Event): void {
    const symbol = (event.target as HTMLSelectElement).value;
    if (symbol === this.selectedSymbol) return;
    this.selectedSymbol = symbol;
    this.ngZone.runOutsideAngular(() => {
      this.watermark?.applyOptions({
        lines: [{ text: this.selectedSymbol, color: 'rgba(209, 212, 220, 0.5)', fontSize: 18, fontFamily: 'inherit' }],
      });
    });
    this.resetAndReload();
  }

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
    this.ngZone.runOutsideAngular(() => {
      this.volumeProfilePlugin?.setData(this.showVolumeProfile ? this.loadedVolumeProfile : []);
    });
  }

  runPredict(key: string): void {
    if (this.predictingKey !== null) return;
    this.predictingKey = key;
    this.predictSubscription?.unsubscribe();
    this.predictSubscription = this.kronosRequest(key).subscribe({
      next: candles => {
        this.predictingKey = null;
        this.ngZone.runOutsideAngular(() => {
          this.predictSeries?.setData(candles.map(c => this.toChartCandle(c)));
        });
      },
      error: err => {
        console.error('Predict request failed.', err);
        this.predictingKey = null;
      },
    });
  }

  private kronosRequest(key: string): ReturnType<TraderAlgoApiService['kronosMiniPrecise']> {
    const s = this.selectedSymbol;
    const i = this.selectedInterval;
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

  private resetAndReload(): void {
    this.candlesSubscription?.unsubscribe();
    this.liveCandlesSubscription?.unsubscribe();
    this.predictSubscription?.unsubscribe();
    this.sessionSubscription?.unsubscribe();
    this.volumeProfileSubscription?.unsubscribe();

    this.isLoading = true;
    this.isConnected = false;
    this.isLoadingMore = false;
    this.lookback = 100;
    this.loadedCandles = [];
    this.loadedVolumeProfile = [];
    this.currentSession  = undefined;
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
      this.rsiOverbought?.setData([]);
      this.rsiOversold?.setData([]);
      this.volumeProfilePlugin?.setData([]);
      this.clearSessionLines();
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
          this.isLoading = false;
          if (candles.length === 0) {
            this.statusMessage = 'No data available.';
            return;
          }
          this.statusMessage = '';
          this.loadedCandles = candles;
          this.ngZone.runOutsideAngular(() => {
            this.series?.setData(candles.map(c => this.toChartCandle(c)));
            this.sma20Series?.setData(this.computeSma(candles, 20));
            this.sma100Series?.setData(this.computeSma(candles, 100));
            this.volumeSeries?.setData(candles.map(c => this.toVolumeBar(c)));
            this.deltaSeries?.setData(candles.map(c => this.toDeltaBar(c)));
            this.rsiSeries?.setData(this.computeRsi(candles));
            this.rsiOverbought?.setData(this.makeRefLine(candles, 70));
            this.rsiOversold?.setData(this.makeRefLine(candles, 30));
            this.chart?.timeScale().fitContent();
          });
        },
        error: err => {
          console.error('Failed to load candles.', err);
          this.isLoading = false;
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
            this.rsiSeries?.setData(this.computeRsi(candles));
            this.rsiOverbought?.setData(this.makeRefLine(candles, 70));
            this.rsiOversold?.setData(this.makeRefLine(candles, 30));
          });
        },
        error: err => {
          console.error('Failed to load more candles.', err);
          this.isLoadingMore = false;
        },
      });
  }

  private streamLiveCandles(): void {
    this.liveCandlesSubscription = this.liveChartData
      .streamCandles(this.selectedSymbol, this.selectedInterval)
      .subscribe({
        next: candle => {
          this.isConnected = true;
          this.liveStatus = 'Live';
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
              this.rsiOverbought?.update({ time: lastRsi.time, value: 70 });
              this.rsiOversold?.update({ time: lastRsi.time, value: 30 });
            }
          });
        },
        error: err => {
          console.error('Live candle stream error.', err);
          this.isConnected = false;
          this.liveStatus = 'Disconnected';
        },
        complete: () => {
          this.isConnected = false;
          this.liveStatus = 'Stream closed';
        },
      });
  }

  private toChartCandle(candle: CandleResponse): CandlestickData<Time> {
    return {
      time: this.toChartTime(candle.time),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    };
  }

  private toVolumeBar(candle: CandleResponse): HistogramData<Time> {
    return {
      time: this.toChartTime(candle.time),
      value: candle.volume,
      color: candle.close >= candle.open ? '#26a69a80' : '#ef535080',
    };
  }

  private toDeltaBar(candle: CandleResponse): HistogramData<Time> {
    const delta = candle.volume > 0
      ? ((candle.buyVolume - candle.sellVolume) / candle.volume) * 100
      : 0;
    return {
      time: this.toChartTime(candle.time),
      value: delta,
      color: delta >= 0 ? '#26a69a' : '#ef5350',
    };
  }

  private upsertLiveCandle(candle: CandleResponse): void {
    const last = this.loadedCandles.at(-1);
    if (last?.time === candle.time) {
      this.loadedCandles[this.loadedCandles.length - 1] = candle;
    } else {
      this.loadedCandles.push(candle);
    }
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
    const value = slice.reduce((s, c) => s + c.close, 0) / slice.length;
    return { time: this.toChartTime(candles.at(-1)!.time), value };
  }

  private loadVolumeProfile(): void {
    this.volumeProfileSubscription = this.traderAlgoApi
      .getSessionVolumeProfile(this.selectedSymbol)
      .subscribe({
        next: levels => {
          this.loadedVolumeProfile = levels;
          if (this.showVolumeProfile) {
            this.ngZone.runOutsideAngular(() => this.volumeProfilePlugin?.setData(levels));
          }
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

  private applyVisibleSessionLines(): void {
    this.clearSessionLines();
    if (this.showCurrentSession && this.currentSession) {
      this.applySessionLines(this.currentSession, 'D', 'rgba(66, 165, 245, 0.5)', LineStyle.Solid);
    }
    if (this.showPreviousSession && this.previousSession) {
      this.applySessionLines(this.previousSession, 'P', 'rgba(158, 158, 158, 0.5)', LineStyle.Dashed);
    }
  }

  private applySessionLines(
    session: SessionOhlcvResponse,
    prefix: string,
    color: string,
    lineStyle: LineStyle,
  ): void {
    if (!this.series) return;
    for (const [key, price] of [['O', session.open], ['H', session.high], ['L', session.low], ['C', session.close]] as [string, number][]) {
      this.sessionLines.push(
        this.series.createPriceLine({ price, color, title: `${prefix}-${key}`, lineStyle, lineWidth: 1, axisLabelVisible: true }),
      );
    }
  }

  private clearSessionLines(): void {
    for (const line of this.sessionLines) {
      this.series?.removePriceLine(line);
    }
    this.sessionLines = [];
  }

  private computeRsi(candles: CandleResponse[], period = 14): LineData<Time>[] {
    if (candles.length < period + 1) return [];
    const result: LineData<Time>[] = [];
    let avgGain = 0;
    let avgLoss = 0;

    for (let i = 1; i <= period; i++) {
      const change = candles[i].close - candles[i - 1].close;
      if (change > 0) avgGain += change; else avgLoss -= change;
    }
    avgGain /= period;
    avgLoss /= period;
    result.push({ time: this.toChartTime(candles[period].time), value: this.rsiValue(avgGain, avgLoss) });

    for (let i = period + 1; i < candles.length; i++) {
      const change = candles[i].close - candles[i - 1].close;
      avgGain = (avgGain * (period - 1) + Math.max(0,  change)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(0, -change)) / period;
      result.push({ time: this.toChartTime(candles[i].time), value: this.rsiValue(avgGain, avgLoss) });
    }
    return result;
  }

  private lastRsiPoint(candles: CandleResponse[], period = 14): LineData<Time> | null {
    return this.computeRsi(candles, period).at(-1) ?? null;
  }

  private rsiValue(avgGain: number, avgLoss: number): number {
    return avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }

  private makeRefLine(candles: CandleResponse[], value: number): LineData<Time>[] {
    if (candles.length === 0) return [];
    return [
      { time: this.toChartTime(candles[0].time),       value },
      { time: this.toChartTime(candles.at(-1)!.time),  value },
    ];
  }

  private toChartTime(time: number): UTCTimestamp {
    const seconds = time > 9_999_999_999 ? Math.floor(time / 1000) : time;
    return seconds as UTCTimestamp;
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
}
