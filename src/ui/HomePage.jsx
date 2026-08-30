// ============================================================
//  HomePage — the marketing page a signed-out visitor lands on.
//
//  WHAT IT IS
//  The one screen in the redesign handoff that had no counterpart in the app
//  at all. Every visitor previously arrived at the auth gate: a form, before
//  anything had said what the product is. This is what goes in front of it.
//
//  Layout follows the reference top to bottom — nav, ticker tape, hero,
//  features, plans, footer note — at the handoff's 1200px measure.
//
//  THE TRIAL
//  This page used to carry a deliberate departure from the reference. The
//  reference sold a 7-day trial — "Start 7-day free trial", "7 days free, then
//  $12/mo", card up front, charged on day 8 — and the product had a genuinely
//  free Explorer tier and no code that charged anyone on day 8, so rendering
//  that copy would have put a false pricing promise on the front door. The note
//  left here said the trial model would be "a billing change first and a copy
//  change second".
//
//  It is now both, in that order. There is no free tier; all three plans are
//  paid; the server adds trial_period_days to the Stripe Checkout session, so
//  the day-8 charge on this page is the one Stripe actually makes. The
//  reference's copy is back because it finally describes the product.
//
//  The one thing this page will not borrow is the reference's "We take payment
//  details up front" — this app has no card form and never will, and what is
//  true instead (they are entered on Stripe's page) is the better sentence
//  anyway.
//
//  MOTION
//  Uses the eight named animations from the handoff (vt-marquee, vt-fadeup,
//  vt-pulse, vt-draw, vt-float1/2, vt-sheen, vt-bob, vt-bars), all of which
//  live in global.css and all of which are silenced by the blanket
//  prefers-reduced-motion rule there.
// ============================================================

import React from "react";
import { C, GRAD, MONO, SANS, TYPE, R, SHADOW, button } from "./theme.js";
import VantageMark from "./VantageMark.jsx";
import HeroPlate from "./HeroPlate.jsx";
import HomeShowcase from "./HomeShowcase.jsx";
import HomeBand from "./HomeBand.jsx";
import HomeTour from "./HomeTour.jsx";
import HomeFaq from "./HomeFaq.jsx";

// The tape. Static numbers on purpose: this is a marketing page, and wiring it
// to the live market would mean opening a quote subscription for a visitor who
// has not asked for one.
const TAPE = [
  ["AAPL", "227.98", -1.14], ["MSFT", "454.12", -0.48], ["NVDA", "124.60", -3.79],
  ["AMD", "158.90", -0.84], ["AMZN", "203.34", 2.42], ["GOOGL", "182.26", 0.6],
  ["META", "572.34", -0.84], ["TSLA", "256.71", 2.07],
];

