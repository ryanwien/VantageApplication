// Regenerates examples/generated-pipeline.md by running the REAL shipping code in
// src/datahub/catalog.js over the four questions from the demo.
//
//   node examples/generate.mjs > examples/generated-pipeline.md
//
// No network, no DataHub, no model: every function below is pure, so the output is
// deterministic and anyone can reproduce it byte-for-byte.
//
// The DataHub responses are FIXTURES reproducing the catalog state used in the demo
// (DataHub v1.6.0). The transformations applied to them are not simulated — they are the
// same exported functions the app calls at runtime.

import {
  GRAPHQL_OPS,
  detectCatalogIntent,
  summarizeEntity,
  summarizeLineage,
  contextForLLM,
  missingDimension,
  namedAbsentColumn,
} from "../src/datahub/catalog.js";

const dataset = (name, description, owners, fields) => ({
  data: {
    dataset: {
      urn: `urn:li:dataset:(urn:li:dataPlatform:hive,${name},PROD)`,
      name,
      platform: { name: "hive" },
      properties: { description },
      ownership: owners ? { owners: owners.map((username) => ({ owner: { username } })) } : null,
      schemaMetadata: fields ? { fields } : null,
    },
  },
});

const FCT_USERS = dataset(
  "fct_users_created",
  "table containing all the users created on a single day",
  ["jdoe", "datahub"],
  [
    { fieldPath: "user_id", nativeDataType: "varchar(100)", description: "Id of the user created" },
    { fieldPath: "user_name", nativeDataType: "boolean", description: "Name of the user who signed up" },
  ],
);

// The bare dataset seeded by scripts/datahub/ingest-bare.cjs: a description, but no
// ownership and no schema aspect. This is what makes the refusal observable.
const ORDERS_V2 = dataset(
  "orders_v2",
  "Rebuilt orders table. Ownership and schema not yet registered in the catalog.",
  null,
  null,
);

const LINEAGE = {
  data: {
    searchAcrossLineage: {
      searchResults: [
        { entity: { name: "logging_events", platform: { name: "hive" } } },
        { entity: { name: "SampleHiveDataset", platform: { name: "hive" } } },
        { entity: { name: "SampleHdfsDataset", platform: { name: "hdfs" } } },
        { entity: { name: "SampleKafkaDataset", platform: { name: "kafka" } } },
      ],
    },
  },
};

const CASES = [
  { q: "who owns the fct_users_created table?", entity: FCT_USERS, lineage: null },
  { q: "what feeds the fct_users_created table?", entity: FCT_USERS, lineage: LINEAGE },
  { q: "who owns the orders_v2 table?", entity: ORDERS_V2, lineage: null },
  { q: "what type is the foobar column in fct_users_created?", entity: FCT_USERS, lineage: null },
];

const fence = (lang, body) => "```" + lang + "\n" + body + "\n```";

console.log(`# Generated pipeline — what the agent produces per question

**This file is generated.** Reproduce it with:

${fence("bash", "node examples/generate.mjs > examples/generated-pipeline.md")}

Every payload and fact block below was computed by the exported functions in
[\`src/datahub/catalog.js\`](../src/datahub/catalog.js) — the same code the running app calls.
The DataHub responses they consume are fixtures reproducing the demo catalog (DataHub v1.6.0),
because the transformation is what's on show here, not the HTTP round-trip.

For each question the agent derives: an **intent**, a **request payload**, a **fact block**,
and a **routing decision** — narrate through the model, or answer from the catalog alone.
`);

for (const [i, c] of CASES.entries()) {
  const intent = detectCatalogIntent(c.q);
  const summary = summarizeEntity(c.entity);
  const lineage = c.lineage ? summarizeLineage(c.lineage) : null;
  const missing = missingDimension(intent.kind, summary, lineage);
  const absentCol = namedAbsentColumn(c.q, summary);
  const refuses = Boolean(missing || absentCol);

  console.log(`\n---\n\n## ${i + 1}. "${c.q}"\n`);

  console.log(`**Intent** — \`detectCatalogIntent()\`\n`);
  console.log(fence("json", JSON.stringify(intent, null, 2)));

  console.log(`\n**Generated request** — operation name + variables built by \`GRAPHQL_OPS\`\n`);
  const req = { operation: "search", variables: GRAPHQL_OPS.search.variables({ term: intent.term }) };
  console.log(fence("json", JSON.stringify(req, null, 2)));
  console.log(
    `\nThe browser sends only that operation *name*; the server supplies the query text from its ` +
      `whitelist, so no caller can compose a query of its own.\n`,
  );

  if (intent.kind === "lineage") {
    const lineageReq = {
      operation: "lineage",
      variables: GRAPHQL_OPS.lineage.variables({ urn: summary.urn, direction: "UPSTREAM" }),
    };
    console.log(`**Follow-up request** — lineage walk\n`);
    console.log(fence("json", JSON.stringify(lineageReq, null, 2)));
    console.log("");
  }

  console.log(`**Fact block** — \`contextForLLM()\`, narrowed to the dimension asked about\n`);
  console.log(fence("text", contextForLLM(summary, lineage, "UPSTREAM", intent.kind)));

  console.log(`\n**Routing decision**\n`);
  if (absentCol) {
    console.log(
      `\`namedAbsentColumn()\` → \`"${absentCol}"\`. The schema is present but contains no such ` +
        `column, so **the model is removed from the path** and the desk states the gap plus the ` +
        `real schema. Nothing is left that could invent a type.\n`,
    );
  } else if (missing) {
    console.log(
      `\`missingDimension()\` → \`"${missing}"\`. The catalog holds no ${missing} for this ` +
        `dataset, so **the model is removed from the path** and the fact block above is printed ` +
        `directly. This is the case a prompt instruction could not fix: given a partial block, ` +
        `\`llama3.2:1b\` invented an owner in 4 of 5 runs.\n`,
    );
  } else {
    console.log(
      `\`missingDimension()\` → \`null\` and \`namedAbsentColumn()\` → \`null\`. The catalog can ` +
        `answer, so the fact block is handed to the local model to phrase — grounded entirely in ` +
        `the lines above.\n`,
    );
  }
  console.log(`Model in the path: **${refuses ? "no" : "yes"}**`);
}

console.log(`
---

## Why this is the interesting part

Three of the four questions name a dataset that genuinely exists in the catalog, so there is
always plenty of real context to sound confident with. The difference is whether the
*specific dimension asked about* is present. Two checks decide it before any model runs:

| Check | Question it answers | Source |
|---|---|---|
| \`missingDimension()\` | Does the catalog hold owners / schema / lineage at all? | [catalog.js:284](../src/datahub/catalog.js#L284) |
| \`namedAbsentColumn()\` | The schema exists — but does it contain *this* column? | [catalog.js:269](../src/datahub/catalog.js#L269) |

When either fires, the language model never sees the question. That is why the refusals in
[\`datahub-catalog-transcript.md\`](datahub-catalog-transcript.md) return in 58–69 ms while the
answered questions take 820–1041 ms: the honesty is structural, not a matter of wording.
`);
