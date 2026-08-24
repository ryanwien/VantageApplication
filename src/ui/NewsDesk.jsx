// ============================================================
//  NewsDesk — the AI news surface: headlines and video coverage the desk can
//  read on air.
//
//  WHAT CHANGED AND WHY
//  The old panel was a narrow rail of 11px mono links — technically complete,
//  but it read as a log file. News is the one part of this app with genuine
//  editorial content, so it earns a card grid: bigger targets, a visible source,
//  a clear play affordance for video, and one obvious primary action ("read it
//  on air") instead of that action hiding as a small amber button.
//
//  CONTRACT
//  Controlled and presentational — identical props to what the dashboard already
//  computes, so it is a drop-in for the existing panel:
//    items   : [{ title, source, url }]
//    videos  : [{ title, channel, url }]
//    subject : the symbol these stories are about
//    stale   : true when `subject` has moved on since the last fetch
// ============================================================

import React, { useMemo, useState, useEffect } from "react";
import { C, MONO, SANS, TYPE, R, SP, SHADOW, MOTION, button, chip, panelHead } from "./theme.js";
import DeskIcon from "./DeskIcon.jsx";
// A stable accent per source so the same outlet always looks the same, without
// maintaining a hand-written colour map. Hashing the name is enough: we only need
// consistency, not meaning.
// Six visibly distinct hues. The accent-to-amber retheme collapsed two of these
// onto the same value; they must stay distinct or two different outlets end up
// wearing the same colour, which is the one thing this list exists to prevent.
const SOURCE_HUES = ["#FFB300", "#3D9BFF", "#2FD37A", "#FF7A59", "#C08BFF", "#FF5CA8"];
export function sourceColor(name = "") {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return SOURCE_HUES[h % SOURCE_HUES.length];
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

// A keyword scan, not a model: it only tags a headline whose direction is
// unambiguous, and stays silent otherwise. That honesty matters — a wrong
// arrow on a market headline is worse than no arrow, so mixed signals and
// neutral wording get nothing.
const BULL_WORDS = /\b(surge[sd]?|soar(?:s|ed)?|jump(?:s|ed)?|rall(?:y|ies|ied)|record high|beats?|tops?|upgrade[sd]?|outperform(?:s|ed)?|gains?|climb(?:s|ed)?|rises?|rose|bullish|buyback|raises? (?:guidance|outlook|forecast))\b/i;
const BEAR_WORDS = /\b(plunge[sd]?|sink(?:s|ing)?|sank|slump(?:s|ed)?|fall(?:s|ing)?|fell|drops?|miss(?:es|ed)?|cuts?|downgrade[sd]?|underperform(?:s|ed)?|loss(?:es)?|slid(?:es)?|bearish|lawsuit|probe|recall|layoffs?|warn(?:s|ing)?|halt(?:s|ed)?)\b/i;
export function toneOf(title = "") {
  const bull = BULL_WORDS.test(title);
  const bear = BEAR_WORDS.test(title);
  if (bull && !bear) return "bull";
  if (bear && !bull) return "bear";
  return null;
}

// ---------- story card ----------
// A card, not one big link: the AI actions below the title are buttons, and
// buttons nested inside an <a> are invalid HTML that screen readers flatten
// into nonsense. The title carries the link; the card stays a plain container.
function StoryAction({ label, hint, onClick }) {
  return (
    <button
      onClick={onClick}
      title={hint}
      className="v-row"
      style={{
        background: "transparent", border: "none", cursor: "pointer",
        padding: "3px 6px", borderRadius: R.xs,
        ...TYPE.eyebrowSm, color: C.muted,
      }}
    >
      {label}
    </button>
  );
}

function StoryCard({ item, href, index, onRead, onAsk, reading = false }) {
  const source = item.source || hostOf(href) || "Source";
  const hue = sourceColor(source);
  const tone = toneOf(item.title);

  return (
    <div
      className="v-lift"
      style={{
        display: "flex", flexDirection: "column", gap: 9,
        padding: SP[4],
        background: C.surface, border: `1px solid ${reading ? "rgba(214,48,69,0.75)" : C.edge}`,
        borderRadius: R.lg, minHeight: 128,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* The source's colour bar — a tiny bit of identity per outlet. */}
        <span aria-hidden="true" style={{ width: 3, height: 13, borderRadius: 2, background: hue, flexShrink: 0 }} />
        <span style={{ ...TYPE.eyebrowSm, color: hue, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {source}
        </span>
        <span style={{ flex: 1 }} />
        {reading && (
          <span style={{ ...TYPE.eyebrowSm, color: C.down, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span className="v-pulse" aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: C.down, display: "inline-block" }} />
            ON AIR
          </span>
        )}
        {tone && (
          <span
            title={`Keyword scan: ${tone === "bull" ? "bullish" : "bearish"}`}
            style={{ ...TYPE.num, fontSize: 12, color: tone === "bull" ? C.up : C.down }}
          >
            {tone === "bull" ? "▲" : "▼"}
          </span>
        )}
        <span style={{ ...TYPE.num, fontSize: 12, color: C.faint }}>{String(index + 1).padStart(2, "0")}</span>
      </div>

      <a
        href={href} target="_blank" rel="noopener noreferrer"
        style={{ ...TYPE.body, fontSize: 14, fontWeight: 510, color: C.text, lineHeight: 1.45, flex: 1, textDecoration: "none" }}
      >
        {item.title}
      </a>

      <div style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: -6 }}>
        <a
          href={href} target="_blank" rel="noopener noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 6px", ...TYPE.eyebrowSm, color: C.faint, textDecoration: "none" }}
        >
          Read <span aria-hidden="true">↗</span>
        </a>
        <span style={{ flex: 1 }} />
        {onRead && (
          <StoryAction label={reading ? "■ Stop" : "‣ On air"} hint={reading ? "Stop reading" : "Read on air"} onClick={() => onRead(item)} />
        )}
        {onAsk && (
          <StoryAction label="✦ Ask desk" hint="Ask the desk" onClick={() => onAsk(item)} />
        )}
      </div>
    </div>
  );
}

// ---------- video card ----------
function VideoCard({ video, onPlay }) {
  return (
    <button
      onClick={() => onPlay?.(video)}
      className="v-lift"
      style={{
        display: "flex", alignItems: "flex-start", gap: 12, width: "100%",
        padding: SP[3], textAlign: "left", cursor: "pointer",
        background: C.surface, border: `1px solid ${C.edge}`, borderRadius: R.lg,
      }}
    >
      {/* Play affordance doubles as the thumbnail — we have no image, so the
          gradient tile stands in for one rather than leaving a grey hole. */}
      <span aria-hidden="true" style={{
        width: 46, height: 34, borderRadius: R.sm, flexShrink: 0,
        // Neutral, deliberately. This used to be a warm orange fill, which the
        // redesign's one-accent rule rules out: a coloured play tile on every
        // video row competes with the screen's single primary action, and the
        // system's remaining warm colour (amber) means "caution" — market
        // closed, alert fired — so borrowing it here would blur that meaning.
        background: C.surfaceRaised, border: `1px solid ${C.edge}`,
        display: "grid", placeItems: "center", color: C.text, fontSize: 13,
      }}>▶</span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", ...TYPE.bodySm, color: C.text, lineHeight: 1.4 }}>{video.title}</span>
        <span style={{ display: "block", ...TYPE.eyebrowSm, color: C.faint, marginTop: 4 }}>
          {video.channel} · plays in-desk
        </span>
      </span>
    </button>
  );
}

// ---------- skeletons ----------
// Shown while searching. Matching the real card's footprint stops the layout
// jumping when results land.
function CardSkeleton() {
  return (
    <div style={{ padding: SP[4], background: C.surface, border: `1px solid ${C.edge}`, borderRadius: R.lg, minHeight: 128, display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="v-skeleton" style={{ height: 9, width: "38%" }} />
      <div className="v-skeleton" style={{ height: 13, width: "100%" }} />
      <div className="v-skeleton" style={{ height: 13, width: "82%" }} />
      <div className="v-skeleton" style={{ height: 9, width: "26%", marginTop: "auto" }} />
    </div>
  );
}

// ---------- the desk ----------
export default function NewsDesk({
  items = [],
  videos = [],
  subject,
  loadedFor,
  busy = false,
  error,
  stale = false,
  onLoad,
  onBroadcast,
  onPlayVideo,
  onReadStory,      // anchor reads ONE story on air
  readingTitle = null, // title of the story currently being read, if any
  onAskStory,       // hand one headline to the desk AI, in the chat thread
  hrefFor,          // host-supplied: falls back to a search URL when a story has no link
  compact = false,  // rail placement → single column
}) {
  const hasContent = items.length > 0 || videos.length > 0;
  const href = useMemo(
    () => (item) => (hrefFor ? hrefFor(item) : item.url || `https://www.google.com/search?q=${encodeURIComponent(item.title || "")}`),
    [hrefFor],
  );

  // Filter by outlet and by scanned tone; the two compose. Local state on
  // purpose — they're view preferences of this panel, and a fresh wire resets
  // them both.
  const [sourceFilter, setSourceFilter] = useState(null);
  const [toneFilter, setToneFilter] = useState(null);   // "bull" | "quiet" | "bear" | null
  useEffect(() => { setSourceFilter(null); setToneFilter(null); }, [items]);
  const srcOf = (n) => n.source || hostOf(n.url) || "Source";
  const sources = useMemo(() => {
    const seen = new Map();
    for (const n of items) { const s = srcOf(n); seen.set(s, (seen.get(s) || 0) + 1); }
    return [...seen.entries()];
  }, [items]);
  const visible = items.filter(n =>
    (!sourceFilter || srcOf(n) === sourceFilter) &&
    (!toneFilter || (toneOf(n.title) || "quiet") === toneFilter));

  // The per-card arrows, aggregated: same honest keyword scan, so "quiet"
  // means the scan stayed silent — not that the story is neutral.
  const tones = useMemo(() => {
    let bull = 0, bear = 0;
    for (const n of items) { const t = toneOf(n.title); if (t === "bull") bull += 1; else if (t === "bear") bear += 1; }
    return { bull, bear, quiet: items.length - bull - bear };
  }, [items]);

  const chipBtn = (active) => ({
    display: "inline-flex", alignItems: "center", gap: 6,
    background: active ? C.accentGlow : "transparent",
    border: `1px solid ${active ? C.accentEdge : C.edge}`,
    color: active ? C.text : C.muted,
    borderRadius: R.pill, padding: "3px 10px", cursor: "pointer",
    fontFamily: SANS, fontSize: 11,
  });

  return (
    <section
      aria-label="AI news desk"
      style={{ background: C.surface, border: `1px solid ${C.edge}`, borderRadius: R.lg, overflow: "hidden" }}
    >
      {/* ---- header ----
           Sentence-case sans, matching every other card in the transcript. It
           wore a mono uppercase eyebrow — the treatment this system gives a
           DATA LABEL — so a panel heading and a field name looked identical.
           The symbol beside it is mono, because that one IS a value. */}
      <div style={{ ...panelHead({ pad: "12px 16px" }), flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          {/* The same mark the "Load the news" card carries. Click a newspaper,
              get a newspaper — two glyphs for one idea is how an interface
              stops being learnable. */}
          <span aria-hidden="true" style={{ display: "grid", placeItems: "center", flexShrink: 0, color: C.muted }}>
            <DeskIcon name="news" size={16} />
          </span>
          <span>News desk</span>
          {subject && (
            <span style={{ ...TYPE.numSm, fontSize: 12.5, color: C.muted, background: C.surfaceRaised, border: `1px solid ${C.edgeStrong}`, borderRadius: R.pill, padding: "2px 9px" }}>
              {loadedFor || subject}
            </span>
          )}
        </span>

        <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {/* Reading it on air is what makes this a news DESK rather than a feed
              reader, so it keeps the live treatment — green, but an outline. */}
          {items.length > 0 && onBroadcast && (
            <button onClick={onBroadcast} style={{ ...button("live", "sm"), gap: 6 }}>
              <span className="v-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: C.live, display: "inline-block" }} />
              Read on air
            </button>
          )}
          {/* Never `primary`. This card lives inside the desk conversation,
              whose one green fill belongs to Ask — a second one here would make
              three on the screen, which is the exact failure the redesign is
              about. Neutral filled still reads as this card's action. */}
          <button onClick={onLoad} disabled={busy} style={button(hasContent ? "ghost" : "solid", "sm", { disabled: busy })}>
            {busy ? "Searching…" : hasContent ? "Refresh" : `Load ${subject || "news"} →`}
          </button>
        </span>
      </div>

      {/* ---- body ---- */}
      <div style={{ padding: SP[4] }}>
        {error && (
          <div role="alert" style={{
            ...TYPE.bodySm, color: C.down, background: C.downSoft,
            border: `1px solid ${C.dangerEdge}`, borderRadius: R.md,
            padding: "10px 12px", marginBottom: SP[4],
          }}>
            {error}
          </div>
        )}

        {busy && !hasContent && (
          <div style={{ display: "grid", gap: SP[3], gridTemplateColumns: compact ? "1fr" : "repeat(auto-fill, minmax(248px, 1fr))" }}>
            {[0, 1, 2].map(i => <CardSkeleton key={i} />)}
          </div>
        )}

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

        {items.length >= 3 && (
          <div title="Keyword scan, not analysis"
            style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: SP[3] }}>
            <span style={{ ...TYPE.eyebrowSm, color: C.faint }}>Wire tone</span>
            <span aria-hidden="true" style={{ flex: "0 1 150px", minWidth: 84, height: 5, borderRadius: 3, overflow: "hidden", display: "flex" }}>
              {tones.bull > 0 && <span style={{ width: `${(tones.bull / items.length) * 100}%`, background: C.up }} />}
              {tones.quiet > 0 && <span style={{ width: `${(tones.quiet / items.length) * 100}%`, background: C.edgeStrong }} />}
              {tones.bear > 0 && <span style={{ width: `${(tones.bear / items.length) * 100}%`, background: C.down }} />}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
              {[["bull", `▲ ${tones.bull}`, C.up], ["quiet", `${tones.quiet} quiet`, C.muted], ["bear", `▼ ${tones.bear}`, C.down]].map(([id, label, color]) => (
                <button key={id} onClick={() => setToneFilter(f => (f === id ? null : id))} aria-pressed={toneFilter === id}
                  title={toneFilter === id ? "Show all tones" : `Only ${id === "quiet" ? "unscored" : id === "bull" ? "bullish" : "bearish"} headlines`}
                  style={{
                    ...TYPE.num, fontSize: 12, color,
                    background: toneFilter === id ? C.accentGlow : "transparent",
                    border: `1px solid ${toneFilter === id ? C.accentEdge : "transparent"}`,
                    borderRadius: R.pill, padding: "2px 7px", cursor: "pointer",
                  }}>
                  {label}
                </button>
              ))}
            </span>
          </div>
        )}

        {sources.length >= 2 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: SP[3] }}>
            <button onClick={() => setSourceFilter(null)} style={chipBtn(!sourceFilter)}>All · {items.length}</button>
            {sources.map(([s, count]) => (
              <button key={s} onClick={() => setSourceFilter(f => (f === s ? null : s))} style={chipBtn(sourceFilter === s)}>
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: sourceColor(s), flexShrink: 0 }} />
                {s} · {count}
              </button>
            ))}
          </div>
        )}

        {items.length > 0 && visible.length === 0 && (
          <div style={{ ...TYPE.bodySm, color: C.faint, padding: `${SP[4]}px 0`, display: "flex", alignItems: "center", gap: 10 }}>
            Nothing matches.
            <button onClick={() => { setSourceFilter(null); setToneFilter(null); }} style={button("ghost", "sm")}>Clear filters</button>
          </div>
        )}

        {visible.length > 0 && (
          <div style={{ display: "grid", gap: SP[3], gridTemplateColumns: compact ? "1fr" : "repeat(auto-fill, minmax(248px, 1fr))" }}>
            {visible.map((n, i) => <StoryCard key={`n${i}`} item={n} href={href(n)} index={i} onRead={onReadStory} onAsk={onAskStory} reading={n.title === readingTitle} />)}
          </div>
        )}

        {videos.length > 0 && (
          <>
            <div style={{ ...TYPE.eyebrowSm, color: C.faint, margin: `${SP[5]}px 0 ${SP[3]}px` }}>
              Video coverage
            </div>
            <div style={{ display: "grid", gap: SP[2], gridTemplateColumns: compact ? "1fr" : "repeat(auto-fill, minmax(300px, 1fr))" }}>
              {videos.map((v, i) => <VideoCard key={`v${i}`} video={v} onPlay={onPlayVideo} />)}
            </div>
          </>
        )}

        {stale && hasContent && (
          <div style={{ ...TYPE.bodySm, fontSize: 12, color: C.faint, marginTop: SP[4], display: "flex", alignItems: "center", gap: 7 }}>
            <span aria-hidden="true">⟳</span>
            Showing <strong style={{ color: C.muted }}>{loadedFor}</strong> — refresh for {subject}.
          </div>
        )}
      </div>
    </section>
  );
}
