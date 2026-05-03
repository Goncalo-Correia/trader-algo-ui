import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import * as Highcharts from 'highcharts/highstock';

@Component({
  selector: 'app-highcharts-chart',
  template: '<div #chartEl class="hc-container"></div>',
  styles: [
    ':host { display: block; width: 100%; height: 100%; }',
    '.hc-container { width: 100%; height: 100%; }',
  ],
})
export class HighchartsChartComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chartEl', { static: true }) chartEl!: ElementRef<HTMLDivElement>;

  @Input() options: Highcharts.Options = {};
  @Input() useStock = false;

  @Output() chartCreated = new EventEmitter<Highcharts.Chart>();

  private chart?: Highcharts.Chart;

  ngAfterViewInit(): void {
    this.chart = this.useStock
      ? Highcharts.stockChart(this.chartEl.nativeElement, this.options)
      : Highcharts.chart(this.chartEl.nativeElement, this.options);
    this.chartCreated.emit(this.chart);
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }
}
