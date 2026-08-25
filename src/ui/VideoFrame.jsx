// ============================================================
//  VideoFrame — the in-app YouTube player.
//
//  It lived inside React.jsx, which meant the only place a video could play
//  was the player docked at the top of the desk: you clicked a video in the
//  news panel and it started somewhere else. It is its own module now so the
//  surfaces that LIST videos can also play them.
//
//  Black is black on purpose. A letterbox is not a themed surface — it is the
//  absence of picture — so the two colours here do not track the palette and a
//  future retheme sweep should leave them alone.
// ============================================================

import React, { useState } from "react";
import { MONO, R } from "./theme.js";

// The id inside any YouTube URL shape we are likely to be handed.
export function ytId(url) {
  const m = url?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{6,})/);
  return m ? m[1] : null;
}

export const ytThumb = (id, size = "hqdefault") => `https://i.ytimg.com/vi/${id}/${size}.jpg`;
export const ytWatch = (id) => `https://www.youtube.com/watch?v=${id}`;

// YouTube answers a dead id with a 120x90 grey placeholder rather than a 404,
// which is the cheapest liveness check there is: a thumbnail that comes back
// 120 wide is an id that would have embedded as a black box. Models invent
// video ids constantly, so anything that shows a thumbnail runs this first —
// the picture and the proof are the same request.
export const ytThumbIsReal = (img) => img && img.naturalWidth > 120;

// autoStart: the caller has already taken a click for this video (the news
// panel's rows are the play button), so a second play button inside the frame
// would be a click that does nothing but repeat itself.
//
// start: the second the embed opens at. There is no seek API here on purpose —
// controlling a running player means loading YouTube's IFrame API script from
// youtube.com, which would undo the reason every embed in this product points
// at youtube-nocookie.com. Remounting the frame with a new start IS the seek,
// and it is the caller's job to change the React key when it wants one.
export default function VideoFrame({ id, title, autoStart = false, start = 0 }) {
  const [playing, setPlaying] = useState(!!autoStart);
  const [thumbBad, setThumbBad] = useState(false);
  const watch = start > 0 ? `${ytWatch(id)}&t=${Math.floor(start)}s` : ytWatch(id);
  const ytLink = (label, pos) => (
    <a href={watch} target="_blank" rel="noopener noreferrer"
      style={{ position: "absolute", ...pos, zIndex: 2, background: "rgba(0,0,0,0.78)", color: "#fff", fontFamily: MONO, fontSize: 12, padding: "3px 8px", borderRadius: R.sm, textDecoration: "none" }}>
      {label}
    </a>
  );
  if (playing) {
    return (
      <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", background: "#000" }}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&modestbranding=1&rel=0${start > 0 ? `&start=${Math.floor(start)}` : ""}`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
        />
        {/* Uploaders can forbid embedding, and there is no way to know before
            the frame loads. The escape hatch has to be visible on the player
            itself, because the failure looks exactly like a video that has not
            started yet. */}
        {ytLink("black? open on YouTube ↗", { top: 6, right: 6 })}
      </div>
    );
  }
  return (
    <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", background: "#000", overflow: "hidden" }}>
      {!thumbBad && (
        <img src={ytThumb(id)} alt="" onError={() => setThumbBad(true)}
          onLoad={e => { if (!ytThumbIsReal(e.currentTarget)) setThumbBad(true); }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      )}
      <button onClick={() => setPlaying(true)} aria-label={`Play ${title || "video"} inline`}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ width: 62, height: 62, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "2px solid rgba(255,255,255,0.9)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#fff", fontSize: 24, marginLeft: 4, lineHeight: 1 }}>▶</span>
        </span>
      </button>
      {ytLink("YouTube ↗", { bottom: 8, right: 8 })}
    </div>
  );
}
