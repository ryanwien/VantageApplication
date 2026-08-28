import { describe, it, expect } from "vitest";
import { routeTyped, smallTalkKind, isSmallTalk, CHATTER } from "./route.js";

// The desk's own vocabulary, near enough: the demo universe plus a couple of
// company aliases. Passing it is what makes a word that is ALSO a ticker
// resolve as the ticker.
const KNOWN = new Set(["AAPL", "MSFT", "NVDA", "AMD", "AMZN", "GOOGL", "META", "TSLA", "DIS", "F", "GOOGLE", "APPLE"]);
const route = (s, known = KNOWN) => routeTyped(s, { known });

describe("the bug this module was written for", () => {
  // Typed into the desk's one input, this charted. In demo mode nothing
  // downstream can refuse a symbol, so it synthesized a price series and put
  // HELLO on the watchlist at 214.19, +1.13%, ticking.
  it("does not turn a greeting into a stock", () => {
    expect(route("hello")).toEqual({ kind: "ask", text: "hello" });
  });

  // The same defect, one letter at a time. Every one of these is six letters or
  // fewer, which was the entire old test for "this is a ticker".
  it.each(["hi", "hey", "yo", "sup", "howdy", "thanks", "thx", "bye", "night", "please", "sorry", "wow", "nice", "cool", "yes", "nope", "what", "why", "stop", "oops"])(
    "does not turn %j into a stock",
    (word) => expect(route(word).kind).toBe("ask"),
  );
});

describe("what still charts", () => {
  it.each(["aapl", "AAPL", "nvda", "dis", "f", "META"])("charts %j", (s) => {
    expect(route(s)).toEqual({ kind: "chart", text: s });
  });

  // The promise the old rule existed to keep: a ticker the app has never heard
  // of still charts, because refusing everything outside UNIVERSE would make
  // the box useless for the other several thousand listed companies.
  it("charts a symbol it has never seen", () => {
    expect(route("pltr")).toEqual({ kind: "chart", text: "pltr" });
    expect(route("smci")).toEqual({ kind: "chart", text: "smci" });
  });

  it("charts a company name it knows a ticker for", () => {
    expect(route("google").kind).toBe("chart");
  });

  // BRK.B — the dot is why the pattern is not [A-Za-z] alone.
  it("charts a class-share symbol", () => {
    expect(route("brk.b").kind).toBe("chart");
  });
});

describe("a word that is both", () => {
  // SO is Southern Company and also a filler word; LUV is Southwest; EAT is
  // Brinker; CAR is Avis. None of them are on the speech list, so they chart —
  // and the ones that ARE on it are settled by the user's own watchlist rather
  // than by this module having an opinion.
  it.each(["so", "go", "it", "us", "we", "on", "car", "luv", "eat", "play", "big", "fun", "run"])(
    "leaves %j alone, because somebody means the ticker",
    (s) => expect(route(s).kind).toBe("chart"),
  );

  it("charts a speech word once it is on your watchlist", () => {
    expect(route("wow").kind).toBe("ask");
    expect(route("wow", new Set([...KNOWN, "WOW"])).kind).toBe("chart");
  });

  // The escape hatch, for the case where the watchlist has not got it yet.
  it("charts anything with a dollar sign in front of it", () => {
    expect(route("$hello")).toEqual({ kind: "chart", text: "hello" });
    expect(route("$WOW")).toEqual({ kind: "chart", text: "WOW" });
  });
});

