// Point & Figure engine. Pure — no React, no I/O — so it can be unit-tested
// like src/settings/ and src/datahub/. Consumes a list of session closes and
// folds them into X/O columns (close method, N-box reversal).
//
// Box grid: box i spans prices [i*box, (i+1)*box). Columns carry inclusive
// integer box indices {top, bottom} and strictly alternate X (up) / O (down).

const LADDER = [0.01, 0.02, 0.05, 0.10, 0.25, 0.50, 1, 2, 5, 10];

// The default 0.1% box is tuned for a full day of movement (demo's 390 seeded
// bars). A live tape only sees the minutes since page load, so it gets a 4×
// finer grid — otherwise one session almost never prints the two columns the
// chart needs and the panel sits on its empty state all day.
export const INTRADAY_BOX_PCT = 0.00025;

// pct of price, snapped UP to a clean increment. StockCharts' daily traditional
// scale would give one column from a single intraday session; this keeps every
// symbol at a readable 10–40 columns.
export function autoBoxSize(price, pct = 0.001) {
  if (!Number.isFinite(price) || price <= 0) return LADDER[0];
  const raw = price * (Number.isFinite(pct) && pct > 0 ? pct : 0.001);
  return LADDER.find(b => b >= raw) ?? LADDER[LADDER.length - 1];
}

// epsilon guards float division (10.3/0.1 = 102.999…) from dropping a box.
// Scaled to price/box magnitude so it works for large prices with small boxes.
const toBox = (p, box) => Math.floor(p / box + Math.max(1e-9, Math.abs(p / box) * 1e-12));

export function buildPnF(closes, { boxSize = "auto", boxPct, reversal = 3 } = {}) {
  const clean = (Array.isArray(closes) ? closes : []).filter((v) => Number.isFinite(v) && v > 0);
  if (!clean.length) return { columns: [], boxSize: 0 };
  const box = boxSize === "auto" ? autoBoxSize(clean[0], boxPct) : boxSize;
  if (!Number.isFinite(box) || box <= 0 || !Number.isFinite(reversal) || reversal < 1) {
    return { columns: [], boxSize: 0 };
  }
  const columns = [];
  let dir = 0;                // 0 until the first one-box move decides direction
  let cur = null;
  const anchor = toBox(clean[0], box);
  for (const p of clean.slice(1)) {
    const b = toBox(p, box);
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

// The box-index window a chart should render: at most maxRows tall, anchored to
// the most recent action. Protects the chart's scale from one outlier column —
// a bad tick or a halt gap can span thousands of boxes and would otherwise
// squeeze every real column into sub-pixel noise. Walks newest → oldest,
// growing the window until the next column would bust the cap; a giant LAST
// column is clipped to its own growing end (top for X, bottom for O).
export function visibleWindow(columns, maxRows) {
  if (!Array.isArray(columns) || !columns.length) return null;
  const last = columns[columns.length - 1];
  if (last.top - last.bottom + 1 >= maxRows) {
    return last.type === "X"
      ? { top: last.top, bot: last.top - maxRows + 1 }
      : { top: last.bottom + maxRows - 1, bot: last.bottom };
  }
  let top = last.top, bot = last.bottom;
  for (let i = columns.length - 2; i >= 0; i--) {
    const t = Math.max(top, columns[i].top), b = Math.min(bot, columns[i].bottom);
    if (t - b + 1 > maxRows) break;
    top = t; bot = b;
  }
  return { top, bot };
}

// What price prints the NEXT column? Drives the chart's "warming up" empty state.
// kind "first": no columns yet — a close at/above `up` or strictly below `down`
// starts the chart. kind "reversal": only an N-box reversal against the rightmost
// column prints a new one, so the side that would merely extend it is null.
export function pnfTargets(closes, opts = {}) {
  const { columns, boxSize } = buildPnF(closes, opts);
  if (!boxSize) return null;
  const reversal = opts.reversal ?? 3;
  const last = columns[columns.length - 1];
  if (!last) {
    const clean = closes.filter((v) => Number.isFinite(v) && v > 0);
    const anchor = toBox(clean[0], boxSize);
    return { boxSize, kind: "first", up: (anchor + 1) * boxSize, down: anchor * boxSize };
  }
  return last.type === "X"
    ? { boxSize, kind: "reversal", up: null, down: (last.top - reversal + 1) * boxSize }
    : { boxSize, kind: "reversal", up: (last.bottom + reversal) * boxSize, down: null };
}
