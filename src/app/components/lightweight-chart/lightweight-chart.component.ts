import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import {
  CandlestickData,
  CandlestickSeries,
  createChart,
  IChartApi,
  Time,
} from 'lightweight-charts';

@Component({
  selector: 'app-lightweight-chart',
  templateUrl: './lightweight-chart.component.html',
  styleUrls: ['./lightweight-chart.component.css']
})
export class LightweightChartComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chartContainer', { static: true })
  private chartContainer!: ElementRef<HTMLDivElement>;

  private chart?: IChartApi;

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
      },
    });

    const series = this.chart.addSeries(CandlestickSeries, {
      upColor: '#16a34a',
      downColor: '#dc2626',
      borderVisible: false,
      wickUpColor: '#16a34a',
      wickDownColor: '#dc2626',
    });

    series.setData(this.chartData);
    this.chart.timeScale().fitContent();
  }

  ngOnDestroy(): void {
    this.chart?.remove();
  }

  private readonly chartData: CandlestickData<Time>[] = [
    { time: '2026-04-01', open: 184.3, high: 189.1, low: 181.9, close: 187.4 },
    { time: '2026-04-02', open: 187.4, high: 191.7, low: 186.2, close: 190.8 },
    { time: '2026-04-03', open: 190.8, high: 192.3, low: 185.6, close: 186.9 },
    { time: '2026-04-06', open: 186.9, high: 188.8, low: 183.5, close: 184.7 },
    { time: '2026-04-07', open: 184.7, high: 187.6, low: 182.8, close: 186.5 },
    { time: '2026-04-08', open: 186.5, high: 193.2, low: 185.9, close: 192.4 },
    { time: '2026-04-09', open: 192.4, high: 195.8, low: 190.5, close: 194.6 },
    { time: '2026-04-10', open: 194.6, high: 197.2, low: 191.4, close: 192.1 },
    { time: '2026-04-13', open: 192.1, high: 198.9, low: 191.7, close: 198.2 },
    { time: '2026-04-14', open: 198.2, high: 201.6, low: 196.9, close: 200.4 },
    { time: '2026-04-15', open: 200.4, high: 203.1, low: 197.5, close: 198.8 },
    { time: '2026-04-16', open: 198.8, high: 204.4, low: 198.1, close: 203.6 },
  ];
}
