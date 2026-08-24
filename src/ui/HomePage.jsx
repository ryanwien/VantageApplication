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
//  ONE DELIBERATE DEPARTURE, AND IT IS ABOUT HONESTY
//  The reference sells a 7-day trial: "Start 7-day free trial", "7 days free,
//  then $12/mo", card up front, charged on day 8. This product does not do
//  that. PLANS carries a genuinely free Explorer tier, signup takes no card,
//  and nothing in the billing code charges anyone on day 8. Rendering the
//  reference's copy would put a false pricing promise on the front door — a
//  worse outcome than deviating from a mock, and someone's problem later
//  rather than a design decision now.
//
//  So: the reference's layout, type, colour and motion exactly, and the
//  product's real plans and real terms inside them. If the trial model is
//  meant to become real, that is a billing change first and a copy change
//  second.
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

// The tape. Static numbers on purpose: this is a marketing page, and wiring it
// to the live market would mean opening a quote subscription for a visitor who
// has not asked for one.
const TAPE = [
  ["AAPL", "227.98", -1.14], ["MSFT", "454.12", -0.48], ["NVDA", "124.60", -3.79],
  ["AMD", "158.90", -0.84], ["AMZN", "203.34", 2.42], ["GOOGL", "182.26", 0.6],
  ["META", "572.34", -0.84], ["TSLA", "256.71", 2.07],
];

