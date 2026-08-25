import { describe, it, expect } from "vitest";
import {
  ROUNDS, ROUND_SECONDS, BONUS_WITHIN, BASE_POINTS, BONUS_POINTS,
  movePct, moveText, sparkPath, isRight, award, totalPoints, rightCount, countdown,
} from "./bullbear.js";

const yOf = (points, i) => Number(points.split(" ")[i].split(",")[1]);
const lastY = (line) => yOf(line, line.split(" ").length - 1);

describe("the eight rounds", () => {
  it("are eight, because the HUD counts to eight", () => {
    expect(ROUNDS).toHaveLength(8);
  });
  it("are an even split, so guessing one way cannot beat the game", () => {
    expect(ROUNDS.filter(r => r.bullish)).toHaveLength(4);
    expect(ROUNDS.filter(r => !r.bullish)).toHaveLength(4);
  });

  it.each(ROUNDS.map(r => [r.tag, r]))("%s is well formed", (tag, r) => {
    expect(r.headline.trim().length).toBeGreaterThan(30);
    expect(r.why.trim().length).toBeGreaterThan(40);
    expect(r.time).toMatch(/^\d{2}:\d{2} ET · /);
    expect(r.tag).toBe(r.tag.toUpperCase());
    expect(r.lastClose).toBeGreaterThan(0);
    expect(r.open).toBeGreaterThan(0);
    expect(r.series.length).toBeGreaterThanOrEqual(5);
  });

  it("names no company, because none of this happened to one", () => {
    // Every headline is written about "the company". These are worked
    // examples, and a card headed THE TAPE must not read as a real print.
    for (const r of ROUNDS) {
      expect(r.headline).toMatch(/\b(the company|the board|the firm|a rival|a key executive|a flagship)\b/i);
      expect(r.headline).not.toMatch(/\b(Apple|Tesla|Nvidia|Amazon|Microsoft|Meta|Netflix|Alphabet)\b/);
    }
  });

  it("ends every series exactly at the last close it prints", () => {
    // The card shows "Last close 142.60" beside a line whose final point IS
    // that close. If they drift, the picture stops being of the number.
    for (const r of ROUNDS) expect(r.series[r.series.length - 1]).toBe(r.lastClose);
  });

  it("moves the price the way the round says it moved", () => {
    for (const r of ROUNDS) {
      const pct = movePct(r);
      expect(r.bullish ? pct > 0 : pct < 0).toBe(true);
      // A move too small to see is a round with nothing to teach.
      expect(Math.abs(pct)).toBeGreaterThan(2);
    }
  });
});

describe("movePct / moveText", () => {
  it("reads the reference's own round", () => {
    expect(movePct(ROUNDS[0])).toBeCloseTo(6.03, 2);
    expect(moveText(ROUNDS[0])).toBe("+6.0%");
  });
  it("uses the product's minus sign, not a hyphen", () => {
    const down = ROUNDS.find(r => !r.bullish);
    expect(moveText(down).charAt(0)).toBe("−");
  });
  it("refuses to divide by a close of nothing", () => {
    expect(movePct({ lastClose: 0, open: 10 })).toBe(null);
    expect(movePct({})).toBe(null);
    expect(moveText({})).toBe("");
  });
});

