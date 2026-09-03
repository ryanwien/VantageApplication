// ============================================================
//  Brokerage links — pull a real book of holdings into the desk.
//
//  WHAT THIS FILE IS
//  The institution catalog, the demo book, and every piece of pure math the
//  Portfolio panel needs to show manually-typed positions and broker-linked
//  ones in the same list. No React, no fetch, no localStorage — so it can be
//  unit-tested, and so the SERVER can import the exact same catalog and demo
//  book the browser draws (server/index.js does; src/datahub/catalog.js is
//  shared the same way).
//
//  WHY THERE IS A DEMO BOOK AT ALL
//  None of the three institutions below can be read from a browser. Robinhood
//  publishes no third-party API; Morgan Stanley publishes no retail one; Schwab
//  has a developer program whose apps are approved by hand, over weeks. Every
//  real path therefore runs through the server and through somebody's
//  credentials, and this app's standing rule is that the backend is OPTIONAL.
//
//  So a link has two modes and the UI always says which one it is in:
//    • linked  — the server holds an aggregator connection and these are your
//                actual positions.
//    • demo    — a fixed, plausible book, generated here, labelled DEMO
//                everywhere it is drawn. It exists so the feature can be shown
//                and reviewed end-to-end with no credentials and no server.
//  The one thing this file must never do is let those two look alike.
// ============================================================

// Tints are the institutions' own brand colours, used only as a 6px dot beside
// the name — enough to find the row you want in a list of three, not enough to
// pass anything off as that institution's own interface.
export const INSTITUTIONS = [
  {
    id: "robinhood",
    name: "Robinhood",
    tint: "#00C805",
    // How this institution's data can actually be reached. Drawn in the connect
    // sheet so nobody has to read this file to find out why a button is greyed.
    access: "aggregator",
    note: "No public API. Reached through an aggregator (Plaid).",
  },
  {
    id: "schwab",
    name: "Charles Schwab",
    tint: "#00A0DF",
    access: "aggregator",
    note: "Aggregator today; Schwab's own Trader API is a hand-approved app.",
  },
  {
    id: "morgan-stanley",
    name: "Morgan Stanley",
    tint: "#4A7EBB",
    access: "aggregator",
    note: "No public retail API. Reached through an aggregator (Plaid).",
  },
];

export const institutionById = (id) => INSTITUTIONS.find((i) => i.id === id) || null;
export const institutionName = (id) => institutionById(id)?.name || String(id || "");

// ---------- the demo book ----------
//
// Fixed, not random: a demo that reshuffles on every reload cannot be pointed
// at in a meeting. Symbols are drawn from the set the app already synthesizes
// prices for, so a demo link produces rows that actually move on the tape.
// Cost bases are deliberately mixed — a book that is green on every line reads
// as a mock-up, and the P&L colouring is half of what this panel is for.
const DEMO_BOOK = {
  robinhood: [
    {
      id: "individual",
      name: "Individual",
      kind: "Brokerage",
      mask: "4471",
      cash: 1240.55,
      holdings: [
        { sym: "TSLA", shares: 40, cost: 214.8 },
        { sym: "NVDA", shares: 120, cost: 118.42 },
        { sym: "AMD", shares: 65, cost: 171.05 },
      ],
    },
  ],
  schwab: [
    {
      id: "brokerage",
      name: "Brokerage",
      kind: "Brokerage",
      mask: "8820",
      cash: 6410.12,
      holdings: [
        { sym: "AAPL", shares: 150, cost: 191.34 },
        { sym: "MSFT", shares: 60, cost: 402.18 },
        { sym: "XOM", shares: 200, cost: 121.7 },
      ],
    },
    {
      id: "roth",
      name: "Roth IRA",
      kind: "Retirement",
      mask: "3096",
      cash: 812.4,
      holdings: [
        { sym: "GOOGL", shares: 85, cost: 158.9 },
        { sym: "AMZN", shares: 70, cost: 176.25 },
      ],
    },
  ],
  "morgan-stanley": [
    {
      id: "active-assets",
      name: "Active Assets Account",
      kind: "Brokerage",
      mask: "1174",
      cash: 24880.9,
      holdings: [
        { sym: "JPM", shares: 220, cost: 198.55 },
        { sym: "META", shares: 95, cost: 512.4 },
        { sym: "NFLX", shares: 40, cost: 744.1 },
        { sym: "BAC", shares: 900, cost: 39.62 },
      ],
    },
    {
      id: "ira",
      name: "Traditional IRA",
      kind: "Retirement",
      mask: "6205",
      cash: 3190.0,
      holdings: [
        { sym: "MSFT", shares: 140, cost: 371.9 },
        { sym: "DIS", shares: 310, cost: 104.35 },
      ],
    },
  ],
};

