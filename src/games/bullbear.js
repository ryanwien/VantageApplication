// ============================================================
//  bullbear.js — Bull or Bear's eight headlines, and the tape under them.
//
//  WHAT THE HANDOFF ADDED
//  The old round was a headline, a boolean and a reason. The reference wants a
//  timestamp, a category tag, a last close, a sparkline that visibly STOPS at
//  the news, and then — once you have called it — the gap drawn onto that same
//  sparkline with the open beside it.
//
//  THESE ARE WORKED EXAMPLES, NOT PRINTS
//  No round names a company, and none of these prices belongs to one. They are
//  a teaching scenario, in the same way Stock School's $5,000,000 ÷ 1,000,000
//  is — so the card says so, in the line where its timestamp sits. A card
//  headed THE TAPE, with an ET timestamp and prices to the cent, is close
//  enough to a real print to be worth one word of daylight.
//
//  THE PICTURE HAS TO AGREE WITH THE NUMBERS
//  The sparkline is a real plot of `series`, and the gap is drawn from its last
//  point on a scale derived from that same tape — see sparkPath for why the
//  open is deliberately NOT folded into the range. A round that says +6% shows
//  a step; one that says −15% runs off the bottom of the box. There is a test
//  that the gap goes UP for every bullish round and DOWN for every bearish one,
//  and another that a bigger move travels further than a smaller one.
// ============================================================

import { awardWith, totalPoints, rightCount, streak, countdown } from "./quiz.js";

export const ROUND_SECONDS = 15;
// "Call it inside 10 seconds for a speed bonus", says the footer — so the
// window is open while more than five of the fifteen remain. At the
// reference's own 0:09 it is, and its card pays +30.
export const BONUS_WITHIN = 10;
export const BASE_POINTS = 15;
export const BONUS_POINTS = 15;

export const ROUNDS = [
  {
    headline: "The company reports quarterly earnings that beat analysts' expectations.",
    bullish: true, time: "08:31 ET · pre-market", tag: "EARNINGS",
    lastClose: 142.60, open: 151.20,
    series: [138.90, 139.80, 139.20, 140.60, 140.10, 141.40, 141.00, 142.10, 142.60],
    why: "An earnings beat usually lifts the price, because the company earned more than the market had priced in. Guidance can still spoil it.",
  },
  {
    headline: "A flagship product is recalled over a serious safety defect.",
    bullish: false, time: "09:12 ET · pre-market", tag: "PRODUCT",
    lastClose: 88.40, open: 79.10,
    series: [91.20, 90.60, 91.00, 90.10, 89.70, 90.20, 89.10, 88.80, 88.40],
    why: "A recall costs money twice — the repair, and the trust. Both of them end up in the price.",
  },
  {
    headline: "The board announces a surprise increase to the dividend.",
    bullish: true, time: "16:05 ET · after the bell", tag: "DIVIDEND",
    lastClose: 61.20, open: 64.20,
    series: [59.80, 60.10, 59.60, 60.40, 60.20, 60.90, 60.60, 61.00, 61.20],
    why: "A bigger dividend is cash in hand, and a signal that the board expects to keep earning it.",
  },
  {
    headline: "A key executive abruptly resigns amid an accounting investigation.",
    bullish: false, time: "07:45 ET · pre-market", tag: "GOVERNANCE",
    lastClose: 210.00, open: 178.50,
    series: [216.40, 215.20, 214.80, 213.10, 213.90, 212.20, 211.60, 210.80, 210.00],
    why: "Accounting doubt is the worst kind: it puts every other number the company has published in question.",
  },
  {
    headline: "The firm wins a multi-billion-dollar government contract.",
    bullish: true, time: "10:20 ET · at the open", tag: "CONTRACT",
    lastClose: 34.80, open: 39.60,
    series: [33.90, 34.10, 33.80, 34.40, 34.20, 34.60, 34.30, 34.70, 34.80],
    why: "A signed contract is revenue that has already been sold. The market prices it the moment it is announced.",
  },
  {
    headline: "The company slashes its full-year sales forecast.",
    bullish: false, time: "16:31 ET · after the bell", tag: "GUIDANCE",
    lastClose: 127.90, open: 108.70,
    series: [131.60, 130.80, 131.20, 130.10, 129.40, 129.90, 128.60, 128.20, 127.90],
    why: "A price rests on expected future profits. Cutting the forecast lowers the very thing it was resting on.",
  },
  {
    headline: "The company launches a large share buyback program.",
    bullish: true, time: "08:02 ET · pre-market", tag: "BUYBACK",
    lastClose: 55.40, open: 58.20,
    series: [54.10, 54.60, 54.30, 54.90, 54.70, 55.10, 54.80, 55.20, 55.40],
    why: "A buyback splits the same profit fewer ways — and it is the company saying out loud that it thinks its own stock is cheap.",
  },
  {
    headline: "A rival ships a cheaper product that undercuts the company's prices.",
    bullish: false, time: "11:48 ET · midday", tag: "COMPETITION",
    lastClose: 96.10, open: 89.20,
    series: [98.80, 98.20, 98.60, 97.70, 97.90, 97.10, 96.80, 96.40, 96.10],
    why: "Match the price and you earn less per sale; hold it and you sell fewer. Competition costs margin either way.",
  },
];

