# AMD AI DevMaster Hackathon — Vantage submission playbook

> Working plan for entering Vantage into the **AMD AI DevMaster Hackathon**.
> Verify every rule against the official page before relying on it: https://luma.com/amd-4dhi

## The facts (✅ verified against luma.com/amd-4dhi + the official repo, 2026‑07‑16)
- **Format:** virtual, free, worldwide. **Teams: individuals or up to 3.**
- **Window:** July 14 – **Aug 6, 2026**. Submission **opens Jul 15**, **closes Aug 6, 2026**.
- **Prize:** $30,000 total across 3 tracks — $5,000 / $3,500 / $1,500 per track.
- **Tracks:** Multimodal AI · **Agentic AI** ← ours · Physical AI.
- **Required tech:** **AMD Radeon GPUs + ROCm software stack.**
- **Must register** as a member of the **AMD AI Developer Program** *before joining* — non‑members **"will not be eligible to receive prize money."**
- **No specific AI model is mandated.** The tracks emphasise **local inference**; the model choice is ours.
- **Submission = fork + PR** to `AMD-DEV-CONTEST/Radeon-hackathon-2026-07`, PR title formatted **`Track x, Team name, your application name`**. **All materials in English.**
- **Support:** Discord `https://discord.gg/zt9caur5B3` · `ai_dev_contests@amd.com`

## 🎯 You do NOT need to own a Radeon — AMD gives you one (Radeon Cloud)
This solves the hardware problem: **https://radeon-global.anruicloud.com/**
Login with email → **Profile → Add Template** (title + container image; toggle **SSH Access** if you want SSH) → **Launch** → reach it via **JupyterLab terminal** or **SSH**. **Destroy the instance when done — a running instance burns credits.**

### Two ways to get AMD inference (pick one)
| | **Free shared Model APIs** | **Dedicated Model API** |
|---|---|---|
| Cost | **Free — no instance, no credits** | Uses your credits |
| Models | **Qwen** and **DeepSeek** (e.g. `Qwen3.6-35B-A3B`, `DeepSeek-V4-Flash`) | Your choice |
| Serving | Managed by AMD | **vLLM only** — `vllm serve <model> --host 0.0.0.0 --port 8000` |
| Get it | **Token Factory** → https://developer.amd.com.cn/radeon/modelapis → copy Base URL + Model + API Key | Template with **Deploy Type = vLLM Model API**; endpoint at `.../spaces/<id>/8000/v1` |

Both are **OpenAI‑compatible**:
```bash
curl https://developer.amd.com.cn/radeon/api/v1/chat/completions \
  -H "Authorization: Bearer <API_KEY>" -H "Content-Type: application/json" \
  -d '{"model":"Qwen3.6-35B-A3B","messages":[{"role":"user","content":"Hello"}]}'
```

### ⚠️ This breaks our Ollama assumption — read this
AMD's managed serving is **vLLM, not Ollama** ("Radeon only supports vLLM"). This playbook assumed Ollama‑on‑ROCm. That's still viable if we install Ollama **inside** a Radeon Cloud instance ourselves, but it is **not** the paved path. **Vantage already speaks OpenAI‑compatible** (`askOpenAICompat`), so pointing the desk at an AMD Radeon endpoint is a **settings change, not a code change**: set an OpenAI‑kind model's **BASE URL** to AMD's, **MODEL** to `Qwen3.6-35B-A3B`, and paste the **API key**.
- **Open risk — CORS:** Vantage calls models straight from the browser. If `developer.amd.com.cn` doesn't send permissive CORS headers, the browser blocks it and we'd route via `server/index.js` instead. **Test this early** — it's the difference between a settings tweak and a proxy build.
- **Judging optics:** a *shared hosted API* is weaker evidence of "runs on AMD" than a **dedicated instance you control**. The dedicated vLLM instance (or Ollama inside your own Radeon instance) is the stronger demo.

---

