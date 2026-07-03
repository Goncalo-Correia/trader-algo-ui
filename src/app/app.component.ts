import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
})
export class AppComponent {}
