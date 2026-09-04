// ============================================================
//  Morgan Stanley — the seam, not the integration.
//
//  WHAT IS KNOWN, FROM MORGAN STANLEY'S OWN PORTAL
//    • developer.morganstanley.com exists and is real. Its catalog is behind a
//      sign-in wall; /signup returns 403 and /register 404, so there is no
//      self-serve key. Its sign-in page states the rule outright: "Morgan
//      Stanley APIs are accessible to clients via invitation. Please contact
//      your client service representative."
//    • The REST APIs are built to the OpenAPI Specification.
//    • They are secured with OAuth 2.0 "and the protocol's support for strong
//      certificate-based exchange" — i.e. the client authenticates with a
//      certificate, not a shared secret.
//    • The terms tie the API Services to Morgan Stanley Matrix®, which is an
//      INSTITUTIONAL platform. Whether retail wealth-management holdings are
//      served at all is an open question for the onboarding conversation, and
//      it is the question that decides whether this file ever ships.
//
//  WHAT IS NOT KNOWN, AND IS THEREFORE NOT WRITTEN
//    Every endpoint path, and every field name in every response.
//
//    Those are left blank on purpose. An invented field name is the worst kind
//    of wrong here because it does not throw: pluck() returns undefined, which
//    becomes 0, which renders as a cost basis of zero and a position that
//    appears up 100%. A demo fails in the room and nobody can say why. So the
//    field map below is empty, mapAccounts() refuses to run against an
//    incomplete map, and the refusal names exactly which keys are missing.
//
//  WHEN THE SPEC ARRIVES
//    Fill in MS_HOLDINGS_MAP and MS_TRADES_MAP from the OpenAPI document, set
//    the two endpoint constants, and this becomes a working provider without
//    touching the server's dispatch, the panel, or the tape. That is the whole
//    point of the seam: the shape of the answer is already agreed.
// ============================================================
import { mapAccounts, mapTrades, mapIsComplete, missingMapKeys, REQUIRED_TRADE_KEYS } from "./fieldmap.js";

export const MS_INSTITUTION_ID = "morgan-stanley";

// Filled from the onboarding pack. Left empty rather than guessed.
export const MS_BASE = process.env.MORGAN_STANLEY_API_BASE || "";
export const MS_TOKEN_URL = process.env.MORGAN_STANLEY_TOKEN_URL || "";
export const MS_HOLDINGS_PATH = process.env.MORGAN_STANLEY_HOLDINGS_PATH || "";
export const MS_TRADES_PATH = process.env.MORGAN_STANLEY_TRADES_PATH || "";

// ⚠ EMPTY ON PURPOSE. See the header. Filling these in is the entire job once
// the OpenAPI spec is in hand; the keys each map needs are listed by
// missingMapKeys(), so the error message is the checklist.
export const MS_HOLDINGS_MAP = {
  // accounts: "",        ← path to the array of accounts in the response
  // accountId: "", accountName: "", accountMask: "", accountCash: "",
  // positions: "",       ← path to the array of positions within an account
  // symbol: "", shares: "", cost: "", price: "",
  // costIsTotal: false,  ← true only if `cost` is the whole lot, not per share
};

export const MS_TRADES_MAP = {
  // trades: "", id: "", at: "", symbol: "", shares: "", side: "", price: "",
  // buyValues: ["BUY"], sharesSigned: false,
};

// Three separate questions, and the UI needs all three answered differently:
// credentials missing, spec missing, or ready.
export const msCredentialsPresent = (env = process.env) =>
  !!(env.MORGAN_STANLEY_CLIENT_ID && env.MORGAN_STANLEY_CLIENT_CERT && env.MORGAN_STANLEY_CLIENT_KEY);
export const msSpecPresent = () =>
  !!(MS_BASE && MS_HOLDINGS_PATH) && mapIsComplete(MS_HOLDINGS_MAP);
export const msReady = (env = process.env) => msCredentialsPresent(env) && msSpecPresent();

// One place that explains what is still missing, in the order it can be fixed.
// Returned to the browser so the connect sheet can say something true rather
// than "not configured", which would be three different problems under one
// label.
export function msReadiness(env = process.env) {
  if (!msCredentialsPresent(env)) {
    return {
      ready: false,
      stage: "credentials",
      message: "Morgan Stanley API access is granted by invitation. Ask your Morgan Stanley representative (or API@morganstanley.com) to onboard you to the API Platform.",
    };
  }
  if (!msSpecPresent()) {
    return {
      ready: false,
      stage: "spec",
      message: `Credentials are set, but the response shape is not mapped yet — missing: ${[
        !MS_BASE && "API base URL",
        !MS_HOLDINGS_PATH && "holdings endpoint",
        ...missingMapKeys(MS_HOLDINGS_MAP).map((k) => `field map: ${k}`),
      ].filter(Boolean).join(", ")}. Fill these from the OpenAPI spec that comes with onboarding.`,
    };
  }
  return { ready: true, stage: "ready", message: null };
}

// mTLS, because their OAuth uses certificate-based client authentication.
// Node's fetch cannot present a client certificate on its own — it needs an
// undici Agent with the cert and key on the connect options. Built lazily and
// imported dynamically so that a deployment which never touches Morgan Stanley
// does not pay for undici at boot.
export async function msAgent(env = process.env) {
  if (!msCredentialsPresent(env)) throw new Error(msReadiness(env).message);
  const { Agent } = await import("undici");
  return new Agent({
    connect: {
      cert: env.MORGAN_STANLEY_CLIENT_CERT,
      key: env.MORGAN_STANLEY_CLIENT_KEY,
      // Some institutional endpoints sit behind a private CA. Optional, and
      // NOT a switch for disabling verification — there is deliberately no
      // rejectUnauthorized here, because turning that off is how an mTLS
      // integration quietly stops being mutually authenticated.
      ...(env.MORGAN_STANLEY_CA ? { ca: env.MORGAN_STANLEY_CA } : {}),
    },
  });
}

// The two normalizers, expressed against the field map. They are complete —
// what is missing is only the map they read, which is why they refuse loudly
// rather than returning empty.
export const normalizeMorganStanleyAccounts = (payload, ctx = {}) =>
  mapAccounts(payload, MS_HOLDINGS_MAP, {
    ...ctx,
    provider: "morgan-stanley",
    institutionId: ctx.institutionId || MS_INSTITUTION_ID,
    institutionName: ctx.institutionName || "Morgan Stanley",
  });

export const normalizeMorganStanleyTrades = (payload, ctx = {}) =>
  mapTrades(payload, MS_TRADES_MAP, {
    ...ctx,
    institutionId: ctx.institutionId || MS_INSTITUTION_ID,
    institutionName: ctx.institutionName || "Morgan Stanley",
  });

export const MS_TRADES_REQUIRED = REQUIRED_TRADE_KEYS;
