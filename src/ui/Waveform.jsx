// ============================================================
//  Waveform — the on-air speaking indicator.
//
//  The handoffs call for this on every surface where the anchor speaks: the
//  desk answer, the anchor's own status pill, "Read all on air", "Summarize on
//  air", the story and video summary headers. It had been hand-written twice
//  already with slightly different bar heights and gaps, and the Video desk
//  would have made three, so it is a component now.
//
//  The animation is NOT in here. .vt-bars in global.css owns the 0.9s cycle,
//  the 0.15s stagger and the reduced-motion silence; this file owns the shape.
//  Splitting it that way is what lets one @media rule stop every waveform in
//  the product at once.
//
//  It never runs on a timer. A meter that animates while nothing is playing is
//  worse than no meter, because it teaches you to stop believing it — so the
//  caller mounts this only while sound is actually coming out.
// ============================================================

import React from "react";
import { C } from "./theme.js";

// Four fixed heights, not random ones: the same silhouette every time reads as
// one indicator appearing in several places rather than several indicators.
const HEIGHTS = [60, 100, 45, 80];

export default function Waveform({ height = 12, bars = 4, width = 2.5, gap = 2, color = C.accent }) {
  return (
    <span className="vt-bars" aria-hidden="true" style={{ display: "flex", alignItems: "flex-end", gap, height }}>
      {HEIGHTS.slice(0, bars).map((h, i) => (
        <span key={i} style={{ width, height: `${h}%`, background: color, borderRadius: 2 }} />
      ))}
    </span>
  );
}
