import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MultiChartComponent } from '../../components/multi-chart/multi-chart.component';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-charts-page',
  templateUrl: './charts-page.component.html',
  styleUrls: ['./charts-page.component.css'],
  imports: [MultiChartComponent],
})
export class ChartsPageComponent {}
