// Pure helpers for DataHub catalog context. No I/O: no fetch, no DOM, no node builtins.
// Every function is total — malformed input yields a safe value, never a throw.

// A catalog question must use catalog vocabulary. Without this gate, "who owns AMD"
// would be stolen from the market desk.
//
// Unambiguous catalog vocabulary — sufficient on its own.
const STRONG = /\b(datahub|catalog|dataset|datasets|lineage|upstream|downstream)\b/i;
// Ambiguous words that are also ordinary English/market terms — only count when
// the sentence is not clearly a market question.
const WEAK = /\b(table|tables|schema|column|columns|field|fields)\b/i;
// Market-desk vocabulary. A weak signal alone cannot outvote these.
const MARKET_VETO = /\b(chart|charts|price|prices|quote|quotes|stock|stocks|ticker|candle|candles|market|trade|trades|trading|earnings|portfolio)\b/i;

const LINEAGE = /\b(lineage|upstream|downstream|feeds?|feeding|depends?\s+on|derived\s+from)\b/i;
const SCHEMA = /\b(schema|columns?|fields?)\b/i;
const OWNER = /\b(owns?|owner|owners|owned\s+by|steward|stewards)\b/i;

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
  const claimed = STRONG.test(t) || (WEAK.test(t) && !MARKET_VETO.test(t));
  if (!claimed) return null;
  const term = extractTerm(t);
  if (!term) return null;
  const kind = LINEAGE.test(t) ? "lineage"
    : SCHEMA.test(t) ? "schema"
    : OWNER.test(t) ? "owner"
    : "search";
  return { kind, term };
}
