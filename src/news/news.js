// ============================================================
//  news.js — what the desk can actually know about a headline.
//
//  THE CONSTRAINT THIS MODULE EXISTS FOR
//  The News desk reference puts four things on every story card: a source, an
//  age, a category tag (M&A / MACRO / ANALYSIS) and a tone marker. Exactly one
//  of those arrives from the wire. Finnhub's company-news gives a headline, a
//  url, a source, a summary and a unix timestamp — there is no tone field and
//  no category worth having (every company story comes back tagged "company").
//
//  So tone and category are derived here, from the words, by rules. Both stay
//  SILENT when the words do not settle it, which is the whole discipline: an
//  unlabelled story is a true statement about a headline nobody can classify.
//  A wrong ▲ on a market story is not.
//
//  And the two other paths into this panel — Claude with web search, a model
//  from memory — carry no timestamp at all. Nothing here invents one. A card
//  with no age simply has no age on it.
// ============================================================

import { epochMs, shortAge } from "../lib/time.js";

// ---- tone ----
// A keyword scan, not a model: it only tags a headline whose direction is
// unambiguous, and stays silent otherwise. Mixed signals get nothing, because
// "surges after downgrade" is a headline neither arrow describes.
//
// Two corrections to the list this scan was written with, both visible the
// first time it ran over a real wire:
//   * `slid(?:es)?` matches "slid" and "slides" but NOT "slide" or "sliding",
//     which are the forms a headline actually uses. It never once fired on the
//     word it was added for.
//   * "trading lower" and "trades higher" are how the wire says a stock moved
//     when the story is about something else, and neither list had them. Only
//     the two-word forms are here: bare "lower" is bull in "lower costs" and
//     bear in "lowers guidance", so on its own it settles nothing.
const BULL_WORDS = /\b(surge[sd]?|soar(?:s|ed)?|jump(?:s|ed)?|rall(?:y|ies|ied)|record high|beats?|tops?|upgrade[sd]?|outperform(?:s|ed)?|gains?|climb(?:s|ed)?|rises?|rose|bullish|buyback|trad(?:e|es|ing) higher|mov(?:e|es|ed) higher|raises? (?:guidance|outlook|forecast))\b/i;
const BEAR_WORDS = /\b(plunge[sd]?|sink(?:s|ing)?|sank|slump(?:s|ed)?|fall(?:s|ing)?|fell|drops?|miss(?:es|ed)?|cuts?|downgrade[sd]?|underperform(?:s|ed)?|loss(?:es)?|slid(?:e|es|ing)?|bearish|lawsuit|probe|recall|layoffs?|warn(?:s|ing)?|halt(?:s|ed)?|trad(?:e|es|ing) lower|mov(?:e|es|ed) lower)\b/i;

export function toneOf(title = "") {
  const bull = BULL_WORDS.test(title);
  const bear = BEAR_WORDS.test(title);
  if (bull && !bear) return "bull";
  if (bear && !bull) return "bear";
  return null;
}

// The reference spells the marker out — "▲ BULLISH", "NEUTRAL" — rather than
// showing a bare arrow, and its own note says why: `▲ 1  7 quiet  ▼ 0` could
// not be read. The word is the label; the arrow is decoration on it.
//
// NEUTRAL is what the card prints when the scan found nothing, and that is a
// slight overstatement — the scan being silent is not the same as the story
// being balanced. The title attribute carries the honest version, because a
// third state ("UNSCORED") on every second card would be noise.
export function toneLabel(tone) {
  if (tone === "bull") return "▲ BULLISH";
  if (tone === "bear") return "▼ BEARISH";
  return "NEUTRAL";
}

// The per-card arrows, aggregated. "quiet" means the scan stayed silent, not
// that the wire is balanced — the panel says "neutral" because that is the
// word the reference uses, and the tooltip on the strip says which it means.
export function wireTone(items = []) {
  let bull = 0, bear = 0;
  for (const n of items) {
    const t = toneOf(n.title);
    if (t === "bull") bull += 1;
    else if (t === "bear") bear += 1;
  }
  return { bull, bear, quiet: items.length - bull - bear };
}

