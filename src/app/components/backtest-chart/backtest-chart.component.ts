import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  HistogramData,
  HistogramSeries,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  LineStyle,
  LineSeries,
  SeriesMarker,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import { CandleWithIndicators } from '../../structures/candle';
import { ActiveCandlePlugin } from '../../chart-plugins/active-candle.plugin';
import { SessionMarkersPlugin } from '../../chart-plugins/session-markers.plugin';
import { Trade } from '../../structures/trade';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-backtest-chart',
  templateUrl: './backtest-chart.component.html',
  styleUrls: ['./backtest-chart.component.css'],
})
export class BacktestChartComponent implements AfterViewInit, OnDestroy {
  private readonly ngZone = inject(NgZone);

  @ViewChild('chartContainer', { static: true })
  private readonly chartContainer!: ElementRef<HTMLDivElement>;

  @Input() set candles(data: CandleWithIndicators[]) {
    this._candles = data;
    if (this.chart) this.ngZone.runOutsideAngular(() => this.renderCandles(data));
  }

  @Input() set isNySessionOnly(value: boolean) {
    this._isNySessionOnly = value;
    if (this.chart) this.ngZone.runOutsideAngular(() => this.applySessionMarkers());
  }

  @Input() set playbackTime(unixSeconds: number | null) {
    this._playbackTime = unixSeconds;
    if (this.chart) this.ngZone.runOutsideAngular(() => this.applyPlayback(unixSeconds));
  }

  @Input() set trades(trades: Trade[]) {
    this._trades = trades;
    if (this.chart)
      this.ngZone.runOutsideAngular(() => {
        this.applyTradeMarkers();
        this.applyBracketLines();
      });
  }

  showVolume = true;
  showRsi = true;
  showMacd = true;
  showTrades = true;

  private _candles: CandleWithIndicators[] = [];
  private _playbackTime: number | null = null;
  private _trades: Trade[] = [];
  private _isNySessionOnly = false;

  private chart?: IChartApi;
  private candleSeries?: ISeriesApi<'Candlestick'>;
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

  private activeCandlePlugin?: ActiveCandlePlugin;
  private sessionMarkersPlugin?: SessionMarkersPlugin;
  private tradeMarkersPlugin?: ISeriesMarkersPluginApi<Time>;
  private slPriceLine?: IPriceLine;
  private tpPriceLine?: IPriceLine;
  private hasAppliedInitialViewport = false;

  // Incremental-render bookkeeping: how many candles are already on the chart, the time of
  // the first one (to detect a brand-new run vs. an append), and the previous MACD-histogram
  // value (needed for the per-bar growing/fading colour when appending one bar at a time).
  private renderedCount = 0;
  private firstRenderedTime: UTCTimestamp | null = null;
  private lastMacdHistValue: number | null = null;

  ngAfterViewInit(): void {
    this.ngZone.runOutsideAngular(() => {
      this.chart = createChart(this.chartContainer.nativeElement, {
        autoSize: true,
        layout: { background: { color: '#000000' }, textColor: '#d1d4dc' },
        grid: { vertLines: { color: 'transparent' }, horzLines: { color: 'transparent' } },
        rightPriceScale: { borderColor: '#2a2d3a' },
        timeScale: { borderColor: '#2a2d3a', timeVisible: true, secondsVisible: false },
        crosshair: {
          vertLine: { labelBackgroundColor: '#2962ff' },
          horzLine: { labelBackgroundColor: '#2962ff' },
        },
      });

      // Pane 0 — candlesticks + SMAs
      this.candleSeries = this.chart.addSeries(CandlestickSeries, {
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
      });

      this.activeCandlePlugin = new ActiveCandlePlugin();
      this.candleSeries.attachPrimitive(this.activeCandlePlugin);

      const smaOpts = {
        priceScaleId: 'right',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      } as const;
      this.sma20Series = this.chart.addSeries(LineSeries, { ...smaOpts, color: '#f59e0b' });
      this.sma100Series = this.chart.addSeries(LineSeries, { ...smaOpts, color: '#818cf8' });

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
      this.rsiSeries = this.chart.addSeries(LineSeries, { ...rsiOpts, color: '#9c27b0', lastValueVisible: true }, 2);
      this.rsiMaSeries = this.chart.addSeries(LineSeries, { ...rsiOpts, color: '#ffd600', lastValueVisible: true }, 2);
      this.rsiOverbought = this.chart.addSeries(LineSeries, { ...rsiOpts, color: '#ef5350' }, 2);
      this.rsiOversold = this.chart.addSeries(LineSeries, { ...rsiOpts, color: '#26a69a' }, 2);
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
        { ...macdOpts, color: '#2962ff', lastValueVisible: true },
        3,
      );
      this.macdSignalSeries = this.chart.addSeries(
        LineSeries,
        { ...macdOpts, color: '#ff6d00', lastValueVisible: true },
        3,
      );
      this.macdHistSeries = this.chart.addSeries(
        HistogramSeries,
        { priceScaleId: 'macd', priceLineVisible: false, lastValueVisible: false },
        3,
      );
      this.macdZeroSeries = this.chart.addSeries(LineSeries, { ...macdOpts, color: '#4a4d5a' }, 3);
      this.macdLineSeries.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    });

