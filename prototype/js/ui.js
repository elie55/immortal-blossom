// Interface: side panels, Harmony track, technique panel, banners, cut-ins, encounter shop,
// card details, tooltips, results. Builds its own DOM inside the scaled #stage.

const $ = (s, r = document) => r.querySelector(s);
const fmt = n => Math.round(n).toLocaleString('en-US');
const TARGET_TXT = { enemy: 'One enemy', allEnemies: 'All enemies', ally: 'One ally', allAllies: 'All allies', self: 'Self' };
const glyphIcon = t => t.icon.startsWith('g:') ? `<span class="glyph">${t.icon.slice(2)}</span>` : `<img src="assets/ui/${t.icon}.webp" alt="">`;
const LOTUS = `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="currentColor"><path d="M32 6c6 8 8 17 0 30C24 23 26 14 32 6z"/><path d="M10 22c10 0 17 5 21 15-11 2-19-3-21-15z" opacity=".85"/><path d="M54 22c-10 0-17 5-21 15 11 2 19-3 21-15z" opacity=".85"/><path d="M4 38c11-4 21-1 28 7-12 6-22 3-28-7z" opacity=".7"/><path d="M60 38c-11-4-21-1-28 7 12 6 22 3 28-7z" opacity=".7"/></g></svg>`;

const CYCLE_SVG = (() => {
  const cx = 105, cy = 80, R = 58, nodes = [['火', '#ff8048', -90], ['土', '#e4b45a', -18], ['金', '#efe6c8', 54], ['水', '#7cc6ff', 126], ['木', '#86e38f', 198]];
  const pos = nodes.map(([g, c, a]) => [g, c, cx + Math.cos(a * Math.PI / 180) * R, cy + Math.sin(a * Math.PI / 180) * R]);
  const arc = (i) => { const a0 = (nodes[i][2] + 15) * Math.PI / 180, a1 = (nodes[(i + 1) % 5][2] - 15) * Math.PI / 180; return `<path d="M${cx + Math.cos(a0) * R} ${cy + Math.sin(a0) * R} A${R} ${R} 0 0 1 ${cx + Math.cos(a1) * R} ${cy + Math.sin(a1) * R}" stroke="#e8c77d" stroke-width="2" fill="none" marker-end="url(#ga)"/>`; };
  const star = (i) => { const a = pos[i], b = pos[(i + 2) % 5], dx = b[2] - a[2], dy = b[3] - a[3], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L; return `<line x1="${a[2] + ux * 16}" y1="${a[3] + uy * 16}" x2="${b[2] - ux * 18}" y2="${b[3] - uy * 18}" stroke="#ff7a8a" stroke-width="1.6" stroke-dasharray="4 3" marker-end="url(#oa)"/>`; };
  return `<svg viewBox="0 0 210 160"><defs><marker id="ga" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#e8c77d"/></marker><marker id="oa" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#ff7a8a"/></marker></defs>
    ${[0, 1, 2, 3, 4].map(arc).join('')}${[0, 1, 2, 3, 4].map(star).join('')}
    ${pos.map(([g, c, x, y]) => `<circle cx="${x}" cy="${y}" r="15" fill="${c}" stroke="#fff3c4" stroke-width="1.5"/><text x="${x}" y="${y + 6}" text-anchor="middle" font-family="Noto Serif SC, serif" font-weight="900" font-size="16" fill="#10141c">${g}</text>`).join('')}
    <text x="6" y="157" text-anchor="start" font-family="Cinzel, serif" font-size="10.5" fill="#e8c77d">— feeds</text><text x="204" y="157" text-anchor="end" font-family="Cinzel, serif" font-size="10.5" fill="#ff7a8a">overcomes - -</text></svg>`;
})();

