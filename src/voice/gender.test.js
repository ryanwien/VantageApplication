import { describe, it, expect } from "vitest";
import {
  voiceGender, studioGender, anchorGender, pickBrowserVoice, pickStudioVoice,
  slotFor, defaultBrowserSlots, defaultStudioSlots, browserVoiceForAnchor, studioVoiceForAnchor,
} from "./gender.js";

const v = (name, lang = "en-US", localService = true) => ({ name, lang, localService });

// The three voices this was found on: a stock Windows install.
const WINDOWS = [
  v("Microsoft David - English (United States)"),
  v("Microsoft Mark - English (United States)"),
  v("Microsoft Zira - English (United States)"),
];

describe("reading a browser voice's gender from its name", () => {
  it.each([
    ["Microsoft Zira - English (United States)", "female"],
    ["Microsoft David - English (United States)", "male"],
    ["Microsoft Mark - English (United States)", "male"],
    ["Microsoft Aria Online (Natural) - English (United States)", "female"],
    ["Microsoft Guy Online (Natural) - English (United States)", "male"],
    ["Samantha", "female"],
    ["Alex", "male"],
    ["Daniel", "male"],
    ["Ava (Premium)", "female"],
    ["Google UK English Female", "female"],
    ["Google UK English Male", "male"],
    ["Google US English", "female"],
    ["Microsoft Hedda - German (Germany)", "female"],
  ])("%s → %s", (name, g) => expect(voiceGender(v(name))).toBe(g));

  // "Female" contains "male". Checked in that order, or every labelled female
  // voice would come back male.
  it("does not read Female as Male", () => {
    expect(voiceGender(v("Some Vendor Female Voice"))).toBe("female");
  });

  // "German" contains "man".
  it("does not read a language name as a gender", () => {
    expect(voiceGender(v("Vendor Voice - German"))).toBe(null);
  });

  it("says it does not know rather than guessing", () => {
    expect(voiceGender(v("Vendor Voice 3"))).toBe(null);
    expect(voiceGender(null)).toBe(null);
    expect(voiceGender({})).toBe(null);
  });
});

describe("the anchor's gender is what the character says, nothing else", () => {
  it("reads the explicit field", () => {
    expect(anchorGender({ voice: "female" })).toBe("female");
    expect(anchorGender({ voice: "male" })).toBe("male");
  });
  // Earrings and long hair are drawing decisions. A character with no `voice`
  // has no gender here, however it is drawn.
  it("infers nothing from how a character is drawn", () => {
    expect(anchorGender({ earrings: true, hair: "long" })).toBe(null);
    expect(anchorGender({ robot: true })).toBe(null);
    expect(anchorGender(null)).toBe(null);
  });
});

describe("choosing the browser voice", () => {
  it("gives a female anchor a female voice when the chosen voice is male — the reported bug", () => {
    const r = pickBrowserVoice({ gender: "female", voices: WINDOWS, preferred: WINDOWS[0].name });
    expect(r.voice.name).toMatch(/Zira/);
    expect(r.fits).toBe(true);
  });

  it("keeps the chosen voice when it already fits", () => {
    const r = pickBrowserVoice({ gender: "male", voices: WINDOWS, preferred: WINDOWS[1].name });
    expect(r.voice.name).toMatch(/Mark/);
  });

  it("gives a male anchor a male voice when the chosen voice is female", () => {
    const r = pickBrowserVoice({ gender: "male", voices: WINDOWS, preferred: WINDOWS[2].name });
    expect(r.voice.name).toMatch(/David|Mark/);
  });

  it("gives an anchor with no gender exactly the chosen voice", () => {
    const r = pickBrowserVoice({ gender: null, voices: WINDOWS, preferred: WINDOWS[2].name });
    expect(r.voice.name).toMatch(/Zira/);
  });

  it("stays in the chosen voice's region when it has to switch", () => {
    const voices = [v("Daniel", "en-GB"), v("Samantha", "en-US"), v("Serena", "en-GB"), v("Kate", "en-GB")];
    const r = pickBrowserVoice({ gender: "female", voices, preferred: "Daniel" });
    expect(r.voice.lang).toBe("en-GB");
  });

  it("prefers a voice on the device over one that needs the network", () => {
    const voices = [v("David", "en-US"), v("Microsoft Aria Online (Natural)", "en-US", false), v("Zira", "en-US", true)];
    const r = pickBrowserVoice({ gender: "female", voices, preferred: "David" });
    expect(r.voice.name).toBe("Zira");
  });

  it("matches within the app's language", () => {
    const voices = [...WINDOWS, v("Microsoft Hedda - German (Germany)", "de-DE"), v("Microsoft Stefan - German (Germany)", "de-DE")];
    expect(pickBrowserVoice({ gender: "female", voices, lang: "de" }).voice.name).toMatch(/Hedda/);
    expect(pickBrowserVoice({ gender: "male", voices, lang: "de" }).voice.name).toMatch(/Stefan/);
  });

  // A machine with only men's voices installed. Silence would be worse than a
  // voice that does not fit, so it speaks — and says that it could not match.
  it("falls back to the chosen voice, and reports it, when nothing fits", () => {
    const r = pickBrowserVoice({ gender: "female", voices: WINDOWS.slice(0, 2), preferred: WINDOWS[0].name });
    expect(r.voice.name).toMatch(/David/);
    expect(r.fits).toBe(false);
  });

  // An unknown voice is never picked TO fit a gender — only as the fallback.
  it("never treats an unrecognised voice as a match", () => {
    const voices = [v("David"), v("Vendor Voice 3")];
    const r = pickBrowserVoice({ gender: "female", voices, preferred: "David" });
    expect(r.fits).toBe(false);
  });

  it("survives no voices at all", () => {
    expect(pickBrowserVoice({ gender: "female", voices: [] })).toEqual({ voice: null, fits: false });
    expect(pickBrowserVoice({ gender: null, voices: undefined })).toEqual({ voice: null, fits: true });
  });
});

