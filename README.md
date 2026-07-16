# Vantage

A browser market dashboard fronted by an animated AI "broadcast desk." A single-page React app
where an animated news anchor charts stocks, answers questions out loud, reads the news, plays
trailers, hosts games, tracks a portfolio, and rings the opening bell on a real trading-day clock.

The dashboard runs **fully in the browser with zero setup**. Everything below (live data, AI answers,
studio voice, real meetings, accounts, subscriptions) is **optional** and layers on top.

---

## Quick start

```bash
npm install
npm run dev            # → http://127.0.0.1:5173
```

That's it — the app opens in **Demo mode**, driven by a seeded random-walk market engine (no keys
needed). `npm run build` produces a static bundle in `dist/`.

Requires **Node 20+** (the backend uses `--env-file`). Check with `node --version`.

---

## Run on AMD Radeon / ROCm (fully local agent — no cloud keys)

The AI desk is an agent (tool use, multi-step commands, local multi-turn memory) whose core
inference can run **entirely on a local model** — on an AMD Radeon GPU through ROCm. Step by step:

1. **Serve a model locally** (either works):
   - **Ollama** (uses ROCm on Radeon): `ollama pull llama3.1`, then allow the browser origin:
     ```bash
     OLLAMA_ORIGINS=* ollama serve        # PowerShell: $env:OLLAMA_ORIGINS='*'; ollama serve
     ```
   - **vLLM** (ROCm build, OpenAI-compatible): `vllm serve <model> --host 0.0.0.0 --port 8000`,
     then in **settings → AI** point the *LM Studio / local* card's BASE URL to `http://<host>:8000/v1`.
2. **Start Vantage**: `npm run dev`, then open **`http://127.0.0.1:5173/?local=1`**
   (or click **settings → AI → "⚡ Run local-only (AMD / ROCm)"**). This enables *only* the local
   model — every desk answer, report, and command now runs on local inference.
