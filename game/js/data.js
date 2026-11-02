// Game data access: every record from data/ by id, plus the derived numbers the slice needs
// (heroine and enemy stats by level, techniques in the engine's shape, stage battles, art lookups).
import { GAME_DATA } from './gamedata.js';
import { ASSET_FILES } from './assets.js';
import { CHOREO } from './engine.js';

const byId = new Map(), byType = new Map();
for (const r of GAME_DATA.records) {
  byId.set(r.id, r);
  const t = r.id.slice(0, r.id.indexOf(':'));
  if (!byType.has(t)) byType.set(t, []);
  byType.get(t).push(r);
}
export const get = id => byId.get(id);
export const all = type => byType.get(type) || [];
export const keyOf = id => id.slice(id.indexOf(':') + 1);
export const phaseOf = p => (p ? p.replace('phase:', '') : 'yin');
export const hasArt = rel => ASSET_FILES.has(rel);
export const GAME = get('game:immortal_blossoms');

// ---------------- art ----------------
const FOUNDER_KEY = { 'hero:ling_shuang': 'ling', 'hero:mo_yingyue': 'mo', 'hero:yan_feihong': 'yan', 'hero:su_lianhua': 'su' };
/** Technique glyphs for heroines and enemies that have no painted icon yet. */
const GLYPHS = {
  wei_zi: ['扇', '傲', '后'], ning_suxin: ['符', '封', '馨'], tang_mian: ['劈', '碎', '醒'], lin_chaxue: ['茶', '御', '雪'],
  an_baihe: ['药', '合', '缘'], fang_yanzhi: ['胭', '血', '烙'],
};
const ENEMY_GLYPH = {
  'skill:grave_claw': '爪', 'skill:cinder_wail': '嚎', 'skill:grave_bind': '缚', 'skill:bone_spear': '矛', 'skill:black_tide': '潮',
  'skill:soul_thorns': '棘', 'skill:netherflame_lash': '鞭', 'skill:withering_curse': '枯', 'skill:netherflame_cataclysm': '冥',
  'skill:ashen_slash': '斩', 'skill:cinder_cleave': '劈', 'skill:wither_bolt': '凋', 'skill:netherflame_litany': '咒', 'skill:flame_bolt': '焰',
  'skill:netherfire_rain': '雨', 'skill:hex_bolt': '蛊', 'skill:binding_hex': '缚', 'skill:bone_bash': '骨', 'skill:bone_ward': '盾',
  'skill:drowning_grip': '溺', 'skill:captain_lash': '鞭', 'skill:ember_command': '令', 'skill:pyre_of_the_ford': '焚',
};
/** A heroine's pictures: card, cut-in, face and technique icons (with fallbacks). */
export function heroArt(hid) {
  const h = get(hid), k = FOUNDER_KEY[hid] || keyOf(hid);
  const card = h?.art?.card && hasArt(`cards/${h.art.card}.webp`) ? h.art.card : null;
  const cutin = h?.art?.cutin && hasArt(`ui/${h.art.cutin}.webp`) ? h.art.cutin : null;
  const face = h?.art?.face && hasArt(`ui/${h.art.face}.webp`) ? h.art.face : null;
  const icons = [1, 2, 3].map(i => (hasArt(`ui/${k}_s${i}.webp`) ? `${k}_s${i}` : `g:${(GLYPHS[keyOf(hid)] || ['一', '二', '极'])[i - 1]}`));
  return { key: k, card, cutin, face, icons };
}
export const cardUrl = hid => { const a = heroArt(hid); return a.card ? `assets/cards/${a.card}.webp` : null; };
export const faceUrl = hid => { const a = heroArt(hid); return a.face ? `assets/ui/${a.face}.webp` : cardUrl(hid); };
export function enemyArt(e) {
  if (e.art && hasArt(`cards/${e.art}.webp`)) return e.art;
  const fallback = { 'phase:water': 'wraith_drowned', 'phase:fire': 'wraith_ember', 'phase:earth': 'wraith_mire', 'phase:metal': 'wraith_bone', 'phase:wood': 'wraith_thorn' };
  return fallback[e.phase] || 'wraith_ember';
}
export const npcUrl = nid => (hasArt(`npc/${keyOf(nid)}.webp`) ? `assets/npc/${keyOf(nid)}.webp` : null);
export const iconUrl = id => (hasArt(`icons/${keyOf(id)}.webp`) ? `assets/icons/${keyOf(id)}.webp` : null);
const LOC_BG = { 'loc:hundred_blossoms_pavilion': 'pavilion', 'loc:peach_blossom_ford': 'peach_ford', 'loc:jade_pool': 'jade_pool' };
export function locBg(loc) {
  const k = LOC_BG[loc];
  if (k && hasArt(`bg/${k}.webp`)) return `assets/bg/${k}.webp`;
  if (loc === 'loc:peach_blossom_ford' || loc === 'loc:jade_pool') return 'assets/bg/arena.webp';
  return hasArt('bg/pavilion.webp') ? 'assets/bg/pavilion.webp' : 'assets/bg/arena.webp';
}

