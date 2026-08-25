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

// mm:ss for a countdown pill.
export function countdown(sec) {
  const n = Math.max(0, Math.floor(Number(sec) || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}
