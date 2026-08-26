// ============================================================
//  StockSchool — the anchor teaches, then checks.
//
//  TWO SCREENS, NOT ONE
//  It used to share a shell with Bull or Bear and Ticker Match, and the
//  handoff gives it a shape those two do not have: a lesson with takeaway
//  cards, a worked example, a syllabus and a narration player on one screen,
//  and the question on another. Splitting it out is also what fixed a live
//  bug — the shared shell rendered the lesson body as `{R.teach}`, where `R`
//  is the theme's RADIUS token rather than the round, so the paragraph the
//  whole game exists to teach had been rendering as nothing at all.
//
//  "TIME LEFT" IS THE ONE NUMBER THIS SCREEN CANNOT PRINT
//  The reference's third HUD card counts down. A lesson is read at your own
//  pace, and a countdown over a paragraph somebody is still reading is a
//  pressure the design does not intend — so the card counts UP, from a real
//  timestamp, and is labelled TIME.
//
//  THE LESSON PROSE IS NOT TRANSLATED, AND THE CHROME IS
//  `t` arrives as a prop because the i18n context lives in the dashboard.
//  Every call here is a literal, so the audit still sees them. The lesson text
//  itself is data in src/games/school.js and has never been translated; that
//  is a content job rather than a refactor, and machine-translating eight
//  lessons of teaching prose to close the gap would be worse than the gap.
// ============================================================

import React, { useState, useEffect } from "react";
import { C, GRAD, FIELD, MONO, SANS, R } from "./theme.js";
import Waveform from "./Waveform.jsx";
import useSpeechProgress from "./useSpeechProgress.js";
import { clock } from "../lib/time.js";
import { POINTS_PER_ANSWER, points, syllabusWindow, lessonNo } from "../games/school.js";
import { scoreBand, countdown } from "../games/quiz.js";

const railLabel = { fontFamily: MONO, fontSize: 10, letterSpacing: "1.5px", color: C.faint };
const outline = { background: "transparent", border: `1px solid ${C.edgeStrong}`, borderRadius: 9, color: C.muted, fontFamily: SANS, fontSize: 14, padding: "12px 18px", cursor: "pointer" };
const headBtn = { background: "transparent", border: `1px solid ${C.edgeStrong}`, borderRadius: R.sm, color: C.muted, fontFamily: SANS, fontSize: 13, padding: "6px 12px", cursor: "pointer" };
const sheen = { background: GRAD.sheen, color: C.textOnAccent, fontFamily: SANS, fontWeight: 700, border: "none", borderRadius: 9, cursor: "pointer" };
const HEAD = { display: "flex", alignItems: "center", gap: 12, padding: "14px 22px", borderBottom: `1px solid ${C.edge}`, background: C.surfaceAlt, flexWrap: "wrap" };

// The HUD's third card. Counts up from a real timestamp — see the header note.
function ElapsedClock({ since }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!since) return undefined;
    const iv = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(iv);
  }, [since]);
  if (!since) return "0:00";
  return clock(Math.max(0, Math.floor((Date.now() - since) / 1000)));
}

