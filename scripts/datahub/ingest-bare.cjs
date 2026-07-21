#!/usr/bin/env node
// Ingest a deliberately INCOMPLETE dataset into a local DataHub, so the desk's honesty
// behaviour can actually be observed.
//
// Why this exists: DataHub's bundled sample metadata is fully populated — every dataset has
// owners and a schema. That makes the most important behaviour in this integration invisible,
// because the interesting case is "the catalog knows the dataset but NOT the answer". This
// creates `orders_v2`: a real dataset with a description, but no ownership and no schema.
//
// With it ingested, these questions answer WITHOUT a model — the desk states what is missing
// instead of letting an LLM invent it (via reads "DataHub (catalog)", not "DataHub + <model>"):
//
//   "who owns the orders_v2 table?"          -> DataHub has no owner recorded for orders_v2.
//   "what columns are in the orders_v2 table?" -> DataHub has no schema recorded for orders_v2.
//   "what type is the foobar column in fct_users_created?"
//                                            -> ...has no column named "foobar".
//
// Usage:  node scripts/datahub/ingest-bare.cjs            (defaults to http://localhost:8080)
//         GMS=http://host:8080 node scripts/datahub/ingest-bare.cjs

const GMS = (process.env.GMS || "http://localhost:8080").replace(/\/+$/, "");
const URN = "urn:li:dataset:(urn:li:dataPlatform:hive,orders_v2,PROD)";

async function ingest(aspectName, json) {
  const res = await fetch(`${GMS}/aspects?action=ingestProposal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-RestLi-Protocol-Version": "2.0.0",
      // Only sent when the instance has auth enabled; the quickstart needs no token.
      ...(process.env.DATAHUB_TOKEN ? { Authorization: `Bearer ${process.env.DATAHUB_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      proposal: {
        entityType: "dataset",
        entityUrn: URN,
        changeType: "UPSERT",
        aspectName,
        aspect: { value: JSON.stringify(json), contentType: "application/json" },
      },
    }),
  });
  if (!res.ok) throw new Error(`${aspectName}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  console.log(`  ${aspectName}: ok`);
}

(async () => {
  console.log(`Ingesting orders_v2 (no owners, no schema) into ${GMS}`);
  try {
    await ingest("datasetKey", { platform: "urn:li:dataPlatform:hive", name: "orders_v2", origin: "PROD" });
    await ingest("datasetProperties", {
      name: "orders_v2",
      description: "Rebuilt orders table. Ownership and schema not yet registered in the catalog.",
      customProperties: {},
    });
    // Deliberately NO ownership and NO schemaMetadata aspects — that absence is the point.
    console.log('Done. Try: "who owns the orders_v2 table?"');
  } catch (err) {
    console.error(`Failed: ${err.message}`);
    console.error("Is DataHub running? Check: curl " + GMS + "/health");
    process.exit(1);
  }
})();
