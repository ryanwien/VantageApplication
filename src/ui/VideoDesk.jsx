// ============================================================
//  VideoDesk — a YouTube video opened ON the desk, with the parts of it the
//  desk can actually vouch for.
//
//  WHAT THE HANDOFF ASKS FOR, AND WHAT IS REALLY THERE
//  The reference draws a scrub bar, a running clock, and 1x / CC / expand
//  chips across the bottom of the player. In the prototype those are
//  decorative — the handoff's own note says every one of them is
//  pointer-events: none so the frame underneath stays droppable for a
//  placeholder image. They are a drawing OF a player, standing in for one.
//
//  Here there is a real player, and it draws all of that itself. Repeating it
//  on top would put a second, dead scrub bar over a live one. So the chrome in
//  this file belongs to the POSTER state only — the YOUTUBE and duration
//  chips, the scrim, the 62px green play circle — and the moment you press
//  play, YouTube's own controls take the frame. Every value that survives (the
//  frame shadow, the green circle, the chip geometry) is the handoff's.
//
//  There is no running clock, and that is a decision rather than an omission:
//  reading the playhead means loading YouTube's IFrame API from youtube.com,
//  which would undo the reason every embed in this product points at
//  youtube-nocookie.com. A clock we cannot read is a clock we do not draw.
//
//  SEEKING WITHOUT A SEEK API
//  Tapping a chapter or a ticker remounts the embed at that second. It costs a
//  reload, and in exchange the chapter strip and the ticker rail do the one
//  thing they exist for. The strip marks where you JUMPED, which is a fact —
//  not where the playhead is, which would be a guess.
//
//  CONTRACT
//  Controlled and presentational. Everything derived — chapters, mentions,
//  durations — is computed by the caller out of src/video/video.js, so this
//  file never has to decide what is true about a video.
// ============================================================

import React, { useState } from "react";
import { C, MONO, SANS, TYPE, R } from "./theme.js";
import VideoFrame, { ytThumb } from "./VideoFrame.jsx";
import Waveform from "./Waveform.jsx";
import { clock, chapterSpans, chapterAt, relAge, compactCount, monogram } from "../video/video.js";

const railLabel = { ...TYPE.eyebrowSm, color: C.faint, letterSpacing: "1.5px" };
const FRAME_SHADOW = "0 26px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(70,167,88,0.06)";

// ---------- the poster ----------
function Poster({ video, durationSec, onPlay }) {
  const [thumbBad, setThumbBad] = useState(false);
  return (
    <div style={{
      position: "relative", width: "100%", aspectRatio: "16 / 9", overflow: "hidden",
      borderRadius: R.lg, border: `1px solid ${C.edge}`, background: "#080a0d",
      boxShadow: FRAME_SHADOW,
    }}>
      {!thumbBad && (
        <img src={ytThumb(video.id)} alt="" onError={() => setThumbBad(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      )}
      {/* The scrim is what keeps the chips legible over a thumbnail nobody
          here controls. Same gradient as the reference. */}
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "linear-gradient(180deg, rgba(8,10,13,0.55), transparent 30%, transparent 62%, rgba(8,10,13,0.85))",
      }} />
      <div aria-hidden="true" style={{ position: "absolute", top: 12, left: 14, display: "flex", gap: 8, pointerEvents: "none" }}>
        <span style={{ background: "rgba(11,14,19,0.82)", border: `1px solid ${C.edgeStrong}`, borderRadius: 20, padding: "4px 11px", fontFamily: MONO, fontSize: 10.5, letterSpacing: "1px", color: C.muted }}>YOUTUBE</span>
        {durationSec > 0 && (
          <span style={{ background: "rgba(11,14,19,0.82)", border: `1px solid ${C.edgeStrong}`, borderRadius: 20, padding: "4px 11px", fontFamily: MONO, fontSize: 10.5, color: C.muted }}>{clock(durationSec)}</span>
        )}
      </div>
      {/* 22% down rather than centred — the reference puts it there so it does
          not land on the middle of the frame, which is where a thumbnail
          usually carries its own title card. */}
      <button onClick={onPlay} aria-label={`Play ${video.title}`}
        style={{
          position: "absolute", left: "50%", top: "22%", transform: "translate(-50%, -50%)",
          width: 62, height: 62, borderRadius: "50%", border: "none", cursor: "pointer",
          background: "rgba(70,167,88,0.92)", color: C.textOnAccent,
          display: "grid", placeItems: "center", fontSize: 26, paddingLeft: 5, lineHeight: 1,
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        }}>&#9654;</button>
    </div>
  );
}

