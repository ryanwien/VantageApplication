import { describe, it, expect } from "vitest";
import { DEFAULT_PREFS, loadPrefs, coerceRefreshMs, directionColor, directionGlyph, notifyEnabled } from "./preferences.js";

describe("coerceRefreshMs", () => {
  it("accepts the four allowed values", () => {
    for (const v of [0, 5000, 15000, 30000]) expect(coerceRefreshMs(v)).toBe(v);
  });
  it("coerces anything else to the 15s default", () => {
    expect(coerceRefreshMs(1234)).toBe(15000);
    expect(coerceRefreshMs("fast")).toBe(15000);
    expect(coerceRefreshMs(undefined)).toBe(15000);
  });
});

describe("loadPrefs", () => {
  it("returns defaults for empty/corrupt input, never throws", () => {
    expect(loadPrefs(null)).toEqual(DEFAULT_PREFS);
    expect(loadPrefs("{not json")).toEqual(DEFAULT_PREFS);
  });
  it("merges stored values over defaults", () => {
    const p = loadPrefs(JSON.stringify({ colorBlind: true, refreshMs: 5000 }));
    expect(p.colorBlind).toBe(true);
    expect(p.refreshMs).toBe(5000);
    expect(p.notify).toEqual(DEFAULT_PREFS.notify);
  });
  it("coerces a bad stored refreshMs", () => {
    expect(loadPrefs(JSON.stringify({ refreshMs: 999 })).refreshMs).toBe(15000);
  });
  it("migrates legacy tape-breaking='off' into notify.breakingNews=false when prefs absent", () => {
    expect(loadPrefs(null, "off").notify.breakingNews).toBe(false);
    expect(loadPrefs(null, "on").notify.breakingNews).toBe(true);
  });
  it("does not let the legacy flag override an explicit stored pref", () => {
    const p = loadPrefs(JSON.stringify({ notify: { priceTriggers: true, breakingNews: true } }), "off");
    expect(p.notify.breakingNews).toBe(true);
  });
  it("never throws when stored notify is a truthy primitive, and falls back to defaults", () => {
    expect(() => loadPrefs('{"notify":"oops"}')).not.toThrow();
    expect(loadPrefs('{"notify":"oops"}').notify).toEqual(DEFAULT_PREFS.notify);

    expect(() => loadPrefs('{"notify":42}')).not.toThrow();
    expect(loadPrefs('{"notify":42}').notify).toEqual(DEFAULT_PREFS.notify);

    expect(() => loadPrefs('{"notify":true}')).not.toThrow();
    expect(loadPrefs('{"notify":true}').notify).toEqual(DEFAULT_PREFS.notify);
  });
  it("never throws when stored notify is an array, and falls back to defaults", () => {
    expect(() => loadPrefs('{"notify":[1,2,3]}')).not.toThrow();
    expect(loadPrefs('{"notify":[1,2,3]}').notify).toEqual(DEFAULT_PREFS.notify);
  });
  it("still applies the legacy migration when stored notify is a non-object primitive", () => {
    expect(loadPrefs('{"notify":"oops"}', "off").notify.breakingNews).toBe(false);
    expect(loadPrefs('{"notify":42}', "on").notify.breakingNews).toBe(true);
    expect(loadPrefs('{"notify":[1,2,3]}', "off").notify.breakingNews).toBe(false);
  });
});

const PALETTE = { up: "#2FD37A", down: "#F6465D", flat: "#8A94A6" };

describe("directionColor", () => {
  it("returns the default palette when colorBlind is off", () => {
    expect(directionColor("up", { colorBlind: false }, PALETTE)).toBe("#2FD37A");
    expect(directionColor("down", { colorBlind: false }, PALETTE)).toBe("#F6465D");
  });
  it("returns the colorblind-safe palette when on", () => {
    expect(directionColor("up", { colorBlind: true }, PALETTE)).toBe("#3B82F6");
    expect(directionColor("down", { colorBlind: true }, PALETTE)).toBe("#F59E0B");
  });
  it("returns the flat/neutral color for unknown directions, never throws", () => {
    expect(directionColor("sideways", { colorBlind: false }, PALETTE)).toBe("#8A94A6");
    expect(directionColor(undefined, { colorBlind: true }, PALETTE)).toBe("#8A94A6");
  });
});

describe("directionGlyph", () => {
  it("emits no glyph in default mode", () => {
    expect(directionGlyph("up", { colorBlind: false })).toBe("");
    expect(directionGlyph("down", { colorBlind: false })).toBe("");
  });
  it("emits triangles in colorblind mode", () => {
    expect(directionGlyph("up", { colorBlind: true })).toBe("▲");
    expect(directionGlyph("down", { colorBlind: true })).toBe("▼");
    expect(directionGlyph("flat", { colorBlind: true })).toBe("");
  });
});

describe("notifyEnabled", () => {
  it("reads the per-type flag", () => {
    const p = { notify: { priceTriggers: true, breakingNews: false } };
    expect(notifyEnabled(p, "priceTriggers")).toBe(true);
    expect(notifyEnabled(p, "breakingNews")).toBe(false);
  });
  it("defaults missing types to false, never throws", () => {
    expect(notifyEnabled({}, "priceTriggers")).toBe(false);
    expect(notifyEnabled(null, "breakingNews")).toBe(false);
  });
});
