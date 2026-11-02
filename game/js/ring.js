// The Storage Ring (储物戒): every piece of gear in pages of 40, sorted and filtered, with select-and-salvage,
// auto-salvage rules and the last 30 salvaged pieces; a piece's details (roll gauges, set, refining, engraving,
// reforging, lock, salvage); and a heroine's ten gear slots, which is the same screen opened with a heroine.
import { App, esc, gearTile, slotGlyph, SET_COLOR, rewardChip } from './app.js';
import { get, all, faceUrl, num, heroStats } from './data.js';
import { pieces, piece, equip, unequip, setLock, markSeen, refine, salvage, restore, engravePiece, reforge, setAutoSalvage, heroGear, heroBonus, finalStats, qty, canPay, data, prog, persist } from './state.js';
import { POSITIONS, POS_SLOT, SUB_KEYS, lineKey, statLabel, fmtStat, mainValue, subValue, rollScore, artefactLines, rarities, rarityOrder, tierOrder, rarityColor, ROMAN, refineCost, salvageValue, engraveCost, canReforge, reforgeCost, nextTier, pieceName, canWear, gearBonus, withGear } from './gear.js';
import { sfx } from './engine.js';

const PAGE = 40;
const POS_NAME = { weapon: 'Weapon', helmet: 'Helmet', body: 'Body', gloves: 'Gloves', pants: 'Pants', boots: 'Boots', ring1: 'Ring', ring2: 'Ring', pendant: 'Pendant', artefact: 'Artefact' };
const SORTS = { rarity: 'Rarity', tier: 'Tier', plus: 'Refining', score: 'Roll score', set: 'Set', slot: 'Slot', main: 'Main stat', newest: 'Newest' };
const STATES = { all: 'All pieces', free: 'Free', worn: 'Equipped', locked: 'Locked', new: 'New' };
const SLOT_ORDER = ['slot:weapon', 'slot:helmet', 'slot:body', 'slot:gloves', 'slot:pants', 'slot:boots', 'slot:ring', 'slot:pendant', 'slot:artefact'];

// ---------------- words for the numbers ----------------
const costHtml = cost => cost.map(c => { const k = c.cur || c.item, ok = qty(k) >= c.qty; return `<span class="cost${ok ? '' : ' short'}">${num(c.qty)} ${esc(get(k)?.name || k)}</span>`; }).join(' · ');
export function twoPieceText(set) {
  const t = set.twoPiece;
  if (t.stat === 'stat:haste') return `+${t.value} Haste`;
  if (t.stat) return `+${Math.round(t.value * 100)}% ${statLabel(t.stat)}`;
  if ((t.effects || []).some(e => e.do === 'phase_qi')) return '+1 Phase Qi of her phase at battle start';
  return '';
}
const gauge = (roll, cls = '') => `<i class="gauge ${cls}"><i style="width:${Math.round(roll * 100)}%"></i></i><em>${Math.round(roll * 100)}%</em>`;

