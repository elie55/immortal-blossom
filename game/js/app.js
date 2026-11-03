// The app shell: screen router, top bar, dialogs, toasts and the battle host that hands a stage to the engine.
import { BT, ui, tutorial, clock, audio, CYCLE_SVG, LOTUS } from './engine.js';
import { get, iconUrl, faceUrl, num, standUrl, npcUrl, hasArt, keyOf } from './data.js';
import { pieceName, pieceIcon, rarityColor, ROMAN, tierOrder } from './gear.js';
import { qty, persist, settings } from './state.js';

export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const PH_COLOR = { water: '#7cc6ff', wood: '#86e38f', fire: '#ff8048', earth: '#e4b45a', metal: '#efe6c8', yin: '#b98cff', yang: '#ffd36a' };
export const PH_GLYPH = { water: '水', wood: '木', fire: '火', earth: '土', metal: '金', yin: '阴', yang: '阳' };
export const phTag = p => `<span class="ph-tag" data-tip="phase:${p}" style="--pc:${PH_COLOR[p] || '#ccc'}">${PH_GLYPH[p] || '?'}</span>`;
// What a tooltip shows for things that are not records (a salvaged piece, an artefact reward, a drop's gear odds): kept
// here under a key that goes in data-tip (tips.js reads it back); the oldest go once there are a few hundred.
const TIP_OBJ = new Map(); let tipSeq = 0;
export function tipObject(o) { const k = `obj:${++tipSeq}`; TIP_OBJ.set(k, o); if (TIP_OBJ.size > 400) TIP_OBJ.delete(TIP_OBJ.keys().next().value); return k; }
export const tipObjectOf = k => TIP_OBJ.get(k);
/** A character speaking in a dialogue: her standing art (upper body, no background) beside the words. */
export const npcSays = (id, html) => {
  const u = standUrl(id) || npcUrl(id) || (id.startsWith('hero:') ? faceUrl(id) : null);
  return `<div class="npc-say">${u ? `<div class="npc-fig${standUrl(id) ? '' : ' flat'}"><img src="${u}" alt=""></div>` : ''}<div>${html}</div></div>`;
};
export const starStr = n => '★'.repeat(n);
/** 1,234 · 12.3k · 320k · 1.2M: short numbers for small chips. */
export const compact = n => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : String(Math.round(n)));
// ---------------- gear tiles ----------------
const SLOT_GLYPH = { 'slot:weapon': '剑', 'slot:helmet': '冠', 'slot:body': '袍', 'slot:gloves': '腕', 'slot:pants': '裤', 'slot:boots': '靴', 'slot:ring': '戒', 'slot:pendant': '佩', 'slot:artefact': '宝' };
export const SET_COLOR = { 'set:sword_heart': '#cfe3ff', 'set:azure_dragon': '#4fd1c5', 'set:white_tiger': '#f2f2f2', 'set:vermilion_bird': '#ff6a4a', 'set:qilin': '#ffd36a', 'set:black_tortoise': '#8fa6c8', 'set:heavenly_eye': '#c58bff', 'set:still_water': '#7cc6ff', 'set:blood_lotus': '#ff5a7a', 'set:five_elements': '#9be36e' };
export const slotGlyph = slot => SLOT_GLYPH[slot] || '器';
export const pieceIconUrl = p => (hasArt(`icons/${pieceIcon(p)}.webp`) ? `assets/icons/${pieceIcon(p)}.webp` : null);
/** A piece of gear as a tile: rarity frame, icon, tier, refining, set badge; opts: { sel, cls, face } */
export function gearTile(p, opts = {}) {
  const icon = pieceIconUrl(p), col = rarityColor(p.rarity);
  const set = p.set ? get(p.set) : null;
  const tip = p.id ? `gear:${p.id}` : tipObject({ piece: p, salvaged: opts.salvaged || null });
  return `<div class="gt rar-${keyOf(p.rarity)} ${opts.cls || ''}${opts.sel ? ' sel' : ''}${p.lock ? ' locked' : ''}" ${p.id ? `data-pid="${p.id}"` : ''} data-tip="${tip}" style="--rc:${col}" aria-label="${esc(get(p.rarity)?.name)} ${esc(pieceName(p))}">
    ${icon ? `<img src="${icon}" alt="">` : `<span class="g">${slotGlyph(p.slot)}</span>`}
    ${p.kind !== 'art' ? `<i class="tr">${ROMAN[tierOrder(p.tier)]}</i>` : ''}${p.plus ? `<b class="pl">+${p.plus}</b>` : ''}
    ${set ? `<span class="sg" style="--sc:${SET_COLOR[p.set] || '#ccc'}">${esc(set.cn[0])}</span>` : ''}
    ${p.lock ? '<span class="lk">锁</span>' : ''}${opts.face && p.hero && faceUrl(p.hero) ? `<img class="eqf" src="${faceUrl(p.hero)}" alt="">` : ''}${opts.isNew && p.new ? '<span class="nw"></span>' : ''}
  </div>`;
}
/** Add up a reward list: one entry per currency or item; gear pieces and heroines stay separate. */
export function mergeRewards(list) {
  const out = [], idx = {};
  for (const r of list) {
    const k = !r.gear && !r.hero && !r.art && (r.cur || r.item);
    if (k && !r.salvaged) { if (idx[k] != null) { out[idx[k]] = { ...out[idx[k]], qty: out[idx[k]].qty + r.qty }; continue; } idx[k] = out.length; }
    out.push({ ...r });
  }
  return out;
}
/** A reward chip: icon (or glyph) with its quantity. Gear pieces show as tiles. */
export function rewardChip(r, cls = '') {
  if (r.gear) return gearTile(r.gear, { cls: `rw-g ${cls}${r.salvaged ? ' salv' : ''}`, salvaged: r.salvaged });
  if (r.art) return gearTile({ kind: 'art', slot: 'slot:artefact', art: r.art, rarity: r.rarity || 'rarity:rare', plus: 0 }, { cls: `rw-g ${cls}` });
  if (r.gearOdds) { // a drop table's gear: the best rarity it can roll, its tier, and the odds on hover
    const g = r.gearOdds, best = Object.keys(g.rarityOdds).sort((a, b) => get(b).order - get(a).order)[0];
    return `<div class="gt rw-g rar-${keyOf(best)} ${cls}" style="--rc:${rarityColor(best)}" data-tip="${tipObject({ odds: g, chance: r.chance })}" aria-label="Gear, tier ${ROMAN[tierOrder(g.tier)]}"><span class="g">器</span><i class="tr">${ROMAN[tierOrder(g.tier)]}</i></div>`;
  }
  const id = r.cur || r.item || r.hero || r.art || r.id, rec = get(id);
  const icon = r.hero ? faceUrl(r.hero) : iconUrl(id);
  const glyph = r.art ? '宝' : (r.hero ? '花' : '物');
  const n = r.hero ? '' : (r.qty > 1 || r.cur ? num(r.qty) : '');
  return `<div class="rw-i ${cls}" data-tip="${esc(id)}" aria-label="${esc(rec?.name || id)}${r.qty > 1 ? ' ×' + r.qty : ''}">${icon ? `<img src="${icon}" alt="">` : `<span class="g">${glyph}</span>`}${n ? `<em>${n}</em>` : ''}</div>`;
}

