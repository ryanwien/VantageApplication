// ============================================================
//  overheat.js — the rules of Overheat, and the arithmetic the screen shows.
//
//  THE GAME
//  It is twenty-one, told as a market. The dealer is THE MARKET, your hand is
//  YOUR BOOK, the bankroll is CAPITAL, a bet is a POSITION, winning is P&L,
//  and busting is overheating past the limit. The dealer's stand threshold is
//  where the market COOLS, and it is a setting — 15, 17 or 19 — because the
//  whole lesson of the game is that the same book is a good position against
//  one house rule and a bad one against another.
//
//  THE RULE THIS MODULE EXISTS TO ENFORCE
//  The handoff states it plainly: every number on the screen must reconcile.
//  The tape must sum to the drawdown, the drawdown must match capital against
//  starting capital, and the risk percentage is position size over capital.
//
//  The only way to guarantee that is to refuse to store any of it. CAPITAL IS
//  NOT STATE. The state is a starting number and a tape of closed positions;
//  capital is their sum, drawdown is capital against the start, and the risk
//  percentage is a division. Nothing here can drift out of agreement with
//  anything else, because there is only ever one number and four views of it.
// ============================================================

export const SUITS = ["♠", "♥", "♦", "♣"];
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export const LIMIT = 21;                 // past this, you have overheated
export const COOL_OPTIONS = [15, 17, 19];
export const START_CAPITAL = 1000;
export const MIN_POSITION = 25;          // also the step, so the quick chips are all reachable

// Fisher-Yates, taking its randomness as an argument so a test can deal a
// known shoe.
//
// The previous shuffle was `.sort(() => Math.random() - 0.5)`. That is not a
// shuffle: a comparator that answers differently each time it is called is
// undefined behaviour by the language spec, and even where it does not
// misbehave the resulting distribution is measurably lopsided. A card game is
// the one place that matters.
export function deck(rand = Math.random) {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ r, s });
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export function cardValue(rank) {
  if (rank === "A") return 11;
  if (rank === "J" || rank === "Q" || rank === "K") return 10;
  return Number(rank) || 0;
}

// An ace is 11 until that would overheat you, and then it is 1 — one ace at a
// time, because two aces are 12 and not 2.
export function handValue(cards = []) {
  let sum = 0, aces = 0;
  for (const c of cards) {
    sum += cardValue(c?.r);
    if (c?.r === "A") aces += 1;
  }
  while (sum > LIMIT && aces > 0) { sum -= 10; aces -= 1; }
  return sum;
}

export function isNatural(cards = []) {
  return cards.length === 2 && handValue(cards) === LIMIT;
}

export function overheated(cards = []) {
  return handValue(cards) > LIMIT;
}

// The market plays its own hand: it takes cards until it reaches the point it
// cools at, then stops. It never plays at all when your book has already
// overheated — the position is closed before the market gets a turn, which is
// exactly why buying past the limit is the expensive mistake.
export function marketPlays(cards, rest, coolAt) {
  const out = cards.slice(), shoe = rest.slice();
  while (handValue(out) < coolAt && shoe.length) out.push(shoe.pop());
  return { cards: out, rest: shoe };
}

// The outcome, as facts rather than as a sentence. The screen writes the
// wording — and writes it in whichever language it is running in — from
// `reason`, so this file never holds a string a translator would need.
export function settle({ book, market, size, coolAt = 17 }) {
  const b = handValue(book), m = handValue(market);
  const bookNatural = isNatural(book), marketNatural = isNatural(market);

  if (b > LIMIT) return { kind: "lose", amount: -size, reason: "book-overheat", book: b, market: m, coolAt };
  // A two-card twenty-one pays half as much again, unless the market has one
  // too — then nobody was ever ahead.
  if (bookNatural && !marketNatural) return { kind: "win", amount: Math.round(size * 1.5), reason: "natural", book: b, market: m, coolAt };
  if (m > LIMIT) return { kind: "win", amount: size, reason: "market-overheat", book: b, market: m, coolAt };
  if (b > m) return { kind: "win", amount: size, reason: "higher", book: b, market: m, coolAt };
  if (b < m) return { kind: "lose", amount: -size, reason: "lower", book: b, market: m, coolAt };
  return { kind: "push", amount: 0, reason: "tie", book: b, market: m, coolAt };
}

// ---- everything below is DERIVED. None of it is ever stored. ----

export function netPnl(tape = []) {
  return tape.reduce((sum, e) => sum + (Number(e?.amount) || 0), 0);
}

export function capitalFrom(start, tape = []) {
  return start + netPnl(tape);
}

// Capital against where it started. `direction` rather than a signed number,
// because the label changes word as well as colour: money lost is a DRAWDOWN
// and money made is not.
export function drawdown(start, capital) {
  if (!start) return { pct: 0, direction: "flat" };
  const delta = capital - start;
  const pct = Math.round((Math.abs(delta) / start) * 100);
  return { pct, direction: delta < 0 ? "down" : delta > 0 ? "up" : "flat" };
}

