import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Market data is licensed, and this app charges money for what it draws. That
// makes "where does this number come from" a legal question as much as a
// technical one, and the answer is not visible anywhere on screen — which is
// exactly the kind of fact that drifts.
//
// Yahoo's query1.finance.yahoo.com chart endpoint is UNDOCUMENTED and
// UNLICENSED: there is no terms-of-service under which a server may poll it.
// It was doing two jobs here. The quote failover has been removed. The
// intraday-candles proxy has NOT, because Finnhub 403s on /stock/candle below
// its paid tier, so deleting it would delete the chart rather than re-route
// it — a bill to pay, not a bug to fix.
//
// So this file pins the shape of a deliberate, documented compromise: one
// remaining call, in the one place that has no licensed alternative, with the
// warning still attached to it. It is not a style check. Every assertion here
// is a thing someone could re-introduce by accident in a hurry, and none of
// them would fail anything else.
const src = readFileSync(new URL("./index.js", import.meta.url), "utf8");

// A live call, as opposed to the prose above the provider list that explains
// why the failover is gone. Only a real fetch carries the scheme.
const LIVE_CALL = /https:\/\/query1\.finance\.yahoo\.com/g;

describe("market-data licensing: the Yahoo chart endpoint", () => {
  it("is not in the quote failover chain", () => {
    const m = src.match(/const QUOTE_PROVIDERS = \[(.*)\];/);
    expect(m, "QUOTE_PROVIDERS is not shaped the way this test reads it — update them together").toBeTruthy();
    expect(m[1]).not.toMatch(/yahoo/i);
  });

  it("is called from exactly one place, and that place is the candles proxy", () => {
    // The count is the assertion. A second call site is how an unlicensed
    // dependency grows back: it is always cheaper to reach for the endpoint
    // that already works than to license the one that should.
    const calls = src.match(LIVE_CALL) || [];
    expect(calls, `expected 1 call to the unlicensed Yahoo host, found ${calls.length}`).toHaveLength(1);

    // And it is where we think it is. Bounded to the handler, because the file
    // is 2,400 lines and "somewhere in it" is not a location.
    const start = src.indexOf('if (p === "/api/candles"');
    expect(start, "the /api/candles handler moved").toBeGreaterThan(0);
    const handler = src.slice(start, src.indexOf('if (p === "/api/ai/gemini"', start));
    expect(handler).toMatch(LIVE_CALL);
  });

  it("still carries its warning, in the handler that still depends on it", () => {
    // The favicon taught this lesson once already: an instruction that lives
    // in a comment nobody re-reads is an instruction that gets missed. A
    // warning silently deleted while the dependency stays is strictly worse
    // than no warning, because the next reader concludes it was dealt with.
    const start = src.indexOf('if (p === "/api/candles"');
    const handler = src.slice(Math.max(0, start - 2200), start + 400);
    expect(handler).toMatch(/UNLICENSED, AND KNOWINGLY SO/);
    // The user-agent spoof is the part that makes this evasion of an access
    // control rather than use of an undocumented one, so it is named in the
    // warning on purpose and should leave with the endpoint.
    expect(handler).toMatch(/user-agent/i);
  });

  it("has no OTHER unlicensed market-data host hiding in the file", () => {
    // Scoped to the two hosts this app has actually reached for. A blanket
    // "no scraping" regex would be a lie — it cannot know what a hostname is
    // licensed for — so this lists what was found rather than pretending to
    // detect a category.
    const KNOWN_UNLICENSED = [/query2\.finance\.yahoo\.com/, /finance\.yahoo\.com\/quote/];
    for (const re of KNOWN_UNLICENSED) expect(src).not.toMatch(re);
  });
});
