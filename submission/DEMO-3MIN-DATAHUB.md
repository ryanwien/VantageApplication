# Vantage — sub-3-minute demo (The Agent Hackathon · DataHub)

**Target run time: ~2:52** (hard cap 3:00). Category: **autonomous AI agents / tool usage**.

This is a *different film* from `DEMO-3MIN.md` (the AMD cut). That one centres on Radeon/ROCm
local inference. This one centres on the agent choosing tools and on the **DataHub catalog as
the agent's source of truth** — with the refusal beat as the climax, because "the agent declines
to invent" is the most differentiating thing in the build and the hardest thing to fake.

---

## Pre-flight (do all of this BEFORE hitting record)

```bash
# 1. DataHub quickstart up (6 containers healthy)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/health     # expect 200

# 2. The deliberately-incomplete dataset — WITHOUT THIS THE CLIMAX DOES NOT EXIST
node scripts/datahub/ingest-bare.cjs

# 3. Backend + app
node server/index.js          # :8787
npm run dev                   # :5173

# 4. Ollama up, and enabled in Settings → AI (it narrates the answerable beats)
curl -s http://localhost:11434/api/tags | head -c 80
```

- **Sign in first.** The landing screen has no guest button; being on the auth wall on camera wastes 15s.
- **Pre-warm every beat once**, then reload. First render of the AMD chart and first Ollama
  token are both slow cold — that stall is the most common ruined take.
- Set the anchor + set you want. Close the onboarding modal and the setup guide.
- Widen the desk panel so the **`via` badge is legible** — it is the entire visual proof in
  the climax, and if a viewer can't read it the beat lands as an ordinary answer.

---

## Measured timings (dry run, 2026-07-22)

Every beat driven through the real app against the live catalog, typing simulated at 22 cps.
**Set the desk model to `llama3.1:latest` before recording** — see the finding below.

| Beat | Type | Answer | Total | `via` badge |
|---|---|---|---|---|
| chart AMD and explain the move | 1.5s | 2.0s | **3.5s** | `Ollama (local)` |
| who owns the fct_users_created table? | 1.9s | 5.2s | **7.1s** | `DataHub + Ollama (local)` |
| what feeds the fct_users_created table? | 2.0s | 2.1s | **4.0s** | `DataHub + Ollama (local)` |
| who owns the orders_v2 table? *(refusal)* | 1.5s | 0.8s | **2.3s** | **`DataHub (catalog)`** |
| what type is the foobar column…? *(refusal)* | 2.6s | 0.8s | **3.4s** | **`DataHub (catalog)`** |

**All on-screen action totals ~20s** against a ~172s film. Pacing is set by narration and holds,
not by waiting on the app — there is no risk of a beat running long.

**The refusal resolves in ~385 ms — it is almost too fast to notice.** This is the single most
important beat in the video and it is over before a viewer registers it. Hold deliberately:
land the answer, then stay on the `via` badge through the silence for a full 3–4 seconds.

### Use `llama3.1:latest`, not `llama3.2:1b`

The 1B model *drops facts* — not fabrication, but lossy narration that undercuts the whole
"faithful to the catalog" argument:

| Question | `llama3.2:1b` | `llama3.1:latest` |
|---|---|---|
| who owns fct_users_created | "jdoe" — **dropped the second owner** | "owned by jdoe and datahub" |
| what feeds fct_users_created | only "logging_events" — **dropped 3 of 4** | lists all four upstreams |

llama3.1 was also *faster* in practice (4.7s vs 6.2s). Note the refusal beats are unaffected
either way — they resolve at ~385 ms with **no model in the path at all**, which is the point.

**Also disable LM Studio** in Settings → AI. It was enabled with nothing listening on :1234,
so it sits in the fallback chain waiting to throw an error on camera.

## The cut

| Time | On screen | Say (VO) | What it proves |
|---|---|---|---|
| 0:00–0:12 | Vantage live, anchor on the desk, ticker moving | "This is Vantage. You run it by talking to it — and it's wired into DataHub, so it answers from your real catalog." | hook |
| 0:12–0:38 | Type **"chart AMD and explain the move"** → charts, writes the read, anchor speaks it | "One instruction. It reasons, picks the charting tool, pulls the data, writes the analysis, and reads it on air." | **reasoning → tool invocation** |
| 0:38–1:00 | Type **"add TSLA to my watchlist, then take me to Robinhood"** → watchlist mutates, then navigates | "One sentence, two tool calls, executed in order." | **multi-step execution** |
| 1:00–1:30 | Type **"who owns the fct_users_created table?"** → *owners are jdoe and datahub*. Point at badge: **`DataHub + Ollama`** | "Now a different tool. That answer came out of a live DataHub instance — the agent picked the catalog, ran a read-only GraphQL query, and had the model narrate the result." | **external context platform as a tool** |
| 1:30–1:52 | Type **"what feeds the fct_users_created table?"** → logging_events, SampleHiveDataset, SampleKafkaDataset | "Lineage, in about a second — upstream datasets, straight from the catalog." | **multi-hop structured query** |
| 1:52–2:28 | **THE BEAT.** Type **"who owns the orders_v2 table?"** → *"DataHub has no owner recorded for orders_v2."* Badge reads **`DataHub (catalog)`** — no model. Hold 2s on the badge. | "Here's the part I care about. The catalog has this dataset but no owner. Most agents invent one. This one can't — when the fact is missing, the model is removed from the path entirely and the desk states the gap instead." | **honest tool use — the differentiator** |
| 2:28–2:40 | Type **"what type is the foobar column in fct_users_created?"** → *"...has no column named 'foobar'."* Still `DataHub (catalog)` | "Same rule one level down. It won't invent a column either." | refusal generalises |
| 2:40–2:52 | End card: repo URL · Apache-2.0 · "100 tests · runs local or cloud" | "Tools, catalog context, and an agent that tells you when it doesn't know. That's Vantage." | close |

