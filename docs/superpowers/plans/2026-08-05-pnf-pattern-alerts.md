# Point & Figure Charts + Pattern Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Point & Figure chart mode in Vantage's main chart panel with an 18-pattern StockCharts-style detector, plus watchlist pattern scanning wired into the existing anchor break-in alerts and a P&F SIGNALS rail panel.

**Architecture:** Two new pure modules (`src/pnf/pnf.js` engine, `src/pnf/patterns.js` detector) hold every piece of logic that can be wrong, pinned by Vitest. `React.jsx` only feeds the session tape in and renders what comes out: a LINE / P&F header toggle, an inline-SVG chart, a scanner effect reusing `pushBreaking`, and one new rail panel.

**Tech Stack:** React 18 (single-file `React.jsx` app), Vitest 2 (`npm test` = `vitest run`), Vite 5. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-05-pnf-pattern-alerts-design.md`

## Global Constraints

- Branch: `pnf-pattern-alerts` (already checked out). Commit after every task.
- Pure modules must be total: malformed input returns `{ columns: [], boxSize: 0 }` / `null`, never a throw.
- Pattern **names are never translated**; the six UI strings added to `I18N` are (exact translations given in Tasks 6 and 8).
- Colors always via the pref-aware `dirColorN(1)` / `dirColorN(-1)` (color-blind safe), never raw `C.up`/`C.down`, in all new UI.
- `React.jsx` is ~9k lines; every modification below names an exact anchor line/snippet. Verify the anchor before editing — line numbers can drift a few lines as earlier tasks land.
- Run tests with `npm test` (all) or `npx vitest run src/pnf/pnf.test.js` (one file). Verify the app builds with `npm run build`.

---

### Task 1: P&F engine — `src/pnf/pnf.js`

**Files:**
- Create: `src/pnf/pnf.js`
- Test: `src/pnf/pnf.test.js`

**Interfaces:**
- Consumes: nothing (pure, standalone).
- Produces: `autoBoxSize(price: number) -> number` and
  `buildPnF(closes: number[], opts?: { boxSize?: number|'auto', reversal?: number }) -> { columns: Array<{type:'X'|'O', top:number, bottom:number}>, boxSize: number }`.
  `top`/`bottom` are **integer box indices** (box *i* spans prices `[i·box, (i+1)·box)`), both inclusive. Columns strictly alternate X/O. Tasks 2–4 and 6–7 rely on exactly these names.

- [ ] **Step 1: Write the failing tests**

```js
// src/pnf/pnf.test.js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/pnf/pnf.test.js`
Expected: FAIL — cannot resolve `./pnf.js`.

- [ ] **Step 3: Write the implementation**

```js
// src/pnf/pnf.js
// Point & Figure engine. Pure — no React, no I/O — so it can be unit-tested
// like src/settings/ and src/datahub/. Consumes a list of session closes and
// folds them into X/O columns (close method, N-box reversal).
//
// Box grid: box i spans prices [i*box, (i+1)*box). Columns carry inclusive
// integer box indices {top, bottom} and strictly alternate X (up) / O (down).

const LADDER = [0.01, 0.02, 0.05, 0.10, 0.25, 0.50, 1, 2, 5, 10];

// 0.1% of price, snapped UP to a clean increment. StockCharts' daily traditional
// scale would give one column from a single intraday session; this keeps every
// symbol at a readable 10–40 columns.
export function autoBoxSize(price) {
  if (!Number.isFinite(price) || price <= 0) return LADDER[0];
  const raw = price * 0.001;
  return LADDER.find(b => b >= raw) ?? LADDER[LADDER.length - 1];
}

export function buildPnF(closes, { boxSize = "auto", reversal = 3 } = {}) {
  const clean = (Array.isArray(closes) ? closes : []).filter(Number.isFinite);
  if (!clean.length) return { columns: [], boxSize: 0 };
  const box = boxSize === "auto" ? autoBoxSize(clean[0]) : boxSize;
  if (!Number.isFinite(box) || box <= 0 || !Number.isFinite(reversal) || reversal < 1) {
    return { columns: [], boxSize: 0 };
  }
  // epsilon guards float division (10.3/0.1 = 102.999…) from dropping a box
  const toBox = (p) => Math.floor(p / box + 1e-9);
  const columns = [];
  let dir = 0;                // 0 until the first one-box move decides direction
  let cur = null;
  const anchor = toBox(clean[0]);
  for (const p of clean.slice(1)) {
    const b = toBox(p);
    if (dir === 0) {
      if (b > anchor) { dir = 1; cur = { type: "X", bottom: anchor, top: b }; columns.push(cur); }
      else if (b < anchor) { dir = -1; cur = { type: "O", top: anchor, bottom: b }; columns.push(cur); }
    } else if (dir === 1) {
      if (b > cur.top) cur.top = b;
      else if (cur.top - b >= reversal) {
        cur = { type: "O", top: cur.top - 1, bottom: b };  // new column starts one box below the extreme
        columns.push(cur); dir = -1;
      }
    } else {
      if (b < cur.bottom) cur.bottom = b;
      else if (b - cur.bottom >= reversal) {
        cur = { type: "X", bottom: cur.bottom + 1, top: b };
        columns.push(cur); dir = 1;
      }
    }
  }
  return { columns, boxSize: box };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/pnf/pnf.test.js`
