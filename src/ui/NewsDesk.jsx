// ============================================================
//  NewsDesk — the wire, and the desk reading it.
//
//  WHAT THE HANDOFF ASKS FOR, AND WHAT IS REALLY THERE
//  The reference draws two screens: the desk (a header, a wire-tone strip, a
//  source filter row, story cards, a footer) and the story on air (a waveform,
//  a position in the queue, an elapsed clock, a progress bar, and a WHAT IT
//  MEANS panel). Almost all of it is real here. Three things are not, and each
//  one is handled the same way — by printing what we can measure and nothing
//  where we cannot:
//
//  1. AGES. Only one of the three paths into this panel carries a timestamp.
//     Finnhub sends one per story; Claude's web search and the from-memory
//     model path send none. A card with no timestamp gets no timestamp, and
//     the header drops the "last 24h" half of its line rather than claiming a
//     window it cannot measure.
//
//  2. THE CLOCK. "0:18 / 0:41" needs a duration, and browser speech synthesis
//     does not have one — it will not tell you how long an utterance will take
//     until it has taken it. The studio voice IS an <audio> element, so there
//     both halves are real. On browser TTS the elapsed half is real and the
//     total half is simply absent. The progress bar is honest on both: on
//     audio it is the playhead, on TTS it is how far through the SCRIPT the
//     word boundaries have got, which is a real position rather than a timer
//     pretending to be one.
//
//  3. THE SOURCE PILL. The reference reads "DataHub · news/equities". There is
//     no such dataset — it is prototype text — so the pill names the path the
//     stories actually came in on, which is the more useful fact anyway: it is
//     the one place the panel can say out loud that a model wrote these from
//     memory rather than reading them off a wire.
//
//  CONTRACT
//  Controlled and presentational. `items` arrives already ordered, so the
//  index of a story is the same number here and in the caller that speaks it —
//  which is what makes "story 3 of 8" a fact rather than a coincidence.
// ============================================================

import React, { useMemo, useState, useEffect } from "react";
import { C, MONO, SANS, TYPE, R, SP, FIELD, button } from "./theme.js";
import DeskIcon from "./DeskIcon.jsx";
import Waveform from "./Waveform.jsx";
import VideoFrame, { ytId, ytThumb, ytThumbIsReal } from "./VideoFrame.jsx";
import { clock, relAge } from "../lib/time.js";
import useSpeechProgress from "./useSpeechProgress.js";
import { Flap, Roll, Shuttle, printIn } from "./DeskMotion.jsx";
import { toneOf, toneLabel, wireTone, categoryOf, sourceColor, sourceOf, ageOf, spanLabel } from "../news/news.js";


const railLabel = { ...TYPE.eyebrowSm, fontSize: 10, color: C.faint, letterSpacing: "1.5px" };
const metaMono = { fontFamily: MONO, fontSize: 10.5, color: C.faint };
const HEAD_PAD = "14px 22px";

// The story cards PRINT in sequence — they do not rise. This panel used
// vt-fadeup, which is the landing page's gesture: a thing travelling up into
// place to present itself. But this is a desk, and more to the point it is a
// WIRE. Stories do not float onto a news desk; they come off a machine, and
// the desk's arrival primitive is a wipe from the top edge that reveals a card
// exactly where it already is (see v-print in global.css). Sixty milliseconds
// apart is the handoff's stagger; clamping the index at eight stops the
// twelfth story arriving most of a second after the first.
const enter = (i) => printIn(Math.min(i, 8), { step: 60, radius: R.lg });

// ---------- the row of metadata every story wears ----------
// Source, age, category, tone — in that order on both screens, because the
// on-air card and the list card are the same story and reading them as two
// different objects is the failure this row exists to prevent.
function StoryMeta({ item, source, hue, showCategory = true }) {
  const tone = toneOf(item.title);
  const age = ageOf(item);
  const cat = showCategory ? categoryOf(item.title, item.summary) : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span aria-hidden="true" style={{ width: 3, height: 13, borderRadius: 2, background: hue, flexShrink: 0 }} />
      <span style={{ ...TYPE.eyebrowSm, fontSize: 10.5, letterSpacing: "1.5px", color: hue, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {source}
      </span>
      {/* No timestamp, no element. The two model paths into this panel do not
          carry one, and a card that says "just now" about a headline it cannot
          date is worse than a card that says nothing. */}
      {age && <span style={metaMono}>{age}</span>}
      {cat && (
        <span style={{ background: C.surfaceRaised, borderRadius: 12, padding: "2px 9px", fontFamily: MONO, fontSize: 10, color: C.muted }}>
          {cat}
        </span>
      )}
      <span
        title={tone ? `Keyword scan: ${tone === "bull" ? "bullish" : "bearish"}` : "The keyword scan found no clear direction in this headline"}
        style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10.5, color: tone === "bull" ? C.up : tone === "bear" ? C.down : C.faint }}
      >
        {toneLabel(tone)}
      </span>
    </div>
  );
}

