// Story scenes (standing figures with no background, auto, log and skip) and the flow that strings the slice together:
// stage by stage through chapter 1, from the dream battle to the Wraith Captain.
import { App, npcSays, esc, PH_GLYPH } from './app.js';
import { get, cardUrl, npcUrl, standUrl, locBg, phaseOf, stageBattle, iconUrl, num } from './data.js';
import { flags, data, persist, clearStage, grant, isCleared, pay } from './state.js';

const MISSION_TEXT = {
  clear: () => 'Clear the stage', no_fall: () => 'No heroine falls', harmony_or_kindred: () => 'Make a Harmony chain or Kindred Qi',
  defeat_in_one_cast: m => `Defeat ${m.count || 2} enemies with one technique`, no_encounters: () => 'Buy no Fortuitous Encounter',
  within_turns: m => `Win within ${m.turns} rounds`, empower_times: m => `Empower ${m.times} techniques`, shatter_times: m => `Shatter a Qi shield ${m.times} times`,
};
export const missionText = m => (MISSION_TEXT[m.kind] || (() => m.kind))(m);
export function missionDone(m, res) {
  const L = res.log || {};
  switch (m.kind) {
    case 'clear': return !!res.win;
    case 'no_fall': return res.win && (L.falls || 0) === 0;
    case 'harmony_or_kindred': return res.win && ((L.harmony || 0) >= 2 || (L.kindred || 0) >= 1);
    case 'defeat_in_one_cast': return res.win && (L.maxKills || 0) >= (m.count || 2);
    case 'no_encounters': return res.win && (L.encounters || 0) === 0;
    case 'within_turns': return res.win && res.rounds <= m.turns;
    case 'empower_times': return res.win && (L.empowers || 0) >= m.times;
    case 'shatter_times': return res.win && (L.shatters || 0) >= m.times;
    default: return !!res.win;
  }
}

