// Battle rules and flow: team turns, cooldown rings, Five Phases, Phase Qi, Harmony chains, Spirit Qi,
// empowering, statuses, boss Qi shield, waves, Fortuitous Encounters, Heavenly Tribulation, enemy AI, auto battle.

const B = {
  units: [], round: 1, side: 'hero', phase: 'idle', busy: false, over: false, result: null, wave: 0,
  qi: RULES.qiStart, gather: 0, points: {}, chain: { len: 0, last: null, list: [] }, maxChain: 0,
  sel: null, emp: false, pendingEnc: null, encounter: null, auto: false, gate: null, tutorial: false, endTurnResolve: null,
  log: { casts: 0 },
};
const listeners = {};
const on = (evt, fn) => { (listeners[evt] || (listeners[evt] = [])).push(fn); return () => { listeners[evt] = listeners[evt].filter(f => f !== fn); }; };
const off = (evt) => { delete listeners[evt]; };
const emit = (evt, data) => (listeners[evt] || []).slice().forEach(f => { try { f(data); } catch (e) { console.error(e); } });

let uidN = 0;
const freshPoints = () => Object.fromEntries([...CYCLE, 'yin'].map(p => [p, 0]));

function makeUnit(d, side, slot, key) {
  return {
    uid: 'u' + (++uidN), key, side, slot, name: d.name, title: d.title, phase: d.phase, art: d.art, lvl: d.lvl, cutin: d.cutin, face: d.face,
    maxHp: d.hp, hp: d.hp, atk: d.atk, defense: d.def, crit: d.crit, critDmg: d.critDmg,
    techs: d.techs.map(t => ({ ...t, cur: t.start ?? 0 })), status: [], barrier: 0, alive: true,
    wide: !!d.wide, boss: !!d.boss, qiShield: d.qiShield ? { max: d.qiShield, cur: d.qiShield } : null,
    attached: [null, null], stats: { dmg: 0, heal: 0 }, d,
  };
}
const getUnit = uid => B.units.find(u => u.uid === uid);
const heroes = () => B.units.filter(u => u.side === 'hero');
const enemies = () => B.units.filter(u => u.side === 'enemy');
const foes = u => B.units.filter(x => x.side !== u.side && x.alive);
const allies = u => B.units.filter(x => x.side === u.side && x.alive);
const has = (u, id) => u.status.find(s => s.id === id);
function advantage(a, d) {
  if (OVER[a] === d) return 1;
  if (OVER[d] === a) return -1;
  return 0;
}

// ======================= setup =======================
async function startBattle(opts = {}) {
  autoRunning = false; ending = false;
  for (const u of B.units) u.el && u.el.remove();
  Object.assign(B, {
    units: [], round: 1, side: 'hero', phase: 'idle', busy: false, over: false, result: null, wave: 0,
    qi: RULES.qiStart, gather: 0, points: { hero: freshPoints(), enemy: freshPoints() },
    chain: { len: 0, last: null, list: [] }, maxChain: 0, sel: null, emp: false, pendingEnc: null, encounter: null,
    tutorial: !!opts.tutorial, log: { casts: 0 },
  });
  HEROES.forEach((d, i) => B.units.push(makeUnit(d, 'hero', i, d.key)));
  for (const u of heroes()) board.createCard(u, ui.boardEl);
  ui.resetBattle();
  for (const [i, u] of heroes().entries()) board.dealIn(u, i * 90, false);
  await wait(500);
  await spawnWave(0);
  emit('ready');
  loop();
}

async function spawnWave(i) {
  B.wave = i;
  const w = WAVES[i];
  for (const u of enemies()) u.el && u.el.remove();
  B.units = B.units.filter(u => u.side === 'hero');
  // lay the wave out centred on the four slots (a boss card is two slots wide)
  const widths = w.enemies.map(k => ENEMIES[k].wide ? 2 : 1), total = widths.reduce((a, b) => a + b, 0);
  let x = (4 - total) / 2;
  w.enemies.forEach((k, j) => { const u = makeUnit(ENEMIES[k], 'enemy', j, k); u.slotX = x; x += widths[j]; B.units.push(u); });
  ui.waveInfo(i, WAVES.length);
  await ui.banner(w.title, w.sub, w.boss ? 'boss' : '');
  const es = enemies();
  es.forEach(u => board.createCard(u, ui.boardEl));
  sfx('whoosh');
  await Promise.all(es.map((u, j) => board.dealIn(u, j * 120, true)));
  if (w.boss) {
    const b = es.find(u => u.boss);
    const c = board.center(b);
    V.shake(14, 420); V.flash('#b98cff', 0.35); sfx('boom');
    V.ring({ x: c.x, y: c.y, r0: 40, r1: 420, color: 'violet', width: 18, dur: 700 });
    V.emit('wisp', c.x, c.y, 26, { color: 'violet', speed: [60, 260], spread: 120, life: [700, 1400] });
    board.hitCard(b, { power: 0.8, color: '#b98cff' });
  }
  ui.refreshAll();
  emit('wave', { index: i, boss: !!w.boss });
}

