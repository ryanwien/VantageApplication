// ============================================================
//  richtext — a deliberately small Markdown subset for model output.
//
//  WHY THIS EXISTS
//  Language models answer in Markdown whether or not you ask them to: **bold**
//  for the number that matters, "- " lists for the three reasons, `backticks`
//  for a ticker or a field name. The chat thread rendered all of that as literal
//  characters, so the most information-dense answers were the ugliest ones — a
//  wall of asterisks. That is the single most visible "unfinished" tell an AI
//  surface can have.
//
//  WHY NOT A MARKDOWN LIBRARY
//  Every general parser ships an HTML pipeline, and the safe way to use one in
//  React is to not use its HTML at all. This returns a plain data structure that
//  the renderer turns into React elements, so there is no HTML string anywhere
//  and therefore no injection surface — a model answer is untrusted text, and it
//  can quote a user's own input verbatim.
//
//  WHAT IT DELIBERATELY DOES NOT DO
//  No nested emphasis, no tables, no reference links, no inline HTML. A small
//  parser that is right about the constructs models actually emit beats a large
//  one that is subtly wrong in the corners. Anything unrecognised falls through
//  as literal text, which is exactly the old behaviour — so the worst case of a
//  parse miss is what the thread did before.
// ============================================================

// Only http(s) survives. A model can emit `javascript:` in a link, and this is
// the one place where a string becomes a navigable target.
const SAFE_HREF = /^https?:\/\//i;

// One alternation, scanned left to right. Order is the precedence:
// code first so backticked text is never re-parsed, then explicit links, then
// strong before emphasis (otherwise `**x**` is read as two empty italics).
const INLINE = new RegExp(
  [
    "(`[^`\\n]+`)",                        // 1 code
    "(\\[[^\\]\\n]+\\]\\([^)\\s]+\\))",    // 2 [label](href)
    "(\\*\\*[^*\\n]+\\*\\*)",              // 3 **strong**
    "(__[^_\\n]+__)",                      // 4 __strong__
    "(\\*[^*\\n]+\\*)",                    // 5 *emphasis*
    "(?<![A-Za-z0-9])(_[^_\\n]+_)(?![A-Za-z0-9])", // 6 _emphasis_ (not snake_case)
    "(https?://[^\\s<>()\\[\\]]+)",        // 7 bare url
  ].join("|"),
  "g",
);

/** Split one line into styled spans. Always returns at least one span. */
export function parseInline(line) {
  const spans = [];
  let last = 0;
  let m;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(line))) {
    if (m.index > last) spans.push({ t: "text", v: line.slice(last, m.index) });
    const [raw] = m;
    if (m[1]) spans.push({ t: "code", v: raw.slice(1, -1) });
    else if (m[2]) {
      const cut = raw.indexOf("](");
      const label = raw.slice(1, cut);
      const href = raw.slice(cut + 2, -1);
      // An unsafe href keeps its text but loses its link — dropping the label
      // entirely would silently delete words the model wrote.
      spans.push(SAFE_HREF.test(href) ? { t: "link", v: label, href } : { t: "text", v: label });
    } else if (m[3]) spans.push({ t: "b", v: raw.slice(2, -2) });
    else if (m[4]) spans.push({ t: "b", v: raw.slice(2, -2) });
    else if (m[5]) spans.push({ t: "i", v: raw.slice(1, -1) });
    else if (m[6]) spans.push({ t: "i", v: raw.slice(1, -1) });
    else if (m[7]) spans.push({ t: "link", v: raw, href: raw });
    last = m.index + raw.length;
  }
  if (last < line.length) spans.push({ t: "text", v: line.slice(last) });
  return spans.length ? spans : [{ t: "text", v: line }];
}

const H = /^(#{1,6})\s+(.*)$/;
const UL = /^\s*[-*•]\s+(.*)$/;
const OL = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const FENCE = /^\s*```(\w+)?\s*$/;

/**
 * Turn model text into an array of blocks.
 *
 * @param {string} src
 * @returns {Array<object>} blocks — one of:
 *   {type:"p", spans}                    {type:"h", level, spans}
 *   {type:"ul", items:[spans]}           {type:"ol", start, items:[spans]}
 *   {type:"quote", spans}                {type:"code", lang, text}
 *   {type:"hr"}
 */
export function parseBlocks(src) {
  const text = typeof src === "string" ? src : "";
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let para = [];      // buffered paragraph lines
  let list = null;    // the open ul/ol block, if any

  const flushPara = () => {
    if (!para.length) return;
    // Soft-wrapped lines inside one paragraph rejoin with a space; a hard break
    // would double the leading of every wrapped model answer.
    blocks.push({ type: "p", spans: parseInline(para.join(" ")) });
    para = [];
  };
  const flushList = () => { if (list) { blocks.push(list); list = null; } };
  const flushAll = () => { flushPara(); flushList(); };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // fenced code — consumed verbatim until the closing fence or end of input
    const fence = FENCE.exec(line);
    if (fence) {
      flushAll();
      const lang = fence[1] || "";
      const body = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) body.push(lines[i++]);
      blocks.push({ type: "code", lang, text: body.join("\n") });
      continue;
    }

    if (!line.trim()) { flushAll(); continue; }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { flushAll(); blocks.push({ type: "hr" }); continue; }

    const h = H.exec(line);
    if (h) { flushAll(); blocks.push({ type: "h", level: h[1].length, spans: parseInline(h[2]) }); continue; }

    const q = QUOTE.exec(line);
    if (q) { flushAll(); blocks.push({ type: "quote", spans: parseInline(q[1]) }); continue; }

    const ol = OL.exec(line);
    if (ol) {
      flushPara();
      if (!list || list.type !== "ol") { flushList(); list = { type: "ol", start: +ol[1], items: [] }; }
      list.items.push(parseInline(ol[2]));
      continue;
    }

    const ul = UL.exec(line);
    if (ul) {
      flushPara();
      if (!list || list.type !== "ul") { flushList(); list = { type: "ul", items: [] }; }
      list.items.push(parseInline(ul[1]));
      continue;
    }

    // A plain line while a list is open ends the list rather than joining it —
    // models put their closing sentence right under the last bullet.
    flushList();
    para.push(line);
  }
  flushAll();
  return blocks;
}

/**
 * Is it worth running the renderer at all? Plain prose with no markers should
 * take the cheap path — one text node, no element tree, and no chance of a
 * parse quirk touching an answer that had no formatting to begin with.
 */
export function hasMarkup(src) {
  return typeof src === "string" && /(^|\n)\s*(#{1,6}\s|[-*•]\s|\d{1,3}[.)]\s|>\s|```)|\*\*|__|`[^`\n]+`|\[[^\]\n]+\]\(|https?:\/\//.test(src);
}