// The NARRATION player. Its bar is the same reading the News desk's on-air
// block takes — a real position through the script, off the ref the desk
// updates on every word boundary — so it moves because the anchor is speaking
// rather than because a timer says it should.
function Narration({ progressRef, speaking, playingLine, idleLine, label, onToggle }) {
  const { frac, elapsedSec } = useSpeechProgress(progressRef, "school");
  return (
    <div style={{ background: C.surfaceAlt, border: `1px solid ${C.edge}`, borderRadius: R.md, marginTop: 9, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <button onClick={onToggle} aria-label={label} title={label} className="v-gamectl"
          style={{ width: 26, height: 26, borderRadius: R.xs, background: C.surfaceRaised, border: "none", color: speaking ? C.accentText : C.muted, fontSize: 11, lineHeight: 1, cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}>
          {speaking ? "▮▮" : "▶"}
        </button>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", height: 4, borderRadius: 2, background: C.edge, overflow: "hidden" }}>
            <span style={{ display: "block", width: `${frac * 100}%`, height: "100%", background: C.accent, transition: "width 250ms linear" }} />
          </span>
        </span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint, flexShrink: 0 }}>{clock(elapsedSec)}</span>
      </div>
      <div style={{ color: C.faint, fontSize: 11.5, marginTop: 9, lineHeight: 1.45 }}>{speaking ? playingLine : idleLine}</div>
    </div>
  );
}

export default function StockSchool({
  lessons = [],
  step = 0,
  phase = "teach",      // teach | quiz | reveal | done
  score = 0,            // the COUNT of right answers — points are it times twenty
  choice = null,
  startedAt = null,
  endedAt = 0,          // stamped by the parent when the last quiz closed
  reading = false,      // the anchor is speaking this lesson right now
  progressRef = null,
  anchorName = "Sterling",
  onAnswer, onNext, onToQuiz, onBackToLesson, onJump, onToggleRead, onRestart, onBack, onClose,
  t = (s) => s,
}) {
  const lesson = lessons[step] || {};
  const total = lessons.length;
  const revealed = phase === "reveal";
  const win = syllabusWindow(total, step, 5);

  const numTile = (text) => (
    <span aria-hidden="true" style={{ width: 28, height: 28, background: C.surfaceRaised, borderRadius: R.xs, display: "grid", placeItems: "center", fontFamily: MONO, fontWeight: 700, fontSize: 12, color: C.accentText, flexShrink: 0 }}>{text}</span>
  );
  const closeBtn = onClose && (
    <button onClick={onClose} className="v-clearx" aria-label={t("Close games")}
      style={{ background: "transparent", border: "none", color: C.faint, fontFamily: SANS, fontSize: 14, cursor: "pointer", padding: 2 }}>&#10005;</button>
  );
  const backBtn = onBack && (
    <button onClick={onBack} className="v-gamectl" style={headBtn}>← {t("games")}</button>
  );

  // ---- the graduation card ----
  // The end-state anatomy the arcade games speak, in graduation green — always
  // green, because school has no loser: finishing all eight lessons IS the
  // outcome, and the sentence right below states the score plainly. No stats
  // row either — the sentence already carries both numbers a row would, and a
  // third stat invented to fill the space would be padding. The footer coaches
  // off scoreBand, the same tested rule the other two summaries tint by.
  if (phase === "done") {
    const band = scoreBand(score, total);
    const coachLine = band === "perfect" ? t("Nothing missed. Bull or Bear next door asks you to use it.")
      : band === "most" ? t("You missed {n}. The lessons are short — a second pass usually clears them.").replace("{n}", String(total - score))
      : t("Every reveal explained its rule. Run it back with those in mind.");
    const secs = endedAt > startedAt ? Math.round((endedAt - startedAt) / 1000) : null;
    return (
      <div className="v-gamepanel" style={{ fontFamily: SANS, background: C.base, color: C.text }}>
        <div style={HEAD}>
          {numTile(lessonNo(Math.max(0, total - 1)))}
          <span style={{ fontWeight: 700, fontSize: 14.5 }}>{t("Stock School")}</span>
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>{backBtn}{closeBtn}</span>
        </div>
        <div style={{ position: "relative", minHeight: 340, background: "radial-gradient(120% 100% at 50% 45%, #0e1a14, #07090d)", overflow: "hidden" }}>
          <div aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(#171b22 1px, transparent 1px), linear-gradient(90deg, #171b22 1px, transparent 1px)", backgroundSize: "46px 46px", opacity: 0.4 }} />
          <div aria-hidden="true" style={{ position: "absolute", left: "50%", top: "44%", transform: "translate(-50%, -50%)", fontFamily: MONO, fontSize: 96, fontWeight: 700, color: "rgba(76,195,138,0.12)", whiteSpace: "nowrap" }}>{score}/{total}</div>
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", background: "rgba(7,9,13,0.6)", padding: 20 }}>
            <div>
              {/* No stamp, no clock line — never a 0:00 that did not happen. */}
              {secs != null && (
                <div style={{ ...railLabel, letterSpacing: "2.5px", animation: "vt-fadeup 0.5s var(--v-ease) both" }}>
                  {t("{n} LESSONS · {clock}").replace("{n}", String(total)).replace("{clock}", countdown(secs))}
                </div>
              )}
              <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.03em", color: C.accentText, marginTop: 10, animation: "vt-fadeup 0.6s var(--v-ease) 0.1s both" }}>{t("You graduated")}</div>
              <div style={{ color: C.muted, fontSize: 15, marginTop: 8, animation: "vt-fadeup 0.6s var(--v-ease) 0.2s both" }}>
                {t("{a} of {b} right, for {p} points.").replace("{a}", String(score)).replace("{b}", String(total)).replace("{p}", String(points(score)))}
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 24, flexWrap: "wrap", animation: "vt-fadeup 0.6s var(--v-ease) 0.3s both" }}>
                <button onClick={onRestart} className="vt-sheen" style={{ ...sheen, fontSize: 14, padding: "11px 24px" }}>{t("Start again")}</button>
                {onBack && <button onClick={onBack} className="v-outline" style={{ ...outline, color: C.text, fontSize: 14, padding: "11px 20px" }}>{t("Back to the games")}</button>}
              </div>
            </div>
          </div>
        </div>
        <div style={{ padding: "16px 20px", borderTop: `1px solid ${C.edge}`, display: "flex", alignItems: "center", gap: 10 }}>
          <span aria-hidden="true" style={{ width: 26, height: 26, background: C.surfaceRaised, borderRadius: R.xs, display: "grid", placeItems: "center", color: band === "perfect" ? C.accentText : C.warn, fontSize: 13, flexShrink: 0 }}>{band === "perfect" ? "✓" : "!"}</span>
          {/* Read off the score, so it can only say what happened. */}
          <span style={{ color: C.muted, fontSize: 13, lineHeight: 1.5 }}>{coachLine}</span>
        </div>
      </div>
    );
  }

  // ---- the quiz ----
  if (phase === "quiz" || revealed) {
    return (
      <div className="v-gamepanel" style={{ fontFamily: SANS, background: C.base, color: C.text }}>
        <div style={HEAD}>
          {numTile(lessonNo(step))}
          <span style={{ fontWeight: 700, fontSize: 14.5 }}>{t("Quiz · lesson {n}").replace("{n}", String(step + 1))}</span>
          {/* The reference reads "question 1/3". Each lesson here carries ONE
              check, so the count that is true is the lesson's place in the
              syllabus rather than a question number out of three that do not
              exist. */}
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.faint }}>
            {t("lesson {n} of {m}").replace("{n}", String(step + 1)).replace("{m}", String(total))}
          </span>
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button onClick={onBackToLesson} className="v-outline" style={headBtn}>← {t("lesson")}</button>
            {closeBtn}
          </span>
        </div>

        <div style={{ padding: "24px 22px" }}>
          <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.4, textWrap: "pretty" }}>{lesson.q}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
            {(lesson.choices || []).map((c, i) => {
              const right = i === lesson.answer, chosen = choice === i;
              const lit = revealed && right, wrong = revealed && chosen && !right;
              return (
                <button key={i} disabled={revealed} onClick={() => onAnswer?.(i)} className={revealed ? undefined : "v-answer"}
                  style={{
                    display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left",
                    background: lit ? "rgba(70,167,88,0.1)" : C.surface,
                    border: `1px solid ${lit ? C.accent : wrong ? C.down : C.edge}`,
                    borderRadius: R.lg, padding: "14px 16px",
                    opacity: revealed && !lit && !wrong ? 0.45 : 1,
                    cursor: revealed ? "default" : "pointer",
                    // The entrance is dropped once the answer is in, and that
                    // is load-bearing rather than tidy: vt-fadeup ends on
                    // `opacity: 1` and runs with fill-mode `both`, so while it
                    // is still attached the animation's final keyframe OUTRANKS
                    // the inline style — a CSS animation sits above inline
                    // styles in the cascade — and the dim on the rows that were
                    // not the answer silently never applied.
                    animation: revealed ? "none" : `vt-fadeup 0.5s var(--v-ease) ${0.06 + i * 0.08}s both`,
                  }}>
                  <span aria-hidden="true" style={{
                    width: 26, height: 26, borderRadius: R.xs, display: "grid", placeItems: "center", flexShrink: 0,
                    background: lit ? "#14261b" : C.surfaceRaised,
                    border: `1px solid ${lit ? "#234a2f" : wrong ? C.down : C.edgeStrong}`,
                    color: lit ? C.accentText : wrong ? C.down : C.faint,
                    fontFamily: MONO, fontSize: lit || wrong ? 12 : 11,
                  }}>{lit ? "✓" : wrong ? "✕" : String.fromCharCode(65 + i)}</span>
                  {/* Mono for a value, sans for a sentence. A short numeric
                      answer is a number and reads as one; a clause set in mono
                      is the flatness the redesign exists to undo. */}
                  <span style={lesson.numeric
                    ? { fontFamily: MONO, fontSize: 16, fontWeight: 700, color: lit ? C.accentText : C.text }
                    : { fontFamily: SANS, fontSize: 14, lineHeight: 1.45, color: lit ? C.accentText : C.text }}>{c}</span>
                  {lit && (
                    <span style={{ marginLeft: "auto", color: C.accentText, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>
                      {choice === lesson.answer
                        ? t("Correct · +{n}").replace("{n}", String(POINTS_PER_ANSWER))
                        : t("The answer")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {revealed && (
            <div style={{ display: "flex", alignItems: "center", gap: 14, background: C.surfaceAlt, border: `1px solid ${C.edge}`, borderRadius: R.lg, padding: "14px 16px", marginTop: 16, flexWrap: "wrap" }}>
              <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: R.xs, background: C.surfaceRaised, display: "grid", placeItems: "center", color: C.accentText, fontFamily: MONO, fontSize: 13, flexShrink: 0 }}>i</span>
              <span style={{ color: C.muted, fontSize: 13, lineHeight: 1.45, flex: "1 1 240px", minWidth: 0 }}>{lesson.explain}</span>
              <button onClick={onNext} className="vt-sheen" style={{ ...sheen, marginLeft: "auto", fontSize: 13, padding: "10px 20px", whiteSpace: "nowrap" }}>
                {step >= total - 1 ? t("Finish →") : t("Next →")}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- the lesson ----
  return (
    <div className="v-gamepanel" style={{ fontFamily: SANS, background: C.base, color: C.text }}>
      <div style={HEAD}>
        {numTile(lessonNo(step))}
        <span style={{ fontWeight: 700, fontSize: 14.5 }}>{t("Stock School")}</span>
        {/* Only while sound is actually coming out. */}
        {reading && (
          <span style={{ display: "flex", alignItems: "center", gap: 7, background: C.surface, border: `1px solid ${C.edge}`, borderRadius: 20, padding: "4px 11px", fontFamily: MONO, fontSize: 11.5, color: C.accentText }}>
            <Waveform bars={3} height={11} />
            {t("READING")}
          </span>
        )}
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>{backBtn}{closeBtn}</span>
      </div>

      <div className="v-schoolhud" style={{ display: "flex", alignItems: "center", gap: 20, padding: "14px 22px", borderBottom: `1px solid ${C.edge}`, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={railLabel}>{t("LESSON")}</span>
            <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700 }}>
              {step + 1}<span style={{ color: FIELD.quinary }}>/{total}</span>
            </span>
            <span style={{ color: C.faint, fontSize: 12.5 }}>· {lesson.title}</span>
          </div>
          <div aria-hidden="true" style={{ display: "flex", gap: 4, marginTop: 8 }}>
            {lessons.map((_, i) => (
              <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? C.accent : C.edge }} />
            ))}
          </div>
        </div>
        <div style={{ width: 120, flexShrink: 0, background: C.surface, border: `1px solid ${C.edgeStrong}`, borderRadius: R.lg, padding: "8px 12px", textAlign: "center" }}>
          <div style={railLabel}>{t("SCORE")}</div>
          {/* The COUNT is the stored truth; the points are it times twenty, so
              the "+20" on the quiz can never disagree with the total it lands
              in. */}
          <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{points(score)}</div>
        </div>
        <div style={{ width: 120, flexShrink: 0, textAlign: "right" }}>
          <div style={railLabel}>{t("TIME")}</div>
          <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}><ElapsedClock since={startedAt} /></div>
        </div>
      </div>

      <div className="v-schoolbody" style={{ display: "flex", alignItems: "stretch" }}>
        {/* 9s, not the class's 10s. The handoff varies this per surface — 6s on
            the battlefield, 9s down the chess board and this lesson — and says
            so: the keyframes are shared, the duration belongs to the call
            site. */}
        <div className="vt-scan" style={{ flex: 1, minWidth: 0, position: "relative", padding: "24px 20px 24px 22px", overflow: "hidden", animationDuration: "9s" }}>
          <div style={{ position: "relative" }}>
            <div style={{ ...railLabel, letterSpacing: "2px" }}>{t("LESSON")} {lessonNo(step)}</div>
            <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.033em", marginTop: 6, lineHeight: 1.15 }}>{lesson.title}</div>
            <div style={{ color: C.muted, fontSize: 15, lineHeight: 1.65, marginTop: 12, maxWidth: 560, textWrap: "pretty" }}>{lesson.teach}</div>

            <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
              {(lesson.takeaways || []).map((tk, i) => (
                <div key={tk.label} style={{ flex: "1 1 200px", background: C.surface, border: `1px solid ${C.edge}`, borderRadius: R.lg, padding: "14px 16px", animation: `vt-fadeup 0.5s var(--v-ease) ${0.06 + i * 0.08}s both` }}>
                  <div style={{ ...railLabel, color: C.accentText }}>{tk.label}</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 7, color: C.textBody }}>{tk.text}</div>
                </div>
              ))}
            </div>

            {/* Three of the eight lessons have no arithmetic in them, and they
                get no panel. Inventing a sum to fill this box would teach a
                calculation that does not exist. */}
            {lesson.worked && (
              <div style={{ background: C.surfaceAlt, border: `1px solid ${C.edge}`, borderRadius: R.lg, padding: "16px 18px", marginTop: 14, animation: "vt-fadeup 0.5s var(--v-ease) 0.22s both" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={railLabel}>{t("WORKED EXAMPLE")}</span>
                  <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, color: FIELD.quinary }}>{lesson.worked.note}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
                  {lesson.worked.parts.map((p, i) => (
                    <React.Fragment key={p.label}>
                      {i > 0 && <span aria-hidden="true" style={{ color: FIELD.quinary, fontSize: 17 }}>{lesson.worked.ops[i - 1]}</span>}
                      <div>
                        <div style={{ color: C.faint, fontSize: 11.5 }}>{p.label}</div>
                        <div style={{ fontFamily: MONO, fontSize: 19, fontWeight: 700, marginTop: 2, color: i === lesson.worked.parts.length - 1 ? C.accentText : C.text }}>{p.value}</div>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
              <button onClick={onToQuiz} className="vt-sheen" style={{ ...sheen, fontSize: 14, padding: "12px 24px" }}>{t("Quiz me →")}</button>
              <button onClick={onToggleRead} className="v-outline" style={{ ...outline, display: "inline-flex", alignItems: "center", gap: 8 }}>
                <Waveform bars={3} height={12} color={C.muted} still={!reading} />
                {reading ? t("Stop reading") : t("Read again")}
              </button>
              {step < total - 1 && <button onClick={onNext} className="v-outline" style={outline}>{t("Skip ahead")}</button>}
            </div>
          </div>
        </div>

        <div className="v-schoolrail" style={{ width: 292, flexShrink: 0, borderLeft: `1px solid ${C.edge}`, padding: "22px 22px 22px 18px", display: "flex", flexDirection: "column", gap: 15 }}>
          <div>
            <div style={railLabel}>{t("SYLLABUS")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 9 }}>
              {lessons.slice(win.from, win.to).map((l, k) => {
                const i = win.from + k, here = i === step, ahead = i > step;
                return (
                  <button key={l.title} onClick={() => onJump?.(i)} className="v-syllabus"
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", cursor: "pointer",
                      background: here ? C.surface : "transparent",
                      border: `1px solid ${here ? C.accent : "transparent"}`,
                      borderRadius: 9, padding: "9px 11px", opacity: ahead ? 0.6 : 1,
                    }}>
                    <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 6, display: "grid", placeItems: "center", flexShrink: 0, fontFamily: MONO, fontSize: 10, fontWeight: here ? 700 : 400, background: here ? "#14261b" : C.surfaceRaised, color: here ? C.accentText : ahead ? FIELD.quinary : C.faint }}>
                      {lessonNo(i)}
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: here ? 600 : 400, color: here ? C.text : ahead ? C.faint : C.muted, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.title}</span>
                    {here && <span aria-hidden="true" className="v-pulse" style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: C.accent, flexShrink: 0 }} />}
                  </button>
                );
              })}
              {win.hidden > 0 && (
                <div style={{ color: FIELD.quinary, fontSize: 11.5, padding: "4px 11px" }}>
                  {t("+ {n} more").replace("{n}", String(win.hidden))}
                </div>
              )}
            </div>
          </div>

          <div>
            <div style={railLabel}>{t("TERMS FROM THIS LESSON")}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
              {(lesson.terms || []).map(term => (
                <span key={term} style={{ background: C.surface, border: `1px solid ${C.edge}`, borderRadius: 20, padding: "5px 11px", fontFamily: MONO, fontSize: 11, color: C.muted }}>{term}</span>
              ))}
            </div>
          </div>

          <div style={{ marginTop: "auto" }}>
            <div style={railLabel}>{t("NARRATION")}</div>
            <Narration
              progressRef={progressRef}
              speaking={reading}
              label={reading ? t("Stop reading") : t("Read again")}
              onToggle={onToggleRead}
              playingLine={t("{name} is reading this lesson aloud.").replace("{name}", anchorName)}
              idleLine={t("Press play to hear the lesson read aloud.")}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
