// ============================================================
//  quiz.js — the scoring the three quiz games share.
//
//  The games handoff says it outright: Ticker Match, Bull or Bear and Stock
//  School are "one shared shape — round / total, score, streak, secondsLeft,
//  answered", and "speed bonus is a function of secondsLeft at answer time".
//  Two of them now have a clock, and they disagree only on the numbers: a
//  twenty-second round with a fifteen-second window against a fifteen-second
//  round with a ten-second one.
//
//  So the RULE lives here once and each game binds its own constants. A second
//  copy of "did they beat the bonus window" is a second place for the answer to
//  drift from the footer promising it.
//
//  Everything a run accumulates is read back out of one list of awards. A
//  streak especially: counted up on its own it survives a wrong round that the
//  list plainly records.
// ============================================================

export function awardWith({ roundSeconds, bonusWithin, base, bonus }) {
  return function award(correct, secondsLeft) {
    if (!correct) return { correct: false, points: 0, bonus: false };
    const left = Math.max(0, Math.min(roundSeconds, Number(secondsLeft) || 0));
    // The window is stated as "answer inside N seconds", so it is open while
    // more than (round − N) remain.
    const fast = left > roundSeconds - bonusWithin;
    return { correct: true, points: base + (fast ? bonus : 0), bonus: fast };
  };
}

export function totalPoints(awards = []) {
  return awards.reduce((s, a) => s + (Number(a?.points) || 0), 0);
}

export function rightCount(awards = []) {
  return awards.filter(a => a?.correct).length;
}

// The trailing run of right answers, derived rather than counted.
export function streak(awards = []) {
  let n = 0;
  for (let i = awards.length - 1; i >= 0; i--) {
    if (awards[i]?.correct) n += 1;
    else break;
  }
  return n;
}

// The longest run of right answers anywhere in the list — the streak the run
// PEAKED at, where `streak` above is the one it ENDED on. The end screen
// prints this one: a player who opened five-for-five and stumbled late still
// built that run, and the list records it.
export function bestStreak(awards = []) {
  let best = 0, n = 0;
  for (const a of awards) {
    n = a?.correct ? n + 1 : 0;
    if (n > best) best = n;
  }
  return best;
}

export function bonusCount(awards = []) {
  return awards.filter(a => a?.bonus).length;
}

// Rounds the clock ended, not the player. The award itself cannot tell a
// wrong answer from no answer — both score zero — so the screen that knows
// which it was stamps `timeout` on the entry, and this reads the stamps.
export function timeoutCount(awards = []) {
  return awards.filter(a => a?.timeout).length;
}

// How the run went, as a band. Same shape as Overheat's riskBand: the bands
// sit where the wording changes, and the wording lives on the screen where it
// can be translated.
export function scoreBand(right, total) {
  if (!total) return "few";
  if (right >= total) return "perfect";
  if (right * 2 > total) return "most";
  if (right * 2 === total) return "even";
  return "few";
}

// Which line the end screen's footer coaches with — a KEY, not a sentence,
// for adviceKey's reason: a string chosen inside a module is a string the
// i18n audit cannot see. Ordered by what most needs saying:
//   timeout  — the clock ended most of the misses; answering at all beats that
//   replay   — more wrong than right; every reveal said why, go read the whys
//   flawless — every answer right and inside the bonus window
//   slow     — right answers, but fewer than half of them beat the clock
//   steady   — a solid run with bonus room left
export function coachKey(awards = []) {
  const right = rightCount(awards);
  const missed = awards.length - right;
  const late = timeoutCount(awards);
  if (late > 0 && late * 2 > missed) return "timeout";
  if (missed > right) return "replay";
  const fast = bonusCount(awards);
  if (right > 0 && right === awards.length && fast === right) return "flawless";
  if (fast * 2 < right) return "slow";
  return "steady";
}

// mm:ss for a countdown pill.
export function countdown(sec) {
  const n = Math.max(0, Math.floor(Number(sec) || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}
