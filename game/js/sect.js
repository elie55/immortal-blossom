// The Sect, the Hundred Blossoms Pavilion: ten buildings on the mountain, levels capped by the Main Hall (which the
// Journey's chapters cap in turn). The Closed-door Caves, the Spirit Herb Garden, the Alchemy Pavilion, the Mission
// Hall, the Tea House and the Array Platform; Sect Duties in the Main Hall; the Market's two shops. Everything that
// runs on time is computed from timestamps, so it works offline and never needs the game to stay open.
import { App, esc, compact, rewardChip, mergeRewards, npcSays, phTag } from './app.js';
import { get, all, iconUrl, faceUrl, num, phaseOf, power, hasArt, arrayText, bondLevel } from './data.js';
import { data, persist, owned, ownedHeroes, prog, qty, canPay, pay, grant, isCleared, addExp, finalStats, duty, dutyState, dailyDuties, weekKey, teaToday, arraysOpen, arrayLevel } from './state.js';
import { sfx } from './engine.js';
import { teaDialog, giftDialog } from './heroines.js';

const SECT = () => data().sect;
// ---------------- buildings ----------------
export const bldUnlocked = id => { const u = get(id)?.unlock; return !u || !u.clear || isCleared(u.clear); };
export const bldLevel = id => SECT().levels[id] || 1;
/** Journey chapters whose last battle is won. */
export function chaptersCleared() {
  return all('chapter').filter(ch => { const fights = ch.stages.map(get).filter(s => s?.waves); return fights.length && isCleared(fights[fights.length - 1].id); }).length;
}
/** The highest level a building can reach now: the Main Hall by chapters cleared, the others by the Main Hall. */
export function bldCap(id) {
  const mh = get('bld:main_hall');
  if (id === 'bld:main_hall') return Math.min(mh.maxLevel || 10, Math.max(1, (mh.capByChapters || 2) * chaptersCleared()));
  return Math.min(get(id).maxLevel || 10, bldLevel('bld:main_hall'));
}
export const upgradeCostOf = id => (get(id).upgradeCost || [])[bldLevel(id) - 1] || null;
export function upgradeBld(id) {
  const c = upgradeCostOf(id); if (!c || bldLevel(id) >= bldCap(id) || !pay(c)) return false;
  SECT().levels[id] = bldLevel(id) + 1; persist();
  return true;
}

// ---------------- the Closed-door Caves ----------------
const CAVES = 'bld:closed_door_caves';
export const caveSlots = () => (get(CAVES).slots || [4])[bldLevel(CAVES) - 1] || 4;
export const caveRate = () => (get(CAVES).expPerHour || [600])[bldLevel(CAVES) - 1] || 600;
export const inCaves = hid => !!SECT().caves[hid];
export const onMission = hid => Object.values(SECT().missions).some(m => m.heroes.includes(hid));
export const sectBusy = hid => inCaves(hid) || onMission(hid);
export function caveHours(hid, now = Date.now()) { const t = SECT().caves[hid]; return t ? Math.max(0, Math.min(get(CAVES).maxHours || 12, (now - t) / 3600e3)) : 0; }
export const caveExp = (hid, now) => Math.floor(caveHours(hid, now) * caveRate());
export function enterCaves(hid) {
  if (!owned(hid) || sectBusy(hid) || Object.keys(SECT().caves).length >= caveSlots()) return false;
  SECT().caves[hid] = Date.now(); persist();
  return true;
}
/** Collect her EXP (banked past her level cap); each full 4 hours may bring an epiphany. leave: she comes out. */
export function collectCave(hid, leave = false, now = Date.now()) {
  if (!SECT().caves[hid]) return null;
  const hours = caveHours(hid, now), exp = caveExp(hid, now), b = get(CAVES);
  const lv = exp ? addExp(hid, exp) : null;
  let epiphany = null;
  for (let k = 0; k < Math.floor(hours / 4) && !epiphany; k++) if (Math.random() < (b.epiphanyChancePer4h || 0.03)) epiphany = epiphanyFor(hid, b.epiphanyMaxLevel || 3);
  if (leave) delete SECT().caves[hid]; else SECT().caves[hid] = now;
  persist();
  return { hid, hours, exp, lv, epiphany };
}
function epiphanyFor(hid, maxLv) {
  const p = prog(hid), m = p.mastery || {};
  const open = get(hid).skills.filter(sid => (m[sid] || 0) < maxLv && (get(sid).mastery || []).length > (m[sid] || 0));
  if (!open.length) return null;
  const sid = open[Math.floor(Math.random() * open.length)];
  p.mastery = { ...m, [sid]: (m[sid] || 0) + 1 };
  return { sid, level: p.mastery[sid] };
}

// ---------------- the Spirit Herb Garden ----------------
const GARDEN = 'bld:spirit_herb_garden';
/** The best realm among your heroines, by order (1 = Qi Refining). */
const bestRealmOrder = () => 1 + Math.max(0, ...Object.values(data().heroes).map(h => h.bt || 0));
/** A herb grows from its garden level, and from its realm (fromRealm) once one of your heroines has reached it. */
const herbOpen = (p, L = bldLevel(GARDEN)) => L >= (p.fromLevel || 1) && (!p.fromRealm || bestRealmOrder() >= (get(p.fromRealm)?.order || 1));
export function gardenYield(now = Date.now()) {
  const g = SECT().garden, b = get(GARDEN), L = bldLevel(GARDEN);
  if (!g.since) return { hours: 0, cap: b.capHours || 12, items: [] };
  const hours = Math.max(0, Math.min(b.capHours || 12, (now - g.since) / 3600e3)), mul = 1 + (b.levelBonus || 0) * (L - 1);
  const items = (b.produces || []).filter(p => herbOpen(p, L)).map(p => {
    const id = p.cur || p.item, raw = p.perHour * hours * mul + (g.carry[id] || 0);
    return { id, cur: !!p.cur, perHour: p.perHour * mul, raw, qty: Math.floor(raw) };
  });
  return { hours, cap: b.capHours || 12, items };
}
/** Start the garden growing (the first visit after it opens). */
export function plantGarden() { const g = SECT().garden; if (!g.since && bldUnlocked(GARDEN)) { g.since = Date.now(); persist(); } }
export function harvest(now = Date.now()) {
  const g = SECT().garden; if (!g.since) { plantGarden(); return []; }
  const y = gardenYield(now);
  const out = y.items.filter(i => i.qty > 0).map(i => (i.cur ? { cur: i.id, qty: i.qty } : { item: i.id, qty: i.qty }));
  for (const i of y.items) g.carry[i.id] = i.raw - i.qty;
  g.since = now;
  if (out.length) { grant(out); duty('duty:collect_garden'); }
  persist();
  return out;
}

