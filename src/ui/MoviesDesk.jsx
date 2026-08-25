// ============================================================
//  MoviesDesk — a streaming catalogue opened on the desk.
//
//  WHAT THE HANDOFF ASKS FOR, AND WHAT IS REALLY THERE
//  The reference is a six-poster grid with a rank badge, a rating, a year and
//  a genre on each card, and a summary screen the anchor reads aloud. Nearly
//  all of it is in what TMDB returns. Four places it is not:
//
//  1. "TOP 6 · UNITED STATES · TODAY". There is no Netflix daily chart in
//     TMDB. The service list is discover sorted by a rolling popularity score,
//     and the trending list is a WEEK. src/movies/movies.js writes the header
//     line per path so the rank badge means a position in the list you are
//     actually looking at.
//
//  2. "DataHub · media/netflix" is prototype text — no such dataset exists —
//     so the footer pill names the endpoint the posters came from.
//
//  3. "gpt-4o-mini · 1.4s" under the summary. No model wrote it: the summary
//     is TMDB's own overview, printed as it was written. Attributing someone
//     else's paragraph to a model we never called would be the one kind of
//     wrong this product exists not to be, so the byline says TMDB.
//
//  4. The answer line — a waveform, "Pulling Netflix", a latency. The desk's
//     spoken reply is already in the transcript directly above this panel, so
//     repeating it here says the same thing twice. What survives is the part
//     that is not up there: the line stands while the fetch is in flight, and
//     the latency moves to the footer beside the rest of the provenance.
//
//  The waveform appears in exactly one place — the summary, while the anchor
//  is reading it — because that is the only moment sound is coming out.
//
//  CONTRACT
//  Controlled and presentational. Everything derived lives in
//  src/movies/movies.js, so this file never decides what is true about a film.
// ============================================================

import React, { useState, useEffect } from "react";
import { C, MONO, SANS, TYPE, R, segmentTrack, segmentItem } from "./theme.js";
import DeskIcon from "./DeskIcon.jsx";
import Waveform from "./Waveform.jsx";
import { relAge } from "../lib/time.js";
import { ratingText, ratingTitle, runtimeText, genreOfDetails, catalogHeading, catalogSource } from "../movies/movies.js";

const railLabel = { ...TYPE.eyebrowSm, fontSize: 10, color: C.faint, letterSpacing: "1.5px" };
const metaMono = { fontFamily: MONO, fontSize: 10.5, color: C.faint };
const HEAD_PAD = "14px 22px";
const outlineBtn = {
  background: "transparent", border: `1px solid ${C.edgeStrong}`, borderRadius: R.sm,
  padding: "7px 13px", fontFamily: SANS, fontSize: 12.5, color: C.muted, cursor: "pointer",
};

// ---------- the artwork ----------
// A poster, or the honest absence of one. Having a URL and having a picture are
// two different facts, and this used to test only the first: a poster that
// failed to load left the <img> sitting in the box at its natural size of
// nothing, so the card was a blank rectangle with a rank badge and a rating
// floating on it, and the NO POSTER tile written for exactly this case could
// never appear. It matters most on the free-films shelf, where the art comes
// from archive.org/services/img/{id} — an endpoint that genuinely has nothing
// for a good number of identifiers.
//
// The reset is keyed on the url because a shelf re-renders in place: the sixth
// card of one search becomes the sixth card of the next, and a failure carried
// across would blank a poster that loads perfectly well.
function Poster({ url }) {
  const [bad, setBad] = useState(false);
  useEffect(() => { setBad(false); }, [url]);
  if (!url || bad) {
    return (
      <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: C.faint, fontFamily: MONO, fontSize: 10, letterSpacing: "1.5px", padding: 8, textAlign: "center" }}>
        NO POSTER
      </span>
    );
  }
  return (
    <img src={url} alt="" loading="lazy" onError={() => setBad(true)}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
  );
}