// A demo connection, shaped exactly like a real one so nothing downstream has
// to branch on `demo` except the parts that LABEL it.
//
// `at` is injected rather than read from the clock so a test can pin it.
export function demoConnection(institutionId, at = Date.now()) {
  const inst = institutionById(institutionId);
  if (!inst) return null;
  const accounts = DEMO_BOOK[institutionId] || [];
  return {
    id: `demo-${institutionId}`,
    institutionId,
    institutionName: inst.name,
    provider: "demo",
    demo: true,
    connectedAt: at,
    accounts: accounts.map((a) => ({
      id: `${institutionId}-${a.id}`,
      name: a.name,
      kind: a.kind,
      mask: a.mask,
      cash: a.cash,
      holdings: a.holdings.map((h) => ({ ...h })),
    })),
  };
}

// ---------- connections → flat rows ----------
//
// The Portfolio panel draws one flat list. A row carries enough provenance to
// answer "where did this come from" without a lookup: the broker, the account,
// and whether it is demo. `id` is stable across refreshes (it is derived, not
// generated) so React keys don't thrash and a re-fetch doesn't re-animate the
// whole list.
export function holdingsFromConnections(connections = []) {
  const rows = [];
  for (const c of connections || []) {
    for (const acct of c.accounts || []) {
      for (const h of acct.holdings || []) {
        const sym = String(h.sym || "").toUpperCase();
        const shares = Number(h.shares);
        if (!sym || !Number.isFinite(shares) || shares === 0) continue;
        rows.push({
          id: `${c.id}:${acct.id}:${sym}`,
          sym,
          shares,
          cost: Number.isFinite(Number(h.cost)) ? Number(h.cost) : 0,
          source: "linked",
          demo: !!c.demo,
          connectionId: c.id,
          broker: c.institutionId,
          brokerName: c.institutionName || institutionName(c.institutionId),
          account: acct.name,
          accountId: acct.id,
          accountMask: acct.mask || null,
        });
      }
    }
  }
  return rows;
}

// Cash is not a position and must never be drawn as one — but a book that
// ignores it understates the account, and "how much is at Morgan Stanley" is a
// question the anchor gets asked. Kept as its own total.
export function cashFromConnections(connections = []) {
  const out = [];
  for (const c of connections || []) {
    for (const acct of c.accounts || []) {
      const cash = Number(acct.cash);
      if (!Number.isFinite(cash) || cash === 0) continue;
      out.push({
        broker: c.institutionId,
        brokerName: c.institutionName || institutionName(c.institutionId),
        account: acct.name,
        accountId: acct.id,
        demo: !!c.demo,
        cash,
      });
    }
  }
  return out;
}

// Manual positions first, then linked ones. Manual rows are the ones a person
// typed and can delete; linked rows are read-only and are replaced wholesale by
// the next refresh, so they are never merged INTO a manual row even when the
// symbol matches — two lots of AAPL bought in two places are two lots.
export function mergePositions(manual = [], linked = []) {
  const typed = (manual || []).map((p) => ({
    ...p,
    source: p.source || "manual",
    broker: null,
    brokerName: null,
    account: null,
    demo: false,
  }));
  return [...typed, ...(linked || [])];
}