// ---------------- the Alchemy Pavilion ----------------
const ALCH = 'bld:alchemy_pavilion';
export const furnaces = () => (get(ALCH).furnaces || [1])[bldLevel(ALCH) - 1] || 1;
export const brews = () => SECT().alchemy.jobs;
/** Quality odds: the furnace's level and the alchemist (Healers most of all) move odds from Low to High and Perfect. */
export function qualityOdds() {
  const q = get(ALCH).quality, a = SECT().alchemy.alchemist;
  const shift = q.shiftPerLevel * (bldLevel(ALCH) - 1) + (a ? q.alchemistShift : 0) + (a && get(a)?.path === 'path:healer' ? q.healerShift : 0);
  const low = Math.max(q.lowFloor, q.odds.Low - shift), moved = q.odds.Low - low;
  return { Low: low, Middle: q.odds.Middle, High: q.odds.High + moved * 0.6, Perfect: q.odds.Perfect + moved * 0.4 };
}
export function startBrew(rid, count = 1) {
  const r = get(rid); count = Math.max(1, Math.min(get(ALCH).maxBatch || 10, count | 0));
  if (!r || brews().length >= furnaces()) return false;
  if (!pay(r.inputs.map(c => ({ ...c, qty: c.qty * count })))) return false;
  const now = Date.now();
  brews().push({ recipe: rid, count, start: now, end: now + (r.hours || 1) * count * 3600e3 });
  persist();
  return true;
}
/** Collect a finished brew: each pill rolls its quality, High and Perfect yield more. */
export function collectBrew(i, now = Date.now()) {
  const j = brews()[i]; if (!j || now < j.end) return null;
  const r = get(j.recipe), q = get(ALCH).quality, odds = qualityOdds(), rolls = {};
  let total = 0;
  for (let k = 0; k < j.count; k++) {
    if (!r.quality) { total += r.output.qty; continue; }
    let x = Math.random(), pick = 'Low';
    for (const [name, pr] of Object.entries(odds)) { if (x < pr) { pick = name; break; } x -= pr; }
    rolls[pick] = (rolls[pick] || 0) + 1; total += r.output.qty * (q.output[pick] || 1);
  }
  brews().splice(i, 1);
  grant([{ item: r.output.item, qty: total }]);
  if (r.quality) duty('duty:brew_pills', j.count);
  persist();
  return { recipe: r, count: j.count, total, rolls };
}
export function setAlchemist(hid) { SECT().alchemy.alchemist = hid || null; persist(); }

// ---------------- the Mission Hall ----------------
const MH = 'bld:mission_hall';
export const missionSlots = () => (get(MH).slots || [1])[bldLevel(MH) - 1] || 1;
export const expedLevel = e => (get(MH).unlockByHours || {})[String(e.hours)] || 1;
export const expedOpen = e => bldLevel(MH) >= expedLevel(e);
const teamPower = team => team.reduce((a, h) => a + power(finalStats(h)), 0);
/** Does a team meet an expedition's needs? Each listed phase or path needs its own heroine. */
export function expedCheck(e, team) {
  const req = e.requires || {}, hs = team.map(get), missing = [];
  const covers = (list, key) => { const pool = [...hs]; for (const x of list || []) { const i = pool.findIndex(h => h[key] === x); if (i < 0) return false; pool.splice(i, 1); } return true; };
  if (team.length !== (req.heroines || 1)) missing.push(`${req.heroines || 1} heroines`);
  if (!covers(req.phases, 'phase')) missing.push((req.phases || []).map(p => get(p).name).join(' + '));
  if (!covers(req.paths, 'path')) missing.push((req.paths || []).map(p => get(p).name).join(' + '));
  if (req.power && teamPower(team) < req.power) missing.push(`${num(req.power)} power`);
  return { ok: !missing.length, missing, power: teamPower(team) };
}
export function startExped(eid, team) {
  const e = get(eid);
  if (!e || SECT().missions[eid] || !expedOpen(e) || Object.keys(SECT().missions).length >= missionSlots()) return false;
  if (team.some(h => !owned(h) || sectBusy(h)) || !expedCheck(e, team).ok) return false;
  const now = Date.now(); SECT().missions[eid] = { heroes: [...team], start: now, end: now + e.hours * 3600e3 };
  persist();
  return true;
}
export function collectExped(eid, now = Date.now()) {
  const m = SECT().missions[eid], e = get(eid); if (!m || now < m.end) return null;
  const got = (e.rewards || []).filter(r => Math.random() < (r.chance ?? 1)).map(r => (r.cur ? { cur: r.cur, qty: r.qty } : { item: r.item, qty: r.qty }));
  delete SECT().missions[eid];
  const out = grant(got); duty('duty:expeditions'); persist();
  return { e, out };
}

// ---------------- the Array Platform ----------------
const AP = 'bld:array_platform';
export function arrayUpCost(id) {
  const a = get(id), L = arrayLevel(id); if (L >= (a.maxLevel || 10)) return null;
  return (a.upgradeCost || []).map(c => ({ ...c, qty: c.qty * L }));
}
export function upgradeArray(id) {
  const c = arrayUpCost(id); if (!c || arrayLevel(id) >= bldLevel(AP) || !pay(c)) return false;
  const d = data(); d.arrayLevels = d.arrayLevels || {}; d.arrayLevels[id] = arrayLevel(id) + 1; persist();
  return true;
}

