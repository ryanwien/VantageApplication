// Pure derivations behind the settings "local proof" UI. Kept out of React.jsx
// so they can be unit-tested — React.jsx has no test seam.

// new URL().hostname serializes IPv6 addresses with brackets, so "::1" is
// matched as "[::1]".
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Parses a baseUrl's hostname, tolerating scheme-less values like
// "localhost:11434" (which new URL() does NOT parse as host+port). Returns
// null when the value cannot be parsed as a URL at all.
function hostnameOf(baseUrl) {
  const withScheme = baseUrl.includes("://") ? baseUrl : `http://${baseUrl}`;
  try {
    return new URL(withScheme).hostname;
  } catch {
    return null;
  }
}

// A model is local when it is Ollama, or when its baseUrl's hostname is
// exactly a loopback address. A substring match would misclassify remote
// hosts such as "https://notlocalhost.evil.com" as local.
export const isLocalModel = (m) =>
  !!(m && (m.kind === "ollama" || (m.baseUrl && LOOPBACK_HOSTNAMES.has(hostnameOf(m.baseUrl)))));

// Which banner the AI tab shows. Derived on every render from aiModels, so it
// cannot drift from the actual model configuration.
export function bannerState(aiModels) {
  const enabled = (aiModels || []).filter((m) => m && m.enabled);
  if (enabled.length === 0) return { kind: "none" };
  return { kind: enabled.every(isLocalModel) ? "local" : "cloud" };
}

// Residency from Ollama GET /api/ps. Reports only what the API actually knows:
// how much of the model sits in VRAM. Ollama does not report GPU vendor, so no
// vendor string is ever produced here — see the spec's "Vendor honesty" section.
export function gpuResidency(psModel) {
  if (!psModel || !psModel.size) return null;
  const vram = psModel.size_vram || 0;
  const pct = Math.round((vram / psModel.size) * 100);
  if (pct === 0) return { label: "CPU-only", pct: 0, cpuOnly: true };
  return { label: `${pct}% GPU-resident`, pct, cpuOnly: false };
}

// Tokens/sec from the final streaming chunk. Ollama reports eval_duration in
// nanoseconds.
export function throughput(chunk) {
  if (!chunk || !chunk.eval_count || !chunk.eval_duration) return null;
  return Math.round(chunk.eval_count / (chunk.eval_duration / 1e9));
}

// Capture which models were enabled, so "run local-only" can be undone.
// Only the enabled flag is recorded — API keys are never read or written here.
export function snapshotEnabled(aiModels) {
  const snap = {};
  for (const m of aiModels || []) snap[m.id] = !!m.enabled;
  return snap;
}

// Re-apply a snapshot. Models missing from the snapshot keep their current flag.
export function restoreEnabled(aiModels, snapshot) {
  if (!snapshot) return aiModels;
  return (aiModels || []).map((m) =>
    Object.prototype.hasOwnProperty.call(snapshot, m.id) ? { ...m, enabled: snapshot[m.id] } : m
  );
}
