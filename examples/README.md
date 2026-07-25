# Examples — artifacts Vantage produces

Everything here is **readable in the GitHub file viewer**. Nothing needs to be run,
downloaded, or opened in Office to judge it.

| Artifact | File | What it demonstrates |
|---|---|---|
| Catalog answers & refusals | [`datahub-catalog-transcript.md`](datahub-catalog-transcript.md) | The agent selects a tool, queries a live metadata catalog, and states absent facts as absent instead of inventing them |
| Generated analyst report | [`analyst-report-NFLX.md`](analyst-report-NFLX.md) | Document generation, and the editable review pass before export |
| Whitelisted GraphQL queries | [`graphql-operations.md`](graphql-operations.md) | The exact read-only query text the server will send — the entire reachable surface |

## Provenance — read this before judging

The transcript and the report are **transcribed verbatim from the recorded demo run**
against **DataHub v1.6.0** with a local `llama3.1` via Ollama. They are not synthesized,
and they are not re-generated fresh — the demo environment (a running DataHub instance plus
a local model) isn't up in this repo. Every line is quoted exactly as it appeared on screen,
and the frames it came from ship with the submission gallery, so each claim is checkable
against a picture.

Where a capture physically occludes text, that is marked `[…]` rather than filled in. See the
note in the report file — this is the same honesty rule the product itself enforces.

## What is NOT in this folder, and why

Vantage also exports **Excel (.xlsx), Word (.docx) and PowerPoint (.pptx)**. Those are
deliberately not committed here: they are binary, so a judge cannot evaluate them in the
GitHub file viewer without downloading them and opening Office — the opposite of what this
folder is for. The export code is small and readable instead:

- [`exporters.js`](../exporters.js) — `exportExcel` (line 56), `exportWord` (line 93), `exportPowerPoint` (line 140)

Each takes the same report object shown in [`analyst-report-NFLX.md`](analyst-report-NFLX.md)
and renders it into the corresponding format. Producing the real binaries requires the app —
`npm run dev`, then **Export ▾** on the desk.

## Reproducing the catalog artifacts yourself

The catalog behaviour is the part worth checking, and it is reproducible in a few minutes
without any cloud key. `README.md` → *DataHub catalog context*, then:

```bash
node scripts/datahub/ingest-bare.cjs
```

That seeds the bare `orders_v2` dataset used in the refusal case below — a dataset with a
description but **no owners and no schema registered** — which is what makes the honest
refusal observable rather than merely asserted.
