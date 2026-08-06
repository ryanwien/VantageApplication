# Bulls vs Bears chess polish — move animation, AI pacing, sound effects

**Date:** 2026-08-06 · **Status:** approved (Ryan, in-session)

## Problem

The chess mini-game commits moves instantly: pieces teleport, the computer replies on a
fixed 550ms timer that reads as "instant", and the board is silent. (Reported live:
"no animation and computer moves too fast and no sound effects play".)

## Design

### 1. Move animation — flying-piece overlay (~180ms)

`ChessGame`'s board stays a plain 8×8 CSS grid; no layout rework. On every committed move
(human or AI), the board state applies immediately, but the moved glyph also renders as an
absolutely positioned overlay span inside the (now `position: relative`) board container,
sized `12.5% × 12.5%`, at the origin square's percentage offsets. One double-rAF later its
`left`/`top` flip to the destination offsets under a `0.18s ease` transition. While the
overlay flies, the destination square renders its piece at `opacity: 0`; a ~200ms timer
clears the overlay and reveals the real piece. `prefers-reduced-motion: reduce` skips the
flight entirely (state applies as today). A new commit or `new game` cancels any in-flight
overlay/timer.

### 2. AI pacing — randomized think time

The Bears' reply timer changes from a fixed 550ms to `900 + Math.random() * 800` ms
(0.9–1.7s, "natural" — chosen by Ryan over quick/deliberate options). The existing
"🐻 Computer thinking…" status line and board dim already cover the waiting affordance.

### 3. Sound effects — via the app's synth kit

New `chessSfx(kind)` callback in `MarketDashboard` beside `uiClick`/`chirp`, passed to
`<ChessGame sfx={...}>` (the component is defined outside the dashboard, so it receives
audio as a prop, like `onWin`). Respects the existing UI-sounds toggle and master volume
because it is built on `uiClick`/`chirp`:

- `move` — soft triangle tick at landing
- `capture` — two-tone descending sawtooth "thock" (plays for BOTH sides' captures;
  the anchor-cheer path for player captures is unchanged)
- `win` / `lose` — short rising / falling arpeggio, fired ~170ms after the king-capture
  landing; 2-player mode always plays `win`

Sounds fire at the overlay's landing (or immediately under reduced motion), so audio and
visual land together.

## Testing

Chess rules, board state, and AI move selection are untouched. All changes are
presentational/timing/audio inside the component — no pure logic worth extracting, so no
new unit tests (same precedent as `PnFChart`). Verification is live: play a move, watch
the slide, time the AI reply, hear move/capture cues; full vitest suite must stay green.
