import { describe, it, expect } from "vitest";
import { makeDictLoader, makeT } from "./index.js";
// Imported by language rather than by code, because one of the five codes is
// `it` and importing that shadows vitest's own `it` — every test in the file
// then fails to register with "default is not a function", which names the
// symptom and nothing else.
import spanish from "./es.js";
import french from "./fr.js";
import german from "./de.js";
import portuguese from "./pt.js";
import italian from "./it.js";

// A dictionary as the loader hands it over: the table plus the language it is
// FOR, which is the part that stops it being used for a different one.
const dict = (code, table) => ({ code, table });

describe("translating", () => {
  it("hands English straight back, with no dictionary in sight", () => {
    // English is the key set, so there is nothing to look up and — the reason
    // this matters — nothing to fetch either.
    const t = makeT("en", null);
    expect(t("Resign")).toBe("Resign");
  });

  it("reads a language out of its own dictionary", () => {
    const t = makeT("es", dict("es", { Resign: "Rendirse" }));
    expect(t("Resign")).toBe("Rendirse");
  });

  it("falls back to the English key for anything the dictionary is missing", () => {
    const t = makeT("es", dict("es", { Resign: "Rendirse" }));
    expect(t("New game")).toBe("New game");
  });

  // The one that earns this module. State holds the last dictionary that
  // arrived, so during a switch it holds the language you just LEFT. Without
  // the code check, half the screen would render as confident Spanish while
  // French was still loading — which is worse than English and much harder to
  // catch, because it looks like a finished translation.
  it("refuses a dictionary that belongs to another language", () => {
    const t = makeT("fr", dict("es", { Resign: "Rendirse" }));
    expect(t("Resign")).toBe("Resign");
  });

  it("reads as English while the dictionary is still on its way", () => {
    expect(makeT("de", null)("Resign")).toBe("Resign");
    expect(makeT("de", undefined)("Resign")).toBe("Resign");
  });
});

describe("fetching a dictionary", () => {
  // A loader map that counts calls, so "did it fetch twice" is a fact rather
  // than an assumption.
  const spy = (tables = { es: { Resign: "Rendirse" }, fr: { Resign: "Abandonner" } }) => {
    const calls = {};
    const loaders = {};
    for (const [code, table] of Object.entries(tables)) {
      loaders[code] = () => { calls[code] = (calls[code] || 0) + 1; return Promise.resolve({ default: table }); };
    }
    return { loaders, calls };
  };

  it("never asks for English", async () => {
    const { loaders, calls } = spy();
    const { loadDict, peekDict } = makeDictLoader(loaders);
    expect(await loadDict("en")).toBe(null);
    expect(peekDict("en")).toBe(null);
    expect(calls).toEqual({});
  });

  it("never asks for a language it does not have", async () => {
    const { loaders, calls } = spy();
    const { loadDict } = makeDictLoader(loaders);
    expect(await loadDict("kl")).toBe(null);
    expect(calls).toEqual({});
  });

  it("fetches once and serves every later ask from memory", async () => {
    const { loaders, calls } = spy();
    const { loadDict } = makeDictLoader(loaders);
    await loadDict("es");
    await loadDict("es");
    await loadDict("es");
    expect(calls.es).toBe(1);
  });

  it("shares one request between asks that overlap", async () => {
    // Switching es → fr → es in the time one chunk takes must not put two
    // requests for the same file on the wire.
    let release;
    const table = { Resign: "Rendirse" };
    const gate = new Promise(r => { release = () => r({ default: table }); });
    let calls = 0;
    const { loadDict } = makeDictLoader({ es: () => { calls++; return gate; } });
    const a = loadDict("es"), b = loadDict("es");
    release();
    expect(await a).toEqual(await b);
    expect(calls).toBe(1);
  });

  it("has nothing to peek at before the fetch and the dictionary after it", async () => {
    // peek is what lets switching BACK to a language happen in one frame, with
    // no flash of English on the way.
    const { loaders } = spy();
    const { loadDict, peekDict } = makeDictLoader(loaders);
    expect(peekDict("es")).toBe(null);
    await loadDict("es");
    expect(peekDict("es")).toEqual(dict("es", { Resign: "Rendirse" }));
  });

  it("forgets a chunk that would not load, so the next switch can try again", async () => {
    // A failed fetch must not be cached as a failure: the reader gets English
    // meanwhile, which is exactly what a missing key gets, and picking the
    // language again has to be worth doing.
    let attempts = 0;
    const { loadDict, peekDict } = makeDictLoader({
      es: () => { attempts++; return attempts === 1 ? Promise.reject(new Error("offline")) : Promise.resolve({ default: { Resign: "Rendirse" } }); },
    });
    expect(await loadDict("es")).toBe(null);
    expect(peekDict("es")).toBe(null);
    expect(await loadDict("es")).toEqual(dict("es", { Resign: "Rendirse" }));
    expect(attempts).toBe(2);
  });
});

describe("the five dictionaries", () => {
  const ALL = { es: spanish, fr: french, de: german, pt: portuguese, it: italian };

  it("all translate the same key set, so no language is quietly short", () => {
    // They were one object in React.jsx and a missing key was visible by
    // reading down the column. They are five files now and nobody reads five
    // files side by side, so the invariant has to be stated somewhere.
    const counts = Object.fromEntries(Object.entries(ALL).map(([c, d]) => [c, Object.keys(d).length]));
    const union = new Set(Object.values(ALL).flatMap(d => Object.keys(d)));
    for (const [code, table] of Object.entries(ALL)) {
      const missing = [...union].filter(k => !(k in table));
      expect({ code, missing }).toEqual({ code, missing: [] });
    }
    expect(counts).toEqual({ es: union.size, fr: union.size, de: union.size, pt: union.size, it: union.size });
  });

  it("keeps every placeholder its English key carries", () => {
    // "move {n}" translated without its {n} prints a sentence with the number
    // silently gone. Nothing throws and nothing looks broken; the reader just
    // never learns which move it is.
    const marks = (s) => (s.match(/\{[a-zA-Z]\}/g) || []).sort();
    for (const [code, table] of Object.entries(ALL)) {
      const dropped = Object.entries(table)
        .filter(([k, v]) => marks(k).join() !== marks(v).join())
        .map(([k]) => k);
      expect({ code, dropped }).toEqual({ code, dropped: [] });
    }
  });

  it("translates something, rather than echoing the English back", () => {
    // A file that failed to load, or one filled with stubs, would still pass
    // every test above. Most entries have to actually differ from their key —
    // not all, because "DPS {n}" is "DPS {n}" in all five.
    for (const [code, table] of Object.entries(ALL)) {
      const rows = Object.entries(table);
      const translated = rows.filter(([k, v]) => k !== v).length;
      expect({ code, most: translated > rows.length * 0.8 }).toEqual({ code, most: true });
    }
  });
});
