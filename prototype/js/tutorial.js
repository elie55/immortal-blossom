// Guided first battle: spotlight + Tao Yao tooltips, gated actions, event-driven steps.

const ph = (g, c) => `<span class="ph" style="color:${c}">${g}</span>`;
const W_ = ph('水', '#7cc6ff'), WD = ph('木', '#86e38f'), F_ = ph('火', '#ff8048'), E_ = ph('土', '#e4b45a'), M_ = ph('金', '#efe6c8');

let active = false, idx = -1, unsub = [], hidden = false, extraQueue = [], current = null, seen = {};
const hero = k => BT.heroes().find(h => h.key === k);
const foe = k => BT.enemies().find(e => e.key === k);
const techBtn = (k, i) => hero(k) && hero(k).el.querySelectorAll('.tech')[i];
const cardEl = u => u && u.el;



// ---------------- steps ----------------
const STEPS = [
  { id: 'welcome', text: `Welcome to the Hundred Blossoms Pavilion! I'm <b>Tao Yao</b>. Let me show you how Blossoms fight. It only takes one turn.` },
  { id: 'heroes', target: () => BT.heroes().map(cardEl), place: 'above', text: `These are your four <b>Blossoms</b>. Each card shows her <b>phase</b> (top left), her <b>health</b> and three <b>techniques</b>.` },
  { id: 'enemies', target: () => BT.enemies().map(cardEl), place: 'below', text: `The <b>Netherflame Sect</b>. Destroy every enemy card to win. Two waves today, and the second one ends with a boss.` },
  { id: 'rings', target: () => hero('ling').el.querySelector('.c-techs'), place: 'above', text: `Glowing techniques are <b>ready</b>. A number in the ring counts the turns until it is ready again. Each turn you may cast <b>every</b> ready technique, in any order.` },
  { id: 'cycle', target: () => $('#chain'), place: 'below', cycle: true, text: `Everything follows the <b>Five Phases</b>. Gold arrows: each phase <b>feeds</b> the next. Red arrows: each phase <b>overcomes</b> another for +30% damage.` },
  { id: 'ling', target: () => techBtn('ling', 0), place: 'above', arrow: true, wait: 'selected', allowEls: () => [techBtn('ling', 0)], allow: (a, p) => a !== 'select' || p.t.id === 'ling_s1',
    text: `Ling Shuang is ${W_} <b>Water</b>, and Water overcomes ${F_} Fire. Tap her <b>Frost Crescent</b>.` },
  { id: 'ling-t', needSel: ['ling', 0], target: () => cardEl(foe('ember')), place: 'below', arrow: true, wait: 'cast', allowEls: () => [cardEl(foe('ember'))], allow: (a, p) => a !== 'target' || p.target.key === 'ember',
    text: `The green tag on the <b>Ember Wraith</b> means ${W_} Water overcomes ${F_} Fire: +30% damage. Tap the wraith to strike.` },
  { id: 'mo', target: () => [techBtn('mo', 0), $('#chain')], place: 'above', arrow: true, wait: 'selected', allowEls: () => [techBtn('mo', 0)], allow: (a, p) => a !== 'select' || p.t.id === 'mo_s1',
    text: `${W_} Water feeds ${WD} Wood. Casting <b>Mo Yingyue</b> next continues the <b>Harmony chain</b>: +15% per link. Tap her <b>Thunderfang Cross</b>.` },
  { id: 'mo-t', needSel: ['mo', 0], target: () => cardEl(foe('mire')), place: 'below', arrow: true, wait: 'cast', allowEls: () => [cardEl(foe('mire'))], allow: (a, p) => a !== 'target' || p.target.key === 'mire',
    text: `${WD} Wood overcomes ${E_} Earth. Strike the <b>Mire Wraith</b>.` },
  { id: 'yan', target: () => techBtn('yan', 0), place: 'above', arrow: true, wait: 'selected', allowEls: () => [techBtn('yan', 0)], allow: (a, p) => a !== 'select' || p.t.id === 'yan_s1',
    text: `${WD} Wood feeds ${F_} Fire: <b>Yan Feihong</b> is next in the chain. Tap her <b>Vermilion Talisman</b>.` },
  { id: 'yan-t', needSel: ['yan', 0], target: () => cardEl(foe('bone')), place: 'below', arrow: true, wait: 'cast', allowEls: () => [cardEl(foe('bone'))], allow: (a, p) => a !== 'target' || p.target.key === 'bone',
    text: `${F_} Fire overcomes ${M_} Metal. Burn the <b>Bone Wraith</b>.` },
  { id: 'su', target: () => techBtn('su', 0), place: 'above', arrow: true, wait: 'selected', allowEls: () => [techBtn('su', 0)], allow: (a, p) => a !== 'select' || p.t.id === 'su_s1',
    text: `${F_} Fire makes ${E_} Earth: close the chain with <b>Su Lianhua</b>. Her <b>Petal Blades</b> also heal the most injured ally.` },
  { id: 'su-t', needSel: ['su', 0], target: () => BT.enemies().filter(e => e.alive).map(cardEl), place: 'below', wait: 'cast', allowEls: () => BT.enemies().map(cardEl),
    text: `Tap any enemy. That makes a <b>Harmony ×4</b>, worth +45% on the last link plus bonus Spirit Qi!` },
  { id: 'points', target: () => $('#pool-hero'), place: 'right', text: `Each technique also adds <b>Phase Qi</b> to the phase it feeds. Every point gives that phase <b>+8%</b> for the rest of the battle, so your chain grows stronger each turn.` },
  { id: 'qi', target: () => $('#qi-box'), place: 'right', text: `<b>Spirit Qi</b> flows in every turn. Spend it to <b>✦ Empower</b> a technique, or on <b>Fortuitous Encounters</b>.` },
  { id: 'mo2', target: () => techBtn('mo', 1), place: 'above', arrow: true, wait: 'selected', allowEls: () => [techBtn('mo', 1)], allow: (a, p) => a !== 'select' || p.t.id === 'mo_s2',
    text: `Mo's <b>Shadow Lightning Step</b> is ready too, and it refreshes her Thunderfang Cross. It starts a new chain, which is fine. Tap it.` },
  { id: 'emp', target: () => $('#techcard .emp-btn'), place: 'left', wait: 'empower', allowEls: () => [$('#techcard .emp-btn')],
    text: `Tap <b>✦ Empower</b>: it spends 6 Spirit Qi for +35% damage and a bonus effect.` },
  { id: 'emp-t', needSel: ['mo', 1, true], target: () => BT.enemies().filter(e => e.alive).map(cardEl), place: 'below', wait: 'cast', allowEls: () => BT.enemies().map(cardEl),
    text: `Empowered! Now tap any enemy.` },
  { id: 'end', target: () => $('#b-end'), place: 'left', wait: 'turnEnd', free: true,
    text: `Thunderfang is ready again: use it if you like. Unused techniques keep their charge. When you are done, tap <b>End Turn</b>.` },
  { id: 'enemy', target: () => BT.enemies().filter(e => e.alive).map(u => u.el.querySelector('.c-techs')), place: 'below', onTurn: 'hero',
    text: `The enemy follows the same rules, Harmony included. Watch the rings on their cards: a <b>1</b> means that technique fires on their next turn.` },
  { id: 'enc', target: () => $('#b-enc'), place: 'left', arrow: true, wait: 'shopOpen', allowEls: () => [$('#b-enc')],
    text: `Even rounds bring a <b>Fortuitous Encounter</b> (奇遇): talismans, pills and treasures for Spirit Qi. Tap it.` },
  { id: 'shop', target: () => $('#shop .offers'), place: 'below', wait: 'shopClose', free: true,
    text: `Buy one if you can afford it, or leave. Later rounds bring rarer finds.` },
  { id: 'done', text: `That's everything! <b>Auto</b> and <b>×2</b> are at the top right, and tapping a card shows its details. Good luck, Pavilion Master.`, last: true },
];
const EXTRA = {
  boss: { id: 'boss', target: () => BT.enemies().find(e => e.boss)?.el, place: 'below',
    text: `The <b>Netherflame Matriarch</b>. Every hit breaks one segment of her gold <b>Qi shield</b>, which refills after her turn. Land 12 hits in one turn (multi-hit techniques help) to <b>Shatter</b> it: +30% damage and her <b>Cataclysm</b> (top right of her card) is delayed.` },
};

