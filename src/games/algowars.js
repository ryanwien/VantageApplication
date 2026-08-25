// ============================================================
//  algowars.js — the Algorithm Wars simulation, and every number read off it.
//
//  WHY THIS IS ITS OWN FILE
//  This was the last game still living entirely inside React.jsx, and the only
//  one of the six with no tests at all — which for the one game that is a real
//  simulation is exactly backwards. A card that says a Hedge-Fund melts tanks
//  is a claim about arithmetic that runs sixty times a second, and the only way
//  to know it is true is to run it.
//
//  So everything that CAN be checked without a screen lives here: the unit
//  table, deployment, the enemy's brain, one frame of the fight, the threat
//  read and the HUD sample. What is left in React.jsx is drawing — awDraw,
//  awTower, awPath and the SVG mark — because a canvas needs a canvas.
//
//  NOTHING HERE IS STORED TWICE
//  The HUD, the threat panel, the deploy cards' stat bars and the end card are
//  all functions of the sim. There is no `dps` field, no `threatLevel`, no
//  cached bot count — those are read on the way past, so none of them can
//  disagree with the fight they describe.
// ============================================================

export const AW_W = 900, AW_H = 372;
export const AW_LANES = 3;
export const AW_LANE_ID = ["A", "B", "C"];
export const awLaneY = (i) => (AW_H * (i + 0.5)) / AW_LANES;

// A bot is told apart by SHAPE, not by hue.
//
// The three used to be a white circle, a cyan circle and an indigo circle —
// two of those colours belonged to the previous palette, and all three sat on
// top of a fill that already carries a meaning (green = yours, red = theirs).
// So the battlefield asked the eye to read two colours per unit at 7px, and
// the second one vanished on a colourblind screen entirely.
//
// Shape is free of all that: a swarm is round, a tank is a block, a burst unit
// is a dart aimed at the other side. The same three marks label the deploy
// cards, so the card teaches the battlefield.
//
// No names or blurbs in this table on purpose. Those are translated, and a
// table field translated at the call site is a key the audit cannot see.
export const AW_BOTS = {
  day:   { cost: 14, hp: 24, dmg: 6,  range: 26, speed: 48, rate: 0.55, r: 7,  shape: "circle" },
  index: { cost: 28, hp: 92, dmg: 4,  range: 22, speed: 22, rate: 0.9,  r: 10, shape: "square" },
  hedge: { cost: 24, hp: 12, dmg: 22, range: 96, speed: 32, rate: 1.5,  r: 7,  shape: "triangle" },
};
export const AW_ORDER = ["day", "index", "hedge"];
export const AW_STANCES = ["aggressive", "balanced", "defensive"];
export const AW_CAP_MAX = 150, AW_BASE_HP = 200;

// What each side earns per second. Not round numbers, and the HUD prints them
// as they are — see awRate.
export const AW_YOU_RATE = 5.6, AW_CPU_RATE = 5.2;

// Rock-paper-scissors, written down once. The threat panel reads this rather
// than restating it in prose, so the coaching can never drift from the sim.
export const AW_COUNTER = { hedge: "day", day: "index", index: "hedge" };

// The DMG / HP / SPD triple on a deploy card, as a fraction of the best in
// class. SUSTAINED damage (dmg ÷ cooldown), not damage per shot: a Hedge-Fund
// hits nearly four times harder than a Day-Trader and fires a third as often,
// and a bar showing only the first half of that sells a unit the sim does not
// deliver. Computed off the same table the fight runs on, so a card cannot lie
// about the thing it deploys.
export const AW_BEST = {
  dmg: Math.max(...AW_ORDER.map(k => AW_BOTS[k].dmg / AW_BOTS[k].rate)),
  hp:  Math.max(...AW_ORDER.map(k => AW_BOTS[k].hp)),
  spd: Math.max(...AW_ORDER.map(k => AW_BOTS[k].speed)),
};
export const awStats = (k) => {
  const b = AW_BOTS[k];
  return [["dmg", (b.dmg / b.rate) / AW_BEST.dmg], ["hp", b.hp / AW_BEST.hp], ["spd", b.speed / AW_BEST.spd]];
};

// mm:ss off the SIM clock, not wall time — a backgrounded tab must not age the
// round while nothing is being simulated.
export const awClock = (s) => {
  const n = Math.max(0, Math.floor(s));
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
};