// ======================= main loop =======================
async function loop() {
  while (!B.over) {
    await heroTurn();
    if (B.over) break;
    await enemyTurn();
    if (B.over) break;
    B.round++;
  }
}

async function heroTurn() {
  B.side = 'hero'; B.phase = 'start'; B.chain = { len: 0, last: null, list: [] };
  board.geo.side = 'hero'; ui.setTurn('hero'); ui.showChain();
  await ui.turnBanner('Your Turn', `Round ${B.round}`, 'hero');
  await startOfTurn('hero');
  if (await checkEnd()) return;
  const gain = RULES.qiBase + heroes().filter(h => h.alive).length * RULES.qiPerHeroine + B.gather * 2;
  B.qi = Math.min(RULES.qiMax, B.qi + gain); ui.qiGain(gain);
  for (const h of heroes()) if (h.alive && h.attached.some(a => a && a.id === 'phase_bead')) addPoints(h, h.phase, 1, true);
  B.encounter = B.round % 2 === 0 ? { offers: rollOffers(), bought: false, rerolls: 0 } : null;
  for (const h of heroes()) markSkip(h);
  B.phase = 'input';
  ui.refreshAll();
  emit('turnStart', { side: 'hero', round: B.round });
  if (B.encounter) emit('encounterReady');
  const done = new Promise(res => { B.endTurnResolve = res; });
  if (B.auto) runAuto();
  await done;
  B.endTurnResolve = null;
  deselect();
  if (B.over) return;
  B.phase = 'end';
  endOfTurn('hero');
  ui.refreshAll();
  emit('turnEnd', { side: 'hero', round: B.round });
}

function markSkip(u) {
  u.skip = !!(has(u, 'frost') || has(u, 'shock'));
}

async function enemyTurn() {
  B.side = 'enemy'; B.phase = 'enemy'; B.chain = { len: 0, last: null, list: [] };
  board.geo.side = 'enemy'; ui.setTurn('enemy'); ui.showChain();
  await ui.turnBanner('Enemy Turn', null, 'enemy');
  await startOfTurn('enemy');
  if (await checkEnd()) return;
  for (const e of enemies()) markSkip(e);
  ui.refreshAll();
  const order = chainOrder(enemies().filter(e => e.alive));
  for (const e of order) {
    if (B.over) return;
    if (!e.alive) continue;
    if (e.skip) {
      const c = board.center(e, 0.42);
      V.floatText(has(e, 'frost') ? 'FROZEN' : 'STUNNED', c.x, c.y, 'info');
      board.hitCard(e, { power: 0.3, color: '#9fd6ff' }); await wait(420); continue;
    }
    const ready = e.techs.filter(t => t.cur <= 0).sort((a, b) => (b.ult ? 9 : b.cd) - (a.ult ? 9 : a.cd));
    for (const t of ready) {
      if (!e.alive || B.over) break;
      const tg = aiTarget(e, t);
      if (!tg) break;
      await doCast(e, t, tg, false);
      await wait(180);
      if (await checkEnd()) return;
    }
  }
  if (B.over) return;
  endOfTurn('enemy');
  ui.refreshAll();
  emit('turnEnd', { side: 'enemy', round: B.round });
  await wait(250);
}

/** Order units so that consecutive phases follow the generating cycle (longest Harmony chains first). */
function chainOrder(units) {
  const left = [...units], out = [];
  while (left.length) {
    let start = left.find(u => !left.some(v => GEN[v.phase] === u.phase && v !== u)) || left[0];
    let cur = start;
    while (cur) {
      out.push(cur); left.splice(left.indexOf(cur), 1);
      cur = left.find(v => v.phase === GEN[cur.phase] && v.phase !== cur.phase);
    }
  }
  return out;
}

