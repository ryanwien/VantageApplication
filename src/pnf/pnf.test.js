import { describe, it, expect } from "vitest";
import { autoBoxSize, buildPnF } from "./pnf.js";

describe("autoBoxSize", () => {
  it("snaps 0.1% of price UP to the ladder", () => {
    expect(autoBoxSize(230)).toBe(0.25);  // 0.23 → 0.25
    expect(autoBoxSize(45)).toBe(0.05);   // 0.045 → 0.05
    expect(autoBoxSize(8)).toBe(0.01);    // 0.008 → 0.01
    expect(autoBoxSize(700)).toBe(1);     // 0.7 → 1
  });
  it("clamps to the ladder ends and survives junk", () => {
    expect(autoBoxSize(1_000_000)).toBe(10); // beyond ladder top → largest rung
    expect(autoBoxSize(0)).toBe(0.01);
    expect(autoBoxSize(NaN)).toBe(0.01);
  });
});

describe("buildPnF", () => {
  it("builds columns with 3-box reversal (close method)", () => {
    // boxes: 10,10,11,13,12,10,13 — up to 13, 3-box reversal down to 10, 3-box reversal up to 13
    const { columns, boxSize } = buildPnF([10.0, 10.2, 11.5, 13.2, 12.8, 10.1, 13.9], { boxSize: 1 });
    expect(boxSize).toBe(1);
    expect(columns).toEqual([
      { type: "X", bottom: 10, top: 13 },
      { type: "O", top: 12, bottom: 10 },   // new column starts one box below the prior extreme
      { type: "X", bottom: 11, top: 13 },
    ]);
  });
  it("first column direction follows the first one-box move (down here)", () => {
    const { columns } = buildPnF([10.0, 10.4, 9.2], { boxSize: 1 });
    expect(columns).toEqual([{ type: "O", top: 10, bottom: 9 }]);
  });
  it("ignores sub-box noise", () => {
    const { columns } = buildPnF([10.0, 10.2, 10.4, 10.9, 11.0], { boxSize: 1 });
    expect(columns).toEqual([{ type: "X", bottom: 10, top: 11 }]);
  });
  it("a tape that never fills one box yields no columns", () => {
    expect(buildPnF([10.0, 10.3, 10.4], { boxSize: 1 }).columns).toEqual([]);
  });
  it("is total on junk input", () => {
    expect(buildPnF([])).toEqual({ columns: [], boxSize: 0 });
    expect(buildPnF([NaN, Infinity])).toEqual({ columns: [], boxSize: 0 });
    expect(buildPnF(null)).toEqual({ columns: [], boxSize: 0 });
    expect(buildPnF([10], { boxSize: 0 })).toEqual({ columns: [], boxSize: 0 });
  });
  it("auto box size comes from the first clean close", () => {
    expect(buildPnF([230, 231, 233], {}).boxSize).toBe(0.25);
  });
  it("float-precision closes land in the right box", () => {
    // 10.3/0.1 = 102.999… without the epsilon guard — must count as box 103
    const { columns } = buildPnF([10.0, 10.3], { boxSize: 0.1 });
    expect(columns[0].top).toBe(103);
  });
});
