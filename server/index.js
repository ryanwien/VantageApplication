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
//   STRIPE_PRICE_EXPLORER, STRIPE_PRICE_PRO,
//   STRIPE_PRICE_DESK                            — Stripe Price IDs; every plan is paid
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
import { INSTITUTIONS, institutionById, matchInstitution, normalizePlaidHoldings } from "../src/brokers/brokers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || `http://localhost:${PORT}`;
const APP_ORIGIN = process.env.APP_ORIGIN || "http://127.0.0.1:5173";
const DATAHUB_GMS_URL = (process.env.DATAHUB_GMS_URL || "http://localhost:8080").replace(/\/+$/, "");
const DATAHUB_TOKEN = process.env.DATAHUB_TOKEN || "";
// One name for one key. This was read as FINNHUB_KEY here and FINNHUB_API_KEY
// for the scheduled briefs, so setting the documented name silently left the
// news route disabled. FINNHUB_API_KEY is canonical; the old name still works.
const FINNHUB_KEY = process.env.FINNHUB_API_KEY || process.env.FINNHUB_KEY || "";
// The desk's model key. It lives here and only here: anything shipped to the
// browser is readable by anyone who opens devtools, so a key in the client is a
// published key. Clients call POST /api/ai/chat instead and never see it.
const OPENROUTER = {
  key: process.env.OPENROUTER_API_KEY || "",
  model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
};
// Server-held YouTube Data key. Same reasoning as the model key: a key in the
// browser is a published key, and an unrestricted Google key is worth real money.
const YOUTUBE_KEY = process.env.YOUTUBE_API_KEY || "";
// Same reasoning for the rest of the paid surface: a key the browser can read
// is a key anyone can spend.
const TMDB_KEY = process.env.TMDB_API_KEY || "";
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY || "";
// The desk's ambient playlist. Unlike the keys above this is public — a share
// link — but it is still server-held, because picking the room's music is the
// operator's call, not a field every listener has to fill in.
const SPOTIFY_PLAYLIST = process.env.SPOTIFY_PLAYLIST || "https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn";
// Anonymous callers get a spend guard instead of an account quota.
const ANON_AI_PER_HOUR = Number(process.env.ANON_AI_PER_HOUR || 6);
const ANON_YT_PER_HOUR = Number(process.env.ANON_YT_PER_HOUR || 20);
const ANON_QUOTE_PER_HOUR = Number(process.env.ANON_QUOTE_PER_HOUR || 1000);  // a watchlist tick is one call
const ANON_TTS_PER_HOUR = Number(process.env.ANON_TTS_PER_HOUR || 30);   // speech is billed per character
// X-Forwarded-For is caller-controlled unless something we run sets it, and a
// spoofable IP makes a per-IP limit decorative. Only honoured when declared.
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
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
//
// THREE prices, not two. Explorer used to be $0/forever and needed no Stripe
// price at all; it is $12/mo now, so a checkout for it has to be able to find
// one. The key stays "free" because that is the id every stored account is
// already written under (see PLANS in React.jsx); the env var is named for the
// plan a human would recognise.
const STRIPE = {
  secret: process.env.STRIPE_SECRET_KEY,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  prices: { free: process.env.STRIPE_PRICE_EXPLORER, pro: process.env.STRIPE_PRICE_PRO, desk: process.env.STRIPE_PRICE_DESK },
};
// Every plan starts with the same seven days. Kept in step with TRIAL_DAYS in
// React.jsx by hand — the front end draws the countdown, Stripe does the
// charging, and the two have to name the same number of days.
const TRIAL_DAYS = 7;

const VERTEX = {
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
  serviceAccount: process.env.GCP_SERVICE_ACCOUNT_EMAIL,
  privateKey: process.env.GCP_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  model: process.env.VERTEX_GEMINI_MODEL || "gemini-3.6-flash",
};
const MARKET = { finnhubKey: FINNHUB_KEY, cronSecret: process.env.AGENT_CRON_SECRET };

// ---- brokerage links (Robinhood / Schwab / Morgan Stanley) ----
//
// None of the three can be read directly. Robinhood publishes no third-party
// API at all; Morgan Stanley publishes no retail one; Schwab's Trader API
// exists but its apps are approved by hand. Plaid is the one aggregator that
// lists all three, so it is the single real path wired here — and it is
// OPTIONAL like everything else in this file: with no client id the browser
// falls back to a clearly-labelled demo book (src/brokers/brokers.js) that
// needs no server at all.
//
// PLAID_ENV is sandbox | production. There is no separate "development" tier
// any more, and sandbox is the right default: it costs nothing and returns a
// fixture book, which is what a first run should get.
const PLAID = {
  clientId: process.env.PLAID_CLIENT_ID || "",
  secret: process.env.PLAID_SECRET || "",
  env: (process.env.PLAID_ENV || "sandbox").toLowerCase(),
};
const plaidConfigured = () => !!(PLAID.clientId && PLAID.secret);
const plaidBase = () => `https://${PLAID.env === "production" ? "production" : "sandbox"}.plaid.com`;
// NOT pre-selecting the institution on /link/token/create is deliberate. Plaid's
// institution ids are per-environment strings, and sandbox serves its own
// fixture bank rather than the real three — so pinning one would work in
// production and silently fail in sandbox. Link's own picker is shown instead,
// and which institution was chosen is read back from what Link hands the
// browser on success (see /api/brokers/exchange).

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
const USERS_FILE = path.join(__dirname, "users.json");        // { [email]: { email,name,plan,salt,hash,agreedAt,legalVersion,createdAt,subscription? } }
const SESSIONS_FILE = path.join(__dirname, "sessions.json");  // { [token]: { email, createdAt } }
const AI_USAGE_FILE = path.join(__dirname, "ai-usage.json");
const TOKENS_FILE = path.join(__dirname, "tokens.json");      // { [email]: { zoom:{...}, google:{...} } }  ← per-user OAuth tokens
const BROKERS_FILE = path.join(__dirname, "brokers.json");    // { [email]: { connections: [...] } }  ← per-user brokerage links + aggregator access tokens
const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return {}; } };
const writeJSON = (f, o) => { try { fs.writeFileSync(f, JSON.stringify(o, null, 2)); } catch (e) { console.error(`save failed (${path.basename(f)}):`, e.message); } };
let USERS = readJSON(USERS_FILE);
let SESSIONS = readJSON(SESSIONS_FILE);
let AI_USAGE = readJSON(AI_USAGE_FILE);
let TOKENS = readJSON(TOKENS_FILE);
let BROKERS = readJSON(BROKERS_FILE);
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

