import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { passwordCheck, PW_MIN, WEAK_PASSWORDS } from "./password.js";

describe("passwordCheck — the blocking gate", () => {
  it("rejects an empty password", () => {
    const r = passwordCheck("");
    expect(r.ok).toBe(false);
    expect(r.blocking).toMatch(/choose a password/i);
  });

  it("rejects anything under the minimum and says how much is missing", () => {
    const r = passwordCheck("abcde");
    expect(r.ok).toBe(false);
    expect(r.blocking).toContain(String(PW_MIN - 5));
  });

  it("accepts exactly the minimum length", () => {
    expect(passwordCheck("kh8Twqpz").ok).toBe(true);
  });

  it("rejects top-of-the-leak-list passwords regardless of case", () => {
    expect(passwordCheck("password123").ok).toBe(false);
    expect(passwordCheck("PassWord123").ok).toBe(false);
    expect(passwordCheck("QWERTYUIOP").ok).toBe(false);
  });

  it("rejects a password that contains the email's local part", () => {
    const r = passwordCheck("ryanwien3d!", { email: "ryanwien3d@example.com" });
    expect(r.ok).toBe(false);
    expect(r.blocking).toMatch(/email address/i);
  });

  it("ignores the email rule when the local part is too short to be meaningful", () => {
    // "ab" would otherwise reject half the dictionary.
    expect(passwordCheck("abstraction42", { email: "ab@example.com" }).ok).toBe(true);
  });

  it("rejects a long password built from one or two characters", () => {
    expect(passwordCheck("aaaaaaaaaaaa").ok).toBe(false);
    expect(passwordCheck("ababababababab").ok).toBe(false);
    expect(passwordCheck("abcabcabcabc").ok).toBe(true);
  });

  it("never returns a null blocking message while ok is false", () => {
    for (const bad of ["", "a", "password", "aaaaaaaa"]) {
      const r = passwordCheck(bad);
      expect(r.ok).toBe(false);
      expect(typeof r.blocking).toBe("string");
      expect(r.blocking.length).toBeGreaterThan(0);
    }
  });

  it("tolerates a non-string input instead of throwing", () => {
    expect(passwordCheck(undefined).ok).toBe(false);
    expect(passwordCheck(null).ok).toBe(false);
    expect(passwordCheck(12345678).ok).toBe(false);
  });
});

describe("passwordCheck — the advisory score", () => {
  it("scores a blocked password at zero", () => {
    expect(passwordCheck("abc").score).toBe(0);
    expect(passwordCheck("password").score).toBe(0);
  });

  it("rewards length over character variety", () => {
    const longPlain = passwordCheck("correcthorsebatterystaple"); // 25 chars, one class
    const shortBusy = passwordCheck("aB3$xY7z");                  // 8 chars, four classes
    expect(longPlain.score).toBeGreaterThan(shortBusy.score);
  });

  it("climbs monotonically as the same password gets longer", () => {
    const seen = ["kh8Twqpz", "kh8Twqpzrb4M", "kh8Twqpzrb4MnvQ7"].map(p => passwordCheck(p).score);
    expect(seen[1]).toBeGreaterThanOrEqual(seen[0]);
    expect(seen[2]).toBeGreaterThanOrEqual(seen[1]);
  });

  it("caps the score at 4 and always pairs it with a label", () => {
    const r = passwordCheck("kh8Twqpz!rb4MnvQ7wSd2");
    expect(r.score).toBeLessThanOrEqual(4);
    expect(r.label).toBe("Strong");
  });

  it("labels every reachable score", () => {
    const labels = new Set();
    for (const p of ["abc", "kh8Twqpz", "kh8Twqpzrb4", "kh8Twqpzrb4M", "kh8Twqpz!rb4MnvQ7wSd2"]) {
      const r = passwordCheck(p);
      expect(typeof r.label).toBe("string");
      labels.add(r.label);
    }
    expect(labels.size).toBeGreaterThan(2);
  });
});

// ---------------------------------------------------------------------------
// The blocklist's own comment says it carries "the ones this app's own name
// invites". That is a promise about a moving target: the app has been renamed
// twice, and each time the entries went stale silently — the list kept guarding
// the previous product name while users were being handed the new one. Nothing
// failed, because a blocklist that blocks the wrong word still blocks something.
//
// This derives the name from package.json rather than hardcoding it, so the
// next rename either updates the list or turns this red.
// ---------------------------------------------------------------------------
describe("the blocklist tracks the product's actual name", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  // "marketnarrator-dashboard" -> "marketnarrator"
  const product = pkg.name.split("-")[0];

  it("derives a product name worth guarding", () => {
    expect(product.length).toBeGreaterThan(3);
  });

  it("rejects the product name with the suffixes people actually append", () => {
    for (const pw of [`${product}1`, `${product}123`]) {
      const r = passwordCheck(pw);
      expect(r.ok, `${pw} should be refused as a guessable password`).toBe(false);
    }
  });

  it("carries no entry for a name the product no longer has", () => {
    // Left behind after a rename, a stale entry is dead weight that reads as
    // protection. Anything in the list shaped like a former brand fails here.
    const stale = [...WEAK_PASSWORDS].filter(p => /^(vantage|marketminds|tape)\d*$/.test(p));
    expect(stale).toEqual([]);
  });
});