// ---------------- Sect Duties ----------------
export function dutyBoard(period) {
  const t = dutyState(), ch = get(`chest:${period}`), book = period === 'weekly' ? t.weekly : t.daily;
  const ids = period === 'daily' ? dailyDuties() : ch.duties;
  const rows = ids.map(id => { const r = get(id); const n = book[id] || 0; return { r, n, done: n >= (r.count || 1) }; });
  const points = rows.filter(x => x.done).reduce((a, x) => a + x.r.points, 0);
  const tiers = ch.tiers.map((tr, i) => ({ ...tr, ready: points >= tr.at, claimed: t.claimed[period].includes(i) }));
  return { rows, points, tiers, max: Math.max(...ch.tiers.map(x => x.at)) };
}
export function claimDutyChest(period, i) {
  const b = dutyBoard(period), tr = b.tiers[i]; if (!tr || !tr.ready || tr.claimed) return null;
  dutyState().claimed[period].push(i);
  return grant(tr.rewards);
}

// ---------------- the Market ----------------
function shopBook() { const s = data().shops, wk = weekKey(); if (s.week !== wk) { s.week = wk; s.bought = {}; } return s.bought; }
export const stockLeft = (shopId, i) => { const row = get(shopId).stock[i]; return row.limit ? row.limit - (shopBook()[`${shopId}#${i}`] || 0) : Infinity; };
export function buy(shopId, i) {
  const row = get(shopId).stock[i]; if (!row || stockLeft(shopId, i) <= 0 || !pay(row.price)) return null;
  const k = `${shopId}#${i}`; shopBook()[k] = (shopBook()[k] || 0) + 1;
  return grant([row.item ? { item: row.item, qty: row.qty } : { cur: row.cur, qty: row.qty }]);
}

/** What waits for the player in the Sect: finished timers, a full garden, duty chests to open. */
export function sectAlerts(now = Date.now()) {
  if (!bldUnlocked('bld:main_hall')) return 0;
  let n = 0;
  n += brews().filter(j => now >= j.end).length;
  n += Object.values(SECT().missions).filter(m => now >= m.end).length;
  n += Object.keys(SECT().caves).filter(h => caveHours(h, now) >= (get(CAVES).maxHours || 12)).length;
  if (bldUnlocked(GARDEN) && gardenYield(now).hours >= (get(GARDEN).capHours || 12)) n++;
  for (const p of ['daily', 'weekly']) n += dutyBoard(p).tiers.filter(t => t.ready && !t.claimed).length;
  return n;
}

// ======================= screens =======================
const BLD_ICON = { 'bld:main_hall': 'bld_main_hall', 'bld:closed_door_caves': 'bld_closed_door_caves', 'bld:spirit_herb_garden': 'bld_spirit_herb_garden', 'bld:alchemy_pavilion': 'bld_alchemy_pavilion',
  'bld:mission_hall': 'bld_mission_hall', 'bld:spirit_beast_garden': 'bld_spirit_beast_garden', 'bld:array_platform': 'bld_array_platform', 'bld:scripture_pavilion': 'bld_scripture_pavilion', 'bld:tea_house': 'bld_tea_house', 'bld:artifact_forge': 'ui_forge' };
const BLD_GLYPH = { 'bld:main_hall': '殿', 'bld:closed_door_caves': '洞', 'bld:spirit_herb_garden': '园', 'bld:alchemy_pavilion': '丹', 'bld:mission_hall': '任', 'bld:spirit_beast_garden': '兽', 'bld:array_platform': '阵', 'bld:scripture_pavilion': '经', 'bld:tea_house': '茶', 'bld:artifact_forge': '器' };
const bldIcon = id => (hasArt(`icons/${BLD_ICON[id]}.webp`) ? `<img src="assets/icons/${BLD_ICON[id]}.webp" alt="">` : `<span class="g">${BLD_GLYPH[id] || '宗'}</span>`);
// where each building sits on the mountain (percent of the screen), back to front
const BLD_POS = { 'bld:main_hall': [25, 19], 'bld:scripture_pavilion': [74, 17], 'bld:closed_door_caves': [50, 21], 'bld:array_platform': [87, 42], 'bld:alchemy_pavilion': [35, 45],
  'bld:artifact_forge': [63, 45], 'bld:spirit_herb_garden': [12, 47], 'bld:tea_house': [47, 70], 'bld:mission_hall': [74, 70], 'bld:spirit_beast_garden': [21, 74] };
