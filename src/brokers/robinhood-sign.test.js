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

// ---------------------------------------------------------------------------
// Robinhood's own published example, from
// docs.robinhood.com/crypto/trading/#section/Authentication/Headers-and-Signature
//
// This is the strongest test in the file: it checks the whole algorithm —
// seed → PKCS#8 → Ed25519 → base64 — against a signature Robinhood generated
// themselves, rather than against our own idea of the format.
//
// READ THIS BEFORE "FIXING" THE BODY BELOW. Their example builds the message as
//
//     body = { "client_order_id": ..., "side": "buy", ... }   # a dict
//     message = f"{api_key}{current_timestamp}{path}{method}{body}"
//
// and `{body}` on a dict is Python's str(), which emits the REPR — single
// quotes, ", " separators — not JSON. So the published signature corresponds to
// a string no HTTP client would ever send as a request body. Their own working
// client (CryptoAPITrading.get_authorization_header) takes `body: str` and is
// handed json.dumps(...) instead.
//
// The repr is reproduced verbatim here because it is the only input that proves
// the crypto against their number. It is NOT what we send: rhSignatureMessage
// concatenates the real body string, and every call this app makes is a GET
// with no body at all.
describe("Robinhood's published example signature", () => {
  const SEED = "xQnTJVeQLmw1/Mg2YimEViSpw/SdJcgNXZ5kQkAXNPU=";
  const PUBLIC = "jPItx4TLjcnSUnmnXQQyAKL4eJj3+oWNNMmmm2vATqk=";
  const API_KEY = "rh-api-6148effc-c0b1-486c-8940-a1d099456be6";
  const TS = "1698708981";
  const PATH = "/api/v1/crypto/trading/orders/";
  const PYTHON_REPR_BODY =
    "{'client_order_id': '131de903-5a9c-4260-abc1-28d562a5dcf0', 'side': 'buy', " +
    "'symbol': 'BTC-USD', 'type': 'market', 'market_order_config': {'asset_quantity': '0.1'}}";
  const EXPECTED =
    "q/nEtxp/P2Or3hph3KejBqnw5o9qeuQ+hYRnB56FaHbjDsNUY9KhB1asMxohDnzdVFSD7StaTqjSd9U9HvaRAw==";

  // Isolates the PKCS#8 prefix from everything else: if this passes and the
  // signature fails, the bug is in the message, not the key handling.
  it("derives their published public key from their published seed", () => {
    const prefix = Buffer.from("302e020100300506032b657004220420", "hex");
    const key = crypto.createPrivateKey({
      key: Buffer.concat([prefix, Buffer.from(SEED, "base64")]),
      format: "der", type: "pkcs8",
    });
    const spki = crypto.createPublicKey(key).export({ format: "der", type: "spki" });
    expect(spki.subarray(spki.length - 32).toString("base64")).toBe(PUBLIC);
  });

  it("reproduces their signature byte for byte", () => {
    const message = `${API_KEY}${TS}${PATH}POST${PYTHON_REPR_BODY}`;
    expect(makeEd25519Signer(SEED)(message)).toBe(EXPECTED);
  });

  // The shape we actually send. Pinned so a future edit cannot quietly adopt
  // the doc example's Python-repr body for real requests.
  it("signs a real JSON body to something DIFFERENT — as it must", () => {
    const json = JSON.stringify({
      client_order_id: "131de903-5a9c-4260-abc1-28d562a5dcf0",
      side: "buy", symbol: "BTC-USD", type: "market",
      market_order_config: { asset_quantity: "0.1" },
    });
    expect(makeEd25519Signer(SEED)(`${API_KEY}${TS}${PATH}POST${json}`)).not.toBe(EXPECTED);
  });
});
