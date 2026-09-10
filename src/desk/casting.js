// ============================================================
//  casting.js — which room a character belongs in.
//
//  WHY THIS EXISTS
//  The anchor and the set were two independent settings, so they routinely
//  contradicted each other: Sterling — a suited news anchor in a headset —
//  would be presenting the market from a cyberpunk neon grid, and stepping
//  through the roster changed the person while leaving the room exactly where
//  it was. Twenty-two anchors and eighteen sets is not thirty-nine choices; it
//  is one choice about who is presenting, and the room is part of who they are.
//
//  DERIVED FROM THE COSTUME, NOT LISTED
//  The wardrobe already answers the question. A character wearing a wizard's
//  hat is standing in the wizard tower; a character in a spacesuit is on the
//  space station. Deriving the set from the costume rather than hand-listing
//  twenty-two pairs means the mapping cannot drift out of sync with the
//  roster, and a character added later arrives with a room already.
// ============================================================

// The costumed anchors. Every `hat` in CHARACTERS appears here exactly once —
// two anchors share each genre hat (the roster is gender-balanced), and they
// share the room, which is the point: the set belongs to the genre, not the
// person.
const BY_HAT = {
  podcast: "podcast",
  knight: "castle",
  wizard: "tower",
  astronaut: "space",
  mermaid: "reef",
  crown: "palace",
  amazon: "jungle",
  action: "action",
  explorer: "temple",
  horror: "horror",
  cowboy: "western",
  noir: "noir",
};

// The desk crew wear no costume, so their rooms are named rather than derived.
// These are the five who actually present the market, and they get the rooms
// that are about markets. Vega is on the trading floor and TICK-3R is in the
// server room because that is where the demo already puts them, and a
// character who moves house between the demo and the picker is a bug.
const BY_ID = {
  sterling: "newsroom",
  vega: "floor",
  kwan: "newsroom",
  moss: "skyline",
  tick3r: "server",
};

// The room this character presents from, or null if nothing claims them.
//
// NULL RATHER THAN A DEFAULT, deliberately: the caller leaves the set alone
// when this returns null. A character with no room should not drag the viewer
// back to the newsroom — it should cost nothing, which is what makes it safe
// to add a character before deciding where they live.
export function characterHome(character) {
  if (!character || typeof character !== "object") return null;
  return BY_ID[character.id] || BY_HAT[character.hat] || null;
}
