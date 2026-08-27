// Five dictionaries, one chunk each, fetched when somebody picks a language.
//
// They used to be 3,690 lines in the middle of React.jsx — 280kB raw, about a
// third of the main bundle's raw bytes — and every reader downloaded all five.
// A reader has one language. Translation tables are almost nothing but string
// literals, which a minifier cannot shorten, so this was weight that landed on
// every first paint and did nothing for four visitors out of five.
//
// What it costs: the table now arrives over the network, so there is a window
// where the app is running and its dictionary is not here yet. English is what
// shows in that window. The check that makes that true rather than showing the
// PREVIOUS language is one line, in makeT, and it is the load-bearing part of
// this module.
//
// English is never a dictionary and never a request. It is the key set itself.

// Vite splits on the static shape of these arrows, so the map stays literal. A
// computed import("./" + code + ".js") would make it bundle every file the
// pattern can match, which is the thing this module exists to prevent.
const LOADERS = {
  es: () => import("./es.js"),
  fr: () => import("./fr.js"),
  de: () => import("./de.js"),
  pt: () => import("./pt.js"),
  it: () => import("./it.js"),
};

// Built from a map passed in rather than closing over one, so a test can hand
// it loaders it controls and count what actually gets called.
//
// Two caches, because the caller asks two different questions. `inflight` stops
// a second switch from fetching a chunk that is already on its way. `ready` is
// what lets switching BACK to a language happen inside a single frame, with no
// flash of English on the way — which is the difference between a language
// picker that feels instant after the first use and one that never does.
export function makeDictLoader(loaders) {
  const inflight = new Map(), ready = new Map();

  const peekDict = (code) => (code === "en" ? null : ready.get(code) || null);

  const loadDict = (code) => {
    if (code === "en" || !loaders[code]) return Promise.resolve(null);
    const have = ready.get(code);
    if (have) return Promise.resolve(have);
    if (!inflight.has(code)) {
      inflight.set(code, loaders[code]()
        .then(m => { const d = { code, table: m.default }; ready.set(code, d); return d; })
        // A chunk that will not load must not poison the cache. Forgetting the
        // attempt lets the next switch try again; until one succeeds the reader
        // sees English, which is what a missing key gets too.
        .catch(() => { inflight.delete(code); return null; }));
    }
    return inflight.get(code);
  };

  return { loadDict, peekDict };
}

export const { loadDict, peekDict } = makeDictLoader(LOADERS);

// English is the base language, so its translation is the key. For anything
// else the dictionary has to BELONG to the language being asked for: state
// holds the last table that arrived, and during a switch that is the language
// you just left. Reading French keys out of the Spanish table would render
// confident Spanish across half the screen — worse than the English this
// returns instead, and far harder to notice.
export const makeT = (lang, dict) => (s) =>
  (lang === "en" || dict?.code !== lang ? s : (dict.table[s] ?? s));
