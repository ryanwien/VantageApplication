import { describe, it, expect } from "vitest";
import { LESSONS, POINTS_PER_ANSWER, points, syllabusWindow, lessonNo } from "./school.js";

// The reference's HUD says "LESSON 1/8", its syllabus draws five rows and
// "+ 3 more", and its quiz pays "+20". All three only hold if there are eight
// lessons, so that is a fact worth pinning rather than a coincidence.
describe("the syllabus is eight lessons", () => {
  it("has exactly the eight the HUD counts", () => {
    expect(LESSONS).toHaveLength(8);
  });
  it("numbers them the way the tiles print them", () => {
    expect(lessonNo(0)).toBe("01");
    expect(lessonNo(7)).toBe("08");
  });
});

// A contract over the CONTENT, not the code. Adding a ninth lesson with two
// choices and an answer index of 2 is a mistake nobody sees until a player
// picks C — so every lesson is walked and checked.
describe("every lesson is well formed", () => {
  it.each(LESSONS.map((l, i) => [i, l.title, l]))("lesson %i — %s", (i, title, l) => {
    expect(l.title.trim()).not.toBe("");
    expect(l.teach.trim().length).toBeGreaterThan(40);

    // The quiz
    expect(Array.isArray(l.choices)).toBe(true);
    expect(l.choices.length).toBeGreaterThanOrEqual(2);
    expect(l.choices.every(c => typeof c === "string" && c.trim())).toBe(true);
    expect(Number.isInteger(l.answer)).toBe(true);
    expect(l.answer).toBeGreaterThanOrEqual(0);
    expect(l.answer).toBeLessThan(l.choices.length);
    expect(new Set(l.choices).size).toBe(l.choices.length);   // no duplicate options
    expect(l.q.trim()).not.toBe("");
    expect(l.explain.trim()).not.toBe("");

    // The two takeaway cards the handoff draws
    expect(l.takeaways).toHaveLength(2);
    for (const t of l.takeaways) {
      expect(t.label).toBe(t.label.toUpperCase());   // the mono label voice
      expect(t.text.trim()).not.toBe("");
    }

    // The term chips
    expect(l.terms.length).toBeGreaterThanOrEqual(3);
    expect(new Set(l.terms).size).toBe(l.terms.length);
  });
});

describe("worked examples", () => {
  const withWorked = LESSONS.filter(l => l.worked);
  it("are present on the lessons that have arithmetic, and absent where there is none", () => {
    // Five of eight. The other three — what a ticker is, why prices move, time
    // in the market — have no honest sum, and get no panel.
    expect(withWorked).toHaveLength(5);
    expect(LESSONS.filter(l => !l.worked).map(l => l.title)).toEqual([
      "Ticker symbols", "Why prices move", "Time in the market",
    ]);
  });
  it("always have one fewer operator than they have terms", () => {
    for (const l of withWorked) {
      expect(l.worked.ops).toHaveLength(l.worked.parts.length - 1);
      expect(l.worked.parts.length).toBeGreaterThanOrEqual(2);
    }
  });
  it("label every term and give every one a value", () => {
    for (const l of withWorked) {
      for (const p of l.worked.parts) {
        expect(p.label.trim()).not.toBe("");
        expect(p.value.trim()).not.toBe("");
      }
      expect(l.worked.note.trim()).not.toBe("");
    }
  });
  it("actually compute — the reference's own example and the four beside it", () => {
    const byTitle = (t) => LESSONS.find(l => l.title === t).worked;
    const num = (s) => Number(String(s).replace(/[$,%+−]/g, "").replace(/,/g, ""));

    const eps = byTitle("What is a stock?");
    expect(num(eps.parts[0].value) / num(eps.parts[1].value)).toBe(num(eps.parts[2].value));   // 5,000,000 ÷ 1,000,000 = 5.00

    const pct = byTitle("Gains and losses (%)");
    expect((num(pct.parts[0].value) / num(pct.parts[1].value)) * 100).toBe(num(pct.parts[2].value));   // 5 ÷ 50 = 10%

    const spread = byTitle("Bid, ask & the spread");
    expect(+(num(spread.parts[0].value) - num(spread.parts[1].value)).toFixed(2)).toBe(num(spread.parts[2].value));   // 50.05 − 50.00 = 0.05

    const bear = byTitle("Bull vs bear markets");
    const dd = ((num(bear.parts[1].value) - num(bear.parts[0].value)) / num(bear.parts[0].value)) * 100;
    expect(Math.abs(dd)).toBe(num(bear.parts[2].value));   // 100 → 80 = 20% down

    const div = byTitle("Don't put all your eggs in one basket");
    expect(num(div.parts[0].value) / num(div.parts[1].value)).toBe(num(div.parts[2].value));   // 50 ÷ 10 = 5%
  });
});

describe("points", () => {
  it("are the count of right answers, times twenty", () => {
    expect(POINTS_PER_ANSWER).toBe(20);
    expect(points(0)).toBe(0);
    expect(points(1)).toBe(20);
    expect(points(8)).toBe(160);
  });
  it("cannot be dragged negative or fractional by a bad count", () => {
    expect(points(-3)).toBe(0);
    expect(points(2.7)).toBe(40);
    expect(points(undefined)).toBe(0);
    expect(points("x")).toBe(0);
  });
});

describe("syllabusWindow", () => {
  it("shows everything when everything fits", () => {
    expect(syllabusWindow(4, 0, 5)).toEqual({ from: 0, to: 4, hidden: 0 });
  });
  it("hides the overflow and says how much, as the reference does", () => {
    // Eight lessons, five rows: "+ 3 more".
    expect(syllabusWindow(8, 0, 5)).toEqual({ from: 0, to: 5, hidden: 3 });
  });
  it("slides so the current lesson is always inside the window", () => {
    for (let i = 0; i < 8; i++) {
      const w = syllabusWindow(8, i, 5);
      expect(i).toBeGreaterThanOrEqual(w.from);
      expect(i).toBeLessThan(w.to);
    }
  });
  it("clamps at the end rather than running off it", () => {
    expect(syllabusWindow(8, 7, 5)).toEqual({ from: 3, to: 8, hidden: 3 });
    expect(syllabusWindow(8, 4, 5)).toEqual({ from: 2, to: 7, hidden: 3 });
  });
  it("survives an empty syllabus", () => {
    expect(syllabusWindow(0, 0, 5)).toEqual({ from: 0, to: 0, hidden: 0 });
  });
});