# 📋 RULES COMPLIANCE AUDIT (read: the governing Rules & Conditions doc, 2026‑07‑16)
Source of truth: [Rules & Conditions Google Doc](https://docs.google.com/document/d/1TwgwBNUAv8fRNQbkcTZmcRR0__Oi4WMsBfkW38ALZp4/edit) — *"the governing document for eligibility, judging methodology, submission requirements, code of conduct, intellectual property provisions, payments, and legal requirements."*

**Our track is Track 2: "Development & Local Deployment of Private AI Agents."**

## 🚨 Read this before you commit to entering: the IP terms
Verbatim from the rules:
> *"All Entries become the property of AMD, and none will be returned."*
> Participant grants AMD *"a royalty‑free, irrevocable, non‑exclusive worldwide license to use, reproduce, modify, publish, create derivative works from, and display the entry and all elements embodied therein… including for advertising, promotional, marketing and other purposes, without further payment or consideration."*

The license is **non‑exclusive**, so you keep the right to commercialise Vantage and to pitch it to SFF — but the *"become the property of AMD"* wording is aggressive, and you are handing AMD an **irrevocable** right to use and make derivatives of your submission. **You are commercialising this product (Stripe plans are already wired) and pitching the same product to SFF.** Make that trade knowingly. Everything below assumes you've accepted it.

## Track 2 hard requirements vs. where Vantage actually stands

| Rule (verbatim) | Vantage today | Verdict |
|---|---|---|
| *"Must run on AMD Radeon GPU of Radeon cloud + ROCm software stack"* | Runs on local Ollama; verified only on **NVIDIA/CUDA** | ❌ **must do on Radeon Cloud** |
| *"Core inference processes shall be executed locally on AMD Radeon GPU; remote APIs are not allowed for core functions"* | `?local=1` runs the desk on a local model, no cloud keys — **verified working** | ✅ *satisfiable — demo local‑only* |
| *"It is not allowed to depend entirely on closed‑source Agent platforms to implement core features"* | Our own code (`askDesk`, `askOllama`) | ✅ |
| **≥2 of 5 capabilities required** | see below | ⚠️ **scrapes 2 — thin** |
| Deliverable form | Web UI | ✅ |

### The "≥2 of 5" minimum — we're thin here
| Capability | Status |
|---|---|
| Tool invocation | ✅ charts, watchlist, navigation, exports, calendar |
| Clear permission control & privacy protection | ✅ accounts/plans + local‑only (no data leaves the box) |
| **Local multi‑turn memory** | ❌ **code‑verified missing** — every call sends `messages: [{role:"user", content: prompt}]`. One‑shot, no history. |
| Multi‑step task planning | ⚠️ weak — intent routing, not real decomposition |
| Local knowledge retrieval (RAG) | ❌ none |

We technically clear the bar with 2, but the scoring punishes the gaps.

### Where the points actually are (Track 2 = 120 pts)
- **Functional completeness (60):** task positioning 20 · *"task decomposition, tool invocation, RAG and memory management"* 20 · **"Smooth multi‑turn interaction experience" 20**
- **AMD adaptation (40):** *"Core inference running on AMD Radeon GPU"* 20 · **"Targeted optimization for inference speed" 20**
- **Bonus (20):** *"Core inference running Using Radeon cloud model API with quantization or distillation or other optimization methods."*

➡️ **Highest‑value fix: multi‑turn memory.** It's one of the 5 minimums *and* feeds two 20‑point criteria (~40 pts). It's a contained change to `askDesk` — keep a turn history and send prior messages.
➡️ **Second: an inference‑speed story** (20 pts) — quantisation/distillation, with before/after numbers.

### ⚠️ Rule tension to clarify on Discord
The platform rule says *"remote APIs are not allowed for core functions"*, but the **bonus** awards points for *"core inference running using Radeon cloud model API."* So the free shared Qwen/DeepSeek endpoints may be blessed *or* disqualifying for core inference. **Ask before building on them.** Safest reading: run inference **on your own Radeon Cloud instance**.

**Ready to paste in their Discord (https://discord.gg/zt9caur5B3):**
> Track 2 rules question: the platform requirements say core inference must run *locally on the AMD Radeon GPU* and that *"remote APIs are not allowed for core functions"* — but the optional 20-pt bonus mentions *"core inference running using Radeon cloud model API."* Two clarifications, please: (1) does "local" mean a model we serve ourselves on our own Radeon Cloud instance (vLLM / Ollama)? (2) Do the shared Token Factory model APIs (Qwen/DeepSeek) qualify as compliant core inference for the bonus, or must the bonus also come from a dedicated instance we run? Want to be sure our architecture qualifies before we finalize. Thanks!

**One‑click vLLM is now built in** (the paved path needs no manual card setup): open Vantage with **`?local=vllm`** — it enables only the local OpenAI‑compatible card at `http://localhost:8000/v1` and auto‑detects the served model id from `/models` (`&base=` / `&model=` to override). `?local=1` remains the Ollama route. Verified end‑to‑end against an OpenAI‑compatible stream.

### ⚠️ Framework note
Optional frameworks are listed as **vLLM / llama.cpp** (+ Transformers/PyTorch‑ROCm). **Ollama is not named** — it wraps llama.cpp so it should qualify, but **vLLM is the paved path on Radeon Cloud**. Note also Finnhub is a remote **data** API, not inference — it shouldn't trip the "remote APIs" rule, but demo mode makes the local/private story cleaner.

## ✅ Eligibility & admin (all mandatory)
- **Luma registration *and approval*** — *"mandatory for prize eligibility"*, subject to AMD verification
- **AMD Developer Program membership** — a **pre‑requisite** for prizes: https://www.amd.com/en/developer/ai-dev-program.html
- **18+** (or majority; under‑18 needs a guardian‑signed waiver)
- **A valid Discord ID and a valid GitHub ID are required**
- Individuals or teams **up to 3**; legal names, same team name
- Ineligible: nationals of sanctioned countries/OFAC‑SDN/BIS lists; AMD employees + immediate family

## 📦 Required submission artifacts (Track 2)
1. **Project Specification Document** — application scenarios · **Agent architecture diagram** · core capabilities · **model introduction & local deployment plan** · **optimization description for inference speed on AMD Radeon GPU**
2. **Project Source Code** — complete repo + **README with environment configuration, startup guide, dependency list**
3. **Demo Video** — **3–5 minutes**, showing *"actual execution performance on an AMD Radeon GPU, from command line/GUI to the final result"*
4. **Supplementary (choose one)** — PPT **or** Poster
5. **Fork + PR** to `AMD-DEV-CONTEST/Radeon-hackathon-2026-07`, PR titled **`Track 2, Ryan Wien, Vantage`**, **in English**

## ⏰ Real deadline (mind the timezone)
**Aug 6, 2026, 11:59 PM UTC+8** = **Aug 6, 8:59 AM US Pacific** — a *morning* deadline in the US, not end of day. **~3 weeks out.**

## ✅ Resolved: the pre‑existing project question
Searched the full rules — **there is no requirement to build during the event and no ban on prior work.** "Originality" appears only as a *judging* criterion (*"novelty and originality of the proposed solution"*). Vantage's history is not a rule problem.

## ⚠️ Still unconfirmed
1. **The "remote API" vs. "Radeon cloud model API bonus" tension** (above) — ask on Discord before relying on the shared endpoints for core inference.
2. **Whether Ollama counts** as an accepted stack given only vLLM / llama.cpp are named. Low risk; confirm if you rely on it.

## 🎯 What to do next, in order (updated 2026‑07‑16)
Already done ✅ — multi‑turn memory (built + e2e‑verified), README AMD/ROCm runbook, spec document
(`submission/AMD-SPEC.md`), poster (`submission/poster.html`), Radeon one‑shot setup script
(`scripts/radeon-setup.sh`), demo opens on AMD's own ticker.

Remaining — all yours:
1. **Register**: Luma (needs AMD approval — don't leave it late) + **AMD Developer Program**. Confirm you have a Discord ID and GitHub ID. *Prize‑gating, do it today.*
2. **Launch a Radeon Cloud instance**, clone the repo, run `bash scripts/radeon-setup.sh` — the final line must show `ollama ps` → **100% GPU**.
3. **Fill the [TODO] latency numbers** (script's query set) into `submission/AMD-SPEC.md` and the poster; add team names; export both to PDF.
4. **Record the 3–5 min video on the instance** — `rocm-smi` + `ollama ps` on camera, then the live agent (chart AMD → follow‑up question → voice → report export → offline test).
5. **Ask Discord** the remote‑API/bonus question (before relying on shared endpoints for anything).
6. **Fork + PR**: `Track 2, Ryan Wien, Vantage` — before **Aug 6, 8:59 AM Pacific**.

## Why Vantage fits "Agentic AI"
Vantage's AI desk is already an **agent that reasons over natural language and executes tools**, not a chatbot. Given one instruction it decides *which* capability to invoke and runs it:

| User says | Agent decides → tool it executes |
|---|---|
| "chart AMD and tell me why it's moving" | reason → chart tool + market answer, read on air (TTS) |
| "add TSLA to my watchlist" | intent parse → watchlist mutation |
| "take me to Robinhood" | navigation intent → in‑app embed/redirect |
| "what's on Netflix?" | catalog tool → streaming results |
| "write a report and export PPT" | report‑writer → PowerPoint/Word/Excel generation (`exporters.js`) |
| a calendar event's time arrives | scheduled trigger → breaking‑news reminder on air |

That's genuine **reasoning + multi‑tool use** — the heart of the Agentic AI track.

## The AMD angle: run the whole agent locally on Radeon/ROCm
Vantage already supports local models (`Ollama` and `LM Studio`) and can run the desk with **no cloud keys**. For this hackathon the brain runs on an **AMD Radeon GPU through ROCm**:

1. Install **ROCm** + **Ollama** on the AMD machine (Ollama uses ROCm for Radeon acceleration).
2. Pull a model, e.g. `ollama pull llama3.1` (or a tool‑use‑capable model).
3. Allow the browser origin so Vantage can call it:
   `OLLAMA_ORIGINS=http://127.0.0.1:5173 ollama serve`
4. Point Vantage at it — **one click** (built in): open **Settings → AI → "⚡ Run local‑only (AMD / ROCm)"** and hit **"Switch the desk to local"**, or just open the app at **`http://127.0.0.1:5173/?local=1`**. Either one enables *only* the Ollama model and lifts the plan gate — no cloud keys, no manual config. (You can still set a different model id / base URL on the Ollama card.)
5. **Prove the Radeon is actually doing the work** (do this before recording — see below).
6. Now every desk answer, report, and command runs on **local AMD inference** — demonstrably offline.

## ⛔ The one thing that will sink the demo: silent CPU fallback
Ollama does **not** error when ROCm isn't engaged — it quietly runs the model on the **CPU**. It still answers, so Vantage looks fine and you'd never know from the app. If you claim "this runs on the Radeon" while it's on CPU, that's the claim a judge can falsify. **Check before you record:**

```
ollama ps
```
The **PROCESSOR** column must read **`100% GPU`**. If it says `100% CPU` (or splits like `40%/60% CPU/GPU`), ROCm is not engaged and the demo claim is false.

| PROCESSOR shows | Meaning |
|---|---|
| `100% GPU` | ✅ ROCm engaged — model is on the Radeon |
| `100% CPU` | ❌ ROCm not engaged — fix before demoing |
| mixed split | ⚠️ partial offload — model too big for VRAM; use a smaller model/quant |

Corroborate with two more signals:
- `curl http://localhost:11434/api/ps` → **`size_vram`** should be > 0 and ≈ the model size (0 means CPU).
- `rocm-smi` **during** a query → GPU utilization and VRAM should jump.

If it lands on CPU: confirm your card is ROCm‑supported, that ROCm is installed and the driver is current, and for a supported‑but‑unrecognized card try the `HSA_OVERRIDE_GFX_VERSION` env var matching your gfx target. Check the `ollama serve` log on startup — it prints which inference library it selected and which GPU it detected. *(Verify current supported‑GPU list + the correct gfx override on AMD's/Ollama's official docs — this playbook doesn't pin those.)*

**Troubleshooting**
- `model "llama3.1" not found, try pulling it first` → the model isn't downloaded. Run `ollama pull llama3.1` (or whatever id you set on the Ollama card), or change the **MODEL** field to one you already have (`ollama list`).
- `can't reach Ollama (OLLAMA_ORIGINS)` → Ollama isn't running, or it's blocking the browser origin. Start it with `OLLAMA_ORIGINS=http://127.0.0.1:5173 ollama serve`.
- The desk answers but `ollama ps` says **CPU** → see "silent CPU fallback" above. The app is fine; ROCm is the problem.

## ✅ Verified vs. ⚠️ still to verify on the AMD box
Be precise about this — it's the difference between a claim that holds up and one that doesn't.

**Verified (on a dev box, 2026‑07‑16):**
- The full path **browser → `askOllama` → local Ollama → model → answer on the desk** works against a **real** model: `?local=1` enabled Ollama alone, the desk header read `Ollama (local) (llama3.1)`, and llama3.1 returned a correct answer in **796 ms** with **0 console errors** and no raw error codes surfaced.
- That run was **GPU‑accelerated and offline** — `ollama ps` reported `100% GPU`, full model in VRAM.
- Vantage is **GPU‑vendor agnostic**: it only speaks HTTP to Ollama and never touches the GPU itself. Ollama picks the backend.

**⚠️ Not yet verified — you must do this on the Radeon box:**
- The verification run above used an **NVIDIA GPU (CUDA backend)**, *not* ROCm. It proves the **Vantage↔Ollama↔GPU path**, but **not** that ROCm engages on your specific Radeon.
- Whether **ROCm** initialises for your card (support varies by gfx target) is an **Ollama/driver** matter, not a Vantage one. Confirm it with the `ollama ps` → `100% GPU` check plus `rocm-smi`, and capture that as evidence.

**How to talk about it:** "The agent's brain runs entirely on local inference through Ollama on this Radeon GPU — no cloud." Show `ollama ps` (`100% GPU`) and `rocm-smi` on camera so the claim is evidenced, not asserted.

*(Client wiring: `askOllama()` in `React.jsx`; the one‑click path is `soloModel("ollama")` + the `?local=1` mount effect; local‑model picker is `isLocalModel`.)*

## Demo video script (3–5 min per rules · Track 2, all local on AMD)
1. **0:00** — Show `rocm-smi` **and** `ollama ps` with **PROCESSOR = `100% GPU`** clearly visible: model loaded on the Radeon. State: "the agent's brain runs entirely on AMD ROCm, no cloud." *(If that column doesn't say GPU, stop and fix — don't record.)*
2. **0:20** — Vantage → Settings → AI: only **Ollama (local)** is enabled. No API keys anywhere.
3. **0:35** — Type *"chart AMD and explain the move"* → agent charts + answers; the anchor reads it aloud.
4. **1:10** — **Multi‑turn memory (scored criterion — don't skip):** follow up with just *"what about its risks?"* → the desk resolves "its" from local memory. Then Settings → AI → point at **"forget conversation"**: "memory lives on this device, cleared in one click."
5. **1:45** — 🎙 voice command: *"take me to Robinhood"* → agent navigates/embeds (tool use).
6. **2:10** — *"write a report and export a PowerPoint"* → local model writes it; browser builds the deck. Open it.
7. **2:50** — Go offline (disable networking on camera); repeat a query → still answers. "Fully local AMD inference — your questions never leave this machine."
8. **3:20** — Close over `rocm-smi` under load: tools + memory + privacy from plain language, all on the AMD/ROCm stack.

## Submission checklist
- [ ] Register on **Luma** (needs AMD approval) + the **AMD AI Developer Program** (prize eligibility)
- [x] ~~Confirm new‑project rule~~ — **resolved**: the governing rules have no build‑during‑event requirement; prior work is fine
- [ ] Radeon Cloud instance → `bash scripts/radeon-setup.sh` → **`ollama ps` reads `100% GPU`** (the demo claim depends on it)
- [ ] Capture AMD evidence: `rocm-smi` during a query, `ollama ps` (PROCESSOR column), `api/ps` showing `size_vram` > 0, GPU‑utilization screenshots
- [ ] Fill [TODO] latency numbers + team info into `submission/AMD-SPEC.md` and `submission/poster.html`; export both to PDF
- [ ] Record demo video (**3–5 min**, script above) showing local‑on‑AMD agent + tools + multi‑turn memory
- [x] README section "Run on AMD Radeon / ROCm" — **done** (step‑by‑step, with the CPU‑fallback check)
- [x] Write‑up — **done**: `submission/AMD-SPEC.md` (Track 2, agent reasoning + tools, why AMD)
- [ ] Fork `AMD-DEV-CONTEST/Radeon-hackathon-2026-07` + PR titled **`Track 2, Ryan Wien, Vantage`**

## ✅ Built: one‑click local mode
A **"⚡ Run local‑only (AMD / ROCm)"** control now lives at the top of **Settings → AI**, and the same thing triggers from the **`?local=1`** URL param. It enables *only* the local Ollama model and lifts the plan gate, so the whole agent runs on local (AMD) inference with zero cloud keys. Verified in‑browser: it flips the desk from cloud (plan‑locked) to Ollama‑only with the gate lifted, via both the button and the URL param.
