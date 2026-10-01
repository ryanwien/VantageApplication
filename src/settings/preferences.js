// Pure preference logic behind Settings Bundle B. Kept out of React.jsx so it
// can be unit-tested. One persisted object lives at localStorage["tape-prefs"].

export const DEFAULT_PREFS = {
  colorBlind: false,
  privacy: false,
  refreshMs: 15000,
  // Whether the Portfolio panel may link REAL brokerage accounts, mirroring the
  // Quotes Demo/Live switch beside it.
  //
  // Defaults TRUE, unlike the notify flags below, because it is not a new
  // capability being switched on — the server's own configuration and the
  // account's plan already decide whether a live link is possible at all, and
  // this only lets someone opt OUT of being offered one. Defaulting it false
  // would silently turn a configured aggregator back into a demo book.
  portfolioLive: true,
  // All off by default — break-ins (sound + speech) are opt-in, not something a
  // first visit should have to discover how to silence.
  notify: { priceTriggers: false, breakingNews: false, pnfPatterns: false },
  // What the news desk brings in from YouTube beside the stories: `live` is the
  // ON AIR NOW rail (market channels streaming right now), `coverage` is
  // recorded videos about the symbol (VIDEO COVERAGE). Both default TRUE for the
  // same reason portfolioLive does — this shipped with both already on, so the
  // switch exists to opt OUT, and an install that never chose must keep what it
  // had. Off also stops the fetching behind it, not just the drawing: coverage
  // is a YouTube search per symbol, 100 units of a 10,000/day budget.
  video: { live: true, coverage: true },
};

const ALLOWED_REFRESH = new Set([0, 5000, 15000, 30000]);

export function coerceRefreshMs(v) {
  return ALLOWED_REFRESH.has(v) ? v : 15000;
}

// rawString: localStorage["tape-prefs"] (or null). legacyBreaking: the old
// localStorage["tape-breaking"] value ("on"/"off"/null), migrated only when the
// new prefs object does not already carry an explicit notify.breakingNews.
export function loadPrefs(rawString, legacyBreaking) {
  let stored = {};
  try { stored = rawString ? JSON.parse(rawString) : {}; } catch { stored = {}; }
  if (!stored || typeof stored !== "object") stored = {};
  const storedNotify = (stored.notify && typeof stored.notify === "object" && !Array.isArray(stored.notify))
    ? stored.notify
    : null;
  const notify = { ...DEFAULT_PREFS.notify, ...(storedNotify || {}) };
  const hadExplicit = storedNotify && "breakingNews" in storedNotify;
  if (!hadExplicit && (legacyBreaking === "off" || legacyBreaking === "on")) {
    notify.breakingNews = legacyBreaking !== "off";
  }
  return {
    colorBlind: !!stored.colorBlind,
    privacy: !!stored.privacy,
    refreshMs: coerceRefreshMs(stored.refreshMs),
    // Absent means "never chosen", which must read as the default TRUE — not as
    // false. `!!stored.portfolioLive` would turn every existing install's live
    // links back into demo books on the first load after this shipped.
    portfolioLive: "portfolioLive" in stored ? !!stored.portfolioLive : DEFAULT_PREFS.portfolioLive,
    notify,
    video: loadVideo(stored.video),
  };
}

// Same rule as portfolioLive, per key: absent means never chosen, which reads
// as the default. Anything that is not a plain object is corrupt and falls back
// whole, rather than being half-applied.
function loadVideo(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { ...DEFAULT_PREFS.video };
  return {
    live: "live" in v ? !!v.live : DEFAULT_PREFS.video.live,
    coverage: "coverage" in v ? !!v.coverage : DEFAULT_PREFS.video.coverage,
  };
}

const CB_PALETTE = { up: "#3B82F6", down: "#F59E0B" };
const GLYPH = { up: "▲", down: "▼" };

// Resolve the up/down color. palette is the app's default { up, down, flat }.
export function directionColor(dir, prefs, palette) {
  if (dir !== "up" && dir !== "down") return palette.flat;
  return prefs && prefs.colorBlind ? CB_PALETTE[dir] : palette[dir];
}

// Direction glyph — only in colorblind mode, only for up/down.
export function directionGlyph(dir, prefs) {
  if (!prefs || !prefs.colorBlind) return "";
  return GLYPH[dir] || "";
}

// Is this in-app alert type enabled?
export function notifyEnabled(prefs, type) {
  return !!(prefs && prefs.notify && prefs.notify[type]);
}
