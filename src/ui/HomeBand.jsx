// ============================================================
//  HomeBand.jsx — the beat between the demo and the price list.
//
//  WHY THE VIDEO IS IN FRONT AND NOT BEHIND
//  The first version put the clip full-bleed behind the copy. That forces a
//  choice nobody wins: the clip's brightest pixel measures 0.3212 relative
//  luminance, and #e6e8eb over that is 2.30:1, so the copy needed a 0.62
//  scrim to be readable at all — and a 0.62 scrim is most of the way to
//  deleting the video. It cost 1.55 MB to render something you had to be told
//  was there.
//
//  In front, that whole trade disappears. Nothing is laid over the picture, so
//  nothing has to be dimmed to protect anything, and the clip plays at full
//  strength in a frame that matches the app's own panels. The copy sits above
//  it on the page background, where it measures against #0b0e13 like every
//  other paragraph here.
//
//  WHY THERE IS A PAUSE BUTTON
//  Not politeness — WCAG 2.2.2. Content that moves automatically for more than
//  five seconds must have a mechanism to stop it, and this loops forever. It
//  was optional while the video was decoration behind a scrim; the moment it
//  became the thing you are meant to look at, it stopped being optional.
//
//  WHY THE LOOP IS TWO VIDEOS
//  A generated clip does not loop. Measured on this one, the last frame differs
//  from the first by 3/255 on average and 75/255 at worst, so `<video loop>`
//  jumps visibly every five seconds — and now that the clip is the foreground
//  at full brightness, that jump is far more obvious than it would have been
//  behind a scrim. Seedance can take the same frame as both start and end,
//  which fixes it at source, but that mode needs a plan above this account's.
//  So two copies cross fade over 0.8s and the cut happens inside the dissolve.
//
//  WHAT IT COSTS AND WHEN
//  1.55 MB, seven times the JS bundle, which would be indefensible inside the
//  app. This is a page seen once, and nothing is fetched until an
//  IntersectionObserver says the section is within 300px: `preload="none"`, no
//  `src` at all before that, both copies paused on leaving. Scroll past without
//  stopping and you pay for the 17 kB poster and nothing else.
//
//  REDUCED MOTION
//  No video element is created — not paused, not muted, not loaded. The poster
//  frame stays and the 1.55 MB is never requested.
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { C } from "./theme.js";

const SRC = "/studio-loop.mp4";
const POSTER = "/studio-poster.jpg";

// Long enough to dissolve a hard cut, short enough that the overlap — the only
// moment two videos decode at once — stays brief.
const FADE = 0.8;

export default function HomeBand({ t = (x) => x }) {
  const reduce = useReducedMotion();
  const [near, setNear] = useState(false);    // close enough to be worth loading
  const [front, setFront] = useState(0);      // which copy is visible
  const [playing, setPlaying] = useState(true);
  const wrap = useRef(null);
  const a = useRef(null);
  const b = useRef(null);
  const vids = [a, b];

  useEffect(() => {
    const el = wrap.current;
    if (!el || reduce || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: "300px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [reduce]);

  useEffect(() => {
    if (reduce) return;
    const els = [a.current, b.current];
    if (!els[0] || !els[1]) return;
    if (!near || !playing) { els.forEach((v) => v.pause()); return; }
    const f = vids[front].current;
    if (f) f.play().catch(() => {});   // refused autoplay just leaves the poster up
  }, [near, front, playing, reduce]);

  // `timeupdate` fires roughly four times a second. Coarse, but what it
  // schedules is an 0.8s dissolve, so 250ms of slack is invisible — and a rAF
  // loop would run sixty times a second for as long as the band is on screen.
  const onTime = (i) => () => {
    if (i !== front || !playing) return;
    const cur = vids[i].current;
    const other = vids[1 - i].current;
    if (!cur || !other || !cur.duration) return;
    if (cur.currentTime < cur.duration - FADE) return;
    other.currentTime = 0;
    other.play().catch(() => {});
    setFront(1 - i);
  };

  const toggle = useCallback(() => setPlaying((p) => !p), []);

  const fill = {
    position: "absolute", inset: 0, width: "100%", height: "100%",
    objectFit: "cover", display: "block",
  };

  return (
    <section ref={wrap} className="v-band" aria-labelledby="band-line">
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
          {/* Always present. It is the whole picture under reduced motion, and
              what shows while the clip loads or if autoplay is refused. */}
          <img src={POSTER} alt="" aria-hidden="true" style={fill} />

          {!reduce && [0, 1].map((i) => (
            <video
              key={i}
              ref={vids[i]}
              src={near ? SRC : undefined}
              poster={POSTER}
              muted
              playsInline
              preload="none"
              aria-hidden="true"
              onTimeUpdate={onTime(i)}
              className="v-band-vid"
              style={{ ...fill, opacity: front === i ? 1 : 0 }}
            />
          ))}

          {!reduce && (
            <button type="button" onClick={toggle} className="v-band-toggle"
              aria-label={playing ? t("Pause the loop") : t("Play the loop")}>
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
          )}
        </div>
      </div>
    </section>
  );
}