// ---------- chapter strip ----------
// Segments are weighted by how long each chapter runs. Equal segments would
// claim every chapter is the same size, which is the one thing the strip is
// there to disprove.
function Chapters({ chapters, durationSec, at, onSeek }) {
  if (!chapters.length) return null;
  const spans = chapterSpans(chapters, durationSec);
  const here = at == null ? -1 : chapterAt(chapters, at);
  return (
    <div style={{ display: "flex", gap: 5, marginTop: 12 }}>
      {spans.map((c, i) => {
        const on = i === here;
        return (
          <button key={c.start} onClick={() => onSeek(c.start)} className="v-chapseg"
            title={`Jump to ${clock(c.start)} — ${c.label}`}
            style={{
              flex: c.weight, minWidth: 0, textAlign: "left", cursor: "pointer",
              background: on ? "rgba(70,167,88,0.1)" : C.surface,
              border: `1px solid ${on ? C.accent : C.edge}`,
              borderRadius: R.sm, padding: "8px 10px",
            }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: on ? C.accentText : C.faint }}>{clock(c.start)}</div>
            <div style={{
              fontFamily: SANS, fontSize: 11.5, marginTop: 2, color: on ? C.text : C.muted,
              fontWeight: on ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{c.label}</div>
          </button>
        );
      })}
    </div>
  );
}



export default function VideoDesk({
  topic,
  video,                 // { id, title, channel, url, publishedAt, views }
  durationSec = 0,
  chapters = [],
  hasDescription = true, // false when the video came from a model, not the API
  mentions = [],         // [{ ticker, start, price, chgPct, held }]
  queue = [],            // [{ id, title, durationSec }]
  summary = null,        // { status: "running" | "done", rows, checks, model, ms }
  onSeekTicker,
  onPickQueue,
  onSummarize,
  onLoadMentions,
  onClose,
}) {
  // null = the poster. A number = the second the embed is mounted at, which is
  // both the seek and the "you are here" the chapter strip reads.
  const [at, setAt] = useState(null);
  const held = mentions.filter(m => m.held).length;
  const running = summary?.status === "running";

  return (
    <div style={{ background: C.base, border: `1px solid ${C.edge}`, borderRadius: R.xl, overflow: "hidden", color: C.text }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 22px", borderBottom: `1px solid ${C.edge}`, background: C.surfaceAlt, flexWrap: "wrap" }}>
        <span aria-hidden="true" style={{ width: 28, height: 28, background: C.surfaceRaised, borderRadius: 7, display: "grid", placeItems: "center", fontSize: 11 }}>&#9654;</span>
        <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 14.5 }}>Video desk</span>
        {topic && (
          <span style={{ background: C.surface, border: `1px solid ${C.edgeStrong}`, borderRadius: 20, padding: "3px 11px", fontFamily: MONO, fontSize: 11.5, fontWeight: 700, textTransform: "uppercase" }}>{topic}</span>
        )}
        {queue.length > 0 && (
          <span style={{ color: C.faint, fontFamily: MONO, fontSize: 11.5 }}>{queue.length} in queue</span>
        )}
        {/* The link and the close grouped, so a narrow header wraps them
            together. Left to themselves the auto margin pushes the ✕ onto a
            line of its own, where it reads as an orphan rather than as this
            panel's close. */}
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 12 }}>
          <a href={video.url} target="_blank" rel="noopener noreferrer" className="v-outline"
            style={{ color: C.muted, fontFamily: SANS, fontSize: 13, textDecoration: "none", border: `1px solid ${C.edgeStrong}`, borderRadius: R.sm, padding: "7px 13px", whiteSpace: "nowrap" }}>
            Open on YouTube &#8599;
          </a>
          {onClose && (
            <button onClick={onClose} className="v-clearx" aria-label="Close the video desk"
              style={{ background: "transparent", border: "none", color: C.faint, fontFamily: SANS, fontSize: 14, cursor: "pointer", padding: 2 }}>&#10005;</button>
          )}
        </span>
      </div>

      <div className="v-videobody" style={{ display: "flex", alignItems: "stretch" }}>
        <div style={{ flex: 1, minWidth: 0, padding: "18px 16px 20px 22px" }}>
          {at == null
            ? <Poster video={video} durationSec={durationSec} onPlay={() => setAt(0)} />
            : (
              <div style={{ borderRadius: R.lg, overflow: "hidden", border: `1px solid ${C.edge}`, boxShadow: FRAME_SHADOW }}>
                {/* keyed on the second: remounting the frame IS the seek */}
                <VideoFrame key={at} id={video.id} title={video.title} start={at} autoStart />
              </div>
            )}

          <Chapters chapters={chapters} durationSec={durationSec} at={at} onSeek={setAt} />

          <div style={{ marginTop: 16 }}>
            <div style={{ fontFamily: SANS, fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.3 }}>{video.title}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: "50%", background: C.surfaceRaised, border: `1px solid ${C.edgeStrong}`, display: "grid", placeItems: "center", fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: C.muted }}>{monogram(video.channel)}</span>
              <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600 }}>{video.channel}</span>
              {/* Printed only when the API gave us the numbers. A missing view
                  count is a fact; an invented one is not. */}
              {(video.publishedAt || video.views != null) && <span aria-hidden="true" style={{ color: C.edgeStrong }}>|</span>}
              <span style={{ color: C.faint, fontFamily: MONO, fontSize: 11.5 }}>
                {[relAge(video.publishedAt), video.views != null ? `${compactCount(video.views)} views` : ""].filter(Boolean).join(" · ")}
              </span>
              <button onClick={onSummarize} disabled={running} className="v-onair"
                style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(70,167,88,0.1)", border: `1px solid ${C.accent}`, borderRadius: R.sm, color: C.accentText, fontFamily: SANS, fontWeight: 700, fontSize: 12.5, padding: "7px 14px", cursor: running ? "default" : "pointer" }}>
                <Waveform />
                {running ? "Summarizing…" : "Summarize on air"}
              </button>
            </div>
          </div>
        </div>

        <div className="v-videorail" style={{ width: 320, flexShrink: 0, borderLeft: `1px solid ${C.edge}`, padding: "18px 22px 20px 18px", display: "flex", flexDirection: "column", gap: 15 }}>
          {/* Everything in this rail is read off the description. When the
              description names nothing the desk follows, the rail says so
              rather than filling with the symbols the video is "probably"
              about. */}
          <div style={{ animation: "vt-fadeup 0.5s var(--v-ease) both" }}>
            <div style={railLabel}>TICKERS MENTIONED</div>
            {mentions.length === 0 ? (
              <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.faint, marginTop: 9, lineHeight: 1.45 }}>
                {hasDescription
                  ? "This video's description doesn't name a symbol the desk follows."
                  : "This one came from the desk's own search, so there's no description to read tickers out of."}
              </div>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 9 }}>
                  {mentions.map(m => (
                    <button key={m.ticker} onClick={() => { setAt(m.start); onSeekTicker?.(m); }} className="v-lift"
                      title={`Jump to ${clock(m.start)} and load ${m.ticker} on the desk`}
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", cursor: "pointer", background: C.surface, border: `1px solid ${C.edge}`, borderRadius: 9, padding: "9px 11px" }}>
                      <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700, width: 46, color: C.text }}>{m.ticker}</span>
                      <span style={{ color: C.faint, fontFamily: MONO, fontSize: 10.5 }}>{clock(m.start)}</span>
                      <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 12, color: C.muted }}>
                        {m.price == null ? "—" : m.price}
                        {m.chgPct != null && (
                          <span style={{ color: m.chgPct >= 0 ? C.up : C.down }}> {m.chgPct >= 0 ? "+" : "−"}{Math.abs(m.chgPct).toFixed(2)}%</span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
                <div style={{ color: C.faint, fontFamily: SANS, fontSize: 11.5, marginTop: 9, lineHeight: 1.45 }}>
                  Tap a ticker to jump to that moment and load it on the desk.
                </div>
                {held > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 9, background: C.surfaceAlt, border: `1px solid ${C.edge}`, borderRadius: R.md, padding: "10px 12px", marginTop: 11 }}>
                    <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 6, background: C.surfaceRaised, display: "grid", placeItems: "center", color: C.warn, fontSize: 11 }}>!</span>
                    <span style={{ color: C.muted, fontFamily: SANS, fontSize: 11.5, lineHeight: 1.4 }}>
                      {held === 1 ? "One of these is in your portfolio." : `${held} of these are in your portfolio.`}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {queue.length > 0 && (
            <div style={{ animation: "vt-fadeup 0.5s var(--v-ease) 0.1s both" }}>
              <div style={railLabel}>UP NEXT</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 9 }}>
                {queue.map(q => (
                  <button key={q.id} onClick={() => onPickQueue?.(q)} className="v-upnext"
                    style={{ display: "flex", gap: 10, width: "100%", textAlign: "left", background: "transparent", border: "none", padding: 0, cursor: "pointer" }}>
                    {/* 78px wide. The handoff notes a placeholder tile cannot
                        say anything at this size, so it carries the real
                        thumbnail instead. */}
                    <span aria-hidden="true" style={{ width: 78, flexShrink: 0, aspectRatio: "16 / 9", borderRadius: 7, border: `1px solid ${C.edge}`, backgroundColor: C.surface, backgroundImage: `url(${ytThumb(q.id, "mqdefault")})`, backgroundSize: "cover", backgroundPosition: "center" }} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontFamily: SANS, fontSize: 12.5, fontWeight: 600, lineHeight: 1.35, color: C.text }}>{q.title}</span>
                      {q.durationSec > 0 && (
                        <span style={{ display: "block", color: C.faint, fontFamily: MONO, fontSize: 10.5, marginTop: 3 }}>{clock(q.durationSec)}</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: "auto", animation: "vt-fadeup 0.5s var(--v-ease) 0.18s both" }}>
            <div style={{ background: C.surfaceAlt, border: `1px solid ${C.edge}`, borderRadius: R.md, padding: 12 }}>
              <div style={railLabel}>SOURCE</div>
              <div style={{ color: C.muted, fontFamily: SANS, fontSize: 11.5, lineHeight: 1.45, marginTop: 7 }}>
                One creator&#39;s view, pulled from YouTube. Not advice, and not checked by the desk.
              </div>
            </div>
          </div>
        </div>
      </div>

      {summary?.status === "done" && (
        <VideoSummary video={video} summary={summary} onSeek={setAt} onLoad={onLoadMentions} />
      )}
      {/* A refusal has to be visible. Without this the button simply comes back
          to life and the desk looks like it decided not to bother. */}
      {summary?.status === "error" && (
        <div style={{ borderTop: `1px solid ${C.edge}`, padding: "14px 22px", fontFamily: SANS, fontSize: 13, lineHeight: 1.55, color: C.down }}>
          {summary.text}
        </div>
      )}
    </div>
  );
}

