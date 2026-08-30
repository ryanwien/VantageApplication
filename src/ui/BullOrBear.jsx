// ============================================================
//  BullOrBear — read a headline, call which way the price went.
//
//  Same skeleton as Ticker Match, deliberately: a countdown the component
//  owns, a round strip, and an answer that reports the seconds remaining up
//  with it. Learning one of the two teaches the other.
//
//  THE TAPE IS A WORKED EXAMPLE
//  No round names a company and none of the prices belongs to one, so the
//  card's own timestamp line says "example". A card headed THE TAPE with an ET
//  timestamp and prices to the cent is close enough to a real print to be
//  worth one word of daylight.
//
//  THE SPARKLINE IS A REAL PLOT
//  Both polylines come out of src/games/bullbear.js, off the round's own
//  series, so the line stops exactly at the last close printed beside it and
//  the gap travels a distance that belongs to the percentage printed beside
//  the open. Neither can be redrawn without changing a number.
// ============================================================

import React, { useState, useEffect, useRef } from "react";
import { C, GRAD, FIELD, MONO, SANS, R } from "./theme.js";
import {
  ROUNDS, ROUND_SECONDS, BONUS_WITHIN, BONUS_POINTS, movePct, moveText, sparkPath, isRight,
  award, totalPoints, rightCount, countdown,
  bestStreak, bonusCount, timeoutCount, scoreBand, coachKey,
} from "../games/bullbear.js";

const railLabel = { fontFamily: MONO, fontSize: 10, letterSpacing: "1.5px", color: C.faint };
const headBtn = { background: "transparent", border: `1px solid ${C.edgeStrong}`, borderRadius: R.sm, color: C.muted, fontFamily: SANS, fontSize: 13, padding: "6px 12px", cursor: "pointer" };
const sheen = { background: GRAD.sheen, color: C.textOnAccent, fontFamily: SANS, fontWeight: 700, border: "none", borderRadius: 9, cursor: "pointer" };
const HEAD = { display: "flex", alignItems: "center", gap: 12, padding: "14px 22px", borderBottom: `1px solid ${C.edge}`, background: C.surfaceAlt, flexWrap: "wrap" };
const SPARK_W = 200, SPARK_H = 34;

