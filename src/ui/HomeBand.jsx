// ============================================================
//  HomeBand.jsx — the beat between the demo and the price list.
//
//  WHAT IS PLAYING
//  The desk working, on a twelve-second loop: a ticker typed, the quote
//  resolving, the sparkline drawing, the answer arriving with its sources, an
//  alert firing, then everything clearing back to an empty command bar.
//
//  WHAT THIS USED TO BE
//  An mp4. Before that, an AI-generated broadcast studio, which was replaced
//  because it looked like a stock library, said nothing about the product, and
//  could not be made to loop — a model cannot be asked to end exactly where it
//  began. The authored clip that replaced it could, and measured a 59.73 dB
//  loop seam against the generated version's 35.87.
//
//  This is the end of that argument rather than another round of it. The seam
//  is not 59.73 dB now, it is not a number at all: there is no encode, no
//  first frame and no last frame to compare. A CSS animation on a twelve
//  second cycle returns to its own start because that is what a cycle is.
//
//  WHAT WENT WITH IT
//  777 kB of mp4 and 31 kB of poster, and every line of machinery they needed:
//  an IntersectionObserver to defer the fetch, preload="none", an explicit
//  load() to win a race against resource selection, a play()/pause() effect,
//  and a poster deliberately lifted from 6.4s because frame 0 is an empty
//  command bar and under reduced motion the poster WAS the entire piece.
//
//  That last problem is worth reading twice, because it is the one this
//  rewrite could most easily have got wrong. The blanket reduced-motion rule
//  in global.css collapses animations to 0.01ms, and an element that animates
//  from hidden to shown to cleared would land on its LAST keyframe — cleared.
//  A reader who asked for less motion would get an empty desk. So the
//  animations live inside @media (prefers-reduced-motion: no-preference) and
//  the base state below is the finished picture: typed, quoted, drawn,
//  answered, alerted. Motion is added to a complete thing rather than being
//  the only route to it.
//
//  WHY THE PAUSE BUTTON STAYED
//  WCAG 2.2.2: anything that moves by itself for more than five seconds needs
//  a mechanism to stop it, and this loops forever. It sets a class that pauses
//  the animations where they stand — `animation-play-state: paused` holds the
//  current frame, which is what a pause should do. Under reduced motion
//  nothing is moving, so global.css hides the button rather than offering to
//  stop something that is already stopped.
// ============================================================
import React, { useCallback, useState } from "react";
import { C, MONO, SANS } from "./theme.js";

// A shape, not data. Flat-topped bars and a plausible line would read as a
// real session and invite somebody to check it against the tape at the top of
// the page, which shows a different day.
const SPARK = [26, 31, 22, 40, 34, 52, 45, 60, 53, 68, 62, 78, 72, 84];
const POINTS = SPARK.map((y, i) => `${(i / (SPARK.length - 1)) * 420},${y}`).join(" ");

export default function HomeBand({ t = (x) => x }) {
  const [playing, setPlaying] = useState(true);
  const toggle = useCallback(() => setPlaying(p => !p), []);

  return (
    <section className="v-band" aria-labelledby="band-line">
      <div className="v-band-inner">
        <span className="v-band-pill">
          <span className="vt-pulse" aria-hidden="true"
            style={{ width: 7, height: 7, borderRadius: "50%", background: C.accent }} />
          {t("On air")}
        </span>
        <h2 id="band-line" className="v-band-h">{t("The desk doesn't go home.")}</h2>
        <p className="v-band-sub">
          {t("Ask at any hour. It reads the session, cites what it used, and tells you when it doesn't know.")}
        </p>

        <div className="v-band-frame">
          {/* aria-hidden, unlike the tour: that one IS the content of its
              section and is reachable step by step from a rail. This is
              decoration beside a headline that already says the same thing,
              and every string in it is repeated in the prose above and in the
              showcase below. Announcing it would read the same three claims a
              third time. */}
          <div className={"v-band-stage" + (playing ? "" : " is-paused")} aria-hidden="true">
            <div className="v-band-desk">

              {/* the command bar */}
              <div className="v-band-cmd">
                <span className="v-band-caretrow">
                  <span className="v-band-prompt">&gt;</span>
                  <span className="v-band-typed">amd</span>
                  <span className="v-band-caret" />
                </span>
                <span className="v-band-clock">16:02</span>
              </div>

              {/* the quote */}
              <div className="v-band-quote">
                <span className="v-band-sym">AMD</span>
                <span className="v-band-px">158.90</span>
                <span className="v-band-dn">−0.84%</span>
              </div>

              {/* the session */}
              <div className="v-band-spark">
                <svg viewBox="0 0 420 96" preserveAspectRatio="none">
                  <polyline
                    className="v-band-line"
                    points={POINTS}
                    fill="none" stroke={C.down} strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              </div>

              {/* the answer, and what it read to get there */}
              <div className="v-band-answer">
                <p>{t("Down 0.84% on light volume. Support held at 156.")}</p>
                <span className="v-band-chips">
                  <span className="v-pill v-pill-source v-band-chip1">quote · 16:00</span>
                  <span className="v-pill v-pill-source v-band-chip2">P&amp;F · daily</span>
                </span>
              </div>

              {/* the alert, arriving on its own */}
              <div className="v-band-alert">
                <span className="v-band-adot" />
                <b>{t("Alert fired")}</b>
                <span style={{ fontFamily: MONO }}>NVDA &lt; 126.00</span>
              </div>
            </div>
          </div>

          <button type="button" onClick={toggle} className="v-band-toggle"
            aria-label={playing ? t("Pause the loop") : t("Play the loop")}
            style={{ fontFamily: SANS }}>
            {playing ? (
              <svg width="13" height="14" viewBox="0 0 13 14" aria-hidden="true">
                <rect x="1" y="1" width="3.6" height="12" rx="1.1" fill="currentColor" />
                <rect x="8.4" y="1" width="3.6" height="12" rx="1.1" fill="currentColor" />
              </svg>
            ) : (
              <svg width="13" height="14" viewBox="0 0 13 14" aria-hidden="true">
                <path d="M2 1.6 L12 7 L2 12.4 Z" fill="currentColor" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
