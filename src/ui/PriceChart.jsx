// The session chart, and the only thing in the app that uses recharts.
//
// It lives in its own file so that recharts can live in its own chunk. The
// library is 374kB raw — 103kB gzipped — and it was imported at the top of
// React.jsx, which put it on the critical path of every first paint. Measured
// on the default landing section, the chart it draws starts 963px down a
// 900px-tall desktop window and 2,193px down a phone: nobody can see it when
// the page arrives, and everybody was waiting for it.
//
// So it is React.lazy'd at the call site, and the import is warmed on idle
// straight after first paint. In the normal case the chunk is in hand long
// before anyone scrolls this far and the fallback is never seen at all.
//
// Everything here came out of React.jsx unchanged. It takes what it needs as
// props rather than reaching for context, because the enclosing component
// computes all of it and passing it is cheaper to read than re-deriving it.
import React from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { C, MONO, R } from "./theme.js";

export default function PriceChart({
  comparePlot, chartPlot, accent, yDomain, chartVs, selected, smaN, fmt,
  prevCloseOnAxis, prevClose, sessionHL, chartSMA, chartDrawKey,
  // Unique per instance when more than one chart is on the page — SVG
  // gradient ids are document-global, so two charts both defining #fillArea
  // would share whichever one the browser finds first, and a red workbench
  // could paint its fill under a green session card in the conversation.
  fillId = "fillArea",
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={comparePlot || chartPlot} margin={{ top: 8, right: 6, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity={0.28} />
            <stop offset="100%" stopColor={accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="t" tick={{ fill: C.faint, fontSize: 12, fontFamily: MONO }} minTickGap={48} axisLine={{ stroke: C.panelEdge }} tickLine={false} />
        <YAxis domain={comparePlot ? ["auto", "auto"] : yDomain} tick={{ fill: C.faint, fontSize: 12, fontFamily: MONO }} width={56} axisLine={false} tickLine={false} tickFormatter={v => (comparePlot ? `${v > 0 ? "+" : ""}${(+v).toFixed(1)}%` : fmt(v))} />
        <Tooltip
          contentStyle={{ background: C.surfaceRaised, border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, fontFamily: MONO, fontSize: 12 }}
          labelStyle={{ color: C.muted }} itemStyle={{ color: C.text }}
          formatter={(v, name) => (comparePlot
            ? [`${v > 0 ? "+" : ""}${(+v).toFixed(2)}%`, name === "vs" ? chartVs : selected]
            : [fmt(v), name === "sma" ? `SMA ${smaN}` : "price"])}
        />
        {comparePlot && (
          <ReferenceLine y={0} stroke={C.faint} strokeDasharray="4 4"
            label={{ value: "0%", fill: C.faint, fontSize: 12, fontFamily: MONO, position: "insideTopRight" }} />
        )}
        {!comparePlot && prevCloseOnAxis && (
          <ReferenceLine y={prevClose} stroke={C.faint} strokeDasharray="4 4"
            label={{ value: `prev ${fmt(prevClose)}`, fill: C.faint, fontSize: 12, fontFamily: MONO, position: "insideTopRight" }} />
        )}
        {!comparePlot && sessionHL && (
          <ReferenceLine y={sessionHL.hi} stroke={C.up} strokeOpacity={0.5} strokeDasharray="2 4"
            label={{ value: `hi ${fmt(sessionHL.hi)}`, fill: C.up, fontSize: 12, fontFamily: MONO, position: "insideTopLeft" }} />
        )}
        {!comparePlot && sessionHL && (
          <ReferenceLine y={sessionHL.lo} stroke={C.down} strokeOpacity={0.5} strokeDasharray="2 4"
            label={{ value: `lo ${fmt(sessionHL.lo)}`, fill: C.down, fontSize: 12, fontFamily: MONO, position: "insideBottomLeft" }} />
        )}
        {/* C.info, not amber or a direction colour: the SMA is data,
            and every other hue on this chart already has a meaning. */}
        {!comparePlot && chartSMA && chartPlot.some(d => d.sma != null) && (
          <Area type="monotone" dataKey="sma" stroke={C.info} strokeWidth={1.3} strokeDasharray="5 3" fill="transparent" isAnimationActive={false} dot={false} />
        )}
        {/* pathLength=1 + .v-chartdraw is the draw-on; recharts' own
            isAnimationActive stays off because it replays on every
            data change, and this tape changes every few seconds. */}
        {!comparePlot && <Area key={`price-${chartDrawKey}`} className="v-chartdraw" pathLength={1} type="monotone" dataKey="price" stroke={accent} strokeWidth={1.8} fill={`url(#${fillId})`} isAnimationActive={false} dot={false} />}
        {comparePlot && <Area key={`base-${chartDrawKey}`} className="v-chartdraw" pathLength={1} type="monotone" dataKey="base" stroke={accent} strokeWidth={1.8} fill={`url(#${fillId})`} isAnimationActive={false} dot={false} />}
        {/* the comparison line owns purple — every other hue here has a meaning already */}
        {comparePlot && <Area key={`vs-${chartDrawKey}`} className="v-chartdraw" pathLength={1} type="monotone" dataKey="vs" stroke="#C08BFF" strokeWidth={1.5} fill="transparent" isAnimationActive={false} dot={false} />}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// The placeholder that stands here while the chunk is in flight is NOT in this
// file, and that is deliberate: importing it would import this module, which
// would import recharts, which is the whole thing being avoided. It lives at
// the call site in React.jsx.
