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
//  WHY THE TILE IS DARK
//  The app's canvas is near-black. The mark it replaced was a white tile, and
//  a white rectangle in this UI is a bright block competing with the one lime
//  call to action. A #161718 tile with a hairline sits in the surface ladder
//  like every other panel, and lets the white V be the bright thing instead.
//
//  THE LIME DOT IS A DELIBERATE EXCEPTION
//  theme.js reserves acid lime for actions and active indicators, precisely so
//  it never becomes decoration. The dot is an on-air light — a live indicator —
//  which is inside that rule rather than an exemption from it. It is also the
//  only lime on screen that never moves, so it reads as identity, not as a
//  thing to click. If a surface ever puts this mark next to a lime button,
//  pass ink for `dot` there rather than letting two limes argue.
//
//  WHY A COMPONENT
//  The mark appeared in five places as five hand-rolled spans, which is how a
//  logo quietly drifts into five slightly different logos. One source now.
//  The canvas twin lives in React.jsx (drawVantageMark) for the exporters and
//  the broadcast scenes, which cannot render React — if the geometry below
//  changes, change that too.
// ============================================================

import React from "react";

// Geometry is authored in a 32-unit box and scaled; every consumer picks a size.
const TILE = "#161718";   // ink[2] — one step up from the panel it sits on
const EDGE = "#383b3f";   // ink[4] — the same hairline every panel gets
const INK = "#ffffff";
const DOT = "#e4f222";    // acid lime, as the on-air light

export default function VantageMark({
  size = 26, tile = TILE, edge = EDGE, ink = INK, dot = DOT, radius = 8, title,
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
      <path
        d="M8 10 L16 23 L24 10"
        fill="none" stroke={ink} strokeWidth="3.1"
        strokeLinecap="round" strokeLinejoin="round"
      />
      <circle cx="24" cy="10" r="2.8" fill={dot} />
    </svg>
  );
}
