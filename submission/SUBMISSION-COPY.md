# Vantage — submission copy

Reusable form copy for hackathon submissions (DataHub + AMD). All claims are
true of the app as built — no fabricated metrics or capabilities.

## Name
**Vantage**

## Tagline (pick one — ~1 line)
1. An AI news anchor for the markets that can run entirely on your own machine.
2. A live AI broadcast desk that charts markets, answers out loud, and runs local-first.
3. The markets, read to you by an AI anchor — tool-using, memory-keeping, offline-capable.

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
React (Vite) SPA · optional dependency-free Node backend · local inference via Ollama /
vLLM (ROCm-capable) · Finnhub / TMDB / YouTube / ElevenLabs as optional integrations ·
Vitest test suite · Apache 2.0.

## Repository
https://github.com/ryanwien/VantageApplication  (Apache-2.0, public)

## Live demo
<FILL: current Netlify URL>  — runs in Demo mode with zero setup; cloud-AI and live-data
features activate when a viewer adds their own keys in Settings. (Note: browser Private
Network Access blocks the *local-model* path on a public HTTPS host, so the local-AI/AMD
story is shown in the demo video, run locally.)

## Challenge category
**Autonomous AI agents / tool usage** — the category Vantage fits honestly: the desk
reasons over plain language, chooses tools (charting, watchlist, navigation, report
export), and executes multi-step commands, with local multi-turn memory. (You can only
win in the one selected — this is the pick.)

## Optional DataHub bonus
Not currently integrated. Optional bonus only — not required to win.
