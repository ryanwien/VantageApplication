# The queries Vantage can send — the complete list

These three operations are the **entire** reachable surface of the DataHub integration.
They are quoted from [`src/datahub/catalog.js`](../src/datahub/catalog.js) and are the actual
strings the server sends.

## Why the query text lives on the server

The browser never sends GraphQL. It sends an operation **name** — `search`, `entity` or
`lineage` — and the server looks that name up in a fixed whitelist and supplies the query
text itself. A caller therefore cannot compose a new query, and cannot reach an operation
that isn't one of these three.

Consequences worth checking:

- **Every operation is read-only.** There is no mutation in the whitelist, so the integration
  cannot modify the catalog even if the browser is hostile.
- **The DataHub access token stays server-side.** It never reaches the browser.
- **When a token is configured the route also requires a session,** so a deployed instance
  can't be used anonymously to enumerate internal dataset names.

Gate: `isKnownOp` — [`src/datahub/catalog.js:129`](../src/datahub/catalog.js#L129).

---

## 1 — `search`

Find a dataset by name. Capped at 5 results.

```graphql
query VantageSearch($q: String!) {
  searchAcrossEntities(input: { types: [DATASET], query: $q, start: 0, count: 5 }) {
    searchResults { entity { urn ... on Dataset {
      name
      platform { name }
      properties { description }
    } } }
  }
}
```

Variables: `{ q: <search term> }`

## 2 — `entity`

Fetch one dataset by URN — description, platform, owners, schema.

```graphql
query VantageEntity($urn: String!) {
  dataset(urn: $urn) {
    urn
    name
    platform { name }
    ...
  }
}
```

Variables: `{ urn: <dataset urn> }`

## 3 — `lineage`

Walk the lineage graph in one direction. Capped at 10 results.

```graphql
query VantageLineage($urn: String!, $direction: LineageDirection!) {
  searchAcrossLineage(input: { urn: $urn, direction: $direction, start: 0, count: 10 }) {
    searchResults { entity { urn ... on Dataset { name platform { name } } } }
  }
}
```

Variables: `{ urn: <dataset urn>, direction: "UPSTREAM" | "DOWNSTREAM" }`

`direction` is not passed through — it is coerced to `DOWNSTREAM` only on an exact match and
falls back to `UPSTREAM` otherwise ([line 108](../src/datahub/catalog.js#L108)), so an
arbitrary caller value can never reach DataHub.

---

## Hostile input can't crash the variable builders

Every variable goes through `safeStr` ([line 99](../src/datahub/catalog.js#L99)):

```js
const safeStr = (v) => (typeof v === "string" ? v : "");
```

It deliberately does **not** attempt to stringify a non-string. Calling `String(v)` on a
caller-supplied object would invoke that object's own `toString` / `Symbol.toPrimitive` —
which is precisely the coercion an attacker would use to run code or throw inside the
request path. Anything that isn't already a string becomes `""`.

Covered by [`src/datahub/catalog.test.js`](../src/datahub/catalog.test.js), which asserts the
builders stay total against hostile field values.