Expected: PASS (all 9).

- [ ] **Step 5: Run the whole suite, then commit**

Run: `npm test` — all existing suites still green.

```powershell
git add src/pnf/pnf.js src/pnf/pnf.test.js
git commit -m "feat(pnf): P&F engine - box grid, 3-box reversal column builder"
```

---

### Task 2: Detector core — multi-level breakouts (`src/pnf/patterns.js`)

**Files:**
- Create: `src/pnf/patterns.js`
- Test: `src/pnf/patterns.test.js`

**Interfaces:**
- Consumes: `columns` in the exact shape Task 1 produces.
- Produces: `detectPattern(columns) -> { id: string, name: string, side: 'bull'|'bear' } | null`. Tasks 3–4 extend the same file's `CATALOG`; Tasks 6–7 call `detectPattern`.

- [ ] **Step 1: Write the failing tests**

```js
// src/pnf/patterns.test.js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/pnf/patterns.test.js`
Expected: FAIL — cannot resolve `./patterns.js`.

- [ ] **Step 3: Write the implementation**

```js
// src/pnf/patterns.js
// P&F pattern detection over buildPnF columns. Pure — no React, no I/O.
// Every pattern is evaluated at the RIGHTMOST column only: it is "active" while
// the current column still satisfies it. detectPattern returns the single most
// specific match (fixed precedence order in CATALOG) or null.
//
// Columns strictly alternate X/O, so the previous same-type column is 2 back,
// the one before that 4 back, etc. c(cols, 0) is the last column.

const c = (cols, back) => cols[cols.length - 1 - back];

const validCol = (k) =>
  k && (k.type === "X" || k.type === "O") &&
  Number.isInteger(k.top) && Number.isInteger(k.bottom) && k.top >= k.bottom;

function alternates(cols) {
  for (let i = 0; i < cols.length; i++) {
    if (!validCol(cols[i])) return false;
    if (i > 0 && cols[i].type === cols[i - 1].type) return false;
  }
  return true;
}

// ---- multi-level breakouts ----
const doubleTop = (k) => {
  const a = c(k, 0), p = c(k, 2);
  return a.type === "X" && !!p && a.top > p.top;
};
const doubleBottom = (k) => {
  const a = c(k, 0), p = c(k, 2);
  return a.type === "O" && !!p && a.bottom < p.bottom;
};
const tripleTop = (k) => {
  const a = c(k, 0), p1 = c(k, 2), p2 = c(k, 4);
  return a.type === "X" && !!p2 && p1.top === p2.top && a.top > p1.top;
};
const tripleBottom = (k) => {
  const a = c(k, 0), p1 = c(k, 2), p2 = c(k, 4);
  return a.type === "O" && !!p2 && p1.bottom === p2.bottom && a.bottom < p1.bottom;
};
const quadTop = (k) => {
  const a = c(k, 0), p1 = c(k, 2), p2 = c(k, 4), p3 = c(k, 6);
  return a.type === "X" && !!p3 && p1.top === p2.top && p2.top === p3.top && a.top > p1.top;
};
const quadBottom = (k) => {
  const a = c(k, 0), p1 = c(k, 2), p2 = c(k, 4), p3 = c(k, 6);
  return a.type === "O" && !!p3 && p1.bottom === p2.bottom && p2.bottom === p3.bottom && a.bottom < p1.bottom;
};

// precedence: most specific first — extended by Tasks 3 and 4
const CATALOG = [
  ["quad-top", "Quadruple Top Breakout", "bull", quadTop],
  ["quad-bottom", "Quadruple Bottom Breakdown", "bear", quadBottom],
  ["triple-top", "Triple Top Breakout", "bull", tripleTop],
  ["triple-bottom", "Triple Bottom Breakdown", "bear", tripleBottom],
  ["double-top", "Double Top Breakout", "bull", doubleTop],
  ["double-bottom", "Double Bottom Breakdown", "bear", doubleBottom],
];

export function detectPattern(columns) {
  if (!Array.isArray(columns) || columns.length < 3 || !alternates(columns)) return null;
  for (const [id, name, side, match] of CATALOG) {
    if (match(columns)) return { id, name, side };
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/pnf/patterns.test.js`
Expected: PASS (all 8).

- [ ] **Step 5: Commit**

```powershell
git add src/pnf/patterns.js src/pnf/patterns.test.js
git commit -m "feat(pnf): pattern detector core - double/triple/quadruple breakouts"
```

---

