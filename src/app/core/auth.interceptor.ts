import { Injectable } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TokenStorageService } from './token-storage.service';

/**
 * Attaches the bearer token (when present) to outgoing API requests.
 *
 * This is a no-op until {@link TokenStorageService} holds a token, so it is
 * safe to enable now and light up automatically once auth is implemented.
 */
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private readonly tokenStorage: TokenStorageService) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const token = this.tokenStorage.getToken();
    if (!token) return next.handle(request);

    return next.handle(
      request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }),
    );
  }
}
