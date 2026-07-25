# Security

## Reporting a vulnerability

Please **do not** open a public issue for a security problem.

Use GitHub's private vulnerability reporting on this repository:
**Security → Report a vulnerability**. That opens a private thread visible only to the
maintainer, and it lets a fix land before anything is disclosed.

If private reporting isn't available to you, open a normal issue that says only *"security
report, please make contact"* — with no details — and I'll follow up privately.

Please include what you can: the affected file or endpoint, the versions or commit you tested,
steps to reproduce, and what an attacker gains. A working proof of concept is welcome but not
required — a clear description of the flaw is more useful than a vague report of a suspicion.

I'll acknowledge receipt, tell you whether I can reproduce it, and keep you posted on a fix.
Please give me a chance to patch before disclosing publicly.

## What this project is

Vantage is a **prototype and demo**, not hardened production software. It runs entirely in the
browser by default; the Node backend is optional and dev/local-oriented. Read the notes below
before exposing any part of it beyond your own machine.

Findings in the areas below are known and documented rather than accidental — reporting them is
still welcome, but the notes explain what's deliberate.

## Security notes (read before deploying)

- **Never commit secrets.** `.env`, `server/users.json`, `server/sessions.json`, and
  `server/tokens.json` are gitignored — they hold password hashes and live tokens.
- The **client-side** account layer (localStorage) is a prototype convenience, **not** an
  authorization boundary — anyone with devtools can read it. Real protection comes only from the
  backend.
- The Stripe success redirect (`?checkout=success&plan=…`) is **client-trusted** — fine for test
  mode only. For a real deployment, configure Stripe to POST events to
  `/api/billing/webhook` and set `STRIPE_WEBHOOK_SECRET`; verified webhooks, rather than the
  redirect, grant paid plans.
- Hosted AI requires a signed-in backend account and keeps the Gemini credentials on the server.
  Its local `server/ai-usage.json` file records metering and agent runs; use a managed database
  before a multi-instance production deployment.
- **Scheduled market-brief agent**: a signed-in user can opt in from ACCOUNT. It saves their
  watchlist server-side and a scheduler can POST once daily to `/api/agent/run` using the
  `x-vantage-cron-secret` header. It uses a server-side Finnhub key to build quote context,
  writes a factual Gemini brief, and explicitly excludes trade execution and recommendations.
- This is dev/local-oriented. For a shared deployment, host the backend over **HTTPS** and set
  `PUBLIC_ORIGIN` / `APP_ORIGIN` to your real domains (and register those OAuth redirect URIs).

## API keys and where they go

Keys you enter in Settings are held in your browser's `localStorage` and sent **only** to the
provider they belong to. They are never forwarded to a Vantage server — there isn't one in the
default configuration.

The DataHub integration is the exception by design: its access token is held **server-side** in
the optional Node backend and never reaches the browser. The browser sends an operation *name*
(`search`, `entity`, `lineage`) which the server looks up in a fixed whitelist and executes; a
caller cannot compose arbitrary GraphQL, and every whitelisted operation is read-only. When a
token is configured the route additionally requires a session, so a deployed instance cannot be
used anonymously to enumerate internal dataset names.
