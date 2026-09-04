// ============================================================
//  Charles Schwab — Trader API, read side.
//
//  The first FIRST-PARTY brokerage path in this app: no aggregator in the
//  middle, Schwab's own OAuth, Schwab's own account data. Everything here is
//  pure — parse and reshape only — so the join can be tested without
//  credentials, which matters more here than usual (see the honesty note at the
//  bottom of this comment).
//
//  THE SHAPE OF THE INTEGRATION
//    1. OAuth 2.0 authorization code flow against api.schwabapi.com.
//       Access token lives 30 MINUTES; the refresh token lives 7 DAYS. Both
//       numbers are short enough to be a design constraint rather than a
//       detail: a link refreshes its access token on almost every use, and a
//       user who does not open Vantage for a week has to reconnect. The server
//       stores both and re-auths on demand.
//    2. GET /trader/v1/accounts/accountNumbers  →  the account HASHES.
//       This is the step that is easy to miss and fails confusingly: the API
//       does not accept raw account numbers anywhere. Every later call is
//       addressed by hash, and the raw number is display-only.
//    3. GET /trader/v1/accounts?fields=positions  →  balances + positions.
//    4. GET /trader/v1/accounts/{hash}/transactions?types=TRADE  →  the tape.
//
//  ⚠ HONESTY NOTE — the positions and transactions SHAPES below follow
//  Schwab's documented Trader API objects, which inherit TD Ameritrade's
//  lineage. They have NOT been run against a live Schwab account, because the
//  app registration is approved by hand and was still pending when this was
//  written. The field names are the part most likely to be wrong. Everything
//  is therefore read defensively — a missing field degrades a row rather than
//  throwing — and the tests below pin the documented shape so a real response
//  that disagrees fails loudly and in one place.
// ============================================================

export const SCHWAB_BASE = "https://api.schwabapi.com";
export const SCHWAB_AUTH_URL = `${SCHWAB_BASE}/v1/oauth/authorize`;
export const SCHWAB_TOKEN_URL = `${SCHWAB_BASE}/v1/oauth/token`;
export const SCHWAB_TRADER = `${SCHWAB_BASE}/trader/v1`;

// Schwab's own scope for the trader product. Read and write live under one
// scope — there is no read-only variant to ask for — so the restraint has to
// be ours: nothing in this file or its server caller ever calls an order
// endpoint.
export const SCHWAB_SCOPE = "readonly";

// An access token is good for 30 minutes. Refreshed a minute early so a call
// that starts at 29:59 does not arrive expired.
export const SCHWAB_ACCESS_TTL_MS = 30 * 60 * 1000;
export const SCHWAB_REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const tokenExpiresAt = (expiresInSec, now = Date.now()) =>
  now + Math.max(60, Number(expiresInSec) || 1800) * 1000 - 60_000;
export const tokenIsStale = (expiresAt, now = Date.now()) => !expiresAt || now >= expiresAt;

// Has the 7-day refresh window closed? Distinct from "the access token
// expired": one is routine and invisible, the other means the person has to
// stand in front of Schwab's consent screen again. The UI says which.
export const refreshWindowClosed = (connectedAt, now = Date.now()) =>
  !!connectedAt && now - connectedAt > SCHWAB_REFRESH_TTL_MS;

// ---------- accountNumbers → hash lookup ----------
//
// [{ accountNumber: "...", hashValue: "..." }] → Map(number → hash). Returned
// as a Map rather than an object because account numbers are digit strings and
// an object would silently reorder them.
export function schwabAccountHashes(payload = []) {
  const out = new Map();
  for (const row of Array.isArray(payload) ? payload : []) {
    const num = String(row?.accountNumber || "").trim();
    const hash = String(row?.hashValue || "").trim();
    if (num && hash) out.set(num, hash);
  }
  return out;
}

// Last four, for display. The full number is never drawn — the panel shows a
// mask, and the hash is what the API is addressed with anyway.
const maskOf = (accountNumber) => {
  const s = String(accountNumber || "").replace(/\D/g, "");
  return s.length >= 4 ? s.slice(-4) : null;
};

// Schwab names account types in caps: MARGIN, CASH. Title-cased for the panel,
// which sits beside "Brokerage" and "Retirement" from the demo book.
const kindOf = (type) => {
  const t = String(type || "").toUpperCase();
  if (t === "MARGIN") return "Margin";
  if (t === "CASH") return "Cash";
  return t ? t.charAt(0) + t.slice(1).toLowerCase() : "Brokerage";
};

