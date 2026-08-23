import { describe, it, expect } from "vitest";
import { passwordCheck, PW_MIN } from "./password.js";

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