// ---------------- the scene player ----------------
export const Scene = {
  /** Play a scene; resolves when it ends or is skipped. */
  play(sceneId, opts = {}) {
    const sc = get(sceneId);
    if (!sc) return Promise.resolve();
    return new Promise(resolve => App.go('scene', { sc, resolve, title: opts.title }, { replace: true }));
  },
};
/** The move a standing figure makes for a line's expression (none for calm ones). */
const EMOTE = { laugh: 'em-hop', surprised: 'em-jolt', angry: 'em-shake', determined: 'em-lean', sad: 'em-sink', worried: 'em-sink', shy: 'em-sway' };
function speakerInfo(id) {
  if (!id) return null;
  const r = get(id); if (!r) return null;
  if (id === 'npc:pavilion_master') return { id, name: 'You', cn: '阁主', you: true };
  const stand = standUrl(id);
  if (id.startsWith('hero:')) return { id, name: r.name, cn: r.cn, stand, img: stand || cardUrl(id), kind: 'hero', phase: phaseOf(r.phase) };
  if (id === 'npc:tao_yao') return { id, name: r.name, cn: '桃夭', stand, img: stand || npcUrl(id), kind: 'hero' };
  return { id, name: r.name, cn: r.cn || '', stand, img: stand || npcUrl(id), kind: 'npc' };
}
App.register('scene', {
  cls: 'scene',
  render(el, { sc, resolve, title }) {
    const lines = sc.lines || [];
    let i = -1, typing = null, auto = false, autoT = null, done = false;
    const loc = get(sc.location);
    el.innerHTML = `<div class="scr-bg" style="background-image:url(${locBg(sc.location)})"></div><div class="scr-shade"></div>
      <div class="sc-stage"></div>
      <div class="sc-ctl"><button data-act="auto">Auto</button><button data-act="log">Log</button><button data-act="skip">Skip</button></div>
      <div class="sc-box panel"><div class="sc-name" style="display:none"></div><div class="sc-text"></div><div class="sc-next">▼</div></div>
      ${title !== false ? `<div class="sc-title"><div><b>${esc(loc?.cn || '')}</b></div><small>${esc(title || sc.name)}</small></div>` : ''}`;
    const txt = el.querySelector('.sc-text'), nm = el.querySelector('.sc-name');
    const stageEl = el.querySelector('.sc-stage');
    // start loading the cast's art while the title shows
    for (const id of sc.cast || []) { const u = speakerInfo(id)?.img; if (u) new Image().src = u; }
    // Two places on stage, left and right. Heroines and Tao Yao enter on the left, other characters on the right;
    // a newcomer takes the free side, or the side of whoever spoke longest ago.
    const slots = { l: null, r: null };
    let tick = 0;
    const finish = () => { if (done) return; done = true; clearTimeout(autoT); clearInterval(typing); resolve(); };
    const place = (sp, expression) => {
      for (const k of ['l', 'r']) if (slots[k]) slots[k].el.classList.remove('speak');
      if (!sp || sp.you || !sp.img) { for (const k of ['l', 'r']) if (slots[k]) slots[k].el.classList.add('dim'); return null; }
      let k = ['l', 'r'].find(x => slots[x]?.id === sp.id);
      if (!k) {
        const pref = sp.kind === 'npc' ? 'r' : 'l', other = pref === 'l' ? 'r' : 'l';
        k = !slots[pref] ? pref : (!slots[other] ? other : (slots[pref].at <= slots[other].at ? pref : other));
        if (slots[k]) { const old = slots[k].el; old.classList.add('out'); setTimeout(() => old.remove(), 420); }
        // figure (place, light) > emote (one-shot moves) > image (breathing)
        const fig = document.createElement('div');
        fig.className = `sc-ch ${k} enter${sp.stand ? '' : ' flat'}`;
        fig.innerHTML = `<div class="sc-em"><img alt="" src="${sp.img}"></div>`;
        stageEl.appendChild(fig);
        const im = fig.querySelector('img');
        (im.decode ? im.decode() : Promise.resolve()).catch(() => {}).then(() => requestAnimationFrame(() => fig.classList.remove('enter')));
        slots[k] = { id: sp.id, el: fig, at: 0 };
      }
      const fig = slots[k].el;
      slots[k].at = ++tick;
      fig.classList.remove('dim'); fig.classList.add('speak');
      const o = k === 'l' ? 'r' : 'l'; if (slots[o]) slots[o].el.classList.add('dim');
      // a small move for the line's mood
      const em = fig.querySelector('.sc-em'), mv = EMOTE[expression];
      em.className = 'sc-em';
      if (mv) { void em.offsetWidth; em.classList.add(mv); }
      return k;
    };
    const step = () => {
      clearTimeout(autoT);
      if (typing) { clearInterval(typing); typing = null; txt.textContent = lines[i].text; armAuto(); return; }
      i++;
      if (i >= lines.length) { finish(); return; }
      const ln = lines[i], sp = speakerInfo(ln.speaker);
      if (sp) { nm.style.display = ''; nm.innerHTML = `<b>${esc(sp.name)}</b>${sp.phase ? `<span>${PH_GLYPH[sp.phase]}</span>` : (sp.cn ? `<span>${esc(sp.cn)}</span>` : '')}`; }
      else nm.style.display = 'none';
      txt.className = 'sc-text' + (sp ? '' : ' narr');
      nm.classList.toggle('r', place(sp, ln.expression) === 'r'); // the name plate sits on the speaker's side
      let n = 0; const full = ln.text || '';
      const speed = 1.6 * (data().settings.textSpeed || 1);
      txt.textContent = '';
      typing = setInterval(() => { n = Math.min(full.length, n + Math.ceil(speed)); txt.textContent = full.slice(0, n); if (n >= full.length) { clearInterval(typing); typing = null; armAuto(); } }, 16);
    };
    const armAuto = () => { if (auto) autoT = setTimeout(step, 900 + (lines[i]?.text || '').length * 28); };
    // tap anywhere to advance (the controls and the opening title excepted)
    let started = false;
    const begin = () => { if (!started) { started = true; step(); } };
    el.addEventListener('click', e => { if (done || e.target.closest('.sc-ctl, button')) return; if (!started) begin(); else step(); });
    App.bind(el, {
      auto: (b) => { auto = !auto; b.classList.toggle('on', auto); if (auto && !typing) armAuto(); },
      log: () => App.dialog({ title: 'Log', body: `<div class="sc-log-in">${lines.slice(0, i + 1).map(l => { const sp = speakerInfo(l.speaker); return `<p>${sp ? `<b>${esc(sp.name)}</b>` : ''}${esc(l.text)}</p>`; }).join('')}</div>` }),
      skip: () => App.confirm('Skip the scene?', 'You can read it again from the Journey later.', 'Skip').then(ok => ok && finish()),
    });
    setTimeout(begin, title !== false ? 1500 : 200);
  },
});

