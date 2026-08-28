// ============================================================
//  route.js — is this a symbol, or is somebody talking to me?
//
//  THE BOX THIS EXISTS FOR
//  The desk has one input. It is the chat composer AND the symbol bar, which
//  is a good idea right up until the two readings of a word disagree. The rule
//  used to be "one bare word of six letters or fewer is a ticker, anything
//  with a space is a question", and that rule turns `hello` into a chart.
//  Worse, in demo mode nothing can refuse it: there is no symbol service to
//  say no, so the desk synthesizes a price series and puts HELLO on the
//  watchlist at 214.19, +1.13%, ticking. A market app that answers a greeting
//  by inventing a security has done something much worse than misunderstand.
//
//  WHY NOT JUST "ENGLISH WORDS ARE NOT TICKERS"
//  Because they are. CAR is Avis, LUV is Southwest, EAT is Brinker, PLAY was
//  Dave & Buster's, HI is Hillenbrand, ON is ON Semiconductor, SO is Southern
//  Company, IT is Gartner, K is Kellanova. Any rule that reads the dictionary
//  and rejects whatever it finds there breaks real lookups.
//
//  SO THE ORDER IS: KNOWN SYMBOL, THEN SPEECH, THEN GUESS
//  A word the desk can already chart — the demo universe, your watchlist, a
//  company name it holds a ticker for — is a symbol, full stop. Only after
//  that does the speech list get a say, and it holds exactly one kind of word:
//  the kind nobody has ever typed into a box hoping for a chart. `hello`
//  qualifies. `so` does not, which is why it is not in here.
//
//  THE ESCAPE HATCH IS EXPLICITNESS
//  $HELLO charts, because the dollar sign is someone saying they meant the
//  ticker. So does ADD HELLO. Neither is shown the speech list at all.
//
//  Every export is a pure function of its input, so the routing table can be a
//  test rather than something you find out about from a screenshot.
// ============================================================

