// ============================================================
//  HomeShowcase.jsx — the part of the landing page that shows instead of tells.
//
//  WHY THIS REPLACED THREE PARAGRAPHS
//  The page used to run hero → three sentences → pricing. Measured on this
//  build that was 871px of hero, 363px of prose with no picture in it, and
//  then 1266px of price table: 44% of the page asking for money, and not one
//  pixel anywhere showing the product doing anything. A visitor was expected
//  to buy a market desk having never seen one.
//
//  So the three blurbs keep their words and gain a surface each. Same copy,
//  same order, same numbering — but now every claim has the thing it claims
//  about sitting next to it.
//
//  WHY THE PANELS ARE BUILT AND NOT SCREENSHOTTED
//  Every panel below is assembled from theme.js tokens at the app's own sizes,
//  the same rule BroadcastCard already follows in this file's neighbour. A
//  screenshot goes stale the day someone changes a radius, and it ships a
//  raster of text that no screen reader and no translation can reach. These
//  are real nodes: they restyle themselves when the theme moves, they are
//  legible to assistive tech, and they cost bytes measured in hundreds rather
//  than hundreds of thousands.
//
//  WHY IT ADVANCES ITSELF, AND WHY THAT IS RISKY
//  A static three-up asks the reader to do the work of comparing. Advancing
//  earns attention, which is the entire trick of the reference this was built
//  against. But an auto-advancing thing that cannot be stopped is a hostile
//  thing, so:
//    - the first click hands control over permanently. No "resumes after 10s"
//      games; the reader asked to drive, so they drive.
//    - hovering pauses, because a reader with the pointer resting on a panel
//      is reading it.
//    - it does not run while off screen. An IntersectionObserver gates the
//      timer, so this never burns a timer and a repaint eight sections below
//      the fold, and never advances through content nobody was looking at.
//    - under prefers-reduced-motion it does not advance at all and the rails
//      do not fill. It becomes a plain, complete, clickable list. Nothing is
//      hidden from anyone in that mode — all three bodies stay in the DOM.
//
//  WHY THERE IS NO CAROUSEL ON A PHONE
//  Because a carousel needs its control and its content on screen together,
//  and below 1000px they cannot be. Measured at 375 by 812: stacked, the panel
//  starts roughly 700px under the first feature, so the picture is off screen
//  while you read the words and the words are off screen while you look at the
//  picture — and it swaps itself every 6.5s regardless, changing something the
//  reader cannot see in response to nothing they did.
//
//  So the phone gets a different component, not a squeezed one: three complete
//  feature-and-surface pairs, stacked, no tabs, no timer, nothing moving. It
//  is longer. Length is cheap on a page you scroll; a control that lies about
//  what it controls is not.
//
//  WHY THE RAIL IS A TRANSFORM AND NOT A WIDTH
//  Animating `width` relayouts the row on every frame. `scaleX` on a promoted
//  layer is a compositor job. Same picture, none of the cost, and it is the
//  same reasoning global.css already applies to the aurora.
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from "react";
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from "motion/react";
import { C, MONO, SANS, R, SHADOW } from "./theme.js";

// How long a panel holds before the next one takes over. Long enough to read
// three lines without hurrying, short enough that the third panel is still
// reachable by somebody who is only half paying attention.
const DWELL = 6.5;

const NOS = ["01", "02", "03"];

/* ---------- the surfaces ----------
   Each is a fragment of a real app screen at real sizes. They are deliberately
   partial: a whole desk shrunk to fit this column would be unreadable, and an
   unreadable screenshot of a product is an argument against it. */

function Frame({ children, label }) {
  return (
    <div
      role="img"
      aria-label={label}
      style={{
        background: C.surface, border: `1px solid ${C.edgeStrong}`,
        borderRadius: R.xl, padding: 18, boxShadow: SHADOW.xl,
        minHeight: 260, display: "flex", flexDirection: "column", gap: 12,
      }}
    >
      {children}
    </div>
  );
}

// 01 — the command bar, mid-type, and what it returns.
function PanelCommand() {
  return (
    <Frame label="The command bar with AMD typed into it, returning a quote and a chart">
      <div style={{
        background: C.base, border: `1px solid ${C.edgeStrong}`, borderRadius: R.md,
        padding: "13px 15px", display: "flex", alignItems: "center", gap: 9,
        fontFamily: MONO, fontSize: 14, color: C.text,
      }}>
        <span style={{ color: C.faint }}>&gt;</span>
        <span>amd</span>
        <span className="vt-pulse" aria-hidden="true"
          style={{ width: 1.5, height: 17, background: C.accent, animationTimingFunction: "steps(1)" }} />
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 2 }}>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.muted, letterSpacing: "0.04em" }}>AMD</span>
        <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>158.90</span>
        <span style={{ fontFamily: MONO, fontSize: 13, color: C.down }}>-0.84%</span>
      </div>

      {/* A shape, not data. Flat-topped bars would read as a real chart and
          invite somebody to check the numbers against the tape. */}
      <div aria-hidden="true" style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 62, marginTop: "auto" }}>
        {[38, 52, 44, 61, 55, 72, 64, 80, 71, 88, 76, 66, 58, 69, 62].map((h, i) => (
          <span key={i} style={{
            flex: 1, height: `${h}%`, borderRadius: 2,
            background: i > 9 ? C.down : C.accent, opacity: 0.55 + (i / 40),
          }} />
        ))}
      </div>
    </Frame>
  );
}

