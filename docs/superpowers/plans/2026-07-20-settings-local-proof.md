# Settings Local-Proof (Bundle A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local inference visible in the Vantage settings AI tab — a local/cloud banner, Ollama GPU-residency telemetry, a reversible demo preset, and promoted multi-turn memory controls.

**Architecture:** All derived logic moves into one new pure module, `src/settings/localProof.js`, unit-tested with Vitest. `React.jsx` imports from it and renders. Pure logic is separated from the 675 KB `React.jsx` component file so it can be tested at all — `React.jsx` today has no test seam.

**Tech Stack:** React 18, Vite 5, Vitest (added by Task 1), plain ES modules. No new runtime dependencies.

## Global Constraints

- **Never emit a GPU vendor string.** The literals `AMD`, `Radeon`, `ROCm`, and `NVIDIA` must not appear in any telemetry output produced by `src/settings/localProof.js`. Ollama's API does not report vendor; asserting one is false on non-AMD hardware. Vendor proof stays with `rocm-smi`.
- **Never read, clear, or overwrite `apiKey`.** The demo preset toggles `enabled` only.
- **All user-facing strings wrapped in `t()`** — the app ships 6 locales.
- **Client-only.** No changes to `server/index.js`.
- **Node 20+** (existing project floor).
- Existing style: 2-space indent, double-quoted strings, no semicolon-free style — match surrounding `React.jsx` code.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/settings/localProof.js` | **Create.** All pure derivation: local/cloud banner state, GPU residency, throughput, enabled-snapshot/restore. Single source of truth for `isLocalModel`. |
| `src/settings/localProof.test.js` | **Create.** Unit tests for the above. |
| `package.json` | **Modify.** Add `vitest` devDependency + `test` scripts. |
| `React.jsx` | **Modify.** Import helpers; render banner, telemetry strip, restore button, memory block. Delete the now-duplicated `isLocalModel` at line 6350. |

---

### Task 1: Test infrastructure + banner state

**Files:**
- Modify: `package.json`
- Create: `src/settings/localProof.js`
- Test: `src/settings/localProof.test.js`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `isLocalModel(model) -> boolean`, `bannerState(aiModels) -> { kind: "local" | "cloud" | "none" }`. Task 4 renders these. Tasks 2–3 add more exports to the same module.

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest@^2.1.0
```

- [ ] **Step 2: Add test scripts to `package.json`**

In the `"scripts"` block, add the two `test` lines so it reads:

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 3: Write the failing test**

Create `src/settings/localProof.test.js`:

```js
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
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./localProof.js"`.

- [ ] **Step 5: Write the minimal implementation**

Create `src/settings/localProof.js`:

```js
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
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 8 tests passing.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/settings/localProof.js src/settings/localProof.test.js
git commit -m "Add Vitest and local/cloud banner state derivation"
```

---

### Task 2: GPU residency and throughput

**Files:**
- Modify: `src/settings/localProof.js`
- Test: `src/settings/localProof.test.js`

**Interfaces:**
- Consumes: nothing from Task 1 at runtime; appends to the same module.
- Produces: `gpuResidency(psModel) -> { label, pct, cpuOnly }` and `throughput(chunk) -> number | null`. Task 5 renders both.

- [ ] **Step 1: Write the failing test**

Append to `src/settings/localProof.test.js`:

```js
import { gpuResidency, throughput } from "./localProof.js";

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `gpuResidency is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Append to `src/settings/localProof.js`:

```js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 16 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/settings/localProof.js src/settings/localProof.test.js
git commit -m "Add GPU residency and throughput derivation"
```

---

### Task 3: Non-destructive enabled-state snapshot and restore