/** A piece's stat lines and set, for the detail panel and the picker. */
function pieceBody(p, hid) {
  if (p.kind === 'art') {
    const a = get(p.art), L = artefactLines(p);
    return `<div class="pd-main"><span>Attack</span><b>+${num(L.atk)}</b></div><div class="pd-main"><span>Health</span><b>+${num(L.hp)}</b></div>
      <div class="pd-set"><b>${esc(a.cn)} · Passive at ${Math.round(L.power * 100)}%</b><p>${esc(a.passive.text)}</p><p class="mut">Wielded by the ${a.paths.map(x => x === 'all' ? 'every path' : esc(get(x)?.name)).join(' and ')} path${a.paths.length > 1 ? 's' : ''}. Divine +15 gives the full passive.</p></div>`;
  }
  const subs = p.subs.map(s => { const avg = s.rolls.reduce((x, y) => x + y, 0) / s.rolls.length;
    return `<div class="pd-sub"><span>${statLabel(s.stat)}${s.rolls.length > 1 ? ` <small>×${s.rolls.length}</small>` : ''}</span><b>${fmtStat(s.stat, s.form, subValue(p, s))}</b>${gauge(avg)}</div>`; }).join('');
  const nextMs = [3, 6, 9, 12, 15].find(m => m > p.plus);
  const hint = nextMs ? `<p class="mut pd-hint">At +${nextMs}: ${p.subs.length < 4 ? 'a new substat' : 'one substat rolls again'}</p>` : '';
  let setHtml = '';
  if (p.set) {
    const s = get(p.set), b = hid ? heroBonus(hid) : null, n = b?.count[p.set] || 0;
    setHtml = `<div class="pd-set"><b style="color:${SET_COLOR[p.set]}">${esc(s.name)} ${esc(s.cn)}${hid ? ` <small>${n}/4 worn</small>` : ''}</b>
      <p class="${n >= 2 ? 'on' : ''}">2 pieces: ${esc(twoPieceText(s))}</p><p class="${n >= 4 ? 'on' : ''}">4 pieces · <b>${esc(s.fourPiece.name)}</b>: ${esc(s.fourPiece.text)}</p></div>`;
  } else setHtml = `<p class="mut pd-hint">${p.slot === 'slot:weapon' ? 'Weapons stand outside sets.' : 'No set: sets drop in the Demon Hunts.'}</p>`;
  return `<div class="pd-main"><span>${statLabel(p.main.stat)}</span><b>${fmtStat(p.main.stat, p.main.form, mainValue(p))}</b>${gauge(p.main.roll, 'main')}</div>
    <div class="pd-subs">${subs || '<p class="mut">No substats yet.</p>'}</div>${hint}${setHtml}`;
}

/** What a heroine's stats become with a piece in place of what she wears there. */
function compare(hid, pos, p) {
  const p0 = prog(hid);
  const base = heroStats(hid, p0.level, p0.bt);
  const now = withGear(base, heroBonus(hid));
  const arr = heroGear(hid); arr[POSITIONS.indexOf(pos)] = p;
  const then = withGear(base, gearBonus(arr));
  const rows = [['hp', 'Health', 0], ['atk', 'Attack', 0], ['def', 'Defense', 0], ['crit', 'Crit', 1], ['critDmg', 'Crit dmg', 1], ['haste', 'Haste', 0], ['acc', 'Accuracy', 1], ['res', 'Resist', 1]];
  return `<div class="pd-cmp">${rows.map(([k, label, pct]) => { const d = then[k] - now[k]; if (Math.abs(d) < (pct ? 0.0005 : 0.5)) return '';
    const v = pct ? `${d > 0 ? '+' : ''}${(d * 100).toFixed(1)}%` : `${d > 0 ? '+' : ''}${num(d)}`;
    return `<span class="${d > 0 ? 'up' : 'down'}">${label} ${v}</span>`; }).join('') || '<span class="mut">No change</span>'}</div>`;
}

