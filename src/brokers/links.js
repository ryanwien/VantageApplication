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
