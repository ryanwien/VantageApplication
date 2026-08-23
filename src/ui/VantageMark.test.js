import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The mark is drawn twice: as SVG in VantageMark.jsx for the DOM, and again with
// canvas calls in React.jsx (drawVantageMark) for the exported badge and the
// in-scene station ident, because canvas cannot render React. A comment asks
// whoever edits one to edit the other, which is exactly the kind of instruction
// that gets missed — and the failure is silent, because nothing renders both at
// once. Nudge the SVG's dot two pixels and the exported logo keeps the old one
// forever. This pins them together instead.
const svg = readFileSync(new URL("./VantageMark.jsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../../React.jsx", import.meta.url), "utf8");
// Bounded to the function body — React.jsx is ten thousand lines of other
// coordinates and colours, and an unbounded slice silently matches all of them.
const canvasStart = app.indexOf("function drawVantageMark");
const canvas = app.slice(canvasStart, app.indexOf("\n}", canvasStart));

const num = (src, re, name) => {
  const m = src.match(re);
  if (!m) throw new Error(`VantageMark drift check: could not read ${name} — the shape of the source changed, so update this test alongside it.`);
  return m.slice(1).map(Number);
};

describe("VantageMark: the SVG and its canvas twin", () => {
  it("share the same tile — position, size and corner radius", () => {
    // SVG rx is radius - 0.75 (the rect is inset by half the 1.5 stroke); the
    // component's default radius is 8, so the canvas literal should be 7.25.
    const [x, y, w, h] = num(svg, /<rect\s+x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/, "svg rect");
    const [radius] = num(svg, /radius = (\d+(?:\.\d+)?)/, "default radius");
    const [cx, cy, cw, ch, crx] = num(canvas, /roundRect\(([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\)/, "canvas roundRect");
    expect([cx, cy, cw, ch]).toEqual([x, y, w, h]);
    expect(crx).toBe(radius - 0.75);
  });

  it("share the same V — both arms and both stroke widths", () => {
    const [x1, y1, x2, y2, x3, y3] = num(svg, /d="M(\d+) (\d+) L(\d+) (\d+) L(\d+) (\d+)"/, "svg path");
    const [mx, my] = num(canvas, /moveTo\((\d+), (\d+)\)/, "canvas moveTo");
    const lineTos = [...canvas.matchAll(/lineTo\((\d+), (\d+)\)/g)].map(m => [Number(m[1]), Number(m[2])]);
    expect([mx, my]).toEqual([x1, y1]);
    expect(lineTos).toEqual([[x2, y2], [x3, y3]]);

    // A symmetric V, not a checkmark: the arms must be mirror images. This is the
    // one property the mark's meaning rests on, so assert it rather than assume it.
    expect(x2 - x1).toBe(x3 - x2);
    expect(y1).toBe(y3);

    const [tileStroke] = num(svg, /strokeWidth="([\d.]+)"\s*\/>/, "svg tile stroke");
    const [vStroke] = num(svg, /stroke=\{ink\} strokeWidth="([\d.]+)"/, "svg V stroke");
    const widths = [...canvas.matchAll(/lineWidth = ([\d.]+)/g)].map(m => Number(m[1]));
    expect(widths).toEqual([tileStroke, vStroke]);
  });

  it("share the same on-air dot, sitting on the V's right arm", () => {
    const [cx, cy, r] = num(svg, /<circle cx="(\d+)" cy="(\d+)" r="([\d.]+)"/, "svg circle");
    const [ax, ay, ar] = num(canvas, /arc\((\d+), (\d+), ([\d.]+),/, "canvas arc");
    expect([ax, ay, ar]).toEqual([cx, cy, r]);

    // The dot caps the right arm; if the V moves and the dot does not, it drifts
    // off the stroke and reads as a stray speck.
    const [, , , , x3, y3] = num(svg, /d="M(\d+) (\d+) L(\d+) (\d+) L(\d+) (\d+)"/, "svg path");
    expect([cx, cy]).toEqual([x3, y3]);
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
