import { Injectable } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AppError } from './app-error';
import { LoggerService } from './logger.service';

/**
 * Logs failed HTTP requests once, centrally, and normalises them into an
 * {@link AppError} so call sites get a consistent, displayable shape instead
 * of a raw {@link HttpErrorResponse}.
 */
@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  constructor(private readonly logger: LoggerService) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        const appError: AppError = {
          message: this.extractMessage(error),
          status: error.status ?? 0,
          cause: error,
        };
        this.logger.error(`${request.method} ${request.url} failed (${appError.status})`, appError.message);
        return throwError(() => appError);
      }),
    );
  }

  private extractMessage(error: HttpErrorResponse): string {
    if (error.status === 0) return 'Network error — the server is unreachable.';

    const body = error.error;
    if (typeof body === 'string' && body.trim()) return body;
    if (body && typeof body === 'object') {
      const record = body as Record<string, unknown>;
      if (typeof record['error'] === 'string') return record['error'];
      if (typeof record['message'] === 'string') return record['message'];
    }
    return error.message || `Request failed with status ${error.status}.`;
  }
}