// ---------- story card ----------
// A card, not one big link: the actions below the title are buttons, and
// buttons nested inside an <a> are invalid HTML that screen readers flatten
// into nonsense. The headline carries the link; the card stays a container.
//
// `primary` is the top story only. The handoff gives exactly one card the green
// Read on air and the stronger border, which is the same one-primary-action
// rule the rest of the product follows — eight green buttons in a column is
// eight things claiming to be the next thing to do.
function StoryCard({ item, href, index, primary, onAir, speaking, onRead, onAsk }) {
  const source = sourceOf(item, href);
  const hue = sourceColor(source);
  // "Stop" only while there is something to stop. The card stays marked after
  // a read finishes — the on-air block above it keeps the translation up — so
  // a button reading Stop over silence would be offering nothing.
  const readLabel = onAir && speaking ? "Stop" : "Read on air";

  return (
    <div className="v-lift v-storycard v-print" style={{
      position: "relative",
      background: C.surface,
      border: `1px solid ${onAir ? C.accent : primary ? C.edgeStrong : C.edge}`,
      borderRadius: R.lg, padding: "16px 18px", ...enter(index),
    }}>
      <StoryMeta item={item} source={source} hue={hue} />

      <a href={href} target="_blank" rel="noopener noreferrer"
        style={{ display: "block", fontFamily: SANS, fontSize: 17, fontWeight: 700, lineHeight: 1.45, letterSpacing: "-0.01em", color: C.text, textDecoration: "none", marginTop: 10, textWrap: "pretty" }}>
        {item.title}
      </a>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 13, flexWrap: "wrap" }}>
        {onRead && (
          <button onClick={() => onRead(item, index)} className={primary || onAir ? "v-onair" : "v-outline"}
            style={primary || onAir
              ? { display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(70,167,88,0.1)", border: `1px solid ${C.accent}`, borderRadius: R.sm, padding: "7px 13px", fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: C.accentText, cursor: "pointer" }
              : { background: "transparent", border: `1px solid ${C.edgeStrong}`, borderRadius: R.sm, padding: "7px 13px", fontFamily: SANS, fontSize: 12.5, color: C.muted, cursor: "pointer" }}>
            {onAir && speaking && <Waveform bars={3} height={11} />}
            {readLabel}
          </button>
        )}
        {onAsk && (
          <button onClick={() => onAsk(item)} className="v-outline"
            style={{ background: "transparent", border: `1px solid ${C.edgeStrong}`, borderRadius: R.sm, padding: "7px 13px", fontFamily: SANS, fontSize: 12.5, color: C.muted, cursor: "pointer" }}>
            Ask the desk
          </button>
        )}
        <a href={href} target="_blank" rel="noopener noreferrer" className="v-storyact"
          style={{ marginLeft: "auto", color: C.faint, fontFamily: SANS, fontSize: 12.5, textDecoration: "none", padding: "5px 4px", borderRadius: R.xs }}>
          Open source &#8599;
        </a>
      </div>
    </div>
  );
}

// ---------- the story on air ----------

// The band is chrome and content in one, and the two move differently. The
// chrome — the state, the position in the queue, the clock — STAYS mounted for
// the whole bulletin and swaps its values in place: a flap for the state, wheels
// for the position, because those are values being replaced. The story panel
// below it is a different story each time, so it re-prints: the tape advancing.
const AIR_STATE = [
  { key: "onair", label: <span style={{ color: C.live }}>On air</span> },
  { key: "read", label: <span style={{ color: C.muted }}>Just read</span> },
];

