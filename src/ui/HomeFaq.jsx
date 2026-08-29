// ============================================================
//  HomeFaq.jsx — the questions the price list raises.
//
//  WHY IT SITS AFTER THE PLANS
//  Because that is where the questions actually arrive. Everything above this
//  is the product being shown; the moment a price appears, a reader starts
//  asking what they are committing to, whether the numbers are real, and what
//  happens to what they type. Answering that above the prices would be
//  answering it before it was asked.
//
//  WHY <details> AND NOT AN ACCORDION COMPONENT
//  A hand-built accordion means owning aria-expanded, aria-controls, roving
//  focus, Enter and Space handling, and a state machine — to arrive back at
//  what <details>/<summary> already does natively. Native also buys two things
//  a custom one cannot easily get: it works with JavaScript disabled, and
//  browser in-page search opens a closed section to reveal a match, so Ctrl+F
//  for "refund" or "data" finds text that is technically hidden.
//
//  The cost is that open/close cannot be height-animated without script. That
//  is a fair trade for an FAQ, where the reader wants the answer rather than
//  the transition.
//
//  EVERY ANSWER HERE IS CHECKED AGAINST THE CODE
//  This is a pricing page, so a wrong answer is a false promise rather than a
//  typo. The trial length is TRIAL_DAYS in server/index.js. The demo-versus-
//  live split and the voice split are PLANS and FEATURE_PLAN in React.jsx.
// ============================================================
import React from "react";
import { C, MONO, SANS } from "./theme.js";

export default function HomeFaq({ t = (x) => x }) {
  // Written out as literal t() calls rather than mapped over a data file, so
  // the i18n audit can see every string at its call site.
  const items = [
    [
      t("What happens during the seven days?"),
      t("Every plan starts with the same seven days. Card details are entered on Stripe's page — this app has no card form of its own — and if you cancel before day 8 you are not charged."),
    ],
    [
      t("Is the market data real?"),
      t("On Explorer it is not. The tape, the charts and the P&F grids run on demo data, which makes it a place to learn the desk rather than to trade from. Live market data starts at Pro Desk."),
    ],
    [
      t("Whose voice is the anchor?"),
      t("On every plan the desk reads answers aloud in your own browser's speech voice. Trading Floor replaces it with the studio voice."),
    ],
    [
      t("Does it make things up?"),
      t("Answers carry the source they came from. When the data isn't there the anchor says so instead of guessing — that refusal is the feature, not a gap in it."),
    ],
    [
      t("Is any of this investment advice?"),
      t("No. Vantage reports the session and reads it back to you. It does not tell you what to buy, and nothing in it should be treated as a recommendation."),
    ],
  ];

  return (
    <section id="home-faq" className="v-faq" aria-labelledby="faq-heading">
      <p className="v-scrollin" style={{
        margin: 0, textAlign: "center", fontFamily: MONO, fontSize: 12,
        fontWeight: 500, letterSpacing: "0.14em", color: C.accentText,
        textTransform: "uppercase",
      }}>{t("Before you decide")}</p>

      <h2 id="faq-heading" className="v-scrollin v-faq-h">{t("The obvious questions.")}</h2>

      <div className="v-faq-list">
        {items.map(([q, a], i) => (
          // The first is open because an FAQ where every row is shut reads as a
          // wall of closed doors; one open row shows what a row contains.
          <details key={q} className="v-faq-item v-scrollin" open={i === 0}>
            <summary className="v-faq-q">
              <span>{q}</span>
              {/* Rotates via the [open] rule in global.css rather than by
                  swapping icons, so there is one glyph and one transition. */}
              <svg className="v-faq-chev" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path d="M3 5.2 L7 9.2 L11 5.2" fill="none" stroke="currentColor"
                  strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <p className="v-faq-a" style={{ fontFamily: SANS }}>{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
