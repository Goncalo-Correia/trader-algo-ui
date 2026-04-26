import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CandleRequest, CandleResponse } from '../structures/candle';
import { IntervalResponse } from '../structures/interval';
import { SymbolResponse } from '../structures/symbol';

@Injectable({ providedIn: 'root' })
export class TraderAlgoApiService {
  private readonly baseUrl = 'http://localhost:32770';

  constructor(private readonly http: HttpClient) {}

  getCandles(request: CandleRequest = {}): Observable<CandleResponse[]> {
    let params = new HttpParams();
    Object.entries(request).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params = params.set(key, String(value));
      }
    });
    return this.http.get<CandleResponse[]>(`${this.baseUrl}/api/charts/candles`, { params });
  }

  kronosMiniPrecise(symbol: string, interval: string): Observable<CandleResponse[]> {
    return this.kronosGet('mini/precise', symbol, interval);
  }

  kronosMiniDiverse(symbol: string, interval: string): Observable<CandleResponse[]> {
    return this.kronosGet('mini/diverse', symbol, interval);
  }

  kronosSmallPrecise(symbol: string, interval: string): Observable<CandleResponse[]> {
    return this.kronosGet('small/precise', symbol, interval);
  }

  kronosSmallDiverse(symbol: string, interval: string): Observable<CandleResponse[]> {
    return this.kronosGet('small/diverse', symbol, interval);
  }

  kronosBasePrecise(symbol: string, interval: string): Observable<CandleResponse[]> {
    return this.kronosGet('base/precise', symbol, interval);
  }

  kronosBaseDiverse(symbol: string, interval: string): Observable<CandleResponse[]> {
    return this.kronosGet('base/diverse', symbol, interval);
  }

  getIntervals(): Observable<IntervalResponse[]> {
    return this.http.get<IntervalResponse[]>(`${this.baseUrl}/api/intervals`);
  }

  getSymbols(): Observable<SymbolResponse[]> {
    return this.http.get<SymbolResponse[]>(`${this.baseUrl}/api/symbols`);
  }

  private kronosGet(path: string, symbol: string, interval: string): Observable<CandleResponse[]> {
    const params = new HttpParams().set('symbol', symbol).set('interval', interval);
    return this.http.get<CandleResponse[]>(`${this.baseUrl}/api/kronos/${path}`, { params });
  }
}
