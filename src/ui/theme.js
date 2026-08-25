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
//  THE LOOK — the Vantage redesign (see the handoff README + reference file)
//  Near-black canvas (#0b0e13) with a surface ladder, a cool grey text ramp
//  topping out at #e6e8eb (there is no pure white in this system), hairline
//  borders, and ONE accent: green #46a758 for the single primary action and
//  active state, with #4cc38a for positive numbers, on-air and accent text.
//
//  ACCENT DISCIPLINE — the core rule of the redesign
//  One accent, ONE primary action per screen. The previous UI put acid yellow
//  on GO, LIVE, +Add, the tabs and today's date simultaneously, so nothing read
//  as primary. Green is reserved for the main action and for positive/live
//  states; everything else is a neutral surface or an outline. Amber (#dd9a3c)
//  is the one cautionary voice — market-closed and alert dots.
//
//  TYPE — two voices, and the split is load-bearing
//  Schibsted Grotesk carries UI and prose; JetBrains Mono carries numbers,
//  tickers, timestamps and code. Mono NEVER sets body copy, buttons or
//  questions — that flatness was the previous UI's main hierarchy problem.
//  Unlike the old system this one does bold: card titles are 700.
//
//  COMPATIBILITY
//  `C` keeps every key it has ever had (bg, panel, panelEdge, amber, amberDim,
//  text, muted, faint, up, down, grid, moss, citrus, …) so existing inline
//  styles keep working untouched. New tokens are additive.
// ============================================================

// ---------- raw ramps ----------
// Surfaces. Each step is a documented level, not an arbitrary tint. Note that
// `alt` is not "one lighter" — it is DARKER than the card surface, because
// dropdowns and floating chips read as cut into the page rather than lifted off
// it. Ordering these by hex would break that intent.
const surf = {
  base: "#0b0e13",  // page / app background
  raised: "#11151c", // cards, panels, inputs
  alt: "#0e1218",   // dropdowns, floating chips
  inset: "#171c24", // icon tiles, secondary buttons
};
const line = {
  edge: "#1c222c",   // panel dividers, card borders
  strong: "#262d38", // inputs, outline buttons, hover borders
};
// The text ramp tops out at #e6e8eb. Nothing in this system is #ffffff — pure
// white against these near-blacks glares, and the reference never uses it.
const ink = {
  primary: "#e6e8eb",  // headings, body
  secondary: "#9aa3ae", // supporting copy
  tertiary: "#5b6470",  // metadata, labels, placeholders
};

// The single chromatic action, plus its lighter sibling for data and state.
const grow = {
  accent: "#46a758",     // primary action, active state
  light: "#4cc38a",      // positive numbers, on-air, accent text
  hover: "#4fb862",      // between accent and light — the button hover step
  press: "#3c8f4b",
  glow: "rgba(70,167,88,0.14)",
  edge: "rgba(70,167,88,0.45)",
  soft: "rgba(76,195,138,0.12)",
};
const alarm = {
  negative: "#dd6a6e",   // negative numbers, bear pieces
  negativeDim: "#8f4245",
  negativeSoft: "rgba(221,106,110,0.12)",
  negativeEdge: "rgba(221,106,110,0.45)",
  warning: "#dd9a3c",    // market-closed dot, alert dot
  warningDim: "#8c6126",
  warningSoft: "rgba(221,154,60,0.12)",
};
// Chess board squares — named because the game reads them directly.
const board = { lightSq: "#232c38", darkSq: "#161d27" };

