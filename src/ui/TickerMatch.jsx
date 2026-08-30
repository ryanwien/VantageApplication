// ============================================================
//  TickerMatch — match a company to the symbol it trades as.
//
//  THE CLOCK LIVES HERE
//  The round is timed and the score depends on how much time was left when you
//  answered, so the countdown is this component's state rather than the
//  dashboard's. Answering reports the seconds remaining up with the choice —
//  `onAnswer(index, secondsLeft)` — so the parent never has to guess when the
//  click landed, and running out of time reports itself the same way with no
//  choice at all.
//
//  WHAT THE ANSWERED CARD SAYS, AND WHAT IT WILL NOT
//  The reference marks each wrong option "not a listed symbol". src/games/
//  ticker.js explains why most of them say something weaker and truer instead;
//  a row with no reason simply gets none, which is the same rule every other
//  panel in this product follows.
//
//  LAST TRADE is a real quote. The caller hands in whatever the desk holds for
//  the symbol, and all eight companies are in its universe — but a row with no
//  price keeps the SECTOR block rather than printing an empty card.
// ============================================================

import React, { useState, useEffect, useRef } from "react";
import { C, GRAD, FIELD, MONO, SANS, R } from "./theme.js";
import {
  ROUNDS, ROUND_SECONDS, BONUS_WITHIN, BONUS_POINTS, answerIndex, award, totalPoints, streak, countdown,
  rightCount, bestStreak, bonusCount, timeoutCount, scoreBand, coachKey,
} from "../games/ticker.js";

const railLabel = { fontFamily: MONO, fontSize: 10, letterSpacing: "1.5px", color: C.faint };
const headBtn = { background: "transparent", border: `1px solid ${C.edgeStrong}`, borderRadius: R.sm, color: C.muted, fontFamily: SANS, fontSize: 13, padding: "6px 12px", cursor: "pointer" };
const sheen = { background: GRAD.sheen, color: C.textOnAccent, fontFamily: SANS, fontWeight: 700, border: "none", borderRadius: 9, cursor: "pointer" };
const HEAD = { display: "flex", alignItems: "center", gap: 12, padding: "14px 22px", borderBottom: `1px solid ${C.edge}`, background: C.surfaceAlt, flexWrap: "wrap" };
const KEYS = ["A", "B", "C"];

