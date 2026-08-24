// ============================================================
//  RichText — renders the block/span tree from richtext.js as React elements.
//
//  Every node is a real element, never an HTML string: model output is untrusted
//  text and can quote the user's own input back verbatim, so there is deliberately
//  no path from a model answer to innerHTML anywhere in this file.
//
//  The styling goal is restraint. An answer is prose that happens to have a list
//  in it, not a document — so headings are barely larger than body, lists use a
//  tight hanging indent, and the only real colour is on links and inline code.
//  Anything louder competes with the dashboard the answer is sitting inside.
// ============================================================

import React, { useMemo } from "react";
import { parseBlocks, hasMarkup } from "./richtext.js";
import { C, MONO, TYPE, R, SP } from "./theme.js";

function Spans({ spans }) {
  return spans.map((s, i) => {
    switch (s.t) {
      case "b": return <strong key={i} style={{ fontWeight: 600, color: C.textStrong }}>{s.v}</strong>;
      case "i": return <em key={i} style={{ fontStyle: "italic" }}>{s.v}</em>;
      case "code": return (
        <code key={i} style={{
          fontFamily: MONO, fontSize: "0.92em",
          background: C.inputBg, border: `1px solid ${C.edge}`,
          borderRadius: R.xs, padding: "1px 5px", color: C.accentSoft,
        }}>{s.v}</code>
      );
      case "link": return (
        <a key={i} href={s.href} target="_blank" rel="noopener noreferrer"
          style={{ color: C.accentText, textDecoration: "underline", textUnderlineOffset: 2, wordBreak: "break-word" }}>
          {s.v}
        </a>
      );
      default: return <React.Fragment key={i}>{s.v}</React.Fragment>;
    }
  });
}

// Lists carry their own marker so it can be coloured and aligned. A native
// list-style marker inherits the text colour and cannot be tinted, and its
// indent does not line up with the bubble's padding.
function List({ block }) {
  const ordered = block.type === "ol";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {block.items.map((spans, i) => (
        <div key={i} style={{ display: "flex", gap: 9, alignItems: "baseline" }}>
          <span aria-hidden="true" style={{
            flex: "0 0 auto", color: C.accentText,
            ...(ordered
              ? { ...TYPE.numSm, fontSize: 12, minWidth: 15, textAlign: "right" }
              : { fontSize: 15, lineHeight: 1.6 }),
          }}>
            {ordered ? `${block.start + i}.` : "•"}
          </span>
          <span style={{ minWidth: 0 }}><Spans spans={spans} /></span>
        </div>
      ))}
    </div>
  );
}

function Block({ block }) {
  switch (block.type) {
    case "h":
      return (
        <div style={{
          ...(block.level <= 2 ? TYPE.subhead : TYPE.label),
          fontWeight: 600, color: C.textStrong, fontSize: block.level <= 2 ? 17 : 16,
        }}>
          <Spans spans={block.spans} />
        </div>
      );
    case "ul":
    case "ol":
      return <List block={block} />;
    case "quote":
      return (
        <div style={{ borderLeft: `2px solid ${C.accentEdge}`, paddingLeft: 10, color: C.muted }}>
          <Spans spans={block.spans} />
        </div>
      );
    case "code":
      // Scrolls inside its own box. A long line must never widen the bubble,
      // which in this layout would widen the column it sits in.
      return (
        <pre style={{
          margin: 0, overflowX: "auto", background: C.inputBg,
          border: `1px solid ${C.edge}`, borderRadius: R.sm,
          padding: "9px 11px", ...TYPE.code, color: C.text,
        }}>
          <code>{block.text}</code>
        </pre>
      );
    case "hr":
      return <div style={{ height: 1, background: C.edge }} />;
    default:
      return <div><Spans spans={block.spans} /></div>;
  }
}

export default function RichText({ text }) {
  const blocks = useMemo(() => (hasMarkup(text) ? parseBlocks(text) : null), [text]);

  // Prose with no markers takes the cheap path: one text node, preserving the
  // newlines the model wrote. This is also the safety net — an answer that had
  // no formatting to begin with can never be altered by the parser.
  if (!blocks) return <span style={{ whiteSpace: "pre-wrap" }}>{text}</span>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP[2] }}>
      {blocks.map((b, i) => <Block key={i} block={b} />)}
    </div>
  );
}
