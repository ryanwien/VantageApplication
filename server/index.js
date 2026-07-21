// ============================================================
// Vantage backend — accounts, subscriptions, and Zoom + Google Meet.
// Dependency-free (Node 18+ built-ins only). Holds every server-side secret
// (OAuth client secrets, Stripe key) that a browser must never see, runs the
// OAuth code flow, and stores per-user data in gitignored JSON files.
//
// Run:   node --env-file=.env server/index.js         (Node 20+)
//   or:  set the env vars yourself, then: node server/index.js
//
// Required env (see .env.example):
//   ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET          — real Zoom meetings (optional)
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET       — real Google Meet + calendar (optional)
//   STRIPE_SECRET_KEY                            — real paid upgrades (optional; else simulated)
//   STRIPE_PRICE_PRO, STRIPE_PRICE_DESK          — Stripe Price IDs for the two paid plans
//   PORT            (default 8787)
//   PUBLIC_ORIGIN   (default http://localhost:8787 — must match the OAuth redirect URIs)
//   APP_ORIGIN      (default http://127.0.0.1:5173 — where the dashboard runs, for post-login redirect)
//
// LAYERS (each is optional; the app runs fully without any of them):
//   • Auth     — /api/auth/*    : scrypt-hashed passwords + session tokens (Bearer). This is
//                                 the user identity everything else keys on.
//   • Meetings — /api/:prov/*   : per-user OAuth tokens → create real Zoom/Meet links.
//   • Billing  — /api/billing/* : Stripe Checkout for paid plans (test mode).
//
// In dev the Vite server proxies /api → here (see vite.config.js), so the browser
// treats it as same-origin; CORS below is a courtesy for a no-proxy/prod setup.
// ============================================================
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GRAPHQL_OPS, isKnownOp } from "../src/datahub/catalog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || `http://localhost:${PORT}`;
const APP_ORIGIN = process.env.APP_ORIGIN || "http://127.0.0.1:5173";
const DATAHUB_GMS_URL = (process.env.DATAHUB_GMS_URL || "http://localhost:8080").replace(/\/+$/, "");
const DATAHUB_TOKEN = process.env.DATAHUB_TOKEN || "";
// The token is OPTIONAL: the local quickstart runs with metadata-service auth disabled and
// accepts unauthenticated queries. A deployed DataHub will require the token. So "configured"
// means we know where GMS is; the Authorization header is attached only when a token exists.
const datahubConfigured = () => Boolean(DATAHUB_GMS_URL);

const CFG = {
  zoom: {
    id: process.env.ZOOM_CLIENT_ID, secret: process.env.ZOOM_CLIENT_SECRET,
    authUrl: "https://zoom.us/oauth/authorize", tokenUrl: "https://zoom.us/oauth/token",
    redirect: `${PUBLIC_ORIGIN}/api/zoom/callback`, scope: "",
  },
  google: {
    id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET,
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token",
    redirect: `${PUBLIC_ORIGIN}/api/google/callback`, scope: "https://www.googleapis.com/auth/calendar.events",
  },
};
// Stripe (Layer 3). No secret key ⇒ billing.enabled is false and the front-end
// falls back to a clearly-labelled simulated unlock. Prices map a plan id → Stripe Price.
const STRIPE = {
  secret: process.env.STRIPE_SECRET_KEY,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  prices: { pro: process.env.STRIPE_PRICE_PRO, desk: process.env.STRIPE_PRICE_DESK },
};

const VERTEX = {
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
  serviceAccount: process.env.GCP_SERVICE_ACCOUNT_EMAIL,
  privateKey: process.env.GCP_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  model: process.env.VERTEX_GEMINI_MODEL || "gemini-2.0-flash",
};
const MARKET = { finnhubKey: process.env.FINNHUB_API_KEY, cronSecret: process.env.AGENT_CRON_SECRET };

// Social sign-in via OpenID Connect ("Continue with Google / Yahoo"). Each needs an OAuth app.
// Google REUSES the meetings client id/secret (just register the extra redirect URI + these scopes).
// Yahoo needs its own app. Proton is intentionally absent — it offers no third-party OIDC login.
// No secret ⇒ that provider's button is simply hidden by the front-end (/api/auth/providers).
const OAUTH = {
  google: {
    id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET,
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token",
    userInfo: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile", basicAuth: false,
    redirect: `${PUBLIC_ORIGIN}/api/auth/oauth/google/callback`,
  },
  yahoo: {
    id: process.env.YAHOO_CLIENT_ID, secret: process.env.YAHOO_CLIENT_SECRET,
    authUrl: "https://api.login.yahoo.com/oauth2/request_auth", tokenUrl: "https://api.login.yahoo.com/oauth2/get_token",
    userInfo: "https://api.login.yahoo.com/openid/v1/userinfo",
    scope: "openid email profile", basicAuth: true, // Yahoo requires HTTP Basic on the token call
    redirect: `${PUBLIC_ORIGIN}/api/auth/oauth/yahoo/callback`,
  },
};

