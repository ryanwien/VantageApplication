#!/usr/bin/env node
// ============================================================
//  check-live-channels — re-resolve every id in the live rail's allowlist
//  against the YouTube Data API and print what it ACTUALLY is.
//
//  WHY THIS IS A SCRIPT AND NOT A TEST
//  live.test.js can prove an id is well-SHAPED. It cannot prove it is the
//  RIGHT one, because the only authority on that is Google. Truncating an id
//  fails the shape check; substituting one character inside it does not, and
//  the result is a channel that silently never matches — a rail that looks
//  merely quiet. Catching that needs the network and the server's key, which
//  is not something the suite should depend on.
//
//  Run it when adding a row, and after any hand-edit of the list:
//      npm run check:live-channels
//
//  It costs ONE quota unit total: channels.list takes up to 50 ids at once.
//
//  It also re-checks the trap that motivated the allowlist. @BloombergTelevision
//  resolves to an unrelated Korean personal account that took the handle, so a
//  plausible-looking handle is never evidence. Only the id is.
// ============================================================

import { readFileSync } from "node:fs";
import { LIVE_CHANNELS } from "../src/video/live.js";

const KEY = process.env.YOUTUBE_API_KEY;
if (!KEY) {
  console.error("YOUTUBE_API_KEY is not set. Run with:  node --env-file=.env scripts/check-live-channels.mjs");
  process.exit(2);
}

const ids = Object.keys(LIVE_CHANNELS);
const api = new URL("https://www.googleapis.com/youtube/v3/channels");
api.search = new URLSearchParams({ part: "id,snippet,statistics", id: ids.join(","), maxResults: "50", key: KEY });

let data;
try {
  const r = await fetch(api, { signal: AbortSignal.timeout(15000) });
  data = await r.json();
  if (data.error) throw new Error(data.error.message);
} catch (e) {
  console.error(`Could not reach the Data API: ${e.message}`);
  process.exit(2);
}

const found = new Map((data.items || []).map(it => [it.id, it]));
const subs = (it) => {
  const n = Number(it.statistics?.subscriberCount);
  return Number.isFinite(n) ? (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}K`) : "?";
};

let bad = 0;
console.log(`Checking ${ids.length} channel ids (1 quota unit)\n`);
for (const id of ids) {
  const expected = LIVE_CHANNELS[id];
  const it = found.get(id);
  if (!it) {
    // The substitution case lands here: a well-formed id that is nobody's.
    console.log(`  ✗ ${id}  expected "${expected}" — NO SUCH CHANNEL`);
    bad++;
    continue;
  }
  const actual = it.snippet?.title || "";
  // Titles drift (a rebrand, a suffix), so a mismatch is reported rather than
  // failed — the id resolving at all is the thing that matters. A name that has
  // moved is a line to update here, not a broken rail.
  const same = actual.trim().toLowerCase() === expected.trim().toLowerCase();
  console.log(`  ${same ? "✓" : "~"} ${id}  ${actual} (${subs(it)} subs)${same ? "" : `   ← listed here as "${expected}"`}`);
}

console.log("");
if (bad) {
  console.log(`${bad} id${bad > 1 ? "s" : ""} resolved to nothing. Re-derive with:`);
  console.log("  curl -s \"https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forHandle=@NAME&key=$YOUTUBE_API_KEY\"");
  // exitCode rather than exit(): process.exit() aborts with a libuv assertion
  // on Windows while the fetch handles are still closing, which buries the
  // report this script exists to print.
  process.exitCode = 1;
} else {
  console.log("All ids resolve. Any ~ rows are name drift, not a broken id.");
}
