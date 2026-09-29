import { describe, it, expect } from "vitest";
import { LIVE_CHANNELS, LIVE_CHANNEL_IDS, LIVE_WINDOW, inLiveWindow, pickLive } from "./live.js";

describe("live rail: the channel allowlist", () => {
  // A channel id is UC plus 22 of [A-Za-z0-9_-]. Three of the twelve contain a
  // hyphen, which is not legal in a bare JavaScript identifier — and writing
  // this list unquoted the first time is how one of them got mangled.
  //
  // BE CLEAR ABOUT WHAT THIS CATCHES, because it is less than it looks:
  //   · an unquoted hyphenated key is now a SyntaxError — the module will not
  //     load at all, which is the loudest possible failure and the real fix
  //   · TRUNCATION (a hyphen simply dropped) fails here, at 23 characters
  //   · SUBSTITUTION (a hyphen replaced by a letter) passes here, because the
  //     result is still 24 legal characters. Nothing offline can catch that.
  //
  // The check that catches substitution needs the network and the key, so it
  // is a script rather than a test: scripts/check-live-channels.mjs re-resolves
  // every id against the Data API and prints what each one really is.
  it("holds ids in the shape the Data API actually issues", () => {
    for (const [id, name] of Object.entries(LIVE_CHANNELS)) {
      expect(id, `${name} has a malformed channel id: ${id}`).toMatch(/^UC[A-Za-z0-9_-]{22}$/);
    }
  });

  it("names every id, and names each one once", () => {
    const names = Object.values(LIVE_CHANNELS);
    expect(names.every(n => typeof n === "string" && n.trim())).toBe(true);
    // A duplicate name is how the same broadcaster ends up listed under two ids
    // — usually because one of them was guessed.
    expect(new Set(names).size, `duplicate names: ${names.join(", ")}`).toBe(names.length);
  });

  it("exports its ids as a list, in step with the map", () => {
    expect(LIVE_CHANNEL_IDS).toEqual(Object.keys(LIVE_CHANNELS));
    expect(new Set(LIVE_CHANNEL_IDS).size).toBe(LIVE_CHANNEL_IDS.length);
  });
});

describe("live rail: when it is worth spending a search", () => {
  const at = (day, hhmm) => ({ day, mins: Math.floor(hhmm / 100) * 60 + (hhmm % 100) });

  it("opens and closes on the minute it says it does", () => {
    // Boundaries rather than midpoints: an off-by-one here is worth either an
    // hour of dead rail or 400 units of quota, and neither announces itself.
    expect(inLiveWindow({ day: 2, mins: LIVE_WINDOW.openMin - 1 })).toBe(false);
    expect(inLiveWindow({ day: 2, mins: LIVE_WINDOW.openMin })).toBe(true);
    expect(inLiveWindow({ day: 2, mins: LIVE_WINDOW.closeMin - 1 })).toBe(true);
    expect(inLiveWindow({ day: 2, mins: LIVE_WINDOW.closeMin })).toBe(false);
  });

  it("is open across the weekdays and shut at the weekend", () => {
    for (const day of [1, 2, 3, 4, 5]) expect(inLiveWindow(at(day, 1000))).toBe(true);
    for (const day of [0, 6]) expect(inLiveWindow(at(day, 1000))).toBe(false);
  });

  it("is shut overnight", () => {
    expect(inLiveWindow(at(3, 300))).toBe(false);   // 03:00
    expect(inLiveWindow(at(3, 2200))).toBe(false);  // 22:00
  });

  it("refuses a clock it cannot read rather than guessing", () => {
    // The failure mode this prevents: a clock helper that throws returns
    // undefined, and `undefined >= 480` is false — but a truthy-ish partial
    // object would sail through. Closed is the safe answer; it costs a rail,
    // not a quota.
    for (const bad of [undefined, {}, { day: 2 }, { mins: 600 }, { day: NaN, mins: 600 }]) {
      expect(inLiveWindow(bad)).toBe(false);
    }
  });
});

describe("live rail: what survives to the screen", () => {
  const vid = (o) => ({ id: "x", channelId: "UCEAZeUIeJs0IjQiqTCdVSIg", live: true, viewers: 1, ...o });

  it("keeps only allowlisted publishers", () => {
    // The scam row is the reason this module exists, so it is in the fixture
    // rather than described in a comment.
    const out = pickLive([
      vid({ id: "yahoo" }),
      vid({ id: "scam", channelId: "UCzzzzzzzzzzzzzzzzzzzzzz", viewers: 99999 }),
    ]);
    expect(out.map(v => v.id)).toEqual(["yahoo"]);
  });

  it("drops a broadcast that has already ended", () => {
    // search.list keeps listing a stream after it stops; videos.list is what
    // knows. Anything not explicitly live goes.
    const out = pickLive([
      vid({ id: "on", live: true }),
      vid({ id: "ended", live: false }),
      vid({ id: "unknown", live: undefined }),
    ]);
    expect(out.map(v => v.id)).toEqual(["on"]);
  });

  it("ranks by concurrent viewers, not by what search thought", () => {
    const out = pickLive([
      vid({ id: "small", viewers: 12 }),
      vid({ id: "big", viewers: 6000 }),
      vid({ id: "mid", viewers: 300 }),
    ]);
    expect(out.map(v => v.id)).toEqual(["big", "mid", "small"]);
  });

  it("keeps a broadcast that hides its viewer count, and sorts it last", () => {
    // Hiding the number is a publisher setting, not a disqualification — and
    // dropping them would quietly remove whole channels from the rail.
    const out = pickLive([vid({ id: "hidden", viewers: null }), vid({ id: "shown", viewers: 5 })]);
    expect(out.map(v => v.id)).toEqual(["shown", "hidden"]);
  });

  it("survives junk without throwing", () => {
    expect(pickLive(null)).toEqual([]);
    expect(pickLive(undefined)).toEqual([]);
    expect(pickLive([null, undefined, {}, { channelId: null }])).toEqual([]);
  });

  it("honours a caller-supplied allowlist, for the env override", () => {
    const only = ["UCqoSrYgusd8ZddtMoWhjHYA"];
    const out = pickLive([vid({ id: "yahoo" }), vid({ id: "schwab", channelId: only[0] })], only);
    expect(out.map(v => v.id)).toEqual(["schwab"]);
  });
});
