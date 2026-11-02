// Board: card DOM, slot layout, and a per-card motion model (offset tweens + shake + knockback + flash)
// driven by the game clock, so impact frames and the x2 speed toggle apply to cards as well as VFX.

const CARD = { w: 206, h: 309, gap: 18 };
const geo = { W: 1600, H: 720, x0: 0, enemyY: 26, heroY: 385 };
const tweens = [];
function clearTweens() { tweens.length = 0; }

function layoutBoard(W, H) {
  geo.W = W; geo.H = H;
  const rowW = 4 * CARD.w + 3 * CARD.gap;
  geo.x0 = Math.round((W - rowW) / 2);
  geo.enemyY = 24; geo.heroY = H - 24 - CARD.h;
}
/** Rect of a unit's card in stage coordinates. Enemy rows are centred whatever their size. */
function slotRect(u) {
  const step = CARD.w + CARD.gap;
  if (u.side === 'hero') return { x: geo.x0 + u.slot * step, y: geo.heroY, w: CARD.w, h: CARD.h };
  const x = geo.x0 + (u.slotX ?? u.slot) * step;
  return { x, y: geo.enemyY, w: u.wide ? CARD.w * 2 + CARD.gap : CARD.w, h: CARD.h };
}
function center(u, fy = 0.5) {
  const r = slotRect(u), m = u.m || {};
  return { x: r.x + r.w / 2 + (m.x || 0), y: r.y + r.h * fy + (m.y || 0) };
}

// ---------------- card DOM ----------------
const techIcon = (t) => t.icon.startsWith('g:')
  ? `<span class="glyph">${t.icon.slice(2)}</span>`
  : `<img src="assets/ui/${t.icon}.webp" alt="" draggable="false">`;

function createCard(u, parent) {
  const ph = PHASES[u.phase];
  const el = document.createElement('div');
  el.className = `card ${u.side}${u.wide ? ' wide' : ''}${u.boss ? ' boss' : ''}`;
  el.dataset.uid = u.uid;
  el.style.setProperty('--ph', ph.color);
  const r = slotRect(u);
  Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
  el.innerHTML = `
    <div class="c-body">
      <div class="c-face">
        <div class="c-art"><img src="assets/cards/${u.art}.webp" alt="" draggable="false" style="animation-delay:${-rand(0, 6).toFixed(2)}s"></div>
        <div class="c-shade"></div>
        <div class="c-foil" style="animation-delay:${-rand(0, 8).toFixed(2)}s"></div>
        <div class="c-frame"></div>
        <div class="c-head">
          <div class="c-phase" title="${ph.name}">${ph.glyph}</div>
          <div class="c-name">${u.name}</div>
          <div class="c-lvl">${u.lvl}</div>
        </div>
        <div class="c-status"></div>
        <div class="c-slots">${u.side === 'hero' ? '<i></i><i></i>' : ''}</div>
        ${u.boss ? '<div class="c-tele"></div>' : ''}
        <div class="c-techs">${u.techs.map((t, i) => `
          <button class="tech${t.ult ? ' ult' : ''}" data-i="${i}" aria-label="${t.name}">
            ${techIcon(t)}
            <svg viewBox="0 0 60 60"><circle class="trk" cx="30" cy="30" r="27"/><circle class="arc" cx="30" cy="30" r="27"/></svg>
            <b></b>
          </button>`).join('')}
        </div>
        ${u.qiShield ? `<div class="c-qi">${'<i></i>'.repeat(u.qiShield.max)}</div>` : ''}
        <div class="c-hp"><i class="lag"></i><i class="fill"></i><i class="bar-sh"></i><span></span></div>
        <div class="c-adv"></div>
        <div class="c-crack"><span>殒</span><b>Fallen</b></div>
        <div class="c-flash"></div>
      </div>
      <div class="c-back"><span>蓮</span></div>
    </div>`;
  parent.appendChild(el);
  u.el = el; u.body = el.querySelector('.c-body');
  u.m = { x: 0, y: 0, s: 1, r: 0, rx: 0, ry: 0, o: 1, flash: 0, shake: 0, kx: 0, ky: 0, glow: 0 };
  u.hpShown = u.hp; u.hpLag = u.hp;
  refreshCard(u, true);
  return el;
}

