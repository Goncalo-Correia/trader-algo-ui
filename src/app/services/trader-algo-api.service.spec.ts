import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TraderAlgoApiService } from './trader-algo-api.service';
import { CandleWithIndicatorsDto } from '../structures/candle';
import { environment } from '../../environments/environment';

describe('TraderAlgoApiService', () => {
  let service: TraderAlgoApiService;
  let httpMock: HttpTestingController;
  const baseUrl = environment.traderAlgoApi.baseUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TraderAlgoApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TraderAlgoApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('surfaces an empty symbol list without error', () => {
    let result: unknown[] | undefined;
    service.getSymbols().subscribe(r => (result = r));
    httpMock.expectOne(`${baseUrl}/api/symbols`).flush([]);
    expect(result).toEqual([]);
  });

  it('surfaces an empty interval list without error', () => {
    let result: unknown[] | undefined;
    service.getIntervals().subscribe(r => (result = r));
    httpMock.expectOne(`${baseUrl}/api/intervals`).flush([]);
    expect(result).toEqual([]);
  });

  it('builds query params from the request, skipping null/undefined values', () => {
    service.getCandles({ symbol: 'BTCUSDT', interval: undefined, lookback: 100 }).subscribe();
    const req = httpMock.expectOne(r => r.url === `${baseUrl}/api/charts/candles`);
    expect(req.request.params.get('symbol')).toBe('BTCUSDT');
    expect(req.request.params.get('lookback')).toBe('100');
    expect(req.request.params.has('interval')).toBe(false);
    req.flush([]);
  });

  it('maps the snake_case candle-with-indicators DTO to the camelCase domain model', () => {
    const dto: CandleWithIndicatorsDto = {
      time: 1000,
      open: 1,
      high: 2,
      low: 0.5,
      close: 1.5,
      volume: 10,
      taker_buy_base_asset_volume: 6,
      taker_sell_base_asset_volume: 4,
      sma_20: 1.1,
      sma_100: null,
      rsi: 55,
      rsi_smooth: 54,
      rsi_divergence: true,
      macd_line: 0.2,
      macd_signal_line: 0.1,
      macd_histogram: 0.1,
      atr_period: 14,
      atr_true_range: 0.8,
      atr: 1.4,
    };

    let mapped: { takerBuyVolume?: number; sma20?: number | null; macdLine?: number | null; atr?: number | null }[] =
      [];
    service.getCandlesWithIndicators({ symbol: 'BTCUSDT' }).subscribe(r => (mapped = r));

    httpMock.expectOne(r => r.url === `${baseUrl}/api/charts/candles/indicators`).flush([dto]);

    expect(mapped.length).toBe(1);
    expect(mapped[0].takerBuyVolume).toBe(6);
    expect(mapped[0].sma20).toBe(1.1);
    expect(mapped[0].macdLine).toBe(0.2);
    expect(mapped[0].atr).toBe(1.4);
  });
});