// ---------- the palette the app consumes ----------
export const C = {
  // --- legacy keys (same names as before → existing inline styles keep working) ---
  bg: surf.base,
  panel: surf.raised,
  panelEdge: line.edge,
  // "amber" is a real amber again. The previous system had none and resolved it
  // to coral; this one has a dedicated cautionary colour, so the alias is honest.
  amber: alarm.warning,
  amberDim: alarm.warningDim,
  text: ink.primary,
  muted: ink.secondary,
  faint: ink.tertiary,
  up: grow.light,
  down: alarm.negative,
  grid: line.edge,

  // --- surfaces ---
  base: surf.base,
  surface: surf.raised,
  surfaceRaised: surf.inset,
  surfaceAlt: surf.alt,        // dropdowns, floating chips — cut in, not lifted
  surfaceSunken: surf.base,
  inputBg: surf.raised,
  edge: line.edge,
  edgeSoft: surf.inset,
  edgeStrong: line.strong,

  // --- accent (interactive, selection, AI) ---
  accent: grow.accent,
  accentHover: grow.hover,
  accentPress: grow.press,
  accentSoft: grow.light,
  accentGlow: grow.glow,
  accentEdge: grow.edge,
  // Unlike the previous system, accent text IS chromatic here: the redesign
  // gives #4cc38a to positive numbers, "on air" and accent text by name.
  accentText: grow.light,

  // --- live / on-air (green now, not coral — "on air" is a positive state) ---
  live: grow.light,
  liveDim: grow.press,
  liveGlow: grow.soft,
  liveEdge: grow.edge,
  liveFill: grow.light,
  liveSoft: grow.light,
  textOnLive: surf.base,     // 8.4:1 on #4cc38a; white would be 2.3:1

  // --- market semantics ---
  upSoft: grow.soft,
  downSoft: alarm.negativeSoft,
  // The negative hairline. Call sites used to hard-code rgba(235,87,87,0.4) —
  // the PREVIOUS palette's red — and a literal cannot be retargeted, so it
  // survived every retheme. Naming it is what stops that happening again.
  downEdge: alarm.negativeEdge,
  upDim: grow.press,

  // --- status ---
  info: grow.light,
  warn: alarm.warning,
  warnSoft: alarm.warningSoft,
  danger: alarm.negative,
  dangerEdge: alarm.negativeEdge,
  dangerSoft: alarm.negativeSoft,
  success: grow.accent,

  // --- text ---
  textStrong: ink.primary,
  textMuted: ink.secondary,
  textFaint: ink.tertiary,
  // Near-black on the green fill (6.3:1). #e6e8eb here would be 3.1:1 — below
  // AA for anything but large text, which is why the reference sets #0b0e13.
  textOnAccent: surf.base,

  // --- chess ---
  boardLight: board.lightSq,
  boardDark: board.darkSq,

  // --- additive / legacy aliases ---
  moss: surf.inset,
  citrus: surf.inset,
  link: grow.light,
};

// ---------- the game field ----------
//
// Algorithm Wars' battlefield and the chess board share one vocabulary, and it
// is not the product's. A lane divider, a midline dash and a board coordinate
// are all a step or two below C.faint — quiet enough to sit under pieces
// without ever being read as content — and the two-stop ramps are physical
// objects (a server tower, an integrity meter) rather than surfaces.
//
// They live in their own group rather than widening C with a dozen keys that
// mean nothing outside a game. Values come straight from the games handoff.
export const FIELD = {
  // Two rungs below C.faint (#5b6470). Board coordinates and empty trays take
  // the first; a log timestamp, which sits beside text it must not compete
  // with, takes the second.
  quaternary: "#4a5462",
  quinary: "#3d4553",
  laneLine: "#131b26",
  laneLabel: "#2c3542",
  midline: "#2a3240",
  grid: "#111a24",
  // Meters read left-to-right, so they run dark → light: the bar brightens as
  // it fills. Towers are lit from above and so run light → dark.
  youMeter: ["#2a6c39", "#4fbc65"],
  foeMeter: ["#8c3a3e", "#dd6a6e"],
  youTower: ["#4fbc65", "#2a6c39"],
  foeTower: ["#e07a7e", "#8c3a3e"],
};

// ---------- gradients ----------
export const GRAD = {
  // The brand tile is a green chip in this system, not a white one.
  brand: `linear-gradient(135deg, ${grow.light} 0%, ${grow.accent} 100%)`,
  // Both stops are green, so this ramp carries NEAR-BLACK label text.
  accent: `linear-gradient(135deg, ${grow.light} 0%, ${grow.accent} 100%)`,
  live: `linear-gradient(135deg, ${grow.light} 0%, ${grow.accent} 100%)`,

  // The two drifting orbs behind the homepage hero (vt-float1 / vt-float2).
  aurora:
    "radial-gradient(480px 480px at 12% 4%, rgba(70,167,88,0.14), transparent 62%)," +
    "radial-gradient(520px 520px at 92% 14%, rgba(76,195,138,0.09), transparent 58%)",

  // Fades a scrolling list out at its edge instead of cutting it off.
  fadeDown: `linear-gradient(180deg, ${surf.raised} 0%, rgba(17,21,28,0) 100%)`,

  // The primary button's animated sheen (vt-sheen moves background-position
  // -200% → 200%; the element needs background-size: 200%).
  sheen: `linear-gradient(100deg, ${grow.accent} 0%, ${grow.hover} 45%, ${grow.light} 55%, ${grow.accent} 100%)`,
};

