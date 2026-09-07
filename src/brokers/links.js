// Demo brokerage links, as they are persisted in the browser.
//
// Real links live on the server (server/index.js holds the aggregator's access
// token). Demo links live HERE, in localStorage["vantage-broker-links"], for
// one reason: this app's backend is optional, and a demo of the Morgan Stanley
// feature that only works when someone remembered to start a Node process is
// not a demo anybody can rely on.
//
// Pure string-in / value-out, like src/settings/preferences.js, so the parsing
// and the de-duplication can be tested without a browser.

import { demoConnection, institutionById } from "./brokers.js";

export const LINKS_KEY = "vantage-broker-links";

// Stored as ids, not as whole books. The book is regenerated from
// src/brokers/brokers.js on every load, so improving the demo data does not
// leave old shapes stranded in somebody's localStorage — and a tampered or
// half-written value can only ever produce a valid connection or none.
export function loadLinks(rawString) {
  let ids = [];
  try {
    const parsed = rawString ? JSON.parse(rawString) : [];
    if (Array.isArray(parsed)) ids = parsed;
  } catch { ids = []; }
  const seen = new Set();
  const out = [];
  for (const raw of ids) {
    // Tolerate both shapes: a bare id, and the {id, at} record written below.
    const id = typeof raw === "string" ? raw : raw?.id;
    const at = typeof raw === "object" && Number.isFinite(raw?.at) ? raw.at : undefined;
    if (!id || seen.has(id) || !institutionById(id)) continue;
    seen.add(id);
    const conn = demoConnection(id, at);
    if (conn) out.push(conn);
  }
  return out;
}

export const serializeLinks = (connections = []) =>
  JSON.stringify(connections.map((c) => ({ id: c.institutionId, at: c.connectedAt })));

// Linking the same institution twice is a no-op, not a second copy of the same
// book — the panel would otherwise double every position in it.
export function addDemoLink(connections = [], institutionId, at = Date.now()) {
  if (!institutionById(institutionId)) return connections;
  if (connections.some((c) => c.institutionId === institutionId)) return connections;
  const conn = demoConnection(institutionId, at);
  return conn ? [...connections, conn] : connections;
}

export const removeLink = (connections = [], institutionId) =>
  connections.filter((c) => c.institutionId !== institutionId);

// Which institutions the connect sheet should still offer.
//
// THE DEMO/REAL DISTINCTION IS THE WHOLE RULE, and getting it wrong here is
// worse than it looks. Filtering on institutionId alone — "is this brokerage
// present at all" — meant a DEMO book hid its own institution, so trying the
// demo made the real account unreachable. The demo is offered on every plan
// and is the natural first click, so the most likely path through this feature
// locked the user out of the paid half of it, with no route back except
// unlinking the demo and somehow knowing that was the reason.
//
// In demo mode the demo IS the link and still counts: there is no live path to
// offer, and addDemoLink() no-ops on a duplicate, so listing it again would
// render a button that does nothing.
// PARTIAL PROVIDERS reach only part of an institution's book. Robinhood issues
// exactly one self-serve key and it covers crypto and nothing else — no
// equities exist on that path at all. So a robinhood-crypto connection is not
// "Robinhood is linked": somebody holding stocks there still needs the
// aggregator, and hiding the row because a link of some kind exists is how they
// would never find it.
export const PARTIAL_PROVIDERS = new Set(["robinhood-crypto"]);

// `aggregator` says whether a fuller path (Plaid) is configured. Without one
// there is nothing better to offer, so a partial link is all this server can
// do and the row stays hidden rather than promising an upgrade it cannot make.
export function unlinkedInstitutions(institutions = [], connections = [], { isDemoMode = false, aggregator = false } = {}) {
  return institutions.filter((i) => !connections.some((c) => {
    if (c.institutionId !== i.id) return false;
    // A demo book never hides a live path — see above.
    if (!isDemoMode && c.demo) return false;
    // A crypto-only link does not cover the equities the aggregator would add.
    if (aggregator && PARTIAL_PROVIDERS.has(c.provider)) return false;
    return true;
  }));
}

// What an already-linked institution would GAIN by connecting again, or null if
// it is not linked at all. The connect sheet says this on the button, because
// "CONNECT" beside a Robinhood row that is already on the desk reads as a bug
// rather than as the offer of the half it is missing.
export function partialCoverage(institutionId, connections = []) {
  const c = (connections || []).find(
    (x) => x.institutionId === institutionId && !x.demo && PARTIAL_PROVIDERS.has(x.provider),
  );
  return c ? "crypto" : null;
}
