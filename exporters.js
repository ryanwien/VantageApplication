// ============================================================
// VANTAGE — downloadable report generators (Excel / Word / PowerPoint)
// Heavy libs are loaded lazily (dynamic import) INSIDE each function so they
// never touch the initial app bundle — the dashboard renders even if a lib
// has a dev-mode interop hiccup, and export is only paid for when used.
// report = {
//   generatedAt, live, logo, chartImage, writtenReport,
//   selected:{sym,name,price,chg,chgPct,open,high,low,prevClose},
//   watchlist:[{sym,price,chg,chgPct}], analysis:[{model,text}], question, news:[{title,source,url}]
// }
// ============================================================
const num = (n) => (n == null || isNaN(n) ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pct = (n) => (n == null || isNaN(n) ? "—" : `${n >= 0 ? "+" : ""}${Number(n).toFixed(2)}%`);
const fileName = (r, ext) => `Vantage-${r.selected?.sym || "report"}-${ext}`;

function dataUrlToUint8(dataUrl) {
  const bin = atob(String(dataUrl).split(",")[1] || "");
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ---------- Excel ----------
export async function exportExcel(r) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const sel = r.selected || {};
  const summary = [
    [r.title || "Vantage Market Report"],
    ["Generated", r.generatedAt],
    ["Data source", r.live ? "Live quotes (Finnhub)" : "Simulated demo data"],
    [],
    ["Symbol", sel.sym || ""], ["Name", sel.name || ""],
    ["Price", sel.price ?? ""], ["Change", sel.chg ?? ""], ["Change %", sel.chgPct ?? ""],
    ["Open", sel.open ?? ""], ["High", sel.high ?? ""], ["Low", sel.low ?? ""], ["Prev Close", sel.prevClose ?? ""],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");

  const wl = [["Symbol", "Price", "Change", "Change %"], ...r.watchlist.map(w => [w.sym, w.price, w.chg, w.chgPct])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wl), "Watchlist");

  if (r.analysis?.length) {
    const ws = XLSX.utils.aoa_to_sheet([["Analyst", "Response"], ...r.analysis.map(a => [a.model, a.text])]);
    ws["!cols"] = [{ wch: 14 }, { wch: 100 }];
    XLSX.utils.book_append_sheet(wb, ws, "AI Analysis");
  }
  if (r.news?.length) {
    const ws = XLSX.utils.aoa_to_sheet([["Headline", "Source", "URL"], ...r.news.map(n => [n.title, n.source, n.url])]);
    ws["!cols"] = [{ wch: 60 }, { wch: 18 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, ws, "News");
  }
  if (r.writtenReport) {
    const ws = XLSX.utils.aoa_to_sheet([["Analyst Report"], [], ...r.writtenReport.split("\n").map(l => [l])]);
    ws["!cols"] = [{ wch: 110 }];
    XLSX.utils.book_append_sheet(wb, ws, "Report");
  }
  XLSX.writeFile(wb, fileName(r, "report.xlsx"));
}

// ---------- Word ----------
export async function exportWord(r) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ImageRun } = await import("docx");
  const sel = r.selected || {};
  const cell = (t, bold) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(t ?? ""), bold: !!bold })] })] });
  const wlRows = [
    new TableRow({ children: ["Symbol", "Price", "Change", "Change %"].map(h => cell(h, true)) }),
    ...r.watchlist.map(w => new TableRow({ children: [cell(w.sym), cell(num(w.price)), cell(num(w.chg)), cell(pct(w.chgPct))] })),
  ];

  const children = [
    new Paragraph({ text: r.title || `Vantage Market Report — ${sel.sym || ""}`, heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: `Generated ${r.generatedAt} · ${r.live ? "Live quotes (Finnhub)" : "Simulated demo data"}`, italics: true, color: "7E879B" })] }),
    new Paragraph({ text: "Snapshot", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ children: [new TextRun({ text: `${sel.name || sel.sym || ""}: `, bold: true }), new TextRun(`${num(sel.price)}  (${pct(sel.chgPct)})`)] }),
    new Paragraph(`Open ${num(sel.open)}   ·   High ${num(sel.high)}   ·   Low ${num(sel.low)}   ·   Prev Close ${num(sel.prevClose)}`),
  ];
  if (r.logo) children.unshift(new Paragraph({ children: [new ImageRun({ type: "png", data: dataUrlToUint8(r.logo), transformation: { width: 180, height: 48 } })] }));
  if (r.chartImage) children.push(new Paragraph({ children: [new ImageRun({ type: "png", data: dataUrlToUint8(r.chartImage), transformation: { width: 600, height: 240 } })] }));
  if (r.writtenReport) {
    children.push(new Paragraph({ text: "Analyst Report", heading: HeadingLevel.HEADING_1 }));
    for (const para of r.writtenReport.split(/\n{2,}/)) children.push(new Paragraph(para.trim()));
  }
  children.push(new Paragraph({ text: "Watchlist", heading: HeadingLevel.HEADING_1 }));
  children.push(new Table({ rows: wlRows, width: { size: 100, type: WidthType.PERCENTAGE } }));

  if (r.analysis?.length) {
    children.push(new Paragraph({ text: "AI Desk Analysis", heading: HeadingLevel.HEADING_1 }));
    if (r.question) children.push(new Paragraph({ children: [new TextRun({ text: `Q: ${r.question}`, italics: true })] }));
    for (const a of r.analysis) {
      children.push(new Paragraph({ children: [new TextRun({ text: a.model, bold: true })] }));
      children.push(new Paragraph(a.text));
    }
  }
  if (r.news?.length) {
    children.push(new Paragraph({ text: "News", heading: HeadingLevel.HEADING_1 }));
    for (const n of r.news) children.push(new Paragraph({ text: `${n.title} — ${n.source}`, bullet: { level: 0 } }));
  }
  children.push(new Paragraph({ children: [new TextRun({ text: "Generated by Vantage. Not financial advice.", italics: true, color: "7E879B" })] }));

  const doc = new Document({ sections: [{ children }] });
  downloadBlob(await Packer.toBlob(doc), fileName(r, "report.docx"));
}