const SCREEN_OF = { 'bld:artifact_forge': ['forge', {}] };
const BETA = new Set(['bld:spirit_beast_garden', 'bld:scripture_pavilion']);
const LATER = new Set(['duty:pagoda_floor', 'duty:secret_realm_run', 'duty:competition_wins']); // duties of modes the alpha does not have yet
const hhmm = ms => { const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(x).padStart(2, '0')}s`; };
const faceOf = hid => (faceUrl(hid) ? `<img src="${faceUrl(hid)}" alt="">` : `<span class="g">${esc(get(hid).cn[0])}</span>`);
const costRow = cost => `<div class="got sc-cost">${cost.map(c => { const id = c.item || c.cur; return `<div class="rw-i${qty(id) >= c.qty ? '' : ' done'}" data-tip="${id}">${iconUrl(id) ? `<img src="${iconUrl(id)}" alt="">` : '<span class="g">材</span>'}<em>${compact(qty(id))}/${compact(c.qty)}</em></div>`; }).join('')}</div>`;

/** A building's status line on the mountain. */
function bldStatus(id, now) {
  if (id === CAVES) { const n = Object.keys(SECT().caves).length; const full = Object.keys(SECT().caves).some(h => caveHours(h, now) >= 12); return full ? ['Ready', 'hot'] : [`${n}/${caveSlots()} in seclusion`, n ? '' : 'idle']; }
  if (id === GARDEN) { const y = gardenYield(now); return y.hours >= y.cap ? ['Full', 'hot'] : [`${Math.floor(y.hours * 100 / y.cap)}% grown`, '']; }
  if (id === ALCH) { const done = brews().filter(j => now >= j.end).length; if (done) return [`${done} ready`, 'hot']; const j = brews()[0]; return j ? [hhmm(j.end - now), ''] : ['Furnace cold', 'idle']; }
  if (id === MH) { const ms = Object.values(SECT().missions); const done = ms.filter(m => now >= m.end).length; if (done) return [`${done} back`, 'hot']; return ms.length ? [`${ms.length} out`, ''] : ['No expedition', 'idle']; }
  if (id === 'bld:tea_house') return teaToday() ? ['Tea taken', ''] : ['Tea is ready', 'hot'];
  if (id === 'bld:main_hall') { const n = ['daily', 'weekly'].reduce((a, p) => a + dutyBoard(p).tiers.filter(t => t.ready && !t.claimed).length, 0); return n ? [`${n} chest${n > 1 ? 's' : ''}`, 'hot'] : ['Sect Duties', '']; }
  if (id === 'bld:artifact_forge') { const j = data().forge.job; return j ? (now >= j.end ? ['Ready', 'hot'] : [hhmm(j.end - now), '']) : ['Furnace cold', 'idle']; }
  if (id === AP) return [`${arraysOpen().length} arrays`, ''];
  return ['', ''];
}

App.register('sect', {
  cls: 'sect',
  render(el) {
    plantGarden();
    const bg = hasArt('bg/sect_mountain.webp') ? 'assets/bg/sect_mountain.webp' : 'assets/bg/pavilion.webp';
    const ids = Object.keys(BLD_POS);
    const draw = () => {
      const now = Date.now();
      el.querySelector('.sm-blds').innerHTML = ids.map(id => {
        const b = get(id), open = bldUnlocked(id) && !BETA.has(id), [st, cls] = open ? bldStatus(id, now) : [BETA.has(id) ? 'Content beta' : `Clear ${esc(get(b.unlock?.clear)?.name || 'more of the Journey')}`, 'lock'];
        const [x, y] = BLD_POS[id];
        return `<button class="sm-b${open ? '' : ' locked'}" data-act="open" data-id="${id}" style="left:${x}%;top:${y}%"><div class="sm-ic">${bldIcon(id)}</div>
          <b>${esc(b.name)}</b><small>${open && id !== 'bld:artifact_forge' ? `Lv ${bldLevel(id)} · ` : ''}<i class="${cls}">${st}</i></small></button>`;
      }).join('');
    };
    el.innerHTML = `<div class="scr-bg" style="background-image:url(${bg})"></div><div class="scr-shade sm-shade"></div>
      ${App.topbar({ title: 'The Sect', cn: '百花阁', chips: ['cur:spirit_stones', 'cur:immortal_jade', 'cur:sect_merit'] })}
      <div class="sm-blds"></div>
      <div class="sm-note mut">Main Hall level ${bldLevel('bld:main_hall')} of ${bldCap('bld:main_hall')}: each chapter of the Journey lets the Pavilion rise two more levels.</div>`;
    draw();
    const timer = setInterval(() => { if (!el.isConnected) { clearInterval(timer); return; } draw(); }, 1000);
    App.bind(el, {
      open: (b) => {
        const id = b.dataset.id, bd = get(id);
        if (BETA.has(id)) { App.toast(`${esc(bd.name)}: ${esc(bd.does)}. It opens with the content beta.`); return; }
        if (!bldUnlocked(id)) { App.toast(`${esc(bd.name)} opens when you clear ${esc(get(bd.unlock?.clear)?.name || 'more of the Journey')}`); return; }
        if (SCREEN_OF[id]) { App.go(...SCREEN_OF[id]); return; }
        App.go('bld', { id });
      },
    });
  },
});

// ---------------- one building ----------------
App.register('bld', {
  cls: 'bld',
  render(el, params) {
    const { id } = params, b = get(id);
    const lv = bldLevel(id), cap = bldCap(id), cost = upgradeCostOf(id);
    const again = (o = {}) => App.go('bld', { ...params, ...o }, { replace: true });
    const body = { [CAVES]: caveBody, [GARDEN]: gardenBody, [ALCH]: alchemyBody, [MH]: missionBody, 'bld:tea_house': teaBody, [AP]: arrayBody, 'bld:main_hall': hallBody }[id];
    el.innerHTML = `<div class="scr-bg" style="background-image:url(${hasArt('bg/sect_mountain.webp') ? 'assets/bg/sect_mountain.webp' : 'assets/bg/pavilion.webp'});filter:blur(5px) brightness(.45)"></div><div class="scr-shade"></div>
      ${App.topbar({ title: b.name, cn: b.cn, chips: CHIPS[id] || ['cur:spirit_stones', 'cur:immortal_jade', 'cur:sect_merit'] })}
      <div class="bl-side panel"><div class="bl-ic">${bldIcon(id)}</div><h2>${esc(b.name)}</h2><div class="cnh">${esc(b.cn)}</div>
        <div class="bl-lvl">Level <b>${lv}</b> / ${b.maxLevel || 10}</div><p class="mut">${esc(b.does)}.</p>
        ${lv < (b.maxLevel || 10) && cost ? `<div class="sd-h">LEVEL ${lv + 1}</div>${costRow(cost)}
          <button class="btn${lv < cap && canPay(cost) ? '' : ' off'}" data-act="up">${lv < cap ? 'Raise' : (id === 'bld:main_hall' ? 'Clear another chapter' : 'Raise the Main Hall first')}</button>` : '<div class="tm-max">Highest level</div>'}
      </div>
      <div class="bl-main panel">${body ? body(params) : ''}</div>`;
    const timer = setInterval(() => { if (!el.isConnected) { clearInterval(timer); return; } el.querySelectorAll('[data-end]').forEach(x => { const left = +x.dataset.end - Date.now(); x.textContent = left > 0 ? hhmm(left) : 'Ready'; if (left <= 0 && !x.dataset.done) { x.dataset.done = 1; again(); } }); el.querySelectorAll('[data-cave]').forEach(x => { x.textContent = `${num(caveExp(x.dataset.cave))} EXP · ${caveHours(x.dataset.cave).toFixed(1)}h`; }); }, 1000);
    App.bind(el, {
      up: () => { if (!upgradeBld(id)) { App.toast('Not enough Spirit Stones'); return; } sfx('charge'); App.toast(`${esc(b.name)} rises to level ${bldLevel(id)}`); again(); },
      ...bldHandlers(id, params, again),
    });
  },
});
const CHIPS = { [CAVES]: ['cur:spirit_stones', 'item:qi_gathering_pill', 'item:enlightenment_scroll'], [GARDEN]: ['cur:spirit_stones', 'item:spirit_grass', 'item:blood_ginseng'],
  [ALCH]: ['cur:spirit_stones', 'item:spirit_grass', 'item:blood_ginseng'], [AP]: ['cur:spirit_stones', 'item:array_flag', 'cur:immortal_jade'], 'bld:tea_house': ['cur:spirit_stones', 'cur:immortal_jade', 'cur:blossom_dew'] };

/** Pick a heroine: a grid of the owned ones (busy ones dimmed). Resolves with her id or null. */
function pickHeroine(title, { exclude = [], allowBusy = false, note = '' } = {}) {
  const list = ownedHeroes().filter(h => !exclude.includes(h)).sort((a, b) => (prog(b).level - prog(a).level) || (get(b).rarity - get(a).rarity));
  return App.dialog({
    title, cn: '择人', body: `${note ? `<p class="mut">${note}</p>` : ''}<div class="pk-grid">${list.map(h => { const busy = !allowBusy && sectBusy(h);
      return `<button class="pk${busy ? ' busy' : ''}" data-h="${h}">${faceOf(h)}<b>${esc(get(h).name)}</b><small>Lv ${prog(h).level}${busy ? (inCaves(h) ? ' · in seclusion' : ' · on expedition') : ''}</small></button>`; }).join('') || '<p class="mut">No heroine is free.</p>'}</div>`,
    buttons: [{ label: 'Cancel', cls: 'ink', value: null }],
    onOpen: (w, close) => w.addEventListener('click', e => { const b = e.target.closest('.pk'); if (b && !b.classList.contains('busy')) close(b.dataset.h); }),
  });
}

function caveBody() {
  const hs = Object.keys(SECT().caves), slots = caveSlots();
  return `<div class="sd-h">IN SECLUSION · ${hs.length}/${slots}</div>
    <p class="mut">Up to ${slots} heroines gain <b class="gold">${num(caveRate())} EXP an hour</b> each while you are away, for up to ${get(CAVES).maxHours} hours; EXP past her level cap is banked. Each full 4 hours may bring an epiphany: a free mastery level.</p>
    <div class="cv-grid">${[...Array(slots)].map((_, i) => { const h = hs[i];
      return h ? `<div class="cv-slot on"><div class="cv-f">${faceOf(h)}</div><b>${esc(get(h).name)}</b><small>Lv ${prog(h).level}</small><em data-cave="${h}">${num(caveExp(h))} EXP · ${caveHours(h).toFixed(1)}h</em>
          <div class="cv-b"><button class="btn sm jade" data-act="cv-collect" data-h="${h}">Collect</button><button class="btn sm ink" data-act="cv-leave" data-h="${h}">Leave</button></div></div>`
        : '<button class="cv-slot" data-act="cv-add"><span class="g">＋</span><small>Seat a heroine</small></button>'; }).join('')}</div>
    ${hs.length ? '<div class="sd-btns"><button class="btn jade" data-act="cv-all">Collect all</button></div>' : ''}`;
}
function gardenBody() {
  const y = gardenYield(), b = get(GARDEN), L = bldLevel(GARDEN);
  const all3 = (b.produces || []).map(p => { const id = p.cur || p.item, it = y.items.find(i => i.id === id), open = herbOpen(p, L) && !!it;
    const why = L < (p.fromLevel || 1) ? `From level ${p.fromLevel}` : !herbOpen(p, L) ? `Grows once a heroine reaches ${esc(get(p.fromRealm)?.name || 'its realm')}` : 'Not planted yet';
    return `<div class="gd-row${open ? '' : ' locked'}"><div class="rw-i" data-tip="${id}">${iconUrl(id) ? `<img src="${iconUrl(id)}" alt="">` : ''}</div><span><b>${esc(get(id).name)}</b><small>${open ? `${+(it.perHour).toFixed(2)} an hour` : why}</small></span><em>${open ? num(it.qty) : ''}</em></div>`; }).join('');
  return `<div class="sd-h">THE BEDS · ${y.hours.toFixed(1)} / ${y.cap} HOURS</div><div class="expbar"><i style="width:${(y.hours / y.cap * 100).toFixed(1)}%"></i></div>
    <p class="mut">The garden grows for up to ${y.cap} hours between harvests; each level makes it grow ${Math.round((b.levelBonus || 0) * 100)}% faster.</p>
    <div class="gd-list">${all3}</div><div class="sd-btns"><button class="btn jade${y.items.some(i => i.qty > 0) ? '' : ' off'}" data-act="harvest">Harvest</button></div>`;
}
const RECIPE_GROUPS = [['EXP pills', r => /qi_gathering|spirit_condensing|heaven_earth|nine_revolution/.test(r.id)], ['Breakthrough pills', r => /foundation|golden_core|nascent|severing|void|integration|mahayana/.test(r.id)],
  ['Elixirs', r => /elixir/.test(r.id)], ['Essences', r => /refine_/.test(r.id)]];
function alchemyBody({ sel, n = 1 }) {
  const rs = (get(ALCH).recipes || []).map(get).filter(Boolean), cur = get(sel) || rs[0], odds = qualityOdds(), al = SECT().alchemy.alchemist;
  const jobs = brews(), now = Date.now();
  return `<div class="al-top"><div><div class="sd-h">FURNACES · ${jobs.length}/${furnaces()}</div>
      ${jobs.map((j, i) => `<div class="al-job${now >= j.end ? ' ready' : ''}"><div class="rw-i" data-tip="${get(j.recipe).output.item}">${iconUrl(get(j.recipe).output.item) ? `<img src="${iconUrl(get(j.recipe).output.item)}" alt="">` : ''}</div><span><b>${esc(get(get(j.recipe).output.item).name)} ×${j.count}</b><small data-end="${j.end}">${now >= j.end ? 'Ready' : hhmm(j.end - now)}</small></span>${now >= j.end ? `<button class="btn sm jade" data-act="al-collect" data-i="${i}">Collect</button>` : ''}</div>`).join('') || '<p class="mut">The furnaces are cold.</p>'}</div>
    <div class="al-alch"><div class="sd-h">ALCHEMIST</div><button class="al-pick" data-act="al-who">${al ? `${faceOf(al)}<b>${esc(get(al).name)}</b><small>${esc(get(get(al).path).name)}${get(al).path === 'path:healer' ? ': the best quality' : ''}</small>` : '<span class="g">＋</span><small>Assign a heroine (healers brew best)</small>'}</button>
      <div class="al-odds">${Object.entries(odds).map(([k, v]) => `<span class="q-${k.toLowerCase()}">${k} ${Math.round(v * 100)}%</span>`).join('')}</div></div></div>
    <div class="al-wrap"><div class="al-list">${RECIPE_GROUPS.map(([g, f]) => `<div class="sd-h">${g.toUpperCase()}</div>${rs.filter(f).map(r => `<button class="al-r${r === cur ? ' on' : ''}" data-act="al-sel" data-r="${r.id}"><div class="rw-i" data-tip="${r.output.item}">${iconUrl(r.output.item) ? `<img src="${iconUrl(r.output.item)}" alt="">` : ''}</div><span>${esc(get(r.output.item).name)}<small>${r.hours} h</small></span></button>`).join('')}`).join('')}</div>
    <div class="al-detail"><h3>${esc(get(cur.output.item).name)}</h3><p class="mut">${esc(get(cur.output.item).about || cur.note || '')}</p>
      <div class="sd-h">PER BREW · ${cur.hours} HOURS${cur.quality ? ' · QUALITY ROLLED' : ''}</div>${costRow(cur.inputs.map(c => ({ ...c, qty: c.qty * n })))}
      <div class="al-n"><button data-act="al-n" data-d="-1">−</button><span>×${n}</span><button data-act="al-n" data-d="1">+</button><small>${cur.hours * n} hours in one furnace</small></div>
      ${cur.quality ? '<p class="mut">High quality yields two, Perfect three.</p>' : ''}
      <div class="sd-btns"><button class="btn${jobs.length < furnaces() && canPay(cur.inputs.map(c => ({ ...c, qty: c.qty * n }))) ? '' : ' off'}" data-act="al-brew" data-r="${cur.id}">${jobs.length < furnaces() ? 'Brew' : 'Every furnace is busy'}</button></div></div></div>`;
}
/** The expedition shown: the one picked, or the first open one that is not out. */
function curExped(sel) { const ex = (get(MH).expeditions || []).map(get).filter(Boolean); return get(sel) || ex.find(e => expedOpen(e) && !SECT().missions[e.id]) || ex[0]; }
function missionBody({ sel, team = [] }) {
  const ex = (get(MH).expeditions || []).map(get).filter(Boolean), out = SECT().missions, now = Date.now();
  const cur = curExped(sel);
  const chk = expedCheck(cur, team), need = cur.requires?.heroines || 1;
  const reqChips = e => `${(e.requires?.phases || []).map(p => phTag(phaseOf(p))).join('')}${(e.requires?.paths || []).map(p => `<span class="ms-path">${esc(get(p).name)}</span>`).join('')}${e.requires?.power ? `<span class="ms-path">${compact(e.requires.power)} power</span>` : ''}`;
  return `<div class="sd-h">EXPEDITIONS · ${Object.keys(out).length}/${missionSlots()} OUT</div>
    <div class="ms-wrap"><div class="ms-list">${ex.map(e => { const m = out[e.id], open = expedOpen(e);
      return `<button class="ms-r${e === cur ? ' on' : ''}${open ? '' : ' locked'}" data-act="ms-sel" data-e="${e.id}"><span><b>${esc(e.name)}</b><small>${e.hours} h · ${e.requires?.heroines || 1} heroines${open ? '' : ` · Mission Hall ${expedLevel(e)}`}</small></span><span class="ms-req">${reqChips(e)}</span>${m ? `<em class="${now >= m.end ? 'hot' : ''}" data-end="${m.end}">${now >= m.end ? 'Back' : hhmm(m.end - now)}</em>` : ''}</button>`; }).join('')}</div>
    <div class="ms-detail"><h3>${esc(cur.name)}</h3><div class="ms-req big">${reqChips(cur)}<span class="ms-path">${need} heroines · ${cur.hours} hours</span></div>
      <div class="sd-h">BRINGS BACK</div><div class="got" style="justify-content:flex-start">${(cur.rewards || []).map(r => rewardChip(r)).join('')}</div>
      <p class="mut">${(cur.rewards || []).filter(r => r.chance && r.chance < 1).map(r => `${esc(get(r.item || r.cur).name)} ${Math.round(r.chance * 100)}%`).join(' · ')}</p>
      ${out[cur.id] ? `<div class="sd-h">OUT NOW</div><div class="ms-team">${out[cur.id].heroes.map(h => `<div class="ms-t on">${faceOf(h)}</div>`).join('')}</div>
        ${now >= out[cur.id].end ? `<div class="sd-btns"><button class="btn jade" data-act="ms-collect" data-e="${cur.id}">Welcome them back</button></div>` : `<p class="mut">Back in <b data-end="${out[cur.id].end}">${hhmm(out[cur.id].end - now)}</b>.</p>`}`
      : `<div class="sd-h">THE PARTY</div><div class="ms-team">${[...Array(need)].map((_, i) => team[i] ? `<button class="ms-t on" data-act="ms-drop" data-i="${i}">${faceOf(team[i])}</button>` : '<button class="ms-t" data-act="ms-add"><span class="g">＋</span></button>').join('')}</div>
        <p class="${chk.ok ? 'gold' : 'mut'}">${chk.ok ? `Ready to leave · ${num(chk.power)} power` : `Needs: ${chk.missing.join(' · ')}`}</p>
        <div class="sd-btns"><button class="btn${chk.ok && expedOpen(cur) && Object.keys(out).length < missionSlots() ? '' : ' off'}" data-act="ms-go" data-e="${cur.id}">${expedOpen(cur) ? (Object.keys(out).length < missionSlots() ? 'Set out' : 'Every slot is out') : `Mission Hall level ${expedLevel(cur)}`}</button></div>`}</div></div>`;
}
function teaBody() {
  const t = teaToday(), list = ownedHeroes().sort((a, b) => (get(b).rarity - get(a).rarity) || get(a).name.localeCompare(get(b).name));
  return `${npcSays('npc:tao_yao', `<p>${t ? `“You already shared a pot with <b class="gold">${esc(get(t).name)}</b> today. The leaves need a night to forgive us.”` : '“The kettle is singing. Who will you take tea with today?”'}</p><p class="mut">One tea a day: +${Math.round((get('rules:growth').bondPoints.tea || 30) * (1 + (get('bld:tea_house').teaBonusPerLevel || 0) * (bldLevel('bld:tea_house') - 1)))} bond. Gifts and the hall's heroine are chosen here too.</p>`)}
    <div class="th-grid">${list.map(h => `<div class="th-h${t === h ? ' tea' : ''}">${faceOf(h)}<b>${esc(get(h).name)}</b><small>Bond ${bondLevel(prog(h).bond || 0)}${data().lobby === h ? ' · in the hall' : ''}</small>
      <div class="th-b"><button class="btn sm jade${t ? ' off' : ''}" data-act="th-tea" data-h="${h}">Tea</button><button class="btn sm" data-act="th-gift" data-h="${h}">Gift</button><button class="btn sm ink${data().lobby === h ? ' off' : ''}" data-act="th-hall" data-h="${h}">Hall</button></div></div>`).join('')}</div>`;
}
function arrayBody() {
  const cap = bldLevel(AP);
  return `<div class="sd-h">BATTLE ARRAYS · UP TO LEVEL ${cap}</div><p class="mut">An array's bonuses double from level 1 to level 10. The Array Platform's level caps them. Array Flags come from the Myriad Treasures Hall and the Merit Exchange.</p>
    ${arraysOpen().map(a => { const L = arrayLevel(a.id), c = arrayUpCost(a.id);
      return `<div class="ar-row"><div class="ar-h"><b>${esc(a.name)} 阵</b><small>${esc(a.theme)} · level ${L}</small></div>
        <div class="ar-pos">${[0, 1, 2, 3].map(i => `<span>${i + 1}: ${esc(arrayText(a.id, i, L))}${c ? ` <i>→ ${esc(arrayText(a.id, i, L + 1).replace(/, taunts$/, ''))}</i>` : ''}</span>`).join('')}</div>
        ${c ? `<div class="tm-up">${costRow(c)}<button class="btn sm${L < cap && canPay(c) ? '' : ' off'}" data-act="ar-up" data-a="${a.id}">${L < cap ? `Level ${L + 1}` : 'Raise the platform'}</button></div>` : '<div class="tm-max">Highest level</div>'}</div>`; }).join('')}`;
}
function hallBody() {
  const board = p => { const b = dutyBoard(p);
    return `<div class="du-box"><div class="sd-h">${p === 'daily' ? 'TODAY' : 'THIS WEEK'} · ${b.points} / ${b.max} POINTS</div>
      <div class="du-track"><div class="expbar"><i style="width:${Math.min(100, b.points / b.max * 100)}%"></i></div>${b.tiers.map((t, i) => `<button class="du-chest${t.ready ? ' ready' : ''}${t.claimed ? ' claimed' : ''}" style="left:${t.at / b.max * 100}%" data-act="du-claim" data-p="${p}" data-i="${i}" title="${t.rewards.map(r => `${get(r.cur || r.item).name} ×${r.qty}`).join(', ')}"><span class="g">${t.claimed ? '✓' : '箱'}</span><small>${t.at}</small></button>`).join('')}</div>
      ${b.rows.map(x => `<div class="du-row${x.done ? ' done' : ''}${LATER.has(x.r.id) ? ' later' : ''}"><b>${esc(x.r.name)}</b><span>${LATER.has(x.r.id) ? 'content beta' : `${Math.min(x.n, x.r.count || 1)}/${x.r.count || 1}`}</span><em>+${x.r.points}</em></div>`).join('')}</div>`; };
  return `<p class="mut">The Main Hall's level caps every other building. Each Journey chapter you clear lets it rise two more levels (now ${bldCap('bld:main_hall')}).</p><div class="du-wrap">${board('daily')}${board('weekly')}</div>`;
}

