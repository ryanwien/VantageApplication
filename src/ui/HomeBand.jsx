// ============================================================
//  HomeBand.jsx — a full-bleed pause between the demo and the price list.
//
//  WHY IT IS HERE
//  The page ran showcase straight into a 1266px price table. This is the beat
//  between being shown the product and being asked to pay for it, and it is
//  the one place on the page where the product's actual claim — a desk that is
//  always on air — gets said plainly rather than demonstrated.
//
//  WHY THE VIDEO LOOPS THE WAY IT DOES
//  A generated clip does not loop. Measured on this one: the last frame differs
//  from the first by an average of 3/255 and by as much as 75/255 on individual
//  pixels, so `<video loop>` would jump visibly every five seconds forever.
//  Seedance can be given the same frame as both start and end, which would fix
//  it at the source, but that mode needs a Higgsfield plan above this account's.
//
//  So the seam is hidden rather than removed: two copies of the clip, and as
//  the front one nears its end the back one starts from zero and they cross
//  fade. The discontinuity still happens, underneath a 0.8s dissolve, which is
//  the same trick broadcast has used for cuts since tape. Cost is one extra
//  decode during the overlap.
//
//  WHY THE SCRIM IS 0.62 AND NOT A TASTEFUL 0.2
//  Because the clip is not as dark as it looks. Its brightest pixel measures
//  0.3212 relative luminance, and #e6e8eb over that is 2.25:1 — text you
//  cannot read, on the one line of copy this section exists to deliver. At
//  0.62 the brightest composite lands near 8:1. The scrim is doing legibility
//  work, not mood work; thin it and you must re-measure before shipping.
//
//  WHAT IT COSTS AND WHEN
//  1.55 MB, which is seven times the JS bundle and would be indefensible in
//  the app. This is a marketing page a visitor sees once, and the file is not
//  fetched until the band is actually approached: `preload="none"`, no `src`
//  at all until an IntersectionObserver says the section is near, and both
//  videos pause the moment it leaves. A reader who never scrolls this far pays
//  nothing for it.
//
//  REDUCED MOTION
//  No video element is created at all — not paused, not muted, not loaded. The
//  poster frame stays, the copy stays, and 1.55 MB is never requested. The
//  preference is about movement, and the honest reading of it here is that the
//  moving version is simply not for this reader.
// ============================================================
import React, { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { C, MONO, SANS, R } from "./theme.js";

const SRC = "/studio-loop.mp4";
const POSTER = "/studio-poster.jpg";

// Long enough to dissolve a hard cut, short enough that the overlap — the only
// moment two videos decode at once — stays brief.
const FADE = 0.8;

export default function HomeBand({ t = (x) => x }) {
  const reduce = useReducedMotion();
  const [near, setNear] = useState(false);   // has the reader come close enough to load
  const [front, setFront] = useState(0);     // which copy is currently visible
  const wrap = useRef(null);
  const vids = [useRef(null), useRef(null)];

  // rootMargin buys the fetch a screen of runway, so the clip is usually
  // decodable by the time the band is actually looked at.
  useEffect(() => {
    const el = wrap.current;
    if (!el || reduce || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: "300px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [reduce]);

  // Play only while near. Leaving the band pauses both copies rather than
  // leaving a decoder running behind the price table.
  useEffect(() => {
    if (reduce) return;
    const [a, b] = vids.map((r) => r.current);
    if (!a || !b) return;
    if (!near) { a.pause(); b.pause(); return; }
    const f = vids[front].current;
    if (f) f.play().catch(() => {});   // a blocked autoplay leaves the poster up, which is a fine outcome
  }, [near, front, reduce]);

  // The swap. `timeupdate` fires about four times a second — coarse, but the
  // thing it schedules is an 0.8s dissolve, so a 250ms margin of error is
  // invisible. A rAF loop here would be more precise and would also run sixty
  // times a second for the entire time the band is on screen.
  const onTime = (i) => () => {
    if (i !== front) return;
    const cur = vids[i].current;
    if (!cur || !cur.duration) return;
    if (cur.currentTime < cur.duration - FADE) return;
    const other = vids[1 - i].current;
    if (!other) return;
    other.currentTime = 0;
    other.play().catch(() => {});
    setFront(1 - i);
  };

  const media = {
    position: "absolute", inset: 0, width: "100%", height: "100%",
    objectFit: "cover", pointerEvents: "none",
  };

  return (
    <section ref={wrap} className="v-band" aria-labelledby="band-line">
      <div className="v-band-media" aria-hidden="true">
        {/* Always present, and the only visual under reduced motion. Also what
            shows if autoplay is refused or the network is slow. */}
        <img src={POSTER} alt="" style={media} />

        {!reduce && [0, 1].map((i) => (
          <video
            key={i}
            ref={vids[i]}
            src={near ? SRC : undefined}
            poster={POSTER}
            muted
            playsInline
            preload="none"
            onTimeUpdate={onTime(i)}
            className="v-band-vid"
            style={{ ...media, opacity: front === i ? 1 : 0 }}
          />
        ))}

        <div className="v-band-scrim" />
      </div>

      <div className="v-band-inner">
        <span className="v-band-pill">
          <span className="vt-pulse" aria-hidden="true"
            style={{ width: 7, height: 7, borderRadius: "50%", background: C.accent }} />
          {t("On air")}
        </span>
        <p id="band-line" className="v-band-h">{t("The desk doesn't go home.")}</p>
        <p className="v-band-sub">
          {t("Ask at any hour. It reads the session, cites what it used, and tells you when it doesn't know.")}
        </p>
      </div>
    </section>
  );
}
