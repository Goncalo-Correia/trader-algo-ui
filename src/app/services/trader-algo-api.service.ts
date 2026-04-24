import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CandleRequest, CandleResponse } from '../structures/candle';
import { IntervalResponse } from '../structures/interval';
import { SymbolResponse } from '../structures/symbol';

@Injectable({
  providedIn: 'root'
})
export class TraderAlgoApiService {
  private readonly candlesUrl = 'http://localhost:32770/api/charts/candles';
  private readonly intervalsUrl = 'http://localhost:32770/api/intervals';
  private readonly symbolsUrl = 'http://localhost:32770/api/symbols';

  constructor(private readonly http: HttpClient) { }

  getCandles(request: CandleRequest = {}): Observable<CandleResponse[]> {
    let params = new HttpParams();

    Object.entries(request).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params = params.set(key, String(value));
      }
    });

    return this.http.get<CandleResponse[]>(this.candlesUrl, { params });
  }

  getIntervals(): Observable<IntervalResponse[]> {
    return this.http.get<IntervalResponse[]>(this.intervalsUrl);
  }

  getSymbols(): Observable<SymbolResponse[]> {
    return this.http.get<SymbolResponse[]>(this.symbolsUrl);
  }
}
