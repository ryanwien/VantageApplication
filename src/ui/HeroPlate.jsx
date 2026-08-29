// ============================================================
//  HeroPlate.jsx — depth behind the landing hero, kept off the words.
//
//  WHAT THIS IS
//  Two layers behind the top of the marketing page, in this order:
//
//    1. A dot grid. Pure CSS, no bytes, full width.
//    2. A still generated in Higgsfield (Recraft V4.1) — an out-of-focus
//       broadcast studio, mirrored and desaturated at encode time rather than
//       in CSS, so the file on disk is the final art and no transform has to
//       be reasoned about at runtime. 17.6 kB of WebP.
//
//  WHAT THE GRID IS FOR
//  A flat #0b0e13 page has no surface. Nothing catches light, so there is
//  nothing to tell you the black is a material rather than an absence, and the
//  page reads as unfinished rather than as dark. The lattice is the cheapest
//  possible fix: it gives the black a grain, and because it is regular it
//  reads as deliberate in a way noise never does.
//
//  It costs contrast, so it was measured like everything else here. Worst case
//  is a letterform landing exactly on a dot, and at 1440 that measures
//  rgb(30,33,37): headline 13.16:1, body copy 6.33:1, against 7.60:1 on the
//  bare page and a 4.5:1 floor. So the grid spends 1.27 of the paragraph's
//  contrast and keeps 1.83 in hand. Raise the alpha and you are spending from
//  that 1.83 — measure again before you do.
//
//  WHY IT IS PARKED IN THE UPPER RIGHT AND NOT SPREAD OVER THE PAGE
//  This is the part worth reading, because the first version did spread over
//  the page and it failed a measurement, not a taste test.
//
//  Full-bleed at 32% the plate lifted the area under the hero's body copy to
//  rgb(57,62,64). Against that, #9aa3ae body text measures 4.25:1 — under the
//  4.5:1 AA floor, where the same text on the bare #0b0e13 page measures
//  7.60:1. A decorative background had quietly eaten a third of the contrast
//  of the paragraph that explains the product.
//
//  Lowering opacity does not fix it; the plate goes invisible before it goes
//  safe. What fixes it is geography. The hero puts every word in the left
//  column and the BroadcastCard on the right, so a radial mask centred at
//  82%/18% lets the image live where there is no prose. Measured after:
//  headline 15.75:1, body copy 7.35:1 — the latter within 0.25 of the bare
//  page, which is the point. The atmosphere is free because it is somewhere
//  else.
//
//  So MASK_CENTRE and OPACITY are load-bearing for legibility, not styling
//  knobs. The source image is genuinely bright — its brightest pixel is 0.89
//  relative luminance — and nothing but this treatment is holding that off the
//  text. Move the mask or raise the opacity and you must re-measure the body
//  copy before shipping it.
//
//  WHY IT DOES NOT MOVE
//  The hero already animates. `.v-aurora` drifts two blurred blobs on 26s and
//  34s cycles and blooms them against the scroll, and `.v-heroparallax` slides
//  the card. A third moving layer would not read as richer, it would read as
//  busy. This plate is the one still thing the moving parts move against.
//
//  WHY z-index: -1
//  `.v-aurora` already sets `isolation: isolate` on the hero's ancestor, so a
//  negative layer paints above the page background and below every child —
//  including the two aurora pseudo-elements, which is the intended order:
//  photograph at the back, coloured wash over it, content on top. Nothing else
//  had to change to make room.
//
//  WHY public/ AND NOT AN IMPORT
//  Vite inlines imported assets under 4096 bytes. At 17.6 kB this is far clear
//  of that line, but from public/ it is also a plain cacheable request that
//  does not ride on the JS bundle's cache key — a decorative image should not
//  be re-downloaded because the app code changed.
// ============================================================
import React from "react";

// Centre of the visible pool, in the plate's own box. Chosen to sit over the
// BroadcastCard column; see the header before moving it.
const MASK =
  "radial-gradient(75% 70% at 82% 18%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.75) 35%, rgba(0,0,0,0.3) 62%, transparent 82%)";

// Tall enough to cover nav, tape and hero at desktop heights. Both layers fade
// out well before this line, so neither ever ends on a visible edge.
const HEIGHT = 1000;

// One dot, top-left of a 26px cell. `transparent 0` rather than a second length
// is the crisp-dot idiom — it gives the gradient nowhere to ramp, so the dot has
// a hard edge instead of a 1px blur that reads as grime at this size.
//
// Radius does the work here, not alpha, and the reason is worth keeping: the
// contrast floor is set by the single brightest pixel a letterform can land on,
// and that pixel is the dot's own colour no matter how wide the dot is. Growing
// the dot adds weight without moving the number that matters; raising the alpha
// moves it directly. So this is a wide, dim dot rather than a small, bright one.
const DOT = "radial-gradient(circle at 1px 1px, rgba(230,232,235,0.085) 1.4px, transparent 0)";
const CELL = "26px 26px";

// The grid stops before the showcase does. Fading on the vertical only, so it
// still runs the full width — a texture that stopped short of the left and
// right edges would draw the exact boundary the aurora fix just removed.
const GRID_MASK = "linear-gradient(to bottom, #000 0%, #000 52%, transparent 88%)";

const LAYER = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: HEIGHT,
  zIndex: -1,
  pointerEvents: "none",
};

export default function HeroPlate() {
  return (
    <>
      {/* Grid first, so the photograph's haze passes in front of it. The other
          order puts a perfectly regular lattice on top of atmosphere, which
          reads as a screen door hung over the room rather than as markings on
          the surface behind it. */}
      <div
        aria-hidden="true"
        style={{ ...LAYER, backgroundImage: DOT, backgroundSize: CELL, WebkitMaskImage: GRID_MASK, maskImage: GRID_MASK }}
      />
      <div
        aria-hidden="true"
        style={{
          ...LAYER,
          backgroundImage: "url(/hero-plate.webp)",
          backgroundSize: "cover",
          backgroundPosition: "center top",
          opacity: 0.55,
          WebkitMaskImage: MASK,
          maskImage: MASK,
        }}
      />
    </>
  );
}
