# Project Media — image gallery (15 images)

**Folder:** `C:\Users\Ryan\Desktop\vantage-submission\gallery-15\`
**Format:** PNG · all under 0.4 MB (cap is 5 MB) · upload in filename order 01 → 15.

Images 01–06, 09, 10, 13–15 are frames pulled from the demo take at 1920×1080.
Images 07, 08, 11, 12 are earlier full-window captures at 2529×1204 (browser
scrollbar cropped off). Both sets are the same UI generation, so the gallery reads
as one product.

> Note on the 3:2 hint: the form recommends 3:2 "for best results" but doesn't
> require it. These are shipped at their native aspect (16:9 and 2.1:1) rather
> than padded, because letterboxing every tile to force 1.5 looks like a mistake.
> If you want one true 3:2 image, `thumbnail.jpg` (6000×4000) in the parent folder
> already is one.

| # | File | Caption |
|---|------|---------|
| 01 | `01-ai-desk-catalog-answer.png` | The desk answers from a live DataHub catalog, narrated by a local Ollama model — 820 ms, source badge shown. |
| 02 | `02-command-adds-to-watchlist.png` | One command in the top bar adds NFLX; the ticker, chart and panels retarget instantly. |
| 03 | `03-data-lineage.png` | Multi-hop lineage in a second — all four upstreams of `fct_users_created`, straight from the catalog. |
| 04 | `04-honest-refusal-no-owner.png` | **The differentiator:** no owner is recorded, so the model is removed from the path entirely. Badge reads `DataHub (catalog)` — it cannot invent an answer. |
| 05 | `05-refusal-unknown-column.png` | The same rule one level finer: the desk refuses to invent a column that isn't in the schema, and shows the real schema instead. |
| 06 | `06-analyst-report-review.png` | Generated analyst reports open in a REVIEW & EDIT pass — title, body and every snapshot value are editable before export. |
| 07 | `07-export-office-formats.png` | Native export to Excel, Word and PowerPoint, plus a one-click analyst report. |
| 08 | `08-anchor-reads-answer-live.png` | The anchor reads answers on air — a local `llama3.2:1b` model explains AMD's move, with a stop control while it reads. |
| 09 | `09-stock-school-lesson.png` | Stock School teaches an 8-lesson course fully locally — no API keys, no credits. |
| 10 | `10-stock-school-quiz-correct.png` | Each lesson quizzes and scores you, with an explanation on every answer. |
| 11 | `11-fully-local-inference.png` | Fully-local mode: nothing leaves the device. Local model GPU-resident, on-device conversation memory, auto-fallback if a cloud model fails. |
| 12 | `12-colorblind-mode.png` | Accessibility built in — a color-blind-safe palette replaces the red/green market coding. |
| 13 | `13-anchor-nova.png` | Anchors are swappable — Nova on the desk. |
| 14 | `14-anchor-blaze.png` | …and Blaze. Each has its own voice and set. |
| 15 | `15-endcard-repo.png` | Apache-2.0 · 105 tests · runs local or cloud. |

## Ordering rationale

The gallery front-loads the argument: it works (01–03), it refuses to lie (04–05,
the beat judges should remember), it produces real documents (06–08), it teaches
and runs local (09–11), it's accessible and characterful (12–14), then the repo
card (15). If the form only surfaces the first few thumbnails, 01 and 04 carry
the pitch on their own.
