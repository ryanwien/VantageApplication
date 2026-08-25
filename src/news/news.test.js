import { describe, it, expect } from "vitest";
import {
  toneOf, toneLabel, wireTone, categoryOf, sourceColor, hostOf, sourceOf,
  newestFirst, ageOf, spanLabel,
} from "./news.js";
import { epochMs, shortAge, relAge, clock } from "../lib/time.js";

// A fixed "now" so nothing here depends on when the suite runs.
const NOW = Date.parse("2026-08-25T12:00:00Z");
const agoMin = (m) => Math.floor((NOW - m * 60_000) / 1000);   // unix SECONDS, as Finnhub sends

describe("epochMs", () => {
  it("reads Finnhub's unix seconds", () => {
    expect(epochMs(1_756_123_200)).toBe(1_756_123_200_000);
  });
  it("leaves milliseconds alone", () => {
    expect(epochMs(1_756_123_200_000)).toBe(1_756_123_200_000);
  });
  it("parses an ISO string", () => {
    expect(epochMs("2026-08-25T12:00:00Z")).toBe(NOW);
  });
  it("refuses nothing, empty and nonsense", () => {
    for (const bad of [null, undefined, "", 0, -5, "not a date", NaN]) expect(epochMs(bad)).toBe(null);
  });
});

describe("shortAge", () => {
  it("counts minutes in words and everything else in letters", () => {
    expect(shortAge(agoMin(14), NOW)).toBe("14 min ago");
    expect(shortAge(agoMin(38), NOW)).toBe("38 min ago");
    expect(shortAge(agoMin(60), NOW)).toBe("1h ago");
    expect(shortAge(agoMin(60 * 26), NOW)).toBe("1d ago");
    expect(shortAge(agoMin(60 * 24 * 9), NOW)).toBe("1w ago");
  });
  it("says just now under a minute, and nothing at all with no timestamp", () => {
    expect(shortAge(Math.floor(NOW / 1000), NOW)).toBe("just now");
    expect(shortAge(null, NOW)).toBe("");
  });
});

describe("clock and relAge still come out of the shared module", () => {
  it("formats seconds and ages", () => {
    expect(clock(242)).toBe("4:02");
    expect(relAge(agoMin(60 * 24 * 2), NOW)).toBe("2 days ago");
  });
});

describe("toneOf", () => {
  it("tags an unambiguous direction", () => {
    expect(toneOf("AMD surges on record data centre demand")).toBe("bull");
    expect(toneOf("Memory stocks slump after the tariff threat")).toBe("bear");
  });
  it("stays silent on a mixed headline", () => {
    expect(toneOf("Shares jump after the analyst downgrade")).toBe(null);
  });
  it("catches the forms the original word list missed", () => {
    // `slid(?:es)?` matched "slid" and "slides" but never "slide" or "sliding".
    expect(toneOf("Memory Stocks Slide as Trump Threatens 50% Tariffs")).toBe("bear");
    expect(toneOf("Chip names sliding into the close")).toBe("bear");
    // …and the two-word move forms were in neither list.
    expect(toneOf("Smartkem shares are trading lower after the announcement")).toBe("bear");
    expect(toneOf("AMD trades higher into the print")).toBe("bull");
  });
  it("will not read a bare lower/higher as a direction", () => {
    // "lower" is bullish in one of these and bearish in the other, which is
    // exactly why only the two-word forms are in the lists.
    expect(toneOf("AMD reports lower manufacturing costs")).toBe(null);
    expect(toneOf("A higher share count after the raise")).toBe(null);
  });
  it("stays silent on a headline with no direction at all", () => {
    expect(toneOf("AMD: the data center story is intact")).toBe(null);
    expect(toneOf("")).toBe(null);
  });
});

describe("toneLabel", () => {
  it("spells the tone out, because a bare arrow could not be read", () => {
    expect(toneLabel("bull")).toBe("▲ BULLISH");
    expect(toneLabel("bear")).toBe("▼ BEARISH");
    expect(toneLabel(null)).toBe("NEUTRAL");
  });
});

describe("wireTone", () => {
  it("counts the three buckets and always sums to the wire", () => {
    const items = [
      { title: "AMD surges on demand" },
      { title: "Memory stocks slump" },
      { title: "AMD names a new CFO" },
      { title: "Shares jump after the downgrade" },   // mixed → quiet
    ];
    const t = wireTone(items);
    expect(t).toEqual({ bull: 1, bear: 1, quiet: 2 });
    expect(t.bull + t.bear + t.quiet).toBe(items.length);
  });
  it("handles an empty wire", () => {
    expect(wireTone([])).toEqual({ bull: 0, bear: 0, quiet: 0 });
  });
});

