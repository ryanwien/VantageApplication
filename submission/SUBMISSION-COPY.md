# Vantage — submission copy

Reusable form copy for hackathon submissions (DataHub + AMD). All claims are
true of the app as built — no fabricated metrics or capabilities.

## Name
**Vantage**

## Tagline (pick one — ~1 line)
1. *(DataHub submission)* An AI desk that answers from your data catalog — and tells you when the catalog doesn't know.
2. An AI news anchor for the markets that can run entirely on your own machine.
3. A live AI broadcast desk that charts markets, answers out loud, and runs local-first.
4. The markets, read to you by an AI anchor — tool-using, memory-keeping, offline-capable.

## Short description (2–3 sentences)
Vantage turns market-watching into a live broadcast. An animated AI "news anchor"
charts stocks, answers questions out loud, reads the news, and tracks a portfolio —
driven entirely by natural language, with its whole brain able to run offline on a
local model (no cloud keys, nothing leaves the device).

## Full description
Vantage is a single-page web app that turns market-watching into a live broadcast.
An animated AI news anchor charts stocks, answers questions out loud, reads the news,
plays trailers, hosts games, tracks a portfolio, and rings the opening bell on a real
trading-day clock — all driven by plain language. Ask *"chart AMD and explain the move"*
and the desk reasons over the request, chooses the right tool (charting, watchlist,
navigation, report export), executes it, and narrates the result on air.

Point it at a **DataHub** instance and the same desk answers questions about your data stack —
who owns a table, what its schema is, what feeds it — read on air from the live catalog. And
when the catalog *doesn't* hold the answer, it says so rather than inventing one: the model is
taken out of the path entirely and the gap is stated (see **DataHub integration** below).

It's an **agent, not a chatbot**: tool invocation, multi-step intent routing, and
local multi-turn memory. And its entire inference path can run **offline on a local
model** — Ollama or vLLM, including on an AMD Radeon GPU through ROCm — with **no cloud
keys and nothing leaving the device**. Every layer degrades gracefully: no AI key falls
back to a demo engine, no market key uses a seeded random-walk market, no voice key uses
browser text-to-speech.

Built as a React single-page app with an **optional, dependency-free Node backend** that
adds real accounts (scrypt-hashed passwords), Zoom/Google meetings, and Stripe billing —
each independently optional. API keys and conversation memory live **only** in the
browser's localStorage and are sent solely to their own provider.

## Tech
React (Vite) SPA · optional dependency-free Node backend · **DataHub catalog context via a
read-only, whitelisted GraphQL proxy** · local inference via Ollama / vLLM (ROCm-capable) ·
Finnhub / TMDB / YouTube / ElevenLabs as optional integrations · Vitest test suite (100 tests) ·
Apache 2.0.

## Repository
https://github.com/ryanwien/VantageApplication  (Apache-2.0, public)

## Live demo
<FILL: current Netlify URL>  — runs in Demo mode with zero setup; cloud-AI and live-data
features activate when a viewer adds their own keys in Settings.

**What the hosted demo cannot show, and why.** Two capabilities need something running on the
viewer's own machine, so they are shown in the demo video rather than the hosted build:

- **DataHub catalog context** — needs the Node backend plus a reachable DataHub instance. The
  hosted build is static, and the proxy that holds the token is deliberately server-side.
- **Local-model inference** — browser Private Network Access blocks a public HTTPS page from
  reaching `localhost:11434`.

Both are reproducible locally in a few minutes: `README.md` → *DataHub catalog context*, then
`node scripts/datahub/ingest-bare.cjs` to see the refusal behaviour.

## Challenge category
**Autonomous AI agents / tool usage** — the category Vantage fits honestly: the desk
reasons over plain language, chooses tools (charting, watchlist, navigation, report
export, **DataHub catalog lookup**), and executes multi-step commands, with local
multi-turn memory. The catalog work is the sharpest example of the category: the agent
selects the tool, runs a structured read-only query, and — unusually — **knows the
difference between what the tool returned and what it didn't**.

## DataHub integration
The desk answers catalog questions — **owners, schemas, and lineage** — from a live DataHub
instance, and reads the answer on air. Verified end-to-end against DataHub v1.6.0.

**How it's wired.** Queries go through a backend proxy that **owns the query text**: the browser
sends an operation *name* (`search` / `entity` / `lineage`), never GraphQL, so the reachable
surface is a fixed server-side whitelist. Every operation is **read-only**, and the DataHub
access token stays server-side — it never reaches the browser. When a token is configured the
route also requires a session, so a deployed instance can't be used anonymously to enumerate
internal dataset names.

**The part worth judging: it will not invent catalog facts.** Honesty is enforced structurally
rather than by prompt wording, because prompt wording measurably failed — against the small
local model, an incomplete fact block produced invented column lists in 3 of 5 runs and an
invented owner in 4 of 5. So in each case where a fact is absent, the model is removed from the
path entirely and the desk states the gap instead:

- **No owner / schema / lineage recorded** → says exactly that, and lists what the catalog *does* hold.
- **A named column that isn't in the schema** → "…has no column named `foobar`", rather than guessing a type.
- **No exact dataset match** → discloses the closest match instead of quietly answering about a different dataset.
- **The narrating model fails** (no key, offline, rate-limited) → falls back to the catalog facts rather than blaming DataHub.

You can see which path answered: the response header reads `DataHub (catalog)` when no model was
involved, and `DataHub + <model>` when one narrated. Covered by the test suite (100 tests).

**Reproduce it in a minute.** DataHub's sample metadata is fully populated, so nothing exercises
the refusal paths. `node scripts/datahub/ingest-bare.cjs` ingests a dataset with a description
but deliberately no owners and no schema; the README lists the questions that trigger each path.