// ======================= turn start / end effects =======================
async function startOfTurn(side) {
  for (const u of B.units.filter(x => x.side === side)) { for (const t of u.techs) if (t.cur > 0) t.cur -= 1; board.refreshCard(u); }
  const us = B.units.filter(u => u.side === side && u.alive);
  if (B.round >= RULES.tribulationRound) {
    const pct = RULES.tribulationBase + RULES.tribulationStep * (B.round - RULES.tribulationRound);
    if (side === 'hero' && B.round === RULES.tribulationRound) await ui.banner('Heavenly Tribulation', 'Lightning strikes every card at the start of its turn', 'trib');
    V.flash('#c9b8ff', 0.4); sfx('thunder');
    for (const u of us) {
      const c = board.center(u);
      V.bolt({ x0: c.x + rand(-40, 40), y0: -40, x1: c.x, y1: c.y, color: 'violet', width: 5, dur: 360, branches: 3 });
      V.fx('thunder_burst', { x: c.x, y: c.y, w: 300, dur: 420 });
      const dmg = Math.round(u.maxHp * pct);
      u.hp = Math.max(0, u.hp - dmg);
      V.floatText(dmg.toLocaleString('en-US'), c.x, c.y - 30, side === 'hero' ? 'enemy' : 'dmg', { label: 'TRIBULATION' });
      board.hitCard(u, { power: 0.8, color: '#d9c8ff' });
      if (u.hp <= 0) killUnit(u);
    }
    V.shake(10, 300);
    await wait(650);
  }
  let any = false;
  for (const u of us) {
    if (!u.alive) continue;
    const c = board.center(u);
    for (const s of [...u.status]) {
      if (s.id === 'burn') {
        const dmg = s.value; u.hp = Math.max(0, u.hp - dmg); any = true;
        V.fx('fire_burst', { x: c.x, y: c.y + 30, w: 220, dur: 500 }); V.emit('ember', c.x, c.y + 40, 14, { color: 'fire', speed: [40, 180], spread: 50 });
        V.floatText(dmg.toLocaleString('en-US'), c.x, c.y - 10, side === 'hero' ? 'enemy' : 'dmg', { label: 'FIRE POISON' });
        board.hitCard(u, { power: 0.4, color: '#ff9a6a' });
        if (s.src) s.src.stats.dmg += dmg;
      } else if (s.id === 'venom') {
        const dmg = Math.round(u.maxHp * 0.06); u.hp = Math.max(0, u.hp - dmg); any = true;
        V.emit('glow', c.x, c.y, 12, { color: 'green', speed: [30, 120], spread: 60 });
        V.floatText(dmg.toLocaleString('en-US'), c.x, c.y - 10, side === 'hero' ? 'enemy' : 'dmg', { label: 'GU VENOM' });
        board.hitCard(u, { power: 0.35, color: '#9be36e' });
      } else if (s.id === 'dew' && !has(u, 'wither')) {
        const amt = Math.min(u.maxHp - u.hp, Math.round(u.maxHp * 0.06)); u.hp += amt; any = true;
        V.emit('petal', c.x, c.y, 8, { color: 'jade', speed: [30, 120], spread: 60, up: 60 });
        V.floatText('+' + amt.toLocaleString('en-US'), c.x, c.y - 10, 'heal');
      }
    }
    if (u.hp <= 0) killUnit(u);
  }
  if (any) { sfx('hit'); await wait(600); }
  ui.refreshAll();
}

function endOfTurn(side) {
  for (const u of B.units.filter(x => x.side === side)) {
    for (const s of u.status) s.turns -= 1;
    const expired = u.status.filter(s => s.turns <= 0);
    u.status = u.status.filter(s => s.turns > 0);
    for (const s of expired) {
      if (s.id === 'shield') u.barrier = 0;
      if (s.id === 'shatter' && u.qiShield && u.alive) {
        u.qiShield.cur = u.qiShield.max;
        const c = board.center(u);
        V.ring({ x: c.x, y: c.y, r0: 60, r1: 260, color: 'gold', width: 10, dur: 600 });
        V.floatText('QI SHIELD RESTORED', c.x, c.y - 70, 'info');
      }
    }
    if (u.qiShield && u.alive && !expired.some(x => x.id === 'shatter') && u.qiShield.cur < u.qiShield.max) {
      u.qiShield.cur = u.qiShield.max;
      const c = board.center(u); V.ring({ x: c.x, y: c.y, r0: 60, r1: 240, color: 'gold', width: 8, dur: 520 });
    }
    u.skip = false;
    board.refreshCard(u);
  }
}

// ======================= statuses =======================
function addStatus(u, id, turns, extra = {}) {
  if (!u.alive) return false;
  const d = STATUS[id];
  if (d.debuff && has(u, 'clear')) { const c = board.center(u, 0.4); V.floatText('IMMUNE', c.x, c.y, 'info'); return false; }
  const ex = has(u, id);
  if (ex) { ex.turns = Math.max(ex.turns, turns); if (extra.value) ex.value = Math.max(ex.value || 0, extra.value); if (extra.src) ex.src = extra.src; }
  else u.status.push({ id, turns, ...extra });
  if (id === 'frost' || id === 'shock') { if (B.side === u.side && B.phase === 'input') u.skip = true; }
  board.refreshCard(u);
  return true;
}
function removeStatus(u, id) {
  u.status = u.status.filter(s => s.id !== id);
  if (id === 'shield') u.barrier = 0;
  board.refreshCard(u);
}
function cleanse(u, n = 1) {
  const debuffs = u.status.filter(s => STATUS[s.id].debuff && s.id !== 'shatter');
  debuffs.slice(0, n).forEach(s => removeStatus(u, s.id));
  return Math.min(n, debuffs.length);
}

