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

/* ---------- the motion ----------
   Every panel plays a short sequence and then rests. They all finish inside
   2s, which is under a third of DWELL, and that gap is the point: a surface
   still moving when the rail runs out reads as something that has not
   finished loading rather than something being demonstrated. */

const EASE = [0.22, 1, 0.36, 1];
const beat = (delay, duration = 0.42) => ({ delay, duration, ease: EASE });

const ELS = { div: m.div, span: m.span };

// A keyframe list has nothing to say to a reader who asked for no motion, so
// take the value it was going to end on.
function settle(target) {
  const out = {};
  for (const [k, v] of Object.entries(target)) out[k] = Array.isArray(v) ? v[v.length - 1] : v;
  return out;
}

// One beat of a panel's sequence. `play` says what the cue is:
//
//   "now"   animate on mount. The desktop carousel already remounts the panel
//           whenever a tab is chosen — AnimatePresence keys it on `active` —
//           so mounting IS the cue and there is no trigger to write.
//   "view"  animate on scroll. The phone stacks all three panels, so mounting
//           would play all three at once with two of them off screen.
//   false   render finished. `initial={false}` starts motion at the end state
//           and animates nothing, which is the right answer under reduced
//           motion: the whole picture at once, rather than a blank frame
//           waiting on an animation that has been silenced.
function Beat({ play, el = "div", from, to, transition, ...rest }) {
  const M = ELS[el];
  if (play === "view") {
    return (
      <M initial={from} whileInView={to} transition={transition}
        viewport={{ once: true, amount: 0.4 }} {...rest} />
    );
  }
  return <M initial={play ? from : false} animate={play ? to : settle(to)} transition={transition} {...rest} />;
}

const RISE = { from: { opacity: 0, y: 10 }, to: { opacity: 1, y: 0 } };
const POP = { from: { opacity: 0, scale: 0.82 }, to: { opacity: 1, scale: 1 } };

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

// The session shape for panel 01. A shape, not data — see below.
const SESSION = [38, 52, 44, 61, 55, 72, 64, 80, 71, 88, 76, 66, 58, 69, 62];

// 01 — the command bar, mid-type, and what it returns.
function PanelCommand({ play }) {
  return (
    <Frame label="The command bar with AMD typed into it, returning a quote and a chart">
      <div style={{
        background: C.base, border: `1px solid ${C.edgeStrong}`, borderRadius: R.md,
        padding: "13px 15px", display: "flex", alignItems: "center", gap: 9,
        fontFamily: MONO, fontSize: 14, color: C.text,
      }}>
        <span style={{ color: C.faint }}>&gt;</span>

        {/* The ticker types itself, and it types by WIDTH rather than by fading
            three letters up. A letter sitting at opacity 0 still takes its
            space, so the caret would wait three characters to the right of an
            empty prompt for text that then appears underneath it. Width in
            `ch` is the only version where the caret advances with the typing.

            Each width is held before the next rather than interpolated: a
            smoothly widening box is a wipe, and a keystroke is not a wipe.
            overflow:hidden is load-bearing twice over — it clips the letters
            that have not been typed yet, and it is what allows this flex item
            to go under its own min-content width at all. */}
        <Beat el="span" play={play}
          from={{ width: "0ch" }}
          to={{ width: ["0ch", "1ch", "1ch", "2ch", "2ch", "3ch"] }}
          transition={{
            delay: 0.2, duration: 0.5, ease: "linear",
            times: [0, 0.001, 0.333, 0.334, 0.666, 0.667],
          }}
          style={{ display: "inline-block", overflow: "hidden", whiteSpace: "nowrap" }}
        >amd</Beat>

        <span className="vt-pulse" aria-hidden="true"
          style={{ width: 1.5, height: 17, background: C.accent, animationTimingFunction: "steps(1)" }} />
      </div>

      <Beat play={play} {...RISE} transition={beat(0.82)}
        style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 2 }}>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.muted, letterSpacing: "0.04em" }}>AMD</span>
        <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>158.90</span>
        <span style={{ fontFamily: MONO, fontSize: 13, color: C.down }}>-0.84%</span>
      </Beat>

      {/* A shape, not data. Flat-topped bars would read as a real chart and
          invite somebody to check the numbers against the tape.

          They grow left to right, which means the four red ones arrive last
          and the session turns over while you are watching it. That is the
          whole reason the stagger runs in index order rather than outward from
          the middle or all at once. */}
      <div aria-hidden="true" style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 62, marginTop: "auto" }}>
        {SESSION.map((h, i) => (
          <Beat key={i} el="span" play={play}
            from={{ scaleY: 0, opacity: 0 }}
            to={{ scaleY: 1, opacity: 0.55 + i / 40 }}
            transition={beat(1.02 + i * 0.035, 0.34)}
            style={{
              flex: 1, height: `${h}%`, borderRadius: 2, transformOrigin: "bottom",
              background: i > 9 ? C.down : C.accent,
            }} />
        ))}
      </div>
    </Frame>
  );
}

