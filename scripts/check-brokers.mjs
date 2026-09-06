// Do the BROKERAGE keys actually work?
//
//   node --env-file=.env scripts/check-brokers.mjs
//
// WHY THIS EXISTS ALONGSIDE check-keys.mjs
// check-keys.mjs asks the running app server, which is the right design for
// every other key. It cannot work here: every broker route requires a signed-in
// session, so unauthenticated it answers 401 and the script reports "configured
// — set; route needs a signed-in account to prove it". That is an honest
// sentence and a useless one. "Configured" is exactly the state a revoked key,
// a key pasted with a trailing newline, and a sandbox secret in the production
// slot all share.
//
// So this one skips the app entirely and calls the PROVIDERS. It needs no
// server and no account, and it answers the only question worth asking after a
// paste: does the provider accept these credentials?
//
// It never prints a key. Where a value is malformed it says HOW — length, stray
// whitespace, wrapping quotes — because that is the part you cannot see in an
// editor and the part that is nearly always wrong.
//
// Exit codes: 0 every configured provider works · 1 one is set and refused ·
// 2 the question could not be asked at all.
import { Buffer } from "node:buffer";
import {
  RH_BASE, RH_HOLDINGS_PATH, rhHeaders, rhTimestamp,
} from "../src/brokers/robinhood.js";
import { makeEd25519Signer } from "../src/brokers/robinhood-sign.js";
import { SCHWAB_TOKEN_URL } from "../src/brokers/schwab.js";
import { msReadiness } from "../src/brokers/morgan-stanley.js";

const env = (k) => process.env[k] || "";

