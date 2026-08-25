// ============================================================
//  time.js — how long ago, and how long.
//
//  WHY THIS IS ITS OWN MODULE
//  `clock` and `relAge` were written for the Video desk and live in
//  src/video/video.js, which is where the first caller happened to be. Neither
//  has anything to do with video: one turns seconds into 4:02, the other turns
//  a timestamp into "2 days ago". The News desk needs both — a story's age on
//  the card, an elapsed clock while the anchor reads it — and a second copy of
//  "2 days ago" is a second thing to keep in agreement with the first.
//
//  video.js re-exports both, so every existing caller and every existing test
//  is untouched by the move.
//
//  TIMESTAMPS ARRIVE IN THREE SHAPES
//  Finnhub sends unix SECONDS, Date.now() is MILLISECONDS, and a model writes
//  an ISO string. `epochMs` is the one place that decides which is which, so a
//  story published in 2026 cannot be rendered as 1970 by whichever caller
//  forgot to multiply.
// ============================================================

// mm:ss under an hour, h:mm:ss over it — the same shape YouTube prints, so a
// timestamp copied off a video matches a timestamp shown here.
export function clock(sec) {
  const n = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), s = n % 60;
  const pad = (x) => String(x).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// A number under this is being read as SECONDS, above it as MILLISECONDS.
// 1e12 ms is 2001 and 1e12 s is the year 33658, so no real timestamp is
// ambiguous — but a number small enough to be either is far more likely to be
// seconds, which is what every wire API sends.
const MS_FLOOR = 1e12;

export function epochMs(t) {
  if (t == null || t === "") return null;
  if (typeof t === "number" || /^\d+$/.test(String(t).trim())) {
    const n = Number(t);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n < MS_FLOOR ? n * 1000 : n;
  }
  const p = Date.parse(t);
  return Number.isFinite(p) ? p : null;
}

const AGES = [
  [31536000, "year"], [2592000, "month"], [604800, "week"],
  [86400, "day"], [3600, "hour"], [60, "minute"],
];

// The long form: "3 days ago". Used where the line has room for it.
export function relAge(t, now = Date.now()) {
  const then = epochMs(t);
  if (then == null) return "";
  const secs = Math.max(0, Math.floor((now - then) / 1000));
  for (const [size, unit] of AGES) {
    const n = Math.floor(secs / size);
    if (n >= 1) return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  }
  return "just now";
}

// The short form the story card wears — "14 min ago", "1h ago", "2d ago" —
// because that line already carries a source, a category and a tone marker,
// and "14 minutes ago" is the one of the four that can be shortened without
// losing anything.
const SHORT = [
  [31536000, "y"], [2592000, "mo"], [604800, "w"], [86400, "d"], [3600, "h"],
];
export function shortAge(t, now = Date.now()) {
  const then = epochMs(t);
  if (then == null) return "";
  const secs = Math.max(0, Math.floor((now - then) / 1000));
  for (const [size, suffix] of SHORT) {
    const n = Math.floor(secs / size);
    if (n >= 1) return `${n}${suffix} ago`;
  }
  const mins = Math.floor(secs / 60);
  return mins >= 1 ? `${mins} min ago` : "just now";
}