// The move the round actually made, off its own two numbers. Never stored, so
// the percentage printed beside the open cannot disagree with the open.
export function movePct(round) {
  const from = Number(round?.lastClose), to = Number(round?.open);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  return ((to - from) / from) * 100;
}

export function moveText(round) {
  const pct = movePct(round);
  if (pct == null) return "";
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`;
}

// The two polylines, on ONE vertical scale.
//
// The series takes the left 80% of the box and the gap the rest, so the jump
// reads as happening after everything before it.
//
// THE SCALE IS THE SERIES', WIDENED — not the series plus the open. Fitting
// the open in would put every gap at the very edge whatever its size, and the
// only difference between a 6% move and a 15% one would be how squashed the
// tape underneath looked. Instead the domain grows by at most two and a half
// times the tape's own range, so a small gap is visibly small, a large one is
// visibly large, and anything past that clips at the edge — which reads as off
// the scale, because it is.
//
// The widening also buys headroom the naive version does not have: on a rising
// tape the last close IS the high, and a bullish gap would have nowhere to go.
const GAP_HEADROOM = 2.5;

export function sparkPath(series = [], open = null, w = 200, h = 34) {
  const pts = (Array.isArray(series) ? series : []).map(Number).filter(Number.isFinite);
  if (pts.length < 2) return { line: "", gap: "" };
  // `open != null` first: Number(null) is 0, which IS finite, so a null open —
  // the state this card is in for half its life — would otherwise reserve the
  // gap's width and drag the whole scale down to zero.
  const hasOpen = open != null && open !== "" && Number.isFinite(Number(open));
  const o = Number(open);

  const lo0 = Math.min(...pts), hi0 = Math.max(...pts);
  const span0 = (hi0 - lo0) || Math.abs(hi0) * 0.01 || 1;
  const room = span0 * GAP_HEADROOM;
  const lo = hasOpen ? Math.min(lo0, Math.max(o, lo0 - room)) : lo0;
  const hi = hasOpen ? Math.max(hi0, Math.min(o, hi0 + room)) : hi0;
  const span = (hi - lo) || 1;

  const pad = 3;
  const y = (v) => {
    const raw = h - pad - ((v - lo) / span) * (h - pad * 2);
    return Math.round(Math.min(h - pad, Math.max(pad, raw)) * 100) / 100;
  };
  const lineW = hasOpen ? w * 0.8 : w;
  const x = (i) => Math.round(((i / (pts.length - 1)) * lineW) * 100) / 100;
  const line = pts.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const last = pts.length - 1;
  const gap = hasOpen ? `${x(last)},${y(pts[last])} ${w},${y(o)}` : "";
  return { line, gap };
}

// A call is right when it matches which way the tape actually went.
export function isRight(round, choice) {
  // 0 = bullish, 1 = bearish — the order the two cards are drawn in.
  if (choice !== 0 && choice !== 1) return false;
  return (choice === 0) === !!round?.bullish;
}

export const award = awardWith({
  roundSeconds: ROUND_SECONDS, bonusWithin: BONUS_WITHIN, base: BASE_POINTS, bonus: BONUS_POINTS,
});

export { totalPoints, rightCount, streak, countdown };
