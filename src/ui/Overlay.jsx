// ============================================================
//  Overlay.jsx — a dialog that can also leave.
//
//  WHY THIS EXISTS
//  Every dialog in this app was written as `{open && <div className="v-rise">}`,
//  and `.v-rise` is `animation: v-rise … both` — an entrance and nothing else.
//  So each one faded up on the way in and then vanished on a frame boundary on
//  the way out. That asymmetry is not an oversight in the CSS; it is the one
//  thing CSS structurally cannot do. By the time `open` is false React has
//  already unmounted the node, and you cannot animate an element that is no
//  longer in the tree.
//
//  Motion's AnimatePresence is the answer to exactly that: it keeps the node
//  mounted until its exit animation finishes, then drops it. Which forces one
//  API decision — the conditional has to live INSIDE this component. A caller
//  writing `{open && <Overlay/>}` would unmount the Overlay itself and take
//  AnimatePresence with it, and nothing would animate out. So `open` is a prop.
//
//  WHY domAnimation RATHER THAN THE WHOLE LIBRARY
//  Importing `motion` whole costs 43 kB gzipped on the main bundle, measured
//  against this app's 183 kB baseline. `domAnimation` under LazyMotion is the
//  subset that covers animation and presence — everything below — and skips
//  layout projection and drag, which nothing here uses. `strict` makes a stray
//  `motion.div` throw rather than silently pulling the full set back in, so the
//  saving cannot be undone by accident in a later edit.
//
//  It is imported normally rather than through LazyMotion's async `features`
//  form. The async split parks another 14 kB off the critical path, and is a
//  reasonable thing to want back if payload ever gets tight — but it introduces
//  a race with components that mount during boot, and the welcome modal opens
//  on the very first render. Not worth 14 kB without a reason to spend the
//  care.
//
//  THE CHILDREN OUTLIVE THE STATE THAT MADE THEM
//  A caller usually renders from the same state that opens the dialog:
//  `<Overlay open={!!draft}>{draft.title}</Overlay>`. Set `draft` to null and
//  that throws — not inside this component, but in the caller, which evaluates
//  its own children eagerly one render before the exit can even start. A ref in
//  here cannot save it, because the crash happens before `open` is read.
//
//  So children may be a FUNCTION. A function is not called when the dialog is
//  shut, and the last value it returned while open is held in a ref and re-used
//  for the way out. The dialog leaves showing what it was showing, which is the
//  only thing it could honestly show. Plain children still work for the dialogs
//  whose content does not depend on the state that opened them.
//
//  REDUCED MOTION IS NOT INHERITED HERE
//  global.css silences animation app-wide by forcing `animation-duration` to
//  0.01ms under prefers-reduced-motion. That rule cannot reach these: Motion
//  drives transform and opacity from JavaScript, and there is no CSS animation
//  for a duration override to shorten. The preference has to be read again, in
//  JS, or this component would be the one place in the app that ignores it.
// ============================================================
import React, { useEffect, useRef } from "react";
import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";

// Enter on a spring, leave on a short curve. Deliberately not symmetrical: an
// opening dialog is the thing you asked for and can afford presence, while a
// closing one is already dismissed and any weight past ~140ms reads as lag.
const SPRING = { type: "spring", stiffness: 420, damping: 32, mass: 0.7 };
const LEAVE = { duration: 0.14, ease: [0.4, 0, 1, 1] };

export default function Overlay({
  open,
  onDismiss,          // omit for a dialog with no way out but its own buttons
  label,
  labelledBy,
  backdrop,           // style overrides for the full-screen scrim
  panel,              // style overrides for the card itself
  panelClassName,
  children,
}) {
  const reduce = useReducedMotion();
  const last = useRef(null);
  if (open) last.current = typeof children === "function" ? children() : children;

  // Escape closes anything that can be closed. Stopped from propagating so a
  // dialog opened over another surface does not also dismiss what is behind it.
  useEffect(() => {
    if (!open || !onDismiss) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onDismiss]);

  // Under reduced motion the movement goes and the fade stays: opacity is not
  // what triggers vestibular discomfort, translation and scale are.
  //
  // The leave timing rides on the `exit` object rather than on `transition`.
  // That looks like a detail and is not: by the time this is animating out the
  // element has been removed from the tree, so `open` is stale-true in the
  // subtree AnimatePresence kept, and a `transition={open ? enter : leave}`
  // would pick the entrance spring every single time. A transition declared
  // inside `exit` is the only one the exit can actually see.
  const leave = reduce ? { duration: 0.1 } : LEAVE;
  const rise = reduce
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0, transition: leave },
      }
    : {
        initial: { opacity: 0, y: 10, scale: 0.985 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 6, scale: 0.99, transition: leave },
      };

  // `strict` makes a stray `motion.div` throw instead of silently pulling the
  // whole library back in past `domAnimation` — the regression this file is
  // shaped to avoid, made loud rather than expensive.
  return (
    <LazyMotion features={domAnimation} strict>
      <AnimatePresence>
        {open && (
          <m.div
            key="overlay"
            role="dialog"
            aria-modal="true"
            aria-label={labelledBy ? undefined : label}
            aria-labelledby={labelledBy}
            onClick={onDismiss}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: leave }}
            transition={{ duration: reduce ? 0.1 : 0.18 }}
            style={{
              position: "fixed", inset: 0, display: "flex",
              alignItems: "center", justifyContent: "center",
              background: "rgba(5,8,13,0.85)", padding: 16, zIndex: 70,
              ...backdrop,
            }}
          >
            {/* stopPropagation so a click inside the card is not a click on the
                scrim, which is what dismisses. */}
            <m.div
              className={panelClassName}
              onClick={(e) => e.stopPropagation()}
              initial={rise.initial}
              animate={rise.animate}
              exit={rise.exit}
              transition={reduce ? { duration: 0.12 } : SPRING}
              style={panel}
            >
              {last.current}
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}
