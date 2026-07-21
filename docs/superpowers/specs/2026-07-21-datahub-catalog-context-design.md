# DataHub catalog context for the Vantage desk agent

**Date:** 2026-07-21
**Status:** approved, pending implementation plan
**Scope:** New pure module + backend proxy routes + one new intent in `askDesk`

## Context

Vantage's AI desk is already an agent: `askDesk` (`React.jsx:6218`) is a command pipeline
that matches intents (export, full chart, video, market events, portfolio, price alerts,
calendar) and falls through to an LLM (`askOllama` / `askOpenAICompat` / `askGemini`) whose
answer the anchor reads aloud.

Every one of those intents draws on **market** data. The agent has no access to
*organizational* data context — schemas, lineage, ownership, governance. This bundle adds
that, sourced from a real DataHub instance.

**Why:** The Agent Hackathon's thesis is that agents do real work only when they have
complete context on organizational data, and DataHub is the context platform that supplies
it. Vantage is a genuine tool-using agent but had **zero** DataHub integration. This closes
that gap honestly rather than claiming a fit that does not exist.

## Goals

1. The desk answers natural-language questions about datasets using **real** DataHub
   metadata: search, schema, ownership, and upstream/downstream lineage.
2. The answer flows through the existing desk surfaces — answer panel, anchor voice,
   local multi-turn memory — so it is one agent, not a bolted-on panel.
3. The DataHub access token never reaches the browser.
4. When DataHub is unavailable, the desk says so; it never invents catalog facts.

## Non-goals (explicit, for honesty and scope)

- **No writes.** Read-only queries only — no tag proposals, no documentation suggestions,
  no glossary edits. DataHub's write-oriented agent capabilities are out of scope.
- **No ML-model governance surface.** Real DataHub functionality, but not this window.
- **No arbitrary GraphQL passthrough.** The proxy accepts a whitelisted set of queries; an
  open proxy to an internal service would be a security defect.
- **No claim of MCP usage.** This bundle queries DataHub's GraphQL API — the same metadata
  graph the MCP Server wraps. If the MCP client lands later, the claim changes then, not now.
- No change to market data, inference routing, or the Bundle A/B surfaces.

## Architecture

Same split as Settings Bundles A and B: all derivation lives in a pure, Vitest-tested
module; I/O happens at the edges (backend proxy, React intent branch).

```text
"who owns fct_users_created?"
  → detectCatalogIntent(text)            [pure, tested]
  → POST /api/datahub/graphql            [Node backend; PAT server-side]
  → DataHub GMS GraphQL                  [searchAcrossEntities / dataset(urn) / lineage]
  → summarizeEntity(json)                [pure, tested]
  → contextForLLM(summary)               [pure, tested]
  → askOllama / askOpenAICompat with that context block
  → desk answer panel + anchor reads it on air
```

The LLM narrates context it is *given*; it is never asked to recall catalog facts.

**Resolution is two-step.** Users name datasets in prose ("the users table"), not by URN, so
every `schema` / `lineage` / `owner` question first resolves the term to a URN via
`searchAcrossEntities`, then fetches by that URN. A `search` question stops after step one.
If the search returns no match, the desk reports that and stops — it does not guess a URN.

## Components

### 1. `src/datahub/catalog.js` (new, pure, tested)

- `detectCatalogIntent(text) -> { kind, term } | null` — `kind` is
  `"search" | "schema" | "lineage" | "owner"`. Returns `null` for non-catalog text so the
  existing intents and LLM fallthrough are untouched.
- `buildSearchQuery(term)` / `buildEntityQuery(urn)` / `buildLineageQuery(urn, direction)` —
  return `{ query, variables }` for the whitelisted GraphQL operations.
- `summarizeEntity(json) -> { name, platform, description, owners[], fields[], upstreams[], downstreams[] }` —
  normalizes DataHub's response. Missing or unexpected shapes yield empty arrays, never a throw.
- `contextForLLM(summary) -> string` — a compact, labelled block the model narrates.
- Every function is total: malformed input returns a safe empty value.

### 2. `server/index.js` (modify)

- `POST /api/datahub/graphql` — accepts `{ op, variables }` where `op` names one of the
  whitelisted operations; the server owns the query text. Attaches
  `Authorization: Bearer ${DATAHUB_TOKEN}` and forwards to `${DATAHUB_GMS_URL}/api/v2/graphql`.
  Rejects unknown `op` values with 400.
- `GET /api/datahub/health` — reports `{ configured, reachable }` so the UI states the truth
  rather than guessing.
- New env vars, documented in `.env.example`: `DATAHUB_GMS_URL`, `DATAHUB_TOKEN`.
  The token is server-only and must never be echoed in a response or log.

### 3. `React.jsx` (modify)

- A `datahub` intent branch inside `askDesk`, placed before the generic LLM fallthrough and
  after the existing intents, so current behaviour is unchanged for non-catalog text.
- Reuses the existing answer panel, TTS, and multi-turn memory — no new rendering surface.
- Connection status surfaced honestly in settings (configured / not configured / unreachable).

## Data flow

```text
localStorage — unchanged (no DataHub token in the browser)
env (server) DATAHUB_GMS_URL + DATAHUB_TOKEN → backend proxy → GMS GraphQL
detectCatalogIntent → proxy → summarizeEntity → contextForLLM → model → answer → voice
```

## Error handling

| Case | Behaviour |
| --- | --- |
| DataHub not configured (no env) | desk states DataHub isn't connected; **no** LLM fallthrough on catalog questions |
| GMS unreachable / timeout | plain error message naming the failure; never a fabricated answer |
| 401 / bad token | reports an auth failure; token value never echoed |
| Unknown `op` sent to proxy | 400 from the backend; no passthrough |
| Malformed GraphQL response | `summarizeEntity` returns empties; desk reports it found nothing |
| Entity not found | desk says it found no such dataset — not a guess |

The governing rule: **a catalog question with no catalog data produces a refusal, not a
hallucination.** This mirrors the honesty work in Bundle A.

## Testing

- **Vitest (`src/datahub/catalog.test.js`):** intent detection across the four kinds plus
  non-catalog text returning `null`; query builders producing the expected op/variables;
  `summarizeEntity` on a realistic payload, on an empty payload, and on malformed input
  (null, array, missing nesting) without throwing; `contextForLLM` output shape.
- **Browser verification:** against the local `datahub docker quickstart` sample metadata —
  ask for schema, owners, and lineage; confirm the anchor reads real values, and that
  stopping DataHub produces the honest failure message rather than an invented answer.
- Existing 51 tests must continue to pass unchanged.

## Open questions

None blocking. The MCP-client upgrade (backend speaking JSON-RPC to `mcp-server-datahub`)
is a deliberate follow-on, not part of this spec.
