// Gear: pieces rolled from drop tables, their stat lines and values, refining, engraving, reforging, salvage,
// set counts and the bonus a heroine's equipped pieces give. Pure rules over the data; the save lives in state.js.
import { get, all, keyOf } from './data.js';

const R = () => get('rules:gear');
const PER = () => R().mainStatPerRefine; // 0.06 per refining level
const AT15 = () => 1 + PER() * R().refineMax;

/** Equip positions on a heroine, in display order; both rings share the ring slot. */
export const POSITIONS = ['weapon', 'helmet', 'body', 'gloves', 'pants', 'boots', 'ring1', 'ring2', 'pendant', 'artefact'];
export const POS_SLOT = { weapon: 'slot:weapon', helmet: 'slot:helmet', body: 'slot:body', gloves: 'slot:gloves', pants: 'slot:pants', boots: 'slot:boots', ring1: 'slot:ring', ring2: 'slot:ring', pendant: 'slot:pendant', artefact: 'slot:artefact' };
export const positionsFor = slot => POSITIONS.filter(p => POS_SLOT[p] === slot);

/** Every substat line a piece can carry, as "stat/form". */
export const SUB_KEYS = ['stat:atk/flat', 'stat:atk/pct', 'stat:hp/flat', 'stat:hp/pct', 'stat:def/flat', 'stat:def/pct', 'stat:crit/pct', 'stat:crit_dmg/pct', 'stat:haste/flat', 'stat:acc/pct', 'stat:res/pct'];
const FORM = { flat: 'flat', '%': 'pct', pct: 'pct' };
export const lineKey = l => `${l.stat}/${FORM[l.form] || l.form}`;
export const isPct = l => (FORM[l.form] || l.form) === 'pct';

const LABEL = { 'stat:atk': 'Attack', 'stat:hp': 'Health', 'stat:def': 'Defense', 'stat:crit': 'Crit chance', 'stat:crit_dmg': 'Crit damage', 'stat:haste': 'Haste', 'stat:acc': 'Accuracy', 'stat:res': 'Effect resistance', 'stat:heal_received': 'Healing received', 'stat:healing': 'Healing' };
const SHORT = { 'stat:atk': 'ATK', 'stat:hp': 'HP', 'stat:def': 'DEF', 'stat:crit': 'CRIT', 'stat:crit_dmg': 'CRIT DMG', 'stat:haste': 'Haste', 'stat:acc': 'ACC', 'stat:res': 'RES', 'stat:heal_received': 'Heal recv', 'stat:healing': 'Healing' };
export const statLabel = (stat, short = false) => (short ? SHORT : LABEL)[stat] || stat;
/** "+12%" or "+340". */
export function fmtStat(stat, form, v) {
  if ((FORM[form] || form) === 'pct') { const p = v * 100; return `+${p >= 10 ? Math.round(p) : Math.round(p * 10) / 10}%`; }
  return `+${Math.round(v)}`;
}

// ---------------- rarities and tiers ----------------
export const rarities = () => all('rarity').slice().sort((a, b) => a.order - b.order);
export const tiers = () => all('tier').slice().sort((a, b) => a.order - b.order);
export const rarityOrder = id => get(id)?.order || 0;
export const tierOrder = id => get(id)?.order || 0;
export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
export const RARITY_COLOR = { grey: '#9aa0a8', green: '#5fbf6a', blue: '#4f9bea', purple: '#a874f0', orange: '#f09a3e', red: '#ef5050', gold: '#f2c84b', prismatic: '#ffffff' };
export const rarityColor = id => RARITY_COLOR[get(id)?.color] || '#ccc';

// ---------------- randomness ----------------
const rollIn = ([lo, hi], rng) => Math.round((lo + rng() * (hi - lo)) * 1000) / 1000;
function pickWeighted(odds, rng) {
  const e = Object.entries(odds); const tot = e.reduce((s, [, w]) => s + w, 0);
  let x = rng() * tot;
  for (const [k, w] of e) { x -= w; if (x <= 0) return k; }
  return e[e.length - 1][0];
}
const pickOne = (arr, rng) => arr[Math.floor(rng() * arr.length) % arr.length];

// ---------------- values ----------------
/** The best value a stat line reaches on a tier: main stats at +15, substats per roll. */
const mainBest = (key, tier) => (R().mainStatAtTierVIII[key] || 0) * (get(tier)?.baseScale || 0.2);
const subUnit = (key, tier) => (R().substatRollAtTierVIII[key] || 0) * (get(tier)?.baseScale || 0.2);
export function mainValue(p, plus = p.plus) {
  if (p.kind === 'art') return null;
  return mainBest(lineKey(p.main), p.tier) * p.main.roll * (1 + PER() * plus) / AT15();
}
export const subValue = (p, s) => subUnit(lineKey(s), p.tier) * s.rolls.reduce((a, b) => a + b, 0);
/** The average of every roll gauge on the piece. */
export function rollScore(p) {
  if (p.kind === 'art') return get(p.rarity)?.artefactPower || 0;
  const rolls = [p.main.roll, ...p.subs.flatMap(s => s.rolls)];
  return rolls.reduce((a, b) => a + b, 0) / rolls.length;
}
/** A Spirit Artefact's strength as a share of its Divine +15 values. */
export const artefactPower = p => (get(p.rarity)?.artefactPower || 0.3) * (1 + 0.06 * p.plus) / 1.9;
export function artefactLines(p) {
  const a = get(p.art), k = artefactPower(p);
  return { atk: Math.round(a.divine.atk * k), hp: Math.round(a.divine.hp * k), power: k };
}