function Tape() {
  const half = (
    <span style={{ display: "inline-flex", gap: 28, paddingRight: 28 }}>
      {TAPE.map(([sym, px, pct]) => (
        <span key={sym} style={{ display: "inline-flex", gap: 7, alignItems: "baseline", whiteSpace: "nowrap" }}>
          <b style={{ fontFamily: MONO, fontWeight: 700, color: C.text }}>{sym}</b>
          <span style={{ fontFamily: MONO, color: C.muted }}>{px}</span>
          <span style={{ fontFamily: MONO, color: pct >= 0 ? C.up : C.down }}>
            {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
          </span>
        </span>
      ))}
    </span>
  );
  // No rules above and below. Two hairlines 38px apart, with the nav carrying
  // no border of its own, drew a box around the tape and read as a seam across
  // the top of the page rather than as one of its surfaces. The band separates
  // itself without them: it is full-bleed where everything else is inset, it is
  // the only mono text up here, and it moves.
  return (
    <div style={{
      background: C.surface,
      padding: "9px 0", overflow: "hidden", fontSize: 12,
    }}>
      {/* Duplicated so the -50% translate loops without a seam. The copy is
          aria-hidden: a screen reader should hear this list once. */}
      <div className="vt-marquee" style={{ display: "inline-flex", width: "max-content" }}>
        {half}
        <span aria-hidden="true" style={{ display: "inline-flex" }}>{half}</span>
      </div>
    </div>
  );
}

// The hero's right-hand card: the product, mid-sentence. It is a still rather
// than a live desk, but every part of it is a real surface from the app at the
// app's own sizes.
function BroadcastCard({ t }) {
  return (
    <div className="vt-fadeup" style={{ position: "relative", animationDelay: "0.12s" }}>
      <div style={{
        background: C.surface, border: `1px solid ${C.edgeStrong}`, borderRadius: R.xl,
        padding: 18, boxShadow: SHADOW.xl,
      }}>
        {/* command bar, mid-type */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: C.base, border: `1px solid ${C.edgeStrong}`, borderRadius: R.md, padding: "13px 15px",
        }}>
          <span style={{ fontFamily: MONO, color: C.faint }}>&gt;</span>
          <span style={{ fontFamily: MONO, fontSize: 14.5, color: C.text }}>amd</span>
          <span className="vt-pulse" aria-hidden="true"
            style={{ width: 1.5, height: 17, background: C.accent, animationTimingFunction: "steps(1)" }} />
        </div>

        {/* the quote */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
          <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 24, letterSpacing: "-0.015em" }}>AMD</span>
          <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 34, letterSpacing: "-0.02em" }}>158.90</span>
          <span style={{ fontFamily: MONO, fontSize: 14, color: C.down }}>−0.84%</span>
        </div>

        {/* the session, drawing itself in */}
        <svg viewBox="0 0 420 96" preserveAspectRatio="none" role="img" aria-label={t("AMD session, down 0.84%")}
          style={{ width: "100%", height: 96, display: "block", marginTop: 12 }}>
          <polyline
            points="0,26 34,32 68,22 102,44 136,38 170,58 204,50 238,66 272,58 306,74 340,68 374,84 420,78"
            fill="none" stroke={C.down} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ strokeDasharray: 1400, animation: "vt-draw 2.6s var(--v-ease) both" }} />
        </svg>

        <div style={{ borderTop: `1px solid ${C.edge}`, margin: "16px 0 14px" }} />

        {/* on air */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="vt-bars" aria-hidden="true" style={{ display: "flex", alignItems: "flex-end", gap: 2.5, height: 16 }}>
            {[60, 100, 45, 80].map((h, i) => (
              <span key={i} style={{ width: 3, height: `${h}%`, background: C.accent, borderRadius: 2 }} />
            ))}
          </span>
          <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: C.accentText }}>{t("On air")}</span>
          <span style={{ fontFamily: SANS, fontSize: 12, color: C.faint }}>
            {t("{who} is reading this answer").replace("{who}", "Sterling")}
          </span>
        </div>
        <div style={{ fontFamily: SANS, fontSize: 14.5, lineHeight: 1.65, color: C.text, marginTop: 10 }}>
          {t("Down 0.84% on light volume. Support held at 156.")}
        </div>
      </div>

      {/* The chip overlaps the card's corner on purpose — it is the one element
          that breaks the rectangle, which is what makes the card read as a
          window onto something running rather than as a screenshot. */}
      <div className="vt-bob v-homechip" style={{
        position: "absolute", right: -26, bottom: -22,
        display: "flex", alignItems: "center", gap: 9,
        background: C.surfaceRaised, border: `1px solid ${C.edgeStrong}`, borderRadius: R.md,
        padding: "10px 14px", boxShadow: SHADOW.lg, whiteSpace: "nowrap",
      }}>
        <span className="vt-pulse" aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: C.warn }} />
        <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: C.text }}>{t("Alert fired")}</span>
        <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>NVDA &lt; 126.00</span>
      </div>
    </div>
  );
}

