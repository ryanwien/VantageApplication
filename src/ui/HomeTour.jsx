// ============================================================
//  HomeTour.jsx — the whole product in five steps, running in the page.
//
//  WHAT CHANGED, AND WHY IT IS NOT A VIDEO ANY MORE
//  This was a 30-second mp4 with a poster and a play button: 1.93 MB, a click
//  to start, and a rectangle of pixels that no screen reader, no translation
//  and no theme could reach. The same five steps are now real DOM.
//
//  What that buys, concretely:
//    - 0 bytes. There is no media request at all, where the video cost 1.93 MB
//      the moment anyone pressed play and 71 kB of poster before they did.
//    - It reads. Every word here is text, so it is translatable through t(),
//      selectable, searchable and available to assistive tech.
//    - It restyles. The panes are built from theme.js tokens, so they follow
//      the theme instead of being a raster of one particular moment in it.
//    - It never has to be re-rendered. Changing a number in a video means
//      opening the composition, re-rendering and re-encoding. Here it is a
//      string.
//
//  WHY IT ADVANCES ITSELF AND WHAT STOPS IT
//  Same contract HomeShowcase already runs, for the same reasons:
//    - the first click on the rail hands control over permanently. The reader
//      asked to drive, so they drive; nothing resumes behind their back.
//    - hovering pauses, because a pointer resting on a step is somebody
//      reading it.
//    - an IntersectionObserver gates the timer, so it never advances through
//      steps nobody is looking at and never burns a repaint below the fold.
//    - under prefers-reduced-motion it does not advance at all. It becomes a
//      static list of five steps with the first one shown, and every heading
//      and description stays in the DOM and reachable by the rail.
//
//  WHY EVERY INTERNAL SIZE IS IN `em`
//  The panes are dense — a ticker tape, a quote block, a ledger — and dense UI
//  stops being legible if you let it reflow. So the stage is a container query
//  (`container-type: inline-size`) whose font-size is a percentage of its own
//  width, and everything inside is in `em`. The whole composition scales as
//  one object with the column, exactly like the video did, without a
//  transform, a resize listener or a fixed pixel width. See .v-tour-stage.
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from "react";
import { C, MONO, SANS } from "./theme.js";
import VantageMark from "./VantageMark.jsx";

// How long a step holds. Matches the 4.7s the video gave each one, which was
// picked to read two lines without hurrying.
const DWELL = 4.7;

const STEPS = [
  {
    rail: "Command",
    head: "Type a ticker.",
    sub: "Three letters. No menus, no set-up, no dashboard to configure first.",
  },
  {
    rail: "Session",
    head: "Get a session.",
    sub: "The last price, the day's move, and the shape of how it got there.",
  },
  {
    rail: "Sources",
    head: "Every answer carries its source.",
    sub: "Tagged with the quote it read and the time it read it.",
  },
  {
    rail: "Limits",
    head: "It says so when it doesn't know.",
    sub: "The refusal is the feature. A guess that reads well is worse than nothing.",
  },
  {
    rail: "Alerts",
    head: "Alerts, the moment they fire.",
    sub: "Set a level once. It watches the session so you don't have to.",
  },
];

// The tape that runs under the command line in every pane. Static numbers, the
// same as the landing page's own tape and for the same reason: this is
// marketing, and opening a live quote subscription for somebody who has not
// asked for one is not a thing to do behind a headline.
const TAPE = [
  ["AAPL", "227.98", -1.14], ["MSFT", "454.12", -0.48], ["NVDA", "124.60", -3.79],
  ["AMZN", "203.34", 2.42], ["META", "572.34", -0.84], ["GOOGL", "182.26", 0.6],
];

// The session shape for pane 02. A shape, not data — flat-topped bars would
// read as a real chart and invite somebody to check it against the tape.
const CHART = [26, 32, 22, 44, 38, 58, 50, 66, 58, 74, 68, 84, 78];
const VOL = [38, 52, 44, 61, 55, 72, 64, 80, 71, 88, 76, 66];

/* ---------- the panes ---------- */

