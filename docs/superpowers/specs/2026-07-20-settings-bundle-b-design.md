# Settings Bundle B: refresh rate, privacy, color-blind, notifications

**Date:** 2026-07-20
**Status:** approved, pending implementation plan
**Scope:** Settings page + the render sites the preferences affect

## Context

Bundle A (merged) added the local-inference proof UI. Bundle B adds four
user-preference settings, chosen as the *honest* subset of a larger trading-settings
brainstorm. The rejected items (order-execution defaults, one-click trading, slippage
tolerance, extended-hours trading) were dropped because Vantage has **no order-execution,
brokerage, or paper-trading code** (verified: zero matches for `placeOrder`/`submitOrder`/
`slippage`/etc.), and building settings for a trading engine that doesn't exist would imply
a capability the app lacks — the same false-claim problem Bundle A's honesty work fixed.

Existing hooks this bundle builds on:

- Up/down palette: `C.up: "#2FD37A"` / `C.down: "#F6465D"` (`React.jsx:77-78`), used app-wide.
- Polling: fixed `setInterval` loops (`React.jsx:3618`, `4023`) + a Finnhub backoff (`3687`).
- Notifications: a breaking-news on/off toggle already exists — `breakingOn`, persisted to
  `localStorage["tape-breaking"]` (`React.jsx:4943-4944`) — plus price-alert logic.

## Goals

1. A color-blind user can read up/down without relying on red/green.
2. A user can hide sensitive figures on a shared/public screen in one action.
3. A user can trade off data freshness against device load and API rate limits.
4. A user can choose which in-app alerts fire.

## Non-goals (explicit, for honesty)

- **No** "real-time streaming" refresh label. Vantage polls Finnhub's rate-limited REST
  free tier; a "real-time" option that is actually 1s polling would be a false claim.
  True WebSocket streaming is a separate future integration, out of scope here.
- **No** filled-order or margin-call notifications (no trading engine).
- **No** SMS or email delivery channels (no delivery backend). In-app only.
- No change to inference, model routing, or the Bundle A surfaces.
- No backend (`server/index.js`) changes. Client-only.

## Architecture

New pure module `src/settings/preferences.js` (Vitest-tested) holds all derivation. A single
React hook/context exposes the persisted preferences object so render sites read it without
prop-drilling. Same split as Bundle A: logic in the tested module, rendering in `React.jsx`.

Preferences persist to `localStorage["tape-prefs"]` as one JSON object:

```js
{
  colorBlind: false,        // boolean
  privacy: false,           // boolean (session default; see §2)
  refreshMs: 15000,         // one of 0 (manual) | 5000 | 15000 | 30000
  notify: { priceTriggers: true, breakingNews: true }
}
```

`breakingNews` migrates from the existing `localStorage["tape-breaking"]` value on first load
(if present) so the current toggle state is preserved.

## Components

### 1. Color-blind mode (recolor + shapes)

Approved approach: **recolor AND shapes**, the most robust (works for all deficiency types
and in grayscale).

- Two pure helpers in `preferences.js`:
  - `directionColor(dir, prefs) -> string` — `dir` is `"up" | "down" | "flat"`. Returns the
    colorblind-safe palette when `prefs.colorBlind`, else the default. Colorblind palette:
    up `#3B82F6` (blue), down `#F59E0B` (orange); default up `#2FD37A`, down `#F6465D`.
  - `directionGlyph(dir, prefs) -> string` — returns `"▲"`/`"▼"`/`""` when `prefs.colorBlind`,
    else `""` (no glyph in default mode).
- Render wiring: replace direct `C.up`/`C.down` reads at up/down value sites with
  `directionColor(...)`, and prepend `directionGlyph(...)` at the Δ-value render sites.
- `C.up`/`C.down` remain as the default palette constants — the helper reads them.

### 2. Privacy mode (blur, not remove)

- A settings toggle **and** a `Shift+P` global hotkey flip `prefs.privacy`.
- When on, sensitive figures (portfolio total, position %, $ amounts) render inside a
  `privacy-blur` wrapper: CSS `filter: blur(8px)` + `aria-label` stating the value is hidden.
  Blur (not removal) keeps layout stable — no reflow when toggling.
- `prefs.privacy` is **persisted** like the other preferences (not reset per session): a user
  who turns it on keeps it on across visits. Default is off for a fresh install.

### 3. Data refresh rate

- Selector with four honest options mapped to `refreshMs`:
  `Manual (0) · 5s (5000) · 15s (15000) · 30s (30000)`. Default 15s.
- `refreshMs === 0` (Manual) stops the auto-poll and shows a manual "refresh now" affordance.
- The existing poll loops read `refreshMs` instead of a hardcoded interval. The Finnhub
  backoff-on-429 (`React.jsx:3687`) is preserved and takes precedence — a fast interval never
  overrides rate-limit backoff.
- Label copy says "refresh interval", never "real-time streaming".

### 4. Notification granularity

- A small two-row matrix of in-app toggles: **Price triggers** and **Breaking news**, each
  gating whether that alert type fires (banner + anchor sting + announce).
- `notify.breakingNews` supersedes the old `breakingOn`; the old value migrates in on first
  load. `notify.priceTriggers` gates the price-alert path.
- Copy states plainly these are in-app alerts.

## Data flow

```text
localStorage["tape-prefs"] ──load/migrate──> prefs object ──> usePreferences() hook
  prefs.colorBlind ─> directionColor()/directionGlyph() ─> value render sites
  prefs.privacy    ─> privacy-blur wrapper ─> sensitive figures
  prefs.refreshMs  ─> poll interval (backoff still wins) ─> quote polling
  prefs.notify.*   ─> alert gating ─> breaking-news + price-alert paths
```

Every setting is derived state read from the one persisted object; toggling re-renders the
consumers. No setting can drift from storage because storage is the single source.

## Error handling

| Case | Behaviour |
| --- | --- |
| `tape-prefs` missing/corrupt | fall back to the documented defaults; never throw |
| unknown `refreshMs` value | coerce to the 15s default |
| `directionColor` given an unknown `dir` | return the flat/neutral color, never throw |
| privacy hotkey while typing in an input | ignored (guard against text-field focus) |
| 429 backoff active while a fast interval is set | backoff wins; interval does not override |

## Testing

- **preferences.js unit tests (Vitest):** `directionColor`/`directionGlyph` for up/down/flat
  in both modes and never emitting a glyph in default mode; `refreshMs` coercion of unknown
  values; notification-pref gating true/false; the `tape-breaking` → `notify.breakingNews`
  migration; corrupt-JSON fallback to defaults.
- **Browser verification:** color-blind toggle recolors and adds glyphs; privacy toggle +
  `Shift+P` blur/reveal with no layout shift; refresh selector changes cadence and Manual
  stops the poll; disabling a notification type suppresses that alert.
- **i18n:** all new user-facing strings wrapped in `t()`; there are 5 locale dictionaries
  (es/fr/de/pt/it), no English dictionary (`makeT` returns the literal for English).

## Open questions

None. The two honesty boundaries (no "real-time streaming" label; in-app-only notifications
for price-triggers + breaking-news) were raised and confirmed during design.
