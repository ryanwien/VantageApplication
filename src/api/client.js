// ============================================================
//  Vantage REST client — one typed surface over the backend in server/index.js.
//
//  WHY
//  Calls to /api/* used to be ~15 hand-rolled fetch() sites scattered through
//  React.jsx, each re-deriving its own Authorization header, its own error text
//  and its own idea of what a failure looks like. This module owns all of it:
//  one place to add a header, one place to change error handling, one list of
//  what the backend can actually do.
//
//  THE ONE RULE THAT SHAPES THIS FILE
//  The backend is OPTIONAL. Vantage runs fully in the browser with no server at
//  all, so "cannot reach /api" is a normal state, not an error to shout about.
//  Every call therefore fails soft and reports *why* via a typed error, and
//  `probe()` tells the UI whether to offer backend features in the first place.
// ============================================================


const TOKEN_KEY = "vantage-session-token";
const DEFAULT_TIMEOUT = 15000;

// ---------- typed error ----------
// A single error shape means callers can branch on `kind` instead of string-matching
// messages. `offline` is the one that must never be rendered as a scary failure.
export class ApiError extends Error {
  constructor(message, { status = 0, kind = "http", body = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.kind = kind; // "offline" | "timeout" | "auth" | "http" | "parse"
    this.body = body;
  }
  get isOffline() { return this.kind === "offline" || this.kind === "timeout"; }
  get isAuth() { return this.kind === "auth" || this.status === 401; }
}

// ---------- token storage ----------
// localStorage can throw outright in private/embedded contexts, so every access
// is guarded. A missing token is simply "signed out".
export const tokenStore = {
  get() {
    try { return window.localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
  },
  set(token) {
    try { token ? window.localStorage.setItem(TOKEN_KEY, token) : window.localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
  },
  clear() { this.set(""); },
};

// ---------- core request ----------
async function request(path, { method = "GET", body, auth = true, timeout = DEFAULT_TIMEOUT, signal } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";

  // Bearer, matching tokenFromReq() on the server. Only attach when we have one —
  // sending "Bearer " with an empty token reads as a malformed credential.
  const token = auth ? tokenStore.get() : "";
  if (token) headers.Authorization = `Bearer ${token}`;

  // Compose the caller's abort signal with our own timeout so either can cancel.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort("timeout"), timeout);
  const onAbort = () => ctrl.abort("caller");
  if (signal) signal.addEventListener("abort", onAbort, { once: true });

  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    // A network-level throw means no server answered. In this app that is the
    // expected zero-setup state, so it gets its own kind rather than "http".
    const timedOut = ctrl.signal.reason === "timeout";
    throw new ApiError(
      timedOut ? "The server took too long to respond." : "No Vantage backend is running.",
      { kind: timedOut ? "timeout" : "offline" },
    );
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }

  // 204 and empty bodies are legitimate successes with nothing to parse.
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); }
    catch {
      // An HTML error page instead of JSON usually means a proxy answered, not the API.
      if (res.ok) throw new ApiError("The server sent a response Vantage could not read.", { status: res.status, kind: "parse" });
    }
  }

  if (!res.ok) {
    const msg = data?.error || `Request failed (HTTP ${res.status}).`;
    // 401 clears the stored token: keeping a rejected credential around just makes
    // every subsequent call fail the same way.
    if (res.status === 401) tokenStore.clear();
    throw new ApiError(msg, { status: res.status, kind: res.status === 401 ? "auth" : "http", body: data });
  }
  return data;
}

const get = (p, o) => request(p, { ...o, method: "GET" });
const post = (p, body, o) => request(p, { ...o, method: "POST", body });

