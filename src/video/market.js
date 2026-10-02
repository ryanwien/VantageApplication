// ============================================================
//  market.js — whether a YouTube video is about stocks.
//
//  THE RULE
//  Every YouTube video this app puts on screen is about stocks and the market
//  around them. Not "came back from a search we started" and not "posted by a
//  channel we like". Both of those were the rule before, and both let other
//  things through:
//
//    · the desk's video concierge searched for whatever was left of a sentence
//      once the verbs were stripped, so "show me a video of cats" played cats
//    · the ON AIR rail trusted whole publishers, and a publisher is not its
//      programming: Reuters' live streams are mostly war, weather and state
//      funerals, and Fox Business carries political speeches in full
//
//  So the test is on the video itself — its title, the lead of its
//  description, its tags — and it runs on every path that can put one on
//  screen: the search the news and the concierge share, the live rail, and the
//  lists a model writes when no search key is configured.
//
//  HOW IT DECIDES
//  By vocabulary, not by YouTube's category. Category was measured and it
//  cannot carry this: real stock coverage is filed under People & Blogs,
//  Entertainment, News & Politics and Education alike. It is only good for a
//  veto — a video filed under Music or Gaming is not market coverage, whatever
//  it is tagged.
//
//  Words are weighed. A STRONG term (earnings, Nasdaq, a $TSLA cashtag) is
//  rarely anything but markets; a WEAK one (business, rally, bonds) often is,
//  and is evidence rather than proof. A video passes when its title alone
//  carries a strong term, or when title + description lead + tags together
//  carry enough. Two limits keep channel boilerplate from vouching for a
//  video that is about something else:
//
//    · only the LEAD of the description counts. The tail is where every
//      channel pastes the same paragraph — Fox Business's says "financial
//      news" and "Wall Street" under a campaign rally as readily as under the
//      closing bell.
//    · tags are capped at one strong term's worth, for the same reason: they
//      are set per channel as often as per video.
//
//  Crypto, forex and gold words count for nothing on their own. They are
//  markets, but they are not stocks, and the signal rooms that make up most
//  of YouTube's live "trading" results are made of exactly those words. A
//  video about them still passes if it is ALSO about stocks — a bitcoin ETF,
//  gold miners' shares.
// ============================================================

// Categories that are never market coverage. YouTube's ids: 1 Film &
// Animation, 10 Music, 15 Pets & Animals, 17 Sports, 19 Travel & Events,
// 20 Gaming, 23 Comedy, and 30+ (Movies, Shows, Trailers, …).
const VETO_CATEGORIES = new Set(["1", "10", "15", "17", "19", "20", "23"]);
const vetoed = (cat) => cat != null && (VETO_CATEGORIES.has(String(cat)) || Number(cat) >= 30);