// 02 — an answer, its citation, and the refusal that makes the citation mean
// something. Both halves matter: a product that only shows its confident
// answers is not demonstrating honesty, it is demonstrating confidence.
function PanelReceipts({ play }) {
  return (
    <Frame label="An answer carrying its source, and the anchor declining to answer when the data is missing">
      <Beat play={play} {...RISE} transition={beat(0.1)}
        style={{
          background: C.surfaceRaised, border: `1px solid ${C.edgeStrong}`,
          borderRadius: R.md, padding: 14,
        }}>
        <p style={{ margin: 0, fontFamily: SANS, fontSize: 13.5, lineHeight: 1.55, color: C.textBody }}>
          Down 0.84% on light volume. Support held at 156.
        </p>
        {/* The chips land after the sentence they belong to, one and then the
            other. An answer and its sources arriving together is a card; an
            answer that is then sourced is the argument this panel exists to
            make. Only these two are lit — the sheen is the live signal, and
            the refusal below is the one thing here that is not live. */}
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {["quote · 16:00", "P&F · daily"].map((s, i) => (
            <Beat key={s} el="span" play={play} {...POP} transition={beat(0.62 + i * 0.12, 0.34)}
              className="v-pill v-pill-source v-pill-lit">{s}</Beat>
          ))}
        </div>
      </Beat>

      <Beat play={play} {...RISE} transition={beat(1.0)}
        style={{
          background: C.surfaceRaised, border: `1px solid ${C.edgeStrong}`,
          borderRadius: R.md, padding: 14, marginTop: "auto",
        }}>
        <p style={{ margin: 0, fontFamily: SANS, fontSize: 13.5, lineHeight: 1.55, color: C.muted }}>
          I don't have earnings for that date — I'm not going to guess it.
        </p>
        <Beat el="span" play={play} {...POP} transition={beat(1.44, 0.34)}
          className="v-pill v-pill-none" style={{ marginTop: 10 }}>no source</Beat>
      </Beat>
    </Frame>
  );
}

// 03 — an alert at the moment it fires.
const LIVE_BG = "rgba(70,167,88,0.07)";
const LIVE_FLASH = "rgba(70,167,88,0.34)";

