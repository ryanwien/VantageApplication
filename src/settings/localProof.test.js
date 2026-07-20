import { describe, it, expect } from "vitest";
import { isLocalModel, isPrivacyLocal, bannerState, gpuResidency, throughput, snapshotEnabled, restoreEnabled } from "./localProof.js";

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
    expect(isLocalModel(undefined)).toBeFalsy();
  });

  it("does not misclassify remote hosts that merely contain a loopback substring", () => {
    expect(isLocalModel({ kind: "openai", baseUrl: "https://notlocalhost.evil.com/api" })).toBe(false);
    expect(isLocalModel({ kind: "openai", baseUrl: "https://mylocalhost123.io/v1" })).toBe(false);
    expect(isLocalModel({ kind: "openai", baseUrl: "https://api.example.com/path?ref=127.0.0.1" })).toBe(false);
  });

  it("treats a scheme-less baseUrl pointing at loopback as local", () => {
    expect(isLocalModel({ kind: "openai", baseUrl: "localhost:11434" })).toBe(true);
    expect(isLocalModel({ kind: "openai", baseUrl: "127.0.0.1:8000" })).toBe(true);
  });

  it("treats the IPv6 loopback hostname as local", () => {
    expect(isLocalModel({ kind: "openai", baseUrl: "http://[::1]:8000/v1" })).toBe(true);
  });

  it("treats a malformed baseUrl as not local, without throwing", () => {
    expect(() => isLocalModel({ kind: "openai", baseUrl: "http://" })).not.toThrow();
    expect(isLocalModel({ kind: "openai", baseUrl: "http://" })).toBe(false);
    expect(isLocalModel({ kind: "openai", baseUrl: "not a url at all :::" })).toBe(false);
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

  it("reports local for an ollama model whose baseUrl is actually loopback", () => {
    expect(bannerState([ollama])).toEqual({ kind: "local" });
  });

  it("reports cloud for an ollama model pointed at a remote baseUrl, even though kind is ollama", () => {
    const remoteOllama = { id: "ollama", kind: "ollama", baseUrl: "https://my-ollama.example.com", enabled: true };
    expect(bannerState([remoteOllama])).toEqual({ kind: "cloud" });
  });
});

describe("isPrivacyLocal", () => {
  it("treats an ollama model at localhost as privacy-local", () => {
    expect(isPrivacyLocal(ollama)).toBe(true);
  });

  it("does NOT treat a remote-hosted ollama model as privacy-local, regardless of kind", () => {
    const remoteOllama = { id: "ollama", kind: "ollama", baseUrl: "https://my-ollama.example.com", enabled: true };
    expect(isPrivacyLocal(remoteOllama)).toBe(false);
  });

  it("treats LM Studio at localhost as privacy-local", () => {
    expect(isPrivacyLocal(lmstudio)).toBe(true);
  });

  it("treats a scheme-less loopback baseUrl as privacy-local", () => {
    expect(isPrivacyLocal({ kind: "openai", baseUrl: "localhost:11434" })).toBe(true);
  });

  it("treats the IPv6 loopback hostname as privacy-local", () => {
    expect(isPrivacyLocal({ kind: "openai", baseUrl: "http://[::1]:8000/v1" })).toBe(true);
  });

  it("treats a remote baseUrl as not privacy-local", () => {
    expect(isPrivacyLocal(openrouter)).toBe(false);
  });

  it("treats a malformed baseUrl as not privacy-local, without throwing", () => {
    expect(() => isPrivacyLocal({ kind: "ollama", baseUrl: "http://" })).not.toThrow();
    expect(isPrivacyLocal({ kind: "ollama", baseUrl: "http://" })).toBe(false);
    expect(isPrivacyLocal({ kind: "ollama", baseUrl: "not a url at all :::" })).toBe(false);
  });

  it("is falsy-safe", () => {
    expect(isPrivacyLocal(null)).toBeFalsy();
    expect(isPrivacyLocal(undefined)).toBeFalsy();
    expect(isPrivacyLocal({})).toBeFalsy();
  });
});

describe("gpuResidency", () => {
  it("reports 100% when the model is fully in VRAM", () => {
    expect(gpuResidency({ size: 4920753328, size_vram: 4920753328 }))
      .toEqual({ label: "100% GPU-resident", pct: 100, cpuOnly: false });
  });

  it("reports a partial split", () => {
    expect(gpuResidency({ size: 1000, size_vram: 400 }))
      .toEqual({ label: "40% GPU-resident", pct: 40, cpuOnly: false });
  });

  it("flags CPU-only when no VRAM is used", () => {
    expect(gpuResidency({ size: 1000, size_vram: 0 }))
      .toEqual({ label: "CPU-only", pct: 0, cpuOnly: true });
  });

  it("returns null for unusable input", () => {
    expect(gpuResidency(null)).toBeNull();
    expect(gpuResidency({ size: 0, size_vram: 0 })).toBeNull();
  });

  it("never names a GPU vendor", () => {
    const label = gpuResidency({ size: 1000, size_vram: 1000 }).label;
    expect(label).not.toMatch(/AMD|Radeon|ROCm|NVIDIA/i);
  });
});

describe("throughput", () => {
  it("converts eval counts and nanosecond durations to tokens/sec", () => {
    // 100 tokens in 2s (2e9 ns) => 50 tok/s
    expect(throughput({ eval_count: 100, eval_duration: 2e9 })).toBe(50);
  });

  it("rounds to a whole number", () => {
    expect(throughput({ eval_count: 100, eval_duration: 3e9 })).toBe(33);
  });

  it("returns null when the fields are missing or zero", () => {
    expect(throughput({})).toBeNull();
    expect(throughput({ eval_count: 10, eval_duration: 0 })).toBeNull();
    expect(throughput(null)).toBeNull();
  });
});

describe("snapshotEnabled / restoreEnabled", () => {
  const models = [
    { id: "ollama", kind: "ollama", baseUrl: "http://localhost:11434", enabled: false, apiKey: "" },
    { id: "openrouter", kind: "openai", baseUrl: "https://openrouter.ai/api/v1", enabled: true, apiKey: "sk-or-secret" },
  ];

  it("captures only the enabled flags", () => {
    expect(snapshotEnabled(models)).toEqual({ ollama: false, openrouter: true });
  });

  it("restores the previous enabled flags", () => {
    const snap = snapshotEnabled(models);
    const soloed = models.map((m) => ({ ...m, enabled: m.id === "ollama" }));
    const restored = restoreEnabled(soloed, snap);
    expect(restored.map((m) => m.enabled)).toEqual([false, true]);
  });

  it("PRESERVES API KEYS through a snapshot/solo/restore cycle", () => {
    // The regression that matters most: a demo preset must never cost a user
    // their credentials.
    const snap = snapshotEnabled(models);
    const soloed = models.map((m) => ({ ...m, enabled: m.id === "ollama" }));
    const restored = restoreEnabled(soloed, snap);
    expect(restored.find((m) => m.id === "openrouter").apiKey).toBe("sk-or-secret");
    expect(soloed.find((m) => m.id === "openrouter").apiKey).toBe("sk-or-secret");
  });

  it("leaves models absent from the snapshot untouched", () => {
    const restored = restoreEnabled(models, { ollama: true });
    expect(restored.find((m) => m.id === "openrouter").enabled).toBe(true);
    expect(restored.find((m) => m.id === "ollama").enabled).toBe(true);
  });
});
