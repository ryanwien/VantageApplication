import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { makeEd25519Signer, ed25519SeedFrom } from "./robinhood-sign.js";
import { rhSignatureMessage } from "./robinhood.js";

describe("makeEd25519Signer", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const seed = ed25519SeedFrom(privateKey);

  it("reconstructs a usable key from a bare 32-byte seed", () => {
    // The whole point: Robinhood hands out a seed, not a PKCS#8 key, and the
    // DER prefix in the module is what bridges the two. If that constant were
    // wrong, this signature would not verify.
    expect(Buffer.from(seed, "base64")).toHaveLength(32);
    const sign = makeEd25519Signer(seed);
    const msg = rhSignatureMessage("KEY", 1700000000, "/api/v1/crypto/trading/holdings/", "GET");
    const sig = Buffer.from(sign(msg), "base64");
    expect(sig).toHaveLength(64);
    expect(crypto.verify(null, Buffer.from(msg, "utf8"), publicKey, sig)).toBe(true);
  });

  it("signs the exact message it is given — a different path is a different signature", () => {
    const sign = makeEd25519Signer(seed);
    const a = sign(rhSignatureMessage("KEY", 1, "/holdings/", "GET"));
    const b = sign(rhSignatureMessage("KEY", 1, "/holdings/?cursor=x", "GET"));
    expect(a).not.toBe(b);
  });

  it("is deterministic — Ed25519 signatures are not randomised", () => {
    const sign = makeEd25519Signer(seed);
    expect(sign("same")).toBe(sign("same"));
  });

  it("accepts the 64-byte seed+public form some tools emit", () => {
    const long = Buffer.concat([Buffer.from(seed, "base64"), Buffer.alloc(32, 7)]).toString("base64");
    const sig = Buffer.from(makeEd25519Signer(long)("m"), "base64");
    expect(crypto.verify(null, Buffer.from("m", "utf8"), publicKey, sig)).toBe(true);
  });

  it("refuses a key that is not a seed, with a message naming what it wanted", () => {
    for (const bad of ["", "abc", undefined, null]) {
      expect(() => makeEd25519Signer(bad)).toThrow(/Ed25519 seed/);
    }
  });
});
