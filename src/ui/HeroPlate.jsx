// ============================================================
//  HeroPlate.jsx — depth behind the landing hero, drawn rather than photographed.
//
//  WHAT THIS IS
//  Four layers behind the top of the marketing page, back to front:
//
//    1. A dot grid. Gives the black a grain.
//    2. A glow. One warm source in the upper right.
//    3. A ring field, breathing. Concentric circles struck from that source.
//    4. A ping. One ring that leaves the source and travels out, every 9s.
//
//  All of it is CSS. Nothing here is an image request.
//
//  WHY THERE IS NO PHOTOGRAPH ANY MORE
//  There was: 17.6 kB of WebP, an out-of-focus broadcast studio generated in
//  Recraft, masked into the upper right. It was cut because it read as a
//  smudge on the glass rather than as design — the same reason the same plate
//  came out of both video compositions. A blurred photograph behind a product
//  page is atmosphere borrowed from somewhere else; it says "a studio exists"
//  and nothing about this one.
//
//  What replaced it says something. The rings are struck from a single point
//  and travel outward, which is what a transmission looks like drawn, and
//  "on air" is the product's whole claim. The aurora blooms from roughly the
//  same corner, so the two now read as one light source rather than as a
//  photograph with a wash over it.
//
//  WHY IT MOVES NOW, HAVING PREVIOUSLY NOT
//  The old note here argued the plate should hold still because .v-aurora and
//  .v-heroparallax already move, and a third moving layer would read as busy.
//  That was right about the photograph and wrong about this. Busy is what you
//  get from motions that are about different things; the drift, the bloom and
//  these rings are all the same light doing the same thing, so they compose
//  into one idea instead of competing. The amplitudes are deliberately tiny —
//  a 4% breath over 20s and one ping every 9s — because the layer's job is to
//  make the corner feel live, not to be looked at.
//
//  Both animations are decoration in the strict sense: they start from and
//  return to a state that is complete on its own, so the blanket
//  prefers-reduced-motion rule in global.css switching them off costs nothing
//  but the movement.
//
//  WHY THE GEOGRAPHY IS STILL LOAD-BEARING
//  This part carries over from the photograph unchanged, and it is the reason
//  any of this is allowed to exist.
//
//  The hero puts every word in the left column and the BroadcastCard on the
//  right. A decorative layer spread evenly over that costs contrast where the
//  prose is: the photograph, full-bleed, lifted the area under the body copy
//  to rgb(57,62,64), where #9aa3ae measures 4.25:1 — under the 4.5:1 AA floor,
//  against 7.60:1 on the bare page. Lowering opacity did not fix it; the layer
//  went invisible before it went safe. Geography fixed it.
//
//  So every mask below is centred at 82%/18% and every layer has fallen away
//  by the time it reaches the left column. Measured at 1440, worst case — the
//  brightest point any letterform in the box can land on, with the ping at
//  peak and crossing a ring band at the same time: body copy 5.79:1, headline
//  8.31:1, against 6.36:1 and 13.22:1 for the bare page with its grid. The
//  floor is 4.5:1. So the light spends 0.57 of the paragraph's contrast and
//  keeps 1.29 in hand.
//
//  That only holds while there IS a left column. Below 1000px the hero
//  collapses to one and the prose runs straight through the field — 2.36:1,
//  a hard failure. See .v-plate-* in global.css, which is what stops it.
//
//  Move a mask centre or raise an alpha and both widths have to be measured
//  again before it ships.
//
//  WHY z-index: -1
//  `.v-aurora` already sets `isolation: isolate` on the hero's ancestor, so a
//  negative layer paints above the page background and below every child —
//  including the two aurora pseudo-elements, which is the intended order:
//  rings at the back, coloured wash over them, content on top.
// ============================================================
import React from "react";

// Tall enough to cover nav, tape and hero at desktop heights. Every layer
// fades out well before this line, so none of them ends on a visible edge.
const HEIGHT = 1000;

// The source. Every layer below is struck from this one point — that is what
// makes them read as one light rather than four effects.
const SRC = "82% 18%";

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

