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
  // epsilon guards float division (10.3/0.1 = 102.999…) from dropping a box.
  // Scaled to price/box magnitude so it works for large prices with small boxes.
  const toBox = (p) => Math.floor(p / box + Math.max(1e-9, Math.abs(p / box) * 1e-12));
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
