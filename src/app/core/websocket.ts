import { Observable, timer } from 'rxjs';
import { retry } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/**
 * Appends the backend API key as an `apiKey` query parameter. WebSocket
 * handshakes can't carry a custom header from the browser, so the backend reads
 * the key from the query string for upgrade requests. A no-op when unset.
 */
function withApiKey(url: string): string {
  const key = environment.traderAlgoApi.apiKey;
  if (!key) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}apiKey=${encodeURIComponent(key)}`;
}

export interface WebSocketOptions<T> {
  /**
   * Parse and validate a decoded JSON frame into zero or more values.
   * Return an empty array to silently skip frames that aren't relevant or
   * fail validation — this is the single runtime boundary for untyped data.
   */
  parse: (raw: unknown) => T[];
  /**
   * Reconnect with exponential backoff after an abnormal close. Defaults to
   * `true`. Set `false` for finite streams (e.g. a backtest replay) where a
   * server-side close means "done", not "dropped".
   */
  reconnect?: boolean;
  /** Initial backoff delay in ms (doubles each attempt). */
  baseDelayMs?: number;
  /** Maximum backoff delay in ms. */
  maxDelayMs?: number;
}

/**
 * Wraps a WebSocket as a cold Observable: connects on subscribe, closes on
 * unsubscribe, completes on a clean close, and (optionally) reconnects with
 * exponential backoff on an abnormal drop.
 *
 * Centralising this removes the near-identical socket boilerplate that was
 * previously duplicated across every streaming endpoint.
 */
export function connectWebSocket<T>(url: string, options: WebSocketOptions<T>): Observable<T> {
  const { parse, reconnect = true, baseDelayMs = 1_000, maxDelayMs = 15_000 } = options;

  const source$ = new Observable<T>(subscriber => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(withApiKey(url));
    } catch (err) {
      subscriber.error(err);
      return;
    }

    socket.onmessage = event => {
      let raw: unknown;
      try {
        raw = JSON.parse(String(event.data));
      } catch {
        return; // ignore malformed (non-JSON) frames
      }
      for (const value of parse(raw)) subscriber.next(value);
    };

    socket.onclose = event => {
      if (event.wasClean || event.code === 1000) subscriber.complete();
      else subscriber.error(new Error(`WebSocket closed unexpectedly (code ${event.code}).`));
    };

    return () => {
      if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  });

  if (!reconnect) return source$;

  return source$.pipe(
    retry({
      delay: (_error, retryCount) =>
        timer(Math.min(maxDelayMs, baseDelayMs * 2 ** (retryCount - 1))),
    }),
  );
}
