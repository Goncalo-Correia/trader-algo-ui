# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start                 # dev server (ng serve) at http://localhost:4200, proxies backend at localhost:32768
npm run build             # production build → dist/trader-algo-ui/browser
npm run watch             # development build in watch mode
npm test                  # run Karma/Jasmine specs once (headless Chrome)
npm run lint              # ESLint over src/**/*.{ts,html}
npm run lint:fix          # ESLint with --fix
npm run format            # Prettier write over src
npm run format:check      # Prettier check (CI-style, no writes)
```

Run a single spec by narrowing Karma with a focused test (`fdescribe`/`fit`) or:
`npx ng test --include='src/app/path/to/thing.spec.ts'`.

Test coverage is still light but no longer a single smoke test. Focused specs exist for the highest-risk,
pure-enough logic: `connectWebSocket` parsing/reconnect/teardown (`core/websocket.spec.ts`), the three HTTP
interceptors (`core/interceptors.spec.ts`), the `AppError` guard, `TraderAlgoApiService` param/DTO mapping and
empty-response handling, the Wilder ATR core (`shared/atr.spec.ts`), and `MultiChartComponent` config loading.
Chart components that need a live canvas/backend remain uncovered.

## Environment generation (runs automatically)

`scripts/generate-env.mjs` writes the **git-ignored** `src/environments/environment.generated.ts` on
`postinstall`, `prebuild`, and `prestart`. It sources backend config, first non-empty wins:

1. Env vars: `TRADER_ALGO_API_BASE_URL`, `TRADER_ALGO_API_WS_URL`, `TRADER_ALGO_API_KEY`
2. Git-ignored `.env.local.json` (`{ baseUrl, wsUrl, apiKey }`) for local dev
3. Empty → app falls back to the serving origin for URLs and sends no API key

The API key is a secret and must never be hardcoded in a committed file (this is a public repo). For local
dev against the localhost backend, put the key in `.env.local.json`. `environment.development.ts` (used by
`npm start` via Angular file replacement) hardcodes the localhost URLs but pulls the key from the generated file.

## Architecture

Angular 22 single-page app for a trading/backtesting/ML platform. Standalone components throughout — there are
no NgModules. All pages are lazy-loaded in `src/app/app.routes.ts`, so the initial bundle is just the shell.
Default route redirects to `/charts`.

### Change detection (important, non-obvious)

Angular 21+ is **zoneless by default**, which froze rendering in this app. `src/main.ts` deliberately opts back
into zone-based CD via `provideZoneChangeDetection({ eventCoalescing: true })`, and `zone.js` is a polyfill in
`angular.json`. Every component is `ChangeDetectionStrategy.OnPush` and calls `markForCheck()` after async
updates. When adding a component, keep OnPush and remember to mark for check after RxJS/WebSocket updates, or the
view will not repaint.

### Layers

- **`src/app/pages/*`** — routed page components (algo-trader, charts, accounts, backtest(s), tradebots, ml).
- **`src/app/components/*`** — reusable pieces, chiefly the charts (`chart`, `charts-chart`, `backtest-chart`,
  `ml-chart`, `multi-chart`, `highcharts-chart`) and the three dedicated trade panels (`algo-trade-panel`,
  `chart-trade-panel`, `backtest-trade-panel`).
- **`src/app/services/`** — `TraderAlgoApiService` (all REST calls, `providedIn: 'root'`) and
  `LiveChartDataService` (all WebSocket streams). Components inject these; they do not build URLs themselves.
- **`src/app/structures/*`** — domain interfaces + DTO types + mapping functions (see boundary rule below).
- **`src/app/core/*`** — HTTP interceptors, error handling, WebSocket helper, token storage, logger.
- **`src/app/chart-plugins/*`** — lightweight-charts custom plugins (volume profile, session markers, active candle).
- **`src/app/shared/chart-theme.ts`** — single source of truth for chart colors (`CHART_COLORS`); do not
  reintroduce hardcoded hex values in chart components.

### DTO ↔ domain boundary

Backend response DTOs are **camelCase** by default (each field carries `[JsonPropertyName]`), and enums serialize
as **strings** (`JsonStringEnumConverter`) — so string-union types like `TradeSide` / `BacktestStatus` map 1:1.
The exception is the candle-with-indicators payload, which the backend serializes in **snake_case** (e.g.
`CandleWithIndicatorsDto` with `taker_buy_base_asset_volume`, `sma_20`, `macd_line`). The `*Dto` types and their
`toX()` mappers (e.g. `toCandleWithIndicators` in `src/app/structures/candle.ts`) are the **only** place snake_case
is allowed. Services map DTOs to camelCase domain models before anything else consumes them. When adding an endpoint
that returns snake_case, follow this pattern — add a `*Dto` interface and a mapper, and `.pipe(map(...))` in the service.

**Non-obvious contract:** `GET /api/backtests/{id}` (`BacktestDetail`) returns summary fields + `trades` + `equityCurve`
only — **not** candles (they moved to the replay stream in the compute/replay split). The backtest-detail page fetches
candles for its price chart separately from `GET /api/charts/candles/indicators/date-interval`
(`getCandlesWithIndicatorsByDateInterval`). Don't reintroduce a `candles` field on the detail response.

**ML training/policy endpoints send inconsistent field aliases** across backend revisions (e.g. `oosMaxDdPct` vs
`oosMaxDrawdownPct`, `entryStep` vs `entry_step`, `ts` vs `time`/`timestamp`, paginated envelopes keyed `points`/
`trades` as well as `items`/`data`/`rows`). Rather than adding optional fields everywhere downstream,
`TraderAlgoApiService` normalizes each ML response in a private `normalizeX()` method (e.g. `normalizeTrainingRun`,
`normalizePerformance`, `normalizeEquityPoint`, `normalizeTrainingTrade`) piped onto the HTTP call, coalescing every
known alias onto the canonical field before the domain model reaches components. When the backend adds another
alias for an existing field, extend the matching `normalizeX()` rather than teaching consumers about the new key.

### HTTP interceptors (DI order in `main.ts`)

1. `ApiKeyInterceptor` — adds `X-Api-Key` header, but only to requests whose URL starts with the configured
   `baseUrl` (never leaks the key to third parties). No-op when no key is set.
2. `AuthInterceptor` — adds `Authorization: Bearer <token>` when `TokenStorageService` holds one. Currently a
   no-op (auth not yet implemented) but wired so it lights up automatically.
3. `ErrorInterceptor` — logs failures once and normalizes `HttpErrorResponse` into the `AppError` shape.

`GlobalErrorHandler` is registered as the app `ErrorHandler`.

### WebSocket streaming

`src/app/core/websocket.ts` exposes `connectWebSocket<T>(url, options)` — a cold Observable that connects on
subscribe, closes on unsubscribe, completes on a clean close, and reconnects with exponential backoff on abnormal
drops. Pass `reconnect: false` for **finite** streams (backtest/training replays) where a server close means
"done". The `parse(raw) => T[]` callback is the single runtime validation boundary for untyped frames — return
`[]` to drop malformed/irrelevant frames. Since WebSocket handshakes can't send custom headers from the browser,
the API key is appended as an `apiKey` query param.

`LiveChartDataService` builds on this for live candles, candles-with-indicators, backtest replay, and ML training
streams. Backtest/training streams are **event-enveloped** (`{ type, data }`) carrying `candle`, `candleBatch`,
`tradeOpened`, `tradeClosed`, `tradeBracketUpdate`, and `mlDecision` events. The ML training-run detail page
consumes the `/ws/ml/training?trainingRunId=&delay=` replay via `TraderAlgoApiService.streamMlTraining` (finite,
`reconnect: false`), which emits only `candle` (mapped through `toCandleWithIndicators`) and `mlDecision` frames —
a second, page-specific consumer of the same endpoint that `LiveChartDataService` also exposes.

`TradeBotEventsService` (`/ws/tradebots/events`) is a **separate** live stream carrying the backend `TradeEventDto`
shape — `{ type, tradingAccountId, tradeId?, symbolCode?, message?, createdAt?, trade? }`. Emitted `type`s are
`TradeOpened`, `TradePending`, `TradeClosed`, `BotEnabled`, `BotDisabled`, and `SignalIgnored`. The human-readable
reason for an ignored signal is in `message` (there is no `reason` field), and `tradeBracketUpdate` is a backtest
event, **not** a live tradebot event.

### Charting

Two charting libs: `lightweight-charts` (primary candlestick/indicator charts) and `highcharts` (in
`highcharts-chart.component`; note `allowedCommonJsDependencies: ["highcharts"]` in `angular.json`).

**One dedicated lightweight-charts component per use case — do not re-share them.** Each of the four
use cases owns its own chart so a change for one can't regress the others (they used to be shared, which
caused exactly that):

- **algo-trader** → `ChartComponent` (`app-chart`) — live single chart with click-to-trade, symbol/interval
  switching, live WebSocket streaming, predictions, and incremental Wilder ATR.
- **charts** → `ChartsChartComponent` (`app-charts-chart`), tiled 2×2 by `MultiChartComponent`. A sibling of
  `ChartComponent` (same live-chart feature set) kept separate so the multi-chart grid can evolve on its own.
- **backtest** → `BacktestChartComponent` (`app-backtest-chart`) — input-driven (candles/trades/playbackTime),
  NY-session markers, trade entry/exit markers + bracket lines, ATR. **No** ML decision markers.
- **machine-learning** → `MlChartComponent` (`app-ml-chart`) — input-driven, ML decision markers
  (Decisions/Holds/confidence toggles), trade markers, ATR. **No** NY-session markers. Marker times anchor to
  the candle **index** (`candle_index`/`entry_step`/`exit_step`) with an epoch fallback, so markers stay on the
  right bar even when the decision log omits `open_time`/`entry_time`.

`ChartComponent`/`ChartsChartComponent` are near-identical and `BacktestChartComponent`/`MlChartComponent`
share a lineage; that duplication is deliberate (decoupling over DRY). When you touch one, decide whether the
change is use-case-specific (most are) before considering porting it to its sibling.

### Trade panels

Same "one dedicated component per use case" rule as the charts — the shared `TradePanelComponent` was split so a
change for one panel can't regress the others. All three share the **backtest panel's visual language** (260px,
`#0e0e0e` panel, `#1a1a1a` inputs, blue `#2962ff` primary, `result-card` blocks):

- **algo-trader** → `AlgoTradePanelComponent` (`app-algo-trade-panel`) — symbol/account selection, live
  trade-bot configuration, and the active-trade card. **No** manual order entry (bots place the trades).
- **charts** → `ChartTradePanelComponent` (`app-chart-trade-panel`) — symbol/account selection, manual order
  entry (Buy/Sell · Market/Limit), and the active-trade card. **No** trade-bot config.
- **backtest** → `BacktestTradePanelComponent` (`app-backtest-trade-panel`) — the backtest config form + run
  status/result cards. Presentational: config fields are two-way `model()` bindings and the live run status is
  parent-supplied `input()`s; the page keeps backtest creation + streaming and reacts to the `runBacktest` output.

`AlgoTradePanelComponent`/`ChartTradePanelComponent` share account/active-trade lineage; as with the charts, that
duplication is deliberate — decide whether a change is use-case-specific before porting it to a sibling.

## Conventions

- ESLint enforces `app` prefix: components are `kebab-case` element selectors, directives `camelCase` attribute
  selectors. Template `eqeqeq` is strict **except** the deliberate `x != null` idiom (checks null + undefined).
- Prettier: single quotes, trailing commas (all), 120 print width, `arrowParens: avoid`.
- Prefer `inject()` over constructor injection (existing code uses `inject()` consistently).

## Deployment

Vercel (`vercel.json`): builds with `npm run build`, serves `dist/trader-algo-ui/browser`, SPA-rewrites all
routes to `index.html`. Configure the backend via the `TRADER_ALGO_API_*` env vars in Vercel project settings.
Node is pinned to 24.15.0 via `.node-version` for hosted builds.
