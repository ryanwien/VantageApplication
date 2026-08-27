// Does every API key this server holds actually still work?
//
// /api/status already answers "is a key set", which is the question you can ask
// without spending anything — and it is not the question that matters when you
// rotate. A revoked key is set. A key pasted with a trailing newline is set. So
// this makes one real call per service and reads the answer.
//
// It never prints a key, and it never reads .env: it asks the running server,
// which is the only thing that holds them.
//
//   node scripts/check-keys.mjs            (defaults to PORT, or 8787)
//   node scripts/check-keys.mjs 3000
//
// Run it before a rotation to get a baseline, and after one to prove the new
// key works BEFORE you revoke the old one. Exits non-zero if anything that is
// configured is not working, so CI can use it too.

const port = process.argv[2] || process.env.PORT || 8787;
const base = `http://127.0.0.1:${port}`;

// One real call each, chosen to be the cheapest thing the service will answer.
// The two POSTs cost a few tokens; there is no way to prove a model key works
// without asking the model something.
const CHECKS = [
  { key: "FINNHUB_API_KEY",    what: "quotes",        req: ["/api/quote?symbol=AAPL"] },
  { key: "TMDB_API_KEY",       what: "film & TV",     req: ["/api/tmdb/trending?kind=movie"] },
  { key: "YOUTUBE_API_KEY",    what: "video search",  req: ["/api/youtube/search?q=markets"] },
  { key: "ELEVENLABS_API_KEY", what: "studio voice",  req: ["/api/voices"] },
  { key: "OPENROUTER_API_KEY", what: "the AI desk",   req: ["/api/ai/chat", { messages: [{ role: "user", content: "hi" }] }] },
  { key: "GEMINI_API_KEY",     what: "Gemini",        req: ["/api/ai/gemini", { contents: [{ parts: [{ text: "hi" }] }] }] },
];

const call = async ([path, body]) => {
  const r = await fetch(base + path, body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : {});
  // Streamed replies are proof on their own — the upstream accepted the key, so
  // stop reading rather than pay for the whole answer.
  const text = r.body ? (await r.text()).slice(0, 400) : "";
  return { status: r.status, text };
};

// 503 is this server saying the key is not set; every other failure came back
// from the provider, which means the key IS set and the provider refused it.
const verdict = ({ status, text }) => {
  if (status === 503) return ["not set", "—"];
  if (status === 429) return ["rate limited", "can't tell from here; try again later"];
  if (status >= 200 && status < 300) return ["works", ""];
  let msg = text;
  try { msg = JSON.parse(text).error || text; } catch {}
  return ["FAILING", `${status} · ${String(msg).replace(/\s+/g, " ").slice(0, 96)}`];
};

const pad = (s, n) => String(s).padEnd(n);
let bad = 0, live = 0;

try { await fetch(base + "/api/status"); }
catch { console.error(`No server on ${base}. Start it with: npm run server`); process.exit(2); }

console.log(`asking ${base} — one real call per service\n`);
for (const c of CHECKS) {
  let state, note;
  try { [state, note] = verdict(await call(c.req)); }
  catch (e) { state = "FAILING"; note = String(e.message).slice(0, 96); }
  if (state === "FAILING") bad++;
  if (state === "works") live++;
  console.log(`${pad(state === "works" ? "ok" : state, 14)}${pad(c.key, 22)}${pad(c.what, 15)}${note}`);
}

console.log(`\n${live} working, ${bad} failing`);
if (bad) console.log("A failing key is set but refused by the provider — check for a stray newline before assuming it is revoked.");
process.exit(bad ? 1 : 0);