3. **Verify the GPU is actually doing the work** (Ollama silently falls back to CPU if ROCm
   isn't engaged):
   ```bash
   ollama ps        # PROCESSOR column must read "100% GPU"
   rocm-smi         # GPU utilization + VRAM jump during a query
   ```
4. **What you should see**: sign in, ask the desk *"chart AMD and explain the move"* — the answer
   header reads `Ollama (local) (llama3.1)`, and it works with the network cable pulled.

Troubleshooting: `model "llama3.1" not found` → `ollama pull llama3.1` (or set MODEL to one from
`ollama list`). "Can't reach Ollama" → start it with `OLLAMA_ORIGINS=*` as above.

---

## Optional API keys (each unlocks one extra)

All keys live in your **browser's localStorage only** — they're sent only to their own provider's
API, never to us. Enter them in **settings** (⚙, top-right).

| Key | Unlocks | Where |
|-----|---------|-------|
| OpenRouter / Claude / OpenAI / Gemini / Ollama / LM Studio | AI desk answers | settings → AI |
| Finnhub | Live quotes + earnings calendar | settings → DATA |
| TMDB | Streaming catalog + trailers | settings → START/DATA |
| YouTube | Real embeddable video results | settings → DATA |
| ElevenLabs | Studio-grade anchor voice | settings → VOICE |

Without any of them the app still runs — demo data, browser text-to-speech, and the full UI.

---

## The optional backend (`server/index.js`)

A tiny **dependency-free** Node server (built-ins only). It exists to hold the secrets a browser must
never see, and adds three independent layers — **each optional**:

| Layer | What it adds | Needs |
|-------|--------------|-------|
| **Accounts** (`/api/auth/*`) | Real sign-up / login with scrypt-hashed passwords + session tokens | nothing (works as soon as the backend runs) |
| **Meetings** (`/api/:prov/*`) | Create real **Zoom / Google Meet** links, per user | your own Zoom/Google OAuth apps |
| **Billing** (`/api/billing/*`) | Real **Stripe Checkout** for paid plans (test mode) | your own Stripe test keys |
| **Hosted AI** (`/api/ai/brief`) | Vantage-operated Gemini market briefs, metering, and audit logs | Vertex AI service account |

If the backend isn't running, the app falls back gracefully: accounts run **client-side** in
localStorage, meetings use the **zero-setup** path (see below), and paid plans unlock as a clearly
labelled **simulation**.

### Run it

```bash
cp .env.example .env                          # fill in only what you want
node --env-file=.env server/index.js          # second terminal, keep `npm run dev` in the first
```

It listens on **http://localhost:8787**; the Vite dev server proxies `/api` to it automatically
(see `vite.config.js`), so the browser treats it as same-origin.

### Environment variables (`.env`, see `.env.example`)

```
ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET          # meetings (optional)
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET       # meetings + calendar (optional)
STRIPE_SECRET_KEY                             # billing (optional; else simulated)
STRIPE_PRICE_PRO / STRIPE_PRICE_DESK          # Stripe Price IDs for the two paid plans
STRIPE_WEBHOOK_SECRET                         # Stripe endpoint-signing secret
GOOGLE_CLOUD_PROJECT / GOOGLE_CLOUD_LOCATION  # Vertex AI project and region
GCP_SERVICE_ACCOUNT_EMAIL / _PRIVATE_KEY      # Vertex AI service account (server-only)
VERTEX_GEMINI_MODEL                           # defaults to gemini-2.0-flash
FINNHUB_API_KEY                               # server-only quotes for scheduled AI briefs
AGENT_CRON_SECRET                             # protects the scheduled-agent endpoint
PORT           (default 8787)
PUBLIC_ORIGIN  (default http://localhost:8787 — must match your OAuth redirect URIs)
APP_ORIGIN     (default http://127.0.0.1:5173 — where the dashboard runs)
```

> **You don't have to hand-edit a file.** `.env` is just one way to set these. On a real host
> (Vercel / Render / Railway, Docker `-e`, or a shell `export`) set them as normal environment
> variables — the server reads `process.env` either way. See [MEETINGS_SETUP.md](MEETINGS_SETUP.md).

---

## Meetings: two tiers

1. **Zero-setup (no backend, no keys)** — settings → **MEET** → **⚡ Go Live**: opens an instant
   Google Meet (`meet.new`) or Zoom in a new tab, or pin any link you paste as a 🔴 LIVE badge.
   This is what most people use.
2. **Tracked meetings (per-user OAuth)** — sign in, then **Connect Zoom / Google**. Meetings are
   created on **your own** account and listed inside Vantage. Full walkthrough:
   **[MEETINGS_SETUP.md](MEETINGS_SETUP.md)**.

---

## Accounts & subscriptions

- **Sign up / log in** at the gate (or **Explore as guest** to skip it).
- When the backend is running, auth is real (hashed passwords + server sessions). Otherwise it's a
  client-side prototype in localStorage.
- **Plans**: Explorer (free) · Pro Desk · Trading Floor. Paid upgrades open **Stripe's hosted
  checkout** when `STRIPE_SECRET_KEY` is set; without it, the plan unlocks as a labelled simulation.
  Card details are only ever entered on Stripe's page — this app never renders a card form.

---

## Project layout

```
React.jsx          the whole UI (one big component + a few module components)
exporters.js       lazy-loaded Excel / Word / PowerPoint generators
server/index.js    the optional backend: accounts, meetings, billing (dependency-free)
index.html         Vite entry
vite.config.js     dev server + /api → backend proxy
MEETINGS_SETUP.md  step-by-step Zoom / Google OAuth setup
```

---

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

---

## Disclaimer

Vantage is a market-information and entertainment dashboard. It is **not financial advice**, and
nothing shown is a recommendation to buy or sell. Market data may be delayed, simulated, or
inaccurate — don't rely on it for trading decisions.