// ---------- one poster ----------
function TitleCard({ item, rank, index, open, onOpen, archive }) {
  const rating = ratingText(item.rating);
  const meta = [item.year, item.genre].filter(Boolean).join(" · ");
  return (
    <div style={{ animation: `vt-fadeup 0.5s var(--v-ease) ${Math.min(0.04 + index * 0.06, 0.5)}s both` }}>
      <button onClick={onOpen} className="v-poster"
        title={archive ? `Play ${item.title} in the desk` : `${open ? "Close" : "Read"} the summary of ${item.title}`}
        style={{
          position: "relative", display: "block", width: "100%", padding: 0, aspectRatio: "2 / 3",
          borderRadius: R.md, overflow: "hidden", cursor: "pointer",
          border: `1px solid ${open ? C.accent : C.edge}`, background: C.surface,
        }}>
        <Poster url={item.poster} />
        {/* Both overlays are inert. The handoff learned this the hard way on
            its own drop slots: anything sitting on top of the target eats the
            click where the artwork most invites one. */}
        {rank != null && (
          <span aria-hidden="true" style={{ position: "absolute", top: 8, left: 8, pointerEvents: "none", background: "rgba(11,14,19,0.86)", borderRadius: 6, padding: "2px 7px", fontFamily: MONO, fontSize: 10, color: C.muted }}>
            #{rank}
          </span>
        )}
        {rating && (
          <span title={ratingTitle(item.rating, item.votes)} style={{ position: "absolute", top: 8, right: 8, pointerEvents: "none", display: "flex", alignItems: "center", gap: 4, background: "rgba(11,14,19,0.86)", border: `1px solid ${C.edgeStrong}`, borderRadius: 20, padding: "3px 8px", fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.accentText }}>
            ★ {rating}
          </span>
        )}
      </button>
      <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, marginTop: 9, lineHeight: 1.35, color: C.text }}>{item.title}</div>
      {meta && <div style={{ ...metaMono, marginTop: 3 }}>{meta}</div>}
      <button onClick={onOpen} className="v-readlink"
        style={{ background: "transparent", border: "none", padding: "3px 0 0", marginTop: 4, color: C.accentText, fontFamily: SANS, fontSize: 11.5, cursor: "pointer" }}>
        {archive ? "Play in the desk" : open ? "Close summary" : "Read summary"}
      </button>
    </div>
  );
}

