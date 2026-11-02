// The app shell: screen router, top bar, dialogs, toasts and the battle host that hands a stage to the engine.
import { BT, ui, tutorial, clock, audio, CYCLE_SVG, LOTUS } from './engine.js';
import { get, iconUrl, faceUrl, num, standUrl, npcUrl } from './data.js';
import { qty, persist, settings } from './state.js';

export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const PH_COLOR = { water: '#7cc6ff', wood: '#86e38f', fire: '#ff8048', earth: '#e4b45a', metal: '#efe6c8', yin: '#b98cff', yang: '#ffd36a' };
export const PH_GLYPH = { water: '水', wood: '木', fire: '火', earth: '土', metal: '金', yin: '阴', yang: '阳' };
export const phTag = p => `<span class="ph-tag" style="--pc:${PH_COLOR[p] || '#ccc'}">${PH_GLYPH[p] || '?'}</span>`;
/** A character speaking in a dialogue: her standing art (upper body, no background) beside the words. */
export const npcSays = (id, html) => {
  const u = standUrl(id) || npcUrl(id);
  return `<div class="npc-say">${u ? `<div class="npc-fig${standUrl(id) ? '' : ' flat'}"><img src="${u}" alt=""></div>` : ''}<div>${html}</div></div>`;
};
export const starStr = n => '★'.repeat(n);
/** A reward chip: icon (or glyph) with its quantity. */
export function rewardChip(r, cls = '') {
  const id = r.cur || r.item || r.hero || r.art || r.id, rec = get(id);
  const icon = r.hero ? faceUrl(r.hero) : iconUrl(id);
  const glyph = r.art ? '宝' : (r.hero ? '花' : '物');
  const n = r.hero ? '' : (r.qty > 1 || r.cur ? num(r.qty) : '');
  return `<div class="rw-i ${cls}" title="${esc(rec?.name || id)}${r.qty > 1 ? ' ×' + r.qty : ''}">${icon ? `<img src="${icon}" alt="">` : `<span class="g">${glyph}</span>`}${n ? `<em>${n}</em>` : ''}</div>`;
}

const SCREENS = {};
export const App = {
  stage: null, root: null, battleEl: null, cur: null, curName: null, params: null, stack: [], busy: false,
  register(name, screen) { SCREENS[name] = screen; },
  boot(stage) {
    this.stage = stage; this.root = stage.querySelector('#app'); this.battleEl = stage.querySelector('#battle');
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

  // ---------------- top bar ----------------
  topbar({ title, cn, back = true, chips = ['cur:spirit_stones', 'cur:immortal_jade', 'cur:fate_incense'], extra = '' } = {}) {
    return `<div class="topbar">
      ${back ? '<button class="tb-back" data-act="back" aria-label="Back">‹</button>' : ''}
      ${title ? `<div class="tb-title"><b>${esc(title)}</b>${cn ? `<small>${esc(cn)}</small>` : ''}</div>` : ''}
      <div class="tb-sp"></div>${extra}
      ${chips.map(c => `<div class="chip" data-chip="${c}" title="${esc(get(c)?.name)}"><img src="${iconUrl(c)}" alt=""><b>${num(qty(c))}</b></div>`).join('')}
    </div>`;
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
    const items = granted.map(g => {
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
    const res = await BT.startBattle(def);
    tutorial.stop();
    settings().speed = clock.speed; settings().muted = audio.muted; persist();
    this.battleEl.classList.remove('on');
    this.root.classList.remove('hidden');
    return res;
  },
};
