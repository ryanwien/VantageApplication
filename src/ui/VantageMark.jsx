// ============================================================
//  VantageMark — the product's logo.
//
//  WHAT IT IS
//  A V drawn as a price line, with a dot at its right terminus.
//
//  It is three things at once, which is the only reason it earns the space:
//    · the letter V
//    · a V-shaped recovery — the single chart shape everyone reads instantly
//    · two sightlines converging on a point, which is what a vantage *is*
//  The dot is the live price and the on-air light. It carries over from the
//  old mark (a bare dot on a tile) so this reads as that logo growing up
//  rather than as a rebrand.
//
//  WHY IT IS SHAPED THIS WAY
//  The arms are deliberately symmetric. A checkmark is short-left/long-right;
//  equal arms keep this a V and not a tick. There is no interior detail, no
//  text, and no gradient inside the glyph, because the real test of a logo is
//  16px in a browser tab — anything with structure to lose, loses it there.
//
//  WHY THE TILE IS FILLED
//  The redesign makes the mark a solid accent tile with a near-black glyph —
//  the inverse of the dark-tile-with-bright-V it replaced. On a #0b0e13 page a
//  green chip is the one saturated thing in the header, which is what a logo
//  should be, and near-black on #46a758 is 6.3:1 where the text token would be
//  3.1:1.
//
//  THE DOT, AND WHY IT SURVIVED THE REPALETTE
//  It was acid lime as an on-air light, under a rule reserving lime for actions
//  and active indicators. That rule and that colour are both gone. The dot is
//  now the accent-light green the redesign gives to on-air by name, which keeps
//  it inside the same idea rather than making it loose decoration. It is the
//  one detail here the reference does not have — the reference sets a plain
//  text V — so it is the first thing to drop if the mark ever reads busy.
//
//  WHY A COMPONENT
//  The mark appeared in five places as five hand-rolled spans, which is how a
//  logo quietly drifts into five slightly different logos. One source now.
//  The canvas twin lives in React.jsx (drawVantageMark) for the exporters and
//  the broadcast scenes, which cannot render React — if the geometry below
//  changes, change that too.
//
//  IGNITE
//  `ignite` makes the mark perform its own description once, at mount: the V
//  plots like the price line it claims to be, and the dot strikes the frame
//  the stroke reaches its terminus, with one ink blip radiating from the
//  strike. Only the landing page's nav asks for it — a logo that redrew on
//  every desk mount would be noise, so everywhere else stays still. The
//  choreography lives in global.css (.v-markdraw / .v-markdot / .v-markblip);
//  static base states mean a reader who asked for less motion, or a consumer
//  that never sets the prop, sees the finished mark and nothing else.
// ============================================================

import React from "react";

// Geometry is authored in a 32-unit box and scaled; every consumer picks a size.
const TILE = "#46a758";   // accent — the mark IS the accent chip in this system
const EDGE = "#46a758";   // no hairline: a filled tile needs no outline to sit in
const INK = "#0b0e13";    // near-black glyph, 6.3:1 on the tile
const DOT = "#4cc38a";    // accent light — the redesign's on-air colour

export default function VantageMark({
  size = 26, tile = TILE, edge = EDGE, ink = INK, dot = DOT, radius = 8, title, ignite = false,
}) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 32 32"
      role={title ? "img" : "presentation"} aria-label={title} aria-hidden={title ? undefined : "true"}
      style={{ display: "block", flexShrink: 0 }}
    >
      {tile !== "none" && (
        // Inset by half the stroke so the hairline lands inside the box and the
        // mark still measures exactly `size` — a border that straddles the edge
        // is what makes logos look half a pixel off at small sizes.
        <rect
          x="0.75" y="0.75" width="30.5" height="30.5" rx={Math.max(0, radius - 0.75)}
          fill={tile} stroke={edge} strokeWidth="1.5"
        />
      )}
      {/* pathLength=1 normalises the draw so the CSS dash constants hold if the
          arms ever move — the same trick .v-spark-line documents in global.css. */}
      <path
        d="M8 10 L16 23 L24 10"
        fill="none" stroke={ink} strokeWidth="3.1"
        strokeLinecap="round" strokeLinejoin="round"
        className={ignite ? "v-markdraw" : undefined} pathLength={ignite ? 1 : undefined}
      />
      <circle cx="24" cy="10" r="2.8" fill={dot} className={ignite ? "v-markdot" : undefined} />
      {/* The blip is drawn in ink, not lime — the dot stays the mark's only lime,
          and a ring of the glyph's own material reads as the glyph radiating. */}
      {ignite && (
        <circle cx="24" cy="10" r="2.8" fill="none" stroke={ink} strokeWidth="1.2" className="v-markblip" />
      )}
    </svg>
  );
}
