// ============================================================
//  school.js — Stock School's eight lessons, and the few things the screen
//  derives from them.
//
//  WHY THE LESSONS MOVED HERE
//  The games handoff asks each lesson for more than a paragraph and a
//  question: two takeaway cards, a worked example with every term labelled, a
//  set of terms, and a syllabus. That is a shape, and a shape with eight
//  instances wants a contract — so the data lives in one place and a test
//  walks it. A ninth lesson with two choices and an answer index of 2 is the
//  kind of mistake nobody sees until a player picks C.
//
//  NOT EVERY LESSON HAS ARITHMETIC
//  `worked` is optional and three lessons do without it. There is no honest
//  worked example for "what a ticker symbol is", and inventing a sum to fill
//  a panel would teach a calculation that does not exist. A lesson with no
//  example simply has no example panel.
//
//  THE LESSON PROSE IS NOT TRANSLATED
//  It never has been: this is data, not `t()` calls, so the i18n audit does
//  not see it and no dictionary carries it. The screen's CHROME around it is
//  translated. Eight lessons of prose in five languages is a content job, not
//  a refactor, and pretending otherwise by machine-translating them here would
//  be worse than the gap.
// ============================================================

export const POINTS_PER_ANSWER = 20;

export const LESSONS = [
  {
    title: "What is a stock?",
    teach: "A stock is a tiny slice of ownership in a company. Buy one share of a company and you literally own a small piece of it — if the business grows more valuable, so can your slice.",
    takeaways: [
      { label: "A SHARE IS", text: "a claim on the company's future earnings." },
      { label: "THE PRICE IS", text: "whatever a buyer and a seller last agreed on." },
    ],
    worked: {
      note: "1,000,000 shares",
      parts: [
        { label: "Company profit", value: "$5,000,000" },
        { label: "Shares", value: "1,000,000" },
        { label: "Earnings per share", value: "$5.00" },
      ],
      ops: ["÷", "="],
    },
    terms: ["share", "EPS", "float", "dividend"],
    q: "Owning a share of a company means…",
    choices: ["You own a small piece of that company", "You lent the company money for fixed interest", "You are an employee of the company"],
    answer: 0,
    explain: "Correct — a share is part-ownership. (Lending a company money for interest is a bond, not a stock.)",
  },
  {
    title: "Ticker symbols",
    teach: "Every public company has a short ticker symbol so it's quick to look up — Apple is AAPL, Nvidia is NVDA, Tesla is TSLA. It's just a nickname for the stock on the exchange.",
    takeaways: [
      { label: "A TICKER IS", text: "a short nickname for one listed company." },
      { label: "IT IS NOT", text: "the price, and it is not unique across every exchange." },
    ],
    terms: ["ticker", "exchange", "listing"],
    q: "What is a ticker symbol?",
    choices: ["The company's phone number", "A short code that identifies a stock", "The price of one share"],
    answer: 1,
    explain: "Right — it's a short code (like NVDA) that names the stock. The price is a separate, constantly-changing number.",
  },
  {
    title: "Why prices move",
    teach: "A stock's price is set by supply and demand — how many people want to buy versus sell right now. Good news (strong earnings, new products) pulls buyers in and lifts the price; bad news does the opposite.",
    takeaways: [
      { label: "THE PRICE IS", text: "the last price a buyer and a seller agreed on." },
      { label: "NEWS MOVES IT", text: "by changing what people expect, not what already happened." },
    ],
    terms: ["supply", "demand", "earnings", "guidance"],
    q: "A stock's price mostly moves because of…",
    choices: ["A government-fixed daily rate", "Buyers and sellers reacting to news and demand", "The alphabetical order of its ticker"],
    answer: 1,
    explain: "Exactly — price is a live tug-of-war between buyers and sellers reacting to information.",
  },
  {
    title: "Gains and losses (%)",
    teach: "Change is shown as a percentage from the previous close. Green and a plus sign means it's up; red and a minus means it's down. A stock at $100 that rises to $105 is +5%.",
    takeaways: [
      { label: "PERCENT IS", text: "the move measured against yesterday's close." },
      { label: "WHY IT MATTERS", text: "it compares a $5 stock and a $500 one on the same scale." },
    ],
    worked: {
      note: "one session",
      parts: [
        { label: "Gain", value: "$5.00" },
        { label: "Previous close", value: "$50.00" },
        { label: "Change", value: "+10%" },
      ],
      ops: ["÷", "="],
    },
    terms: ["percent change", "previous close", "basis point"],
    q: "A stock closed yesterday at $50 and is now $55. That's…",
    choices: ["-10%", "+10%", "+5%"],
    answer: 1,
    numeric: true,
    explain: "Correct — a $5 gain on $50 is +10%. Percentages let you compare moves across stocks of very different prices.",
  },
  {
    title: "Bid, ask & the spread",
    teach: "At any moment there's a bid (the highest price buyers will pay) and an ask (the lowest price sellers will accept). The small gap between them is the spread — the cost of trading instantly.",
    takeaways: [
      { label: "THE BID IS", text: "the most a buyer will pay right now." },
      { label: "THE SPREAD IS", text: "what it costs you to trade immediately." },
    ],
    worked: {
      note: "one quote",
      parts: [
        { label: "Ask", value: "$50.05" },
        { label: "Bid", value: "$50.00" },
        { label: "Spread", value: "$0.05" },
      ],
      ops: ["−", "="],
    },
    terms: ["bid", "ask", "spread", "liquidity"],
    q: "The 'ask' price is…",
    choices: ["The lowest price a seller will accept", "A question you send the company", "Last year's average price"],
    answer: 0,
    explain: "Right — ask = sellers' lowest price, bid = buyers' highest. You usually buy at the ask and sell at the bid.",
  },
  {
    title: "Bull vs bear markets",
    teach: "A bull market is a stretch of rising prices and optimism; a bear market is a prolonged fall of about 20% or more, with caution and fear. Remember: bulls charge up, bears swipe down.",
    takeaways: [
      { label: "A BULL MARKET IS", text: "a long stretch of rising prices." },
      { label: "A BEAR MARKET IS", text: "a fall of roughly 20% or more, sustained." },
    ],
    worked: {
      note: "the usual threshold",
      parts: [
        { label: "Peak", value: "$100.00" },
        { label: "Now", value: "$80.00" },
        { label: "Drawdown", value: "−20%" },
      ],
      ops: ["→", "="],
    },
    terms: ["bull market", "bear market", "correction", "drawdown"],
    q: "A 'bear market' means prices are broadly…",
    choices: ["Rising strongly", "Falling for a sustained period", "Completely frozen"],
    answer: 1,
    explain: "Correct — bear = sustained decline. These cycles are normal; markets have historically recovered over time.",
  },
  {
    title: "Don't put all your eggs in one basket",
    teach: "Diversification means spreading money across many stocks (or funds) instead of betting everything on one. If one company stumbles, the others cushion the blow. It's the closest thing investing has to a free lunch.",
    takeaways: [
      { label: "DIVERSIFICATION IS", text: "spreading money so no single name decides your year." },
      { label: "IT IS NOT", text: "a guarantee — it softens blows, it does not stop them." },
    ],
    worked: {
      note: "10 equal holdings",
      parts: [
        { label: "One holding falls", value: "−50%" },
        { label: "Holdings", value: "10" },
        { label: "Portfolio", value: "−5%" },
      ],
      ops: ["÷", "="],
    },
    terms: ["diversification", "portfolio", "concentration risk"],
    q: "Diversification mainly helps by…",
    choices: ["Guaranteeing you never lose money", "Spreading risk so one bad pick hurts less", "Doubling your returns automatically"],
    answer: 1,
    explain: "Right — it reduces risk. Nothing guarantees against losses, but spreading out softens any single blow.",
  },
  {
    title: "Time in the market",
    teach: "Prices bounce around daily, but historically the broad market has trended upward over years. Investing regularly and staying patient tends to beat trying to jump in and out at the perfect moment.",
    takeaways: [
      { label: "TIME IS", text: "the one advantage a beginner starts with." },
      { label: "TIMING IS", text: "the thing almost nobody does reliably." },
    ],
    terms: ["compounding", "dollar-cost averaging", "time horizon"],
    q: "For most beginners, a sensible mindset is…",
    choices: ["Panic-sell the moment a stock dips", "Invest steadily and think long-term", "Only buy the single hottest stock"],
    answer: 1,
    explain: "Correct — steady, long-term, diversified investing beats panic. You've graduated Stock School! 🎓",
  },
];

// The score, as the reference prints it. The COUNT of right answers stays the
// stored truth — it is what the end card and the other two quiz games read —
// and the points on screen are a multiplication of it. One number, two views,
// no way for the "+20" to disagree with the total it lands in.
export function points(correct) {
  return Math.max(0, Math.floor(Number(correct) || 0)) * POINTS_PER_ANSWER;
}

// The syllabus shows a window, not the whole list — the reference draws five
// rows and "+ 3 more". The window slides so the current lesson is always in
// it, and clamps at both ends so lesson 8 does not scroll off the bottom of a
// panel that has room for it.
export function syllabusWindow(total, current, size = 5) {
  const n = Math.max(0, total);
  if (n <= size) return { from: 0, to: n, hidden: 0 };
  const half = Math.floor(size / 2);
  const from = Math.max(0, Math.min(n - size, current - half));
  return { from, to: from + size, hidden: n - size };
}

// "01" — the lesson number as the tiles print it.
export function lessonNo(i) {
  return String(i + 1).padStart(2, "0");
}
