# trader-algo-ui

Angular 22 single-page app for algorithmic trading: real-time candlestick charts
with technical indicators, a WebSocket-streamed backtesting engine, and live
trade-bot management. It is a front end for a separate REST + WebSocket backend.

## Getting started

Requires **Node 22 LTS** (or any `^20.19 || ^22.12 || >=24`, per Angular 22).

```bash
npm install
npm start        # dev server at http://localhost:4200
```

The backend (REST + WebSocket) must be running. In development it is expected at
`http://localhost:32768` / `ws://localhost:32768` — see
[`src/environments/`](src/environments/). Production builds read the backend URL
from an environment variable, falling back to the origin that serves them — see
[Deployment](#deployment) below.

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

**Configuration** — the backend URLs live in `src/environments/`.
`environment.development.ts` (used by `npm start`) points at the local backend.
The production `environment.ts` reads its URL from a build-time env var and
falls back to the serving origin (see below).

## Deployment

Production builds resolve the backend URL at build time from env vars, so the
same build can point at any deployed backend without code changes:

| Env var | Purpose |
|---------|---------|
| `TRADER_ALGO_API_BASE_URL` | Backend REST/WebSocket base URL, e.g. `https://api.example.com`. The WebSocket URL is derived from it (`http`→`ws`, `https`→`wss`). |
| `TRADER_ALGO_API_WS_URL` | Optional. Overrides the derived WebSocket URL. |

`scripts/generate-env.mjs` reads these on `postinstall` / `prebuild` and writes
`src/environments/environment.generated.ts` (git-ignored). If neither var is
set, the app talks to the origin serving it (upgrading to `wss://` over HTTPS).

**Vercel** — [`vercel.json`](vercel.json) sets the build command, the output
directory (`dist/trader-algo-ui/browser`), and an SPA rewrite so client-side
routes resolve to `index.html`. Set `TRADER_ALGO_API_BASE_URL` in the Vercel
project's environment variables to point the deployment at your backend.