// Numbered rather than mapped over a translated list: the index is part of the
// design, and the copy is spelled out as static t() literals at the call site
// so the i18n audit can see it.
const FEATURE_NOS = ["01", "02", "03"];

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
  return (
    <div style={{
      borderTop: `1px solid ${C.edge}`, borderBottom: `1px solid ${C.edge}`,
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
  const jump = (id) => () => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const featureTitles = [t("One command bar"), t("Answers with receipts"), t("Alerts, on air")];
  const featureBodies = [
    t("Type AMD and press Enter. Quote, chart, and a spoken read of the session in one motion."),
    t("Every answer cites the catalog it came from. When the data isn't there, Sterling says so instead of guessing."),
    t("Price triggers and P&F pattern alerts — the anchor reads them the moment they fire."),
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.base, color: C.text, fontFamily: SANS }}>
      {/* ---- nav ---- */}
      {/* No button here: the hero's CTA is the only primary action above the
          fold, which is the whole reason it reads as the thing to do. */}
      <nav className="v-homenav" aria-label={t("Main")}>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <VantageMark size={26} />
          <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 17, letterSpacing: "-0.015em" }}>Vantage</span>
        </span>
        <span className="v-homenav-links" style={{ display: "flex", gap: 26 }}>
          <button style={navLink} onClick={jump("home-features")}>{t("Product")}</button>
          <button style={navLink} onClick={jump("home-features")}>{t("Data")}</button>
          <button style={navLink} onClick={jump("home-plans")}>{t("Pricing")}</button>
        </span>
        <button onClick={onSignIn} style={{ ...navLink, marginLeft: "auto", color: C.text }}>{t("Sign in")}</button>
      </nav>

      <Tape />

      <div className="v-homewrap">
        {/* ---- hero ---- */}
        <header className="v-hero v-aurora" style={{ paddingTop: 66 }}>
          <div className="vt-fadeup">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
              <span className="vt-pulse" aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent }} />
              <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 500, letterSpacing: "2px", textTransform: "uppercase", color: C.accentText }}>
                {t("An AI news anchor for the markets")}
              </span>
            </span>

            {/* Two lines, and the break is load-bearing: the second line is the
                promise and it takes the accent. Each half is its own key, so a
                translation can put the accent on the right words. */}
            <h1 className="v-herotitle" style={{ margin: "22px 0 0" }}>
              {t("The market,")}<br />
              <span style={{ color: C.accentText }}>{t("on air.")}</span>
            </h1>

            <p style={{ fontFamily: SANS, fontSize: 18, lineHeight: 1.6, color: C.muted, maxWidth: 460, margin: "20px 0 0" }}>
              {t("Type a ticker and get the quote, the chart and a spoken read of the session — from an anchor that tells you when it doesn't know.")}
            </p>

            {/* The one primary action on the page. */}
            <button onClick={onStart} className="vt-sheen"
              style={{ ...button("primary", "lg"), marginTop: 26, background: GRAD.sheen, fontWeight: 700, fontSize: 15.5 }}>
              {t("Start free")}
            </button>

            {/* True, and checkable in the product: signup takes no card, and
                Explorer is free with no end date. */}
            <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.faint, marginTop: 12 }}>
              {t("No card. The demo desk works the moment you land.")}
            </div>
          </div>

          <BroadcastCard t={t} />
        </header>

        {/* ---- features ---- */}
        <section id="home-features" className="v-homefeat">
          {FEATURE_NOS.map((n, i) => (
            <div key={n} className="vt-fadeup" style={{ animationDelay: `${0.08 * i}s` }}>
              <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 500, letterSpacing: "0.1em", color: C.accentText }}>{n}</div>
              <h2 style={{ margin: "10px 0 0", fontFamily: SANS, fontSize: 16, fontWeight: 700, letterSpacing: "-0.010em" }}>{featureTitles[i]}</h2>
              <p style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: 14, lineHeight: 1.6, color: C.muted }}>{featureBodies[i]}</p>
            </div>
          ))}
        </section>

        {/* ---- plans ---- */}
        {/* Read from the product's real PLANS rather than the reference's, so
            the prices on the front door are the prices in Settings. */}
        <section id="home-plans" style={{ marginTop: 64 }}>
          <h2 style={{ ...TYPE.displayLg, margin: 0, textAlign: "center" }}>{t("Pick your desk")}</h2>
          <div className="v-homeplans">
            {plans.map(p => {
              const featured = !!p.featured;
              return (
                <div key={p.id} style={{
                  position: "relative",
                  background: C.surface,
                  border: `1px solid ${featured ? C.accent : C.edge}`,
                  borderRadius: R.xl, padding: 26,
                  display: "flex", flexDirection: "column", gap: 14,
                }}>
                  {featured && (
                    <span className="vt-pulse" style={{
                      position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                      background: C.accent, color: C.textOnAccent, borderRadius: R.pill,
                      fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em",
                      padding: "3px 12px", whiteSpace: "nowrap",
                    }}>{t("POPULAR")}</span>
                  )}
                  <div>
                    <div style={{ fontFamily: SANS, fontSize: 16, fontWeight: 700 }}>{p.label}</div>
                    <div style={{ marginTop: 6 }}>
                      <span style={{ fontFamily: MONO, fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em" }}>{p.price}</span>
                      <span style={{ fontFamily: SANS, fontSize: 13, color: C.faint }}>
                        {p.cadence === "forever" ? ` ${t("forever")}` : p.cadence}
                      </span>
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

                  <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.accentText }}>
                    {p.id === "free" ? t("Free, with no end date") : t("Change or cancel any time")}
                  </div>
                  {/* Only the featured card takes the fill. Three green buttons
                      in a row is three primaries, which is none. */}
                  <button onClick={onStart}
                    style={featured
                      ? { ...button("primary", "md"), width: "100%", fontWeight: 700 }
                      : { ...button("ghost", "md"), width: "100%" }}>
                    {p.id === "free" ? t("Start free") : t("Choose {plan}").replace("{plan}", p.label)}
                  </button>
                </div>
              );
            })}
          </div>

          <p style={{ fontFamily: SANS, fontSize: 13, lineHeight: 1.7, color: C.faint, textAlign: "center", maxWidth: 620, margin: "26px auto 0" }}>
            {t("Explorer is free and stays free — no card, no expiry. Paid plans are billed monthly and can be changed or cancelled from Settings at any time.")}
          </p>
        </section>

        <footer style={{ marginTop: 64, paddingTop: 22, paddingBottom: 48, borderTop: `1px solid ${C.edge}`, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <VantageMark size={20} />
          <span style={{ fontFamily: SANS, fontSize: 13, color: C.faint }}>
            {t("Vantage — an AI market desk. Not investment advice.")}
          </span>
          <button onClick={onSignIn} style={{ ...navLink, marginLeft: "auto", color: C.muted }}>{t("Sign in")}</button>
        </footer>
      </div>
    </div>
  );
}
