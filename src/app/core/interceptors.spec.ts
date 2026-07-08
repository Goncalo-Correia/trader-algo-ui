import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpHandler, HttpRequest, HttpResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiKeyInterceptor } from './api-key.interceptor';
import { AuthInterceptor } from './auth.interceptor';
import { ErrorInterceptor } from './error.interceptor';
import { LoggerService } from './logger.service';
import { TokenStorageService } from './token-storage.service';
import { AppError, isAppError } from './app-error';

/** Captures the (possibly cloned) request that reaches the next handler. */
function capturingHandler(): { handler: HttpHandler; last: () => HttpRequest<unknown> | undefined } {
  let seen: HttpRequest<unknown> | undefined;
  const handler: HttpHandler = {
    handle: req => {
      seen = req;
      return of(new HttpResponse({ status: 200 }));
    },
  };
  return { handler, last: () => seen };
}

describe('ApiKeyInterceptor', () => {
  const original = { apiKey: environment.traderAlgoApi.apiKey, baseUrl: environment.traderAlgoApi.baseUrl };

  afterEach(() => {
    environment.traderAlgoApi.apiKey = original.apiKey;
    environment.traderAlgoApi.baseUrl = original.baseUrl;
  });

  it('adds X-Api-Key to requests bound for the API base URL', () => {
    environment.traderAlgoApi.apiKey = 'secret-key';
    environment.traderAlgoApi.baseUrl = 'https://api.example.com';
    const interceptor = new ApiKeyInterceptor();
    const { handler, last } = capturingHandler();

    interceptor.intercept(new HttpRequest('GET', 'https://api.example.com/api/symbols'), handler).subscribe();

    expect(last()!.headers.get('X-Api-Key')).toBe('secret-key');
  });

  it('never leaks the key to a third-party URL', () => {
    environment.traderAlgoApi.apiKey = 'secret-key';
    environment.traderAlgoApi.baseUrl = 'https://api.example.com';
    const interceptor = new ApiKeyInterceptor();
    const { handler, last } = capturingHandler();

    interceptor.intercept(new HttpRequest('GET', 'https://evil.example.org/steal'), handler).subscribe();

    expect(last()!.headers.has('X-Api-Key')).toBe(false);
  });

  it('is a no-op when no key is configured', () => {
    environment.traderAlgoApi.apiKey = '';
    environment.traderAlgoApi.baseUrl = 'https://api.example.com';
    const interceptor = new ApiKeyInterceptor();
    const { handler, last } = capturingHandler();

    interceptor.intercept(new HttpRequest('GET', 'https://api.example.com/api/symbols'), handler).subscribe();

    expect(last()!.headers.has('X-Api-Key')).toBe(false);
  });
});

describe('AuthInterceptor', () => {
  let tokenStorage: jasmine.SpyObj<TokenStorageService>;
  let interceptor: AuthInterceptor;

  beforeEach(() => {
    tokenStorage = jasmine.createSpyObj<TokenStorageService>('TokenStorageService', ['getToken']);
    TestBed.configureTestingModule({
      providers: [AuthInterceptor, { provide: TokenStorageService, useValue: tokenStorage }],
    });
    interceptor = TestBed.inject(AuthInterceptor);
  });

  it('attaches a bearer header when a token is present', () => {
    tokenStorage.getToken.and.returnValue('jwt-123');
    const { handler, last } = capturingHandler();

    interceptor.intercept(new HttpRequest('GET', '/api/x'), handler).subscribe();

    expect(last()!.headers.get('Authorization')).toBe('Bearer jwt-123');
  });

  it('is a no-op when no token is held', () => {
    tokenStorage.getToken.and.returnValue(null);
    const { handler, last } = capturingHandler();

    interceptor.intercept(new HttpRequest('GET', '/api/x'), handler).subscribe();

    expect(last()!.headers.has('Authorization')).toBe(false);
  });
});

describe('ErrorInterceptor', () => {
  let logger: jasmine.SpyObj<LoggerService>;
  let interceptor: ErrorInterceptor;

  beforeEach(() => {
    logger = jasmine.createSpyObj<LoggerService>('LoggerService', ['error']);
    TestBed.configureTestingModule({
      providers: [ErrorInterceptor, { provide: LoggerService, useValue: logger }],
    });
    interceptor = TestBed.inject(ErrorInterceptor);
  });

  function intercept(error: HttpErrorResponse): Promise<AppError> {
    const handler: HttpHandler = { handle: () => throwError(() => error) };
    return new Promise((resolve, reject) => {
      interceptor
        .intercept(new HttpRequest('GET', '/api/x'), handler)
        .subscribe({ next: () => reject('expected an error'), error: resolve });
    });
  }

  it('normalises HttpErrorResponse into an AppError and logs once', async () => {
    const appError = await intercept(new HttpErrorResponse({ status: 500, error: { message: 'kaboom' } }));
    expect(isAppError(appError)).toBe(true);
    expect(appError.status).toBe(500);
    expect(appError.message).toBe('kaboom');
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('reports a friendly message for a status-0 network error', async () => {
    const appError = await intercept(new HttpErrorResponse({ status: 0 }));
    expect(appError.status).toBe(0);
    expect(appError.message).toBe('Network error — the server is unreachable.');
  });

  it('prefers a plain string error body', async () => {
    const appError = await intercept(new HttpErrorResponse({ status: 400, error: 'bad request text' }));
    expect(appError.message).toBe('bad request text');
  });

  it('falls back to the error `error` field then `message` field', async () => {
    const appError = await intercept(new HttpErrorResponse({ status: 422, error: { error: 'validation failed' } }));
    expect(appError.message).toBe('validation failed');
  });
});
