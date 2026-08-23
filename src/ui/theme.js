// ============================================================
//  Vantage design system — the single source of truth for colour, type,
//  spacing, radius and elevation.
//
//  WHY THIS FILE EXISTS
//  The dashboard styles itself inline from one palette object. Before this
//  module that object lived in React.jsx, which meant "restyle the app" was a
//  9,000-line find-and-replace. Now the palette is data: change a value here
//  and every panel, button and chart in the app follows.
//
//  THE LOOK — "midnight precision instrument" (see DESIGN.md / Linear reference)
//  Void canvas (#08090a) with a four-step surface ladder, paper-white type at
//  tight negative tracking, hairline borders instead of shadows, and exactly
//  ONE chromatic action colour: acid lime (#e4f222), used for the single
//  primary action in a view and never for decoration. Weights live in a low
//  400–590 band; the system never bolds. Radii are a three-note vocabulary
//  (6px controls, 12px cards, pills) and elevation comes from the surface
//  progression #08090a → #0f1011 → #161718 → #23252a, not from ambient shadow.
//
//  MARKET SEMANTICS — the one documented deviation
//  The reference calls Pulse Green and Coral Red "supporting accents, not
//  status colours" because Linear has no rising/falling data. A market terminal
//  does: price direction is the product. So green (#27a644) is up and coral
//  (#eb5757) is down — the palette's own green and red, used semantically.
//  Coral also carries the on-air state, separated from "down" by treatment
//  (solid fill + dot vs plain text), which is how a control room reads a tally
//  light anyway. Acid lime stays out of it: data is never the CTA colour.
//
//  COMPATIBILITY
//  `C` keeps every key the old palette had (bg, panel, panelEdge, amber,
//  amberDim, text, muted, faint, up, down, grid) so existing inline styles keep
//  working untouched. New tokens are additive.
// ============================================================

// ---------- raw ramps ----------
// Cool near-blacks with a faint blue cast — the reference's own ladder. Each
// step is a documented surface level, not an arbitrary tint.
const ink = {
  0: "#08090a", // void — page canvas, the substrate everything sits on
  1: "#0f1011", // carbon — card surfaces, nav containers
  2: "#161718", // obsidian — elevated panels, inputs, nested surfaces
  3: "#23252a", // graphite — hairline borders, ghost outlines, interactive tint
  4: "#383b3f", // smoke — higher-contrast hairlines, section separators
  5: "#62666d", // ash — muted body text, inactive icons
};
const light = {
  paper: "#ffffff",  // primary headings, max-contrast emphasis
  bone: "#e5e5e6",   // near-white surface fills
  mist: "#d0d6e0",   // body text, button labels on dark
  fog: "#8a8f98",    // tertiary text, placeholders, icon fills
};

// The single chromatic action. One per view — the reference is explicit that
// this is a flashlight, not a paint.
const acid = {
  lime: "#e4f222",
  limeDim: "#8b9615",                     // 3.4:1 on void — the border weight
  limeGlow: "rgba(228,242,34,0.10)",
  limeEdge: "rgba(228,242,34,0.40)",
};

// Data voices. Semantic here (see header note), never chrome.
const signal = {
  green: "#27a644",
  greenDim: "#1a6e2d",
  greenSoft: "rgba(39,166,68,0.12)",
  coral: "#eb5757",
  coralDim: "#8f3535",
  coralGlow: "rgba(235,87,87,0.12)",
  coralEdge: "rgba(235,87,87,0.45)",
  coralSoft: "rgba(235,87,87,0.10)",
  teal: "#02b8cc",
  violet: "#6366f1",
};

