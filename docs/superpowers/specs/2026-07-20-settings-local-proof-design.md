# Settings: local-inference proof bundle (Bundle A)

**Date:** 2026-07-20
**Status:** approved, pending implementation plan
**Scope:** Settings page, AI tab (`settingsTab === "models"`) + START tab status board

## Context

The Vantage settings page has six tabs (`ACCOUNT · START · DATA · AI · VOICE · MEET`,
defined at `React.jsx:7837`). The START tab already does onboarding well: a one-key
path, a status board of ●/○ chips that deep-link into the owning tab, and full i18n.

This spec covers **Bundle A** of a larger settings backlog — the four ideas that make
the app *show* that inference is running locally. They share one underlying signal
(local/GPU state), which is why they belong in a single increment.

Bundles B (onboarding friction), C (diagnostics / export-import), and D (visual polish)
are deliberately **out of scope** here and will follow as separate specs.

## Goals

1. A user (or judge) can tell at a glance whether queries leave the device.
2. When a local model is loaded, the app shows verifiable evidence of GPU residency.
3. Reaching a clean "local only" state is one click and is non-destructive.
4. Multi-turn memory controls are visible rather than buried.

## Non-goals

- Claiming or detecting a **GPU vendor** in-app. See "Vendor honesty" below.
- Any change to inference behaviour, routing, or fallback order.
- Backend (`server/index.js`) changes. This bundle is client-only.

## Components

### 1. Local/cloud banner

Top of the AI tab. Derived from existing state — no new dependencies.

```js
const enabled  = aiModels.filter(m => m.enabled);
const allLocal = enabled.length > 0 && enabled.every(isLocalModel);
```

| State | Rendering |
| --- | --- |
| `enabled.length > 0 && allLocal` | green (`C.up`): `🔒 FULLY LOCAL · nothing leaves this device` |
| any enabled model is not local | amber (`C.amber`): `☁ CLOUD ENABLED · queries leave this device` |
| `enabled.length === 0` | muted: `no model enabled` |

Reuses `isLocalModel` (`React.jsx:6350`). All strings go through `t()`.

### 2. Inference telemetry

Poll Ollama `GET {baseUrl}/api/ps` while the AI tab is open, and render per loaded model:

```
llama3.1 · 4.9 GB · 100% GPU-resident · 42 tok/s
```

- **GPU residency** = `size_vram / size` from `/api/ps`, rendered as a percentage.
  `size_vram === 0` renders as `CPU-only` in amber — this is the silent-CPU-fallback
  case that `HACKATHON-AMD.md:158` warns about, and it must be visible.
- **Throughput** = `eval_count / eval_duration * 1e9` tok/s, captured from the final
  streaming chunk in `askOllama` (`React.jsx:5639`).
- Polling only while the tab is open; stopped on unmount. Failure is non-fatal — the
  strip renders `unavailable` and the rest of the tab is unaffected.

`/api/ps` is not currently used anywhere in the codebase; this is net-new.

#### Vendor honesty (deliberate constraint)

Ollama's API reports VRAM residency but **not the GPU vendor**. The app therefore must
not render "AMD", "Radeon", or "ROCm" as detected fact — on the current development
machine that string would print over an NVIDIA RTX 4080.

`HACKATHON-AMD.md:158` identifies an unfalsifiable hardware claim as the single thing
most likely to sink the submission. Vendor proof stays where it is actually verifiable:
`rocm-smi` and `ollama ps` on camera. The in-app strip shows only residency and
throughput, both of which are true regardless of vendor.

### 3. Demo preset

A `⚡ Demo preset` button in the AI tab:

- sets `enabled: false` on every non-local model,
- sets `enabled: true` on the Ollama entry,
- **does not read, clear, or overwrite any stored API key.**

Destroying user credentials to make a demo look clean is not an acceptable trade; the
"no keys" claim is satisfied by nothing being *enabled*, not by data loss. A paired
`restore` button re-enables whatever was enabled before, from a snapshot held in
component state for the session.

### 4. Memory controls

Promote the existing multi-turn memory affordances:

- a labelled block in the AI tab showing the current stored turn count,
- the existing `forget conversation` action alongside it,
- a `Memory` chip on the START status board, consistent with the existing chip pattern
  (`React.jsx:7854-7862`).

Multi-turn memory is a scored criterion in the AMD submission, so it should not require
hunting to find.

## Data flow

```
aiModels (existing state) ──> isLocalModel() ──> banner state
Ollama /api/ps  ──poll──> { size, size_vram } ──> residency %
askOllama final chunk ──> { eval_count, eval_duration } ──> tok/s
Demo preset ──> updateModel(id, {enabled}) ──> aiModels ──> banner recomputes
```

The banner is fully derived state — it cannot drift from the model config, because it is
recomputed from `aiModels` on every render rather than stored.

## Error handling

| Failure | Behaviour |
| --- | --- |
| `/api/ps` unreachable (Ollama down, CORS) | telemetry strip shows `unavailable`; banner and the rest of the tab still work |
| `/api/ps` reachable, no models loaded | strip shows `no model loaded` |
| `size_vram === 0` | `CPU-only` in amber — surfaced, never hidden |
| missing `eval_count` / `eval_duration` | omit tok/s, keep residency |

No failure in this bundle may block model configuration or inference.

## Testing

- **Banner:** local-only, cloud-only, mixed, and none-enabled configurations each render
  the expected variant.
- **Telemetry:** `size_vram === size` → `100% GPU-resident`; `size_vram === 0` →
  `CPU-only`; fetch rejection → `unavailable`.
- **Demo preset:** after clicking, no cloud model is enabled, Ollama is enabled, and every
  previously stored `apiKey` value is byte-identical to before. This is the regression that
  matters most — assert it explicitly.
- **Memory block:** turn count matches stored conversation length; `forget conversation`
  clears it and the count returns to zero.
- **i18n:** every new string is wrapped in `t()`.

## Open questions

None. Vendor detection was raised, considered, and deliberately rejected above.
