# AMD AI DevMaster Hackathon — Vantage submission playbook

> Working plan for entering Vantage into the **AMD AI DevMaster Hackathon**.
> Verify every rule against the official page before relying on it: https://luma.com/amd-4dhi

## The facts (confirm on the official page)
- **Format:** virtual, free, worldwide. Teams up to 3.
- **Window:** ~July 14 – **Aug 6, 2026** (submission deadline). *Tightest of our deadlines.*
- **Prize:** $30,000 total across 3 tracks — $5,000 / $3,500 / $1,500 per track.
- **Required tech:** **AMD Radeon GPUs + ROCm software stack** (free GPU access offered to eligible participants).
- **Must register** with the **AMD AI Developer Program** to be prize‑eligible.
- **Track we're entering:** **Agentic AI** (intelligent agents with reasoning + tool use).

## ⚠️ Open questions to resolve first
1. **New‑project rule** — the page didn't state whether pre‑existing projects are allowed. If it's "built during the event only," note Vantage's first commit is **2026‑07‑14**, which lands inside this event's window — but confirm and be ready to disclose prior work.
2. **Video length / required AMD evidence** — confirm max video length and exactly what proof of "AMD/ROCm was used" they want (logs, `rocm-smi`, screenshots).
3. **Eligibility** — residency/age; register the AMD AI Developer Program account early.

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
5. Now every desk answer, report, and command runs on **AMD inference** — demonstrably offline.

*(Client wiring: `askOllama()` in `React.jsx`; the one‑click path is `soloModel("ollama")` + the `?local=1` mount effect; local‑model picker is `isLocalModel`.)*

## 3‑minute demo script (Agentic AI, all local on AMD)
1. **0:00** — Show `rocm-smi` and `ollama ps`: model loaded on the Radeon GPU. State: "the agent's brain runs entirely on AMD ROCm, no cloud."
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
- [ ] Capture AMD evidence: `rocm-smi`, `ollama ps`, GPU‑utilization screenshots, agent logs
- [ ] Record demo video (confirm max length) showing local‑on‑AMD agent + tool use
- [ ] Public repo (or shared per their rules) + README section: "How ROCm/Radeon is used"
- [ ] Write‑up: which track, the agent's reasoning + tools, why AMD

## ✅ Built: one‑click local mode
A **"⚡ Run local‑only (AMD / ROCm)"** control now lives at the top of **Settings → AI**, and the same thing triggers from the **`?local=1`** URL param. It enables *only* the local Ollama model and lifts the plan gate, so the whole agent runs on local (AMD) inference with zero cloud keys. Verified in‑browser: it flips the desk from cloud (plan‑locked) to Ollama‑only with the gate lifted, via both the button and the URL param.
