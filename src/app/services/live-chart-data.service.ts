import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CandleResponse, CandleWithIndicatorsResponse } from '../structures/candle';
import { BacktestStreamEvent } from '../structures/backtest';
import { environment } from '../../environments/environment';

export type ChartInterval = string;

@Injectable({
  providedIn: 'root'
})
export class LiveChartDataService {
  private readonly candlesUrl = `${environment.traderAlgoApi.wsUrl}/ws/charts/candles`;
  private readonly candlesWithIndicatorsUrl = `${environment.traderAlgoApi.wsUrl}/ws/charts/candleswithindicators`;

  streamCandles(symbol: string, interval: ChartInterval): Observable<CandleResponse> {
    return new Observable<CandleResponse>(subscriber => {
      const socket = new WebSocket(`${this.candlesUrl}?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`);

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

  streamBacktest(backtestId: number): Observable<BacktestStreamEvent> {
    return new Observable<BacktestStreamEvent>(subscriber => {
      const socket = new WebSocket(
        `${environment.traderAlgoApi.wsUrl}/ws/charts/backtest?backtestId=${backtestId}`,
      );

      socket.onmessage = event => {
        try {
          const envelope = JSON.parse(String(event.data)) as { type: string; data: unknown };
          if (envelope.type === 'candle') {
            subscriber.next({ type: 'candle', data: envelope.data as CandleWithIndicatorsResponse });
          } else if (envelope.type === 'tradeBracketUpdate') {
            subscriber.next({ type: 'tradeBracketUpdate', data: envelope.data as { tradeId: number; stopLoss: number | null; takeProfit: number | null } });
          }
        } catch (error) {
          subscriber.error(error);
        }
      };

      socket.onerror = event => { subscriber.error(event); };
      socket.onclose = () => { subscriber.complete(); };

      return () => {
        if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      };
    });
  }

  streamCandlesWithIndicators(symbol: string, interval: ChartInterval): Observable<CandleWithIndicatorsResponse> {
    return new Observable<CandleWithIndicatorsResponse>(subscriber => {
      const socket = new WebSocket(
        `${this.candlesWithIndicatorsUrl}?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`,
      );

      socket.onmessage = event => {
        try {
          const message = JSON.parse(String(event.data)) as CandleWithIndicatorsResponse | CandleWithIndicatorsResponse[];
          const candles = Array.isArray(message) ? message : [message];
          candles.forEach(candle => subscriber.next(candle));
        } catch (error) {
          subscriber.error(error);
        }
      };

      socket.onerror = event => { subscriber.error(event); };
      socket.onclose = () => { subscriber.complete(); };

      return () => {
        if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      };
    });
  }
}
