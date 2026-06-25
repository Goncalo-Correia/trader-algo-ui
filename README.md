# trader-algo-ui

Angular 15 single-page app for algorithmic trading: real-time candlestick charts
with technical indicators, a WebSocket-streamed backtesting engine, and live
trade-bot management. It is a front end for a separate REST + WebSocket backend.

## Getting started

```bash
npm install
npm start        # dev server at http://localhost:4200
```

The backend (REST + WebSocket) must be running. In development it is expected at
`http://localhost:32768` / `ws://localhost:32768` — see
[`src/environments/`](src/environments/). Production builds talk to the origin
that serves them (with automatic `wss://` over HTTPS).

### Scripts

| Command | What it does |
|---------|--------------|
| `npm start` | Run the dev server |
| `npm run build` | Production build to `dist/` |
| `npm test` | Unit tests (Karma) |
| `npm run lint` | Lint with ESLint (`npm run lint:fix` to autofix) |
| `npm run format` | Format with Prettier |

## Pages

| Route | Description |
|-------|-------------|
| `/charts` | Live candlestick chart explorer (default route) |
| `/algo-trader` | Live trading dashboard with trade panel |
| `/backtest` | Configure and run a new backtest |
| `/backtests`, `/backtests/:id` | Backtest history and detail (equity curve, trades) |
| `/tradebots`, `/tradebots/:id` | Trade-bot list and detail (config, history, live events) |
| `/accounts`, `/accounts/:id` | Trading accounts and per-account PNL |
| `/ml`, `/ml/policies/new`, `/ml/policies/:id`, `/ml/runs/:id` | ML policies: list policies, create a policy, policy detail (its training runs + start a new run), and run detail (decision-process charts, trades). Risk params are absolute amounts (price offsets / cash), matching backtests. |

## Project structure

```
src/app/
├── core/          # Cross-cutting infra: HTTP interceptors, logger,
│                  # global error handler, reconnecting WebSocket helper
├── shared/        # Shared helpers (e.g. chart colour palette)
├── components/    # Reusable UI: chart, trade-panel, backtest-chart, …
├── pages/         # Routed views (one folder per route above)
├── services/      # API + WebSocket data access
├── chart-plugins/ # lightweight-charts primitives (volume profile, sessions)
└── structures/    # API request/response types
```

## Architecture

**Data access** is centralised in three root services:

- `TraderAlgoApiService` — typed `HttpClient` wrapper; every method returns a
  cold `Observable`.
- `LiveChartDataService` — live candle and backtest streams.
- `TradeBotEventsService` — live trade-bot event stream.

**HTTP pipeline** — interceptors in `core/` attach the auth token (when present)
and normalise every failed request into a consistent, displayable error that is
logged once via `LoggerService`. A global `ErrorHandler` catches anything else.

**WebSockets** — all streams go through one helper (`core/websocket.ts`) that
connects on subscribe, closes on unsubscribe, validates incoming frames, and
reconnects with exponential backoff (disabled for the finite backtest replay).

**Charts** — candlesticks/indicators use `lightweight-charts`; equity/PNL views
use `Highcharts`, which is **lazy-loaded** so it stays out of the initial bundle.
Heavy chart updates run outside the Angular zone to avoid extra change detection.

**Configuration** — environment files in `src/environments/` hold the backend
URLs; no other config is required.