// ---------------- the slice's heroines ----------------
/** Heroines the slice can show and summon: those with card art. */
export const SLICE_HEROES = [...all('hero')].filter(h => heroArt(h.id).card).sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name)).map(h => h.id);

// ---------------- growth ----------------
export const expToNext = level => 90 * level * level;
export const levelCap = bt => 10 * (bt + 1);
export const realmOf = bt => all('realm').sort((a, b) => a.order - b.order)[Math.min(bt, 7)];
export const nextRealm = bt => all('realm').sort((a, b) => a.order - b.order)[bt + 1] || null;
export const growth = (level, bt) => (1 + 0.08 * (level - 1)) * (1 + 0.1 * bt);
export function heroStats(hid, level = 1, bt = 0) {
  const b = get(hid).base, g = growth(level, bt);
  return { hp: Math.round(b.hp * g), atk: Math.round(b.atk * g), def: Math.round(b.def * g), crit: b.crit, critDmg: b.critDmg, haste: 0 };
}
export function enemyStats(eid, level) {
  const b = get(eid).base, g = (1 + 0.08 * (level - 1)) * (1 + 0.1 * Math.floor((level - 1) / 10));
  return { hp: Math.round(b.hp * g), atk: Math.round(b.atk * g), def: Math.round(b.def * g), crit: b.crit, critDmg: b.critDmg };
}
/** A rough power number for Formation: offense times survivability. */
export function power(s) { return Math.round((s.atk * (1 + s.crit * (s.critDmg - 1))) * 2.2 + s.hp * 0.32 + s.def * 1.6); }

// ---------------- techniques ----------------
const TT = { enemy: 'enemy', all_enemies: 'allEnemies', all_allies: 'allAllies', self: 'self', ally: 'ally' };
export function techOf(sid, icon, isBoss = false) {
  const sk = get(sid);
  const ult = !!sk.ultimate || sk.slot === 's3';
  const heals = (sk.effects || []).some(e => e.do === 'heal' || e.do === 'cleanse');
  return {
    id: sk.id, chor: CHOREO[sk.id], name: sk.name, slot: sk.slot, cd: sk.cooldown, start: sk.start ?? 0,
    target: TT[sk.target] || 'enemy', ult, tele: isBoss && ult, heals, desc: sk.text,
    emp: sk.empower ? { cost: sk.empower.cost, desc: sk.empower.text } : null,
    effects: sk.effects || [], empEffects: sk.empower?.effects || null,
    icon: icon || `g:${ENEMY_GLYPH[sk.id] || (ult ? '极' : '击')}`,
    multi: (sk.effects || []).some(e => (e.hits || 1) > 2) || /ling_shuang_s3|mo_yingyue_s1|mo_yingyue_s3|su_lianhua_s1/.test(sk.id),
  };
}

