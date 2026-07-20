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
