# trader-algo-ui

Angular 15 single-page application that renders a real-time financial candlestick chart. Historical candle data is loaded from a REST API and live price updates are streamed over WebSocket.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Architecture Overview](#architecture-overview)
- [API Endpoints](#api-endpoints)
- [Data Structures](#data-structures)
- [Services](#services)
- [Components](#components)
- [Lightweight Charts Integration](#lightweight-charts-integration)

---

## Getting Started

```bash
npm install
ng serve
```

The app is served at `http://localhost:4200`.

**Backend requirements** — the following services must be running:

| Service | Base URL |
|---------|----------|
| Charts API (candles, intervals, symbols) | `http://localhost:32770` |
| Live candle WebSocket | `ws://localhost:32770` |

---

## Project Structure

```
src/app/
├── components/
│   └── lightweight-chart/          # Main chart component
├── services/
│   ├── trader-algo-api.service.ts  # REST API client
│   └── live-chart-data.service.ts  # WebSocket client
└── structures/
    ├── candle.ts                   # Candle request/response types
    ├── interval.ts                 # Interval response type
    └── symbol.ts                   # Symbol response type
```

---

## Architecture Overview

```
LightweightChartComponent
    │
    ├─── TraderAlgoApiService ──► GET /api/charts/candles   (historical candles)
    │                         ──► GET /api/intervals        (available intervals)
    │                         ──► GET /api/symbols          (available symbols)
    │
    └─── LiveChartDataService ──► WS /ws/charts/candles     (live candle stream)
```

- Both services are provided at root scope (`providedIn: 'root'`).
- All async operations use RxJS `Observable`.
- Chart rendering runs outside the Angular zone (`NgZone.runOutsideAngular`) to avoid unnecessary change detection cycles on every animation frame.

---

## API Endpoints

### REST — TraderAlgoApiService

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/charts/candles` | Historical OHLCV candles |
| `GET` | `/api/intervals` | Available trading intervals |
| `GET` | `/api/symbols` | Available trading symbols |

**Candles query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | `string` | Trading pair code (e.g. `BTCUSDT`) |
| `interval` | `string` | Candle interval code (e.g. `1m`, `1h`) |
| `lookback` | `number` | Number of candles to return |

Example: `GET /api/charts/candles?symbol=BTCUSDT&interval=5m&lookback=100`

### WebSocket — LiveChartDataService

**Connection URL:** `ws://localhost:32770/ws/charts/candles?symbol={symbol}&interval={interval}`

The server pushes candle updates as JSON. The payload can be a single candle object or an array of candle objects — both are handled transparently.

---

## Data Structures

### `CandleRequest`

```typescript
interface CandleRequest {
  symbol?:   string;  // e.g. "BTCUSDT"
  interval?: string;  // e.g. "5m"
  lookback?: number;  // e.g. 100
}
```

### `CandleResponse`

```typescript
interface CandleResponse {
  time:   number;  // UTC timestamp — seconds or milliseconds (normalised internally)
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}
```

### `IntervalResponse`

```typescript
interface IntervalResponse {
  id:          number;
  code:        string;   // e.g. "1m", "5m", "1h"
  displayName: string;   // e.g. "1 Minute"
  duration:    string;   // e.g. "00:01:00"
  isActive:    boolean;
  isDefault:   boolean;
  createdAt:   string;
  klines:      unknown[];
}
```

### `SymbolResponse`

```typescript
interface SymbolResponse {
  id:          number;
  code:        string;   // e.g. "BTCUSDT"
  baseAsset:   string;   // e.g. "BTC"
  quoteAsset:  string;   // e.g. "USDT"
  displayName: string;   // e.g. "BTC/USDT"
  isActive:    boolean;
  isDefault:   boolean;
  createdAt:   string;
  klines:      unknown[];
}
```

---

## Services

### TraderAlgoApiService

Thin HTTP wrapper. All three methods return cold `Observable`s — each subscription triggers a new HTTP request.

```typescript
getCandles(request?: CandleRequest): Observable<CandleResponse[]>
getIntervals(): Observable<IntervalResponse[]>
getSymbols(): Observable<SymbolResponse[]>
```

`getCandles` serialises every non-null/undefined field of `CandleRequest` into query parameters automatically via `HttpParams`.

### LiveChartDataService

Wraps a native `WebSocket` in an `Observable`. Subscribing opens the connection; unsubscribing closes it.

```typescript
streamCandles(symbol: string, interval: string): Observable<CandleResponse>
```

The observable emits individual `CandleResponse` items. If the server sends an array, each element is emitted separately. Errors and socket close events are propagated as observable error and complete signals respectively.

---

## Components

### LightweightChartComponent

**Selector:** `app-lightweight-chart`

The only visual component in the application. On initialisation it:

1. Creates the Lightweight Charts chart instance.
2. Loads symbols and intervals in parallel via `forkJoin`.
3. Selects the default symbol and interval (`isDefault: true`).
4. Renders the symbol as a native chart watermark (top-left).
5. Builds interval selector buttons directly inside the chart container.
6. Loads the initial batch of historical candles (`lookback: 100`).
7. Opens the live WebSocket stream for real-time updates.

**Infinite scroll (load-more):** A `subscribeVisibleLogicalRangeChange` listener detects when the user has scrolled to the left edge of the loaded data (`range.from <= 0`). When triggered, `lookback` is increased by 100 and the full dataset is re-fetched and replaced.

**Interval switching:** Clicking an interval button cancels the in-flight candle subscription and WebSocket stream, resets `lookback` to 100, clears the series, and restarts both data flows with the new interval.

**State properties:**

| Property | Type | Description |
|----------|------|-------------|
| `isLoading` | `boolean` | True while the initial candle request is in flight |
| `isLoadingMore` | `boolean` | True while a load-more request is in flight (prevents duplicate triggers) |
| `statusMessage` | `string` | User-facing message shown as a chart overlay |
| `liveStatus` | `string` | `'Live'`, `'Disconnected'`, or `'Stream closed'` |
| `isConnected` | `boolean` | Drives the animated live indicator dot |

---

## Lightweight Charts Integration

This project uses [Lightweight Charts](https://tradingview.github.io/lightweight-charts/) v5.

### createChart

The chart is created once in `ngAfterViewInit` and sized automatically to its container:

```typescript
const chart = createChart(container, {
  autoSize: true,
  layout: {
    background: { color: '#131722' },
    textColor: '#d1d4dc',
  },
  grid: {
    vertLines: { color: '#1e2433' },
    horzLines: { color: '#1e2433' },
  },
  timeScale: {
    timeVisible: true,
    secondsVisible: false,
    tickMarkFormatter: (time) => formatTimeLabel(time),
  },
  localization: {
    timeFormatter: (time) => formatDateTimeLabel(time),
  },
  crosshair: {
    vertLine: { labelBackgroundColor: '#2962ff' },
    horzLine: { labelBackgroundColor: '#2962ff' },
  },
});
```

A `CandlestickSeries` is added to the chart immediately after creation:

```typescript
const series = chart.addSeries(CandlestickSeries, {
  upColor:       '#26a69a',
  downColor:     '#ef5350',
  borderVisible: false,
  wickUpColor:   '#26a69a',
  wickDownColor: '#ef5350',
});
```

Historical data is set with `series.setData(candles)`. Live updates are applied with `series.update(candle)`.

### createTextWatermark

The trading symbol is displayed as a native chart watermark using `createTextWatermark`. This renders text directly onto the chart canvas — no HTML or CSS required.

```typescript
import { createTextWatermark } from 'lightweight-charts';

createTextWatermark(chart.panes()[0], {
  horzAlign: 'left',
  vertAlign: 'top',
  lines: [{
    text:       symbol,
    color:      'rgba(209, 212, 220, 0.5)',
    fontSize:   18,
    fontFamily: 'inherit',
  }],
});
```

`chart.panes()[0]` returns the primary chart pane. The watermark is rendered behind all series data and does not interfere with interactivity.

### subscribeVisibleLogicalRangeChange

The time scale exposes a subscription for visible range changes. The component uses this to implement automatic historical data loading when the user scrolls to the start of the loaded data.

```typescript
// A stable function reference is required so the same handler can be unsubscribed later.
private readonly onVisibleRangeChange = (range: LogicalRange | null) => {
  if (!range || this.isLoadingMore || this.isLoading) return;
  if (range.from <= 0) {
    this.ngZone.run(() => this.loadMoreCandles());
  }
};

// Subscribe after chart creation
chart.timeScale().subscribeVisibleLogicalRangeChange(this.onVisibleRangeChange);

// Unsubscribe before chart removal
chart.timeScale().unsubscribeVisibleLogicalRangeChange(this.onVisibleRangeChange);
```

`range.from` is a logical index — `0` is the leftmost bar in the dataset. When the visible window reaches or passes it, older candles are fetched and the series is replaced with `setData`.

### Interval selector buttons (DOM approach)

Lightweight Charts does not include a built-in interval switcher. The recommended pattern is to append HTML elements directly to the chart's container element via `chart.chartElement()`. This keeps all chart UI self-contained without requiring additional Angular template markup or stylesheets.

```typescript
const container = chart.chartElement(); // The chart's root HTMLDivElement

const toolbar = document.createElement('div');
Object.assign(toolbar.style, {
  position: 'absolute',
  top: '8px',
  left: '12px',
  zIndex: '3',
  display: 'flex',
  gap: '2px',
});

intervals.forEach(interval => {
  const btn = document.createElement('button');
  btn.textContent = interval.code;
  // Apply inline styles for active/inactive state
  btn.addEventListener('click', () => {
    ngZone.run(() => onIntervalChange(interval.code));
  });
  toolbar.appendChild(btn);
});

container.appendChild(toolbar);
```

Click handlers wrap the callback in `ngZone.run()` so Angular change detection is triggered when the user selects a new interval.
