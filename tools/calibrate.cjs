// Calibration runs for tools/economy_sim.py: real battles on the real engine, on auto, resolved on a fast clock.
//
//   python3 -m http.server 8765 --directory dist &
//   node tools/calibrate.cjs cases.json >> tools/calibration.jsonl
//   node tools/calibrate.cjs --bisect stages.json >> tools/calibration.jsonl
//
// cases.json is a list of { stage, level, hd?, tier?, rarity?, plus?, team? }: the team (the four founders unless
// given) at that level and realm, wearing nine pieces of one tier, rarity and refining when a tier is given, against
// the stage (or its Heaven-Defying version). Each case prints one JSON line: win, rounds, the game seconds a player
// would watch at x1, the share of the team's health left, the share of the enemies' health left and the team's stats.
//
// A case may name a tribulation instead of a stage: { trial, hero, level } (the hero's Heart Demon at the trial's level).
// --bisect takes a list of { stage | trial + hero, hd?, hi?, runs? } and finds, for each, the lowest level at which the founders
// (no gear) win at least half of `runs` battles (default 3), printing every battle and then a summary line
// { stage, hd, threshold: level } (threshold 0 when even level 1 wins, -1 when even `hi` loses).
const { chromium } = require('playwright');
const fs = require('fs');
const args = process.argv.slice(2);
const BISECT = args[0] === '--bisect';
const CASES = JSON.parse(fs.readFileSync(BISECT ? args[1] : args[0], 'utf8'));
const URL = process.env.IB_URL || 'http://localhost:8765/index.html';
const FOUNDERS = ['hero:ling_shuang', 'hero:mo_yingyue', 'hero:yan_feihong', 'hero:su_lianhua'];
const MAINS = [['slot:weapon', 'weapon', 'stat:atk', 'flat'], ['slot:helmet', 'helmet', 'stat:hp', 'flat'], ['slot:body', 'body', 'stat:def', 'flat'], ['slot:gloves', 'gloves', 'stat:atk', 'pct'],
  ['slot:pants', 'pants', 'stat:hp', 'pct'], ['slot:boots', 'boots', 'stat:atk', 'pct'], ['slot:ring', 'ring1', 'stat:atk', 'pct'], ['slot:ring', 'ring2', 'stat:hp', 'pct'], ['slot:pendant', 'pendant', 'stat:crit_dmg', 'pct']];
let errs = [], lastParams = {};

let page = null;
/** One page for every case (the images stay cached); the save is wiped and the page reloaded before each case. */
async function freshPage(b) {
  if (!page) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
    page = await ctx.newPage(); page.on('pageerror', e => errs.push(e.message));
    await page.goto(URL);
  } else {
    await page.evaluate(() => new Promise(r => { try { localStorage.clear(); } catch (e) {} const q = indexedDB.deleteDatabase('immortal-blossoms'); q.onsuccess = q.onerror = q.onblocked = () => r(); setTimeout(r, 1500); }));
    await page.reload();
  }
  await page.waitForFunction(() => window.__ib && document.getElementById('loading') === null, null, { timeout: 30000 }).catch(() => {});
  return page;
}

