// ============================================================
//  Auth context — the React binding over src/api/client.js.
//
//  Kept separate from the client so the transport layer stays pure JS with no
//  React dependency (it can be unit-tested with no DOM). This file is the only
//  place that knows about hooks.
//
//  One provider owns "who is signed in" and "is there even a backend", so
//  components read that state instead of each firing their own /api/auth/me and
//  disagreeing about the answer.
// ============================================================

import React, { useState, useEffect, useCallback, useMemo, createContext, useContext } from "react";
import { api, tokenStore, ApiError } from "./client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children, initialAccount = null }) {
  const [account, setAccount] = useState(initialAccount);
  const [backend, setBackend] = useState({ online: false, checked: false });
  const [restoring, setRestoring] = useState(true);

  // Boot: is a backend there, and does our stored token still identify someone?
  // The UI can't decide what to render until both are answered, so they run together.
  useEffect(() => {
    let live = true;
    (async () => {
      const probe = await api.probe();
      if (!live) return;
      setBackend({ ...probe, checked: true });

      if (probe.online && tokenStore.get()) {
        try {
          const me = await api.auth.me();
          if (live && me) setAccount({ ...me, backend: true, token: tokenStore.get() });
        } catch {
          // Expired or rejected token — request() already cleared it. Staying
          // signed out is the correct outcome, so there is nothing to report.
        }
      }
      if (live) setRestoring(false);
    })();
    return () => { live = false; };
  }, []);

  const login = useCallback(async (creds) => {
    const acct = await api.auth.login(creds);
    const next = { ...acct, backend: true, token: tokenStore.get() };
    setAccount(next);
    return next;
  }, []);

  const signup = useCallback(async (details) => {
    const acct = await api.auth.signup(details);
    const next = { ...acct, backend: true, token: tokenStore.get() };
    setAccount(next);
    return next;
  }, []);

  const logout = useCallback(async () => {
    await api.auth.logout();
    setAccount(null);
  }, []);

  const setPlan = useCallback(async (plan) => {
    setAccount(a => (a ? { ...a, plan } : a));   // optimistic — the UI shouldn't wait on the network
    if (tokenStore.get()) {
      try { await api.auth.setPlan(plan); }
      catch { /* with Stripe live, paid plans are set by webhook only; a refusal here is expected */ }
    }
  }, []);

  const value = useMemo(() => ({
    account, backend, restoring,
    signedIn: !!account,
    login, signup, logout, setPlan, setAccount,
  }), [account, backend, restoring, login, signup, logout, setPlan]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  // A null-object fallback keeps components usable outside the provider (tests,
  // isolated previews) instead of crashing on `undefined.account`.
  return ctx || {
    account: null,
    backend: { online: false, checked: true },
    restoring: false,
    signedIn: false,
    login: async () => { throw new ApiError("No backend configured.", { kind: "offline" }); },
    signup: async () => { throw new ApiError("No backend configured.", { kind: "offline" }); },
    logout: async () => {},
    setPlan: async () => {},
    setAccount: () => {},
  };
}

export default AuthProvider;
