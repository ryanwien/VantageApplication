// ============================================================
//  movies.js — what the desk can actually know about a title.
//
//  THE CONSTRAINT THIS MODULE EXISTS FOR
//  The reference's header reads "top 6 · United States · today" and its cards
//  carry a rank, a rating, a year and a genre. Three of those four are real in
//  what TMDB returns; the other two need care.
//
//  "TODAY" IS THE ONE THAT IS NOT TRUE
//  There is no Netflix daily chart in TMDB. The Netflix list is
//  discover/{kind} with with_watch_providers=8 and sort_by=popularity.desc —
//  a rolling popularity score over a whole catalogue, not a chart for a day.
//  The trending list is /trending/{kind}/week, which is a week. So the header
//  says which of those it is looking at, and the rank badge is honest as a
//  position in THAT list rather than as a chart position it is not.
//
//  GENRE IS NOT IN THE LIST RESPONSE
//  discover and trending return `genre_ids` — numbers. The names come from
//  /genre/{kind}/list, one call that changes about never, so the caller fetches
//  it once and passes the map in. Without the map a card simply has no genre
//  on it, which is what an unresolved id honestly amounts to.
// ============================================================

// TMDB's own image CDN. w342 is the smallest size that still looks right on a
// 2:3 poster at the widths this grid uses; w185 (what the old panel asked for)
// is visibly soft once the card is more than about 120px wide.
export function posterUrl(path, size = "w342") {
  const p = String(path || "").trim();
  return p ? `https://image.tmdb.org/t/p/${size}${p.startsWith("/") ? "" : "/"}${p}` : null;
}

export function yearOf(m) {
  const d = String(m?.release_date || m?.first_air_date || "").trim();
  return /^\d{4}/.test(d) ? d.slice(0, 4) : "";
}

// TMDB sends vote_average: 0 for a title nobody has rated, and a 0 rendered as
// "★ 0.0" reads as "rated zero" rather than "not rated". Absent is the truth.
export function ratingOf(vote) {
  const v = Number(vote);
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function ratingText(vote) {
  const v = ratingOf(vote);
  return v == null ? "" : v.toFixed(1);
}

// The vote count rides along in the tooltip rather than being used to hide low
// -confidence ratings. A 9.0 off four votes is worth knowing about; silently
// suppressing it would be the desk deciding what you may see.
export function ratingTitle(vote, votes) {
  const v = ratingOf(vote);
  if (v == null) return "Not yet rated on TMDB";
  const n = Number(votes);
  return Number.isFinite(n) && n > 0
    ? `${v.toFixed(1)} from ${n.toLocaleString("en-US")} vote${n === 1 ? "" : "s"} on TMDB`
    : `${v.toFixed(1)} on TMDB`;
}

export function runtimeText(min) {
  const n = Number(min);
  return Number.isFinite(n) && n > 0 ? `${Math.round(n)} min` : "";
}

export function genreMap(list) {
  const out = {};
  for (const g of Array.isArray(list) ? list : []) {
    if (g && Number.isFinite(Number(g.id)) && g.name) out[Number(g.id)] = String(g.name);
  }
  return out;
}

// The FIRST genre only. TMDB gives three or four and the card has room for one;
// the first is the one TMDB itself leads with. Uppercased because it sits in
// the mono metadata line beside the year, which is the instrument voice.
export function genreOf(ids, map = {}) {
  for (const id of Array.isArray(ids) ? ids : []) {
    const name = map[Number(id)];
    if (name) return name.toUpperCase();
  }
  return "";
}

// Named genres straight off a details response, for the one title the summary
// is open on — no id map needed, because /{kind}/{id} spells them out.
export function genreOfDetails(genres) {
  const first = (Array.isArray(genres) ? genres : []).find(g => g?.name);
  return first ? String(first.name).toUpperCase() : "";
}

export function shape(m, kind, gmap = {}) {
  return {
    id: m?.id,
    kind,
    title: m?.title || m?.name || "",
    rating: ratingOf(m?.vote_average),
    votes: Number(m?.vote_count) || null,
    year: yearOf(m),
    genre: genreOf(m?.genre_ids, gmap),
    poster: posterUrl(m?.poster_path),
    overview: String(m?.overview || "").trim(),
  };
}

// The mono line under the panel's name. Each branch says what its endpoint
// actually is, because the three of them are three different claims:
//   a service  → most popular in a region, by TMDB's rolling popularity score
//   trending   → the week's chart, worldwide
//   archive    → a public-domain search, not a chart at all
const REGIONS = { US: "United States", GB: "United Kingdom", CA: "Canada", AU: "Australia", DE: "Germany", FR: "France" };
export function regionName(code) {
  const c = String(code || "").toUpperCase();
  return REGIONS[c] || c;
}

export function catalogHeading(catalog = {}) {
  const n = catalog.count || 0;
  const top = n > 0 ? `top ${n}` : "";
  if (catalog.archive) {
    return { name: "Free films", note: ["public domain", "Internet Archive"].join(" · ") };
  }
  if (catalog.popular) {
    // /trending/{kind}/week. Not "today" — the reference's word — because the
    // endpoint this list comes from is a week long.
    return { name: "Trending", note: [top, "this week"].filter(Boolean).join(" · ") };
  }
  return {
    name: catalog.service?.name || "Streaming",
    // "by popularity" rather than "today": sort_by=popularity.desc is a rolling
    // score over the whole catalogue, and no daily Netflix chart exists here.
    note: [top, regionName(catalog.region || "US"), "by popularity"].filter(Boolean).join(" · "),
  };
}

// The footer pill. The reference reads "DataHub · media/netflix"; there is no
// such dataset — it is prototype text — so this names the endpoint the titles
// really came from, which is the fact worth having.
export function catalogSource(catalog = {}) {
  if (catalog.archive) return "archive.org · movies";
  if (catalog.popular) return `tmdb · trending/${catalog.kind === "tv" ? "tv" : "movie"}/week`;
  return `tmdb · discover/${catalog.kind === "tv" ? "tv" : "movie"}`;
}
