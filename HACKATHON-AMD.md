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

## ⚠️ Still unconfirmed
1. **New‑project rule** — still not stated on the luma page or the repo. Vantage's first commit is **2026‑07‑14**, inside the window, but be ready to disclose prior work. **Ask on Discord.**
2. **Video length / required AMD evidence** — the **Rules & Conditions** doc on the luma page is authoritative and we haven't read it. It also defines what the PR must contain.
3. **Eligibility** — residency/age; register the AMD AI Developer Program account **early** (it gates prize money).

## Why Vantage fits "Agentic AI"
Vantage's AI desk is already an **agent that reasons over natural language and executes tools**, not a chatbot. Given one instruction it decides *which* capability to invoke and runs it:

| User says | Agent decides → tool it executes |
|---|---|
| "chart NVDA and tell me why it's moving" | reason → chart tool + market answer, read on air (TTS) |
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

## 3‑minute demo script (Agentic AI, all local on AMD)
1. **0:00** — Show `rocm-smi` **and** `ollama ps` with **PROCESSOR = `100% GPU`** clearly visible: model loaded on the Radeon. State: "the agent's brain runs entirely on AMD ROCm, no cloud." *(If that column doesn't say GPU, stop and fix — don't record.)*
2. **0:20** — Vantage → Settings → AI: only **Ollama (local)** is enabled. No API keys.
3. **0:35** — Type *"chart NVDA and explain the move"* → agent charts + answers; the anchor reads it aloud.
4. **1:10** — *"take me to Robinhood"* → agent navigates/embeds (tool use).
5. **1:30** — *"write a report and export a PowerPoint"* → agent generates the deck locally.
6. **2:10** — Pull the network cable / go offline; repeat a query → still works. "Fully local AMD inference."
7. **2:40** — Close on the three tools exercised from plain language + the AMD/ROCm stack.

## Submission checklist
- [ ] Register the **AMD AI Developer Program** account (prize eligibility)
- [ ] Confirm new‑project rule + disclose prior work if required
- [ ] Configure Vantage local‑only on an AMD/ROCm box (steps above)
- [ ] **Confirm `ollama ps` reads `100% GPU`** (not CPU) — the demo claim depends on it
- [ ] Capture AMD evidence: `rocm-smi` during a query, `ollama ps` (PROCESSOR column), `api/ps` showing `size_vram` > 0, GPU‑utilization screenshots, agent logs
- [ ] Record demo video (confirm max length) showing local‑on‑AMD agent + tool use
- [ ] Public repo (or shared per their rules) + README section: "How ROCm/Radeon is used"
- [ ] Write‑up: which track, the agent's reasoning + tools, why AMD

## ✅ Built: one‑click local mode
A **"⚡ Run local‑only (AMD / ROCm)"** control now lives at the top of **Settings → AI**, and the same thing triggers from the **`?local=1`** URL param. It enables *only* the local Ollama model and lifts the plan gate, so the whole agent runs on local (AMD) inference with zero cloud keys. Verified in‑browser: it flips the desk from cloud (plan‑locked) to Ollama‑only with the gate lifted, via both the button and the URL param.