// ======================= damage & healing =======================
const phaseMul = (side, phase) => 1 + RULES.pointBonus * (B.points[side][phase] || 0);

function computeHit(src, tgt, power, o = {}) {
  const phase = o.phase || src.phase;
  const adv = advantage(phase, tgt.phase);
  let mul = phaseMul(src.side, phase) * (o.hm || 1) * (o.emp ? RULES.empowerMul : 1) * (o.extraMul || 1);
  if (adv > 0) mul *= RULES.advMul; else if (adv < 0) mul *= RULES.resMul;
  if (has(src, 'disrupt')) mul *= 0.7;
  if (has(tgt, 'mark')) mul *= RULES.markMul;
  if (has(tgt, 'shatter')) mul *= RULES.shatterMul;
  if (tgt.attached && tgt.attached.some(a => a && a.id === 'jade_robe')) mul *= 0.8;
  const frost = !o.keepFrost && has(tgt, 'frost');
  if (frost) mul *= RULES.frostBreakMul;
  const critCh = src.crit + (adv > 0 ? RULES.advCrit : 0) + (o.critBonus || 0) + (src.attached && src.attached.some(a => a && a.id === 'sword_insight') ? 0.25 : 0);
  const crit = !o.noCrit && Math.random() < critCh;
  if (crit) mul *= src.critDmg;
  const dmg = Math.max(1, Math.round(src.atk * power / (1 + tgt.defense / RULES.defK) * mul * rand(0.95, 1.05)));
  return { dmg, crit, adv, frost };
}

/** Apply damage (shield first), break Frost Seals, chip Qi shields. Returns the hit record. */
function applyDamage(src, tgt, power, o = {}) {
  if (!tgt.alive) return null;
  const h = computeHit(src, tgt, power, o);
  if (h.frost) removeStatus(tgt, 'frost');
  let absorbed = 0;
  if (tgt.barrier > 0) { absorbed = Math.min(tgt.barrier, h.dmg); tgt.barrier -= absorbed; if (tgt.barrier <= 0) removeStatus(tgt, 'shield'); }
  tgt.hp = Math.max(0, tgt.hp - (h.dmg - absorbed));
  src.stats.dmg += h.dmg;
  h.absorbed = absorbed;
  if (tgt.qiShield && !has(tgt, 'shatter') && tgt.alive) {
    tgt.qiShield.cur = Math.max(0, tgt.qiShield.cur - (h.adv > 0 ? 2 : 1));
    if (tgt.qiShield.cur === 0) { shatter(tgt); h.shattered = true; }
  }
  h.killed = tgt.hp <= 0;
  board.refreshCard(tgt);
  return h;
}

function applyHealAmount(src, tgt, amount) {
  if (!tgt.alive) return 0;
  if (has(tgt, 'wither')) { const c = board.center(tgt, 0.4); V.floatText('WITHERED', c.x, c.y, 'info'); return 0; }
  const amt = Math.round(amount), real = Math.min(tgt.maxHp - tgt.hp, amt);
  tgt.hp += real; src.stats.heal += real;
  board.refreshCard(tgt);
  return amt;
}

function shatter(u) {
  addStatus(u, 'shatter', 1);
  const ult = u.techs.find(t => t.tele); if (ult) ult.cur += 1;
  const c = board.center(u);
  V.flash('#ffe7a8', 0.45); V.shake(12, 380); sfx('shatter'); hitStop(90);
  V.emit('shard', c.x, c.y, 34, { color: 'gold', speed: [240, 820], life: [400, 900] });
  V.ring({ x: c.x, y: c.y, r0: 40, r1: 340, color: 'gold', width: 16, dur: 520 });
  V.floatText('SHATTERED', c.x, c.y - 60, 'big', { label: 'QI SHIELD BROKEN' });
  board.refreshCard(u);
  emit('shatter', u);
}

function killUnit(u) {
  if (!u.alive) return;
  const fi = u.attached ? u.attached.findIndex(a => a && a.id === 'phoenix_feather') : -1;
  if (fi >= 0) {
    u.attached[fi] = null;
    u.hp = Math.round(u.maxHp * 0.4);
    const c = board.center(u);
    V.fx('phoenix', { x: c.x, y: c.y, w: 420, dur: 900, s0: 0.6, s1: 1.1 });
    V.emit('ember', c.x, c.y, 30, { color: 'fire', speed: [80, 300], spread: 60 });
    V.floatText('REBIRTH', c.x, c.y - 40, 'big', { label: 'PHOENIX FEATHER' });
    sfx('heal'); board.refreshCard(u);
    return;
  }
  u.alive = false; u.hp = 0; u.status = []; u.barrier = 0; u.skip = false;
  if (u.side === 'enemy') { B.qi = Math.min(RULES.qiMax, B.qi + RULES.qiPerKill); ui.qiGain(RULES.qiPerKill); }
  board.refreshCard(u);
  ui.killFx(u);
}

