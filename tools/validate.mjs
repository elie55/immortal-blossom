#!/usr/bin/env node
// Immortal Blossoms data checker.
//
//   node tools/validate.mjs                 check every file under data/
//   node tools/validate.mjs --report FILE   also write a Markdown report (counts, economy, unlocks)
//
// It fails (exit code 1) on: malformed files, duplicate ids, links to ids that do not exist,
// records the game cannot reach from the game root (orphans), items or currencies with no
// source or no use, and the domain rules listed in docs/data-model.md.

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DATA = join(ROOT, 'data');

// ---------------------------------------------------------------- id types
// Every id is "type:key". A string anywhere in the data that has this shape and a known type is a link.
export const TYPES = {
  game: 'Game root', rules: 'Rule set', phase: 'Phase', path: 'Cultivation path', stat: 'Stat',
  realm: 'Realm', status: 'Status effect', sys: 'Game system', hero: 'Heroine', thread: 'Karmic Thread', combo: 'Twin Bloom',
  skill: 'Technique or passive', enemy: 'Enemy', faction: 'Faction', loc: 'Location', npc: 'Character',
  chapter: 'Story chapter', scene: 'Story scene', stage: 'Stage or battle', mode: 'Game mode',
  hunt: 'Demon Hunt', theme: 'Secret Realm theme', insight: 'Dao Insight', event: 'Secret Realm event',
  camp: 'Camp topic', rival: 'Rival sect', league: 'League', tourn: 'Tournament', trial: 'Tribulation trial',
  raid: 'Raid beast', tower: 'Tower', dao: 'Heavenly Dao modifier', cur: 'Currency', item: 'Item',
  outfit: 'Outfit', title: 'Title', slot: 'Gear slot', rarity: 'Rarity', tier: 'Gear tier', set: 'Gear set',
  unique: 'Unique gear', art: 'Spirit Artefact', enc: 'Fortuitous Encounter', array: 'Battle Array',
  beast: 'Spirit beast', drops: 'Drop table', recipe: 'Recipe', shop: 'Shop', bld: 'Sect building',
  exped: 'Expedition', duty: 'Duty', chest: 'Chest track', ach: 'Renown goal', pass: 'Path of Ascension season',
  checkin: 'Check-in calendar', pond: 'Summon pool', recruit: 'Recruitment pool', rank: 'Rank track',
};
const ID_RE = /^([a-z]+):([a-z0-9_]+)$/;

// Effect verbs a technique, passive, set, artefact or encounter may use, and the moments passives fire.
const EFFECTS = new Set(['damage', 'heal', 'shield', 'apply', 'cleanse', 'dispel', 'delay', 'refresh', 'qi',
  'phase_qi', 'revive', 'stat', 'redirect', 'reflect', 'splash', 'lifesteal', 'overflow', 'harmony', 'counter',
  'extend', 'cost_health', 'transform', 'summon', 'break', 'detonate', 'move', 'follow_up', 'haste']);
const TRIGGERS = new Set(['always', 'battle_start', 'turn_start', 'turn_end', 'on_cast', 'on_hit', 'on_crit',
  'on_kill', 'on_hit_taken', 'on_ally_low', 'on_fall', 'on_debuff', 'on_heal', 'on_ultimate', 'on_break',
  'on_wave', 'on_chain_break', 'on_reflect', 'on_charm', 'on_shield_break', 'on_cleanse', 'on_dot']);

// Keys that make a link a source (the player gains the target) or a sink (the player spends it).
// The nearest classified key on the path wins. Keys ending in Reward(s) are sources, Cost(s) sinks.
const SOURCE_KEYS = new Set(['rewards', 'reward', 'drops', 'drop', 'output', 'outputs', 'yields', 'gives',
  'stock', 'sells', 'salvage', 'joins', 'pool', 'chest', 'loot', 'grants', 'returns', 'produces', 'hatches',
  'firstClear', 'milestones', 'unlocksItem', 'guaranteed', 'pick', 'exchange']);
const SINK_KEYS = new Set(['cost', 'costs', 'inputs', 'input', 'price', 'consumes', 'fee', 'feeds', 'requiresItem']);
// Record types whose links are sources unless a key says otherwise.
const TYPE_CONTEXT = { drops: 'source' };