// ---------------- making pieces ----------------
/** A new substat line that the piece does not have yet. */
function newSub(p, rng) {
  const used = new Set([lineKey(p.main), ...p.subs.map(lineKey)]);
  const key = pickOne(SUB_KEYS.filter(k => !used.has(k)), rng);
  const [stat, form] = key.split('/');
  return { stat, form, rolls: [rollIn(get(p.rarity).rolls, rng)] };
}
/** Roll a piece: { slot, rarity, tier, set }. Weapons never belong to a set. */
export function makePiece({ slot, rarity, tier, set = null }, rng = Math.random) {
  const s = get(slot), r = get(rarity);
  const m = pickOne(s.mainStats, rng);
  const p = { kind: 'gear', slot, rarity, tier, set: s.countsForSets ? set : null, main: { stat: m.stat, form: FORM[m.form] || m.form, roll: rollIn(r.rolls, rng) }, subs: [], plus: 0, engraved: false };
  for (let i = 0; i < r.substatsAtDrop; i++) p.subs.push(newSub(p, rng));
  return p;
}
export const makeArtefact = (art, rarity) => ({ kind: 'art', slot: 'slot:artefact', art, rarity, plus: 0 });
const ANY_SLOTS = () => all('slot').filter(s => s.id !== 'slot:artefact').flatMap(s => Array(s.count || 1).fill(s.id));
/** Roll a drop table's gear entry: { tier, set | sets, slot: 'any' | id, rarityOdds }. */
export function rollGearEntry(g, rng = Math.random) {
  const slot = !g.slot || g.slot === 'any' ? pickOne(ANY_SLOTS(), rng) : g.slot;
  const set = g.set || (g.sets?.length ? pickOne(g.sets, rng) : null);
  return makePiece({ slot, rarity: pickWeighted(g.rarityOdds, rng), tier: g.tier, set }, rng);
}

// ---------------- refining, engraving, reforging, salvage ----------------
export const isMilestone = plus => R().refineMilestones.includes(plus);
/** What one more refining level costs. */
export function refineCost(p) {
  const L = p.plus + 1;
  if (p.kind === 'art') return [{ cur: 'cur:spirit_stones', qty: 500 * L }, { item: 'item:artefact_essence', qty: 1 + Math.floor(L / 5) }];
  const sc = get(p.tier).baseScale;
  return [{ cur: 'cur:spirit_stones', qty: Math.round(400 * L * sc) }, { item: 'item:forging_dust', qty: Math.max(1, Math.round(4 * L * sc)) }];
}
/** Everything spent refining the piece so far. */
export function refineSpent(p) {
  const out = {};
  for (let L = 0; L < p.plus; L++) for (const c of refineCost({ ...p, plus: L })) { const k = c.cur || c.item; out[k] = (out[k] || 0) + c.qty; }
  return out;
}
/** Refine one level in place. At +3, +6, +9, +12 and +15 a piece gains a substat (up to four) or raises a random one.
 *  Returns { gained, raised } naming the line that changed. */
export function refineOnce(p, rng = Math.random) {
  if (p.plus >= R().refineMax) return null;
  p.plus++;
  if (p.kind === 'art' || !isMilestone(p.plus)) return {};
  if (p.subs.length < R().substatsMax) { const s = newSub(p, rng); p.subs.push(s); return { gained: lineKey(s) }; }
  const s = pickOne(p.subs, rng); s.rolls.push(rollIn(get(p.rarity).rolls, rng));
  return { raised: lineKey(s) };
}
/** Engraving: replace substat i with the chosen stat line, rolled as many times as the old one, once per piece. */
export function engrave(p, i, key, rng = Math.random) {
  if (p.kind === 'art' || p.engraved || !p.subs[i]) return false;
  const others = new Set([lineKey(p.main), ...p.subs.filter((_, j) => j !== i).map(lineKey)]);
  if (others.has(key) || !SUB_KEYS.includes(key)) return false;
  const [stat, form] = key.split('/');
  p.subs[i] = { stat, form, rolls: p.subs[i].rolls.map(() => rollIn(get(p.rarity).rolls, rng)) };
  p.engraved = true;
  return true;
}
export const engraveCost = p => get(p.rarity)?.engraveCost || [];
/** Reforging raises a +15 piece one tier and keeps its rolls. */
export function nextTier(p) { const t = tiers(); const i = t.findIndex(x => x.id === p.tier); return t[i + 1] || null; }
export const canReforge = p => p.kind !== 'art' && p.plus >= R().refineMax && !!nextTier(p);
export const reforgeCost = p => nextTier(p)?.reforgeCost || [];
/** What salvaging a piece returns. */
export function salvageValue(p) {
  const r = get(p.rarity), mul = p.kind === 'art' ? 1 : get(p.tier).baseScale / 0.2;
  const out = {};
  for (const c of r.salvage || []) { const k = c.cur || c.item; out[k] = (out[k] || 0) + Math.round(c.qty * mul); }
  if (p.kind === 'art') out['item:artefact_essence'] = (out['item:artefact_essence'] || 0) + r.order;
  for (const [k, n] of Object.entries(refineSpent(p))) out[k] = (out[k] || 0) + Math.floor(n * 0.8);
  return Object.entries(out).map(([k, qty]) => (k.startsWith('cur:') ? { cur: k, qty } : { item: k, qty }));
}