function bldHandlers(id, params, again) {
  const p = params;
  return {
    'cv-add': async () => { const h = await pickHeroine('Who enters seclusion?', { note: 'Heroines on an expedition cannot enter.' }); if (h && enterCaves(h)) { sfx('heal'); again(); } },
    'cv-collect': (b) => caveResult([collectCave(b.dataset.h)]).then(again),
    'cv-leave': (b) => caveResult([collectCave(b.dataset.h, true)]).then(again),
    'cv-all': () => caveResult(Object.keys(SECT().caves).map(h => collectCave(h))).then(again),
    harvest: async () => { const got = harvest(); if (!got.length) return; sfx('heal'); await App.rewardsDialog(got, 'Harvest', '收获'); again(); },
    'al-sel': (b) => again({ sel: b.dataset.r, n: 1 }),
    'al-n': (b) => again({ n: Math.max(1, Math.min(get(ALCH).maxBatch || 10, (p.n || 1) + +b.dataset.d)) }),
    'al-brew': (b) => { if (!startBrew(b.dataset.r, p.n || 1)) { App.toast(brews().length >= furnaces() ? 'Every furnace is busy' : 'Missing ingredients'); return; } sfx('charge'); again(); },
    'al-collect': async (b) => {
      const r = collectBrew(+b.dataset.i); if (!r) return;
      const perfect = r.rolls.Perfect;
      sfx(perfect ? 'thunder' : 'heal');
      await App.dialog({ title: perfect ? 'A Perfect pill!' : 'The furnace opens', cn: perfect ? '丹劫' : '出炉',
        body: `${perfect ? '<div class="pill-bolt"></div>' : ''}<div class="got" style="justify-content:center">${rewardChip({ item: r.recipe.output.item, qty: r.total })}</div><p style="text-align:center">${r.count} brew${r.count > 1 ? 's' : ''}: ${Object.entries(r.rolls).map(([k, v]) => `<span class="q-${k.toLowerCase()}">${k} ×${v}</span>`).join(' · ') || 'refined'} → <b class="gold">${esc(get(r.recipe.output.item).name)} ×${r.total}</b></p>`, buttons: [{ label: 'Wonderful', value: true }] });
      again();
    },
    'al-who': async () => { const h = await pickHeroine('Who tends the furnace?', { allowBusy: true, note: 'Any heroine can be the alchemist, even on an expedition; healers raise the quality most.' }); if (h) { setAlchemist(h); again(); } },
    'ms-sel': (b) => again({ sel: b.dataset.e, team: [] }),
    'ms-add': async () => { const cur = curExped(p.sel); const h = await pickHeroine('Who sets out?', { exclude: p.team || [], note: `${esc(cur.name)} needs ${expedCheck(cur, []).missing.join(' · ')}.` }); if (h) again({ sel: cur.id, team: [...(p.team || []), h] }); },
    'ms-drop': (b) => again({ team: (p.team || []).filter((_, i) => i !== +b.dataset.i) }),
    'ms-go': (b) => { if (!startExped(b.dataset.e, p.team || [])) { App.toast('The party does not meet the needs yet'); return; } sfx('whoosh'); again({ team: [] }); },
    'ms-collect': async (b) => { const r = collectExped(b.dataset.e); if (!r) return; sfx('heal'); await App.rewardsDialog(mergeRewards(r.out), `${r.e.name}: back home`, '归来'); again(); },
    'th-tea': async (b) => { await teaDialog(b.dataset.h); again(); },
    'th-gift': (b) => giftDialog(b.dataset.h).then(again),
    'th-hall': (b) => { data().lobby = b.dataset.h; persist(); App.toast(`${esc(get(b.dataset.h).name)} now waits in the hall`); again(); },
    'ar-up': (b) => { if (!upgradeArray(b.dataset.a)) { App.toast('Not enough Array Flags or Spirit Stones'); return; } sfx('charge'); App.toast(`${esc(get(b.dataset.a).name)} reaches level ${arrayLevel(b.dataset.a)}`); again(); },
    'du-claim': async (b) => { const got = claimDutyChest(b.dataset.p, +b.dataset.i); if (!got) return; sfx('crit'); await App.rewardsDialog(got, 'Duty chest', '宗门功课'); again(); },
  };
}
async function caveResult(rs) {
  rs = rs.filter(Boolean); if (!rs.length) return;
  sfx('heal');
  const lines = rs.map(r => `<p><b class="gold">${esc(get(r.hid).name)}</b>: +${num(r.exp)} EXP${r.lv && r.lv.after > r.lv.before ? `, level ${r.lv.after}!` : ''}${r.lv?.atCap ? ' (banked at her cap)' : ''}${r.epiphany ? ` · <b>Epiphany!</b> ${esc(get(r.epiphany.sid).name)} reaches mastery +${r.epiphany.level}` : ''}</p>`).join('');
  await App.dialog({ title: 'Closed-door cultivation', cn: '闭关', body: lines, buttons: [{ label: 'Good', value: true }] });
}