export default function HomePage({ onStart, onSignIn, plans = [], t = (x) => x }) {
  const navLink = {
    background: "transparent", border: "none", padding: 0, cursor: "pointer",
    fontFamily: SANS, fontSize: 14, color: C.muted,
  };
  // scrollIntoView's `behavior: "smooth"` does NOT consult prefers-reduced-motion
  // — the browser honours that setting for the CSS scroll-behavior property and
  // not for this argument, so it has to be asked here. It matters most on the
  // link this file just gave back to phones: Pricing is a 1578px ride, and
  // animating that for somebody who has asked the OS for no animation is the
  // longest possible way to ignore them.
  const jump = (id) => () => {
    const el = document.getElementById(id);
    if (!el) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  };

  const featureTitles = [t("One command bar"), t("Answers with receipts"), t("Alerts, on air")];
  const featureBodies = [
    t("Type AMD and press Enter. Quote, chart, and a spoken read of the session in one motion."),
    t("Every answer cites the catalog it came from. When the data isn't there, Sterling says so instead of guessing."),
    t("Price triggers and P&F pattern alerts — the anchor reads them the moment they fire."),
  ];

  return (
    <div style={{
      minHeight: "100vh", background: C.base, color: C.text, fontFamily: SANS,
      // Both are for HeroPlate: `relative` gives it something to be absolute
      // against, `isolate` makes its z-index -1 land above this background and
      // below every child rather than behind the page entirely.
      position: "relative", isolation: "isolate",
    }}>
      <HeroPlate />
      {/* ---- nav ---- */}
      {/* No button here: the hero's CTA is the only primary action above the
          fold, which is the whole reason it reads as the thing to do. */}
      <nav className="v-homenav" aria-label={t("Main")}>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <VantageMark size={26} />
          <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 17, letterSpacing: "-0.015em" }}>Vantage</span>
        </span>
        {/* Product and Data are the same link. Both scroll to #home-features —
            there is no separate data section to point at — so on a phone,
            where only one of the three can earn the row, they are the two that
            go. Pricing is the one that goes somewhere else, and it is the one
            worth keeping: see .v-homenav-links in global.css for the distance
            it saves. */}
        <span className="v-homenav-links" style={{ display: "flex", gap: 26 }}>
          <button className="v-navfeat v-taprow" style={navLink} onClick={jump("home-features")}>{t("Product")}</button>
          <button className="v-navfeat v-taprow" style={navLink} onClick={jump("home-features")}>{t("Data")}</button>
          <button className="v-taprow" style={navLink} onClick={jump("home-plans")}>{t("Pricing")}</button>
        </span>
        <button onClick={onSignIn} className="v-taprow" style={{ ...navLink, marginLeft: "auto", color: C.text }}>{t("Sign in")}</button>
      </nav>

      {/* There used to be a scroll-progress hairline pinned across the top of
          the viewport here. It was cut on sight: it is a readout of something
          the reader is already doing — they can see how far down they are by
          looking — and it put a bright accent rule above a top bar whose whole
          job is to be black. The scroll-linked machinery it demonstrated is
          still in use on the hero itself, where it moves something worth
          moving. */}
      <Tape />

      <div className="v-homewrap">
        {/* ---- hero ---- */}
        <header className="v-hero v-aurora" style={{ paddingTop: 66 }}>
          {/* The block used to fade in as one. Each piece now arrives on its
              own, 90ms apart, driven by --i — the eyebrow, then each half of
              the headline, then the sentence, the button and the price. One
              fade of a whole column reads as a slide appearing; six staggered
              ones read as something being said. */}
          <div>
            <span className="v-herostep" style={{ "--i": 0, display: "inline-flex", alignItems: "center", gap: 9 }}>
              {/* The lamp. It strikes AFTER its label lands — two hard steps,
                  because lamps strike, they do not ease — and one ring leaves
                  it. Both run once, at load; the pulse it settles into is the
                  live-state idiom the dot already had. */}
              <span className="v-heroignite" aria-hidden="true">
                <span className="v-heroping" />
                <span className="vt-pulse" style={{ display: "block", width: 6, height: 6, borderRadius: "50%", background: C.accent }} />
              </span>
              <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 500, letterSpacing: "2px", textTransform: "uppercase", color: C.accentText }}>
                {t("An AI news anchor for the markets")}
              </span>
            </span>

            {/* Two lines, and the break is load-bearing: the second line is the
                promise and it takes the accent. Each half is its own key, so a
                translation can put the accent on the right words. The <br/> is
                gone because each half is now its own block-level element — a
                line cannot be revealed separately while it is only a text node.
                Their colour lives in CSS, not here: the sheen paints them with
                a gradient through background-clip, and an inline colour would
                outrank it. */}
            <h1 className="v-herotitle" style={{ margin: "22px 0 0" }}>
              <span className="v-heroline v-heroline-1" style={{ "--i": 1 }}>{t("The market,")}</span>
              <span className="v-heroline v-heroline-2" style={{ "--i": 2 }}>{t("on air.")}</span>
            </h1>

            <p className="v-herostep" style={{ "--i": 3, fontFamily: SANS, fontSize: 18, lineHeight: 1.6, color: C.muted, maxWidth: 460, margin: "20px 0 0" }}>
              {t("Type a ticker and get the quote, the chart and a spoken read of the session — from an anchor that tells you when it doesn't know.")}
            </p>

            {/* The one primary action on the page. Wrapped rather than marked:
                the button already owns its `animation` for the sheen, and a
                second class setting `animation` would replace it outright
                rather than add to it. The wrapper carries the entrance. */}
            <div className="v-herostep" style={{ "--i": 4 }}>
              <button onClick={() => onStart()} className="vt-sheen"
                style={{ ...button("primary", "lg"), marginTop: 26, background: GRAD.sheen, fontWeight: 700, fontSize: 15.5 }}>
                {t("Start 7-day free trial")}
              </button>
            </div>

            {/* The entry price, taken from PLANS rather than typed here, so the
                number under the button cannot drift from the number on the card
                forty lines below it. */}
            <div className="v-herostep" style={{ "--i": 5, fontFamily: SANS, fontSize: 12.5, color: C.faint, marginTop: 12 }}>
              {t("7 days free, then {price}/mo. Cancel before day 8 and you pay nothing.")
                .replace("{price}", plans[0]?.price || "")}
            </div>
          </div>

          {/* The card travels against the hero, which is what parallax is: two
              speeds, not one. The header itself drifts up as it exits; this
              runs its own view() timeline over the whole cover range, so the
              gap between them opens and closes as you scroll. */}
          <div className="v-heroparallax">
            <BroadcastCard t={t} />
          </div>
        </header>

        {/* ---- features ---- */}
        {/* Scroll-triggered rather than vt-fadeup on load, because where these
            sit depends entirely on the viewport: at 1280x900 they are on screen
            when the page arrives, but on a 390px phone the hero alone runs to
            980px and these start at y=1084 — a third of a screen below the
            fold, fading in to nobody. reveal.js already knows the difference,
            so let it decide: shown at once when they are visible, played when
            the reader scrolls to them. The stagger comes from the module too,
            which is why the hand-written animationDelay is gone. */}
        <HomeShowcase
          titles={featureTitles}
          bodies={featureBodies}
          eyebrow={t("How it works")}
          heading={t("Type a ticker. Get a session.")}
        />
      </div>

      {/* ---- the band ---- */}
      {/* Deliberately OUTSIDE .v-homewrap. It is the only full-bleed element on
          the page, and being a sibling of the wrap rather than a child of it is
          what makes that free: no `calc(50% - 50vw)`, which would have run 15px
          wide here because `vw` counts the scrollbar and this page has one. The
          wrap simply reopens underneath. */}
      <HomeBand t={t} />

      <div className="v-homewrap">
        {/* ---- the thirty-second tour ---- */}
        {/* Inside the wrap, unlike the band: the band is the page's one
            full-bleed element and this is a 880px player centred in the 1200px
            measure, the same width the band's own frame runs at. Placed here
            because of how the clip ends — on "Seven days free." — and what
            comes next is the plans, all of which start with those same seven
            days. It hands off rather than stopping. */}
        <HomeTour t={t} />

        {/* ---- plans ---- */}
        {/* Read from the product's real PLANS rather than the reference's, so
            the prices on the front door are the prices in Settings. */}
        {/* The section itself is not marked: revealing it as one slab is a
            single fade for the whole lower half of the page, which is barely
            an animation at all. The heading and each card are marked instead,
            so they arrive in sequence — reveal.js staggers whatever enters in
            the same batch by 70ms, which is what makes it read as arriving
            rather than switching on. */}
        <section id="home-plans" style={{ marginTop: 64 }}>
          <h2 className="v-scrollin" style={{ ...TYPE.displayLg, margin: 0, textAlign: "center" }}>{t("Pick your desk")}</h2>
          <div className="v-homeplans">
            {plans.map(p => {
              const featured = !!p.featured;
              return (
                <div key={p.id} className="v-scrollin" style={{
                  position: "relative",
                  background: C.surface,
                  border: `1px solid ${featured ? C.accent : C.edge}`,
                  borderRadius: R.xl, padding: 26,
                  display: "flex", flexDirection: "column", gap: 14,
                }}>
                  {/* The badge takes the shared pill from global.css rather
                      than nine inline declarations, and it takes the sheen
                      instead of vt-pulse. A badge that pulses forever is a
                      nag — it is not reporting anything, it is asking to be
                      looked at, repeatedly, next to a price. The sheen passes
                      once every six seconds and says the same thing quietly.
                      `position: absolute` is inline on purpose: it has to beat
                      the `relative` .v-pill sets for its own sheen. */}
                  {featured && (
                    <span className="v-pill v-pill-solid v-pill-lit" style={{
                      position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                    }}>{t("POPULAR")}</span>
                  )}
                  <div>
                    <div style={{ fontFamily: SANS, fontSize: 16, fontWeight: 700 }}>{p.label}</div>
                    <div style={{ marginTop: 6 }}>
                      <span style={{ fontFamily: MONO, fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em" }}>{p.price}</span>
                      <span style={{ fontFamily: SANS, fontSize: 13, color: C.faint }}>{p.cadence}</span>
                    </div>
                    <div style={{ fontFamily: SANS, fontSize: 13.5, lineHeight: 1.5, color: C.muted, marginTop: 8 }}>{p.tagline}</div>
                  </div>

                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                    {(p.perks || []).map(perk => (
                      <li key={perk} style={{ display: "flex", gap: 9, fontFamily: SANS, fontSize: 13.5, lineHeight: 1.5, color: C.muted }}>
                        <span aria-hidden="true" style={{ color: C.accentText, flex: "0 0 auto" }}>✓</span>
                        {perk}
                      </li>
                    ))}
                  </ul>

                  <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.accentText }}>{t("7 days free")}</div>
                  {/* Only the featured card takes the fill. Three green buttons
                      in a row is three primaries, which is none.
                      The plan id goes with the click: the label used to read
                      "Choose Trading Floor" and then drop you on a picker with
                      Explorer selected, which is a button that does not do what
                      it says. */}
                  <button onClick={() => onStart(p.id)}
                    style={featured
                      ? { ...button("primary", "md"), width: "100%", fontWeight: 700 }
                      : { ...button("ghost", "md"), width: "100%" }}>
                    {t("Start trial")}
                  </button>
                </div>
              );
            })}
          </div>

          <p style={{ fontFamily: SANS, fontSize: 13, lineHeight: 1.7, color: C.faint, textAlign: "center", maxWidth: 620, margin: "26px auto 0" }}>
            {t("Every plan starts with 7 days free. Card details are entered on Stripe's page, never here — cancel before day 8 and you pay nothing. After that, plans are billed monthly and can be changed or cancelled from Settings at any time.")}
          </p>
        </section>

        {/* ---- faq ---- */}
        {/* After the prices, because that is where the questions arrive. */}
        <HomeFaq t={t} />

        <footer className="v-scrollin" style={{ marginTop: 64, paddingTop: 22, paddingBottom: 48, borderTop: `1px solid ${C.edge}`, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <VantageMark size={20} />
          <span style={{ fontFamily: SANS, fontSize: 13, color: C.faint }}>
            {t("Vantage — an AI market desk. Not investment advice.")}
          </span>
          <button onClick={onSignIn} className="v-taprow" style={{ ...navLink, marginLeft: "auto", color: C.muted }}>{t("Sign in")}</button>
        </footer>
      </div>
    </div>
  );
}
