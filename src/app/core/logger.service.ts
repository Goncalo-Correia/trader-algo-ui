import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

/**
 * Single entry point for application logging.
 *
 * Centralising this (instead of scattering `console.*` calls) means log
 * levels can be filtered in production and the transport can later be swapped
 * for a remote sink without touching call sites.
 */
@Injectable({ providedIn: 'root' })
export class LoggerService {
  /** Verbose diagnostics — suppressed in production builds. */
  debug(message: string, ...context: unknown[]): void {
    if (!environment.production) {
      console.debug(`[debug] ${message}`, ...context);
    }
  }

  info(message: string, ...context: unknown[]): void {
    console.info(`[info] ${message}`, ...context);
  }

  warn(message: string, ...context: unknown[]): void {
    console.warn(`[warn] ${message}`, ...context);
  }

  error(message: string, ...context: unknown[]): void {
    console.error(`[error] ${message}`, ...context);
  }
}