// ---------------- the Market ----------------
App.register('market', {
  cls: 'market',
  render(el, { tab = 'shop:myriad_treasures' } = {}) {
    const shop = get(tab), shops = ['shop:myriad_treasures', 'shop:merit_exchange'];
    el.innerHTML = `<div class="scr-bg" style="background-image:url(assets/bg/pavilion.webp);filter:blur(5px) brightness(.45)"></div><div class="scr-shade"></div>
      ${App.topbar({ title: 'Market', cn: '市集', chips: tab === 'shop:merit_exchange' ? ['cur:sect_merit', 'cur:spirit_stones', 'cur:immortal_jade'] : ['cur:spirit_stones', 'cur:immortal_jade', 'cur:fate_incense'] })}
      <div class="mk panel"><div class="tabs">${shops.map(s => `<button class="${s === tab ? 'on' : ''}" data-act="tab" data-t="${s}">${esc(get(s).name)}</button>`).join('')}</div>
        <p class="mut">${tab === 'shop:merit_exchange' ? 'Tao Yao trades the Sect\'s stores for Sect Merit, earned from duties and expeditions.' : 'Madam Jin\'s guild sells a little of everything.'} Limits refresh every Monday. Nothing here costs real money.</p>
        <div class="mk-grid">${shop.stock.map((row, i) => { const id = row.item || row.cur, left = stockLeft(tab, i), price = row.price[0];
          return `<div class="mk-i${left <= 0 ? ' sold' : ''}"><div class="rw-i" data-tip="${id}">${iconUrl(id) ? `<img src="${iconUrl(id)}" alt="">` : '<span class="g">物</span>'}${row.qty > 1 ? `<em>${row.qty}</em>` : ''}</div>
            <b>${esc(get(id).name)}</b><small>${row.limit ? `${Math.max(0, left)} of ${row.limit} left` : 'No limit'}</small>
            <button class="btn sm${left > 0 && canPay(row.price) ? '' : ' off'}" data-act="buy" data-i="${i}"><img class="ic" src="${iconUrl(price.cur || price.item)}" alt="">${compact(price.qty)}</button></div>`; }).join('')}</div></div>`;
    App.bind(el, {
      tab: (b) => App.go('market', { tab: b.dataset.t }, { replace: true }),
      buy: (b) => { const got = buy(tab, +b.dataset.i); if (!got) { App.toast('You cannot afford that'); return; } sfx('heal'); App.toast(`Bought ${esc(get(got[0].item || got[0].cur).name)} ×${got[0].qty}`); App.go('market', { tab }, { replace: true }); },
    });
  },
});