const ui = {
  stage: null, boardEl: null,
  init(stage) {
    this.stage = stage;
    stage.insertAdjacentHTML('beforeend', `
      <div id="bg"><div class="bg-img"></div><div class="bg-shade"></div><div class="bg-table"></div></div>
      <div id="mid"><div id="chain"></div></div>
      <div id="lp">
        <div class="side side-enemy">
          <div class="side-title"><span>Netherflame Sect</span><em id="wave">Wave 1/2</em></div>
          <div class="pool" id="pool-enemy"></div>
          <div class="cyc-ref"><div class="cyc-t">Five Phases</div>${CYCLE_SVG}</div>
        </div>
        <div class="side side-hero">
          <div class="qi-box" id="qi-box"><div class="qi-ic">${LOTUS}</div><div><b id="qi">0</b><small>Spirit Qi</small></div><i id="qi-pop"></i></div>
          <div class="pool-title">Phase Qi <small>+8% per point</small></div>
          <div class="pool" id="pool-hero"></div>
        </div>
      </div>
      <div id="rp">
        <div class="ctls">
          <button class="ctl" id="b-help" aria-label="How to play">?</button>
          <button class="ctl" id="b-auto">Auto</button>
          <button class="ctl" id="b-speed">×1</button>
          <button class="ctl" id="b-sound" aria-label="Sound"><svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg></button>
          <button class="ctl" id="b-restart" aria-label="Restart">↻</button>
        </div>
        <div class="seal" id="seal"><small>Round</small><b id="round">1</b><span id="whose">Your turn</span></div>
        <div id="techcard"></div>
        <button id="b-enc" class="enc"><span class="g">奇遇</span><span>Encounter</span></button>
        <button id="b-end" class="endturn"><span>End Turn</span></button>
      </div>
      <div id="world"><canvas id="fxb"></canvas><div id="board"></div><canvas id="fxf"></canvas></div>
      <div id="turnban"></div>
      <div id="banner"></div>
      <div id="cutin"></div>
      <div id="tip"></div>
      <div id="shop" class="modal"></div>
      <div id="detail" class="modal"></div>
      <div id="result" class="modal"></div>
      <div id="tut"></div>`);
    this.boardEl = $('#board', stage);
    this.bind();
  },

  bind() {
    const st = this.stage;
    st.addEventListener('click', e => {
      if (BT.B.gate && !e.target.closest('#tut .tut-tip') && !BT.B.gate('click', e)) { e.stopPropagation(); e.preventDefault(); return; }
      const tb = e.target.closest('.tech');
      const card = e.target.closest('.card');
      if (tb && card) {
        const u = BT.getUnit(card.dataset.uid), i = +tb.dataset.i;
        if (u.side === 'hero' && !BT.B.pendingEnc && !(BT.B.sel && validTarget(card))) { BT.selectTech(u, i); return; }
        if (u.side === 'enemy' && !(BT.B.sel || BT.B.pendingEnc)) { this.techInfo(u, u.techs[i], tb); return; }
      }
      if (card) {
        const u = BT.getUnit(card.dataset.uid);
        if ((BT.B.sel || BT.B.pendingEnc) && card.classList.contains('targetable')) { sfx('click'); BT.chooseTarget(u); return; }
        if (!BT.B.sel && !BT.B.pendingEnc) { if (BT.B.gate && !BT.B.gate('detail', u)) return; this.openDetail(u); return; }
        return;
      }
      if (e.target.closest('#b-end')) { BT.endTurn(); return; }
      if (e.target.closest('#b-enc')) { this.openShop(); return; }
      if (e.target.closest('#b-auto')) { BT.setAuto(!BT.B.auto); sfx('click'); return; }
      if (e.target.closest('#b-speed')) { clock.speed = clock.speed >= 3 ? 1 : clock.speed + 1; document.documentElement.style.setProperty('--spd', clock.speed); this.refreshControls(); sfx('click'); return; }
      if (e.target.closest('#b-sound')) { audio.muted = !audio.muted; this.refreshControls(); return; }
      if (e.target.closest('#b-restart')) { this.onRestart && this.onRestart(false); return; }
      if (e.target.closest('#b-help')) { this.onRestart && this.onRestart(true); return; }
      if (e.target.closest('.emp-btn')) { BT.toggleEmpower(); sfx('click'); return; }
      if (e.target.closest('.tc-cancel')) { if (BT.B.pendingEnc) BT.cancelPending(); else BT.deselect(); return; }
      if (e.target.closest('.offer .buy')) { BT.buyEncounter(+e.target.closest('.offer').dataset.i); return; }
      if (e.target.closest('#shop .reroll')) { BT.rerollEncounter(); return; }
      if (e.target.closest('#shop .leave') || e.target.id === 'shop') { this.closeShop(); return; }
      if (e.target.closest('#detail')) { this.closeDetail(); return; }
      if (e.target.closest('#result .again')) { this.onRestart && this.onRestart(false); return; }
      if (e.target.closest('#result .tut-again')) { this.onRestart && this.onRestart(true); return; }
      if (!e.target.closest('#rp') && !e.target.closest('#lp') && (BT.B.sel)) BT.deselect();
    }, true);
    board.bindTilt(st, uid => BT.getUnit(uid));
  },

  resetBattle() {
    $('#result').classList.remove('show'); this.closeShop(); this.closeDetail();
    this.refreshAll(); this.showChain();
  },

  // ---------------- panels ----------------
  refreshAll() {
    const B = BT.B; if (!B.points.hero) return;
    for (const u of B.units) board.refreshCard(u);
    $('#qi').textContent = B.qi;
    this.renderPool('hero'); this.renderPool('enemy');
    $('#round').textContent = B.round;
    const enc = $('#b-enc');
    enc.classList.toggle('show', !!B.encounter && B.side === 'hero' && !B.over);
    enc.classList.toggle('used', !!(B.encounter && B.encounter.bought));
    enc.classList.toggle('glow', !!(B.encounter && !B.encounter.bought));
    const canEnd = B.phase === 'input' && !B.busy && !B.over;
    $('#b-end').classList.toggle('disabled', !canEnd);
    const anyReady = BT.heroes().some(h => h.alive && !h.skip && h.techs.some(t => t.cur <= 0));
    $('#b-end').classList.toggle('pulse', canEnd && !anyReady);
    for (const u of B.units) u.el && u.el.classList.toggle('can-act', B.side === 'hero' && B.phase === 'input' && u.side === 'hero' && u.alive && !u.skip && u.techs.some(t => t.cur <= 0));
    this.showSelection();
    this.refreshControls();
  },
  renderPool(side) {
    const B = BT.B, el = $(`#pool-${side}`);
    const keys = side === 'hero' ? CYCLE : [...CYCLE, 'yin'];
    el.innerHTML = keys.map(k => {
      const p = PHASES[k], n = B.points[side][k] || 0;
      return `<div class="orb${n ? ' on' : ''}" data-ph="${k}" style="--pc:${p.color}" title="${p.name}: +${n * 8}% ${p.name} damage and healing"><i>${p.glyph}</i><b>${n}</b>${side === 'hero' ? `<small>+${n * 8}%</small>` : ''}</div>`;
    }).join('');
  },
  waveInfo(i, n) { $('#wave').textContent = i + 1 === n ? 'Boss wave' : `Wave ${i + 1}/${n}`; },
  setTurn(side) {
    const s = $('#seal'); s.classList.toggle('enemy', side === 'enemy');
    $('#whose').textContent = side === 'hero' ? 'Your turn' : 'Enemy turn';
    $('#round').textContent = BT.B.round;
    this.refreshAll();
  },
  refreshControls() {
    $('#b-auto').classList.toggle('on', BT.B.auto);
    $('#b-speed').textContent = '×' + clock.speed;
    $('#b-sound').classList.toggle('off', audio.muted);
  },
  lock() { this.refreshAll(); },
  qiGain(n) {
    $('#qi').textContent = BT.B.qi;
    const p = $('#qi-pop'); p.textContent = (n > 0 ? '+' : '') + n; p.className = n > 0 ? 'up' : 'down';
    void p.offsetWidth; p.classList.add('go');
    $('#qi-box').classList.remove('bump'); void $('#qi-box').offsetWidth; $('#qi-box').classList.add('bump');
  },
  stagePos(el) {
    const r = el.getBoundingClientRect(), sr = this.stage.getBoundingClientRect(), s = V.view.s;
    return { x: (r.left + r.width / 2 - sr.left) / s, y: (r.top + r.height / 2 - sr.top) / s };
  },
  pointFly(u, phase, n, quiet) {
    const orbEl = $(`#pool-${u.side} .orb[data-ph="${phase}"]`);
    if (!orbEl || !u.el) { this.renderPool(u.side); return; }
    const a = board.center(u, 0.3), b = this.stagePos(orbEl);
    V.orb({ x0: a.x, y0: a.y, x1: b.x, y1: b.y, color: PHASES[phase].col, dur: quiet ? 500 : 650, size: 14 + n * 4 });
    wait(quiet ? 500 : 650).then(() => {
      this.renderPool(u.side);
      const o = $(`#pool-${u.side} .orb[data-ph="${phase}"]`);
      if (o) { o.classList.add('bump'); }
      V.emit('glow', b.x, b.y, 6, { color: PHASES[phase].col, speed: [30, 120], life: [300, 600] });
    });
  },
  showChain() {
    const c = BT.B.chain, el = $('#chain');
    const list = c.list || [];
    if (!list.length) { this._chainN = 0; el.className = 'idle'; el.innerHTML = `<span class="lbl">Harmony</span>${CYCLE.map((p, i) => `<i style="--pc:${PHASES[p].color}">${PHASES[p].glyph}</i>${i < 4 ? '<em>›</em>' : ''}`).join('')}`; return; }
    el.className = `live ${BT.B.side}`;
    const prevN = this._chainN;
    const mult = Math.round(RULES.harmonyStep * (c.len - 1) * 100);
    el.innerHTML = `<span class="lbl">Harmony ×${c.len}</span>${list.map((p, i) => `<i class="lit${i === list.length - 1 && this._chainN !== list.length ? ' new' : ''}" style="--pc:${PHASES[p].color}">${PHASES[p].glyph}</i>${i < list.length - 1 ? '<em>›</em>' : ''}`).join('')}${c.len < 5 ? `<em>›</em><i class="next" style="--pc:${PHASES[GEN[c.last]].color}">${PHASES[GEN[c.last]].glyph}</i>` : ''}<span class="mul">${mult ? `+${mult}%` : 'start'}</span>`;
    this._chainN = list.length; void prevN;
  },
  harmonyBurst() {
    const g = board.geo;
    V.flash('#ffe8a8', 0.25); sfx('win');
    V.floatText('FIVE PHASES HARMONY', g.W / 2, g.heroY - 26, 'big', { label: '+2 SPIRIT QI' });
    V.rays({ x: g.W / 2, y: g.heroY - 26, color: 'gold', len: 600, dur: 1400, alpha: 0.45 });
  },

  // ---------------- selection & technique panel ----------------
  showSelection() {
    const B = BT.B, tc = $('#techcard');
    for (const u of B.units) if (u.el) {
      u.el.classList.remove('targetable', 'selected', 'dimmed');
      u.el.querySelectorAll('.tech').forEach(b => b.classList.remove('sel'));
      const adv = u.el.querySelector('.c-adv'); adv.className = 'c-adv'; adv.textContent = '';
    }
    if (B.pendingEnc) {
      const ts = BT.encounterTargets(B.pendingEnc);
      for (const u of B.units) if (u.el && u.alive) u.el.classList.add(ts.includes(u) ? 'targetable' : 'dimmed');
      tc.className = 'show'; tc.innerHTML = `<div class="tc-h"><span class="tc-ic glyph r${B.pendingEnc.rarity}">${B.pendingEnc.glyph}</span><div><b>${B.pendingEnc.name}</b><small>${B.pendingEnc.kind} · ${B.pendingEnc.cost} Spirit Qi</small></div></div><p>${B.pendingEnc.desc}</p><div class="tc-hint">Choose ${B.pendingEnc.target === 'enemy' ? 'an enemy' : 'a heroine'}</div><button class="tc-cancel">Cancel</button>`;
      return;
    }
    if (!B.sel) {
      const hint = B.phase === 'input' && !B.over ? (B.auto ? 'Auto battle is playing your turn.' : 'Tap a glowing technique on one of your cards.') : (B.side === 'enemy' ? 'The enemy is acting…' : '');
      tc.className = 'hint'; tc.innerHTML = hint ? `<div class="tc-hint">${hint}</div>` : '';
      return;
    }
    const { u, t, i } = B.sel;
    u.el.classList.add('selected');
    u.el.querySelectorAll('.tech')[i].classList.add('sel');
    const ts = BT.validTargets(u, t);
    for (const x of B.units) if (x.el && x.alive && x !== u) x.el.classList.add(ts.includes(x) ? 'targetable' : 'dimmed');
    if (ts.includes(u)) u.el.classList.add('targetable');
    if (t.target === 'enemy' || t.target === 'allEnemies') for (const f of ts) {
      const a = BT.advantage(u.phase, f.phase), el = f.el.querySelector('.c-adv');
      if (a > 0) { el.className = 'c-adv good'; el.innerHTML = `<b>▲</b>${PHASES[u.phase].glyph} overcomes ${PHASES[f.phase].glyph}`; }
      else if (a < 0) { el.className = 'c-adv bad'; el.innerHTML = `<b>▼</b>${PHASES[f.phase].glyph} overcomes ${PHASES[u.phase].glyph}`; }
    }
    const c = B.chain, cont = c.last && GEN[c.last] === u.phase && c.last !== u.phase;
    const nextLen = cont ? c.len + 1 : 1;
    const canEmp = t.emp && (B.emp || B.qi >= t.emp.cost);
    tc.className = 'show';
    tc.innerHTML = `
      <div class="tc-h"><span class="tc-ic">${glyphIcon(t)}</span><div><b>${t.name}</b><small>${t.ult ? 'Ultimate · ' : ''}Cooldown ${t.cd} · ${TARGET_TXT[t.target]}</small></div></div>
      <p>${t.desc}</p>
      ${nextLen > 1 ? `<div class="tc-harm">Harmony ×${nextLen}: +${Math.round((nextLen - 1) * RULES.harmonyStep * 100)}% (${PHASES[c.last].glyph} feeds ${PHASES[u.phase].glyph})</div>` : (c.len ? `<div class="tc-harm off">Breaks the Harmony chain (${PHASES[GEN[c.last]].glyph} would continue it)</div>` : '')}
      ${t.emp ? `<button class="emp-btn${B.emp ? ' on' : ''}${canEmp ? '' : ' no'}"><span>✦ Empower</span><em>${t.emp.cost} Spirit Qi</em><small>${t.emp.desc}</small></button>` : ''}
      <div class="tc-hint">${t.target === 'enemy' ? 'Tap an enemy' : (t.target === 'allEnemies' ? 'Tap any enemy, or the technique again' : 'Tap any ally, or the technique again')}</div>
      <button class="tc-cancel">Cancel</button>`;
  },
  techInfo(u, t, btn) {
    const tip = $('#tip');
    const ready = t.cur <= 0;
    tip.innerHTML = `<b>${t.name}</b><small>${t.ult ? 'Ultimate · ' : ''}Cooldown ${t.cd} · ${TARGET_TXT[t.target]} · ${ready ? 'ready' : `ready in ${t.cur} turn${t.cur > 1 ? 's' : ''}`}</small><p>${t.desc}</p>`;
    const el = btn || u.el.querySelectorAll('.tech')[u.techs.indexOf(t)];
    const p = this.stagePos(el);
    tip.style.left = Math.max(170, Math.min(V.view.W - 170, p.x)) + 'px';
    tip.style.top = (u.side === 'enemy' ? p.y + 40 : p.y - 40) + 'px';
    tip.className = 'show ' + (u.side === 'enemy' ? 'below' : 'above');
    clearTimeout(this._tipT); this._tipT = setTimeout(() => tip.className = '', 3200);
  },
  castBanner(u, t, emp, hm) {
    const tc = $('#techcard'), B = BT.B;
    tc.className = 'show cast ' + u.side;
    tc.innerHTML = `<div class="tc-who">${u.name}${u.side === 'enemy' ? ' casts' : ''}</div>
      <div class="tc-h"><span class="tc-ic">${glyphIcon(t)}</span><div><b>${t.name}</b><small>${emp ? '✦ Empowered · ' : ''}${t.ult ? 'Ultimate · ' : ''}${TARGET_TXT[t.target]}</small></div></div>
      ${B.chain.len > 1 ? `<div class="tc-harm">Harmony ×${B.chain.len}: +${Math.round((hm - 1) * 100)}%</div>` : ''}
      <p>${t.desc}</p>`;
  },

  // ---------------- banners & cut-ins ----------------
  async turnBanner(title, sub, side) {
    const b = $('#turnban');
    b.className = side; b.innerHTML = `<div><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
    void b.offsetWidth; b.classList.add('show'); sfx('turn');
    await wait(820); b.classList.add('out'); await wait(260); b.className = '';
  },
  async banner(title, sub, kind = '') {
    const b = $('#banner');
    b.className = kind; b.innerHTML = `<b>${title}</b>${sub ? `<small>${sub}</small>` : ''}`;
    void b.offsetWidth; b.classList.add('show');
    await wait(1250); b.classList.add('out'); await wait(380); b.className = '';
  },
  async cutin(u, t, emp, enemy = false) {
    const c = $('#cutin'), ph = PHASES[u.phase];
    c.style.setProperty('--el', ph.color);
    const art = enemy ? `assets/cards/${u.art}.webp` : `assets/ui/${u.cutin}.webp`;
    c.className = enemy ? 'enemy' : '';
    c.innerHTML = `<div class="ci-wash"></div><div class="ci-lines"></div>
      <div class="ci-band ci-back"></div>
      <div class="ci-band ci-main"><div class="ci-art" style="background-image:url(${art})"></div><div class="ci-shine"></div></div>
      <div class="ci-text"><small>${u.name}${emp ? ' · ✦ Empowered' : ''}</small><b>${t.name}</b><i>${ph.glyph}</i></div>
      <div class="ci-flash"></div>`;
    void c.offsetWidth; c.classList.add('show');
    sfx('ult');
    await wait(1100);
    c.classList.add('out');
    await wait(280);
    c.className = '';
  },
  killFx(u) {
    const c = board.center(u);
    sfx('shatter');
    V.emit('shard', c.x, c.y, 18, { color: PHASES[u.phase].col, speed: [160, 520] });
    V.emit('wisp', c.x, c.y, 14, { color: u.side === 'enemy' ? 'violet' : 'white', speed: [30, 160], rect: [180, 260], life: [600, 1200] });
    V.emit('smoke', c.x, c.y + 40, 6, { speed: [20, 80], spread: 60 });
    u.el.classList.add('dying');
    if (u.side === 'enemy') {
      board.tweenCard(u, { s: 0.86, y: -20 }, 700);
      wait(720).then(() => { u.el.classList.add('gone'); });
    }
  },
  reviveFx(u) {
    u.el.classList.remove('dying', 'dead', 'gone');
    const c = board.center(u);
    V.beam({ x: c.x, y: c.y + 160, w: 180, h: 560, color: 'gold', dur: 1000 });
    V.emit('petal', c.x, c.y, 14, { color: 'gold', speed: [40, 180], up: 80, spread: 60 });
    V.floatText('REVIVED', c.x, c.y - 40, 'big');
    board.refreshCard(u);
  },

  // ---------------- encounter shop ----------------
  openShop() {
    const B = BT.B, e = B.encounter;
    if (!e || B.side !== 'hero' || B.phase !== 'input' || B.busy) return;
    if (B.gate && !B.gate('openShop')) return;
    BT.deselect();
    const s = $('#shop');
    const R = ['', 'Common', 'Rare', 'Legendary'];
    s.innerHTML = `<div class="shop-box" onclick="event.stopPropagation()">
      <div class="shop-h"><span class="g">奇遇</span><div><b>Fortuitous Encounter</b><small>Later rounds bring rarer finds</small></div></div>
      <div class="offers">${e.offers.map((o, i) => `
        <div class="offer r${o.rarity}${e.bought ? ' sold' : ''}" data-i="${i}">
          <div class="o-rar">${R[o.rarity]} · ${o.kind}</div>
          <div class="o-g">${o.glyph}</div>
          <b>${o.name}</b>
          <p>${o.desc}</p>
          <button class="buy${B.qi < o.cost || e.bought ? ' no' : ''}">${LOTUS}<span>${o.cost}</span></button>
        </div>`).join('')}</div>
      <div class="shop-f"><span class="have">${LOTUS} ${B.qi} Spirit Qi</span>
        <button class="reroll${e.rerolls >= 1 || B.qi < 2 || e.bought ? ' no' : ''}">Reroll · 2</button>
        <button class="leave">${e.bought ? 'Close' : 'Leave'}</button></div>
    </div>`;
    s.classList.add('show');
    BT.emit('shopOpen');
  },
  closeShop() { const s = $('#shop'); if (s && s.classList.contains('show')) { s.classList.remove('show'); BT.emit('shopClose'); } },

  // ---------------- card details ----------------
  openDetail(u) {
    const d = $('#detail'), ph = PHASES[u.phase];
    const hero = HEROES.find(h => h.key === u.key);
    d.innerHTML = `<div class="det-box" style="--ph:${ph.color}">
      <div class="det-art" style="background-image:url(assets/cards/${u.art}.webp)"></div>
      <div class="det-info">
        <div class="det-h"><span class="det-ph">${ph.glyph}</span><div><b>${u.name}</b><small>${u.title || ''}${hero ? ` · ${hero.path}` : ''} · ${ph.name}</small></div></div>
        <div class="det-stats"><span>Health <b>${fmt(u.hp)} / ${fmt(u.maxHp)}</b></span><span>Attack <b>${fmt(u.atk)}</b></span><span>Defense <b>${fmt(u.defense)}</b></span><span>Critical <b>${Math.round(u.crit * 100)}%</b></span></div>
        <div class="det-cyc">${ph.name} feeds <b style="color:${PHASES[GEN[u.phase]]?.color}">${PHASES[GEN[u.phase]]?.name}</b>${OVER[u.phase] ? ` · overcomes <b style="color:${PHASES[OVER[u.phase]].color}">${PHASES[OVER[u.phase]].name}</b>` : ' · neutral to the five phases'}</div>
        ${u.techs.map(t => `<div class="det-t"><span class="tc-ic">${glyphIcon(t)}</span><div><b>${t.name}</b> <small>${t.ult ? 'Ultimate · ' : ''}CD ${t.cd} · ${TARGET_TXT[t.target]}${t.cur > 0 ? ` · ready in ${t.cur}` : ' · ready'}</small><p>${t.desc}</p>${t.emp ? `<p class="emp">✦ Empowered (${t.emp.cost} Spirit Qi): ${t.emp.desc}</p>` : ''}</div></div>`).join('')}
        ${u.status.length ? `<div class="det-st">${u.status.map(s => `<span style="--sc:${STATUS[s.id].color}"><i>${STATUS[s.id].glyph}</i>${STATUS[s.id].name} (${s.turns}): ${STATUS[s.id].desc}</span>`).join('')}</div>` : ''}
        ${u.attached && u.attached.some(Boolean) ? `<div class="det-st">${u.attached.filter(Boolean).map(a => `<span><i>${a.glyph}</i>${a.name}: ${a.desc}</span>`).join('')}</div>` : ''}
        ${u.qiShield ? `<div class="det-st"><span><i>盾</i>Qi shield ${u.qiShield.cur}/${u.qiShield.max}: every hit breaks a segment, and it refills after her turn. At zero she is Shattered: +30% damage taken until her turn ends, and her Cataclysm is delayed by 1 turn.</span></div>` : ''}
        <div class="det-close">Tap anywhere to close</div>
      </div></div>`;
    d.classList.add('show');
  },
  closeDetail() { $('#detail').classList.remove('show'); },

  // ---------------- results ----------------
  result(win) {
    const B = BT.B, r = $('#result');
    const hs = BT.heroes();
    const mvp = [...hs].sort((a, b) => (b.stats.dmg + b.stats.heal * 1.2) - (a.stats.dmg + a.stats.heal * 1.2))[0];
    r.className = 'modal show ' + (win ? 'win' : 'lose');
    r.innerHTML = `<div class="res-box">
      <div class="res-title">${win ? 'Victory' : 'Defeat'}</div>
      <div class="res-sub">${win ? 'The Netherflame Matriarch is banished.' : 'Your Blossoms have fallen…'} · ${B.round} rounds · longest Harmony ×${B.maxChain}</div>
      <div class="res-list">${hs.map(h => `<div class="res-h ${h === mvp ? 'mvp' : ''} ${h.alive ? '' : 'dead'}"><img src="assets/ui/${h.face}.webp" alt=""><div><b>${h.name}${h === mvp ? ' <i>MVP</i>' : ''}</b><span>Damage ${fmt(h.stats.dmg)}${h.stats.heal ? ' · Healing ' + fmt(h.stats.heal) : ''}</span></div></div>`).join('')}</div>
      <div class="res-btns"><button class="gold-btn again">${win ? 'Play again' : 'Try again'}</button><button class="ghost-btn tut-again">Replay tutorial</button></div>
    </div>`;
  },
};

function validTarget(card) { return card.classList.contains('targetable'); }

