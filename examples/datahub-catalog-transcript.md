# DataHub catalog transcript — four answers, verbatim

Captured from the demo run against **DataHub v1.6.0**, narrating model **`llama3.1:latest`
via Ollama (local)**. Every answer below is quoted exactly as it appeared on the desk,
including the source badge and the latency the UI reported.

**The badge is the thing to watch.** It names what actually produced the answer:

- `DataHub + Ollama (local)` — the catalog returned the fact, and the local model phrased it.
- `DataHub (catalog)` — **the model is not in the path at all.** On a confirmed gap, Vantage
  removes the language model entirely and prints the catalog's own facts, so there is nothing
  left to hallucinate with.

The latencies make that structural claim measurable: answers that involve the model take
**820–1041 ms**; the two refusals return in **58 ms and 69 ms**, because no model runs.

---

## 1 — Owner, present in the catalog

> **Q:** who owns the fct_users_created table?

**Badge:** `AI DESK · DataHub + Ollama (local) (llama3.1:latest)` — **820 ms**

```
The fct_users_created table is owned by jdoe and datahub.
```

Both owners are listed. (The prompt was later hardened to guarantee this — see commit
`fix(datahub): answer in a full sentence and list every owner`.)

---

## 2 — Lineage, multi-hop

> **Q:** what feeds the fct_users_created table?

**Badge:** `AI DESK · DataHub + Ollama (local) (llama3.1:latest)` — **1041 ms**

```
The upstream datasets that feed the fct_users_created table are logging_events (hive),
SampleHiveDataset (hive), SampleHdfsDataset (hdfs), and SampleKafkaDataset (kafka).
```

All four upstreams, each with its platform, resolved from the catalog's lineage graph.

---

## 3 — Owner, ABSENT from the catalog ⭐

> **Q:** who owns the orders_v2 table?

**Badge:** `AI DESK · DataHub (catalog)` — **58 ms**, no model involved

```
DataHub has no owner recorded for orders_v2.
Facts from DataHub (live metadata catalog):
dataset: orders_v2 (platform: hive)
description: Rebuilt orders table. Ownership and schema not yet registered in the catalog.
owners: (none recorded in DataHub)
```

This is the case that matters. `orders_v2` genuinely exists in the catalog and has a
description, so a naive agent has plenty of context to sound confident with — and the small
local model did exactly that in testing: given an incomplete fact block, it invented an owner
in **4 of 5 runs**. Prompt wording did not fix it. Removing the model from the path did.

Note what it does *instead* of refusing flatly: it states the gap, then lists what the catalog
genuinely does hold, so the answer is still useful.

---

## 4 — A column that does not exist

> **Q:** what type is the foobar column in fct_users_created?

**Badge:** `AI DESK · DataHub (catalog)` — **69 ms**, no model involved

```
DataHub's schema for fct_users_created has no column named "foobar".
Facts from DataHub (live metadata catalog):
dataset: fct_users_created (platform: hive)
description: table containing all the users created on a single day
schema:
  - user_id : varchar(100) — Id of the user created
  - user_name : boolean — Name of the user who signed up
```

The same rule one level finer: not a missing *record* but a missing *field within* a record
that does exist. The real schema is printed so the asker can see what is actually there.

---

## Where this is implemented

| Behaviour | Code |
|---|---|
| Route a question to a catalog lookup | `detectCatalogIntent` — [`src/datahub/catalog.js:49`](../src/datahub/catalog.js#L49) |
| Detect a named column that isn't in the schema | `namedAbsentColumn` — [`src/datahub/catalog.js:269`](../src/datahub/catalog.js#L269) |
| Detect an absent owner/schema/lineage dimension | `missingDimension` — [`src/datahub/catalog.js:284`](../src/datahub/catalog.js#L284) |
| Disclose a fuzzy near-match instead of answering about the wrong dataset | `isCloseMatch` — [`src/datahub/catalog.js:120`](../src/datahub/catalog.js#L120) |

Covered by [`src/datahub/catalog.test.js`](../src/datahub/catalog.test.js); the suite runs with
`npm test` (105 tests).
