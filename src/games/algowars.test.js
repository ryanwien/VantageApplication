import { describe, it, expect } from "vitest";
import {
  AW_W, AW_H, AW_LANES, AW_LANE_ID, AW_BOTS, AW_ORDER, AW_STANCES, AW_COUNTER,
  AW_CAP_MAX, AW_BASE_HP, AW_YOU_RATE, awLaneY, awStats, awClock, awRate, awLog,
  awNewSim, awDeploy, awThreat, awStep, awBlankHud, awReadHud,
} from "./algowars.js";

// A fight with the enemy brain held off, so a test measures the one thing it set up.
const quiet = () => { const s = awNewSim(); s.cpu.nextDeploy = 1e9; return s; };
const half = () => 0.5;
const unit = (side, type, over = {}) => ({
  side, type, hp: AW_BOTS[type].hp, maxHp: AW_BOTS[type].hp, born: 0,
  lane: 1, x: AW_W / 2, y: awLaneY(1), cd: 0, ...over,
});
const run = (sim, seconds, dt = 0.05, stance = "balanced") => {
  for (let i = 0; i < Math.round(seconds / dt); i++) awStep(sim, dt, stance, half);
};

describe("the unit table", () => {
  it("is the three the deploy row shows", () => {
    expect(AW_ORDER).toEqual(["day", "index", "hedge"]);
    expect(Object.keys(AW_BOTS).sort()).toEqual([...AW_ORDER].sort());
  });
  it("gives each unit its own silhouette, because colour already means side", () => {
    const shapes = AW_ORDER.map(k => AW_BOTS[k].shape);
    expect(new Set(shapes).size).toBe(3);
  });
  it("costs what the cards print", () => {
    expect([AW_BOTS.day.cost, AW_BOTS.index.cost, AW_BOTS.hedge.cost]).toEqual([14, 28, 24]);
  });
});

describe("rock-paper-scissors", () => {
  it("is a real cycle — nothing counters itself and nothing is unanswered", () => {
    for (const k of AW_ORDER) expect(AW_COUNTER[k]).not.toBe(k);
    expect(new Set(Object.values(AW_COUNTER)).size).toBe(3);
    // three hops round the loop and you are back where you started
    let k = "day";
    for (let i = 0; i < 3; i++) k = AW_COUNTER[k];
    expect(k).toBe("day");
  });
});

describe("awStats — what a deploy card promises", () => {
  it("scores every stat against the best in class, so exactly one bar is full", () => {
    for (const key of ["dmg", "hp", "spd"]) {
      const col = AW_ORDER.map(k => Object.fromEntries(awStats(k))[key]);
      expect(col.filter(v => v === 1)).toHaveLength(1);
      for (const v of col) { expect(v).toBeGreaterThan(0); expect(v).toBeLessThanOrEqual(1); }
    }
  });
  it("rates damage as SUSTAINED, not per shot — which is what the sim delivers", () => {
    const day = Object.fromEntries(awStats("day")).dmg;
    // Per shot a Day-Trader hits for 6 against a Hedge-Fund's 22 — 27%. It also
    // fires nearly three times as often, and the fight is decided by the second
    // number. A bar drawn on the first sells a unit that does not exist.
    expect(AW_BOTS.day.dmg / AW_BOTS.hedge.dmg).toBeLessThan(0.3);
    expect(day).toBeGreaterThan(0.5);
    expect(Object.fromEntries(awStats("hedge")).dmg).toBe(1);
  });
});

describe("awClock / awRate", () => {
  it("counts the round in mm:ss", () => {
    expect(awClock(0)).toBe("00:00");
    expect(awClock(84)).toBe("01:24");
    expect(awClock(-3)).toBe("00:00");
  });
  it("prints the regen rate exactly, and drops a decimal that is not there", () => {
    expect(awRate(5.6)).toBe("5.6");
    expect(awRate(6)).toBe("6");
    expect(awRate(0)).toBe("0");
  });
  it("prints the rate the sim actually pays", () => {
    // The card used to round 5.6/s to "+6/s", which over a ninety-second round
    // is thirty-six capital it never handed over.
    const sim = quiet();
    sim.you.cap = 0;
    run(sim, 5);
    expect(sim.you.cap).toBeCloseTo(5 * Number(awRate(AW_YOU_RATE)), 6);
  });
});

