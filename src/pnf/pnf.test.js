import { describe, it, expect } from "vitest";
import { autoBoxSize, buildPnF, pnfTargets, visibleWindow, INTRADAY_BOX_PCT } from "./pnf.js";

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
  it("a custom pct rescales the box for intraday tapes", () => {
    expect(autoBoxSize(494.73, 0.00025)).toBe(0.25); // MSFT: 0.124 → 0.25 (vs 0.50 daily)
    expect(autoBoxSize(310, 0.00025)).toBe(0.1);     // 0.0775 → 0.10
    expect(autoBoxSize(8, 0.00025)).toBe(0.01);      // ladder floor still holds
    expect(autoBoxSize(230, NaN)).toBe(0.25);        // junk pct falls back to the 0.1% daily scale
  });
  it("INTRADAY_BOX_PCT pins the live-session scale at 0.025%", () => {
    expect(INTRADAY_BOX_PCT).toBe(0.00025);
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
  it("epsilon guard scales to large price / small box ratios", () => {
    // 223893.86/0.01 = 22389385.999… with old 1e-9 guard would drop to box 22389385
    // because the magnitude makes 1e-9 insignificant. Scaled epsilon must reach up to 22389386.
    const { columns } = buildPnF([223893.80, 223893.86], { boxSize: 0.01 });
    expect(columns).toEqual([{ type: "X", bottom: 22389380, top: 22389386 }]);
  });
  it("drops zero and negative closes", () => {
    const { columns } = buildPnF([10.0, 0, -3, 11.5], { boxSize: 1 });
    expect(columns).toEqual([{ type: "X", bottom: 10, top: 11 }]);
  });
  it("boxPct rescales the auto box; explicit boxSize still wins", () => {
    expect(buildPnF([494.73, 495.2], { boxPct: 0.00025 }).boxSize).toBe(0.25);
    expect(buildPnF([10, 11], { boxSize: 1, boxPct: 0.00025 }).boxSize).toBe(1);
  });
});

describe("pnfTargets", () => {
  it("no columns yet: one box above or below the anchor box starts the chart", () => {
    expect(pnfTargets([10.0, 10.3], { boxSize: 1 })).toEqual({ boxSize: 1, kind: "first", up: 11, down: 10 });
  });
  it("a single point is enough to project first-column targets", () => {
    expect(pnfTargets([230], {})).toEqual({ boxSize: 0.25, kind: "first", up: 230.25, down: 230 });
  });
  it("rising X column: only a 3-box reversal down prints the next column", () => {
    // top box 13 → reversal needs box ≤ 10 → price under 11
    expect(pnfTargets([10.0, 13.5], { boxSize: 1 })).toEqual({ boxSize: 1, kind: "reversal", up: null, down: 11 });
  });
  it("falling O column: a 3-box reversal up prints the next column", () => {
    // bottom box 9 → reversal needs box ≥ 12 → price at or above 12
    expect(pnfTargets([13.0, 9.5], { boxSize: 1 })).toEqual({ boxSize: 1, kind: "reversal", up: 12, down: null });
  });
  it("targets always track the RIGHTMOST column", () => {
    // X to 13, reversal O down to bottom 10 → next X prints at 10+3 = 13
    expect(pnfTargets([10.0, 13.2, 10.1], { boxSize: 1 })).toEqual({ boxSize: 1, kind: "reversal", up: 13, down: null });
  });
  it("is null on junk", () => {
    expect(pnfTargets([])).toBeNull();
    expect(pnfTargets(null)).toBeNull();
    expect(pnfTargets([NaN, -4])).toBeNull();
  });
});

describe("visibleWindow", () => {
  it("small charts keep their full extent", () => {
    expect(visibleWindow([{ type: "X", bottom: 10, top: 20 }], 30)).toEqual({ top: 20, bot: 10 });
  });
  it("union of columns that fits the cap is kept whole", () => {
    const cols = [{ type: "X", bottom: 10, top: 16 }, { type: "O", top: 15, bottom: 8 }];
    expect(visibleWindow(cols, 30)).toEqual({ top: 16, bot: 8 });
  });
  it("an oversized older column is clipped out, recent columns stay whole", () => {
    // gap column spans 0..40; the recent column only 30..35. Cap 20 → window hugs recency.
    const cols = [{ type: "X", bottom: 0, top: 40 }, { type: "O", top: 35, bottom: 30 }];
    expect(visibleWindow(cols, 20)).toEqual({ top: 35, bot: 30 });
  });
  it("a giant LAST X column anchors the window at its growing top", () => {
    expect(visibleWindow([{ type: "X", bottom: 0, top: 100 }], 20)).toEqual({ top: 100, bot: 81 });
  });
  it("a giant LAST O column anchors the window at its growing bottom", () => {
    expect(visibleWindow([{ type: "O", top: 100, bottom: 0 }], 20)).toEqual({ top: 19, bot: 0 });
  });
  it("window growth stops at the first older column that would bust the cap", () => {
    // newest → oldest: C fits, B fits, A would bust → A excluded even though D after it would fit
    const cols = [
      { type: "X", bottom: 12, top: 13 },  // D (oldest)
      { type: "O", top: 40, bottom: 0 },   // A (busts)
      { type: "X", bottom: 10, top: 14 },  // B
      { type: "O", top: 13, bottom: 9 },   // C (newest)
    ];
    expect(visibleWindow(cols, 10)).toEqual({ top: 14, bot: 9 });
  });
  it("is null on empty", () => {
    expect(visibleWindow([], 20)).toBeNull();
  });
});