// ---------- the summary, once a title is open ----------
function Summary({ item, heading, rank, speaking, details, onTrailer, onWatchOn, serviceName, onStop }) {
  const rating = ratingText(item.rating);
  // The runtime only exists once the details call lands; until then the line
  // is year · genre and grows a middle when there is one to grow.
  const line = [item.year, runtimeText(details?.runtime), genreOfDetails(details?.genres) || item.genre].filter(Boolean).join(" · ");

  return (
    <div style={{ borderTop: `1px solid ${C.edge}`, padding: "20px 22px" }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {/* Gated on there being a path at all — beside a paragraph, a poster is
            decoration, and an empty frame is worse than no frame. Once there IS
            one the same rule as the grid applies: a url that does not resolve
            says so rather than leaving a blank rectangle. */}
        {item.poster && (
          <div style={{ width: 128, flex: "0 0 auto", position: "relative", borderRadius: R.md, overflow: "hidden", border: `1px solid ${C.edge}`, aspectRatio: "2 / 3" }}>
            <Poster url={item.poster} />
          </div>
        )}
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <div style={railLabel}>{[heading, rank != null ? `#${rank}` : ""].filter(Boolean).join(" · ")}</div>
          <div style={{ fontFamily: SANS, fontSize: 21, fontWeight: 700, letterSpacing: "-0.019em", marginTop: 5, lineHeight: 1.25 }}>{item.title}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 8, flexWrap: "wrap" }}>
            {rating && <span title={ratingTitle(item.rating, item.votes)} style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.accentText }}>★ {rating}</span>}
            {rating && line && <span aria-hidden="true" style={{ color: C.edgeStrong }}>|</span>}
            {line && <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.muted }}>{line}</span>}
          </div>
          {/* Mounted only while the anchor is actually talking. */}
          {speaking && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.surface, border: `1px solid ${C.edge}`, borderRadius: R.md, padding: "10px 12px", marginTop: 12 }}>
              <Waveform height={14} width={3} gap={2.5} />
              <span style={{ color: C.live, fontFamily: SANS, fontSize: 12, fontWeight: 600 }}>Reading the summary</span>
              <button onClick={onStop} className="v-clearx" aria-label="Stop reading"
                style={{ marginLeft: "auto", background: "transparent", border: "none", color: C.faint, fontFamily: SANS, fontSize: 13, cursor: "pointer", padding: 2 }}>&#10005;</button>
            </div>
          )}
        </div>
      </div>

      {/* TMDB's own words, in the colour this system keeps for a paragraph the
          desk is reading out on somebody else's behalf. */}
      <div style={{ color: C.textBody, fontFamily: SANS, fontSize: 14.5, lineHeight: 1.65, marginTop: 16, textWrap: "pretty" }}>
        {item.overview || "TMDB has no summary on file for this one."}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        {/* No model byline. The paragraph above is TMDB's, not a model's. */}
        <span style={{ background: C.surface, border: `1px solid ${C.edge}`, borderRadius: R.lg, padding: "3px 9px", fontFamily: MONO, fontSize: 11, color: C.faint }}>
          summary · tmdb
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
          {onWatchOn && serviceName && (
            <button onClick={onWatchOn} className="v-outline" style={outlineBtn}>Watch on {serviceName} &#8599;</button>
          )}
          {onTrailer && <button onClick={onTrailer} className="v-outline" style={outlineBtn}>Play trailer</button>}
        </span>
      </div>
    </div>
  );
}

