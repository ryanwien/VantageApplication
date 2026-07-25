# Vantage — Take 03 (full-feature demo) · DaVinci Resolve cut list

**Raw clip:** `C:\Users\Ryan\OneDrive\Desktop\vantage-take-03-fulldemo.mp4` (H.264, DaVinci-friendly)
Backup: `…\vantage-take-03-fulldemo.mkv`
**Raw length:** 10:37 · **Target final:** under 3:00 (hackathon cap)

> ✅ **ALREADY CUT:** `…\vantage-take-03-roughcut.mp4` (2:58, silent) is the assembled cut with dead
> air removed — every beat frame-verified on the correct content. Just add VO + polish.
> **Corrected raw reveal timecodes** (the table below had earlier, pre-latency estimates — use these):
> B1 anchors 34–54 · B2 NFLX ~211 · B3 owner ~268 · B4 lineage ~300 · **B5 climax ~345** ·
> B6 foobar ~385 · B7 report modal ~425 · B8 teach ~540 · B8 quiz ~620 · B9 close ~632.
**Audio:** the take is **SILENT** — all OBS tracks were muted on purpose. Dub VO + add the synth
bed in Resolve. (App's synth music is generative/licence-free; regenerate it in-app or add
YouTube Audio Library if you want a bed.)

> Timecodes below are the RAW-FILE positions where each beat happens. They are **approximate
> markers (scrub ±10s)** — the take was driven programmatically, so there is **dead air between
> beats** (static desk while the next command is prepared). **Cut all the dead air.** Once trimmed,
> the 9 beats total roughly 90–110s of usable action, which drops comfortably under 3:00.

---

## ⚠️ Read this first — one bad take to skip

**Beat 2 has a FAILED first attempt at ≈ 00:01:15–00:03:35.** The desk was asked "add NFLX to my
watchlist" as a *chat* command, which isn't a watchlist verb, so the model answered
*"NFLX is not present in the provided market snapshot…"* — **do not use that section.** The
**correct** add is via the top command bar (`ADD NFLX`) and lands at **≈ 00:03:41** with the
*"Added NFLX to watchlist"* toast and NFLX appearing in the ticker/chart. Use that one.

---

## Beat → timecode map

| # | ≈ Raw TC | On screen | Proves | VO cue (dub in Resolve) |
|---|---|---|---|---|
| 1 | 00:00:12–00:01:08 | Open on the desk; anchor cycles **Sterling → Nova → Blaze → Sterling** (each appears at a spread-out moment in this window — grab a clean frame of each) | Animated, swappable anchors | "This is Vantage — an AI market desk you run by talking to it." |
| 2 | **≈ 00:03:41** | Command bar `ADD NFLX` → **"Added NFLX to watchlist"** toast; NFLX enters the ticker, chart + panels switch to NFLX | Tool execution / live mutation | "One command adds it to the watchlist — the whole desk retargets instantly." |
| 3 | ≈ 00:04:10 | "who owns fct_users_created?" → **`DataHub + Ollama (local)`**, *"…owned by jdoe and datahub."* | Answers from the real catalog | "It's wired into DataHub — this came from a live catalog, narrated by a local model." |
| 4 | ≈ 00:04:45 | "what feeds fct_users_created?" → all **4 upstreams** (logging_events, SampleHive/Hdfs/Kafka) | Multi-hop lineage | "Lineage in a second — every upstream, straight from the catalog." |
| 5 ⭐ | **≈ 00:05:19** (hold to ~05:26) | **"who owns orders_v2?"** → **`DataHub (catalog)`, no model**, *"DataHub has no owner recorded for orders_v2."* + fact block | **Honest refusal — THE beat** | "Here's what matters. No owner is recorded — so the model is removed from the path entirely. It can't invent one." |
| 6 | ≈ 00:05:55 | "what type is the foobar column…?" → still **`DataHub (catalog)`**, *"…has no column named 'foobar'."* + real schema | Honesty escalates (missing sub-fact) | "Same rule, one level finer — it won't invent a column either." |
| 7 | report ≈ 00:06:40 · **modal ≈ 00:06:50–00:07:05** | "write a report and export ppt" → analyst report on NFLX, then **REVIEW & EDIT — before you export** modal (editable title / body / snapshot) | Document generation you can review & export | "It drafts a full report you can edit, then exports to PowerPoint — built in." |
| 8 | teach ≈ 00:07:45 · quiz ≈ 00:09:1x · **correct/score-1 ≈ 00:10:0x** | **Stock School** — anchor badge flips to "TEACHING…", lesson 1/8 "What is a stock?", **Quiz me →**, then A ✓ **Correct, score 1** | Local teaching, no API/credits | "And it teaches — Stock School runs fully local, no keys, no credits." |
| 9 | 00:10:18–00:10:35 | Clean desk (closing plate) | Close | "Tools, a live catalog, and an agent that tells you when it doesn't know. That's Vantage." |

---

## Suggested assembly (to hit < 3:00)

Rough budget once dead air is cut:

1. **0:00–0:12** Beat 1 open + anchor cycle (tighten the cycle to ~2s/anchor)
2. **0:12–0:24** Beat 2 NFLX add
3. **0:24–0:40** Beat 3 owner (answerable)
4. **0:40–0:54** Beat 4 lineage
5. **0:54–1:24** Beat 5 **climax refusal** — hold on the `DataHub (catalog)` badge 3–4s in near-silence
6. **1:24–1:38** Beat 6 foobar refusal
7. **1:38–2:05** Beat 7 report + review modal
8. **2:05–2:35** Beat 8 Stock School (teach → quiz → correct)
9. **2:35–2:48** Beat 9 close card (repo URL · Apache-2.0 · "runs local or cloud")

**If long, trim in this order:** shorten the anchor cycle (1) → trim Stock School to teach+correct only (8) → drop the report's streaming pre-roll, keep the modal (7). **Never cut Beat 5.**

## Edit notes
- The three honesty beats (5 → 6, and the near-match if you shoot it later) escalate: *missing fact → missing sub-fact*. Keep them adjacent so it reads as a design principle.
- Beat 5 is the differentiator. Punch-in / hold on the `DataHub (catalog)` badge; let it breathe.
- Lower-thirds carrying the "Proves" column keep a muted viewer following the argument.
- Export H.264 MP4, 1080p; upload **public** to YouTube (rules require publicly visible).

## Reference frames (in scratchpad)
`frame-nflx.png` (beat 2), `frame-report-modal.png` (beat 7), `frame-school.png` (beat 8),
`frame-precheck.png` (clean fullscreen open).