// ============================================================
//  The API surface. Grouped to mirror the server's own layering:
//  auth · billing · meetings · agent · datahub · ai.
// ============================================================
export const api = {
  // ---- availability ----
  // Cheap unauthenticated call used to decide whether backend-only UI is offered
  // at all. Short timeout: this runs on boot and must not delay first paint.
  async probe({ timeout = 2500 } = {}) {
    try {
      const status = await get("/api/status", { auth: false, timeout });
      return { online: true, ...status };
    } catch {
      return { online: false };
    }
  },

  // ---- news (REST: the server's Finnhub proxy) ----
  // Unauthenticated on purpose: headlines are not account data, and the desk
  // tries this before anyone signs in. 503 means the server has no FINNHUB_KEY.
  news: (symbol, opts = {}) => get(`/api/news?symbol=${encodeURIComponent(symbol)}`, { auth: false, ...opts }),

  // ---- auth (email & password) ----
  auth: {
    async signup({ email, name, password, plan = "free", legalVersion = null }) {
      const acct = await post("/api/auth/signup", {
        email: String(email).trim().toLowerCase(), name, password, plan, legalVersion,
      }, { auth: false });
      if (acct?.token) tokenStore.set(acct.token);
      return acct;
    },
    async login({ email, password }) {
      const acct = await post("/api/auth/login", {
        email: String(email).trim().toLowerCase(), password,
      }, { auth: false });
      if (acct?.token) tokenStore.set(acct.token);
      return acct;
    },
    async logout() {
      // Best-effort: the local session is cleared regardless of what the server says,
      // otherwise a network blip would leave the user apparently signed in.
      try { await post("/api/auth/logout"); } catch { /* clearing locally is what matters */ }
      tokenStore.clear();
    },
    me: () => get("/api/auth/me"),
    setPlan: (plan) => post("/api/auth/plan", { plan }),
    // Which social buttons to render — a provider with no configured app is hidden.
    providers: () => get("/api/auth/providers", { auth: false }),
    // OAuth is a full-page redirect, not a fetch: the server needs to set its own
    // state cookie and bounce to the provider. So this returns a URL to navigate to.
    oauthUrl: (provider) => `/api/auth/oauth/${encodeURIComponent(provider)}/login`,
  },

  // ---- billing ----
  billing: {
    config: () => get("/api/billing/config", { auth: false }),
    checkout: (plan) => post("/api/billing/checkout", { plan }),
  },

  // ---- meetings (Zoom / Google Meet) ----
  meetings: {
    status: () => get("/api/status"),
    connectUrl: (provider) => `/api/${encodeURIComponent(provider)}/login?token=${encodeURIComponent(tokenStore.get())}`,
    create: (provider, topic) => post(`/api/${encodeURIComponent(provider)}/meeting`, { topic }),
    calendar: (max = 8) => get(`/api/google/events?max=${encodeURIComponent(max)}`),
  },

  // ---- brokerage links (Robinhood / Schwab / Morgan Stanley) ----
  //
  // The REAL path only. A demo link never comes through here — it is built in
  // the browser from src/brokers/brokers.js, because a demo that needs a
  // running server is not a zero-setup demo. `list` is unauthenticated so the
  // connect sheet can be drawn before anyone signs in.
  brokers: {
    list: () => get("/api/brokers"),
    linkToken: () => post("/api/brokers/link", {}),
    exchange: ({ publicToken, institutionName }) => post("/api/brokers/exchange", { publicToken, institutionName }),
    refresh: (connectionId = null) => post("/api/brokers/refresh", { connectionId }, { timeout: 30000 }),
    disconnect: (connectionId) => post("/api/brokers/disconnect", { connectionId }),
  },

  // ---- scheduled market-brief agent ----
  agent: {
    preferences: () => get("/api/agent/preferences"),
    savePreferences: ({ enabled, symbols }) => post("/api/agent/preferences", { enabled, symbols }),
    latest: () => get("/api/agent/latest"),
  },

  // ---- data catalog ----
  datahub: {
    health: () => get("/api/datahub/health", { auth: false }),
    // The server allow-lists `op` against a fixed set of GraphQL operations, so the
    // browser never gets to compose a query of its own.
    query: (op, variables) => post("/api/datahub/graphql", { op, variables }),
  },

  // ---- server-side AI (Vertex/Gemini), used when no browser key is set ----
  ai: {
    brief: (payload, opts) => post("/api/ai/brief", payload, { timeout: 45000, ...opts }),
  },
};

export default api;