// ---- persistent JSON stores (all gitignored — they hold hashes, live tokens, secrets) ----
const USERS_FILE = path.join(__dirname, "users.json");        // { [email]: { email,name,plan,salt,hash,agreedAt,legalVersion,createdAt } }
const SESSIONS_FILE = path.join(__dirname, "sessions.json");  // { [token]: { email, createdAt } }
const AI_USAGE_FILE = path.join(__dirname, "ai-usage.json");
const TOKENS_FILE = path.join(__dirname, "tokens.json");      // { [email]: { zoom:{...}, google:{...} } }  ← per-user OAuth tokens
const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return {}; } };
const writeJSON = (f, o) => { try { fs.writeFileSync(f, JSON.stringify(o, null, 2)); } catch (e) { console.error(`save failed (${path.basename(f)}):`, e.message); } };
let USERS = readJSON(USERS_FILE);
let SESSIONS = readJSON(SESSIONS_FILE);
let AI_USAGE = readJSON(AI_USAGE_FILE);
let TOKENS = readJSON(TOKENS_FILE);
const pendingState = new Map(); // oauth CSRF state -> { prov, email }

// ---- helpers ----
const send = (res, code, body, headers = {}) => {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(code, { "Content-Type": typeof body === "string" ? "text/html" : "application/json", "Access-Control-Allow-Origin": APP_ORIGIN, ...headers });
  res.end(payload);
};
const readBody = (req) => new Promise((resolve) => { let d = ""; req.on("data", c => d += c); req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } }); });
const readRawBody = (req) => new Promise((resolve) => { const chunks = []; req.on("data", c => chunks.push(c)); req.on("end", () => resolve(Buffer.concat(chunks))); });
const form = (obj) => new URLSearchParams(obj).toString();

