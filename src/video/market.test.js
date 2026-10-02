import { describe, it, expect } from "vitest";
import { isMarketVideo, marketQuery, DESCRIPTION_LEAD } from "./market.js";

// Titles, channels and categories below are real YouTube results, sampled on
// 2026-10-01 for the queries the desk actually sends. Descriptions and tags are
// trimmed to the part that matters.
const v = (title, o = {}) => ({ title, channel: "", description: "", tags: [], categoryId: "27", ...o });

describe("market videos: what plays", () => {
  it("passes a title that says what it is about", () => {
    for (const t of [
      "Tesla Stock Price Analysis | Top $TSLA Levels To Watch for October 2nd, 2026",
      "AMD Investors GET READY‼️ The time has come…",
      "If You Are an AMD Shareholder...You Need to See This!",
      "Two Big Benefits Berkshire Hathaway Has Over Mutual Funds",
      "Berkshire Hathaway CEO Greg Abel on resuming buyback program",
      "LOOKING DEEPER: Payne reflects on stock market action",
    ]) expect(isMarketVideo(v(t)), t).toBe(true);
  });

  it("passes a quiet title when the lead and the channel say it", () => {
    expect(isMarketVideo(v("If You Own Nvidia and AMD ... GET READY!!!", {
      channel: "Jose Najarro Stocks",
      description: "Nvidia and AMD reported this week. Here is how I am investing around it.",
    }))).toBe(true);
    expect(isMarketVideo(v("We sold the last of our Berkshire shares, says Smead Capital's Bill Smead", {
      channel: "CNBC Television", categoryId: "25",
      description: "Bill Smead, Smead Capital Management CIO, joins 'The Exchange' to discuss why he sold.",
      tags: ["cnbc", "investing", "stocks"],
    }))).toBe(true);
  });

  it("passes a broadcast whose title is just its name, on its programme schedule", () => {
    expect(isMarketVideo(v("🚨Watch Schwab Network LIVE 🚨", {
      channel: "Schwab Network", categoryId: "25",
      description: "LIVE PROGRAMMING SCHEDULE: 8-9am ET: Morning Movers 9-10am ET: Opening Bell 10-11am ET: Morning Trade Live 11am-12pm ET: Trading 360 1-2pm ET: Next Gen Investing",
    }))).toBe(true);
  });

  it("reads a model's thinner shape — title, channel, brief", () => {
    expect(isMarketVideo({ title: "Why AMD fell after its event", channel: "CNBC Television",
      brief: "Analysts break down the stock's drop and what it means for earnings." })).toBe(true);
    expect(isMarketVideo({ title: "Top 10 cat moments", channel: "Cute Cats", brief: "Cats being funny." })).toBe(false);
  });
});

describe("market videos: what does not", () => {
  it("drops a category that is never market coverage, whatever it is tagged", () => {
    // Real: a stock-meme cat channel, filed under Gaming and tagged #stockmarket.
    expect(isMarketVideo(v("Check the price now 😎📈🐱 #memes #stonkcats #stockmarket #investing #cats #stocks",
      { categoryId: "20" }))).toBe(false);
    expect(isMarketVideo(v("Cats Eye Witness News Reports from The New York Stock Exchange", { categoryId: "15" }))).toBe(false);
    for (const cat of ["1", "10", "17", "19", "23", "30", "44"]) {
      expect(isMarketVideo(v("NVDA stock earnings preview", { categoryId: cat })), `category ${cat}`).toBe(false);
    }
  });

  it("drops a video with nothing to say about stocks", () => {
    expect(isMarketVideo(v("William, We're Cats", { categoryId: "22", channel: "LightfootVO Memes" }))).toBe(false);
  });

  it("does not let boilerplate past the lead vouch for a video", () => {
    // Fox Business pastes "financial news … Wall Street" under everything it
    // uploads, campaign speeches included.
    const tail = " FOX Business Network (FBN) is a financial news channel that impacts both Main Street and Wall Street.";
    expect(isMarketVideo(v("LIVE: President delivers remarks at a rally", {
      channel: "Fox Business", categoryId: "25",
      description: "The president speaks to supporters in Ohio.".padEnd(DESCRIPTION_LEAD, " ") + tail,
    }))).toBe(false);
  });

  it("caps what tags can add", () => {
    // Tags are set per channel as often as per video: they top a case up, they
    // cannot make one.
    expect(isMarketVideo(v("Morning show highlights", {
      categoryId: "24", tags: ["stocks", "investing", "earnings", "wall street", "nasdaq"],
    }))).toBe(false);
  });

  it("drops crypto, forex and gold rooms that only sound like trading", () => {
    for (const t of [
      "🟢 BITCOIN LIVE EDUCATIONAL TRADING CHART WITH  ORDER BOOK & ZONES",
      "🔴 LIVE XAUUSD | AI Bot Trading Battle + Smart Money Analysis (Educational)",
      "🔴 XAU/USD Real-Time 1 Minute Chart (Educational) - Live GOLD Market Data 24/7",
      "bitcoin perp liquidations",
    ]) expect(isMarketVideo(v(t)), t).toBe(false);
  });

  it("keeps another market when it is also about stocks", () => {
    expect(isMarketVideo(v("Bitcoin ETF inflows hit a record"))).toBe(true);
    expect(isMarketVideo(v("Live Trading and Learning | ASIAN SESSION | NASDAQ | GOLD | SILVER"))).toBe(true);
    expect(isMarketVideo(v("Gold miners: 3 stocks riding the rally"))).toBe(true);
  });

  it("knows a shop, a soup and a card game from the market", () => {
    for (const t of ["PS5 back in stock at Target", "Chicken stock from scratch", "Pokémon trading cards haul", "Free stock footage pack"])
      expect(isMarketVideo(v(t, { categoryId: "22" })), t).toBe(false);
    expect(isMarketVideo(v("Investing in stocks for beginners"))).toBe(true);
  });

  it("treats a $40 price and a $BTC coin differently from a $TSLA ticker", () => {
    expect(isMarketVideo(v("Why $TSLA could double"))).toBe(true);
    expect(isMarketVideo(v("I spent $40 on this"))).toBe(false);
    expect(isMarketVideo(v("Is $BTC going to 200k?"))).toBe(false);
  });

  it("survives junk without throwing", () => {
    for (const junk of [null, undefined, "", 42, {}, { title: null }, { tags: "not an array" }])
      expect(isMarketVideo(junk)).toBe(false);
  });
});

describe("market videos: the query that goes out", () => {
  it("leaves a query that is already about stocks alone", () => {
    for (const q of ["AMD stock", "tesla earnings", "fed rate cut", "interest rates", "$NVDA", "bitcoin etf"])
      expect(marketQuery(q)).toBe(q);
  });

  it("says the market out loud for anything else", () => {
    expect(marketQuery("cats")).toBe("cats stock market");
    expect(marketQuery("Warren Buffett")).toBe("Warren Buffett stock market");
    expect(marketQuery("gold")).toBe("gold stock market");
    // Market words, but about the wrong market — the crypto stocks are the
    // closest this desk will go.
    expect(marketQuery("bitcoin trading")).toBe("bitcoin trading stock market");
  });

  it("passes an empty query through for the caller to reject", () => {
    expect(marketQuery("")).toBe("");
    expect(marketQuery("   ")).toBe("");
    expect(marketQuery(undefined)).toBe("");
  });
});