// ---------------- the slice's flow ----------------
const CH1 = 'chapter:v1c1';
export const Flow = {
  chapter: () => get(CH1),
  /** The next stage to play in chapter 1, or null when it is done. */
  nextStage() { return this.chapter().stages.map(get).find(s => !isCleared(s.id)) || null; },
  async newGame() {
    flags().started = true; persist();
    await this.playStage('stage:v1c1_01');
  },
  /** Play one stage from its first scene to its rewards, then go where the story goes next. */
  async playStage(sid) {
    const st = get(sid);
    if (st.scenes?.before) await Scene.play(st.scenes.before);
    if (st.waves) {
      const res = await this.battle(st);
      if (!res) { App.go('journey', { sel: sid }, { root: true }); return; }
      if (!res.win) { await this.defeat(st, res); return; }
      const out = clearStage(st, { win: true, missions: (st.missions || []).map(m => missionDone(m, res)), heroes: res.heroes });
      await new Promise(r => App.go('results', { st, res, out, resolve: r }, { replace: true }));
      for (const g of out.granted) if (g.hero && g.isNew) await this.welcome(g.hero);
      if (st.scenes?.after) await Scene.play(st.scenes.after, { title: false });
    } else {
      const out = clearStage(st, { win: true });
      if (st.shop) await this.shop(st);
      await App.rewardsDialog(out.granted, out.first ? 'Stage clear' : 'Rewards');
    }
    await this.after(st);
  },
  async battle(st) {
    let team;
    if (st.fixedTeam) team = st.fixedTeam;
    else team = await new Promise(r => App.go('formation', { st, resolve: r }, { replace: true }));
    if (!team) return null;
    const guestLevel = Math.max(...st.waves.flat().map(e => e.level));
    const def = stageBattle(st, team, data().heroes, 'array:yellow_dragon', { tutorial: !!st.tutorial && !flags().tutorialDone, fixedLevel: st.fixedTeam ? 4 : 0, guestLevel });
    data().log.battles++;
    const res = await App.runBattle(def);
    if (st.tutorial) { flags().tutorialDone = true; persist(); }
    return res;
  },
  async defeat(st, res) {
    const v = await App.dialog({ title: res.retreat ? 'Retreated' : 'Defeat', cn: '败', body: `<p>${res.retreat ? 'You left the battle.' : 'Your Blossoms have fallen.'} Cultivate your heroines, try another team, or let Auto play the turns.</p>`, buttons: [{ label: 'Journey', cls: 'ink', value: 'journey' }, { label: 'Try again', value: 'retry' }], dismiss: false });
    if (v === 'retry') return this.playStage(st.id);
    App.go('journey', { sel: st.id }, { root: true });
  },
  /** A new heroine introduces herself. */
  welcome(hid) {
    const h = get(hid);
    return App.dialog({ title: `${h.name} joins!`, cn: h.cn, body: `<div style="display:flex;gap:20px;align-items:center"><div style="width:180px;height:270px;flex:none;border-radius:12px;background:url(${cardUrl(hid)}) center 15%/cover;box-shadow:inset 0 0 0 2px #e8c77d"></div><div><p class="gold" style="font-family:Cinzel">${'★'.repeat(h.rarity)} · ${esc(h.title)}</p><p><i>“${esc(h.quotes?.intro || '')}”</i></p></div></div>`, buttons: [{ label: 'Welcome', value: true }] });
  },
  async shop(st) {
    const shop = get(st.shop);
    const stock = (shop?.stock || []).filter(s => (s.item || s.cur) && (s.price || s.cost)).slice(0, 6);
    if (!stock.length) return;
    const row = s => { const p = s.price || s.cost; const pr = Array.isArray(p) ? p[0] : p; const it = get(s.item || s.cur), ic = iconUrl(s.item || s.cur); return `<div class="pill-row">${ic ? `<img src="${ic}" alt="">` : '<span class="rw-i"><span class="g">礼</span></span>'}<b>${esc(it?.name)} ×${s.qty || 1}<small>${esc(it?.about || '')}</small></b><button class="btn" data-buy="${esc(s.item || s.cur)}">${num(pr.qty)} <img class="ic" src="${iconUrl(pr.cur || pr.item)}" alt=""></button></div>`; };
    await App.dialog({
      title: shop.name, cn: '行商', body: `${npcSays('npc:old_qian', '<p>Old Qian opens his cart: “Everything a cultivator needs, nothing a cultivator can afford. Mostly.”</p>')}${stock.map(row).join('')}`,
      buttons: [{ label: 'Leave', cls: 'ink', value: true }],
      onOpen: (w) => w.addEventListener('click', e => {
        const b = e.target.closest('[data-buy]'); if (!b) return;
        const s = stock.find(x => (x.item || x.cur) === b.dataset.buy); const p = s.price || s.cost; const pr = Array.isArray(p) ? p[0] : p;
        if (pay([{ cur: pr.cur, item: pr.item, qty: pr.qty }])) { grant([{ item: s.item, cur: s.cur, qty: s.qty || 1 }]); App.toast(`Bought ${esc(get(s.item || s.cur).name)}`); App.bumpChips(); }
        else App.toast(`Not enough ${esc(get(pr.cur || pr.item)?.name)}`);
      }),
    });
  },
  /** Where the story goes after a stage. */
  async after(st) {
    if (st.id === 'stage:v1c1_01') { await this.playStage('stage:v1c1_02'); return; }
    if (st.id === 'stage:v1c1_02' && !data().pond.guided) {
      App.go('pond', { guided: true }, { root: true });
      return;
    }
    if (st.id === 'stage:v1c1_08') {
      await App.dialog({ title: 'Chapter 1 complete', cn: '桃花渡', body: `<p><b class="gold">Peach Blossom Ford</b> is safe, and Su Lianhua has joined the Pavilion.</p><p>This is the end of the vertical slice. Chapter 2, Frostpeak, comes with the core loop alpha. Replay stages for stars and spirit stones, cultivate your heroines and try for a full Dao Blossom.</p>`, buttons: [{ label: 'Return to the Pavilion', value: true }] });
      App.go('hall', {}, { root: true });
      return;
    }
    App.go('journey', { sel: this.nextStage()?.id || st.id }, { root: true });
  },
};
