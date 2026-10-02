// ============================================================
//  live.js — who is allowed on the live rail, and when it is worth asking.
//
//  WHY THIS IS A MODULE AND NOT SIX LINES IN THE SERVER
//  Every decision here is one somebody will want to revisit, and none of them
//  can be checked by looking at the running app: the rail shows whatever it
//  shows, and a wrong allowlist looks exactly like a quiet afternoon. So the
//  rules live where they can be unit-tested, the same reason brokerPlanGate()
//  does. server/index.js holds the clock and the key; this holds the judgement.
//
//  WHY AN ALLOWLIST AT ALL
//  YouTube's live search for market terms is close to unusable raw. Measured
//  against q="stock market", 25 live results carried "🚨BITCOIN LIVE TRADING:
//  MY NEW SNIPER TRADES!! 🔥🔥🔥", four forex and gold signal rooms, and six
//  general-news channels broadcasting in Hindi and Telugu. One of those
//  auto-embedded beside somebody's real positions is not a bug you apologise
//  for afterwards. The rail therefore shows PUBLISHERS, not search results —
//  the query only decides who is considered.
//
//  HOW THESE IDS WERE OBTAINED, AND HOW TO ADD ONE
//  Every id was resolved through the Data API's channels.list, never typed
//  from memory:
//
//      GET /youtube/v3/channels?part=id,snippet&forHandle=@name&key=…
//
//  Do the same before adding a row, and check the title that comes back.
//  @BloombergTelevision — which looks obviously right — resolves to an
//  unrelated Korean personal account that took the handle. A plausible handle
//  is not a verified channel, and this file is the one place where guessing
//  puts a stranger's livestream inside a finance product.
// ============================================================

import { isMarketVideo } from "./market.js";

// id → the name it resolved to, kept beside it so a future reader can re-verify
// a row without re-deriving what it was supposed to be.
//
// THE KEYS ARE QUOTED, AND THAT IS NOT STYLE. A channel id is 24 characters of
// [A-Za-z0-9_-], and three of the twelve below contain a hyphen — which is not
// legal in a bare JavaScript identifier. Written unquoted, those three parse as
// subtraction and the file either throws or, worse, quietly becomes a different
// id: this list was first written that way and turned Reuters'
// UChqUTb7kYRX8-EiaN3XFrSQ into something that would never match anything.
// live.test.js asserts the format of every id for exactly that reason.
export const LIVE_CHANNELS = {
  "UCEAZeUIeJs0IjQiqTCdVSIg": "Yahoo Finance",
  "UCqoSrYgusd8ZddtMoWhjHYA": "Schwab Network",
  "UCqQs28K2zj2dOsc5NfXUKEg": "Benzinga",
  "UCrp_UI8XtuYfpiqluWLD7Lw": "CNBC Television",
  "UCvJJ_dzjViJCoLf5uKUTwoA": "CNBC",
  "UCIALMKvObZNtJ6AmdCLP7Lg": "Bloomberg Television",
  "UChqUTb7kYRX8-EiaN3XFrSQ": "Reuters",
  "UCCXoCcu9Rp7NPbTzIvogpZg": "Fox Business",
  "UC9ijza42jVR3T6b8bColgvg": "Kitco NEWS",
  "UC5fZv7bPcF5j2RsfO-9OiLA": "Investor's Business Daily",
  "UCLJiSMXJ9K-1AOTqIqdXJgQ": "tastylive",
  "UC7TghOL755nBk7HelHoi9LQ": "CoinDesk",
};

export const LIVE_CHANNEL_IDS = Object.keys(LIVE_CHANNELS);

// ---- when it is worth spending a search ----
//
// 8:00–17:00 ET on a weekday: the pre-bell warmup through the post-close wrap,
// which is when the channels above actually run a desk.
//
// This is a QUOTA gate, not a schedule. A YouTube search costs 100 units of a
// 10,000/day budget — the most expensive call this product makes — and the
// server's cache is lazy, so nothing polls in the background and the real
// bound is demand × TTL. At a 15-minute TTL that worst case is 96 searches a
// day, or 9,600 units, which is the entire budget with nothing left for the
// video desk. Clipping to market hours makes it ~36 searches and leaves the
// rest. Outside the window the rail answers honestly, instantly, and free.
export const LIVE_WINDOW = { openMin: 8 * 60, closeMin: 17 * 60 };

// Takes the exchange clock rather than reading one, so this is pure and the
// tests can stand at any hour of any day without mocking a global.
export function inLiveWindow({ day, mins } = {}) {
  if (!Number.isFinite(day) || !Number.isFinite(mins)) return false;
  return day >= 1 && day <= 5 && mins >= LIVE_WINDOW.openMin && mins < LIVE_WINDOW.closeMin;
}

// ---- what survives to the rail ----
//
// Three filters, and they are not the same test. The allowlist answers "is
// this a publisher we trust". isMarketVideo answers "is THIS broadcast about
// stocks" — which the allowlist cannot, because a publisher is not its
// programming: Reuters streams war and state funerals far more often than
// markets, and Fox Business runs political speeches end to end. `live`
// answers "is it actually on right now" — and that one comes from
// videos.list, not from search, because search keeps listing a broadcast for
// a while after it ends. Trusting search here is how a rail ends up showing a
// dead stream captioned LIVE.
//
// Sorted by concurrent viewers, which is the only ranking that means anything
// for something nobody has finished watching. A stream that hides its viewer
// count sorts last rather than being dropped — hiding the number is a setting,
// not a disqualification.
export function pickLive(videos, allowed = LIVE_CHANNEL_IDS) {
  const ok = new Set(allowed);
  return (Array.isArray(videos) ? videos : [])
    .filter(v => v && v.channelId && ok.has(v.channelId))
    .filter(isMarketVideo)
    .filter(v => v.live === true)
    .sort((a, b) => (b.viewers || 0) - (a.viewers || 0));
}
