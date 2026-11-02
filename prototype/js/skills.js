// Technique choreography on cards. Each technique gets a ctx from battle.js:
// ctx.hit / heal / shield / status / burn / delay / cleanse / revive apply the rules and show feedback.

const C = (u, fy = 0.5) => board.center(u, fy);

function projectile(key, a, b, o = {}) {
  const dur = o.dur ?? 340, arcH = o.arc ?? 40;
  const path = k => { const e = (o.ease || ease.inQuad)(k); return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e - Math.sin(Math.PI * e) * arcH }; };
  V.fx(key, { w: o.w ?? 180, dur, path, spin: o.spin || 0, rot: o.rot || 0, fadeIn: 0.05, fadeOut: 0.08, ax: o.ax ?? 0.5, flip: o.flip, bloom: o.bloom ?? 0.3 });
  if (o.trail) for (let i = 0; i < 10; i++) wait(i * dur / 10).then(() => { const p = path(i / 10); V.emit(o.trail, p.x, p.y, 3, { color: o.color, speed: [10, 70], life: [250, 550] }); });
  return wait(dur);
}
function frostFx(t) {
  const c = C(t);
  V.fx('ice_burst', { x: c.x, y: c.y, w: 260, dur: 520, s0: 0.6, s1: 1.1 });
  V.emit('shard', c.x, c.y, 10, { color: 'ice', speed: [80, 300] });
  V.floatText('FROST SEAL', c.x, c.y - 70, 'info');
  sfx('ice');
}
async function cut(x) { await ui.cutin(x.u, x.t, x.emp); }
function burstAt(key, u, o = {}) { const c = C(u, o.fy ?? 0.5); return V.fx(key, { x: c.x, y: c.y, w: o.w ?? 300, dur: o.dur ?? 520, s0: o.s0 ?? 0.7, s1: o.s1 ?? 1.15, bloom: 0.3, ...o.extra }); }