// Economy rules: which types need a source, and which also need a use.
const NEEDS_SOURCE = new Set(['item', 'cur', 'hero', 'outfit', 'title', 'art', 'set', 'unique', 'beast']);
const NEEDS_SINK = new Set(['item', 'cur']);

// ---------------------------------------------------------------- load
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

function walkDir(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkDir(p));
    else if (name.endsWith('.json')) out.push(p);
  }
  return out;
}

const recs = new Map(); // id -> { rec, file }
const byType = new Map(); // type -> [rec]
for (const file of walkDir(DATA)) {
  const rel = relative(ROOT, file);
  let doc;
  try { doc = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { err(`${rel}: invalid JSON (${e.message})`); continue; }
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.records) || typeof doc.about !== 'string') {
    err(`${rel}: a data file is {"about": "...", "records": [...]}`); continue;
  }
  doc.records.forEach((rec, i) => {
    const m = typeof rec?.id === 'string' && rec.id.match(ID_RE);
    if (!m) { err(`${rel} record ${i}: missing or malformed id ${JSON.stringify(rec?.id)}`); return; }
    if (!TYPES[m[1]]) { err(`${rel}: ${rec.id} has unknown type "${m[1]}"`); return; }
    if (recs.has(rec.id)) { err(`${rec.id} is defined twice (${relative(ROOT, recs.get(rec.id).file)} and ${rel})`); return; }
    recs.set(rec.id, { rec, file });
    if (!byType.has(m[1])) byType.set(m[1], []);
    byType.get(m[1]).push(rec);
  });
}
const typeOf = (id) => id.slice(0, id.indexOf(':'));
const get = (id) => recs.get(id)?.rec;
const all = (type) => byType.get(type) || [];
const label = (id) => { const r = get(id); return r?.name ? `${id} (${r.name})` : id; };

// ---------------------------------------------------------------- links
const links = []; // { from, to, ctx, path }
const inbound = new Map();
const outbound = new Map();
function collect(fromId, node, path, recType) {
  if (typeof node === 'string') {
    const m = node.match(ID_RE);
    if (m && TYPES[m[1]]) {
      let ctx = TYPE_CONTEXT[recType] || 'link';
      for (let i = path.length - 1; i >= 0; i--) {
        const k = path[i];
        if (typeof k !== 'string') continue;
        if (SOURCE_KEYS.has(k) || /Rewards?$/.test(k)) { ctx = 'source'; break; }
        if (SINK_KEYS.has(k) || /Costs?$/.test(k)) { ctx = 'sink'; break; }
      }
      links.push({ from: fromId, to: node, ctx, path: path.join('.') });
    }
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => collect(fromId, v, [...path, i], recType));
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (path.length === 0 && k === 'id') continue;
      collect(fromId, v, [...path, k], recType);
    }
  }
}
for (const [id, { rec }] of recs) collect(id, rec, [], typeOf(id));
for (const l of links) {
  if (!recs.has(l.to)) { err(`${l.from} links to ${l.to}, which does not exist (at ${l.path})`); continue; }
  if (!inbound.has(l.to)) inbound.set(l.to, []);
  inbound.get(l.to).push(l);
  if (!outbound.has(l.from)) outbound.set(l.from, []);
  outbound.get(l.from).push(l);
}

// ---------------------------------------------------------------- reachability
const roots = all('game').map((r) => r.id);
if (roots.length !== 1) err(`expected exactly one game root, found ${roots.length}`);
const reached = new Set(roots);
const queue = [...roots];
while (queue.length) {
  const id = queue.shift();
  for (const l of outbound.get(id) || []) {
    if (!reached.has(l.to) && recs.has(l.to)) { reached.add(l.to); queue.push(l.to); }
  }
}
const orphans = [...recs.keys()].filter((id) => !reached.has(id));
for (const id of orphans) {
  const refs = (inbound.get(id) || []).map((l) => l.from);
  err(`orphan: ${label(id)} cannot be reached from the game root${refs.length ? ` (only linked from ${refs.slice(0, 3).join(', ')}, which are orphans too)` : ''}`);
}