**Files:**
- Modify: `src/settings/localProof.js`
- Test: `src/settings/localProof.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `snapshotEnabled(aiModels) -> Record<string, boolean>` and `restoreEnabled(aiModels, snapshot) -> aiModels`. Task 6 wires them to a restore button.

- [ ] **Step 1: Write the failing test**

Append to `src/settings/localProof.test.js`:

```js
import { snapshotEnabled, restoreEnabled } from "./localProof.js";

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `snapshotEnabled is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Append to `src/settings/localProof.js`:

```js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 20 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/settings/localProof.js src/settings/localProof.test.js
git commit -m "Add non-destructive enabled-state snapshot and restore"
```

---

### Task 4: Render the local/cloud banner

**Files:**
- Modify: `React.jsx` (delete line 6350; add import at top; insert banner at the start of the `settingsTab === "models"` block, `React.jsx:8041`)

**Interfaces:**
- Consumes: `isLocalModel`, `bannerState` from Task 1.
- Produces: the banner UI. No exports.

- [ ] **Step 1: Import the module and remove the duplicate predicate**

At the top of `React.jsx`, alongside the existing imports, add:

```js
import { isLocalModel, bannerState, gpuResidency, throughput, snapshotEnabled, restoreEnabled } from "./src/settings/localProof.js";
```

Then **delete** the local definition at `React.jsx:6350`:

```js
  const isLocalModel = (m) => m && (m.kind === "ollama" || (m.baseUrl && /localhost|127\.0\.0\.1/.test(m.baseUrl)));
```

The imported version is now the single source of truth. `pickLocalModel` on the following line keeps working unchanged.

- [ ] **Step 2: Add the six i18n strings**

Add these keys to **each** of the 6 locale dictionaries in `React.jsx` (the blocks containing `"forget conversation"` at lines 199, 333, 467, 600, 733, and the English base). English values:

```
"FULLY LOCAL · nothing leaves this device"
"CLOUD ENABLED · queries leave this device"
"no model enabled"
```

Translate to match the tone of the surrounding entries in each dictionary.

- [ ] **Step 3: Render the banner**

Immediately inside the `{settingsTab === "models" && (` block at `React.jsx:8041`, before any existing content, insert:

```jsx
{(() => {
  const bs = bannerState(aiModels);
  const tone = bs.kind === "local" ? C.up : bs.kind === "cloud" ? C.amber : C.faint;
  const text = bs.kind === "local" ? t("FULLY LOCAL · nothing leaves this device")
    : bs.kind === "cloud" ? t("CLOUD ENABLED · queries leave this device")
    : t("no model enabled");
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, marginBottom: 14,
      padding: "9px 11px", borderRadius: 6,
      border: `1px solid ${tone}`, background: "rgba(255,255,255,0.02)",
      fontFamily: MONO, fontSize: 11, letterSpacing: "0.06em", color: tone,
    }}>
      <span>{bs.kind === "local" ? "🔒" : bs.kind === "cloud" ? "☁" : "○"}</span>
      <span>{text}</span>
    </div>
  );
})()}
```

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`, open `http://127.0.0.1:5173`, go to settings (⚙) → **AI**.
Expected:
- With only Ollama enabled → green `🔒 FULLY LOCAL · nothing leaves this device`.
- Enable OpenRouter → banner turns amber `☁ CLOUD ENABLED · queries leave this device`.
- Disable every model → muted `○ no model enabled`.

- [ ] **Step 5: Confirm the unit tests still pass**

Run: `npm test`
Expected: PASS — 20 tests passing.

- [ ] **Step 6: Commit**

```bash
git add React.jsx
git commit -m "Render local/cloud banner in the settings AI tab"
```

---

### Task 5: Render the inference telemetry strip

**Files:**
- Modify: `React.jsx` (state + effect near the settings effects at `React.jsx:5246`; render below the Task 4 banner)

**Interfaces:**
- Consumes: `gpuResidency`, `throughput` from Task 2; `pickLocalModel` (`React.jsx:6351`).
- Produces: the telemetry UI. No exports.

- [ ] **Step 1: Add state and the polling effect**

Near the other settings-tab effects (around `React.jsx:5246`), add:

```jsx
const [psInfo, setPsInfo] = useState(null); // { models: [...] } | "unavailable" | null

useEffect(() => {
  if (!showSettings || settingsTab !== "models") return;
  const local = pickLocalModel();
  if (!local || local.kind !== "ollama") { setPsInfo(null); return; }
  const base = (local.baseUrl || "http://localhost:11434").replace(/\/$/, "");
  let alive = true;
  const poll = async () => {
    try {
      const r = await fetch(`${base}/api/ps`);
      const j = await r.json();
      if (alive) setPsInfo(j && Array.isArray(j.models) ? j : { models: [] });
    } catch {
      if (alive) setPsInfo("unavailable"); // Ollama down or CORS-blocked
    }
  };
  poll();
  const id = setInterval(poll, 4000);
  return () => { alive = false; clearInterval(id); };
}, [showSettings, settingsTab, aiModels]);
```

- [ ] **Step 2: Add the i18n strings**