export default function TickerMatch({
  rounds = ROUNDS,
  step = 0,
  answered = false,     // the round has been called; the reveal is showing
  choice = null,        // index picked, or null when the clock ran out
  awards = [],          // one entry per answered round — score and streak read this
  quote = null,         // { price, chgPct } for this round's symbol, when the desk has one
  onAnswer,             // (index | null, secondsLeft)
  done = false,         // every round called; show the run's score
  startedAt = 0,        // when the run began — the summary prints how long it took
  endedAt = 0,          // stamped by the parent the moment the last round closed
  onNext, onRestart, onBack, onClose,
  t = (s) => s,
}) {
  const round = rounds[step] || {};
  const options = round.options || [];
  const right = answerIndex(round);
  const total = rounds.length;
  const [left, setLeft] = useState(ROUND_SECONDS);

  // Refs, not state, for the two things the tick needs to read: the clock, and
  // the callback. Depending on either would restart the interval — on the clock
  // every second, and on the callback every time the dashboard re-creates it —
  // and a restarted interval loses whatever fraction of a second it was into
  // its phase, so the countdown drifts slower than the wall.
  const leftRef = useRef(ROUND_SECONDS);
  leftRef.current = left;
  const answerRef = useRef(onAnswer);
  answerRef.current = onAnswer;
  // One report per round. The interval can tick once more between the timeout
  // firing and the re-render that stops it, and a second report would push a
  // second award for a round that was only played once.
  const firedRef = useRef(false);
  // What the clock read when the answer went in. Frozen so the reveal keeps
  // showing the time that earned the points rather than a clock still running.
  const [stopped, setStopped] = useState(null);

  useEffect(() => { setLeft(ROUND_SECONDS); setStopped(null); firedRef.current = false; }, [step]);

  useEffect(() => {
    if (answered) return undefined;
    const iv = setInterval(() => {
      const next = Math.max(0, leftRef.current - 1);
      setLeft(next);
      // Out of time is an answer: no choice, no points, and the streak breaks.
      if (next === 0 && !firedRef.current) { firedRef.current = true; setStopped(0); answerRef.current?.(null, 0); }
    }, 1000);
    return () => clearInterval(iv);
  }, [answered, step]);

  const pick = (i) => {
    if (answered || firedRef.current) return;
    firedRef.current = true;
    setStopped(leftRef.current);
    answerRef.current?.(i, leftRef.current);
  };

  // Keyboard, because every row says "press A". Bound while the question is up.
  useEffect(() => {
    if (answered) return undefined;
    const onKey = (e) => {
      const i = KEYS.indexOf(String(e.key || "").toUpperCase());
      if (i >= 0 && i < options.length) { e.preventDefault(); pick(i); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered, step, options.length]);

  const correct = answered && choice === right;
  const shown = stopped == null ? left : stopped;
  const paid = answered ? award(correct, shown) : null;
  const points = totalPoints(awards);
  const run = streak(awards);

  const closeBtn = onClose && (
    <button onClick={onClose} className="v-clearx" aria-label={t("Close games")}
      style={{ background: "transparent", border: "none", color: C.faint, fontFamily: SANS, fontSize: 14, cursor: "pointer", padding: 2 }}>&#10005;</button>
  );

  const header = (
    <div style={HEAD}>
      <span aria-hidden="true" style={{ width: 28, height: 28, background: C.surfaceRaised, borderRadius: R.xs, display: "grid", placeItems: "center", fontFamily: MONO, fontWeight: 700, fontSize: 11, flexShrink: 0 }}>ABC</span>
      <span style={{ fontWeight: 700, fontSize: 14.5 }}>{t("Ticker Match")}</span>
      <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {onBack && <button onClick={onBack} className="v-gamectl" style={headBtn}>← {t("games")}</button>}
        {closeBtn}
      </span>
    </div>
  );

  // ---- the run's summary ----
  // The end-state anatomy the arcade games already speak — a tinted field, the
  // outcome as a giant translucent mark, the verdict, the numbers, one
  // coaching line read off the run. Which tint and which line are RULES in
  // quiz.js, where they are tested; only the wording lives here.
  if (done) {
    const got = rightCount(awards);
    const band = scoreBand(got, total);
    const tone = band === "perfect" || band === "most"
      ? { color: C.accentText, radial: "radial-gradient(120% 100% at 50% 45%, #0e1a14, #07090d)", glyph: "rgba(76,195,138,0.12)" }
      : band === "even"
        ? { color: C.text, radial: "radial-gradient(120% 100% at 50% 45%, #10141b, #07090d)", glyph: "rgba(230,232,235,0.10)" }
        : { color: C.down, radial: "radial-gradient(120% 100% at 50% 45%, #14090b, #07090d)", glyph: "rgba(221,106,110,0.12)" };
    const verdict = band === "perfect" ? t("Every symbol matched")
      : band === "most" ? t("You know these tickers")
      : band === "even" ? t("Half the tape matched")
      : t("The tape got away from you");
    const coach = coachKey(awards);
    const late = timeoutCount(awards);
    const coachLine = coach === "timeout"
      ? (late === 1 ? t("The clock took a round from you. Even a guess beats a blank.")
        : t("The clock took {n} rounds. Even a guess beats a blank.").replace("{n}", String(late)))
      : coach === "replay" ? t("Every wrong row said why it was wrong — play it again with the reasons in mind.")
      : coach === "flawless" ? t("All {t} matched inside the bonus window. There is no faster tape.").replace("{t}", String(total))
      : coach === "slow" ? t("{b} of {r} right answers beat the clock. A fast match pays {x} extra.")
          .replace("{b}", String(bonusCount(awards))).replace("{r}", String(got)).replace("{x}", String(BONUS_POINTS))
      : t("A solid tape. The bonus window is where the score grows.");
    const secs = endedAt > startedAt ? Math.round((endedAt - startedAt) / 1000) : null;
    return (
      <div className="v-gamepanel" style={{ fontFamily: SANS, background: C.base, color: C.text }}>
        {header}
        <div style={{ position: "relative", minHeight: 340, background: tone.radial, overflow: "hidden" }}>
          <div aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(#171b22 1px, transparent 1px), linear-gradient(90deg, #171b22 1px, transparent 1px)", backgroundSize: "46px 46px", opacity: 0.4 }} />
          <div aria-hidden="true" style={{ position: "absolute", left: "50%", top: "44%", transform: "translate(-50%, -50%)", fontFamily: MONO, fontSize: 96, fontWeight: 700, color: tone.glyph, whiteSpace: "nowrap" }}>{got}/{total}</div>
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", background: "rgba(7,9,13,0.6)", padding: 20 }}>
            <div>
              {/* No stamp, no clock line — never a 0:00 that did not happen. */}
              {secs != null && (
                <div style={{ ...railLabel, letterSpacing: "2.5px", animation: "vt-fadeup 0.5s var(--v-ease) both" }}>
                  {t("{n} ROUNDS · {clock}").replace("{n}", String(total)).replace("{clock}", countdown(secs))}
                </div>
              )}
              <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.03em", color: tone.color, marginTop: 10, animation: "vt-fadeup 0.6s var(--v-ease) 0.1s both" }}>{verdict}</div>
              <div style={{ color: C.muted, fontSize: 15, marginTop: 8, animation: "vt-fadeup 0.6s var(--v-ease) 0.2s both" }}>
                {t("{a} of {b} symbols matched.").replace("{a}", String(got)).replace("{b}", String(total))}
              </div>
              <div style={{ display: "flex", gap: 26, justifyContent: "center", marginTop: 22, flexWrap: "wrap", animation: "vt-fadeup 0.6s var(--v-ease) 0.3s both" }}>
                {[[t("SCORE"), String(points)], [t("BEST STREAK"), String(bestStreak(awards))], [t("SPEED BONUSES"), String(bonusCount(awards))]].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ ...railLabel, fontSize: 9.5 }}>{k}</div>
                    <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, marginTop: 3, color: C.text }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 24, flexWrap: "wrap", animation: "vt-fadeup 0.6s var(--v-ease) 0.4s both" }}>
                <button onClick={onRestart} className="vt-sheen" style={{ ...sheen, fontSize: 14, padding: "11px 24px" }}>{t("Play again")}</button>
                {onBack && <button onClick={onBack} className="v-outline" style={{ background: "transparent", border: `1px solid ${C.edgeStrong}`, borderRadius: 9, color: C.text, fontFamily: SANS, fontSize: 14, padding: "11px 20px", cursor: "pointer" }}>{t("Back to the games")}</button>}
              </div>
            </div>
          </div>
        </div>
        <div style={{ padding: "16px 20px", borderTop: `1px solid ${C.edge}`, display: "flex", alignItems: "center", gap: 10 }}>
          <span aria-hidden="true" style={{ width: 26, height: 26, background: C.surfaceRaised, borderRadius: R.xs, display: "grid", placeItems: "center", color: coach === "flawless" ? C.accentText : C.warn, fontSize: 13, flexShrink: 0 }}>{coach === "flawless" ? "✓" : "!"}</span>
          {/* Read off the awards list, so it can only say what happened. */}
          <span style={{ color: C.muted, fontSize: 13, lineHeight: 1.5 }}>{coachLine}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="v-gamepanel" style={{ fontFamily: SANS, background: C.base, color: C.text }}>
      {/* ---- header ---- */}
      <div style={HEAD}>
        <span aria-hidden="true" style={{ width: 28, height: 28, background: C.surfaceRaised, borderRadius: R.xs, display: "grid", placeItems: "center", fontFamily: MONO, fontWeight: 700, fontSize: 11, flexShrink: 0 }}>ABC</span>
        <span style={{ fontWeight: 700, fontSize: 14.5 }}>{t("Ticker Match")}</span>
        {answered ? (
          <span style={{
            display: "flex", alignItems: "center", gap: 7, borderRadius: 20, padding: "4px 11px", fontFamily: MONO, fontSize: 11.5,
            background: correct ? "#101d15" : "#1b1215",
            border: `1px solid ${correct ? "#234a2f" : "#3a2226"}`,
            color: correct ? C.accentText : C.down,
          }}>
            {correct ? t("CORRECT") : choice == null ? t("OUT OF TIME") : t("WRONG")}
          </span>
        ) : (
          // Keyed on the threshold, not on the second: crossing into the last
          // five remounts the pill, so it flinches exactly once at the
          // crossing rather than every tick.
          <span key={left <= 5 ? "hot" : "cool"} className={left <= 5 ? "v-clockhot" : undefined} style={{
            display: "flex", alignItems: "center", gap: 7, background: C.surface, borderRadius: 20, padding: "4px 11px", fontFamily: MONO, fontSize: 11.5,
            border: `1px solid ${left <= 5 ? C.down : C.edge}`,
            color: left <= 5 ? C.down : C.muted,
          }}>
            <span aria-hidden="true" className={left <= 5 ? "v-pulse-tight" : "v-pulse"} style={{ width: 6, height: 6, borderRadius: "50%", background: left <= 5 ? C.down : C.accent }} />
            {countdown(left)}
          </span>
        )}
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {onBack && <button onClick={onBack} className="v-gamectl" style={headBtn}>← {t("games")}</button>}
          {closeBtn}
        </span>
      </div>

      {/* ---- round strip ---- */}
      <div className="v-tmhud" style={{ display: "flex", alignItems: "center", gap: 20, padding: "14px 22px", borderBottom: `1px solid ${C.edge}`, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={railLabel}>{t("ROUND")}</span>
            <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700 }}>
              {step + 1}<span style={{ color: FIELD.quinary }}>/{total}</span>
            </span>
          </div>
          {/* Light green for a round already called, accent for the one you are
              on. The reference lights the NEXT pip on its answered card, which
              would have the strip claiming round two while the label beside it
              still reads round one — so a called round goes light and nothing
              runs ahead of the number. */}
          <div aria-hidden="true" style={{ display: "flex", gap: 4, marginTop: 8 }}>
            {rounds.map((_, i) => (
              // A pip going green is a round being banked. It used to switch
              // colour between frames; now it fills, which is the only motion
              // on this strip and the one it was missing.
              <span key={i} style={{
                flex: 1, height: 4, borderRadius: 2,
                background: i < step || (i === step && answered) ? C.up : i === step ? C.accent : C.edge,
                transition: "background 0.3s var(--v-ease)",
              }} />
            ))}
          </div>
        </div>
        <div style={{ width: 120, flexShrink: 0, background: C.surface, border: `1px solid ${answered && correct ? C.accent : C.edgeStrong}`, borderRadius: R.lg, padding: "8px 12px", textAlign: "center", transition: "border-color 0.3s var(--v-ease)" }}>
          <div style={railLabel}>{t("SCORE")}</div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 5 }}>
            {/* Keyed on the value, so a score that changed re-mounts and pops.
                A number that simply becomes a bigger number is the one event
                in a game nobody notices. */}
            <span key={points} className="v-pop" style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, lineHeight: 1.2, color: answered && correct ? C.accentText : C.text }}>{points}</span>
            {answered && paid?.points > 0 && (
              <span className="v-quizlate" style={{ display: "inline-block", fontFamily: MONO, fontSize: 11, color: C.accentText }}>+{paid.points}</span>
            )}
          </div>
        </div>
        <div style={{ width: 120, flexShrink: 0, textAlign: "right" }}>
          <div style={railLabel}>{t("STREAK")}</div>
          <div key={run} className={run > 0 ? "v-pop" : undefined} style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, lineHeight: 1.2, color: run > 0 ? C.accentText : FIELD.quinary }}>
            {run > 0 ? `×${run}` : "—"}
          </div>
        </div>
      </div>

      {/* ---- the question ---- */}
      <div className="vt-scan" style={{ position: "relative", padding: "26px 22px 24px", overflow: "hidden", animationDuration: "9s" }}>
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, background: C.surface, border: `1px solid ${C.edge}`, borderRadius: 14, padding: "18px 20px", flexWrap: "wrap", animation: "vt-fadeup 0.5s var(--v-ease) both" }}>
            {/* The tile stops asking once it has been answered: it becomes the
                symbol. It bobs only while the question stands. */}
            <div className={answered ? undefined : "vt-bob"} style={{
              width: 54, height: 54, borderRadius: 12, display: "grid", placeItems: "center", flexShrink: 0,
              fontFamily: MONO, fontWeight: 700,
              fontSize: answered ? (round.symbol || "").length > 4 ? 11 : 13 : 18,
              background: answered ? "#101d15" : C.surfaceRaised,
              border: `1px solid ${answered ? "#234a2f" : C.edgeStrong}`,
              color: answered ? C.accentText : C.muted,
              animationDuration: "3.2s",
            }}>{answered ? round.symbol : "?"}</div>
            <div style={{ minWidth: 0 }}>
              <div style={railLabel}>{t("WHICH SYMBOL TRADES AS")}</div>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.023em", marginTop: 3, lineHeight: 1.2 }}>{round.company}</div>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              {answered && quote?.price != null ? (
                <>
                  <div style={railLabel}>{t("LAST TRADE")}</div>
                  <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, marginTop: 3 }}>
                    {quote.price.toFixed(2)}
                    {quote.chgPct != null && (
                      <span style={{ fontSize: 12, color: quote.chgPct >= 0 ? C.up : C.down }}>
                        {" "}{quote.chgPct >= 0 ? "+" : "−"}{Math.abs(quote.chgPct).toFixed(2)}%
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div style={railLabel}>{t("SECTOR")}</div>
                  <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>{round.sector} · {round.exchange}</div>
                </>
              )}
            </div>
          </div>

          {/* ---- the three candidates ---- */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
            {options.map((o, i) => {
              const isRight = i === right, chosen = choice === i;
              const lit = answered && isRight, wrong = answered && chosen && !isRight;
              return (
                <button key={o.sym} disabled={answered} onClick={() => pick(i)}
                  // The reveal is staged, in the same three beats and with the
                  // same classes as Stock School's quiz: for about a third of a
                  // second the marks print in neutral gray — the paper truth,
                  // before judgment — and only then does the verdict light, the
                  // wrong row shake, and the rows that were neither dim out of
                  // the argument. The two games and the lesson now land a call
                  // identically, which is the promise this file's header makes.
                  className={answered ? (lit ? "v-quizlit" : wrong ? "v-quizwrong" : "v-quizdim") : "v-answer"}
                  style={{
                    display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left",
                    background: lit ? "rgba(70,167,88,0.1)" : C.surface,
                    border: `1px solid ${lit ? C.accent : wrong ? C.down : C.edge}`,
                    borderRadius: R.lg, padding: "15px 18px",
                    opacity: answered && !lit && !wrong ? 0.45 : 1,
                    cursor: answered ? "default" : "pointer",
                    // `undefined`, never "none". An inline animation property
                    // outranks a CLASS animation entirely, so the string would
                    // silence the reveal above — where it used to be needed to
                    // stop vt-fadeup's fill-mode `both` pinning opacity at 1
                    // and swallowing the dim.
                    animation: answered ? undefined : `vt-fadeup 0.5s var(--v-ease) ${0.08 + i * 0.08}s both`,
                  }}>
                  <span aria-hidden="true" className={lit ? "v-quizmark-lit" : wrong ? "v-quizmark-x" : undefined}
                    style={{
                      width: 26, height: 26, borderRadius: R.xs, display: "grid", placeItems: "center", flexShrink: 0,
                      background: lit ? "#14261b" : C.surfaceRaised,
                      border: `1px solid ${lit ? "#234a2f" : wrong ? C.down : C.edgeStrong}`,
                      color: lit ? C.accentText : wrong ? C.down : C.faint,
                      fontFamily: MONO, fontSize: lit || wrong ? 12 : 11,
                    }}>{lit ? "✓" : wrong ? "✕" : KEYS[i]}</span>
                  <span style={{ fontFamily: MONO, fontSize: 19, fontWeight: 700, letterSpacing: "1px", color: lit ? C.accentText : C.text }}>{o.sym}</span>
                  <span style={{ marginLeft: "auto", textAlign: "right", paddingLeft: 10 }}>
                    {!answered && <span style={{ fontFamily: MONO, fontSize: 11, color: FIELD.quinary }}>{t("press {k}").replace("{k}", KEYS[i])}</span>}
                    {/* The words arrive after the verdict has landed, not with
                        it — the row goes green, and THEN it is told why. */}
                    {lit && (
                      <span className="v-quizlate" style={{ display: "inline-block", color: C.accentText, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>
                        {correct ? t("Correct · +{n}").replace("{n}", String(paid.points)) : t("The answer")}
                      </span>
                    )}
                    {/* Every wrong row gets a reason, as the reference draws
                        it — but the DEFAULT is the weaker statement this file
                        can stand behind for any four-letter string. "Not a
                        listed symbol" is a claim about every exchange on
                        earth; "not this company's symbol" is a claim about one
                        company, and it is always true. The specific reasons
                        are facts worth teaching and live in the round data. */}
                    {answered && !isRight && (
                      <span className="v-quizlate" style={{ display: "inline-block", color: C.faint, fontSize: 12 }}>{o.why || t("not this company's symbol")}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {answered ? (
            // The teaching waits for the verdict. It used to rise into place
            // on the click frame, on top of the answer it is explaining.
            <div className="v-quizlate" style={{ display: "flex", alignItems: "center", gap: 14, background: C.surfaceAlt, border: `1px solid ${C.edge}`, borderRadius: R.lg, padding: "14px 16px", marginTop: 16, flexWrap: "wrap" }}>
              <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: R.xs, background: C.surfaceRaised, display: "grid", placeItems: "center", color: C.accentText, fontFamily: MONO, fontSize: 13, flexShrink: 0 }}>i</span>
              <span style={{ color: C.muted, fontSize: 13, lineHeight: 1.45, flex: "1 1 240px", minWidth: 0 }}>{round.teach}</span>
              <button onClick={onNext} className="vt-sheen" style={{ ...sheen, marginLeft: "auto", fontSize: 13, padding: "10px 20px", whiteSpace: "nowrap" }}>
                {step >= total - 1 ? t("See the score →") : t("Next round →")}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, color: C.faint, fontSize: 12.5 }}>
              <span aria-hidden="true" className="v-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, flexShrink: 0 }} />
              {t("Answer inside {n} seconds for a speed bonus").replace("{n}", String(BONUS_WITHIN))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
