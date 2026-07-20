// Pure derivations behind the settings "local proof" UI. Kept out of React.jsx
// so they can be unit-tested — React.jsx has no test seam.

// A model is local when it is Ollama, or when its baseUrl points at loopback.
export const isLocalModel = (m) =>
  !!(m && (m.kind === "ollama" || (m.baseUrl && /localhost|127\.0\.0\.1/.test(m.baseUrl))));

// Which banner the AI tab shows. Derived on every render from aiModels, so it
// cannot drift from the actual model configuration.
export function bannerState(aiModels) {
  const enabled = (aiModels || []).filter((m) => m && m.enabled);
  if (enabled.length === 0) return { kind: "none" };
  return { kind: enabled.every(isLocalModel) ? "local" : "cloud" };
}
