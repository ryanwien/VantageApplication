import { describe, it, expect } from "vitest";
import { isLocalModel, bannerState } from "./localProof.js";

const ollama = { id: "ollama", kind: "ollama", baseUrl: "http://localhost:11434", enabled: true };
const lmstudio = { id: "lmstudio", kind: "openai", baseUrl: "http://localhost:1234/v1", enabled: true };
const openrouter = { id: "openrouter", kind: "openai", baseUrl: "https://openrouter.ai/api/v1", enabled: true };

describe("isLocalModel", () => {
  it("treats the ollama kind as local", () => {
    expect(isLocalModel(ollama)).toBe(true);
  });

  it("treats any localhost baseUrl as local", () => {
    expect(isLocalModel(lmstudio)).toBe(true);
    expect(isLocalModel({ kind: "openai", baseUrl: "http://127.0.0.1:8000/v1" })).toBe(true);
  });

  it("treats a remote baseUrl as not local", () => {
    expect(isLocalModel(openrouter)).toBe(false);
  });

  it("is falsy-safe", () => {
    expect(isLocalModel(null)).toBeFalsy();
    expect(isLocalModel({})).toBeFalsy();
  });
});

describe("bannerState", () => {
  it("reports local when every enabled model is local", () => {
    expect(bannerState([ollama, { ...openrouter, enabled: false }])).toEqual({ kind: "local" });
  });

  it("reports cloud when any enabled model is remote", () => {
    expect(bannerState([ollama, openrouter])).toEqual({ kind: "cloud" });
  });

  it("reports none when nothing is enabled", () => {
    expect(bannerState([{ ...ollama, enabled: false }])).toEqual({ kind: "none" });
  });

  it("reports none for an empty list", () => {
    expect(bannerState([])).toEqual({ kind: "none" });
  });
});