// The regen rate, said exactly. Rounding it was a quiet lie: capital comes in
// at 5.6 a second and the card read "+6/s", which over a ninety-second round
// is thirty-six capital — two and a half Day-Traders — that the number
// promised and the sim never paid. A trailing ".0" is dropped, so an integer
// rate would still print as one.
export const awRate = (r) => {
  const n = Number(r) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

// The log holds STRUCTURE, not sentences: {kind, who, type}. The rail turns it
// into words at render, which is what lets it be translated and lets a unit
// name keep its side's colour inside the line.
export function awLog(sim, kind, who, type) {
  sim.logId += 1;
  sim.log.unshift({ id: sim.logId, at: sim.t, kind, who, type });
  if (sim.log.length > 20) sim.log.length = 20;
}

// A fight, at frame zero.
export function awNewSim() {
  return {
    t: 0, lastHud: 0, over: null, settled: false, tracers: [], puffs: [], units: [],
    log: [], logId: 0, open: [0, 0, 0], openMax: [0, 0, 0],
    you: { cap: 34, rate: AW_YOU_RATE, baseHp: AW_BASE_HP, baseX: 46, spawnX: 78, sent: 0, dealt: 0 },
    cpu: { cap: 34, rate: AW_CPU_RATE, baseHp: AW_BASE_HP, baseX: AW_W - 46, spawnX: AW_W - 78, sent: 0, dealt: 0, stance: "balanced", nextDeploy: 2.2 },
  };
}

// spend capital to spawn one bot of `type` for `side` in `lane`; false if unaffordable
export function awDeploy(sim, side, type, lane, rand = Math.random) {
  const b = AW_BOTS[type], S = sim[side];
  if (!sim || sim.over || S.cap < b.cost) return false;
  S.cap -= b.cost;
  // `born` drives the spawn pop — a unit that simply exists on one frame and
  // not the previous one reads as a rendering glitch, not as an arrival.
  sim.units.push({
    side, type, hp: b.hp, maxHp: b.hp, born: sim.t, lane,
    x: S.spawnX, y: awLaneY(lane) + (rand() * 2 - 1) * 14, cd: rand() * 0.3,
  });
  S.sent += 1;
  awLog(sim, "deploy", side, type);
  return true;
}

// Damage `amount` to a thing with `hp`, and return what actually LANDED.
//
// A Hedge-Fund hits for 22. A Day-Trader has 24 hit points and is often on 3
// when the shot arrives. Counting the whole 22 was how DAMAGE DEALT on the end
// card came to describe a round that did not happen: overkill is damage you
// paid for and did not deliver, and a stat that counts it is measuring your
// intentions.
function landed(hpBefore, amount) {
  return Math.max(0, Math.min(amount, hpBefore));
}

// enemy (CPU) AI: read the board to pick a stance, then periodically deploy a
// counter-unit into whichever lane it holds least.
export function awBrain(sim, dt, rand = Math.random) {
  const cpu = sim.cpu;
  const us = sim.units;
  const youN = us.filter(u => u.side === "you").length, cpuN = us.filter(u => u.side === "cpu").length;
  const youPushing = us.some(u => u.side === "you" && u.x > AW_W * 0.6);
  cpu.stance = youPushing ? "defensive" : cpuN > youN + 2 ? "aggressive" : "balanced";
  cpu.nextDeploy -= dt;
  if (cpu.nextDeploy > 0) return;
  const yourHedges = us.filter(u => u.side === "you" && u.type === "hedge").length;
  const yourTanks = us.filter(u => u.side === "you" && u.type === "index").length;
  let type;
  if (yourHedges >= 2 && cpu.cap >= AW_BOTS.index.cost) type = "index";      // tanks soak burst
  else if (yourTanks >= 2 && cpu.cap >= AW_BOTS.hedge.cost) type = "hedge";  // burst melts tanks
  else { const r = rand(); type = r < 0.5 ? "day" : r < 0.8 ? "index" : "hedge"; }
  // Reinforce the lane it holds least. An enemy that picked lanes at random
  // never built the pressure the threat panel exists to warn you about.
  const mine = [0, 0, 0];
  for (const u of us) if (u.side === "cpu") mine[u.lane] += 1;
  let lane = 0;
  for (let i = 1; i < AW_LANES; i++) if (mine[i] < mine[lane]) lane = i;
  if (awDeploy(sim, "cpu", type, lane, rand)) cpu.nextDeploy = 1.0 + rand() * 1.4;
  else cpu.nextDeploy = 0.4;
}

// Where the pressure is, and what answers it.
//
// Weighted by how far a unit has come, not just by how many there are: two
// fresh bots at the enemy's own wall are not the emergency that one Hedge-Fund
// at your door is. The counter comes out of AW_COUNTER rather than a
// hand-written sentence, so the advice cannot contradict the fight.
export function awThreat(sim) {
  const span = Math.abs(sim.cpu.baseX - sim.you.baseX) || 1;
  const load = [0, 0, 0];
  const worst = [null, null, null];
  for (const u of sim.units) {
    if (u.side !== "cpu") continue;
    const progress = Math.max(0, Math.min(1, (sim.cpu.baseX - u.x) / span));
    const w = (u.hp / AW_BOTS[u.type].hp) * (0.35 + progress * 1.5);
    load[u.lane] += w;
    if (!worst[u.lane] || w > worst[u.lane].w) worst[u.lane] = { type: u.type, w };
  }
  let li = 0;
  for (let i = 1; i < AW_LANES; i++) if (load[i] > load[li]) li = i;
  const p = load[li];
  return {
    lane: AW_LANE_ID[li],
    level: p < 0.5 ? "calm" : p < 1.3 ? "watch" : "high",
    pct: Math.max(0.04, Math.min(1, p / 2.2)),
    type: worst[li]?.type || null,
    counter: worst[li] ? AW_COUNTER[worst[li].type] : null,
  };
}

// advance the sim one frame: regen both sides' capital, run the CPU brain, then for every unit
// acquire the nearest LIVING enemy and either fire (unit/server in range) or move per its stance;
// finally clear dead units & expired tracers and decide a winner when a server's HP hits zero.
export function awStep(sim, dt, youStance, rand = Math.random) {
  if (sim.over) return;
  sim.t += dt;
  sim.you.cap = Math.min(AW_CAP_MAX, sim.you.cap + dt * sim.you.rate);
  sim.cpu.cap = Math.min(AW_CAP_MAX, sim.cpu.cap + dt * sim.cpu.rate);
  awBrain(sim, dt, rand);
  // How long each lane has gone with none of yours in it. This is the single
  // most common way this game is lost and it is invisible while it is
  // happening, so it is measured here and read back on the end card.
  const held = [false, false, false];
  for (const u of sim.units) if (u.side === "you") held[u.lane] = true;
  for (let i = 0; i < AW_LANES; i++) {
    sim.open[i] = held[i] ? 0 : sim.open[i] + dt;
    if (sim.open[i] > sim.openMax[i]) sim.openMax[i] = sim.open[i];
  }

  const aggro = 140;
  for (const u of sim.units) {
    // A unit killed earlier in this same frame is still in the array until the
    // sweep at the bottom. Shooting it means several units dumping a cooldown
    // each into a corpse while whatever is actually alive walks past.
    if (u.hp <= 0) continue;
    const b = AW_BOTS[u.type];
    const enemy = u.side === "you" ? "cpu" : "you";
    const enemyBaseX = sim[enemy].baseX;
    const stance = u.side === "you" ? youStance : sim.cpu.stance;
    const advDir = u.side === "you" ? 1 : -1;
    let tgt = null, td = Infinity;
    for (const o of sim.units) { if (o.side === enemy && o.hp > 0) { const d = Math.hypot(o.x - u.x, o.y - u.y); if (d < td) { td = d; tgt = o; } } }
    u.cd -= dt;
    if (tgt && td <= b.range) { // attack enemy unit
      if (u.cd <= 0) {
        sim[u.side].dealt += landed(tgt.hp, b.dmg);
        tgt.hp -= b.dmg; u.cd = b.rate;
        if (b.range > 60) sim.tracers.push({ x1: u.x, y1: u.y, x2: tgt.x, y2: tgt.y, life: 0.12 });
      }
      continue;
    }
    // The range check to a server is on x alone, deliberately. A tower is
    // 112px tall in the middle of a 372px field, so a lane-A Day-Trader (range
    // 26) measured to the tower's centre could never reach it at all — the
    // lanes would stop being three ways to the same door.
    if (Math.abs(u.x - enemyBaseX) <= b.range) { // attack enemy server
      if (u.cd <= 0) {
        sim[u.side].dealt += landed(sim[enemy].baseHp, b.dmg);
        sim[enemy].baseHp -= b.dmg; u.cd = b.rate;
        if (b.range > 60) sim.tracers.push({ x1: u.x, y1: u.y, x2: enemyBaseX, y2: AW_H / 2, life: 0.12 });
      }
      continue;
    }
    let goalX = enemyBaseX, goalY = awLaneY(u.lane), chase = false;
    if (stance === "balanced") { if (tgt && td <= aggro) { goalX = tgt.x; goalY = tgt.y; chase = true; } }
    else if (stance === "defensive") {
      const holdX = u.side === "you" ? AW_W * 0.44 : AW_W * 0.56;
      if (tgt && td <= aggro) { goalX = tgt.x; goalY = tgt.y; chase = true; }
      else if ((advDir > 0 && u.x < holdX) || (advDir < 0 && u.x > holdX)) goalX = holdX;
      else goalX = u.x;
    } // aggressive → goalX stays enemyBaseX
    const dx = goalX - u.x, dy = goalY - u.y, dd = Math.hypot(dx, dy) || 1, sp = b.speed * dt;
    u.x += (dx / dd) * sp;
    // Off-lane only to chase. Otherwise a unit eases back to its lane's centre,
    // which is what keeps a lane readable as a lane across a whole round.
    u.y += chase ? (dy / dd) * sp : Math.max(-sp, Math.min(sp, dy * dt * 2.4));
    u.y = Math.max(18, Math.min(AW_H - 18, u.y));
  }
  // A kill leaves a mark. Without it a unit you were watching is simply absent
  // on the next frame and the fight reads as things blinking out.
  for (const u of sim.units) if (u.hp <= 0) sim.puffs.push({ x: u.x, y: u.y, r: AW_BOTS[u.type].r, side: u.side, life: 0.34 });
  sim.units = sim.units.filter(u => u.hp > 0);
  for (const tr of sim.tracers) tr.life -= dt;
  sim.tracers = sim.tracers.filter(tr => tr.life > 0);
  for (const pf of sim.puffs) pf.life -= dt;
  sim.puffs = sim.puffs.filter(pf => pf.life > 0);
  if (sim.cpu.baseHp <= 0) { sim.over = "you"; awLog(sim, "won"); }
  else if (sim.you.baseHp <= 0) { sim.over = "cpu"; awLog(sim, "lost"); }
}

// Everything the DOM needs, sampled ~8×/second. The loop runs at 60fps; setting
// React state that often would re-render the desk on every frame for numbers
// that cannot be read that fast anyway.
export function awBlankHud() {
  return {
    clock: 0, youHp: AW_BASE_HP, cpuHp: AW_BASE_HP, cap: 34, rate: AW_YOU_RATE,
    youN: 0, cpuN: 0, youDps: 0, cpuDps: 0, sent: 0, dealt: 0, log: [],
    threat: { lane: "A", level: "calm", pct: 0.04, type: null, counter: null },
    openLane: "A", openSecs: 0,
  };
}
export function awReadHud(sim) {
  const dps = (side) => Math.round(sim.units.filter(u => u.side === side)
    .reduce((n, u) => n + AW_BOTS[u.type].dmg / AW_BOTS[u.type].rate, 0));
  let li = 0;
  for (let i = 1; i < AW_LANES; i++) if (sim.openMax[i] > sim.openMax[li]) li = i;
  return {
    clock: sim.t,
    youHp: Math.max(0, Math.ceil(sim.you.baseHp)),
    cpuHp: Math.max(0, Math.ceil(sim.cpu.baseHp)),
    cap: Math.floor(sim.you.cap),
    rate: sim.you.rate,
    youN: sim.units.filter(u => u.side === "you").length,
    cpuN: sim.units.filter(u => u.side === "cpu").length,
    youDps: dps("you"), cpuDps: dps("cpu"),
    sent: sim.you.sent, dealt: Math.round(sim.you.dealt),
    // Sliced, not handed over: sim.log is mutated in place by the loop, and a
    // state value that aliases it would change under React without a render.
    log: sim.log.slice(0, 4),
    threat: awThreat(sim),
    openLane: AW_LANE_ID[li], openSecs: Math.round(sim.openMax[li]),
  };
}