// 02 — an answer, its citation, and the refusal that makes the citation mean
// something. Both halves matter: a product that only shows its confident
// answers is not demonstrating honesty, it is demonstrating confidence.
function PanelReceipts() {
  return (
    <Frame label="An answer carrying its source, and the anchor declining to answer when the data is missing">
      <div style={{
        background: C.surfaceRaised, border: `1px solid ${C.edgeStrong}`,
        borderRadius: R.md, padding: 14,
      }}>
        <p style={{ margin: 0, fontFamily: SANS, fontSize: 13.5, lineHeight: 1.55, color: C.textBody }}>
          Down 0.84% on light volume. Support held at 156.
        </p>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {["quote · 16:00", "P&F · daily"].map((s) => (
            <span key={s} style={{
              fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.04em",
              color: C.accentText, background: "rgba(70,167,88,0.10)",
              border: `1px solid rgba(70,167,88,0.28)`,
              borderRadius: R.pill, padding: "3px 8px",
            }}>{s}</span>
          ))}
        </div>
      </div>

      <div style={{
        background: C.surfaceRaised, border: `1px solid ${C.edgeStrong}`,
        borderRadius: R.md, padding: 14, marginTop: "auto",
      }}>
        <p style={{ margin: 0, fontFamily: SANS, fontSize: 13.5, lineHeight: 1.55, color: C.muted }}>
          I don't have earnings for that date — I'm not going to guess it.
        </p>
        <span style={{
          display: "inline-block", marginTop: 10,
          fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.04em",
          color: C.warn, background: "rgba(221,154,60,0.10)",
          border: `1px solid rgba(221,154,60,0.28)`,
          borderRadius: R.pill, padding: "3px 8px",
        }}>no source</span>
      </div>
    </Frame>
  );
}

// 03 — an alert at the moment it fires.
function PanelAlerts() {
  const rows = [
    { sym: "AMD", text: "crossed 160.00", time: "16:02", live: true },
    { sym: "NVDA", text: "P&F double top", time: "15:47", live: false },
    { sym: "TSLA", text: "crossed 250.00", time: "15:12", live: false },
  ];
  return (
    <Frame label="Price and pattern alerts firing, newest first">
      {rows.map((r) => (
        <div key={r.sym} style={{
          display: "flex", alignItems: "center", gap: 10,
          background: r.live ? "rgba(70,167,88,0.07)" : C.surfaceRaised,
          border: `1px solid ${r.live ? "rgba(70,167,88,0.30)" : C.edgeStrong}`,
          borderRadius: R.md, padding: "11px 13px",
        }}>
          <span
            className={r.live ? "vt-pulse" : undefined}
            aria-hidden="true"
            style={{
              width: 7, height: 7, borderRadius: "50%", flex: "0 0 auto",
              background: r.live ? C.accent : C.edgeStrong,
            }}
          />
          <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: C.muted, letterSpacing: "0.04em" }}>{r.sym}</span>
          <span style={{ fontFamily: SANS, fontSize: 13, color: r.live ? C.text : C.muted }}>{r.text}</span>
          <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11.5, color: C.faint }}>{r.time}</span>
        </div>
      ))}
    </Frame>
  );
}

const PANELS = [PanelCommand, PanelReceipts, PanelAlerts];

// Matches the 1000px breakpoint global.css already uses to collapse this grid,
// so the layout and the behaviour change at the same width rather than leaving
// a band where the columns have stacked but the carousel has not noticed.
function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(max-width: 1000px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return narrow;
}

// The phone version: every claim next to its own evidence, nothing moving.
function Stacked({ titles, bodies, eyebrow, heading }) {
  return (
    <section id="home-features" className="v-showcase" aria-labelledby="showcase-heading">
      <div>
        <p style={{
          margin: 0, fontFamily: MONO, fontSize: 12, fontWeight: 500,
          letterSpacing: "0.14em", color: C.accentText, textTransform: "uppercase",
        }}>{eyebrow}</p>
        <h2 id="showcase-heading" className="v-showcase-h">{heading}</h2>
      </div>

      {titles.map((title, i) => {
        const Panel = PANELS[i];
        return (
          <div key={title} className="v-scrollin">
            <span style={{
              fontFamily: MONO, fontSize: 11.5, fontWeight: 500,
              letterSpacing: "0.1em", color: C.accentText,
            }}>{NOS[i]}</span>
            <h3 style={{
              margin: "7px 0 0", fontFamily: SANS, fontSize: 17,
              fontWeight: 700, letterSpacing: "-0.012em", color: C.text,
            }}>{title}</h3>
            <p style={{
              margin: "6px 0 0", fontFamily: SANS, fontSize: 14,
              lineHeight: 1.6, color: C.muted,
            }}>{bodies[i]}</p>
            <div style={{ marginTop: 16 }}><Panel /></div>
          </div>
        );
      })}
    </section>
  );
}