### Task 3: Detector — advanced patterns (ascending/descending, catapults, triangles, signal-reversed)

**Files:**
- Modify: `src/pnf/patterns.js` (add predicates + CATALOG rows)
- Test: `src/pnf/patterns.test.js` (append a describe block)

**Interfaces:**
- Consumes/Produces: same `detectPattern` contract as Task 2; CATALOG grows to 14 entries.

- [ ] **Step 1: Write the failing tests (append to `src/pnf/patterns.test.js`)**

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/pnf/patterns.test.js`
Expected: the 8 new tests FAIL (they currently resolve to less-specific patterns or null).

- [ ] **Step 3: Add the predicates and CATALOG rows to `src/pnf/patterns.js`**

Add below the multi-level predicates:

```js
// ---- advanced patterns ----
const ascTripleTop = (k) => {
  const a = c(k, 0), x1 = c(k, 2), x2 = c(k, 4), o1 = c(k, 1), o2 = c(k, 3);
  return a.type === "X" && !!x2 && a.top > x1.top && x1.top > x2.top && o1.bottom > o2.bottom;
};
const descTripleBottom = (k) => {
  const a = c(k, 0), o1 = c(k, 2), o2 = c(k, 4), x1 = c(k, 1), x2 = c(k, 3);
  return a.type === "O" && !!o2 && a.bottom < o1.bottom && o1.bottom < o2.bottom && x1.top < x2.top;
};
const bullCatapult = (k) => {
  const a = c(k, 0), x1 = c(k, 2), x2 = c(k, 4), x3 = c(k, 6), o1 = c(k, 1), o2 = c(k, 3);
  return a.type === "X" && !!x3 &&
    x2.top === x3.top && x1.top > x2.top &&   // the triple top, broken by x1
    o1.bottom > o2.bottom &&                  // pullback holds above the prior low
    a.top > x1.top;                           // and now a double-top breakout
};
const bearCatapult = (k) => {
  const a = c(k, 0), o1 = c(k, 2), o2 = c(k, 4), o3 = c(k, 6), x1 = c(k, 1), x2 = c(k, 3);
  return a.type === "O" && !!o3 &&
    o2.bottom === o3.bottom && o1.bottom < o2.bottom &&
    x1.top < x2.top &&
    a.bottom < o1.bottom;
};
const bullTriangle = (k) => {
  const a = c(k, 0), x1 = c(k, 2), x2 = c(k, 4), o1 = c(k, 1), o2 = c(k, 3);
  return a.type === "X" && !!x2 &&
    x1.top < x2.top && o1.bottom > o2.bottom &&  // converging: falling tops, rising bottoms
    a.top > x1.top;                              // upside breakout
};
const bearTriangle = (k) => {
  const a = c(k, 0), o1 = c(k, 2), o2 = c(k, 4), x1 = c(k, 1), x2 = c(k, 3);
  return a.type === "O" && !!o2 &&
    x1.top < x2.top && o1.bottom > o2.bottom &&
    a.bottom < o1.bottom;                        // downside breakdown
};
const bearishSignalReversed = (k) => {
  const a = c(k, 0), x1 = c(k, 2), x2 = c(k, 4), x3 = c(k, 6), o1 = c(k, 1), o2 = c(k, 3), o3 = c(k, 5);
  return a.type === "X" && !!x3 &&
    x1.top < x2.top && x2.top < x3.top &&           // falling X tops
    o1.bottom < o2.bottom && o2.bottom < o3.bottom && // falling O bottoms
    a.top > x3.top;                                  // one X takes out the whole slide
};
const bullishSignalReversed = (k) => {
  const a = c(k, 0), o1 = c(k, 2), o2 = c(k, 4), o3 = c(k, 6), x1 = c(k, 1), x2 = c(k, 3), x3 = c(k, 5);
  return a.type === "O" && !!o3 &&
    o1.bottom > o2.bottom && o2.bottom > o3.bottom &&
    x1.top > x2.top && x2.top > x3.top &&
    a.bottom < o3.bottom;
};
```

Replace the whole `CATALOG` with (order matters — most specific first):

```js
const CATALOG = [
  ["bull-catapult", "Bullish Catapult", "bull", bullCatapult],
  ["bear-catapult", "Bearish Catapult", "bear", bearCatapult],
  ["bull-triangle", "Bullish Triangle Breakout", "bull", bullTriangle],
  ["bear-triangle", "Bearish Triangle Breakdown", "bear", bearTriangle],
  ["bearish-signal-reversed", "Bearish Signal Reversed", "bull", bearishSignalReversed],
  ["bullish-signal-reversed", "Bullish Signal Reversed", "bear", bullishSignalReversed],
  ["asc-triple-top", "Ascending Triple Top Breakout", "bull", ascTripleTop],
  ["desc-triple-bottom", "Descending Triple Bottom Breakdown", "bear", descTripleBottom],
  ["quad-top", "Quadruple Top Breakout", "bull", quadTop],
  ["quad-bottom", "Quadruple Bottom Breakdown", "bear", quadBottom],
  ["triple-top", "Triple Top Breakout", "bull", tripleTop],
  ["triple-bottom", "Triple Bottom Breakdown", "bear", tripleBottom],
  ["double-top", "Double Top Breakout", "bull", doubleTop],
  ["double-bottom", "Double Bottom Breakdown", "bear", doubleBottom],
];
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run src/pnf/patterns.test.js`
Expected: PASS (16) — including Task 2's precedence tests, still green.

- [ ] **Step 5: Commit**

```powershell
git add src/pnf/patterns.js src/pnf/patterns.test.js
git commit -m "feat(pnf): advanced patterns - catapults, triangles, signal-reversed, ascending/descending"
```

---

### Task 4: Detector — poles and traps, final precedence

**Files:**
- Modify: `src/pnf/patterns.js`
- Test: `src/pnf/patterns.test.js` (append)

**Interfaces:** same contract; CATALOG reaches its final 18 entries. **Final precedence order:** traps → catapults → triangles → signal-reversed → poles → ascending/descending → quadruple → triple → double.

- [ ] **Step 1: Write the failing tests (append)**

```js
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
  it("a modest 2-box pole with retrace is NOT a High Pole", () => {
    // pole is only 9-8=1 box above the prior X top → not a pole, and no other pattern fits
    expect(detectPattern([X(0, 8), O(7, 5), X(6, 9), O(8, 5)])).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/pnf/patterns.test.js`
Expected: the 5 new tests FAIL.

- [ ] **Step 3: Add predicates and finalize CATALOG**

Add below the advanced predicates:

```js
// ---- reversal warnings and traps ----
const highPole = (k) => {
  const a = c(k, 0), x = c(k, 1), px = c(k, 3);
  if (!(a.type === "O" && !!px && x.top - px.top >= 3)) return false;
  const height = x.top - x.bottom;
  return height > 0 && (x.top - a.bottom) * 2 > height;   // retraced more than half the pole
};
const lowPole = (k) => {
  const a = c(k, 0), o = c(k, 1), po = c(k, 3);
  if (!(a.type === "X" && !!po && po.bottom - o.bottom >= 3)) return false;
  const height = o.top - o.bottom;
  return height > 0 && (a.top - o.bottom) * 2 > height;
};
const bullTrap = (k) => {
  const a = c(k, 0), x1 = c(k, 1), x2 = c(k, 3), x3 = c(k, 5);
  return a.type === "O" && !!x3 && x2.top === x3.top && x1.top === x2.top + 1;
};
const bearTrap = (k) => {
  const a = c(k, 0), o1 = c(k, 1), o2 = c(k, 3), o3 = c(k, 5);
  return a.type === "X" && !!o3 && o2.bottom === o3.bottom && o1.bottom === o2.bottom - 1;
};
```

Replace `CATALOG` with the final order:

```js
const CATALOG = [
  ["bull-trap", "Bull Trap", "bear", bullTrap],
  ["bear-trap", "Bear Trap", "bull", bearTrap],
  ["bull-catapult", "Bullish Catapult", "bull", bullCatapult],
  ["bear-catapult", "Bearish Catapult", "bear", bearCatapult],
  ["bull-triangle", "Bullish Triangle Breakout", "bull", bullTriangle],
  ["bear-triangle", "Bearish Triangle Breakdown", "bear", bearTriangle],
  ["bearish-signal-reversed", "Bearish Signal Reversed", "bull", bearishSignalReversed],
  ["bullish-signal-reversed", "Bullish Signal Reversed", "bear", bullishSignalReversed],
  ["high-pole", "High Pole Warning", "bear", highPole],
  ["low-pole", "Low Pole Reversal", "bull", lowPole],
  ["asc-triple-top", "Ascending Triple Top Breakout", "bull", ascTripleTop],
  ["desc-triple-bottom", "Descending Triple Bottom Breakdown", "bear", descTripleBottom],
  ["quad-top", "Quadruple Top Breakout", "bull", quadTop],
  ["quad-bottom", "Quadruple Bottom Breakdown", "bear", quadBottom],
  ["triple-top", "Triple Top Breakout", "bull", tripleTop],
  ["triple-bottom", "Triple Bottom Breakdown", "bear", tripleBottom],
  ["double-top", "Double Top Breakout", "bull", doubleTop],
  ["double-bottom", "Double Bottom Breakdown", "bear", doubleBottom],
];
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — all pnf tests (21 in patterns, 9 in pnf) plus every pre-existing suite.

- [ ] **Step 5: Commit**

```powershell
git add src/pnf/patterns.js src/pnf/patterns.test.js
git commit -m "feat(pnf): poles and traps complete the 18-pattern catalog"
```

---

### Task 5: `pnfPatterns` notification preference

**Files:**
- Modify: `src/settings/preferences.js` (line 8, `DEFAULT_PREFS.notify`)
- Test: `src/settings/preferences.test.js` (append)

**Interfaces:**
- Produces: `DEFAULT_PREFS.notify.pnfPatterns === true`; `notifyEnabled(prefs, "pnfPatterns")` works. Task 7 gates announcements on it. `loadPrefs` already spreads `DEFAULT_PREFS.notify` under stored values, so existing users pick the key up with no migration code.

- [ ] **Step 1: Write the failing test (append to `src/settings/preferences.test.js`)**

```js
describe("pnfPatterns notify pref", () => {
  it("defaults on, honors an explicit stored false, works through notifyEnabled", () => {
    expect(loadPrefs(null).notify.pnfPatterns).toBe(true);
    expect(loadPrefs(JSON.stringify({ notify: { pnfPatterns: false } })).notify.pnfPatterns).toBe(false);
    expect(notifyEnabled(loadPrefs(null), "pnfPatterns")).toBe(true);
    expect(notifyEnabled(loadPrefs(JSON.stringify({ notify: { pnfPatterns: false } })), "pnfPatterns")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify it fails**

Run: `npx vitest run src/settings/preferences.test.js`
Expected: FAIL — `pnfPatterns` is `undefined`.

- [ ] **Step 3: Add the default**

In `src/settings/preferences.js` change line 8:

```js
  notify: { priceTriggers: true, breakingNews: true, pnfPatterns: true },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/settings/preferences.test.js`
Expected: PASS — including all pre-existing loadPrefs tests (they compare against `DEFAULT_PREFS.notify`, which now carries the key on both sides).

- [ ] **Step 5: Commit**

```powershell
git add src/settings/preferences.js src/settings/preferences.test.js
git commit -m "feat(settings): pnfPatterns notify preference, default on"
```

---

### Task 6: Chart UI — LINE / P&F toggle, SVG chart, pattern badge

**Files:**
- Modify: `React.jsx` — imports (after line 8), a new `PnFChart` component (insert immediately above the `MarketDashboard` section divider at line ~3454), state + memos (next to the `chartData` memo at ~4782), chart header (~7666), chart container (~7672), caption (~7715), and five `I18N` keys per language.

**Interfaces:**
- Consumes: `buildPnF`, `detectPattern` (Tasks 1–4); existing `chartData`, `dirColorN`, `fmt`, `C`, `MONO`, `t`.
- Produces: `chartMode` state (`'line'|'pnf'`, localStorage `"tape-chartmode"`), memos `pnf` / `pnfPattern`, and component `PnFChart({ columns, boxSize, up, down })`. Task 7 reuses nothing from here (it recomputes per symbol), but the imports added here serve it too.

- [ ] **Step 1: Add imports**

After `React.jsx` line 8 (the `catalog.js` import):

```js
import { buildPnF } from "./src/pnf/pnf.js";
import { detectPattern } from "./src/pnf/patterns.js";
```

- [ ] **Step 2: Add the `PnFChart` component**

Insert immediately above the `// ====…` divider that precedes `function MarketDashboard` (line ~3454):

```jsx
// ---------- Point & Figure chart (SVG) ----------
// Pure presentational: columns/boxSize come from src/pnf/pnf.js. Renders the last
// 48 columns as an X/O box grid with price labels in a right gutter.
function PnFChart({ columns, boxSize, up, down }) {
  const CELL = 14, GUTTER = 56, MAXC = 48;
  const cols = columns.slice(-MAXC);
  const top = Math.max(...cols.map(k => k.top));
  const bot = Math.min(...cols.map(k => k.bottom));
  const rows = top - bot + 1;
  const w = cols.length * CELL + GUTTER, h = rows * CELL;
  const py = (bi) => (top - bi) * CELL;
  const labelEvery = Math.max(1, Math.ceil(rows / 8));
  const kids = [];
  for (let ci = 0; ci <= cols.length; ci++) {
    kids.push(<line key={`v${ci}`} x1={ci * CELL} y1={0} x2={ci * CELL} y2={h} stroke={C.grid} strokeWidth="0.5" />);
  }
  for (let bi = bot; bi <= top + 1; bi++) {
    const y = (top - bi + 1) * CELL;   // bottom edge of box bi sits at price bi*boxSize
    kids.push(<line key={`h${bi}`} x1={0} y1={y} x2={cols.length * CELL} y2={y} stroke={C.grid} strokeWidth="0.5" />);
    if (bi % labelEvery === 0) {
      kids.push(<text key={`t${bi}`} x={cols.length * CELL + 6} y={y + 3.5} fill={C.faint} fontSize="9" fontFamily={MONO}>{fmt(bi * boxSize)}</text>);
    }
  }
  cols.forEach((col, ci) => {
    const x = ci * CELL;
    for (let bi = col.bottom; bi <= col.top; bi++) {
      const y = py(bi);
      if (col.type === "X") {
        kids.push(<line key={`x${ci}-${bi}a`} x1={x + 3.5} y1={y + 3.5} x2={x + CELL - 3.5} y2={y + CELL - 3.5} stroke={up} strokeWidth="1.6" />);
        kids.push(<line key={`x${ci}-${bi}b`} x1={x + CELL - 3.5} y1={y + 3.5} x2={x + 3.5} y2={y + CELL - 3.5} stroke={up} strokeWidth="1.6" />);
      } else {
        kids.push(<circle key={`o${ci}-${bi}`} cx={x + CELL / 2} cy={y + CELL / 2} r={CELL / 2 - 3.5} fill="none" stroke={down} strokeWidth="1.6" />);
      }
    }
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", display: "block" }}>
      {kids}
    </svg>
  );
}
```

- [ ] **Step 3: Add state + memos**

Directly above the `chartData` memo (line ~4782), inside `MarketDashboard`:

```jsx
// ---- chart mode: classic line tape vs Point & Figure ----
const [chartMode, setChartMode] = useState(() => {
  try { return window.localStorage.getItem("tape-chartmode") === "pnf" ? "pnf" : "line"; } catch { return "line"; }
});
useEffect(() => { try { window.localStorage.setItem("tape-chartmode", chartMode); } catch { /* private */ } }, [chartMode]);
```

Directly below the `chartData` memo:

```jsx
const pnf = useMemo(() => (chartMode === "pnf" ? buildPnF(chartData.map(d => d.price)) : null), [chartMode, chartData]);
const pnfPattern = useMemo(() => (pnf ? detectPattern(pnf.columns) : null), [pnf]);
```

- [ ] **Step 4: Add the header toggle**

At line ~7666 the header row ends with the full-chart button, which carries `marginLeft: "auto"`. Insert this toggle group **before** that button and move `marginLeft: "auto"` onto the group (delete it from the button's style):

```jsx
<div style={{ marginLeft: "auto", display: "flex", border: `1px solid ${C.panelEdge}`, borderRadius: 4, overflow: "hidden" }}>
  {[["line", t("LINE")], ["pnf", "P&F"]].map(([m, label]) => (
    <button key={m} onClick={() => setChartMode(m)}
      title={m === "pnf" ? "Point & Figure — X/O columns, 3-box reversal" : "Line chart of the session tape"}
      style={{ background: chartMode === m ? "#171E2C" : "transparent", border: "none", color: chartMode === m ? C.amber : C.muted, fontFamily: MONO, fontSize: 11, padding: "5px 10px", cursor: "pointer" }}>
      {label}
    </button>
  ))}
</div>
```

- [ ] **Step 5: Render the P&F branch in the chart container**

The container at line ~7672 is `<div style={{ height: 300, marginTop: 10 }}>` wrapping `{chartData.length > 1 ? (<ResponsiveContainer…) : (…empty state…)}`. Change the container style to `{{ height: 300, marginTop: 10, position: "relative" }}` and wrap the existing ternary so P&F mode takes over:

```jsx
{chartMode === "pnf" ? (
  pnf && pnf.columns.length >= 2 ? (
    <>
      <PnFChart columns={pnf.columns} boxSize={pnf.boxSize} up={dirColorN(1)} down={dirColorN(-1)} />
      {pnfPattern && (
        <div style={{ position: "absolute", top: 8, left: 10, fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: pnfPattern.side === "bull" ? dirColorN(1) : dirColorN(-1), background: "rgba(13,18,28,0.85)", border: `1px solid ${C.panelEdge}`, borderRadius: 4, padding: "4px 8px" }}>
          {pnfPattern.name}
        </div>
      )}
    </>
  ) : (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.faint, fontFamily: MONO, fontSize: 12, textAlign: "center", padding: "0 24px" }}>
      {t("not enough movement for a P&F column yet")}
    </div>
  )
) : chartData.length > 1 ? (
  …existing ResponsiveContainer branch, unchanged…
) : (
  …existing empty-state branch, unchanged…
)}
```

- [ ] **Step 6: Add the caption**

Directly above the existing `LIVE · quotes via Finnhub…` footer div (line ~7715):

```jsx
{chartMode === "pnf" && pnf && pnf.columns.length >= 2 && (
  <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint, marginTop: 6 }}>
    box {fmt(pnf.boxSize)} · {t("3-box reversal · this session")}
  </div>
)}
```

- [ ] **Step 7: Add I18N keys (5 languages)**

In each language dict inside `I18N` (es ~line 124, fr ~267, de ~410, pt ~553, it ~695 — add near the other chart strings like `"full chart"`), add three keys:

```js
// es
"LINE": "LÍNEA",
"not enough movement for a P&F column yet": "aún no hay suficiente movimiento para una columna P&F",
"3-box reversal · this session": "reversión de 3 casillas · esta sesión",
// fr
"LINE": "LIGNE",
"not enough movement for a P&F column yet": "pas encore assez de mouvement pour une colonne P&F",
"3-box reversal · this session": "retournement de 3 cases · cette séance",
// de
"LINE": "LINIE",
"not enough movement for a P&F column yet": "noch nicht genug Bewegung für eine P&F-Spalte",
"3-box reversal · this session": "3-Box-Umkehr · diese Sitzung",
// pt
"LINE": "LINHA",
"not enough movement for a P&F column yet": "ainda não há movimento suficiente para uma coluna P&F",
"3-box reversal · this session": "reversão de 3 caixas · esta sessão",
// it
"LINE": "LINEA",
"not enough movement for a P&F column yet": "movimento ancora insufficiente per una colonna P&F",
"3-box reversal · this session": "inversione a 3 caselle · questa sessione",
```

- [ ] **Step 8: Verify**

Run: `npm test` — all suites green.
Run: `npm run build` — clean Vite build, no JSX errors.
Run: `npm run dev`, open the app in a browser, then confirm: (1) the LINE / P&F toggle renders in the chart header; (2) P&F mode shows X/O columns with price labels for the default demo symbol; (3) a pattern badge appears for at least one demo symbol when you click through the watchlist (the seeded demo tapes are deterministic, so this is reproducible); (4) the mode survives a page reload; (5) switching back to LINE restores the area chart.

- [ ] **Step 9: Commit**

```powershell
git add React.jsx
git commit -m "feat(chart): Point & Figure mode - SVG X/O chart with pattern badge"
```

---

### Task 7: Watchlist pattern scanner + anchor announcements

**Files:**
- Modify: `React.jsx` — insert one block directly after the price-alerts effect (the `}, [priceAlerts, getRow, firePriceAlert, prefs.notify.priceTriggers]);` line at ~5141, before the `// ---- market events` comment).

**Interfaces:**
- Consumes: `buildPnF` / `detectPattern` (imported in Task 6), `liveTape`, `demoMkt`, `live`, `selected`, `watchlist`, `notifyEnabled`, `prefs`, `pushBreaking`.
- Produces: `pnfSignals` state (`{ [sym]: { id, name, side } }`) and `getCloses(sym) -> number[]`. Task 8 renders `pnfSignals`.

- [ ] **Step 1: Insert the scanner block**

```jsx
// ---- P&F pattern scan: when a watchlist symbol prints a NEW pattern, the anchor breaks in ----
// The scan always runs (it feeds the P&F SIGNALS rail); prefs.notify.pnfPatterns gates only
// the on-air announcement. pnfSeenRef: undefined = never scanned (seed silently on the first
// sweep so a page load doesn't announce every pattern already on the board), null = scanned,
// no pattern. At most one break-in per sweep so speech never piles up.
const [pnfSignals, setPnfSignals] = useState({});   // sym -> { id, name, side }
const pnfSeenRef = useRef({});
const getCloses = useCallback((sym) => {
  if (live) return (liveTape[sym] || []).map(p => p.price);
  const st = demoMkt[sym];
  return st ? st.bars.slice(0, st.cursor + 1).map(b => b.price) : [];
}, [live, liveTape, demoMkt]);
useEffect(() => {
  const check = () => {
    const syms = [...new Set([selected, ...watchlist])];
    const next = {};
    let announced = false;
    for (const sym of syms) {
      const pat = detectPattern(buildPnF(getCloses(sym)).columns);
      if (pat) next[sym] = pat;
      const prev = pnfSeenRef.current[sym];
      if (pat && prev !== undefined && pat.id !== prev && !announced && notifyEnabled(prefs, "pnfPatterns")) {
        announced = true;
        pushBreaking(`${sym} just printed a ${pat.name} on the point-and-figure chart`, "P&F scan");
      }
      pnfSeenRef.current[sym] = pat ? pat.id : null;
    }
    setPnfSignals(s => {
      const keys = Object.keys(s);
      if (keys.length === Object.keys(next).length && keys.every(k => next[k] && next[k].id === s[k].id)) return s;
      return next;
    });
  };
  const iv = setInterval(check, 3000); check();
  return () => clearInterval(iv);
}, [selected, watchlist, getCloses, prefs, pushBreaking]);
```

- [ ] **Step 2: Verify**

Run: `npm run build` — clean.
Run: `npm run dev`, open the app in demo mode with the default watchlist and let it run ~1 minute. Expected: as demo tapes tick forward, when a symbol prints a new pattern the breaking banner appears with `source: P&F scan`, the sting plays, and the anchor reads the line. Toggle nothing yet — the settings checkbox arrives in Task 8; confirm the default-on pref announces.

- [ ] **Step 3: Commit**

```powershell
git add React.jsx
git commit -m "feat(pnf): watchlist pattern scanner with anchor break-in announcements"
```

---

### Task 8: P&F SIGNALS rail panel + settings toggles + remaining i18n

**Files:**
- Modify: `React.jsx` — panels state (line ~3799), rail panel (insert directly after the price-alerts rail block's closing `)}` at ~7886), settings PANELS list (~8192), settings notify list (~8200), and three more `I18N` keys per language.

**Interfaces:**
- Consumes: `pnfSignals` (Task 7), `panels`/`togglePanel`, `prefs`/`setPref`, `dirColorN`, `t`.
- Produces: `panels.pnf`; the settings checkboxes for `panels.pnf` and `prefs.notify.pnfPatterns`.

- [ ] **Step 1: Add the panel key**

Line ~3799, add `pnf: true`:

```jsx
const [panels, setPanels] = useState({ tape: true, watchlist: true, movers: true, news: true, calendar: true, portfolio: true, pnf: true });
```

- [ ] **Step 2: Render the rail panel**

Insert directly after the price-alerts rail block ends (`)}` at line ~7886), matching its styling:

```jsx
{/* --- P&F pattern signals (right rail, only when a pattern is on the board) --- */}
{panels.pnf && Object.keys(pnfSignals).length > 0 && (
  <div style={{ background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: 6, overflow: "hidden" }}>
    <div style={{ padding: "9px 12px", fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: C.muted, borderBottom: `1px solid ${C.panelEdge}` }}>✕○ {t("P&F SIGNALS")}</div>
    {Object.entries(pnfSignals).map(([sym, p]) => (
      <div key={sym} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderTop: `1px solid ${C.grid}` }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.text }}>{sym}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, marginLeft: "auto", color: p.side === "bull" ? dirColorN(1) : dirColorN(-1) }}>{p.name}</span>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 3: Add the settings checkboxes**

PANELS list (~8192) — append the pair to the array literal:

```jsx
{[["tape", "ticker tape"], ["watchlist", "watchlist"], ["movers", "top movers"], ["news", "news & video"], ["calendar", "calendar"], ["portfolio", "portfolio"], ["pnf", "P&F signals"]].map(([k, label]) => (
```

Notify list (~8200) — append the pair:

```jsx
{[["priceTriggers", "price triggers"], ["breakingNews", "breaking news"], ["pnfPatterns", "P&F pattern alerts"]].map(([key, label]) => (
```

- [ ] **Step 4: Add I18N keys (5 languages)**

Next to each language's `"in-app alerts"` key (es ~181, fr ~324, de ~467, pt ~609, it ~751):

```js
// es
"P&F SIGNALS": "SEÑALES P&F",
"P&F signals": "señales P&F",
"P&F pattern alerts": "alertas de patrones P&F",
// fr
"P&F SIGNALS": "SIGNAUX P&F",
"P&F signals": "signaux P&F",
"P&F pattern alerts": "alertes de figures P&F",
// de
"P&F SIGNALS": "P&F-SIGNALE",
"P&F signals": "P&F-Signale",
"P&F pattern alerts": "P&F-Muster-Benachrichtigungen",
// pt
"P&F SIGNALS": "SINAIS P&F",
"P&F signals": "sinais P&F",
"P&F pattern alerts": "alertas de padrões P&F",
// it
"P&F SIGNALS": "SEGNALI P&F",
"P&F signals": "segnali P&F",
"P&F pattern alerts": "avvisi di pattern P&F",
```

- [ ] **Step 5: Verify end-to-end**

Run: `npm test` — all suites green.
Run: `npm run build` — clean.
Run: `npm run dev` and confirm: (1) the P&F SIGNALS rail panel appears once any watchlist symbol has an active pattern, rows colored by side; (2) settings → DATA shows the "P&F signals" panel checkbox (hides the rail) and the "P&F pattern alerts" notify checkbox (silences announcements — pattern rows still update); (3) switching language to Spanish shows "SEÑALES P&F" and the translated settings labels while pattern names stay English; (4) color-blind mode swaps the X/O and row colors to blue/orange.

- [ ] **Step 6: Commit**

```powershell
git add React.jsx
git commit -m "feat(pnf): P&F SIGNALS rail panel and settings toggles"
```

---

## Self-Review Notes

- **Spec coverage:** engine (§1 → Task 1), 18-pattern detector with precedence and rightmost-only semantics (§2 → Tasks 2–4), chart mode/badge/caption/empty state/localStorage (§3 → Task 6), scanner + notify pref + one-per-sweep announcement (§4 → Tasks 5, 7), rail panel + panels toggle (§5 → Task 8), i18n (§6 → Tasks 6, 8), error handling (Tasks 1–2 junk-input tests). No spec section is unimplemented.
- **Fixtures hand-verified:** every pattern fixture in Tasks 2–4 was traced against its predicate (including the precedence collisions: triple-over-double, quad-over-triple, catapult-over-ascending, triangle-over-double, trap-before-pole).
- **Type consistency:** `{ type, top, bottom }` column shape, `{ id, name, side }` pattern shape, `getCloses`, `pnfSignals`, `chartMode` names are identical across tasks.
