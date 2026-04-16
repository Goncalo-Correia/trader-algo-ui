import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CandleRequest {
  symbol?: string;
  interval?: string;
}

export interface CandleResponse {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

@Injectable({
  providedIn: 'root'
})
export class TraderAlgoApiService {
  private readonly candlesUrl = 'http://localhost:32768/api/charts/candles';

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
}