// ============================================================
//  TYPOGRAPHY
//  Schibsted Grotesk for UI and prose, JetBrains Mono for values. The rule that
//  matters: mono never sets body copy, buttons or questions.
//  Uppercase mono labels take POSITIVE tracking (0.5–2px) — the opposite of the
//  negative tracking headings use, and easy to get backwards.
// ============================================================

export const MONO = "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";
export const SANS = "'Schibsted Grotesk', -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
// No third face: DISPLAY speaks the UI font. Kept as an export because call
// sites reference it directly.
export const DISPLAY = SANS;

export const TYPE = {
  // --- display ---
  // Tracking is a function of size: the hero's -3.5px at 82px is -0.043em, and
  // a smaller token wearing that value would collapse. Each rung carries its own.
  hero: { fontFamily: SANS, fontWeight: 700, fontSize: 82, letterSpacing: "-0.043em", lineHeight: 0.95 },
  displayLg: { fontFamily: SANS, fontWeight: 700, fontSize: 40, letterSpacing: "-0.030em", lineHeight: 1.05 },
  display: { fontFamily: SANS, fontWeight: 600, fontSize: 26, letterSpacing: "-0.019em", lineHeight: 1.2 },

  // --- structural (this system bolds: card titles are 700) ---
  title: { fontFamily: SANS, fontWeight: 600, fontSize: 20, letterSpacing: "-0.015em", lineHeight: 1.3 },
  heading: { fontFamily: SANS, fontWeight: 700, fontSize: 17, letterSpacing: "-0.010em", lineHeight: 1.35 },
  subhead: { fontFamily: SANS, fontWeight: 600, fontSize: 15, letterSpacing: "-0.008em", lineHeight: 1.4 },

  // --- prose ---
  body: { fontFamily: SANS, fontWeight: 400, fontSize: 15.5, lineHeight: 1.65 },
  bodySm: { fontFamily: SANS, fontWeight: 400, fontSize: 13.5, lineHeight: 1.6 },
  caption: { fontFamily: SANS, fontWeight: 400, fontSize: 12.5, lineHeight: 1.45 },

  // --- labels: the instrument voice — mono, uppercase, POSITIVE tracking ---
  eyebrow: { fontFamily: MONO, fontWeight: 500, fontSize: 12, letterSpacing: "0.10em", lineHeight: 1.4, textTransform: "uppercase" },
  eyebrowSm: { fontFamily: MONO, fontWeight: 500, fontSize: 11, letterSpacing: "0.14em", lineHeight: 1.4, textTransform: "uppercase" },
  label: { fontFamily: SANS, fontWeight: 500, fontSize: 11.5, lineHeight: 1.4 },

  // --- numeric: tabular always ---
  num: { fontFamily: MONO, fontWeight: 400, fontSize: 14, fontVariantNumeric: "tabular-nums" },
  numSm: { fontFamily: MONO, fontWeight: 400, fontSize: 12, fontVariantNumeric: "tabular-nums" },
  numLg: { fontFamily: MONO, fontWeight: 700, fontSize: 34, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", lineHeight: 1.1 },
  ticker: { fontFamily: MONO, fontWeight: 400, fontSize: 12, fontVariantNumeric: "tabular-nums" },
  code: { fontFamily: MONO, fontWeight: 400, fontSize: 12.5, lineHeight: 1.55 },
};

// ---------- geometry ----------
// The radius vocabulary, by role rather than by t-shirt size: 7 icon tile,
// 8 button/chip, 10 input, 12 inner card, 16 panel.
export const R = { xs: 7, sm: 8, md: 10, lg: 12, xl: 16, pill: 9999 };

// The 4px ladder stays as it is ON PURPOSE. The redesign's spacing set
// (6/8/10/12/14/18/20/22/26/40/48/64) is not a renaming of this one, so
// redefining these keys would silently reflow every existing call site by a few
// px in unpredictable directions. Existing screens keep this ladder; rebuilt
// screens take their spacing from the reference directly.
export const SP = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 };

// Minimum touch target anywhere in the product.
export const HIT = 44;

// ---------- elevation ----------
// This system does use real shadows — three of them, each with one job.
export const SHADOW = {
  none: "none",
  sm: "0 2px 6px rgba(0,0,0,0.35)",
  md: "0 8px 20px rgba(0,0,0,0.4)",
  // The floating chip that overlaps the hero card's corner.
  lg: "0 18px 40px rgba(0,0,0,0.55)",
  // The hero card itself.
  xl: "0 30px 70px rgba(0,0,0,0.5)",
  // The green lift under a hovered primary button.
  accent: "0 6px 18px rgba(70,167,88,0.3)",
  inset: `0 0 0 1px ${line.edge} inset`,
};

