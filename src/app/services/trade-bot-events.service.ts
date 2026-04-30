import { Injectable, NgZone } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { TradeBotEvent } from '../structures/trade-bot';

@Injectable({ providedIn: 'root' })
export class TradeBotEventsService {
  constructor(private readonly ngZone: NgZone) {}

  connect(tradingAccountId: number): Observable<TradeBotEvent> {
    return new Observable<TradeBotEvent>(observer => {
      const url = `${environment.traderAlgoApi.wsUrl}/ws/tradebots/events?tradingAccountId=${tradingAccountId}`;
      const socket = new WebSocket(url);

      socket.onmessage = message => {
        this.ngZone.run(() => {
          try {
            observer.next(JSON.parse(message.data) as TradeBotEvent);
          } catch {
            console.warn('Ignored malformed tradebot event.', message.data);
          }
        });
      };

      socket.onerror = error => {
        console.warn('Tradebot event socket error.', error);
      };

      socket.onclose = () => {
        this.ngZone.run(() => observer.complete());
      };

      return () => {
        socket.close();
      };
    });
  }
}
