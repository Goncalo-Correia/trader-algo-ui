import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CandleResponse } from '../structures/candle';

export type ChartInterval = string;

@Injectable({
  providedIn: 'root'
})
export class LiveChartDataService {
  private readonly candlesBaseUrl = 'ws://localhost:32768/ws/charts';

  streamCandles(symbol: string, interval: ChartInterval): Observable<CandleResponse> {
    return new Observable<CandleResponse>(subscriber => {
      const socket = new WebSocket(`${this.candlesBaseUrl}/${encodeURIComponent(symbol)}/candles?interval=${encodeURIComponent(interval)}`);

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
