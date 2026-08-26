import { describe, it, expect } from "vitest";
import {
  SUITS, RANKS, LIMIT, START_CAPITAL, MIN_POSITION,
  deck, cardValue, handValue, isNatural, overheated, marketPlays, settle,
  netPnl, capitalFrom, drawdown, riskPct, winRate, record, riskBand,
  sizeOptions, clampSize, canDouble, isWiped, money, tapeLine, adviceKey, buyRisk,
} from "./overheat.js";

const c = (r, s = "♠") => ({ r, s });
// A deterministic "random": walks a fixed sequence, so a shuffled deck is
// reproducible without stubbing globals.
const seq = (xs) => { let i = 0; return () => xs[i++ % xs.length]; };

describe("deck", () => {
  it("is a full 52 with no duplicates", () => {
    const d = deck(seq([0.1, 0.9, 0.4, 0.7]));
    expect(d).toHaveLength(SUITS.length * RANKS.length);
    expect(new Set(d.map(x => x.r + x.s)).size).toBe(52);
  });
  it("actually permutes, rather than handing back the ordered pack", () => {
    const ordered = deck(() => 0);          // Fisher-Yates with rand()=0 still moves cards
    const shuffled = deck(seq([0.3, 0.8, 0.15, 0.62, 0.44]));
    expect(shuffled.map(x => x.r + x.s).join()).not.toBe(ordered.map(x => x.r + x.s).join());
  });
  it("never produces an out-of-range index, at either end of rand()", () => {
    // The old sort-comparator shuffle was undefined behaviour; this one has to
    // survive a generator that returns its extremes.
    for (const rand of [() => 0, () => 0.999999, seq([0, 0.999999])]) {
      const d = deck(rand);
      expect(d.filter(Boolean)).toHaveLength(52);
    }
  });
});

describe("handValue", () => {
  it("counts pips, and faces as ten", () => {
    expect(cardValue("7")).toBe(7);
    expect(cardValue("10")).toBe(10);
    for (const f of ["J", "Q", "K"]) expect(cardValue(f)).toBe(10);
    expect(cardValue("A")).toBe(11);
  });
  it("softens ONE ace at a time — two aces are 12, not 2", () => {
    expect(handValue([c("A"), c("A")])).toBe(12);
    expect(handValue([c("A"), c("A"), c("A")])).toBe(13);
    expect(handValue([c("A"), c("9")])).toBe(20);
    expect(handValue([c("A"), c("9"), c("5")])).toBe(15);   // the ace drops to 1
  });
  it("reads the reference's own two hands", () => {
    expect(handValue([c("7", "♣"), c("8", "♥"), c("J", "♥")])).toBe(25);   // the market
    expect(handValue([c("6", "♥"), c("7", "♦")])).toBe(13);                // your book
  });
  it("survives an empty or malformed hand", () => {
    expect(handValue([])).toBe(0);
    expect(handValue()).toBe(0);
    expect(handValue([null, { r: "??" }])).toBe(0);
  });
});

describe("isNatural / overheated", () => {
  it("a natural is twenty-one on exactly two cards", () => {
    expect(isNatural([c("A"), c("K")])).toBe(true);
    expect(isNatural([c("7"), c("7"), c("7")])).toBe(false);   // 21, but not on two
    expect(isNatural([c("A"), c("9")])).toBe(false);
  });
  it("overheating is strictly past the limit", () => {
    expect(overheated([c("K"), c("K"), c("2")])).toBe(true);    // 22
    expect(overheated([c("K"), c("A")])).toBe(false);           // 21 exactly
  });
});