// ---------- the palette the app consumes ----------
export const C = {
  // --- legacy keys (same names as before → existing inline styles keep working) ---
  bg: ink[0],
  panel: ink[1],
  panelEdge: ink[3],
  // "amber" survives as the functional warning marker. The reference has no
  // amber, so it resolves to coral — the system's one cautionary voice.
  amber: signal.coral,
  amberDim: signal.coralDim,
  text: light.mist,
  muted: light.fog,
  faint: ink[5],
  up: signal.green,
  down: signal.coral,
  grid: ink[3],

  // --- surfaces (the documented 0→3 ladder) ---
  base: ink[0],
  surface: ink[1],
  surfaceRaised: ink[2],
  surfaceSunken: ink[0],
  inputBg: "rgba(255,255,255,0.02)",
  edge: ink[3],
  edgeSoft: ink[2],
  edgeStrong: ink[4],

  // --- accent (interactive, selection, AI) ---
  // Acid lime: the only chromatic UI element in the system. Reserved for the
  // primary action — everything else is neutral.
  accent: acid.lime,
  accentHover: "#eef79a",
  accentPress: "#cfdb1f",
  // A TEXT token in every call site (inline code, badges, nav badges), so it is
  // neutral for the same reason accentText is.
  accentSoft: light.mist,
  accentGlow: "rgba(255,255,255,0.05)",   // neutral selection wash — not lime
  accentEdge: ink[4],
  // Lime is a FILL colour only. Emphasis text — ticker symbols, active labels,
  // links — takes mist: lime on every highlighted word turns the flashlight
  // into wallpaper, which is the one thing the reference forbids outright.
  accentText: light.mist,

  // --- live / on-air (coral — the broadcast tally voice) ---
  live: signal.coral,
  liveDim: signal.coralDim,
  liveGlow: signal.coralGlow,
  liveEdge: signal.coralEdge,
  liveFill: signal.coral,   // solid block; pair with textOnLive
  liveSoft: "#f28080",
  textOnLive: ink[0],       // 5.6:1 on the coral fill — white would be 3.4:1

  // --- market semantics (see header note) ---
  upSoft: signal.greenSoft,
  downSoft: signal.coralSoft,
  upDim: signal.greenDim,

  // --- status ---
  info: signal.teal,
  warn: signal.coral,
  danger: signal.coral,
  success: signal.green,

  // --- text ---
  textStrong: light.paper,
  textMuted: light.fog,
  textFaint: ink[5],
  // NEAR-BLACK on the lime fill (16:1). This flips with the accent — a dark
  // accent would need paper here.
  textOnAccent: ink[0],

  // --- additive ---
  moss: ink[2],     // legacy soft-surface alias from an earlier theme
  citrus: ink[2],   // ditto — both resolve to the obsidian lift now
  link: light.mist,
};

// ---------- gradients ----------
// The reference permits exactly one gradient: the atmospheric floor under the
// hero. Everything else is flat, so these ramps are near-solid — they keep
// every call site working while reading as a single confident fill.
export const GRAD = {
  brand: "linear-gradient(135deg, #ffffff 0%, #d0d6e0 100%)",
  // Both stops are lime, so this ramp carries NEAR-BLACK label text.
  accent: "linear-gradient(135deg, #e4f222 0%, #cfdb1f 100%)",
  live: "linear-gradient(135deg, #eb5757 0%, #c14444 100%)",

  // The sanctioned one: a dark-to-light wash that grounds floating UI against
  // the void. Used for hero/auth backdrops.
  aurora:
    "radial-gradient(1200px 600px at 12% -10%, rgba(208,214,224,0.05), transparent 60%)," +
    "radial-gradient(900px 500px at 95% 0%, rgba(99,102,241,0.05), transparent 55%)," +
    "radial-gradient(700px 500px at 60% 110%, rgba(255,255,255,0.03), transparent 60%)",

  // Fades a scrolling list out at its edge instead of cutting it off.
  fadeDown: "linear-gradient(180deg, #0f1011 0%, rgba(15,16,17,0) 100%)",
};

// ============================================================
//  TYPOGRAPHY
//
//  TWO VOICES, ONE DISCIPLINE — the reference caps at weight 590 and carries
//  authority through size and tight negative tracking, never bolding:
//    • UI / prose      → Inter (the reference's own primary face), with the
//                        cv01 / ss03 / zero alternates enabled in global.css —
//                        those glyphs are the typographic identity.
//    • Instrument      → IBM Plex Mono (the reference's listed substitute for
//                        Berkeley Mono), reserved for issue-ID-class metadata:
//                        eyebrows, status tags, tickers, column headers. When
//                        you see mono, you are looking at a system surface.
//  Archivo remains exported for anything referencing DISPLAY directly, but the
//  display tokens speak Inter — the reference admits no third face.
// ============================================================

export const MONO = "'IBM Plex Mono', 'SF Mono', Menlo, Consolas, monospace";
export const SANS = "'Inter', -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
export const DISPLAY = "'Archivo', 'Inter', 'Helvetica Neue', Arial, sans-serif";

