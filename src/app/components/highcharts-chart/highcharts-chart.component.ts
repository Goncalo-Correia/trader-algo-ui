import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
// Type-only import (erased at build time). The library itself is loaded
// dynamically in ngAfterViewInit so its ~400 kB stays out of the initial
// bundle and only downloads on pages that actually render a Highcharts chart.
import type * as Highcharts from 'highcharts/highstock';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-highcharts-chart',
  template: '<div #chartEl class="hc-container"></div>',
  styles: [':host { display: block; width: 100%; height: 100%; }', '.hc-container { width: 100%; height: 100%; }'],
})
export class HighchartsChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('chartEl', { static: true }) chartEl!: ElementRef<HTMLDivElement>;

  @Input() options: Highcharts.Options = {};
  @Input() useStock = false;

  @Output() chartCreated = new EventEmitter<Highcharts.Chart>();

  private chart?: Highcharts.Chart;

  ngOnChanges(changes: SimpleChanges): void {
    if (this.chart && changes['options']) {
      this.chart.update(this.options, true, true);
    }
  }

  async ngAfterViewInit(): Promise<void> {
    const mod = await import('highcharts/highstock');
    const hc = ((mod as { default?: typeof Highcharts }).default ?? mod) as typeof Highcharts;
    this.chart = this.useStock
      ? hc.stockChart(this.chartEl.nativeElement, this.options)
      : hc.chart(this.chartEl.nativeElement, this.options);
    this.chartCreated.emit(this.chart);
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }
}
