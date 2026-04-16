import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
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
  styleUrls: ['./lightweight-chart.component.css']
})
export class LightweightChartComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chartContainer', { static: true })
  private chartContainer!: ElementRef<HTMLDivElement>;

  private readonly symbol = 'BTC-USD';
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

  isLoading = true;
  statusMessage = 'Loading candles from TraderAlgoApi...';
  liveStatus = 'Connecting to live BTC-USD candles...';
  selectedInterval: ChartInterval = '1h';
  readonly intervals: { label: string; value: ChartInterval }[] = [
    { label: '5m', value: '5m' },
    { label: '1H', value: '1h' },
  ];

  private chart?: IChartApi;
  private series?: ISeriesApi<'Candlestick'>;
  private candlesSubscription?: Subscription;
  private liveCandlesSubscription?: Subscription;

  constructor(
    private readonly traderAlgoApi: TraderAlgoApiService,
    private readonly liveChartData: LiveChartDataService
  ) {}

  ngAfterViewInit(): void {
    this.chart = createChart(this.chartContainer.nativeElement, {
      autoSize: true,
      layout: {
        background: { color: '#ffffff' },
        textColor: '#1f2937',
      },
      grid: {
        vertLines: { color: '#edf2f7' },
        horzLines: { color: '#edf2f7' },
      },
      rightPriceScale: {
        borderColor: '#d8dee9',
      },
      timeScale: {
        borderColor: '#d8dee9',
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: Time) => this.formatTimeLabel(time),
      },
      localization: {
        timeFormatter: (time: Time) => this.formatDateTimeLabel(time),
      },
    });

    this.series = this.chart.addSeries(CandlestickSeries, {
      upColor: '#16a34a',
      downColor: '#dc2626',
      borderVisible: false,
      wickUpColor: '#16a34a',
      wickDownColor: '#dc2626',
    });

    this.loadCandles();
    this.streamLiveCandles();
  }

  ngOnDestroy(): void {
    this.candlesSubscription?.unsubscribe();
    this.liveCandlesSubscription?.unsubscribe();
    this.chart?.remove();
  }

  onIntervalChange(interval: string): void {
    if (!this.isChartInterval(interval) || interval === this.selectedInterval) {
      return;
    }

    this.selectedInterval = interval;
    this.candlesSubscription?.unsubscribe();
    this.liveCandlesSubscription?.unsubscribe();
    this.series?.setData([]);
    this.isLoading = true;
    this.statusMessage = 'Loading candles from TraderAlgoApi...';
    this.liveStatus = `Connecting to live BTC-USD ${this.getIntervalLabel(interval)} candles...`;
    this.loadCandles();
    this.streamLiveCandles();
  }

  private loadCandles(): void {
    this.candlesSubscription = this.traderAlgoApi.getCandles({
      symbol: this.symbol,
      interval: this.selectedInterval,
    }).subscribe({
      next: candles => {
        this.isLoading = false;

        if (candles.length === 0) {
          this.statusMessage = 'No candles returned from TraderAlgoApi.';
          return;
        }

        this.series?.setData(candles.map(candle => this.toChartCandle(candle)));
        this.chart?.timeScale().fitContent();
        this.statusMessage = '';
      },
      error: error => {
        console.error('Unable to load candles from TraderAlgoApi.', error);
        this.isLoading = false;
        this.statusMessage = 'Unable to load candles from TraderAlgoApi.';
      },
    });
  }

  private streamLiveCandles(): void {
    this.liveCandlesSubscription = this.liveChartData.streamCandles(this.selectedInterval).subscribe({
      next: candle => {
        this.series?.update(this.toChartCandle(candle));
        this.liveStatus = `Live BTC-USD ${this.getIntervalLabel(this.selectedInterval)} candles connected.`;
      },
      error: error => {
        console.error('Unable to stream live candles from TraderAlgoApi.', error);
        this.liveStatus = 'Live BTC-USD candle stream disconnected.';
      },
      complete: () => {
        this.liveStatus = 'Live BTC-USD candle stream closed.';
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
    const seconds = time > 9999999999 ? Math.floor(time / 1000) : time;

    return seconds as UTCTimestamp;
  }

  private formatTimeLabel(time: Time): string {
    return this.timeLabelFormatter.format(this.toDate(time));
  }

  private formatDateTimeLabel(time: Time): string {
    return this.dateTimeLabelFormatter.format(this.toDate(time));
  }

  private toDate(time: Time): Date {
    if (typeof time === 'number') {
      return new Date(time * 1000);
    }

    if (typeof time === 'string') {
      return new Date(`${time}T00:00:00Z`);
    }

    return new Date(Date.UTC(time.year, time.month - 1, time.day));
  }

  private getIntervalLabel(interval: ChartInterval): string {
    return this.intervals.find(option => option.value === interval)?.label ?? interval;
  }

  private isChartInterval(interval: string): interval is ChartInterval {
    return interval === '5m' || interval === '1h';
  }
}