// ---------- accounts + positions → a connection ----------
//
// GET /trader/v1/accounts?fields=positions answers with an ARRAY of
// { securitiesAccount: {...} } wrappers — the wrapper is not decoration, it is
// where a future non-securities account type would differ, so it is unwrapped
// explicitly rather than assumed away.
export function normalizeSchwabAccounts(payload, { connectionId, institutionId = "schwab", institutionName = "Charles Schwab" } = {}) {
  const list = Array.isArray(payload) ? payload : (payload ? [payload] : []);
  const accounts = [];

  for (const entry of list) {
    const sa = entry?.securitiesAccount || entry;
    if (!sa) continue;
    const accountNumber = sa.accountNumber ?? sa.accountId ?? null;

    const holdings = [];
    for (const pos of sa.positions || []) {
      const sym = String(pos?.instrument?.symbol || "").toUpperCase().trim();
      if (!sym) continue;
      // A short is a real position and must not be dropped or made positive:
      // netting long against short is what the broker itself reports, and a
      // sign flip here would show a short book as a long one.
      const long = Number(pos.longQuantity) || 0;
      const short = Number(pos.shortQuantity) || 0;
      const shares = long - short;
      if (!shares) continue;
      // averagePrice is already PER SHARE — unlike Plaid's cost_basis, which
      // is a total and has to be divided. No conversion, and no guard needed.
      const cost = Number(pos.averagePrice);
      const mv = Number(pos.marketValue);
      holdings.push({
        sym,
        shares,
        cost: Number.isFinite(cost) ? cost : 0,
        price: Number.isFinite(mv) && shares !== 0 ? mv / shares : null,
      });
    }

    // Schwab reports several cash figures; cashBalance is the settled one and
    // the only one that means "money sitting here".
    const bal = sa.currentBalances || sa.initialBalances || {};
    const cash = Number(bal.cashBalance ?? bal.cashAvailableForTrading);

    accounts.push({
      id: String(sa.hashValue || accountNumber || `schwab-${accounts.length}`),
      name: sa.nickName || kindOf(sa.type),
      kind: kindOf(sa.type),
      mask: maskOf(accountNumber),
      cash: Number.isFinite(cash) ? cash : 0,
      holdings,
      activity: [],
    });
  }

  return {
    id: connectionId || `schwab-${Date.now()}`,
    institutionId,
    institutionName,
    provider: "schwab",
    demo: false,
    connectedAt: Date.now(),
    accounts,
  };
}

// ---------- transactions → the tape ----------
//
// A Schwab transaction is a container; the trade is in `transferItems`. One
// TRADE typically carries the instrument leg AND its fee legs, so the fees have
// to be filtered out — a commission row has no symbol, or an assetType of
// CURRENCY, and drawing it as a position change would be nonsense.
//
// `amount` on the instrument leg is the SIGNED quantity: positive bought,
// negative sold. That sign is the only reliable direction indicator here —
// `netAmount` on the container is signed by cash flow, which is the opposite
// way round and easy to read backwards.
export function normalizeSchwabTransactions(payload, { connectionId, accountName = "Brokerage", accountId, institutionId = "schwab", institutionName = "Charles Schwab" } = {}) {
  const list = Array.isArray(payload) ? payload : [];
  const rows = [];

  for (const tx of list) {
    if (String(tx?.type || "").toUpperCase() !== "TRADE") continue;
    for (const item of tx.transferItems || []) {
      const inst = item?.instrument || {};
      const sym = String(inst.symbol || "").toUpperCase().trim();
      const assetType = String(inst.assetType || "").toUpperCase();
      // Fee and cash legs ride along inside the same TRADE.
      if (!sym || assetType === "CURRENCY" || item.feeType) continue;

      const signed = Number(item.amount);
      if (!Number.isFinite(signed) || signed === 0) continue;
      const price = Number(item.price);
      const at = Date.parse(tx.time || tx.tradeDate || tx.settlementDate);

      rows.push({
        id: String(tx.activityId ?? tx.transactionId ?? `${connectionId}:${sym}:${tx.time}`),
        at: Number.isFinite(at) ? at : null,
        side: signed > 0 ? "buy" : "sell",
        sym,
        shares: Math.abs(signed),
        price: Number.isFinite(price) ? price : null,
        amount: Number.isFinite(price) ? price * Math.abs(signed) : null,
        demo: false,
        broker: institutionId,
        brokerName: institutionName,
        account: accountName,
        accountId: accountId || null,
      });
    }
  }

  return rows.sort((a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity));
}

// Schwab wants ISO-8601 with milliseconds and a Z, and rejects a plain
// YYYY-MM-DD on the transactions endpoint — a difference from Plaid that is
// invisible until it 400s.
export const schwabDate = (ms) => new Date(ms).toISOString().slice(0, 23) + "Z";
