# Paste sheet — the three remaining submission fields

Everything here is copy-paste ready. Nothing in this file is a claim the app can't back up.

---

## 1. YouTube upload — **Public**, not Unlisted

File: `C:\Users\Ryan\OneDrive\Desktop\vantage-take-02.mp4` (2:44, 1080p, 10.1 MB) — after your
VO is laid over it. *(The takes live in the OneDrive Desktop; the deploy folder in step 3
lives in the plain Desktop. Different folders, same-looking name.)*

> The rules say *publicly visible*. Unlisted is not public: a judge who searches
> can't find it, and some review flows treat it as unavailable. Set **Public**.

**Title**
```
Vantage — an AI desk that answers from your DataHub catalog, and refuses to guess
```

**Description**
```
Vantage is a live AI broadcast desk for the markets. Ask in plain language and it
picks a tool — chart it, add it to a watchlist, or query a data catalog — then reads
the answer on air.

Point it at DataHub and it answers who owns a table, what its schema is, and what
feeds it, straight from the live catalog. The part worth watching: when the catalog
has no answer, it says so instead of inventing one. Honesty is enforced structurally,
not by prompt wording — absent facts are stated as absent, and on a confirmed gap the
language model is removed from the path entirely, so there is nothing left to
hallucinate with.

0:00  The desk
0:36  "chart AMD and explain the move"      — local model, tool call
0:47  "add TSLA to my watchlist and chart it"
1:10  "who owns the fct_users_created table?"   — DataHub + model
1:24  "what feeds the fct_users_created table?" — lineage
1:47  "who owns the orders_v2 table?"           — THE REFUSAL. 362 ms, no model involved
2:22  a column the schema doesn't contain
2:33  a table the catalog doesn't have

Code (Apache-2.0): https://github.com/ryanwien/VantageApplication
Built for The Agent Hackathon — autonomous AI agents / tool usage.
```

**Tags:** `ai agent`, `datahub`, `data catalog`, `llm`, `ollama`, `local ai`, `hallucination`, `react`

---

## 2. GitHub About sidebar

Repo → **About** (gear icon, top right of the repo home page).

**Description** *(175 chars — limit is 350)*
```
An AI news-anchor desk for the markets that answers from your DataHub catalog — and says so when the catalog doesn't know. Tool-using agent, local-first inference, Apache-2.0.
```

**Website** — paste the Netlify URL from step 3.

**Topics**
```
ai-agent  datahub  data-catalog  llm  ollama  local-first  tool-use  react  vite  graphql
```

Also tick **Releases**/**Packages** off if they're cluttering the sidebar; leave
**Use your GitHub Pages website** unticked — the homepage field is the Netlify URL.

---

## 3. Live demo URL — Netlify Drop

The folder is staged and **rebuilt from `main` today**:

```
C:\Users\Ryan\Desktop\vantage-submission\dist
```

> The dist that was sitting there before was from **July 20** — it predates the whole
> DataHub integration. It's been renamed `dist-STALE-jul20`; delete it once you've
> deployed so it can never be dragged by mistake.

1. Go to https://app.netlify.com/drop
2. Drag the **`dist` folder itself** (not its contents)
3. Copy the URL it gives you
4. Paste it into: GitHub About → Website, the submission form, and
   `submission/SUBMISSION-COPY.md` line 56 (`<FILL: current Netlify URL>`)

**Verified before staging:** this exact folder was served as a plain static site with no
backend running and walked end-to-end — gate → local account → dashboard, ticker, anchor and
onboarding all render. What a first-time visitor actually meets is the sign-in gate; the
account is created *in their own browser* (no server, no email verification), and the
dashboard opens straight into Demo mode after it. The submission copy now says that rather
than implying the app opens unwalled.

**Do not add a `_redirects` file.** The usual SPA rule (`/* /index.html 200`) makes
`/api/status` answer 200 with the HTML page, so the app concludes a backend exists and routes
sign-in to a server that isn't there. Vantage is one route — it doesn't need the rule, and it
breaks auth. (Caught by serving the same folder both ways.)

DataHub and local-model inference can't run on a static host — that's stated plainly in
`SUBMISSION-COPY.md` under *What the hosted demo cannot show, and why*, with local repro steps.

---

## 4. Category

**Autonomous AI agents / tool usage**

If the form wants a sentence:
```
The desk reasons over plain language, selects a tool (charting, watchlist, navigation,
report export, DataHub catalog lookup), and executes multi-step commands with local
multi-turn memory. The catalog work is the sharpest case: the agent runs a structured
read-only query and knows the difference between what the tool returned and what it
didn't.
```
