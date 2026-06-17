import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { TradeBotEvent } from '../structures/trade-bot';
import { connectWebSocket } from '../core/websocket';

@Injectable({ providedIn: 'root' })
export class TradeBotEventsService {
  connect(tradingAccountId: number): Observable<TradeBotEvent> {
    const url = `${environment.traderAlgoApi.wsUrl}/ws/tradebots/events?tradingAccountId=${tradingAccountId}`;
    return connectWebSocket(url, { parse: parseTradeBotEvent });
  }
}

function parseTradeBotEvent(raw: unknown): TradeBotEvent[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const event = raw as Record<string, unknown>;
  // A valid event must at least carry a known string type.
  return typeof event['type'] === 'string' ? [raw as TradeBotEvent] : [];
}
