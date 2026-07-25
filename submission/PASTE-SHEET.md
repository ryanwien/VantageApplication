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

> ✅ **DEPLOYED:** <https://vantage-desk.netlify.app/> — verified live (HTTP 200).
> The served bundle is built from pushed `main`, so the hosted demo and the public repo
> match. `/api/status` correctly returns **404**, confirming no `_redirects` catch-all is
> breaking sign-in.
>
> ✅ **Renamed.** Was `vantageappliaction` (the `ca` in "application" transposed to `ac`), now
> `vantage-desk`.
>
> ⚠️ **The old URL is dead, not redirecting.** `https://vantageappliaction.netlify.app/`
> returns **404**. Anywhere the old link was already pasted — the submission form, the GitHub
> About sidebar, the YouTube description — must be updated or a judge hits a dead page.
>
> Everything below is the original drop procedure, kept for reference.

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

Dropdown option to select: **Agents That Do Real Work**

*(The four choices are: Agents That Do Real Work · Metadata-Aware Code Generation &
Development · Production ML Agents · Open / Wildcard. "Metadata-Aware" is the near-miss —
it's about generating **code** from metadata, and Vantage generates answers and documents,
not code. This is the same position as the "autonomous AI agents / tool usage" wording used
in the YouTube description and `SUBMISSION-COPY.md`.)*

If the form wants a sentence:
```
The desk reasons over plain language, selects a tool (charting, watchlist, navigation,
report export, DataHub catalog lookup), and executes multi-step commands with local
multi-turn memory. The catalog work is the sharpest case: the agent runs a structured
read-only query and knows the difference between what the tool returned and what it
didn't.
```

---

## 5. "Did you contribute to DataHub during the hackathon?" — optional bonus field

**The answer is no.** Verified, not assumed:

- GitHub search `author:ryanwien repo:datahub-project/datahub` → **0 results** (no PRs, no issues)
- Public repos under `ryanwien`: three — `VantageApplication`, `Portfolio2026`, `portfolio`.
  **None is a fork.** There is no DataHub fork to point at.

Every `datahub` commit in the log is in this repo. That is integration work, not an
upstream contribution, and it must not be submitted as one — a judge opening the link
sees the repo owner is you within about two seconds.

The field is optional. Leaving it blank costs the bonus criterion and nothing else.
If you'd rather answer than leave it empty, this is honest and short:

```
No upstream contributions this time — no PRs, RFCs, or issues against the DataHub
repositories. My DataHub work was integration, in my own repo under Apache-2.0: a
whitelisted read-only GraphQL client (three operations, no mutations, token held
server-side) and an answer path that reports a catalog miss instead of inventing one.
The complete query surface is documented here:
https://github.com/ryanwien/VantageApplication/blob/main/examples/graphql-operations.md
```

Shorter, if the field is a single line:

```
No — no PRs, RFCs, or issues against the DataHub repositories during the hackathon.
```

