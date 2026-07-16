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

## 🔴 AMD — required and NOT yet done (deadline **Aug 6, 8:59 AM PDT**)
- [ ] **Register on Luma** (needs AMD *approval* — don't leave it late)
- [ ] **Join the AMD AI Developer Program** (prize prerequisite)
- [ ] Have a valid **Discord ID** + **GitHub ID** (both mandatory)
- [ ] **Run Vantage's inference on a Radeon Cloud GPU** — the core rule; NVIDIA proof doesn't count.
      vLLM is the paved path; ask on Discord whether the shared "Radeon cloud model API"
      counts as core inference (rules conflict — see playbook)
- [x] **Multi‑turn memory** — ✅ DONE (commit `e6fd5c7`): last 6 exchanges kept locally
      (localStorage), threaded through all 4 model paths, "forget conversation" privacy control,
      e2e‑verified on live llama3.1 (codeword recalled across turns, persists across reload).
      Now 3 of the 5 minimum capabilities are solid (tools, memory, permission/privacy).
- [x] **Spec document** — ✅ drafted (`submission/AMD-SPEC.md`, sectioned to the rules; fill in
      team info + Radeon [TODO] numbers, then export to PDF)
- [x] **Poster** — ✅ drafted (`submission/poster.html`; fill [TEAM NAME], Chrome → print → PDF,
      A2 landscape, background graphics ON)
- [x] **Radeon setup script** — ✅ `scripts/radeon-setup.sh` (one-shot on the instance)
- [ ] **Inference‑speed numbers from the Radeon box** (20 pts) — run the spec doc's query set,
      fill the [TODO] tables in spec + poster
- [ ] **3–5 min video showing execution on the Radeon GPU** (`ollama ps` 100% GPU + `rocm-smi` on camera)
- [ ] **Submit**: fork `AMD-DEV-CONTEST/Radeon-hackathon-2026-07`, PR titled
      **`Track 2, <Team name>, Vantage`**, all in English

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
- **AMD**: *not yet compliant* — nothing you're doing breaks a rule, but the two platform
  requirements (Radeon Cloud + ROCm execution; ≥2 capabilities *robustly*) aren't met yet.
  Submitting today would fail requirements, not conduct.
- **SFF**: compliant to apply **if** decisions #3 and #4 above are honestly "yes"; the entity
  question (must you be incorporated?) remains unanswered on their page — ask GFTN if the
  form forces a company name.
