// ============================================================
//  gender.js — which voice speaks for the anchor on screen.
//
//  THE BUG THIS EXISTS FOR
//  There was one voice for twenty-two anchors. The browser default is the first
//  local English voice, which on Windows is "Microsoft David", so Vega, Diana,
//  Marina and every other woman on the roster spoke as David. The studio voice
//  was the same: one id, whoever was presenting.
//
//  THE TWO SOURCES ARE NOT EQUALLY HONEST
//  ElevenLabs reports a gender with every voice (labels.gender), so the studio
//  side matches exactly. The Web Speech API reports a name and a language and
//  nothing else, so a browser voice's gender has to be read off its NAME —
//  "Microsoft Zira", "Google UK English Female", "Samantha". That is a lookup
//  table, and a table is incomplete by nature: a voice it does not know returns
//  null, which means "unknown", and an unknown voice is never picked to fit a
//  gender. It can still be used as the fallback when nothing fitting exists —
//  which is a voice that may be wrong, said out loud, rather than silence.
//
//  POLICY, IN ONE PLACE
//    · The voice you chose is used whenever it fits the anchor on screen.
//    · When it does not fit, the closest voice that does: same language first,
//      then the same region as your choice (en-GB stays British), then voices
//      that run on the device before ones that need the network.
//    · When nothing fits — a machine with no female voice installed — your
//      choice is used anyway, and the caller is told, so it can say why.
//    · An anchor with no gender (TICK-3R) always gets exactly your choice.
// ============================================================

// Names that announce themselves. Checked before the tables, because a vendor
// that writes "Female" in the name has settled the question.
const SAYS_FEMALE = /\b(female|woman|girl)\b/i;
const SAYS_MALE = /\b(male|man|boy)\b/i;

// First names used by the shipped voices of Windows, Edge (incl. the online
// "Natural" voices), macOS / iOS, Chrome and Android. Lower-case; matched as a
// whole word anywhere in the voice name ("Microsoft Zira - English (United
// States)", "Ava (Premium)"). Ambiguous names are left OUT on purpose: a wrong
// entry here picks the wrong voice for an anchor, and an absent one only loses
// a candidate.
const FEMALE = new Set([
  // Windows / Edge
  "zira", "aria", "jenny", "michelle", "monica", "sonia", "libby", "maisie", "natasha", "clara",
  "hazel", "susan", "heera", "neerja", "ana", "emily", "elvira", "dalia", "paloma", "denise",
  "julie", "hortense", "brigitte", "eloise", "katja", "hedda", "amala", "elsa", "isabella",
  "francisca", "raquel", "nanami", "ayumi", "haruka", "xiaoxiao", "xiaoyi", "huihui", "yaoyao",
  "sunhi", "heami", "irina", "svetlana", "zuzana", "paulina", "helena", "laura", "sabina",
  // macOS / iOS
  "samantha", "karen", "moira", "tessa", "victoria", "allison", "ava", "susan", "fiona", "veena",
  "serena", "kate", "nicky", "zoe", "kathy", "amelie", "anna", "alice", "carmit", "ioana",
  "joana", "kanya", "kyoko", "lekha", "luciana", "mariska", "melina", "milena", "monica",
  "nora", "paulina", "sara", "satu", "sin-ji", "ting-ting", "yelda", "yuna", "zosia", "ellen",
  "agnes", "princess", "vicki", "shelley", "flo", "sandy", "grandma",
  // AWS Polly names that some voice packs reuse
  "joanna", "salli", "kimberly", "kendra", "ivy", "amy", "emma", "olivia", "nicole", "raveena",
]);

const MALE = new Set([
  // Windows / Edge
  "david", "mark", "guy", "christopher", "eric", "roger", "steffan", "ryan", "thomas", "george",
  "james", "william", "liam", "connor", "prabhat", "ravi", "alvaro", "jorge", "pablo", "raul",
  "henri", "claude", "paul", "stefan", "conrad", "killian", "elliot", "diego", "cosimo", "luca",
  "keita", "ichiro", "kangkang", "yunxi", "yunyang", "injoon", "pavel", "filip", "adam", "jakub",
  // macOS / iOS
  "alex", "daniel", "fred", "tom", "oliver", "rishi", "aaron", "arthur", "gordon", "lee",
  "jacques", "juan", "jorge", "carlos", "diego", "luca", "maged", "rocko", "eddy", "reed",
  "junior", "ralph", "albert", "bruce", "grandpa", "xander", "yuri", "thomas", "markus",
  // AWS Polly names that some voice packs reuse
  "matthew", "joey", "justin", "brian", "russell", "kevin",
]);

// "female" | "male" | null for a SpeechSynthesisVoice (or anything with .name).
export function voiceGender(voice) {
  const name = String(voice?.name || "");
  if (!name) return null;
  // "Female" contains "male", so the female test has to run first.
  if (SAYS_FEMALE.test(name)) return "female";
  if (SAYS_MALE.test(name)) return "male";
  // Chrome's one unlabelled English voice. It is a woman's voice, and it is the
  // default on most Chrome installs, so leaving it unknown would drop the most
  // common female voice there is.
  if (/^google us english$/i.test(name.trim())) return "female";
  const words = name.toLowerCase().split(/[^a-z-]+/).filter(Boolean);
  if (words.some(w => FEMALE.has(w))) return "female";
  if (words.some(w => MALE.has(w))) return "male";
  return null;
}