// ---------- shape ----------
// The paste errors that survive a visual check. Reported by description, never
// by value: "22 characters" is a diagnosis, the 22 characters are a leak.
function shapeProblems(name, raw) {
  const out = [];
  if (!raw) return out;
  if (raw !== raw.trim()) out.push(`${name} has leading/trailing whitespace`);
  if (/^["'].*["']$/s.test(raw.trim())) out.push(`${name} is wrapped in quotes — .env values do not need them`);
  if (/\s/.test(raw.trim())) out.push(`${name} contains an internal space or newline`);
  return out;
}

// ---------- one row of output ----------
const rows = [];
const pad = (s, n) => String(s).padEnd(n);
function row(provider, state, note = "") { rows.push({ provider, state, note }); }

// ---------- Plaid ----------
// /institutions/get is the cheapest authenticated read Plaid offers: no user
// object, no link flow, no side effects — it just needs the credentials to be
// real. A wrong pair comes back 400 INVALID_API_KEYS, which is unambiguous.
async function checkPlaid() {
  const clientId = env("PLAID_CLIENT_ID"), secret = env("PLAID_SECRET");
  const problems = [...shapeProblems("PLAID_CLIENT_ID", clientId), ...shapeProblems("PLAID_SECRET", secret)];
  if (!clientId || !secret) return row("Plaid", "not set", "the desk links a labelled DEMO book instead");
  if (problems.length) return row("Plaid", "MALFORMED", problems.join("; "));

  // Matches plaidBase() in server/index.js: anything that is not "production"
  // is sandbox. Stated here so the two cannot drift silently.
  const envName = env("PLAID_ENV") || "sandbox";
  const base = `https://${envName === "production" ? "production" : "sandbox"}.plaid.com`;
  try {
    const r = await fetch(`${base}/institutions/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId.trim(), secret: secret.trim(), count: 1, offset: 0, country_codes: ["US"] }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      const warn = envName === "production" ? "  ⚠ PRODUCTION — real accounts, real money" : "";
      return row("Plaid", "works", `${envName}${warn}`);
    }
    if (j.error_code === "INVALID_API_KEYS") {
      // The single most common cause, and invisible in an editor: Plaid issues a
      // DIFFERENT secret per environment. A sandbox secret is not a bad secret.
      return row("Plaid", "REFUSED", `${envName}: invalid keys — is this the ${envName} secret? Plaid issues one per environment`);
    }
    return row("Plaid", "REFUSED", `${envName}: ${j.error_code || r.status} ${String(j.error_message || "").slice(0, 80)}`);
  } catch (e) {
    return row("Plaid", "UNREACHABLE", String(e.message).slice(0, 80));
  }
}

// ---------- Robinhood (crypto) ----------
async function checkRobinhood() {
  const apiKey = env("ROBINHOOD_API_KEY"), seed = env("ROBINHOOD_PRIVATE_KEY");
  const problems = [...shapeProblems("ROBINHOOD_API_KEY", apiKey), ...shapeProblems("ROBINHOOD_PRIVATE_KEY", seed)];
  // The two halves arrive at DIFFERENT TIMES, so they get different verdicts.
  // You generate the key pair yourself and hold the private half immediately;
  // the API key only exists once Robinhood has been given the public half. A
  // single "not set" for both would report the normal middle of that process as
  // though nothing had happened.
  if (!apiKey && seed) return row("Robinhood", "half-set", "private key ready — paste the public key at robinhood.com/account/crypto, then set ROBINHOOD_API_KEY");
  if (apiKey && !seed) return row("Robinhood", "half-set", "API key set but no private key — run: node scripts/robinhood-keygen.mjs");
  if (!apiKey || !seed) return row("Robinhood", "not set", "crypto only when set — no equities API exists");
  if (problems.length) return row("Robinhood", "MALFORMED", problems.join("; "));

  // The seed is 32 raw bytes. Checking it here turns an opaque 401 into the
  // actual sentence — the key generator's output was truncated on paste.
  const rawLen = Buffer.from(seed.trim(), "base64").length;
  if (rawLen < 32) return row("Robinhood", "MALFORMED", `private key decodes to ${rawLen} bytes, expected 32 — the base64 seed looks truncated`);

  let sign;
  try { sign = makeEd25519Signer(seed.trim()); }
  catch (e) { return row("Robinhood", "MALFORMED", String(e.message).slice(0, 90)); }

  try {
    const ts = rhTimestamp();
    const headers = rhHeaders({ apiKey: apiKey.trim(), timestamp: ts, path: RH_HOLDINGS_PATH, method: "GET", sign });
    const r = await fetch(`${RH_BASE}${RH_HOLDINGS_PATH}`, { headers });
    if (r.ok) {
      const j = await r.json().catch(() => ({}));
      const n = Array.isArray(j.results) ? j.results.length : 0;
      return row("Robinhood", "works", `crypto · ${n} holding${n === 1 ? "" : "s"} (no cost basis — provider omits it)`);
    }
    if (r.status === 401) {
      // The signature covers a timestamp in SECONDS with no separators, so a
      // skewed clock fails identically to a wrong key. Worth naming.
      return row("Robinhood", "REFUSED", "401 — wrong key/seed pair, or this machine's clock is off");
    }
    return row("Robinhood", "REFUSED", `${r.status} ${(await r.text()).replace(/\s+/g, " ").slice(0, 70)}`);
  } catch (e) {
    return row("Robinhood", "UNREACHABLE", String(e.message).slice(0, 80));
  }
}

// ---------- Schwab ----------
// Schwab has no read endpoint that a mere app credential can reach — every
// Trader API call needs a token minted from a USER's consent. But the token
// endpoint itself authenticates the app with HTTP Basic before it ever looks at
// the grant, and it distinguishes the two failures:
//
//   invalid_client  → the app key/secret pair is wrong        (a real finding)
//   invalid_grant   → the pair is fine, the code was bogus    (expected — ours is)
//
// So a deliberately bogus authorization code separates "your credentials are
// wrong" from "your credentials are fine, nobody has logged in yet". That is
// the whole question while waiting on approval.
async function checkSchwab() {
  const key = env("SCHWAB_APP_KEY"), secret = env("SCHWAB_APP_SECRET");
  const problems = [...shapeProblems("SCHWAB_APP_KEY", key), ...shapeProblems("SCHWAB_APP_SECRET", secret)];
  if (!key || !secret) return row("Schwab", "not set", "approval is manual — request access at developer.schwab.com");
  if (problems.length) return row("Schwab", "MALFORMED", problems.join("; "));

  const redirect = env("SCHWAB_REDIRECT_URI") || "https://127.0.0.1:8787/api/brokers/schwab/callback";
  try {
    const r = await fetch(SCHWAB_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${key.trim()}:${secret.trim()}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "authorization_code", code: "vantage-credential-probe", redirect_uri: redirect }),
    });
    const j = await r.json().catch(() => ({}));
    const err = String(j.error || "");
    if (err === "invalid_client" || r.status === 401) {
      return row("Schwab", "REFUSED", "invalid_client — the app key/secret pair is wrong or the app is not yet approved");
    }
    if (err === "invalid_grant" || err === "unsupported_token_request" || r.status === 400) {
      // Credentials passed Basic auth; only the deliberately-bogus code failed.
      return row("Schwab", "credentials ok", "app pair accepted — a user still has to complete the OAuth login");
    }
    if (r.ok) return row("Schwab", "works", "token endpoint accepted the probe (unexpected — inspect manually)");
    return row("Schwab", "REFUSED", `${r.status} ${err || String(j.error_description || "").slice(0, 70)}`);
  } catch (e) {
    return row("Schwab", "UNREACHABLE", String(e.message).slice(0, 80));
  }
}

// ---------- Morgan Stanley ----------
// No network probe is possible: the base URL itself arrives with onboarding, so
// there is nothing to call until someone is invited. msReadiness() is the
// authority — it already distinguishes "no credentials" from "credentials but
// no spec", which are different asks of a different person.
function checkMorganStanley() {
  const r = msReadiness(process.env);
  if (r.stage === "ready") return row("Morgan Stanley", "configured", "credentials + spec present — run a real link to prove it");
  if (r.stage === "spec") return row("Morgan Stanley", "half-set", "credentials present, endpoint spec missing — ask for the OpenAPI spec");
  return row("Morgan Stanley", "not set", "invitation only — ask your rep or API@morganstanley.com");
}

// ---------- run ----------
const run = async () => {
  console.log("asking each provider directly — no app server, no account\n");
  await checkPlaid();
  await checkRobinhood();
  await checkSchwab();
  checkMorganStanley();

  const bad = rows.filter(r => ["REFUSED", "MALFORMED", "UNREACHABLE"].includes(r.state));
  const live = rows.filter(r => r.state === "works");
  for (const r of rows) console.log(`${pad(r.state === "works" ? "ok" : r.state, 16)}${pad(r.provider, 16)}${r.note}`);

  console.log(`\n${live.length} working, ${bad.length} failing`);
  if (!live.length && !bad.length) {
    console.log("Nothing is set. Plaid is the one to do first: it is self-serve, and the");
    console.log("only path here that reaches equities at all — the other three do not.");
  }
  // A provider with no key set is not a failure; it is a decision not yet made.
  return bad.length ? 1 : 0;
};

// process.exitCode rather than process.exit(), matching check-keys.mjs: the
// sockets from those calls are still closing, and tearing the process down on
// top of them trips a libuv assertion on Windows.
process.exitCode = await run();