// ---------- the summary, once the desk has read it ----------
// Every timestamp here is a CHAPTER timestamp — a real one, out of the
// description. The model writes the sentence beside it; it never supplies the
// number, because it cannot watch the video to find one.
function VideoSummary({ video, summary, onSeek, onLoad }) {
  return (
    <div style={{ borderTop: `1px solid ${C.edge}`, padding: "18px 22px 20px" }}>
      <div style={{ fontFamily: SANS, fontSize: 16, fontWeight: 700, lineHeight: 1.4 }}>{video.title}</div>
      <div style={{ color: C.faint, fontFamily: SANS, fontSize: 12.5, marginTop: 4 }}>{video.channel} &#183; YouTube</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
        {summary.rows.map(r => (
          <button key={r.start} onClick={() => onSeek(r.start)}
            style={{ display: "flex", gap: 12, width: "100%", textAlign: "left", background: "transparent", border: "none", padding: 0, cursor: "pointer" }}>
            <span style={{ color: C.accentText, fontFamily: MONO, fontSize: 11, width: 42, flexShrink: 0, paddingTop: 2 }}>{clock(r.start)}</span>
            <span style={{ color: C.textBody, fontFamily: SANS, fontSize: 14, lineHeight: 1.55 }}>{r.text}</span>
          </button>
        ))}
      </div>

      {summary.checks && (
        <div style={{ background: C.surfaceAlt, border: `1px solid ${C.edge}`, borderRadius: R.lg, padding: "14px 16px", marginTop: 16 }}>
          <div style={railLabel}>WHAT THE DESK CHECKED</div>
          <div style={{ color: C.muted, fontFamily: SANS, fontSize: 13, lineHeight: 1.55, marginTop: 8 }}>{summary.checks}</div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        {/* "description - youtube", NOT "transcript - youtube". The Data API
            has no transcript endpoint, and naming a source we never read is
            the one kind of wrong this product exists not to be. */}
        <span style={{ background: C.surface, border: `1px solid ${C.edge}`, borderRadius: 12, padding: "3px 9px", fontFamily: MONO, fontSize: 11, color: C.faint }}>description &#183; youtube</span>
        <span style={{ color: C.faint, fontFamily: MONO, fontSize: 11 }}>
          {[summary.model, summary.ms != null ? `${(summary.ms / 1000).toFixed(1)}s` : ""].filter(Boolean).join(" · ")}
        </span>
        {onLoad && (
          <button onClick={onLoad} className="v-outline"
            style={{ marginLeft: "auto", color: C.muted, background: "transparent", fontFamily: SANS, fontSize: 12.5, border: `1px solid ${C.edgeStrong}`, borderRadius: R.sm, padding: "7px 13px", cursor: "pointer" }}>
            Load these on the desk
          </button>
        )}
      </div>
    </div>
  );
}
