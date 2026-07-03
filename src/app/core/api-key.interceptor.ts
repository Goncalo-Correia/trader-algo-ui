import { Injectable } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Attaches the backend API key as the `X-Api-Key` header on requests bound for
 * the API (matched by base URL, so the key is never sent to a third party).
 *
 * The key is supplied at build time via the `TRADER_ALGO_API_KEY` env var (or a
 * git-ignored `.env.local.json` for local dev) — see {@link scripts/generate-env.mjs}.
 * It is never committed to the repo. A no-op when no key is configured.
 */
@Injectable()
export class ApiKeyInterceptor implements HttpInterceptor {
  private readonly apiKey = environment.traderAlgoApi.apiKey;
  private readonly baseUrl = environment.traderAlgoApi.baseUrl;

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (!this.apiKey || !request.url.startsWith(this.baseUrl)) {
      return next.handle(request);
    }

    return next.handle(
      request.clone({ setHeaders: { 'X-Api-Key': this.apiKey } }),
    );
  }
}
