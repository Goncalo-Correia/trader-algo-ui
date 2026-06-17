import { ErrorHandler, Injectable } from '@angular/core';
import { isAppError } from './app-error';
import { LoggerService } from './logger.service';

/**
 * Catches otherwise-unhandled errors (including those thrown out of RxJS
 * subscriptions without an error callback) so nothing fails silently.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  constructor(private readonly logger: LoggerService) {}

  handleError(error: unknown): void {
    if (isAppError(error)) {
      // Already logged and normalised by the HTTP error interceptor.
      this.logger.warn('Unhandled application error reached the global handler.', error.message);
      return;
    }
    this.logger.error('Uncaught error.', error);
  }
}