describe("sparkPath", () => {
  it("plots one point per price, across the left of the box when a gap follows", () => {
    const { line, gap } = sparkPath([1, 2, 3, 4, 5], 6, 200, 34);
    expect(line.split(" ")).toHaveLength(5);
    expect(Number(line.split(" ")[0].split(",")[0])).toBe(0);
    expect(Number(line.split(" ")[4].split(",")[0])).toBe(160);   // 80% of 200
    expect(gap.split(" ")).toHaveLength(2);
    expect(Number(gap.split(" ")[1].split(",")[0])).toBe(200);     // the gap reaches the edge
  });
  it("uses the whole width when there is no gap yet", () => {
    // Number(null) is 0 and 0 IS finite, so a naive check reserves the gap's
    // width for a card that has not been answered — and drags the scale to
    // zero with it. This is the state the card is in for half its life.
    const { line, gap } = sparkPath([1, 2, 3], null, 200, 34);
    expect(Number(line.split(" ")[2].split(",")[0])).toBe(200);
    expect(gap).toBe("");
    for (const bad of [undefined, "", NaN, "x"]) expect(sparkPath([1, 2, 3], bad).gap).toBe("");
  });
  it("hands the gap off from exactly where the line ended", () => {
    const { line, gap } = sparkPath([1, 2, 3], 4, 200, 34);
    expect(gap.split(" ")[0]).toBe(line.split(" ")[2]);
  });

  it("draws the gap UP for every bullish round and DOWN for every bearish one", () => {
    // The one test that ties the drawing to the numbers. y grows downward in
    // SVG, so a rise is a SMALLER y.
    for (const r of ROUNDS) {
      const { line, gap } = sparkPath(r.series, r.open);
      const from = lastY(line), to = yOf(gap, 1);
      expect(r.bullish ? to < from : to > from).toBe(true);
    }
  });

  it("makes a bigger move travel further than a smaller one", () => {
    const tape = [100, 101, 99, 100];                 // the same tape both times
    const small = sparkPath(tape, 102);
    const big = sparkPath(tape, 104);
    const rise = (p) => lastY(p.line) - yOf(p.gap, 1);
    expect(rise(big)).toBeGreaterThan(rise(small));
  });
  it("clips a move too big for the box instead of squashing the tape under it", () => {
    const tape = [100, 101, 99, 100];
    const huge = sparkPath(tape, 500);
    // The gap pins to the top edge…
    expect(yOf(huge.gap, 1)).toBe(3);
    // …and the tape underneath is drawn exactly as it is without one.
    expect(sparkPath(tape, 102).line).not.toBe("");
    expect(lastY(huge.line)).toBeGreaterThan(3);
  });

  it("stays inside the box it was given", () => {
    for (const r of ROUNDS) {
      const { line, gap } = sparkPath(r.series, r.open, 200, 34);
      for (const pt of `${line} ${gap}`.trim().split(" ")) {
        const [x, y] = pt.split(",").map(Number);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(200);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(34);
      }
    }
  });

  it("draws nothing rather than NaN for a series it cannot plot", () => {
    expect(sparkPath([], 5)).toEqual({ line: "", gap: "" });
    expect(sparkPath([1], 5)).toEqual({ line: "", gap: "" });
    expect(sparkPath(null, 5)).toEqual({ line: "", gap: "" });
    expect(sparkPath([1, "x", 3], null).line.split(" ")).toHaveLength(2);   // junk dropped
  });
  it("survives a flat series without dividing by zero", () => {
    const { line } = sparkPath([5, 5, 5], null, 200, 34);
    for (const pt of line.split(" ")) expect(Number(pt.split(",")[1])).not.toBeNaN();
  });
});

describe("isRight", () => {
  it("maps card 0 to bullish and card 1 to bearish", () => {
    const up = ROUNDS.find(r => r.bullish), down = ROUNDS.find(r => !r.bullish);
    expect(isRight(up, 0)).toBe(true);
    expect(isRight(up, 1)).toBe(false);
    expect(isRight(down, 1)).toBe(true);
    expect(isRight(down, 0)).toBe(false);
  });
  it("counts no call at all as wrong", () => {
    expect(isRight(ROUNDS[0], null)).toBe(false);
    expect(isRight(ROUNDS[0], undefined)).toBe(false);
  });
});

describe("award", () => {
  it("pays the reference's +30 at the reference's 0:09", () => {
    expect(award(true, 9)).toEqual({ correct: true, points: 30, bonus: true });
  });
  it("shuts the bonus window with five of the fifteen seconds left", () => {
    expect(award(true, 6)).toEqual({ correct: true, points: 30, bonus: true });
    expect(award(true, 5)).toEqual({ correct: true, points: 15, bonus: false });
  });
  it("pays nothing for a wrong call", () => {
    expect(award(false, 15)).toEqual({ correct: false, points: 0, bonus: false });
  });
  it("uses the constants the footer promises", () => {
    expect(ROUND_SECONDS).toBe(15);
    expect(BONUS_WITHIN).toBe(10);
    expect(BASE_POINTS + BONUS_POINTS).toBe(30);
  });
  it("pays more than Ticker Match, because a call is a judgement and not a recall", () => {
    expect(BASE_POINTS).toBeGreaterThan(10);
  });
});

describe("the run's totals read one list", () => {
  const AWARDS = [{ correct: true, points: 30 }, { correct: false, points: 0 }, { correct: true, points: 15 }];
  it("adds up and counts", () => {
    expect(totalPoints(AWARDS)).toBe(45);
    expect(rightCount(AWARDS)).toBe(2);
  });
  it("formats the clock", () => {
    expect(countdown(9)).toBe("0:09");
    expect(countdown(15)).toBe("0:15");
  });
});
