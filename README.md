# trader-algo-ui

Angular 15 single-page application for algorithmic trading. Features real-time candlestick charts with technical indicators, a WebSocket-streamed backtesting engine, and a live trade-bot management UI backed by a REST/WebSocket API.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Pages](#pages)
- [Features](#features)
  - [Backtest](#backtest)
  - [Trade Bots](#trade-bots)
  - [Accounts](#accounts)
  - [Charts](#charts)
- [Architecture Overview](#architecture-overview)
- [API Reference](#api-reference)
- [Data Structures](#data-structures)
- [Services](#services)

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
| Trader Algo API (REST + WebSocket) | `http://localhost:32770` |
| Live candle / backtest WebSocket | `ws://localhost:32770` |

---

## Project Structure

```
src/app/
├── components/
│   ├── chart/                        # Live candlestick chart with indicators
│   ├── backtest-chart/               # Playback chart for backtests
│   └── trade-panel/                  # Order/trade panel overlay
├── pages/
│   ├── accounts/                     # Trading accounts list
│   ├── account-detail/               # Account detail with PNL chart
│   ├── backtest/                     # Run a new backtest
│   ├── backtests/                    # Backtest history list
│   ├── backtest-detail/              # Backtest detail with equity curve
│   ├── tradebots/                    # Trade bot list
│   ├── tradebot-detail/              # Trade bot detail, config, and event log
│   ├── algo-trader/                  # Live algo trader view
│   └── charts/                       # Symbol/interval chart explorer
├── services/
│   ├── trader-algo-api.service.ts    # REST API client
│   ├── live-chart-data.service.ts    # WebSocket streams (candles, backtests)
│   └── trade-bot-events.service.ts   # WebSocket trade-bot event stream
└── structures/
    ├── backtest.ts
    ├── trade-bot.ts
    ├── trade.ts
    ├── trading-account.ts
    ├── candle.ts
    ├── interval.ts
    └── symbol.ts
```

---

## Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/accounts` | AccountsPageComponent | List of trading accounts |
| `/accounts/:id` | AccountDetailComponent | Account trades and cumulative PNL chart |
| `/backtest` | BacktestPageComponent | Configure and run a new backtest |
| `/backtests` | BacktestsPageComponent | Historical backtest list with status badges |
| `/backtests/:id` | BacktestDetailComponent | Backtest detail: equity curve, trades, candles |
| `/tradebots` | TradeBotsPageComponent | All trade bots with enable/disable toggle |
| `/tradebots/:id` | TradebotDetailComponent | Bot detail: config editor, trade history, event log |
| `/algo-trader` | AlgoTraderComponent | Live algo trader dashboard |
| `/charts` | ChartsPageComponent | Candlestick chart explorer |

---

## Features

### Backtest

The backtest workflow runs entirely through a WebSocket stream so results appear in real time as the engine replays candles.

**Configuration options:**

| Field | Description |
|-------|-------------|
| Symbol | Trading pair (e.g. `BTCUSDT`) |
| Interval | Candle interval (e.g. `1m`, `5m`, `1h`) |
| Strategy | `SMA`, `RSI`, or `MACD` |
| Date range | From / To datetime |
| Initial balance | Starting capital |
| Quantity | Units per trade |
| Stop loss | Stop-loss offset (optional) |
| Take profit | Take-profit offset (optional) |
| Breakeven | Breakeven offset (optional) |

**Flow:**

1. POST `/api/backtests` — creates a backtest and returns a summary with an ID.
2. The UI opens a WebSocket stream for that backtest ID.
3. The stream emits `candle` events (appended to the playback chart in real time) and `tradeBracketUpdate` events (live SL/TP adjustments).
4. On stream completion the final summary and trade list are fetched.

**Results displayed:**

- Live streaming candlestick chart with indicator overlays
- Active trade PNL (unrealized, calculated from latest close)
- Total realized + unrealized PNL
- Trade table (entry, exit, side, PNL per trade)
- Final balance, trade count, and breakeven indicator

**Backtest list** (`/backtests`) shows all past runs with status badges (`Pending`, `Running`, `Completed`, `Failed`, `Cancelled`) and per-run PNL.

**Backtest detail** (`/backtests/:id`) shows the full equity curve, trade list, and candle replay for any saved backtest.

---

### Trade Bots

Trade bots execute a trading strategy autonomously against a live trading account or backtest.

**Bots list** (`/tradebots`):

- Lists all bots with symbol, interval, strategy, scope (account or backtest), last signal time, and enabled status.
- Enable/disable toggle fires directly from the list without navigating away.

**Bot detail** (`/tradebots/:id`):

- **Config editor** — edit quantity, stop loss, and take profit; save changes via `PUT /api/tradebots/:id`.
- **Enable/disable toggle** — calls `POST /api/tradebots/:id/enable` or `/disable`.
- **Trade history** — last 50 trades sorted by date, with side badges and PNL coloring.
- **Live event log** — real-time events streamed over WebSocket:

| Event type | Description |
|------------|-------------|
| `TradeOpened` | A new trade was opened |
| `TradeClosed` | An existing trade was closed |
| `BotEnabled` | Bot was activated |
| `BotDisabled` | Bot was deactivated |
| `SignalIgnored` | Strategy fired but trade was skipped |

The event log shows the 100 most recent events with color-coded type badges and timestamps.

---

### Accounts

**Accounts list** (`/accounts`) — lists all trading accounts.

**Account detail** (`/account-detail/:id`):

- Editable display name (stored in `localStorage`, does not require a round-trip).
- Activate/deactivate toggle via `PATCH /api/trading-accounts/:id`.
- Delete account (with confirmation).
- Cumulative PNL area chart (Highcharts Highstock) — plots realized PNL over time from closed trades.
- Full trade table with entry/exit timestamps, side, and per-trade PNL.
- Live updates: subscribes to the trade-bot event stream; reloads on `TradeOpened` and `TradeClosed` events.

---

### Charts

The chart explorer (`/charts`) and algo-trader view render a live candlestick chart with:

- Technical indicator overlays (SMA, RSI, MACD).
- Real-time candle updates over WebSocket.
- Interval selector (switches stream and reloads historical data).
- Infinite scroll — scrolling to the left edge of loaded data fetches older candles automatically.
- Trade panel overlay for placing and managing orders.

---

## Architecture Overview

```
Pages / Components
    │
    ├── TraderAlgoApiService ──► REST API (HTTP)
    │       GET  /api/symbols
    │       GET  /api/intervals
    │       GET  /api/charts/candles
    │       POST /api/backtests
    │       GET  /api/backtests
    │       GET  /api/backtests/:id
    │       GET  /api/backtests/:id/trades
    │       GET  /api/tradebots
    │       GET  /api/tradebots/:id
    │       POST /api/tradebots/:id/enable
    │       POST /api/tradebots/:id/disable
    │       PUT  /api/tradebots/:id
    │       GET  /api/trading-accounts
    │       GET  /api/trading-accounts/:id
    │       PATCH /api/trading-accounts/:id
    │       DELETE /api/trading-accounts/:id
    │       GET  /api/trading-accounts/:id/trades
    │
    ├── LiveChartDataService ──► WebSocket streams
    │       WS /ws/charts/candles        (live candle stream)
    │       WS /ws/backtests/:id/stream  (backtest playback stream)
    │
    └── TradeBotEventsService ──► WebSocket stream
            WS /ws/accounts/:id/events  (trade-bot event stream)
```

All services are provided at root scope (`providedIn: 'root'`). All async operations use RxJS `Observable`. Chart rendering runs outside the Angular zone (`NgZone.runOutsideAngular`) to avoid unnecessary change detection cycles.

---

## API Reference

### REST — TraderAlgoApiService

**Symbols & Intervals**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/symbols` | Available trading symbols |
| `GET` | `/api/intervals` | Available candle intervals |

**Charts**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/charts/candles` | Historical OHLCV candles with indicators |

**Backtests**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/backtests` | Create and start a new backtest |
| `GET` | `/api/backtests` | List all backtests |
| `GET` | `/api/backtests/:id` | Get backtest summary |
| `GET` | `/api/backtests/:id/trades` | Get trades for a backtest |

**Trade Bots**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/tradebots` | List all trade bots |
| `GET` | `/api/tradebots/:id` | Get a single trade bot |
| `PUT` | `/api/tradebots/:id` | Update bot config (quantity, SL, TP) |
| `POST` | `/api/tradebots/:id/enable` | Enable a trade bot |
| `POST` | `/api/tradebots/:id/disable` | Disable a trade bot |

**Trading Accounts**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/trading-accounts` | List all trading accounts |
| `GET` | `/api/trading-accounts/:id` | Get account details |
| `PATCH` | `/api/trading-accounts/:id` | Update account (e.g. toggle active) |
| `DELETE` | `/api/trading-accounts/:id` | Delete account and all its trades |
| `GET` | `/api/trading-accounts/:id/trades` | Trade history for an account |

### WebSocket — LiveChartDataService

**Live candles:**
`ws://localhost:32770/ws/charts/candles?symbol={symbol}&interval={interval}`

Emits `CandleWithIndicatorsResponse` objects. Subscribing opens the socket; unsubscribing closes it.

**Backtest stream:**
`ws://localhost:32770/ws/backtests/{id}/stream`

Emits `BacktestStreamEvent` — either a `candle` event (playback frame) or a `tradeBracketUpdate` event (live SL/TP adjustment).

### WebSocket — TradeBotEventsService

`ws://localhost:32770/ws/accounts/{accountId}/events`

Emits `TradeBotEvent` objects describing bot lifecycle and trade activity in real time.

---

## Data Structures

### Backtest

```typescript
interface CreateBacktestRequest {
  symbol: string;
  interval: string;
  from: string;                      // ISO 8601
  to: string;                        // ISO 8601
  initialBalance: number;
  tradingStrategy?: TradingStrategy; // 'Sma' | 'Rsi' | 'Macd'
  quantity?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  breakeven?: number | null;
}

interface BacktestSummary {
  id: number;
  symbolCode: string;
  intervalCode: string;
  strategyName: string;
  tradeBotId: number | null;
  from: number;
  to: number;
  startedAt: number;
  completedAt: number | null;
  status: 'Pending' | 'Running' | 'Completed' | 'Failed' | 'Cancelled';
  initialBalance: number;
  finalBalance: number | null;
  pnl: number | null;
  candleCount: number;
  tradeCount: number;
  quantity: number;
  stopLoss: number | null;
  takeProfit: number | null;
  breakeven: number | null;
}

type BacktestStreamEvent =
  | { type: 'candle'; data: CandleWithIndicatorsResponse }
  | { type: 'tradeBracketUpdate'; data: { tradeId: number; stopLoss: number | null; takeProfit: number | null } };
```

### TradeBot

```typescript
interface TradeBot {
  id: number;
  tradingAccountId: number | null;
  tradingAccountName?: string | null;
  backtestId: number | null;
  tradingStrategy: TradingStrategy;
  symbolCode?: string | null;
  intervalCode?: string | null;
  isEnabled: boolean;
  quantity: number;
  stopLoss: number | null;
  takeProfit: number | null;
  createdAt: number | string;
  updatedAt: number | string;
  lastSignalAt: number | string | null;
}

type TradeBotEventType =
  | 'TradeOpened'
  | 'TradeClosed'
  | 'BotEnabled'
  | 'BotDisabled'
  | 'SignalIgnored';

interface TradeBotEvent {
  type: TradeBotEventType;
  tradingAccountId: number | null;
  tradeId?: number;
  symbolCode?: string;
  side?: string;
  status?: string;
  reason?: string;
  message?: string;
  createdAt?: number;
}
```

### Trade

```typescript
interface Trade {
  id: number;
  side: 'Buy' | 'Sell';
  status: 'Pending' | 'Active' | 'Closed' | 'Cancelled';
  requestedPrice: number | string | null;
  entryPrice: number | string | null;
  exitPrice: number | string | null;
  quantity: number | string;
  stopLoss: number | null;
  takeProfit: number | null;
  pnl: number | null;
  unrealizedPnl: number | null;
  createdAt: number | null;
  closedAt: number | null;
}
```

---

## Services

### TraderAlgoApiService

Thin `HttpClient` wrapper. Every method returns a cold `Observable` — each subscription fires a new request.

Key methods:

```typescript
getSymbols(): Observable<SymbolResponse[]>
getIntervals(): Observable<IntervalResponse[]>
getBacktests(): Observable<BacktestSummary[]>
getBacktest(id: number): Observable<BacktestSummary>
createBacktest(payload: CreateBacktestRequest): Observable<BacktestSummary>
getBacktestTrades(id: number): Observable<Trade[]>
getTradeBots(): Observable<TradeBot[]>
getTradeBot(id: number): Observable<TradeBot>
enableTradeBot(id: number): Observable<TradeBot>
disableTradeBot(id: number): Observable<TradeBot>
updateTradeBot(id: number, payload: UpdateTradeBotRequest): Observable<TradeBot>
getTradingAccount(id: number): Observable<TradingAccount>
getTradeHistory(accountId: number): Observable<Trade[]>
```

### LiveChartDataService

Wraps native `WebSocket` in an `Observable`. Subscribing opens the connection; unsubscribing closes it.

```typescript
streamCandles(symbol: string, interval: string): Observable<CandleWithIndicatorsResponse>
streamBacktest(backtestId: number): Observable<BacktestStreamEvent>
```

The backtest stream emits typed events. `candle` events carry a full candle frame; `tradeBracketUpdate` events carry updated SL/TP values for an open trade.

### TradeBotEventsService

Streams trade-bot lifecycle events for a given trading account over WebSocket.

```typescript
connect(accountId: number): Observable<TradeBotEvent>
```

Used by `AccountDetailComponent` (to trigger trade reloads) and `TradebotDetailComponent` (to populate the live event log).
