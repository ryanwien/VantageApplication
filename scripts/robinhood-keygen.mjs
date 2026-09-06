// Generate the Ed25519 key pair Robinhood's Crypto Trading API wants.
//
//   node scripts/robinhood-keygen.mjs
//
// WHY THIS EXISTS
// Robinhood does not issue you a private key. You generate the pair, hand them
// the PUBLIC half at https://robinhood.com/account/crypto (web classic), and
// they return an API key. Their docs show a Python script using pynacl for the
// generation step; Node has Ed25519 built in, so this is that step without the
// dependency — and, more usefully, without the private key ever being printed.
//
// WHAT IT DOES WITH EACH HALF
//   public key  → printed, because you have to paste it into Robinhood.
//   private key → written straight into .env as ROBINHOOD_PRIVATE_KEY and never
//                 displayed. A secret that reaches a terminal is in the scroll
//                 buffer, and on a shared screen it is simply gone.
//
// It refuses to overwrite an existing private key without --force: that value
// is one half of a credential Robinhood is already holding the other half of,
// and replacing it silently turns every signed request into an indistinguishable
// 401.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ed25519SeedFrom, makeEd25519Signer } from "../src/brokers/robinhood-sign.js";

const ENV_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
const force = process.argv.includes("--force");

// ---------- generate ----------
const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const seedB64 = ed25519SeedFrom(privateKey);
// SPKI DER ends with the 32 raw public-key bytes — the same encoding PyNaCl's
// verify_key.encode() produces, which is what Robinhood's form expects.
const spki = publicKey.export({ format: "der", type: "spki" });
const publicB64 = spki.subarray(spki.length - 32).toString("base64");

// ---------- prove it before writing it ----------
// The seed is re-wrapped through the same PKCS#8 path the server signs with, so
// what gets written to .env is verified to work rather than merely generated.
// A key pair that cannot sign is worth catching here and not at 401 o'clock.
const signature = Buffer.from(makeEd25519Signer(seedB64)("round-trip"), "base64");
if (!crypto.verify(null, Buffer.from("round-trip", "utf8"), publicKey, signature)) {
  console.error("Generated pair failed its own signature check — refusing to write it.");
  process.exitCode = 2;
} else {
  // ---------- write the private half ----------
  let env = "";
  try { env = fs.readFileSync(ENV_PATH, "utf8"); }
  catch { console.error(`No .env at ${ENV_PATH}. Create it first.`); process.exitCode = 2; }

  if (process.exitCode !== 2) {
    const line = /^ROBINHOOD_PRIVATE_KEY=(.*)$/m;
    const existing = env.match(line)?.[1]?.trim();
    if (existing && !force) {
      console.error("ROBINHOOD_PRIVATE_KEY is already set.");
      console.error("Robinhood holds the matching public key, so replacing this half breaks the");
      console.error("credential. Delete that credential in your crypto account settings first,");
      console.error("then re-run with --force.");
      process.exitCode = 1;
    } else {
      // Preserve the file's existing line endings: .env is edited by hand on a
      // Windows machine and rewriting 140 lines to LF would show up as a whole
      // -file diff over a one-line change.
      const eol = env.includes("\r\n") ? "\r\n" : "\n";
      const next = line.test(env)
        ? env.replace(line, `ROBINHOOD_PRIVATE_KEY=${seedB64}`)
        : env.replace(/\s*$/, "") + `${eol}ROBINHOOD_PRIVATE_KEY=${seedB64}${eol}`;
      fs.writeFileSync(ENV_PATH, next, "utf8");

      console.log("Key pair generated and verified by signature round-trip.\n");
      console.log("PUBLIC KEY — paste this into Robinhood:\n");
      console.log("  " + publicB64 + "\n");
      console.log("Private key written to .env as ROBINHOOD_PRIVATE_KEY (not shown here, and");
      console.log(".env is gitignored). Robinhood never needs it and will never ask for it.\n");
      console.log("Next:");
      console.log("  1. https://robinhood.com/account/crypto   (web classic)");
      console.log("  2. Create credentials, paste the public key above.");
      console.log("  3. Copy the API key it gives back into ROBINHOOD_API_KEY in .env.");
      console.log("  4. npm run check:brokers");
    }
  }
}