Add to all 6 locale dictionaries. English values:

```
"telemetry unavailable — is the local server running?"
"no model loaded"
```

- [ ] **Step 3: Capture the eval stats in `askOllama`**

Add the ref beside the other refs (near `React.jsx:3541`):

```jsx
const lastEvalRef = useRef(null);
```

In `askOllama` (`React.jsx:5639`), where each streamed JSON chunk is parsed, record the final chunk. The final chunk is the one with `done === true`:

```js
if (chunk.done) lastEvalRef.current = { eval_count: chunk.eval_count, eval_duration: chunk.eval_duration };
```

- [ ] **Step 4: Render the strip**

Directly below the banner JSX from Task 4, insert:

```jsx
{psInfo && (
  <div style={{ marginBottom: 14, fontFamily: MONO, fontSize: 10.5, color: C.muted, lineHeight: 1.7 }}>
    {psInfo === "unavailable" && <div style={{ color: C.faint }}>{t("telemetry unavailable — is the local server running?")}</div>}
    {psInfo !== "unavailable" && psInfo.models.length === 0 && <div style={{ color: C.faint }}>{t("no model loaded")}</div>}
    {psInfo !== "unavailable" && psInfo.models.map((pm) => {
      const res = gpuResidency(pm);
      const tps = throughput(lastEvalRef.current);
      return (
        <div key={pm.name} style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ color: C.text }}>{pm.name}</span>
          <span>{(pm.size / 1e9).toFixed(1)} GB</span>
          {res && <span style={{ color: res.cpuOnly ? C.amber : C.up }}>{res.label}</span>}
          {tps && <span>{tps} tok/s</span>}
        </div>
      );
    })}
  </div>
)}
```

- [ ] **Step 5: Verify in the browser**

Start Ollama with `OLLAMA_ORIGINS=* ollama serve`, then `npm run dev` → settings → AI.
Expected: a line such as `llama3.1  4.9 GB  100% GPU-resident`. Ask the desk one question, reopen settings — `tok/s` now appears. Stop Ollama and reopen → `telemetry unavailable`.

- [ ] **Step 6: Confirm the unit tests still pass**

Run: `npm test`
Expected: PASS — 20 tests passing.

- [ ] **Step 7: Commit**

```bash
git add React.jsx
git commit -m "Show Ollama GPU residency and throughput in settings"
```

---

### Task 6: Add the restore counterpart to the local-only preset

**Files:**
- Modify: `React.jsx` (button at `React.jsx:8054`)

**Interfaces:**
- Consumes: `snapshotEnabled`, `restoreEnabled` from Task 3; existing `soloModel` (`React.jsx:6360`).
- Produces: the restore UI. No exports.

**Context:** the demo preset already exists — the button at `React.jsx:8054` calls `soloModel("ollama")`, which sets `enabled` per model and never touches `apiKey`. Only the undo is missing.

- [ ] **Step 1: Add snapshot state**

Beside the other settings state, add:

```jsx
const [preDemoSnapshot, setPreDemoSnapshot] = useState(null);
```

- [ ] **Step 2: Capture the snapshot when the preset is applied**

Change the existing handler at `React.jsx:8054` from:

```jsx
<button onClick={() => { setDevMode(true); soloModel("ollama"); }}
```

to:

```jsx
<button onClick={() => { setPreDemoSnapshot(snapshotEnabled(aiModels)); setDevMode(true); soloModel("ollama"); }}
```

- [ ] **Step 3: Add the i18n string**

Add to all 6 locale dictionaries. English value:

```
"restore previous models"
```

- [ ] **Step 4: Render the restore button**

Immediately after the button from Step 2, insert:

```jsx
{preDemoSnapshot && (
  <button onClick={() => { setAiModels(ms => restoreEnabled(ms, preDemoSnapshot)); setPreDemoSnapshot(null); }}
    style={{ marginTop: 8, width: "100%", background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 4, fontFamily: MONO, fontSize: 11, padding: "8px 0", cursor: "pointer" }}>
    ↺ {t("restore previous models")}
  </button>
)}
```

- [ ] **Step 5: Verify in the browser and confirm keys survive**

`npm run dev` → settings → AI. Paste any placeholder value into the OpenRouter key field. Click the local-only button, then `↺ restore previous models`.
Expected: the previous enabled set returns **and the OpenRouter key field still holds the value you pasted**. This is the behaviour Task 3's key-preservation test guards.