// ======================= Phase Qi & Harmony =======================
function chainStep(u) {
  const c = B.chain;
  if (c.last && GEN[c.last] === u.phase && c.last !== u.phase) { c.len += 1; c.list.push(u.phase); }
  else { c.len = 1; c.list = [u.phase]; }
  c.last = u.phase;
  if (u.side === 'hero') B.maxChain = Math.max(B.maxChain, c.len);
  ui.showChain();
  return 1 + RULES.harmonyStep * (c.len - 1);
}
function addPoints(u, phase, n, quiet = false) {
  if (!(phase in B.points[u.side])) return;
  B.points[u.side][phase] += n;
  ui.pointFly(u, phase, n, quiet);
}

// ======================= casting =======================
async function doCast(u, t, target, emp) {
  B.busy = true; ui.lock();
  emit('castStart', { u, t, target });
  if (emp && !(t.emp && B.qi >= t.emp.cost)) emp = false;
  if (emp) { B.qi -= t.emp.cost; ui.qiGain(-t.emp.cost); }
  t.cur = t.cd;
  board.refreshCard(u);
  const hm = chainStep(u);
  const ctx = makeCtx(u, t, target, emp, hm);
  B.log.casts++; B.log[t.id] = (B.log[t.id] || 0) + 1;
  ui.castBanner(u, t, emp, hm);
  await board.lift(u, true);
  try {
    const run = SKILLS[t.id] || SKILLS.claw;
    await run(ctx);
  } catch (e) { console.error('skill error', t.id, e); }
  await board.lift(u, false);
  if (u.alive) addPoints(u, GEN[u.phase], t.ult ? 2 : 1);
  if (B.chain.len >= 2) {
    const c = board.center(u, 0.2);
    V.floatText(`HARMONY ×${B.chain.len}`, c.x, c.y + 6, 'harmony', { label: B.chain.list.map(p => PHASES[p].glyph).join(' → '), size: 34 });
    if (B.chain.len === 4 && u.side === 'hero') {
      B.qi = Math.min(RULES.qiMax, B.qi + 2); ui.qiGain(2);
      ui.harmonyBurst();
    }
  }
  await wait(120);
  B.busy = false;
  ui.refreshAll();
  emit('cast', { u, t, target, emp });
  await checkEnd();
}

function makeCtx(u, t, target, emp, hm) {
  const pos = x => board.center(x);
  return {
    u, t, target, emp, hm, side: u.side, B,
    foes: () => foes(u), allies: () => allies(u), pos,
    /** Damage + feedback (number, shake, sparks). */
    hit(tgt, power, o = {}) {
      if (!tgt || !tgt.alive) return null;
      const h = applyDamage(u, tgt, power, { hm, emp, ...o });
      if (!h) return null;
      const c = board.center(tgt, o.fy ?? 0.45);
      const style = u.side === 'hero' ? (h.crit ? 'crit' : 'dmg') : (h.crit ? 'ecrit' : 'enemy');
      const label = h.adv > 0 ? 'OVERCOME' : (h.adv < 0 ? 'RESISTED' : (h.frost ? 'SEAL BROKEN' : null));
      V.floatText(h.dmg.toLocaleString('en-US'), c.x + rand(-30, 30), c.y + rand(-20, 10), style, { label: h.crit ? null : label, size: o.small ? 30 : undefined });
      if (h.absorbed) V.floatText(`-${h.absorbed.toLocaleString('en-US')}`, c.x + 50, c.y + 40, 'shield', { label: 'SHIELD' });
      board.hitCard(tgt, { power: (o.small ? 0.5 : 1) * (h.crit ? 1.3 : 1), dir: tgt.side === 'enemy' ? -1 : 1, color: o.flash || '#ffffff' });
      const col = o.color || PHASES[o.phase || u.phase].col;
      V.emit('spark', c.x, c.y, h.crit ? 18 : 10, { color: col, speed: [200, 640] });
      if (h.crit) { hitStop(70); V.shake(9, 240); sfx('crit'); } else { sfx('hit'); if (!o.small) V.shake(4, 160); }
      if (h.killed) killUnit(tgt);
      return h;
    },
    heal(tgt, power, o = {}) {
      if (!tgt || !tgt.alive) return 0;
      const amt = u.atk * power * phaseMul(u.side, u.phase) * hm * (emp ? RULES.empowerMul : 1) * rand(0.97, 1.03);
      const real = applyHealAmount(u, tgt, amt);
      if (real) { const c = board.center(tgt, 0.45); V.floatText('+' + real.toLocaleString('en-US'), c.x + rand(-20, 20), c.y, 'heal'); }
      return real;
    },
    shield(tgt, power) {
      if (!tgt || !tgt.alive) return 0;
      const amt = Math.round(u.atk * power * phaseMul(u.side, u.phase) * hm * (emp ? RULES.empowerMul : 1));
      tgt.barrier = Math.max(tgt.barrier, amt);
      addStatus(tgt, 'shield', 2);
      const c = board.center(tgt, 0.45); V.floatText('+' + amt.toLocaleString('en-US'), c.x, c.y + 30, 'shield', { label: 'SPIRIT SHIELD' });
      return amt;
    },
    status: (tgt, id, turns, extra) => addStatus(tgt, id, turns, extra),
    burn(tgt, turns = 2) { return addStatus(tgt, 'burn', turns, { value: Math.round(u.atk * 0.35 * phaseMul(u.side, 'fire') * (emp ? RULES.empowerMul : 1)), src: u }); },
    cleanse: (tgt, n) => cleanse(tgt, n),
    delay(tgt, n = 1) { for (const tt of tgt.techs) if (tt.cd > 1) tt.cur += n; board.refreshCard(tgt); },
    hasStatus: (x, id) => has(x, id),
    revive(tgt, pct) {
      if (tgt.alive) return;
      tgt.alive = true; tgt.hp = Math.round(tgt.maxHp * pct); tgt.status = []; tgt.barrier = 0;
      board.refreshCard(tgt); ui.reviveFx(tgt);
    },
  };
}

