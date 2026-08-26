// The chess clock as accounting rather than as a countdown. No timer lives here
// and no formatting either: the caller says when things happened, and this says
// what they cost.
//
// It is a module because the defect it replaces was invisible from inside the
// component. The ticker was a setInterval built by an effect that listed `turn`
// among its dependencies, so React tore the interval down and made a new one on
// every half-move — and the "time since the last tick" the old closure was
// holding went with it. Everything between the previous tick and the move was
// charged to nobody, on a five-minute clock a game can be lost on.
//
// The size of that is worth stating, because "up to half a second a move" reads
// like rounding and it is not. What survived per half-move was the whole ticks
// that fitted inside the gap, so the loss was the remainder — and when a side
// moved in less than one tick there was no remainder, there was only loss: the
// interval was rebuilt before it ever fired and the clocks did not move at all.
// Measured against the app's own cadence, the old rule failed to charge 9% of a
// game at an unhurried tempo, 16% at a brisk one, and 32% at a blitzing one.
//
// The repair is not a better timer. It is moving `since` out of the timer and
// into the ledger, so the ledger can be settled at the moment the turn changes
// rather than at whatever moment the next tick happens to land on. A timer that
// never restarts is then just a thing that asks "how much, so far?" twice a
// second, and it no longer matters when it asks.
//
// `now` is milliseconds off a monotonic source — performance.now() in the app,
// plain numbers in the tests. Nothing in here reads a clock itself, which is
// what makes every rule below something a test can state.

// A ledger starts PAUSED, and that is not a detail. It is what makes starting a
// new game in the middle of one safe: the component's reset drops a fresh
// ledger in, the "the clock has stopped" effect fires in the same commit and
// finds it already stopped, and the new game is charged nothing for the old.
export const chessClockNew = (secs) => ({ w: secs, b: secs, on: "w", since: null });

// Charge whoever is on the clock for everything since `since`, and carry
// `since` up to now. Every export below is built out of this one, so no path
// can charge a stretch of time twice or skip settling it.
//
// A timestamp that goes backwards costs nobody anything and does not move
// `since` back with it. performance.now() will not do that, but a ledger whose
// only input is a number should say what it does with every number.
//
// Each function returns the ledger UNCHANGED — the same object, not an equal
// one — whenever it has nothing to do, so that handing the result to setState
// is a no-op instead of a re-render.
function settle(cl, now) {
  if (cl.since === null || now <= cl.since) return cl;
  return { ...cl, [cl.on]: Math.max(0, cl[cl.on] - (now - cl.since) / 1000), since: now };
}

// What the running timer asks, and the only thing it asks.
export const chessClockTick = (cl, now) => settle(cl, now);

// A move was made. Settling here rather than waiting for the next tick is the
// whole point: the stretch from the last tick to the move belongs to the player
// who made it, and the stretch after it belongs to the one now thinking. Losing
// that first stretch and giving it away are both wrong, and giving it away —
// which is what a ledger settled only on ticks would do — is the worse of the
// two, because it takes time off a clock that did not spend it.
export const chessClockTurn = (cl, now, side) => {
  const next = settle(cl, now);
  return next.on === side ? next : { ...next, on: side };
};

// The clock goes on. Nothing before this moment is chargeable, so resuming
// never backdates: the minute spent reading the move log is free, and so is the
// time before the first move.
export const chessClockRun = (cl, now) => (cl.since === null ? { ...cl, since: now } : cl);

// The clock goes off — and settles on the way, so the part-tick before the stop
// is charged rather than dropped. That stretch was played.
export const chessClockStop = (cl, now) => (cl.since === null ? cl : { ...settle(cl, now), since: null });

// Whose flag fell, if either. Only one side is ever being charged, so the two
// cannot reach zero on the same reading unless a game began at zero; white
// first is the arbitrary half of that, and it is arbitrary because a game with
// no time on either clock has no honest winner to name.
export const chessClockFlagged = (cl) => (cl.w <= 0 ? "w" : cl.b <= 0 ? "b" : null);