function placeCard(u) {
  const r = slotRect(u);
  Object.assign(u.el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
}

const CIRC = 2 * Math.PI * 27;
/** Sync a card's DOM with its unit state (HP text, techniques, statuses, shields, slots). */
function refreshCard(u, first = false) {
  const el = u.el; if (!el) return;
  el.querySelector('.c-hp span').textContent = `${Math.max(0, Math.ceil(u.hp)).toLocaleString('en-US')}${u.barrier > 0 ? ` +${Math.ceil(u.barrier).toLocaleString('en-US')}` : ''}`;
  el.querySelectorAll('.tech').forEach((b, i) => {
    const t = u.techs[i], ready = t.cur <= 0;
    b.classList.toggle('ready', ready);
    b.classList.toggle('blocked', !!t.blocked);
    b.querySelector('b').textContent = ready ? '' : t.cur;
    const frac = ready ? 1 : 1 - t.cur / t.cd;
    const arc = b.querySelector('.arc');
    arc.style.strokeDasharray = `${CIRC * frac} ${CIRC}`;
  });
  // statuses
  const st = el.querySelector('.c-status');
  st.innerHTML = u.status.map(s => { const d = STATUS[s.id]; return `<i class="${d.debuff ? 'debuff' : 'buff'}" style="--sc:${d.color}" title="${d.name}">${d.glyph}${s.turns > 0 && s.id !== 'shield' ? `<em>${s.turns}</em>` : ''}</i>`; }).join('');
  if (u.qiShield) el.querySelectorAll('.c-qi i').forEach((s, i) => s.classList.toggle('on', i < u.qiShield.cur));
  if (u.side === 'hero') el.querySelectorAll('.c-slots i').forEach((s, i) => {
    const a = u.attached[i]; s.className = a ? `r${a.rarity}` : ''; s.textContent = a ? a.glyph : ''; s.title = a ? a.name : 'Empty encounter slot';
  });
  if (u.boss) {
    const t = u.techs.find(x => x.tele), tl = el.querySelector('.c-tele');
    const when = t.cur <= 0 ? (geo.side === 'enemy' ? 'NOW' : 'NEXT TURN') : (t.cur === 1 ? 'NEXT TURN' : `in ${t.cur} turns`);
    tl.innerHTML = `<span class="g">${t.icon.slice(2)}</span><span><small>${t.name}</small><b>${when}</b></span>`;
    tl.classList.toggle('hot', t.cur <= 1);
  }
  el.classList.toggle('dead', !u.alive);
  el.classList.toggle('skip', !!u.skip && u.alive);
  if (first) { u.hpShown = u.hp; u.hpLag = u.hp; }
}

// ---------------- motion ----------------
/** Tween numeric fields of a card's motion state. Resolves on the game clock. */
function tweenCard(u, to, dur, e = ease.outCubic) {
  const m = u.m, from = {};
  for (const k in to) from[k] = m[k];
  return new Promise(res => tweens.push({ m, from, to, t0: clock.t, dur: Math.max(1, dur), e, res }));
}
function hitCard(u, { power = 1, dir = -1, color = '#ffffff' } = {}) {
  const m = u.m; if (!m) return;
  m.flash = Math.min(1, 0.55 + 0.35 * power); m.flashColor = color;
  m.shake = Math.max(m.shake, 6 * power);
  m.ky += dir * 16 * power; m.kx += rand(-6, 6) * power;
  m.kr = (m.kr || 0) + rand(-3, 3) * power;
}
async function lift(u, on = true, dur = 160) {
  u.el.classList.toggle('acting', on);
  return tweenCard(u, on ? { s: 1.07, y: u.side === 'hero' ? -16 : 16 } : { s: 1, y: 0 }, dur, ease.outCubic);
}
/** Lunge a fraction of the way toward a target card and come back. */
async function lunge(u, target, k = 0.32, dur = 170, hold = 60) {
  const a = center(u), b = center(target);
  const dx = (b.x - a.x) * k, dy = (b.y - a.y) * k;
  await tweenCard(u, { x: dx, y: dy, r: clamp(dx * 0.02, -6, 6), s: 1.1 }, dur, ease.inCubic);
  return async () => { await wait(hold); await tweenCard(u, { x: 0, y: u.side === 'hero' ? -16 : 16, r: 0, s: 1.07 }, 240, ease.outCubic); };
}

function updateBoard(dt, units) {
  const t = clock.t;
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i], k = clamp((t - tw.t0) / tw.dur, 0, 1), v = tw.e(k);
    for (const key in tw.to) tw.m[key] = lerp(tw.from[key], tw.to[key], v);
    if (k >= 1) { tweens.splice(i, 1); tw.res(); }
  }
  const dts = dt / 1000;
  for (const u of units) {
    const m = u.m; if (!m || !u.el) continue;
    if (m.flash > 0) m.flash = Math.max(0, m.flash - dt / 220);
    if (m.shake > 0) m.shake = Math.max(0, m.shake - dt / 26);
    const damp = Math.pow(0.0004, dts * 2.2);
    m.kx *= damp; m.ky *= damp; m.kr = (m.kr || 0) * damp;
    const sx = m.shake ? rand(-m.shake, m.shake) : 0, sy = m.shake ? rand(-m.shake, m.shake) * 0.6 : 0;
    const tx = m.x + m.kx + sx, ty = m.y + m.ky + sy;
    u.body.style.transform = `translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,0) rotate(${(m.r + m.kr).toFixed(2)}deg) scale(${m.s.toFixed(3)}) rotateX(${m.rx.toFixed(1)}deg) rotateY(${m.ry.toFixed(1)}deg)`;
    if (m.o !== 1 || u._o !== m.o) { u.body.style.opacity = m.o; u._o = m.o; }
    const ry = ((m.ry % 360) + 360) % 360, back = ry > 90 && ry < 270;
    if (back !== !!u._back) { u.el.classList.toggle('show-back', back); u._back = back; }
    const fl = u.el.querySelector('.c-flash');
    if (m.flash > 0.01 || u._fl) { fl.style.opacity = m.flash.toFixed(3); if (m.flashColor) fl.style.background = m.flashColor; u._fl = m.flash > 0.01; }
    // health bar easing
    u.hpShown += (u.hp - u.hpShown) * Math.min(1, dt / 90);
    u.hpLag += (u.hpShown - u.hpLag) * Math.min(1, dt / 600);
    const hp = u.el.querySelector('.c-hp');
    const pct = clamp(u.hpShown / u.maxHp, 0, 1), lag = clamp(u.hpLag / u.maxHp, 0, 1), sh = clamp((u.barrier || 0) / u.maxHp, 0, 1);
    hp.children[0].style.width = (lag * 100).toFixed(2) + '%';
    hp.children[1].style.width = (pct * 100).toFixed(2) + '%';
    hp.children[2].style.width = (sh * 100).toFixed(2) + '%';
  }
}