export const TYPE = {
  // --- display ---
  // Tracking is a function of size, not of role: -0.022em from 48px up,
  // -0.012em across 20-32. Letting a 32px token wear the 48px value is the
  // classic way a type scale drifts out of true.
  displayLg: { fontFamily: SANS, fontWeight: 510, fontSize: 48, letterSpacing: "-0.022em", lineHeight: 1.0 },
  display: { fontFamily: SANS, fontWeight: 510, fontSize: 32, letterSpacing: "-0.012em", lineHeight: 1.13 },

  // --- structural (590 is the ceiling — the reference never bolds) ---
  title: { fontFamily: SANS, fontWeight: 510, fontSize: 20, letterSpacing: "-0.012em", lineHeight: 1.33 },
  heading: { fontFamily: SANS, fontWeight: 510, fontSize: 16, letterSpacing: "-0.010em", lineHeight: 1.4 },
  subhead: { fontFamily: SANS, fontWeight: 510, fontSize: 14, letterSpacing: "-0.010em", lineHeight: 1.4 },

  // --- prose ---
  body: { fontFamily: SANS, fontWeight: 400, fontSize: 16, letterSpacing: "-0.010em", lineHeight: 1.5 },
  bodySm: { fontFamily: SANS, fontWeight: 400, fontSize: 15, letterSpacing: "-0.011em", lineHeight: 1.6 },
  caption: { fontFamily: SANS, fontWeight: 400, fontSize: 12, lineHeight: 1.4 },

  // --- labels: the instrument voice — mono, uppercase, tight ---
  // eyebrow and eyebrowSm are the same size on purpose: the mono scale has two
  // rungs (12 label, 14 reading) and no third. eyebrowSm survives as an alias.
  eyebrow: { fontFamily: MONO, fontWeight: 400, fontSize: 12, letterSpacing: "-0.013em", lineHeight: 1.4, textTransform: "uppercase" },
  eyebrowSm: { fontFamily: MONO, fontWeight: 400, fontSize: 12, letterSpacing: "-0.013em", lineHeight: 1.4, textTransform: "uppercase" },
  label: { fontFamily: SANS, fontWeight: 400, fontSize: 12, lineHeight: 1.4 },

  // --- numeric: tabular always ---
  num: { fontFamily: MONO, fontWeight: 400, fontSize: 14, letterSpacing: "-0.013em", fontVariantNumeric: "tabular-nums" },
  numSm: { fontFamily: MONO, fontWeight: 400, fontSize: 12, letterSpacing: "-0.013em", fontVariantNumeric: "tabular-nums" },
  numLg: { fontFamily: MONO, fontWeight: 400, fontSize: 32, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.013em", lineHeight: 1.1 },
  ticker: { fontFamily: MONO, fontWeight: 400, fontSize: 12, letterSpacing: "-0.013em", fontVariantNumeric: "tabular-nums" },
  code: { fontFamily: MONO, fontWeight: 400, fontSize: 12, letterSpacing: "-0.013em", lineHeight: 1.55 },
};

// ---------- geometry ----------
// The entire radius vocabulary: 4px badges, 6px controls/inputs, 12px cards.
// Nothing rounds past 12 except pills — the reference forbids 16+.
export const R = { xs: 4, sm: 6, md: 6, lg: 12, xl: 12, pill: 9999 };

// The 4px base unit and its 8/12/24/96 ladder.
export const SP = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 };

// ---------- elevation ----------
// Borders do the work shadows usually would. The two real shadows are a tight
// dark drop for small cards and the inset hairline ring that defines a card
// edge; `accent` is the inset stack the reference reserves for the lime CTA —
// the only chrome element in the system that gets a true shadow.
export const SHADOW = {
  none: "none",
  sm: "rgba(0, 0, 0, 0.4) 0px 2px 4px 0px",
  md: "rgba(0, 0, 0, 0.2) 0px 0px 12px 0px inset",
  lg: "rgb(35, 37, 42) 0px 0px 0px 1px inset",
  xl: "rgba(8, 9, 10, 0.6) 0px 4px 32px 0px",
  accent: "rgba(0,0,0,0.01) 0px 5px 2px 0px, rgba(0,0,0,0.04) 0px 3px 2px 0px, rgba(0,0,0,0.07) 0px 1px 1px 0px",
  inset: "rgb(35, 37, 42) 0px 0px 0px 1px inset",
};

