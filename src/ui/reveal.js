// Scroll-triggered entrances.
//
// The design handoff already names the entrance — vt-fadeup, sixteen pixels up
// over 0.7s — and the homepage plays it when the page arrives. Below the fold
// that is a gesture nobody sees: by the time you have scrolled to a panel, its
// animation finished several seconds ago. This is the same gesture on a
// different trigger. Not "the page arrived" but "you arrived". Reusing the
// keyframe rather than writing a second one is the point: two entrances that
// look slightly different would read as two kinds of thing.
//
// Three things this must never do.
//
// It must never hide something it then fails to reveal. The hidden state lives
// behind a class this module puts on <html>, so with JavaScript off, or in a
// browser without IntersectionObserver, nothing is ever transparent. The
// failure mode is no animation, never an empty page.
//
// It must never play for somebody who asked for less motion. That is checked
// before the flag goes on and watched afterwards, because the setting can be
// changed while the page is open — and when it changes to "reduce" mid-scroll,
// everything still hidden has to be shown, not left waiting for an animation
// that will no longer run.
//
// It must never replay. A panel that fades in every time it crosses the fold
// is a dashboard that will not sit still. Every element is revealed once and
// then unobserved.

const FLAG = "v-scrollfx";   // on <html>: the opt-in that arms the hidden state
const IN = "v-in";           // revealed, with the animation
const NOW = "v-now";         // revealed without it — see below

export function startReveal({
  root = document,
  selector = ".v-scrollin",
  stagger = 70,              // ms between siblings revealed together
  maxStagger = 4,            // …but a long row should not trail for a second
} = {}) {
  const noop = () => {};
  if (typeof window === "undefined" || !("IntersectionObserver" in window)) return noop;

  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  let seen = new WeakSet();
  let io = null, mo = null, frame = 0;

  // Has the reader moved the page themselves yet. Everything revealed before
  // they have is shown without its animation; everything after it is animated.
  //
  // The tempting rule is to treat the observer's first callback as "what was on
  // screen when the page arrived" and animate everything after it. That reads
  // the wrong geometry: these panels mount before their data does, so at that
  // first callback the page is still short, and things that will end up well
  // below the fold are briefly near the top and intersecting.
  //
  // The next tempting rule is to watch the scroll position, and it is wrong for
  // a sharper reason: the dashboard scrolls itself to the active section on
  // load, a restored scroll position moves the page before anyone has touched
  // it, and a focus ring can move it too. All three fire `scroll`. Whether the
  // whole desk played a load animation would have come down to whether the
  // app's own scroll beat the observer's first callback — a race, resolved
  // differently on a slow machine. So what is listened for is the reader:
  // wheel, touch, the scrolling keys, and a press on the scrollbar gutter.
  // Nothing a script does produces any of those.
  let moved = false;

  const arm = () => { if (!moved) { moved = true; listen(false); } };
  // Not any key: typing an email address into a field is not scrolling.
  const KEYS = new Set([" ", "PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"]);
  const onKey = (e) => { if (KEYS.has(e.key)) arm(); };
  // Dragging the scrollbar makes no wheel and no touch. It does make a pointer
  // press outside the layout viewport, and the gutter is the only thing there.
  const onPointer = (e) => {
    const d = document.documentElement;
    if (e.clientX > d.clientWidth || e.clientY > d.clientHeight) arm();
  };
  const INTENT = [["wheel", arm], ["touchmove", arm], ["keydown", onKey], ["pointerdown", onPointer]];
  const listen = (add) => {
    for (const [type, fn] of INTENT) {
      if (add) window.addEventListener(type, fn, { passive: true });
      else window.removeEventListener(type, fn);
    }
  };

  // Already revealed, by either route. Checked as well as `seen` because the
  // observers can be torn down and rebuilt — turning motion off and on again —
  // and a panel that has had its entrance must not be given a second one.
  const done = (el) => el.classList.contains(IN) || el.classList.contains(NOW);

  const show = (el, i) => {
    // The reader has not moved the page yet, so this is on screen because the
    // page arrived at it and not because they did. Animating it would be a load
    // animation wearing a scroll animation's clothes — and on a dashboard it
    // delays the numbers being readable to no purpose.
    if (!moved) { el.classList.add(NOW); return; }
    if (stagger && i > 0) el.style.animationDelay = `${Math.min(i, maxStagger) * stagger}ms`;
    el.classList.add(IN);
  };

  const scan = () => {
    for (const el of root.querySelectorAll(selector)) {
      if (done(el) || seen.has(el)) continue;
      seen.add(el);
      io.observe(el);
    }
  };

  const start = () => {
    seen = new WeakSet();
    // A restart — motion turned off and back on — waits for the reader again.
    moved = false;
    listen(true);
    document.documentElement.classList.add(FLAG);
    io = new IntersectionObserver((entries) => {
      // Index within THIS batch, not within the document: the stagger is about
      // things arriving together, and two panels that came into view on the
      // same scroll are what "together" means.
      let i = 0;
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        show(e.target, i++);
        io.unobserve(e.target);
      }
    }, {
      // A tenth of the viewport in, so a panel commits to being on screen
      // before it starts. Triggering at the exact edge makes things animate
      // while they are still a sliver.
      rootMargin: "0px 0px -10% 0px",
      threshold: 0.01,
    });
    scan();

    // Panels mount late: some are behind a settings toggle, some wait on data.
    // Coalesced to one frame because this subtree changes on every price tick
    // and the scan must not run hundreds of times a second.
    mo = new MutationObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; if (io) scan(); });
    });
    mo.observe(root === document ? document.body : root, { childList: true, subtree: true });
  };

  // Taking the flag off <html> is by itself enough to un-hide everything still
  // waiting: the hidden rule is written against it. Nothing below is needed to
  // keep the page readable — that is the point of hanging the hidden state on a
  // class this module owns.
  const stop = () => {
    listen(false);
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    io?.disconnect(); mo?.disconnect(); io = mo = null;
    document.documentElement.classList.remove(FLAG);
  };

  // Motion has just been turned off. Everything is visible now that the flag is
  // gone, and marking it all as already-shown is what lets motion be turned
  // back ON without the flag blinking the page the reader is reading out of
  // existence for the length of an animation.
  const settle = () => { for (const el of root.querySelectorAll(selector)) el.classList.add(NOW); };

  // Leave the DOM as it was found. Not tidiness: React remounts. In StrictMode
  // every effect is mounted, torn down and mounted again, and an earlier draft
  // marked everything shown on the way out — so the second mount found every
  // panel already done, observed nothing, and the whole feature was silently
  // dead in development while working in production. Undoing the marks means a
  // remount gets the page in the same state the first mount did.
  const reset = () => {
    for (const el of root.querySelectorAll(selector)) {
      el.classList.remove(IN, NOW);
      el.style.animationDelay = "";
    }
  };

  // The setting is not a constant. Somebody who turns motion down while
  // half-way down the page must not be left with a screen of invisible panels.
  const onChange = () => {
    if (!reduce.matches) return io ? null : start();
    stop();
    settle();
  };
  reduce?.addEventListener?.("change", onChange);

  if (!reduce?.matches) start();

  return () => { reduce?.removeEventListener?.("change", onChange); stop(); reset(); };
}
