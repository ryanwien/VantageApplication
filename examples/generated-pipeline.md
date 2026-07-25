# Generated pipeline — what the agent produces per question

**This file is generated.** Reproduce it with:

```bash
node examples/generate.mjs > examples/generated-pipeline.md
```

Every payload and fact block below was computed by the exported functions in
[`src/datahub/catalog.js`](../src/datahub/catalog.js) — the same code the running app calls.
The DataHub responses they consume are fixtures reproducing the demo catalog (DataHub v1.6.0),
because the transformation is what's on show here, not the HTTP round-trip.

For each question the agent derives: an **intent**, a **request payload**, a **fact block**,
and a **routing decision** — narrate through the model, or answer from the catalog alone.


---

## 1. "who owns the fct_users_created table?"

**Intent** — `detectCatalogIntent()`

```json
{
  "kind": "owner",
  "term": "fct_users_created"
}
```

**Generated request** — operation name + variables built by `GRAPHQL_OPS`

```json
{
  "operation": "search",
  "variables": {
    "q": "fct_users_created"
  }
}
```

The browser sends only that operation *name*; the server supplies the query text from its whitelist, so no caller can compose a query of its own.

**Fact block** — `contextForLLM()`, narrowed to the dimension asked about

```text
Facts from DataHub (live metadata catalog):
dataset: fct_users_created (platform: hive)
description: table containing all the users created on a single day
owners: jdoe, datahub
```

**Routing decision**

`missingDimension()` → `null` and `namedAbsentColumn()` → `null`. The catalog can answer, so the fact block is handed to the local model to phrase — grounded entirely in the lines above.

Model in the path: **yes**

---

## 2. "what feeds the fct_users_created table?"

**Intent** — `detectCatalogIntent()`

```json
{
  "kind": "lineage",
  "term": "fct_users_created"
}
```

**Generated request** — operation name + variables built by `GRAPHQL_OPS`

```json
{
  "operation": "search",
  "variables": {
    "q": "fct_users_created"
  }
}
```

The browser sends only that operation *name*; the server supplies the query text from its whitelist, so no caller can compose a query of its own.

**Follow-up request** — lineage walk

```json
{
  "operation": "lineage",
  "variables": {
    "urn": "urn:li:dataset:(urn:li:dataPlatform:hive,fct_users_created,PROD)",
    "direction": "UPSTREAM"
  }
}
```

**Fact block** — `contextForLLM()`, narrowed to the dimension asked about

```text
Facts from DataHub (live metadata catalog):
dataset: fct_users_created (platform: hive)
description: table containing all the users created on a single day
upstream datasets:
  - logging_events (hive)
  - SampleHiveDataset (hive)
  - SampleHdfsDataset (hdfs)
  - SampleKafkaDataset (kafka)
```

**Routing decision**

`missingDimension()` → `null` and `namedAbsentColumn()` → `null`. The catalog can answer, so the fact block is handed to the local model to phrase — grounded entirely in the lines above.

Model in the path: **yes**

---

## 3. "who owns the orders_v2 table?"

**Intent** — `detectCatalogIntent()`

```json
{
  "kind": "owner",
  "term": "orders_v2"
}
```

**Generated request** — operation name + variables built by `GRAPHQL_OPS`

```json
{
  "operation": "search",
  "variables": {
    "q": "orders_v2"
  }
}
```

The browser sends only that operation *name*; the server supplies the query text from its whitelist, so no caller can compose a query of its own.

**Fact block** — `contextForLLM()`, narrowed to the dimension asked about

```text
Facts from DataHub (live metadata catalog):
dataset: orders_v2 (platform: hive)
description: Rebuilt orders table. Ownership and schema not yet registered in the catalog.
owners: (none recorded in DataHub)
```

**Routing decision**

`missingDimension()` → `"owners"`. The catalog holds no owners for this dataset, so **the model is removed from the path** and the fact block above is printed directly. This is the case a prompt instruction could not fix: given a partial block, `llama3.2:1b` invented an owner in 4 of 5 runs.

Model in the path: **no**

---

## 4. "what type is the foobar column in fct_users_created?"

**Intent** — `detectCatalogIntent()`

```json
{
  "kind": "schema",
  "term": "fct_users_created"
}
```

**Generated request** — operation name + variables built by `GRAPHQL_OPS`

```json
{
  "operation": "search",
  "variables": {
    "q": "fct_users_created"
  }
}
```

The browser sends only that operation *name*; the server supplies the query text from its whitelist, so no caller can compose a query of its own.

**Fact block** — `contextForLLM()`, narrowed to the dimension asked about

```text
Facts from DataHub (live metadata catalog):
dataset: fct_users_created (platform: hive)
description: table containing all the users created on a single day
schema:
  - user_id : varchar(100) — Id of the user created
  - user_name : boolean — Name of the user who signed up
```

**Routing decision**

`namedAbsentColumn()` → `"foobar"`. The schema is present but contains no such column, so **the model is removed from the path** and the desk states the gap plus the real schema. Nothing is left that could invent a type.

Model in the path: **no**

---

## Why this is the interesting part

Three of the four questions name a dataset that genuinely exists in the catalog, so there is
always plenty of real context to sound confident with. The difference is whether the
*specific dimension asked about* is present. Two checks decide it before any model runs:

| Check | Question it answers | Source |
|---|---|---|
| `missingDimension()` | Does the catalog hold owners / schema / lineage at all? | [catalog.js:284](../src/datahub/catalog.js#L284) |
| `namedAbsentColumn()` | The schema exists — but does it contain *this* column? | [catalog.js:269](../src/datahub/catalog.js#L269) |

When either fires, the language model never sees the question. That is why the refusals in
[`datahub-catalog-transcript.md`](datahub-catalog-transcript.md) return in 58–69 ms while the
answered questions take 820–1041 ms: the honesty is structural, not a matter of wording.