// One line per symbol across every account and broker, with a share-weighted
// average cost. This is what the anchor reads out: "you hold AAPL in two
// places" is a detail for the panel, not for a spoken brief.
export function aggregateBySymbol(rows = []) {
  const bySym = new Map();
  for (const r of rows) {
    const sym = String(r.sym || "").toUpperCase();
    if (!sym) continue;
    const shares = Number(r.shares) || 0;
    const cost = Number(r.cost) || 0;
    const cur = bySym.get(sym) || { sym, shares: 0, costTotal: 0, brokers: new Set(), accounts: 0 };
    cur.shares += shares;
    cur.costTotal += cost * shares;
    if (r.broker) cur.brokers.add(r.broker);
    cur.accounts += 1;
    bySym.set(sym, cur);
  }
  return [...bySym.values()].map((v) => ({
    sym: v.sym,
    shares: v.shares,
    // Share-weighted, and guarded: a short or a zero-share row would divide by
    // zero and put NaN on screen.
    cost: v.shares !== 0 ? v.costTotal / v.shares : 0,
    costTotal: v.costTotal,
    brokers: [...v.brokers],
    accounts: v.accounts,
  }));
}

// Per-broker totals for the connect sheet's summary line. `priceOf` is passed
// in because live prices belong to the app's market layer, not to this file;
// a symbol it cannot price contributes its cost basis instead of vanishing,
// and `priced` says how many rows got a real mark.
export function summarizeByBroker(rows = [], priceOf = () => null) {
  const out = new Map();
  for (const r of rows) {
    if (!r.broker) continue;
    const cur = out.get(r.broker) || {
      broker: r.broker,
      brokerName: r.brokerName || institutionName(r.broker),
      demo: !!r.demo,
      positions: 0,
      priced: 0,
      value: 0,
      cost: 0,
    };
    const shares = Number(r.shares) || 0;
    const price = priceOf(r.sym);
    const marked = Number.isFinite(price) && price != null;
    cur.positions += 1;
    if (marked) cur.priced += 1;
    cur.value += (marked ? price : Number(r.cost) || 0) * shares;
    cur.cost += (Number(r.cost) || 0) * shares;
    out.set(r.broker, cur);
  }
  return [...out.values()].map((b) => ({
    ...b,
    pnl: b.value - b.cost,
    pnlPct: b.cost > 0 ? ((b.value - b.cost) / b.cost) * 100 : 0,
  }));
}

// ---------- Plaid → our shape ----------
//
// The one real path wired today. Plaid is the only aggregator that lists all
// three institutions above, and /investments/holdings/get answers with three
// parallel arrays that have to be joined: accounts, holdings, securities.
//
// COST BASIS IS THE TRAP HERE. Plaid documents `cost_basis` as the total
// original value of the holding; this app stores cost PER SHARE. So the join
// divides — and then sanity-checks, because a provider that ever returns a
// per-share figure in that field would otherwise put a cost basis on screen
// that is wrong by the share count and looks merely surprising rather than
// broken. The 1000× guard is loose on purpose: it is reachable by a unit error
// and essentially not by a real gain or loss.
export function normalizePlaidHoldings(payload = {}, { institutionId, institutionName: instName, connectionId } = {}) {
  const securities = new Map();
  for (const s of payload.securities || []) securities.set(s.security_id, s);

  const accounts = new Map();
  for (const a of payload.accounts || []) accounts.set(a.account_id, a);

  const byAccount = new Map();
  for (const h of payload.holdings || []) {
    const sec = securities.get(h.security_id);
    const sym = String(sec?.ticker_symbol || "").toUpperCase().trim();
    const shares = Number(h.quantity);
    // No ticker means no chart, no quote and no P&L — cash sweeps and
    // unmapped instruments both land here. Dropped rather than drawn as a
    // position with an empty symbol.
    if (!sym || !Number.isFinite(shares) || shares === 0) continue;

    const price = Number(h.institution_price);
    const rawCost = Number(h.cost_basis);
    let cost = 0;
    if (Number.isFinite(rawCost) && rawCost !== 0) {
      const perShare = rawCost / shares;
      const looksPerShare =
        Number.isFinite(price) && price > 0 &&
        (perShare > price * 1000 || perShare < price / 1000);
      cost = looksPerShare ? rawCost : perShare;
    }

    const acctId = h.account_id;
    if (!byAccount.has(acctId)) {
      const a = accounts.get(acctId);
      byAccount.set(acctId, {
        id: acctId,
        name: a?.name || "Account",
        kind: a?.subtype || a?.type || "investment",
        mask: a?.mask || null,
        cash: 0,
        holdings: [],
      });
    }
    byAccount.get(acctId).holdings.push({ sym, shares, cost, price: Number.isFinite(price) ? price : null });
  }

  // Cash comes from the account balance, not from a holding row — Plaid reports
  // an investment account's uninvested cash in `balances.available`.
  for (const [acctId, acct] of byAccount) {
    const bal = accounts.get(acctId)?.balances || {};
    const cash = Number(bal.available);
    if (Number.isFinite(cash)) acct.cash = cash;
  }

  return {
    id: connectionId || `plaid-${institutionId}`,
    institutionId,
    institutionName: instName || institutionName(institutionId),
    provider: "plaid",
    demo: false,
    connectedAt: Date.now(),
    accounts: [...byAccount.values()],
  };
}