// One decimal, because at these sizes the whole-number version rounds $50 of
// $600 and $55 of $600 to the same 8%.
export function riskPct(size, capital) {
  if (!capital || capital <= 0) return 0;
  return Math.round((size / capital) * 1000) / 10;
}

export function winRate(tape = []) {
  if (!tape.length) return 0;
  return Math.round((tape.filter(e => e?.kind === "win").length / tape.length) * 100);
}

export function record(tape = []) {
  let up = 0, down = 0;
  for (const e of tape) { if (e?.kind === "win") up += 1; else if (e?.kind === "lose") down += 1; }
  return { up, down, flat: tape.length - up - down };
}

// How exposed one position is, as a word. The bands are where the advice
// actually changes: a quarter of capital on one hand is not a strategy, and
// under a twentieth is barely worth the click.
export function riskBand(pct) {
  if (pct >= 25) return "extreme";
  if (pct >= 12) return "high";
  if (pct >= 5) return "moderate";
  return "low";
}

// Which line the TAKEAWAY panel writes. A key rather than a sentence, because
// the sentences are translated and a string chosen inside a module is a string
// the i18n audit cannot see — so the rule lives here where it can be tested,
// and the wording lives on the screen where it can be translated.
//
// Ordered by what most needs saying: the mistake you just made beats the habit
// you are forming, which beats a running total.
export function adviceKey({ tape = [], risk = 0, last = null } = {}) {
  if (!tape.length) return "start";
  if (last?.reason === "book-overheat") return "past-limit";
  const band = riskBand(risk);
  if (band === "high" || band === "extreme") return "size-down";
  if (tape.filter(e => e?.kind === "lose").length > tape.length / 2) return "losing";
  return "steady";
}

// The quick chips. `max` is whatever is left, so the row always offers a real
// number rather than an amount you cannot cover — and duplicates drop out, so
// a player down to $50 does not see "$50" twice.
export function sizeOptions(capital) {
  const fixed = [25, 50, 100].filter(v => v <= capital);
  const out = [...new Set(fixed)];
  if (capital > 0 && !out.includes(capital)) out.push(capital);
  return out;
}

export function clampSize(size, capital) {
  if (capital < MIN_POSITION) return 0;
  const step = Math.round(size / MIN_POSITION) * MIN_POSITION;
  return Math.max(MIN_POSITION, Math.min(capital, step));
}

// Can this position be doubled? Only on the opening two cards, and only if
// there is capital behind the second half of it.
export function canDouble({ book, size, capital }) {
  return book.length === 2 && !overheated(book) && size * 2 <= capital;
}

// What buying one more card would do to this book — the mid-hand question the
// whole game is asking, answered by counting rather than by guessing.
//
// Every rank is run through the real handValue(), so the ace's demotion from
// 11 to 1 is the rule this module already enforces rather than a second copy
// of it that could disagree with the first. On a book of 15 an ace is a 1 and
// does not overheat you, which is exactly the case a hand-written "anything
// above a 6" rule gets wrong.
//
// Counted in RANKS, deliberately, and the screen says "ranks" too. A rank
// count is a fact about a deck's composition and is the same 4/13 either way,
// because every rank holds four cards. Counting what is left in the shoe would
// be a different and larger claim — the player cannot see the shoe, and a
// readout that quietly counted it would be telling them something the game
// never offered to tell them.
//
// Returns null once the book has already overheated: there is no decision left
// to describe, and the position closes on its own.
export function buyRisk(book = []) {
  if (overheated(book)) return null;
  const bustRanks = RANKS.filter(r => handValue([...book, { r }]) > LIMIT);
  return {
    bust: bustRanks.length,
    safe: RANKS.length - bustRanks.length,
    total: RANKS.length,
    spare: LIMIT - handValue(book),
  };
}

export function isWiped(capital) {
  return capital < MIN_POSITION;
}

// "$1,000" / "−$400" / "+$50". The minus is U+2212, the same glyph every other
// negative number in this product uses — a hyphen is narrower and sits at a
// different height, which is visible the moment a column of them lines up.
export function money(n, { sign = false } = {}) {
  const v = Math.round(Number(n) || 0);
  const body = `$${Math.abs(v).toLocaleString("en-US")}`;
  if (v < 0) return `−${body}`;
  return sign && v > 0 ? `+${body}` : body;
}

// One line of the tape: what the market printed, what you did, what it cost.
// The verb is the fact that decides it — a book of two cards was held, a
// bigger one was bought into.
export function tapeLine(entry) {
  const bought = (entry?.cards || 2) > 2;
  return `market ${entry.market} · ${bought ? "bought to" : "held"} ${entry.book}`;
}