// ---------------- DOM ----------------
function el() { return $('#tut'); }
function build() {
  el().innerHTML = `<div class="tut-hole none"></div><div class="tut-arrow"></div><div class="tut-tip"><div class="tut-face"></div><div class="tut-body"><div class="tut-name">Tao Yao<span class="tut-n"></span></div><div class="tut-cycle"></div><div class="tut-text"></div><div class="tut-act"><button class="skip">Skip tutorial</button><span class="wait"></span><button class="next">Next</button></div></div></div>`;
  el().querySelector('.next').addEventListener('click', e => { e.stopPropagation(); next(); });
  el().querySelector('.skip').addEventListener('click', e => { e.stopPropagation(); tut_finish(); });
}

function rectOf(targets) {
  const list = (Array.isArray(targets) ? targets : [targets]).filter(Boolean);
  if (!list.length) return null;
  const sr = ui.stage.getBoundingClientRect(), s = V.view.s;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const t of list) { const r = t.getBoundingClientRect(); if (!r.width && !r.height) continue; x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); }
  if (x0 > x1) return null;
  return { x: (x0 - sr.left) / s, y: (y0 - sr.top) / s, w: (x1 - x0) / s, h: (y1 - y0) / s };
}

function render() {
  const st = current; if (!st || !active) return;
  const root = el(); root.classList.add('on');
  const hole = root.querySelector('.tut-hole'), tip = root.querySelector('.tut-tip'), arrow = root.querySelector('.tut-arrow');
  root.querySelector('.tut-text').innerHTML = st.text;
  root.querySelector('.tut-cycle').innerHTML = st.cycle ? CYCLE_SVG : '';
  root.querySelector('.tut-cycle').style.display = st.cycle ? '' : 'none';
  const main = STEPS.indexOf(st);
  root.querySelector('.tut-n').textContent = main >= 0 ? `${main + 1} / ${STEPS.length}` : '';
  const waits = !!st.wait;
  root.querySelector('.next').style.display = waits ? 'none' : '';
  root.querySelector('.next').textContent = st.last ? 'Start' : (main < 0 ? 'Got it' : 'Next');
  root.querySelector('.wait').textContent = waits ? (st.free ? '' : 'Your move…') : '';
  root.querySelector('.skip').style.visibility = st.last || main < 0 ? 'hidden' : '';
  if (hidden) { root.classList.remove('on'); return; }
  const r = st.target ? rectOf(st.target()) : null;
  const pad = 8;
  if (r) {
    hole.className = 'tut-hole' + (st.free ? ' pass' : '');
    Object.assign(hole.style, { left: r.x - pad + 'px', top: r.y - pad + 'px', width: r.w + pad * 2 + 'px', height: r.h + pad * 2 + 'px' });
  } else { hole.className = 'tut-hole none'; Object.assign(hole.style, { left: V.view.W / 2 + 'px', top: '360px' }); }
  // place the tip
  const tw = 470, th = tip.offsetHeight || 170, W = V.view.W, H = V.view.H, m = 18;
  let x = (W - tw) / 2, y = (H - th) / 2;
  if (r) {
    if (st.place === 'above') { x = r.x + r.w / 2 - tw / 2; y = r.y - th - m - (st.arrow ? 34 : 0); }
    else if (st.place === 'below') { x = r.x + r.w / 2 - tw / 2; y = r.y + r.h + m + (st.arrow ? 34 : 0); }
    else if (st.place === 'left') { x = r.x - tw - m - 10; y = r.y + r.h / 2 - th / 2; }
    else if (st.place === 'right') { x = r.x + r.w + m + 10; y = r.y + r.h / 2 - th / 2; }
  }
  x = Math.max(110, Math.min(W - tw - 12, x)); y = Math.max(12, Math.min(H - th - 12, y));
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
  if (r && st.arrow) {
    const below = st.place === 'below';
    arrow.style.display = 'block';
    arrow.className = 'tut-arrow ' + (st.place === 'left' ? 'right' : (below ? 'up' : 'down'));
    if (st.place === 'left') { arrow.style.left = r.x - 36 + 'px'; arrow.style.top = r.y + r.h / 2 - 14 + 'px'; }
    else { arrow.style.left = r.x + r.w / 2 - 14 + 'px'; arrow.style.top = (below ? r.y + r.h + 10 : r.y - 38) + 'px'; }
  } else arrow.style.display = 'none';
}