// ---------------------------------------------------------------- economy
const sourcesOf = (id) => (inbound.get(id) || []).filter((l) => l.ctx === 'source');
const sinksOf = (id) => (inbound.get(id) || []).filter((l) => l.ctx === 'sink');
for (const [id, { rec }] of recs) {
  const t = typeOf(id);
  if (rec.noSource === true) continue;
  if (NEEDS_SOURCE.has(t) && sourcesOf(id).length === 0) err(`no source: nothing gives ${label(id)}`);
  if (NEEDS_SINK.has(t) && rec.noSink !== true && sinksOf(id).length === 0) err(`no use: nothing spends ${label(id)}`);
}

// ---------------------------------------------------------------- domain rules
const need = (cond, msg) => { if (!cond) err(msg); };
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Heroines
const heroes = all('hero');
const slotsByOwner = new Map();
for (const s of all('skill')) {
  need(s.shared === true || (s.owner && recs.has(s.owner)), `${s.id}: owner ${s.owner} missing (or mark it shared)`);
  const o = s.owner ? get(s.owner) : null;
  if (o) {
    const owned = [...(o.skills || []), ...(o.passives || [])];
    need(owned.includes(s.id), `${s.id}: its owner ${s.owner} does not list it`);
  }
  if (!slotsByOwner.has(s.owner)) slotsByOwner.set(s.owner, []);
  slotsByOwner.get(s.owner).push(s);
  if (s.slot === 's1') need(s.cooldown === 1, `${s.id}: an S1 has cooldown 1`);
  if (s.slot === 's2') need(s.cooldown >= 2 && s.cooldown <= 4, `${s.id}: an S2 has cooldown 2 to 4`);
  if (s.slot === 's3') need(s.cooldown >= 4 && s.cooldown <= 6, `${s.id}: an ultimate has cooldown 4 to 6`);
  if (s.empower) need([6, 10].includes(s.empower.cost), `${s.id}: Empower costs 6 (S2) or 10 (ultimate)`);
  for (const e of s.effects || []) need(EFFECTS.has(e.do), `${s.id}: unknown effect "${e.do}"`);
  if (s.trigger) need(TRIGGERS.has(s.trigger), `${s.id}: unknown trigger "${s.trigger}"`);
}
const rarityCount = { 3: 0, 4: 0, 5: 0 };
const fiveStarPaths = new Set();
for (const h of heroes) {
  rarityCount[h.rarity] = (rarityCount[h.rarity] || 0) + 1;
  if (h.rarity === 5) fiveStarPaths.add(h.path);
  const sk = (h.skills || []).map(get);
  need(sk.length === 3 && ['s1', 's2', 's3'].every((sl, i) => sk[i]?.slot === sl), `${h.id}: skills are [S1, S2, S3]`);
  const ps = (h.passives || []).map(get);
  need(ps.length === 2 && ps[0]?.slot === 'p30' && ps[1]?.slot === 'p50', `${h.id}: passives are [level 30, level 50]`);
  const petals = h.petals || [];
  need(petals.length === 6 && petals.every((p, i) => p.n === i + 1), `${h.id}: six petals numbered 1 to 6`);
  need(petals[2]?.modifies === h.skills?.[1] && petals[2]?.mastery === 6, `${h.id}: petal 3 takes her S2 to mastery +6`);
  need(petals[4]?.modifies === h.skills?.[2] && petals[4]?.mastery === 6, `${h.id}: petal 5 takes her ultimate to mastery +6`);
  for (const p of petals) need(p.modifies && recs.has(p.modifies), `${h.id} petal ${p.n}: names what it changes`);
  const u = get(h.unique);
  need(u && u.hero === h.id, `${h.id}: unique gear ${h.unique} must point back to her`);
  for (const g of [...(h.gifts?.likes || []), ...(h.gifts?.dislikes || [])]) need(get(g)?.category === 'gift', `${h.id}: ${g} is not a gift`);
  need((h.bondRewards || []).some((b) => b.level === 6) && (h.bondRewards || []).some((b) => b.level === 10), `${h.id}: bond outfits at levels 6 and 10`);
  // Rarity steps: 3★ < 4★ < 5★ by a small, fixed margin, measured against her path's 4★ standard.
  const std = get(h.path)?.standard, mul = get('rules:growth')?.rarityBaseMultiplier?.[h.rarity];
  if (need(std && mul, `${h.id}: her path needs a standard and her rarity a multiplier`) !== false && std && mul && h.base) {
    const off = (x) => x.atk * (1 + x.crit * (x.critDmg - 1));
    const p = (h.base.hp / std.hp + off(h.base) / off(std) + h.base.def / std.def) / 3;
    need(Math.abs(p - mul) <= 0.01, `${h.id}: a ${h.rarity}★ heroine's stats should come to ${mul} of the ${h.path} standard (power index ${p.toFixed(3)})`);
    need(Math.abs(h.base.crit - std.crit) <= 0.08 && Math.abs(h.base.critDmg - std.critDmg) <= 0.15, `${h.id}: critical stats stray too far from the ${h.path} standard`);
  }
}
if (heroes.length === 30) {
  need(rarityCount[3] === 10 && rarityCount[4] === 10 && rarityCount[5] === 10, `launch roster: 10 heroines per rarity (have ${JSON.stringify(rarityCount)})`);
  for (const p of all('path')) need(fiveStarPaths.has(p.id), `launch roster: no 5★ on ${p.id}`);
}
// Karmic Threads: unique pairs, 2 to 4 per heroine
const threadCount = new Map();
const pairs = new Set();
for (const t of all('thread')) {
  need(t.a !== t.b, `${t.id}: a thread joins two heroines`);
  const key = [t.a, t.b].sort().join('|');
  need(!pairs.has(key), `${t.id}: ${t.a} and ${t.b} are already tied`);
  pairs.add(key);
  for (const h of [t.a, t.b]) threadCount.set(h, (threadCount.get(h) || 0) + 1);
}
if (all('thread').length) for (const h of heroes) {
  const n = threadCount.get(h.id) || 0;
  need(n >= 2 && n <= 4, `${h.id}: has ${n} Karmic Threads (2 to 4)`);
  // Both heroines of a thread list it, and a heroine lists only her own threads
  const mine = all('thread').filter((t) => t.a === h.id || t.b === h.id).map((t) => t.id).sort();
  const listed = [...(h.threads || [])].sort();
  need(JSON.stringify(mine) === JSON.stringify(listed), `${h.id}: threads field should list exactly ${mine.join(', ') || 'none'}`);
}