    if (this._candles.length) {
      this.ngZone.runOutsideAngular(() => this.applyAllSeries(this._candles));
    }
    if (this._playbackTime !== null) {
      this.ngZone.runOutsideAngular(() => this.applyPlayback(this._playbackTime));
    }
    if (this._trades.length) {
      this.ngZone.runOutsideAngular(() => {
        this.applyTradeMarkers();
        this.applyBracketLines();
      });
    }
  }

  ngOnDestroy(): void {
    this.chart?.remove();
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

  private applyTradeMarkers(): void {
    if (!this.candleSeries) return;
    if (!this.tradeMarkersPlugin) {
      this.tradeMarkersPlugin = createSeriesMarkers(this.candleSeries, []);
    }
    if (!this.showTrades) {
      this.tradeMarkersPlugin.setMarkers([]);
      return;
    }
    const markers: SeriesMarker<Time>[] = [];
    for (const t of this._trades) {
      if (t.openedAt !== null && t.entryPrice !== null) {
        const isBuy = t.side === 'Buy';
        markers.push({
          time: this.toTime(t.openedAt) as Time,
          position: isBuy ? 'belowBar' : 'aboveBar',
          color: isBuy ? '#26a69a' : '#ef5350',
          shape: isBuy ? 'arrowUp' : 'arrowDown',
          text: t.side,
          size: 1,
        });
      }
      if (t.closedAt !== null && t.closedPrice !== null) {
        const isBuy = t.side === 'Buy';
        const pnlText = t.pnl !== null ? ` ${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}` : '';
        markers.push({
          time: this.toTime(t.closedAt) as Time,
          position: isBuy ? 'aboveBar' : 'belowBar',
          color: '#f59e0b',
          shape: 'circle',
          text: `✕${pnlText}`,
          size: 1,
        });
      }
    }
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    this.tradeMarkersPlugin.setMarkers(markers);
  }

  private applyBracketLines(): void {
    if (!this.candleSeries) return;

    if (this.slPriceLine) {
      this.candleSeries.removePriceLine(this.slPriceLine);
      this.slPriceLine = undefined;
    }
    if (this.tpPriceLine) {
      this.candleSeries.removePriceLine(this.tpPriceLine);
      this.tpPriceLine = undefined;
    }

    const trade = this._trades.find(t => t.status === 'Active' || t.status === 'Pending');
    if (!trade || trade.entryPrice === null) return;

    const entry = Number(trade.entryPrice);
    const isBuy = trade.side === 'Buy';

    if (trade.stopLoss !== null) {
      const slPrice = isBuy ? entry - Number(trade.stopLoss) : entry + Number(trade.stopLoss);
      const isBreakeven = Number(trade.stopLoss) === 0;
      this.slPriceLine = this.candleSeries.createPriceLine({
        price: slPrice,
        color: isBreakeven ? '#ffd600' : '#ef5350',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: isBreakeven ? 'BE' : 'SL',
      });
    }

    if (trade.takeProfit !== null) {
      const tpPrice = isBuy ? entry + Number(trade.takeProfit) : entry - Number(trade.takeProfit);
      this.tpPriceLine = this.candleSeries.createPriceLine({
        price: tpPrice,
        color: '#26a69a',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'TP',
      });
    }
  }

  private applySessionMarkers(): void {
    if (!this.candleSeries) return;
    if (this.sessionMarkersPlugin) {
      this.candleSeries.detachPrimitive(this.sessionMarkersPlugin);
      this.sessionMarkersPlugin = undefined;
    }
    if (!this._isNySessionOnly || this._candles.length === 0) return;
    const first = this._candles[0].time;
    const last = this._candles[this._candles.length - 1].time;
    const fromMs = (first > 9_999_999_999 ? first : first * 1000) - 86_400_000;
    const toMs = (last > 9_999_999_999 ? last : last * 1000) + 86_400_000;
    this.sessionMarkersPlugin = new SessionMarkersPlugin(fromMs, toMs);
    this.candleSeries.attachPrimitive(this.sessionMarkersPlugin);
  }

  /**
   * Chooses between a cheap incremental append and a full redraw. During a stream the input
   * array keeps growing with the same prefix, so we only push the newly-arrived tail bars via
   * `series.update()` (O(1) each) instead of re-`setData`-ing every series with the full array
   * on every frame. Anything else (first load, a new run, a shorter/replaced array) redraws.
   */
  private renderCandles(data: CandleWithIndicators[]): void {
    const isAppend =
      this.renderedCount > 0 &&
      this.firstRenderedTime !== null &&
      data.length > this.renderedCount &&
      this.toTime(data[0].time) === this.firstRenderedTime;

    if (isAppend) {
      this.appendCandles(data.slice(this.renderedCount));
    } else {
      this.applyAllSeries(data);
    }
  }

  private appendCandles(newCandles: CandleWithIndicators[]): void {
    for (const c of newCandles) {
      const time = this.toTime(c.time);
      this.candleSeries?.update({ time, open: c.open, high: c.high, low: c.low, close: c.close });
      this.volumeSeries?.update(this.toVolumeBar(c));
      this.deltaSeries?.update(this.toDeltaBar(c));
      if (c.sma20 !== null) this.sma20Series?.update({ time, value: c.sma20 });
      if (c.sma100 !== null) this.sma100Series?.update({ time, value: c.sma100 });
      if (c.rsi !== null) this.rsiSeries?.update({ time, value: c.rsi });
      if (c.rsiSmooth !== null) this.rsiMaSeries?.update({ time, value: c.rsiSmooth });
      if (c.macdLine !== null) this.macdLineSeries?.update({ time, value: c.macdLine });
      if (c.macdSignalLine !== null) this.macdSignalSeries?.update({ time, value: c.macdSignalLine });
      if (c.macdHistogram !== null) {
        this.macdHistSeries?.update(this.toMacdHistogramBar(c.macdHistogram, time));
      }
    }

    this.renderedCount = this._candles.length;
    this.extendReferenceLines();
    this.applySessionMarkers();
  }

  // Extends the horizontal RSI/MACD guide lines to the latest candle so they span the
  // freshly-appended bars (their value is constant, so collinear points are harmless).
  private extendReferenceLines(): void {
    const last = this._candles.at(-1);
    if (!last) return;
    const time = this.toTime(last.time);
    this.rsiOverbought?.update({ time, value: 70 });
    this.rsiOversold?.update({ time, value: 30 });
    this.macdZeroSeries?.update({ time, value: 0 });
  }

  private applyAllSeries(candles: CandleWithIndicators[]): void {
    const shouldFitInitialContent = candles.length > 0 && !this.hasAppliedInitialViewport;

    this.candleSeries?.setData(
      candles.map(c => ({
        time: this.toTime(c.time),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
    this.applySessionMarkers();
    this.applyTradeMarkers();
    this.applyBracketLines();

    this.sma20Series?.setData(
      candles.filter(c => c.sma20 !== null).map(c => ({ time: this.toTime(c.time), value: c.sma20! })),
    );
    this.sma100Series?.setData(
      candles.filter(c => c.sma100 !== null).map(c => ({ time: this.toTime(c.time), value: c.sma100! })),
    );

    this.volumeSeries?.setData(candles.map(c => this.toVolumeBar(c)));
    this.deltaSeries?.setData(candles.map(c => this.toDeltaBar(c)));

    this.rsiSeries?.setData(
      candles.filter(c => c.rsi !== null).map(c => ({ time: this.toTime(c.time), value: c.rsi! })),
    );
    this.rsiMaSeries?.setData(
      candles.filter(c => c.rsiSmooth !== null).map(c => ({ time: this.toTime(c.time), value: c.rsiSmooth! })),
    );

    const rsiCandles = candles.filter(c => c.rsi !== null);
    if (rsiCandles.length >= 2) {
      this.rsiOverbought?.setData([
        { time: this.toTime(rsiCandles[0].time), value: 70 },
        { time: this.toTime(rsiCandles[rsiCandles.length - 1].time), value: 70 },
      ]);
      this.rsiOversold?.setData([
        { time: this.toTime(rsiCandles[0].time), value: 30 },
        { time: this.toTime(rsiCandles[rsiCandles.length - 1].time), value: 30 },
      ]);
    }

    this.macdLineSeries?.setData(
      candles.filter(c => c.macdLine !== null).map(c => ({ time: this.toTime(c.time), value: c.macdLine! })),
    );
    this.macdSignalSeries?.setData(
      candles
        .filter(c => c.macdSignalLine !== null)
        .map(c => ({ time: this.toTime(c.time), value: c.macdSignalLine! })),
    );
    this.macdHistSeries?.setData(this.toMacdHistogram(candles));

    const macdCandles = candles.filter(c => c.macdLine !== null);
    if (macdCandles.length >= 2) {
      this.macdZeroSeries?.setData([
        { time: this.toTime(macdCandles[0].time), value: 0 },
        { time: this.toTime(macdCandles[macdCandles.length - 1].time), value: 0 },
      ]);
    }

    if (shouldFitInitialContent) {
      this.chart?.timeScale().setVisibleLogicalRange({ from: 0, to: 99 });
      this.hasAppliedInitialViewport = true;
    }

    // Snapshot state so subsequent input pushes can be appended incrementally.
    this.renderedCount = candles.length;
    this.firstRenderedTime = candles.length ? this.toTime(candles[0].time) : null;
  }

  private applyPlayback(unixSeconds: number | null): void {
    if (this.activeCandlePlugin) {
      this.activeCandlePlugin.setTime(unixSeconds !== null ? (unixSeconds as UTCTimestamp) : null);
    }
  }

  private toTime(unixSeconds: number): UTCTimestamp {
    return (unixSeconds > 9_999_999_999 ? Math.floor(unixSeconds / 1000) : unixSeconds) as UTCTimestamp;
  }

  private toVolumeBar(c: CandleWithIndicators): HistogramData<Time> {
    const takerTotal = c.takerBuyVolume + c.takerSellVolume;
    const vol = takerTotal > 0 ? takerTotal : c.volume;
    return { time: this.toTime(c.time), value: vol, color: c.close >= c.open ? '#26a69a' : '#ef5350' };
  }

  private toDeltaBar(c: CandleWithIndicators): HistogramData<Time> {
    const buy = c.takerBuyVolume;
    const sell = c.takerSellVolume;
    const total = buy + sell;
    const delta = total > 0 ? ((buy - sell) / total) * 100 : 0;
    return { time: this.toTime(c.time), value: delta, color: delta >= 0 ? '#26a69a' : '#ef5350' };
  }

  private toMacdHistogram(candles: CandleWithIndicators[]): HistogramData<Time>[] {
    this.lastMacdHistValue = null;
    const result: HistogramData<Time>[] = [];
    for (const c of candles) {
      if (c.macdHistogram === null) continue;
      result.push(this.toMacdHistogramBar(c.macdHistogram, this.toTime(c.time)));
    }
    return result;
  }

  // Colours a single MACD-histogram bar relative to the previous one. Tracks the last value on
  // the component so incremental appends stay consistent with the full-redraw colouring.
  private toMacdHistogramBar(h: number, time: UTCTimestamp): HistogramData<Time> {
    const prev = this.lastMacdHistValue;
    const growing = prev === null || (h >= 0 ? h >= prev : h <= prev);
    const color = h >= 0 ? (growing ? '#26a69a' : '#26a69a55') : growing ? '#ef5350' : '#ef535055';
    this.lastMacdHistValue = h;
    return { time, value: h, color };
  }
}