// ---------------- the screen ----------------
App.register('ring', {
  cls: 'ring',
  render(el, params = {}) {
    const hid = params.hid || null, hero = hid ? get(hid) : null;
    const st = { pos: params.pos || (hid ? 'weapon' : null), pid: params.pid || null, page: 0, select: false, picked: new Set() };
    const view = data().gear.view;
    el.innerHTML = `<div class="scr-bg" style="background-image:url(assets/bg/pavilion.webp);filter:blur(6px) brightness(.38)"></div><div class="scr-shade"></div>
      ${App.topbar({ title: hero ? `${hero.name} · Gear` : 'Storage Ring', cn: hero ? '装备' : '储物戒', chips: ['cur:spirit_stones', 'item:forging_dust'] })}
      <div class="rg${hero ? ' with-hero' : ''}">${hero ? '<div class="rg-hero panel"></div>' : ''}<div class="rg-list panel"></div><div class="rg-detail panel"></div></div>`;
    const heroEl = el.querySelector('.rg-hero'), listEl = el.querySelector('.rg-list'), detEl = el.querySelector('.rg-detail');

    const visible = () => {
      const f = view.filter || {};
      let list = pieces();
      if (hid) list = list.filter(p => p.slot === POS_SLOT[st.pos] && canWear(p, hero));
      else {
        if (f.slot) list = list.filter(p => p.slot === f.slot);
        if (f.set) list = list.filter(p => (f.set === 'none' ? !p.set : p.set === f.set));
        if (f.rarity) list = list.filter(p => p.rarity === f.rarity);
      }
      if (f.state === 'free') list = list.filter(p => !p.hero);
      if (f.state === 'worn') list = list.filter(p => p.hero);
      if (f.state === 'locked') list = list.filter(p => p.lock);
      if (f.state === 'new') list = list.filter(p => p.new);
      const key = {
        rarity: p => rarityOrder(p.rarity) * 1000 + (p.kind === 'art' ? 0 : tierOrder(p.tier)) * 50 + p.plus, tier: p => (p.kind === 'art' ? 0 : tierOrder(p.tier)) * 1000 + rarityOrder(p.rarity),
        plus: p => p.plus * 100 + rarityOrder(p.rarity), score: p => rollScore(p), set: p => (p.set ? get(p.set).name : '~'), slot: p => SLOT_ORDER.indexOf(p.slot),
        main: p => (p.kind === 'art' ? 'zz' : lineKey(p.main)), newest: p => p.got,
      }[view.sort] || (p => p.got);
      list.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * (view.dir || -1) || (b.got - a.got); });
      return list;
    };

    const drawHero = () => {
      if (!heroEl) return;
      const p0 = prog(hid), g = heroGear(hid), b = heroBonus(hid), s = finalStats(hid), base = heroStats(hid, p0.level, p0.bt);
      const plus = (k, pct) => { const d = s[k] - (base[k] || 0); return Math.abs(d) < (pct ? 0.0005 : 0.5) ? '' : `<small>+${pct ? (d * 100).toFixed(1) + '%' : num(d)}</small>`; };
      const sets = Object.entries(b.count).filter(([, n]) => n >= 2).map(([id, n]) => { const x = get(id);
        return `<div class="rh-set" style="--sc:${SET_COLOR[id]}"><b>${esc(x.name)} ${n >= 4 ? '4' : '2'}/4</b><span>${esc(twoPieceText(x))}${n >= 4 ? ` · ${esc(x.fourPiece.name)}` : ''}</span></div>`; }).join('');
      heroEl.innerHTML = `<div class="rh-head">${faceUrl(hid) ? `<img src="${faceUrl(hid)}" alt="">` : ''}<div><b>${esc(hero.name)}</b><small>Level ${p0.level} · ${esc(get(hero.path).name)}</small></div></div>
        <div class="rh-slots">${POSITIONS.map((pos, i) => { const p = g[i];
          return `<div class="rh-slot${st.pos === pos ? ' on' : ''}" data-act="pos" data-pos="${pos}">${p ? gearTile(p) : `<div class="gt empty"><span class="g">${slotGlyph(POS_SLOT[pos])}</span></div>`}<small>${POS_NAME[pos]}</small></div>`; }).join('')}</div>
        <div class="stats rh-stats"><div>Health <b>${num(s.hp)}${plus('hp')}</b></div><div>Attack <b>${num(s.atk)}${plus('atk')}</b></div><div>Defense <b>${num(s.def)}${plus('def')}</b></div><div>Critical <b>${Math.round(s.crit * 100)}%${plus('crit', 1)}</b></div>
          <div>Crit damage <b>${Math.round(s.critDmg * 100)}%${plus('critDmg', 1)}</b></div><div>Haste <b>${s.haste}</b></div><div>Accuracy <b>${Math.round(s.acc * 100)}%</b></div><div>Resistance <b>${Math.round(s.res * 100)}%</b></div></div>
        ${sets ? `<div class="rh-sets">${sets}</div>` : '<p class="mut" style="margin:0">Wear 2 or 4 pieces of one set for its bonus and effect.</p>'}
        <div class="rh-btns"><button class="btn ink" data-act="stripall">Unequip all</button><button class="btn ink" data-act="toring">Storage Ring</button></div>`;
    };

    const drawList = () => {
      const list = visible(), f = view.filter || {};
      const pages = Math.max(1, Math.ceil(list.length / PAGE)); st.page = Math.min(st.page, pages - 1);
      const shown = hid ? list : list.slice(st.page * PAGE, st.page * PAGE + PAGE);
      const opt = (val, label, cur) => `<option value="${val}"${cur === val ? ' selected' : ''}>${esc(label)}</option>`;
      listEl.innerHTML = `<div class="rg-tools">
          <select data-k="sort">${Object.entries(SORTS).map(([k, v]) => opt(k, v, view.sort)).join('')}</select>
          <button class="tl" data-act="dir" title="Order">${(view.dir || -1) < 0 ? '↓' : '↑'}</button>
          ${hid ? '' : `<select data-k="slot">${opt('', 'All slots', f.slot || '')}${SLOT_ORDER.map(s => opt(s, get(s).name, f.slot)).join('')}</select>
          <select data-k="set">${opt('', 'All sets', f.set || '')}${opt('none', 'No set', f.set)}${all('set').map(s => opt(s.id, s.name, f.set)).join('')}</select>
          <select data-k="rarity">${opt('', 'All rarities', f.rarity || '')}${rarities().map(r => opt(r.id, r.name, f.rarity)).join('')}</select>`}
          <select data-k="state">${Object.entries(STATES).map(([k, v]) => opt(k, v, f.state || 'all')).join('')}</select>
        </div>
        <div class="rg-count"><span class="mut">${list.length} piece${list.length === 1 ? '' : 's'}${hid ? ` for ${esc(POS_NAME[st.pos])}` : ''}${!hid && list.length ? ` · <a data-act="salvageshown">Salvage all shown</a>` : ''}</span>
          ${hid ? '' : `<span class="sp"></span><button class="tl${st.select ? ' on' : ''}" data-act="select">${st.select ? `Salvage ${st.picked.size}` : 'Select'}</button>${st.select ? '<button class="tl" data-act="unselect">Cancel</button>' : ''}
          <button class="tl" data-act="auto" title="Auto-salvage">Auto-salvage${data().gear.auto.on ? ' ✓' : ''}</button><button class="tl" data-act="recent" title="Recently salvaged">↺ Buy back</button>`}</div>
        <div class="rg-grid">${shown.map(p => gearTile(p, { sel: p.id === st.pid, cls: st.picked.has(p.id) ? 'picked' : '', face: true, isNew: true })).join('') || `<p class="mut">${hid ? 'No piece for this slot yet. Gear drops on the Journey and in the Demon Hunts.' : 'The ring is empty. Gear drops on the Journey and in the Demon Hunts.'}</p>`}</div>
        ${!hid && pages > 1 ? `<div class="rg-pages">${Array.from({ length: pages }, (_, i) => `<button class="${i === st.page ? 'on' : ''}" data-act="page" data-i="${i}">${i + 1}</button>`).join('')}</div>` : ''}`;
    };

    const drawDetail = () => {
      let p = st.pid && piece(st.pid);
      if (!p && hid) { const id = prog(hid).eq?.[st.pos]; p = id ? piece(id) : null; if (p) st.pid = p.id; }
      if (!p) { detEl.innerHTML = `<p class="mut pd-empty">${hid ? 'Choose a piece for her, or tap a slot.' : 'Tap a piece to see its rolls, refine it, lock it or salvage it.'}</p>`; return; }
      const r = get(p.rarity), col = rarityColor(p.rarity);
      const wearer = p.hero ? get(p.hero) : null;
      const canEquipHere = hid && p.slot === POS_SLOT[st.pos] && canWear(p, hero) && !(p.hero === hid && p.pos === st.pos);
      const cost = p.plus < 15 ? refineCost(p) : null;
      detEl.innerHTML = `<div class="pd-head" style="--rc:${col}">${gearTile(p, { cls: 'big' })}<div><b class="pd-name">${esc(pieceName(p))}</b>
          <small style="color:${col}">${esc(r.glyph)} ${esc(r.name)}${p.kind === 'art' ? '' : ` · Tier ${ROMAN[tierOrder(p.tier)]}`} · +${p.plus}</small>
          <small>Roll score <b>${Math.round(rollScore(p) * 100)}%</b>${p.engraved ? ' · engraved' : ''}</small></div></div>
        ${pieceBody(p, hid)}
        ${canEquipHere ? compare(hid, st.pos, p) : ''}
        <div class="pd-eq">${wearer ? `${faceUrl(p.hero) ? `<img src="${faceUrl(p.hero)}" alt="">` : ''}Worn by <b>${esc(wearer.name)}</b>` : '<span class="mut">In the ring</span>'}</div>
        <div class="pd-btns">
          ${canEquipHere ? '<button class="btn jade" data-act="equip">Equip</button>' : ''}
          ${p.hero ? '<button class="btn ink" data-act="unequip">Unequip</button>' : ''}
          ${cost ? `<button class="btn${canPay(cost) ? '' : ' off'}" data-act="refine">Refine to +${p.plus + 1}<small>${cost.map(c => num(c.qty) + ' ' + (c.cur ? 'stones' : (c.item === 'item:forging_dust' ? 'dust' : 'essence'))).join(' · ')}</small></button>` : ''}
          ${canReforge(p) ? `<button class="btn" data-act="reforge">Reforge to tier ${ROMAN[tierOrder(nextTier(p).id)]}</button>` : ''}
          ${p.kind !== 'art' && !p.engraved && p.subs.length ? '<button class="btn ink" data-act="engrave">Engrave</button>' : ''}
          <button class="btn ink" data-act="lock">${p.lock ? 'Unlock' : 'Lock'}</button>
          ${!p.lock && !p.hero ? '<button class="btn red" data-act="salvage1">Salvage</button>' : ''}
        </div>`;
      if (p.new) markSeen([p.id]);
    };
    const draw = () => { drawHero(); drawList(); drawDetail(); App.bumpChips(); };
    draw();

    el.addEventListener('change', e => {
      const k = e.target.dataset?.k; if (!k) return;
      if (k === 'sort') view.sort = e.target.value;
      else view.filter = { ...(view.filter || {}), [k]: e.target.value || undefined };
      st.page = 0; persist(); drawList();
    });
    el.addEventListener('click', e => {
      const t = e.target.closest('.rg-grid .gt'); if (!t) return;
      const id = t.dataset.pid;
      if (st.select) { if (st.picked.has(id)) st.picked.delete(id); else if (!piece(id).lock && !piece(id).hero) st.picked.add(id); else App.toast('Locked and equipped pieces stay'); drawList(); return; }
      st.pid = id; drawList(); drawDetail();
    });
    const cur = () => piece(st.pid);
    App.bind(el, {
      dir: () => { view.dir = -(view.dir || -1); persist(); drawList(); },
      page: (b) => { st.page = +b.dataset.i; drawList(); },
      pos: (b) => { st.pos = b.dataset.pos; const id = prog(hid).eq?.[st.pos]; st.pid = id || null; draw(); },
      toring: () => App.go('ring', {}),
      stripall: () => { for (const pos of POSITIONS) unequip(hid, pos); draw(); },
      select: async () => {
        if (!st.select) { st.select = true; st.picked.clear(); drawList(); return; }
        if (!st.picked.size) { st.select = false; drawList(); return; }
        if (await salvageConfirm([...st.picked].map(piece))) { st.select = false; st.picked.clear(); st.pid = null; draw(); }
      },
      unselect: () => { st.select = false; st.picked.clear(); drawList(); },
      salvageshown: async () => { const list = visible().filter(p => !p.lock && !p.hero); if (!list.length) { App.toast('Nothing to salvage: locked and equipped pieces stay'); return; } if (await salvageConfirm(list)) { st.pid = null; draw(); } },
      auto: () => autoDialog().then(drawList),
      recent: () => recentDialog().then(draw),
      equip: async () => {
        const p = cur(); if (!p) return;
        if (p.hero && p.hero !== hid && !(await App.confirm('Take it?', `${esc(get(p.hero).name)} is wearing this piece. Move it to ${esc(hero.name)}?`, 'Move it'))) return;
        if (equip(hid, st.pos, p.id)) { sfx('click'); draw(); }
      },
      unequip: () => { const p = cur(); if (p) { unequip(p.hero, p.pos); draw(); } },
      lock: () => { const p = cur(); if (p) { setLock(p.id, !p.lock); drawList(); drawDetail(); } },
      salvage1: async () => { const p = cur(); if (p && await salvageConfirm([p])) { st.pid = null; draw(); } },
      refine: () => {
        const p = cur(); if (!p) return;
        if (!canPay(refineCost(p))) { App.toast('Not enough Spirit Stones or Forging Dust'); return; }
        const res = refine(p.id); if (!res) return;
        sfx(res.gained || res.raised ? 'crit' : 'hit');
        App.toast(res.gained ? `+${p.plus}: new substat, ${statLabel(res.gained.split('/')[0])}` : res.raised ? `+${p.plus}: ${statLabel(res.raised.split('/')[0])} rolls again` : `Refined to +${p.plus}`);
        draw();
      },
      reforge: async () => {
        const p = cur(); if (!p) return; const cost = reforgeCost(p);
        if (!(await App.dialog({ title: 'Reforge', cn: '重铸', body: `<p>Reforge this +15 piece from tier ${ROMAN[tierOrder(p.tier)]} to tier ${ROMAN[tierOrder(nextTier(p).id)]}. It keeps every roll; its values grow with the tier.</p><p>${costHtml(cost)}</p>`, buttons: [{ label: 'Not now', cls: 'ink', value: false }, { label: 'Reforge', cls: canPay(cost) ? '' : 'off', value: true }] }))) return;
        if (reforge(p.id)) { sfx('thunder'); App.toast('Reforged'); draw(); } else App.toast('Not enough ore or Spirit Stones');
      },
      engrave: () => { const p = cur(); if (p) engraveDialog(p).then(draw); },
    });
  },
});