// Twin Blooms: pairs of heroines on one team. Both list the combo, a shared thread ties the same pair,
// and every 5★ heroine has at least two, one of them with another 5★.
const comboCount = new Map(), fiveFiveCombo = new Set();
for (const c of all('combo')) {
  const ms = c.members || [];
  need(ms.length === 2 && ms.every((m) => get(m) && m.startsWith('hero:')) && ms[0] !== ms[1], `${c.id}: a Twin Bloom joins two different heroines`);
  if (c.thread) { const t = get(c.thread); need(t && [t.a, t.b].sort().join() === [...ms].sort().join(), `${c.id}: ${c.thread} must tie the same two heroines`); }
  need(TRIGGERS.has(c.trigger), `${c.id}: unknown trigger "${c.trigger}"`);
  for (const e of c.effects || []) need(EFFECTS.has(e.do), `${c.id}: unknown effect "${e.do}"`);
  need((c.effects || []).length > 0 && c.text && c.howTo, `${c.id}: effects, text and howTo are required`);
  for (const m of ms) {
    comboCount.set(m, (comboCount.get(m) || 0) + 1);
    need((get(m)?.combos || []).includes(c.id), `${m}: combos field should list ${c.id}`);
  }
  if (ms.every((m) => get(m)?.rarity === 5)) ms.forEach((m) => fiveFiveCombo.add(m));
}
for (const h of heroes) {
  for (const c of h.combos || []) need(get(c)?.members?.includes(h.id), `${h.id}: lists ${c}, which is not hers`);
  if (h.rarity === 5) {
    need((comboCount.get(h.id) || 0) >= 2, `${h.id}: a 5★ heroine needs at least two Twin Blooms`);
    need(fiveFiveCombo.has(h.id), `${h.id}: a 5★ heroine needs a Twin Bloom with another 5★`);
  }
}