// ---- category ----
// Ordered most specific first, because a headline can hit two lists and the
// narrower one is the one worth printing: "Court blocks the Smartkem merger"
// is LEGAL, not M&A. Anything that matches nothing gets no tag, and a card
// with no tag is the common case rather than a failure.
const CATEGORIES = [
  ["M&A", /\b(acquir(?:e|es|ed|ing)|acquisition|merger|merges?|buyout|takeover|letter of intent|tender offer|divest(?:s|ed|iture)?|spin[- ]?off|to buy|stake in)\b/i],
  ["EARNINGS", /\b(earnings|quarterly results|[Qq][1-4] (?:results|revenue|earnings)|EPS|top[- ]and[- ]bottom line|revenue (?:beat|miss|grew|fell)|guidance|outlook for)\b/i],
  ["LEGAL", /\b(lawsuit|sues?|sued|settlement|settles?|antitrust|subpoena|indict(?:ed|ment)|class action|SEC (?:filing|probe|charges)|regulator[sy]?|fined?)\b/i],
  ["MACRO", /\b(tariffs?|the Fed|Federal Reserve|inflation|interest rates?|rate cut|CPI|GDP|jobs report|payrolls|sanctions?|trade war|stimulus|recession|Treasury yields?)\b/i],
  ["ANALYSIS", /\b(price target|initiates? coverage|analysts?|upgrade[sd]?|downgrade[sd]?|rating|overweight|underweight|buy rating|sell rating|valuation|multiple|bull case|bear case)\b/i],
  ["PRODUCT", /\b(launch(?:es|ed)?|unveil(?:s|ed)?|debuts?|rollout|new chip|next[- ]gen|partnership with|contract with|deal with)\b/i],
];

export function categoryOf(...text) {
  const s = text.filter(Boolean).join(" ");
  if (!s.trim()) return null;
  for (const [label, re] of CATEGORIES) if (re.test(s)) return label;
  return null;
}

// ---- per-source identity ----
// These are ASSIGNED hues, not brand colours — Benzinga's own palette is
// orange and CNBC's is blue. The reference pins four of them so the app and
// the design file cannot drift apart on the outlets that show up most; the
// rest are hashed, so the same outlet always looks the same without anyone
// maintaining a list of every wire on the internet.
//
// The previous hue set (#FFB300, #3D9BFF, #2FD37A, #FF7A59, #C08BFF, #FF5CA8)
// belonged to the palette BEFORE the redesign and survived the retheme
// untouched, which is how a near-black panel ended up with hot pink on it.
//
// CNBC's green is the system's positive/live colour, which is a real tension
// with the one-accent rule. It stays because the colour never appears without
// the source's NAME set in it a few pixels to the right — the label is what
// stops a hue being read as a state.
const PINNED = {
  benzinga: "#a78bfa",
  seekingalpha: "#dd9a3c",
  cnbc: "#4cc38a",
  yahoo: "#7aa2f7",
};
const SOURCE_HUES = ["#a78bfa", "#dd9a3c", "#7aa2f7", "#4cc38a", "#e59bb6", "#7fd4c1"];

export function sourceColor(name = "") {
  const key = String(name).toLowerCase().replace(/[^a-z]/g, "");
  for (const brand of Object.keys(PINNED)) if (key.includes(brand)) return PINNED[brand];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return SOURCE_HUES[h % SOURCE_HUES.length];
}

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

export function sourceOf(item, url) {
  return item?.source || hostOf(url || item?.url) || "Source";
}

// ---- ordering ----
// The footer promises "newest first", so the list has to actually be in that
// order — Finnhub usually returns it that way and is not documented to. Dated
// stories sort by time; undated ones keep the order they arrived in, at the
// end, because there is nothing to sort them by and shuffling them would be
// inventing a sequence.
export function newestFirst(items = []) {
  const stamped = items.map((n, i) => ({ n, i, t: epochMs(n.datetime ?? n.publishedAt) }));
  stamped.sort((a, b) => {
    if (a.t == null && b.t == null) return a.i - b.i;
    if (a.t == null) return 1;
    if (b.t == null) return -1;
    return b.t - a.t || a.i - b.i;
  });
  return stamped.map(s => s.n);
}

export function ageOf(item, now = Date.now()) {
  return shortAge(item?.datetime ?? item?.publishedAt, now);
}

// The window the panel claims in its header. The server asks Finnhub for seven
// days, but seven days is what we REQUESTED — what came back might all be from
// this morning, and "last 7 days" over eight stories published today is a
// quiet little lie. So this measures the oldest story we actually hold.
//
// No timestamps at all (the model paths) means no claim: an empty string, and
// the header prints the count on its own.
export function spanLabel(items = [], now = Date.now()) {
  const times = items.map(n => epochMs(n.datetime ?? n.publishedAt)).filter(t => t != null);
  if (!times.length) return "";
  const secs = Math.max(0, Math.floor((now - Math.min(...times)) / 1000));
  if (secs <= 3600) return "last hour";
  if (secs <= 86400) return "last 24h";
  const days = Math.ceil(secs / 86400);
  return days >= 7 ? "last week" : `last ${days} days`;
}