async function runCase(b, c) {
  const p = await freshPage(b);
  const w0 = Date.now();
  const r = await p.evaluate(async ({ c, FOUNDERS, MAINS }) => {
    const ib = window.__ib, BT = ib.BT, g = ib.gear, d = ib.save();
    const team = c.team || FOUNDERS, level = c.level, bt = c.bt ?? Math.min(7, Math.floor((level - 1) / 10));
    for (const h of team) {
      g.gainHero(h); d.heroes[h].level = level; d.heroes[h].bt = bt;
      if (!c.tier) continue;
      const roll = { 'rarity:rare': 0.47, 'rarity:epic': 0.57, 'rarity:legendary': 0.67, 'rarity:mythic': 0.77 }[c.rarity] || 0.5;
      const nsub = Math.min(4, ({ 'rarity:rare': 1, 'rarity:epic': 2, 'rarity:legendary': 2, 'rarity:mythic': 3 }[c.rarity] || 1) + Math.floor(c.plus / 3));
      const subKeys = ['stat:atk/pct', 'stat:crit/pct', 'stat:hp/pct', 'stat:def/pct'];
      for (const [slot, pos, stat, form] of MAINS) {
        const piece = { kind: 'gear', slot, rarity: c.rarity, tier: c.tier, set: null, main: { stat, form, roll }, subs: subKeys.slice(0, nsub).map(k => { const [s, f] = k.split('/'); return { stat: s, form: f, rolls: [roll] }; }), plus: c.plus, engraved: false };
        const got = g.addPiece(piece, { noAuto: true }); g.equip(h, pos, got.gear.id);
      }
    }
    const stats = team.map(h => { const s = g.finalStats(h); return [Math.round(s.hp), Math.round(s.atk), Math.round(s.def), +s.crit.toFixed(2), +s.critDmg.toFixed(2)]; });
    const t0 = ib.clock.t;
    const done = c.trial ? ib.fightTrial(c.trial, c.hero || team[0], team) : ib.fightSave(c.stage, team, !!c.hd);
    const res = await ib.turbo(done, { cap: (c.capSec || 1200) * 1000, onInput: () => BT.setAuto(true) });
    if (res.timeout) BT.forfeit();
    const hs = BT.B.units.filter(u => u.side === 'hero'), es = BT.B.units.filter(u => u.side === 'enemy');
    const share = us => us.length ? +(us.reduce((a, u) => a + Math.max(0, u.hp), 0) / us.reduce((a, u) => a + u.maxHp, 0)).toFixed(3) : 0;
    const lg = BT.B.log || {}, rg = ib.get('rules:growth') || {};
    const sd = ib.get(c.trial || c.stage) || {}, own = c.hd ? (sd.heavenDefying?.power || 1) : (sd.power || 1);
    return { powerBase: rg.enemyPowerBase ?? 1, stagePower: own, gearPar: rg.enemyGearPar || 0, stageMul: rg.stageMultiplier || {}, win: !!res.win, timeout: !!res.timeout, skips: lg.skips || 0, bossSkips: lg.bossSkips || 0, bossTurns: lg.bossTurns || 0, rounds: res.rounds || BT.B.round, gameSec: Math.round((ib.clock.t - t0) / 1000), hpLeft: share(hs), foeLeft: share(es), wave: BT.B.wave ?? null, stats };
  }, { c, FOUNDERS, MAINS });
  const out = { ...c, ...r, realSec: Math.round((Date.now() - w0) / 1000) };
  lastParams = { powerBase: r.powerBase, gearPar: r.gearPar, stageMul: r.stageMul, stagePower: r.stagePower };
  console.log(JSON.stringify(out));
  return out;
}

async function bisect(b, s) {
  const runs = s.runs || 3, need = Math.ceil(runs / 2), memo = {};
  const wins = async L => {
    if (memo[L] !== undefined) return memo[L];
    let n = 0;
    for (let i = 0; i < runs; i++) { const r = await runCase(b, { stage: s.stage, trial: s.trial, hero: s.hero, hd: !!s.hd, level: L }); if (r.win) n++; if (n >= need || n + (runs - i - 1) < need) break; }
    return (memo[L] = n >= need);
  };
  let lo = 1, hi = s.hi || 40;
  if (await wins(lo)) return 0;
  while (!(await wins(hi))) { if (hi >= 80) return -1; lo = hi; hi = Math.min(80, hi + 10); }
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (await wins(mid)) hi = mid; else lo = mid; }
  return hi;
}

(async () => {
  const b = await chromium.launch();
  for (const c of CASES) {
    if (!BISECT) { await runCase(b, c); continue; }
    const threshold = await bisect(b, c);
    console.log(JSON.stringify({ summary: true, stage: c.stage, trial: c.trial, hero: c.hero, hd: !!c.hd, threshold, ...lastParams }));
  }
  console.error(errs.length ? 'ERRORS ' + [...new Set(errs)].slice(0, 5).join(' | ') : 'no page errors');
  await b.close();
})();
