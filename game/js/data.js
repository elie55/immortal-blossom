// Game data access: every record from data/ by id, plus the derived numbers the slice needs
// (heroine and enemy stats by level, techniques in the engine's shape, stage battles, art lookups).
import { GAME_DATA } from './gamedata.js';
import { ASSET_FILES } from './assets.js';
import { CHOREO } from './engine.js';
import { withGear, pieceName, pieceIcon, rarityColor } from './gear.js';

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
  if (e.wide) return 'boss_wraith_captain';
  const fallback = { 'phase:water': 'wraith_drowned', 'phase:fire': 'wraith_ember', 'phase:earth': 'wraith_mire', 'phase:metal': 'wraith_bone', 'phase:wood': 'wraith_thorn' };
  return fallback[e.phase] || 'wraith_ember';
}
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
/** The phase a mode's table gives today (Valley enemies, the doubled shrine); weekends take the player's pick. */
export function todayPhase(modeId = 'mode:valley', pick = null, date = new Date()) {
  const m = get(modeId), table = m?.phaseByDay || m?.doubledByDay || {};
  const v = table[DAYS[date.getDay()]];
  return v && v.startsWith('phase:') ? v : (pick || null);
}
export const npcUrl = nid => (hasArt(`npc/${keyOf(nid)}.webp`) ? `assets/npc/${keyOf(nid)}.webp` : null);
/** Transparent standing art for story scenes and dialogues (heroines and NPCs alike). */
export const standUrl = id => (hasArt(`stand/${keyOf(id)}.webp`) ? `assets/stand/${keyOf(id)}.webp` : null);
/** An item's icon; manuals and fragments share one icon for their category. */
export function iconUrl(id) {
  if (!id) return null;
  if (hasArt(`icons/${keyOf(id)}.webp`)) return `assets/icons/${keyOf(id)}.webp`;
  const cat = get(id)?.category;
  return cat && hasArt(`icons/cat_${cat}.webp`) ? `assets/icons/cat_${cat}.webp` : null;
}
const LOC_BG = { 'loc:hundred_blossoms_pavilion': 'pavilion', 'loc:peach_blossom_ford': 'peach_ford', 'loc:jade_pool': 'jade_pool' };
export function locBg(loc) {
  const k = LOC_BG[loc] || (loc && keyOf(loc));
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
// A heroine's growth beyond level and realm: technique mastery, Dao Blossom petals, meridians and bonds.
// prog is her save record: { level, bt, petals, bond, mastery: { skillId: n }, meridians: { key: nodes }, renDu }.
const RG = () => get('rules:growth') || {};
export const meridians = () => get('sys:meridians')?.meridians || [];
/** Bond level 1 to 10 from her bond points. */
export function bondLevel(points = 0) { const L = RG().bondLevels || [0]; let lv = 1; for (let i = 1; i < L.length; i++) if (points >= L[i]) lv = i + 1; return lv; }
/** Points for the next bond level (null at the top). */
export const bondNext = lv => (RG().bondLevels || [])[lv] ?? null;
export const bondBonus = lv => (RG().bondStatBonus || [])[lv - 1] || 0;
const M_STAT = { 'stat:atk': 'atk', 'stat:hp': 'hp', 'stat:def': 'def', 'stat:crit_dmg': 'critDmg', 'stat:haste': 'haste' };
/** What her meridians and bond add: fractions of base Health, Attack and Defense, crit damage and Haste. */
export function growthBonus(prog = {}) {
  const b = { hp: 0, atk: 0, def: 0, critDmg: 0, haste: 0 };
  const bs = bondBonus(bondLevel(prog.bond || 0)); b.hp += bs; b.atk += bs; b.def += bs;
  for (const m of meridians()) { const n = (prog.meridians || {})[m.key] || 0; if (n && M_STAT[m.stat]) b[M_STAT[m.stat]] += m.perNode * n; }
  return b;
}
/** Base stats with meridians and bond: what gear then adds to. */
export function heroBase(hid, prog = {}) {
  const s = heroStats(hid, prog.level || 1, prog.bt || 0), g = growthBonus(prog);
  return { ...s, hp: Math.round(s.hp * (1 + g.hp)), atk: Math.round(s.atk * (1 + g.atk)), def: Math.round(s.def * (1 + g.def)), critDmg: s.critDmg + g.critDmg, haste: (s.haste || 0) + g.haste };
}
/** One mastery step: "+10% damage and healing", "Cooldown -1", "Iron Body lasts 3 turns". */
export function masteryStep(text) {
  const m = {}, s = String(text).replace(/\s*\(petal \d\)\s*$/, '');
  let r;
  if ((r = s.match(/^\+(\d+)% (.+)$/))) {
    for (const k of r[2].split(' and ')) { const key = { damage: 'dmg', healing: 'heal', shield: 'shield', 'effect chance': 'chance', 'counterattack damage': 'counter' }[k.trim()]; if (key) m[key] = +r[1] / 100; }
  } else if ((r = s.match(/^Cooldown -(\d+)$/))) m.cd = +r[1];
  else if ((r = s.match(/^(.+) lasts (\d+) turns?$/))) { const st = all('status').find(x => x.name === r[1]); if (st) m.turns = { [st.id]: +r[2] }; }
  return m;
}
/** Everything a technique's first `level` mastery steps add up to. */
export function masteryMods(sk, level = 0) {
  const out = { dmg: 0, heal: 0, shield: 0, chance: 0, counter: 0, cd: 0, turns: {} };
  for (const step of (sk?.mastery || []).slice(0, level)) {
    const m = masteryStep(step);
    for (const k of ['dmg', 'heal', 'shield', 'chance', 'counter', 'cd']) out[k] += m[k] || 0;
    Object.assign(out.turns, m.turns || {});
  }
  return out;
}
/** The highest mastery a technique can reach now: +5, or +6 once the petal that allows it is open. */
export function masteryCap(hid, sid, petals = 0) {
  const sk = get(sid), steps = (sk?.mastery || []).length;
  const six = (get(hid)?.petals || []).some(p => p.modifies === sid && p.mastery === 6 && p.n <= petals);
  return Math.min(steps, six ? 6 : 5);
}
const matches = (e, m = {}) => Object.entries(m).every(([k, v]) => e[k] === v);
/** A technique or passive with her open petals' patches applied ({ cooldown, effects, empower }, all copies). */
export function patched(hid, sid, petals = 0) {
  const sk = get(sid);
  const out = { cooldown: sk.cooldown, effects: JSON.parse(JSON.stringify(sk.effects || [])), empower: sk.empower ? JSON.parse(JSON.stringify(sk.empower)) : null };
  for (const p of get(hid)?.petals || []) {
    if (p.n > petals) continue;
    for (const x of p.patch || []) {
      if ((x.skill || p.modifies) !== sid) continue;
      if (x.cooldown) out.cooldown = x.cooldown;
      if (x.remove) out.effects = out.effects.filter(e => !matches(e, x.remove));
      if (x.set) for (const e of out.effects) if (matches(e, x.match)) Object.assign(e, x.set);
      if (x.add) out.effects.push({ ...x.add });
    }
  }
  return out;
}
/** Karmic Threads that tie heroines of a team together; each tied heroine gains Resonance. */
export function teamThreads(team) {
  const set = new Set(team.filter(Boolean));
  return all('thread').filter(t => set.has(t.a) && set.has(t.b));
}
export function enemyStats(eid, level) {
  const b = get(eid).base, g = (1 + 0.08 * (level - 1)) * (1 + 0.1 * Math.floor((level - 1) / 10));
  return { hp: Math.round(b.hp * g), atk: Math.round(b.atk * g), def: Math.round(b.def * g), crit: b.crit, critDmg: b.critDmg };
}
/** A rough power number for Formation: offense times survivability. */
export function power(s) { return Math.round((s.atk * (1 + s.crit * (s.critDmg - 1))) * 2.2 + s.hp * 0.32 + s.def * 1.6); }

// ---------------- techniques ----------------
const TT = { enemy: 'enemy', all_enemies: 'allEnemies', all_allies: 'allAllies', self: 'self', ally: 'ally' };
/** A technique for the engine. g (heroines only): { hid, petals, mastery, halfEmp } applies her petals' patches,
 *  her mastery (mods: damage, healing, shield, effect chance, cooldown, status turns) and the Ren and Du vessels. */
export function techOf(sid, icon, isBoss = false, g = null) {
  const sk = get(sid);
  const ult = !!sk.ultimate || sk.slot === 's3';
  const pt = g ? patched(g.hid, sid, g.petals || 0) : { cooldown: sk.cooldown, effects: sk.effects || [], empower: sk.empower || null };
  const mods = g ? masteryMods(sk, g.mastery || 0) : null;
  let effects = pt.effects;
  if (mods && Object.keys(mods.turns).length) effects = effects.map(e => (e.do === 'apply' && mods.turns[e.status] ? { ...e, turns: mods.turns[e.status] } : e));
  const cd = Math.max(1, pt.cooldown - (mods?.cd || 0)), cut = sk.cooldown - cd;
  const heals = effects.some(e => e.do === 'heal' || e.do === 'cleanse');
  return {
    id: sk.id, chor: CHOREO[sk.id], name: sk.name, slot: sk.slot, cd, start: Math.max(0, (sk.start ?? 0) - Math.max(0, cut)),
    target: TT[sk.target] || 'enemy', ult, tele: isBoss && ult, heals, desc: sk.text,
    emp: pt.empower ? { cost: g?.halfEmp ? Math.ceil(pt.empower.cost / 2) : pt.empower.cost, desc: pt.empower.text } : null,
    effects, empEffects: pt.empower?.effects || null, mods, mastery: g?.mastery || 0,
    icon: icon || `g:${ENEMY_GLYPH[sk.id] || (ult ? '极' : '击')}`,
    multi: effects.some(e => (e.hits || 1) > 2) || /ling_shuang_s3|mo_yingyue_s1|mo_yingyue_s3|su_lianhua_s1/.test(sk.id),
  };
}

// ---------------- units for the battle engine ----------------
/** A heroine for the battle engine. gear: what her equipped pieces give (gear.js gearBonus), or nothing.
 *  extra: { resonance } when a Karmic Thread ties her to a teammate. */
export function heroUnit(hid, prog = {}, arrayBonus = {}, gear = null, extra = {}) {
  const h = get(hid), art = heroArt(hid), lv = prog.level || 1, petals = prog.petals || 0;
  const base = heroBase(hid, prog);
  const s = gear ? withGear(base, gear) : { ...base, acc: 0, res: 0, healRecv: 0, healing: 0 };
  const hp = Math.round(s.hp * (1 + (arrayBonus.hp || 0)));
  const res = extra.resonance ? (RG().resonance?.value || 0.05) : 0;
  return {
    key: art.key, id: hid, name: h.name, cn: h.cn, title: h.title, phase: phaseOf(h.phase), path: h.path, pathName: get(h.path)?.name,
    rarity: h.rarity, art: art.card, cutin: art.cutin, face: art.face, lvl: lv, petals, resonance: !!extra.resonance,
    hp, atk: Math.round(s.atk * (1 + (arrayBonus.atk || 0) + res)), def: Math.round(s.def * (1 + (arrayBonus.def || 0))),
    crit: s.crit, critDmg: s.critDmg + (arrayBonus.crit_dmg || 0), haste: (s.haste || 0) + (arrayBonus.haste || 0),
    acc: s.acc, res: s.res, healRecv: s.healRecv, healing: s.healing,
    // gear effects the engine plays: 4-piece sets, the Spirit Artefact's passive, Five Elements' Phase Qi
    sets4: gear?.sets4 || [], artefact: gear?.artefact || null, gearPhaseQi: gear?.phaseQi || 0, targeted: arrayBonus.targeted || 1,
    // passives open at levels 30 and 50; open petals may patch them
    passives: (h.passives || []).map(get).filter(p => p && lv >= (p.slot === 'p50' ? 50 : 30)).map(p => ({ id: p.id, name: p.name, trigger: p.trigger, effects: patched(hid, p.id, petals).effects })),
    techs: h.skills.map((sid, i) => techOf(sid, art.icons[i], false, { hid, petals, mastery: (prog.mastery || {})[sid] || 0, halfEmp: prog.renDu === sid })),
  };
}
/** An enemy for the battle engine. phase overrides its own (the Valley's day phase, a shrine's phase). */
export function enemyUnit(eid, level, phase = null) {
  const e = get(eid), s = enemyStats(eid, level);
  return {
    key: keyOf(eid), id: eid, name: e.name, cn: e.cn, title: e.title, phase: phaseOf(phase || e.phase), path: null, family: e.family, profile: e.profile, script: e.script || null,
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
/** What an array's position gives at a level: level 1 values, up to double at level 10. */
export function arrayBonus(arrayId, pos, level = 1) {
  const a = get(arrayId); const p = a?.positions?.[pos];
  if (!p) return {};
  const k = 1 + (Math.min(10, Math.max(1, level)) - 1) / 9, v = p.value * k;
  return { [ARRAY_STAT[p.stat] || 'hp']: p.stat === 'stat:haste' ? Math.round(v) : v, ...(p.targeted ? { targeted: p.targeted } : {}) };
}
/** "+5% Health", "+8 Haste" for an array position. */
export function arrayText(arrayId, pos, level = 1) {
  const b = arrayBonus(arrayId, pos, level), [k, v] = Object.entries(b).find(([x]) => x !== 'targeted') || [];
  if (!k) return 'None';
  const name = { hp: 'Health', atk: 'Attack', def: 'Defense', haste: 'Haste', crit_dmg: 'Crit dmg' }[k];
  return (k === 'haste' ? `+${v} ${name}` : `+${Math.round(v * 100)}% ${name}`) + (b.targeted ? ', taunts' : '');
}
/** The tribulation a heroine faces to enter a realm (Core Formation and up), or null. */
export const trialFor = realmId => all('trial').find(t => t.realm === realmId) || null;
/** A heroine's tribulation as a stage: lightning waves, then her Heart Demon; she must fight it herself. */
export function trialStage(trial, hid) {
  return { id: `${trial.id}#${keyOf(hid)}`, name: `${get(hid).name}: ${trial.name}`, trial: trial.id, hero: hid, required: [hid], waves: trial.waves,
    location: 'loc:jade_pool', firstClearRewards: null, drops: null, missions: null };
}
/** Her Heart Demon: a darkened copy of her card with her techniques and stats at the trial's level, a boss with a Qi shield. */
export function demonUnit(hid, level, prog = {}, gear = null) {
  const hu = heroUnit(hid, { ...prog, level }, {}, gear);
  return { ...hu, id: 'enemy:heart_demon', demonOf: hid, name: `${get(hid).name}'s Heart Demon`, cn: '心魔', title: get('enemy:heart_demon').title, family: 'tribulation', profile: 'elite', script: null,
    hp: Math.round(hu.hp * 2.6), boss: true, wide: false, qiShield: 3, passives: [], sets4: [], artefact: null, gearPhaseQi: 0, resonance: false, lvl: level };
}
/** Build the engine's battle definition for a stage and a team (hero ids, with progress). */
export function stageBattle(stage, team, progress, arrayId = 'array:yellow_dragon', opts = {}) {
  const waves = (stage.waves || []).map((w, i, arr) => {
    const boss = w.some(e => get(e.enemy)?.boss || (e.enemy === 'enemy:heart_demon' && stage.hero));
    return {
      title: boss ? 'Boss wave' : (i === arr.length - 1 && arr.length > 1 ? 'Final wave' : `Wave ${i + 1}`),
      sub: boss ? (stage.hero && w.some(e => e.enemy === 'enemy:heart_demon') ? `${get(stage.hero).name}'s Heart Demon` : get(w.find(e => get(e.enemy)?.boss).enemy).name) : stage.name, boss,
      enemies: w.map(e => (e.enemy === 'enemy:heart_demon' && stage.hero
        ? demonUnit(stage.hero, e.level, progress[stage.hero] || {}, opts.gear && progress[stage.hero] ? opts.gear(stage.hero) : null)
        : enemyUnit(e.enemy, e.level, e.phase || ({ day: opts.dayPhase || todayPhase('mode:valley', 'phase:metal'), shrine: stage.phase || 'phase:earth' }[get(e.enemy).phase]) || null))),
    };
  });
  if (stage.hd) for (const w of waves) for (const u of w.enemies) if (!u.qiShield && u.profile !== 'minion') u.qiShield = 4; // Heaven-Defying elites
  const tied = new Set(teamThreads(team).flatMap(t => [t.a, t.b]));
  const heroes = team.filter(Boolean).map((hid, i) => heroUnit(hid, opts.fixedLevel ? { level: opts.fixedLevel } : (progress[hid] || { level: opts.guestLevel || 1 }), arrayBonus(arrayId, i, opts.arrayLevel || 1), progress[hid] && opts.gear ? opts.gear(hid) : null, { resonance: tied.has(hid) }));
  const combos = teamCombos(team);
  const loc = get(stage.location);
  return {
    heroes, waves, tutorial: !!opts.tutorial, combos: combos.map(c => c.id),
    comboNames: Object.fromEntries(combos.map(c => [c.id, c.name])),
    side: (get(get(stage.waves?.[0]?.[0]?.enemy)?.faction)?.name) || 'Enemies', stageName: stage.name,
    bg: locBg(stage.location), location: loc?.name,
  };
}
/** A Journey stage on Heaven-Defying difficulty: higher levels, Qi shields on its elites, its own drops and
 *  first-clear rewards, no story. prevId chains the unlocks inside a chapter. */
export function hdStage(st, prevId = null) {
  const hd = st.heavenDefying; if (!hd) return null;
  return { ...st, id: `${st.id}#hd`, base: st.id, hd: true, tier: hd.tier || st.tier, drops: hd.drops || st.drops, firstClearRewards: hd.firstClearRewards || [], mechanic: hd.mechanic,
    waves: st.waves.map(w => w.map(e => ({ ...e, level: e.level + (hd.levelOffset || 0) }))), scenes: null, guests: null, fixedTeam: null, tutorial: false, shop: null, encounters: st.encounters,
    unlock: prevId ? { clear: prevId } : null };
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
    if (r.gear) return { kind: 'gear', id: r.gear.id || null, qty: 1, name: pieceName(r.gear), icon: hasArt(`icons/${pieceIcon(r.gear)}.webp`) ? `assets/icons/${pieceIcon(r.gear)}.webp` : null, color: rarityColor(r.gear.rarity), piece: r.gear, salvaged: r.salvaged || null };
    if (r.art) return { kind: 'art', id: r.art, qty: 1, name: get(r.art)?.name, icon: hasArt(`icons/art_${keyOf(r.art)}.webp`) ? `assets/icons/art_${keyOf(r.art)}.webp` : null, color: rarityColor(r.rarity) };
    return null;
  }).filter(Boolean);
}
export const num = n => Math.round(n).toLocaleString('en-US');
