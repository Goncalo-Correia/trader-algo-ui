---
name: api-agent
description: >-
  Consume the latest backend→frontend handoff from the sibling trader-algo-api repo and implement
  the matching Angular changes here in trader-algo-ui. Use when the user asks to "run the handoff",
  "implement the handoff", "apply the API changes", "pick up the backend handoff", or "sync the
  frontend to the API" — the receiving end of trader-algo-api's `handoff` skill (which writes the
  brief). This skill finds the newest handoff in trader-algo-api, analyzes it against the real UI
  code, asks only genuinely blocking questions, then implements the frontend changes and verifies
  the build.
---

# api-agent — implement a backend→frontend handoff

The sibling **`trader-algo-api`** (.NET) repo's `handoff` skill produces a self-contained Markdown
brief describing an API contract change (REST routes, DTO fields, enum values, WebSocket frames) and
what this **`trader-algo-ui`** (Angular) app must change to consume it. This skill is the receiving
end: it reads that brief from the API repo, turns it into real Angular changes here, and verifies the
build.

Do the work in order. Stop and report if a step can't be completed rather than guessing.

## 1. Find the latest handoff

The normal source is the **sibling API repo's `handoff/` folder**, not this one. That folder
accumulates multiple briefs over time (typically `handoff-<YYYY-MM-DD>-<HHmm>-<slug>.md`, one per API
change). Older handoff skill versions wrote a root-level `handoff.md` or `handoff-*.md`, so keep that
as a compatibility fallback. Your job is to pick the **latest** one:

1. First look in **`../trader-algo-api/handoff/`** and list its `*.md` files.
2. If that folder is missing or empty, look for **`../trader-algo-api/handoff.md`** and
   **`../trader-algo-api/handoff-*.md`**.
3. Select the **most recent** — order by the timestamp embedded in the filename
   (`YYYY-MM-DD-HHmm`, then `YYYY-MM-DD`); if that's absent or ambiguous, fall back to file mtime
   (newest wins).
4. If the user names a specific file, use that one instead of auto-selecting.

**Announce the exact file you selected** (and how many other candidates were considered from that
source) before reading further, so the user can redirect you if they meant an older one. If neither the
`handoff/` folder nor the root-level fallback has any handoff `.md` files, stop and tell the user —
there is nothing to implement; do not invent work.
(Note: this repo cannot see the API source, so the selected handoff `.md` is your only context for the
backend change — treat it as authoritative for wire shapes.)

## 2. Analyze the brief against the real UI code

Read the whole handoff, then map each contract change to where it lands here before touching
anything. The brief already lists "Frontend touch points"; confirm them against the current code —
file names drift. The layout of this repo (see `CLAUDE.md`):

- **`src/app/structures/*`** — domain interfaces, `*Dto` types, and `toX()` mappers (one file per
  feature: `trade.ts`, `backtest.ts`, `ml-policy.ts`, `ml-training.ts`, `trade-bot.ts`, `candle.ts`,
  `session.ts`, `symbol.ts`, `interval.ts`, `strategy.ts`, `trading-account.ts`, `predict.ts`).
  Field, type, and enum changes go here.
- **`src/app/services/trader-algo-api.service.ts`** — every REST call. Add/adjust the method + its
  param/DTO mapping here; components never build URLs themselves.
- **`src/app/services/live-chart-data.service.ts`** — all WebSocket streams.
  `TradeBotEventsService` (`/ws/tradebots/events`) is a **separate** live stream.
- **`src/app/pages/*`** — the routed page that surfaces the change to the user.

For each change, open the current version of the target file and confirm the "before" shape the brief
assumes still matches. If the brief and the code disagree, surface it (step 3) rather than forcing the
brief's assumption.

## 3. Ask only blocking questions

