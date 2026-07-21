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