// Punctuation and case are noise for this decision, and a diacritic would hide
// `olá` from a list that spells it `ola`. Apostrophes survive: "i'm out".
const strip = (s) => String(s || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z' ]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

// "heyyy" and "hiiii" are the same two words as "hey" and "hi" — someone
// leaning on a key is being MORE conversational, not less. Only runs of three
// or more collapse, so ordinary doubles ("hello", "cheers") are left alone.
// That does mean "hmmm" lands on "hm" while "hmm" stays "hmm", so the list
// below carries both spellings rather than pretending one covers it.
const deStretch = (s) => s.replace(/(.)\1{2,}/g, "$1");

const HELLO_WORD = "hi|hey|heya|hello|helo|hullo|hiya|howdy|yo|sup|wassup|whatsup|hola|ola|aloha|greetings|salut|bonjour|hallo";
const TIME_WORD = "morning|mornin|afternoon|evening|evenin";
// The app ships in five languages and its anchors greet you in all of them, so
// a Portuguese speaker typing `bom dia` should not be told about a stock either.
const HELLO_PHRASE = "buenos\\s+(?:dias|tardes|noches)|bom\\s+dia|boa\\s+(?:tarde|noite)" +
  "|buon\\s?giorno|buona\\s?sera|guten\\s+(?:morgen|tag|abend)|bonne\\s+(?:journee|soiree)";

// "hi", "hey there", "good morning desk" — a hello, optionally addressed to
// someone. The trailing word is deliberately anything at all: people greet the
// anchor by name, and the roster has eighteen of them.
//
// A bare time of day gets no trailing word, and that asymmetry is load-bearing.
// "morning" alone is a greeting; "morning briefing" and "evening news" are
// requests, and a canned hello would swallow both.
export const GREETING_RX = new RegExp(
  `^(?:(?:${HELLO_WORD}|good\\s+(?:${TIME_WORD}|day))(?:\\s+[a-z']{2,14})?|(?:${TIME_WORD})|(?:${HELLO_PHRASE}))$`,
);

export const THANKS_RX = new RegExp(
  "^(?:thanks?(?:\\s+(?:you|u|a\\s+lot|so\\s+much|man|mate|desk|again))?" +
  "|thx|thanx|tks|ty|tysm|cheers|much\\s+appreciated|appreciate\\s+(?:it|that|you)" +
  "|gracias|merci|danke|grazie|obrigad[oa])$",
);

export const FAREWELL_RX = new RegExp(
  "^(?:bye(?:\\s*bye)?|goodbye|good\\s+bye|see\\s+(?:ya|you)(?:\\s+later)?|cya" +
  "|later|laters|good\\s*night|night|take\\s+care|adios|ciao|peace(?:\\s+out)?" +
  "|catch\\s+you\\s+later|talk\\s+(?:to\\s+you\\s+)?later|i'?m\\s+out|gtg|g2g)$",
);

// One bare word that is speech. The bar for entry is a single question — would
// anyone, ever, type this hoping for a chart? — and it is why the reactions and
// the lone question words are here while `so`, `go`, `next`, `on`, `it`, `us`
// and `we` are not. Nothing one letter long is eligible either: every plausible
// single letter is a real ticker (A, F, K, R, U, V), and one letter is not
// small talk to begin with.
export const CHATTER = new Set([
  // reactions
  "lol", "lmao", "lmfao", "rofl", "haha", "hah", "heh", "hehe", "hm", "hmm",
  "wow", "whoa", "woah", "omg", "oof", "yikes", "ugh", "meh", "huh", "eh",
  "um", "uh", "ah", "oh", "ooh", "aha", "yay", "woo", "woohoo", "bruh", "damn",
  "nice", "cool", "sweet", "neat", "awesome", "great", "amazing", "lovely",
  // yes, no, and the noises that mean them
  "yes", "yeah", "yeh", "yea", "yep", "yup", "ya", "yah", "aye",
  "no", "nope", "nah", "naw", "ok", "okay", "okey", "kk", "sure", "alright", "gotcha",
  // manners
  "please", "pls", "plz", "sorry", "oops", "np", "yw", "welcome", "congrats",
  // a question word with nothing after it — someone asking the desk to say more
  "what", "whats", "why", "who", "whom", "whose", "when", "where", "how", "hows", "which",
  // talking to the desk about the desk, or steering it mid-answer
  "you", "desk", "anchor", "bot", "test", "testing",
  "stop", "wait", "again", "repeat", "nevermind", "nvm", "anyway",
]);

// Which kind of talking this is, or null for "this is not talking".
//   greeting | thanks | farewell  →  the desk has an answer of its own
//   chatter                       →  speech, but nothing canned to say back
export function smallTalkKind(raw) {
  const s = deStretch(strip(raw));
  if (!s) return null;
  if (GREETING_RX.test(s)) return "greeting";
  if (THANKS_RX.test(s)) return "thanks";
  if (FAREWELL_RX.test(s)) return "farewell";
  if (!s.includes(" ") && CHATTER.has(s)) return "chatter";
  return null;
}

export const isSmallTalk = (raw) => smallTalkKind(raw) !== null;

// What pressing Enter in the desk's one input should do.
//
//   command — HELP / ADD / DEL, which are sentences carrying an argument
//   chart   — look this up as a symbol
//   ask     — hand it to the desk as something a person said
//   none    — nothing was typed
//
// `known` is the set of symbols the desk can chart without guessing. Pass it,
// and a word in it is a symbol even when it is also a word: with SO on your
// watchlist, "so" is Southern Company, because you are the one who put it there.
export function routeTyped(raw, { known } = {}) {
  const text = String(raw || "").trim();
  if (!text) return { kind: "none", text: "" };
  if (/^(?:help|add|del)\b/i.test(text)) return { kind: "command", text };

  // $HELLO is someone insisting. It skips the speech list entirely — being
  // able to insist is the whole point of typing the dollar sign.
  const dollar = /^\$([A-Za-z][A-Za-z.]{0,5})$/.exec(text);
  if (dollar) return { kind: "chart", text: dollar[1] };

  // A space, a digit, a question mark, or more than six letters: a sentence.
  // This is the old rule, and it was never the broken half of it.
  if (!/^[A-Za-z.]{1,6}$/.test(text)) return { kind: "ask", text };

  if (known && known.has(text.toUpperCase())) return { kind: "chart", text };
  if (smallTalkKind(text)) return { kind: "ask", text };
  return { kind: "chart", text };
}
