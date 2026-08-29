// ============================================================
//  HomeBand.jsx — the beat between the demo and the price list.
//
//  WHAT IS PLAYING
//  A motion graphic of the desk working: a ticker typed, the quote resolving,
//  the sparkline drawing, the answer arriving with its sources, an alert
//  firing, then everything clearing. Authored in HyperFrames as HTML and
//  rendered to MP4 — not generated footage.
//
//  WHY AUTHORED FOOTAGE REPLACED THE GENERATED KIND
//  This slot used to hold an AI-generated broadcast studio. It was atmosphere:
//  it looked like a stock library, said nothing about the product, and could
//  not be made to loop. Three measurements decided it.
//
//    loop seam (PSNR of first frame against last, higher = more identical)
//      generated studio   35.87 dB   visibly different frames
//      authored graphic   59.73 dB   identical bar compression noise
//
//    weight   2.31 MB → 1.02 MB
//    subject  a room nobody works in → the product doing the thing it claims
//
//  A model cannot be asked to end exactly where it began. An authored timeline
//  can, because frame 0 and frame 360 are both just the resting state, so the
//  loop is closed by construction rather than concealed.
//
//  WHICH IS WHY THIS FILE IS HALF THE SIZE IT WAS
//  The previous version ran two copies of the clip and cross faded them, so
//  the generated seam happened underneath a 0.8s dissolve. That machinery —
//  a second video, a `front` index, a timeupdate handler, an opacity
//  transition — existed only to hide a defect that no longer exists. It is
//  gone. `<video loop>` is now simply true.
//
//  WHY THE PAUSE BUTTON STAYED
//  WCAG 2.2.2: anything that moves by itself for more than five seconds needs
//  a mechanism to stop it, and this loops forever. That was true of the studio
//  clip and is true of this one.
//
//  WHY THE POSTER IS NOT FRAME 0
//  Frame 0 is the resting state — an empty command bar. It is the honest
//  first frame but a poor still, and under prefers-reduced-motion the poster
//  is the ENTIRE piece. So the poster is lifted from 6.4s, where the quote,
//  the answer, its sources and the alert are all on screen. The cost is one
//  cut when playback starts; the gain is that a reader who never sees motion
//  still sees the product.
//
//  WHAT IT COSTS AND WHEN
//  1.02 MB, and nothing is fetched until an IntersectionObserver says the
//  section is within 300px: `preload="none"`, no `src` before that, paused on
//  leaving. Scroll past and you pay for the 33 kB poster alone.
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { C } from "./theme.js";

const SRC = "/desk-loop.mp4";
const POSTER = "/desk-poster.jpg";

export default function HomeBand({ t = (x) => x }) {
  const reduce = useReducedMotion();
  const [near, setNear] = useState(false);
  const [playing, setPlaying] = useState(true);
  const wrap = useRef(null);
  const vid = useRef(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el || reduce || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: "300px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [reduce]);

  // `preload="none"` means React assigning `src` does NOT start a fetch, and
  // calling play() before the element has run resource selection silently does
  // nothing — no error, no rejected promise, just a video that never starts.
  // One explicit load() turns that race into a sequence. Declared before the
  // play effect so it runs first on the render where `near` flips.
  useEffect(() => {
    if (reduce || !near) return;
    const v = vid.current;
    if (v && v.readyState === 0) v.load();
  }, [near, reduce]);

  useEffect(() => {
    if (reduce) return;
    const v = vid.current;
    if (!v) return;
    if (near && playing) v.play().catch(() => {});   // refused autoplay leaves the poster up
    else v.pause();
  }, [near, playing, reduce]);

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
          {/* The whole picture under reduced motion, and what shows while the
              clip loads or if autoplay is refused. */}
          <img src={POSTER} alt="" aria-hidden="true" style={fill} />

          {!reduce && (
            <video
              ref={vid}
              src={near ? SRC : undefined}
              poster={POSTER}
              loop
              muted
              playsInline
              preload="none"
              aria-hidden="true"
              style={fill}
            />
          )}

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