// ======================= player input =======================
function canAct(u) { return B.phase === 'input' && !B.busy && !B.over && u.side === 'hero' && u.alive && !u.skip; }
function validTargets(u, t) {
  if (t.target === 'enemy' || t.target === 'allEnemies') return foes(u);
  return allies(u);
}
function selectTech(u, i) {
  const t = u.techs[i];
  if (B.pendingEnc) return;
  if (!canAct(u) || t.cur > 0) { ui.techInfo(u, t); return; }
  if (B.gate && !B.gate('select', { u, t, i })) return;
  if (B.sel && B.sel.u === u && B.sel.i === i) {
    // second tap on a multi-target technique casts it; on a single-target one it keeps the
    // selection, so a double-click never undoes the first click (Cancel or an empty tap deselects)
    if (t.target !== 'enemy') return chooseTarget(validTargets(u, t)[0]);
    return;
  }
  B.sel = { u, t, i }; B.emp = false;
  ui.showSelection();
  emit('selected', { u, t, i });
}
function deselect() { B.sel = null; B.emp = false; ui.showSelection(); }
function toggleEmpower() {
  if (!B.sel || !B.sel.t.emp) return;
  if (!B.emp && B.qi < B.sel.t.emp.cost) return;
  if (B.gate && !B.gate('empower', B.sel)) return;
  B.emp = !B.emp; ui.showSelection();
  emit('empower', { on: B.emp });
}
async function chooseTarget(tgt) {
  if (B.pendingEnc) return applyPendingEncounter(tgt);
  if (!B.sel || !tgt) return;
  const { u, t } = B.sel;
  if (!validTargets(u, t).includes(tgt)) return;
  if (B.gate && !B.gate('target', { u, t, target: tgt })) return;
  const emp = B.emp;
  deselect();
  await doCast(u, t, tgt, emp);
  if (B.auto && B.phase === 'input' && !B.over) runAuto();
}
function endTurn() {
  if (B.phase !== 'input' || B.busy || B.over || !B.endTurnResolve) return;
  if (B.gate && !B.gate('endTurn')) return;
  sfx('click');
  B.phase = 'ending';
  B.endTurnResolve();
}