Ask the user a question **only** when the answer changes what you implement and you can't resolve it
from the handoff or the code — e.g. an "Open questions" item the brief flags (typically a UI/UX
choice the backend change doesn't dictate), a contract detail that contradicts the current code, or
ambiguous null/default handling. If the brief is unambiguous and lines up with the code, **do not
ask — just implement.** Batch any questions into one round.

## 4. Implement (in trader-algo-ui)

Make the changes the handoff prescribes, honoring this repo's conventions (see `CLAUDE.md`):

- **DTO ↔ domain boundary.** Backend DTOs are **camelCase** and enums serialize as **strings**, so
  string-union types (`TradeSide`, `BacktestStatus`, `validationScheme`, etc.) map 1:1 — add new
  enum values to the union verbatim. Services map DTOs → camelCase domain models before anything else
  consumes them.
- **snake_case exception.** The candle-with-indicators payload is the **only** snake_case wire shape
  (`taker_buy_base_asset_volume`, `sma_20`, `macd_line`). If the handoff flags a snake_case payload,
  add a `*Dto` interface + a `toX()` mapper and `.pipe(map(...))` in the service — this is the only
  place snake_case is allowed. Everything else is camelCase.
- **New/changed REST call** → add or adjust the method in `trader-algo-api.service.ts`, mapping the
  DTO to the domain model in a `.pipe(map(...))`.
- **New/changed WebSocket frame** → update `live-chart-data.service.ts` (or `TradeBotEventsService`
  for `/ws/tradebots/events`). Use `connectWebSocket<T>` with `reconnect: false` for **finite**
  replay streams (backtest/training) and the default reconnect for live streams. The `parse()`
  callback is the runtime validation boundary — return `[]` to drop malformed frames.
- **Change detection.** Every component is `ChangeDetectionStrategy.OnPush`; call `markForCheck()`
  after any RxJS/WebSocket update or the view won't repaint. Keep new components OnPush + standalone.
- **Chart colors** come from `shared/chart-theme.ts` (`CHART_COLORS`) — don't hardcode hex in chart
  components.
- **Style.** Prefer `inject()` over constructor injection; Prettier (single quotes, trailing commas,
  120 width, `arrowParens: avoid`); ESLint enforces the `app` selector prefix and strict `eqeqeq`
  except the deliberate `x != null` idiom.

Keep edits scoped to what the handoff describes plus what's mechanically required to compile. Don't
refactor unrelated code. If the handoff has an "Explicitly unchanged" section, treat it as a fence —
don't make speculative edits to surfaces it says didn't change.

## 5. Verify

From this repo:

```bash
npm run build     # production build — the primary gate
npm run lint      # ESLint over src/**/*.{ts,html}
```

Both must pass. If a spec covers the code you touched (`npm test` is headless Karma/Jasmine; coverage
is light), run it too. Fix the cause of any failure and re-verify — don't leave a broken build. If the
change is browser-observable, prefer the preview workflow to confirm it renders, rather than asking the
user to check manually.

## 6. Report

Summarize for the user:
- Which handoff file you implemented (path in the API repo).
- The concrete changes made, grouped by file (`structures/*`, `trader-algo-api.service.ts`,
  `live-chart-data.service.ts`, `pages/*`).
- Build/lint result.
- Anything you deliberately did **not** do (items under the brief's "Explicitly unchanged", or work
  you flagged for the user to confirm).

## Guardrails

- This skill **implements** a handoff into trader-algo-ui; it does not deploy. Stay on the working
  branch (`dev`) and leave committing/merging/pushing to the `deploy` skill unless the user asks.
- The handoff `.md` is your only window into the backend — trust its wire shapes (field names,
  snake_case flags, enum values) exactly; a wrong JSON field name silently breaks the frontend.
- Where the handoff and the current UI code genuinely conflict, surface the conflict instead of
  blindly following either.
- Never add hardcoded chart hex, drop OnPush/`markForCheck`, or reintroduce snake_case outside a
  `*Dto` mapper.