/** A target step needs its technique selected: restore it if a stray tap cleared it. */
function ensureSel(st) {
  if (!st || !st.needSel || BT.B.side !== 'hero' || BT.B.phase !== 'input' || BT.B.busy) return;
  const [k, i, emp] = st.needSel, h = hero(k), t = h && h.techs[i];
  if (!t) return;
  const g = BT.B.gate; BT.B.gate = null;
  try {
    if ((!BT.B.sel || BT.B.sel.t !== t) && t.cur <= 0) BT.selectTech(h, i);
    if (emp && BT.B.sel && BT.B.sel.t === t && !BT.B.emp) BT.toggleEmpower();
  } finally { BT.B.gate = g; }
}
function show(st) { current = st; hidden = false; ensureSel(st); render(); requestAnimationFrame(render); }
function hide() { hidden = true; el().classList.remove('on'); }

function next() {
  if (!active) return;
  if (current && STEPS.indexOf(current) < 0) { current = null; if (extraQueue.length) return show(extraQueue.shift()); if (idx >= STEPS.length) { passive(); return; } return show(STEPS[idx]); }
  if (current && current.last) { passive(); return; }
  idx++;
  if (idx >= STEPS.length) { passive(); return; }
  const st = STEPS[idx];
  if (st.onTurn && !(BT.B.side === st.onTurn && BT.B.phase === 'input')) { current = st; hide(); return; }
  show(st);
}
/** Tutorial done with its script: let the player play, keep watching for one-off tips. */
function passive() {
  current = null; idx = STEPS.length; hide();
  BT.B.gate = null;
  try { localStorage.setItem('ibc_tut_done', '1'); } catch (e) {}
}
function tut_finish() { passive(); seen.boss = true; }

