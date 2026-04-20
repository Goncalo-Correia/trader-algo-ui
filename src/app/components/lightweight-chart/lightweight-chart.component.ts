import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild } from '@angular/core';
import {
  CandlestickData,
  CandlestickSeries,
  createChart,
  IChartApi,
  ISeriesApi,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import { Subscription } from 'rxjs';
import { ChartInterval, LiveChartDataService } from '../../services/live-chart-data.service';
import { CandleResponse, TraderAlgoApiService } from '../../services/trader-algo-api.service';

@Component({
  selector: 'app-lightweight-chart',
  templateUrl: './lightweight-chart.component.html',
  styleUrls: ['./lightweight-chart.component.css'],
})
export class LightweightChartComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chartContainer', { static: true })
  private readonly chartContainer!: ElementRef<HTMLDivElement>;

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

  readonly symbol = 'BTC-USD';
  readonly intervals: { label: string; value: ChartInterval }[] = [
    { label: '5m', value: '5m' },
    { label: '1H', value: '1h' },
  ];

  isLoading = true;
  statusMessage = 'Loading candles...';
  liveStatus = '';
  isConnected = false;
  selectedInterval: ChartInterval = '1h';

  private chart?: IChartApi;
  private series?: ISeriesApi<'Candlestick'>;
  private candlesSubscription?: Subscription;
  private liveCandlesSubscription?: Subscription;

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
    });

    this.loadCandles();
    this.streamLiveCandles();
  }

  ngOnDestroy(): void {
    this.candlesSubscription?.unsubscribe();
    this.liveCandlesSubscription?.unsubscribe();
    this.chart?.remove();
  }

  onIntervalChange(interval: ChartInterval): void {
    if (interval === this.selectedInterval) return;

    this.selectedInterval = interval;
    this.candlesSubscription?.unsubscribe();
    this.liveCandlesSubscription?.unsubscribe();

    this.isLoading = true;
    this.isConnected = false;
    this.statusMessage = 'Loading candles...';
    this.liveStatus = '';

    this.ngZone.runOutsideAngular(() => this.series?.setData([]));

    this.loadCandles();
    this.streamLiveCandles();
  }

  private loadCandles(): void {
    this.candlesSubscription = this.traderAlgoApi
      .getCandles({ symbol: this.symbol, interval: this.selectedInterval })
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

  private streamLiveCandles(): void {
    this.liveCandlesSubscription = this.liveChartData
      .streamCandles(this.selectedInterval)
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
