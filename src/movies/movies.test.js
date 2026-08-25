import { describe, it, expect } from "vitest";
import {
  posterUrl, yearOf, ratingOf, ratingText, ratingTitle, runtimeText,
  genreMap, genreOf, genreOfDetails, shape, regionName, catalogHeading, catalogSource,
} from "./movies.js";

const GENRES = genreMap([{ id: 28, name: "Action" }, { id: 80, name: "Crime" }, { id: 27, name: "Horror" }]);

describe("posterUrl", () => {
  it("builds a TMDB CDN url at a size the grid can actually use", () => {
    expect(posterUrl("/abc.jpg")).toBe("https://image.tmdb.org/t/p/w342/abc.jpg");
  });
  it("tolerates a path without its leading slash", () => {
    expect(posterUrl("abc.jpg")).toBe("https://image.tmdb.org/t/p/w342/abc.jpg");
  });
  it("answers null for a title with no poster, rather than a broken url", () => {
    for (const bad of [null, undefined, "", "   "]) expect(posterUrl(bad)).toBe(null);
  });
});

describe("yearOf", () => {
  it("reads either date field", () => {
    expect(yearOf({ release_date: "2018-06-05" })).toBe("2018");
    expect(yearOf({ first_air_date: "2023-01-30" })).toBe("2023");
  });
  it("prints nothing for an unreleased or undated title", () => {
    expect(yearOf({ release_date: "" })).toBe("");
    expect(yearOf({})).toBe("");
  });
});

describe("ratings", () => {
  it("treats TMDB's 0 as unrated, not as a score of zero", () => {
    expect(ratingOf(0)).toBe(null);
    expect(ratingText(0)).toBe("");
    expect(ratingTitle(0)).toBe("Not yet rated on TMDB");
  });
  it("prints one decimal, the way TMDB does", () => {
    expect(ratingText(7.9)).toBe("7.9");
    expect(ratingText(7)).toBe("7.0");
  });
  it("puts the vote count in the tooltip instead of hiding thin ratings", () => {
    expect(ratingTitle(9.0, 4)).toBe("9.0 from 4 votes on TMDB");
    expect(ratingTitle(6.6, 1204)).toBe("6.6 from 1,204 votes on TMDB");
    expect(ratingTitle(6.6, 1)).toBe("6.6 from 1 vote on TMDB");
    expect(ratingTitle(6.6, 0)).toBe("6.6 on TMDB");
  });
});

describe("runtimeText", () => {
  it("prints minutes when there are any", () => {
    expect(runtimeText(96)).toBe("96 min");
  });
  it("prints nothing when the details call had none", () => {
    for (const bad of [0, null, undefined, "", NaN]) expect(runtimeText(bad)).toBe("");
  });
});

describe("genres", () => {
  it("resolves the first id the map knows", () => {
    expect(genreOf([80, 28], GENRES)).toBe("CRIME");
  });
  it("skips ids the map does not have rather than printing a number", () => {
    expect(genreOf([9999, 27], GENRES)).toBe("HORROR");
  });
  it("prints nothing with no map, no ids, or nothing recognised", () => {
    expect(genreOf([28], {})).toBe("");
    expect(genreOf([], GENRES)).toBe("");
    expect(genreOf(undefined, GENRES)).toBe("");
    expect(genreOf([9999], GENRES)).toBe("");
  });
  it("reads named genres straight off a details response", () => {
    expect(genreOfDetails([{ id: 28, name: "Action" }, { id: 53, name: "Thriller" }])).toBe("ACTION");
    expect(genreOfDetails([])).toBe("");
    expect(genreOfDetails(undefined)).toBe("");
  });
  it("ignores malformed rows when building the map", () => {
    expect(genreMap([{ id: 1, name: "A" }, { id: 2 }, { name: "C" }, null, "x"])).toEqual({ 1: "A" });
    expect(genreMap(null)).toEqual({});
  });
});

describe("shape", () => {
  const raw = {
    id: 447365, title: "The Debt Collector", vote_average: 7.9, vote_count: 1204,
    release_date: "2018-06-05", poster_path: "/x.jpg", overview: "  A martial artist…  ",
    genre_ids: [28, 80],
  };
  it("normalises one TMDB row into what a card needs", () => {
    expect(shape(raw, "movie", GENRES)).toEqual({
      id: 447365, kind: "movie", title: "The Debt Collector",
      rating: 7.9, votes: 1204, year: "2018", genre: "ACTION",
      poster: "https://image.tmdb.org/t/p/w342/x.jpg", overview: "A martial artist…",
    });
  });
  it("uses `name` for a show, which is the field TV rows carry", () => {
    expect(shape({ id: 1, name: "Wednesday", first_air_date: "2022-11-23" }, "tv").title).toBe("Wednesday");
  });
  it("survives a row missing everything optional", () => {
    expect(shape({ id: 5 }, "movie")).toEqual({
      id: 5, kind: "movie", title: "", rating: null, votes: null,
      year: "", genre: "", poster: null, overview: "",
    });
  });
});

describe("catalogHeading", () => {
  it("will not say 'today' about a list that is sorted by a rolling score", () => {
    // discover + sort_by=popularity.desc. There is no Netflix daily chart here.
    const h = catalogHeading({ service: { name: "Netflix" }, kind: "movie", region: "US", count: 6 });
    expect(h).toEqual({ name: "Netflix", note: "top 6 · United States · by popularity" });
    expect(h.note).not.toContain("today");
  });
  it("calls the trending list a week, because /trending/movie/week is a week", () => {
    expect(catalogHeading({ popular: true, kind: "movie", count: 6 }))
      .toEqual({ name: "Trending", note: "top 6 · this week" });
  });
  it("does not call the archive search a chart", () => {
    const h = catalogHeading({ archive: true, count: 12 });
    expect(h).toEqual({ name: "Free films", note: "public domain · Internet Archive" });
    expect(h.note).not.toContain("top");
  });
  it("drops the count when there is nothing in the list", () => {
    expect(catalogHeading({ popular: true, kind: "movie", count: 0 }).note).toBe("this week");
  });
  it("spells a region out, and falls back to the code it does not know", () => {
    expect(regionName("US")).toBe("United States");
    expect(regionName("JP")).toBe("JP");
    expect(catalogHeading({ service: { name: "Hulu" }, kind: "tv", region: "GB", count: 6 }).note)
      .toBe("top 6 · United Kingdom · by popularity");
  });
});

describe("catalogSource", () => {
  it("names the endpoint rather than a dataset that does not exist", () => {
    expect(catalogSource({ service: { name: "Netflix" }, kind: "movie" })).toBe("tmdb · discover/movie");
    expect(catalogSource({ service: { name: "Hulu" }, kind: "tv" })).toBe("tmdb · discover/tv");
    expect(catalogSource({ popular: true, kind: "movie" })).toBe("tmdb · trending/movie/week");
    expect(catalogSource({ popular: true, kind: "tv" })).toBe("tmdb · trending/tv/week");
    expect(catalogSource({ archive: true })).toBe("archive.org · movies");
  });
  it("never claims DataHub, which has no media dataset", () => {
    for (const c of [{ popular: true }, { archive: true }, { service: { name: "Netflix" }, kind: "movie" }]) {
      expect(catalogSource(c)).not.toMatch(/datahub/i);
    }
  });
});