describe("awDeploy", () => {
  it("spends the cost, lands in the lane it was sent to, and says so in the log", () => {
    const sim = quiet();
    sim.you.cap = 100;
    expect(awDeploy(sim, "you", "index", 2, half)).toBe(true);
    expect(sim.you.cap).toBe(100 - AW_BOTS.index.cost);
    expect(sim.you.sent).toBe(1);
    expect(sim.units).toHaveLength(1);
    expect(sim.units[0].lane).toBe(2);
    expect(sim.units[0].y).toBeCloseTo(awLaneY(2), 6);
    expect(sim.log[0]).toMatchObject({ kind: "deploy", who: "you", type: "index" });
  });
  it("refuses what you cannot afford, and charges nothing for the refusal", () => {
    const sim = quiet();
    sim.you.cap = AW_BOTS.index.cost - 1;
    expect(awDeploy(sim, "you", "index", 0, half)).toBe(false);
    expect(sim.you.cap).toBe(AW_BOTS.index.cost - 1);
    expect(sim.units).toHaveLength(0);
    expect(sim.you.sent).toBe(0);
  });
  it("hands back an unsettled fight, which is what lets the loop start again", () => {
    // The draw loop parks itself when a round is over and only wakes on a sim
    // that has not been painted. A rematch that arrived pre-settled would show
    // a frozen field.
    expect(awNewSim().settled).toBe(false);
    expect(awNewSim().over).toBe(null);
  });
  it("refuses once the round is decided", () => {
    const sim = quiet();
    sim.you.cap = 100;
    sim.over = "cpu";
    expect(awDeploy(sim, "you", "day", 0, half)).toBe(false);
    expect(sim.units).toHaveLength(0);
  });
});

describe("damage is counted where it lands, not where it was aimed", () => {
  it("credits only what the target had left", () => {
    // A Hedge-Fund hits for 22. A Day-Trader on 3 hit points absorbs 3 of that.
    // Counting the whole 22 is how DAMAGE DEALT described a round that did not
    // happen.
    const sim = quiet();
    sim.units = [unit("you", "hedge", { x: 400 }), unit("cpu", "day", { x: 410, hp: 3 })];
    awStep(sim, 0.016, "balanced", half);
    expect(sim.you.dealt).toBe(3);
    expect(sim.units.filter(u => u.side === "cpu")).toHaveLength(0);
  });
  it("credits the full hit when the target can take it", () => {
    const sim = quiet();
    sim.units = [unit("you", "hedge", { x: 400 }), unit("cpu", "index", { x: 410 })];
    awStep(sim, 0.016, "balanced", half);
    expect(sim.you.dealt).toBe(AW_BOTS.hedge.dmg);
  });
  it("clamps the killing blow on a server too", () => {
    const sim = quiet();
    sim.cpu.baseHp = 5;
    sim.units = [unit("you", "hedge", { x: sim.cpu.baseX })];
    awStep(sim, 0.016, "balanced", half);
    expect(sim.you.dealt).toBe(5);
    expect(sim.over).toBe("you");
  });
  it("does not let two shooters both bill for one kill", () => {
    // Units die at the END of a frame, so a corpse is still in the array while
    // the rest of the frame runs. Firing at it wastes a cooldown on nothing and
    // used to bank the damage as well.
    const sim = quiet();
    sim.units = [
      unit("you", "hedge", { x: 400 }),
      unit("you", "hedge", { x: 402 }),
      unit("cpu", "day", { x: 410, hp: 3 }),
    ];
    awStep(sim, 0.016, "balanced", half);
    expect(sim.you.dealt).toBe(3);
  });
});

describe("capital", () => {
  it("regenerates at the side's own rate", () => {
    const sim = quiet();
    sim.you.cap = 0; sim.cpu.cap = 0;
    run(sim, 2);
    expect(sim.you.cap).toBeCloseTo(2 * sim.you.rate, 6);
    expect(sim.cpu.cap).toBeCloseTo(2 * sim.cpu.rate, 6);
    expect(sim.you.rate).toBeGreaterThan(sim.cpu.rate);   // you are ahead on income, not behind
  });
  it("stops at the ceiling the HUD bar is drawn against", () => {
    const sim = quiet();
    sim.you.cap = AW_CAP_MAX - 1;
    run(sim, 3);
    expect(sim.you.cap).toBe(AW_CAP_MAX);
  });
});

describe("the undefended lane, which is how this is lost", () => {
  it("counts up where you have nothing and resets where you do", () => {
    const sim = quiet();
    sim.units = [unit("you", "day", { lane: 0 })];
    run(sim, 1, 0.1);
    expect(sim.open[0]).toBe(0);
    expect(sim.open[1]).toBeCloseTo(1, 5);
    expect(sim.openMax[2]).toBeCloseTo(1, 5);
  });
  it("remembers the worst it ever got, not just the worst it is now", () => {
    const sim = quiet();
    run(sim, 2, 0.1);                                  // every lane open for 2s
    sim.units = AW_LANE_ID.map((_, i) => unit("you", "day", { lane: i }));
    run(sim, 1, 0.1);                                  // all three now held
    expect(sim.open[1]).toBe(0);
    expect(sim.openMax[1]).toBeCloseTo(2, 5);
  });
});

