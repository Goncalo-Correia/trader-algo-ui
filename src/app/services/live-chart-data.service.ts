import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CandleResponse, CandleWithIndicatorsResponse } from '../structures/candle';
import { BacktestStreamEvent, TradeBracketUpdate } from '../structures/backtest';
import { environment } from '../../environments/environment';
import { connectWebSocket } from '../core/websocket';

export type ChartInterval = string;

@Injectable({
  providedIn: 'root'
})
export class LiveChartDataService {
  private readonly candlesUrl = `${environment.traderAlgoApi.wsUrl}/ws/charts/candles`;
  private readonly candlesWithIndicatorsUrl = `${environment.traderAlgoApi.wsUrl}/ws/charts/candleswithindicators`;
  private readonly backtestUrl = `${environment.traderAlgoApi.wsUrl}/ws/charts/backtest`;

  streamCandles(symbol: string, interval: ChartInterval): Observable<CandleResponse> {
    const url = `${this.candlesUrl}?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`;
    return connectWebSocket<CandleResponse>(url, { parse: raw => parseCandleFrames<CandleResponse>(raw) });
  }

  streamCandlesWithIndicators(symbol: string, interval: ChartInterval): Observable<CandleWithIndicatorsResponse> {
    const url = `${this.candlesWithIndicatorsUrl}?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`;
    return connectWebSocket<CandleWithIndicatorsResponse>(url, { parse: raw => parseCandleFrames<CandleWithIndicatorsResponse>(raw) });
  }

  streamBacktest(backtestId: number, delay = false): Observable<BacktestStreamEvent> {
    const url = `${this.backtestUrl}?backtestId=${backtestId}&delay=${delay}`;
    // A backtest is a finite replay — a server close means "done", not "dropped".
    return connectWebSocket(url, { reconnect: false, parse: parseBacktestEvent });
  }
}

/** Accepts either a single candle frame or a batch, dropping any that fail shape validation. */
function parseCandleFrames<T extends CandleResponse | CandleWithIndicatorsResponse>(raw: unknown): T[] {
  const items = Array.isArray(raw) ? raw : [raw];
  // Shape is validated at this single network boundary; the cast is the only assertion.
  return items.filter(hasCandleShape) as T[];
}

function hasCandleShape(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c['time'] === 'number' &&
    typeof c['open'] === 'number' &&
    typeof c['high'] === 'number' &&
    typeof c['low'] === 'number' &&
    typeof c['close'] === 'number'
  );
}

function parseBacktestEvent(raw: unknown): BacktestStreamEvent[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const envelope = raw as { type?: unknown; data?: unknown };
  if (envelope.type === 'candle' && hasCandleShape(envelope.data)) {
    return [{ type: 'candle', data: envelope.data as CandleWithIndicatorsResponse }];
  }
  if (envelope.type === 'tradeBracketUpdate' && isTradeBracketUpdate(envelope.data)) {
    return [{ type: 'tradeBracketUpdate', data: envelope.data }];
  }
  return [];
}

function isTradeBracketUpdate(value: unknown): value is TradeBracketUpdate {
  if (typeof value !== 'object' || value === null) return false;
  const u = value as Record<string, unknown>;
  return typeof u['tradeId'] === 'number';
}
