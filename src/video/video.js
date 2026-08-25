// ============================================================
//  video.js — what the desk can actually know about a YouTube video.
//
//  THE CONSTRAINT THIS MODULE EXISTS FOR
//  The Video desk shows a duration, a chapter strip, the tickers a video
//  mentions and when it mentions them. None of that comes free: the YouTube
//  Data API gives a description, an ISO duration, a view count and a publish
//  date, and NOTHING ELSE. There is no chapter field and no transcript
//  endpoint. Everything richer than those four values is derived here, from
//  the description, by rules — never guessed, and never asked of a model that
//  cannot watch the video.
//
//  So every function here fails EMPTY rather than approximately. A video with
//  no chapter list gets no chapter strip; a description that names no known
//  symbol gets no ticker rail. An empty rail is a true statement about a
//  video. A plausible one is not.
// ============================================================

// Two of the readouts this module used to define are not about video at all —
// seconds into 4:02, and a timestamp into "2 days ago". They live in
// src/lib/time.js now, because the News desk needs the same two. Re-exported
// here so every existing caller keeps importing them from where they were.
export { clock, relAge } from "../lib/time.js";

// ---- duration ----
// YouTube returns ISO 8601 durations ("PT18M24S", "PT1H2M3S", "P1DT2H").
export function ytDurationSec(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(iso || "").trim());
  if (!m || !m.slice(1).some(Boolean)) return 0;
  const [, d, h, mi, s] = m;
  return (+d || 0) * 86400 + (+h || 0) * 3600 + (+mi || 0) * 60 + (+s || 0);
}

// A timestamp as written in a description: 0:00, 12:07, 1:02:03.
const TS = /^\s*\(?\[?(\d{1,2}:\d{2}(?::\d{2})?)\)?\]?\s*[-–—:.|)]*\s*(.*\S)?\s*$/;

export function tsToSec(ts) {
  const parts = String(ts).split(":").map(Number);
  if (parts.some(n => !Number.isFinite(n))) return null;
  return parts.length === 3
    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts[0] * 60 + parts[1];
}

// ---- chapters ----
// YouTube's own conditions for turning a description into chapters, applied as
// written: the list must start at 0:00, must have at least three entries, and
// the times must ascend. Loosening any of them turns "recorded 0:00 on a
// Sunday" into a chapter strip, which is worse than no strip at all.
export function parseChapters(description, durationSec = 0) {
  const out = [];
  for (const line of String(description || "").split(/\r?\n/)) {
    const m = TS.exec(line);
    if (!m) continue;
    const start = tsToSec(m[1]);
    const label = (m[2] || "").trim();
    if (start == null || !label) continue;
    out.push({ start, label });
  }
  if (out.length < 3) return [];
  if (out[0].start !== 0) return [];
  for (let i = 1; i < out.length; i++) if (out[i].start <= out[i - 1].start) return [];
  if (durationSec && out[out.length - 1].start >= durationSec) return [];
  return out;
}

// The strip's segments are proportional to how long each chapter actually
// runs. Equal segments would say every chapter is the same size, which is the
// one thing the strip is there to disprove — an 18-minute video is skimmable
// precisely because its parts are uneven.
export function chapterSpans(chapters, durationSec) {
  if (!chapters.length) return [];
  return chapters.map((c, i) => {
    const end = i + 1 < chapters.length ? chapters[i + 1].start : Math.max(durationSec, c.start + 1);
    return { ...c, end, weight: Math.max(1, end - c.start) };
  });
}

export function chapterAt(chapters, sec) {
  let found = -1;
  for (let i = 0; i < chapters.length; i++) if (chapters[i].start <= sec) found = i;
  return found;
}

// ---- tickers ----
// Two rules, and no third one. A $CASHTAG is explicit — nobody writes $NVDA
// about anything but the stock. A bare uppercase word only counts when the
// desk ALREADY knows the symbol, because the alternative is a rail that
// confidently lists CEO, ETF, USA and AI as tickers.
const CASHTAG = /\$([A-Z]{1,5})\b/g;
const BARE = /\b([A-Z]{1,5})\b/g;

export function tickersIn(text, known = []) {
  const set = new Set(known.map(s => String(s).toUpperCase()));
  const found = [];
  const push = (s) => { if (!found.includes(s)) found.push(s); };
  const str = String(text || "");
  for (const m of str.matchAll(CASHTAG)) push(m[1]);
  for (const m of str.matchAll(BARE)) if (set.has(m[1])) push(m[1]);
  return found;
}

// One row per ticker, at the FIRST moment the description puts it — the rail's
// promise is "tap to jump to where he says this", so a later mention would
// land you past the part you came for.
export function chapterMentions(chapters, known = []) {
  const seen = new Map();
  for (const c of chapters) {
    for (const sym of tickersIn(c.label, known)) {
      if (!seen.has(sym)) seen.set(sym, { ticker: sym, start: c.start, label: c.label });
    }
  }
  return [...seen.values()];
}

// ---- the summary ----
// One row per line the model wrote, carrying a timestamp ONLY where a real one
// exists to carry.
//
// The model is never asked for a number — it cannot watch the video — so the
// numbers are the chapters' own, out of the description. When a video has no
// chapter list there is no number, and the honest row is a sentence with
// nothing beside it. It used to be the line's index: three sentences about an
// eighteen-minute video stamped 0:00, 0:01 and 0:02, each one a live link that
// seeked to the first three seconds. An array index wearing a colon is not a
// moment in a video.
export function summaryRows(chapters = [], lines = []) {
  const text = (Array.isArray(lines) ? lines : []).map(s => String(s ?? "").trim()).filter(Boolean);
  if (!Array.isArray(chapters) || !chapters.length) return text.map(t => ({ start: null, text: t }));
  return chapters.slice(0, text.length).map((c, i) => ({ start: c.start, text: text[i] }));
}

// ---- small readouts ----
// YouTube's own rounding, because the number sits next to a YouTube video and
// disagreeing with the source by a decimal place is a small way of looking
// wrong: one decimal below ten of a unit (1.2K), whole numbers above it (41K).
// The thresholds are set where the ROUNDED value would tip over, so nothing
// ever prints "1000K".
export function compactCount(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return "";
  const unit = (val, suffix) =>
    (val < 10 ? String(Math.round(val * 10) / 10) : String(Math.round(val))) + suffix;
  if (v < 999.5) return String(Math.round(v));
  if (v < 999_500) return unit(v / 1e3, "K");
  if (v < 999_500_000) return unit(v / 1e6, "M");
  return unit(v / 1e9, "B");
}

// Initials for the creator tile. Two letters at most: "Mark Roussin, CPA" is
// MR, not MRC — the suffix is a credential, not a name.
export function monogram(name) {
  const words = String(name || "").replace(/[,.]/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const letters = words.filter(w => /^[A-Za-z]/.test(w)).slice(0, 2).map(w => w[0].toUpperCase());
  return letters.join("") || "?";
}