// ---- the studio voice, metered in the unit it is billed in ----
//
// ElevenLabs charges per CHARACTER, so a per-call allowance is the right
// number in the wrong unit: 250 runs at the 5,000-character cap is 1.25M
// characters. This counts what the invoice counts.
//
// Kept in AI_USAGE beside the model runs — same file, same write path, one
// place to look when a bill is bigger than expected.
const TTS_DAILY_CHARS = Number(process.env.TTS_DAILY_CHARS || 40000);
const ttsBudget = (email) => {
  const used = AI_USAGE[email]?.ttsChars?.[todayKey()] || 0;
  return { used, limit: TTS_DAILY_CHARS, left: Math.max(0, TTS_DAILY_CHARS - used) };
};
// Charged only after the provider actually produced audio. A 502 from
// ElevenLabs is our problem, and it must not eat somebody's day.
function recordTts(email, chars) {
  const u = AI_USAGE[email] || (AI_USAGE[email] = { days: {}, runs: [] });
  const t = u.ttsChars || (u.ttsChars = {});
  const day = todayKey();
  t[day] = (t[day] || 0) + chars;
  // Yesterday's counts are of no interest and this file is read on every boot.
  for (const k of Object.keys(t)) if (k < day) delete t[k];
  writeJSON(AI_USAGE_FILE, AI_USAGE);
  return t[day];
}
function canUseAi(email) { const used = AI_USAGE[email]?.days?.[todayKey()] || 0, limit = planQuota(USERS[email]?.plan || "free"); return { used, limit, allowed: used < limit }; }
function recordAiRun(email, promptChars, outcome, meta = {}, charge = true) {
  const user = AI_USAGE[email] || (AI_USAGE[email] = { days: {}, runs: [] }), day = todayKey();
  // A failure that is OUR fault (bad server key, provider down) must not eat
  // the caller's daily allowance — log it, but only charge for real work.
  if (charge) user.days[day] = (user.days[day] || 0) + 1;
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
//  BROKERAGE LINKS — read a real book of holdings into the desk
// ============================================================
// The aggregator's access token is the whole reason this lives on the server:
// it is a bearer credential for somebody's brokerage account, so it is written
// to a gitignored file here and NEVER appears in a response. `publicConnection`
// is the only shape a browser is allowed to see, and every route returns
// through it.
//
// The demo book is deliberately NOT served from here. It is generated in the
// browser from src/brokers/brokers.js, because the standing rule of this app is
// that the backend is optional — a demo link has to work with no server at all.
// So this file owns exactly one thing: the real path.
const saveBrokers = () => writeJSON(BROKERS_FILE, BROKERS);
const brokerRecord = (email) => (BROKERS[email] ||= { connections: [] });
const publicConnection = (c) => ({
  id: c.id,
  provider: c.provider,
  institutionId: c.institutionId,
  institutionName: c.institutionName,
  demo: false,
  connectedAt: c.connectedAt,
  refreshedAt: c.refreshedAt || null,
  accounts: c.accounts || [],
  // Present and honest: a link whose last refresh failed still lists its last
  // known accounts, with the reason attached, rather than silently going stale.
  staleReason: c.staleReason || null,
});

async function plaidCall(endpoint, body) {
  if (!plaidConfigured()) throw new Error("Brokerage links are not configured on this server (set PLAID_CLIENT_ID / PLAID_SECRET).");
  const r = await fetch(`${plaidBase()}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: PLAID.clientId, secret: PLAID.secret, ...body }),
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => ({}));
  // Plaid answers a failure with a typed body. error_message is written for a
  // person; display_message is written for an end user when one exists.
  if (!r.ok) throw new Error(j.display_message || j.error_message || `Plaid returned HTTP ${r.status}.`);
  return j;
}

// Pull the current book for one stored connection and write it back onto the
// record. Never throws: a provider outage must leave the last known holdings on
// screen with a reason, not blank the panel.
async function refreshConnection(conn) {
  try {
    const holdings = await plaidCall("/investments/holdings/get", { access_token: conn.accessToken });
    const shaped = normalizePlaidHoldings(holdings, {
      institutionId: conn.institutionId,
      institutionName: conn.institutionName,
      connectionId: conn.id,
    });
    conn.accounts = shaped.accounts;
    conn.refreshedAt = Date.now();
    conn.staleReason = null;
  } catch (e) {
    conn.staleReason = String(e.message || e);
  }
  return conn;
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
// Does this account actually have a subscription? Distinct from WHICH plan it
// is on, which is all the record used to carry — and the two questions have
// different answers for the person who converted on day 3 and the one who never
// did. On day 9 those records are otherwise identical.
//
// SUB_DEAD lists Stripe's terminal statuses. Everything else counts as live,
// INCLUDING a record with an id and no status: only the subscription.* events
// carry a status, and an endpoint configured for checkout.session.completed
// alone will store the id without one. Every unknown resolves toward "this
// account has a subscription", because being wrong that way leaves a lapsed
// trialist on a simulated desk, and being wrong the other way locks out
// somebody who paid.
//
// ⚠ If no webhook is configured at all, the server never learns that anyone
// subscribed. That is a deployment gap this file cannot close from here — see
// the warning above stripeCheckout.
const SUB_DEAD = new Set(["canceled", "unpaid", "incomplete_expired"]);
const hasSubscription = (u) => !!u?.subscription?.id && !SUB_DEAD.has(u.subscription.status);

// the safe public view of an account (never the salt/hash)
// createdAt is here because the front end draws the trial countdown from it —
// a countdown needs a start date, and this is the one the server already
// stamps. legalVersion so the account pane can name the terms this user
// actually accepted rather than the ones the build currently ships.
// `subscribed` is a boolean on purpose: the browser needs to know whether the
// trial screen applies, and nothing else about the Stripe object is its business.
const accountView = (email) => { const u = USERS[email]; return u ? { email: u.email, name: u.name, plan: u.plan, createdAt: u.createdAt ?? null, agreedAt: u.agreedAt ?? null, legalVersion: u.legalVersion ?? null, subscribed: hasSubscription(u) } : null; };

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
// How many of the seven days this account has left. The front end counts down
// from the same stamp, so Stripe has to be told the REMAINDER — a flat
// TRIAL_DAYS here would hand somebody who signed up on Monday and added a card
// on Thursday a fresh week, and the "3 days left" they were looking at when
// they clicked would have been wrong the moment they clicked it.
//
// An account with no createdAt predates the stamp: it was made while Explorer
// was free. The front end draws no countdown for those, so there is no number
// to keep in step with, and they get the whole trial. That is a gift rather
// than a claim, which is the safe direction to be wrong in.
function trialDaysLeft(email) {
  const start = USERS[email]?.createdAt;
  if (!Number.isFinite(start)) return TRIAL_DAYS;
  const left = Math.ceil((start + TRIAL_DAYS * 86400000 - Date.now()) / 86400000);
  return Math.min(TRIAL_DAYS, Math.max(0, left));
}

async function stripeCheckout(email, plan) {
  const price = STRIPE.prices[plan];
  if (!price) throw new Error(`no Stripe price configured for "${plan}"`);
  const daysLeft = trialDaysLeft(email);
  const params = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    success_url: `${APP_ORIGIN}/?checkout=success&plan=${encodeURIComponent(plan)}`,
    cancel_url: `${APP_ORIGIN}/?checkout=cancel`,
    client_reference_id: email || "",
    "metadata[plan]": plan,
    "metadata[email]": email || "",
    // The trial, made real. The front end counts the days down and the front
    // door promises no charge until day 8; this is the parameter that keeps
    // that promise. Without it Stripe bills immediately and the countdown
    // becomes decoration on top of a charge that already happened.
    //
    // Omitted entirely once the days are gone. Stripe's minimum is one day, so
    // there is no way to say "the trial is over" in this field — and passing 1
    // to keep the shape would give a lapsed account another free day. No field
    // means the first invoice is due now, which is what an expired trial means.
    ...(daysLeft > 0 ? { "subscription_data[trial_period_days]": String(daysLeft) } : {}),
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

// ---- rate limiting ----
// Fixed windows keyed by IP, held in memory on purpose: this is a spend guard,
// not a security boundary, so a restart clearing the counters is acceptable and
// it keeps the backend dependency-free.
const RATE_BUCKETS = new Map();
// ---- one answer cache for every upstream route ----
//
// Intraday history has been cached here for a while; everything else went
// upstream on every single call. A ten-symbol watchlist ticking every 15
// seconds is 2,400 quote calls an hour from ONE browser, and every one of them
// asked a question that had been answered seconds earlier.
//
// The TTLs are per route because the questions age differently. A quote is
// stale in seconds; a symbol search returns the same answer next week.
//
// The single-flight half matters more than the caching half. Ten symbols
// requested at once used to be ten upstream calls even when eight of them were
// already in the air — the second caller now joins the first one's promise
// rather than starting its own.
const TTL = {
  quote: 10 * 1000,          // a quote at most ten seconds old; the client polls at 15
  candle: 5 * 60 * 1000,     // well inside a 5-minute candle's own resolution
  news: 5 * 60 * 1000,
  earnings: 30 * 60 * 1000,  // a calendar of scheduled dates
  search: 6 * 60 * 60 * 1000, // "what ticker is Coca-Cola" does not change
};
const answerCache = new Map();

async function cached(key, ttlMs, produce) {
  const hit = answerCache.get(key);
  if (hit) {
    if (hit.pending) return hit.pending;                        // in flight — join it
    if (Date.now() - hit.at < ttlMs) return hit.body;
  }
  // A rejection is NOT cached: a failed call must not poison the key until its
  // TTL expires, or one blip becomes ten minutes of an error nobody can retry.
  const pending = produce().then(
    (body) => { answerCache.set(key, { at: Date.now(), body }); return body; },
    (e) => { answerCache.delete(key); throw e; },
  );
  answerCache.set(key, { pending, at: Date.now() });
  // Opportunistic sweep, same bound as the rate buckets: this holds answers,
  // not sessions, so dropping the oldest half costs one repeated upstream call.
  if (answerCache.size > 2000) {
    const stale = [...answerCache.entries()].filter(([, v]) => !v.pending).sort((a, b) => a[1].at - b[1].at);
    for (const [k] of stale.slice(0, 1000)) answerCache.delete(k);
  }
  return pending;
}

// ---- a provider that is failing should sit out, not be re-tried every call ----
//
// With an 8-second timeout, a dead Finnhub turns a ten-symbol watchlist tick
// into eighty seconds of waiting before the fallback is even reached. Three
// consecutive failures and it sits out a minute; any success clears the count.
// Only PROVIDER failures count — a symbol the provider does not know is a
// correct answer to a bad question, and says nothing about its health.
const BREAKER_TRIPS = 3;
const BREAKER_REST_MS = Number(process.env.BREAKER_REST_MS || 60 * 1000);
const breakers = new Map();
// Is this provider sitting out right now? A pure question, safe to ask from
// anywhere — /api/status asks it to report.
const breakerResting = (name) => {
  const b = breakers.get(name);
  return !!b && b.fails >= BREAKER_TRIPS && Date.now() - b.at < BREAKER_REST_MS;
};

// May I call this provider? NOT a question — asking it claims the single probe
// the rest window allows, so only the request path may ask.
//
// These two were one function, and /api/status called it. Reporting the
// breaker consumed the probe, so no request ever made one, `probing` stayed
// set and the provider could never come back: a status board that broke the
// thing it was describing. Measured as fails stuck at 8 and resting stuck true
// while every quote silently came from the fallback.
//
// The probe itself is the other half. Without it the first watchlist tick
// after the window opened sent all eight symbols at a provider that was still
// down — eight timeouts to learn one fact. One goes; the rest keep skipping
// until breakerNote() either clears the breaker or restarts its window.
const breakerAllows = (name) => {
  const b = breakers.get(name);
  if (!b || b.fails < BREAKER_TRIPS) return true;
  if (Date.now() - b.at < BREAKER_REST_MS) return false;
  if (b.probing) return false;
  b.probing = true;
  return true;
};
const breakerNote = (name, ok) => {
  if (ok) return void breakers.delete(name);
  const b = breakers.get(name) || { fails: 0 };
  breakers.set(name, { fails: b.fails + 1, at: Date.now() });
};

// TMDB's genre table, by kind. Two entries at most, and no TTL: the list of
// film genres is not a thing that changes while a process is up.
const genreCache = new Map();

// ---- quotes, from either of two providers ----
//
// Finnhub was the single point of failure for the whole live surface: quotes,
// search, earnings, news. If it went down or repriced, live mode went with it.
//
// The second provider needs no new key and no new vendor, because it is
// already in this file. Finnhub's free tier answers 403 on /stock/candle, so
// /api/candles has been proxying Yahoo's chart endpoint for a while — and that
// same response carries a full quote in its `meta`. Verified against AAPL:
// regularMarketPrice, chartPreviousClose, regularMarketDayHigh/Low and
// regularMarketTime are all there. Open is the one field it does not carry, and
// the candles in the same payload have it — first non-null open of the session.
//
// Both are normalized to Finnhub's quote shape, because that is what the
// browser already parses.
const shapeQuote = (o, src) => ({ c: o.c, d: o.d, dp: o.dp, o: o.o, h: o.h, l: o.l, pc: o.pc, t: o.t, src });

// Distinguishes the two failures that must never be confused: "unknown" is a
// correct answer about a bad symbol, "down" is this provider being unusable.
// Only the second one trips a breaker or justifies asking anyone else.
const QUOTE_UNKNOWN = { unknown: true };

async function finnhubQuote(sym) {
  if (!FINNHUB_KEY) throw new Error("unconfigured");
  const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${FINNHUB_KEY}`,
    { signal: AbortSignal.timeout(8000) });
  if (r.status === 401 || r.status === 403) throw new Error("key");
  if (!r.ok) throw new Error(`http_${r.status}`);
  const j = await r.json();
  // Finnhub answers 200 with all-zero fields for a symbol it does not know.
  if (!j || typeof j.c !== "number" || j.c === 0) return QUOTE_UNKNOWN;
  return shapeQuote(j, "finnhub");
}

async function yahooQuote(sym) {
  // Yahoo spells a class share BRK-B where Finnhub spells it BRK.B.
  const y = sym.replace(/\./g, "-");
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?interval=5m&range=1d`, {
    // Without a browser UA this endpoint returns 429 to some hosts.
    headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" },
    signal: AbortSignal.timeout(8000),
  });
  if (r.status === 404) return QUOTE_UNKNOWN;   // verified: ZZZZQQ → 404 "Not Found"
  if (!r.ok) throw new Error(`http_${r.status}`);
  const j = await r.json();
  const meta = j?.chart?.result?.[0]?.meta;
  const c = meta?.regularMarketPrice, pc = meta?.chartPreviousClose ?? meta?.previousClose;
  if (typeof c !== "number" || typeof pc !== "number") return QUOTE_UNKNOWN;
  const opens = j.chart.result[0]?.indicators?.quote?.[0]?.open || [];
  return shapeQuote({
    c, pc,
    d: c - pc,
    dp: pc ? ((c - pc) / pc) * 100 : 0,
    o: opens.find(v => typeof v === "number") ?? null,
    h: meta.regularMarketDayHigh ?? null,
    l: meta.regularMarketDayLow ?? null,
    t: meta.regularMarketTime ?? null,
  }, "yahoo");
}

// Ask each provider in turn, skipping any that is currently sitting out.
//
// "unknown" from the first provider still asks the second — the two do not
// list identical universes, and a second opinion on one symbol is cheap once
// it is cached. Only when EVERY provider says unknown is a symbol unknown.
const QUOTE_PROVIDERS = [["finnhub", finnhubQuote], ["yahoo", yahooQuote]];

async function quoteOne(sym) {
  let sawUnknown = false, lastErr = null;
  for (const [name, get] of QUOTE_PROVIDERS) {
    if (!breakerAllows(name)) continue;
    try {
      const q = await get(sym);
      breakerNote(name, true);
      if (q === QUOTE_UNKNOWN) { sawUnknown = true; continue; }
      return q;
    } catch (e) {
      // "unconfigured" is a deployment choice, not a fault: no key was ever
      // set, so there is nothing here to be failing and nothing to trip.
      if (e.message !== "unconfigured") breakerNote(name, false);
      lastErr = e.message;
    }
  }
  return { error: sawUnknown ? "unknown" : (lastErr || "unreachable") };
}

function rateLimit(key, limit, windowMs) {
  const now = Date.now(), slot = Math.floor(now / windowMs), id = `${key}:${slot}`;
  const hits = (RATE_BUCKETS.get(id) || 0) + 1;
  RATE_BUCKETS.set(id, hits);
  // Opportunistic sweep so a long-lived process cannot grow the map forever.
  if (RATE_BUCKETS.size > 5000) for (const k of RATE_BUCKETS.keys()) if (!k.endsWith(`:${slot}`)) RATE_BUCKETS.delete(k);
  return { ok: hits <= limit, hits, limit, resetMs: (slot + 1) * windowMs - now };
}
// videos.list for a batch of ids: 1 quota unit total, whatever the batch size.
// Returns the four fields the Video desk cannot work without, and {} on any
// failure — a desk with no chapter strip is a worse desk, but a desk that 502s
// because an enrichment call timed out is no desk at all.
async function ytDetails(ids) {
  if (!ids.length || !YOUTUBE_KEY) return {};
  const api = new URL("https://www.googleapis.com/youtube/v3/videos");
  api.search = new URLSearchParams({ part: "snippet,contentDetails,statistics", id: ids.join(","), key: YOUTUBE_KEY });
  let r;
  try { r = await fetch(api, { signal: AbortSignal.timeout(8000) }); } catch { return {}; }
  if (!r.ok) return {};
  let data;
  try { data = await r.json(); } catch { return {}; }
  const out = {};
  for (const it of data.items || []) {
    out[it.id] = {
      description: it.snippet?.description || "",
      publishedAt: it.snippet?.publishedAt || null,
      duration: it.contentDetails?.duration || null,
      views: Number(it.statistics?.viewCount) || null,
    };
  }
  return out;
}
const clientIp = (req) =>
  (TRUST_PROXY ? String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() : "") ||
  req.socket?.remoteAddress || "unknown";

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
        // Two questions, recorded separately: which plan, and whether a
        // subscription exists at all. Only the first was ever asked here, which
        // is why hasSubscription() needed something new to read.
        //
        // checkout.session.completed carries the subscription id but not its
        // status; the subscription.* events carry the status. Each writes what
        // it actually knows and leaves the rest of the record alone.
        const sub = USERS[email].subscription || {};
        if (event.type === "checkout.session.completed") {
          const plan = planFromStripeObject(obj); if (plan) USERS[email].plan = plan;
          if (obj.subscription) USERS[email].subscription = { ...sub, id: String(obj.subscription), updatedAt: Date.now() };
        } else if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
          // .created was not listened for at all, so a subscription that was
          // never subsequently updated left the plan unset.
          const plan = planFromStripeObject(obj); if (plan) USERS[email].plan = plan;
          USERS[email].subscription = { id: obj.id || sub.id || null, status: obj.status || sub.status || null, updatedAt: Date.now() };
        // A cancelled subscription drops back to the entry id. That id is no
        // longer a free tier, so this looks like it hands out $12 of Explorer —
        // but Explorer's perks (demo data, watchlist, portfolio, games, the
        // browser's own voice) are all client-side and the server has never
        // enforced one of them. What this line actually grants is the anonymous
        // AI allowance, which planQuota gives an unknown plan anyway. The
        // browser now shows a lapsed account the day-8 screen instead of the
        // desk, and it does that off `subscribed` — which this line is what
        // turns off.
        } else if (event.type === "customer.subscription.deleted") {
          USERS[email].plan = "free";
          USERS[email].subscription = { id: obj.id || sub.id || null, status: "canceled", updatedAt: Date.now() };
        }
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
      // With Stripe live, the plan a signup asks for is a REQUEST, not a grant.
      // /api/auth/plan already refuses client-set plans for exactly this reason,
      // and this route was the way around it: POST a signup with plan:"desk" and
      // the $39 tier was yours, no checkout involved. New accounts start on the
      // entry plan and a verified webhook moves them. Without Stripe the whole
      // flow is a labelled simulation, so the picked plan is honoured.
      USERS[em] = { email: em, name: String(name || "").trim() || em.split("@")[0], plan: STRIPE.secret ? "free" : (plan || "free"), salt, hash, agreedAt: Date.now(), legalVersion: legalVersion || null, createdAt: Date.now() };
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

    // ---- NEWS (REST: Finnhub company-news proxied through the server's own key,
    //      so clients get real headlines without each needing a personal key) ----
    // ---- QUOTES (server-held Finnhub key) ----
    // The highest-volume call in the app, and the one that leaked worst: the
    // browser put the key in a URL query string, where it shows up in devtools
    // and in any proxy or server log the request passes through.
    //
    // Accepts a comma-separated list so a watchlist refresh is one request
    // rather than one per symbol — the old client fanned out N calls a tick.
    if (p === "/api/quote" && req.method === "GET") {
      // No longer gated on FINNHUB_KEY. The Yahoo fallback needs no key, so a
      // server with no Finnhub key at all can still answer this — which is the
      // whole point of having a second provider. It 503s only when every
      // provider is unusable, which is checked after the calls rather than
      // guessed from configuration.
      const rl = rateLimit(`q:${clientIp(req)}`, ANON_QUOTE_PER_HOUR, 3600000);
      if (!rl.ok) return send(res, 429,
        { error: `Rate limit reached (${rl.limit} per hour).`, retryInSec: Math.ceil(rl.resetMs / 1000) },
        { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) });

      const syms = String(url.searchParams.get("symbols") || url.searchParams.get("symbol") || "")
        .split(",").map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 25);
      if (!syms.length) return send(res, 400, { error: "Pass ?symbols=AAPL,MSFT." });
      const bad = syms.find(s => !/^[A-Z.-]{1,10}$/.test(s));
      if (bad) return send(res, 400, { error: `Not a symbol: ${bad}` });

      const pairs = await Promise.all(syms.map(async (sym) =>
        [sym, await cached(`q:${sym}`, TTL.quote, () => quoteOne(sym))]));
      const quotes = Object.fromEntries(pairs);

      // Which provider actually answered. The client can ignore it, but a
      // failover nobody is told about is the failure mode this was built to
      // avoid: prices that quietly come from somewhere else are worse than
      // prices that stop, because nothing on screen changes.
      const answered = pairs.filter(([, v]) => v.src);
      const via = [...new Set(answered.map(([, v]) => v.src))];
      if (!answered.length && pairs.some(([, v]) => v.error && v.error !== "unknown")) {
        return send(res, 502, { error: "No market-data provider is answering right now.", tried: QUOTE_PROVIDERS.map(([n]) => n) });
      }
      return send(res, 200, {
        quotes, via,
        // True when the primary is out and something else is carrying the tape.
        degraded: via.length > 0 && !via.includes(QUOTE_PROVIDERS[0][0]),
      });
    }

    // ---- INTRADAY CANDLES ----
    // The live chart could only ever draw what it had polled since page load,
    // so a minute after opening it was a flat line across a squashed axis.
    // Finnhub cannot fix that: /stock/candle answers 403 "You don't have
    // access to this resource" on the free tier, verified against this
    // server's own key. Yahoo's chart endpoint answers the same question for
    // nothing and without a key, so that is what this proxies.
    //
    // It is an UNDOCUMENTED endpoint. It can change shape or start refusing us
    // at any time, so every failure here is soft: the client falls back to the
    // poll-only tape it used to have, and the chart still works.
    if (p === "/api/candles" && req.method === "GET") {
      const rl = rateLimit(`cd:${clientIp(req)}`, ANON_QUOTE_PER_HOUR, 3600000);
      if (!rl.ok) return send(res, 429,
        { error: `Rate limit reached (${rl.limit} per hour).`, retryInSec: Math.ceil(rl.resetMs / 1000) },
        { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) });

      const symbol = String(url.searchParams.get("symbol") || "").trim().toUpperCase();
      if (!/^[A-Z.-]{1,10}$/.test(symbol)) return send(res, 400, { error: "Pass ?symbol=TICKER." });
      // Two shapes only, both allow-listed — never interpolate a caller's
      // string into the upstream URL.
      const spans = {
        "1d": { range: "1d", interval: "5m" },
        "5d": { range: "5d", interval: "15m" },
      };
      const span = spans[String(url.searchParams.get("span") || "1d")] || spans["1d"];

      // On the shared cache now, for the sweep and the single flight. Its own
      // Map had neither: every symbol/span ever asked for stayed in it for the
      // life of the process, and two clients opening the same chart at the same
      // moment both went upstream.
      let body;
      try {
        body = await cached(`candle:${symbol}:${span.range}`, TTL.candle, async () => {
          // Yahoo spells a class share BRK-B where the rest of this app spells
          // it BRK.B — the same translation the quote path makes. Without it
          // every class share charted as a 404.
          const y = symbol.replace(/\./g, "-");
          let r;
          try {
            r = await fetch(
              `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?interval=${span.interval}&range=${span.range}`,
              {
                // Without a browser UA this endpoint returns 429 to some hosts.
                headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" },
                signal: AbortSignal.timeout(8000),
              });
          } catch { throw Object.assign(new Error("x"), { code: 502, msg: "Could not reach the history feed." }); }
          if (!r.ok) throw Object.assign(new Error("x"), { code: 502, msg: `History feed HTTP ${r.status}` });

          let j;
          try { j = await r.json(); } catch { throw Object.assign(new Error("x"), { code: 502, msg: "History feed sent something unreadable." }); }
          const result = j?.chart?.result?.[0];
          const stamps = result?.timestamp;
          const closes = result?.indicators?.quote?.[0]?.close;
          const none = () => Object.assign(new Error("x"), { code: 404, msg: `No history for ${symbol}.` });
          if (!Array.isArray(stamps) || !Array.isArray(closes)) throw none();

          // Yahoo pads the session with nulls for minutes that never traded. Drop
          // them rather than plotting gaps or, worse, zeroes.
          const points = [];
          for (let i = 0; i < stamps.length; i++) {
            const c = closes[i];
            if (typeof c !== "number" || !Number.isFinite(c)) continue;
            points.push({ t: stamps[i], c: +c.toFixed(4) });
          }
          if (!points.length) throw none();

          return {
            symbol,
            span: span.range,
            points,
            prevClose: typeof result?.meta?.chartPreviousClose === "number" ? result.meta.chartPreviousClose : null,
            tz: result?.meta?.exchangeTimezoneName || "America/New_York",
            gmtoffset: typeof result?.meta?.gmtoffset === "number" ? result.meta.gmtoffset : 0,
          };
        });
      } catch (e) { return send(res, e.code || 502, { error: e.msg || "History feed failed." }); }
      return send(res, 200, body);
    }

    // ---- GEMINI (server-held key) ----
    // Google's own streaming shape, passed straight through, so the browser's
    // SSE parser is unchanged. Not folded into /api/ai/chat: that one speaks
    // OpenAI-over-OpenRouter, and Gemini's request and response differ.
    if (p === "/api/ai/gemini" && req.method === "POST") {
      if (!GEMINI_KEY) return send(res, 503, { error: "Gemini is not configured on this server (set GEMINI_API_KEY)." });
      const email = emailFromReq(req, url);
      if (email) {
        const quota = canUseAi(email);
        if (!quota.allowed) return send(res, 429, { error: `Daily AI limit reached (${quota.used}/${quota.limit}).`, ...quota });
      } else {
        const rl = rateLimit(`ai:${clientIp(req)}`, ANON_AI_PER_HOUR, 3600000);
        if (!rl.ok) return send(res, 429, { error: `Rate limit reached (${rl.limit} per hour). Sign in for a higher allowance.` },
          { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) });
      }
      const { model, contents } = await readBody(req);
      if (!Array.isArray(contents) || !contents.length) return send(res, 400, { error: "Pass { model, contents }." });
      const useModel = String(model || "gemini-3.6-flash");
      if (!/^[A-Za-z0-9.-]{1,60}$/.test(useModel)) return send(res, 400, { error: "Bad model id." });
      const promptChars = JSON.stringify(contents).length;

      let up;
      try {
        up = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${useModel}:streamGenerateContent?alt=sse&key=${encodeURIComponent(GEMINI_KEY)}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents }) });
      } catch {
        if (email) recordAiRun(email, promptChars, "error", { agent: "gemini", reason: "unreachable" }, false);
        return send(res, 502, { error: "Could not reach Gemini." });
      }
      if (!up.ok) {
        let detail = ""; try { detail = (await up.json())?.error?.message || ""; } catch { /* no body */ }
        if (email) recordAiRun(email, promptChars, "error", { agent: "gemini", status: up.status }, false);
        const ours = up.status === 401 || up.status === 403 || /api key/i.test(detail);
        return send(res, ours ? 502 : up.status, { error: ours ? "The server's Gemini key was rejected." : (detail || `Gemini HTTP ${up.status}`) });
      }
      if (email) recordAiRun(email, promptChars, "ok", { agent: "gemini", model: useModel });
      res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive", "X-Accel-Buffering": "no", "Access-Control-Allow-Origin": APP_ORIGIN });
      const rd = up.body.getReader();
      req.on("close", () => { rd.cancel().catch(() => {}); });
      try { for (;;) { const { value, done } = await rd.read(); if (done) break; res.write(Buffer.from(value)); } } catch { /* hung up */ }
      return res.end();
    }

    // ---- ELEVENLABS (server-held key) ----
    // Two endpoints: the voice list, and speech. Speech streams MP3 bytes rather
    // than JSON, so it is piped through untouched with the upstream content type.
    // ElevenLabs answers auth failures with 400 and a typed detail, not 401, so the
    // status alone cannot tell our bad key from the caller sending nonsense. Read the
    // detail: anything authentication-shaped is our fault and must not leak upstream wording.
    async function elevenFault(r) {
      let detail = null;
      try { detail = (await r.json())?.detail || null; } catch { /* no body */ }
      const type = String(detail?.type || detail?.status || "");
      const ours = r.status === 401 || /authentication|api_key|invalid_api_key|quota|unusual_activity/i.test(type);
      // A key can be perfectly valid and still refused, because ElevenLabs scopes
      // keys per operation and a new key can be created with none of them on.
      // "Rejected" sends you to make another key, which fails identically; the
      // actual repair is editing this key's permissions. Name the missing one.
      const perm = String(detail?.message || "").match(/missing the permission (\w+)/)?.[1];
      const error = perm
        ? `The server's ElevenLabs key is missing the "${perm}" permission — enable it on the key in the ElevenLabs dashboard.`
        : "The server's ElevenLabs key was rejected.";
      return { ours, type, error };
    }
    if (p === "/api/voices" && req.method === "GET") {
      if (!ELEVEN_KEY) return send(res, 503, { error: "Studio voice is not configured on this server (set ELEVENLABS_API_KEY)." });
      let r;
      try { r = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": ELEVEN_KEY }, signal: AbortSignal.timeout(8000) }); }
      catch { return send(res, 502, { error: "Could not reach ElevenLabs." }); }
      if (!r.ok) {
        const { ours, error } = await elevenFault(r);
        return send(res, ours ? 502 : r.status,
          { error: ours ? error : `ElevenLabs HTTP ${r.status}` });
      }
      return send(res, 200, await r.json());
    }
    // ---- STUDIO VOICE ----
    //
    // This route used to be open. Measured, not guessed: a POST with no
    // account, no token and no plan came back 200 audio/mpeg with 7,150 bytes
    // in it, billed to the server's key. The only guard was an IP rate limit —
    // 30 requests an hour at the 5,000-character cap is 150,000 characters per
    // IP per hour, and IPs are cheap.
    //
    // Every other expensive route asks who is calling; this one did not. It is
    // also the only route whose cost is per character, which makes it the one
    // that could run up a bill overnight with nobody signed in at all.
    //
    // Three gates now, cheapest first: burst, identity, entitlement, budget.
    if (p === "/api/tts" && req.method === "POST") {
      if (!ELEVEN_KEY) return send(res, 503, { error: "Studio voice is not configured on this server (set ELEVENLABS_API_KEY)." });
      // Still first, and still by IP: it costs a Map lookup and it stops an
      // unauthenticated flood before the session table is touched.
      const rl = rateLimit(`tts:${clientIp(req)}`, ANON_TTS_PER_HOUR, 3600000);
      if (!rl.ok) return send(res, 429, { error: `Rate limit reached (${rl.limit} per hour).` }, { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) });

      // The plan gate for this feature lives in the browser, which makes it a
      // convention rather than a control — FEATURE_PLAN.elevenlabs never
      // reached the server. A per-character bill needs an account to charge it
      // to, so identity is required here and nowhere else in the media routes.
      const email = emailFromReq(req, url);
      if (!email) return send(res, 401, { error: "The studio voice needs a signed-in Vantage account." });
      const user = USERS[email];
      if (user?.plan !== "desk") {
        return send(res, 403, { error: "The studio voice is a Trading Floor feature. Every plan can use your browser's own voice." });
      }
      // NOT checked here: hasSubscription(user), and whether the 7-day trial
      // has run out. Both are the correct business rule and both are wrong to
      // enforce today — STRIPE_SECRET_KEY is unset, so no account can hold a
      // subscription and every legitimate user would be locked out on day 8 by
      // a payment route that does not exist yet. Add `&& (hasSubscription(user)
      // || inTrial(user))` to the line above on the day Stripe goes live.

      const { text, voiceId } = await readBody(req);
      const say = String(text || "").slice(0, 5000);   // characters are billed; cap the blast radius
      if (!say.trim()) return send(res, 400, { error: "Pass { text, voiceId }." });
      if (!/^[A-Za-z0-9]{1,40}$/.test(String(voiceId || ""))) return send(res, 400, { error: "Bad voiceId." });

      // Checked BEFORE the upstream call, so the last request of the day is
      // refused rather than served and then billed.
      const budget = ttsBudget(email);
      if (say.length > budget.left) {
        return send(res, 429, {
          error: `Studio voice is out for today (${budget.used} of ${budget.limit} characters used). Your browser's voice still works.`,
          used: budget.used, limit: budget.limit,
        });
      }
      let up;
      try {
        up = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`,
          { method: "POST", headers: { "xi-api-key": ELEVEN_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ text: say, model_id: "eleven_flash_v2_5" }) });
      } catch { return send(res, 502, { error: "Could not reach ElevenLabs." }); }
      if (!up.ok) {
        const { ours, error } = await elevenFault(up);
        return send(res, ours ? 502 : up.status,
          { error: ours ? error : `ElevenLabs HTTP ${up.status}` });
      }
      // Charged here and not earlier: upstream has accepted and is about to
      // stream, so these characters are on the invoice whether or not the
      // client hangs up midway. Everything above this line is free to fail.
      const spent = recordTts(email, say.length);
      res.writeHead(200, { "Content-Type": up.headers.get("content-type") || "audio/mpeg",
        "Cache-Control": "no-store", "Access-Control-Allow-Origin": APP_ORIGIN,
        // So the desk can say how much voice is left without a second round
        // trip, and so an operator can watch it from curl.
        "X-Tts-Chars-Left": String(Math.max(0, TTS_DAILY_CHARS - spent)) });
      const rd = up.body.getReader();
      req.on("close", () => { rd.cancel().catch(() => {}); });
      try { for (;;) { const { value, done } = await rd.read(); if (done) break; res.write(Buffer.from(value)); } } catch { /* hung up */ }
      return res.end();
    }

    // ---- TMDB (server-held key) ----
    // Three fixed endpoints rather than a pass-through path parameter: an
    // arbitrary-path proxy is an SSRF hole and a way to spend the key on
    // whatever the caller fancies. Every input is validated before it is used.
    if (p.startsWith("/api/tmdb/") && req.method === "GET") {
      if (!TMDB_KEY) return send(res, 503, { error: "The streaming catalog is not configured on this server (set TMDB_API_KEY)." });
      const rl = rateLimit(`tmdb:${clientIp(req)}`, ANON_QUOTE_PER_HOUR, 3600000);
      if (!rl.ok) return send(res, 429, { error: `Rate limit reached (${rl.limit} per hour).` }, { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) });

      const kind = String(url.searchParams.get("kind") || "");
      if (kind !== "movie" && kind !== "tv") return send(res, 400, { error: "kind must be movie or tv." });
      const num = (v) => /^[0-9]{1,12}$/.test(String(v || ""));
      const base = "https://api.themoviedb.org/3";
      const key = `api_key=${encodeURIComponent(TMDB_KEY)}&language=en-US`;
      let upstream;
      if (p === "/api/tmdb/discover") {
        const provider = url.searchParams.get("provider"), region = String(url.searchParams.get("region") || "US");
        if (!num(provider)) return send(res, 400, { error: "provider must be a TMDB provider id." });
        if (!/^[A-Z]{2}$/.test(region)) return send(res, 400, { error: "region must be a 2-letter code." });
        upstream = `${base}/discover/${kind}?${key}&with_watch_providers=${provider}&watch_region=${region}&sort_by=popularity.desc`;
      } else if (p === "/api/tmdb/trending") {
        upstream = `${base}/trending/${kind}/week?${key}`;
      } else if (p === "/api/tmdb/videos") {
        const id = url.searchParams.get("id");
        if (!num(id)) return send(res, 400, { error: "id must be a TMDB id." });
        upstream = `${base}/${kind}/${id}/videos?${key}`;
      } else if (p === "/api/tmdb/genres") {
        // discover and trending return genre_IDS. The names live here, in a
        // list that changes about once a decade — so it is answered from
        // memory after the first call rather than spending a request per
        // catalogue open on a table of nineteen rows.
        const hit = genreCache.get(kind);
        if (hit) return send(res, 200, hit);
        upstream = `${base}/genre/${kind}/list?${key}`;
      } else if (p === "/api/tmdb/details") {
        // The one call that carries a runtime. Made for the single title whose
        // summary is open, never for the grid.
        const id = url.searchParams.get("id");
        if (!num(id)) return send(res, 400, { error: "id must be a TMDB id." });
        upstream = `${base}/${kind}/${id}?${key}`;
      } else return send(res, 404, { error: "Unknown TMDB endpoint." });

      let r;
      try { r = await fetch(upstream, { signal: AbortSignal.timeout(8000) }); }
      catch { return send(res, 502, { error: "Could not reach TMDB." }); }
      if (!r.ok) {
        const ours = r.status === 401 || r.status === 403;
        return send(res, ours ? 502 : r.status, { error: ours ? "The server's TMDB key was rejected." : `TMDB HTTP ${r.status}` });
      }
      const body = await r.json();
      if (p === "/api/tmdb/genres") genreCache.set(kind, body);
      return send(res, 200, body);
    }

    // ---- the rest of the Finnhub surface ----
    // Each returns the same top-level shape Finnhub does, so the browser parses
    // the response exactly as it did when it called the provider itself. These
    // carry only public market data — the point is purely that the key stays here.
    if ((p === "/api/symbol-search" || p === "/api/earnings" || p === "/api/market-news") && req.method === "GET") {
      if (!FINNHUB_KEY) return send(res, 503, { error: "Market data is not configured on this server (set FINNHUB_API_KEY)." });
      const rl = rateLimit(`fh:${clientIp(req)}`, ANON_QUOTE_PER_HOUR, 3600000);
      if (!rl.ok) return send(res, 429,
        { error: `Rate limit reached (${rl.limit} per hour).`, retryInSec: Math.ceil(rl.resetMs / 1000) },
        { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) });

      // The cache key has to carry the ARGUMENTS, not just the route, or every
      // symbol search would be served the first one's answer.
      let upstream, ck, ttl;
      if (p === "/api/symbol-search") {
        const q = String(url.searchParams.get("q") || "").trim().slice(0, 60);
        if (!q) return send(res, 400, { error: "Pass ?q=company+name." });
        upstream = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINNHUB_KEY}`;
        ck = `search:${q.toLowerCase()}`; ttl = TTL.search;
      } else if (p === "/api/earnings") {
        const day = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
        const from = String(url.searchParams.get("from") || ""), to = String(url.searchParams.get("to") || "");
        if (!day.test(from) || !day.test(to)) return send(res, 400, { error: "Pass ?from=YYYY-MM-DD&to=YYYY-MM-DD." });
        upstream = `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${FINNHUB_KEY}`;
        ck = `earnings:${from}:${to}`; ttl = TTL.earnings;
      } else {
        upstream = `https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_KEY}`;
        ck = "marketnews"; ttl = TTL.news;
      }

      // Thrown, not returned, so a failure is never written to the cache —
      // see the rejection branch in cached().
      let body;
      try {
        body = await cached(ck, ttl, async () => {
          let r;
          try { r = await fetch(upstream, { signal: AbortSignal.timeout(8000) }); }
          catch { throw Object.assign(new Error("unreachable"), { code: 502, msg: "Could not reach Finnhub." }); }
          if (!r.ok) {
            // 401/403 is our key, not the caller's request.
            const ours = r.status === 401 || r.status === 403;
            throw Object.assign(new Error("upstream"), {
              code: ours ? 502 : r.status,
              msg: ours ? "The server's Finnhub key was rejected." : `Finnhub HTTP ${r.status}`,
            });
          }
          const data = await r.json();
          // Trim to what the desk actually renders; an unbounded wire feed is
          // megabytes — and the trimmed copy is what goes in the cache, so this
          // holds kilobytes rather than the whole feed per key.
          if (p === "/api/market-news") return (Array.isArray(data) ? data : []).slice(0, 40);
          if (p === "/api/symbol-search") return { result: (data?.result || []).slice(0, 30) };
          return { earningsCalendar: (data?.earningsCalendar || []).slice(0, 400) };
        });
      } catch (e) { return send(res, e.code || 502, { error: e.msg || "Upstream failed." }); }
      return send(res, 200, body);
    }

    if (p === "/api/news" && req.method === "GET") {
      if (!FINNHUB_KEY) return send(res, 503, { error: "News is not configured on the server (set FINNHUB_API_KEY)." });
      const symbol = String(url.searchParams.get("symbol") || "").trim().toUpperCase();
      if (!/^[A-Z.-]{1,10}$/.test(symbol)) return send(res, 400, { error: "Pass ?symbol=TICKER." });
      const fmtD = (t) => new Date(t).toISOString().slice(0, 10);
      const from = fmtD(Date.now() - 7 * 86400000), to = fmtD(Date.now());
      const r = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${FINNHUB_KEY}`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return send(res, 502, { error: `Finnhub HTTP ${r.status}` });
      const arr = await r.json();
      const seen = new Set();
      // `datetime` and `summary` are in every Finnhub row and were being
      // dropped here, which is why the panel could never say how old a story
      // was. Both are forwarded now: the timestamp is the card's age and the
      // list's sort key, and the summary is the extra sentence the category
      // scan reads when the headline alone does not settle it.
      //
      // The summary is capped rather than sent whole. It exists to be scanned,
      // not printed, and some wires put three paragraphs in it.
      //
      // 24 rather than 8. The panel shows the first six and offers the rest —
      // "Show 5 more" cannot be an honest button over a list the server
      // already truncated to exactly what is on screen.
      const news = (Array.isArray(arr) ? arr : [])
        .filter(n => n.headline && n.url && !seen.has(n.headline) && seen.add(n.headline))
        .slice(0, 24)
        .map(n => ({
          title: n.headline,
          source: n.source || "wire",
          url: n.url,
          datetime: Number.isFinite(n.datetime) && n.datetime > 0 ? n.datetime : null,
          summary: String(n.summary || "").slice(0, 400) || null,
        }));
      return send(res, 200, { symbol, news });
    }

    // ---- AI DESK (server-held OpenRouter key) ----
    // Takes the same OpenAI-shaped body the client used to send upstream and
    // streams the same SSE back, so the browser's parser is unchanged — the only
    // difference is which side of the wire the key sits on.
    if (p === "/api/ai/chat" && req.method === "POST") {
      if (!OPENROUTER.key) return send(res, 503, { error: "The AI desk is not configured on this server (set OPENROUTER_API_KEY)." });
      // Signed-in callers spend their plan's daily allowance. Anonymous ones are
      // allowed too — the desk is usable in demo without an account — but behind a
      // per-IP hourly cap, because an open proxy is a tap on someone else's credits.
      const email = emailFromReq(req, url);
      if (email) {
        const quota = canUseAi(email);
        if (!quota.allowed) return send(res, 429, { error: `Daily AI limit reached (${quota.used}/${quota.limit}).`, ...quota });
      } else {
        const rl = rateLimit(`ai:${clientIp(req)}`, ANON_AI_PER_HOUR, 3600000);
        if (!rl.ok) return send(res, 429,
          { error: `Rate limit reached (${rl.limit} per hour). Sign in for a higher allowance.`, retryInSec: Math.ceil(rl.resetMs / 1000) },
          { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) });
      }

      const { model, messages } = await readBody(req);
      if (!Array.isArray(messages) || messages.length === 0) return send(res, 400, { error: "Pass { model, messages }." });
      const promptChars = messages.reduce((n, m) => n + String(m?.content || "").length, 0);
      const useModel = String(model || OPENROUTER.model);

      let upstream;
      try {
        upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER.key}`,
            "Content-Type": "application/json",
            // Attribution headers, not secrets — OpenRouter uses them for rankings.
            "HTTP-Referer": APP_ORIGIN,
            "X-Title": "Vantage",
          },
          body: JSON.stringify({ model: useModel, stream: true, messages }),
        });
      } catch (e) {
        if (email) recordAiRun(email, promptChars, "error", { agent: "desk-chat", reason: "unreachable" }, false);
        return send(res, 502, { error: "Could not reach OpenRouter." });
      }

      if (!upstream.ok) {
        // Surface the provider's own reason, but never the key or our headers.
        let detail = "";
        try { const j = await upstream.json(); detail = j?.error?.message || (typeof j?.error === "string" ? j.error : "") || ""; } catch { /* no body */ }
        if (email) recordAiRun(email, promptChars, "error", { agent: "desk-chat", status: upstream.status }, false);
        // A 401 upstream is OUR misconfiguration, not the caller's — don't ask them to re-auth.
        return send(res, upstream.status === 401 ? 502 : upstream.status,
          { error: upstream.status === 401 ? "The server's OpenRouter key was rejected." : (detail || `OpenRouter HTTP ${upstream.status}`) });
      }

      if (email) recordAiRun(email, promptChars, "ok", { agent: "desk-chat", model: useModel });
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",           // stop proxies buffering the stream into one lump
        "Access-Control-Allow-Origin": APP_ORIGIN,
      });
      const reader = upstream.body.getReader();
      // If the browser aborts mid-answer, stop pulling tokens we'd still be billed for.
      req.on("close", () => { reader.cancel().catch(() => {}); });
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
      } catch { /* client hung up */ }
      return res.end();
    }

    // ---- YOUTUBE (server-held Data API key) ----
    // Search costs 100 quota units against a 10k/day project budget, so this is
    // rate-limited per IP even though the endpoint itself is read-only.
    //
    // videos.list costs ONE unit, which is why every search hit is enriched
    // with it unconditionally rather than on demand. The Video desk needs a
    // duration, a description (chapters and mentioned tickers are parsed out of
    // it — the Data API has no field for either) and a publish date; fetching
    // those separately would cost the client a round trip and the project 1/100
    // of what it already spent.
    if (p === "/api/youtube/lookup" && req.method === "GET") {
      if (!YOUTUBE_KEY) return send(res, 503, { error: "Video search is not configured on this server (set YOUTUBE_API_KEY)." });
      // A hundred times cheaper than search, so a hundred times the allowance.
      const rl = rateLimit(`ytl:${clientIp(req)}`, ANON_YT_PER_HOUR * 100, 3600000);
      if (!rl.ok) return send(res, 429,
        { error: `Rate limit reached (${rl.limit} per hour).`, retryInSec: Math.ceil(rl.resetMs / 1000) },
        { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) });
      const ids = String(url.searchParams.get("id") || "").split(",").map(s => s.trim()).filter(s => /^[\w-]{6,20}$/.test(s)).slice(0, 20);
      if (!ids.length) return send(res, 400, { error: "Pass ?id=videoId[,videoId…]." });
      return send(res, 200, { videos: Object.entries(await ytDetails(ids)).map(([id, d]) => ({ id, ...d })) });
    }

    if (p === "/api/youtube/search" && req.method === "GET") {
      if (!YOUTUBE_KEY) return send(res, 503, { error: "Video search is not configured on this server (set YOUTUBE_API_KEY)." });
      const rl = rateLimit(`yt:${clientIp(req)}`, ANON_YT_PER_HOUR, 3600000);
      if (!rl.ok) return send(res, 429,
        { error: `Rate limit reached (${rl.limit} per hour).`, retryInSec: Math.ceil(rl.resetMs / 1000) },
        { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) });

      const q = String(url.searchParams.get("q") || "").trim().slice(0, 120);
      if (!q) return send(res, 400, { error: "Pass ?q=search+terms." });
      const max = Math.min(10, Math.max(1, Number(url.searchParams.get("max")) || 3));
      const api = new URL("https://www.googleapis.com/youtube/v3/search");
      api.search = new URLSearchParams({ part: "snippet", type: "video", videoEmbeddable: "true", maxResults: String(max), q, key: YOUTUBE_KEY });

      let r;
      try { r = await fetch(api, { signal: AbortSignal.timeout(8000) }); }
      catch { return send(res, 502, { error: "Could not reach YouTube." }); }
      if (!r.ok) {
        let detail = "";
        try { detail = (await r.json())?.error?.message || ""; } catch { /* no body */ }
        // Google reports a bad key as 400, not 403, so status alone misattributes
        // it to the caller. Anything naming the key is ours to fix, not theirs.
        const ours = r.status === 403 || /api key|quota/i.test(detail);
        return send(res, ours ? 502 : r.status,
          { error: ours ? "The server's YouTube key was rejected or is out of quota." : (detail || `YouTube HTTP ${r.status}`) });
      }
      const data = await r.json();
      const decode = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
      const videos = (data.items || []).filter(it => it.id?.videoId).map(it => ({
        id: it.id.videoId,
        title: decode(it.snippet?.title) || q,
        channel: it.snippet?.channelTitle || "YouTube",
        url: `https://www.youtube.com/watch?v=${it.id.videoId}`,
      }));
      // Enrichment is best-effort by design: ytDetails swallows its own errors
      // and returns {}, so a lookup that fails costs the caller a chapter strip,
      // not the search results it already paid 100 units for.
      const details = await ytDetails(videos.map(v => v.id));
      for (const v of videos) Object.assign(v, details[v.id] || {});
      return send(res, 200, { q, videos });
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
      // A token means this proxy borrows real catalog credentials, so it must not answer
      // anonymous callers — otherwise anyone could enumerate internal dataset names, owners
      // and lineage through it. The tokenless local quickstart carries no such authority and
      // stays open, which is what keeps the unwalled guest demo working.
      if (DATAHUB_TOKEN && !emailFromReq(req, url)) return send(res, 401, { error: "Not signed in." });
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

    // ---- BROKERAGE LINKS ----
    //
    // GET is deliberately answerable when signed out: the browser draws the
    // connect sheet before anyone has an account, and "what can I link" is not
    // account data. Only `connections` needs an identity, and an anonymous
    // caller simply has none.
    if (p === "/api/brokers" && req.method === "GET") {
      const email = emailFromReq(req, url);
      const rec = email ? BROKERS[email] : null;
      return send(res, 200, {
        configured: plaidConfigured(),
        provider: plaidConfigured() ? "plaid" : null,
        env: plaidConfigured() ? PLAID.env : null,
        institutions: INSTITUTIONS.map(({ id, name, tint, access, note }) => ({ id, name, tint, access, note })),
        connections: (rec?.connections || []).map(publicConnection),
      });
    }

    // Step 1 of a real link: mint a Plaid Link token. The browser opens Plaid's
    // own UI with it — the account credentials are typed into Plaid, never into
    // Vantage and never into this server.
    if (p === "/api/brokers/link" && req.method === "POST") {
      // Configuration is checked BEFORE the session. "Sign in first" is the
      // wrong answer to a feature that is not switched on at all — it sends the
      // caller off to make an account that would not have helped, and it made
      // scripts/check-keys.mjs report an unset key as merely unauthenticated.
      if (!plaidConfigured()) return send(res, 503, { error: "Brokerage links are not configured on this server. The desk will link a labelled demo book instead." });
      const email = emailFromReq(req, url);
      if (!email) return send(res, 401, { error: "Sign in to link a brokerage account." });
      const rl = rateLimit(`blink:${email}`, 10, 3600000);
      if (!rl.ok) return send(res, 429, { error: "Too many link attempts — try again later.", retryInSec: Math.ceil(rl.resetMs / 1000) });
      const j = await plaidCall("/link/token/create", {
        // Stable per account so Plaid can recognise a returning user, and
        // hashed so their email is not a Plaid-side identifier.
        user: { client_user_id: crypto.createHash("sha256").update(email).digest("hex").slice(0, 32) },
        client_name: "Vantage",
        products: ["investments"],
        country_codes: ["US"],
        language: "en",
      });
      return send(res, 200, { linkToken: j.link_token, expiration: j.expiration || null, env: PLAID.env });
    }

    // Step 2: trade Plaid's one-shot public token for a long-lived access token,
    // then immediately pull the book so the panel has something to draw.
    if (p === "/api/brokers/exchange" && req.method === "POST") {
      if (!plaidConfigured()) return send(res, 503, { error: "Brokerage links are not configured on this server." });
      const email = emailFromReq(req, url);
      if (!email) return send(res, 401, { error: "Sign in to link a brokerage account." });
      const { publicToken, institutionName: pickedName } = await readBody(req);
      if (!publicToken) return send(res, 400, { error: "Pass { publicToken } from Plaid Link." });
      const ex = await plaidCall("/item/public_token/exchange", { public_token: publicToken });
      // Which of OUR three did they pick? Plaid Link hands the browser the
      // institution's display name; matchInstitution maps it back to the
      // catalog. An institution outside the catalog is still linked and still
      // works — it simply has no tint and no spoken alias.
      const institutionId = matchInstitution(pickedName || "") || null;
      const rec = brokerRecord(email);
      const conn = {
        id: ex.item_id || crypto.randomBytes(8).toString("hex"),
        provider: "plaid",
        institutionId,
        institutionName: institutionId ? institutionById(institutionId).name : (String(pickedName || "").trim() || "Linked account"),
        accessToken: ex.access_token,   // ← never leaves this file
        itemId: ex.item_id || null,
        connectedAt: Date.now(),
        accounts: [],
      };
      // Replace rather than append when the same item is linked twice: two
      // records for one item would double every position in the panel.
      rec.connections = [...rec.connections.filter(c => c.id !== conn.id), conn];
      await refreshConnection(conn);
      saveBrokers();
      return send(res, 200, { connection: publicConnection(conn) });
    }

    // Re-pull the book. No id refreshes every link the account has.
    if (p === "/api/brokers/refresh" && req.method === "POST") {
      const email = emailFromReq(req, url);
      if (!email) return send(res, 401, { error: "Not signed in." });
      const { connectionId } = await readBody(req);
      const rec = brokerRecord(email);
      const targets = connectionId ? rec.connections.filter(c => c.id === connectionId) : rec.connections;
      if (connectionId && !targets.length) return send(res, 404, { error: "No such linked account." });
      await Promise.all(targets.map(refreshConnection));
      saveBrokers();
      return send(res, 200, { connections: rec.connections.map(publicConnection) });
    }

    // Forget a link. Plaid's /item/remove is best-effort: failing to tell Plaid
    // must not leave the user staring at an account they asked us to drop.
    if (p === "/api/brokers/disconnect" && req.method === "POST") {
      const email = emailFromReq(req, url);
      if (!email) return send(res, 401, { error: "Not signed in." });
      const { connectionId } = await readBody(req);
      const rec = brokerRecord(email);
      const gone = rec.connections.find(c => c.id === connectionId);
      if (!gone) return send(res, 404, { error: "No such linked account." });
      rec.connections = rec.connections.filter(c => c.id !== connectionId);
      saveBrokers();
      if (gone.accessToken && plaidConfigured()) {
        try { await plaidCall("/item/remove", { access_token: gone.accessToken }); } catch { /* dropped locally either way */ }
      }
      return send(res, 200, { ok: true, connections: rec.connections.map(publicConnection) });
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
      // Every plan is paid now, so the "except the free one" exemption is gone:
      // with Stripe live no client may set any plan, and the webhook is the only
      // writer. The front end already re-reads /api/auth/me after a checkout
      // returns, so a 403 here costs it nothing.
      if (STRIPE.secret) return send(res, 403, { error: "Plans are updated only by verified Stripe webhooks." });
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
      // `created` rides along so a social sign-in gets the same trial countdown
      // as an email one — without it the app has no start date for this account
      // and, correctly, draws nothing.
      const q = new URLSearchParams({ auth: "1", token, email: rec.email, name: rec.name || "", plan: rec.plan || "free", created: String(rec.createdAt || "") });
      return send(res, 302, "", { Location: `${APP_ORIGIN}/?${q}` });
    }

    // ---- BILLING (Layer 3) ----
    if (p === "/api/billing/config" && req.method === "GET") {
      return send(res, 200, { enabled: !!STRIPE.secret, trialDays: TRIAL_DAYS, plans: { free: !!STRIPE.prices.free, pro: !!STRIPE.prices.pro, desk: !!STRIPE.prices.desk } });
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
      status.ai = { configured: !!OPENROUTER.key, model: OPENROUTER.model };
      status.youtube = { configured: !!YOUTUBE_KEY };
      // `configured` is now true if ANY provider can answer, which is what the
      // caller is really asking. Yahoo needs no key, so this is effectively
      // always true — and `providers` is the honest detail underneath it: which
      // one is carrying the tape, and which is sitting out a failure. A
      // failover nobody can see is the thing worth avoiding, so it is printed
      // rather than inferred.
      status.quotes = {
        configured: !!FINNHUB_KEY || QUOTE_PROVIDERS.some(([n]) => n !== "finnhub"),
        primary: !!FINNHUB_KEY,
        providers: QUOTE_PROVIDERS.map(([name]) => ({
          name,
          resting: breakerResting(name),
          fails: breakers.get(name)?.fails || 0,
        })),
      };
      status.tmdb = { configured: !!TMDB_KEY };
      status.gemini = { configured: !!GEMINI_KEY };
      status.eleven = { configured: !!ELEVEN_KEY };
      status.hosted = { configured: !!(VERTEX.project && VERTEX.serviceAccount && VERTEX.privateKey) };
      status.music = { playlist: SPOTIFY_PLAYLIST, configured: !!SPOTIFY_PLAYLIST };
      // `configured` false is not a fault — it is the app's zero-setup state,
      // and the browser answers it with a labelled demo book rather than an
      // error. `linked` is how many real accounts this caller actually has.
      status.brokers = {
        configured: plaidConfigured(),
        provider: plaidConfigured() ? "plaid" : null,
        env: plaidConfigured() ? PLAID.env : null,
        linked: email ? (BROKERS[email]?.connections?.length || 0) : 0,
      };
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
  console.log(`  brokerage links: ${plaidConfigured() ? `plaid (${PLAID.env})` : "demo book only (no PLAID_CLIENT_ID)"}`);
  // An ElevenLabs SECRET starts "sk_". The dashboard also shows a 64-char hex
  // key ID beside it, and the two are easy to mix up — the API rejects the ID
  // with a 401, which surfaces three layers away as a failed voice. Say it here,
  // at boot, where it costs nothing and is unmissable.
  if (ELEVEN_KEY && !ELEVEN_KEY.startsWith("sk_")) {
    console.log(`  ⚠ ELEVENLABS_API_KEY does not start with "sk_" — that looks like a key ID, not the secret. Studio voice will 401.`);
  }
  // Every URI the provider must have registered, named by what it is for. The two
  // sign-in callbacks used to be missing from this list — and the Google one is the
  // easiest of the four to overlook, because it belongs to the SAME OAuth client as
  // the meetings callback and is simply a second URI on it.
  console.log(`  redirect URIs to register:`);
  console.log(`    zoom meetings    ${CFG.zoom.redirect}`);
  console.log(`    google meetings  ${CFG.google.redirect}`);
  console.log(`    google sign-in   ${OAUTH.google.redirect}`);
  console.log(`    yahoo sign-in    ${OAUTH.yahoo.redirect}`);
});
