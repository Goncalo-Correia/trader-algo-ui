import { ErrorHandler, provideZoneChangeDetection } from '@angular/core';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { ApiKeyInterceptor } from './app/core/api-key.interceptor';
import { AuthInterceptor } from './app/core/auth.interceptor';
import { ErrorInterceptor } from './app/core/error.interceptor';
import { GlobalErrorHandler } from './app/core/global-error-handler';

bootstrapApplication(AppComponent, {
  providers: [
    // Angular is zoneless by default since v21; this app's components still
    // rely on zone.js to schedule change detection (see project notes).
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptorsFromDi()),
    { provide: HTTP_INTERCEPTORS, useClass: ApiKeyInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: ErrorInterceptor, multi: true },
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
  ],
}).catch(err => console.error(err));
