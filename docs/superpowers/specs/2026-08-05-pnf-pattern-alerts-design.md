# Point & Figure charts + pattern alerts

**Date:** 2026-08-05
**Status:** approved, pending implementation plan
**Scope:** New pure module (`src/pnf/`) + a P&F chart mode in the main chart panel + watchlist pattern scanning wired into the existing alert rails

## Context

Vantage's chart panel (`React.jsx` ~7650) renders the selected symbol's session tape as a
Recharts area chart — 390 seeded one-minute bars in demo mode, an accumulating tape of 15-second
Finnhub quote polls in live mode. The app already has a one-shot price-alert system
(`React.jsx:5086`): alerts persist in localStorage, fire a banner + sting, and the anchor breaks
in on air. Right-rail panels (watchlist, movers, news, portfolio, alerts, calendar) toggle in
settings.

This bundle adds what StockCharts' ChartSchool calls **P&F Pattern Alerts**
(chartschool.stockcharts.com → P&F Scans and Alerts): a Point & Figure rendering of the tape
that prints the active pattern's name at the top of the chart, and a scan across the watchlist
that raises an alert when any symbol prints a new pattern.

**Why:** P&F charts compress a price tape into X/O columns that make support, resistance, and
breakouts mechanical rather than judgmental — which is exactly what makes them detectable by
code and narratable by an anchor. The pattern catalog is a closed, well-defined set: it can be
implemented as pure functions and pinned by unit tests.

## Goals

1. A **P&F chart mode** for the selected symbol inside the existing 300px chart panel, behind a
   LINE / P&F toggle — no new page, no new panel for the chart itself.
2. The **active pattern's name printed on the chart** when one is present, StockCharts-style —
   bull patterns in the app's up color, bear patterns in the down color.
3. A **watchlist scanner**: when any watchlist symbol prints a *new* pattern, the existing alert
   machinery fires (banner + sting + anchor break-in), gated by a settings toggle.
4. A **P&F SIGNALS right-rail panel** listing watchlist symbols with an active pattern,
   toggleable in settings like the other rail panels.
5. Engine and detector are **pure, total, Vitest-tested** modules in the style of
   `src/settings/` and `src/datahub/` — no React, no I/O, safe on malformed input.
6. Works identically in demo and live mode, fully offline — the engine only ever sees the
   in-memory tape.

## Non-goals (explicit, for honesty and scope)

- **No daily/historical P&F.** Finnhub's free tier has no candle history; the only tape the app
  owns is the current session. This is an *intraday session* P&F chart and says so on its face.
- **No price objectives.** Vertical/horizontal count targets are a possible follow-up, not this
  bundle.
- **No scan-builder UI.** StockCharts has a scan language; our scan is fixed: the watchlist.
- **No i18n of pattern names.** "Triple Top Breakout" is a term of art (StockCharts' own
  vocabulary) and stays English in all six languages; surrounding labels get I18N entries.
- **No TradingView P&F style.** The embedded widget is untouched.
- No change to the line chart, price alerts, market engine, or inference routing.

## Architecture

All derivation is pure; React only feeds the tape in and renders what comes out.

```text
session tape (closes[])
  → buildPnF(closes, {boxSize:'auto', reversal:3})   [pure, tested]
  → { columns: [{type:'X'|'O', top, bottom}], boxSize }
  → detectPattern(columns)                            [pure, tested]
  → { id, name, side:'bull'|'bear' } | null
  ├─ chart panel: <PnFChart> SVG + pattern badge      [React, in React.jsx]
  ├─ scanner: per watchlist symbol, fire on new id    [React effect, existing alert rails]
  └─ P&F SIGNALS rail panel                           [React, in React.jsx]
```

## Components

### 1. `src/pnf/pnf.js` (new, pure, tested)

- `autoBoxSize(price) -> number` — `price × 0.1%`, snapped **up** to the ladder
  `0.01, 0.02, 0.05, 0.10, 0.25, 0.50, 1, 2, 5, 10`. A $230 stock gets $0.25 boxes; a $45
  stock $0.05. Guarantees a single session produces a readable multi-column chart instead of
  the one column that StockCharts' daily traditional scale would yield intraday.
- `buildPnF(closes, {boxSize = 'auto', reversal = 3}) -> { columns, boxSize }` — classic
  close-method construction on a price grid anchored at 0 (box *i* spans
  `[i·box, (i+1)·box)`). The first column direction is set by the first one-box move; an
  X column extends when the close enters a higher box; the column flips when the close
  retraces `reversal` boxes from the column's extreme. Each column is
  `{ type: 'X'|'O', top, bottom }` with integer box indices, both inclusive.
- Total functions: empty input, a single price, all-NaN, or a flat tape that never fills one
  box → `{ columns: [], boxSize }`. Non-finite closes are dropped before folding.

### 2. `src/pnf/patterns.js` (new, pure, tested)

`detectPattern(columns) -> { id, name, side } | null`, evaluated at the rightmost column only —
a pattern is "active" while the current column still satisfies it. One-line definitions
(exact box-level rules are pinned by one test fixture per pattern):