export const Z = { base: 0, rail: 20, dock: 40, header: 50, overlay: 60, modal: 70, toast: 80, tour: 90 };

// Motion: 0.2–0.25s for state, longer easings for the ambient loops. Hover
// lifts are 2px on buttons and 4–6px on cards.
export const MOTION = {
  fast: "150ms",
  base: "200ms",
  slow: "250ms",
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
  // Heights clear the 44px touch minimum at md and lg; sm is for dense toolbars
  // where the control sits inside a larger hit area.
  const sizes = {
    sm: { padding: "7px 12px", fontSize: 12.5, borderRadius: R.sm, gap: 6 },
    md: { padding: "11px 18px", fontSize: 13.5, borderRadius: R.sm, gap: 8 },
    lg: { padding: "14px 24px", fontSize: 15, borderRadius: R.sm, gap: 10 },
  };
  const variants = {
    // THE chromatic element: green fill, near-black label. One per screen — that
    // discipline is the whole point of the redesign.
    primary: { background: C.accent, color: C.textOnAccent, border: "1px solid transparent", fontWeight: 600 },
    // The neutral filled button — an inset surface, not a white wash.
    solid: { background: C.surfaceRaised, color: C.text, border: `1px solid ${C.edge}`, fontWeight: 500 },
    ghost: { background: "transparent", color: active ? C.text : C.muted, border: `1px solid ${active ? C.edgeStrong : C.edge}`, fontWeight: 500 },
    quiet: { background: "transparent", color: C.muted, border: "1px solid transparent", fontWeight: 500 },
    live: { background: "transparent", color: C.live, border: `1px solid ${C.liveEdge}`, fontWeight: 500 },
    danger: { background: "transparent", color: C.danger, border: `1px solid ${C.down}`, fontWeight: 500 },
  };
  return {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    fontFamily: SANS, cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    width: full ? "100%" : undefined,
    whiteSpace: "nowrap",
    letterSpacing: "-0.006em",
    transition: `background ${MOTION.base} ${MOTION.ease}, border-color ${MOTION.base} ${MOTION.ease}, color ${MOTION.base} ${MOTION.ease}, transform ${MOTION.base} ${MOTION.ease}, box-shadow ${MOTION.base} ${MOTION.ease}`,
    ...sizes[size], ...variants[variant],
  };
}

export function panel(opts = {}) {
  const { raised = false, pad = SP[4], glow = false } = opts;
  return {
    background: raised ? C.surfaceRaised : C.surface,
    border: `1px solid ${glow ? C.edgeStrong : C.edge}`,
    borderRadius: R.xl,
    padding: pad,
    boxShadow: "none",
  };
}

// A panel's title bar. Sentence-case sans at 13/600, hairlined off the body.
// `note` is the quiet half a title often carries — a count, a qualifier
// ("· by |Δ%|"), a provenance line — which belongs beside the title rather than
// stranded in a footer nobody reads.
export function panelHead(opts = {}) {
  const { pad = "12px 14px", divider = true } = opts;
  return {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
    padding: pad,
    borderBottom: divider ? `1px solid ${C.edge}` : "none",
    fontFamily: SANS, fontWeight: 600, fontSize: 13, color: C.text,
    lineHeight: 1.4,
  };
}

// The quiet half of a panel title.
export const panelNote = { fontFamily: SANS, fontWeight: 400, fontSize: 12, color: C.faint };

export function field(opts = {}) {
  const { invalid = false, size = "md" } = opts;
  // The default is byte-for-byte what it was, so every existing caller is
  // untouched. `sm` is the settings-row variant: transparent, so it reads as a
  // value you can change rather than a box waiting to be filled in.
  const sizes = {
    sm: { background: "transparent", borderRadius: R.sm, fontSize: 13, padding: "8px 14px" },
    md: { background: C.inputBg, borderRadius: R.md, fontSize: 14, padding: "13px 15px" },
  };
  return {
    width: "100%", boxSizing: "border-box",
    border: `1px solid ${invalid ? C.danger : C.edgeStrong}`,
    color: C.text,
    fontFamily: SANS,
    outline: "none",
    transition: `border-color ${MOTION.base} ${MOTION.ease}, box-shadow ${MOTION.base} ${MOTION.ease}`,
    ...sizes[size],
  };
}

