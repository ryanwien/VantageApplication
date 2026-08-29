// ============================================================
//  HeroPlate.jsx — depth behind the landing hero, kept off the words.
//
//  WHAT THIS IS
//  A still generated in Higgsfield (Recraft V4.1): an out-of-focus broadcast
//  studio, mirrored and desaturated at encode time rather than in CSS, so the
//  file on disk is the final art and no transform has to be reasoned about at
//  runtime. 17.6 kB of WebP for the whole thing.
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

// Tall enough to cover nav, tape and hero at desktop heights. The mask fades
// out well before the bottom edge, so this never ends on a visible line.
const HEIGHT = 1000;

export default function HeroPlate() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: HEIGHT,
        zIndex: -1,
        pointerEvents: "none",
        backgroundImage: "url(/hero-plate.webp)",
        backgroundSize: "cover",
        backgroundPosition: "center top",
        opacity: 0.55,
        WebkitMaskImage: MASK,
        maskImage: MASK,
      }}
    />
  );
}