describe("categoryOf", () => {
  it("finds the wire's usual shapes", () => {
    expect(categoryOf("Smartkem announced a non-binding letter of intent to acquire Carbonium Core")).toBe("M&A");
    expect(categoryOf("Memory stocks slide as Trump threatens 50% tariffs on Canadian autos")).toBe("MACRO");
    expect(categoryOf("AMD Q3 results beat on data centre revenue")).toBe("EARNINGS");
    expect(categoryOf("Morgan Stanley raises its AMD price target to $210")).toBe("ANALYSIS");
    expect(categoryOf("AMD unveils its next-gen accelerator")).toBe("PRODUCT");
    expect(categoryOf("Investors file a class action over the disclosure")).toBe("LEGAL");
  });
  it("prefers the narrower category when a headline hits two", () => {
    // Both M&A and LEGAL match; M&A is listed first because "blocks the merger"
    // is still a story about the merger.
    expect(categoryOf("Court blocks the merger after the antitrust lawsuit")).toBe("M&A");
  });
  it("reads the summary when the headline alone says nothing", () => {
    expect(categoryOf("Smartkem provides a corporate update", "The company will acquire Carbonium Core")).toBe("M&A");
  });
  it("stays silent rather than guessing", () => {
    expect(categoryOf("AMD names a new chief financial officer")).toBe(null);
    expect(categoryOf("")).toBe(null);
    expect(categoryOf(null, undefined)).toBe(null);
  });
});

describe("sourceColor", () => {
  it("pins the four the reference names", () => {
    expect(sourceColor("Benzinga")).toBe("#a78bfa");
    expect(sourceColor("SeekingAlpha")).toBe("#dd9a3c");
    expect(sourceColor("CNBC")).toBe("#4cc38a");
    expect(sourceColor("Yahoo")).toBe("#7aa2f7");
  });
  it("matches a pinned outlet however the wire spells it", () => {
    expect(sourceColor("Seeking Alpha")).toBe("#dd9a3c");
    expect(sourceColor("Yahoo Finance")).toBe("#7aa2f7");
    expect(sourceColor("finance.yahoo.com")).toBe("#7aa2f7");
  });
  it("gives an unpinned outlet the same hue every time", () => {
    expect(sourceColor("MarketWatch")).toBe(sourceColor("MarketWatch"));
  });
  it("only ever answers with a hue from the redesign palette", () => {
    const palette = new Set(["#a78bfa", "#dd9a3c", "#7aa2f7", "#4cc38a", "#e59bb6", "#7fd4c1"]);
    for (const s of ["MarketWatch", "Reuters", "Bloomberg", "", "Barron's", "The Fly", "PR Newswire"]) {
      expect(palette.has(sourceColor(s))).toBe(true);
    }
  });
});

describe("hostOf / sourceOf", () => {
  it("falls back through source, host, then a placeholder", () => {
    expect(sourceOf({ source: "CNBC", url: "https://x.com/a" })).toBe("CNBC");
    expect(sourceOf({ url: "https://www.reuters.com/a" })).toBe("reuters.com");
    expect(sourceOf({})).toBe("Source");
  });
  it("does not throw on a mangled url", () => {
    expect(hostOf("not a url")).toBe("");
  });
});

describe("newestFirst", () => {
  it("sorts dated stories newest first", () => {
    const out = newestFirst([
      { title: "older", datetime: agoMin(120) },
      { title: "newest", datetime: agoMin(5) },
      { title: "middle", datetime: agoMin(60) },
    ]);
    expect(out.map(n => n.title)).toEqual(["newest", "middle", "older"]);
  });
  it("keeps undated stories in the order they arrived, at the end", () => {
    const out = newestFirst([
      { title: "no date A" },
      { title: "dated", datetime: agoMin(60) },
      { title: "no date B" },
    ]);
    expect(out.map(n => n.title)).toEqual(["dated", "no date A", "no date B"]);
  });
  it("leaves a wholly undated wire exactly as it was", () => {
    const items = [{ title: "a" }, { title: "b" }, { title: "c" }];
    expect(newestFirst(items).map(n => n.title)).toEqual(["a", "b", "c"]);
  });
});

describe("ageOf", () => {
  it("reads either field name", () => {
    expect(ageOf({ datetime: agoMin(14) }, NOW)).toBe("14 min ago");
    expect(ageOf({ publishedAt: "2026-08-25T11:46:00Z" }, NOW)).toBe("14 min ago");
    expect(ageOf({ title: "no timestamp" }, NOW)).toBe("");
  });
});

describe("spanLabel", () => {
  it("measures the stories we hold, not the window we asked for", () => {
    // The server asks Finnhub for seven days. These are all from this morning.
    const items = [{ datetime: agoMin(14) }, { datetime: agoMin(38) }, { datetime: agoMin(200) }];
    expect(spanLabel(items, NOW)).toBe("last 24h");
  });
  it("widens as the oldest story does", () => {
    expect(spanLabel([{ datetime: agoMin(30) }], NOW)).toBe("last hour");
    expect(spanLabel([{ datetime: agoMin(60 * 40) }], NOW)).toBe("last 2 days");
    expect(spanLabel([{ datetime: agoMin(60 * 24 * 6.5) }], NOW)).toBe("last week");
  });
  it("claims no window when nothing is dated", () => {
    expect(spanLabel([{ title: "from a model" }], NOW)).toBe("");
    expect(spanLabel([], NOW)).toBe("");
  });
});
