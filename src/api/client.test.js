// Tests for the REST client. The behaviour that matters here is not "does fetch
// work" — it is the contract the rest of the app leans on: a missing backend is a
// normal state, a 401 must not leave a dead token behind, and every failure
// arrives as one typed shape instead of an assortment of thrown strings.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api, ApiError, tokenStore } from "./client.js";

// Minimal localStorage stand-in — the client only ever needs these three methods.
function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

// Build a Response-alike. The client reads .ok, .status and .text().
const reply = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (typeof body === "string" ? body : JSON.stringify(body ?? "")),
});

beforeEach(() => {
  globalThis.window = { localStorage: fakeStorage() };
  globalThis.fetch = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.window;
});

describe("tokenStore", () => {
  it("round-trips a token", () => {
    tokenStore.set("abc123");
    expect(tokenStore.get()).toBe("abc123");
  });

  it("reports an empty string when nothing is stored", () => {
    expect(tokenStore.get()).toBe("");
  });

  it("clear() removes the token rather than storing an empty one", () => {
    tokenStore.set("abc123");
    tokenStore.clear();
    expect(tokenStore.get()).toBe("");
    expect(window.localStorage._map.has("vantage-session-token")).toBe(false);
  });

  it("survives a localStorage that throws (private mode)", () => {
    globalThis.window = {
      localStorage: {
        getItem() { throw new Error("denied"); },
        setItem() { throw new Error("denied"); },
        removeItem() { throw new Error("denied"); },
      },
    };
    expect(() => tokenStore.set("x")).not.toThrow();
    expect(tokenStore.get()).toBe("");
  });
});

describe("ApiError", () => {
  it("classifies offline and timeout as offline", () => {
    expect(new ApiError("x", { kind: "offline" }).isOffline).toBe(true);
    expect(new ApiError("x", { kind: "timeout" }).isOffline).toBe(true);
    expect(new ApiError("x", { kind: "http", status: 500 }).isOffline).toBe(false);
  });

  it("classifies 401 as an auth failure whichever way it is constructed", () => {
    expect(new ApiError("x", { kind: "auth" }).isAuth).toBe(true);
    expect(new ApiError("x", { status: 401 }).isAuth).toBe(true);
  });
});

describe("probe", () => {
  it("reports online and merges the status payload", async () => {
    fetch.mockResolvedValue(reply(200, { meetings: true }));
    await expect(api.probe()).resolves.toEqual({ online: true, meetings: true });
  });

  // The whole app is built around the backend being optional, so this must
  // resolve rather than throw — a rejection here would surface as a boot error.
  it("resolves to offline instead of throwing when nothing answers", async () => {
    fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(api.probe()).resolves.toEqual({ online: false });
  });

  it("resolves to offline when the server errors", async () => {
    fetch.mockResolvedValue(reply(500, { error: "boom" }));
    await expect(api.probe()).resolves.toEqual({ online: false });
  });
});

describe("auth", () => {
  it("stores the token returned by login", async () => {
    fetch.mockResolvedValue(reply(200, { email: "a@b.co", plan: "free", token: "tok-1" }));
    const acct = await api.auth.login({ email: "a@b.co", password: "hunter22" });
    expect(acct.token).toBe("tok-1");
    expect(tokenStore.get()).toBe("tok-1");
  });

  it("lower-cases and trims the email before sending it", async () => {
    fetch.mockResolvedValue(reply(200, { token: "t" }));
    await api.auth.login({ email: "  MiXeD@Case.COM ", password: "pw" });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.email).toBe("mixed@case.com");
  });

  it("sends no Authorization header on login", async () => {
    tokenStore.set("stale-token");
    fetch.mockResolvedValue(reply(200, { token: "fresh" }));
    await api.auth.login({ email: "a@b.co", password: "pw" });
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("attaches the stored token as a Bearer header on authenticated calls", async () => {
    tokenStore.set("tok-9");
    fetch.mockResolvedValue(reply(200, { email: "a@b.co" }));
    await api.auth.me();
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer tok-9");
  });

  it("omits Authorization entirely when signed out", async () => {
    fetch.mockResolvedValue(reply(200, {}));
    await api.auth.me();
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("surfaces the server's own error message", async () => {
    fetch.mockResolvedValue(reply(401, { error: "Incorrect password." }));
    await expect(api.auth.login({ email: "a@b.co", password: "no" }))
      .rejects.toThrow("Incorrect password.");
  });

  // A rejected credential that stays in storage makes every later call fail the
  // same way, which looks like the backend is broken rather than the session.
  it("drops the stored token when the server answers 401", async () => {
    tokenStore.set("expired");
    fetch.mockResolvedValue(reply(401, { error: "Not signed in." }));
    await expect(api.auth.me()).rejects.toMatchObject({ kind: "auth" });
    expect(tokenStore.get()).toBe("");
  });

  it("clears the local session even when the logout request fails", async () => {
    tokenStore.set("tok-1");
    fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(api.auth.logout()).resolves.toBeUndefined();
    expect(tokenStore.get()).toBe("");
  });

  it("defaults a signup to the free plan", async () => {
    fetch.mockResolvedValue(reply(200, { token: "t" }));
    await api.auth.signup({ email: "a@b.co", name: "A", password: "hunter22" });
    expect(JSON.parse(fetch.mock.calls[0][1].body).plan).toBe("free");
  });
});

describe("request behaviour", () => {
  it("wraps a network failure as an offline ApiError, not a raw TypeError", async () => {
    fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(api.auth.me()).rejects.toMatchObject({ name: "ApiError", kind: "offline" });
  });

  it("falls back to a generic message when the error body has no `error` field", async () => {
    fetch.mockResolvedValue(reply(503, {}));
    await expect(api.billing.checkout("pro")).rejects.toThrow("Request failed (HTTP 503).");
  });

  it("treats an empty body as a success with no data", async () => {
    fetch.mockResolvedValue(reply(204, ""));
    await expect(api.auth.setPlan("free")).resolves.toBeNull();
  });

  it("sets a JSON content type only when there is a body", async () => {
    fetch.mockResolvedValue(reply(200, {}));
    await api.auth.me();                                   // GET, no body
    expect(fetch.mock.calls[0][1].headers["Content-Type"]).toBeUndefined();

    await api.auth.setPlan("free");                        // POST, has body
    expect(fetch.mock.calls[1][1].headers["Content-Type"]).toBe("application/json");
  });
});

describe("url building", () => {
  it("percent-encodes the provider so a path cannot be injected", () => {
    expect(api.auth.oauthUrl("../admin")).toBe("/api/auth/oauth/..%2Fadmin/login");
  });

  it("puts the session token in the meetings connect URL", () => {
    tokenStore.set("tok-5");
    expect(api.meetings.connectUrl("zoom")).toBe("/api/zoom/login?token=tok-5");
  });

  it("passes the event limit through to the calendar endpoint", async () => {
    fetch.mockResolvedValue(reply(200, []));
    await api.meetings.calendar(3);
    expect(fetch.mock.calls[0][0]).toBe("/api/google/events?max=3");
  });
});

describe("news", () => {
  it("hits /api/news with the symbol encoded and without a session header", async () => {
    tokenStore.set("tok-9");
    fetch.mockResolvedValue(reply(200, { symbol: "BRK.B", news: [] }));
    const out = await api.news("BRK.B");
    expect(fetch.mock.calls[0][0]).toBe("/api/news?symbol=BRK.B");
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(out.news).toEqual([]);
  });
});