// ======================= auto battle =======================
let autoRunning = false;
function setAuto(v) {
  B.auto = v; ui.refreshControls();
  if (v && B.phase === 'input' && !B.busy) runAuto();
}
async function runAuto() {
  if (autoRunning) return; autoRunning = true;
  try {
    deselect();
    for (let pass = 0; pass < 4 && B.auto && !B.over && B.phase === 'input'; pass++) {
      const order = chainOrder(heroes().filter(h => h.alive && !h.skip && h.techs.some(t => t.cur <= 0)));
      if (!order.length) break;
      for (const h of order) {
        if (!B.auto || B.over || B.phase !== 'input') return;
        if (!h.alive || h.skip) continue;
        const t = bestTech(h); if (!t) continue;
        const tg = autoTarget(h, t); if (!tg) continue;
        const emp = !!(t.emp && B.qi >= t.emp.cost && (t.ult ? B.qi >= t.emp.cost + 2 : B.qi >= t.emp.cost + 10));
        await doCast(h, t, tg, emp);
        await wait(150);
      }
    }
    if (B.auto && !B.over && B.phase === 'input' && B.encounter && !B.encounter.bought) await autoEncounter();
    if (B.auto && !B.over && B.phase === 'input') { await wait(250); endTurn(); }
  } finally { autoRunning = false; }
}
function bestTech(h) {
  const ready = h.techs.filter(t => t.cur <= 0);
  if (!ready.length) return null;
  const hurt = allies(h).some(a => a.hp / a.maxHp < 0.72 || a.status.some(s => STATUS[s.id].debuff));
  const score = t => (t.ult ? 30 : t.cd * 5) - (t.target === 'allAllies' && t.id === 'su_s2' && !hurt ? 100 : 0);
  return ready.sort((a, b) => score(b) - score(a))[0];
}
function autoTarget(h, t) {
  if (t.target !== 'enemy') return validTargets(h, t)[0];
  const fs = foes(h); if (!fs.length) return null;
  const multi = /mo_s1|ling_s3|su_s1|mo_s3/.test(t.id);
  const sc = f => {
    let s = 0;
    const adv = advantage(h.phase, f.phase);
    s += adv > 0 ? 3 : (adv < 0 ? -2 : 0);
    s += (1 - f.hp / f.maxHp) * 2.5;
    if (f.boss) s += multi && f.qiShield && !has(f, 'shatter') ? 2.5 : 0.5;
    if (computeHit(h, f, 1).dmg > f.hp) s += 2;
    return s + Math.random() * 0.3;
  };
  return fs.sort((a, b) => sc(b) - sc(a))[0];
}
function aiTarget(e, t) {
  const hs = foes(e); if (!hs.length) return null;
  if (t.target !== 'enemy') return hs[0];
  const sc = h => (advantage(e.phase, h.phase) > 0 ? 2 : 0) + (1 - h.hp / h.maxHp) * 1.6 - (h.barrier > 0 ? 0.6 : 0) + Math.random() * 0.8;
  return hs.sort((a, b) => sc(b) - sc(a))[0];
}