// ---------------- units for the battle engine ----------------
export function heroUnit(hid, prog = {}, arrayBonus = {}) {
  const h = get(hid), art = heroArt(hid), lv = prog.level || 1, bt = prog.bt || 0;
  const s = heroStats(hid, lv, bt);
  const hp = Math.round(s.hp * (1 + (arrayBonus.hp || 0)));
  return {
    key: art.key, id: hid, name: h.name, cn: h.cn, title: h.title, phase: phaseOf(h.phase), path: h.path, pathName: get(h.path)?.name,
    rarity: h.rarity, art: art.card, cutin: art.cutin, face: art.face, lvl: lv,
    hp, atk: Math.round(s.atk * (1 + (arrayBonus.atk || 0))), def: Math.round(s.def * (1 + (arrayBonus.def || 0))),
    crit: s.crit, critDmg: s.critDmg + (arrayBonus.crit_dmg || 0), haste: arrayBonus.haste || 0,
    techs: h.skills.map((sid, i) => techOf(sid, art.icons[i])),
  };
}
export function enemyUnit(eid, level) {
  const e = get(eid), s = enemyStats(eid, level);
  return {
    key: keyOf(eid), id: eid, name: e.name, cn: e.cn, title: e.title, phase: phaseOf(e.phase), path: null, family: e.family, profile: e.profile,
    art: enemyArt(e), cutin: null, face: null, lvl: level, hp: s.hp, atk: s.atk, def: s.def, crit: s.crit, critDmg: s.critDmg,
    wide: !!e.wide, boss: !!e.boss, qiShield: e.qiShield || 0,
    techs: e.skills.map(sid => techOf(sid, null, !!e.boss)),
  };
}
/** The Twin Blooms a team switches on. */
export function teamCombos(team) {
  const set = new Set(team.filter(Boolean));
  return all('combo').filter(c => c.members.every(m => set.has(m)));
}
const ARRAY_STAT = { 'stat:hp': 'hp', 'stat:atk': 'atk', 'stat:def': 'def', 'stat:haste': 'haste', 'stat:crit_dmg': 'crit_dmg' };
export function arrayBonus(arrayId, pos) {
  const a = get(arrayId); const p = a?.positions?.[pos];
  if (!p) return {};
  return { [ARRAY_STAT[p.stat] || 'hp']: p.value };
}
/** Build the engine's battle definition for a stage and a team (hero ids, with progress). */
export function stageBattle(stage, team, progress, arrayId = 'array:yellow_dragon', opts = {}) {
  const waves = (stage.waves || []).map((w, i, arr) => {
    const boss = w.some(e => get(e.enemy)?.boss);
    return {
      title: boss ? 'Boss wave' : (i === arr.length - 1 && arr.length > 1 ? 'Final wave' : `Wave ${i + 1}`),
      sub: boss ? get(w.find(e => get(e.enemy)?.boss).enemy).name : stage.name, boss,
      enemies: w.map(e => enemyUnit(e.enemy, e.level)),
    };
  });
  const heroes = team.filter(Boolean).map((hid, i) => heroUnit(hid, opts.fixedLevel ? { level: opts.fixedLevel } : (progress[hid] || { level: opts.guestLevel || 1 }), arrayBonus(arrayId, i)));
  const combos = teamCombos(team);
  const loc = get(stage.location);
  return {
    heroes, waves, tutorial: !!opts.tutorial, combos: combos.map(c => c.id),
    comboNames: Object.fromEntries(combos.map(c => [c.id, c.name])),
    side: (get(get(stage.waves?.[0]?.[0]?.enemy)?.faction)?.name) || 'Enemies', stageName: stage.name,
    bg: locBg(stage.location), location: loc?.name,
  };
}
/** EXP each heroine earns from a battle stage. */
export const battleExp = stage => 12 * (stage.waves || []).flat().reduce((s, e) => s + e.level * e.level, 0);

// ---------------- rewards ----------------
/** Turn a reward list from the data into display entries: { kind, id, qty, name, icon }. */
export function rewardEntries(list = []) {
  return list.map(r => {
    if (r.cur) return { kind: 'cur', id: r.cur, qty: r.qty, name: get(r.cur)?.name, icon: iconUrl(r.cur) };
    if (r.item) return { kind: 'item', id: r.item, qty: r.qty, name: get(r.item)?.name, icon: iconUrl(r.item) };
    if (r.hero) return { kind: 'hero', id: r.hero, qty: 1, name: get(r.hero)?.name, icon: faceUrl(r.hero) };
    if (r.art) return { kind: 'art', id: r.art, qty: 1, name: get(r.art)?.name, icon: null };
    return null;
  }).filter(Boolean);
}
/** Roll a drop table (gear entries are skipped: gear arrives with the core loop alpha). */
export function rollDrops(dropsId) {
  const d = get(dropsId); if (!d) return [];
  const out = [];
  for (const e of d.entries || []) {
    if (e.gear || e.drops) continue;
    if (Math.random() > (e.chance ?? 1)) continue;
    const [lo, hi] = Array.isArray(e.qty) ? e.qty : [e.qty || 1, e.qty || 1];
    const qty = Math.round(lo + Math.random() * (hi - lo));
    if (e.cur) out.push({ cur: e.cur, qty }); else if (e.item) out.push({ item: e.item, qty });
  }
  return out;
}
export const num = n => Math.round(n).toLocaleString('en-US');