describe("marketPlays", () => {
  it("draws until it reaches the point it cools at, and then stops", () => {
    const rest = [c("9"), c("5"), c("4")];   // popped from the end: 4, then 5
    const out = marketPlays([c("6"), c("6")], rest, 17);   // 12 → 16 → 21
    expect(handValue(out.cards)).toBe(21);
    expect(out.cards).toHaveLength(4);
  });
  it("stands the moment it is at the threshold, not past it", () => {
    const out = marketPlays([c("10"), c("7")], [c("5")], 17);   // already 17
    expect(out.cards).toHaveLength(2);
    expect(out.rest).toHaveLength(1);
  });
  it("obeys the threshold it is given — the same book is a different game", () => {
    const hand = [c("8"), c("8")];   // 16
    expect(marketPlays(hand, [c("2")], 15).cards).toHaveLength(2);   // 16 >= 15: stands
    expect(marketPlays(hand, [c("2")], 17).cards).toHaveLength(3);   // 16 < 17: draws
  });
  it("cannot draw from an empty shoe", () => {
    const out = marketPlays([c("2"), c("3")], [], 17);
    expect(out.cards).toHaveLength(2);
  });
  it("leaves the inputs alone", () => {
    const cards = [c("6"), c("6")], rest = [c("9"), c("5")];
    marketPlays(cards, rest, 17);
    expect(cards).toHaveLength(2);
    expect(rest).toHaveLength(2);
  });
});

describe("settle", () => {
  const S = 50;
  it("an overheated book loses before the market ever plays", () => {
    const r = settle({ book: [c("K"), c("Q"), c("5")], market: [c("2"), c("3")], size: S });
    expect(r).toMatchObject({ kind: "lose", amount: -50, reason: "book-overheat", book: 25 });
  });
  it("a natural pays half as much again", () => {
    expect(settle({ book: [c("A"), c("K")], market: [c("10"), c("9")], size: S }))
      .toMatchObject({ kind: "win", amount: 75, reason: "natural" });
  });
  it("but not against a market natural — nobody was ever ahead", () => {
    expect(settle({ book: [c("A"), c("K")], market: [c("A"), c("Q")], size: S }))
      .toMatchObject({ kind: "push", amount: 0, reason: "tie" });
  });
  it("an overheated market pays a book that held", () => {
    // The reference's own hand: market 25, book 13, +$50.
    const r = settle({ book: [c("6", "♥"), c("7", "♦")], market: [c("7", "♣"), c("8", "♥"), c("J", "♥")], size: S });
    expect(r).toMatchObject({ kind: "win", amount: 50, reason: "market-overheat", market: 25, book: 13 });
  });
  it("otherwise the higher hand takes it, and equal hands push", () => {
    expect(settle({ book: [c("10"), c("9")], market: [c("10"), c("8")], size: S })).toMatchObject({ kind: "win", reason: "higher", amount: 50 });
    expect(settle({ book: [c("10"), c("7")], market: [c("10"), c("8")], size: S })).toMatchObject({ kind: "lose", reason: "lower", amount: -50 });
    expect(settle({ book: [c("10"), c("8")], market: [c("10"), c("8")], size: S })).toMatchObject({ kind: "push", reason: "tie", amount: 0 });
  });
  it("scales with the position, which is what makes doubling down cost double", () => {
    expect(settle({ book: [c("K"), c("Q"), c("5")], market: [], size: 100 }).amount).toBe(-100);
  });
});

describe("the numbers all reconcile", () => {
  // The handoff's own worked example: start $1,000, three sessions, capital
  // $600, drawdown 40%, net −$400, tape −150 / −300 / +50.
  const TAPE = [
    { kind: "lose", amount: -150, market: 18, book: 24, cards: 4 },
    { kind: "lose", amount: -300, market: 20, book: 22, cards: 3 },
    { kind: "win", amount: 50, market: 25, book: 13, cards: 2 },
  ];
  it("capital is the tape, and nothing else", () => {
    expect(netPnl(TAPE)).toBe(-400);
    expect(capitalFrom(START_CAPITAL, TAPE)).toBe(600);
  });
  it("the drawdown is capital against the start", () => {
    expect(drawdown(START_CAPITAL, capitalFrom(START_CAPITAL, TAPE))).toEqual({ pct: 40, direction: "down" });
  });
  it("a session in profit is not called a drawdown", () => {
    expect(drawdown(1000, 1200)).toEqual({ pct: 20, direction: "up" });
    expect(drawdown(1000, 1000)).toEqual({ pct: 0, direction: "flat" });
    expect(drawdown(0, 0)).toEqual({ pct: 0, direction: "flat" });
  });
  it("risk is the position over the capital, to one decimal", () => {
    expect(riskPct(50, 600)).toBe(8.3);
    expect(riskPct(100, 600)).toBe(16.7);
    expect(riskPct(50, 0)).toBe(0);
  });
  it("the record and the win rate read the same tape", () => {
    expect(record(TAPE)).toEqual({ up: 1, down: 2, flat: 0 });
    expect(winRate(TAPE)).toBe(33);
    expect(winRate([])).toBe(0);
  });
  it("a push counts as a position played but not as one won", () => {
    const t = [{ kind: "win", amount: 50 }, { kind: "push", amount: 0 }];
    expect(record(t)).toEqual({ up: 1, down: 0, flat: 1 });
    expect(winRate(t)).toBe(50);
    expect(netPnl(t)).toBe(50);
  });
  it("survives a malformed entry rather than turning capital into NaN", () => {
    expect(netPnl([{ amount: 50 }, {}, null, { amount: "x" }])).toBe(50);
  });
});

