# Settings Bundle B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four honest user-preference settings — color-blind mode (recolor + shapes), privacy blur, data-refresh interval, and in-app notification granularity.

**Architecture:** All pure logic goes in a new Vitest-tested module `src/settings/preferences.js`; `React.jsx` holds one persisted `prefs` state and reads the helpers at render/poll/alert sites. Same split proven in Bundle A.

**Tech Stack:** React 18, Vite 5, Vitest (already added in Bundle A), plain ES modules. No new runtime dependencies.

## Global Constraints

- **No "real-time streaming" label anywhere.** Refresh options are `Manual · 5s · 15s · 30s`; copy says "refresh interval". Vantage polls a rate-limited REST API; a streaming claim would be false.
- **Notifications are in-app only, price-triggers + breaking-news only.** No SMS/email, no filled-order/margin-call types (no delivery backend, no trading engine).
- **Preferences persist to `localStorage["tape-prefs"]`** as one JSON object; `tape-breaking` migrates in on first load.
- **Colorblind palette:** up `#3B82F6`, down `#F59E0B`. **Default palette:** up `#2FD37A`, down `#F6465D` (the existing `C.up`/`C.down` at `React.jsx:77-78`).
- **All user-facing strings wrapped in `t()`.** There are 5 locale dictionaries (es/fr/de/pt/it); no English dictionary — `makeT` returns the literal for English. Add each new English string to all 5 dicts.
- **Client-only.** No `server/index.js` changes. Node 20+. Style: 2-space indent, double-quoted strings, semicolons.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/settings/preferences.js` | **Create.** Defaults, load/migrate/coerce, `directionColor`, `directionGlyph`, `notifyEnabled`. Single source of pref logic. |
| `src/settings/preferences.test.js` | **Create.** Unit tests for the above. |
| `React.jsx` | **Modify.** One `prefs` state + persistence; wire helpers into up/down render sites, sensitive figures, the poll loops, and the alert gates; settings UI for all four. |

---

### Task 1: Preferences module — defaults, load/migrate, coerce

**Files:**
- Create: `src/settings/preferences.js`
- Test: `src/settings/preferences.test.js`

**Interfaces:**
- Produces: `DEFAULT_PREFS`, `loadPrefs(rawString, legacyBreaking) -> prefs`, `coerceRefreshMs(v) -> number`. Later tasks import these.

- [ ] **Step 1: Write the failing test**

Create `src/settings/preferences.test.js`:

```js
import { describe, it, expect } from "vitest";
import { DEFAULT_PREFS, loadPrefs, coerceRefreshMs } from "./preferences.js";

describe("coerceRefreshMs", () => {
  it("accepts the four allowed values", () => {
    for (const v of [0, 5000, 15000, 30000]) expect(coerceRefreshMs(v)).toBe(v);
  });
  it("coerces anything else to the 15s default", () => {
    expect(coerceRefreshMs(1234)).toBe(15000);
    expect(coerceRefreshMs("fast")).toBe(15000);
    expect(coerceRefreshMs(undefined)).toBe(15000);
  });
});

