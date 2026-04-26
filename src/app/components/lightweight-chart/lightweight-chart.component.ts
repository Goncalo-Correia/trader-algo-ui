import { AfterViewInit, Component, ElementRef, Input, NgZone, OnDestroy, ViewChild } from '@angular/core';
import {
  CandlestickData,
  CandlestickSeries,
  createChart,
  createTextWatermark,
  IChartApi,
  ISeriesApi,
  ITextWatermarkPluginApi,
  LogicalRange,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import { Subscription } from 'rxjs';
import { LiveChartDataService } from '../../services/live-chart-data.service';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { CandleResponse } from '../../structures/candle';
import { IntervalResponse } from '../../structures/interval';
import { SymbolResponse } from '../../structures/symbol';

@Component({
  selector: 'app-lightweight-chart',
  templateUrl: './lightweight-chart.component.html',
  styleUrls: ['./lightweight-chart.component.css'],
})
export class LightweightChartComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chartContainer', { static: true })
  private readonly chartContainer!: ElementRef<HTMLDivElement>;

  @Input() initialSymbol = '';
  @Input() initialInterval = '';
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

  selectedSymbol = '';
  selectedInterval = '';
  isLoading = true;
  statusMessage = 'Loading...';
  liveStatus = '';
  isConnected = false;
  predictingKey: string | null = null;

  private chart?: IChartApi;
  private series?: ISeriesApi<'Candlestick'>;
  private predictSeries?: ISeriesApi<'Candlestick'>;
  private watermark?: ITextWatermarkPluginApi<Time>;
  private candlesSubscription?: Subscription;
  private liveCandlesSubscription?: Subscription;
  private predictSubscription?: Subscription;

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
    this.selectedSymbol = this.initialSymbol;
    this.selectedInterval = this.initialInterval;
    this.statusMessage = 'Loading candles...';

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

      this.predictSeries = this.chart.addSeries(CandlestickSeries, {
        upColor: '#2962ff',
        downColor: '#ffd600',
        borderVisible: false,
        wickUpColor: '#2962ff',
        wickDownColor: '#ffd600',
      });

      this.chart.timeScale().subscribeVisibleLogicalRangeChange(this.onVisibleRangeChange);
      this.watermark = createTextWatermark(this.chart.panes()[0], {
        horzAlign: 'left',
        vertAlign: 'top',
        lines: [{ text: this.selectedSymbol, color: 'rgba(209, 212, 220, 0.5)', fontSize: 18, fontFamily: 'inherit' }],
      });
    });

    this.loadCandles();
    this.streamLiveCandles();
  }

  ngOnDestroy(): void {
    this.candlesSubscription?.unsubscribe();
    this.liveCandlesSubscription?.unsubscribe();
    this.predictSubscription?.unsubscribe();
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

    this.isLoading = true;
    this.isConnected = false;
    this.isLoadingMore = false;
    this.lookback = 100;
    this.statusMessage = 'Loading candles...';
    this.liveStatus = '';
    this.predictingKey = null;

    this.ngZone.runOutsideAngular(() => {
      this.series?.setData([]);
      this.predictSeries?.setData([]);
    });

    this.loadCandles();
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
          this.ngZone.runOutsideAngular(() => {
            this.series?.setData(candles.map(c => this.toChartCandle(c)));
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
          this.ngZone.runOutsideAngular(() => {
            this.series?.setData(candles.map(c => this.toChartCandle(c)));
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
          this.ngZone.runOutsideAngular(() => {
            this.series?.update(this.toChartCandle(candle));
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
