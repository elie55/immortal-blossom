// The player's save: one JSON document kept in IndexedDB (localStorage as a fallback, memory if both fail),
// with a schema version, a checksum, autosave and export/import as text. Also the rules that change it:
// rewards and costs, EXP and breakthroughs, stage clears and stars, summons.
import { get, all, expToNext, levelCap, nextRealm, SLICE_HEROES, battleExp, heroStats } from './data.js';
import { rollGearEntry, makeArtefact, refineCost, refineOnce, salvageValue, engrave, engraveCost, canReforge, reforgeCost, nextTier, gearBonus, withGear, canWear, POSITIONS, POS_SLOT, rarityOrder, tierOrder, rollScore } from './gear.js';

const SCHEMA = 2;
const DB_NAME = 'immortal-blossoms', STORE = 'saves', SLOT = 'slot1', LS_KEY = 'ib_save_slot1';

export function freshSave() {
  return {
    v: SCHEMA, created: Date.now(), updated: Date.now(),
    cur: { 'cur:spirit_stones': 0, 'cur:immortal_jade': 0, 'cur:fate_incense': 0, 'cur:blossom_dew': 0 },
    items: {},
    heroes: {},
    team: [],
    lobby: null,
    stages: {},
    chapterRewards: {},
    pond: { pulls: 0, pity: 0, fatePoints: 0, guided: false },
    // the Storage Ring: every piece by id; recently salvaged pieces (newest first) with what they returned
    gear: { seq: 0, pieces: {}, recent: [], auto: freshAuto(), view: { sort: 'rarity', dir: -1, filter: {} } },
    forge: { job: null },
    flags: { seen: {} },
    settings: { muted: false, speed: 1, textSpeed: 1 },
    log: { battles: 0, wins: 0, playMs: 0 },
  };
}
/** Auto-salvage rules: off until the player sets them. */
export function freshAuto() { return { on: false, below: 'rarity:rare', belowTier: false, minScore: 0, allowTop: false, keepAbove: 0.9 }; }
export const SAVE = { data: freshSave(), storage: 'memory' };
const D = () => SAVE.data;