export default function BullOrBear({
  rounds = ROUNDS,
  step = 0,
  answered = false,
  choice = null,        // 0 bullish, 1 bearish, null when the clock ran out
  awards = [],
  done = false,
  startedAt = 0,        // when the run began — the summary prints how long it took
  endedAt = 0,          // stamped by the parent the moment the last round closed
  onAnswer,             // (index | null, secondsLeft)
  onNext, onRestart, onBack, onClose,
  t = (s) => s,
}) {
  const round = rounds[step] || {};
  const total = rounds.length;
  const [left, setLeft] = useState(ROUND_SECONDS);

  // Refs for the two things the tick reads — see TickerMatch for why: a
  // dependency on either restarts the interval and the countdown drifts.
  const leftRef = useRef(ROUND_SECONDS);
  leftRef.current = left;
  const answerRef = useRef(onAnswer);
  answerRef.current = onAnswer;
  const firedRef = useRef(false);
  const [stopped, setStopped] = useState(null);

  useEffect(() => { setLeft(ROUND_SECONDS); setStopped(null); firedRef.current = false; }, [step]);

  useEffect(() => {
    if (answered) return undefined;
    const iv = setInterval(() => {
      const next = Math.max(0, leftRef.current - 1);
      setLeft(next);
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

  // The arrow keys, because both cards say so.
  useEffect(() => {
    if (answered) return undefined;
    const onKey = (e) => {
      if (e.key === "ArrowUp") { e.preventDefault(); pick(0); }
      else if (e.key === "ArrowDown") { e.preventDefault(); pick(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered, step]);

  const correct = answered && isRight(round, choice);
  const paid = answered ? award(correct, stopped == null ? left : stopped) : null;
  const points = totalPoints(awards);
  const called = rightCount(awards);
  const up = movePct(round) >= 0;
  const { line, gap } = sparkPath(round.series, answered ? round.open : null, SPARK_W, SPARK_H);

  const closeBtn = onClose && (
    <button onClick={onClose} className="v-clearx" aria-label={t("Close games")}
      style={{ background: "transparent", border: "none", color: C.faint, fontFamily: SANS, fontSize: 14, cursor: "pointer", padding: 2 }}>&#10005;</button>
  );
  const mark = (
    <span aria-hidden="true" style={{ width: 28, height: 28, background: C.surfaceRaised, borderRadius: R.xs, display: "grid", placeItems: "center", fontFamily: MONO, fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
      <span style={{ color: C.up }}>▲</span><span style={{ color: C.down }}>▼</span>
    </span>
  );

  // ---- the run's summary ----
  // Same anatomy as Ticker Match's summary — the two games share their shape
  // by design, and share their end screen's rules through quiz.js. Only the
  // vocabulary differs: calls, not symbols.
  if (done) {
    const band = scoreBand(called, total);
    const tone = band === "perfect" || band === "most"
      ? { color: C.accentText, radial: "radial-gradient(120% 100% at 50% 45%, #0e1a14, #07090d)", glyph: "rgba(76,195,138,0.12)" }
      : band === "even"
        ? { color: C.text, radial: "radial-gradient(120% 100% at 50% 45%, #10141b, #07090d)", glyph: "rgba(230,232,235,0.10)" }
        : { color: C.down, radial: "radial-gradient(120% 100% at 50% 45%, #14090b, #07090d)", glyph: "rgba(221,106,110,0.12)" };
    const verdict = band === "perfect" ? t("Every call right")
      : band === "most" ? t("More right than wrong")
      : band === "even" ? t("Split down the middle")
      : t("The market went the other way");
    const coach = coachKey(awards);
    const late = timeoutCount(awards);
    const coachLine = coach === "timeout"
      ? (late === 1 ? t("The clock took a round from you. Even a guess beats a blank.")
        : t("The clock took {n} rounds. Even a guess beats a blank.").replace("{n}", String(late)))
      : coach === "replay" ? t("Each reveal said why the price moved. Read the why, then call it again.")
      : coach === "flawless" ? t("All {t} calls inside the bonus window. Nothing left on the table.").replace("{t}", String(total))
      : coach === "slow" ? t("{b} of {r} right calls beat the clock. A fast call pays {x} extra.")
          .replace("{b}", String(bonusCount(awards))).replace("{r}", String(called)).replace("{x}", String(BONUS_POINTS))
      : t("A solid run. Faster calls are where the score grows.");
    const secs = endedAt > startedAt ? Math.round((endedAt - startedAt) / 1000) : null;
    return (
      <div className="v-gamepanel" style={{ fontFamily: SANS, background: C.base, color: C.text }}>
        <div style={HEAD}>
          {mark}
          <span style={{ fontWeight: 700, fontSize: 14.5 }}>{t("Bull or Bear")}</span>
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>
            {onBack && <button onClick={onBack} className="v-gamectl" style={headBtn}>← {t("games")}</button>}
            {closeBtn}
          </span>
        </div>
        <div style={{ position: "relative", minHeight: 340, background: tone.radial, overflow: "hidden" }}>
          <div aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(#171b22 1px, transparent 1px), linear-gradient(90deg, #171b22 1px, transparent 1px)", backgroundSize: "46px 46px", opacity: 0.4 }} />
          <div aria-hidden="true" style={{ position: "absolute", left: "50%", top: "44%", transform: "translate(-50%, -50%)", fontFamily: MONO, fontSize: 96, fontWeight: 700, color: tone.glyph, whiteSpace: "nowrap" }}>{called}/{total}</div>
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
                {t("{a} of {b} calls right.").replace("{a}", String(called)).replace("{b}", String(total))}
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

  const CALLS = [
    { key: "↑", glyph: "▲", name: t("Bullish"), sub: t("the price goes up"), tone: C.up, tile: "#14261b", glow: "rgba(70,167,88,0.14)" },
    { key: "↓", glyph: "▼", name: t("Bearish"), sub: t("the price goes down"), tone: C.down, tile: "#2a1a1c", glow: "rgba(221,106,110,0.14)" },
  ];

  return (
    <div className="v-gamepanel" style={{ fontFamily: SANS, background: C.base, color: C.text }}>
      {/* ---- header ---- */}
      <div style={HEAD}>
        {mark}
        <span style={{ fontWeight: 700, fontSize: 14.5 }}>{t("Bull or Bear")}</span>
        {answered ? (
          <span style={{
            display: "flex", alignItems: "center", gap: 7, borderRadius: 20, padding: "4px 11px", fontFamily: MONO, fontSize: 11.5,
            background: correct ? "#101d15" : "#1b1215",
            border: `1px solid ${correct ? "#234a2f" : "#3a2226"}`,
            color: correct ? C.accentText : C.down,
          }}>
            {correct ? t("CALLED IT") : choice == null ? t("OUT OF TIME") : t("WRONG CALL")}
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
            {answered && paid?.points > 0 && <span className="v-quizlate" style={{ display: "inline-block", fontFamily: MONO, fontSize: 11, color: C.accentText }}>+{paid.points}</span>}
          </div>
        </div>
        <div style={{ width: 120, flexShrink: 0, textAlign: "right" }}>
          <div style={railLabel}>{t("CALLED RIGHT")}</div>
          <div key={`${called}/${awards.length}`} className={awards.length ? "v-pop" : undefined} style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, lineHeight: 1.2, color: awards.length ? C.accentText : FIELD.quinary }}>
            {awards.length ? `${called}/${awards.length}` : "—"}
          </div>
        </div>
      </div>

      {/* ---- the tape ---- */}
      <div className="vt-scan" style={{ position: "relative", padding: "24px 22px", overflow: "hidden", animationDuration: "9s" }}>
        <div style={{ position: "relative" }}>
          <div style={{ background: C.surface, border: `1px solid ${C.edge}`, borderRadius: 14, padding: "18px 20px", animation: "vt-fadeup 0.5s var(--v-ease) both" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={railLabel}>{t("THE TAPE")}</span>
              {/* The one word of daylight: none of this happened to anybody. */}
              <span style={{ color: FIELD.quinary, fontFamily: MONO, fontSize: 10 }}>{round.time} · {t("example")}</span>
              <span style={{ marginLeft: "auto", background: C.surfaceRaised, border: `1px solid ${C.edgeStrong}`, borderRadius: 20, padding: "3px 10px", fontFamily: MONO, fontSize: 10.5, color: C.muted }}>{round.tag}</span>
            </div>
            <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.35, letterSpacing: "-0.014em", marginTop: 11, textWrap: "pretty" }}>{round.headline}</div>

            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.edge}`, flexWrap: "wrap" }}>
              <span style={{ color: C.faint, fontSize: 12.5 }}>{answered ? t("Open") : t("Last close")}</span>
              <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700 }}>
                {answered ? round.open?.toFixed(2) : round.lastClose?.toFixed(2)}
                {answered && <span style={{ fontSize: 12, color: up ? C.up : C.down }}> {moveText(round)}</span>}
              </span>
              <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" aria-hidden="true" style={{ width: SPARK_W, height: SPARK_H, flexShrink: 0 }}>
                <polyline points={line} fill="none" stroke={C.faint} strokeWidth="1.5"
                  strokeDasharray={answered ? undefined : 1400} className={answered ? undefined : "vt-draw"} />
                {/* THE gap is the answer to the round, so it draws on the beat
                    the verdict lands rather than on the click frame. 0.36s is
                    the same comma the rows hold — the stillness before the
                    result — and it means the eye watches the price travel
                    INSTEAD of catching it already arrived. Its delay is gated
                    behind the motion query because the blanket reduce rule
                    collapses durations but never delays, and an ungated one
                    would hand a reduce reader a third of a second of blank
                    sparkline and then a line. */}
                {gap && (
                  <polyline points={gap} fill="none" stroke={up ? C.up : C.down} strokeWidth="2"
                    strokeDasharray={1400} className="vt-draw v-gapdraw" style={{ animationDuration: "1.2s" }} />
                )}
              </svg>
              <span style={{ marginLeft: "auto", fontSize: 12, color: answered ? (up ? C.up : C.down) : FIELD.quinary }}>
                {answered
                  ? (up ? t("it gapped up at the bell") : t("it gapped down at the bell"))
                  : t("the tape stops at the headline")}
              </span>
            </div>
          </div>

          {/* ---- the two calls ---- */}
          {/* The columns live in global.css, not here — see .v-bbcalls. */}
          <div className="v-bbcalls" style={{ display: "grid", gap: 12, marginTop: 16 }}>
            {CALLS.map((c, i) => {
              const mine = choice === i;
              const lit = answered && ((i === 0) === !!round.bullish);
              return (
                <button key={c.key} disabled={answered} onClick={() => pick(i)}
                  // Staged in the same three beats as Ticker Match and the
                  // quiz: a ~0.36s comma where nothing is judged yet, then the
                  // right call lights, a wrong call lands red with a dying
                  // shake, and a call that was neither dims out of it.
                  className={answered
                    ? (lit ? "v-quizlit" : mine ? "v-quizwrong" : "v-quizdim")
                    : i === 0 ? "v-callup" : "v-calldown"}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    background: lit ? "rgba(70,167,88,0.1)" : C.surface,
                    border: `1px solid ${lit ? C.accent : answered && mine ? C.down : C.edge}`,
                    borderRadius: R.lg, padding: 18,
                    opacity: answered && !lit && !mine ? 0.45 : 1,
                    cursor: answered ? "default" : "pointer",
                    // `undefined`, never "none". An inline animation outranks a
                    // CLASS animation entirely, so the string would silence the
                    // reveal above — where it was needed only to stop
                    // vt-fadeup's fill-mode `both` pinning opacity at 1 and
                    // swallowing the dim.
                    animation: answered ? undefined : `vt-fadeup 0.5s var(--v-ease) ${0.1 + i * 0.08}s both`,
                  }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 10, background: c.tile, display: "grid", placeItems: "center", color: c.tone, fontSize: 15, flexShrink: 0 }}>{c.glyph}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontWeight: 700, fontSize: 16, color: c.tone }}>{c.name}</span>
                      {/* The row's own verdict on you, arriving after the row
                          has been judged — keyed so it re-runs per round. */}
                      <span key={answered ? "said" : "asking"} className={answered && mine ? "v-quizlate" : undefined}
                        style={{ display: "block", fontSize: 12.5, marginTop: 1, fontWeight: answered && mine ? 600 : 400, color: answered && mine ? (correct ? C.accentText : C.down) : C.faint }}>
                        {answered && mine ? (correct ? t("your call · correct") : t("your call · wrong")) : c.sub}
                      </span>
                    </span>
                    <span style={{ marginLeft: "auto", paddingLeft: 10, whiteSpace: "nowrap" }}>
                      {!answered && <span style={{ color: FIELD.quinary, fontFamily: MONO, fontSize: 11 }}>{c.key} {t("key")}</span>}
                      {answered && lit && paid?.points > 0 && <span className="v-quizlate" style={{ display: "inline-block", fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.accentText }}>+{paid.points}</span>}
                      {answered && lit && !paid?.points && <span className="v-quizlate" style={{ display: "inline-block", fontFamily: MONO, fontSize: 12, color: C.accentText }}>{t("the answer")}</span>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {answered ? (
            // The why waits for the verdict. It used to rise into place on the
            // click frame, on top of the answer it is explaining.
            <div className="v-quizlate" style={{ display: "flex", alignItems: "center", gap: 14, background: C.surfaceAlt, border: `1px solid ${C.edge}`, borderRadius: R.lg, padding: "14px 16px", marginTop: 16, flexWrap: "wrap" }}>
              <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: R.xs, background: C.surfaceRaised, display: "grid", placeItems: "center", color: C.accentText, fontFamily: MONO, fontSize: 13, flexShrink: 0 }}>i</span>
              <span style={{ color: C.muted, fontSize: 13, lineHeight: 1.45, flex: "1 1 240px", minWidth: 0 }}>{round.why}</span>
              <button onClick={onNext} className="vt-sheen" style={{ ...sheen, marginLeft: "auto", fontSize: 13, padding: "10px 20px", whiteSpace: "nowrap" }}>
                {step >= total - 1 ? t("See the score →") : t("Next round →")}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, color: C.faint, fontSize: 12.5 }}>
              <span aria-hidden="true" className="v-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, flexShrink: 0 }} />
              {t("Call it inside {n} seconds for a speed bonus").replace("{n}", String(BONUS_WITHIN))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
