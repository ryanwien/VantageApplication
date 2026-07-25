# Claude design prompts — Take03 intro & end cards

Paste each prompt into Claude (claude.ai or Claude Code with the frontend-design skill).
The deliverable is a self-contained HTML page; we screen-record it at 1920×1080/60fps
(Chrome fullscreen + OBS — same pipeline as the app takes) and drop it on the timeline
in place of `00-intro.mp4` / `11-endcard.mp4`.

---

## Prompt 1 — INTRO CARD (~4 seconds)

> Design a self-contained animated HTML intro card for a demo film. One file, no
> external assets, no libraries — inline CSS animations only. Exactly 1920×1080,
> designed to be screen-recorded for 4 seconds, then it should hold still.
>
> **Brand it must match** (a financial-terminal web app called VANTAGE):
> - Background: near-black blue-tinted terminal (#0B0D12)
> - Accent gold/amber #F5B82E (the VANTAGE wordmark color), body text #D8DEE9,
>   muted gray #8899AA, market green #4CAF7D and red #E5484D as tiny accents only
> - Typography: monospace (ui-monospace / Consolas) — it's a terminal, not a startup site
>
> **Content & choreography (4s total):**
> 1. 0.0–0.6s: a thin gold horizontal rule draws itself across center-screen
> 2. 0.4–1.2s: the wordmark **VANTAGE** (large, letter-spaced, gold) rises ~30px and
>    fades in above the rule
> 3. 1.2–2.0s: below the rule, the tagline fades in: "The AI market desk that
>    refuses to invent facts"
> 4. 2.2–3.0s: a subtle ticker strip of fake symbols (AAPL, NVDA, AMD, NFLX with
>    small green/red deltas) slides across the very bottom edge at low opacity —
>    ambience, not focus
> 5. 3.0s+: everything settles and HOLDS (no loop, no exit animation — the video
>    edit will cut away)
>
> Restraint is the aesthetic: no gradients-for-the-sake-of-it, no glow, no
> particles. It should feel like a Bloomberg terminal booting, not a crypto promo.

---

## Prompt 2 — END CARD (~6 seconds)

> Design a self-contained animated HTML end card for the same film — same file rules
> (one file, inline CSS only, 1920×1080, record 6 seconds then hold).
>
> **Same brand system:** #0B0D12 background, gold #F5B82E, monospace, restrained.
>
> **Content & choreography (6s total), staggered line-by-line fade/rise-ins:**
> 1. 0.0–0.8s: **VANTAGE** wordmark, gold, centered upper-third
> 2. 0.8–1.6s: `github.com/ryanwien/VantageApplication` — white, monospace, the
>    visual anchor of the card (this is what judges must remember)
> 3. 1.6–2.4s: one metadata line, gray: `Apache-2.0 · 105 tests · runs local or cloud`
> 4. 2.4–3.4s: the closing claim, slightly larger than the metadata, body color:
>    "Tools, a live catalog, and an agent that tells you when it doesn't know."
> 5. 3.4s+: hold everything. Optionally a 1px gold rule underlining the repo URL
>    draws itself as the final touch.
>
> No QR codes, no social handles, no loop. The card should read completely in a
> 6-second hold and look composed as a freeze-frame thumbnail.

---

**To produce the clips once the HTML exists:** open the file in Chrome fullscreen
(F11), record ~8s with OBS at 1920×1080/60 (mute all audio), trim to 4s / 6s, and
swap onto the timeline in place of the ffmpeg cards.
