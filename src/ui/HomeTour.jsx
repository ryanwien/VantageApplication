// ============================================================
//  HomeTour.jsx — the whole product in thirty seconds, on request.
//
//  WHY IT SITS BETWEEN THE BAND AND THE PRICES
//  Because of how it ends. The last frame is the mark over "Seven days free."
//  and the next section is the plans, every one of which opens with the same
//  seven days. The video hands off to the page rather than stopping dead, so
//  this is the one position where its ending is doing work.
//
//  WHY IT IS CLICK TO PLAY AND THE BAND IS NOT
//  These two look alike and behave nothing alike, on purpose.
//
//    HomeBand   12s, 1.18 MB, silent, loops forever, starts by itself.
//               Ambient proof. Nobody is asked to watch it, so it must not
//               ask for anything: no controls beyond a pause, no decision.
//
//    HomeTour   30s, 1.93 MB, linear, ends. A thing you sit and watch.
//
//  A 30-second linear piece that starts itself is an advert playing at
//  someone. Worse, autoplaying it would spend 1.93 MB on every visitor who
//  scrolls past, which is most of them. Nothing is fetched here until the
//  poster is clicked: the <video> element does not exist before then, so
//  there is no src to speculatively load and no preload policy to argue with.
//  Scroll past and you pay for the 70 kB poster.
//
//  WHY prefers-reduced-motion DOES NOT DISABLE THIS
//  HomeBand checks it and refuses to render a video at all, which is right for
//  something that moves on its own. This moves because somebody pressed play.
//  Reduced motion is a request not to be moved at without asking; it is not a
//  request to have functionality removed after asking. Honouring it here would
//  mean a play button that does nothing.
//
//  THERE IS NO TEXT VERSION ON THE PAGE
//  There was: a "Read it instead" disclosure carrying the clip's seven scenes.
//  It was removed as a design call. Worth knowing what that costs — the clip
//  has no audio track and every word in it is on screen, which makes it
//  prerecorded video-only content under WCAG 1.2.1, and that asks for an
//  equivalent in text. Nothing here provides one now. If it is wanted back
//  without the visible row, the cheapest form is a visually-hidden list
//  referenced by the video's aria-describedby.
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from "react";
import { C, MONO, SANS } from "./theme.js";

const SRC = "/explainer.mp4";
const POSTER = "/explainer-poster.jpg";

export default function HomeTour({ t = (x) => x }) {
  const [started, setStarted] = useState(false);
  const vid = useRef(null);

  const start = useCallback(() => setStarted(true), []);

  // `autoPlay` alone should do it — the element mounts inside the activation
  // the click established, and a clip with no audio track is not subject to
  // the muted-autoplay rule. play() is here for the case where a browser
  // disagrees; if it also refuses, the controls and poster are already there
  // and the reader presses play a second time rather than seeing nothing.
  useEffect(() => {
    if (!started) return;
    const v = vid.current;
    if (v) v.play().catch(() => {});
  }, [started]);

  return (
    <section id="home-tour" className="v-tour" aria-labelledby="tour-heading">
      <p className="v-scrollin" style={{
        margin: 0, textAlign: "center", fontFamily: MONO, fontSize: 12,
        fontWeight: 500, letterSpacing: "0.14em", color: C.accentText,
        textTransform: "uppercase",
      }}>{t("The short version")}</p>

      <h2 id="tour-heading" className="v-scrollin v-tour-h">{t("Thirty seconds, end to end.")}</h2>

      <p className="v-scrollin v-tour-sub" style={{ fontFamily: SANS }}>
        {t("Everything above, in the order you would actually do it. No sound — nothing to turn down.")}
      </p>

      <div className="v-tour-frame v-scrollin">
        {started ? (
          <video
            ref={vid}
            src={SRC}
            poster={POSTER}
            controls
            autoPlay
            playsInline
            className="v-tour-vid"
            // Not aria-hidden, unlike the band's clip: that one is decoration
            // beside its own headline, this one is the content of the section.
            aria-label={t("A thirty-second tour of Vantage")}
          />
        ) : (
          <button type="button" onClick={start} className="v-tour-play"
            aria-label={t("Play the thirty-second tour")}>
            <img className="v-tour-poster" src={POSTER} alt="" loading="lazy" />
            <span className="v-tour-scrim" aria-hidden="true" />
            <span className="v-tour-disc" aria-hidden="true">
              <svg width="19" height="21" viewBox="0 0 19 21">
                <path d="M2.4 1.8 L17 10.5 L2.4 19.2 Z" fill="currentColor"
                  strokeLinejoin="round" strokeWidth="2.6" stroke="currentColor" />
              </svg>
            </span>
            {/* The length, up front. A play button with no duration on it is a
                request for an unknown amount of someone's time. */}
            <span className="v-tour-badge" aria-hidden="true">{t("30 sec")}</span>
          </button>
        )}
      </div>
    </section>
  );
}