// A one-line spoken summary of a linked book, for the anchor. Returns null when
// there is nothing to say, so the caller can fall back to its own line rather
// than reading out an empty sentence.
export function speakableBrokerLine(broker, rows = [], priceOf = () => null, money = (n) => `$${n.toFixed(2)}`) {
  const mine = rows.filter((r) => r.broker === broker);
  if (!mine.length) return null;
  const [sum] = summarizeByBroker(mine, priceOf);
  if (!sum) return null;
  const dir = sum.pnl >= 0 ? "up" : "down";
  return `${sum.brokerName}: ${sum.positions} position${sum.positions === 1 ? "" : "s"}, ${dir} ${money(Math.abs(sum.pnl))}, ${Math.abs(sum.pnlPct).toFixed(1)} percent.`;
}

// ---------- the plan gate ----------
//
// Linking a LIVE account is the Trading Floor perk. The demo book is free on
// every plan, because simulated data is exactly what the entry plan is sold on
// — so this gates the aggregator path and nothing else.
//
// It lives here rather than inline in the server for one reason: a four-line
// authorization check that guards a stored brokerage credential is worth
// having tests, and the server file cannot be imported without starting a
// listener. React.jsx's FEATURE_PLAN.brokers is the client's copy of the same
// answer; this is the one the server enforces.
export const BROKER_PLAN = "desk";

// Returns an error body to send, or null to proceed. An unknown plan, a missing
// account and a lapsed one all fail closed — the only value that opens the gate
// is the exact plan id.
export function brokerPlanGate(plan) {
  if (plan === BROKER_PLAN) return null;
  return {
    error: "Linking a live brokerage account is a Trading Floor feature. Every plan can put a demonstration book on the desk.",
    needsPlan: BROKER_PLAN,
  };
}

// Which institution is a spoken/typed phrase asking about? Used by the desk so
// "how's my Morgan Stanley account" reaches the right book. Returns an id or
// null — never a guess, because briefing the wrong account is worse than
// briefing all of them.
export function matchInstitution(text = "") {
  const q = String(text).toLowerCase();
  // Spelled out, never the ticker: HOOD is Robinhood's own listing and MS is
  // Morgan Stanley's, and both are charted by name elsewhere in the desk.
  if (/\brobin\s*hood\b/.test(q)) return "robinhood";
  if (/\bschwab\b|\bcharles\s+schwab\b|\btd\s*ameritrade\b|\bameritrade\b/.test(q)) return "schwab";
  // "morgan stanley" spelled out only. A bare MS is the ticker — the desk's own
  // alias table already maps MORGANSTANLEY → MS — and stealing it here would
  // mean typing MS charted nothing and briefed an account instead.
  if (/\bmorgan\s*stanley\b/.test(q)) return "morgan-stanley";
  return null;
}
