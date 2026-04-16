import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CandleResponse } from './trader-algo-api.service';

export type ChartInterval = '5m' | '1h';

@Injectable({
  providedIn: 'root'
})
export class LiveChartDataService {
  private readonly candlesBaseUrl = 'ws://localhost:32768/ws/charts/BTC-USD/candles';

  streamCandles(interval: ChartInterval): Observable<CandleResponse> {
    return new Observable<CandleResponse>(subscriber => {
      const socket = new WebSocket(`${this.candlesBaseUrl}?interval=${encodeURIComponent(interval)}`);

      socket.onmessage = event => {
        try {
          const message = JSON.parse(String(event.data)) as CandleResponse | CandleResponse[];
          const candles = Array.isArray(message) ? message : [message];

          candles.forEach(candle => subscriber.next(candle));
        } catch (error) {
          subscriber.error(error);
        }
      };

      socket.onerror = event => {
        subscriber.error(event);
      };

      socket.onclose = () => {
        subscriber.complete();
      };

      return () => {
        if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      };
    });
  }
}
