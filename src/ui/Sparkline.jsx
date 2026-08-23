// ============================================================
//  Sparkline — a tiny inline session chart for list rows.
//
//  The watchlist told you where a price IS, but not how it got there — the
//  one thing a glance at a row actually wants. This is deliberately minimal:
//  raw SVG, no axes, no tooltip, no dependency. Direction colour comes from
//  the caller (it already knows), and an optional reference value draws a
//  dotted baseline (prev close) so "above or below yesterday" reads at 22px.
//
//  Renders for every row on every tape tick, so the math stays trivial:
//  stride-downsample to ≤60 points and normalise. Anything smarter is wasted
//  at this size.
// ============================================================

import React from "react";

function thin(data, max) {
  if (data.length <= max) return data;
  const step = data.length / max;
  const out = [];
  for (let i = 0; i < max; i++) out.push(data[Math.floor(i * step)]);
  out[out.length - 1] = data[data.length - 1];   // never drop the newest print
  return out;
}

const Sparkline = React.memo(function Sparkline({
  data = [],
  width = 64,
  height = 22,
  color = "#8B93A7",
  refValue = null,       // dotted baseline (e.g. prev close); also widens the scale
  strokeWidth = 1.25,
}) {
  const pts = thin(data.filter(v => Number.isFinite(v)), 60);
  if (pts.length < 2) return <svg width={width} height={height} aria-hidden="true" />;

  let lo = Math.min(...pts), hi = Math.max(...pts);
  const hasRef = refValue != null && Number.isFinite(refValue);
  if (hasRef) { lo = Math.min(lo, refValue); hi = Math.max(hi, refValue); }
  // A frozen tape (market closed) is a flat line, not a broken scale.
  if (hi - lo < 1e-9) { const pad = Math.max(0.01, Math.abs(hi) * 0.002); lo -= pad; hi += pad; }

  const X = (i) => (i / (pts.length - 1)) * (width - 2) + 1;
  const Y = (v) => height - 2 - ((v - lo) / (hi - lo)) * (height - 4);
  const line = pts.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
      {hasRef && (
        // currentColor, not the direction colour: the baseline is context, and
        // painting it green/red would double-claim the direction.
        <line x1={1} x2={width - 1} y1={Y(refValue)} y2={Y(refValue)}
          stroke="currentColor" strokeOpacity="0.3" strokeDasharray="2 3" strokeWidth="1" />
      )}
      <polyline points={line} pathLength="1" className="v-spark-line" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={X(pts.length - 1)} cy={Y(pts[pts.length - 1])} r="1.6" fill={color} />
    </svg>
  );
});

export default Sparkline;
