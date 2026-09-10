import { describe, it, expect } from "vitest";
import { characterHome } from "./casting.js";

// The eighteen sets, mirrored from ENVIRONMENTS in React.jsx. Duplicated on
// purpose: a home that names a set which does not exist renders as no set at
// all, silently, and this is the only place that catches the typo.
const ENV_IDS = [
  "studio", "newsroom", "floor", "skyline", "server", "space", "castle", "tower",
  "podcast", "reef", "palace", "jungle", "action", "temple", "horror", "western",
  "noir", "cyber",
];

// The roster, mirrored from CHARACTERS. Only the two fields casting reads.
const ROSTER = [
  { id: "sterling", accessory: "headset" },
  { id: "vega", accessory: "earpiece" },
  { id: "kwan", accessory: "headset" },
  { id: "moss", accessory: "earpiece" },
  { id: "tick3r", robot: true },
  { id: "pax", hat: "podcast" },
  { id: "sir-gaine", hat: "knight" },
  { id: "mordo", hat: "wizard" },
  { id: "nova", hat: "astronaut" },
  { id: "marina", hat: "mermaid" },
  { id: "aurora", hat: "crown" },
  { id: "diana", hat: "amazon" },
  { id: "blaze", hat: "action" },
  { id: "zara", hat: "action" },
  { id: "kit", hat: "explorer" },
  { id: "sienna", hat: "explorer" },
  { id: "vesper", hat: "horror" },
  { id: "lilith", hat: "horror" },
  { id: "colt", hat: "cowboy" },
  { id: "dakota", hat: "cowboy" },
  { id: "marlowe", hat: "noir" },
  { id: "vivienne", hat: "noir" },
];

describe("characterHome", () => {
  it("gives every anchor on the roster a room", () => {
    const homeless = ROSTER.filter(c => !characterHome(c)).map(c => c.id);
    expect(homeless).toEqual([]);
  });

  it("only ever names a set that exists", () => {
    for (const c of ROSTER) expect(ENV_IDS).toContain(characterHome(c));
  });

  it("puts the costume in its own room", () => {
    expect(characterHome({ id: "mordo", hat: "wizard" })).toBe("tower");
    expect(characterHome({ id: "nova", hat: "astronaut" })).toBe("space");
    expect(characterHome({ id: "marina", hat: "mermaid" })).toBe("reef");
    expect(characterHome({ id: "colt", hat: "cowboy" })).toBe("western");
  });

  it("seats the desk crew in the rooms that are about markets", () => {
    expect(characterHome({ id: "sterling" })).toBe("newsroom");
    expect(characterHome({ id: "vega" })).toBe("floor");
    expect(characterHome({ id: "kwan" })).toBe("newsroom");
    expect(characterHome({ id: "moss" })).toBe("skyline");
    expect(characterHome({ id: "tick3r", robot: true })).toBe("server");
  });

  it("agrees with the pairs the guided demo already shows", () => {
    // The demo walks vega/floor, tick3r/server, nova/space. A character who
    // moves house between the demo and the picker is a bug in one of them.
    expect(characterHome({ id: "vega" })).toBe("floor");
    expect(characterHome({ id: "tick3r", robot: true })).toBe("server");
    expect(characterHome({ id: "nova", hat: "astronaut" })).toBe("space");
  });

  it("shares one room between the two anchors of a genre", () => {
    expect(characterHome({ id: "blaze", hat: "action" }))
      .toBe(characterHome({ id: "zara", hat: "action" }));
    expect(characterHome({ id: "marlowe", hat: "noir" }))
      .toBe(characterHome({ id: "vivienne", hat: "noir" }));
    expect(characterHome({ id: "vesper", hat: "horror" }))
      .toBe(characterHome({ id: "lilith", hat: "horror" }));
  });

  it("prefers the named room over the hat when a character has both", () => {
    // sterling is named to the newsroom; a hat must not move him out of it.
    expect(characterHome({ id: "sterling", hat: "wizard" })).toBe("newsroom");
  });

  it("returns null for a character nobody has housed, rather than a default", () => {
    // Null means "leave the set alone". Defaulting to the newsroom would drag
    // the viewer out of the room they are in every time an unhoused character
    // is picked, which is worse than doing nothing.
    expect(characterHome({ id: "nobody" })).toBeNull();
    expect(characterHome({ id: "nobody", hat: "sombrero" })).toBeNull();
  });

  it("survives being handed nothing", () => {
    expect(characterHome(null)).toBeNull();
    expect(characterHome(undefined)).toBeNull();
    expect(characterHome("sterling")).toBeNull();
    expect(characterHome({})).toBeNull();
  });
});