- [ ] **Step 6: Confirm the unit tests still pass**

Run: `npm test`
Expected: PASS — 20 tests passing.

- [ ] **Step 7: Commit**

```bash
git add React.jsx
git commit -m "Add restore button undoing the local-only preset"
```

---

### Task 7: Promote the multi-turn memory controls

**Files:**
- Modify: `React.jsx` (memory block near `React.jsx:8064`; START chip near `React.jsx:7854-7862`)

**Interfaces:**
- Consumes: `deskMemoryRef` (`React.jsx:3541`), the existing `forget conversation` action (`React.jsx:8064`).
- Produces: the memory UI. No exports.

- [ ] **Step 1: Add a turn-count state that survives clearing**

`deskMemoryRef` is a ref, so changes do not re-render. Add beside it (near `React.jsx:3541`):

```jsx
const [memoryTurns, setMemoryTurns] = useState(() => {
  try { return JSON.parse(localStorage.getItem("tape-desk-memory") || "[]").length; } catch { return 0; }
});
```

Then update it in the two places `deskMemoryRef.current` is assigned — after `React.jsx:3547` add `setMemoryTurns(mem.length);` and after `React.jsx:3551` add `setMemoryTurns(0);`.

- [ ] **Step 2: Add the i18n string**

Add to all 6 locale dictionaries. English value (a template — interpolate the count):

```
"{n} turns remembered on this device"
```

- [ ] **Step 3: Render the memory block**

Wrap the existing `forget conversation` control at `React.jsx:8064` in a labelled block:

```jsx
<div style={{ marginTop: 14, padding: "10px 11px", border: `1px solid ${C.panelEdge}`, borderRadius: 6 }}>
  <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: C.muted, marginBottom: 6 }}>
    {t("MEMORY")}
  </div>
  <div style={{ fontFamily: MONO, fontSize: 11, color: C.text, marginBottom: 8 }}>
    {t("{n} turns remembered on this device").replace("{n}", String(memoryTurns))}
  </div>
  {/* existing "forget conversation" button stays here, unchanged */}
</div>
```

- [ ] **Step 4: Add the START-tab chip**

In the `chips` array at `React.jsx:7854-7862`, add an entry:

```js
{ label: t("Memory"), ready: memoryTurns > 0, note: memoryTurns > 0 ? `${memoryTurns}` : t("empty"), tab: "models" },
```

- [ ] **Step 5: Verify in the browser**

`npm run dev`. Ask the desk two questions. Open settings → AI.
Expected: the block reads `4 turns remembered on this device` (each exchange stores a user and an assistant entry). The START tab shows a `Memory` chip with the same count. Click `forget conversation` → count returns to `0` and the chip goes to `empty`.

- [ ] **Step 6: Confirm the unit tests still pass**

Run: `npm test`
Expected: PASS — 20 tests passing.

- [ ] **Step 7: Commit**

```bash
git add React.jsx
git commit -m "Promote multi-turn memory controls in settings"
```

---

## Self-Review

**Spec coverage**

| Spec section | Task |
| --- | --- |
| §1 Local/cloud banner | Tasks 1, 4 |
| §2 Inference telemetry | Tasks 2, 5 |
| §2 Vendor honesty | Global Constraints + Task 2 Step 1 (explicit vendor-string assertion) |
| §3 Demo preset (non-destructive) | Tasks 3, 6 |
| §4 Memory controls | Task 7 |
| Error handling table | Task 5 Step 3 (`unavailable`, `no model loaded`), Task 2 (`cpuOnly`, null guards) |
| Testing section | Tasks 1–3 unit tests; Tasks 4–7 browser verification |

No spec requirement is unimplemented.

**Placeholder scan:** none. Every code step contains complete code. The one intentionally deferred item is per-locale translation wording in Tasks 4/5/6/7 Step 2, where English values are given verbatim and translation is a judgement call for the implementer, matching the existing dictionaries.

**Type consistency:** `isLocalModel`, `bannerState`, `gpuResidency`, `throughput`, `snapshotEnabled`, `restoreEnabled` are defined in Tasks 1–3 and consumed under exactly those names in Tasks 4–7. `psInfo` is `{ models: [] } | "unavailable" | null` at both its definition (Task 5 Step 1) and its use (Step 3). `lastEvalRef` is created in Task 5 Step 4 and read in Step 3 — both within Task 5.
