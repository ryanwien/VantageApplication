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