// ---------------- persistence ----------------
function checksum(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); }
function pack(data) { const body = JSON.stringify(data); return { body, sum: checksum(body) }; }
function unpack(rec) {
  if (!rec || typeof rec.body !== 'string') return null;
  if (checksum(rec.body) !== rec.sum) console.warn('save checksum mismatch: the save was edited or damaged');
  return migrate(JSON.parse(rec.body));
}
function migrate(d) {
  const base = freshSave();
  // future schema changes upgrade d.v here; unknown fields are kept, missing ones filled
  for (const k of Object.keys(base)) if (d[k] === undefined) d[k] = base[k];
  d.cur = { ...base.cur, ...d.cur }; d.pond = { ...base.pond, ...d.pond }; d.flags = { ...base.flags, ...d.flags }; d.settings = { ...base.settings, ...d.settings };
  // schema 2: the Storage Ring; Spirit Artefacts kept as items become pieces
  d.forge = { ...base.forge, ...d.forge };
  d.gear = { ...base.gear, ...d.gear }; d.gear.auto = { ...freshAuto(), ...d.gear.auto }; d.gear.view = { ...base.gear.view, ...d.gear.view };
  for (const h of Object.values(d.heroes)) if (!h.eq) h.eq = {};
  for (const k of Object.keys(d.items)) if (k.startsWith('art:')) { for (let i = 0; i < d.items[k]; i++) storePiece(d, makeArtefact(k, 'rarity:rare')); delete d.items[k]; }
  d.v = SCHEMA;
  return d;
}
function idb() {
  return new Promise((res, rej) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    } catch (e) { rej(e); }
  });
}
async function idbGet() { const db = await idb(); return new Promise((res, rej) => { const r = db.transaction(STORE).objectStore(STORE).get(SLOT); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbPut(v) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(v, SLOT); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }

export async function loadSave() {
  try { const rec = await idbGet(); const d = unpack(rec); if (d) { SAVE.data = d; SAVE.storage = 'idb'; return true; } SAVE.storage = 'idb'; } catch (e) { /* no IndexedDB here */ }
  try { const raw = localStorage.getItem(LS_KEY); const d = raw && unpack(JSON.parse(raw)); if (d) { SAVE.data = d; SAVE.storage = 'local'; return true; } if (SAVE.storage === 'memory') SAVE.storage = 'local'; } catch (e) { /* no storage */ }
  return false;
}
let saveTimer = null;
export function persist(now = false) {
  D().updated = Date.now();
  clearTimeout(saveTimer);
  const go = async () => {
    const rec = pack(D());
    try { await idbPut(rec); SAVE.storage = 'idb'; return; } catch (e) { /* fall through */ }
    try { localStorage.setItem(LS_KEY, JSON.stringify(rec)); SAVE.storage = 'local'; } catch (e) { SAVE.storage = 'memory'; }
  };
  if (now) return go();
  saveTimer = setTimeout(go, 400);
}
export const hasProgress = () => !!(D().stages['stage:v1c1_01']?.clear || D().flags.started);
export function resetSave() { SAVE.data = freshSave(); return persist(true); }
export function exportCode() { const rec = pack(D()); return btoa(unescape(encodeURIComponent(JSON.stringify(rec)))); }
export function importCode(code) {
  const rec = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
  const d = unpack(rec); if (!d || !d.cur) throw new Error('Not an Immortal Blossoms save');
  SAVE.data = d; return persist(true);
}

// ---------------- wallet ----------------
export const qty = id => (id.startsWith('cur:') ? D().cur[id] : D().items[id]) || 0;
function add(id, n) { if (id.startsWith('cur:')) D().cur[id] = (D().cur[id] || 0) + n; else D().items[id] = (D().items[id] || 0) + n; }
export function canPay(costs = []) { return costs.every(c => qty(c.cur || c.item) >= c.qty); }
export function pay(costs = []) { if (!canPay(costs)) return false; for (const c of costs) add(c.cur || c.item, -c.qty); persist(); return true; }
/** Grant a reward list; returns what was actually granted (heroes may become petals or Blossom Dew). */
export function grant(list = []) {
  const out = [];
  for (const r of list) {
    if (r.cur || r.item) { add(r.cur || r.item, r.qty); out.push({ ...r }); }
    else if (r.hero) out.push(gainHero(r.hero));
    else if (r.gear) out.push(addPiece(r.gear));
    else if (r.art) out.push(addPiece(makeArtefact(r.art, r.rarity || 'rarity:rare')));
  }
  persist();
  return out;
}

// ---------------- heroines ----------------
export const owned = hid => !!D().heroes[hid];
export const ownedHeroes = () => Object.keys(D().heroes).filter(h => get(h));
export const prog = hid => D().heroes[hid];
/** A heroine joins; a duplicate opens a Dao Blossom petal, and past six it becomes Blossom Dew. */
export function gainHero(hid) {
  const h = D().heroes[hid];
  if (!h) { D().heroes[hid] = { level: 1, exp: 0, bt: 0, petals: 0, bond: 0, eq: {}, got: Date.now() }; if (!D().lobby) D().lobby = hid; return { hero: hid, isNew: true }; }
  if (h.petals < 6) { h.petals++; return { hero: hid, petal: h.petals }; }
  const dew = { 3: 10, 4: 30, 5: 80 }[get(hid).rarity] || 10;
  add('cur:blossom_dew', dew);
  return { hero: hid, dew };
}
/** Add EXP up to the realm cap; EXP past the cap is banked and applies after the next breakthrough. */
export function addExp(hid, exp) {
  const p = D().heroes[hid]; if (!p) return null;
  const before = p.level;
  p.exp += Math.round(exp);
  const cap = levelCap(p.bt);
  while (p.level < cap && p.exp >= expToNext(p.level)) { p.exp -= expToNext(p.level); p.level++; }
  persist();
  return { before, after: p.level, atCap: p.level >= cap };
}
export const atCap = hid => { const p = prog(hid); return p && p.level >= levelCap(p.bt); };
export function breakthroughCost(hid) { const p = prog(hid); const r = p && nextRealm(p.bt); return r ? r.breakthroughCost || [] : null; }
export function breakthrough(hid) {
  const p = prog(hid), cost = breakthroughCost(hid);
  if (!p || !cost || !atCap(hid) || !pay(cost)) return false;
  p.bt++;
  addExp(hid, 0);
  persist();
  return true;
}
/** EXP pills: how much EXP a selection gives and what it costs in Spirit Stones (0.1 per EXP). */
export function pillPlan(sel) {
  let exp = 0; for (const [id, n] of Object.entries(sel)) exp += (get(id)?.exp || 0) * n;
  return { exp, stones: Math.round(exp * (get('rules:growth')?.spiritStonesPerExp ?? 0.1)) };
}
export function usePills(hid, sel) {
  const plan = pillPlan(sel);
  const costs = [...Object.entries(sel).filter(([, n]) => n > 0).map(([id, n]) => ({ item: id, qty: n })), { cur: 'cur:spirit_stones', qty: plan.stones }];
  if (!pay(costs)) return null;
  return addExp(hid, plan.exp);
}

// ---------------- stages ----------------
export const stageState = id => D().stages[id] || null;
export const isCleared = id => !!D().stages[id]?.clear;
export function isUnlocked(stage) {
  if (!stage.unlock) return true;
  if (stage.unlock.clear) return isCleared(stage.unlock.clear);
  return true;
}
export const stars = id => (D().stages[id]?.missions || []).filter(Boolean).length;
export function chapterStars(ch) {
  const battles = ch.stages.map(get).filter(s => s.waves);
  return { have: battles.reduce((a, s) => a + stars(s.id), 0), max: battles.length * 3 };
}
const STAR_AT = { 'one third': 1 / 3, 'two thirds': 2 / 3, all: 1 };
export function starRewardState(ch) {
  const { have, max } = chapterStars(ch), got = D().chapterRewards[ch.id] || [];
  return (ch.starRewards || []).map((r, i) => ({ need: Math.ceil(max * (STAR_AT[r.at] ?? 1)), rewards: r.rewards, claimed: !!got[i], ready: have >= Math.ceil(max * (STAR_AT[r.at] ?? 1)) }));
}
export function claimStarReward(ch, i) {
  const st = starRewardState(ch)[i]; if (!st || st.claimed || !st.ready) return null;
  (D().chapterRewards[ch.id] = D().chapterRewards[ch.id] || [])[i] = true;
  return grant(st.rewards);
}
/** Record a clear: first-clear rewards, drops, EXP and mission stars. */
export function clearStage(stage, result = {}) {
  const st = D().stages[stage.id] || (D().stages[stage.id] = { clear: false, missions: [false, false, false], clears: 0 });
  const first = !st.clear;
  st.clear = true; st.clears++;
  if (result.missions) st.missions = st.missions.map((m, i) => m || !!result.missions[i]);
  const rewards = [];
  if (first && stage.firstClearRewards) rewards.push(...stage.firstClearRewards);
  if (stage.drops && result.win !== false) for (let i = 0; i < (result.dropMul || 1); i++) rewards.push(...rollDrops(stage.drops)); // a doubled shrine rolls twice
  if (result.win !== false && result.extraDrops) rewards.push(...result.extraDrops);
  if (first && stage.unlocks) for (const u of stage.unlocks) D().flags[u] = true;
  const granted = grant(rewards);
  const exp = [];
  if (result.heroes && stage.waves) {
    const base = battleExp(stage);
    for (const h of result.heroes) { if (!owned(h.id)) continue; const gain = h.alive ? base : Math.round(base / 2); exp.push({ id: h.id, exp: gain, ...addExp(h.id, gain) }); }
  }
  D().log.wins++;
  persist();
  return { first, granted, exp, missions: st.missions };
}

// ---------------- drops ----------------
/** Roll a drop table: currencies, items, gear pieces and nested tables; "rolls" rolls it that many times. */
export function rollDrops(dropsId, depth = 0) {
  const d = get(dropsId); if (!d || depth > 3) return [];
  const out = [];
  for (let n = 0; n < (d.rolls || 1); n++) {
    for (const e of d.entries || []) {
      if (Math.random() > (e.chance ?? 1)) continue;
      if (e.gear) { if (e.gear.tier && get(e.gear.tier)) out.push({ gear: rollGearEntry(e.gear) }); continue; }
      if (e.drops) { out.push(...rollDrops(e.drops, depth + 1)); continue; }
      const [lo, hi] = Array.isArray(e.qty) ? e.qty : [e.qty || 1, e.qty || 1];
      const q = Math.round(lo + Math.random() * (hi - lo));
      if (e.cur) out.push({ cur: e.cur, qty: q }); else if (e.item) out.push({ item: e.item, qty: q });
    }
  }
  return out;
}

// ---------------- gear: the Storage Ring ----------------
const G = () => D().gear;
export const pieces = () => Object.values(G().pieces);
export const piece = id => G().pieces[id] || null;
function storePiece(d, p) { d.gear.seq++; const id = `g${d.gear.seq}`; d.gear.pieces[id] = { ...p, id, lock: false, hero: null, pos: null, got: Date.now(), new: true }; return d.gear.pieces[id]; }
/** Does an auto-salvage rule take this new piece? */
export function autoTakes(p, a = G().auto) {
  if (!a.on || p.kind === 'art') return false;
  if (rarityOrder(p.rarity) >= 7 && !a.allowTop) return false;                     // Immortal and Divine stay unless allowed
  if (a.keepAbove && [p.main.roll, ...p.subs.flatMap(s => s.rolls)].some(r => r >= a.keepAbove)) return false;
  if (a.below && rarityOrder(p.rarity) < rarityOrder(a.below)) return true;
  if (a.belowTier && tierOrder(p.tier) < highestTier()) return true;
  if (a.minScore && rollScore(p) < a.minScore) return true;
  return false;
}
const highestTier = () => pieces().reduce((m, p) => Math.max(m, p.kind === 'art' ? 0 : tierOrder(p.tier)), 0);
/** Put a new piece in the ring (or straight through auto-salvage). Returns a reward entry for the results. */
export function addPiece(p, opts = {}) {
  if (!opts.noAuto && autoTakes(p)) {
    const back = salvageValue(p);
    for (const c of back) add(c.cur || c.item, c.qty);
    remember({ ...p, id: null }, back);
    return { gear: p, salvaged: back };
  }
  return { gear: storePiece(D(), p) };
}
function remember(p, back) { G().recent.unshift({ piece: { ...p, hero: null, pos: null, lock: false }, back, at: Date.now() }); G().recent.length = Math.min(G().recent.length, 30); }
/** The pieces a heroine wears, by position. */
export function heroGear(hid) { const eq = D().heroes[hid]?.eq || {}; return POSITIONS.map(pos => (eq[pos] && piece(eq[pos])) || null); }
export const heroBonus = hid => gearBonus(heroGear(hid));
/** A heroine's stats with her gear on. */
export function finalStats(hid, level, bt) { const p = D().heroes[hid] || {}; return withGear(heroStats(hid, level ?? p.level ?? 1, bt ?? p.bt ?? 0), heroBonus(hid)); }
/** Equip a piece at a position (a ring may go on either ring finger). Takes it off whoever wore it. */
export function equip(hid, pos, id) {
  const p = piece(id), h = D().heroes[hid];
  if (!p || !h || POS_SLOT[pos] !== p.slot || !canWear(p, get(hid))) return false;
  if (p.hero) unequip(p.hero, p.pos);
  if (h.eq[pos]) unequip(hid, pos);
  h.eq[pos] = id; p.hero = hid; p.pos = pos; p.new = false;
  persist();
  return true;
}
export function unequip(hid, pos) {
  const h = D().heroes[hid]; const id = h?.eq?.[pos]; if (!id) return false;
  const p = piece(id); if (p) { p.hero = null; p.pos = null; }
  delete h.eq[pos]; persist();
  return true;
}
export function setLock(id, on) { const p = piece(id); if (p) { p.lock = !!on; persist(); } }
export function markSeen(ids) { for (const id of ids) { const p = piece(id); if (p) p.new = false; } persist(); }
/** Refine once; returns what changed, or null if it could not be paid. */
export function refine(id) {
  const p = piece(id); if (!p || p.plus >= 15) return null;
  if (!pay(refineCost(p))) return null;
  const r = refineOnce(p); persist(); return r;
}
/** Salvage pieces (locked and equipped ones are skipped). Returns the total returned. */
export function salvage(ids) {
  const total = {};
  for (const id of ids) {
    const p = piece(id); if (!p || p.lock || p.hero) continue;
    const back = salvageValue(p);
    for (const c of back) { add(c.cur || c.item, c.qty); total[c.cur || c.item] = (total[c.cur || c.item] || 0) + c.qty; }
    remember(p, back);
    delete G().pieces[id];
  }
  persist();
  return Object.entries(total).map(([k, qty]) => (k.startsWith('cur:') ? { cur: k, qty } : { item: k, qty }));
}
/** Restore a recently salvaged piece by paying back what it returned. */
export function restore(i) {
  const r = G().recent[i]; if (!r || !pay(r.back)) return null;
  G().recent.splice(i, 1);
  const p = storePiece(D(), r.piece); p.new = false; persist();
  return p;
}
export function engravePiece(id, i, key) {
  const p = piece(id); if (!p || p.engraved || !canPay(engraveCost(p))) return false;
  const probe = JSON.parse(JSON.stringify(p));
  if (!engrave(probe, i, key)) return false;
  pay(engraveCost(p)); p.subs = probe.subs; p.engraved = true; persist();
  return true;
}
export function reforge(id) {
  const p = piece(id); if (!p || !canReforge(p) || !pay(reforgeCost(p))) return false;
  p.tier = nextTier(p).id; persist();
  return true;
}
export function setAutoSalvage(rules) { G().auto = { ...G().auto, ...rules }; persist(); }

// ---------------- the Artifact Forge ----------------
/** The highest gear tier of anything cleared: what the Forge crafts at. */
export function highestTierId() {
  let best = 1;
  for (const [id, st] of Object.entries(D().stages)) if (st.clear) best = Math.max(best, tierOrder(get(id)?.tier) || 1);
  return all('tier').find(t => t.order === best)?.id || 'tier:i';
}
export const forgeJob = () => D().forge.job;
/** Start a recipe (paid now, ready after its hours). slot: the chosen slot for a set piece. */
export function startForge(recipeId, slot = null) {
  const r = get(recipeId); if (!r || D().forge.job) return false;
  if (r.requiresRealm && !ownedHeroes().some(h => (D().heroes[h].bt || 0) + 1 >= (get(r.requiresRealm)?.order || 99))) return false;
  if (!pay(r.inputs)) return false;
  const now = Date.now();
  D().forge.job = { recipe: recipeId, slot, start: now, end: now + (r.hours || 1) * 3600e3 };
  persist();
  return true;
}
/** Collect a finished job: the new piece goes to the ring (never through auto-salvage). */
export function collectForge(now = Date.now()) {
  const j = D().forge.job; if (!j || now < j.end) return null;
  const o = get(j.recipe).output;
  let got = null;
  if (o.gear) got = addPiece(rollGearEntry({ tier: highestTierId(), set: o.gear.set, slot: j.slot, rarityOdds: o.gear.rarityOdds }), { noAuto: true });
  else if (o.art) got = addPiece(makeArtefact(o.art, o.rarity || 'rarity:rare'), { noAuto: true });
  D().forge.job = null; persist();
  return got;
}

// ---------------- the Fate Pond ----------------
export function pondPool() {
  const pond = get('pond:fate_pond');
  const pool = pond.pool.filter(h => SLICE_HEROES.includes(h));
  const by = { 3: [], 4: [], 5: [] };
  for (const h of pool) by[get(h).rarity].push(h);
  return { pond, by };
}
export function pityLeft() { const p = get('pond:fate_pond').pity; return Math.max(0, p.guaranteedAt - D().pond.pity); }
/** Summon n heroines. The first ten-summon is guided: the featured 5★ and two founding Blossoms answer it. */
export function summon(n) {
  const cost = [{ cur: 'cur:fate_incense', qty: n }];
  if (!pay(cost)) return null;
  const { pond, by } = pondPool();
  const featured = pond.featured.order.find(h => by[5].includes(h)) || by[5][0];
  const res = [];
  if (n === 10 && !D().pond.guided) {
    D().pond.guided = true;
    const fours = by[4].filter(h => h !== 'hero:su_lianhua').sort(() => Math.random() - 0.5).slice(0, 2);
    const picks = [featured, ...fours];
    while (picks.length < 10) picks.push(by[3][Math.floor(Math.random() * by[3].length)] || by[4][0]);
    picks.sort(() => Math.random() - 0.5);
    for (const h of picks) { D().pond.pulls++; D().pond.fatePoints++; D().pond.pity = get(h).rarity === 5 ? 0 : D().pond.pity + 1; res.push(gainHero(h)); }
  } else {
    let gotFour = false;
    for (let i = 0; i < n; i++) {
      const p = pond.pity, pityN = D().pond.pity + 1;
      let r5 = pond.rates['5'];
      if (pityN >= p.softFrom) r5 += p.step * (pityN - p.softFrom + 1);
      if (pityN >= p.guaranteedAt) r5 = 1;
      const x = Math.random();
      let rar = x < r5 ? 5 : (x < r5 + pond.rates['4'] ? 4 : 3);
      if (n === 10 && i === 9 && !gotFour && rar === 3) rar = 4;
      if (!by[rar].length) rar = by[4].length ? 4 : 3;
      if (rar >= 4) gotFour = true;
      let h;
      if (rar === 5) h = Math.random() < pond.featured.share || by[5].length === 1 ? featured : by[5][Math.floor(Math.random() * by[5].length)];
      else h = by[rar][Math.floor(Math.random() * by[rar].length)];
      D().pond.pulls++; D().pond.fatePoints++; D().pond.pity = rar === 5 ? 0 : pityN;
      res.push(gainHero(h));
    }
  }
  persist();
  return res;
}
export const flags = () => D().flags;
export const settings = () => D().settings;
export const data = () => D();
