import { describe, it, expect } from "vitest";
import { detectPattern } from "./patterns.js";

// fixture helpers — column literals in buildPnF's shape
const X = (bottom, top) => ({ type: "X", bottom, top });
const O = (top, bottom) => ({ type: "O", top, bottom });

describe("detectPattern — multi-level breakouts", () => {
  it("Double Top Breakout: X exceeds the previous X top", () => {
    expect(detectPattern([X(0, 5), O(4, 2), X(3, 6)]))
      .toEqual({ id: "double-top", name: "Double Top Breakout", side: "bull" });
  });
  it("Double Bottom Breakdown: O breaks the previous O bottom", () => {
    expect(detectPattern([O(5, 1), X(2, 4), O(3, 0)]))
      .toEqual({ id: "double-bottom", name: "Double Bottom Breakdown", side: "bear" });
  });
  it("Triple Top Breakout beats Double Top (precedence)", () => {
    expect(detectPattern([X(0, 5), O(4, 2), X(3, 5), O(4, 2), X(3, 6)]))
      .toEqual({ id: "triple-top", name: "Triple Top Breakout", side: "bull" });
  });
  it("Triple Bottom Breakdown", () => {
    expect(detectPattern([O(6, 2), X(3, 5), O(4, 2), X(3, 5), O(4, 1)]))
      .toEqual({ id: "triple-bottom", name: "Triple Bottom Breakdown", side: "bear" });
  });
  it("Quadruple Top Breakout beats Triple", () => {
    expect(detectPattern([X(0, 5), O(4, 2), X(3, 5), O(4, 2), X(3, 5), O(4, 2), X(3, 6)]))
      .toEqual({ id: "quad-top", name: "Quadruple Top Breakout", side: "bull" });
  });
  it("Quadruple Bottom Breakdown", () => {
    expect(detectPattern([O(6, 2), X(3, 5), O(4, 2), X(3, 5), O(4, 2), X(3, 5), O(4, 1)]))
      .toEqual({ id: "quad-bottom", name: "Quadruple Bottom Breakdown", side: "bear" });
  });
});

describe("detectPattern — guards", () => {
  it("only the RIGHTMOST column counts: a stale breakout two columns back is null", () => {
    expect(detectPattern([X(0, 5), O(4, 2), X(3, 6), O(5, 3), X(4, 5)])).toBeNull();
  });
  it("null on short, empty, non-array, or non-alternating input", () => {
    expect(detectPattern([X(0, 5)])).toBeNull();
    expect(detectPattern([])).toBeNull();
    expect(detectPattern(undefined)).toBeNull();
    expect(detectPattern([X(0, 5), X(3, 6), O(4, 2)])).toBeNull();
    expect(detectPattern([X(0, 5), O(4, 2), { type: "X", bottom: 3, top: NaN }])).toBeNull();
  });
});

describe("detectPattern — advanced patterns", () => {
  it("Ascending Triple Top: rising X tops with rising O bottoms", () => {
    expect(detectPattern([X(0, 4), O(3, 1), X(2, 5), O(4, 2), X(3, 6)]))
      .toEqual({ id: "asc-triple-top", name: "Ascending Triple Top Breakout", side: "bull" });
  });
  it("Descending Triple Bottom: falling O bottoms with falling X tops", () => {
    expect(detectPattern([O(6, 2), X(3, 5), O(4, 1), X(2, 4), O(3, 0)]))
      .toEqual({ id: "desc-triple-bottom", name: "Descending Triple Bottom Breakdown", side: "bear" });
  });
  it("Bullish Catapult: triple-top breakout, pullback holds, double-top breakout — beats Ascending Triple", () => {
    expect(detectPattern([X(0, 5), O(4, 2), X(3, 5), O(4, 2), X(3, 6), O(5, 3), X(4, 7)]))
      .toEqual({ id: "bull-catapult", name: "Bullish Catapult", side: "bull" });
  });
  it("Bearish Catapult (mirror)", () => {
    expect(detectPattern([O(7, 2), X(3, 5), O(4, 2), X(3, 5), O(4, 1), X(2, 4), O(3, 0)]))
      .toEqual({ id: "bear-catapult", name: "Bearish Catapult", side: "bear" });
  });
  it("Bullish Triangle: converging columns then upside breakout", () => {
    expect(detectPattern([X(0, 8), O(7, 2), X(3, 6), O(5, 3), X(4, 7)]))
      .toEqual({ id: "bull-triangle", name: "Bullish Triangle Breakout", side: "bull" });
  });
  it("Bearish Triangle (mirror)", () => {
    expect(detectPattern([O(8, 0), X(1, 6), O(5, 2), X(3, 5), O(4, 1)]))
      .toEqual({ id: "bear-triangle", name: "Bearish Triangle Breakdown", side: "bear" });
  });
  it("Bearish Signal Reversed: long slide, then one X takes out the whole sequence", () => {
    expect(detectPattern([X(0, 9), O(8, 5), X(6, 8), O(7, 4), X(5, 7), O(6, 3), X(4, 10)]))
      .toEqual({ id: "bearish-signal-reversed", name: "Bearish Signal Reversed", side: "bull" });
  });
  it("Bullish Signal Reversed (mirror)", () => {
    expect(detectPattern([O(9, 1), X(2, 4), O(3, 2), X(3, 5), O(4, 3), X(4, 6), O(5, 0)]))
      .toEqual({ id: "bullish-signal-reversed", name: "Bullish Signal Reversed", side: "bear" });
  });
});

describe("detectPattern — poles and traps", () => {
  it("High Pole Warning: 3+ box pole above the prior top, then >50% retrace", () => {
    expect(detectPattern([X(0, 4), O(3, 1), X(2, 9), O(8, 5)]))
      .toEqual({ id: "high-pole", name: "High Pole Warning", side: "bear" });
  });
  it("Low Pole Reversal (mirror)", () => {
    expect(detectPattern([O(9, 5), X(6, 8), O(7, 0), X(1, 4)]))
      .toEqual({ id: "low-pole", name: "Low Pole Reversal", side: "bull" });
  });
  it("Bull Trap: triple-top broken by exactly one box, immediately reversed", () => {
    expect(detectPattern([X(0, 5), O(4, 2), X(3, 5), O(4, 2), X(3, 6), O(5, 3)]))
      .toEqual({ id: "bull-trap", name: "Bull Trap", side: "bear" });
  });
  it("Bear Trap (mirror)", () => {
    expect(detectPattern([O(6, 1), X(2, 4), O(3, 1), X(2, 4), O(3, 0), X(1, 4)]))
      .toEqual({ id: "bear-trap", name: "Bear Trap", side: "bull" });
  });
  it("a 2-box pole with retrace is NOT a High Pole", () => {
    // pole is 9-7=2 boxes above the prior X top → below the real >=3 threshold, so null;
    // pins the threshold itself (a >=2 mutant would wrongly call this a High Pole), and no
    // other pattern fits this fixture either
    expect(detectPattern([X(0, 7), O(7, 5), X(6, 9), O(8, 5)])).toBeNull();
  });
});