export const Z = { base: 0, rail: 20, dock: 40, header: 50, overlay: 60, modal: 70, toast: 80, tour: 90 };

// Motion: short and mechanical — the feel of a precision instrument, not a
// marketing site. Colour, background and border transition together so a state
// change reads as one switch flipping. No spring physics.
export const MOTION = {
  fast: "150ms",
  base: "200ms",
  slow: "300ms",
  ease: "cubic-bezier(0.4, 0, 0.2, 1)",
  spring: "cubic-bezier(0.4, 0, 0.2, 1)",
};

// ============================================================
//  Component recipes — small style factories so a button looks the same
//  everywhere without a CSS framework. They return plain style objects,
//  which is what the existing inline-styled codebase already speaks.
// ============================================================

export function button(variant = "ghost", size = "md", opts = {}) {
  const { active = false, disabled = false, full = false } = opts;
  const sizes = {
    sm: { padding: "6px 12px", fontSize: 12, borderRadius: R.md, gap: 6 },
    md: { padding: "10px 16px", fontSize: 13, borderRadius: R.md, gap: 8 },
    lg: { padding: "12px 22px", fontSize: 14, borderRadius: R.md, gap: 10 },
  };
  const variants = {
    // THE chromatic element: acid lime, near-black label, the reference's own
    // inset shadow stack. One per view — that discipline is the whole point.
    primary: { background: C.accent, color: C.textOnAccent, border: "1px solid transparent", fontWeight: 510, letterSpacing: "-0.010em", boxShadow: SHADOW.accent },
    // The neutral filled button: a barely-there white wash, no border.
    solid: { background: "rgba(255,255,255,0.05)", color: C.text, border: "1px solid transparent", fontWeight: 400 },
    ghost: { background: "transparent", color: active ? C.text : C.muted, border: `1px solid ${active ? C.edgeStrong : C.edge}`, fontWeight: 400 },
    quiet: { background: "transparent", color: C.muted, border: "1px solid transparent", fontWeight: 400 },
    live: { background: "transparent", color: C.live, border: `1px solid ${C.liveDim}`, fontWeight: 400 },
    danger: { background: "transparent", color: C.danger, border: `1px solid ${C.liveDim}`, fontWeight: 400 },
  };
  return {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    fontFamily: SANS, cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    width: full ? "100%" : undefined,
    whiteSpace: "nowrap",
    transition: `background ${MOTION.fast} ${MOTION.ease}, border-color ${MOTION.fast} ${MOTION.ease}, color ${MOTION.fast} ${MOTION.ease}, transform ${MOTION.fast} ${MOTION.ease}`,
    ...sizes[size], ...variants[variant],
  };
}

export function panel(opts = {}) {
  const { raised = false, pad = SP[4], glow = false } = opts;
  return {
    background: raised ? C.surfaceRaised : C.surface,
    border: `1px solid ${glow ? C.edgeStrong : C.edge}`,
    borderRadius: R.lg,
    padding: pad,
    boxShadow: "none",
  };
}

export function field(opts = {}) {
  const { invalid = false } = opts;
  return {
    width: "100%", boxSizing: "border-box",
    background: C.inputBg,
    border: `1px solid ${invalid ? C.danger : "rgba(255,255,255,0.08)"}`,
    borderRadius: R.md,
    color: C.text,
    fontFamily: SANS, fontSize: 14,
    padding: "12px 14px",
    outline: "none",
    transition: `border-color ${MOTION.fast} ${MOTION.ease}, box-shadow ${MOTION.fast} ${MOTION.ease}`,
  };
}

// Small status/eyebrow chip — the reference's badge: a faint white wash, fog
// text, 4px radius. Colour-coded variants swap the text colour only.
export function chip(tone = "neutral") {
  const tones = {
    neutral: { color: C.muted, border: "transparent", bg: "rgba(255,255,255,0.05)" },
    accent: { color: C.text, border: "transparent", bg: "rgba(255,255,255,0.05)" },
    live: { color: C.live, border: C.liveEdge, bg: C.liveGlow },
    up: { color: C.up, border: "transparent", bg: C.upSoft },
    down: { color: C.down, border: "transparent", bg: C.downSoft },
  }[tone];
  return {
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "3px 9px", borderRadius: R.xs,
    background: tones.bg, border: `1px solid ${tones.border}`, color: tones.color,
    ...TYPE.eyebrow, fontSize: 12,
  };
}

export default C;