export default function HomeShowcase({ titles, bodies, eyebrow, heading }) {
  const reduce = useReducedMotion();
  const narrow = useNarrow();
  const [active, setActive] = useState(0);
  // Set once, never unset. See the header: the reader asked to drive.
  const [driving, setDriving] = useState(false);
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const ref = useRef(null);

  const running = !reduce && !narrow && !driving && visible && !hovered;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setVisible(true); return undefined; }
    // 0.35 rather than 0 so the timer starts when the section is actually being
    // looked at, not when one pixel of it clears the fold.
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!running) return undefined;
    const id = setTimeout(() => setActive((i) => (i + 1) % PANELS.length), DWELL * 1000);
    return () => clearTimeout(id);
  }, [running, active]);

  const pick = useCallback((i) => { setDriving(true); setActive(i); }, []);

  // Arrow keys move between features once the list has focus — the tablist
  // pattern, because that is what this is.
  const onKey = (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const next = e.key === "ArrowDown"
      ? (active + 1) % PANELS.length
      : (active - 1 + PANELS.length) % PANELS.length;
    pick(next);
    ref.current?.querySelector(`#showcase-tab-${next}`)?.focus();
  };

  const Panel = PANELS[active];

  // Below the breakpoint this stops being a carousel entirely. Every hook above
  // has already run, so the two shapes swap cleanly on a resize.
  if (narrow) return <Stacked titles={titles} bodies={bodies} eyebrow={eyebrow} heading={heading} />;

  return (
    <LazyMotion features={domAnimation} strict>
      <section
        ref={ref}
        id="home-features"
        className="v-showcase"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-labelledby="showcase-heading"
      >
        <div>
          <p className="v-scrollin" style={{
            margin: 0, fontFamily: MONO, fontSize: 12, fontWeight: 500,
            letterSpacing: "0.14em", color: C.accentText, textTransform: "uppercase",
          }}>{eyebrow}</p>
          <h2 id="showcase-heading" className="v-scrollin v-showcase-h">{heading}</h2>

          <div role="tablist" aria-orientation="vertical" onKeyDown={onKey} style={{ marginTop: 26 }}>
            {titles.map((title, i) => {
              const on = i === active;
              return (
                <button
                  key={title}
                  id={`showcase-tab-${i}`}
                  role="tab"
                  aria-selected={on}
                  aria-controls="showcase-panel"
                  tabIndex={on ? 0 : -1}
                  onClick={() => pick(i)}
                  className="v-showcase-tab"
                  style={{ opacity: on ? 1 : 0.55 }}
                >
                  {/* The rail: a hairline that fills while this feature holds.
                      It is also the only thing telling a reader the section
                      moves on its own, which is worth saying out loud. */}
                  <span aria-hidden="true" className="v-showcase-rail">
                    <m.span
                      key={`${i}-${active}-${running}`}
                      className="v-showcase-fill"
                      initial={{ scaleX: on ? (running ? 0 : 1) : 0 }}
                      animate={{ scaleX: on ? 1 : 0 }}
                      transition={on && running
                        ? { duration: DWELL, ease: "linear" }
                        : { duration: 0.25 }}
                    />
                  </span>

                  <span style={{
                    fontFamily: MONO, fontSize: 11.5, fontWeight: 500,
                    letterSpacing: "0.1em", color: on ? C.accentText : C.faint,
                  }}>{NOS[i]}</span>

                  <span style={{
                    display: "block", marginTop: 7, fontFamily: SANS,
                    fontSize: 17, fontWeight: 700, letterSpacing: "-0.012em",
                    color: C.text,
                  }}>{title}</span>

                  {/* Every body stays mounted and readable. Collapsing the two
                      inactive ones would hide two thirds of the argument from
                      anyone who does not wait, and all of it from a reader who
                      has asked for no motion. */}
                  <span style={{
                    display: "block", marginTop: 6, fontFamily: SANS,
                    fontSize: 14, lineHeight: 1.6, color: C.muted, maxWidth: 420,
                  }}>{bodies[i]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div id="showcase-panel" role="tabpanel" aria-labelledby={`showcase-tab-${active}`}>
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={active}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0, transition: { duration: 0.12 } }
                           : { opacity: 0, y: -8, transition: { duration: 0.16 } }}
              transition={reduce ? { duration: 0.15 } : { type: "spring", stiffness: 380, damping: 34, mass: 0.7 }}
            >
              <Panel />
            </m.div>
          </AnimatePresence>
        </div>
      </section>
    </LazyMotion>
  );
}
