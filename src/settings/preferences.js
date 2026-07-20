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