---

## The lines that matter

The climax only works if the contrast is explicit. Say the badge out loud:

> "Watch the source line. On the answerable questions it reads **DataHub plus Ollama** — a model
> wrote that sentence. Here it reads **DataHub, catalog** — no model was involved at all."

Do **not** oversell it as "we solved hallucination." The honest claim, which is also the stronger
one: *for these questions the model is architecturally absent, so it cannot invent the answer.*

---

## Notes for a clean take

- **Type, don't paste** — visible typing reads as real; paste reads as staged.
- Keep answers short. If Ollama rambles on 0:12 or 1:00, cut to the next beat in the edit —
  the *action* is the point, not the essay.
- The 1:52 beat is the whole video. If a take is going long, **protect it** and drop 0:38 or 2:28.
- If the model beat stalls > 4s, hard-cut from the question to the answer. Jump cuts are fine.
- **Under 3:00 is a hard rule.** Cut order if over: 2:28 → 0:38 → 1:30.

## Fallbacks

| If this breaks | Do this |
|---|---|
| DataHub unreachable | The desk says the lookup failed — honest, but a dead beat. Fix before recording; check `curl localhost:8080/health`. |
| Ollama down / no key | Catalog beats still work (they fall back to the fact block). The 0:12 market beat does not — drop it. |
| `orders_v2` missing | Re-run `node scripts/datahub/ingest-bare.cjs`. Without it the climax is impossible. |
| Answer names the wrong dataset | Phrase table-first: *"in fct_users_created, ..."* — a leading `snake_case` token is taken as the dataset name. |

## Audio

The app scores itself. Every sound is generative Web Audio (oscillators, no asset files), so
there is **no licensing risk and nothing to attribute**: the ambient newsroom bed, the UI
blips, and the opening bell are all synthesised at runtime.

> **Check before recording: Settings → music source must be `Synth`, not `Spotify`.**
> Spotify is a selectable alternative and its default is a Lofi Beats playlist. Recording with
> it playing ships copyrighted music to YouTube — a Content ID claim can mute or region-block
> the video, which breaks the "publicly visible" submission requirement.

**Two voices is the real problem.** The anchor reads answers aloud, so VO narration collides
with it. Rule: **the anchor speaks the answers, VO only fills the gaps.** At the climax let the
anchor say the refusal in its own voice — a machine declining to invent something, out loud, is
the entire pitch, and narrating over it throws that away.

| Time | Audio |
|---|---|
| 0:00 | **Opening bell** as the cold-open sting — the product's own motif |
| 0:00–1:52 | Synth bed low under everything; anchor speaks answers, VO in the gaps |
| **1:50** | **Cut the music** — hard drop to near-silence just before the refusal lands |
| 1:52–2:28 | Silence + the anchor's refusal + the `via` badge. Let it breathe. |
| 2:40 | Bed returns under the end card |

That silence does more work than any cue. Contrast is what makes the beat land.

**Do not add** whooshes, risers, or stingers. They read as generic hackathon filler and
undercut a video whose whole argument is that this thing doesn't oversell itself. Keep the UI
blips — they read as real software.

**Practical**
- **OBS: separate audio tracks** (Settings → Output → Advanced) — desktop audio and mic on
  different tracks. Mixed to one, the anchor cannot be rebalanced against the VO in the edit.
- Levels: VO ≈ **−16 LUFS**, bed **−26 to −22 LUFS**. YouTube normalises to −14 LUFS
  integrated, so avoid heavy compression.
- If a bed beyond the synth is ever wanted: **YouTube Audio Library** is the only zero-risk
  option (pre-cleared, no attribution). Kevin MacLeod is CC-BY and *requires* attribution.

## Edit plan

One timeline, 8 clips. Lower-third callouts carrying the "what it proves" column so a muted
viewer still reads the argument. Hold an extra beat on the `via` badge at 1:52 — zoom/punch-in
if the edit allows. Export **H.264 MP4, 1080p, < 100 MB** → upload **public** (not unlisted —
the rules require publicly visible) to YouTube. Keep the source take for a re-cut.
