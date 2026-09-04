// ============================================================
//  A field map, so a new brokerage is configuration rather than code.
//
//  WHY THIS EXISTS
//  Plaid and Schwab each needed a hand-written normalizer, and both were worth
//  it: their quirks are real logic (Plaid's cost_basis is a total and has to be
//  divided; Schwab hides trades inside transferItems next to fee legs). But
//  most of what a normalizer does is duller than that — reach into a nested
//  response, pull six fields, rename them.
//
//  Morgan Stanley's spec is not published; it arrives with onboarding. Writing
//  a normalizer now would mean INVENTING field names, and an invented field
//  name does not fail loudly — it silently yields undefined, which becomes 0,
//  which becomes a cost basis of zero and a portfolio that looks up 100%. So
//  the shape of the answer is built here and the names are left blank, to be
//  filled from the real spec rather than from a guess.
//
//  This is deliberately NOT a general-purpose mapping language. It resolves dot
//  paths and nothing else — no expressions, no arithmetic. Anything that needs
//  real logic gets a hand-written normalizer, the way Plaid and Schwab did.
// ============================================================

// Resolve "a.b.c" against an object. Returns undefined for any missing link
// rather than throwing, because a partial response is a normal thing for a
// brokerage to send and it should degrade one row, not the request.
export function pluck(obj, path) {
  if (!obj || !path) return undefined;
  let cur = obj;
  for (const key of String(path).split(".")) {
    if (cur == null) return undefined;
    cur = cur[key];
  }
  return cur;
}

// A number, or null — never NaN. NaN is the value that survives every guard
// and renders as "NaN" three components later, so it is stopped at the door.
export function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Which keys a holdings map must define before it can be trusted. Listed here
// so an incomplete map is caught at load with a message naming what is missing,
// rather than producing rows of undefined at request time.
export const REQUIRED_HOLDING_KEYS = ["accounts", "positions", "symbol", "shares"];

export function missingMapKeys(map = {}, required = REQUIRED_HOLDING_KEYS) {
  return required.filter((k) => !map || !map[k]);
}

export const mapIsComplete = (map, required) => missingMapKeys(map, required).length === 0;

// Apply a field map to a provider response, producing the same account shape
// every other provider in this app produces.
//
// `map` names paths, never values:
//   { accounts: "data.accounts",       ← array of accounts in the payload
//     accountId: "id", accountName: "nickname", accountMask: "maskedNumber",
//     accountCash: "balances.cash",
//     positions: "positions",          ← array of positions WITHIN an account
//     symbol: "instrument.ticker", shares: "quantity",
//     cost: "averageCost",             ← PER SHARE; see costIsTotal below
//     price: "marketPrice" }
//
// `costIsTotal: true` divides by the share count, the way Plaid needs. It is a
// flag rather than an assumption because getting it wrong is invisible: both
// readings produce a plausible number, and only one is right.
export function mapAccounts(payload, map = {}, { connectionId, institutionId, institutionName, provider } = {}) {
  const missing = missingMapKeys(map);
  if (missing.length) {
    throw new Error(`This provider's field map is incomplete — missing: ${missing.join(", ")}. Fill it in from the provider's spec; it is deliberately not guessed.`);
  }

  const accountsRaw = pluck(payload, map.accounts);
  const list = Array.isArray(accountsRaw) ? accountsRaw : (accountsRaw ? [accountsRaw] : []);
  const accounts = [];

  for (const [i, acct] of list.entries()) {
    const positionsRaw = pluck(acct, map.positions);
    const positions = Array.isArray(positionsRaw) ? positionsRaw : [];
    const holdings = [];

    for (const pos of positions) {
      const sym = String(pluck(pos, map.symbol) ?? "").toUpperCase().trim();
      const shares = num(pluck(pos, map.shares));
      if (!sym || shares === null || shares === 0) continue;
      const rawCost = num(pluck(pos, map.cost));
      const cost = rawCost === null ? 0 : (map.costIsTotal ? rawCost / shares : rawCost);
      holdings.push({ sym, shares, cost, price: num(pluck(pos, map.price)) });
    }

    const idRaw = pluck(acct, map.accountId);
    accounts.push({
      id: String(idRaw ?? `${provider || "acct"}-${i}`),
      name: String(pluck(acct, map.accountName) ?? "Account"),
      kind: String(pluck(acct, map.accountKind) ?? "Brokerage"),
      mask: pluck(acct, map.accountMask) ?? null,
      cash: num(pluck(acct, map.accountCash)) ?? 0,
      holdings,
      activity: [],
    });
  }

  return {
    id: connectionId || `${provider || "conn"}-${Date.now()}`,
    institutionId,
    institutionName,
    provider,
    demo: false,
    connectedAt: Date.now(),
    accounts,
  };
}

export const REQUIRED_TRADE_KEYS = ["trades", "symbol", "shares", "side"];

// The tape, same idea. `buyValues` lists the strings this provider uses for a
// purchase — every provider spells it differently (BUY / Buy / B / PURCHASE),
// and a sign convention is not safe to assume either, so `sharesSigned` says
// whether direction can be read from the quantity instead.
export function mapTrades(payload, map = {}, ctx = {}) {
  const missing = missingMapKeys(map, REQUIRED_TRADE_KEYS);
  if (missing.length) {
    throw new Error(`This provider's trade map is incomplete — missing: ${missing.join(", ")}.`);
  }
  const raw = pluck(payload, map.trades);
  const list = Array.isArray(raw) ? raw : [];
  const buys = new Set((map.buyValues || ["buy", "b", "purchase", "bought"]).map((v) => String(v).toLowerCase()));
  const sells = new Set((map.sellValues || ["sell", "s", "sold", "sale"]).map((v) => String(v).toLowerCase()));
  const rows = [];

  for (const [i, t] of list.entries()) {
    const sym = String(pluck(t, map.symbol) ?? "").toUpperCase().trim();
    const signed = num(pluck(t, map.shares));
    if (!sym || signed === null || signed === 0) continue;

    // A side that matches NEITHER vocabulary is skipped, not guessed.
    // Defaulting the unknown to "sell" reads fine in code and is the worst
    // possible failure on screen: a purchase drawn as a disposal, in the
    // brokerage's own colours, with nothing to indicate anything went wrong. A
    // missing row is visibly missing; a mislabelled one is confidently wrong.
    let side;
    if (map.sharesSigned) {
      side = signed > 0 ? "buy" : "sell";
    } else {
      const raw = String(pluck(t, map.side) ?? "").toLowerCase();
      if (buys.has(raw)) side = "buy";
      else if (sells.has(raw)) side = "sell";
      else continue;
    }

    const price = num(pluck(t, map.price));
    const shares = Math.abs(signed);
    const at = map.at ? Date.parse(pluck(t, map.at)) : NaN;

    rows.push({
      id: String(pluck(t, map.id) ?? `${ctx.connectionId}:${sym}:${i}`),
      at: Number.isFinite(at) ? at : null,
      side,
      sym,
      shares,
      price,
      amount: price === null ? null : price * shares,
      demo: false,
      broker: ctx.institutionId ?? null,
      brokerName: ctx.institutionName ?? null,
      account: ctx.accountName ?? "Account",
      accountId: ctx.accountId ?? null,
    });
  }
  return rows.sort((a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity));
}