// ============================================================
//  CHOICE CONTROLS — one control type per kind of choice.
//
//  segmented   one of a few, all options short and worth showing at once
//  pill        a set: several independent members of one group
//  Toggle      a single on/off                     (src/ui/Toggle.jsx)
//  field "sm"  one of many, where showing them all would be a wall
//
//  Getting this wrong is the failure the redesign names by name: the previous
//  settings screen used outlined buttons for the refresh interval, outlined
//  buttons for demo/live, and outlined buttons for the voice engine — three
//  different kinds of decision wearing one costume, so none of them read as
//  the kind of decision it was.
// ============================================================

// The track. Two buttons in a hairline box do not say "one question answered
// two ways"; a shared inset track carrying a single raised thumb does.
export function segmentTrack(opts = {}) {
  const { pad = 3 } = opts;
  return {
    display: "inline-flex", alignItems: "center",
    background: C.surfaceRaised, borderRadius: R.sm, padding: pad,
  };
}

// The thumb. `tone: "accent"` is for a choice that changes what the product IS
// — demo numbers versus real ones — and it is the only place a segment earns
// green. Everything else is a preference and takes the neutral raised thumb.
export function segmentItem(active, tone = "neutral", opts = {}) {
  const { pad = "5px 14px" } = opts;
  const on = tone === "accent"
    ? { background: C.accent, color: C.textOnAccent }
    : { background: C.edgeStrong, color: C.text };
  return {
    border: "none", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap",
    fontFamily: SANS, fontSize: 12.5, fontWeight: 600, padding: pad,
    transition: `background ${MOTION.fast} ${MOTION.ease}, color ${MOTION.fast} ${MOTION.ease}`,
    ...(active ? on : { background: "transparent", color: C.muted }),
  };
}

// One member of a set. Radius is 20 rather than R.pill because at this height
// the two are indistinguishable and 20 is the value the reference already
// carries.
//
// `tone` exists for the same reason it does on segmentItem: accent is the
// default, but a screen that has already spent its one accent elsewhere takes
// the neutral variant rather than adding a second green. The Markets chart
// indicators are neutral because the green on that screen belongs to "Full
// chart" — the action that leaves it.
export function pill(on, opts = {}) {
  const { pad = "7px 14px", tone = "accent" } = opts;
  const onStyle = tone === "accent"
    ? { border: `1px solid ${C.accent}`, background: C.accentGlow, color: C.text }
    : { border: `1px solid ${C.edgeStrong}`, background: C.surfaceRaised, color: C.text };
  return {
    display: "inline-flex", alignItems: "center", gap: 7,
    borderRadius: 20, padding: pad,
    fontFamily: SANS, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
    transition: `background ${MOTION.fast} ${MOTION.ease}, border-color ${MOTION.fast} ${MOTION.ease}, color ${MOTION.fast} ${MOTION.ease}`,
    ...(on ? onStyle : { border: `1px solid ${C.edgeStrong}`, background: "transparent", color: C.muted }),
  };
}

// Small status/eyebrow chip. Neutral by default — colour is reserved for the
// tones that actually mean something.
export function chip(tone = "neutral") {
  const tones = {
    neutral: { color: C.muted, border: C.edge, bg: C.surfaceRaised },
    accent: { color: C.accentText, border: C.accentEdge, bg: C.accentGlow },
    live: { color: C.live, border: C.liveEdge, bg: C.liveGlow },
    up: { color: C.up, border: "transparent", bg: C.upSoft },
    down: { color: C.down, border: "transparent", bg: C.downSoft },
    warn: { color: C.warn, border: "transparent", bg: alarm.warningSoft },
  }[tone];
  return {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "4px 10px", borderRadius: R.sm,
    background: tones.bg, border: `1px solid ${tones.border}`, color: tones.color,
    ...TYPE.eyebrow, fontSize: 11.5,
  };
}

// ============================================================
//  alpha() — the same colour, less of it.
//
//  WHY THIS EXISTS
//  Call sites used to hard-code rgba(235,87,87,0.30) and rgba(39,166,68,0.15):
//  the PREVIOUS palette's red and green. A literal cannot be retargeted, so
//  those survived a complete retheme — the app changed palette and a dozen
//  scattered LEDs, quiz answers and alert backgrounds quietly did not.
//
//  There is already a named token for every alpha this system uses often
//  (upSoft, downSoft, downEdge, accentGlow, liveGlow). This is for the one-off
//  alphas that do not earn a name, so that they still follow the palette.
// ============================================================
export function alpha(hex, a) {
  const h = String(hex).trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(h);
  // Not a hex colour — hand it back rather than emitting rgba(NaN, …), which
  // paints nothing and is invisible until someone screenshots it.
  if (!m) return h;
  const s = m[1].length === 3 ? m[1].replace(/./g, c => c + c) : m[1];
  const n = parseInt(s, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export default C;
