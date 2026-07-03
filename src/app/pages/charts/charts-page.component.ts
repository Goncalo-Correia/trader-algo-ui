import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-charts-page',
  templateUrl: './charts-page.component.html',
  styleUrls: ['./charts-page.component.css'],
})
export class ChartsPageComponent {}
