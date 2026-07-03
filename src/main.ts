import { provideZoneChangeDetection } from '@angular/core';
import { platformBrowser } from '@angular/platform-browser';

import { AppModule } from './app/app.module';

platformBrowser()
  .bootstrapModule(AppModule, {
    // Angular is zoneless by default since v21; this app's NgModule-based
    // components still rely on zone.js to schedule change detection.
    applicationProviders: [provideZoneChangeDetection({ eventCoalescing: true })],
  })
  .catch((err) => console.error(err));