const SCREENS = {};
export const App = {
  stage: null, root: null, battleEl: null, cur: null, curName: null, params: null, stack: [], busy: false,
  register(name, screen) { SCREENS[name] = screen; },
  boot(stage) {
    this.stage = stage; this.root = stage.querySelector('#app'); this.battleEl = stage.querySelector('#battle');
    // the chrome's own buttons (settings, the bottom bar, the profile plate) work on every screen
    this.root.addEventListener('click', e => {
      const g = e.target.closest('[data-gact]'); if (!g) return;
      if (g.dataset.gact === 'settings') this.openSettings();
      if (g.dataset.gact === 'nav') this.navGo(g.dataset.to);
    });
    ui.onRetreat = () => this.confirm('Retreat?', 'Leave the battle now. It counts as a defeat and costs nothing.', 'Retreat').then(ok => ok && BT.forfeit());
    ui.onHelp = () => this.rulesDialog();
  },
  /** Show a screen. opts.replace keeps it off the back stack. */
  go(name, params = {}, opts = {}) {
    if (this.cur && this.curName && !opts.replace && !opts.root) this.stack.push({ name: this.curName, params: this.params });
    if (opts.root) this.stack = [];
    if (this.cur?.leave) this.cur.leave();
    this.curName = name; this.params = params; this.cur = SCREENS[name];
    this.root.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'scr ' + (this.cur.cls || name);
    this.root.appendChild(el);
    this.cur.render(el, params);
    return el;
  },
  back() {
    const prev = this.stack.pop();
    if (prev) { const cur = this.curName; this.curName = null; this.cur = null; void cur; this.go(prev.name, prev.params, { replace: true }); }
    else this.go('hall', {}, { root: true });
  },
  refresh() { if (this.curName) this.go(this.curName, this.params, { replace: true }); },
  /** The Android back button: close the open dialog, offer to retreat from a battle, go back a screen, or (on the
   *  Pavilion Hall and the title) put the game in the background instead of quitting it. */
  hardwareBack() {
    if (this.closeTip && this.closeTip()) return true;
    const dlg = [...this.stage.querySelectorAll('.dlg-wrap')].pop();
    if (dlg) { dlg.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; }
    if (this.battleEl.classList.contains('on')) { if (!BT.B.over && ui.onRetreat) ui.onRetreat(); return true; }
    if (this.root.querySelector('[data-act="back"]')) { this.back(); return true; }
    return false;
  },

  // ---------------- top bar, title plates, bottom navigation ----------------
  // Hooks the screens fill in (hall.js): the profile plate's data, the bottom bar's locks and alerts, the settings.
  profile: () => ({ face: '', name: 'Pavilion Master', lv: 1, pct: 0, line: '' }),
  navState: () => ({ locked: {}, dots: {} }),
  openSettings: () => {},
  /** The top of a screen. A root screen (reached from the bottom bar, back: false) shows the profile plate and its title
   *  plate below it; any other screen shows a round back button and its title plate. Resource chips and the settings
   *  button sit on the right. */
  topbar({ title, cn, back = true, chips = ['cur:spirit_stones', 'cur:immortal_jade', 'cur:fate_incense'], extra = '', icon = '' } = {}) {
    const plate = title ? this.titlePlate(title, icon, cn) : '';
    return `<div class="topbar${back ? '' : ' root'}">
      <div class="tb-left">${back ? `<button class="tb-back" data-act="back" aria-label="Back"><i></i></button>${plate}` : this.profilePlate()}</div>
      <div class="tb-sp"></div>${extra}
      <div class="tb-res">${chips.map(c => `<div class="chip" data-chip="${c}" data-tip="${c}" aria-label="${esc(get(c)?.name)}"><img src="${iconUrl(c)}" alt=""><b>${num(qty(c))}</b></div>`).join('')}</div>
      <button class="tb-round" data-gact="settings" aria-label="Settings"><img src="assets/ui/hall_settings.webp" alt=""></button>
    </div>${!back && plate ? `<div class="tb-under">${plate}</div>` : ''}`;
  },
  /** A teal title plate with a gold dragon at its left end (after the mockups' screen titles). */
  titlePlate(title, icon = '', cn = '') {
    return `<div class="tb-title" title="${esc(cn)}">${icon ? `<img src="${icon}" alt="">` : ''}<b>${esc(title)}</b></div>`;
  },
  profilePlate() {
    const p = this.profile();
    return `<div class="pf" data-gact="nav" data-to="heroines" aria-label="${esc(p.name)}">
      <div class="pf-av"><div class="pf-img" style="background-image:url(${p.face})"></div><b class="pf-lv">${p.lv}</b></div>
      <div class="pf-plate"><b>${esc(p.name)}</b><div class="pf-bar"><i style="width:${Math.round(p.pct * 100)}%"></i></div><small>${esc(p.line)}</small></div>
    </div>`;
  },
  /** The bottom bar of the main screens; `active` is the screen it marks. */
  nav(active) {
    const st = this.navState(), ic = (k, fb) => `assets/ui/${hasArt(`ui/${k}.webp`) ? k : fb}.webp`;
    const items = [['hall', 'Pavilion', ic('ic_home', 'hall_journey')], ['pond', 'Fate Pond', ic('ic_summon', 'hall_pond')], ['heroines', 'Heroines', 'assets/ui/hall_heroines.webp'],
      ['team', 'Team', ic('ic_team', 'tab_gear')], ['sect', 'The Sect', 'assets/ui/hall_sect.webp'], ['market', 'Market', 'assets/ui/hall_market.webp']];
    return `<nav class="bnav">${items.map(([k, label, src]) => `<button class="bn${k === active ? ' on' : ''}${st.locked[k] ? ' locked' : ''}" data-gact="nav" data-to="${k}">
      <img src="${src}" alt=""><span>${label}</span>${st.dots[k] ? '<i class="dot">!</i>' : ''}</button>`).join('')}</nav>`;
  },
  /** Where the bottom bar's buttons lead (screens may refuse with a toast while locked). */
  navGo(to) {
    const st = this.navState();
    if (st.locked[to]) { this.toast(st.locked[to]); return; }
    if (to === this.curName && !(to === 'formation')) return;
    if (to === 'team') { this.go('formation', { team: true }, { root: true }); return; }
    this.go(to, {}, { root: true });
  },
  bumpChips() {
    this.root.querySelectorAll('[data-chip]').forEach(ch => { const b = ch.querySelector('b'); const v = num(qty(ch.dataset.chip)); if (b.textContent !== v) { b.textContent = v; ch.classList.remove('bump'); void ch.offsetWidth; ch.classList.add('bump'); } });
  },
  /** Wire [data-act] buttons in a screen to handlers; "back" is built in. */
  bind(el, handlers = {}) {
    el.addEventListener('click', e => {
      const t = e.target.closest('[data-act]'); if (!t || !el.contains(t)) return;
      const act = t.dataset.act;
      if (act === 'back') { this.back(); return; }
      if (handlers[act]) handlers[act](t, e);
    });
  },

  // ---------------- toasts and dialogs ----------------
  toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = msg; this.stage.appendChild(t); setTimeout(() => t.remove(), 2700); },
  /** A modal dialog. buttons: [{ label, cls, value }]. Resolves with the chosen value (or null when dismissed). */
  dialog({ title, cn, body = '', buttons = [{ label: 'Close', cls: 'ink', value: null }], dismiss = true, onOpen } = {}) {
    return new Promise(res => {
      const w = document.createElement('div'); w.className = 'dlg-wrap';
      w.innerHTML = `<div class="dlg panel">${title ? `<h2>${esc(title)}</h2>` : ''}${cn ? `<div class="cnh">${esc(cn)}</div>` : ''}<div class="dlg-body">${body}</div>
        <div class="dlg-btns">${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}">${b.label}</button>`).join('')}</div></div>`;
      const close = v => { w.remove(); res(v); };
      w.addEventListener('click', e => {
        const b = e.target.closest('.dlg-btns [data-i]');
        if (b) { const bt = buttons[+b.dataset.i]; if (bt.keep) { bt.onClick && bt.onClick(w); return; } close(bt.value); return; }
        if (e.target === w && dismiss) close(null);
      });
      this.stage.appendChild(w);
      onOpen && onOpen(w, close);
    });
  },
  confirm(title, body, yes = 'Confirm') { return this.dialog({ title, body: `<p>${body}</p>`, buttons: [{ label: 'Cancel', cls: 'ink', value: false }, { label: yes, value: true }] }).then(v => !!v); },
  /** Show what a reward list granted. */
  rewardsDialog(granted, title = 'Rewards', cn = '奖励') {
    if (!granted || !granted.length) return Promise.resolve();
    const items = mergeRewards(granted).map(g => {
      if (g.hero && g.isNew) return rewardChip({ hero: g.hero }, 'first');
      if (g.hero && g.petal) return rewardChip({ hero: g.hero }) ;
      if (g.hero && g.dew) return rewardChip({ cur: 'cur:blossom_dew', qty: g.dew });
      return rewardChip(g);
    }).join('');
    const notes = granted.filter(g => g.hero).map(g => `<p>${esc(get(g.hero).name)} ${g.isNew ? 'joins the Pavilion!' : g.petal ? `opens Dao Blossom petal ${g.petal}.` : `becomes ${g.dew} Blossom Dew.`}</p>`).join('');
    return this.dialog({ title, cn, body: `<div class="got">${items}</div>${notes}`, buttons: [{ label: 'Collect', value: true }] }).then(() => this.bumpChips());
  },
  rulesDialog() {
    return this.dialog({
      title: 'How battles work', cn: '五行', body: `<div style="display:flex;gap:20px;align-items:center"><div style="width:250px;flex:none">${CYCLE_SVG}</div><div>
        <p><b class="gold">Turns.</b> On your turn, cast every ready technique, in any order. A number in a ring counts the turns until it is ready again.</p>
        <p><b class="gold">Five Phases.</b> Hitting a phase you overcome deals +30% damage. Casting in feeding order builds a <b>Harmony</b> chain (+15% per link, ×4 gives 2 Spirit Qi). The same phase from another card builds <b>Kindred Qi</b> (+10% per repeat).</p>
        <p><b class="gold">Spirit Qi</b> ${LOTUS.replace('<svg', '<svg style="width:18px;height:18px;vertical-align:-3px;color:#e8c77d"')} pays to <b>Empower</b> a technique and for <b>Fortuitous Encounters</b> on even rounds.</p>
        <p><b class="gold">Twin Blooms.</b> Some pairs of heroines have combos: Formation lists the ones your team has.</p></div></div>`,
    });
  },

  // ---------------- battle host ----------------
  /** Hand a battle definition to the engine; resolves with its result. */
  async runBattle(def) {
    this.root.classList.add('hidden');
    this.battleEl.classList.add('on');
    clock.speed = settings().speed || 1; document.documentElement.style.setProperty('--spd', clock.speed);
    audio.muted = !!settings().muted;
    clock.timers.length = 0; clock.hitstop = 0; clock.slowUntil = 0;
    BT.B.endTurnResolve = null; BT.B.gate = null;
    tutorial.stop();
    if (def.tutorial) tutorial.begin();
    if (def.auto) { const off = BT.on('turnStart', () => { off(); BT.setAuto(true); }); }
    const res = await BT.startBattle(def);
    tutorial.stop();
    settings().speed = clock.speed; settings().muted = audio.muted; persist();
    this.battleEl.classList.remove('on');
    this.root.classList.remove('hidden');
    return res;
  },
};
