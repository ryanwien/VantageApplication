// ============================================================
//  One process that owns both halves of the dev environment.
//
//  WHY THIS EXISTS
//  Vantage in dev is two servers: Vite on 5173, and the backend on 8787 that
//  holds every key the browser must never see. Vite proxies /api to it. Run
//  separately, they do not die together — and the way they fail is asymmetric:
//  a supervisor that restarts the tab-backed dev server has no reason to
//  restart a backend nothing is pointed at. The symptom is always the same,
//  and it does not look like a missing backend:
//
//      "All models failed"          ← /api/ai/chat had nobody to proxy to
//
//  So the backend becomes a CHILD of the thing that does get restarted. One
//  process to start, one to stop, and no way to end up with half of it.
//
//  Run:  node scripts/dev-all.mjs        (or: npm run dev:all)
// ============================================================
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// NOT process.env.PORT. A supervisor that launches this as a dev server sets
// PORT to the port it is watching — 5173 — so reading it here probes the wrong
// port and the "is one already running?" check below silently becomes "is Vite
// running?". Measured: it printed `starting the backend on :5173`.
//
// The backend's port is whatever .env says, because that is the file the
// backend itself reads through --env-file. Parsed rather than imported to keep
// this script dependency-free and to avoid pulling the rest of .env — which is
// secrets — into this process.
function apiPortFromEnvFile() {
  try {
    const line = fs.readFileSync(path.join(ROOT, ".env"), "utf8")
      .split(/\r?\n/)
      .find((l) => /^\s*PORT\s*=/.test(l));
    const n = Number(String(line || "").split("=")[1]?.trim());
    if (Number.isInteger(n) && n > 0 && n < 65536) return n;
  } catch { /* no .env is fine — the backend defaults too */ }
  return 8787;
}
const API_PORT = apiPortFromEnvFile();

// Colourless prefixes: this output is read through a log pane as often as a
// terminal, and escape codes there are just noise.
const say = (tag, line) => process.stdout.write(`[${tag}] ${line}\n`);
const pipe = (tag, stream, to = "stdout") => {
  let buf = "";
  stream.on("data", (chunk) => {
    buf += chunk.toString();
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? "";
    for (const l of lines) process[to].write(`[${tag}] ${l}\n`);
  });
};

// Is something already on the API port? The common case is the developer
// running `npm run server` in their own terminal — in which case starting a
// second one just produces EADDRINUSE and a restart loop that buries the real
// logs. Defer to whoever got there first.
const portTaken = (port) => new Promise((resolve) => {
  const probe = net.connect({ port, host: "127.0.0.1" });
  const done = (taken) => { probe.destroy(); resolve(taken); };
  probe.once("connect", () => done(true));
  probe.once("error", () => done(false));
  probe.setTimeout(700, () => done(false));
});

const children = new Set();
let shuttingDown = false;

function start(tag, args, opts = {}) {
  const { restart = false, env } = opts;
  // process.execPath, not "npm"/"npx": on Windows those are .cmd shims that
  // need shell:true, and a shelled child cannot be killed cleanly — it leaves
  // the real node process orphaned on the port, which is exactly the failure
  // this file is meant to end.
  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: env ? { ...process.env, ...env } : process.env,
  });
  children.add(child);
  pipe(tag, child.stdout);
  pipe(tag, child.stderr, "stderr");

  child.on("exit", (code, signal) => {
    children.delete(child);
    if (shuttingDown) return;
    say("dev-all", `${tag} exited (${signal || `code ${code}`}).`);
    if (restart) {
      // Only the backend restarts. Vite exiting on its own means the thing the
      // supervisor is watching has gone, and this process should go with it
      // rather than linger as a half-environment that answers nothing.
      say("dev-all", `restarting ${tag} in 1s…`);
      // The WHOLE opts object, not a rebuilt one. Passing `{ restart }` here
      // silently dropped `env`, so the replacement backend lost its explicit
      // PORT and re-bound to 5173 next to Vite — the restart "succeeded",
      // printed its banner, and left 8787 empty. A recovery path that
      // reconstructs its own arguments is a recovery path that drifts from the
      // thing it is recovering.
      setTimeout(() => { if (!shuttingDown) start(tag, args, opts); }, 1000);
    } else {
      stopAll(code ?? 1);
    }
  });
  return child;
}

function stopAll(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) { try { c.kill(); } catch { /* already gone */ } }
  // Give them a moment to go down on their own before this process does.
  setTimeout(() => process.exit(code), 300);
}

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
  process.on(sig, () => { say("dev-all", `${sig} — stopping both.`); stopAll(0); });
}

// The API first, so Vite's proxy has a target by the time the browser asks.
// Not awaited beyond the port probe: Vite is useful while the backend boots,
// and the app is built to treat a missing backend as a normal state.
if (await portTaken(API_PORT)) {
  say("dev-all", `something is already serving :${API_PORT} — leaving it alone and starting Vite only.`);
} else {
  say("dev-all", `starting the backend on :${API_PORT}`);
  // PORT is set EXPLICITLY, and this is not belt-and-braces — it is the fix for
  // a bug that hides itself twice over. A supervisor launching this as a dev
  // server puts PORT=5173 in the environment, `--env-file` does NOT override a
  // variable that is already set, and the backend's banner prints
  // PUBLIC_ORIGIN rather than the port it actually bound. So the backend
  // cheerfully announced ":8787" while listening on 5173 — where Windows let it
  // share the socket with Vite instead of refusing — and every /api call died
  // as ECONNREFUSED against an empty 8787.
  start("api", ["--env-file=.env", "server/index.js"], { restart: true, env: { PORT: String(API_PORT) } });
}

say("dev-all", "starting Vite on :5173");
start("vite", ["node_modules/vite/bin/vite.js", ...process.argv.slice(2)]);