/** Gentle tilt toward the pointer while it hovers or presses a card (living-card feel). */
function bindTilt(stageEl, getUnit) {
  let cur = null;
  stageEl.addEventListener('pointermove', e => {
    const c = e.target.closest('.card'); const u = c && getUnit(c.dataset.uid);
    if (cur && cur !== u) { cur.m.rx = 0; cur.m.ry = 0; cur = null; }
    if (!u || !u.alive || u.el.classList.contains('acting')) return;
    const r = c.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    u.m.ry = px * 10; u.m.rx = -py * 10; cur = u;
    c.style.setProperty('--mx', ((px + 0.5) * 100).toFixed(1) + '%'); c.style.setProperty('--my', ((py + 0.5) * 100).toFixed(1) + '%');
  });
  stageEl.addEventListener('pointerleave', () => { if (cur) { cur.m.rx = 0; cur.m.ry = 0; cur = null; } });
}

/** Deal-in animation: card flies in from off-board, spinning from its back to its face. */
async function dealIn(u, delay = 0, fromTop = true) {
  const m = u.m;
  Object.assign(m, { y: fromTop ? -420 : 420, x: rand(-60, 60), r: rand(-25, 25), s: 0.6, o: 0, ry: 180 });
  u.el.classList.add('flipping');
  await wait(delay);
  m.o = 1;
  await tweenCard(u, { y: 0, x: 0, r: 0, s: 1, ry: 0 }, 520, ease.outBack);
  u.el.classList.remove('flipping');
}