describe("awThreat", () => {
  it("says nothing is coming when nothing is", () => {
    const th = awThreat(quiet());
    expect(th.type).toBe(null);
    expect(th.counter).toBe(null);
    expect(th.level).toBe("calm");
  });
  it("points at the lane under the most pressure, weighted by how close it is", () => {
    const sim = quiet();
    sim.units = [
      // two fresh units still at the enemy's own wall
      unit("cpu", "day", { lane: 0, x: sim.cpu.baseX - 10 }),
      unit("cpu", "day", { lane: 0, x: sim.cpu.baseX - 12 }),
      // one at your door
      unit("cpu", "hedge", { lane: 2, x: sim.you.baseX + 20 }),
    ];
    const th = awThreat(sim);
    expect(th.lane).toBe("C");
    expect(th.type).toBe("hedge");
  });
  it("names the counter out of the same table the fight runs on", () => {
    const sim = quiet();
    sim.units = [unit("cpu", "index", { lane: 1, x: sim.you.baseX + 30 })];
    const th = awThreat(sim);
    expect(th.type).toBe("index");
    expect(th.counter).toBe(AW_COUNTER.index);
  });
  it("keeps the bar inside its box", () => {
    const sim = quiet();
    sim.units = Array.from({ length: 40 }, () => unit("cpu", "index", { lane: 1, x: sim.you.baseX }));
    const th = awThreat(sim);
    expect(th.pct).toBeLessThanOrEqual(1);
    expect(awThreat(quiet()).pct).toBeGreaterThan(0);
  });
});

describe("awStep", () => {
  it("keeps units on the field", () => {
    const sim = quiet();
    sim.units = [unit("you", "day", { y: 2 }), unit("you", "day", { y: AW_H + 40 })];
    run(sim, 1, 0.05);
    for (const u of sim.units) {
      expect(u.y).toBeGreaterThanOrEqual(18);
      expect(u.y).toBeLessThanOrEqual(AW_H - 18);
    }
  });
  it("ends the round when a server falls, and names the side still standing", () => {
    const sim = quiet();
    sim.you.baseHp = 1;
    sim.units = [unit("cpu", "hedge", { x: sim.you.baseX })];
    awStep(sim, 0.016, "balanced", half);
    expect(sim.over).toBe("cpu");
    expect(sim.log[0].kind).toBe("lost");
  });
  it("does nothing more once it is over", () => {
    const sim = quiet();
    sim.over = "you";
    const t = sim.t, cap = sim.you.cap;
    awStep(sim, 0.5, "balanced", half);
    expect(sim.t).toBe(t);
    expect(sim.you.cap).toBe(cap);
  });

  it("plays a whole round out, and an idle player loses it", () => {
    // No deployments from this side at all — the enemy brain is live. This is
    // the one test that runs the real thing end to end, and it is here because
    // a simulation that can stall is a game that hangs.
    const sim = awNewSim();
    let rc = 0;
    const rand = () => { rc = (rc * 1103515245 + 12345) % 2147483648; return rc / 2147483648; };
    for (let i = 0; i < 6000 && !sim.over; i++) awStep(sim, 0.05, "balanced", rand);
    expect(sim.over).toBe("cpu");
    expect(sim.t).toBeLessThan(300);
    expect(sim.you.baseHp).toBeLessThanOrEqual(0);
    for (const u of sim.units) { expect(Number.isFinite(u.x)).toBe(true); expect(Number.isFinite(u.y)).toBe(true); }
  });
});

describe("awReadHud", () => {
  it("starts where the blank reading says it does", () => {
    const blank = awBlankHud(), live = awReadHud(awNewSim());
    expect(live.youHp).toBe(blank.youHp);
    expect(live.cap).toBe(blank.cap);
    expect(blank.youHp).toBe(AW_BASE_HP);
  });
  it("reads the counts and the damage off the fight rather than storing them", () => {
    const sim = quiet();
    sim.units = [unit("you", "day"), unit("you", "hedge"), unit("cpu", "index")];
    const hud = awReadHud(sim);
    expect(hud.youN).toBe(2);
    expect(hud.cpuN).toBe(1);
    // sustained dps, same arithmetic the cards are drawn from
    expect(hud.youDps).toBe(Math.round(AW_BOTS.day.dmg / AW_BOTS.day.rate + AW_BOTS.hedge.dmg / AW_BOTS.hedge.rate));
  });
  it("hands the rail a copy of the log, not the log", () => {
    // sim.log is mutated in place by the loop. A state value aliasing it would
    // change under React with no render to show for it.
    const sim = quiet();
    awLog(sim, "deploy", "you", "day");
    const hud = awReadHud(sim);
    const n = hud.log.length;
    awLog(sim, "deploy", "cpu", "hedge");
    expect(hud.log).toHaveLength(n);
  });
  it("never prints a negative server", () => {
    const sim = quiet();
    sim.you.baseHp = -40;
    expect(awReadHud(sim).youHp).toBe(0);
  });
  it("reports the lane that went unheld longest", () => {
    const sim = quiet();
    sim.openMax = [3, 11, 5];
    const hud = awReadHud(sim);
    expect(hud.openLane).toBe("B");
    expect(hud.openSecs).toBe(11);
  });
});

describe("the field", () => {
  it("puts the lanes where the three buttons over the canvas are", () => {
    expect(AW_LANE_ID).toHaveLength(AW_LANES);
    for (let i = 0; i < AW_LANES; i++) {
      expect(awLaneY(i)).toBeGreaterThan((AW_H * i) / AW_LANES);
      expect(awLaneY(i)).toBeLessThan((AW_H * (i + 1)) / AW_LANES);
    }
  });
  it("offers the three stances the rail switch offers", () => {
    expect(AW_STANCES).toEqual(["aggressive", "balanced", "defensive"]);
  });
});