// ---------- PowerPoint ----------
export async function exportPowerPoint(r) {
  const pptxgen = (await import("pptxgenjs")).default;
  const sel = r.selected || {};
  const BG = "0B0E14", AMBER = "FFB300", TEXT = "E8EBF2", MUTED = "7E879B", EDGE = "1D2433";
  const pptx = new pptxgen();
  pptx.author = "Vantage"; pptx.title = `${sel.sym || "Market"} Brief`;
  const slide = () => {
    const s = pptx.addSlide();
    s.background = { color: BG };
    s.addText("Vantage · Market Intelligence", { x: 0.4, y: 5.18, w: 9.2, h: 0.3, fontSize: 9, color: MUTED });
    return s;
  };
  const heading = (s, t) => s.addText(t, { x: 0.5, y: 0.3, w: 9, h: 0.7, fontSize: 26, bold: true, color: AMBER });

  let s = slide();
  if (r.logo) s.addImage({ data: r.logo, x: 3.5, y: 0.45, w: 3.0, h: 0.8 });
  s.addText(r.title || `${sel.sym || "Vantage"} — Market Brief`, { x: 0.5, y: 1.7, w: 9, h: 1, fontSize: 40, bold: true, color: AMBER, align: "center" });
  s.addText(`${sel.name || ""}\n${num(sel.price)}   (${pct(sel.chgPct)})`, { x: 0.5, y: 2.9, w: 9, h: 1, fontSize: 22, color: TEXT, align: "center" });
  s.addText(`${r.generatedAt}  ·  ${r.live ? "Live quotes" : "Simulated demo"}`, { x: 0.5, y: 4.6, w: 9, h: 0.4, fontSize: 11, color: MUTED, align: "center" });

  if (r.chartImage) { s = slide(); heading(s, `${sel.sym || ""} — Session Chart`); s.addImage({ data: r.chartImage, x: 0.5, y: 1.1, w: 9, h: 4.0 }); }
  if (r.writtenReport) { s = slide(); heading(s, "Analyst Report"); s.addText(r.writtenReport, { x: 0.5, y: 1.1, w: 9, h: 4.0, fontSize: 12, color: TEXT, valign: "top", autoFit: true }); }

  s = slide(); heading(s, "Watchlist");
  const head = ["Symbol", "Price", "Change %"].map(t => ({ text: t, options: { bold: true, color: BG, fill: { color: AMBER } } }));
  const body = r.watchlist.map(w => [w.sym, num(w.price), pct(w.chgPct)].map((t, i) => ({ text: String(t), options: { color: i === 2 ? (w.chgPct >= 0 ? "2FD37A" : "F6465D") : TEXT } })));
  s.addTable([head, ...body], { x: 0.5, y: 1.2, w: 9, fontSize: 14, border: { type: "solid", color: EDGE, pt: 1 }, fill: { color: "121722" } });

  if (r.analysis?.length) {
    s = slide(); heading(s, "AI Desk Analysis");
    if (r.question) s.addText(`Q: ${r.question}`, { x: 0.5, y: 1.0, w: 9, h: 0.5, fontSize: 13, italic: true, color: MUTED });
    s.addText(r.analysis.map(a => `${a.model}:  ${a.text}`).join("\n\n"), { x: 0.5, y: 1.5, w: 9, h: 3.4, fontSize: 13, color: TEXT, valign: "top" });
  }
  if (r.news?.length) {
    s = slide(); heading(s, "News");
    s.addText(r.news.map(n => ({ text: `${n.title}  (${n.source})`, options: { bullet: true, color: TEXT } })), { x: 0.5, y: 1.2, w: 9, h: 4, fontSize: 15, valign: "top" });
  }
  await pptx.writeFile({ fileName: fileName(r, "brief.pptx") });
}