// ======================= Fortuitous Encounters =======================
function rollOffers() {
  // later rounds bring rarer finds
  const q = B.round, pLeg = Math.min(0.3, 0.02 + 0.03 * q), pRare = Math.min(0.55, 0.15 + 0.06 * q);
  const out = [];
  let guard = 0;
  while (out.length < 3 && guard++ < 50) {
    const r = Math.random(), rar = r < pLeg ? 3 : (r < pLeg + pRare ? 2 : 1);
    const pool = ENCOUNTERS.filter(e => e.rarity === rar && !out.includes(e));
    if (pool.length) out.push(pick(pool));
  }
  return out;
}
function rerollEncounter() {
  const e = B.encounter; if (!e || e.bought || e.rerolls >= 1 || B.qi < 2) return;
  if (B.gate && !B.gate('reroll')) return;
  B.qi -= 2; ui.qiGain(-2); e.rerolls++; e.offers = rollOffers(); sfx('click'); ui.openShop();
}
async function buyEncounter(i) {
  const e = B.encounter; if (!e || e.bought || B.busy) return;
  const off = e.offers[i]; if (!off || B.qi < off.cost) return;
  if (B.gate && !B.gate('buy', off)) return;
  if (off.target === 'none') {
    e.bought = true; B.qi -= off.cost; ui.qiGain(-off.cost); ui.closeShop();
    await applyEncounter(off, null);
    emit('encounterDone', off);
  } else {
    if (off.attach && !heroes().some(h => h.alive && h.attached.includes(null))) return;
    B.pendingEnc = off; ui.closeShop(); ui.showSelection();
    emit('encounterTarget', off);
  }
}
function cancelPending() { B.pendingEnc = null; ui.showSelection(); }
function encounterTargets(off) {
  if (off.target === 'enemy') return enemies().filter(x => x.alive);
  return heroes().filter(h => h.alive && (!off.attach || h.attached.includes(null)));
}
async function applyPendingEncounter(tgt) {
  const off = B.pendingEnc; if (!off || !tgt || !encounterTargets(off).includes(tgt)) return;
  B.pendingEnc = null; B.encounter.bought = true; B.qi -= off.cost; ui.qiGain(-off.cost); ui.showSelection();
  await applyEncounter(off, tgt);
  emit('encounterDone', off);
}
async function applyEncounter(off, tgt) {
  B.busy = true; ui.lock();
  sfx('charge');
  const strongest = [...heroes()].filter(h => h.alive).sort((a, b) => b.atk - a.atk)[0];
  switch (off.id) {
    case 'thunder_tal': {
      V.flash('#c58bff', 0.3); sfx('thunder');
      for (const f of enemies().filter(x => x.alive)) {
        const c = board.center(f);
        V.bolt({ x0: c.x + rand(-60, 60), y0: -40, x1: c.x, y1: c.y, color: 'violet', width: 5, dur: 380, branches: 3 });
        V.fx('thunder_burst', { x: c.x, y: c.y, w: 320, dur: 460 });
        const h = applyDamage(strongest, f, 0.9, { phase: 'wood', noCrit: true });
        if (h) { V.floatText(h.dmg.toLocaleString('en-US'), c.x, c.y - 20, 'dmg', { label: 'THUNDER TALISMAN' }); board.hitCard(f, { power: 0.9 }); if (h.killed) killUnit(f); }
        await wait(140);
      }
      V.shake(10, 300); break;
    }
    case 'frost_tal': {
      const c = board.center(tgt); sfx('ice');
      V.fx('ice_sigil', { x: c.x, y: c.y, w: 300, dur: 700, back: true }); V.fx('ice_burst', { x: c.x, y: c.y, w: 280, dur: 500 });
      addStatus(tgt, 'frost', 1); V.floatText('FROST SEAL', c.x, c.y - 40, 'info'); board.hitCard(tgt, { power: 0.6, color: '#bfe6ff' }); break;
    }
    case 'qi_pill':
      sfx('heal');
      for (const h of heroes().filter(x => x.alive)) { const c = board.center(h); V.fx('heal_burst', { x: c.x, y: c.y, w: 260, dur: 700 }); const amt = applyHealAmount(h, h, h.maxHp * 0.2); if (amt) V.floatText('+' + amt.toLocaleString('en-US'), c.x, c.y, 'heal'); }
      break;
    case 'gather_array': B.gather += 1; V.floatText('+2 SPIRIT QI EACH TURN', board.geo.W / 2, board.geo.heroY - 20, 'info'); break;
    case 'mark_tal':
      for (const f of enemies().filter(x => x.alive)) { const c = board.center(f); V.fx('curse_sigil', { x: c.x, y: c.y, w: 260, dur: 700, back: true }); addStatus(f, 'mark', 2); }
      break;
    case 'heaven_pill': {
      for (const t of tgt.techs) t.cur = 0;
      const c = board.center(tgt); V.beam({ x: c.x, y: c.y + 150, w: 160, h: 520, color: 'gold', dur: 900 }); V.floatText('ALL TECHNIQUES READY', c.x, c.y - 50, 'info'); sfx('heal');
      break;
    }
    default: { // attachments
      const k = tgt.attached.indexOf(null); if (k >= 0) tgt.attached[k] = off;
      const c = board.center(tgt); V.ring({ x: c.x, y: c.y, r0: 30, r1: 200, color: 'gold', width: 10, dur: 600 });
      V.emit('glow', c.x, c.y, 14, { color: 'gold', speed: [40, 160], spread: 60 });
      V.floatText(off.name.toUpperCase(), c.x, c.y - 40, 'info');
    }
  }
  await wait(450);
  B.busy = false;
  ui.refreshAll();
  await checkEnd();
}
async function autoEncounter() {
  const e = B.encounter;
  const ok = e.offers.map((o, i) => [o, i]).filter(([o]) => B.qi >= o.cost + 2 && (!o.attach || heroes().some(h => h.alive && h.attached.includes(null))));
  if (!ok.length) return;
  const [o, i] = ok.sort((a, b) => b[0].rarity - a[0].rarity)[0];
  await buyEncounter(i);
  if (B.pendingEnc) {
    const ts = encounterTargets(o);
    const tg = o.target === 'enemy' ? ts.sort((a, b) => b.hp - a.hp)[0] : ts.sort((a, b) => b.atk - a.atk)[0];
    await chooseTarget(tg);
  }
}

// ======================= end conditions =======================
let ending = false;
async function checkEnd() {
  if (B.over) return true;
  if (!heroes().some(h => h.alive)) { await finish(false); return true; }
  if (!enemies().some(e => e.alive) && !ending) {
    ending = true;
    try {
      await wait(700);
      if (B.wave + 1 < WAVES.length) {
        deselect(); B.pendingEnc = null;
        await spawnWave(B.wave + 1);
      } else { await finish(true); return true; }
    } finally { ending = false; }
  }
  return false;
}
async function finish(win) {
  if (B.over) return;
  B.over = true; B.result = win ? 'win' : 'lose'; B.phase = 'over';
  deselect();
  if (B.endTurnResolve) B.endTurnResolve();
  await wait(600);
  sfx(win ? 'win' : 'lose');
  if (win) { slowMo(0.4, 500); for (const h of heroes().filter(x => x.alive)) board.lift(h, true, 300); }
  emit(win ? 'victory' : 'defeat');
  ui.result(win);
}