// Stages
for (const s of all('stage')) {
  for (const [wi, wave] of (s.waves || []).entries()) {
    let width = 0;
    for (const e of wave) width += get(e.enemy)?.boss ? 2 : 1;
    need(width <= 4, `${s.id} wave ${wi + 1}: ${width} card slots (4 at most)`);
    for (const e of wave) need(isNum(e.level) && e.level >= 1 && e.level <= 90, `${s.id}: enemy level ${e.level}`);
  }
  if (s.waves) need(s.waves.length >= 1 && s.waves.length <= 3, `${s.id}: 1 to 3 waves`);
  // Progression map: a stage's realm and gear tier agree, and its enemies fit the realm's level band
  const realm = get(s.realm);
  if (s.tier && realm) need(realm.tier === s.tier, `${s.id}: tier ${s.tier} does not match ${s.realm} (${realm.tier})`);
  if (realm && s.waves && !s.scalesTo) {
    const [lo, hi] = realm.levels;
    for (const wave of s.waves) for (const e of wave) {
      need(e.level >= lo - 1 && e.level <= hi + 5, `${s.id}: enemy level ${e.level} is outside ${s.realm}'s band ${lo}-${hi}`);
    }
  }
  // Gear dropped by a stage (or its Heaven-Defying version) is of that stage's tier
  for (const block of [s, s.heavenDefying].filter(Boolean)) {
    const table = get(block.drops);
    for (const e of table?.entries || []) {
      if (e.gear && typeof e.gear.tier === 'string' && e.gear.tier.startsWith('tier:')) {
        need(e.gear.tier === block.tier, `${s.id}: ${block.drops} drops ${e.gear.tier} gear, but the stage is ${block.tier}`);
      }
    }
  }
}
// Heaven-Defying levels stay in the band of the tier they drop
for (const s of all('stage')) {
  const hd = s.heavenDefying;
  if (!hd || !s.waves) continue;
  const realm = all('realm').find((r) => r.tier === hd.tier);
  if (!realm) { err(`${s.id}: Heaven-Defying tier ${hd.tier} has no realm`); continue; }
  const [lo, hi] = realm.levels;
  for (const wave of s.waves) for (const e of wave) {
    const lv = e.level + (hd.levelOffset || 0);
    need(lv >= lo - 1 && lv <= hi + 5, `${s.id}: Heaven-Defying enemy level ${lv} is outside ${realm.id}'s band ${lo}-${hi}`);
  }
}
// Chapters: stages chain one after another
for (const c of all('chapter')) {
  let prev = c.unlock?.clear;
  for (const sid of c.stages || []) {
    const st = get(sid);
    if (!st) continue;
    need(st.chapter === c.id, `${sid}: chapter field should be ${c.id}`);
    if (prev) need((st.unlock?.clear || null) === prev, `${sid}: should unlock on clearing ${prev}`);
    prev = sid;
  }
}
// Unlock graph: every stage can be opened from the first one
{
  const cleared = new Set();
  const pending = all('stage').filter((s) => s.unlock?.clear);
  for (const s of all('stage')) if (!s.unlock?.clear) cleared.add(s.id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of pending) {
      if (!cleared.has(s.id) && cleared.has(s.unlock.clear)) { cleared.add(s.id); changed = true; }
    }
  }
  for (const s of pending) need(cleared.has(s.id), `${s.id}: its unlock chain never starts`);
}
// Drop tables
for (const d of all('drops')) {
  for (const e of d.entries || []) {
    if ('chance' in e) need(isNum(e.chance) && e.chance > 0 && e.chance <= 1, `${d.id}: chance ${e.chance}`);
    if (e.gear?.rarityOdds) {
      const sum = Object.values(e.gear.rarityOdds).reduce((a, b) => a + b, 0);
      need(Math.abs(sum - 1) < 1e-6, `${d.id}: rarity odds sum to ${sum}`);
    }
  }
}
// Realms
{
  const rs = all('realm').sort((a, b) => a.order - b.order);
  rs.forEach((r, i) => need(r.levelCap === (i + 1) * 10, `${r.id}: level cap ${r.levelCap}`));
}
// Summon pools
for (const p of all('pond')) {
  const sum = Object.values(p.rates || {}).reduce((a, b) => a + b, 0);
  need(Math.abs(sum - 1) < 1e-9, `${p.id}: rates sum to ${sum}`);
}
// Scenes
for (const sc of all('scene')) {
  need(recs.has(sc.location), `${sc.id}: location missing`);
  for (const [i, line] of (sc.lines || []).entries()) {
    if (line.speaker) need(['npc', 'hero'].includes(typeOf(line.speaker)), `${sc.id} line ${i + 1}: speaker must be a heroine or character`);
    need(typeof line.text === 'string' && line.text.length > 0, `${sc.id} line ${i + 1}: empty text`);
  }
  need((sc.lines || []).length > 0 || (sc.beats || []).length > 0, `${sc.id}: no lines or beats`);
}
// Characters must appear somewhere a player meets them
for (const n of all('npc')) {
  need((inbound.get(n.id) || []).some((l) => ['scene', 'stage', 'shop', 'loc', 'rival', 'bld', 'mode', 'checkin', 'enemy', 'tourn', 'league'].includes(typeOf(l.from))),
    `${n.id}: appears in no scene, shop, place or contest`);
}
// Every enemy fights somewhere
for (const e of all('enemy')) {
  need((inbound.get(e.id) || []).some((l) => ['stage', 'hunt', 'theme', 'trial', 'rival', 'raid', 'tower', 'mode'].includes(typeOf(l.from))),
    `${e.id}: appears in no battle`);
}

