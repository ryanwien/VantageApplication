import { describe, it, expect } from "vitest";
import {
  ROUNDS, ROUND_SECONDS, BONUS_WITHIN, BASE_POINTS, BONUS_POINTS,
  answerIndex, award, totalPoints, rightCount, streak, countdown,
} from "./ticker.js";

describe("the eight rounds", () => {
  it("are eight, because the HUD counts to eight", () => {
    expect(ROUNDS).toHaveLength(8);
  });

  it.each(ROUNDS.map(r => [r.company, r]))("%s is well formed", (company, r) => {
    expect(r.symbol.trim()).toMatch(/^[A-Z.]{1,5}$/);
    expect(r.sector.trim()).not.toBe("");
    expect(r.exchange.trim()).not.toBe("");
    expect(r.teach.trim().length).toBeGreaterThan(30);

    expect(r.options).toHaveLength(3);
    expect(new Set(r.options.map(o => o.sym)).size).toBe(3);   // no duplicate options
    // Exactly one right answer, and it is the symbol the card claims.
    const right = r.options.filter(o => o.correct);
    expect(right).toHaveLength(1);
    expect(right[0].sym).toBe(r.symbol);
    // The right answer never carries a reason for being wrong.
    expect(right[0].why).toBeUndefined();
  });

  it("finds the answer by reading the options, not by trusting an index", () => {
    for (const r of ROUNDS) {
      expect(r.options[answerIndex(r)].sym).toBe(r.symbol);
    }
    expect(answerIndex({ options: [{ sym: "X" }] })).toBe(-1);
    expect(answerIndex(undefined)).toBe(-1);
  });

  it("only makes a stronger claim about a distractor where it is a fact worth teaching", () => {
    // The reference labels wrong options "not a listed symbol". That is a claim
    // about every exchange there is; these three are claims this file can stand
    // behind, and everything else simply gets no reason at all.
    const withWhy = ROUNDS.flatMap(r => r.options).filter(o => o.why);
    expect(withWhy.map(o => o.sym).sort()).toEqual(["APPL", "AZN", "FB", "NVDIA"]);
    for (const o of withWhy) expect(o.why).not.toMatch(/not a listed symbol/i);
  });

  it("asks about symbols the desk actually has a price for", () => {
    // The answered card shows a LAST TRADE. Every one of these is in the
    // dashboard's universe, so that card is never empty.
    const universe = ["AAPL", "MSFT", "NVDA", "AMD", "AMZN", "GOOGL", "META", "TSLA", "JPM", "BAC", "XOM", "DIS", "NFLX"];
    for (const r of ROUNDS) expect(universe).toContain(r.symbol);
  });
});

describe("award", () => {
  it("pays the reference's +20 for a fast right answer", () => {
    // The reference's question card reads 0:12 and its answered card pays +20.
    expect(award(true, 12)).toEqual({ correct: true, points: 20, bonus: true });
  });
  it("pays base only once the bonus window has gone", () => {
    // Twenty-second round, bonus for answering inside fifteen: the window shuts
    // with five seconds left.
    expect(award(true, 6)).toEqual({ correct: true, points: 20, bonus: true });
    expect(award(true, 5)).toEqual({ correct: true, points: 10, bonus: false });
    expect(award(true, 0)).toEqual({ correct: true, points: 10, bonus: false });
  });
  it("pays nothing for a wrong answer, however fast", () => {
    expect(award(false, 20)).toEqual({ correct: false, points: 0, bonus: false });
  });
  it("cannot be gamed by a clock that reads past the round length", () => {
    expect(award(true, 9999).points).toBe(BASE_POINTS + BONUS_POINTS);
    expect(award(true, -5)).toEqual({ correct: true, points: 10, bonus: false });
    expect(award(true, undefined).points).toBe(10);
  });
  it("uses the constants the footer promises", () => {
    expect(ROUND_SECONDS).toBe(20);
    expect(BONUS_WITHIN).toBe(15);
    expect(BASE_POINTS + BONUS_POINTS).toBe(20);
  });
});

describe("the score, the count and the streak all read one list", () => {
  const AWARDS = [
    { correct: true, points: 20 },
    { correct: false, points: 0 },
    { correct: true, points: 10 },
    { correct: true, points: 20 },
  ];
  it("adds the points up", () => {
    expect(totalPoints(AWARDS)).toBe(50);
    expect(totalPoints([])).toBe(0);
  });
  it("counts the right answers", () => {
    expect(rightCount(AWARDS)).toBe(3);
  });
  it("reads the streak as the trailing run, so a wrong round really breaks it", () => {
    expect(streak(AWARDS)).toBe(2);
    expect(streak([{ correct: false, points: 0 }])).toBe(0);
    expect(streak([])).toBe(0);
    expect(streak([{ correct: true, points: 20 }, { correct: true, points: 20 }])).toBe(2);
  });
  it("survives a malformed entry rather than turning the score into NaN", () => {
    expect(totalPoints([{ points: 20 }, null, {}, { points: "x" }])).toBe(20);
    expect(rightCount([null, { correct: true }])).toBe(1);
    expect(streak([null])).toBe(0);
  });
});

describe("countdown", () => {
  it("reads the way the pill prints it", () => {
    expect(countdown(12)).toBe("0:12");
    expect(countdown(20)).toBe("0:20");
    expect(countdown(5)).toBe("0:05");
    expect(countdown(0)).toBe("0:00");
  });
  it("never shows a negative clock", () => {
    expect(countdown(-3)).toBe("0:00");
    expect(countdown(undefined)).toBe("0:00");
  });
});
