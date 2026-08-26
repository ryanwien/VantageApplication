import { describe, it, expect } from "vitest";
import {
  chessClockNew, chessClockTick, chessClockTurn, chessClockRun, chessClockStop, chessClockFlagged,
} from "./clock.js";

// What the two clocks have spent between them. Almost every test here is about
// this number and not about either clock on its own: a ledger that loses time
// and a ledger that charges it to the wrong player both read fine one clock at
// a time, and the sum is what tells them apart.
const spent = (cl, start = 300) => (start - cl.w) + (start - cl.b);

describe("conservation", () => {
  // The defect this module exists for. The old ticker re-seeded its "since" on
  // every turn change, so any stretch that fell between a tick and a move was
  // charged to nobody. Both runs below cover the same ten seconds; the second
  // one changes turn twenty times, always in the gap between two ticks, which
  // is the shape the old code could not account for.
  it("charges the same total whether or not the turns fall between ticks", () => {
    let quiet = chessClockRun(chessClockNew(300), 0);
    for (let t = 500; t <= 10000; t += 500) quiet = chessClockTick(quiet, t);

    let busy = chessClockRun(chessClockNew(300), 0);
    let side = "w";
    for (let t = 500; t <= 10000; t += 500) {
      side = side === "w" ? "b" : "w";
      busy = chessClockTurn(busy, t - 250, side);        // a move, half a tick in
      busy = chessClockTick(busy, t);
    }

    expect(spent(quiet)).toBeCloseTo(10, 9);
    expect(spent(busy)).toBeCloseTo(10, 9);
  });

  // The same claim over a whole game rather than a tidy loop: sixty half-moves
  // at irregular thinking times, with the twice-a-second tick landing wherever
  // it lands relative to them.
  it("a whole game's two clocks add up to the time the game took", () => {
    let cl = chessClockRun(chessClockNew(300), 0);
    let now = 0, side = "w", nextTick = 500;
    for (let i = 0; i < 60; i++) {
      now += 137 + (i % 7) * 91;
      while (nextTick <= now) { cl = chessClockTick(cl, nextTick); nextTick += 500; }
      side = side === "w" ? "b" : "w";
      cl = chessClockTurn(cl, now, side);
    }
    cl = chessClockStop(cl, now);
    expect(spent(cl)).toBeCloseTo(now / 1000, 9);
  });
});

describe("attribution", () => {
  it("splits the tick a move falls inside between the two players", () => {
    let cl = chessClockRun(chessClockNew(300), 0);
    cl = chessClockTurn(cl, 300, "b");                   // white moved 300ms in
    cl = chessClockTick(cl, 1000);
    expect(300 - cl.w).toBeCloseTo(0.3, 9);
    expect(300 - cl.b).toBeCloseTo(0.7, 9);
  });

  it("charges the mover, not the side about to think", () => {
    // One move and no tick at all before it: everything so far is white's.
    const cl = chessClockTurn(chessClockRun(chessClockNew(300), 0), 4000, "b");
    expect(300 - cl.w).toBeCloseTo(4, 9);
    expect(cl.b).toBe(300);
    expect(cl.on).toBe("b");
  });
});

describe("stopping and starting", () => {
  it("charges nobody for the stretch between a stop and the next start", () => {
    let cl = chessClockRun(chessClockNew(300), 0);
    cl = chessClockStop(cl, 1000);                       // one second played
    cl = chessClockRun(cl, 61000);                       // a minute reading the move log
    cl = chessClockTick(cl, 62000);                      // one second more
    expect(spent(cl)).toBeCloseTo(2, 9);
  });

  it("charges the part-tick before a stop rather than dropping it", () => {
    // Opening the review is a stop that lands between ticks, and the stretch
    // before it was played.
    const cl = chessClockStop(chessClockRun(chessClockNew(300), 0), 300);
    expect(spent(cl)).toBeCloseTo(0.3, 9);
  });

  it("does not charge a new game for the game it replaced", () => {
    // Reset hands the component a fresh ledger in the same commit that stops
    // the clock, so the stop has to land on it harmlessly.
    const fresh = chessClockNew(300);
    expect(chessClockStop(fresh, 999999)).toBe(fresh);
    expect(chessClockTick(fresh, 999999)).toBe(fresh);
    expect(chessClockTurn(fresh, 999999, "w")).toBe(fresh);
  });
});

describe("what React needs of it", () => {
  it("returns the same object when nothing happened, so no re-render is forced", () => {
    const cl = chessClockRun(chessClockNew(300), 0);
    expect(chessClockTick(cl, 0)).toBe(cl);
    expect(chessClockRun(cl, 500)).toBe(cl);
    expect(chessClockTurn(cl, 0, "w")).toBe(cl);
  });

  it("survives being applied twice with the same timestamp", () => {
    // A state updater can be called more than once for one event; replaying any
    // of these must not charge the same stretch twice.
    const base = chessClockRun(chessClockNew(300), 0);
    const turned = chessClockTurn(base, 400, "b");
    expect(chessClockTurn(turned, 400, "b")).toEqual(turned);
    const ticked = chessClockTick(base, 400);
    expect(chessClockTick(ticked, 400)).toEqual(ticked);
    const stopped = chessClockStop(base, 400);
    expect(chessClockStop(stopped, 400)).toEqual(stopped);
  });
});

describe("the flag", () => {
  it("stops at zero and names the side that ran out", () => {
    let cl = chessClockRun(chessClockNew(5), 0);
    expect(chessClockFlagged(cl)).toBe(null);
    cl = chessClockTick(cl, 9000);
    expect(cl.w).toBe(0);
    expect(cl.b).toBe(5);                                // the side not on the clock is untouched
    expect(chessClockFlagged(cl)).toBe("w");
  });
});

describe("timestamps that misbehave", () => {
  it("charges nothing for a reading that goes backwards, and keeps the later one", () => {
    const cl = chessClockTick(chessClockRun(chessClockNew(300), 1000), 500);
    expect(cl.since).toBe(1000);
    expect(spent(cl)).toBe(0);
  });
});