> **Checked and closed — do not reopen this.** The `/api/v2/graphql` 404 recorded at
> [plan:490](../docs/superpowers/plans/2026-07-21-datahub-catalog-context.md#L490) is **not**
> a DataHub docs bug. Their *How to Set Up GraphQL* page documents `/api/graphql` and shows
> `http://localhost:8080/api/graphql` — exactly what we ended up using. The wrong path was
> guessed from convention on our side; the 404 was self-inflicted. Nothing to file.
>
> The second candidate — docs say a token is required, while the OSS quickstart runs with
> metadata-service auth disabled and accepts unauthenticated queries — **was filed upstream by
> someone else on 2026-07-25 at 10:46** as
> [PR #18617](https://github.com/datahub-project/datahub/pull/18617) (`docs(auth)`, labelled
> `community-contribution`). Don't duplicate it.
>
> **A third candidate is live and unreported — see section 6.**

---

## 6. "Any bugs, errors, or unexpected behaviour?" — the DataHub feedback field

Ordered by how much each would matter to someone else building an agent on DataHub.
All observed against a local **DataHub v1.6.0** quickstart, querying GMS at
`/api/graphql` on `:8080`.

```
1. Query tokens matching URN *structure* — "dataset", "prod", a platform name — match
   EVERY entity, on the urn field alone. Ordinary table names hit this.

   What I did:  searched "asdfghjkl_no_such_dataset" via searchAcrossEntities
                (types: [DATASET]) against a catalog of 8 datasets, then ran a series of
                controls to isolate which token was responsible.
   Expected:    zero results for a name that is not in the catalog.
   Got:         total: 8 — the entire catalog, SampleHdfsDataset at rank 1. Confirmed with
                count: 20 that all 8 come back, so it really is the whole catalog.

   Isolating it:
     "dataset"                   -> total 8 (all), matchedFields [urn]
     "prod"                      -> total 8 (all), matchedFields [urn]
     "hive"                      -> total 5,       matchedFields [urn, platform]
     "no_such_dataset"           -> total 8 (all), matchedFields [urn]
     "totally_unrelated_dataset" -> total 8 (all), matchedFields [urn]
     "asdfghjkl"                 -> total 0
     "zzzz1234qqqq"              -> total 0

   So search is not simply broken — pure gibberish correctly returns nothing. DataHub URNs
   look like urn:li:dataset:(urn:li:dataPlatform:hive,fct_users_created,PROD), and the
   structural segments "dataset", the platform, and "PROD" are indexed as searchable tokens
   on every entity. Any query containing one of those words returns everything. Real table
   names like orders_dataset, customer_prod or events_prod_v2 trigger it.

   There IS a signal, though it is undocumented: on these matches every result carries
   matchedFields [urn] only, whereas a real match ("fct_users_created") carries five
   entries — urn, fieldPaths, fieldDescriptions, description, and id equal to the dataset
   name. insights and extraProperties were empty in every case. No numeric relevance score
   is exposed (SearchResult is entity, insights, matchedFields, extraProperties at both
   v1.6.0 and master) and SearchAcrossEntitiesInput has no relevance-threshold parameter.

   Why it matters for agents: a caller reading searchResults[0] without inspecting
   matchedFields gets a confident, wrong answer. Mine answered "who owns
   asdfghjkl_no_such_dataset" with SampleHdfsDataset's owner, stated as fact, and once an
   LLM was narrating it re-attributed that dataset's owner to the name the user had typed.
   I worked around it with a string-similarity check; gating on matchedFields would have
   worked too, had the behaviour been documented.

   Prior art I checked: #8043 (closed, 2023) added "_" to the main tokenizer, which is why
   a name like asdfghjkl_no_such_dataset splits into a token that matches. #16382 is
   adjacent but semantic-search-specific. I found nothing describing this over-match.

2. The docs require a token; the OSS quickstart accepts unauthenticated queries.

   The "How to Set Up GraphQL" page says to send Authorization: Bearer <token>. The
   Docker quickstart ships with metadata-service auth disabled, so unauthenticated
   queries succeed. Harmless locally, but it means code proven against the quickstart
   can fail against a real deployment. Another contributor filed this as PR #18617
   while I was writing this up, so it is already in hand.
```

> **Kept out of the paste block on purpose.** Early on I POSTed to `/api/v2/graphql` on
> `:8080` and got a 404. The docs are right — `/api/graphql` is documented and works; the
> path was guessed from convention. It's a mistake of ours, not DataHub behaviour, so it
> doesn't belong on a feedback form. Recorded here so it isn't rediscovered.

**Item 1 is also the filable contribution** — verified, and I found no existing issue for it.
Frame it upstream as an API gap / feature request, not a bug: fuzzy matching is doing what
Elasticsearch does, and the ask is for callers to be able to *see* match quality.
Suggested title: `feat(graphql): expose match confidence on searchAcrossEntities results`.

**Do not file it until the repro is re-run.** Docker Desktop is currently down and both
`:8080` and `:9002` are unreachable, so the claim can't be reproduced right now. Before
filing: bring the quickstart up, re-run the gibberish query **selecting `matchedFields` as
well as `entity`**, and paste the literal JSON into the issue. That closes the one soft spot
in the report and makes it unarguable.

---

## 8. "Any bugs, errors, or unexpected behaviour?" — **our own** (Vantage), not DataHub's

Use this if the field is asking what went wrong in *your* build. Section 6 is the DataHub-facing
version. Every item below is quoted from a real commit body in this repo.

```
All found while wiring a local LLM to a live DataHub v1.6.0 catalog. The common thread: every
one of them was the model sounding confident about something it did not actually know.

1. Omitting a fact made the model invent it.

   What I did:  asked "who owns orders_v2?" for a dataset that exists but has no owner recorded.
   Expected:    the desk to say the owner isn't recorded.
   Got:         a confidently invented owner. contextForLLM was silently dropping the owners,
                schema and lineage sections when they were empty, so the model saw no evidence
                anything was missing. Measured against the shipped llama3.2:1b: invented column
                lists in 3/5 runs and an owner in 4/5 — every one prefaced "Based on the facts
                from DataHub".
   Fix:         state absences explicitly ("(none recorded in DataHub)"), and on a confirmed gap
                remove the model from the path entirely rather than instructing it not to invent.

2. Disclosing a near-match wasn't enough — the model re-attributed anyway.

   What I did:  asked "who owns asdfghjkl_no_such_dataset?" (no such dataset).
   Expected:    a refusal, or at least an answer clearly about a different dataset.
   Got:         first, a confident answer about SampleHdfsDataset with no sign it wasn't a real
                match. I added a disclosure sentence — and the model STILL took the near-match's
                facts and re-attributed them to the name the user typed: "The owner ... is
                DataHub". Prefixing a warning does not stop a model mid-sentence.
   Fix:         build the disclosure and fact block deterministically and return before the
                model is invoked at all, making misattribution structurally impossible.

3. The app blamed the wrong system for a failure.

   What I did:  ran a catalog question in the browser with no AI key configured.
   Expected:    "the model isn't available, here are the catalog facts."
   Got:         "DataHub lookup failed: No cookie auth credentials found" — a false statement
                about which system failed. DataHub had answered correctly; the model narration
                was what broke. The lookup and the narration shared one try/catch, so a
                model-side failure was reported as a DataHub failure, and it discarded real
                facts already in hand.
   Fix:         give the model call its own catch that falls back to the deterministic fact
                block. Side benefit: catalog questions now work with no AI key at all.

4. A prompt instruction leaked into the user-visible answer.

   What I did:  triggered the model-free path and read the on-screen text.
   Expected:    a plain fact block.
   Got:         it began "Use ONLY these facts" — an instruction written for the model, shown
                verbatim to the user and read aloud by the anchor, because the same string was
                used for both the prompt and the display.
   Fix:         neutral human-readable header; the instruction lives only in the model prompt.

5. A schema being present did not stop invention one level down.

   What I did:  asked for the type of a column that isn't in a schema that does exist.
   Expected:    the earlier absence handling to cover it.
   Got:         it didn't — that check was dimension-level ("no schema at all") and a model
                handed a full schema will still invent a type for a column not in it.
   Fix:         a precision-biased check that only refuses on high-confidence phrasings, since
                the failure that actually matters is a FALSE refusal.

6. Hostile input crashed the query builder.

   What I did:  fuzzed the GraphQL variable builders.
   Expected:    a safe empty string.
   Got:         a crash. String(v?.term ?? "") invokes caller-supplied toString/Symbol.
                toPrimitive, so a term with a throwing toString — or a Symbol — took out the
                search, entity and lineage builders.
   Fix:         a safeStr() helper that only stringifies primitives.

7. Deployment: the standard SPA redirect rule silently broke sign-in.

   What I did:  deployed the static build to Netlify with the usual /* /index.html 200 rule.
   Expected:    normal SPA routing.
   Got:         /api/status answered 200 with the HTML page, so the app concluded a backend
                existed and routed sign-in to a server that wasn't there. Caught only by
                serving the same folder both with and without the rule.
   Fix:         no _redirects file. The app is one route and doesn't need it.
```

---

## 7. "Project Story / About the project"

Every number below is from `SUBMISSION-COPY.md` or `examples/datahub-catalog-transcript.md`.
Devpost renders markdown, so the headers survive the paste.

```
## Inspiration

Vantage began as a live AI broadcast desk for the markets — an animated anchor that
charts stocks, reads the news, and answers out loud instead of making you read a
dashboard. Then I pointed it at a DataHub instance and asked who owned one of my tables.

It answered immediately, fluently, and completely made it up. The table had a
description but no owner recorded, and the model filled the silence rather than
admit the silence existed.

That turned out to be the interesting problem, and it became the project.

## What it does

Vantage is an agent, not a chatbot. Ask "chart AMD and explain the move" and the desk
reasons over the request, picks a tool — charting, watchlist, navigation, report
export, or a DataHub catalog lookup — executes it, and narrates the result on air.
It keeps multi-turn memory locally, and its entire inference path can run offline on
a local model through Ollama or vLLM, including on an AMD Radeon GPU via ROCm. No
cloud keys, nothing leaving the device.

Pointed at DataHub, the same desk answers who owns a table, what its schema is, and
what feeds it — read aloud from the live catalog.

## The part worth judging

It will not invent catalog facts, and that is enforced structurally rather than by
prompt wording — because prompt wording measurably failed. Given an incomplete fact
block, the small local model invented an owner in 4 of 5 runs and invented column
lists in 3 of 5. Rewording the instructions did not fix it. Removing the model did.

So on a confirmed gap, the language model is taken out of the path entirely and the
desk states the gap deterministically, then lists what the catalog genuinely holds —
so the answer is still useful rather than a flat refusal. You can watch this happen:
answers that involve the model take 820–1041 ms, and the two refusals return in 58 ms
and 69 ms, because nothing is generating text. The response badge names which path
answered — "DataHub + Ollama (local)" versus "DataHub (catalog)".

Four cases are handled this way: no owner, schema or lineage recorded; a named column
that isn't in the schema; no exact dataset match; and the narrating model failing —
which reports the model failed rather than blaming DataHub.

## Challenges

The one I didn't expect: DataHub's search returns a confident hit for a dataset name
that doesn't exist. Searching "asdfghjkl_no_such_dataset" returns SampleHdfsDataset,
a real but unrelated dataset, and the GraphQL response carries no relevance score to
distinguish it from an exact match. My first version answered questions about the
wrong table with total confidence — and once a model was narrating, it re-attributed
that table's owner to the name the user had typed. I now check string similarity
before trusting any hit and disclose near-matches instead of quietly answering.

## How I built it

A React single-page app with an optional, dependency-free Node backend. Catalog
queries go through a proxy that owns the query text: the browser sends an operation
name — search, entity, or lineage — never GraphQL. The reachable surface is a fixed
server-side whitelist of three read-only operations, so a hostile browser cannot
compose a new query or reach a mutation, and the DataHub token never leaves the
server. Verified end-to-end against DataHub v1.6.0, covered by a 105-test Vitest
suite, Apache-2.0.

## What I learned

Honesty in an LLM feature is an architecture decision, not a prompting one. Every
version of "say you don't know if you don't know" lost to a model that had partial
context and momentum. The fix wasn't better words — it was making the dishonest
answer unreachable, by ensuring there was no model in the path to produce it.
```