| id | name | side | rule sketch |
| --- | --- | --- | --- |
| `double-top` | Double Top Breakout | bull | X column exceeds the previous X top |
| `double-bottom` | Double Bottom Breakdown | bear | O column breaks the previous O bottom |
| `triple-top` | Triple Top Breakout | bull | two equal X tops, third X exceeds them |
| `triple-bottom` | Triple Bottom Breakdown | bear | two equal O bottoms, third O breaks them |
| `quad-top` | Quadruple Top Breakout | bull | three equal X tops, fourth X exceeds |
| `quad-bottom` | Quadruple Bottom Breakdown | bear | three equal O bottoms, fourth O breaks |
| `asc-triple-top` | Ascending Triple Top Breakout | bull | consecutive rising X tops, each a breakout, rising O bottoms between |
| `desc-triple-bottom` | Descending Triple Bottom Breakdown | bear | mirror of ascending triple top |
| `bull-catapult` | Bullish Catapult | bull | triple-top breakout, pullback column, then double-top breakout |
| `bear-catapult` | Bearish Catapult | bear | mirror |
| `bull-triangle` | Bullish Triangle Breakout | bull | ≥5 columns of falling X tops + rising O bottoms, then X breaks the last X top |
| `bear-triangle` | Bearish Triangle Breakdown | bear | mirror |
| `bearish-signal-reversed` | Bearish Signal Reversed | bull | ≥3 falling X tops / falling O bottoms, then one X column breaks the top of the whole sequence |
| `bullish-signal-reversed` | Bullish Signal Reversed | bear | mirror |
| `high-pole` | High Pole Warning | bear | X column exceeds the previous X top by ≥3 boxes, next O column retraces >50% of it |
| `low-pole` | Low Pole Reversal | bull | mirror |
| `bull-trap` | Bull Trap | bear | triple-or-more top breakout by exactly one box, then an immediate reversal column |
| `bear-trap` | Bear Trap | bull | mirror |

**Precedence** (most specific wins, fixed order): traps → catapults → triangles →
signal-reversed → poles → ascending/descending → quadruple → triple → double. The detector
returns the first match and never reports a Double Top when a Triple Top matched.
Malformed/empty column input → `null`.

### 3. Chart panel (modify `React.jsx`)

- `chartMode` state `'line' | 'pnf'`, persisted to localStorage key `tape-chartmode`; a
  LINE / P&F toggle sits in the chart header beside the "full chart" button.
- `<PnFChart columns boxSize pattern />` renders inline SVG in the same 300px container:
  faint box grid, X glyphs (two crossed strokes) in `C.up` green, O glyphs (stroked circles)
  in `C.down` red, price labels on the right edge every few boxes, and the last N columns that
  fit the width (~40). Caption under the chart: `box 0.25 · 3-box reversal · this session`.
- Active pattern → badge at top-left of the chart: pattern name in MONO caps, colored by side.
- `columns.length < 2` → the panel's existing empty-state styling with
  "not enough movement for a P&F column yet".

### 4. Scanner + alerts (modify `React.jsx`)

- An effect recomputes `detectPattern(buildPnF(tape))` for every watchlist symbol on the same
  cadence that drives the tape (demo tick / live poll), keeping `lastPatternId` per symbol in a
  ref.
- Fires only on **change to a new non-null id** — one announcement per formation; a symbol
  going patternless resets it. Firing reuses the existing alert path: banner + sting + anchor
  line "NVDA just printed a Triple Top Breakout on the point-and-figure chart", subject to the
  same speech-unlock rules as price alerts.
- Gated by a new `prefs.notify.pnfPatterns` toggle (default **on**): add the key to
  `DEFAULT_PREFS.notify` in `src/settings/preferences.js` — `loadPrefs` already merges new
  defaults over stored objects, so existing users pick it up — check it via the existing
  `notifyEnabled(prefs, "pnfPatterns")`, and extend `preferences.test.js` for the new key.
  Listed beside "price triggers" in settings. The scan itself always runs (it also feeds the
  rail panel); the toggle gates only the announcement.

### 5. P&F SIGNALS rail panel (modify `React.jsx`)

- Compact right-rail panel: one row per watchlist symbol with an active pattern —
  `SYM · Pattern Name` colored by side. No rows → panel hidden.
- Settings toggle alongside the other rail panels: add a `pnf: true` key to the `panels`
  state object (`React.jsx:3799`); the settings screen renders its checkbox from the same
  key map as the existing six panels.

### 6. i18n

New I18N entries for: "P&F", "pattern alerts", the rail panel title "P&F SIGNALS", and the
empty-state line — across the five non-English languages, matching the existing catalog style.
Pattern names themselves are not translated (non-goal). The anchor break-in sentence pushed to
`pushBreaking` stays English-only, like every other `pushBreaking` message in the app (breaking
news headlines, market moves, calendar reminders) — none of those are translated either, so
giving the P&F anchor sentence its own i18n template would be inconsistent with the rest of the
on-air feed. Only UI labels are translated.

## Error handling

- Engine and detector are total: any malformed input yields `{ columns: [], boxSize }` / `null`
  — never a throw. The chart falls back to its empty state; the scanner treats `null` as
  "no pattern".
- Live mode early in a session (tape too short) behaves identically to a flat tape: empty
  state, no alerts. No special-casing.

## Testing

TDD throughout, Vitest, same conventions as `src/settings/*.test.js`:

- `src/pnf/pnf.test.js` — known close sequences → exact expected columns: simple rise, 3-box
  reversal, sub-box noise ignored, exact box-boundary closes, first-column direction, empty/NaN
  inputs, auto box ladder snapping.
- `src/pnf/patterns.test.js` — one hand-built column fixture per catalog entry (18 patterns),
  plus: precedence cases (triple beats double, catapult beats triple), rightmost-column-only
  evaluation (a stale pattern three columns back reports `null`), empty/short input.
- UI wiring (toggle, badge, scanner effect, rail panel) is exercised manually like the rest of
  `React.jsx`; all logic that can be wrong lives in the tested modules.
