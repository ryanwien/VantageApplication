// ============================================================
//  The beta, as one command: a public link to the app on this machine.
//
//  WHAT IT RUNS
//    1. vite build            — testers get the code as it is now
//    2. cloudflared tunnel    — a public https://….trycloudflare.com address
//    3. the backend           — .env with .env.beta layered on top
//    4. vite preview          — the BUILT app on :4173, which the tunnel points at
//
//  WHY PREVIEW AND NEVER THE DEV SERVER
//  Vite's dev server answers for any file under the project root, and
//  server/users.json — password hashes — is under the project root. Preview
//  serves dist/ and nothing else.
//
//  WHY IT EDITS .env.beta
//  A quick tunnel gets a new address every time it starts, and the backend
//  needs that address (PUBLIC_ORIGIN / APP_ORIGIN) before it starts. Doing it
//  by hand is three steps in the wrong order; here the tunnel comes up first,
//  its address is written in, and only then does the backend start.
//
//  WHAT IT REFUSES
//  To go public with sign-up open. An empty BETA_INVITES means anyone who is
//  forwarded the link can make an account and spend this server's keys.
//
//  Run:  npm run beta        Stop: Ctrl+C (all four stop together)
// ============================================================
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BETA_ENV = path.join(ROOT, ".env.beta");
const PREVIEW_PORT = 4173;   // must match `preview.port` in vite.config.js
const VITE = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");

const say = (line) => process.stdout.write(`[beta] ${line}\n`);
const fail = (line) => { process.stderr.write(`[beta] ${line}\n`); process.exit(1); };
const pipe = (tag, stream) => {
  let buf = "";
  stream.on("data", (chunk) => {
    buf += chunk.toString();
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? "";
    for (const l of lines) process.stdout.write(`[${tag}] ${l}\n`);
  });
};

// ---- preconditions ----
if (!fs.existsSync(path.join(ROOT, ".env"))) fail("No .env — the backend has no keys to run with.");
if (!fs.existsSync(BETA_ENV)) fail("No .env.beta — see the BETA_INVITES section of .env.example and create it.");

const invites = (/^\s*BETA_INVITES\s*=(.*)$/m.exec(fs.readFileSync(BETA_ENV, "utf8"))?.[1] || "")
  .split(",").map(s => s.trim()).filter(Boolean);
if (!invites.length) fail("BETA_INVITES in .env.beta is empty, which would open sign-up to anyone with the link. Add your testers' emails first.");
const real = invites.filter(e => !e.endsWith("@invalid"));
say(real.length
  ? `sign-up open to ${real.length} invited address${real.length === 1 ? "" : "es"}`
  : "sign-up is CLOSED to everyone — replace the placeholder in BETA_INVITES with your testers' emails");

const cloudflared = [
  "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
  "C:\\Program Files\\cloudflared\\cloudflared.exe",
].find(p => fs.existsSync(p)) || "cloudflared";   // elsewhere: whatever is on PATH

// ---- 1. build ----
say("building…");
const build = spawnSync(process.execPath, [VITE, "build", "--logLevel", "warn"], { cwd: ROOT, stdio: "inherit" });
if (build.status !== 0) fail("The build failed — fix it before sending anyone a link.");

// ---- children, and stopping them together ----
const children = [];
const stopAll = (code = 0) => {
  for (const c of children) { try { c.kill(); } catch { /* already gone */ } }
  process.exit(code);
};
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
const start = (tag, cmd, args) => {
  const c = spawn(cmd, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  pipe(tag, c.stdout); pipe(tag, c.stderr);
  // One of them dying takes the link down with it, so the rest go too —
  // a tunnel with nothing behind it is a link that answers 502.
  c.on("exit", (code) => { say(`${tag} stopped (code ${code}) — stopping the rest`); stopAll(code || 1); });
  c.on("error", (e) => { say(`${tag} could not start: ${e.message}`); stopAll(1); });
  children.push(c);
  return c;
};

// ---- 2. tunnel, and its address ----
say("opening the tunnel…");
const tunnel = start("tunnel", cloudflared, ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${PREVIEW_PORT}`]);
const url = await new Promise((resolve) => {
  const timer = setTimeout(() => resolve(null), 45000);
  const look = (chunk) => {
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(chunk.toString());
    if (m) { clearTimeout(timer); resolve(m[0]); }
  };
  tunnel.stdout.on("data", look); tunnel.stderr.on("data", look);
});
if (!url) { say("the tunnel never reported an address"); stopAll(1); }

// ---- 3. the address into .env.beta, then the backend ----
let env = fs.readFileSync(BETA_ENV, "utf8");
for (const key of ["PUBLIC_ORIGIN", "APP_ORIGIN"]) {
  const line = `${key}=${url}`;
  env = new RegExp(`^${key}=.*$`, "m").test(env) ? env.replace(new RegExp(`^${key}=.*$`, "m"), line) : `${env.trimEnd()}\n${line}\n`;
}
fs.writeFileSync(BETA_ENV, env);
start("server", process.execPath, ["--env-file=.env", "--env-file=.env.beta", "server/index.js"]);

// ---- 4. the built app ----
start("preview", process.execPath, [VITE, "preview"]);

setTimeout(() => {
  say("");
  say(`TESTERS' LINK:  ${url}`);
  say("Works while this window stays open. A restart gives a new link — send that one.");
  say("");
}, 2500);