describe("riskBand", () => {
  it("bands where the advice actually changes", () => {
    expect(riskBand(2)).toBe("low");
    expect(riskBand(8.3)).toBe("moderate");
    expect(riskBand(16.7)).toBe("high");
    expect(riskBand(50)).toBe("extreme");
  });
});

describe("adviceKey", () => {
  it("has nothing to say before the first position", () => {
    expect(adviceKey({ tape: [], risk: 8 })).toBe("start");
  });
  it("names the mistake you just made ahead of anything else", () => {
    // High risk AND a losing tape, but the overheat is the thing worth saying.
    expect(adviceKey({
      tape: [{ kind: "lose" }, { kind: "lose" }],
      risk: 40,
      last: { reason: "book-overheat" },
    })).toBe("past-limit");
  });
  it("calls out the size before the record", () => {
    expect(adviceKey({ tape: [{ kind: "lose" }, { kind: "lose" }], risk: 30, last: { reason: "lower" } })).toBe("size-down");
  });
  it("notices a losing tape once the size is sensible", () => {
    expect(adviceKey({ tape: [{ kind: "lose" }, { kind: "lose" }, { kind: "win" }], risk: 3, last: { reason: "lower" } })).toBe("losing");
  });
  it("says nothing alarming when nothing is wrong", () => {
    expect(adviceKey({ tape: [{ kind: "win" }, { kind: "win" }, { kind: "lose" }], risk: 3, last: { reason: "higher" } })).toBe("steady");
  });
  it("survives being called with nothing", () => {
    expect(adviceKey()).toBe("start");
  });
});

describe("position sizing", () => {
  it("offers the fixed chips it can cover, plus whatever is left", () => {
    expect(sizeOptions(600)).toEqual([25, 50, 100, 600]);
    expect(sizeOptions(80)).toEqual([25, 50, 80]);
  });
  it("does not offer the same number twice when max is already a chip", () => {
    expect(sizeOptions(100)).toEqual([25, 50, 100]);
    expect(sizeOptions(25)).toEqual([25]);
  });
  it("clamps to the step, the minimum and the capital", () => {
    expect(clampSize(60, 600)).toBe(50);     // snaps to the 25 step
    expect(clampSize(10, 600)).toBe(25);     // never below the minimum
    expect(clampSize(900, 600)).toBe(600);   // never past what is there
    expect(clampSize(50, 10)).toBe(0);       // nothing is playable
  });
  it("only doubles an opening hand that the capital can cover", () => {
    const book = [c("5"), c("6")];
    expect(canDouble({ book, size: 50, capital: 600 })).toBe(true);
    expect(canDouble({ book, size: 50, capital: 90 })).toBe(false);          // cannot cover the second half
    expect(canDouble({ book: [c("5"), c("6"), c("2")], size: 50, capital: 600 })).toBe(false);  // not the opening hand
    expect(canDouble({ book: [c("K"), c("Q"), c("5")], size: 50, capital: 600 })).toBe(false);  // already overheated
  });
  it("is wiped below the smallest position it could open", () => {
    expect(isWiped(0)).toBe(true);
    expect(isWiped(MIN_POSITION - 1)).toBe(true);
    expect(isWiped(MIN_POSITION)).toBe(false);
  });
});

