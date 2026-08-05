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
