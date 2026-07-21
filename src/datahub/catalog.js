// Pure helpers for DataHub catalog context. No I/O: no fetch, no DOM, no node builtins.
// Every function is total — malformed input yields a safe value, never a throw.

// A catalog question must show positive evidence of referring to a catalog asset.
// Without this gate, "who owns AMD" would be stolen from the market desk — but a
// blocklist of market words is the wrong fix, since a financial company's catalog
// legitimately has a `trades` table. Instead we require positive evidence: either
// unambiguous catalog vocabulary, or an ambiguous word (table/schema/owns/...)
// paired with something that looks like an actual dataset reference (a dotted or
// snake_case identifier, a quoted name, or the "the <name> table" construction).
//
// Unambiguous catalog vocabulary — sufficient on its own.
const STRONG = /\b(datahub|catalog|dataset|datasets|lineage|upstream|downstream)\b/i;
// Ambiguous words that are also ordinary English/market terms — only count when
// paired with positive evidence of a dataset reference (see WEAK_OR_VERB below).
const WEAK = /\b(table|tables|schema|column|columns|field|fields)\b/i;

const LINEAGE = /\b(lineage|upstream|downstream|feeds?|feeding|depends?\s+on|derived\s+from)\b/i;
const SCHEMA = /\b(schema|columns?|fields?)\b/i;
const OWNER = /\b(owns?|owner|owners|owned\s+by|steward|stewards)\b/i;

// A snake_case / dotted identifier is dataset-shaped. Market tickers are short ALL-CAPS
// (AMD, NVDA) and never contain _ or . — so this reliably indicates a catalog reference.
const IDENTIFIER = /\b[A-Za-z0-9]+(?:[._][A-Za-z0-9]+)+\b/;
// "the <name> table" / "the <name> dataset" — the article matters: it distinguishes
// "the trades table" (a real dataset) from "playing table stakes" (an idiom).
const THE_X_TABLE = /\bthe\s+[A-Za-z0-9_]+\s+(?:table|dataset)\b/i;
const QUOTED = /["`][^"`]+["`]/;

function extractTerm(t) {
  const quoted = t.match(/["`]([^"`]+)["`]/);
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
  if (typeof text !== "string") return null;
  const t = text.trim();
  if (!t) return null;
  const weakOrVerb = WEAK.test(t) || LINEAGE.test(t) || SCHEMA.test(t) || OWNER.test(t);
  const claimed = STRONG.test(t)
    || THE_X_TABLE.test(t)
    || (IDENTIFIER.test(t) && weakOrVerb)
    || (QUOTED.test(t) && weakOrVerb);
  if (!claimed) return null;
  const term = extractTerm(t);
  if (!term) return null;
  const kind = LINEAGE.test(t) ? "lineage"
    : SCHEMA.test(t) ? "schema"
    : OWNER.test(t) ? "owner"
    : "search";
  return { kind, term };
}

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

// Safe coercion for GraphQL variable fields: a garbage FIELD VALUE (e.g. an object with a
// throwing toString/Symbol.toPrimitive, or a Symbol) must never crash a variables builder.
// We deliberately do NOT attempt to stringify non-strings — that's exactly what would invoke
// a caller-supplied coercion method. Anything that isn't already a string becomes "".
const safeStr = (v) => (typeof v === "string" ? v : "");

export const GRAPHQL_OPS = {
  search: { query: SEARCH_QUERY, variables: (v) => ({ q: safeStr(v?.term) }) },
  entity: { query: ENTITY_QUERY, variables: (v) => ({ urn: safeStr(v?.urn) }) },
  lineage: {
    query: LINEAGE_QUERY,
    variables: (v) => ({
      urn: safeStr(v?.urn),
      direction: v?.direction === "DOWNSTREAM" ? "DOWNSTREAM" : "UPSTREAM",
    }),
  },
};

// Fuzzy-search honesty check: DataHub's search returns near-matches even when nothing
// really matches (e.g. "asdfghjkl_no_such_dataset" still returns SampleHdfsDataset).
// This tells the caller whether a search hit is actually close to what was asked for,
// so a near-match can be disclosed instead of silently presented as the real answer.
// Total: normalizes both sides (lowercase, strip non-alphanumerics) and returns true
// if either normalized string contains the other. Never throws — non-string or empty
// input simply yields false.
export function isCloseMatch(term, name) {
  if (typeof term !== "string" || typeof name !== "string") return false;
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const a = normalize(term);
  const b = normalize(name);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

export function isKnownOp(name) {
  return typeof name === "string" && Object.prototype.hasOwnProperty.call(GRAPHQL_OPS, name);
}

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
    "Facts from DataHub (live metadata catalog):",
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