// Each entry is one TERM: matching it twice, or in two places, counts once.
//
// STRONG terms come in two kinds, weighed the same. STOCK terms only ever mean
// the equity market. TRADE terms mean the practice of markets in general —
// trading, a price target, a sell-off — and are as at home in a bitcoin signal
// room as on the floor of the NYSE. The difference matters only for a video
// whose title is about crypto, forex or commodities: see OTHER_ASSETS.
const STOCK = [
  // "stock", but not inventory, soup, cars or footage. The guards in front are
  // singular only: "back in stock" is a shop and "chicken stock" a pot, while
  // "investing in stocks" is the market.
  /(?:\bstocks\b|(?<!\b(?:in|out of|back in|chicken|beef|vegetable|veggie|bone|fish|turkey)\s)\bstock\b)(?!\s+(?:footage|photos?|images?|video|videos|cars?|broth|pot|cubes?|sounds?|music|rom|firmware)\b)/i,
  /\b(?:share\s+price|shareholders?|stockholders?|buybacks?|market\s+cap)\b/i,
  /\bwall\s+street\b/i,
  /\b(?:nasdaq|nyse|qqq|spx|sp500)\b|\bs\s?&\s?p\b|\bdow\s+jones\b|\bthe\s+dow\b|\brussell\s+2000\b/i,
  /\betfs?\b|\b(?:mutual|index|hedge)\s+funds?\b/i,
  /\bdividends?\b/i,
  /\bearnings\b/i,
  /\bipos?\b/i,
  /\bpre-?market\b|\b(?:opening|closing)\s+bell\b|\bmarket\s+on\s+close\b/i,
  /\bfederal\s+reserve\b|\bfomc\b|\bthe\s+fed\b|\bfed\s+(?:chair|rates?|meeting|decision|minutes|cuts?|hikes?|policy)\b/i,
  /\binterest\s+rates?\b|\brate\s+(?:cuts?|hikes?)\b|\b(?:treasury|bond)\s+yields?\b/i,
  /\bcpi\b|\bjobs\s+report\b|\bnonfarm\s+payrolls?\b/i,
  /\b(?:business|markets?|financial|finance|stock)\s+news\b/i,
  /\bmarkets?\s+(?:today|recap|wrap|update|updates|outlook|coverage|open|close|movers|preview)\b/i,
  // the shows and the people whose whole job is this
  /\b(?:mad|fast)\s+money\b|\bsquawk\b|\bcramer\b/i,
  /\b(?:capital|asset|investment|wealth)\s+management\b|\b(?:fund|portfolio)\s+managers?\b/i,
];
const TRADE = [
  /\binvest(?:s|ed|ing|or|ors|ment|ments)?\b/i,
  // trading, but not cards or the grocer
  /\btrad(?:ing|er|ers)\b(?!\s+(?:cards?|joe'?s?|post)\b)/i,
  /\bprice\s+targets?\b|\b(?:technical|fundamental)\s+analysis\b/i,
  /\b(?:bull|bear)\s+market\b|\bsell-?offs?\b|\bshort\s+(?:squeeze|sellers?|selling|interest)\b/i,
  /\b(?:options|calls|puts)\s+(?:trading|trades?|flow|plays?|strateg(?:y|ies))\b/i,
];
// A cashtag is case-sensitive on purpose — "$TSLA" is a ticker, "$tsla" is
// someone typing, and "$40" is a price. The coins are left out: "$BTC" is a
// cashtag and not a stock.
const CASHTAG = /\$(?!(?:BTC|ETH|SOL|XRP|DOGE|ADA|BNB|USDT|USDC)\b)[A-Z]{1,5}(?:\.[A-Z])?\b/;

// Markets that are not the stock market. These words score nothing; a title
// that carries one passes only if it also says something about stocks — so
// "Bitcoin ETF inflows" stays and "LIVE XAUUSD | AI Bot Trading Battle" goes.
const OTHER_ASSETS = /\b(?:bitcoin|btc|ethereum|eth|crypto(?:currency|currencies)?|altcoins?|memecoins?|solana|xrp|dogecoin|forex|fx|xau(?:usd)?|gold|silver|crude|oil|commodit(?:y|ies)|perps?|liquidations?)\b|\bxau\/usd\b/i;

const WEAK = [
  /\bmarkets?\b/i,
  /\beconom(?:y|ic|ics)\b/i,
  /\bbusiness\b/i,
  /\bfinanc(?:e|ial|ials)\b/i,
  /\bshares?\b/i,
  /\brally\b|\bbull(?:ish)?\b|\bbear(?:ish)?\b|\bvolatility\b/i,
  /\binflation\b|\brecession\b|\bgdp\b|\btariffs?\b/i,
  /\brevenue\b|\bprofits?\b|\bguidance\b|\bvaluation\b/i,
  /\banalysts?\b|\bportfolio\b|\bticker\b/i,
  /\bbonds?\b|\bfutures\b|\bafter-?hours\b/i,
];

// Distinct terms in `text`, as a Set of keys — so the same word in the title
// and the description is one piece of evidence, not two.
function termsIn(text) {
  const s = String(text || "").replace(/[’‘]/g, "'");
  const found = new Set();
  STOCK.forEach((re, i) => { if (re.test(s)) found.add(`s${i}`); });
  if (CASHTAG.test(s)) found.add("s$");
  TRADE.forEach((re, i) => { if (re.test(s)) found.add(`t${i}`); });
  WEAK.forEach((re, i) => { if (re.test(s)) found.add(`w${i}`); });
  return found;
}
const weigh = (keys) => [...keys].reduce((n, k) => n + (k.startsWith("w") ? 1 : 2), 0);
const saysStocks = (keys) => [...keys].some(k => k.startsWith("s"));

// How much of the description counts. Enough for a summary paragraph or a
// broadcast's programme schedule; short of the boilerplate below it.
export const DESCRIPTION_LEAD = 300;

// The score a video needs. 2 is one strong term in the title; 4 is two strong
// terms — or one and two weak ones — anywhere that counts.
const TITLE_PASS = 2, TOTAL_PASS = 4, TAG_CAP = 2;

// Whether a video is about stocks. Takes the shape the server builds (title,
// description, tags, categoryId, channel) and also a model's thinner one
// (title, channel, maybe a brief) — missing fields are simply no evidence.
export function isMarketVideo(v) {
  if (!v || typeof v !== "object") return false;
  if (vetoed(v.categoryId)) return false;

  const title = termsIn(v.title);
  // The channel's name sits with the lead: "Tyler Hill Stocks" says what a
  // channel covers as plainly as a sentence would.
  const lead = termsIn(`${String(v.description || v.brief || "").slice(0, DESCRIPTION_LEAD)} ${v.channel || ""}`);

  // A title about another market has to mention the stock market somewhere
  // that counts, or "trading" in a forex room scores like trading on the NYSE.
  if (OTHER_ASSETS.test(String(v.title || "")) && !saysStocks(title) && !saysStocks(lead)) return false;

  if (weigh(title) >= TITLE_PASS) return true;
  const said = new Set([...title, ...lead]);
  const tagged = [...termsIn((Array.isArray(v.tags) ? v.tags : []).join(" · "))].filter(k => !said.has(k));
  return weigh(said) + Math.min(TAG_CAP, weigh(tagged)) >= TOTAL_PASS;
}

// A search phrase that will come back as market coverage. "AMD stock" and
// "fed rate cut" already are; anything else gets the market said out loud, so
// "Warren Buffett" finds Buffett on investing rather than Buffett's biography,
// and "cats" finds — at most — the stock market explained by cats.
//
// "bitcoin trading" is said in market words, but about the wrong market, so it
// gets the stock market added too — and finds the crypto stocks.
export function marketQuery(q) {
  const s = String(q || "").trim();
  if (!s) return s;
  const terms = termsIn(s);
  const enough = saysStocks(terms) || ([...terms].some(k => k.startsWith("t")) && !OTHER_ASSETS.test(s));
  return enough ? s : `${s} stock market`;
}