const b64url = (value) => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
let vertexToken = null;
async function vertexAccessToken() {
  if (!VERTEX.project || !VERTEX.serviceAccount || !VERTEX.privateKey) throw new Error("Hosted AI is not configured on this server.");
  if (vertexToken && Date.now() < vertexToken.expiresAt) return vertexToken.value;
  const now = Math.floor(Date.now() / 1000), header = b64url({ alg: "RS256", typ: "JWT" });
  const claim = b64url({ iss: VERTEX.serviceAccount, scope: "https://www.googleapis.com/auth/cloud-platform", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const signer = crypto.createSign("RSA-SHA256"); signer.update(`${header}.${claim}`); signer.end();
  const assertion = `${header}.${claim}.${signer.sign(VERTEX.privateKey).toString("base64url")}`;
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error_description || j.error || `Google token HTTP ${r.status}`);
  vertexToken = { value: j.access_token, expiresAt: Date.now() + Math.max(60, Number(j.expires_in || 3600) - 60) * 1000 };
  return vertexToken.value;
}
async function askVertex(prompt) {
  const token = await vertexAccessToken();
  const endpoint = `https://${VERTEX.location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(VERTEX.project)}/locations/${encodeURIComponent(VERTEX.location)}/publishers/google/models/${encodeURIComponent(VERTEX.model)}:generateContent`;
  const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 1000, temperature: 0.35 } }) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || `Vertex AI HTTP ${r.status}`);
  const text = (j.candidates || []).flatMap(c => c.content?.parts || []).map(p => p.text || "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}
const todayKey = () => new Date().toISOString().slice(0, 10);
const planQuota = (plan) => plan === "desk" ? 250 : plan === "pro" ? 75 : 5;
function canUseAi(email) { const used = AI_USAGE[email]?.days?.[todayKey()] || 0, limit = planQuota(USERS[email]?.plan || "free"); return { used, limit, allowed: used < limit }; }
function recordAiRun(email, promptChars, outcome, meta = {}) {
  const user = AI_USAGE[email] || (AI_USAGE[email] = { days: {}, runs: [] }), day = todayKey();
  user.days[day] = (user.days[day] || 0) + 1;
  user.runs.push({ at: new Date().toISOString(), agent: "market-brief", plan: USERS[email]?.plan || "free", promptChars, outcome, ...meta });
  user.runs = user.runs.slice(-500); writeJSON(AI_USAGE_FILE, AI_USAGE);
  return { used: user.days[day], limit: planQuota(USERS[email]?.plan || "free") };
}
async function marketSnapshot(symbols) {
  if (!MARKET.finnhubKey) throw new Error("Automated briefs need FINNHUB_API_KEY on the server.");
  const clean = [...new Set((symbols || []).map(s => String(s).trim().toUpperCase()).filter(s => /^[A-Z.]{1,10}$/.test(s)))].slice(0, 12);
  if (!clean.length) throw new Error("Add at least one ticker to the agent watchlist.");
  const rows = await Promise.all(clean.map(async sym => {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${encodeURIComponent(MARKET.finnhubKey)}`);
    const q = await r.json(); if (!r.ok || !Number.isFinite(q.c)) throw new Error(`${sym} quote unavailable`);
    return { sym, price: q.c, change: q.d, changePct: q.dp, high: q.h, low: q.l, previousClose: q.pc };
  }));
  return rows;
}
async function runMarketAgent(email) {
  const agent = USERS[email]?.agent;
  if (!agent?.enabled) return { skipped: "disabled" };
  const quota = canUseAi(email); if (!quota.allowed) return { skipped: "quota" };
  const rows = await marketSnapshot(agent.symbols);
  const prompt = `You are Vantage's market-brief agent. Create a concise, factual daily briefing from this quote snapshot only: ${JSON.stringify(rows)}. Explain notable moves and uncertainty. Do not give buy/sell recommendations, price targets, or imply real-time news. End with: \"Information only, not financial advice.\"`;
  const text = await askVertex(prompt);
  const usage = recordAiRun(email, prompt.length, "success", { model: VERTEX.model, trigger: "scheduled", symbols: rows.map(r => r.sym), outputChars: text.length });
  AI_USAGE[email].latestBrief = { at: new Date().toISOString(), symbols: rows.map(r => r.sym), text };
  writeJSON(AI_USAGE_FILE, AI_USAGE);
  return { delivered: true, usage, symbols: rows.map(r => r.sym) };
}

// ============================================================
//  AUTH — scrypt passwords + opaque session tokens (Bearer)
// ============================================================
// scrypt is CPU-hard; a random per-user salt defeats rainbow tables. Stored as hex.
function hashPw(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return { salt, hash };
}
function verifyPw(password, salt, hash) {
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(password), salt, 64);
  const good = Buffer.from(hash, "hex");
  return good.length === test.length && crypto.timingSafeEqual(test, good); // constant-time compare
}
// mint a session, persist it (so tokens survive a server restart — the browser keeps its copy in localStorage)
function newSession(email) {
  const token = crypto.randomBytes(24).toString("hex");
  SESSIONS[token] = { email, createdAt: Date.now() };
  writeJSON(SESSIONS_FILE, SESSIONS);
  return token;
}
// pull the bearer token from the header, or (for top-level OAuth redirects that can't set headers) the ?token= query
const tokenFromReq = (req, url) => {
  const h = req.headers["authorization"] || "";
  if (h.startsWith("Bearer ")) return h.slice(7).trim();
  return url?.searchParams.get("token") || null; // ⚠ query tokens can leak into logs/Referer — prototype-acceptable
};
const emailFromReq = (req, url) => SESSIONS[tokenFromReq(req, url)]?.email || null;
// the safe public view of an account (never the salt/hash)
const accountView = (email) => { const u = USERS[email]; return u ? { email: u.email, name: u.name, plan: u.plan } : null; };

// ---- social sign-in (OpenID Connect): exchange the code, then fetch the profile ----
// Returns { email, name }. The caller creates-or-logs-in the user and mints a session.
async function socialProfile(provider, code) {
  const c = OAUTH[provider];
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  const body = { grant_type: "authorization_code", code, redirect_uri: c.redirect };
  if (c.basicAuth) headers.Authorization = "Basic " + Buffer.from(`${c.id}:${c.secret}`).toString("base64");
  else { body.client_id = c.id; body.client_secret = c.secret; }
  const tr = await fetch(c.tokenUrl, { method: "POST", headers, body: form(body) });
  const tj = await tr.json();
  if (!tr.ok) throw new Error(tj.error_description || tj.error || `token HTTP ${tr.status}`);
  const ur = await fetch(c.userInfo, { headers: { Authorization: `Bearer ${tj.access_token}` } });
  const uj = await ur.json();
  if (!ur.ok) throw new Error(uj.error?.message || `userinfo HTTP ${ur.status}`);
  const email = String(uj.email || "").trim().toLowerCase();
  if (!email) throw new Error(`${provider} did not return an email — can't create an account`);
  return { email, name: uj.name || uj.given_name || email.split("@")[0] };
}

// ============================================================
//  MEETINGS — per-user OAuth token storage + real meeting creation
// ============================================================
// exchange an auth code (or refresh) for tokens
async function fetchToken(provider, params) {
  const c = CFG[provider];
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  const body = { ...params };
  if (provider === "zoom") headers.Authorization = "Basic " + Buffer.from(`${c.id}:${c.secret}`).toString("base64");
  else { body.client_id = c.id; body.client_secret = c.secret; }
  const r = await fetch(c.tokenUrl, { method: "POST", headers, body: form(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || j.error || j.message || `token HTTP ${r.status}`);
  return j;
}
// stash a provider's tokens under the owning user (TOKENS is keyed by email, then provider)
function storeToken(email, provider, j) {
  const bucket = TOKENS[email] || (TOKENS[email] = {});
  const prev = bucket[provider] || {};
  bucket[provider] = {
    access_token: j.access_token,
    refresh_token: j.refresh_token || prev.refresh_token, // Google omits refresh_token on re-consent
    expires_at: Date.now() + (j.expires_in ? (j.expires_in - 60) * 1000 : 3300 * 1000),
  };
  writeJSON(TOKENS_FILE, TOKENS);
}
// a valid access token for this user+provider, refreshing if it has expired
async function accessToken(email, provider) {
  const t = TOKENS[email]?.[provider];
  if (!t?.access_token) throw new Error(`${provider} not connected — click Connect first`);
  if (Date.now() < t.expires_at) return t.access_token;
  if (!t.refresh_token) throw new Error(`${provider} session expired — reconnect`);
  const j = await fetchToken(provider, { grant_type: "refresh_token", refresh_token: t.refresh_token });
  storeToken(email, provider, j);
  return TOKENS[email][provider].access_token;
}

// ---- create-meeting per provider (on the calling user's account) ----
async function createZoom(email, topic) {
  const tok = await accessToken(email, "zoom");
  const r = await fetch("https://api.zoom.us/v2/users/me/meetings", {
    method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ topic: topic || "Vantage Market Briefing", type: 1, settings: { join_before_host: true } }), // type 1 = instant
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || `Zoom HTTP ${r.status}`);
  return { provider: "zoom", topic: j.topic, join_url: j.join_url, start_url: j.start_url, id: j.id };
}
async function createGoogle(email, topic) {
  const tok = await accessToken(email, "google");
  const start = new Date(Date.now() + 60 * 1000), end = new Date(Date.now() + 31 * 60 * 1000);
  const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1", {
    method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: topic || "Vantage Market Briefing",
      start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() },
      conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || `Google HTTP ${r.status}`);
  const link = j.hangoutLink || j.conferenceData?.entryPoints?.find(e => e.entryPointType === "video")?.uri;
  return { provider: "google", topic: j.summary, join_url: link, start_url: link, id: j.id, htmlLink: j.htmlLink };
}

// ---- read this user's upcoming Google Calendar events (same calendar.events scope covers reads) ----
async function listGoogleEvents(email, max = 10) {
  const tok = await accessToken(email, "google");
  const params = new URLSearchParams({
    timeMin: new Date().toISOString(),
    maxResults: String(Math.min(Math.max(max, 1), 25)),
    singleEvents: "true", orderBy: "startTime",
  });
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${tok}` },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || `Google HTTP ${r.status}`);
  return (j.items || []).map(e => ({
    id: e.id,
    summary: e.summary || "(no title)",
    start: e.start?.dateTime || e.start?.date || null,
    end: e.end?.dateTime || e.end?.date || null,
    allDay: !e.start?.dateTime,
    location: e.location || null,
    hangoutLink: e.hangoutLink || e.conferenceData?.entryPoints?.find(x => x.entryPointType === "video")?.uri || null,
    htmlLink: e.htmlLink || null,
  }));
}

// ============================================================
//  BILLING — Stripe Checkout via REST (no npm dependency)
// ============================================================
// Create a hosted Checkout Session for a paid plan. Card entry happens only on
// Stripe's page; on success Stripe returns the browser to APP_ORIGIN/?checkout=success&plan=…
// ⚠ The plan is confirmed by the front-end from that redirect (and persisted via /api/auth/plan),
// which is client-trusted — a user could self-grant a plan. Fine for test mode (paid plans are
// simulated per the app's terms); harden with a Stripe webhook before taking real money.
async function stripeCheckout(email, plan) {
  const price = STRIPE.prices[plan];
  if (!price) throw new Error(`no Stripe price configured for "${plan}"`);
  const params = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    success_url: `${APP_ORIGIN}/?checkout=success&plan=${encodeURIComponent(plan)}`,
    cancel_url: `${APP_ORIGIN}/?checkout=cancel`,
    client_reference_id: email || "",
    "metadata[plan]": plan,
    "metadata[email]": email || "",
    "subscription_data[metadata][plan]": plan,
    "subscription_data[metadata][email]": email || "",
    ...(email ? { customer_email: email } : {}),
  });
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${STRIPE.secret}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || `Stripe HTTP ${r.status}`);
  return j.url;
}

function verifyStripeSignature(raw, signature) {
  if (!STRIPE.webhookSecret || !signature) return false;
  const values = Object.fromEntries(signature.split(",").map(x => x.split("=", 2)));
  if (!values.t || !values.v1 || Math.abs(Date.now() / 1000 - Number(values.t)) > 300) return false;
  const expected = crypto.createHmac("sha256", STRIPE.webhookSecret).update(`${values.t}.${raw.toString("utf8")}`).digest("hex");
  const a = Buffer.from(expected, "hex"), b = Buffer.from(values.v1, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const planFromStripeObject = (obj) => obj?.metadata?.plan || Object.entries(STRIPE.prices).find(([, id]) => id === (obj?.lines?.data?.[0]?.price?.id || obj?.items?.data?.[0]?.price?.id))?.[0] || null;

// ---- request router ----
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, PUBLIC_ORIGIN);
  const p = url.pathname;
  if (req.method === "OPTIONS") return send(res, 204, "", { "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" });

  try {
    // This must run before JSON parsing: Stripe signs the exact request bytes.
    if (p === "/api/billing/webhook" && req.method === "POST") {
      const raw = await readRawBody(req);
      if (!verifyStripeSignature(raw, req.headers["stripe-signature"])) return send(res, 400, { error: "Invalid Stripe signature." });
      const event = JSON.parse(raw.toString("utf8")), obj = event.data?.object || {};
      const email = obj.client_reference_id || obj.customer_email || obj.metadata?.email;
      if (email && USERS[email]) {
        if (event.type === "checkout.session.completed" || event.type === "customer.subscription.updated") {
          const plan = planFromStripeObject(obj); if (plan) USERS[email].plan = plan;
        } else if (event.type === "customer.subscription.deleted") USERS[email].plan = "free";
        writeJSON(USERS_FILE, USERS);
      }
      return send(res, 200, { received: true });
    }
    // ---- AUTH ----
    if (p === "/api/auth/signup" && req.method === "POST") {
      const { email, name, password, plan, legalVersion } = await readBody(req);
      const em = String(email || "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return send(res, 400, { error: "Enter a valid email." });
      if (String(password || "").length < 6) return send(res, 400, { error: "Password must be at least 6 characters." });
      if (USERS[em]) return send(res, 409, { error: "An account with that email already exists — log in instead." });
      const { salt, hash } = hashPw(password);
      USERS[em] = { email: em, name: String(name || "").trim() || em.split("@")[0], plan: plan || "free", salt, hash, agreedAt: Date.now(), legalVersion: legalVersion || null, createdAt: Date.now() };
      writeJSON(USERS_FILE, USERS);
      return send(res, 200, { ...accountView(em), token: newSession(em) });
    }
    if (p === "/api/auth/login" && req.method === "POST") {
      const { email, password } = await readBody(req);
      const em = String(email || "").trim().toLowerCase();
      const rec = USERS[em];
      if (!rec) return send(res, 401, { error: "No account found for that email — try signing up." });
      if (!verifyPw(password, rec.salt, rec.hash)) return send(res, 401, { error: "Incorrect password." });
      return send(res, 200, { ...accountView(em), token: newSession(em) });
    }
    if (p === "/api/auth/logout" && req.method === "POST") {
      const tok = tokenFromReq(req, url);
      if (tok && SESSIONS[tok]) { delete SESSIONS[tok]; writeJSON(SESSIONS_FILE, SESSIONS); }
      return send(res, 200, { ok: true });
    }

    // ---- DATAHUB (read-only catalog context) ----
    if (p === "/api/datahub/health" && req.method === "GET") {
      if (!datahubConfigured()) return send(res, 200, { configured: false, reachable: false });
      try {
        const r = await fetch(`${DATAHUB_GMS_URL}/health`, { signal: AbortSignal.timeout(4000) });
        return send(res, 200, { configured: true, reachable: r.ok });
      } catch {
        return send(res, 200, { configured: true, reachable: false });
      }
    }
    if (p === "/api/datahub/graphql" && req.method === "POST") {
      if (!datahubConfigured()) {
        return send(res, 503, { error: "DataHub is not configured on the server (set DATAHUB_GMS_URL and DATAHUB_TOKEN)." });
      }
      const { op, variables } = await readBody(req);
      if (!isKnownOp(op)) return send(res, 400, { error: "Unknown DataHub operation." });
      const spec = GRAPHQL_OPS[op];
      try {
        const r = await fetch(`${DATAHUB_GMS_URL}/api/graphql`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Only send Authorization when a token exists — the quickstart runs with
            // metadata-service auth disabled and rejects nothing, but a deployed GMS needs it.
            ...(DATAHUB_TOKEN ? { Authorization: `Bearer ${DATAHUB_TOKEN}` } : {}),
          },
          body: JSON.stringify({ query: spec.query, variables: spec.variables(variables) }),
          signal: AbortSignal.timeout(15000),
        });
        if (r.status === 401 || r.status === 403) return send(res, 502, { error: "DataHub rejected the access token." });
        if (!r.ok) return send(res, 502, { error: `DataHub returned HTTP ${r.status}.` });
        const json = await r.json();
        // Forward data only. Never echo the token, and never forward raw server errors.
        return send(res, 200, { data: json?.data ?? null });
      } catch {
        return send(res, 502, { error: "Could not reach DataHub." });
      }
    }

    if (p === "/api/auth/me" && req.method === "GET") {
      const email = emailFromReq(req, url);
      if (!email || !USERS[email]) return send(res, 401, { error: "Not signed in." });
      return send(res, 200, accountView(email));
    }
    if (p === "/api/auth/plan" && req.method === "POST") {
      const email = emailFromReq(req, url);
      if (!email || !USERS[email]) return send(res, 401, { error: "Not signed in." });
      const { plan } = await readBody(req);
      if (STRIPE.secret && plan && plan !== "free") return send(res, 403, { error: "Paid plans are updated only by verified Stripe webhooks." });
      USERS[email].plan = plan || "free"; writeJSON(USERS_FILE, USERS);
      return send(res, 200, { ok: true, plan: USERS[email].plan });
    }

    // ---- SOCIAL SIGN-IN (Google / Yahoo via OpenID Connect) ----
    // which social buttons to show (a provider with no configured app is hidden)
    if (p === "/api/auth/providers" && req.method === "GET") {
      const out = {};
      for (const k of ["google", "yahoo"]) out[k] = !!(OAUTH[k].id && OAUTH[k].secret);
      return send(res, 200, out);
    }
    // begin: /api/auth/oauth/:provider/login → provider consent screen
    const solo = p.match(/^\/api\/auth\/oauth\/(google|yahoo)\/login$/);
    if (solo) {
      const prov = solo[1], c = OAUTH[prov];
      if (!c.id || !c.secret) return send(res, 400, `${prov} sign-in is not configured on this server.`);
      const state = crypto.randomBytes(16).toString("hex");
      pendingState.set(state, { prov, social: true });
      const q = { response_type: "code", client_id: c.id, redirect_uri: c.redirect, scope: c.scope, state };
      return send(res, 302, "", { Location: `${c.authUrl}?${form(q)}` });
    }
    // callback: exchange code → profile → create-or-login user → mint session → hand token back to the app
    const socb = p.match(/^\/api\/auth\/oauth\/(google|yahoo)\/callback$/);
    if (socb) {
      const prov = socb[1];
      const code = url.searchParams.get("code"), state = url.searchParams.get("state");
      if (url.searchParams.get("error")) return send(res, 400, `Sign-in denied: ${url.searchParams.get("error")}`);
      const pend = pendingState.get(state);
      if (!code || !pend || pend.prov !== prov || !pend.social) return send(res, 400, "Invalid sign-in state — try again.");
      pendingState.delete(state);
      const { email, name } = await socialProfile(prov, code);
      let rec = USERS[email];
      if (!rec) { // first time via this provider → create a passwordless account
        rec = USERS[email] = { email, name, plan: "free", provider: prov, agreedAt: Date.now(), legalVersion: null, createdAt: Date.now() };
        writeJSON(USERS_FILE, USERS);
      }
      const token = newSession(email);
      // token in the redirect URL: the app reads it once and cleans the URL (prototype-acceptable)
      const q = new URLSearchParams({ auth: "1", token, email: rec.email, name: rec.name || "", plan: rec.plan || "free" });
      return send(res, 302, "", { Location: `${APP_ORIGIN}/?${q}` });
    }

    // ---- BILLING (Layer 3) ----
    if (p === "/api/billing/config" && req.method === "GET") {
      return send(res, 200, { enabled: !!STRIPE.secret, plans: { pro: !!STRIPE.prices.pro, desk: !!STRIPE.prices.desk } });
    }
    if (p === "/api/billing/checkout" && req.method === "POST") {
      if (!STRIPE.secret) return send(res, 400, { error: "Billing is not configured on this server." });
      const body = await readBody(req);
      const email = emailFromReq(req, url);
      if (!email) return send(res, 401, { error: "Sign in before starting checkout." });
      const url_ = await stripeCheckout(email, body.plan);
      return send(res, 200, { url: url_ });
    }

    // Hosted AI desk: the browser supplies context, but Gemini and its credentials stay server-side.
    if (p === "/api/ai/brief" && req.method === "POST") {
      const email = emailFromReq(req, url);
      if (!email || !USERS[email]) return send(res, 401, { error: "Sign in to use the hosted AI desk." });
      const { prompt } = await readBody(req), clean = String(prompt || "").trim();
      if (!clean || clean.length > 14000) return send(res, 400, { error: "Prompt must be between 1 and 14,000 characters." });
      const quota = canUseAi(email);
      if (!quota.allowed) return send(res, 429, { error: `Daily AI limit reached (${quota.used}/${quota.limit}).` });
      try {
        const text = await askVertex(clean);
        return send(res, 200, { text, model: VERTEX.model, usage: recordAiRun(email, clean.length, "success", { model: VERTEX.model, outputChars: text.length }) });
      } catch (e) {
        recordAiRun(email, clean.length, "error", { error: String(e.message || e).slice(0, 300) });
        throw e;
      }
    }

    // Opt-in configuration for the scheduled market-brief agent.
    if (p === "/api/agent/preferences" && req.method === "GET") {
      const email = emailFromReq(req, url);
      if (!email || !USERS[email]) return send(res, 401, { error: "Not signed in." });
      return send(res, 200, USERS[email].agent || { enabled: false, symbols: [] });
    }
    if (p === "/api/agent/preferences" && req.method === "POST") {
      const email = emailFromReq(req, url);
      if (!email || !USERS[email]) return send(res, 401, { error: "Not signed in." });
      const body = await readBody(req);
      const symbols = [...new Set((body.symbols || []).map(s => String(s).trim().toUpperCase()).filter(s => /^[A-Z.]{1,10}$/.test(s)))].slice(0, 12);
      USERS[email].agent = { enabled: !!body.enabled, symbols, updatedAt: new Date().toISOString() };
      writeJSON(USERS_FILE, USERS);
      return send(res, 200, USERS[email].agent);
    }
    if (p === "/api/agent/latest" && req.method === "GET") {
      const email = emailFromReq(req, url);
      if (!email || !USERS[email]) return send(res, 401, { error: "Not signed in." });
      return send(res, 200, { brief: AI_USAGE[email]?.latestBrief || null });
    }
    // Call from Cloud Scheduler once daily. The secret is intentionally distinct from user sessions.
    if (p === "/api/agent/run" && req.method === "POST") {
      if (!MARKET.cronSecret || req.headers["x-vantage-cron-secret"] !== MARKET.cronSecret) return send(res, 401, { error: "Unauthorized scheduler." });
      const results = [];
      for (const email of Object.keys(USERS)) {
        try { results.push({ email, ...(await runMarketAgent(email)) }); }
        catch (e) { recordAiRun(email, 0, "error", { trigger: "scheduled", error: String(e.message || e).slice(0, 300) }); results.push({ email, error: "brief failed" }); }
      }
      return send(res, 200, { ranAt: new Date().toISOString(), results });
    }

    // ---- MEETINGS: status (NEVER gates on auth — backendReachable() pings this) ----
    // Always 200 so the front-end can detect the backend. Reports per-user connected state
    // when a valid token is present; a guest/no-token caller simply sees connected:false.
    if (p === "/api/status") {
      const email = emailFromReq(req, url);
      const status = {};
      for (const k of ["zoom", "google"]) status[k] = { configured: !!(CFG[k].id && CFG[k].secret), connected: !!(email && TOKENS[email]?.[k]?.access_token) };
      return send(res, 200, status);
    }

    // begin OAuth: /api/:provider/login?token=<session> → redirect to the provider's consent screen.
    // Carried as a query param because this is a top-level browser navigation (can't set a header).
    const login = p.match(/^\/api\/(zoom|google)\/login$/);
    if (login) {
      const prov = login[1], c = CFG[prov];
      const email = emailFromReq(req, url);
      if (!email) return send(res, 401, "Sign in to Vantage first, then connect your account.");
      if (!c.id || !c.secret) return send(res, 400, `${prov} is not configured — set ${prov.toUpperCase()}_CLIENT_ID / _SECRET in .env`);
      const state = crypto.randomBytes(16).toString("hex");
      pendingState.set(state, { prov, email }); // remember WHO is connecting, for the callback
      const q = { response_type: "code", client_id: c.id, redirect_uri: c.redirect, state };
      if (c.scope) { q.scope = c.scope; q.access_type = "offline"; q.prompt = "consent"; } // google: get a refresh_token
      return send(res, 302, "", { Location: `${c.authUrl}?${form(q)}` });
    }

    // OAuth callback: exchange the code, store tokens UNDER THE CONNECTING USER, bounce back to the app
    const cb = p.match(/^\/api\/(zoom|google)\/callback$/);
    if (cb) {
      const prov = cb[1];
      const code = url.searchParams.get("code"), state = url.searchParams.get("state");
      if (url.searchParams.get("error")) return send(res, 400, `Authorization denied: ${url.searchParams.get("error")}`);
      const pend = pendingState.get(state);
      if (!code || !pend || pend.prov !== prov) return send(res, 400, "Invalid OAuth state — try connecting again.");
      pendingState.delete(state);
      const j = await fetchToken(prov, { grant_type: "authorization_code", code, redirect_uri: CFG[prov].redirect });
      storeToken(pend.email, prov, j);
      return send(res, 302, "", { Location: `${APP_ORIGIN}/?connected=${prov}` });
    }

    // disconnect: forget this user's stored tokens for a provider
    const off = p.match(/^\/api\/(zoom|google)\/disconnect$/);
    if (off && req.method === "POST") {
      const email = emailFromReq(req, url);
      if (email && TOKENS[email]) { delete TOKENS[email][off[1]]; writeJSON(TOKENS_FILE, TOKENS); }
      return send(res, 200, { ok: true });
    }

    // upcoming Google Calendar events for the calling user: GET /api/google/events?max=10
    if (p === "/api/google/events" && req.method === "GET") {
      const email = emailFromReq(req, url);
      if (!email) return send(res, 401, { error: "Not signed in." });
      return send(res, 200, { events: await listGoogleEvents(email, Number(url.searchParams.get("max") || 10)) });
    }

    // create a meeting on the calling user's account: POST /api/:provider/meeting { topic }
    const mk = p.match(/^\/api\/(zoom|google)\/meeting$/);
    if (mk && req.method === "POST") {
      const email = emailFromReq(req, url);
      if (!email) return send(res, 401, { error: "Sign in to create meetings." });
      const { topic } = await readBody(req);
      const out = mk[1] === "zoom" ? await createZoom(email, topic) : await createGoogle(email, topic);
      return send(res, 200, out);
    }

    return send(res, 404, { error: "not found" });
  } catch (e) {
    return send(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, () => {
  const on = (k) => (CFG[k].id && CFG[k].secret) ? "configured" : "NOT configured (.env)";
  console.log(`Vantage backend → ${PUBLIC_ORIGIN}`);
  console.log(`  auth: on · billing: ${STRIPE.secret ? "configured" : "simulated (no STRIPE_SECRET_KEY)"}`);
  console.log(`  zoom: ${on("zoom")} · google: ${on("google")}`);
  console.log(`  redirect URIs to register: ${CFG.zoom.redirect} , ${CFG.google.redirect}`);
});
