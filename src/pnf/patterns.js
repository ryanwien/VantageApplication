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

// precedence: most specific first — extended by Tasks 3 and 4
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

export function detectPattern(columns) {
  if (!Array.isArray(columns) || columns.length < 3 || !alternates(columns)) return null;
  for (const [id, name, side, match] of CATALOG) {
    if (match(columns)) return { id, name, side };
  }
  return null;
}