// ---------------- a heroine's gear ----------------
/** Any heroine wears any piece; a Spirit Artefact only fits the paths it names ("all" fits everyone). */
export const canWear = (p, hero) => p.kind !== 'art' || (get(p.art)?.paths || ['all']).some(x => x === 'all' || x === hero.path);
/** Sum what a set of equipped pieces gives: flat and % stats, set bonuses and 4-piece effects, the artefact. */
export function gearBonus(pieces) {
  const t = { 'stat:atk/flat': 0, 'stat:atk/pct': 0, 'stat:hp/flat': 0, 'stat:hp/pct': 0, 'stat:def/flat': 0, 'stat:def/pct': 0, 'stat:crit/pct': 0, 'stat:crit_dmg/pct': 0, 'stat:haste/flat': 0, 'stat:acc/pct': 0, 'stat:res/pct': 0, 'stat:heal_received/pct': 0, 'stat:healing/pct': 0 };
  const add = (k, v) => { t[k] = (t[k] || 0) + v; };
  const count = {};
  let artefact = null;
  for (const p of pieces.filter(Boolean)) {
    if (p.kind === 'art') {
      const a = artefactLines(p); add('stat:atk/flat', a.atk); add('stat:hp/flat', a.hp); artefact = { id: p.art, power: a.power };
      // a passive that is a plain stat scales with the artefact's power like its Attack and Health
      for (const e of get(p.art).passive?.effects || []) if (e.do === 'stat' && get(p.art).passive.trigger === 'always') add(`${e.stat}/pct`, e.value * a.power);
      continue;
    }
    add(lineKey(p.main), mainValue(p));
    for (const s of p.subs) add(lineKey(s), subValue(p, s));
    if (p.set && get(p.slot)?.countsForSets) count[p.set] = (count[p.set] || 0) + 1;
  }
  const sets2 = [], sets4 = [];
  let phaseQi = 0;
  for (const [sid, n] of Object.entries(count)) {
    const s = get(sid);
    if (n >= 2) {
      sets2.push(sid);
      const st = s.twoPiece;
      if (st.stat === 'stat:haste') add('stat:haste/flat', st.value);
      else if (st.stat) add(`${st.stat}/pct`, st.value);
      for (const e of st.effects || []) if (e.do === 'phase_qi') phaseQi += e.amount || 1; // Five Elements: Phase Qi of her phase at battle start
    }
    if (n >= 4) sets4.push(sid);
  }
  return { t, count, sets2, sets4, artefact, phaseQi };
}
/** A heroine's final stats: base (level and realm) plus gear. */
export function withGear(base, bonus) {
  const t = bonus.t;
  return {
    hp: Math.round(base.hp * (1 + t['stat:hp/pct']) + t['stat:hp/flat']),
    atk: Math.round(base.atk * (1 + t['stat:atk/pct']) + t['stat:atk/flat']),
    def: Math.round(base.def * (1 + t['stat:def/pct']) + t['stat:def/flat']),
    crit: Math.min(1, base.crit + t['stat:crit/pct']), critDmg: base.critDmg + t['stat:crit_dmg/pct'],
    haste: Math.round((base.haste || 0) + t['stat:haste/flat']), acc: t['stat:acc/pct'], res: t['stat:res/pct'],
    healRecv: t['stat:heal_received/pct'], healing: t['stat:healing/pct'],
  };
}
/** The name a piece goes by in lists: "Rare Gloves" or the artefact's name. */
export function pieceName(p) {
  if (p.kind === 'art') return get(p.art)?.name || 'Spirit Artefact';
  const set = p.set ? `${get(p.set)?.name} ` : '';
  return `${set}${get(p.slot)?.name || keyOf(p.slot)}`;
}
export const pieceCn = p => (p.kind === 'art' ? get(p.art)?.cn : get(p.slot)?.cn) || '';
/** The icon file for a piece (art first), relative to assets/icons. */
export const pieceIcon = p => (p.kind === 'art' ? `art_${keyOf(p.art)}` : `gear_${keyOf(p.slot)}`);
