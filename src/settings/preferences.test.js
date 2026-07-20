import { describe, it, expect } from "vitest";
import { DEFAULT_PREFS, loadPrefs, coerceRefreshMs } from "./preferences.js";

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