// ---------------- dialogs ----------------
function totalOf(list) {
  const t = {};
  for (const p of list) for (const c of salvageValue(p)) { const k = c.cur || c.item; t[k] = (t[k] || 0) + c.qty; }
  return Object.entries(t).map(([k, qty]) => (k.startsWith('cur:') ? { cur: k, qty } : { item: k, qty }));
}
async function salvageConfirm(list) {
  const back = totalOf(list);
  const top = list.filter(p => rarityOrder(p.rarity) >= 6).length;
  const ok = await App.dialog({
    title: list.length > 1 ? `Salvage ${list.length} pieces` : 'Salvage', cn: '分解',
    body: `<p>They return:</p><div class="got" style="justify-content:flex-start">${back.map(c => rewardChip(c)).join('')}</div>${top ? `<p style="color:#ff9a8a">${top} of them ${top > 1 ? 'are' : 'is'} Mythic or better.</p>` : ''}<p class="mut">You can buy back the last 30 salvaged pieces from ↺ in the Storage Ring.</p>`,
    buttons: [{ label: 'Keep them', cls: 'ink', value: false }, { label: 'Salvage', cls: 'red', value: true }],
  });
  if (!ok) return false;
  salvage(list.map(p => p.id)); sfx('shatter'); App.bumpChips();
  return true;
}
function autoDialog() {
  const a = { ...data().gear.auto };
  const body = () => `<div class="auto">
    <label class="ck"><input type="checkbox" data-a="on"${a.on ? ' checked' : ''}> Salvage new drops automatically</label>
    <label>Salvage pieces below <select data-a="below">${rarities().slice(1, 6).map(r => `<option value="${r.id}"${a.below === r.id ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
    <label class="ck"><input type="checkbox" data-a="belowTier"${a.belowTier ? ' checked' : ''}> Salvage pieces below your best tier</label>
    <label>…or with a roll score under <select data-a="minScore">${[0, 0.3, 0.4, 0.5, 0.6].map(v => `<option value="${v}"${a.minScore === v ? ' selected' : ''}>${v ? Math.round(v * 100) + '%' : 'off'}</option>`).join('')}</select></label>
    <label class="ck"><input type="checkbox" data-a="keep"${a.keepAbove ? ' checked' : ''}> Keep any piece with a roll of 90% or more</label>
    <label class="ck"><input type="checkbox" data-a="allowTop"${a.allowTop ? ' checked' : ''}> Allow Immortal and Divine pieces too</label>
    <p class="mut">Rules apply to every new drop. Equipped and locked pieces are never touched, and the last 30 salvaged pieces can be bought back.</p></div>`;
  return App.dialog({
    title: 'Auto-salvage', cn: '自动分解', body: body(),
    buttons: [{ label: 'Cancel', cls: 'ink', value: false }, { label: 'Save rules', value: true }],
    onOpen: (w) => w.addEventListener('change', e => {
      const k = e.target.dataset.a; if (!k) return;
      if (k === 'on' || k === 'belowTier' || k === 'allowTop') a[k] = e.target.checked;
      else if (k === 'keep') a.keepAbove = e.target.checked ? 0.9 : 0;
      else if (k === 'minScore') a.minScore = +e.target.value;
      else a[k] = e.target.value;
    }),
  }).then(ok => { if (ok) { setAutoSalvage(a); App.toast(a.on ? 'Auto-salvage is on' : 'Auto-salvage is off'); } });
}
function recentDialog() {
  const rows = () => data().gear.recent.map((r, i) => `<div class="pill-row rec">${gearTile(r.piece)}<b>${esc(get(r.piece.rarity).name)} ${esc(pieceName(r.piece))}<small>Buy back for ${costHtml(r.back)}</small></b><button class="btn${canPay(r.back) ? '' : ' off'}" data-i="${i}">Restore</button></div>`).join('') || '<p class="mut">Nothing salvaged yet.</p>';
  return App.dialog({
    title: 'Recently salvaged', cn: '回收', body: `<div class="recent">${rows()}</div>`,
    onOpen: (w) => w.addEventListener('click', e => {
      const b = e.target.closest('[data-i]'); if (!b) return;
      if (restore(+b.dataset.i)) { App.toast('Restored to the ring'); App.bumpChips(); w.querySelector('.recent').innerHTML = rows(); } else App.toast('Not enough to buy it back');
    }),
  });
}
function engraveDialog(p) {
  const cost = engraveCost(p);
  let i = 0, key = null;
  const free = () => SUB_KEYS.filter(k => k !== lineKey(p.main) && !p.subs.some((s, j) => j !== i && lineKey(s) === k));
  const body = () => { if (!free().includes(key)) key = free()[0];
    return `<p>Engraving replaces one substat with a new roll of the stat you choose. Each piece takes one engraving.</p>
      <div class="eng">${p.subs.map((s, j) => `<label class="ck"><input type="radio" name="eng" data-i="${j}"${j === i ? ' checked' : ''}> ${esc(statLabel(s.stat))} ${fmtStat(s.stat, s.form, subValue(p, s))}${s.rolls.length > 1 ? ` (×${s.rolls.length})` : ''}</label>`).join('')}</div>
      <label>Becomes <select data-k="eng">${free().map(k => { const [st, fm] = k.split('/'); return `<option value="${k}"${k === key ? ' selected' : ''}>${esc(statLabel(st))}${fm === 'pct' && ['stat:atk', 'stat:hp', 'stat:def'].includes(st) ? ' %' : ''}</option>`; }).join('')}</select></label>
      <p>${costHtml(cost)}</p>`; };
  return App.dialog({
    title: 'Engrave', cn: '铭刻', body: `<div class="engw">${body()}</div>`,
    buttons: [{ label: 'Cancel', cls: 'ink', value: false }, { label: 'Engrave', cls: canPay(cost) ? '' : 'off', value: true }],
    onOpen: (w) => w.addEventListener('change', e => {
      if (e.target.name === 'eng') { i = +e.target.dataset.i; w.querySelector('.engw').innerHTML = body(); }
      if (e.target.dataset.k === 'eng') key = e.target.value;
    }),
  }).then(ok => { if (ok) { if (engravePiece(p.id, i, key)) { sfx('crit'); App.toast('Engraved'); } else App.toast('Not enough Dao Marks'); } });
}

/** A heroine's ten slots as a strip, for her overview. */
export function heroGearStrip(hid) {
  const g = heroGear(hid);
  return `<div class="hg-strip">${POSITIONS.map((pos, i) => (g[i] ? gearTile(g[i]) : `<div class="gt empty" title="${POS_NAME[pos]}"><span class="g">${slotGlyph(POS_SLOT[pos])}</span></div>`)).join('')}</div>`;
}
