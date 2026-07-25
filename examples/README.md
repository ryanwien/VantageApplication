# Examples — artifacts Vantage produces

Everything here is **readable in the GitHub file viewer**. Nothing needs to be run,
downloaded, cloned, or opened in Office to judge it.

## The artifacts

| Artifact | How it was produced | What it shows |
|---|---|---|
| [`generated-pipeline.md`](generated-pipeline.md) | **Generated now, by the shipping code.** `node examples/generate.mjs` | Per question: the intent, the request payload, the fact block, and the decision to use a model or not |
| [`datahub-catalog-transcript.md`](datahub-catalog-transcript.md) | Runtime output, transcribed from the demo run | The four answers as they appeared on the desk, with source badges and latencies |
| [`analyst-report-NFLX.md`](analyst-report-NFLX.md) | Runtime output, transcribed from the demo run | A generated analyst report and the snapshot carried into it |

`generated-pipeline.md` is the one to read first if you only read one. It is **deterministic
and reproducible** — the functions it calls are pure, so running the generator yourself
produces the same bytes. It also independently corroborates the transcript: the fact blocks it
computes match, character for character, what the demo screenshots show on screen.

## Reference — source, not artifacts

These two are code. They are here because the artifacts above are meaningless without them,
but they are **not** examples of generated output and shouldn't be judged as such:

| File | What it is |
|---|---|
| [`graphql-operations.md`](graphql-operations.md) | The three whitelisted read-only queries, quoted from source — the complete reachable surface of the integration |
| [`generate.mjs`](generate.mjs) | The generator behind `generated-pipeline.md` — ~120 lines, no network |

## Provenance — read this before judging

**`generated-pipeline.md` is genuinely generated**, by importing the exported functions from
[`src/datahub/catalog.js`](../src/datahub/catalog.js) — the same code the running app calls.
The DataHub *responses* it consumes are fixtures reproducing the demo catalog state, because
DataHub isn't running in this repo; the *transformations* applied to them are not simulated.

**The transcript and the report are transcribed verbatim** from the recorded demo run against
**DataHub v1.6.0** with `llama3.1:latest` via Ollama. They are quoted exactly as they appeared,
not re-generated and not paraphrased, and the frames they came from ship with the submission
gallery — so every line is checkable against a picture.

Where a screen capture physically occludes text, it is marked `[…]` rather than filled in. See
the note in the report file. Writing plausible text into those gaps would be precisely the
failure this project exists to prevent.

## What is NOT here, and why

Vantage also exports **Excel (.xlsx), Word (.docx) and PowerPoint (.pptx)**. Those are
deliberately not committed: they are binary, so a judge would have to download them and open
Office — the opposite of what this folder is for. The export code is short and readable
instead — [`exporters.js`](../exporters.js): `exportExcel` ([56](../exporters.js#L56)),
`exportWord` ([93](../exporters.js#L93)), `exportPowerPoint` ([140](../exporters.js#L140)).
To produce the real files, run `npm run dev` and use **Export ▾** on the desk.

## Reproducing any of it yourself

```bash
npm install
node examples/generate.mjs          # regenerates generated-pipeline.md — no network needed
npm test                            # 105 tests, incl. the honesty checks
```

For the live catalog behaviour, `README.md` → *DataHub catalog context*, then:

```bash
node scripts/datahub/ingest-bare.cjs
```

That seeds the bare `orders_v2` dataset — a dataset with a description but **no owners and no
schema registered** — which is what makes the honest refusal observable rather than asserted.
