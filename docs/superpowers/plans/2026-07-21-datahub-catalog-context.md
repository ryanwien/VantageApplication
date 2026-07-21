# DataHub Catalog Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Vantage's desk agent real DataHub context — search, schema, ownership, and lineage — so catalog questions are answered from a live metadata graph and read on air.

**Architecture:** All derivation lives in one pure, Vitest-tested ESM module (`src/datahub/catalog.js`). The dependency-free Node backend imports that module's query definitions and proxies them to DataHub GMS with a server-side token. `askDesk` gains one intent branch that fetches context and hands it to the existing model cascade.

**Tech Stack:** ESM (`"type": "module"`), Node 20+ built-ins only on the server, React 18 client, Vitest.

## Global Constraints

- **Read-only.** Only GraphQL *queries*. No mutations, no tag/doc/glossary writes.
- **Honesty rule.** A catalog question with no catalog data produces an explicit refusal. The model is NEVER asked to recall or infer schemas, owners, or lineage.
- **Token is server-side only.** `DATAHUB_TOKEN` never reaches the browser, never appears in a response body, and is never logged.
- **Whitelisted ops only.** The client sends an `op` name; the server owns the query text. Unknown `op` → HTTP 400.
- `src/datahub/catalog.js` is **pure and total**: no `fetch`, no DOM, no `node:` imports; every function returns a safe value rather than throwing.
- Default endpoints: GMS `http://localhost:8080`, DataHub UI `http://localhost:9002`.
- The existing **51 tests must continue to pass unchanged**.
- All new user-facing strings wrapped in `t()` (5 locale dictionaries exist: es/fr/de/pt/it; English returns the literal).

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/datahub/catalog.js` (create) | Intent detection, GraphQL op definitions, response normalization, LLM context formatting. Pure. |
| `src/datahub/catalog.test.js` (create) | Vitest coverage for the above. |
| `server/index.js` (modify) | `POST /api/datahub/graphql` (whitelisted proxy) + `GET /api/datahub/health`. |
| `.env.example` (modify) | Document `DATAHUB_GMS_URL`, `DATAHUB_TOKEN`. |
| `React.jsx` (modify) | `datahub` intent branch in `askDesk` + `runCatalogQuery`. |
| `README.md` (modify) | DataHub setup section. |

---

### Task 1: Catalog intent detection

**Files:**
- Create: `src/datahub/catalog.js`
- Test: `src/datahub/catalog.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `detectCatalogIntent(text) -> { kind: "search"|"schema"|"lineage"|"owner", term: string } | null`

Detection must NOT hijack existing market intents. It therefore requires an explicit
data-catalog vocabulary token before it will claim a question. "who owns AMD" must return
`null` (a market question); "who owns the users table" must return an `owner` intent.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from "vitest";
import { detectCatalogIntent } from "./catalog.js";

