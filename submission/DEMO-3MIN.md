# Vantage — sub-3-minute demo (agents + tool-usage hackathon)

**Target run time: ~2:50** (hard cap 3:00). Every beat is chosen to hit the
evaluation criteria: *autonomous multi-step tool calls · local/cloud LLM routing ·
structured execution*. Local inference is the closing bonus, not the centerpiece.

**Recording rig:** OBS on this Windows box (screen scene + optional webcam corner).
Browser at `http://127.0.0.1:5173` pointed at the remote Radeon Ollama via SSH tunnel
(`ssh -L 11434:localhost:11434 <user>@<host>`). A second terminal SSH'd into the
instance shows `rocm-smi` live for the one cutaway. I drive OBS start/stop.

| Time | On screen | Say (VO) | Criterion it proves |
|---|---|---|---|
| 0:00–0:12 | Vantage live, anchor on desk, ticker moving | "This is Vantage — an AI desk you run by talking to it. Watch it work." | hook |
| 0:12–0:45 | Type **"chart AMD and explain the move"** → it charts, writes the read, anchor speaks it | "One instruction. It reasons, picks the chart tool, pulls the data, writes the analysis, and reads it aloud." | **reasoning → tool invocation** |
| 0:45–1:10 | Follow up **"what about its risks?"** → resolves *its*=AMD, answers | "No repeated context — it remembers the last turn in local memory. That's agentic state, not a one-shot prompt." | **multi-turn memory (scored)** |
| 1:10–1:38 | 🎙 voice: **"add TSLA to my watchlist, then take me to Robinhood"** → watchlist mutates, then navigates | "One sentence, two tool calls, executed in order." | **multi-step task execution + tool breadth** |
| 1:38–2:08 | **"write a report on my watchlist and export a PowerPoint"** → model writes, browser builds .pptx, open it | "It produces a real artifact — structured output the model plans, the app renders." | **structured execution** |
| 2:08–2:38 | Settings → flip **local-only** (`?local=1`): FULLY LOCAL banner + telemetry `llama3.1 · 100% GPU-resident`; ask one more question, it answers. Quick `rocm-smi` cutaway spiking. | "Same agent — now running entirely on a local model, AMD Radeon through ROCm. No cloud keys, nothing leaves the machine." | **local/cloud routing + privacy (bonus)** |
| 2:38–2:50 | Hold on the desk; end card: repo URL · Apache-2.0 · "runs local or cloud" | "Tools, memory, and private local inference — all from plain language. That's Vantage." | close |

## Notes for a clean take
- **Pre-load** the AMD chart once before recording so first render is warm (no cold-cache stall on camera).
- Keep each answer short — if the model rambles, cut to the next beat in the edit; the *action* is the point, not the essay.
- The watchlist+navigation beat is the strongest "autonomous" moment — make sure both actions visibly complete.
- If the .pptx build is slow, hard-cut from "export" to the opened file (jump cut is fine).
- **Under 3:00 is a hard rule** — if a take runs long, drop the risks follow-up (0:45) first; memory is also shown implicitly elsewhere.

## Edit plan (DaVinci Resolve)
One timeline, 6 clips end-to-end. Add lower-third text callouts (the "criterion" column)
so a muted viewer still reads what each beat proves. Export **H.264 MP4, 1080p, < 100 MB**
→ upload **unlisted or public on YouTube**. Keep the source take in case you re-cut.
