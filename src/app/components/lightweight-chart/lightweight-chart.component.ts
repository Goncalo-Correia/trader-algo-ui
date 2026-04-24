import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild } from '@angular/core';
import {
  CandlestickData,
  CandlestickSeries,
  createChart,
  createTextWatermark,
  IChartApi,
  ISeriesApi,
  LogicalRange,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import { forkJoin, Subscription } from 'rxjs';
import { LiveChartDataService } from '../../services/live-chart-data.service';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { CandleResponse } from '../../structures/candle';
import { IntervalResponse } from '../../structures/interval';

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

  private selectedSymbol = '';
  selectedInterval = '';
  isLoading = true;
  statusMessage = 'Loading...';
  liveStatus = '';
  isConnected = false;

  private chart?: IChartApi;
  private series?: ISeriesApi<'Candlestick'>;
  private candlesSubscription?: Subscription;
  private liveCandlesSubscription?: Subscription;
  private intervalButtonEls: { code: string; element: HTMLButtonElement }[] = [];

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

      this.chart.timeScale().subscribeVisibleLogicalRangeChange(this.onVisibleRangeChange);
    });

    forkJoin({
      symbols: this.traderAlgoApi.getSymbols(),
      intervals: this.traderAlgoApi.getIntervals(),
    }).subscribe({
      next: ({ symbols, intervals }) => {
        const defaultSymbol = symbols.find(s => s.isDefault) ?? symbols[0];
        const defaultInterval = intervals.find(i => i.isDefault) ?? intervals[0];

        this.selectedSymbol = defaultSymbol.code;
        this.selectedInterval = defaultInterval.code;
        this.statusMessage = 'Loading candles...';

        this.ngZone.runOutsideAngular(() => {
          this.showSymbolWatermark(this.selectedSymbol);
          this.buildIntervalButtons(intervals.filter(i => i.isActive));
        });

        this.loadCandles();
        this.streamLiveCandles();
      },
      error: err => {
        console.error('Failed to load chart config.', err);
        this.isLoading = false;
        this.statusMessage = 'Failed to load chart configuration.';
      },
    });
  }

  ngOnDestroy(): void {
    this.candlesSubscription?.unsubscribe();
    this.liveCandlesSubscription?.unsubscribe();
    this.chart?.timeScale().unsubscribeVisibleLogicalRangeChange(this.onVisibleRangeChange);
    this.chart?.remove();
  }

  private onIntervalChange(code: string): void {
    if (code === this.selectedInterval) return;

    this.selectedInterval = code;
    this.candlesSubscription?.unsubscribe();
    this.liveCandlesSubscription?.unsubscribe();

    this.isLoading = true;
    this.isConnected = false;
    this.isLoadingMore = false;
    this.lookback = 100;
    this.statusMessage = 'Loading candles...';
    this.liveStatus = '';

    this.ngZone.runOutsideAngular(() => {
      this.series?.setData([]);
      this.updateIntervalButtonStyles();
    });

    this.loadCandles();
    this.streamLiveCandles();
  }

  private showSymbolWatermark(symbol: string): void {
    createTextWatermark(this.chart!.panes()[0], {
      horzAlign: 'left',
      vertAlign: 'top',
      lines: [{ text: symbol, color: 'rgba(209, 212, 220, 0.5)', fontSize: 18, fontFamily: 'inherit' }],
    });
  }

  private buildIntervalButtons(intervals: IntervalResponse[]): void {
    const container = this.chart!.chartElement();

    const toolbar = document.createElement('div');
    Object.assign(toolbar.style, {
      position: 'absolute',
      top: '8px',
      left: '12px',
      zIndex: '3',
      display: 'flex',
      gap: '2px',
    });

    this.intervalButtonEls = intervals.map(interval => {
      const btn = document.createElement('button');
      btn.textContent = interval.code;
      this.applyIntervalButtonStyle(btn, interval.code === this.selectedInterval);
      btn.addEventListener('click', () => {
        this.ngZone.run(() => this.onIntervalChange(interval.code));
      });
      toolbar.appendChild(btn);
      return { code: interval.code, element: btn };
    });

    container.appendChild(toolbar);
  }

  private applyIntervalButtonStyle(btn: HTMLButtonElement, active: boolean): void {
    Object.assign(btn.style, {
      height: '26px',
      padding: '0 8px',
      fontSize: '12px',
      fontWeight: '600',
      color: active ? '#ffffff' : '#787b86',
      background: active ? '#2962ff' : 'transparent',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontFamily: 'inherit',
    });
  }

  private updateIntervalButtonStyles(): void {
    for (const { code, element } of this.intervalButtonEls) {
      this.applyIntervalButtonStyle(element, code === this.selectedInterval);
    }
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