describe("detectCatalogIntent", () => {
  it("returns null for non-catalog text", () => {
    expect(detectCatalogIntent("chart AMD and explain the move")).toBe(null);
    expect(detectCatalogIntent("who owns AMD")).toBe(null);
    expect(detectCatalogIntent("")).toBe(null);
    expect(detectCatalogIntent(null)).toBe(null);
  });

  it("detects lineage questions", () => {
    expect(detectCatalogIntent("what feeds the fct_users_created table?"))
      .toEqual({ kind: "lineage", term: "fct_users_created" });
    expect(detectCatalogIntent("show upstream lineage for fct_users_created"))
      .toEqual({ kind: "lineage", term: "fct_users_created" });
  });

  it("detects schema questions", () => {
    expect(detectCatalogIntent("what columns are in the fct_users_created dataset?"))
      .toEqual({ kind: "schema", term: "fct_users_created" });
  });

  it("detects owner questions", () => {
    expect(detectCatalogIntent("who owns the fct_users_created table?"))
      .toEqual({ kind: "owner", term: "fct_users_created" });
  });

  it("falls back to search when only a catalog noun is present", () => {
    expect(detectCatalogIntent("find the customers dataset"))
      .toEqual({ kind: "search", term: "customers" });
  });

  it("prefers a quoted term", () => {
    expect(detectCatalogIntent('what is the schema of "Long Tail Companions"'))
      .toEqual({ kind: "schema", term: "Long Tail Companions" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/datahub/catalog.test.js`
Expected: FAIL — cannot find module `./catalog.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/datahub/catalog.js
// Pure helpers for DataHub catalog context. No I/O: no fetch, no DOM, no node builtins.
// Every function is total — malformed input yields a safe value, never a throw.

// A catalog question must use catalog vocabulary. Without this gate, "who owns AMD"
// would be stolen from the market desk.
const DOMAIN = /\b(datahub|catalog|dataset|datasets|table|tables|schema|column|columns|field|fields|lineage|upstream|downstream)\b/i;

const LINEAGE = /\b(lineage|upstream|downstream|feeds?|feeding|depends?\s+on|derived\s+from)\b/i;
const SCHEMA = /\b(schema|columns?|fields?)\b/i;
const OWNER = /\b(owns?|owner|owners|owned\s+by|steward|stewards)\b/i;

function extractTerm(t) {
  const quoted = t.match(/["'`]([^"'`]+)["'`]/);
  if (quoted && quoted[1].trim()) return quoted[1].trim();

  // snake_case / dotted identifiers are the strongest signal: fct_users_created, db.schema.tbl
  const ident = t.match(/\b([A-Za-z0-9]+(?:[._][A-Za-z0-9]+)+)\b/);
  if (ident) return ident[1];

  // "the customers table" / "the customers dataset"
  const noun = t.match(/\b([A-Za-z0-9_]+)\s+(?:table|dataset)\b/i);
  if (noun) return noun[1];

  // "find the customers dataset" handled above; otherwise take the word after a preposition
  const prep = t.match(/\b(?:for|of|on|about|in)\s+(?:the\s+)?([A-Za-z0-9_]{2,40})\b/i);
  if (prep) return prep[1];

  return null;
}

export function detectCatalogIntent(text) {
  const t = String(text ?? "").trim();
  if (!t || !DOMAIN.test(t)) return null;
  const term = extractTerm(t);
  if (!term) return null;
  const kind = LINEAGE.test(t) ? "lineage"
    : SCHEMA.test(t) ? "schema"
    : OWNER.test(t) ? "owner"
    : "search";
  return { kind, term };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/datahub/catalog.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 51 existing + 6 new all pass.

- [ ] **Step 6: Commit**

```bash
git add src/datahub/catalog.js src/datahub/catalog.test.js
git commit -m "feat(datahub): catalog intent detection"
```

---

### Task 2: Whitelisted GraphQL operations

**Files:**
- Modify: `src/datahub/catalog.js`
- Test: `src/datahub/catalog.test.js`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `GRAPHQL_OPS` — an object keyed by op name. Each value is
  `{ query: string, variables: (input) => object }`. Op names: `"search"`, `"entity"`, `"lineage"`.
  Also `isKnownOp(name) -> boolean`.

The server owns query text; the client only names an op. This is what keeps the proxy from
being an open passthrough to an internal service.

- [ ] **Step 1: Write the failing test**

```js
import { GRAPHQL_OPS, isKnownOp } from "./catalog.js";

describe("GRAPHQL_OPS", () => {
  it("exposes exactly the three read-only ops", () => {
    expect(Object.keys(GRAPHQL_OPS).sort()).toEqual(["entity", "lineage", "search"]);
  });

  it("contains no mutations", () => {
    for (const op of Object.values(GRAPHQL_OPS)) {
      expect(op.query).not.toMatch(/\bmutation\b/i);
      expect(op.query).toMatch(/^\s*query\b/i);
    }
  });

  it("builds search variables from a term", () => {
    expect(GRAPHQL_OPS.search.variables({ term: "customers" })).toEqual({ q: "customers" });
    expect(GRAPHQL_OPS.search.variables(null)).toEqual({ q: "" });
  });

  it("builds entity variables from a urn", () => {
    expect(GRAPHQL_OPS.entity.variables({ urn: "urn:li:dataset:(x,y,PROD)" }))
      .toEqual({ urn: "urn:li:dataset:(x,y,PROD)" });
  });

  it("builds lineage variables and defaults direction to UPSTREAM", () => {
    expect(GRAPHQL_OPS.lineage.variables({ urn: "u", direction: "DOWNSTREAM" }))
      .toEqual({ urn: "u", direction: "DOWNSTREAM" });
    expect(GRAPHQL_OPS.lineage.variables({ urn: "u" }))
      .toEqual({ urn: "u", direction: "UPSTREAM" });
    expect(GRAPHQL_OPS.lineage.variables({ urn: "u", direction: "SIDEWAYS" }))
      .toEqual({ urn: "u", direction: "UPSTREAM" });
  });

  it("isKnownOp gates unknown names", () => {
    expect(isKnownOp("search")).toBe(true);
    expect(isKnownOp("deleteEverything")).toBe(false);
    expect(isKnownOp(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/datahub/catalog.test.js`
Expected: FAIL — `GRAPHQL_OPS` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/datahub/catalog.js`:

```js
const SEARCH_QUERY = `query VantageSearch($q: String!) {
  searchAcrossEntities(input: { types: [DATASET], query: $q, start: 0, count: 5 }) {
    searchResults { entity { urn ... on Dataset {
      name
      platform { name }
      properties { description }
    } } }
  }
}`;

const ENTITY_QUERY = `query VantageEntity($urn: String!) {
  dataset(urn: $urn) {
    urn
    name
    platform { name }
    properties { description }
    ownership { owners { owner { ... on CorpUser { username } ... on CorpGroup { name } } } }
    schemaMetadata { fields { fieldPath type nativeDataType description } }
  }
}`;

const LINEAGE_QUERY = `query VantageLineage($urn: String!, $direction: LineageDirection!) {
  searchAcrossLineage(input: { urn: $urn, direction: $direction, start: 0, count: 10 }) {
    searchResults { entity { urn ... on Dataset { name platform { name } } } }
  }
}`;

export const GRAPHQL_OPS = {
  search: { query: SEARCH_QUERY, variables: (v) => ({ q: String(v?.term ?? "") }) },
  entity: { query: ENTITY_QUERY, variables: (v) => ({ urn: String(v?.urn ?? "") }) },
  lineage: {
    query: LINEAGE_QUERY,
    variables: (v) => ({
      urn: String(v?.urn ?? ""),
      direction: v?.direction === "DOWNSTREAM" ? "DOWNSTREAM" : "UPSTREAM",
    }),
  },
};

export function isKnownOp(name) {
  return typeof name === "string" && Object.prototype.hasOwnProperty.call(GRAPHQL_OPS, name);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/datahub/catalog.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/datahub/catalog.js src/datahub/catalog.test.js
git commit -m "feat(datahub): whitelisted read-only GraphQL ops"
```

---

### Task 3: Response normalization and LLM context

**Files:**
- Modify: `src/datahub/catalog.js`
- Test: `src/datahub/catalog.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `firstSearchHit(json) -> { urn, name, platform } | null`
  - `summarizeEntity(json) -> { urn, name, platform, description, owners: string[], fields: {path,type,description}[] }`
  - `summarizeLineage(json) -> { name, platform }[]`
  - `contextForLLM(summary, lineage, direction) -> string`

Every one of these must survive `null`, arrays, and missing nesting without throwing —
DataHub responses vary by entity type and version.

- [ ] **Step 1: Write the failing test**

```js
import { firstSearchHit, summarizeEntity, summarizeLineage, contextForLLM } from "./catalog.js";

const SEARCH = { data: { searchAcrossEntities: { searchResults: [
  { entity: { urn: "urn:li:dataset:(a,fct_users,PROD)", name: "fct_users", platform: { name: "hive" } } },
] } } };

const ENTITY = { data: { dataset: {
  urn: "urn:li:dataset:(a,fct_users,PROD)",
  name: "fct_users",
  platform: { name: "hive" },
  properties: { description: "User fact table" },
  ownership: { owners: [{ owner: { username: "jdoe" } }, { owner: { name: "data-eng" } }] },
  schemaMetadata: { fields: [
    { fieldPath: "id", type: "NUMBER", nativeDataType: "bigint", description: "pk" },
    { fieldPath: "email", type: "STRING", nativeDataType: "varchar", description: null },
  ] },
} } };

describe("normalization", () => {
  it("pulls the first search hit", () => {
    expect(firstSearchHit(SEARCH)).toEqual({
      urn: "urn:li:dataset:(a,fct_users,PROD)", name: "fct_users", platform: "hive",
    });
  });

  it("returns null when there are no hits", () => {
    expect(firstSearchHit({ data: { searchAcrossEntities: { searchResults: [] } } })).toBe(null);
    expect(firstSearchHit(null)).toBe(null);
    expect(firstSearchHit({})).toBe(null);
  });

  it("summarizes an entity", () => {
    const s = summarizeEntity(ENTITY);
    expect(s.name).toBe("fct_users");
    expect(s.platform).toBe("hive");
    expect(s.description).toBe("User fact table");
    expect(s.owners).toEqual(["jdoe", "data-eng"]);
    expect(s.fields).toEqual([
      { path: "id", type: "bigint", description: "pk" },
      { path: "email", type: "varchar", description: "" },
    ]);
  });

  it("never throws on malformed input", () => {
    for (const bad of [null, undefined, {}, [], { data: null }, { data: { dataset: null } }]) {
      const s = summarizeEntity(bad);
      expect(s.owners).toEqual([]);
      expect(s.fields).toEqual([]);
      expect(summarizeLineage(bad)).toEqual([]);
    }
  });

  it("formats a context block naming the source", () => {
    const ctx = contextForLLM(summarizeEntity(ENTITY), [], "UPSTREAM");
    expect(ctx).toMatch(/DataHub/);
    expect(ctx).toMatch(/fct_users/);
    expect(ctx).toMatch(/jdoe/);
    expect(ctx).toMatch(/email/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/datahub/catalog.test.js`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/datahub/catalog.js`:

```js
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === "string" ? v : "");

export function firstSearchHit(json) {
  const hit = arr(json?.data?.searchAcrossEntities?.searchResults)[0]?.entity;
  if (!hit || !hit.urn) return null;
  return { urn: str(hit.urn), name: str(hit.name), platform: str(hit.platform?.name) };
}

export function summarizeEntity(json) {
  const d = json?.data?.dataset;
  const owners = arr(d?.ownership?.owners)
    .map((o) => str(o?.owner?.username) || str(o?.owner?.name))
    .filter(Boolean);
  const fields = arr(d?.schemaMetadata?.fields).map((f) => ({
    path: str(f?.fieldPath),
    type: str(f?.nativeDataType) || str(f?.type),
    description: str(f?.description),
  }));
  return {
    urn: str(d?.urn),
    name: str(d?.name),
    platform: str(d?.platform?.name),
    description: str(d?.properties?.description),
    owners,
    fields,
  };
}

export function summarizeLineage(json) {
  return arr(json?.data?.searchAcrossLineage?.searchResults)
    .map((r) => ({ name: str(r?.entity?.name), platform: str(r?.entity?.platform?.name) }))
    .filter((x) => x.name);
}

export function contextForLLM(summary, lineage, direction) {
  const s = summary || {};
  const lines = [
    "FACTS FROM DATAHUB (the live metadata catalog). Use ONLY these facts:",
    `dataset: ${s.name || "(unknown)"}${s.platform ? ` (platform: ${s.platform})` : ""}`,
  ];
  if (s.description) lines.push(`description: ${s.description}`);
  if (arr(s.owners).length) lines.push(`owners: ${s.owners.join(", ")}`);
  if (arr(s.fields).length) {
    lines.push("schema:");
    for (const f of s.fields.slice(0, 40)) {
      lines.push(`  - ${f.path}${f.type ? ` : ${f.type}` : ""}${f.description ? ` — ${f.description}` : ""}`);
    }
  }
  const lin = arr(lineage);
  if (lin.length) {
    lines.push(`${direction === "DOWNSTREAM" ? "downstream" : "upstream"} datasets:`);
    for (const l of lin.slice(0, 20)) lines.push(`  - ${l.name}${l.platform ? ` (${l.platform})` : ""}`);
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/datahub/catalog.js src/datahub/catalog.test.js
git commit -m "feat(datahub): response normalization + LLM context block"
```

---

### Task 4: Backend proxy routes

**Files:**
- Modify: `server/index.js` (add routes near the other `/api/*` handlers, after the AUTH block)
- Modify: `.env.example`

**Interfaces:**
- Consumes: `GRAPHQL_OPS`, `isKnownOp` from `src/datahub/catalog.js`.
- Produces: `POST /api/datahub/graphql` accepting `{ op, variables }` → `{ data }` or `{ error }`;
  `GET /api/datahub/health` → `{ configured: boolean, reachable: boolean }`.

`server/index.js` is ESM (`"type": "module"`) and uses the existing helpers `send(res, code, body)`
and `readBody(req)`.

- [ ] **Step 1: Add the import at the top of `server/index.js`**

Place beside the existing `node:` imports (around line 28-32):

```js
import { GRAPHQL_OPS, isKnownOp } from "../src/datahub/catalog.js";
```

- [ ] **Step 2: Add the config constants near the other env reads**

```js
const DATAHUB_GMS_URL = (process.env.DATAHUB_GMS_URL || "http://localhost:8080").replace(/\/+$/, "");
const DATAHUB_TOKEN = process.env.DATAHUB_TOKEN || "";
// The token is OPTIONAL: the local quickstart runs with metadata-service auth disabled and
// accepts unauthenticated queries. A deployed DataHub will require the token. So "configured"
// means we know where GMS is; the Authorization header is attached only when a token exists.
const datahubConfigured = () => Boolean(DATAHUB_GMS_URL);
```

**VERIFIED AGAINST A LIVE DATAHUB v1.6.0 QUICKSTART** (do not "correct" these):
- The GMS GraphQL endpoint is **`/api/graphql`**. `/api/v2/graphql` returns **404** on GMS
  (port 8080) — that path belongs to the *frontend* (port 9002) and requires a session cookie (401).
- All three query documents in Task 2 were executed verbatim against this instance and returned
  data, including ownership (`jdoe`, `datahub`), `schemaMetadata.fields`, and upstream lineage.

- [ ] **Step 3: Add the routes inside the request handler**

Insert after the `/api/auth/logout` handler:

```js
    // ---- DATAHUB (read-only catalog context) ----
    if (p === "/api/datahub/health" && req.method === "GET") {
      if (!datahubConfigured()) return send(res, 200, { configured: false, reachable: false });
      try {
        const r = await fetch(`${DATAHUB_GMS_URL}/health`, { signal: AbortSignal.timeout(4000) });
        return send(res, 200, { configured: true, reachable: r.ok });
      } catch {
        return send(res, 200, { configured: true, reachable: false });
      }
    }
    if (p === "/api/datahub/graphql" && req.method === "POST") {
      if (!datahubConfigured()) {
        return send(res, 503, { error: "DataHub is not configured on the server (set DATAHUB_GMS_URL and DATAHUB_TOKEN)." });
      }
      const { op, variables } = await readBody(req);
      if (!isKnownOp(op)) return send(res, 400, { error: "Unknown DataHub operation." });
      const spec = GRAPHQL_OPS[op];
      try {
        const r = await fetch(`${DATAHUB_GMS_URL}/api/graphql`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Only send Authorization when a token exists — the quickstart runs with
            // metadata-service auth disabled and rejects nothing, but a deployed GMS needs it.
            ...(DATAHUB_TOKEN ? { Authorization: `Bearer ${DATAHUB_TOKEN}` } : {}),
          },
          body: JSON.stringify({ query: spec.query, variables: spec.variables(variables) }),
          signal: AbortSignal.timeout(15000),
        });
        if (r.status === 401 || r.status === 403) return send(res, 502, { error: "DataHub rejected the access token." });
        if (!r.ok) return send(res, 502, { error: `DataHub returned HTTP ${r.status}.` });
        const json = await r.json();
        // Forward data only. Never echo the token, and never forward raw server errors.
        return send(res, 200, { data: json?.data ?? null });
      } catch {
        return send(res, 502, { error: "Could not reach DataHub." });
      }
    }
```

- [ ] **Step 4: Document the env vars in `.env.example`**

```
DATAHUB_GMS_URL                                # DataHub GMS base URL (default http://localhost:8080)
DATAHUB_TOKEN                                  # DataHub Personal Access Token (server-only, never sent to the browser)
```

- [ ] **Step 5: Verify the server still boots**

Run: `node --env-file=.env server/index.js` (or `node server/index.js`)
Expected: starts on 8787 with no import errors. Then:
`curl -s http://localhost:8787/api/datahub/health` → `{"configured":false,"reachable":false}` when unset.
`curl -s -X POST http://localhost:8787/api/datahub/graphql -H "Content-Type: application/json" -d '{"op":"nope"}'`
→ HTTP 503 when unconfigured, or `{"error":"Unknown DataHub operation."}` once configured.

- [ ] **Step 6: Commit**

```bash
git add server/index.js .env.example
git commit -m "feat(datahub): whitelisted read-only GraphQL proxy + health route"
```

---

### Task 5: Desk intent branch

**Files:**
- Modify: `React.jsx` — add `runCatalogQuery` near `askDesk`, and one branch inside `askDesk` (which begins at line 6218)

**Interfaces:**
- Consumes: `detectCatalogIntent`, `firstSearchHit`, `summarizeEntity`, `summarizeLineage`,
  `contextForLLM` from `src/datahub/catalog.js`.
- Produces: nothing consumed by later tasks.

Existing patterns to reuse (do not reinvent):
- `setResp("desk", { status, text, ms, via, model, tried })` drives the answer panel.
- `setAiResponses(p => (p.nav ? { nav: p.nav } : {}))` clears prior answers.
- `rememberTurn(q, text)` records multi-turn memory; `speak("desk", text)` reads on air when `autoSpeak`.
- Model dispatch mirrors the `askAny` shape at `React.jsx:6118-6122`.

- [ ] **Step 1: Add the import at the top of `React.jsx`**

```js
import { detectCatalogIntent, firstSearchHit, summarizeEntity, summarizeLineage, contextForLLM } from "./src/datahub/catalog.js";
```

- [ ] **Step 2: Add `runCatalogQuery` inside the component, above `askDesk`**

```js
  // DataHub catalog questions. Honesty rule: if the catalog has no answer we say so —
  // we never let the model invent schemas, owners, or lineage.
  const runCatalogQuery = async (q, intent) => {
    const t0 = performance.now();
    setAiResponses(p => (p.nav ? { nav: p.nav } : {}));
    setResp("desk", { status: "running", text: "", ms: null, via: "DataHub", model: "catalog", tried: [] });
    const ms = () => Math.round(performance.now() - t0);
    const fail = (msg) => setResp("desk", { status: "error", text: msg, ms: ms(), via: "DataHub", tried: [] });

    const call = async (op, variables) => {
      const r = await fetch("/api/datahub/graphql", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, variables }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      return j;
    };

    try {
      const hit = firstSearchHit(await call("search", { term: intent.term }));
      if (!hit) { fail(t(`DataHub has no dataset matching "${intent.term}".`)); return; }

      if (intent.kind === "search") {
        const text = t(`DataHub match: ${hit.name}${hit.platform ? ` on ${hit.platform}` : ""}.`);
        setResp("desk", { status: "done", text, ms: ms(), via: "DataHub", model: "catalog", tried: [] });
        rememberTurn(q, text);
        if (autoSpeak) speak("desk", text);
        return;
      }

      const summary = summarizeEntity(await call("entity", { urn: hit.urn }));
      let lineage = [], direction = "UPSTREAM";
      if (intent.kind === "lineage") {
        direction = /\bdownstream\b/i.test(q) ? "DOWNSTREAM" : "UPSTREAM";
        lineage = summarizeLineage(await call("lineage", { urn: hit.urn, direction }));
      }

      const context = contextForLLM(summary, lineage, direction);
      const enabledModels = enabled;
      if (!enabledModels.length) {
        // No model to narrate with — show the facts plainly rather than nothing.
        setResp("desk", { status: "done", text: context, ms: ms(), via: "DataHub", model: "catalog", tried: [] });
        rememberTurn(q, context);
        return;
      }

      const prompt = `${context}\n\nAnswer this question using ONLY the facts above. If the facts do not contain the answer, say so plainly. Do not invent columns, owners, or datasets.\n\nQuestion: ${q}`;
      const m = enabledModels[0];
      const askAny = (mm, pr, onTok) =>
        mm.kind === "claude" ? askClaude(mm, pr, undefined, onTok)
        : mm.kind === "ollama" ? askOllama(mm, pr, undefined, onTok)
        : mm.kind === "gemini" ? askGemini(mm, pr, undefined, onTok)
        : askOpenAICompat(mm, pr, undefined, onTok);
      let acc = "";
      setResp("desk", { status: "running", text: "", ms: null, via: `DataHub + ${m.label}`, model: m.model, tried: [] });
      await askAny(m, prompt, (tok) => {
        acc += tok;
        setAiResponses(p => ({ ...p, desk: { ...p.desk, text: (p.desk?.text || "") + tok } }));
      });
      setResp("desk", { status: "done", text: acc, ms: ms(), via: `DataHub + ${m.label}`, model: m.model, tried: [] });
      if (acc) rememberTurn(q, acc);
      if (autoSpeak && acc) speak("desk", acc);
    } catch (e) {
      fail(t(`DataHub lookup failed: ${humanizeError(e)}`));
    }
  };
```

- [ ] **Step 3: Add the intent branch inside `askDesk`**

Insert immediately after the export-intent block (`const ex = matchExport(q); if (ex) {...}`), so
catalog questions are claimed before the chart/video/market intents but after exports:

```js
    // DataHub catalog intent: schema / owners / lineage questions answered from the live catalog
    const cat = detectCatalogIntent(q);
    if (cat) { runCatalogQuery(q, cat); return; } // desk-handled — no market model fan-out
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: builds with no unresolved imports.

- [ ] **Step 5: Verify existing tests still pass**

Run: `npm test`
Expected: all pass (no React tests exist; this confirms nothing regressed).

- [ ] **Step 6: Commit**

```bash
git add React.jsx
git commit -m "feat(datahub): desk intent branch for catalog questions"
```

---

### Task 6: Documentation and end-to-end verification

**Files:**
- Modify: `README.md`

**Interfaces:** none.

- [ ] **Step 1: Add a README section after the AMD/ROCm section**

```markdown
## DataHub catalog context (optional)

Point the desk at a [DataHub](https://datahub.com) instance and it answers questions about your
data — schemas, owners, and lineage — from the live catalog, read on air by the anchor.

1. Start DataHub (quickstart on `http://localhost:9002`, GMS on `http://localhost:8080`).
2. In the DataHub UI: **Settings → Access Tokens → Generate Token**.
3. Set the two server-side vars (the token never reaches the browser):
   ```
   DATAHUB_GMS_URL=http://localhost:8080
   DATAHUB_TOKEN=<your personal access token>
   ```
4. Run the backend: `node --env-file=.env server/index.js`, then ask the desk:
   - *"who owns the fct_users_created table?"*
   - *"what columns are in the customers dataset?"*
   - *"what feeds fct_users_created?"*

Queries are **read-only** and limited to a server-side whitelist. If DataHub is unreachable the
desk says so — it never invents catalog facts.
```

- [ ] **Step 2: End-to-end verification against the running quickstart**

With DataHub up and `DATAHUB_TOKEN` set:
1. `curl -s http://localhost:8787/api/datahub/health` → `{"configured":true,"reachable":true}`
2. In the browser ask *"who owns the fct_users_created table?"* → the answer names real owners
   from the catalog and the anchor reads it.
3. Ask *"what feeds fct_users_created?"* → upstream datasets listed.
4. **Honesty check:** `docker compose stop datahub-gms-quickstart`, ask again → the desk reports
   the lookup failed. It must NOT produce a plausible-sounding invented answer.
5. **No-hijack check:** ask *"chart AMD and explain the move"* → the normal market path runs,
   unchanged.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(datahub): setup and verification steps"
```

---

## Self-Review

**Spec coverage:** goal 1 → Tasks 1-3+5; goal 2 (existing surfaces) → Task 5 reuses
`setResp`/`rememberTurn`/`speak`; goal 3 (token server-side) → Task 4; goal 4 (honest failure)
→ Task 5 `fail()` + Task 6 step 2.4. Non-goals hold: only `query` documents exist (asserted by a
test in Task 2), no MCP claim, no writes.

**Placeholder scan:** none — every code step contains complete code.

**Type consistency:** `firstSearchHit` returns `{urn,name,platform}` and Task 5 uses `hit.urn` /
`hit.name` / `hit.platform`. `summarizeEntity` returns `{owners,fields}` and `contextForLLM`
consumes exactly those. `GRAPHQL_OPS` op names `search|entity|lineage` match the `call()` sites.