function PaneCommand() {
  const rows = [
    ["AMD", "Advanced Micro Devices", true],
    ["AMZN", "Amazon.com Inc.", false],
    ["AMAT", "Applied Materials", false],
    ["AMBA", "Ambarella Inc.", false],
  ];
  return (
    <div className="v-tour-pane">
      {rows.map(([sym, name, on]) => (
        <div key={sym} className={"v-tour-match" + (on ? " is-on" : "")}>
          <span className="v-tour-sym">{sym}</span>
          <span className="v-tour-name">{name}</span>
          {on && <span className="v-tour-key">↵</span>}
        </div>
      ))}
    </div>
  );
}

function PaneSession() {
  return (
    <div className="v-tour-pane v-tour-session">
      <div className="v-tour-quote">
        <div className="v-tour-qrow">
          <span className="v-tour-sym">AMD</span>
          <span className="v-tour-px">158.90</span>
        </div>
        <div className="v-tour-dn">−1.35 (−0.84%)</div>
        <dl className="v-tour-stats">
          {[["OPEN", "160.42"], ["HIGH", "161.08"], ["LOW", "156.11"], ["VOL", "38.2M"]].map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      </div>
      <div className="v-tour-chart">
        {/* preserveAspectRatio none: this is a shape filling a box, not a
            figure whose proportions carry meaning. */}
        <svg viewBox="0 0 420 96" preserveAspectRatio="none" aria-hidden="true">
          <polyline
            points={CHART.map((y, i) => `${(i / (CHART.length - 1)) * 420},${y}`).join(" ")}
            fill="none" stroke={C.down} strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="v-tour-vol" aria-hidden="true">
          {VOL.map((h, i) => <span key={i} style={{ height: `${h}%` }} />)}
        </div>
      </div>
    </div>
  );
}

function PaneSources() {
  return (
    <div className="v-tour-pane">
      <p className="v-tour-answer">Down 0.84% on light volume. Support held at 156.</p>
      <div className="v-tour-chips">
        {["quote · 16:00", "P&F · daily", "session · 21 Aug"].map(s => (
          <span key={s} className="v-pill v-pill-source v-pill-lit">{s}</span>
        ))}
      </div>
      <div className="v-tour-ledger">
        {[["READ", "quote/AMD", "16:00:04"], ["READ", "pnf/AMD/daily", "16:00:04"], ["READ", "session/AMD", "16:00:05"]].map(([k, p, t]) => (
          <div key={p}><span className="v-tour-verb">{k}</span><span className="v-tour-path">{p}</span><span className="v-tour-t">{t}</span></div>
        ))}
      </div>
    </div>
  );
}

function PaneLimits() {
  return (
    <div className="v-tour-pane v-tour-limits">
      <div>
        <span className="v-tour-verb">ASKED</span>
        <p className="v-tour-answer">What were AMD's Q3 earnings?</p>
      </div>
      <div>
        <span className="v-tour-verb v-tour-verb-warn">ANSWERED</span>
        <p className="v-tour-answer v-tour-answer-dim">
          I don't have earnings for that date — I'm not going to guess it.
        </p>
        <span className="v-pill v-pill-none">no source</span>
      </div>
    </div>
  );
}

function PaneAlerts() {
  const rows = [
    ["AMD", "crossed 160.00", "16:02", true],
    ["NVDA", "P&F double top", "15:47", false],
    ["TSLA", "crossed 250.00", "15:12", false],
    ["META", "crossed 570.00", "14:58", false],
  ];
  return (
    <div className="v-tour-pane">
      {rows.map(([sym, text, t, live]) => (
        <div key={sym} className={"v-tour-alert" + (live ? " is-live" : "")}>
          <span className={"v-tour-dot" + (live ? " vt-pulse" : "")} aria-hidden="true" />
          <span className="v-tour-sym">{sym}</span>
          <span className="v-tour-name">{text}</span>
          <span className="v-tour-t">{t}</span>
        </div>
      ))}
    </div>
  );
}

const PANES = [PaneCommand, PaneSession, PaneSources, PaneLimits, PaneAlerts];

// What the command line shows at each step. It is the one piece of chrome that
// changes, so it is the thing telling you the panes below are all one session
// rather than five unrelated screenshots.
const TYPED = ["am", "amd", "amd", "amd", "amd"];

export default function HomeTour({ t = (x) => x }) {
  const [step, setStep] = useState(0);
  // Set once, never unset. The reader asked to drive, so they drive.
  const [driving, setDriving] = useState(false);
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [reduce, setReduce] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return undefined;
    const sync = () => setReduce(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setVisible(true); return undefined; }
    // 0.35 rather than 0, so the timer starts when the thing is actually being
    // looked at and not when one pixel of it clears the fold.
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const running = !reduce && !driving && visible && !hovered;

  useEffect(() => {
    if (!running) return undefined;
    const id = setTimeout(() => setStep(i => (i + 1) % STEPS.length), DWELL * 1000);
    return () => clearTimeout(id);
  }, [running, step]);

  const pick = useCallback((i) => { setDriving(true); setStep(i); }, []);

  const onKey = (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = e.key === "ArrowRight"
      ? (step + 1) % STEPS.length
      : (step - 1 + STEPS.length) % STEPS.length;
    pick(next);
    ref.current?.querySelector(`#tour-tab-${next}`)?.focus();
  };

  return (
    <section id="home-tour" className="v-tour" aria-labelledby="tour-heading" ref={ref}>
      <p className="v-scrollin" style={{
        margin: 0, textAlign: "center", fontFamily: MONO, fontSize: 12,
        fontWeight: 500, letterSpacing: "0.14em", color: C.accentText,
        textTransform: "uppercase",
      }}>{t("The short version")}</p>

      <h2 id="tour-heading" className="v-scrollin v-tour-h">{t("Five steps, end to end.")}</h2>

      <p className="v-scrollin v-tour-sub" style={{ fontFamily: SANS }}>
        {t("Everything above, in the order you would actually do it. It runs on its own — hover to hold a step, or pick one.")}
      </p>

      <div
        className="v-tour-frame v-scrollin"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="v-tour-stage">
          {/* ---- the rail ---- */}
          <div className="v-tour-rail" role="tablist" aria-label={t("Tour steps")} onKeyDown={onKey}>
            {STEPS.map((s, i) => (
              <button
                key={s.rail}
                id={`tour-tab-${i}`}
                role="tab"
                aria-selected={i === step}
                aria-controls="tour-panel"
                tabIndex={i === step ? 0 : -1}
                className={"v-tour-tab" + (i === step ? " is-on" : "")}
                onClick={() => pick(i)}
              >{t(s.rail)}</button>
            ))}
          </div>

          {/* ---- the card ---- */}
          <div className="v-tour-card" id="tour-panel" role="tabpanel" aria-labelledby={`tour-tab-${step}`}>
            <h3 className="v-tour-cardh">{t(STEPS[step].head)}</h3>
            <p className="v-tour-cards">{t(STEPS[step].sub)}</p>

            {/* One track, one fill, keyed on the step so it restarts. The fill
                is animated only while the thing is actually running; parked at
                full width otherwise, because a bar frozen part-way through
                reads as a stall rather than as a pause. */}
            <div className="v-tour-bar">
              <div
                key={running ? step : "held"}
                className={"v-tour-barfill" + (running ? " is-running" : "")}
                style={running ? { animationDuration: `${DWELL}s` } : undefined}
              />
            </div>

            {/* ---- the app, bleeding off the bottom of the card ---- */}
            <div className="v-tour-app">
              <div className="v-tour-chrome">
                <VantageMark size={13} />
                <span className="v-tour-cmd">&gt; {TYPED[step]}<i className="vt-pulse" /></span>
                <span className="v-tour-live"><i /> LIVE</span>
                <span className="v-tour-clock">16:02</span>
              </div>
              <div className="v-tour-tape" aria-hidden="true">
                {TAPE.map(([sym, px, pct]) => (
                  <span key={sym}>
                    <b>{sym}</b> {px}{" "}
                    <i className={pct >= 0 ? "up" : "dn"}>{pct >= 0 ? "+" : ""}{pct.toFixed(2)}%</i>
                  </span>
                ))}
              </div>
              {/* Every pane stays mounted and is crossfaded, rather than one
                  being swapped in. Swapping remounts the SVG and the ledger on
                  every step, and it would put the whole composition one render
                  away from a blank frame mid-transition. */}
              <div className="v-tour-panes">
                {PANES.map((Pane, i) => (
                  <div key={i} className={"v-tour-paneslot" + (i === step ? " is-on" : "")} aria-hidden={i !== step}>
                    <Pane />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
