// ============================================================
//  DeskMotion.jsx — the desk's motion primitives.
//
//  WHY THE DESK MOVES DIFFERENTLY FROM THE LANDING PAGE
//  The landing page moves like light: a glow with rings coming off it, a ping
//  crossing them, a sheen sweeping a pill, a twelve-second story that plays
//  whether or not anyone is watching. That is right for a page whose entire
//  job is to be looked at.
//
//  The desk has no audience. It has an operator. So it moves like equipment —
//  flaps, shuttles, wipes and detents — and, more importantly than any
//  particular gesture, its motion is CAUSED. Nothing here animates on a timer.
//  Every one of these mounts in response to something that actually happened:
//  a value was replaced, a run started, a result arrived, a control was
//  pressed. Waveform.jsx already states the principle for the one indicator
//  that had it — a meter that animates while nothing is playing teaches you to
//  stop believing it — and this file is that rule applied to the rest.
//
//  The CSS lives in global.css under "THE DESK'S MOTION LANGUAGE", so a single
//  @media rule can silence all of it at once.
// ============================================================
import React, { useEffect, useRef, useState } from "react";

// How long a flap takes. Must match v-flap-in/v-flap-out in global.css: this
// is the timer that clears the outgoing cell once it has rolled out of the
// clip, and a cell left behind would sit on top of the new one.
const FLAP_MS = 260;

// Not motion's useReducedMotion — this file is imported by React.jsx, which is
// otherwise motion-free, and one matchMedia is cheaper than pulling a provider
// into the app shell to answer a boolean.
export function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduce;
}

// ---------- flap ----------
// A split-flap cell: the old value rolls up and out while the new one rolls up
// into its place. No crossfade — a departure board does not dissolve, and
// opacity is the landing page's language.
//
// `items` is the full set of values this readout can ever show, e.g.
// [{ key: "onair", label: "On air" }]. Passing it stacks every label in one
// grid cell so the box is as wide as the LONGEST of them — which is what stops
// the readout resizing as it changes, and does it without measuring anything,
// so a translation longer than the English cannot clip.
//
// Omit `items` for an open set (a ticker can be anything). The box then
// follows the current value and snaps width at the swap, which is invisible at
// three or four characters and is the only honest option without a measure.
export function Flap({ value, items, className = "", style }) {
  const reduce = usePrefersReducedMotion();
  const lastRef = useRef(value);
  const [out, setOut] = useState(null);

  useEffect(() => {
    const was = lastRef.current;
    lastRef.current = value;
    // Nothing to flap on mount (was === value), and nothing to flap for a
    // reader who asked for no motion — rendering the outgoing cell would just
    // park a second label on top of the first for a quarter of a second, since
    // the blanket reduce rule collapses the animation that was to clear it.
    if (was === value || reduce) return undefined;
    setOut(was);
    const id = setTimeout(() => setOut(null), FLAP_MS);
    return () => clearTimeout(id);
  }, [value, reduce]);

  const cells = items || [
    ...(out != null && out !== value ? [{ key: out, label: out }] : []),
    { key: value, label: value },
  ];

  return (
    <span className={`v-flap ${items ? "" : "v-flap-loose"} ${className}`.trim()} style={style}>
      {cells.map(it => {
        const on = it.key === value;
        const off = !on && it.key === out;
        return (
          // aria-hidden on everything but the current value, because the
          // outgoing cell is genuinely visible while it rolls out and would
          // otherwise be read as part of the status.
          <span key={it.key} className={on ? "is-on" : off ? "is-off" : undefined} aria-hidden={on ? undefined : "true"}>
            {it.label}
          </span>
        );
      })}
    </span>
  );
}

// ---------- shuttle ----------
// Work of unknown length. A spinner would say the same thing, but a spinner is
// a loop, and loops are what the landing page uses to attract attention; the
// desk wants the gesture a machine makes while it is scanning. Mount it only
// while something is really running.
export function Shuttle({ width = 14, height = 12, color, title }) {
  return (
    <span className="v-shuttle" role={title ? "img" : undefined} aria-label={title}
      aria-hidden={title ? undefined : "true"} style={{ width, height, color }}>
      <i />
    </span>
  );
}

// ---------- print ----------
// Arrival, staggered. The landing page brings things up from below; this wipes
// them in from the top edge without moving them, so a card is revealed where
// it already is instead of travelling to get there.
//
// `radius` has to match the card's own, or the clip squares its corners off
// for the length of the animation.
export function printIn(index, { step = 55, base = 0, radius = 12 } = {}) {
  return { animationDelay: `${base + index * step}ms`, "--v-print-r": `${radius}px` };
}