// ---------- where the top of this box is allowed to start ----------
// The nav is 66px tall and has no background of its own, so anything lit
// underneath it shows straight through and the top bar stops being black.
// The tape sits directly below at 66-102px and IS opaque, which is the piece
// that makes this cheap: the mask can ramp from nothing to everything across
// exactly that band, so the light is fully off under the transparent nav and
// fully on the moment it clears the tape, and the ramp itself happens where
// nobody can see it. A ramp anywhere lower would draw a horizontal seam across
// the hero, because the radial masks below are already at strength by then.
//
// Both numbers come from the layout and not from taste: .v-homenav is
// padding 20px + a 26px mark + 20px, and its vertical padding is the one thing
// the narrow rules do not touch, so 66 holds at every width.
const TOP = "transparent 0, transparent 66px, #000 100px";

// The grid stops before the showcase does. Fading on the vertical only, so it
// still runs the full width — a texture that stopped short of the left and
// right edges would draw the exact boundary the aurora fix removed. It takes
// the same top cutoff as the light: "black" means black, and the dots were
// the other thing visible up there.
const GRID_MASK = `linear-gradient(to bottom, ${TOP}, #000 52%, transparent 88%)`;

// Everything lit hangs inside one of these. Nested masks multiply, so each
// layer keeps its own radial boundary and inherits this cutoff without
// mask-composite, which is the part with the patchy support.
const TOP_MASK = `linear-gradient(to bottom, ${TOP})`;

// ---------- the light, as functions of where it comes from ----------
// Two screens use this now and they have completely different geographies, so
// the source is a parameter rather than a constant. Everything else — the
// ratios between the glow, the field and the ping, and the shape of the
// falloff — is shared, because that is what makes the two screens look like
// the same product rather than two takes on a similar idea.

// The source itself. Wide and weak: this is the thing that makes the area
// look lit, and the rings are what make it look like a transmission.
const glow = (src, a = 0.17) =>
  `radial-gradient(58% 56% at ${src}, rgba(70,167,88,${a}), rgba(70,167,88,${a * 0.3}) 46%, transparent 74%)`;

// The ring field. The visible band is 2px of the period — the rings should be
// a structure you notice on the second look, not a target.
const rings = (src, period) => `repeating-radial-gradient(circle at ${src},
  transparent 0 ${period - 2}px,
  rgba(76,195,138,0.15) ${period - 2}px ${period}px,
  transparent ${period}px ${period * 2 - 2}px)`;

// Rings run forever in every direction, so the mask is the only thing deciding
// where the field exists at all.
const ringMask = (src, w, h) => `radial-gradient(${w}% ${h}% at ${src},
  #000 0%, #000 24%, rgba(0,0,0,0.55) 52%, rgba(0,0,0,0.18) 70%, transparent 84%)`;

// The ping: one ring, brighter than the field, drawn at a rest radius and then
// scaled outward by the animation. Its alpha is the highest number in this
// file, which is affordable only because it is never still.
const ping = (src, r) => `radial-gradient(circle at ${src},
  transparent 0 ${r}px,
  rgba(76,195,138,0.34) ${r + 2}px ${r + 5}px,
  transparent ${r + 7}px)`;

const GLOW = glow(SRC);
const RINGS = rings(SRC, 150);
const RING_MASK = ringMask(SRC, 62, 58);
const PING = ping(SRC, 116);

const LAYER = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: HEIGHT,
  zIndex: -1,
  pointerEvents: "none",
};

// The two moving layers are wrapped rather than animated directly, and that is
// structural, not stylistic: a transform on the element carrying the mask
// scales the mask with it, so the field would grow past the boundary that is
// keeping it off the text. Masking the parent and transforming the child means
// the rings travel and the boundary does not.
const LIT = { ...LAYER, WebkitMaskImage: TOP_MASK, maskImage: TOP_MASK };
// overflow: hidden is load-bearing, not tidiness. The child these wrap is
// inset: 0 — viewport-wide — and the ping scales it to 2.1×, which is ~4150px
// on a 2000px screen. A mask hides the paint out there but not the GEOMETRY:
// a transformed child still extends its ancestors' scrollable overflow, so
// without the clip the whole page grows a horizontal scrollbar that scrolls
// 400px of nothing. Everything visible lives well inside the mask, so the
// clip costs no pixels.
const MASKED = { position: "absolute", inset: 0, overflow: "hidden", WebkitMaskImage: RING_MASK, maskImage: RING_MASK };
const INNER = { position: "absolute", inset: 0, transformOrigin: SRC };