function PanelAlerts({ play }) {
  const rows = [
    { sym: "AMD", text: "crossed 160.00", time: "16:02", live: true },
    { sym: "NVDA", text: "P&F double top", time: "15:47", live: false },
    { sym: "TSLA", text: "crossed 250.00", time: "15:12", live: false },
  ];
  // Entrance ordered by recency, not by position. The two settled alerts come
  // in first and the live one lands on top of them, late, and flashes — a list
  // that fills top-down is a list loading, and an alert arriving above rows
  // that were already sitting there is an alert firing. Nothing reflows: the
  // rows hold their space throughout, only opacity, offset and fill move.
  const ARRIVE = [0.52, 0.1, 0.22];
  return (
    <Frame label="Price and pattern alerts firing, newest first">
      {rows.map((r, i) => (
        <Beat key={r.sym} play={play}
          from={{ opacity: 0, x: -10 }}
          to={r.live
            ? { opacity: 1, x: 0, backgroundColor: [LIVE_BG, LIVE_FLASH, LIVE_BG] }
            : { opacity: 1, x: 0 }}
          // The flash is the row's own fill rather than a scrim laid over it.
          // An absolutely positioned overlay paints above the ticker and the
          // time — briefly, but being read is this panel's entire job.
          transition={r.live
            ? {
              ...beat(ARRIVE[i], 0.4),
              backgroundColor: { delay: ARRIVE[i] + 0.22, duration: 1.25, ease: "easeOut", times: [0, 0.14, 1] },
            }
            : beat(ARRIVE[i], 0.4)}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            backgroundColor: r.live ? LIVE_BG : C.surfaceRaised,
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
        </Beat>
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

// The phone version: every claim next to its own evidence, and no carousel.
//
// The panels themselves do play here — that is not a contradiction of the note
// above, which is about a control that advances content the reader cannot see.
// A surface that runs its sequence once, when you scroll to it, is the
// opposite: it is only ever triggered by the reader arriving at it. Hence
// "view" rather than "now" — mounting all three at once would play two of
// them into an empty room.
function Stacked({ titles, bodies, eyebrow, heading, reduce }) {
  return (
    <LazyMotion features={domAnimation} strict>
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
            <div style={{ marginTop: 16 }}><Panel play={reduce ? false : "view"} /></div>
          </div>
        );
      })}
    </section>
    </LazyMotion>
  );
}

export default function HomeShowcase({ titles, bodies, eyebrow, heading }) {
  const reduce = useReducedMotion();
  const narrow = useNarrow();
  const [active, setActive] = useState(0);
  // Set once, never unset. See the header: the reader asked to drive.
  const [driving, setDriving] = useState(false);
  const [visible, setVisible] = useState(false);
  // Two flags rather than one, because the tablist and the panel are separate
  // grid children: moving the pointer from one to the other must not read as a
  // leave. They are also the only two things here you could be reading — the
  // handlers used to sit on the <section>, which is full-width and 625px tall,
  // so a pointer parked in the margin beside the text paused the whole section
  // while resting on nothing.
  const [overTabs, setOverTabs] = useState(false);
  const [overPanel, setOverPanel] = useState(false);
  const ref = useRef(null);

  // These were one boolean, and that was the bug. `running` meant both "no
  // countdown exists" (reduced motion, a phone, a reader driving) and "the
  // countdown is paused" (hover, off screen) — so a paused rail drew itself
  // with the no-countdown picture, which is a FULL bar. Hovering anywhere over
  // the section snapped the rail from wherever it was to 100% and stopped the
  // advance, and the section then sat there looking finished and broken.
  const timed = !reduce && !narrow && !driving;   // is there a countdown at all?
  const running = timed && visible && !overTabs && !overPanel;  // is it ticking?
  const held = timed && !running;                 // ...or paused mid-count?

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setVisible(true); return undefined; }
    // 0.35 rather than 0 so the timer starts when the section is actually being
    // looked at, not when one pixel of it clears the fold.
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // A pause has to resume, not restart. The rail holds its frame (see
  // .v-showcase-fill in global.css), so the timer behind it has to hold its
  // remaining time too — otherwise a reader who brushes the section at 6.4s
  // gets a full bar sitting above another 6.5 seconds of waiting.
  const spentRef = useRef(0);   // ms this panel has already been held for
  const markRef = useRef(0);    // when the current run started

  // Declared BEFORE the timer effect on purpose. React runs every cleanup
  // before any effect, in declaration order, so on an `active` change the
  // timer's cleanup banks its elapsed time first and this then clears it —
  // which is what starts each panel on a fresh clock.
  useEffect(() => { spentRef.current = 0; }, [active]);

  useEffect(() => {
    if (!running) return undefined;
    markRef.current = Date.now();
    const id = setTimeout(() => setActive((i) => (i + 1) % PANELS.length),
      Math.max(0, DWELL * 1000 - spentRef.current));
    return () => { clearTimeout(id); spentRef.current += Date.now() - markRef.current; };
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
  if (narrow) return <Stacked titles={titles} bodies={bodies} eyebrow={eyebrow} heading={heading} reduce={reduce} />;

  return (
    <LazyMotion features={domAnimation} strict>
      <section
        ref={ref}
        id="home-features"
        className={"v-showcase" + (timed ? " is-timed" : "") + (held ? " is-held" : "")}
        style={{ "--v-dwell": `${DWELL}s` }}
        aria-labelledby="showcase-heading"
      >
        <div>
          <p className="v-scrollin" style={{
            margin: 0, fontFamily: MONO, fontSize: 12, fontWeight: 500,
            letterSpacing: "0.14em", color: C.accentText, textTransform: "uppercase",
          }}>{eyebrow}</p>
          <h2 id="showcase-heading" className="v-scrollin v-showcase-h">{heading}</h2>

          <div role="tablist" aria-orientation="vertical" onKeyDown={onKey} style={{ marginTop: 26 }}
            onMouseEnter={() => setOverTabs(true)} onMouseLeave={() => setOverTabs(false)}>
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
                      moves on its own, which is worth saying out loud.

                      The fill is drawn entirely in CSS off `aria-selected` and
                      the section's is-timed/is-held classes — see global.css.
                      Keying it on `active` is what restarts the countdown when
                      a panel takes over: a fresh element runs its animation
                      from the top, and there is no from-value to compute. */}
                  <span aria-hidden="true" className="v-showcase-rail">
                    <span key={active} className="v-showcase-fill" />
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

        <div id="showcase-panel" role="tabpanel" aria-labelledby={`showcase-tab-${active}`}
          onMouseEnter={() => setOverPanel(true)} onMouseLeave={() => setOverPanel(false)}>
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={active}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0, transition: { duration: 0.12 } }
                           : { opacity: 0, y: -8, transition: { duration: 0.16 } }}
              transition={reduce ? { duration: 0.15 } : { type: "spring", stiffness: 380, damping: 34, mass: 0.7 }}
            >
              {/* "now": AnimatePresence keys this on `active`, so choosing a
                  tab remounts the panel and the sequence replays itself with
                  no trigger to write. */}
              <Panel play={reduce ? false : "now"} />
            </m.div>
          </AnimatePresence>
        </div>
      </section>
    </LazyMotion>
  );
}
