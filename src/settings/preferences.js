// Pure preference logic behind Settings Bundle B. Kept out of React.jsx so it
// can be unit-tested. One persisted object lives at localStorage["tape-prefs"].

export const DEFAULT_PREFS = {
  colorBlind: false,
  privacy: false,
  refreshMs: 15000,
  notify: { priceTriggers: true, breakingNews: true },
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
    notify,
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
