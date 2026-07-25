# Generated analyst report — NFLX

Produced by the command **"write a report and export ppt"**. The desk drafts the document
from the live snapshot, then opens a **REVIEW & EDIT** pass before anything is exported —
title, body and every numeric value are editable, so the human approves the document rather
than receiving it blind.

> **Transcription note.** This is quoted verbatim from the recorded demo run. The review
> modal opens the instant generation finishes and covers the panel underneath, so the middle
> of the *Key Drivers* section and the whole of *Risks* are physically occluded in every
> frame. Those gaps are marked `[…]` below. **Nothing has been filled in or paraphrased** —
> writing plausible text into the gaps would be the exact failure this project exists to
> prevent.

---

## Document title

```
NFLX Market Report
```

## Report body

```markdown
**Overview**

We're reviewing Netflix (NFLX), a leading provider of streaming services,
using simulated demo data from Finnhub.

**Recent Price Action**

Netflix's stock price has been relatively stable, closing at $68.91 with a
0.55% increase from the previous day's close. The price range for the day
was between $67.67 and $69.36.

**Key Drivers**

The main drivers of Netflix's stock performance are likely its subscriber
[…] With a large and dive[rse …] competitive positioning in the streaming
market. […] established itself as a leader in the industry.

**Risks**

[…]
```

Note that the report opens by naming its own data source — *"using simulated demo data from
Finnhub"* — rather than presenting demo figures as live market data.

## Snapshot carried into the document

Every field is editable in the review pass before export.

| Field | Value |
|---|---|
| Price | 68.91 |
| Change | 0.38 |
| Change % | 0.55 |
| Open | 68.78 |
| High | 69.37 |
| Low | 67.67 |
| Prev Close | 68.53 |

## Watchlist table carried into the document

Rows can be edited, added or removed before export.

| Symbol | Price | Change | Change % |
|---|---|---|---|
| AAPL | 320.77 | -5.12 | -1.57 |
| MSFT | 380.99 | -9.35 | -2.4 |

---

## From this object to a file

The same report object feeds all three exporters in [`exporters.js`](../exporters.js):

| Format | Function | Line |
|---|---|---|
| Excel `.xlsx` | `exportExcel` | [56](../exporters.js#L56) |
| Word `.docx` | `exportWord` | [93](../exporters.js#L93) |
| PowerPoint `.pptx` | `exportPowerPoint` | [140](../exporters.js#L140) |

`reportBlocks` ([line 18](../exporters.js#L18)) parses the markdown above into paragraphs and
bullets, and `boldRuns` ([line 35](../exporters.js#L35)) turns `**bold**` spans into real
rich-text runs — so the emphasis survives into Word and PowerPoint rather than arriving as
literal asterisks.

The binaries themselves are not committed here: they can't be read in the GitHub file viewer,
which defeats the purpose of this folder. To produce them, run `npm run dev` and use
**Export ▾** on the desk.
