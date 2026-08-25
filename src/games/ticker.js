// ============================================================
//  ticker.js — Ticker Match's eight rounds, and the scoring the clock drives.
//
//  WHAT THE HANDOFF ADDED
//  The old round was three strings and an index. The reference wants a sector
//  and an exchange on the question card, a REASON beside every wrong option on
//  the answered card, a teaching line under it, a streak, and a countdown with
//  a speed bonus — "answer inside 15 seconds", says the footer.
//
//  WHY THE WRONG-ANSWER REASONS ARE WORDED THE WAY THEY ARE
//  The reference labels a distractor "not a listed symbol". That is a claim
//  about every exchange on earth, and it is not one this file can stand behind
//  for an arbitrary four-letter string — tickers get recycled, and a delisted
//  name today is somebody else's tomorrow. So the default reason is the weaker
//  statement that is always true: it is not THIS company's symbol. The
//  stronger, more useful reasons are used only where they are facts worth
//  teaching — FB really was Meta's ticker until 2022, AZN really is
//  AstraZeneca, and APPL really is the misspelling everyone types.
//
//  NOTHING HERE IS STORED TWICE
//  A round's award is recorded once, and the score, the streak and the count
//  of right answers are all read back out of that list. A streak in particular
//  is a trailing run over the awards — keeping it as its own counter is how it
//  ends up disagreeing with the rounds above it.
// ============================================================

export const ROUND_SECONDS = 20;
// The footer promises a bonus for answering "inside 15 seconds", so the bonus
// is live while more than five seconds remain of a twenty-second round. At the
// reference's own 0:12 that holds, and its card pays +20.
export const BONUS_WITHIN = 15;
export const BASE_POINTS = 10;
export const BONUS_POINTS = 10;

export const ROUNDS = [
  {
    company: "Apple Inc.", symbol: "AAPL", sector: "Technology", exchange: "NASDAQ",
    options: [
      { sym: "APL" },
      { sym: "AAPL", correct: true },
      { sym: "APPL", why: "a common misspelling of AAPL" },
    ],
    teach: "Apple has traded as AAPL on the NASDAQ since 1980. Four letters is the usual shape for a NASDAQ listing.",
  },
  {
    company: "NVIDIA Corporation", symbol: "NVDA", sector: "Semiconductors", exchange: "NASDAQ",
    options: [
      { sym: "NVDA", correct: true },
      { sym: "NVID" },
      { sym: "NVDIA", why: "a common misspelling — the ticker drops the I" },
    ],
    teach: "NVDA is NVIDIA with the vowels squeezed out, which is how most long names become four letters.",
  },
  {
    company: "Tesla, Inc.", symbol: "TSLA", sector: "Automotive", exchange: "NASDAQ",
    options: [
      { sym: "TSL" },
      { sym: "TLA" },
      { sym: "TSLA", correct: true },
    ],
    teach: "Tesla listed on the NASDAQ in 2010 as TSLA — the name with its vowels dropped.",
  },
  {
    company: "Amazon.com, Inc.", symbol: "AMZN", sector: "Consumer", exchange: "NASDAQ",
    options: [
      { sym: "AMZN", correct: true },
      { sym: "AMZ" },
      { sym: "AZN", why: "AZN is AstraZeneca" },
    ],
    teach: "AMZN is Amazon without its vowels. AZN belongs to AstraZeneca — neighbouring tickers catch people out.",
  },
  {
    company: "Microsoft Corporation", symbol: "MSFT", sector: "Technology", exchange: "NASDAQ",
    options: [
      { sym: "MCST" },
      { sym: "MSF" },
      { sym: "MSFT", correct: true },
    ],
    teach: "Microsoft has traded as MSFT since it listed in 1986, and has never changed it.",
  },
  {
    company: "Meta Platforms, Inc.", symbol: "META", sector: "Technology", exchange: "NASDAQ",
    options: [
      { sym: "META", correct: true },
      { sym: "FB", why: "Meta's old symbol — it changed to META in 2022" },
      { sym: "MTA" },
    ],
    teach: "Facebook listed as FB in 2012 and became META in 2022. A ticker can change; the business underneath does not.",
  },
  {
    company: "Alphabet Inc.", symbol: "GOOGL", sector: "Technology", exchange: "NASDAQ",
    options: [
      { sym: "GGL" },
      { sym: "GOOGL", correct: true },
      { sym: "ALPH" },
    ],
    teach: "Alphabet trades as GOOGL for the voting shares and GOOG for the non-voting ones — one company, two tickers.",
  },
  {
    company: "Netflix, Inc.", symbol: "NFLX", sector: "Communication", exchange: "NASDAQ",
    options: [
      { sym: "NFX" },
      { sym: "NFLX", correct: true },
      { sym: "NTFL" },
    ],
    teach: "NFLX is Netflix minus its vowels — the same trick as AMZN and TSLA.",
  },
];

// The answer index, read off the options rather than stored beside them. An
// `answer: 1` that disagrees with which option carries `correct` is a bug that
// only shows when somebody picks B.
export function answerIndex(round) {
  return (round?.options || []).findIndex(o => o?.correct);
}

// What a round pays. The bonus is the whole reason the clock is on screen:
// without it the countdown would be a deadline and nothing more.
export function award(correct, secondsLeft) {
  if (!correct) return { correct: false, points: 0, bonus: false };
  const left = Math.max(0, Math.min(ROUND_SECONDS, Number(secondsLeft) || 0));
  const bonus = left > ROUND_SECONDS - BONUS_WITHIN;
  return { correct: true, points: BASE_POINTS + (bonus ? BONUS_POINTS : 0), bonus };
}

// ---- everything below reads the awards list. None of it is stored. ----

export function totalPoints(awards = []) {
  return awards.reduce((s, a) => s + (Number(a?.points) || 0), 0);
}

export function rightCount(awards = []) {
  return awards.filter(a => a?.correct).length;
}

// The trailing run of right answers. Derived rather than counted up, so it
// cannot survive a wrong round that the list above it clearly records.
export function streak(awards = []) {
  let n = 0;
  for (let i = awards.length - 1; i >= 0; i--) {
    if (awards[i]?.correct) n += 1;
    else break;
  }
  return n;
}

// mm:ss for the countdown pill.
export function countdown(sec) {
  const n = Math.max(0, Math.floor(Number(sec) || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}
