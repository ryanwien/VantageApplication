// A self-signed certificate for the loopback address, so the SCHWAB CALLBACK
// can actually be served.
//
//   node scripts/make-dev-cert.mjs [--force]
//
// WHY THIS EXISTS
// Schwab's OAuth callback must be HTTPS. Their portal accepts a loopback
// address for an individual developer app, but not http:// — and this server
// calls http.createServer, so until now nothing answered TLS on any port and a
// real Schwab callback would have died at the handshake with
// ERR_SSL_PROTOCOL_ERROR, which reads like a network fault rather than a
// missing listener.
//
// The callback URL is compared as an exact STRING by Schwab and is fixed at
// REGISTRATION. So this has to exist BEFORE the app is submitted, not after the
// key comes back: getting it wrong means editing the registration and, in their
// portal, waiting on review again.
//
// WHAT IT IS NOT
// This certificate is trusted by nobody. The browser will interrupt the Schwab
// redirect once with a warning, which you click through; the token exchange
// itself is server-to-server against api.schwabapi.com over real TLS and is
// unaffected. Do not put this anywhere but a development machine — and it is
// written under server/certs/, which is gitignored, so it cannot be committed
// by accident.
//
// The private key is written straight to disk and never printed. A secret that
// reaches a terminal is in the scroll buffer.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DIR = path.join("server", "certs");
const KEY = path.join(DIR, "dev-localhost.key");
const CRT = path.join(DIR, "dev-localhost.crt");
const force = process.argv.includes("--force");

const die = (msg) => { console.error(msg); process.exit(1); };

// Refusing to overwrite is the whole safety property of running this twice:
// regenerating silently would swap the certificate under a browser that had
// already been told to accept the old one, and the next callback would fail
// with a warning the user thought they had already dismissed.
if (!force && (fs.existsSync(KEY) || fs.existsSync(CRT))) {
  console.log(`A development certificate already exists:\n  ${CRT}\n  ${KEY}\n\nNothing written. Pass --force to replace it (the browser will then ask you to\ntrust the new one the first time it sees it).`);
  process.exit(0);
}

// Spawned as an argv ARRAY, never a shell string. Through a shell on Windows,
// MSYS rewrites a leading-slash argument such as "/CN=127.0.0.1" into a
// drive path, and the certificate ends up with a subject nobody asked for.
let version;
try {
  version = execFileSync("openssl", ["version"], { encoding: "utf8" }).trim();
} catch {
  die([
    "openssl is not on PATH, and this script needs it to build the certificate.",
    "",
    "Git for Windows ships one — try a Git Bash shell, where it lives at",
    "/mingw64/bin/openssl. Otherwise install OpenSSL and re-run.",
  ].join("\n"));
}

fs.mkdirSync(DIR, { recursive: true });

// subjectAltName is the part that matters and the part most often left out: a
// modern browser ignores the Common Name entirely, so a certificate without an
// IP SAN for 127.0.0.1 is rejected before the warning page even offers to
// continue. serverAuth is required for the same reason.
const args = [
  "req", "-x509", "-newkey", "rsa:2048", "-sha256", "-days", "825", "-nodes",
  "-keyout", KEY, "-out", CRT,
  "-subj", "/CN=127.0.0.1",
  "-addext", "subjectAltName=IP:127.0.0.1,DNS:localhost",
  "-addext", "keyUsage=critical,digitalSignature,keyEncipherment",
  "-addext", "extendedKeyUsage=serverAuth",
];

try {
  execFileSync("openssl", args, { stdio: ["ignore", "ignore", "pipe"] });
} catch (e) {
  die(`openssl refused to build the certificate:\n${String(e.stderr || e.message).trim()}`);
}

// Prove it before claiming it. A file that exists is not a certificate that
// parses, and a mismatched key/certificate pair fails only at the first TLS
// handshake — which would be during a Schwab redirect, the least debuggable
// moment available.
let cert;
try {
  cert = new crypto.X509Certificate(fs.readFileSync(CRT));
} catch (e) {
  die(`Wrote a file that is not a readable certificate: ${e.message}`);
}
const key = crypto.createPrivateKey(fs.readFileSync(KEY));
if (!cert.checkPrivateKey(key)) die("The certificate and the private key do not match — nothing here would serve.");

console.log(`${version}\n`);
console.log(`certificate  ${CRT}`);
console.log(`private key  ${KEY}  (not printed, and gitignored)`);
console.log(`subject      ${cert.subject.replace(/\n/g, " ")}`);
console.log(`covers       ${(cert.subjectAltName || "—").replace(/\n/g, " ")}`);
console.log(`valid until  ${cert.validTo}`);
console.log(`fingerprint  ${cert.fingerprint256}`);
console.log([
  "",
  "Restart the server. It will serve TLS on TLS_PORT (default 8788) alongside",
  "the plain-HTTP API on PORT, and the boot banner will name the callback URL",
  "to register with Schwab — paste that string exactly.",
].join("\n"));