describe("money", () => {
  it("groups thousands and uses the product's minus sign", () => {
    expect(money(1000)).toBe("$1,000");
    expect(money(-400)).toBe("−$400");
    expect(money(-400).charAt(0)).toBe("−");   // U+2212, not a hyphen
    expect(money(0)).toBe("$0");
  });
  it("shows a plus only when asked for one", () => {
    expect(money(50, { sign: true })).toBe("+$50");
    expect(money(50)).toBe("$50");
    expect(money(0, { sign: true })).toBe("$0");
    expect(money(-50, { sign: true })).toBe("−$50");
  });
  it("does not print NaN for junk", () => {
    expect(money(undefined)).toBe("$0");
    expect(money("x")).toBe("$0");
  });
});

describe("tapeLine", () => {
  it("says held for an opening book and bought for one that took cards", () => {
    expect(tapeLine({ market: 25, book: 13, cards: 2 })).toBe("market 25 · held 13");
    expect(tapeLine({ market: 18, book: 24, cards: 4 })).toBe("market 18 · bought to 24");
  });
});

describe("buyRisk", () => {
  it("says nothing can overheat a book of eleven or less", () => {
    for (const b of [[c("2"), c("3")], [c("5"), c("6")], [c("A"), c("2")]]) {
      const r = buyRisk(b);
      expect(r.bust).toBe(0);
      expect(r.safe).toBe(13);
    }
  });
  it("counts the ranks that would overheat, not the ones that look like they would", () => {
    // 15: a 7 or better busts — EXCEPT the ace, which demotes to a 1.
    const r = buyRisk([c("10"), c("5")]);
    expect(r.spare).toBe(6);
    expect(r.bust).toBe(7);          // 7 8 9 10 J Q K
    expect(r.safe).toBe(6);          // A 2 3 4 5 6
    expect(r.bust + r.safe).toBe(r.total);
  });
  it("leaves a twenty-one with nothing safe to draw", () => {
    const r = buyRisk([c("10"), c("6"), c("5")]);
    expect(r.spare).toBe(0);
    expect(r.bust).toBe(13);
    expect(r.safe).toBe(0);
  });
  it("knows a soft book cannot be overheated at all", () => {
    // A + 6 is a soft 17: four to spare on the face of it, but the ace demotes
    // to a 1 the moment a card would take it past the limit, so NOTHING
    // overheats it. This is the case a hand-written "anything above a 4" rule
    // gets wrong, and the reason this counts through handValue.
    const r = buyRisk([c("A"), c("6")]);
    expect(r.spare).toBe(4);
    expect(r.bust).toBe(0);
    expect(r.safe).toBe(13);
  });
  it("only starts to bite once the ace has already been spent", () => {
    // A + 6 + 9 is a hard 16 — the ace is a 1 now and cannot save it twice.
    const r = buyRisk([c("A"), c("6"), c("9")]);
    expect(r.spare).toBe(5);
    expect(r.bust).toBe(8);   // 6 7 8 9 10 J Q K
  });
  it("has nothing to say about a book that already overheated", () => {
    expect(buyRisk([c("10"), c("9"), c("8")])).toBeNull();
  });
  it("agrees with handValue on every reachable book", () => {
    for (const a of RANKS) for (const b of RANKS) {
      const book = [c(a), c(b)];
      const r = buyRisk(book);
      if (!r) continue;
      const counted = RANKS.filter(x => handValue([...book, c(x)]) > LIMIT).length;
      expect(r.bust).toBe(counted);
      expect(r.spare).toBe(LIMIT - handValue(book));
    }
  });
});

describe("constants", () => {
  it("are the handoff's", () => {
    expect(LIMIT).toBe(21);
    expect(START_CAPITAL).toBe(1000);
    expect(MIN_POSITION).toBe(25);
  });
});