describe("choosing the studio voice", () => {
  // The shape /api/voices hands back, reduced to what the desk keeps.
  const STUDIO = [
    { id: "roger", name: "Roger", gender: "male" },
    { id: "sarah", name: "Sarah", gender: "female" },
    { id: "laura", name: "Laura", gender: "female" },
  ];

  it("reads the gender ElevenLabs reports", () => {
    expect(studioGender(STUDIO[1])).toBe("female");
    expect(studioGender({ gender: "MALE" })).toBe("male");
    expect(studioGender({ gender: "neutral" })).toBe(null);
  });

  it("gives a female anchor a female studio voice when the chosen one is male", () => {
    expect(pickStudioVoice({ gender: "female", voices: STUDIO, preferred: "roger" })).toEqual({ id: "sarah", fits: true });
  });

  it("keeps the chosen studio voice when it fits", () => {
    expect(pickStudioVoice({ gender: "female", voices: STUDIO, preferred: "laura" }).id).toBe("laura");
    expect(pickStudioVoice({ gender: "male", voices: STUDIO, preferred: "roger" }).id).toBe("roger");
  });

  it("falls back and reports it when the account has no voice of that gender", () => {
    expect(pickStudioVoice({ gender: "female", voices: [STUDIO[0]], preferred: "roger" })).toEqual({ id: "roger", fits: false });
  });
});

describe("the two slots Settings shows", () => {
  it("files TICK-3R under the male slot, and nobody else by accident", () => {
    expect(slotFor("female")).toBe("female");
    expect(slotFor("male")).toBe("male");
    expect(slotFor(null)).toBe("male");
  });

  it("fills each slot with the best voice of its gender before anybody picks", () => {
    expect(defaultBrowserSlots(WINDOWS)).toEqual({
      female: "Microsoft Zira - English (United States)",
      male: "Microsoft David - English (United States)",
    });
  });

  // A pick is a pick. The single picker this replaced overrode you whenever
  // your voice did not fit the anchor, which is why it looked broken.
  it("uses exactly what is in a slot, even a choice that looks wrong", () => {
    const slots = { female: WINDOWS[1].name, male: WINDOWS[2].name };   // Mark for women, Zira for men
    expect(browserVoiceForAnchor({ gender: "female", voices: WINDOWS, slots }).voice.name).toMatch(/Mark/);
    expect(browserVoiceForAnchor({ gender: "male", voices: WINDOWS, slots }).voice.name).toMatch(/Zira/);
  });

  it("gives TICK-3R the male slot's voice", () => {
    const slots = { female: WINDOWS[2].name, male: WINDOWS[1].name };
    expect(browserVoiceForAnchor({ gender: null, voices: WINDOWS, slots }).voice.name).toMatch(/Mark/);
  });

  it("stands in with the right gender when the slot's voice cannot speak the app's language", () => {
    const voices = [...WINDOWS, v("Microsoft Hedda - German (Germany)", "de-DE"), v("Microsoft Stefan - German (Germany)", "de-DE")];
    const slots = defaultBrowserSlots(voices, "en");                    // English voices
    expect(browserVoiceForAnchor({ gender: "female", voices, lang: "de", slots }).voice.name).toMatch(/Hedda/);
    expect(browserVoiceForAnchor({ gender: "male", voices, lang: "de", slots }).voice.name).toMatch(/Stefan/);
  });

  // Reported only when it is true of the device, not when somebody chose an
  // unusual voice on purpose.
  it("reports a miss only when the language has no voice of that gender at all", () => {
    const menOnly = WINDOWS.slice(0, 2);
    const slots = defaultBrowserSlots(menOnly);
    expect(slots.female).toMatch(/David/);                              // best there is
    expect(browserVoiceForAnchor({ gender: "female", voices: menOnly, slots }).fits).toBe(false);
    expect(browserVoiceForAnchor({ gender: "female", voices: WINDOWS, slots: { female: WINDOWS[0].name } }).fits).toBe(true);
  });

  it("does the same for studio voices", () => {
    const STUDIO = [
      { id: "roger", name: "Roger", gender: "male" },
      { id: "sarah", name: "Sarah", gender: "female" },
    ];
    expect(defaultStudioSlots(STUDIO)).toEqual({ female: "sarah", male: "roger" });
    expect(studioVoiceForAnchor({ gender: "female", voices: STUDIO, slots: { female: "roger" } })).toEqual({ id: "roger", fits: true });
    expect(studioVoiceForAnchor({ gender: "female", voices: STUDIO, slots: {} })).toEqual({ id: "sarah", fits: true });
    expect(studioVoiceForAnchor({ gender: "female", voices: [STUDIO[0]], slots: { female: "roger" } }).fits).toBe(false);
    expect(studioVoiceForAnchor({ gender: null, voices: STUDIO, slots: { female: "sarah", male: "roger" } }).id).toBe("roger");
  });
});
