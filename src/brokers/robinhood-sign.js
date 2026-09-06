// ============================================================
//  Robinhood request signing — Ed25519 over the message shape in robinhood.js.
//
//  SEPARATE FILE, ON PURPOSE. This one imports node:crypto, so it is
//  server-only; robinhood.js stays free of node built-ins and can be imported
//  by the browser bundle without breaking the Vite build. Nothing here belongs
//  in the client anyway — it handles a private key.
//
//  THE SEED PROBLEM
//  Robinhood's key generator prints a base64 Ed25519 SEED: 32 raw bytes, 44
//  base64 characters. Node's createPrivateKey cannot import that directly — it
//  wants PKCS#8 DER — so the seed is wrapped in the fixed 16-byte header below.
//  That header is not a magic number to be tweaked: it is the complete ASN.1
//  prelude for an Ed25519 private key (SEQUENCE, version 0, the 1.3.101.112
//  algorithm identifier, and the OCTET STRING wrapper), identical for every key
//  of this type. Its correctness is verified by a signature round-trip in the
//  tests rather than asserted here.
// ============================================================
import crypto from "node:crypto";

const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

// Build a signer from the base64 seed. Returns (message) => base64 signature,
// which is exactly what rhHeaders() wants for x-signature.
export function makeEd25519Signer(base64Seed) {
  const raw = Buffer.from(String(base64Seed || ""), "base64");
  if (raw.length < 32) {
    throw new Error("ROBINHOOD_PRIVATE_KEY is not a valid Ed25519 seed — expected 32 bytes of base64 (44 characters).");
  }
  // Robinhood emits a 32-byte seed; some tools emit seed+public concatenated
  // to 64. Take the first 32 either way rather than rejecting the longer form.
  const key = crypto.createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, raw.subarray(0, 32)]),
    format: "der",
    type: "pkcs8",
  });
  // Ed25519 signs the message itself — the algorithm argument MUST be null.
  // Passing a hash name here throws rather than silently signing differently,
  // which is the one mercy in this API.
  return (message) => crypto.sign(null, Buffer.from(message, "utf8"), key).toString("base64");
}

// The seed for a freshly generated key, for tests and for a setup script that
// wants to show the operator what to paste. Never called at request time.
export function ed25519SeedFrom(privateKey) {
  const der = privateKey.export({ format: "der", type: "pkcs8" });
  return der.subarray(der.length - 32).toString("base64");
}
