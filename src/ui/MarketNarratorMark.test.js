import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The mark is drawn in more than one place: as SVG in MarketNarratorMark.jsx for
// the DOM, again with canvas calls in React.jsx (drawMarketNarratorMark) for the
// exported badge and the in-scene station ident, and again as static markup in
// public/favicon.svg, because neither canvas nor a favicon can render React. A
// comment asks whoever edits one to edit the others, which is exactly the kind of
// instruction that gets missed — and the failure is silent, because nothing
// renders them all at once.
//
// This is not hypothetical. The V→N change updated the component and its canvas
// twin, which these tests covered, and left the favicon a V — so the app said one
// thing and the browser tab said another, and no test noticed. The favicon is now
// pinned here too. (Two copies still live in video/vantage-explainer/index.html,
// which is a standalone composition rather than app source; they are updated by
// hand and deliberately not asserted from here.)
const svg = readFileSync(new URL("./MarketNarratorMark.jsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../../React.jsx", import.meta.url), "utf8");
const favicon = readFileSync(new URL("../../public/favicon.svg", import.meta.url), "utf8");
// Bounded to the function body — React.jsx is ten thousand lines of other
// coordinates and colours, and an unbounded slice silently matches all of them.
const canvasStart = app.indexOf("function drawMarketNarratorMark");
const canvas = app.slice(canvasStart, app.indexOf("\n}", canvasStart));

const num = (src, re, name) => {
  const m = src.match(re);
  if (!m) throw new Error(`MarketNarratorMark drift check: could not read ${name} — the shape of the source changed, so update this test alongside it.`);
  return m.slice(1).map(Number);
};

// M x1 y1 L x2 y2 L x3 y3 L x4 y4 — four points, three segments.
const PATH_RE = /d="M(\d+) (\d+) L(\d+) (\d+) L(\d+) (\d+) L(\d+) (\d+)"/;

describe("MarketNarratorMark: the SVG and its canvas twin", () => {
  it("share the same tile — position, size and corner radius", () => {
    // SVG rx is radius - 0.75 (the rect is inset by half the 1.5 stroke); the
    // component's default radius is 8, so the canvas literal should be 7.25.
    const [x, y, w, h] = num(svg, /<rect\s+x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/, "svg rect");
    const [radius] = num(svg, /radius = (\d+(?:\.\d+)?)/, "default radius");
    const [cx, cy, cw, ch, crx] = num(canvas, /roundRect\(([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\)/, "canvas roundRect");
    expect([cx, cy, cw, ch]).toEqual([x, y, w, h]);
    expect(crx).toBe(radius - 0.75);
  });

  it("share the same N — every point and both stroke widths", () => {
    const [x1, y1, x2, y2, x3, y3, x4, y4] = num(svg, PATH_RE, "svg path");
    const [mx, my] = num(canvas, /moveTo\((\d+), (\d+)\)/, "canvas moveTo");
    const lineTos = [...canvas.matchAll(/lineTo\((\d+), (\d+)\)/g)].map(m => [Number(m[1]), Number(m[2])]);
    expect([mx, my]).toEqual([x1, y1]);
    expect(lineTos).toEqual([[x2, y2], [x3, y3], [x4, y4]]);

    const [tileStroke] = num(svg, /strokeWidth="([\d.]+)"\s*\/>/, "svg tile stroke");
    const [glyphStroke] = num(svg, /stroke=\{ink\} strokeWidth="([\d.]+)"/, "svg glyph stroke");
    const widths = [...canvas.matchAll(/lineWidth = ([\d.]+)/g)].map(m => Number(m[1]));
    expect(widths).toEqual([tileStroke, glyphStroke]);
  });

  it("is a letter N and not a scribble", () => {
    // These four properties are what make the shape read as an N rather than a
    // zigzag. They are the mark's meaning, so assert them rather than assume.
    const [x1, y1, x2, y2, x3, y3, x4, y4] = num(svg, PATH_RE, "svg path");
    expect(x1).toBe(x2);          // left stem is vertical
    expect(x3).toBe(x4);          // right stem is vertical
    expect(y1).toBe(y3);          // both stems stand on the same baseline
    expect(y2).toBe(y4);          // both stems reach the same height
    expect(x1).toBeLessThan(x3);  // left stem is on the left
    expect(y2).toBeLessThan(y1);  // and the stroke opens upward (SVG y grows down)
  });

  it("share the same on-air dot, capping the stroke's final point", () => {
    const [cx, cy, r] = num(svg, /<circle cx="(\d+)" cy="(\d+)" r="([\d.]+)"/, "svg circle");
    const [ax, ay, ar] = num(canvas, /arc\((\d+), (\d+), ([\d.]+),/, "canvas arc");
    expect([ax, ay, ar]).toEqual([cx, cy, r]);

    // The dot caps the terminus; if the glyph moves and the dot does not, it
    // drifts off the stroke and reads as a stray speck.
    const p = num(svg, PATH_RE, "svg path");
    expect([cx, cy]).toEqual([p[6], p[7]]);
  });

  it("ends at the high — the dot sits at the top of the stroke, not the bottom", () => {
    // The V this replaced was a recovery: it meant something that it finished
    // upward. The N keeps that promise by ending on the raised stem, and a
    // future edit that flips the path would quietly invert what the logo says.
    const [, y1, , y2, , y3, , y4] = num(svg, PATH_RE, "svg path");
    const ys = [y1, y2, y3, y4];
    expect(y4).toBe(Math.min(...ys));
  });

  it("share the same glyph with the browser tab's favicon", () => {
    // The favicon is the one copy a developer never looks at while working, and
    // the one every user looks at all day.
    const p = num(svg, PATH_RE, "svg path");
    expect(num(favicon, PATH_RE, "favicon path")).toEqual(p);

    const [cx, cy, r] = num(svg, /<circle cx="(\d+)" cy="(\d+)" r="([\d.]+)"/, "svg circle");
    const [fx, fy, fr] = num(favicon, /<circle cx="(\d+)" cy="(\d+)" r="([\d.]+)"/, "favicon circle");
    expect([fx, fy, fr]).toEqual([cx, cy, r]);

    const [glyphStroke] = num(svg, /stroke=\{ink\} strokeWidth="([\d.]+)"/, "svg glyph stroke");
    const [favStroke] = num(favicon, /<path[^>]*stroke-width="([\d.]+)"/, "favicon glyph stroke");
    expect(favStroke).toBe(glyphStroke);
  });

  it("share the same four colours", () => {
    const palette = (src, re) => [...src.matchAll(re)].map(m => m[1].toLowerCase());
    const fromSvg = palette(svg, /const (?:TILE|EDGE|INK|DOT) = "(#[0-9a-fA-F]{6})"/g);
    const fromCanvas = palette(canvas, /= "(#[0-9a-fA-F]{6})"/g);
    expect(fromSvg).toHaveLength(4);
    expect(new Set(fromCanvas)).toEqual(new Set(fromSvg));
  });

  it("keeps the lime reserved for the dot alone", () => {
    // theme.js rules that acid lime marks actions and active indicators. The dot
    // is a deliberate, documented exception (an on-air light IS an active
    // indicator) — but it stays the only lime in the mark.
    const [dot] = svg.match(/const DOT = "(#[0-9a-fA-F]{6})"/).slice(1);
    const limes = [...svg.matchAll(new RegExp(dot, "gi"))];
    expect(limes).toHaveLength(1);
  });
});
