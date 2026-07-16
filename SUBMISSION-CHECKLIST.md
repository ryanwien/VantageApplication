# Pre‑submission master checklist — AMD DevMaster + SFF Hackcelerator

> Status as of **2026‑07‑16**, audited against the actual governing documents
> (AMD Rules & Conditions Google Doc; fintechfestival.sg). Details live in
> [HACKATHON-AMD.md](HACKATHON-AMD.md) and [HACKATHON-SFF.md](HACKATHON-SFF.md).

## ✅ Verified clean (both applications)
- **No secrets in the repo**: tracked files, all 31 commits of history, and current
  uncommitted diffs scanned — only placeholders. `.env` exists locally and is gitignored.
- **Code of conduct (AMD)**: no sexually explicit / violent / political / disparaging
  content in the app. Brand references (Robinhood, Netflix, Finnhub…) are factual
  links/embeds, not disparagement.
- **Prior-work rule (AMD)**: no "must build during event" rule exists — Vantage's history is fine.
- **Pre-revenue (SFF)**: "Bootstrapped/Pre-Seed" explicitly allowed — no revenue needed.

## ⚠️ Decisions only you can make (before submitting)
| # | Decision | Why it matters |
|---|---|---|
| 1 | **Accept AMD's IP terms?** *"All Entries become the property of AMD"* + irrevocable, royalty‑free licence incl. derivatives. Non‑exclusive, so you keep commercialising Vantage — but it's a real grant. | You have Stripe billing on this product and an SFF pitch on the same product. |
| 2 | **Publish the shared Finnhub key?** It's hardcoded at `React.jsx:3419` and goes public with the AMD PR. | Anyone can burn its quota; consider making the default key env‑injected or accepting the burn. |
| 3 | **SFF SEA claim**: can you honestly say "intending to enter Southeast Asia"? | It's an eligibility requirement, verbatim. |
| 4 | **SFF "open to external funding"** — true for you? | Also verbatim eligibility. |

## AMD (deadline **Aug 6, 8:59 AM PDT**) — team: **Team Vantage** · PR title: **`Track 2, Team Vantage, Vantage`**

### ✅ Done (built, verified, pushed)
- [x] **Multi‑turn memory** — last 6 exchanges kept locally (localStorage), threaded through all
      4 model paths, "forget conversation" privacy control, e2e‑verified on live llama3.1.
      3 of the 5 minimum capabilities solid (tools, memory, permission/privacy).
- [x] **One‑click local mode for BOTH serving stacks** — `?local=1` (Ollama) and `?local=vllm`
      (vLLM, the Radeon Cloud paved path: auto‑detects the served model from `/models`,
      `&base=`/`&model=` overrides). Both e2e‑verified (commit `44d7ca0`).
- [x] **Spec document** — `submission/AMD-SPEC.md`, sectioned to the rules, team info filled
      (Team Vantage · Ryan Wien solo). Only the Radeon [TODO] latency cells remain → then PDF.
- [x] **Poster** — `submission/poster.html`, team filled, render‑verified. Only [TODO] ms cells
      remain → then Chrome → print → PDF (A2 landscape, margins none, background graphics ON).
- [x] **Radeon setup script** — `scripts/radeon-setup.sh` (one‑shot: ROCm check → Ollama →
      llama3.1 → Node 20 → Vantage → `ollama ps` proof; vLLM alternative noted)
- [x] **README runbook** — "Run on AMD Radeon / ROCm", both one‑click URLs, CPU‑fallback check
- [x] **Discord question drafted** — ready to paste from the playbook (remote‑API vs
      "Radeon cloud model API" bonus contradiction)
- [x] **Demo video script** — 3–5 min, showcases memory follow‑up + forget‑conversation (playbook)

### 🔴 Remaining — every item needs you
- [ ] **Register on Luma** (needs AMD *approval* — open since Jul 10, don't leave it late)
- [ ] **Join the AMD AI Developer Program** (prize prerequisite)
- [ ] Have a valid **Discord ID** + **GitHub ID** (both mandatory)
- [ ] **Paste the Discord question** (playbook has it verbatim) — before relying on shared endpoints
- [ ] **Run inference on a Radeon Cloud GPU** — the core rule; all proof so far is NVIDIA.
      Launch instance → `bash scripts/radeon-setup.sh` → **`ollama ps` must read `100% GPU`**
- [ ] **Latency numbers from the Radeon box** (20 pts) — fill the [TODO] tables in spec + poster,
      export both to PDF
- [ ] **3–5 min video on the instance** (`ollama ps` 100% GPU + `rocm-smi` on camera; script in playbook)
- [ ] **Submit**: fork `AMD-DEV-CONTEST/Radeon-hackathon-2026-07`, PR titled
      **`Track 2, Team Vantage, Vantage`**, all in English

## 🔴 SFF — required and NOT yet done (deadline **Aug 14, 23:59 SGT**)
- [ ] **Register the team first** (max 10; one team per person; one proposal per team) at
      https://forms.gftn.co/gfh2026
- [ ] **Proposal PDF** — 1–5 pages, ≥11‑pt font, 1‑inch margins, against **Julius Baer's
      "Reimagining Private Banking"** (their keyword: *hyper‑personalised*)
- [ ] **Pitch deck** — solution, problem, market, business model, team
- [ ] **Video demo** — a **team member on camera presenting a live demo** (not a montage)
- [ ] **Direct file uploads only** — no Drive/Dropbox links; all English
- [ ] Team bios + target users + any early‑tester feedback (strengthens "market‑ready")

## 📜 Winner administration (from the full rules — matters AFTER you win)
- AMD notifies winners **within 7 days** of judging via the **email/phone given at entry** — use an
  address you actually watch; *"the authorized account holder of the e‑mail address used to enter"*
  settles any dispute over who won.
- You then have **10 days** to return an **Affidavit of Eligibility, Liability/Publicity Release,
  and W‑9** (US) or W‑8 BEN — miss it and they award a runner‑up.
- **Team prizes are split evenly** among members; you can't exchange the prize for cash or designate
  someone else; **taxes are on you** (payout is before withholding).
- Winners list appears in the **AMD Discord**; inquiries only honored within **14 days** of close.
- Registration has been **open since Jul 10** — there is no reason to wait.

## 📄 README (rule: "environment configuration, startup guide and dependency list")
✅ DONE (commit `e6fd5c7`): quick start, Node 20+, env config, **plus a step‑by‑step
"Run on AMD Radeon / ROCm" section** — serve via Ollama or vLLM (ROCm), open `?local=1`,
verify with `ollama ps` (must read 100% GPU) + `rocm-smi`, expected result, troubleshooting.

## Rule‑compliance verdict today
- **AMD**: *one requirement from compliant* — capabilities, artifacts, docs and demo script are
  ready; the sole unmet platform requirement is **inference executing on a Radeon Cloud GPU**
  (all proof so far is NVIDIA). Nothing breaks conduct rules. One instance session closes the
  gap (evidence + numbers + video can all come from it).
- **SFF**: compliant to apply **if** decisions #3 and #4 above are honestly "yes"; the entity
  question (must you be incorporated?) remains unanswered on their page — ask GFTN if the
  form forces a company name.