export default function HeroPlate() {
  return (
    <>
      {/* Grid first, so everything else passes in front of it. The other order
          puts a perfectly regular lattice on top of the light, which reads as a
          screen door hung over the room rather than as markings on the surface
          behind it. */}
      <div
        aria-hidden="true"
        style={{ ...LAYER, backgroundImage: DOT, backgroundSize: CELL, WebkitMaskImage: GRID_MASK, maskImage: GRID_MASK }}
      />
      {/* Everything lit, under one cutoff so the top bar stays black. The
          three inside carry classes so global.css can turn them down where
          the geography stops being true — below the hero's two-column
          breakpoint the prose runs the full width and the whole argument for
          this layer collapses. See .v-plate-* there. */}
      <div aria-hidden="true" style={LIT}>
        <div className="v-plate-glow" style={{ position: "absolute", inset: 0, backgroundImage: GLOW }} />
        <div className="v-plate-rings" style={MASKED}>
          <div className="v-ringfield" style={{ ...INNER, backgroundImage: RINGS }} />
        </div>
        <div className="v-plate-ping" style={MASKED}>
          <div className="v-ringping" style={{ ...INNER, backgroundImage: PING }} />
        </div>
      </div>
    </>
  );
}

// ============================================================
//  AuthPlate — the same light behind the front door.
//
//  WHY THE GEOGRAPHY IS FREE HERE AND NOT ON THE LANDING PAGE
//  Everything HeroPlate does is shaped by one constraint: the hero's prose
//  sits directly on the page background, so a lit layer is competing with body
//  copy for contrast and has to be kept in the empty column. On this screen
//  there is no prose on the background at all. Every word lives inside an
//  opaque card, which stops the light before it reaches any of them.
//
//  So the source goes straight behind the card and the rings travel out from
//  under it. The card is not lit FROM somewhere — it is the thing doing the
//  transmitting, which is the one claim this screen has to make before
//  anybody has typed anything into it. The landing page cannot do this; it has
//  the wrong shape for it.
//
//  The parent needs `position: relative` and `isolation: isolate`, the same
//  pair the landing page gives HeroPlate, and for the same reason: z-index -1
//  has to land above the page background and below the card.
// ============================================================
const A_SRC = "50% 46%";
const A_LAYER = { position: "absolute", inset: 0, zIndex: -1, pointerEvents: "none" };
const A_RING_MASK = ringMask(A_SRC, 74, 72);
// Same clip as MASKED above, same reason: the auth ping scales past the
// viewport too, and geometry does not care which page it is on.
const A_MASKED = { position: "absolute", inset: 0, overflow: "hidden", WebkitMaskImage: A_RING_MASK, maskImage: A_RING_MASK };
const A_INNER = { position: "absolute", inset: 0, transformOrigin: A_SRC };

// The landing grid fades on the vertical only, because that page continues
// past the bottom of the plate and a horizontal edge would be a visible seam.
// This screen ends in both directions, so its grid fades radially instead.
const A_GRID_MASK = `radial-gradient(76% 74% at ${A_SRC}, #000 0%, #000 42%, transparent 88%)`;

// 132 rather than the landing's 150, because the first two rings of any period
// are hidden behind the card and a wider one would put the first VISIBLE ring
// most of the way to the viewport edge. The ping rests at 190 for the same
// reason — the keyframe takes it from 0.62 to 2.1, so it travels 118px to
// 399px and spends that whole run emerging from behind a card whose half-width
// is 214. Rest it where HeroPlate does and it would finish before it cleared
// the card.
export function AuthPlate() {
  return (
    <>
      <div aria-hidden="true" style={{
        ...A_LAYER, backgroundImage: DOT, backgroundSize: CELL,
        WebkitMaskImage: A_GRID_MASK, maskImage: A_GRID_MASK,
      }} />
      {/* Weaker than the landing's 0.17. There it is competing with a
          full-bleed aurora and a headline; here it is the only thing on the
          screen besides one card, and at 0.17 it read as a spotlight. */}
      <div aria-hidden="true" style={{ ...A_LAYER, backgroundImage: glow(A_SRC, 0.13) }} />
      <div aria-hidden="true" style={A_LAYER}>
        <div style={A_MASKED}>
          <div className="v-ringfield" style={{ ...A_INNER, backgroundImage: rings(A_SRC, 132) }} />
        </div>
        <div style={A_MASKED}>
          <div className="v-ringping" style={{ ...A_INNER, backgroundImage: ping(A_SRC, 190) }} />
        </div>
      </div>
    </>
  );
}