function OnAir({ item, href, index, total, speaking, means, progressRef, onNext, onStop }) {
  const source = sourceOf(item, href);
  const hue = sourceColor(source);
  const { frac, elapsedSec, totalSec } = useSpeechProgress(progressRef, `story:${index}`);

  return (
    <div className="v-print" style={{ borderBottom: `1px solid ${C.edge}`, background: C.base, ...printIn(0, { radius: 0 }) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "14px 22px", borderBottom: `1px solid ${C.edge}`, flexWrap: "wrap" }}>
        {/* The waveform is mounted only while sound is actually coming out —
            a meter that animates over silence teaches you to stop believing
            it. When the read ends the block stays, holding the translation,
            and says so instead. */}
        {speaking && <Waveform height={15} width={3} gap={2.5} />}
        <Flap value={speaking ? "onair" : "read"} items={AIR_STATE}
          style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600 }} />
        <span style={{ fontFamily: SANS, fontSize: 12, color: C.faint }}>
          story <Roll value={index + 1} /> of <Roll value={total} />
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 12 }}>
          {/* The total half of this clock only exists on the studio voice,
              which is a real audio element with a real duration. Browser
              speech synthesis does not know how long it will talk for, so
              there is an elapsed reading and no denominator. */}
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.faint }}>
            {clock(elapsedSec)}{totalSec ? ` / ${clock(totalSec)}` : ""}
          </span>
          {onStop && (
            <button onClick={onStop} className="v-clearx" aria-label="Stop reading"
              style={{ background: "transparent", border: "none", color: C.faint, fontFamily: SANS, fontSize: 14, cursor: "pointer", padding: 2 }}>&#10005;</button>
          )}
        </span>
      </div>

      {/* Keyed on the story, so the panel re-prints as the bulletin walks the
          queue. A new story arriving with the old one's wipe already spent
          would just have its text substituted underneath you, which is the one
          thing a desk should never do quietly. */}
      <div key={index} className="v-print" style={{ padding: "18px 22px 20px", ...printIn(0, { radius: 0 }) }}>
        <StoryMeta item={item} source={source} hue={hue} showCategory={false} />
        <div style={{ fontFamily: SANS, fontSize: 17, fontWeight: 700, lineHeight: 1.45, letterSpacing: "-0.01em", marginTop: 10, textWrap: "pretty" }}>
          {item.title}
        </div>

        {/* The head rides the fill's right edge (v-readfill in global.css), so
            the position it marks is the fill's own end rather than a second
            number that could drift out of step. overflow is NOT hidden here:
            the head is wider than the 3px track and hangs over both sides of
            it on purpose — a clipped read head is a square cap. */}
        <div role="progressbar" aria-valuenow={Math.round(frac * 100)} aria-valuemin={0} aria-valuemax={100}
          aria-label="How far through this story the desk has read"
          style={{ height: 3, borderRadius: 2, background: C.surface, marginTop: 16 }}>
          <div className={speaking ? "v-readfill is-live" : "v-readfill"}
            style={{ width: `${frac * 100}%`, background: C.accent, transition: "width 250ms linear" }} />
        </div>

        {/* The desk's own words about somebody else's — C.textBody, the one
            place in the palette reserved for exactly that. Absent entirely
            when no model is reachable: an empty panel headed WHAT IT MEANS
            would be a promise the desk cannot keep. */}
        {means && (
          <div style={{ background: C.surfaceAlt, border: `1px solid ${C.edge}`, borderRadius: R.lg, padding: "14px 16px", marginTop: 16 }}>
            <div style={railLabel}>WHAT IT MEANS</div>
            <div style={{ color: means.status === "error" ? C.down : C.textBody, fontFamily: SANS, fontSize: 14, lineHeight: 1.6, marginTop: 8, textWrap: "pretty" }}>
              {means.status === "running" ? "Translating the jargon…" : means.text}
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {means?.model && (
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>
              {[means.model, means.ms != null ? `${(means.ms / 1000).toFixed(1)}s` : ""].filter(Boolean).join(" · ")}
            </span>
          )}
          {onNext && (
            <button onClick={onNext} className="v-outline"
              style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${C.edgeStrong}`, borderRadius: R.sm, padding: "7px 13px", fontFamily: SANS, fontSize: 12.5, color: C.muted, cursor: "pointer" }}>
              Next story &#8594;
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- video card ----------
// The row IS the player. It used to be a link: you clicked a video here and it
// began playing in a frame docked at the top of the desk — which is why this
// panel read as a list of references rather than as coverage.
//
// The thumbnail does two jobs. It is the picture the panel never had, and it is
// the id check. YouTube answers a dead id with a 120x90 grey placeholder rather
// than a 404, so a thumbnail that comes back 120 wide is an id that would have
// embedded as a black box — and models invent video ids constantly. Those rows
// keep the neutral tile and go OUT to YouTube instead of pretending to play,
// which is also why the element type changes with them: a row that leaves the
// product is a link, not a button.
function VideoCard({ video, playing, onPlay, onStop }) {
  const id = ytId(video.url);
  const [thumbBad, setThumbBad] = useState(false);
  const canPlay = !!id && !thumbBad;

  if (playing && canPlay) {
    return (
      <div style={{
        background: C.surface, border: `1px solid ${C.edge}`, borderRadius: R.lg, overflow: "hidden",
        boxShadow: "0 26px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(70,167,88,0.06)",
      }}>
        <VideoFrame id={id} title={video.title} autoStart />
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: SP[3] }}>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: "block", ...TYPE.bodySm, color: C.text, lineHeight: 1.4 }}>{video.title}</span>
            <span style={{ display: "block", ...TYPE.eyebrowSm, color: C.faint, marginTop: 4 }}>{video.channel}</span>
          </span>
          <button onClick={onStop} className="v-clearx" aria-label="Stop this video" title="Stop this video"
            style={{ flexShrink: 0, background: "transparent", border: `1px solid ${C.edge}`, borderRadius: R.sm, color: C.muted, fontFamily: SANS, fontSize: 12, padding: "3px 9px", cursor: "pointer" }}>&#10005;</button>
        </div>
      </div>
    );
  }

  const Row = canPlay ? "button" : "a";
  const rowProps = canPlay
    ? { type: "button", onClick: onPlay }
    : { href: video.url, target: "_blank", rel: "noopener noreferrer" };
  return (
    <Row {...rowProps} className="v-lift"
      style={{
        display: "flex", alignItems: "flex-start", gap: 12, width: "100%",
        padding: SP[3], textAlign: "left", cursor: "pointer", textDecoration: "none",
        background: C.surface, border: `1px solid ${C.edge}`, borderRadius: R.lg,
      }}
    >
      {/* 96x54 — the same 16:9 the player is, so the row is a small version of
          what it opens rather than a different shape. The neutral tile survives
          underneath as the fallback for a video with no usable thumbnail. */}
      <span aria-hidden="true" style={{
        position: "relative", width: 96, height: 54, borderRadius: R.sm, flexShrink: 0, overflow: "hidden",
        background: C.surfaceRaised, border: `1px solid ${C.edge}`,
        display: "grid", placeItems: "center", color: C.text, fontSize: 13,
      }}>
        {!!id && !thumbBad && (
          <img src={ytThumb(id, "mqdefault")} alt="" loading="lazy"
            onError={() => setThumbBad(true)}
            onLoad={e => { if (!ytThumbIsReal(e.currentTarget)) setThumbBad(true); }}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        )}
        {/* Green only when it will actually play. On a row that leaves for
            YouTube a green play button would be promising something the row
            cannot do. */}
        <span style={{
          position: "relative", width: 26, height: 26, borderRadius: "50%",
          display: "grid", placeItems: "center", lineHeight: 1,
          background: canPlay ? C.accent : "transparent",
          color: canPlay ? C.textOnAccent : C.text,
          fontSize: canPlay ? 10 : 13, paddingLeft: canPlay ? 2 : 0,
          boxShadow: canPlay ? "0 12px 40px rgba(0,0,0,0.5)" : "none",
        }}>&#9654;</span>
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", ...TYPE.bodySm, color: C.text, lineHeight: 1.4 }}>{video.title}</span>
        <span style={{ display: "block", ...TYPE.eyebrowSm, color: C.faint, marginTop: 4 }}>
          {video.channel} &#183; {canPlay ? "plays here" : "opens on YouTube ↗"}
        </span>
      </span>
    </Row>
  );
}

// ---------- skeletons ----------
// Shown while searching. Matching the real card's footprint stops the layout
// jumping when results land.
function CardSkeleton() {
  return (
    <div style={{ padding: "16px 18px", background: C.surface, border: `1px solid ${C.edge}`, borderRadius: R.lg, display: "flex", flexDirection: "column", gap: 11 }}>
      <div className="v-skeleton" style={{ height: 9, width: "38%" }} />
      <div className="v-skeleton" style={{ height: 15, width: "100%" }} />
      <div className="v-skeleton" style={{ height: 15, width: "72%" }} />
      <div className="v-skeleton" style={{ height: 9, width: "26%" }} />
    </div>
  );
}

// ---------- the desk ----------
export default function NewsDesk({
  items = [],          // already newest-first: the caller owns the order, so an index means the same thing on both sides
  videos = [],
  subject,
  loadedFor,
  busy = false,
  error,
  stale = false,
  provenance,          // "finnhub · company-news" | "claude · web search" | "<model> · from memory"
  fetchedAt = null,    // ms epoch of the last successful load
  last = null,         // { price, chgPct } for loadedFor — the LAST card beside the wire tone
  onLoad,
  onBroadcast,
  onPlayVideo,
  onReadStory,         // (item, index) — the anchor reads ONE story
  onStopAir,
  airIndex = null,     // index of the story currently on air
  airSpeaking = false, // ...and whether it is still talking
  airAuto = false,     // ...and whether it is the BULLETIN walking the queue, or one card read on its own
  airMeans = null,     // { status, text, model, ms } for that story
  progressRef = null,  // { current: { id, frac, elapsedMs, totalMs } }
  onNextStory,
  onAskStory,
  hrefFor,
  onClose,
  compact = false,
}) {
  const hasContent = items.length > 0 || videos.length > 0;
  const href = useMemo(
    () => (item) => (hrefFor ? hrefFor(item) : item.url || `https://www.google.com/search?q=${encodeURIComponent(item.title || "")}`),
    [hrefFor],
  );

  // Filter by outlet and by scanned tone; the two compose. Local state on
  // purpose — they're view preferences of this panel, and a fresh wire resets
  // them both, along with how much of the list is showing.
  const [sourceFilter, setSourceFilter] = useState(null);
  const [toneFilter, setToneFilter] = useState(null);   // "bull" | "quiet" | "bear" | null
  const [expanded, setExpanded] = useState(false);
  // Reset on the wire's CONTENT, not on the array's identity. Keyed on [items]
  // this fired on every render for any caller that built the list inline, and
  // the filter you had just clicked was cleared before you saw it — a bug that
  // hides completely behind a caller who happens to memoize. Same trick the
  // video list below already uses.
  const wireKey = items.map(n => n.url || n.title).join("|");
  useEffect(() => { setSourceFilter(null); setToneFilter(null); setExpanded(false); }, [wireKey]);

  // Which video is playing, if any. One at a time: three autoplaying frames in
  // one column is a panel nobody can hear. Keyed by url rather than index so a
  // new wire cannot leave the player pointed at a different video, and reset on
  // the urls themselves because the parent hands us a fresh array every render.
  const [playingVideo, setPlayingVideo] = useState(null);
  const videoKey = videos.map(v => v.url).join("|");
  useEffect(() => { setPlayingVideo(null); }, [videoKey]);

  const sources = useMemo(() => {
    const seen = new Map();
    for (const n of items) { const s = sourceOf(n, href(n)); seen.set(s, (seen.get(s) || 0) + 1); }
    return [...seen.entries()];
  }, [items, href]);

  // The index is carried alongside, because filtering the list must not change
  // what "story 3 of 8" means — the position is in the wire, not in the view.
  const visible = useMemo(() => items
    .map((n, i) => ({ n, i }))
    .filter(({ n }) =>
      (!sourceFilter || sourceOf(n, href(n)) === sourceFilter) &&
      (!toneFilter || (toneOf(n.title) || "quiet") === toneFilter)),
    [items, sourceFilter, toneFilter, href]);

  const SHOW = 6;
  const shown = expanded ? visible : visible.slice(0, SHOW);
  const moreCount = visible.length - shown.length;

  const tones = useMemo(() => wireTone(items), [items]);
  const span = useMemo(() => spanLabel(items), [items]);
  const airItem = airIndex != null ? items[airIndex] : null;

  const chipBtn = (active) => ({
    display: "inline-flex", alignItems: "center", gap: 7,
    background: active ? C.accentGlow : C.surface,
    border: `1px solid ${active ? C.accent : C.edge}`,
    color: active ? C.text : C.muted,
    borderRadius: 20, padding: "6px 13px", cursor: "pointer",
    fontFamily: SANS, fontSize: 12.5,
    transition: "border-color 0.2s, background 0.2s",
  });

  return (
    <section aria-label="AI news desk"
      style={{ background: C.base, border: `1px solid ${C.edge}`, borderRadius: R.xl, overflow: "hidden", color: C.text }}>

      {/* ---- header ---- */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: HEAD_PAD, borderBottom: `1px solid ${C.edge}`, background: C.surfaceAlt, flexWrap: "wrap" }}>
        {/* The same mark the "Load the news" card carries. Click a newspaper,
            get a newspaper — two glyphs for one idea is how an interface stops
            being learnable. */}
        <span aria-hidden="true" style={{ width: 28, height: 28, background: C.surfaceRaised, borderRadius: R.xs, display: "grid", placeItems: "center", color: C.text, flexShrink: 0 }}>
          <DeskIcon name="news" size={14} />
        </span>
        <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 14.5 }}>News desk</span>
        {(loadedFor || subject) && (
          <span style={{ background: C.surface, border: `1px solid ${C.edgeStrong}`, borderRadius: 20, padding: "3px 11px", fontFamily: MONO, fontSize: 11.5, fontWeight: 700 }}>
            {loadedFor || subject}
          </span>
        )}
        {/* "8 stories · last 24h" — but only the half we can prove. spanLabel
            measures the OLDEST story actually in hand, so the window named is
            the one the panel is holding rather than the seven days the server
            asked Finnhub for. On the two model paths nothing carries a date,
            it returns an empty string, and the line is just the count. That
            rule was written and tested when this file was built; it was the
            one piece of it that never got wired to the header. */}
        {items.length > 0 && (
          <span style={{ color: C.faint, fontFamily: MONO, fontSize: 11.5 }}>
            {/* The count is on wheels. A refresh that turns eight stories into
                eleven is a value being replaced, and the desk's answer to that
                is a mechanism, not a substitution you have to notice. */}
            <Roll value={items.length} /> {items.length === 1 ? "story" : "stories"}{span ? ` · ${span}` : ""}
          </span>
        )}

        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* Reading it on air is what makes this a news DESK rather than a
              feed reader, so it is this panel's one primary action.

              It is also a toggle — pressing it during a bulletin stops the
              bulletin — and it used to wear one label for both halves of that,
              so the way to stop the desk talking was to press a button reading
              "Read all on air" and hope. Its meter was wrong in the other
              direction: `airSpeaking` is true for ANY read, so pressing one
              card's own Read on air lit the bars up here as though the whole
              bulletin were running. Both halves are the same missing fact —
              whether this button's bulletin is the thing on air — and airAuto
              is it. */}
          {items.length > 0 && onBroadcast && (
            <button onClick={onBroadcast} className="v-onair" aria-pressed={airAuto}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(70,167,88,0.1)", border: `1px solid ${C.accent}`, borderRadius: R.sm, padding: "7px 14px", fontFamily: SANS, fontSize: 13, fontWeight: 700, color: C.accentText, cursor: "pointer" }}>
              {airAuto && airSpeaking && <Waveform bars={3} />}
              {airAuto ? "Stop the bulletin" : "Read all on air"}
            </button>
          )}
          {/* A search of the wire takes as long as it takes, and the desk's
              primitive for exactly that is the shuttle — a bar scanning its
              track, mounted only while the search is genuinely running. */}
          <button onClick={onLoad} disabled={busy} className="v-outline"
            style={{ ...button(hasContent ? "ghost" : "solid", "sm", { disabled: busy }), borderColor: hasContent ? C.edgeStrong : C.edge, display: "inline-flex", alignItems: "center", gap: 8 }}>
            {busy && <Shuttle />}
            {busy ? "Searching…" : hasContent ? "Refresh" : `Load ${subject || "news"} →`}
          </button>
          {onClose && (
            <button onClick={onClose} className="v-clearx" aria-label="Close the news desk"
              style={{ background: "transparent", border: "none", color: C.faint, fontFamily: SANS, fontSize: 14, cursor: "pointer", padding: 2 }}>&#10005;</button>
          )}
        </span>
      </div>

      {airItem && (
        <OnAir item={airItem} href={href(airItem)} index={airIndex} total={items.length}
          speaking={airSpeaking} means={airMeans} progressRef={progressRef}
          onNext={onNextStory} onStop={onStopAir} />
      )}

      {/* ---- wire tone + the price it is moving ---- */}
      {items.length >= 3 && (
        <div style={{ display: "flex", alignItems: "center", gap: 20, padding: HEAD_PAD, borderBottom: `1px solid ${C.edge}`, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <div style={railLabel} title="A keyword scan of the headlines, not analysis. NEUTRAL means the scan found no clear direction — not that the story is balanced.">WIRE TONE</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
              {/* Three segments, where the reference draws two. It shows the
                  bullish share against everything else, which cannot
                  distinguish a quiet wire from a bearish one — and those are
                  the two readings that matter most. */}
              {/* Keyed on the wire's contents so the meter charges when a NEW
                  wire lands and holds still when you filter the one already in
                  hand — a gauge that re-swept every time you pressed a chip
                  would be reporting an arrival that did not happen. */}
              <span key={wireKey} aria-hidden="true" className="v-wirecharge"
                style={{ flex: "1 1 120px", minWidth: 84, display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: C.surface, border: `1px solid ${C.edge}` }}>
                {tones.bull > 0 && <span style={{ width: `${(tones.bull / items.length) * 100}%`, background: `linear-gradient(90deg, ${FIELD.youMeter[0]}, ${FIELD.youMeter[1]})` }} />}
                {tones.quiet > 0 && <span style={{ flex: 1, background: C.edge }} />}
                {tones.bear > 0 && <span style={{ width: `${(tones.bear / items.length) * 100}%`, background: C.down }} />}
              </span>
              {/* Spelled out, because the reference's own note says the bare
                  version could not be read. They are buttons as well as
                  labels: the count and the filter for it are the same fact. */}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                {/* The counts are on wheels for the same reason the header's
                    is: three bullish becoming five is the wire changing its
                    mind, and it should be visible that it did. */}
                {[["bull", "▲ ", tones.bull, " bullish", C.up], ["quiet", "", tones.quiet, " neutral", C.faint], ["bear", "▼ ", tones.bear, " bearish", C.down]].map(([id, glyph, count, word, color]) => (
                  <button key={id} onClick={() => setToneFilter(f => (f === id ? null : id))} aria-pressed={toneFilter === id}
                    title={toneFilter === id ? "Show every tone" : `Show only the ${id === "quiet" ? "unscored" : id === "bull" ? "bullish" : "bearish"} headlines`}
                    style={{
                      fontFamily: MONO, fontSize: 12, color,
                      background: toneFilter === id ? C.accentGlow : "transparent",
                      border: `1px solid ${toneFilter === id ? C.accentEdge : "transparent"}`,
                      borderRadius: R.pill, padding: "2px 8px", cursor: "pointer",
                    }}>
                    {glyph}<Roll value={count} />{word}
                  </button>
                ))}
              </span>
            </div>
          </div>

          {/* The news sits next to what it is moving. Absent when the desk has
              no quote for the symbol rather than printing a dash where a price
              goes. */}
          {last?.price != null && (
            <div style={{ width: 160, flexShrink: 0, background: C.surface, border: `1px solid ${C.edgeStrong}`, borderRadius: R.lg, padding: "8px 12px", textAlign: "center" }}>
              <div style={railLabel}>{loadedFor || subject} LAST</div>
              <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>
                {last.price.toFixed(2)}
                {last.chgPct != null && (
                  <span style={{ fontSize: 12, color: last.chgPct >= 0 ? C.up : C.down }}>
                    {" "}{last.chgPct >= 0 ? "+" : "−"}{Math.abs(last.chgPct).toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- source filter ---- */}
      {sources.length >= 2 && (
        <div style={{ display: "flex", gap: 7, padding: HEAD_PAD, borderBottom: `1px solid ${C.edge}`, alignItems: "center", flexWrap: "wrap" }}>
          {/* aria-pressed on all of them. These chips carried their entire
              state in a green fill, so to a screen reader the row was five
              identical buttons and the list below just changed length for no
              stated reason. The tone counts three inches above already say
              which of them is on; there is no reason this row should not. */}
          <button onClick={() => setSourceFilter(null)} aria-pressed={!sourceFilter}
            title={sourceFilter ? "Show every outlet" : "Showing every outlet"}
            style={sourceFilter
              ? chipBtn(false)
              : { background: C.accent, color: C.textOnAccent, border: "1px solid transparent", borderRadius: 20, padding: "6px 14px", fontFamily: SANS, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
            All {items.length}
          </button>
          {sources.map(([s, count]) => (
            <button key={s} onClick={() => setSourceFilter(f => (f === s ? null : s))} className="v-interactive"
              aria-pressed={sourceFilter === s} title={sourceFilter === s ? "Show every outlet" : `Show only ${s}`}
              style={chipBtn(sourceFilter === s)}>
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: sourceColor(s), flexShrink: 0 }} />
              {s} {count}
            </button>
          ))}
          {/* True because the caller sorts before it hands the list over. */}
          <span style={{ marginLeft: "auto", color: C.faint, fontFamily: MONO, fontSize: 11 }}>newest first</span>
        </div>
      )}

      {/* ---- body ---- */}
      <div className="vt-scan" style={{ position: "relative", padding: "16px 22px 20px", display: "flex", flexDirection: "column", gap: 10, overflow: "hidden" }}>
        {error && (
          <div role="alert" style={{
            ...TYPE.bodySm, color: C.down, background: C.downSoft,
            border: `1px solid ${C.dangerEdge}`, borderRadius: R.md, padding: "10px 12px",
          }}>
            {error}
          </div>
        )}

        {busy && !hasContent && [0, 1, 2].map(i => <CardSkeleton key={i} />)}

        {!busy && !hasContent && !error && (
          <div style={{ textAlign: "center", padding: `${SP[8]}px ${SP[4]}px` }}>
            <div style={{ fontSize: 26, marginBottom: 10, opacity: 0.5 }} aria-hidden="true">📡</div>
            <div style={{ ...TYPE.heading, marginBottom: 5 }}>Nothing on the wire yet</div>
            <div style={{ ...TYPE.bodySm, color: C.muted, maxWidth: 330, margin: "0 auto" }}>
              Search the web for {subject ? <strong style={{ color: C.text }}>{subject}</strong> : "your symbol"} headlines
              and video. The anchor reads them on air.
            </div>
          </div>
        )}

        {items.length > 0 && visible.length === 0 && (
          <div style={{ ...TYPE.bodySm, color: C.faint, padding: `${SP[4]}px 0`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            Nothing matches.
            <button onClick={() => { setSourceFilter(null); setToneFilter(null); }} style={button("ghost", "sm")}>Clear filters</button>
          </div>
        )}

        {/* The green belongs to the top of the list you are LOOKING at, not to
            the top of the wire. Keyed on the wire index it disappeared the
            moment you filtered: narrow eight stories down to the one CNBC
            story — which you did because that is the story you want read — and
            the panel's one primary action was gone from the screen entirely,
            because the card that owned it was filtered out. `row` is the
            position in the visible list, which is what "the top story" means
            to somebody reading it. */}
        {shown.map(({ n, i }, row) => (
          <StoryCard key={`n${i}`} item={n} href={href(n)} index={row}
            primary={row === 0 && airIndex == null}
            onAir={airIndex === i} speaking={airSpeaking}
            onRead={onReadStory ? (item) => onReadStory(item, i) : null}
            onAsk={onAskStory} />
        ))}

        {videos.length > 0 && (
          <>
            <div style={{ ...railLabel, marginTop: SP[3] }}>VIDEO COVERAGE</div>
            <div style={{ display: "grid", gap: SP[2], gridTemplateColumns: compact ? "1fr" : "repeat(auto-fill, minmax(300px, 1fr))" }}>
              {videos.map((v, i) => (
                <VideoCard key={v.url || `v${i}`} video={v}
                  playing={playingVideo === v.url}
                  onPlay={() => { setPlayingVideo(v.url); onPlayVideo?.(v); }}
                  onStop={() => setPlayingVideo(null)} />
              ))}
            </div>
          </>
        )}

        {/* ---- footer ---- */}
        {hasContent && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4, flexWrap: "wrap" }}>
            {provenance && (
              <span style={{ background: C.surface, border: `1px solid ${C.edge}`, borderRadius: R.lg, padding: "3px 9px", fontFamily: MONO, fontSize: 11, color: C.faint }}>
                {provenance}
              </span>
            )}
            {fetchedAt && <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>refreshed {relAge(fetchedAt)}</span>}
            {moreCount > 0 && (
              <button onClick={() => setExpanded(true)} className="v-outline"
                style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${C.edgeStrong}`, borderRadius: R.sm, padding: "7px 13px", fontFamily: SANS, fontSize: 12.5, color: C.muted, cursor: "pointer" }}>
                Show {moreCount} more
              </button>
            )}
          </div>
        )}

        {stale && hasContent && (
          <div style={{ ...TYPE.bodySm, fontSize: 12, color: C.faint, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span aria-hidden="true">⟳</span>
            Showing <strong style={{ color: C.muted }}>{loadedFor}</strong> — refresh for {subject}.
          </div>
        )}
      </div>
    </section>
  );
}