// ---------------------------------------------------------------- report
const args = process.argv.slice(2);
const reportAt = args.indexOf('--report');
if (reportAt >= 0 && args[reportAt + 1]) {
  const out = [];
  out.push('# Data report', '');
  out.push(`Generated by \`node tools/validate.mjs --report\` from ${recs.size} records in ${walkDir(DATA).length} files. ${errors.length ? `**${errors.length} errors.**` : 'No errors, no orphans.'}`, '');
  out.push('## Records by type', '', '| Type | Records | Drafts |', '| --- | --- | --- |');
  for (const [t, list] of [...byType].sort((a, b) => b[1].length - a[1].length)) {
    out.push(`| ${TYPES[t]} (\`${t}:\`) | ${list.length} | ${list.filter((r) => r.draft).length || ''} |`);
  }
  out.push('', '## How the domains connect', '', 'Each row lists the record types a type links to, with the number of links.', '');
  out.push('| From | Links to |', '| --- | --- |');
  const typeEdges = new Map();
  for (const l of links) {
    if (!recs.has(l.to)) continue;
    const a = typeOf(l.from), b = typeOf(l.to);
    if (!typeEdges.has(a)) typeEdges.set(a, new Map());
    typeEdges.get(a).set(b, (typeEdges.get(a).get(b) || 0) + 1);
  }
  for (const [a, m] of [...typeEdges].sort((x, y) => (TYPES[x[0]] || '').localeCompare(TYPES[y[0]] || ''))) {
    const parts = [...m].sort((x, y) => y[1] - x[1]).map(([b, n]) => `${TYPES[b]} ${n}`);
    out.push(`| ${TYPES[a]} | ${parts.join(', ')} |`);
  }
  out.push('', '## Economy: where each currency and item comes from and goes', '');
  out.push('| Item | Sources | Uses |', '| --- | --- | --- |');
  const fromLabel = (ls) => {
    const kinds = new Map();
    for (const l of ls) { const t = typeOf(l.from); kinds.set(t, (kinds.get(t) || 0) + 1); }
    return [...kinds].map(([t, n]) => `${TYPES[t]} ×${n}`).join(', ');
  };
  for (const t of ['cur', 'item']) {
    for (const r of all(t)) out.push(`| ${r.name || r.id} | ${fromLabel(sourcesOf(r.id)) || '—'} | ${fromLabel(sinksOf(r.id)) || (r.noSink ? 'kept' : '—')} |`);
  }
  out.push('', '## Story order', '');
  for (const c of all('chapter')) {
    out.push(`- **${c.name}**: ${(c.stages || []).length} stages; joins: ${(c.joins || []).map(label).join(', ') || 'none'}`);
  }
  if (errors.length) out.push('', '## Errors', '', ...errors.map((e) => `- ${e}`));
  writeFileSync(resolve(args[reportAt + 1]), out.join('\n') + '\n');
}

// ---------------------------------------------------------------- summary
const counts = [...byType].map(([t, l]) => `${t} ${l.length}`).join(', ');
console.log(`${recs.size} records, ${links.length} links. ${counts}`);
for (const w of warnings) console.log(`warning: ${w}`);
if (errors.length) {
  const shown = errors.slice(0, Number(process.env.MAX_ERRORS || 200));
  for (const e of shown) console.log(`error: ${e}`);
  if (errors.length > shown.length) console.log(`... and ${errors.length - shown.length} more`);
  console.log(`${errors.length} errors`);
  process.exit(1);
}
console.log('OK: every link resolves, every record is reachable, every item has a source and a use.');