// A studio (ElevenLabs) voice already says. Anything else is unknown.
export function studioGender(voice) {
  const g = String(voice?.gender || "").toLowerCase();
  return g === "female" || g === "male" ? g : null;
}

// The anchor's voice: "female" | "male" | null. Explicit on the character —
// never inferred from how the character is drawn.
export function anchorGender(character) {
  const g = character?.voice;
  return g === "female" || g === "male" ? g : null;
}

const langOf = (v) => String(v?.lang || "").toLowerCase();
const regionOf = (v) => langOf(v).split(/[-_]/)[1] || "";

// Choose the browser voice for an anchor.
//   gender    — anchorGender(character)
//   voices    — speechSynthesis.getVoices()
//   lang      — the app's language code ("en", "de", …)
//   preferred — the name the user picked in Settings
// Returns { voice, fits } — `fits` is false only when the anchor has a gender
// and no installed voice in this language could be identified as matching it.
export function pickBrowserVoice({ gender, voices, lang = "en", preferred = "" }) {
  const all = Array.isArray(voices) ? voices : [];
  const code = String(lang || "en").toLowerCase();
  const inLang = all.filter(v => langOf(v).startsWith(code));
  const pool = inLang.length ? inLang : all;
  const chosen = pool.find(v => v.name === preferred) || null;

  if (!gender) return { voice: chosen || pool[0] || null, fits: true };
  if (chosen && voiceGender(chosen) === gender) return { voice: chosen, fits: true };

  const matching = pool.filter(v => voiceGender(v) === gender);
  if (matching.length) {
    const region = chosen ? regionOf(chosen) : "";
    const score = (v) => (region && regionOf(v) === region ? 2 : 0) + (v.localService ? 1 : 0);
    const best = [...matching].sort((a, b) => score(b) - score(a))[0];
    return { voice: best, fits: true };
  }
  return { voice: chosen || pool[0] || null, fits: false };
}

// ---- the two slots Settings shows ----
//
// One picker could not express this. With a single "browser voice", choosing
// Zira while Sterling was on the desk changed nothing you could hear — he kept
// speaking as David, because Zira did not fit him — and the picker looked
// broken. So Settings has a voice for female anchors and a voice for male
// anchors, and whatever is in a slot is used exactly as chosen.
//
// TICK-3R has no gender, so it reads the male slot. That is not a claim about
// the robot; one of the two pickers has to govern it, and that one says so.
export const slotFor = (gender) => (gender === "female" ? "female" : "male");

// What each slot starts as, before anybody picks: the best voice of that
// gender. On a machine with no female voice the female slot holds the best
// voice there is, and voiceForAnchor reports the miss when it is used.
export function defaultBrowserSlots(voices, lang = "en") {
  return {
    female: pickBrowserVoice({ gender: "female", voices, lang }).voice?.name || "",
    male: pickBrowserVoice({ gender: "male", voices, lang }).voice?.name || "",
  };
}
export function defaultStudioSlots(voices) {
  return {
    female: pickStudioVoice({ gender: "female", voices }).id,
    male: pickStudioVoice({ gender: "male", voices }).id,
  };
}

// The browser voice for the anchor on screen, read from the slots.
//
// The slot's voice is honoured EXACTLY when it speaks the app's language — an
// explicit pick is never second-guessed, even one that looks wrong. When it
// does not (the app is in German and the slot holds an English voice), the
// best voice of the anchor's gender in that language stands in.
//
// `fits` is false only when this language has no voice of the anchor's gender
// at all — the one case worth telling somebody about.
export function browserVoiceForAnchor({ gender, voices, lang = "en", slots = {} }) {
  const all = Array.isArray(voices) ? voices : [];
  const code = String(lang || "en").toLowerCase();
  const slotName = slots[slotFor(gender)] || "";
  const anyOfGender = !gender || all.some(v => langOf(v).startsWith(code) && voiceGender(v) === gender);
  const slotVoice = all.find(v => v.name === slotName && langOf(v).startsWith(code));
  if (slotVoice) return { voice: slotVoice, fits: anyOfGender };
  return pickBrowserVoice({ gender, voices: all, lang: code, preferred: slotName });
}

// The studio voice id for the anchor on screen. Same rule; studio voices have
// no language to fall out of, so the slot is simply used when it exists.
export function studioVoiceForAnchor({ gender, voices, slots = {} }) {
  const all = Array.isArray(voices) ? voices : [];
  const slotId = slots[slotFor(gender)] || "";
  const anyOfGender = !gender || all.some(v => studioGender(v) === gender);
  if (all.some(v => v.id === slotId)) return { id: slotId, fits: anyOfGender };
  return pickStudioVoice({ gender, voices: all, preferred: slotId });
}

// Choose the studio voice id for an anchor. Same policy; studio voices carry
// their gender, so there is no guessing on this side.
//   voices    — [{ id, name, gender }]
//   preferred — the id the user picked
export function pickStudioVoice({ gender, voices, preferred = "" }) {
  const all = Array.isArray(voices) ? voices : [];
  const chosen = all.find(v => v.id === preferred) || null;
  if (!gender) return { id: chosen?.id || all[0]?.id || "", fits: true };
  if (chosen && studioGender(chosen) === gender) return { id: chosen.id, fits: true };
  const match = all.find(v => studioGender(v) === gender);
  if (match) return { id: match.id, fits: true };
  return { id: chosen?.id || all[0]?.id || "", fits: false };
}
