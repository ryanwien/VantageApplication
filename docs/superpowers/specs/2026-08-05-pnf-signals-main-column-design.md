# P&F Signals panel — move to main column as a card grid

**Date:** 2026-08-05
**Branch:** pnf-pattern-alerts
**Status:** Approved (follow-up to 2026-08-05-pnf-pattern-alerts-design.md)

## What

Relocate the `✕○ P&F SIGNALS` panel from the right rail to the main
"chart + stats" column, directly below the OPEN/HIGH/LOW/PREV CLOSE/CHANGE
stats strip, and change its row list into a responsive card grid that uses
the wider column. Requested via annotated screenshot: the main column ends
at the stats strip, leaving dead space beneath it while the rail is crowded.

## Layout

- Panel box in the house style (`C.panel` background, `C.panelEdge` border,
  radius 6) with the existing header `✕○ P&F SIGNALS` (existing `t()` key —
  no new i18n strings).
- Body: `display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr))`,
  mirroring the stat-card grid above it.
- Each card: symbol in bold mono on top, pattern name below, colored by side
  (`bull` → `dirColorN(1)`, `bear` → `dirColorN(-1)`) — same color logic the
  rail rows used.

## Behavior (unchanged)

- Same visibility gate: `panels.pnf && Object.keys(pnfSignals).length > 0`.
  The settings "P&F signals" panel toggle and the hide-when-empty rule keep
  working; they now gate the new location.
- Same data source: `pnfSignals` state fed by the 3-second watchlist scanner.
- Cards are non-interactive, as the rail rows were.
- No engine, scanner, announcement, or i18n changes.

## Testing

Existing `src/pnf` tests are engine-level and unaffected. Verification is
visual, in the running app (demo mode prints patterns within a scan cycle
or two).