const SKILLS = {
  // ===================== Ling Shuang — Water (ice), Sword =====================
  async ling_s1(x) {
    const { u, target: t } = x;
    sfx('dash');
    const back = await board.lunge(u, t, 0.36, 170);
    const c = C(t);
    sfx('slash');
    V.fx('ice_crescent', { x: c.x, y: c.y, w: 330, dur: 420, rot: -0.4, sweep: { a0: -Math.PI, a1: Math.PI, t: 0.3, color: 'ice' }, bloom: 0.4, s0: 0.9, s1: 1.12, fadeIn: 0.01 });
    V.emit('shard', c.x, c.y, 12, { color: 'ice', speed: [200, 600], up: 100 });
    const h = x.hit(t, 1.0, { color: 'ice', flash: '#d6f0ff' });
    if (h && t.alive && Math.random() < 0.3 && x.status(t, 'frost', 1)) frostFx(t);
    await back();
  },
  async ling_s2(x) {
    const { u } = x;
    const fs = x.foes(), cu = C(u, 0.35);
    sfx('charge');
    V.fx('ice_sigil', { x: cu.x, y: cu.y, w: 300, dur: 900, back: true, spin: 1.4, s0: 0.4, s1: 1 });
    V.emit('snow', cu.x, cu.y, 20, { color: 'ice', speed: [40, 200], spread: 60, life: [600, 1100] });
    await wait(300);
    sfx('ice');
    for (const f of fs) {
      const c = C(f);
      for (let k = 0; k < 4; k++) {
        const sx = c.x + rand(-90, 90), ex = c.x + rand(-55, 55), ey = c.y + rand(-60, 50), d = k * 60;
        V.fx('ice_sword', { w: 64, dur: 270, delay: d, ay: 0.95, rot: Math.atan2(ey + 80, ex - sx) - Math.PI / 2, fadeIn: 0.05, fadeOut: 0.05, bloom: 0.45, path: kk => ({ x: lerp(sx, ex, ease.inQuad(kk)), y: lerp(-80, ey, ease.inQuad(kk)) }) });
      }
    }
    await wait(300);
    sfx('shatter'); V.shake(7, 260);
    for (const f of fs) { burstAt('ice_burst', f, { w: 280 }); x.hit(f, 0.75, { color: 'ice', small: true }); if (f.alive) x.delay(f, 1); }
    if (x.emp) { const tg = fs.filter(f => f.alive).sort((a, b) => b.hp - a.hp)[0]; if (tg && x.status(tg, 'frost', 1)) frostFx(tg); }
    await wait(420);
  },
  async ling_s3(x) {
    const { u, target: t } = x;
    await cut(x);
    const c = C(t);
    V.fx('ice_sigil', { x: c.x, y: c.y, w: 380, dur: 1700, back: true, spin: -0.8, s0: 0.3, s1: 1.05 });
    const finisher = () => (x.hasStatus(t, 'frost') || t.hp / t.maxHp < 0.5) ? 1.5 : 1;
    const n = 10, R = 520;
    sfx('charge');
    for (let i = 0; i < n; i++) {
      const ang = -1.1 + 2.2 * i / (n - 1), sx = c.x + Math.sin(ang) * R, sy = c.y - Math.cos(ang) * R;
      V.fx('ice_sword', { w: 80, dur: 300, delay: i * 40, ay: 0.92, rot: -ang, fadeOut: 0.1, bloom: 0.5, path: k => ({ x: lerp(sx, c.x, ease.inCubic(k)), y: lerp(sy, c.y, ease.inCubic(k)) }) });
    }
    for (let k = 0; k < 4; k++) {
      await wait(k ? 95 : 300);
      sfx('slash');
      V.fx('ice_crescent', { x: c.x + rand(-20, 20), y: c.y + rand(-30, 30), w: 340, dur: 420, rot: [0.3, -0.9, 1.4, -0.2][k], flip: k % 2 === 1, sweep: { a0: -Math.PI, a1: Math.PI, t: 0.28, color: 'ice' }, bloom: 0.4 });
      x.hit(t, 0.7 * finisher(), { color: 'ice', small: k < 3, keepFrost: true });
      if (!t.alive) break;
    }
    if (x.emp) for (const f of x.foes().filter(f => f !== t)) {
      const fc = C(f);
      for (let i = 0; i < 4; i++) V.fx('ice_sword', { w: 60, dur: 240, delay: i * 40, ay: 0.95, rot: 0, path: k => ({ x: fc.x + (i - 1.5) * 26, y: lerp(-80, fc.y, ease.inQuad(k)) }) });
      wait(260).then(() => x.hit(f, 0.6, { color: 'ice', small: true }));
    }
    await wait(120);
    sfx('shatter'); sfx('boom'); hitStop(130); slowMo(0.35, 520); V.flash('#d8f2ff', 0.45, 0.0035); V.shake(14, 420);
    V.fx('ice_burst', { x: c.x, y: c.y, w: 560, dur: 900, s0: 0.4, s1: 1.25, bloom: 0.3 });
    V.ring({ x: c.x, y: c.y, r1: 420, color: 'ice', dur: 700, width: 20 });
    if (t.alive && x.status(t, 'frost', 1)) frostFx(t);
    await wait(500);
  },

  // ===================== Mo Yingyue — Wood (thunder), Shadow =====================
  async mo_s1(x) {
    const { u, target: t } = x;
    sfx('dash');
    const back = await board.lunge(u, t, 0.42, 130);
    const c = C(t);
    for (let i = 0; i < 2; i++) {
      sfx('slash'); sfx('zap');
      V.fx('thunder_x', { x: c.x, y: c.y, w: 300, dur: 420, s0: 0.6, s1: 1.15, rot: i ? 0.45 : -0.25, flip: !!i, bloom: 0.4, ease: ease.outExpo });
      V.bolt({ x0: c.x - 120 + i * 240, y0: c.y - 90, x1: c.x + 120 - i * 240, y1: c.y + 90, color: 'violet', width: 3, dur: 180, branches: 1 });
      x.hit(t, 0.55, { color: 'violet', small: i === 0, flash: '#e6d0ff' });
      if (!t.alive) break;
      await wait(130);
    }
    await back();
  },
  async mo_s2(x) {
    const { u, target: t } = x;
    const a = C(u), c = C(t);
    sfx('zap');
    // blink: vanish into lightning, strike through, reappear
    board.tweenCard(u, { o: 0.15, s: 0.92 }, 90);
    V.bolt({ x0: a.x, y0: a.y, x1: c.x, y1: c.y, color: 'violet', width: 6, dur: 300, branches: 3 });
    V.emit('spark', a.x, a.y, 16, { color: 'violet', speed: [200, 500] });
    await wait(130);
    sfx('slash'); sfx('thunder');
    V.fx('thunder_burst', { x: c.x, y: c.y, w: 360, dur: 480, s0: 0.6, s1: 1.2, bloom: 0.4 });
    V.fx('thunder_x', { x: c.x, y: c.y, w: 320, dur: 420, s0: 0.7, s1: 1.2, rot: 0.2, bloom: 0.4 });
    x.hit(t, 1.5, { color: 'violet', flash: '#e6d0ff' });
    V.shake(8, 240);
    await wait(160);
    await board.tweenCard(u, { o: 1, s: 1.07 }, 140);
    const s1 = u.techs[0]; s1.cur = 0; board.refreshCard(u);
    V.floatText('THUNDERFANG READY', a.x, a.y - 120, 'info');
    if (x.emp) for (const al of x.allies()) { for (const tt of al.techs) if (tt.cur > 0 && tt.cd > 1 && tt !== x.t) tt.cur -= 1; board.refreshCard(al); const ac = C(al, 0.8); V.emit('spark', ac.x, ac.y, 8, { color: 'violet', speed: [60, 200] }); }
    await wait(200);
  },
  async mo_s3(x) {
    const { u, target: t } = x;
    await cut(x);
    const c = C(t);
    sfx('charge');
    V.fx('glow:violet', { x: c.x, y: c.y, w: 380, dur: 600, s0: 0.3, s1: 1.2, alpha: 0.6 });
    await wait(260);
    for (let i = 0; i < 3; i++) {
      sfx('thunder'); sfx('zap');
      V.bolt({ x0: c.x + rand(-80, 80), y0: -40, x1: c.x + rand(-20, 20), y1: c.y, color: 'violet', width: 7, dur: 320, branches: 3 });
      V.fx('thunder_bolt', { x: c.x, y: c.y + 120, w: 360, ay: 1, dur: 520, s0: 0.9, s1: 1.05, bloom: 0.3 });
      const missing = 1 + (1 - t.hp / t.maxHp);
      x.hit(t, 0.95 * missing, { color: 'violet', small: i < 2, flash: '#efe0ff' });
      V.flash('#c9a8ff', 0.18);
      if (!t.alive) break;
      await wait(170);
    }
    sfx('boom'); hitStop(120); slowMo(0.35, 480); V.shake(14, 420);
    V.fx('thunder_burst', { x: c.x, y: c.y, w: 560, dur: 800, s0: 0.5, s1: 1.25, bloom: 0.4 });
    V.ring({ x: c.x, y: c.y, r1: 420, color: 'violet', dur: 700, width: 18 });
    if (t.alive && x.status(t, 'shock', 1)) V.floatText('SOUL SHOCK', c.x, c.y - 70, 'info');
    if (x.emp) { u.techs[1].cur = 0; board.refreshCard(u); }
    await wait(450);
  },

  // ===================== Yan Feihong — Fire, Arcane =====================
  async yan_s1(x) {
    const { u, target: t } = x;
    const a = C(u, 0.35), c = C(t);
    sfx('fire');
    V.fx('fire_sigil', { x: a.x, y: a.y, w: 180, dur: 500, back: true, s0: 0.4, s1: 1 });
    await projectile('fire_crescent', a, c, { w: 230, dur: 330, spin: 10, arc: 50, trail: 'ember', color: 'fire' });
    V.fx('fire_burst', { x: c.x, y: c.y, w: 300, dur: 520, s0: 0.6, s1: 1.15, bloom: 0.3 });
    V.emit('ember', c.x, c.y, 16, { color: 'fire', speed: [80, 300] });
    const h = x.hit(t, 1.0, { color: 'fire', flash: '#ffd2b0' });
    if (h && t.alive && Math.random() < 0.4 && x.burn(t, 2)) V.floatText('FIRE POISON', c.x, c.y - 70, 'info');
    await wait(260);
  },
  async yan_s2(x) {
    const fs = x.foes();
    sfx('charge');
    for (const f of fs) { const c = C(f); V.fx('fire_sigil', { x: c.x, y: c.y + 60, w: 280, dur: 1100, back: true, spin: 1, s0: 0.3, s1: 1.05 }); }
    await wait(420);
    sfx('fire'); sfx('boom'); V.shake(9, 300);
    for (const f of fs) {
      const c = C(f);
      V.fx('fire_burst', { x: c.x, y: c.y, w: 320, dur: 600, s0: 0.5, s1: 1.2, bloom: 0.3 });
      V.emit('ember', c.x, c.y + 40, 18, { color: 'fire', speed: [60, 260], spread: 50 });
      x.hit(f, 0.7, { color: 'fire', small: true });
      if (f.alive) x.burn(f, x.emp ? 3 : 2);
    }
    await wait(500);
  },
  async yan_s3(x) {
    const { u } = x;
    await cut(x);
    const fs = x.foes().sort((a, b) => C(a).x - C(b).x);
    const g = board.geo, y = g.enemyY + 150;
    const x0 = g.x0 - 420, x1 = g.W + 420, dur = 1150;
    sfx('fire'); sfx('ult');
    const path = k => ({ x: lerp(x0, x1, ease.inOutCubic(k)), y: y - Math.sin(k * Math.PI) * 40 });
    V.fx('phoenix', { w: 760, dur, path, fadeIn: 0.06, fadeOut: 0.1, bloom: 0.3 });
    for (let i = 0; i < 22; i++) wait(i * dur / 22).then(() => { const p = path(i / 22); V.emit('ember', p.x - 160, p.y + rand(-80, 80), 6, { color: 'fire', speed: [30, 160], life: [500, 1100] }); });
    const hits = fs.map(f => {
      const cx = C(f).x; let k = 0;
      for (let s = 0; s <= 1; s += 0.01) if (path(s).x >= cx) { k = s; break; }
      return [k * dur, f];
    });
    const start = performance.now();
    let el = 0;
    for (const [tm, f] of hits) {
      await wait(Math.max(0, tm - el)); el = tm;
      if (!f.alive) continue;
      const c = C(f);
      V.fx('fire_burst', { x: c.x, y: c.y, w: 380, dur: 650, s0: 0.5, s1: 1.25, bloom: 0.35 });
      V.emit('ember', c.x, c.y, 22, { color: 'fire', speed: [80, 360] });
      const burning = x.hasStatus(f, 'burn');
      x.hit(f, 1.7 * (burning ? 1.3 : 1), { color: 'fire' });
      if (x.emp && burning && f.alive) {
        const s = f.status.find(st => st.id === 'burn');
        if (s) { const extra = s.value * s.turns; f.hp = Math.max(0, f.hp - extra); V.floatText(extra.toLocaleString('en-US'), c.x + 40, c.y + 50, 'dmg', { label: 'DETONATE' }); board.refreshCard(f); }
      }
    }
    void start;
    sfx('boom'); hitStop(110); V.shake(12, 380); V.flash('#ffc89a', 0.3);
    await wait(600);
  },

  // ===================== Su Lianhua — Earth (jade), Healer =====================
  async su_s1(x) {
    const { u, target: t } = x;
    const a = C(u, 0.4), c = C(t);
    sfx('whoosh');
    for (let k = 0; k < 3; k++) {
      wait(k * 90).then(() => projectile('lotus_petal', a, { x: c.x + rand(-30, 30), y: c.y + rand(-30, 30) }, { w: 150, dur: 330, arc: (k - 1) * 90, ax: 0.8, trail: 'petal', color: 'pink' })).then(() => {
        if (!t.alive) return;
        V.emit('petal', c.x, c.y, 6, { color: 'pink', speed: [80, 260] });
        x.hit(t, 0.3, { color: 'jade', small: true });
      });
    }
    await wait(560);
    const al = x.allies().filter(v => v.alive).sort((p, q) => p.hp / p.maxHp - q.hp / q.maxHp)[0];
    if (al) {
      const ac = C(al);
      V.orb({ x0: a.x, y0: a.y, x1: ac.x, y1: ac.y, color: 'jade', dur: 420, arc: -60, size: 16 });
      await wait(420);
      V.fx('heal_burst', { x: ac.x, y: ac.y, w: 240, dur: 600, s0: 0.6, s1: 1.1 });
      V.emit('petal', ac.x, ac.y, 8, { color: 'jade', speed: [30, 140], up: 60 });
      sfx('heal'); x.heal(al, 0.7);
    }
    await wait(200);
  },
  async su_s2(x) {
    const { u } = x;
    const a = C(u, 0.4);
    sfx('heal');
    V.fx('lotus_bloom', { x: a.x, y: a.y, w: 420, dur: 1400, s0: 0.2, s1: 1, fadeIn: 0.12, alpha: 0.75, ease: ease.outBack });
    await wait(350);
    for (const al of x.allies()) {
      const c = C(al);
      V.fx('heal_burst', { x: c.x, y: c.y, w: 280, dur: 700, s0: 0.5, s1: 1.15 });
      V.emit('petal', c.x, c.y + 60, 10, { color: 'jade', speed: [40, 160], up: 80, spread: 50 });
      x.heal(al, 0.95);
      if (x.cleanse(al, 1)) V.floatText('CLEANSED', c.x, c.y - 70, 'info');
      if (x.emp) x.status(al, 'clear', 1);
    }
    await wait(550);
  },
  async su_s3(x) {
    const { u } = x;
    await cut(x);
    const a = C(u, 0.35);
    V.rays({ x: a.x, y: a.y, color: 'gold', len: 520, dur: 1600, alpha: 0.5 });
    V.fx('lotus_bloom', { x: board.geo.W / 2, y: board.geo.heroY + 150, w: 900, dur: 2200, s0: 0.2, s1: 1, fadeIn: 0.12, alpha: 0.55, back: true, ease: ease.outBack });
    sfx('heal');
    await wait(300);
    if (x.emp) { const dead = x.B.units.find(v => v.side === u.side && !v.alive); if (dead) x.revive(dead, 0.3); }
    for (const al of x.allies()) {
      const c = C(al);
      V.fx('jade_pillar', { x: c.x, y: c.y + 150, w: 230, ay: 1, dur: 1200, s0: 0.8, s1: 1.05, fadeIn: 0.12, bloom: 0.25 });
      V.emit('petal', c.x, c.y, 10, { color: 'gold', speed: [30, 150], up: 60, spread: 60 });
      x.shield(al, 1.3);
      x.status(al, 'dew', 2);
      await wait(90);
    }
    await wait(650);
  },

  // ===================== Enemies =====================
  async claw(x) {
    const { u, target: t } = x;
    sfx('whoosh');
    const back = await board.lunge(u, t, 0.34, 170);
    const c = C(t);
    sfx('slash');
    V.fx('ghost_slash', { x: c.x, y: c.y, w: 340, dur: 520, s0: 0.85, s1: 1.1, flip: true, sweep: { a0: -Math.PI, a1: Math.PI, t: 0.3, color: 'violet' }, bloom: 0.3, fadeIn: 0.01 });
    x.hit(t, u.boss ? 1.1 : 1.0, { color: 'violet', flash: '#e0c8ff' });
    await back();
  },
  async lash(x) {
    const { u, target: t } = x;
    const a = C(u, 0.55), c = C(t);
    sfx('ghost');
    V.bolt({ x0: a.x, y0: a.y, x1: c.x, y1: c.y, color: 'violet', width: 5, dur: 260, branches: 1, jitter: 0.12 });
    await wait(160);
    V.fx('ghost_flame', { x: c.x, y: c.y + 110, w: 250, ay: 1, dur: 900, s0: 0.5, s1: 1.1, bloom: 0.3 });
    const h = x.hit(t, 1.1, { color: 'violet' });
    if (h && t.alive && Math.random() < 0.5 && x.burn(t, 2)) V.floatText('NETHERBURN', c.x, c.y - 70, 'info');
    await wait(300);
  },
  async cinder(x) {
    sfx('ghost'); V.flash('#ff9a5a', 0.15);
    const hs = x.foes();
    for (const h of hs) { const c = C(h); V.fx('ghost_flame', { x: c.x, y: c.y + 120, w: 240, ay: 1, dur: 900, s0: 0.5, s1: 1.1, bloom: 0.3 }); }
    await wait(300);
    for (const h of hs) { const c = C(h); V.emit('ember', c.x, c.y, 10, { color: 'fire', speed: [60, 220] }); x.hit(h, 0.55, { color: 'fire', small: true }); if (h.alive && Math.random() < 0.5) x.burn(h, 2); }
    V.shake(6, 240);
    await wait(420);
  },
  async bind(x) {
    const { target: t } = x; const c = C(t);
    sfx('ghost');
    V.fx('curse_sigil', { x: c.x, y: c.y + 40, w: 300, dur: 1100, back: true, spin: -1, s0: 0.3, s1: 1 });
    await wait(380);
    V.emit('smoke', c.x, c.y + 60, 8, { speed: [20, 90], spread: 50 });
    x.hit(t, 1.3, { color: 'gold' });
    if (t.alive) { x.delay(t, 1); V.floatText('TECHNIQUES DELAYED', c.x, c.y - 70, 'info'); }
    await wait(380);
  },
  async spear(x) {
    const { u, target: t } = x; const a = C(u, 0.55), c = C(t);
    sfx('whoosh');
    await projectile('ghost_skull', a, c, { w: 230, dur: 420, arc: 30, ax: 0.3, trail: 'wisp', color: 'white' });
    V.fx('ghost_burst', { x: c.x, y: c.y, w: 300, dur: 520, s0: 0.6, s1: 1.15 });
    x.hit(t, 1.7, { color: 'white', critBonus: 0.5 });
    await wait(300);
  },
  async tide(x) {
    sfx('rumble');
    const hs = x.foes(), g = board.geo;
    V.fx('ghost_burst', { x: g.W / 2, y: g.heroY + 140, w: 900, dur: 900, s0: 0.4, s1: 1.2, alpha: 0.7 });
    await wait(320);
    for (const h of hs) { const c = C(h); V.emit('wisp', c.x, c.y, 8, { color: 'ice', speed: [30, 120], spread: 60 }); x.hit(h, 0.5, { color: 'ice', small: true }); if (h.alive) x.status(h, 'disrupt', 1); }
    V.shake(7, 260);
    await wait(420);
  },
  async thorns(x) {
    const { u, target: t } = x; const c = C(t);
    const back = await board.lunge(u, t, 0.3, 170);
    for (let i = 0; i < 2; i++) {
      sfx('slash');
      V.fx('ghost_slash', { x: c.x, y: c.y, w: 300, dur: 460, rot: i ? 0.6 : -0.3, flip: !!i, bloom: 0.3 });
      x.hit(t, 0.6, { color: 'green', small: i === 0 });
      if (!t.alive) break;
      await wait(140);
    }
    if (t.alive && x.status(t, 'venom', 2)) V.floatText('GU VENOM', c.x, c.y - 70, 'info');
    await back();
  },
  async curse(x) {
    sfx('ghost');
    const hs = x.foes();
    for (const h of hs) { const c = C(h); V.fx('curse_sigil', { x: c.x, y: c.y + 30, w: 320, dur: 1400, back: true, spin: -1, s0: 0.2, s1: 1 }); }
    await wait(420);
    const bc = C(x.u, 0.5);
    for (const h of hs) { const c = C(h); projectile('ghost_skull', bc, c, { w: 200, dur: 380, arc: 60, ax: 0.3, trail: 'wisp', color: 'violet' }); }
    await wait(380);
    for (const h of hs) { x.hit(h, 0.6, { color: 'violet', small: true }); if (h.alive) x.status(h, 'wither', 1); }
    V.shake(7, 260);
    await wait(420);
  },
  async cataclysm(x) {
    await ui.cutin(x.u, x.t, false, true);
    const hs = x.foes(), g = board.geo;
    V.flash('#6a3cff', 0.35); sfx('rumble'); sfx('ghost');
    V.fx('ghost_burst', { x: g.W / 2, y: g.heroY + 150, w: 1100, dur: 1300, s0: 0.3, s1: 1.25, alpha: 0.85 });
    for (const h of hs) { const c = C(h); V.fx('ghost_flame', { x: c.x, y: c.y + 140, w: 300, ay: 1, dur: 1300, s0: 0.4, s1: 1.15, bloom: 0.35 }); V.fx('curse_sigil', { x: c.x, y: c.y + 40, w: 300, dur: 1300, back: true, spin: 1.2 }); }
    await wait(500);
    sfx('boom'); hitStop(110); V.shake(16, 520);
    for (const h of hs) { const c = C(h); V.emit('wisp', c.x, c.y, 10, { color: 'violet', speed: [40, 200], spread: 60 }); V.emit('ember', c.x, c.y, 10, { color: 'violet', speed: [60, 260] }); x.hit(h, 1.7, { color: 'violet' }); if (h.alive) x.burn(h, 2); }
    await wait(650);
  },
};