describe("sentences and commands", () => {
  it("asks anything with a space in it", () => {
    expect(route("why is the market down today").kind).toBe("ask");
    expect(route("hi there").kind).toBe("ask");
  });

  it("asks anything longer than a ticker", () => {
    expect(route("whatever").kind).toBe("ask");
  });

  // "hello!" always worked, because the exclamation mark failed the ticker
  // pattern. That accident is the reason this went unnoticed for so long.
  it("asks anything carrying punctuation", () => {
    expect(route("hello?").kind).toBe("ask");
    expect(route("aapl?").kind).toBe("ask");
  });

  it.each(["help", "HELP", "add tsla", "del aapl", "Add Google"])("leaves %j to the command handler", (s) => {
    expect(routeTyped(s, { known: KNOWN }).kind).toBe("command");
  });

  it("does nothing with an empty box", () => {
    expect(route("").kind).toBe("none");
    expect(route("   ").kind).toBe("none");
    expect(route(null).kind).toBe("none");
  });

  // Without a known-set at all it must still refuse to chart a greeting: the
  // caller passing nothing is not a reason to invent a security.
  it("still refuses a greeting with no vocabulary to check against", () => {
    expect(routeTyped("hello").kind).toBe("ask");
    expect(routeTyped("aapl").kind).toBe("chart");
  });
});

describe("classifying what was said", () => {
  it.each([
    ["hi", "greeting"], ["hello", "greeting"], ["hey there", "greeting"],
    ["good morning", "greeting"], ["morning", "greeting"], ["good morning Sterling", "greeting"],
    ["thanks", "thanks"], ["thank you", "thanks"], ["thx", "thanks"], ["cheers", "thanks"],
    ["bye", "farewell"], ["goodnight", "farewell"], ["see you later", "farewell"], ["take care", "farewell"],
    ["wow", "chatter"], ["ok", "chatter"], ["why", "chatter"],
  ])("reads %j as %s", (s, kind) => expect(smallTalkKind(s)).toBe(kind));

  it("reads a leaned-on key as the word underneath it", () => {
    expect(smallTalkKind("hiii")).toBe("greeting");
    expect(smallTalkKind("heyyy")).toBe("greeting");
    expect(smallTalkKind("hellooo")).toBe("greeting");
    expect(smallTalkKind("hmmmm")).toBe("chatter");
  });

  it("greets in the languages the app ships in", () => {
    for (const s of ["hola", "bonjour", "hallo", "ciao", "bom dia", "buenos dias", "guten morgen", "olá"]) {
      expect([s, smallTalkKind(s)]).toEqual([s, expect.stringMatching(/greeting|farewell/)]);
    }
    for (const s of ["gracias", "merci", "danke", "grazie", "obrigado"]) {
      expect([s, smallTalkKind(s)]).toEqual([s, "thanks"]);
    }
  });

  // The asymmetry that keeps a canned hello from eating a real request: a bare
  // time of day is a greeting, the same word with anything after it is not.
  it("does not read a request as a greeting because it starts with a time of day", () => {
    expect(smallTalkKind("morning")).toBe("greeting");
    expect(smallTalkKind("morning briefing")).toBe(null);
    expect(smallTalkKind("evening news")).toBe(null);
    expect(smallTalkKind("afternoon session recap")).toBe(null);
  });

  it("has no opinion about a question", () => {
    expect(smallTalkKind("why is AAPL down")).toBe(null);
    expect(isSmallTalk("what happened to nvidia today")).toBe(false);
  });
});

describe("the speech list itself", () => {
  // Every plausible one-letter ticker is real — A is Agilent, F is Ford, K is
  // Kellanova, R is Ryder, U is Unity, V is Visa — and one letter is not small
  // talk to begin with. This is the invariant that keeps someone from
  // "helpfully" adding "u" or "k" later.
  it("holds nothing one letter long", () => {
    expect([...CHATTER].filter(w => w.length < 2)).toEqual([]);
  });

  // A word can sit in the set and still not reach it: HELP/ADD/DEL are matched
  // before the speech list, and so is a dollar sign. Adding "help" here would
  // do nothing at all, silently, which is the kind of contradiction a list of
  // strings is very good at hiding.
  it("routes every word in it to the desk, so nothing in here is decorative", () => {
    const stranded = [...CHATTER].filter(w => smallTalkKind(w) === null || routeTyped(w).kind !== "ask");
    expect(stranded).toEqual([]);
  });

  it("is lowercase throughout, since that is what it gets compared against", () => {
    expect([...CHATTER].filter(w => w !== w.toLowerCase())).toEqual([]);
  });
});
