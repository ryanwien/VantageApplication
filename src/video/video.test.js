import { describe, it, expect } from "vitest";
import {
  ytDurationSec, clock, tsToSec, parseChapters, chapterSpans, chapterAt,
  tickersIn, chapterMentions, relAge, compactCount, monogram,
} from "./video.js";

describe("duration", () => {
  it("reads the ISO durations YouTube actually returns", () => {
    expect(ytDurationSec("PT18M24S")).toBe(1104);
    expect(ytDurationSec("PT1H2M3S")).toBe(3723);
    expect(ytDurationSec("PT45S")).toBe(45);
    expect(ytDurationSec("PT2H")).toBe(7200);
    expect(ytDurationSec("P1DT2H")).toBe(93600);
  });

  it("returns 0 rather than NaN for anything it cannot read", () => {
    // A duration of 0 hides the chip. A NaN prints "NaN:NaN" on the player.
    for (const bad of ["", null, undefined, "18:24", "P", "banana"]) expect(ytDurationSec(bad)).toBe(0);
  });

  it("prints mm:ss under an hour and h:mm:ss over it, like YouTube does", () => {
    expect(clock(1104)).toBe("18:24");
    expect(clock(45)).toBe("0:45");
    expect(clock(3723)).toBe("1:02:03");
    expect(clock(0)).toBe("0:00");
    expect(clock(-5)).toBe("0:00");
  });
});

describe("chapters", () => {
  const desc = [
    "My picks for the year.",
    "0:00 Setup",
    "2:14 The core position",
    "9:38 Software layer",
    "15:02 What he trimmed",
    "",
    "Not financial advice.",
  ].join("\n");

  it("reads a chapter list out of a description", () => {
    expect(parseChapters(desc, 1104)).toEqual([
      { start: 0, label: "Setup" },
      { start: 134, label: "The core position" },
      { start: 578, label: "Software layer" },
      { start: 902, label: "What he trimmed" },
    ]);
  });

  it("accepts the punctuation people actually write", () => {
    const d = "0:00 - Intro\n(1:30) — The trade\n[4:00]: The exit";
    expect(parseChapters(d).map(c => c.label)).toEqual(["Intro", "The trade", "The exit"]);
  });

  it("reads hour-long timestamps", () => {
    const d = "0:00 Start\n45:00 Middle\n1:05:30 End";
    expect(parseChapters(d).map(c => c.start)).toEqual([0, 2700, 3930]);
  });

  // The four rules below are YouTube's own conditions for turning a description
  // into chapters. Loosening any of them turns an ordinary description into a
  // chapter strip that is simply wrong.
  it("refuses a list that does not start at 0:00", () => {
    expect(parseChapters("1:00 A\n2:00 B\n3:00 C")).toEqual([]);
  });

  it("refuses fewer than three", () => {
    expect(parseChapters("0:00 A\n2:00 B")).toEqual([]);
  });

  it("refuses timestamps that do not ascend", () => {
    expect(parseChapters("0:00 A\n5:00 B\n2:00 C")).toEqual([]);
  });

  it("refuses a chapter starting past the end of the video", () => {
    expect(parseChapters("0:00 A\n2:00 B\n99:00 C", 1104)).toEqual([]);
  });

  it("ignores a bare timestamp with nothing after it", () => {
    // "Recorded 0:00 Sunday" is prose, not a chapter heading.
    expect(parseChapters("0:00\n2:00\n3:00")).toEqual([]);
  });

  it("weights each segment by how long the chapter runs", () => {
    const spans = chapterSpans(parseChapters(desc, 1104), 1104);
    expect(spans.map(s => s.weight)).toEqual([134, 444, 324, 202]);
    expect(spans[3].end).toBe(1104);
  });

  it("finds the chapter a moment belongs to", () => {
    const ch = parseChapters(desc, 1104);
    expect(chapterAt(ch, 0)).toBe(0);
    expect(chapterAt(ch, 133)).toBe(0);
    expect(chapterAt(ch, 134)).toBe(1);
    expect(chapterAt(ch, 1100)).toBe(3);
  });
});

describe("tickers", () => {
  it("always takes a cashtag", () => {
    expect(tickersIn("Long $PLTR and $TSM here", [])).toEqual(["PLTR", "TSM"]);
  });

  it("takes a bare symbol only when the desk already knows it", () => {
    // The alternative is a rail that lists CEO, ETF and AI as tickers.
    expect(tickersIn("The CEO of NVDA on AI and ETF flows", ["NVDA"])).toEqual(["NVDA"]);
  });

  it("does not repeat a symbol written both ways", () => {
    expect(tickersIn("$NVDA — why NVDA still leads", ["NVDA"])).toEqual(["NVDA"]);
  });

  it("pins each ticker to the first moment the description names it", () => {
    const chapters = [
      { start: 0, label: "Setup" },
      { start: 134, label: "NVDA, the core position" },
      { start: 578, label: "AMD and the software layer" },
      { start: 902, label: "Trimming NVDA" },
    ];
    expect(chapterMentions(chapters, ["NVDA", "AMD"])).toEqual([
      { ticker: "NVDA", start: 134, label: "NVDA, the core position" },
      { ticker: "AMD", start: 578, label: "AMD and the software layer" },
    ]);
  });

  it("returns nothing for a video that names nothing", () => {
    expect(chapterMentions([{ start: 0, label: "Setup" }], ["NVDA"])).toEqual([]);
  });
});

describe("small readouts", () => {
  const now = Date.parse("2026-08-25T12:00:00Z");
  it("says how old a video is", () => {
    expect(relAge("2026-08-23T12:00:00Z", now)).toBe("2 days ago");
    expect(relAge("2026-08-25T11:00:00Z", now)).toBe("1 hour ago");
    expect(relAge("2026-08-25T11:59:30Z", now)).toBe("just now");
    expect(relAge("2025-08-25T12:00:00Z", now)).toBe("1 year ago");
    expect(relAge("not a date", now)).toBe("");
  });

  it("rounds view counts the way YouTube prints them", () => {
    expect(compactCount(41234)).toBe("41K");
    expect(compactCount(1234)).toBe("1.2K");
    expect(compactCount(999)).toBe("999");
    expect(compactCount(1_500_000)).toBe("1.5M");
    // Never "1000K": the thresholds sit where the rounded value tips over.
    expect(compactCount(999_499)).toBe("999K");
    expect(compactCount(999_500)).toBe("1M");
    expect(compactCount(-1)).toBe("");
  });

  it("takes two initials, and skips the credential", () => {
    expect(monogram("Mark Roussin, CPA")).toBe("MR");
    expect(monogram("Sterling")).toBe("S");
    expect(monogram("")).toBe("?");
  });
});
