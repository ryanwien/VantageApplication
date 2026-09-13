// Reset the password on a local account.
//
//   node scripts/reset-password.mjs                  list the accounts
//   node scripts/reset-password.mjs you@example.com  set that one's password
//
// WHY THIS EXISTS
// The "Forgot password?" note in the sign-in gate says, when the backend is up:
// "Whoever runs the server can reset it for you directly." Until now there was
// no way to do that. On a dev box the person who forgot the password and the
// person who runs the server are the same person, so the promise pointed at
// nobody and the account was simply lost.
//
// THE TRAP THIS SCRIPT REFUSES TO WALK INTO
// server/index.js reads users.json ONCE at boot into `USERS`, and every later
// change writes that whole in-memory object back over the file. So editing
// users.json under a running server fails twice over: the running process keeps
// checking the OLD hash, and its next save overwrites the new one. The reset
// looks like it worked and silently isn't there. So: if the server answers,
// this stops and says to stop it first. --force skips the check for when you
// are about to restart anyway.
//
// It never prints, echoes, logs or stores the password you type, and it never
// prints a hash. The only thing it puts on screen is which account changed.
//
// Exit codes: 0 done - 1 refused (server up, bad password, unknown account) -
// 2 the question could not be asked at all (no users.json, no terminal).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { passwordCheck, PW_MIN } from "../src/auth/password.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_FILE = path.join(__dirname, "..", "server", "users.json");
const SESSIONS_FILE = path.join(__dirname, "..", "server", "sessions.json");
const PORT = process.env.PORT || 8787;

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const email = argv.find(a => !a.startsWith("-"))?.trim().toLowerCase() || "";

const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const writeJSON = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2));
const day = (t) => (t ? new Date(t).toISOString().slice(0, 10) : "-");

// ---------- the same hash the server writes ----------
// Copied deliberately, not imported: hashPw lives inside server/index.js, which
// starts listening the moment it is imported. If it ever moves to a module,
// import it here instead - two copies of a hash is how accounts stop opening.
const hashPw = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  return { salt, hash: crypto.scryptSync(String(password), salt, 64).toString("hex") };
};

// ---------- is the server holding users.json in memory right now? ----------
async function serverIsUp() {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 1200);
    const r = await fetch(`http://127.0.0.1:${PORT}/api/status`, { signal: ctrl.signal });
    clearTimeout(to);
    return r.ok;
  } catch { return false; }
}

// ---------- a password typed with nothing on screen ----------
// Raw mode rather than readline so not one character is echoed, and so a
// terminal that cannot do it fails loudly instead of showing the password to
// whoever is looking at the screen.
const CTRL_C = String.fromCharCode(3);
const DEL = String.fromCharCode(127);
const BS = String.fromCharCode(8);
function promptHidden(label) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) return reject(new Error("no-tty"));
    stdout.write(label);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let buf = "";
    const done = (err, val) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      stdout.write("\n");
      err ? reject(err) : resolve(val);
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return done(null, buf);
        if (ch === CTRL_C) return done(new Error("cancelled"));
        if (ch === DEL || ch === BS) { buf = buf.slice(0, -1); continue; }
        if (ch < " ") continue;            // ignore arrows, tabs, the rest
        buf += ch;
      }
    };
    stdin.on("data", onData);
  });
}

// ---------- list ----------
function list(users) {
  const rows = Object.values(users);
  if (!rows.length) { console.log("No accounts yet - sign up in the app first."); return; }
  console.log(`${rows.length} account${rows.length === 1 ? "" : "s"} in server/users.json:\n`);
  const w = Math.max(...rows.map(u => String(u.email).length));
  for (const u of rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))) {
    const pw = u.salt && u.hash ? "password set" : "NO PASSWORD (social sign-in only)";
    console.log(`  ${String(u.email).padEnd(w)}  plan ${String(u.plan || "free").padEnd(5)}  joined ${day(u.createdAt)}  ${pw}`);
  }
  console.log("\nReset one:  node scripts/reset-password.mjs <email>");
}

// ---------- main ----------
const users = readJSON(USERS_FILE);
if (!users) {
  console.error("No server/users.json - nobody has signed up on this machine yet.");
  process.exit(2);
}

if (!email || has("--list")) { list(users); process.exit(0); }

const rec = users[email];
if (!rec) {
  console.error(`No account for ${email}.\n`);
  list(users);
  process.exit(1);
}

if (!has("--force") && await serverIsUp()) {
  console.error(
    `The server is running on :${PORT}, and it holds users.json in memory.\n` +
    "A reset written now would be ignored by the running process and overwritten by its next save.\n\n" +
    "  1. stop the server (Ctrl-C in the window running dev-all / npm run server)\n" +
    `  2. node scripts/reset-password.mjs ${email}\n` +
    "  3. start it again\n\n" +
    "If you are about to restart it anyway, pass --force."
  );
  process.exit(1);
}

let pw;
try {
  pw = await promptHidden(`New password for ${email} (at least ${PW_MIN} characters, nothing shows as you type): `);
  const verdict = passwordCheck(pw, { email });
  if (!verdict.ok) { console.error(verdict.blocking); process.exit(1); }
  const again = await promptHidden("Type it again: ");
  if (again !== pw) { console.error("The two passwords don't match - nothing was changed."); process.exit(1); }
} catch (e) {
  if (e.message === "no-tty") {
    console.error("This needs a real terminal - it turns off echo so the password never appears on screen.");
    process.exit(2);
  }
  console.error("Cancelled - nothing was changed.");
  process.exit(1);
}

const { salt, hash } = hashPw(pw);
users[email] = { ...rec, salt, hash, passwordResetAt: Date.now() };
writeJSON(USERS_FILE, users);

// Old sessions outlive a password change unless something removes them, and a
// forgotten password is exactly the case where you want the old ones gone.
let revoked = 0;
if (!has("--keep-sessions")) {
  const sessions = readJSON(SESSIONS_FILE) || {};
  for (const [tok, s] of Object.entries(sessions)) {
    const who = typeof s === "string" ? s : s?.email;
    if (who === email) { delete sessions[tok]; revoked++; }
  }
  if (revoked) writeJSON(SESSIONS_FILE, sessions);
}

console.log(`Password set for ${email}.`);
if (revoked) console.log(`Signed out ${revoked} old session${revoked === 1 ? "" : "s"} on that account.`);
console.log("Start the server and log in.");