export default function MoviesDesk({
  catalog,            // { service?, popular?, archive?, kind, region, loading, items:[], error?, ms? }
  fetchedAt = null,
  pick = null,        // the open title
  pickDetails = null, // { runtime, genres } once /details lands
  speaking = false,   // the anchor is reading the open summary
  onOpen,             // (item, index) => void
  onStopRead,
  onKind,             // (kind) => void
  onTrailer,
  onWatchOn,
  onAskPick,          // "Ask the desk to pick one"
  onClose,
}) {
  const items = catalog.items || [];
  const { name, note } = catalogHeading({ ...catalog, count: items.length });
  const archive = !!catalog.archive;
  const pickIndex = pick ? items.findIndex(i => (i.archiveId || i.id) === (pick.archiveId || pick.id)) : -1;

  return (
    <section aria-label="Streaming catalogue"
      style={{ background: C.base, border: `1px solid ${C.edge}`, borderRadius: R.xl, overflow: "hidden", color: C.text }}>

      {/* ---- header ---- */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: HEAD_PAD, borderBottom: `1px solid ${C.edge}`, background: C.surfaceAlt, flexWrap: "wrap" }}>
        <span aria-hidden="true" style={{ width: 28, height: 28, background: C.surfaceRaised, borderRadius: R.xs, display: "grid", placeItems: "center", color: C.text, flexShrink: 0 }}>
          <DeskIcon name="catalog" size={14} />
        </span>
        <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 14.5 }}>{name}</span>
        <span style={{ color: C.faint, fontFamily: MONO, fontSize: 11.5 }}>{note}</span>

        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {/* Neutral, not the reference's solid green. This system gives a
              segment the accent only for a choice that changes what the
              product IS — demo numbers against real ones — and movies against
              shows is a view of the same catalogue. The green on this screen
              belongs to Read summary, which is the thing you came to do. */}
          {!archive && onKind && (
            <span style={segmentTrack()}>
              {[["movie", "Movies"], ["tv", "Shows"]].map(([k, label]) => (
                <button key={k} onClick={() => onKind(k)} aria-pressed={catalog.kind === k} style={segmentItem(catalog.kind === k)}>
                  {label}
                </button>
              ))}
            </span>
          )}
          {onClose && (
            <button onClick={onClose} className="v-clearx" aria-label="Close the catalogue"
              style={{ background: "transparent", border: "none", color: C.faint, fontFamily: SANS, fontSize: 14, cursor: "pointer", padding: 2 }}>&#10005;</button>
          )}
        </span>
      </div>

      {/* ---- body ---- */}
      {catalog.loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "18px 22px" }}>
          <span className="v-pulse" aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, flexShrink: 0 }} />
          {/* "Pulling Netflix — movies on the desk", the reference's line, works
              because Netflix is a brand and "movies" says what we are taking
              from it. The other two lists are named for what they ARE, and the
              template turned that into "Pulling Free films — films on the desk"
              and "Pulling Trending — movies on the desk". A panel that cannot
              say one sentence about itself is not going to be believed about
              the ratings. Three lists, three sentences. */}
          <span style={{ fontFamily: SANS, fontSize: 14, color: C.muted }}>
            {catalog.service
              ? `Pulling ${name} — ${catalog.kind === "tv" ? "shows" : "movies"} on the desk.`
              : archive
                ? "Pulling free films onto the desk."
                : `Pulling this week's trending ${catalog.kind === "tv" ? "shows" : "movies"} onto the desk.`}
          </span>
        </div>
      ) : catalog.error ? (
        <div role="alert" style={{ padding: "18px 22px", fontFamily: SANS, fontSize: 13.5, lineHeight: 1.6, color: C.down }}>{catalog.error}</div>
      ) : items.length === 0 ? (
        <div style={{ padding: "18px 22px", fontFamily: SANS, fontSize: 13.5, color: C.faint }}>Nothing came back. Try another search.</div>
      ) : (
        <>
          {/* The shelf is the query container; the grid inside it is what the
              query sizes. Two elements because an element cannot ask its own
              size — the same split as .v-chessboard / .v-chessgrid. */}
          <div className="v-movieshelf" style={{ padding: "18px 22px 20px" }}>
            <div className="v-moviegrid">
              {items.map((it, i) => (
                <TitleCard key={it.archiveId || it.id || i} item={it} index={i}
                  // A rank on the archive list would be a chart position invented
                  // out of a keyword search's result order.
                  rank={archive ? null : i + 1}
                  open={pickIndex === i}
                  archive={archive}
                  onOpen={() => onOpen?.(it, i)} />
              ))}
            </div>
          </div>

          {pick && !archive && (
            <Summary item={pick} heading={name.toUpperCase()} rank={pickIndex >= 0 ? pickIndex + 1 : null}
              speaking={speaking} details={pickDetails} serviceName={catalog.service?.name}
              onTrailer={onTrailer ? () => onTrailer(pick) : null}
              onWatchOn={onWatchOn && catalog.service ? () => onWatchOn(pick) : null}
              onStop={onStopRead} />
          )}

          {/* ---- footer ---- */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: HEAD_PAD, borderTop: `1px solid ${C.edge}`, flexWrap: "wrap" }}>
            <span style={{ background: C.surface, border: `1px solid ${C.edge}`, borderRadius: R.lg, padding: "3px 9px", fontFamily: MONO, fontSize: 11, color: C.faint }}>
              {catalogSource(catalog)}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>
              {[
                archive ? "" : "ratings from TMDB",
                fetchedAt ? `refreshed ${relAge(fetchedAt)}` : "",
                catalog.ms != null ? `${(catalog.ms / 1000).toFixed(1)}s` : "",
              ].filter(Boolean).join(" · ")}
            </span>
            {onAskPick && (
              <button onClick={onAskPick} className="v-outline" style={{ ...outlineBtn, marginLeft: "auto" }}>
                Ask the desk to pick one
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