describe("loadPrefs", () => {
  it("returns defaults for empty/corrupt input, never throws", () => {
    expect(loadPrefs(null)).toEqual(DEFAULT_PREFS);
    expect(loadPrefs("{not json")).toEqual(DEFAULT_PREFS);
  });
  it("merges stored values over defaults", () => {
    const p = loadPrefs(JSON.stringify({ colorBlind: true, refreshMs: 5000 }));
    expect(p.colorBlind).toBe(true);
    expect(p.refreshMs).toBe(5000);
    expect(p.notify).toEqual(DEFAULT_PREFS.notify);
  });
  it("coerces a bad stored refreshMs", () => {
    expect(loadPrefs(JSON.stringify({ refreshMs: 999 })).refreshMs).toBe(15000);
  });
  it("migrates legacy tape-breaking='off' into notify.breakingNews=false when prefs absent", () => {
    expect(loadPrefs(null, "off").notify.breakingNews).toBe(false);
    expect(loadPrefs(null, "on").notify.breakingNews).toBe(true);
  });
  it("does not let the legacy flag override an explicit stored pref", () => {
    const p = loadPrefs(JSON.stringify({ notify: { priceTriggers: true, breakingNews: true } }), "off");
    expect(p.notify.breakingNews).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./preferences.js"`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/settings/preferences.js`:

```js
// Pure preference logic behind Settings Bundle B. Kept out of React.jsx so it
// can be unit-tested. One persisted object lives at localStorage["tape-prefs"].

export const DEFAULT_PREFS = {
  colorBlind: false,
  privacy: false,
  refreshMs: 15000,
  notify: { priceTriggers: true, breakingNews: true },
};

const ALLOWED_REFRESH = new Set([0, 5000, 15000, 30000]);

export function coerceRefreshMs(v) {
  return ALLOWED_REFRESH.has(v) ? v : 15000;
}

// rawString: localStorage["tape-prefs"] (or null). legacyBreaking: the old
// localStorage["tape-breaking"] value ("on"/"off"/null), migrated only when the
// new prefs object does not already carry an explicit notify.breakingNews.
export function loadPrefs(rawString, legacyBreaking) {
  let stored = {};
  try { stored = rawString ? JSON.parse(rawString) : {}; } catch { stored = {}; }
  if (!stored || typeof stored !== "object") stored = {};
  const notify = { ...DEFAULT_PREFS.notify, ...(stored.notify || {}) };
  const hadExplicit = stored.notify && "breakingNews" in stored.notify;
  if (!hadExplicit && (legacyBreaking === "off" || legacyBreaking === "on")) {
    notify.breakingNews = legacyBreaking !== "off";
  }
  return {
    colorBlind: !!stored.colorBlind,
    privacy: !!stored.privacy,
    refreshMs: coerceRefreshMs(stored.refreshMs),
    notify,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — all Bundle A tests (34) plus these new ones.

- [ ] **Step 5: Commit**

```bash
git add src/settings/preferences.js src/settings/preferences.test.js
git commit -m "Add preferences module: defaults, load/migrate, refresh coercion"
```

---

### Task 2: Direction color/glyph + notification gating helpers

**Files:**
- Modify: `src/settings/preferences.js`
- Test: `src/settings/preferences.test.js`

**Interfaces:**
- Consumes: `DEFAULT_PREFS`.
- Produces: `directionColor(dir, prefs, palette)`, `directionGlyph(dir, prefs)`, `notifyEnabled(prefs, type)`.

- [ ] **Step 1: Write the failing test**

Append to `src/settings/preferences.test.js`:

```js
import { directionColor, directionGlyph, notifyEnabled } from "./preferences.js";

const PALETTE = { up: "#2FD37A", down: "#F6465D", flat: "#8A94A6" };

describe("directionColor", () => {
  it("returns the default palette when colorBlind is off", () => {
    expect(directionColor("up", { colorBlind: false }, PALETTE)).toBe("#2FD37A");
    expect(directionColor("down", { colorBlind: false }, PALETTE)).toBe("#F6465D");
  });
  it("returns the colorblind-safe palette when on", () => {
    expect(directionColor("up", { colorBlind: true }, PALETTE)).toBe("#3B82F6");
    expect(directionColor("down", { colorBlind: true }, PALETTE)).toBe("#F59E0B");
  });
  it("returns the flat/neutral color for unknown directions, never throws", () => {
    expect(directionColor("sideways", { colorBlind: false }, PALETTE)).toBe("#8A94A6");
    expect(directionColor(undefined, { colorBlind: true }, PALETTE)).toBe("#8A94A6");
  });
});

describe("directionGlyph", () => {
  it("emits no glyph in default mode", () => {
    expect(directionGlyph("up", { colorBlind: false })).toBe("");
    expect(directionGlyph("down", { colorBlind: false })).toBe("");
  });
  it("emits triangles in colorblind mode", () => {
    expect(directionGlyph("up", { colorBlind: true })).toBe("▲");
    expect(directionGlyph("down", { colorBlind: true })).toBe("▼");
    expect(directionGlyph("flat", { colorBlind: true })).toBe("");
  });
});

describe("notifyEnabled", () => {
  it("reads the per-type flag", () => {
    const p = { notify: { priceTriggers: true, breakingNews: false } };
    expect(notifyEnabled(p, "priceTriggers")).toBe(true);
    expect(notifyEnabled(p, "breakingNews")).toBe(false);
  });
  it("defaults missing types to false, never throws", () => {
    expect(notifyEnabled({}, "priceTriggers")).toBe(false);
    expect(notifyEnabled(null, "breakingNews")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `directionColor is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Append to `src/settings/preferences.js`:

```js
const CB_PALETTE = { up: "#3B82F6", down: "#F59E0B" };
const GLYPH = { up: "▲", down: "▼" };

// Resolve the up/down color. palette is the app's default { up, down, flat }.
export function directionColor(dir, prefs, palette) {
  if (dir !== "up" && dir !== "down") return palette.flat;
  return prefs && prefs.colorBlind ? CB_PALETTE[dir] : palette[dir];
}

// Direction glyph — only in colorblind mode, only for up/down.
export function directionGlyph(dir, prefs) {
  if (!prefs || !prefs.colorBlind) return "";
  return GLYPH[dir] || "";
}

// Is this in-app alert type enabled?
export function notifyEnabled(prefs, type) {
  return !!(prefs && prefs.notify && prefs.notify[type]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/settings/preferences.js src/settings/preferences.test.js
git commit -m "Add direction color/glyph and notification gating helpers"
```

---

### Task 3: Wire prefs state + persistence into React.jsx

**Files:**
- Modify: `React.jsx` (import at top; state near the other settings state; a persistence effect)

**Interfaces:**
- Consumes: `DEFAULT_PREFS`, `loadPrefs` from Task 1.
- Produces: `prefs` state + `setPref(key, value)` updater used by every later task. `PALETTE` object `{ up: C.up, down: C.down, flat: C.faint }`.

- [ ] **Step 1: Add the import**

Extend the existing `src/settings` import region at the top of `React.jsx` (Bundle A added one such line) or add:

```js
import { DEFAULT_PREFS, loadPrefs, directionColor, directionGlyph, notifyEnabled, coerceRefreshMs } from "./src/settings/preferences.js";
```

- [ ] **Step 2: Add state + persistence**

Near the other settings state (search for `const [settingsTab`), add:

```jsx
const [prefs, setPrefs] = useState(() => {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  return loadPrefs(window.localStorage.getItem("tape-prefs"), window.localStorage.getItem("tape-breaking"));
});
const setPref = (key, value) => setPrefs((p) => ({ ...p, [key]: value }));
useEffect(() => {
  try { window.localStorage.setItem("tape-prefs", JSON.stringify(prefs)); } catch { /* storage full/blocked */ }
}, [prefs]);

const PALETTE = { up: C.up, down: C.down, flat: C.faint };
const dirColor = (dir) => directionColor(dir, prefs, PALETTE);
const dirGlyph = (dir) => directionGlyph(dir, prefs);
```

- [ ] **Step 3: Verify build + tests**

Run: `npm run build` (must succeed) then `npm test` (all pass). Nothing renders differently yet — this task only wires state.

- [ ] **Step 4: Commit**

```bash
git add React.jsx
git commit -m "Wire persisted prefs state into React.jsx"
```

---

### Task 4: Color-blind mode — settings toggle + render wiring

**Files:**
- Modify: `React.jsx` (up/down value render sites; a new settings control)

**Interfaces:**
- Consumes: `dirColor`, `dirGlyph`, `prefs`, `setPref` from Task 3.

- [ ] **Step 1: Find the up/down render sites**

Search `React.jsx` for direct uses of `C.up` / `C.down` in value rendering (Δ%, price change, movers, portfolio). List each. These are the sites to route through `dirColor(dir)` where `dir` is the sign of the change (`chg >= 0 ? "up" : "down"`, `flat` when exactly 0 if the site distinguishes it).

- [ ] **Step 2: Route color + prepend glyph**

At each up/down value site, replace the literal `C.up`/`C.down` selection with `dirColor(dir)`, and prepend `dirGlyph(dir)` (a leading `▲`/`▼ ` — note the trailing space) to the rendered value string. Where a site already shows a `+`/`-` sign, the glyph adds redundant shape encoding; keep both. Do not change the numeric formatting.

- [ ] **Step 3: Add the settings toggle**

Add a control to the DATA (or a new ACCESSIBILITY) settings section. Use the existing checkbox/label pattern (see `React.jsx:7990-7991` for the breaking-news toggle):

```jsx
<label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontFamily: MONO, fontSize: 11, color: C.text, cursor: "pointer" }}>
  <input type="checkbox" checked={prefs.colorBlind} onChange={() => setPref("colorBlind", !prefs.colorBlind)} />
  {t("color-blind mode (blue/orange + ▲▼)")}
</label>
```

Add `"color-blind mode (blue/orange + ▲▼)"` to all 5 locale dicts.

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`. Toggle on → every up/down value shows blue/orange and a ▲/▼; toggle off → back to green/red with no glyph. Check the ticker, movers, and portfolio.

- [ ] **Step 5: Confirm tests + build**

Run: `npm test` (pass) and `npm run build` (succeeds).

- [ ] **Step 6: Commit**

```bash
git add React.jsx
git commit -m "Color-blind mode: recolor + direction glyphs behind a settings toggle"
```

---

### Task 5: Privacy mode — blur wrapper + toggle + Shift+P hotkey

**Files:**
- Modify: `React.jsx` (sensitive-figure sites; a settings toggle; a global keydown effect)

**Interfaces:**
- Consumes: `prefs`, `setPref` from Task 3.

- [ ] **Step 1: Add the hotkey effect**

Near the other global effects, add a keydown listener that toggles privacy on `Shift+P`, ignored while typing in an input/textarea:

```jsx
useEffect(() => {
  const onKey = (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
    if (e.shiftKey && (e.key === "P" || e.key === "p")) { e.preventDefault(); setPref("privacy", !prefs.privacy); }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [prefs.privacy]);
```

- [ ] **Step 2: Add a blur helper + wrap sensitive figures**

Add a small render helper:

```jsx
const privacyStyle = prefs.privacy ? { filter: "blur(8px)", userSelect: "none" } : null;
const priv = (node) => <span style={privacyStyle} aria-label={prefs.privacy ? t("hidden") : undefined}>{node}</span>;
```

Wrap the portfolio total, position percentages, and $ amounts with `priv(...)`. Blur (not remove) keeps layout stable. Find these in the portfolio panel render.

- [ ] **Step 3: Add the settings toggle**

Same checkbox pattern, in the DATA/privacy section:

```jsx
<label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontFamily: MONO, fontSize: 11, color: C.text, cursor: "pointer" }}>
  <input type="checkbox" checked={prefs.privacy} onChange={() => setPref("privacy", !prefs.privacy)} />
  {t("privacy mode — blur balances (Shift+P)")}
</label>
```

Add `"privacy mode — blur balances (Shift+P)"` and `"hidden"` to all 5 locale dicts.

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`. Toggle (and `Shift+P`) → portfolio totals/%/$ blur with no layout shift; toggling in a text field does nothing.

- [ ] **Step 5: Confirm tests + build**

Run: `npm test` (pass) and `npm run build` (succeeds).

- [ ] **Step 6: Commit**

```bash
git add React.jsx
git commit -m "Privacy mode: blur sensitive figures via toggle + Shift+P"
```

---

### Task 6: Data refresh rate — selector + poll wiring

**Files:**
- Modify: `React.jsx` (demo-tick loop `~3618`; live-quote loop `~3687`; a settings selector)

**Interfaces:**
- Consumes: `prefs.refreshMs`, `setPref`, `coerceRefreshMs`.

- [ ] **Step 1: Wire `refreshMs` into the market-data cadence**

The demo tick (`React.jsx:3618`) and the live-quote poll drive market updates. Replace their hardcoded interval with `prefs.refreshMs`, and add `prefs.refreshMs` to the effect dependency arrays so a change re-arms the timer. When `prefs.refreshMs === 0` (Manual), do **not** start the interval. The Finnhub 429 backoff (`~React.jsx:3687`) must keep precedence — do not let a short interval shorten an active backoff; leave the backoff logic untouched and only gate the steady-state cadence.

- [ ] **Step 2: Add a "refresh now" affordance for Manual mode**

When `prefs.refreshMs === 0`, expose a manual refresh trigger (a button near the market panels, or reuse an existing refresh action) that runs one poll. If no single refresh function exists, wrap the poll body in a `refreshNow()` callback and call it from both the interval and the button.

- [ ] **Step 3: Add the settings selector**

In the DATA section, a four-option selector bound to `prefs.refreshMs`:

```jsx
<div style={{ marginTop: 12, fontFamily: MONO, fontSize: 11, color: C.text }}>
  <div style={{ color: C.muted, marginBottom: 6 }}>{t("refresh interval")}</div>
  <div style={{ display: "flex", gap: 6 }}>
    {[["Manual", 0], ["5s", 5000], ["15s", 15000], ["30s", 30000]].map(([label, ms]) => (
      <button key={ms} onClick={() => setPref("refreshMs", coerceRefreshMs(ms))}
        style={{ flex: 1, padding: "6px 0", borderRadius: 4, cursor: "pointer", fontFamily: MONO, fontSize: 11,
          border: `1px solid ${prefs.refreshMs === ms ? C.amber : C.panelEdge}`,
          background: prefs.refreshMs === ms ? "rgba(255,179,0,0.08)" : "transparent",
          color: prefs.refreshMs === ms ? C.amber : C.muted }}>{t(label)}</button>
    ))}
  </div>
</div>
```

Add `"refresh interval"`, `"Manual"` to all 5 locale dicts (`"5s"/"15s"/"30s"` are unit tokens, left unwrapped per existing convention).

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`. Switch intervals → demo tick cadence visibly changes; Manual → ticking stops and the refresh button does one update. Confirm live mode still backs off on 429 (do not regress rate-limit handling).

- [ ] **Step 5: Confirm tests + build**

Run: `npm test` (pass) and `npm run build` (succeeds).

- [ ] **Step 6: Commit**

```bash
git add React.jsx
git commit -m "Data refresh interval selector wired into market polling"
```

---

### Task 7: Notification granularity — migrate breakingOn, per-type gates

**Files:**
- Modify: `React.jsx` (breaking-news state `~4943`; price-alert path; the settings toggle at `~7990`)

**Interfaces:**
- Consumes: `prefs.notify`, `setPref`, `notifyEnabled`.

- [ ] **Step 1: Replace `breakingOn` with `prefs.notify.breakingNews`**

`breakingOn` (`React.jsx:4943`) and its `tape-breaking` persistence (`4944`) are superseded by `prefs.notify.breakingNews` (Task 1 already migrates the old value in). Replace reads of `breakingOn` (gates at `4957`, `4981`, `4983`, `4987`) with `notifyEnabled(prefs, "breakingNews")`, and remove the standalone `breakingOn` state + its persistence effect. Update the dependency arrays accordingly.

- [ ] **Step 2: Gate the price-alert path**

Find the price-trigger/alert firing path and gate it on `notifyEnabled(prefs, "priceTriggers")` — when off, the alert (banner + sting + announce) does not fire.

- [ ] **Step 3: Replace the single toggle with a two-row matrix**

Replace the existing breaking-news checkbox (`React.jsx:7990-7991`) with two:

```jsx
<div style={{ marginTop: 12, fontFamily: MONO, fontSize: 11, color: C.muted }}>{t("in-app alerts")}</div>
{[["priceTriggers", "price triggers"], ["breakingNews", "breaking news"]].map(([key, label]) => (
  <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontFamily: MONO, fontSize: 11, color: prefs.notify[key] ? C.text : C.faint, cursor: "pointer" }}>
    <input type="checkbox" checked={prefs.notify[key]}
      onChange={() => setPref("notify", { ...prefs.notify, [key]: !prefs.notify[key] })} />
    {t(label)}
  </label>
))}
```

Add `"in-app alerts"`, `"price triggers"`, `"breaking news"` to all 5 locale dicts.

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`. Toggle breaking-news off → no breaking banner/sting; toggle price-triggers off → no price alert. Confirm the old `tape-breaking` state migrated (a user who had it off starts with breaking-news off).

- [ ] **Step 5: Confirm tests + build**

Run: `npm test` (pass) and `npm run build` (succeeds).

- [ ] **Step 6: Commit**

```bash
git add React.jsx
git commit -m "Notification granularity: per-type in-app alert gates + migration"
```

---

## Self-Review

**Spec coverage**

| Spec section | Task |
| --- | --- |
| §Architecture (preferences.js + persisted object) | Tasks 1, 3 |
| §1 Color-blind (recolor + shapes) | Tasks 2, 4 |
| §2 Privacy (blur + hotkey) | Task 5 |
| §3 Data refresh rate (honest intervals, backoff wins) | Task 6 |
| §4 Notifications (migrate, per-type, in-app only) | Tasks 1, 7 |
| §Error handling (corrupt prefs, unknown refreshMs, unknown dir, hotkey-in-input, backoff precedence) | Task 1 (fallback/coerce), Task 2 (unknown dir), Task 5 (input guard), Task 6 (backoff) |
| §Testing | Tasks 1–2 unit tests; Tasks 3–7 browser verification |

No spec requirement is unimplemented. The two honesty boundaries are enforced by Global Constraints and Tasks 6 (no streaming label) and 7 (in-app, two types only).

**Placeholder scan:** none. Task 4 Step 1 and Task 6 Step 1 direct the implementer to *locate* render/poll sites rather than listing every line — appropriate, since `C.up`/`C.down` and the poll bodies are spread through a 675 KB file; the transformation to apply at each is fully specified.

**Type consistency:** `directionColor(dir, prefs, palette)`, `directionGlyph(dir, prefs)`, `notifyEnabled(prefs, type)`, `loadPrefs(raw, legacy)`, `coerceRefreshMs(v)` are defined in Tasks 1–2 and consumed under those exact signatures in Tasks 3–7. `prefs` shape (`colorBlind`, `privacy`, `refreshMs`, `notify.{priceTriggers,breakingNews}`) is identical across the module, the state initializer, and every consumer.
