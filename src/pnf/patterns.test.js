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