// ---------------- gate ----------------
function gate(action, payload) {
  if (!active || !current || hidden && !current.free && !current.wait) return true;
  if (current.free) return true;
  if (action === 'click') {
    const e = payload;
    if (e.target.closest('#detail')) return true;          // a details panel can always be closed
    if (!current.wait) return false;                       // reading step: block the board
    const els = (current.allowEls ? current.allowEls() : []).filter(Boolean);
    const ok = els.some(x => x.contains(e.target));
    if (ok) ensureSel(current);
    return ok;
  }
  if (action === 'detail') return false;                   // no detail panels during guided steps
  if (current.allow) return current.allow(action, payload);
  return true;
}

// ---------------- events ----------------
function onEvt(name, data) {
  if (!active) return;
  if (name === 'castStart' && current && !current.free) { if (current.wait) hide(); return; }
  if (name === 'cast' && current) {
    if (current.wait === 'cast') { advanceSoon(); return; }
    if (hidden && BT.B.side === 'hero' && BT.B.phase === 'input' && !current.onTurn) show(current);
    return;
  }
  if (current && current.wait === name) { advanceSoon(); return; }
  if (name === 'turnStart' && data.side === 'hero') {
    if (current && current.onTurn === 'hero') { setTimeout(() => show(current), 200); return; }
    if (extraQueue.length && !current) { setTimeout(() => show(extraQueue.shift()), 200); }
  }
  if (name === 'wave' && data.boss && !seen.boss) {
    seen.boss = true;
    if (idx >= STEPS.length || !current) { const tip = EXTRA.boss; BT.B.gate = gate; if (BT.B.side === 'hero' && BT.B.phase === 'input') setTimeout(() => show(tip), 300); else extraQueue.push(tip); }
    else extraQueue.push(EXTRA.boss);
  }
  if ((name === 'victory' || name === 'defeat')) { hide(); BT.B.gate = null; }
}
function advanceSoon() { hide(); setTimeout(() => next(), 260); }

const tutorial = {
  begin() {
    this.stop();
    active = true; idx = -1; current = null; extraQueue = []; seen = {};
    build();
    BT.B.gate = gate;
    unsub = ['ready', 'selected', 'empower', 'castStart', 'cast', 'turnStart', 'turnEnd', 'shopOpen', 'shopClose', 'encounterDone', 'wave', 'victory', 'defeat']
      .map(n => BT.on(n, d => onEvt(n, d || {})));
    unsub.push(BT.on('ready', () => setTimeout(() => next(), 350)));
  },
  stop() {
    active = false; unsub.forEach(f => f()); unsub = []; current = null; hide();
    if (el()) el().innerHTML = '';
  },
  relayout() { if (active && current && !hidden) render(); },
  get active() { return active; },
  get step() { return active && current && !hidden ? current.id : null; },
};

