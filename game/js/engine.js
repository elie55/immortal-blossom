// Immortal Blossoms battle engine: one module holding the card-battle prototype's systems (clock, effects, cards,
// technique choreography, rules, battle interface and the guided first battle), now fed by the game data.
// The prototype's modules live on as the sections below; the namespaces keep their call sites (board.x, V.x, BT.x).

const board = Object.freeze({ get CARD() { return CARD; }, get geo() { return geo; }, get clearTweens() { return clearTweens; }, get layoutBoard() { return layoutBoard; }, get slotRect() { return slotRect; }, get center() { return center; }, get createCard() { return createCard; }, get placeCard() { return placeCard; }, get refreshCard() { return refreshCard; }, get tweenCard() { return tweenCard; }, get hitCard() { return hitCard; }, get lift() { return lift; }, get lunge() { return lunge; }, get updateBoard() { return updateBoard; }, get bindTilt() { return bindTilt; }, get dealIn() { return dealIn; } });
const V = Object.freeze({ get view() { return view; }, get shakeState() { return shakeState; }, get initVfx() { return initVfx; }, get resizeVfx() { return resizeVfx; }, get shake() { return shake; }, get flash() { return flash; }, get COL() { return COL; }, get fx() { return fx; }, get ring() { return ring; }, get bolt() { return bolt; }, get beam() { return beam; }, get rays() { return rays; }, get orb() { return orb; }, get emitP() { return emitP; }, get floatText() { return floatText; }, get updateVfx() { return updateVfx; }, get renderVfx() { return renderVfx; } });
const BT = Object.freeze({ get B() { return B; }, get on() { return on; }, get off() { return off; }, get emit() { return emit; }, get getUnit() { return getUnit; }, get heroes() { return heroes; }, get enemies() { return enemies; }, get foes() { return foes; }, get allies() { return allies; }, get has() { return has; }, get advantage() { return advantage; }, get startBattle() { return startBattle; }, get chainOrder() { return chainOrder; }, get addStatus() { return addStatus; }, get removeStatus() { return removeStatus; }, get cleanse() { return cleanse; }, get dispel() { return dispel; }, get phaseMul() { return phaseMul; }, get computeHit() { return computeHit; }, get applyDamage() { return applyDamage; }, get applyHealAmount() { return applyHealAmount; }, get killUnit() { return killUnit; }, get chainStep() { return chainStep; }, get addPoints() { return addPoints; }, get doCast() { return doCast; }, get canAct() { return canAct; }, get validTargets() { return validTargets; }, get selectTech() { return selectTech; }, get deselect() { return deselect; }, get toggleEmpower() { return toggleEmpower; }, get chooseTarget() { return chooseTarget; }, get endTurn() { return endTurn; }, get setAuto() { return setAuto; }, get rerollEncounter() { return rerollEncounter; }, get buyEncounter() { return buyEncounter; }, get cancelPending() { return cancelPending; }, get encounterTargets() { return encounterTargets; }, get forfeit() { return forfeit; }, get gainQi() { return gainQi; }, get flare() { return flare; }, get comboFire() { return comboFire; }, get atkOf() { return atkOf; }, get defOf() { return defOf; } });

// ===== core =====
// Core helpers: game clock, async waits, asset loading, easing, tiny synth SFX.

const clock = { t: 0, speed: 1, paused: false, timers: [], hitstop: 0, slowUntil: 0, slowFactor: 1 };

/** Resolve after `ms` of *game* time (respects pause and the x2 speed toggle). */
function wait(ms) {
  return new Promise(res => clock.timers.push({ at: clock.t + ms, res }));
}
/** Freeze the whole battle for a few real milliseconds: the "impact frame" feel. */
function hitStop(ms) { clock.hitstop = Math.max(clock.hitstop, ms / clock.speed); }
/** Slow time down (factor < 1) for `ms` real milliseconds. */
function slowMo(factor, ms) { clock.slowFactor = factor; clock.slowUntil = performance.now() + ms / clock.speed; }
/** Game-time multiplier for this real frame (hit-stop > slow-mo > normal). */
function timeScale(dtReal) {
  if (clock.hitstop > 0) { clock.hitstop -= dtReal; return 0.02; }
  if (performance.now() < clock.slowUntil) return clock.slowFactor;
  return 1;
}
function tickClock(dtMs) {
  clock.t += dtMs;
  if (!clock.timers.length) return;
  const due = clock.timers.filter(t => t.at <= clock.t);
  if (due.length) {
    clock.timers = clock.timers.filter(t => t.at > clock.t);
    due.forEach(t => t.res());
  }
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const ease = {
  linear: t => t,
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inCubic: t => t * t * t,
  inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outQuint: t => 1 - Math.pow(1 - t, 5),
  inQuad: t => t * t,
  outQuad: t => 1 - (1 - t) * (1 - t),
  inQuint: t => t * t * t * t * t,
  outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: t => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outElastic: t => { if (t <= 0 || t >= 1) return t; return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1; },
};

const images = {};
function loadImage(key, src) {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => { images[key] = im; res(im); };
    im.onerror = () => { console.warn('missing image', src); res(null); };
    im.src = src;
  });
}
async function loadAll(list, onProgress) {
  let done = 0;
  await Promise.all(list.map(([k, s]) => loadImage(k, s).then(() => onProgress && onProgress(++done / list.length))));
}

// ---------- Synth SFX (no audio files needed; replace with real SFX later) ----------
let actx = null, master = null;
const audio = { muted: false };
function initAudio() {
  if (actx) return;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain(); master.gain.value = 0.55; master.connect(actx.destination);
  } catch (e) { actx = null; }
}
function noiseBuffer(sec) {
  const b = actx.createBuffer(1, Math.floor(actx.sampleRate * sec), actx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function env(g, t0, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
}
function noise({ dur = 0.3, type = 'bandpass', f0 = 2000, f1 = 600, q = 1, vol = 0.5, a = 0.005 }) {
  const t0 = actx.currentTime;
  const src = actx.createBufferSource(); src.buffer = noiseBuffer(dur + 0.05);
  const f = actx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
  const g = actx.createGain(); env(g, t0, a, vol, dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(t0); src.stop(t0 + dur + 0.05);
}
function tone({ dur = 0.3, type = 'sine', f0 = 440, f1 = 440, vol = 0.3, a = 0.005, delay = 0 }) {
  const t0 = actx.currentTime + delay;
  const o = actx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = actx.createGain(); env(g, t0, a, vol, dur);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + a + 0.05);
}
function sfx(name) {
  if (!actx || audio.muted || clock.paused) return;
  switch (name) {
    case 'slash': noise({ dur: 0.18, f0: 6000, f1: 900, q: 0.8, vol: 0.35 }); break;
    case 'hit': noise({ dur: 0.16, type: 'lowpass', f0: 1800, f1: 120, vol: 0.6 }); tone({ dur: 0.14, type: 'triangle', f0: 160, f1: 50, vol: 0.4 }); break;
    case 'crit': noise({ dur: 0.25, type: 'lowpass', f0: 3000, f1: 100, vol: 0.7 }); tone({ dur: 0.25, type: 'square', f0: 220, f1: 40, vol: 0.18 }); break;
    case 'dash': noise({ dur: 0.22, f0: 900, f1: 3500, q: 0.6, vol: 0.18 }); break;
    case 'fire': noise({ dur: 0.6, type: 'lowpass', f0: 900, f1: 200, vol: 0.5, a: 0.03 }); break;
    case 'boom': noise({ dur: 0.9, type: 'lowpass', f0: 1200, f1: 60, vol: 0.8, a: 0.01 }); tone({ dur: 0.7, type: 'sine', f0: 90, f1: 30, vol: 0.5 }); break;
    case 'ice': [1800, 2400, 3100].forEach((f, i) => tone({ dur: 0.35, type: 'triangle', f0: f, f1: f * 1.02, vol: 0.12, delay: i * 0.04 })); noise({ dur: 0.3, f0: 8000, f1: 3000, q: 2, vol: 0.15 }); break;
    case 'thunder': noise({ dur: 0.5, type: 'highpass', f0: 3000, f1: 400, vol: 0.55, a: 0.002 }); noise({ dur: 0.9, type: 'lowpass', f0: 400, f1: 50, vol: 0.6, a: 0.02 }); break;
    case 'heal': [523, 659, 784, 1046].forEach((f, i) => tone({ dur: 0.5, type: 'sine', f0: f, f1: f, vol: 0.13, delay: i * 0.07 })); break;
    case 'ghost': tone({ dur: 0.8, type: 'sawtooth', f0: 300, f1: 140, vol: 0.08, a: 0.1 }); noise({ dur: 0.7, f0: 700, f1: 300, q: 4, vol: 0.2, a: 0.1 }); break;
    case 'ult': tone({ dur: 1.2, type: 'sawtooth', f0: 110, f1: 440, vol: 0.12, a: 0.2 }); noise({ dur: 1.0, f0: 500, f1: 5000, q: 0.7, vol: 0.2, a: 0.3 }); break;
    case 'whoosh': noise({ dur: 0.28, f0: 400, f1: 4200, q: 0.9, vol: 0.22, a: 0.04 }); break;
    case 'charge': tone({ dur: 0.9, type: 'sine', f0: 180, f1: 900, vol: 0.12, a: 0.25 }); noise({ dur: 0.9, f0: 300, f1: 6000, q: 3, vol: 0.12, a: 0.4 }); break;
    case 'shatter': [2600, 3300, 4100, 5200].forEach((f, i) => tone({ dur: 0.25, type: 'triangle', f0: f, f1: f * 0.9, vol: 0.09, delay: i * 0.025 })); noise({ dur: 0.35, type: 'highpass', f0: 5000, f1: 2000, vol: 0.3 }); break;
    case 'rumble': noise({ dur: 1.2, type: 'lowpass', f0: 220, f1: 40, vol: 0.7, a: 0.05 }); break;
    case 'zap': noise({ dur: 0.12, type: 'highpass', f0: 6000, f1: 1500, vol: 0.35, a: 0.001 }); tone({ dur: 0.1, type: 'square', f0: 1400, f1: 300, vol: 0.06 }); break;
    case 'turn': tone({ dur: 0.12, type: 'sine', f0: 880, f1: 1320, vol: 0.08 }); break;
    case 'click': tone({ dur: 0.06, type: 'triangle', f0: 1200, f1: 900, vol: 0.08 }); break;
    case 'win': [392, 523, 659, 784, 1046].forEach((f, i) => tone({ dur: 0.7, type: 'triangle', f0: f, f1: f, vol: 0.15, delay: i * 0.12 })); break;
    case 'lose': [392, 349, 311, 262].forEach((f, i) => tone({ dur: 0.8, type: 'triangle', f0: f, f1: f * 0.98, vol: 0.15, delay: i * 0.2 })); break;
  }
}


// ===== defs =====
// Phases, statuses and combat rules. Statuses use short ids inside the engine; STATUS[k].id is the data id.

const PHASES = {
  water: { name: 'Water', glyph: '水', color: '#7cc6ff', col: 'ice' },
  wood:  { name: 'Wood',  glyph: '木', color: '#86e38f', col: 'jade' },
  fire:  { name: 'Fire',  glyph: '火', color: '#ff8048', col: 'fire' },
  earth: { name: 'Earth', glyph: '土', color: '#e4b45a', col: 'gold' },
  metal: { name: 'Metal', glyph: '金', color: '#efe6c8', col: 'white' },
  yin:   { name: 'Yin',   glyph: '阴', color: '#b98cff', col: 'violet' },
  yang:  { name: 'Yang',  glyph: '阳', color: '#ffd36a', col: 'gold' },
};
/** Generating cycle (who feeds whom): casting a technique adds Phase Qi to the phase it feeds. */
const GEN = { water: 'wood', wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', yin: 'yin', yang: 'yang' };
/** Overcoming cycle (who beats whom). */
const OVER = { metal: 'wood', wood: 'earth', earth: 'water', water: 'fire', fire: 'metal' };
const CYCLE = ['water', 'wood', 'fire', 'earth', 'metal'];

const RULES = {
  advMul: 1.3, resMul: 0.75, advCrit: 0.15, pointBonus: 0.08, harmonyStep: 0.15, harmonyCap: 4, harmonyQi: 2,
  kindredStep: 0.1, kindredCap: 0.3, empowerMul: 1.35, defK: 900,
  qiStart: 4, qiBase: 2, qiPerHeroine: 1, qiPerKill: 3, qiMax: 30,
  shatterMul: 1.3, frostBreakMul: 1.3, markMul: 1.25,
  tribulationRound: 12, tribulationBase: 0.06, tribulationStep: 0.03, hasteFull: 100,
};
/** Read rules:combat from the game data (the numbers designers tune). */
function configureRules(c) {
  if (!c) return;
  const q = c.spiritQi || {}, h = c.harmony || {}, k = c.kindredQi || {}, t = c.tribulation || {};
  Object.assign(RULES, {
    harmonyStep: h.stepBonus ?? RULES.harmonyStep, harmonyCap: h.cap ?? RULES.harmonyCap, harmonyQi: h.spiritQiAtCap ?? RULES.harmonyQi,
    kindredStep: k.stepBonus ?? RULES.kindredStep, kindredCap: k.cap ?? RULES.kindredCap,
    empowerMul: c.empowerMultiplier ?? RULES.empowerMul, defK: c.defenseK ?? RULES.defK,
    qiStart: q.start ?? RULES.qiStart, qiBase: q.perTurnBase ?? RULES.qiBase, qiPerHeroine: q.perLivingHeroine ?? RULES.qiPerHeroine,
    qiPerKill: q.perKill ?? RULES.qiPerKill, qiMax: q.max ?? RULES.qiMax,
    tribulationRound: t.fromRound ?? RULES.tribulationRound, tribulationBase: t.basePct ?? RULES.tribulationBase, tribulationStep: t.perRoundPct ?? RULES.tribulationStep,
    resistCap: c.debuffResist?.cap ?? 0.85,
  });
}

const STATUS = {
  surge:    { id: 'status:surging_qi', name: 'Surging Qi', glyph: '盛', color: '#ff9a5a', desc: '+50% Attack.' },
  iron:     { id: 'status:iron_body', name: 'Iron Body', glyph: '铁', color: '#e4c27a', desc: '+60% Defense.' },
  wind:     { id: 'status:wind_step', name: 'Wind Step', glyph: '风', color: '#9ff0c8', desc: '+30 Haste: her techniques recharge sooner.' },
  intent:   { id: 'status:sword_intent', name: 'Sword Intent', glyph: '剑', color: '#e8f0ff', desc: '+30% critical chance.' },
  shield:   { id: 'status:spirit_shield', name: 'Spirit Shield', glyph: '盾', color: '#ffe08a', desc: 'Absorbs damage.' },
  clear:    { id: 'status:clear_heart', name: 'Clear Heart', glyph: '净', color: '#ffffff', desc: 'Immune to debuffs.' },
  bell:     { id: 'status:golden_bell', name: 'Golden Bell', glyph: '钟', color: '#ffd36a', desc: 'Takes no damage.' },
  veil:     { id: 'status:shadow_veil', name: 'Shadow Veil', glyph: '隐', color: '#9a8cff', desc: 'Cannot be targeted by single-target techniques.' },
  thorns:   { id: 'status:thorn_lotus', name: 'Thorn Lotus', glyph: '刺', color: '#ff7aa8', desc: 'Strikes back for 50% ATK when a single-target technique hits her.' },
  dew:      { id: 'status:lotus_dew', name: 'Lotus Dew', glyph: '露', color: '#9ff0b8', desc: 'Recovers 6% of max health at the start of its turn.' },
  rebirth:  { id: 'status:phoenix_rebirth', name: 'Phoenix Rebirth', glyph: '凰', color: '#ffb35a', desc: 'Revives once at 30% health.' },
  burn:     { id: 'status:fire_poison', name: 'Fire Poison', glyph: '火', color: '#ff7b45', debuff: true, desc: 'Takes fire damage at the start of its turn.' },
  venom:    { id: 'status:gu_venom', name: 'Gu Venom', glyph: '毒', color: '#9be36e', debuff: true, desc: 'Loses 6% of max health at the start of its turn.' },
  wound:    { id: 'status:sword_wound', name: 'Sword Wound', glyph: '伤', color: '#ff6a6a', debuff: true, desc: 'Bleeds at the start of its turn; each stack adds more.' },
  frost:    { id: 'status:frost_seal', name: 'Frost Seal', glyph: '冰', color: '#7cc6ff', debuff: true, desc: 'Skips its next turn. The next hit breaks the seal for +30% damage.' },
  shock:    { id: 'status:soul_shock', name: 'Soul Shock', glyph: '晕', color: '#c58bff', debuff: true, desc: 'Skips its next turn.' },
  sealed:   { id: 'status:sealed_meridians', name: 'Sealed Meridians', glyph: '封', color: '#c8a0ff', debuff: true, desc: 'Cannot use S2 or S3.' },
  dream:    { id: 'status:lotus_dream', name: 'Lotus Dream', glyph: '梦', color: '#f2b8ff', debuff: true, desc: 'Sleeps through its turns until something hits it.' },
  provoke:  { id: 'status:provoke', name: 'Provoke', glyph: '挑', color: '#ff6060', debuff: true, desc: 'Must aim its single-target techniques at the one who provoked it.' },
  disrupt:  { id: 'status:qi_disruption', name: 'Qi Disruption', glyph: '乱', color: '#e07070', debuff: true, desc: 'Deals 30% less damage.' },
  bshatter: { id: 'status:body_shatter', name: 'Body Shatter', glyph: '破', color: '#e0a070', debuff: true, desc: '-70% Defense.' },
  entangle: { id: 'status:entangle', name: 'Entangle', glyph: '缠', color: '#86e38f', debuff: true, desc: 'Its techniques do not recharge next turn.' },
  mist:     { id: 'status:mist_veil', name: 'Mist Veil', glyph: '雾', color: '#b0c4d8', debuff: true, desc: 'Half of its hits glance off for half damage.' },
  wither:   { id: 'status:withering', name: 'Withering', glyph: '枯', color: '#a88bc0', debuff: true, desc: 'Cannot be healed.' },
  mark:     { id: 'status:karmic_mark', name: 'Karmic Mark', glyph: '印', color: '#ff5a7a', debuff: true, desc: 'Takes 25% more damage.' },
  shatter:  { id: 'status:shattered', name: 'Shattered', glyph: '碎', color: '#ffd27a', debuff: true, desc: 'Qi shield broken: takes 30% more damage until its turn ends, and its ultimate was delayed by 1 turn.' },
  demon:    { id: 'status:heart_demon', name: 'Heart Demon', glyph: '魔', color: '#ff3d8b', debuff: true, desc: 'Stacks. At 3 stacks it attacks one of its own allies, then the stacks clear.' },
};
/** Data id (status:frost_seal) or short id (frost) -> short id. */
const SID = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [v.id, k]));
const sid = (x) => (STATUS[x] ? x : SID[x]);

// Fortuitous Encounters (奇遇): offered on even rounds, bought with Spirit Qi. rarity 1 common, 2 rare, 3 legendary.
const ENCOUNTERS = [
  { id: 'thunder_tal', name: 'Thunder Talisman', kind: 'Talisman', rarity: 1, cost: 5, target: 'none', glyph: '雷', desc: 'Lightning strikes every enemy for 90% of your highest ATK (Wood).' },
  { id: 'frost_tal', name: 'Frost Talisman', kind: 'Talisman', rarity: 1, cost: 5, target: 'enemy', glyph: '冰', desc: 'Frost Seal one enemy: it skips its next turn.' },
  { id: 'qi_pill', name: 'Qi Recovery Pill', kind: 'Pill', rarity: 1, cost: 5, target: 'none', glyph: '丹', desc: 'Every heroine recovers 20% of max health.' },
  { id: 'gather_array', name: 'Spirit Gathering Array', kind: 'Array', rarity: 1, cost: 6, target: 'none', glyph: '阵', desc: '+2 Spirit Qi at the start of each of your turns.' },
  { id: 'phase_bead', name: 'Five Phases Bead', kind: 'Treasure', rarity: 2, cost: 8, target: 'ally', glyph: '珠', attach: true, desc: 'Attach to a heroine: +1 Phase Qi of her phase at the start of each of your turns.' },
  { id: 'sword_insight', name: 'Sword Intent Insight', kind: 'Insight', rarity: 2, cost: 8, target: 'ally', glyph: '剑', attach: true, desc: 'Attach to a heroine: +25% critical chance.' },
  { id: 'jade_robe', name: 'Cloud Jade Robe', kind: 'Treasure', rarity: 2, cost: 7, target: 'ally', glyph: '衣', attach: true, desc: 'Attach to a heroine: she takes 20% less damage.' },
  { id: 'mark_tal', name: 'Karmic Mark Talisman', kind: 'Talisman', rarity: 2, cost: 7, target: 'none', glyph: '印', desc: 'Every enemy takes 25% more damage for 2 turns.' },
  { id: 'phoenix_feather', name: 'Phoenix Feather', kind: 'Treasure', rarity: 3, cost: 11, target: 'ally', glyph: '羽', attach: true, desc: 'Attach to a heroine: she revives once at 40% health.' },
  { id: 'heaven_pill', name: 'Heaven-Defying Pill', kind: 'Pill', rarity: 3, cost: 10, target: 'ally', glyph: '天', desc: 'Every technique of one heroine is ready at once.' },
];

const FX_LIST = [
  'curse_sigil', 'fire_burst', 'fire_crescent', 'fire_sigil', 'ghost_burst', 'ghost_flame', 'ghost_skull', 'ghost_slash',
  'heal_burst', 'ice_burst', 'ice_crescent', 'ice_sigil', 'ice_sword', 'jade_pillar', 'lotus_bloom', 'lotus_petal',
  'phoenix', 'thunder_blade', 'thunder_bolt', 'thunder_burst', 'thunder_x',
];

// ===== vfx =====
// VFX layer: two transparent canvases (behind and in front of the cards) in stage coordinates.
// Sprite effects (alpha-luminance art drawn additively), shockwave rings, procedural lightning,
// light pillars, god rays, particles, screen flash and floating combat text.

const view = { W: 1600, H: 720, s: 1, dpr: 1 };
const L = { back: null, front: null };   // { cv, ctx }
const fxBack = [], fxFront = [], parts = [], texts = [];
let flashA = 0, flashColor = '#fff', flashDecay = 0.004;
const shakeState = { amp: 0, until: 0, dur: 1, x: 0, y: 0 };
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function initVfx(back, front) {
  L.back = { cv: back, ctx: back.getContext('2d') };
  L.front = { cv: front, ctx: front.getContext('2d') };
  makeGlows();
}
function resizeVfx(W, H, s) {
  view.W = W; view.H = H; view.s = s; view.dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const l of [L.back, L.front]) {
    l.cv.width = Math.round(W * s * view.dpr); l.cv.height = Math.round(H * s * view.dpr);
    l.cv.style.width = W + 'px'; l.cv.style.height = H + 'px';
  }
}

// ---------------- screen effects ----------------
function shake(amp = 8, dur = 260) {
  if (reduceMotion) amp *= 0.3;
  shakeState.amp = Math.max(amp, shakeState.amp * 0.5); shakeState.until = clock.t + dur; shakeState.dur = dur;
}
function flash(color = '#ffffff', a = 0.5, decay = 0.004) { flashColor = color; flashA = (reduceMotion ? a * 0.4 : a) * 0.6; flashDecay = decay * 0.6; }

// ---------------- glow sprites ----------------
const glowCache = {};
const COL = { white: [255, 255, 255], gold: [255, 214, 120], fire: [255, 130, 50], ice: [140, 210, 255], violet: [195, 120, 255], jade: [120, 255, 170], pink: [255, 150, 200], cyan: [80, 255, 230], red: [255, 70, 60], green: [140, 255, 120] };
function makeGlows() {
  for (const [k, c] of Object.entries(COL)) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.22, `rgba(${c},0.95)`); gr.addColorStop(0.55, `rgba(${c},0.35)`); gr.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); glowCache[k] = cv;
  }
  const soft = (name, rgb, a) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(0.5, `rgba(${rgb},${a * 0.45})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); glowCache[name] = cv;
  };
  soft('smoke', '70,62,80', 0.32); soft('dust', '214,198,170', 0.4);
}

/**
 * Sprite effect. o: x,y, w, rot, dur, delay, fadeIn, fadeOut, s0,s1, vx,vy, spin, flip, alpha, blend,
 * ax,ay (anchor), sy (squash), path(k)->{x,y,rot}, back (behind cards), sweep {a0,a1,t,color}, bloom, flicker
 */
function fx(key, o = {}) {
  const img = key.startsWith('glow:') ? glowCache[key.slice(5)] : images['fx_' + key];
  if (!img) return null;
  const e = {
    kind: 'img', img, x: o.x || 0, y: o.y || 0, w: o.w || img.width, rot: o.rot || 0, t0: clock.t + (o.delay || 0), dur: o.dur || 600,
    fadeIn: o.fadeIn ?? 0.1, fadeOut: o.fadeOut ?? 0.45, s0: o.s0 ?? 1, s1: o.s1 ?? 1, vx: o.vx || 0, vy: o.vy || 0,
    ax: o.ax ?? 0.5, ay: o.ay ?? 0.5, spin: o.spin || 0, flip: !!o.flip, alpha: o.alpha ?? 1, blend: o.blend || 'lighter',
    sy: o.sy ?? 1, e: o.ease || ease.outCubic, path: o.path || null, sweep: o.sweep || null, bloom: o.bloom || 0, flicker: o.flicker || 0,
  };
  (o.back ? fxBack : fxFront).push(e);
  return e;
}
function ring(o) {
  const e = { kind: 'ring', x: o.x, y: o.y, r0: o.r0 ?? 10, r1: o.r1 ?? 200, w: o.width ?? 12, sy: o.sy ?? 1, rgb: COL[o.color || 'white'], t0: clock.t + (o.delay || 0), dur: o.dur || 500, alpha: o.alpha ?? 1, e: o.ease || ease.outCubic };
  (o.back ? fxBack : fxFront).push(e); return e;
}
function bolt(o) {
  const e = { kind: 'bolt', x0: o.x0, y0: o.y0, x1: o.x1, y1: o.y1, rgb: COL[o.color || 'violet'], w: o.width ?? 4, t0: clock.t + (o.delay || 0), dur: o.dur || 260, jitter: o.jitter ?? 0.22, branches: o.branches ?? 2, refresh: o.refresh ?? 45, seedAt: -1, pts: null, br: [], alpha: o.alpha ?? 1 };
  fxFront.push(e); return e;
}
function beam(o) {
  const e = { kind: 'beam', x: o.x, y: o.y, w: o.w ?? 120, h: o.h ?? 700, rgb: COL[o.color || 'white'], t0: clock.t + (o.delay || 0), dur: o.dur || 900, alpha: o.alpha ?? 1 };
  (o.back ? fxBack : fxFront).push(e); return e;
}
function rays(o) {
  const e = { kind: 'rays', x: o.x, y: o.y, rgb: COL[o.color || 'gold'], n: o.n ?? 14, len: o.len ?? 420, t0: clock.t + (o.delay || 0), dur: o.dur || 1400, spin: o.spin ?? 0.35, alpha: o.alpha ?? 0.6, seed: Math.random() * 10 };
  fxBack.push(e); return e;
}
/** Orb that flies along a curve from a to b (Phase Qi feedback). */
function orb(o) {
  const e = { kind: 'orb', x0: o.x0, y0: o.y0, x1: o.x1, y1: o.y1, col: o.color || 'gold', t0: clock.t + (o.delay || 0), dur: o.dur || 650, size: o.size || 18, arc: o.arc ?? -120 };
  fxFront.push(e); return e;
}

// ---------------- particles ----------------
/** emitP(type, x, y, n, o): spark | glow | ember | shard | petal | wisp | smoke | snow | debris */
function emitP(type, x, y, n, o = {}) {
  const sp = o.speed || [120, 520], an = o.angle || [0, Math.PI * 2], sz = o.size || defaultSize[type], lf = o.life || [350, 900];
  for (let i = 0; i < n; i++) {
    const a = rand(an[0], an[1]), v = rand(sp[0], sp[1]);
    const rx = o.rect ? rand(-o.rect[0] / 2, o.rect[0] / 2) : (o.spread ? rand(-o.spread, o.spread) : 0);
    const ry = o.rect ? rand(-o.rect[1] / 2, o.rect[1] / 2) : (o.spread ? rand(-o.spread, o.spread) * 0.6 : 0);
    parts.push({
      type, x: x + rx, y: y + ry, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.up || 0),
      g: o.gravity ?? gravityOf[type], drag: o.drag ?? dragOf[type], size: rand(sz[0], sz[1]), life: rand(lf[0], lf[1]), age: -(o.delay ? rand(0, o.delay) : 0),
      rot: rand(0, 6.28), vr: rand(-8, 8), rgb: COL[o.color || 'white'], col: o.color || 'white', ph: rand(0, 6.28), alpha: o.alpha ?? 1, back: !!o.back,
    });
  }
}
const defaultSize = { spark: [3, 6], glow: [12, 34], ember: [3, 7], shard: [6, 15], petal: [7, 12], wisp: [26, 60], smoke: [40, 90], snow: [2, 4.5], debris: [4, 9], dust: [30, 70] };
const gravityOf = { spark: 260, glow: 0, ember: -120, shard: 700, petal: 40, wisp: -70, smoke: -30, snow: 30, debris: 1200, dust: -20 };
const dragOf = { spark: 2.6, glow: 1.6, ember: 1.2, shard: 1.4, petal: 2.0, wisp: 1.4, smoke: 1.8, snow: 1.5, debris: 0.6, dust: 2.4 };

// ---------------- floating text ----------------
function floatText(text, x, y, style = 'dmg', o = {}) {
  texts.push({ text: String(text), x: x + rand(-6, 6), y, t0: clock.t + (o.delay || 0), style, label: o.label || null, rot: rand(-0.06, 0.06), dur: style === 'info' || style === 'harmony' ? 1400 : 1150, size: o.size });
}

// ---------------- update ----------------
function updateVfx(dt) {
  const t = clock.t, dts = dt / 1000;
  if (flashA > 0) flashA = Math.max(0, flashA - flashDecay * dt);
  for (const list of [fxBack, fxFront]) for (let i = list.length - 1; i >= 0; i--) if (t > list[i].t0 + list[i].dur) list.splice(i, 1);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.age += dt;
    if (p.age < 0) continue;
    if (p.age > p.life) { parts.splice(i, 1); continue; }
    const d = Math.exp(-p.drag * dts);
    p.vx *= d; p.vy = p.vy * d + p.g * dts;
    if (p.type === 'wisp' || p.type === 'petal' || p.type === 'ember' || p.type === 'snow') p.vx += Math.sin(p.age / 180 + p.ph) * 40 * dts * (p.type === 'petal' ? 3 : 1);
    p.x += p.vx * dts; p.y += p.vy * dts; p.rot += p.vr * dts;
  }
  if (parts.length > 1100) parts.splice(0, parts.length - 1100);
  for (let i = texts.length - 1; i >= 0; i--) if (t > texts[i].t0 + texts[i].dur) texts.splice(i, 1);
  if (t < shakeState.until) {
    const k = (shakeState.until - t) / shakeState.dur, a = shakeState.amp * k * k;
    shakeState.x = rand(-a, a); shakeState.y = rand(-a, a) * 0.7;
  } else { shakeState.x = 0; shakeState.y = 0; }
}

// ---------------- render ----------------
function renderVfx() {
  const sc = view.s * view.dpr;
  for (const [l, list, front] of [[L.back, fxBack, false], [L.front, fxFront, true]]) {
    const ctx = l.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, l.cv.width, l.cv.height);
    ctx.setTransform(sc, 0, 0, sc, 0, 0);
    drawFxList(ctx, list);
    drawParticles(ctx, !front);
    if (front) {
      drawTexts(ctx);
      if (flashA > 0.005) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, flashA); ctx.fillStyle = flashColor; ctx.fillRect(-50, -50, view.W + 100, view.H + 100); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    }
  }
}

function drawFxList(ctx, list) {
  const t = clock.t;
  for (const e of list) {
    if (t < e.t0) continue;
    const k = clamp((t - e.t0) / e.dur, 0, 1), el = (t - e.t0) / 1000;
    if (e.kind === 'ring') { drawRingFx(ctx, e, k); continue; }
    if (e.kind === 'bolt') { drawBolt(ctx, e, k, t); continue; }
    if (e.kind === 'beam') { drawBeam(ctx, e, k); continue; }
    if (e.kind === 'rays') { drawRays(ctx, e, k, el); continue; }
    if (e.kind === 'orb') { drawOrb(ctx, e, k); continue; }
    let a = e.alpha;
    if (k < e.fadeIn) a *= k / e.fadeIn;
    if (k > 1 - e.fadeOut) a *= (1 - k) / e.fadeOut;
    if (e.flicker) a *= 1 - e.flicker * Math.random();
    const scl = lerp(e.s0, e.s1, e.e(k));
    let x = e.x + e.vx * el, y = e.y + e.vy * el;
    if (e.path) { const p = e.path(k); x = p.x; y = p.y; if (p.rot != null) e.rot = p.rot; }
    const w = e.w * scl, h = w * (e.img.height / e.img.width);
    ctx.save(); ctx.globalAlpha = clamp(a, 0, 1); ctx.globalCompositeOperation = e.blend;
    ctx.translate(x, y); ctx.scale(1, e.sy); ctx.rotate(e.rot + e.spin * el); if (e.flip) ctx.scale(-1, 1);
    if (e.sweep) {
      const sk = ease.outCubic(clamp(k / (e.sweep.t || 0.35), 0, 1));
      const a0 = e.sweep.a0, a1 = a0 + (e.sweep.a1 - e.sweep.a0) * sk, R = Math.max(w, h);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, Math.min(a0, a1), Math.max(a0, a1)); ctx.closePath(); ctx.clip();
      if (sk < 1) { const r = (e.sweep.r ?? 0.36) * w; ctx.drawImage(glowCache[e.sweep.color || 'white'], Math.cos(a1) * r - w * 0.16, Math.sin(a1) * r - w * 0.16, w * 0.32, w * 0.32); }
    }
    ctx.drawImage(e.img, -w * e.ax, -h * e.ay, w, h);
    if (e.bloom) { ctx.globalAlpha = clamp(a * e.bloom, 0, 1); const b = 1.14; ctx.drawImage(e.img, -w * e.ax * b, -h * e.ay * b, w * b, h * b); }
    ctx.restore();
  }
}
function drawRingFx(ctx, e, k) {
  const v = e.e(k), r = lerp(e.r0, e.r1, v), a = e.alpha * Math.pow(1 - k, 1.4);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(e.x, e.y); ctx.scale(1, e.sy);
  ctx.strokeStyle = `rgba(${e.rgb},${a * 0.28})`; ctx.lineWidth = e.w * (1 - k) * 2.6 + 2; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = `rgba(${e.rgb},${a * 0.85})`; ctx.lineWidth = e.w * (1 - k) + 1; ctx.stroke();
  ctx.strokeStyle = `rgba(255,255,255,${a * 0.7})`; ctx.lineWidth = Math.max(1, e.w * (1 - k) * 0.3); ctx.stroke();
  ctx.restore();
}
function boltPoints(x0, y0, x1, y1, jit, depth = 5) {
  let pts = [[x0, y0], [x1, y1]];
  let off = Math.hypot(x1 - x0, y1 - y0) * jit;
  for (let d = 0; d < depth; d++) {
    const np = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const mx = (ax + bx) / 2, my = (ay + by) / 2, nx = -(by - ay), ny = bx - ax, nl = Math.hypot(nx, ny) || 1, o = rand(-off, off);
      np.push([mx + nx / nl * o, my + ny / nl * o], pts[i + 1]);
    }
    pts = np; off *= 0.5;
  }
  return pts;
}
function strokePts(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); }
function drawBolt(ctx, e, k, t) {
  if (!e.pts || t - e.seedAt > e.refresh) {
    e.seedAt = t; e.pts = boltPoints(e.x0, e.y0, e.x1, e.y1, e.jitter); e.br = [];
    for (let b = 0; b < e.branches; b++) {
      const p = e.pts[Math.floor(rand(0.2, 0.8) * e.pts.length)], ang = Math.atan2(e.y1 - e.y0, e.x1 - e.x0) + rand(-1.1, 1.1), len = Math.hypot(e.x1 - e.x0, e.y1 - e.y0) * rand(0.15, 0.35);
      e.br.push(boltPoints(p[0], p[1], p[0] + Math.cos(ang) * len, p[1] + Math.sin(ang) * len, 0.3, 3));
    }
  }
  const a = e.alpha * (k < 0.15 ? 1 : Math.pow(1 - (k - 0.15) / 0.85, 0.7)) * (0.7 + 0.3 * Math.random());
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const [wm, col, am] of [[6, e.rgb, 0.16], [2.6, e.rgb, 0.5], [1, '255,255,255', 0.95]]) {
    ctx.strokeStyle = `rgba(${col},${a * am})`; ctx.lineWidth = e.w * wm; strokePts(ctx, e.pts);
    ctx.lineWidth = e.w * wm * 0.5; for (const b of e.br) strokePts(ctx, b);
  }
  ctx.restore();
}
function drawBeam(ctx, e, k) {
  const env = Math.sin(Math.PI * Math.min(1, k * 1.15)), w = e.w * (0.3 + 0.7 * env), a = e.alpha * env;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(0, e.y, 0, e.y - e.h);
  g.addColorStop(0, `rgba(${e.rgb},${a * 0.9})`); g.addColorStop(0.6, `rgba(${e.rgb},${a * 0.35})`); g.addColorStop(1, `rgba(${e.rgb},0)`);
  ctx.fillStyle = g; ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.ellipse(e.x, e.y - e.h / 2, w / 2, e.h / 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = `rgba(255,255,255,${a * 0.6})`; ctx.fillRect(e.x - w * 0.08, e.y - e.h * 0.85, w * 0.16, e.h * 0.85);
  ctx.restore();
}
function drawRays(ctx, e, k, el) {
  const env = Math.sin(Math.PI * k), a = e.alpha * env;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(e.x, e.y); ctx.rotate(e.seed + el * e.spin);
  for (let i = 0; i < e.n; i++) {
    const ang = i / e.n * Math.PI * 2, len = e.len * (0.6 + 0.4 * Math.sin(i * 7.3 + e.seed)), wd = 0.07 + 0.05 * Math.sin(i * 3.1);
    const g = ctx.createLinearGradient(0, 0, Math.cos(ang) * len, Math.sin(ang) * len);
    g.addColorStop(0, `rgba(${e.rgb},${a * 0.55})`); g.addColorStop(1, `rgba(${e.rgb},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(ang - wd) * len, Math.sin(ang - wd) * len); ctx.lineTo(Math.cos(ang + wd) * len, Math.sin(ang + wd) * len); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function drawOrb(ctx, e, k) {
  const v = ease.inOutCubic(k), x = lerp(e.x0, e.x1, v), y = lerp(e.y0, e.y1, v) + Math.sin(Math.PI * v) * e.arc;
  const s = e.size * (1 + 0.4 * Math.sin(Math.PI * k)), img = glowCache[e.col] || glowCache.gold;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) { // trail
    const kv = ease.inOutCubic(Math.max(0, k - i * 0.035)), tx = lerp(e.x0, e.x1, kv), ty = lerp(e.y0, e.y1, kv) + Math.sin(Math.PI * kv) * e.arc;
    ctx.globalAlpha = 0.5 * (1 - i / 5); ctx.drawImage(img, tx - s * 0.7, ty - s * 0.7, s * 1.4, s * 1.4);
  }
  ctx.globalAlpha = 1; ctx.drawImage(img, x - s, y - s, s * 2, s * 2);
  ctx.restore();
}
function drawParticles(ctx, back) {
  ctx.save();
  for (const p of parts) {
    if (p.age < 0 || p.back !== back) continue;
    const k = p.age / p.life, a = (k < 0.1 ? k / 0.1 : 1 - Math.pow((k - 0.1) / 0.9, 1.6)) * p.alpha;
    switch (p.type) {
      case 'spark': {
        const sp = Math.hypot(p.vx, p.vy), len = Math.min(50, sp * 0.04 + p.size * 2), nx = p.vx / (sp || 1), ny = p.vy / (sp || 1);
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.lineCap = 'round';
        ctx.strokeStyle = `rgba(${p.rgb},0.9)`; ctx.lineWidth = p.size * 0.8 * (1 - k * 0.6);
        ctx.beginPath(); ctx.moveTo(p.x - nx * len, p.y - ny * len); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = p.size * 0.3; ctx.stroke();
        break;
      }
      case 'glow': case 'ember': case 'wisp': case 'snow': {
        const s = p.size * (p.type === 'wisp' ? 0.6 + k : (p.type === 'glow' ? 1 - k * 0.7 : 1));
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * (p.type === 'ember' ? 0.6 + 0.4 * Math.sin(p.age / 40 + p.ph) : (p.type === 'wisp' ? 0.4 : 1));
        ctx.drawImage(glowCache[p.col] || glowCache.white, p.x - s, p.y - s, s * 2, s * 2);
        break;
      }
      case 'shard': {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
        const tr = ctx.getTransform(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        const s = p.size; ctx.fillStyle = `rgba(${p.rgb},0.8)`;
        ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.32, 0); ctx.lineTo(0, s * 0.6); ctx.lineTo(-s * 0.32, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.moveTo(0, -s * 0.7); ctx.lineTo(s * 0.1, 0); ctx.lineTo(0, s * 0.3); ctx.lineTo(-s * 0.1, 0); ctx.closePath(); ctx.fill();
        ctx.setTransform(tr);
        break;
      }
      case 'petal': {
        const tr = ctx.getTransform();
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
        ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(Math.sin(p.age / 120 + p.ph), 1);
        const s = p.size, g = ctx.createLinearGradient(0, -s, 0, s);
        g.addColorStop(0, '#fff3f8'); g.addColorStop(1, p.col === 'gold' ? '#ffd27a' : (p.col === 'jade' ? '#9ff0c0' : '#ff8fc0'));
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.45, s, 0, 0, Math.PI * 2); ctx.fill();
        ctx.setTransform(tr);
        break;
      }
      case 'smoke': case 'dust': {
        const s = p.size * (0.6 + k * 1.1);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a * 0.8;
        ctx.drawImage(glowCache[p.type], p.x - s, p.y - s * 0.75, s * 2, s * 1.5);
        break;
      }
      case 'debris': {
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
        ctx.fillStyle = p.col === 'white' ? '#2a2430' : `rgb(${p.rgb})`; const s = p.size;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-s / 2, -s / 2, s, s * 0.7); ctx.restore();
        break;
      }
    }
  }
  ctx.restore();
}

const TEXT = {
  dmg:     { size: 40, fill: ['#fff6c8', '#ffb34a'], stroke: '#3a1606' },
  crit:    { size: 54, fill: ['#fff1a0', '#ff4a1a'], stroke: '#3a0a02', label: 'CRITICAL', glow: 'gold' },
  enemy:   { size: 40, fill: ['#ffe0e0', '#ff4d5e'], stroke: '#2a0508' },
  ecrit:   { size: 52, fill: ['#ffe0e0', '#ff2a3a'], stroke: '#2a0508', label: 'CRITICAL', glow: 'red' },
  heal:    { size: 38, fill: ['#eaffd8', '#5fe36e'], stroke: '#0f3315', glow: 'jade' },
  shield:  { size: 34, fill: ['#fffbe0', '#ffd76a'], stroke: '#2a1c04' },
  info:    { size: 26, fill: ['#ffffff', '#cfe6ff'], stroke: '#0c1830' },
  harmony: { size: 44, fill: ['#ffffff', '#ffe08a'], stroke: '#2a1806', glow: 'gold' },
  big:     { size: 58, fill: ['#ffffff', '#ffd27a'], stroke: '#2a1806', glow: 'gold' },
};
function drawTexts(ctx) {
  const t = clock.t;
  for (const tx of texts) {
    const el = t - tx.t0; if (el < 0) continue;
    const k = el / tx.dur, st = TEXT[tx.style] || TEXT.dmg, size = tx.size || st.size;
    const slam = el < 140 ? 1 + 1.2 * Math.pow(1 - el / 140, 2) : 1;
    const rise = k > 0.55 ? ease.inQuad((k - 0.55) / 0.45) * 50 : 0;
    const a = k > 0.72 ? 1 - (k - 0.72) / 0.28 : Math.min(1, el / 60);
    ctx.save(); ctx.globalAlpha = clamp(a, 0, 1);
    ctx.translate(tx.x, tx.y - rise); ctx.rotate(tx.rot * (1 - Math.min(1, el / 200))); ctx.scale(slam, slam);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (st.glow && el < 500) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - el / 500) * 0.7; ctx.drawImage(glowCache[st.glow], -size * 1.6, -size * 0.9, size * 3.2, size * 1.8); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = clamp(a, 0, 1); }
    const label = tx.label || st.label;
    if (label) { ctx.font = `700 ${Math.round(Math.max(13, size * 0.3))}px Cinzel, serif`; ctx.lineWidth = 4; ctx.strokeStyle = '#1a0a02'; ctx.strokeText(label, 0, -size * 0.68); ctx.fillStyle = '#ffd98a'; ctx.fillText(label, 0, -size * 0.68); }
    ctx.font = `${tx.style === 'info' || tx.style === 'harmony' || tx.style === 'big' ? '' : 'italic '}700 ${size}px ${tx.style === 'info' || tx.style === 'harmony' || tx.style === 'big' ? 'Cinzel, serif' : 'Oswald, Impact, sans-serif'}`;
    ctx.lineWidth = Math.max(5, size * 0.17); ctx.strokeStyle = st.stroke; ctx.lineJoin = 'round'; ctx.strokeText(tx.text, 0, 0);
    const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2); g.addColorStop(0, st.fill[0]); g.addColorStop(1, st.fill[1]);
    ctx.fillStyle = g; ctx.fillText(tx.text, 0, 0);
    ctx.restore();
  }
}


// ===== board =====
// Board: card DOM, slot layout, and a per-card motion model (offset tweens + shake + knockback + flash)
// driven by the game clock, so impact frames and the x2 speed toggle apply to cards as well as VFX.

const CARD = { w: 206, h: 309, gap: 18 };
const geo = { W: 1600, H: 720, x0: 0, enemyY: 26, heroY: 385 };
const tweens = [];
function clearTweens() { tweens.length = 0; }

function layoutBoard(W, H) {
  geo.W = W; geo.H = H;
  const rowW = 4 * CARD.w + 3 * CARD.gap;
  geo.x0 = Math.round((W - rowW) / 2);
  geo.enemyY = 24; geo.heroY = H - 24 - CARD.h;
}
/** Rect of a unit's card in stage coordinates. Enemy rows are centred whatever their size. */
function slotRect(u) {
  const step = CARD.w + CARD.gap;
  if (u.side === 'hero') return { x: geo.x0 + u.slot * step, y: geo.heroY, w: CARD.w, h: CARD.h };
  const x = geo.x0 + (u.slotX ?? u.slot) * step;
  return { x, y: geo.enemyY, w: u.wide ? CARD.w * 2 + CARD.gap : CARD.w, h: CARD.h };
}
function center(u, fy = 0.5) {
  const r = slotRect(u), m = u.m || {};
  return { x: r.x + r.w / 2 + (m.x || 0), y: r.y + r.h * fy + (m.y || 0) };
}

// ---------------- card DOM ----------------
const techIcon = (t) => (t.icon || 'g:技').startsWith('g:')
  ? `<span class="glyph">${(t.icon || 'g:技').slice(2)}</span>`
  : `<img src="assets/ui/${t.icon}.webp" alt="" draggable="false">`;

function createCard(u, parent) {
  const ph = PHASES[u.phase];
  const el = document.createElement('div');
  el.className = `card ${u.side}${u.wide ? ' wide' : ''}${u.boss ? ' boss' : ''}`;
  el.dataset.uid = u.uid;
  el.style.setProperty('--ph', ph.color);
  const r = slotRect(u);
  Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
  el.innerHTML = `
    <div class="c-body">
      <div class="c-face">
        <div class="c-art"><img src="assets/cards/${u.art}.webp" alt="" draggable="false" style="animation-delay:${-rand(0, 6).toFixed(2)}s"></div>
        <div class="c-shade"></div>
        <div class="c-foil" style="animation-delay:${-rand(0, 8).toFixed(2)}s"></div>
        ${u.side === 'hero' && u.petals >= 6 ? `<div class="c-bloom" title="Full Bloom">${'<i></i>'.repeat(8)}</div>` : ''}
        <div class="c-frame"></div>
        <div class="c-head">
          <div class="c-phase" title="${ph.name}">${ph.glyph}</div>
          <div class="c-name">${u.name}</div>
          <div class="c-lvl">${u.lvl}</div>
        </div>
        <div class="c-status"></div>
        <div class="c-slots">${u.side === 'hero' ? '<i></i><i></i>' : ''}</div>
        ${u.boss ? '<div class="c-tele"></div>' : ''}
        <div class="c-techs">${u.techs.map((t, i) => `
          <button class="tech${t.ult ? ' ult' : ''}" data-i="${i}" aria-label="${t.name}">
            ${techIcon(t)}
            <svg viewBox="0 0 60 60"><circle class="trk" cx="30" cy="30" r="27"/><circle class="arc" cx="30" cy="30" r="27"/></svg>
            <b></b>
          </button>`).join('')}
        </div>
        ${u.qiShield ? `<div class="c-qi">${'<i></i>'.repeat(u.qiShield.max)}</div>` : ''}
        <div class="c-hp"><i class="lag"></i><i class="fill"></i><i class="bar-sh"></i><span></span></div>
        <div class="c-adv"></div>
        <div class="c-crack"><span>殒</span><b>Fallen</b></div>
        <div class="c-flash"></div>
      </div>
      <div class="c-back"><span>蓮</span></div>
    </div>`;
  parent.appendChild(el);
  u.el = el; u.body = el.querySelector('.c-body');
  u.m = { x: 0, y: 0, s: 1, r: 0, rx: 0, ry: 0, o: 1, flash: 0, shake: 0, kx: 0, ky: 0, glow: 0 };
  u.hpShown = u.hp; u.hpLag = u.hp;
  refreshCard(u, true);
  return el;
}

function placeCard(u) {
  const r = slotRect(u);
  Object.assign(u.el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
}

const CIRC = 2 * Math.PI * 27;
/** Sync a card's DOM with its unit state (HP text, techniques, statuses, shields, slots). */
function refreshCard(u, first = false) {
  const el = u.el; if (!el) return;
  el.querySelector('.c-hp span').textContent = `${Math.max(0, Math.ceil(u.hp)).toLocaleString('en-US')}${u.barrier > 0 ? ` +${Math.ceil(u.barrier).toLocaleString('en-US')}` : ''}`;
  el.querySelectorAll('.tech').forEach((b, i) => {
    const t = u.techs[i], ready = t.cur <= 0;
    b.classList.toggle('ready', ready);
    b.classList.toggle('blocked', !!t.blocked);
    b.querySelector('b').textContent = ready ? '' : t.cur;
    const frac = ready ? 1 : 1 - t.cur / t.cd;
    const arc = b.querySelector('.arc');
    arc.style.strokeDasharray = `${CIRC * frac} ${CIRC}`;
  });
  // statuses
  const st = el.querySelector('.c-status');
  st.innerHTML = u.status.map(s => { const d = STATUS[s.id]; const n = s.stacks > 1 ? '×' + s.stacks : (s.turns > 0 && s.turns < 50 && s.id !== 'shield' ? s.turns : ''); return `<i class="${d.debuff ? 'debuff' : 'buff'}" style="--sc:${d.color}" title="${d.name}">${d.glyph}${n !== '' ? `<em>${n}</em>` : ''}</i>`; }).join('');
  if (u.qiShield) el.querySelectorAll('.c-qi i').forEach((s, i) => s.classList.toggle('on', i < u.qiShield.cur));
  if (u.side === 'hero') el.querySelectorAll('.c-slots i').forEach((s, i) => {
    const a = u.attached[i]; s.className = a ? `r${a.rarity}` : ''; s.textContent = a ? a.glyph : ''; s.title = a ? a.name : 'Empty encounter slot';
  });
  if (u.boss) {
    const t = u.techs.find(x => x.tele) || u.techs.find(x => x.ult) || u.techs[u.techs.length - 1], tl = el.querySelector('.c-tele');
    const when = t.cur <= 0 ? (geo.side === 'enemy' ? 'NOW' : 'NEXT TURN') : (t.cur === 1 ? 'NEXT TURN' : `in ${t.cur} turns`);
    tl.innerHTML = `<span class="g">${(t.icon || 'g:冥').slice(2)}</span><span><small>${t.name}</small><b>${when}</b></span>`;
    tl.classList.toggle('hot', t.cur <= 1);
  }
  el.classList.toggle('dead', !u.alive);
  el.classList.toggle('skip', !!u.skip && u.alive);
  if (first) { u.hpShown = u.hp; u.hpLag = u.hp; }
}

// ---------------- motion ----------------
/** Tween numeric fields of a card's motion state. Resolves on the game clock. */
function tweenCard(u, to, dur, e = ease.outCubic) {
  const m = u.m, from = {};
  for (const k in to) from[k] = m[k];
  return new Promise(res => tweens.push({ m, from, to, t0: clock.t, dur: Math.max(1, dur), e, res }));
}
function hitCard(u, { power = 1, dir = -1, color = '#ffffff' } = {}) {
  const m = u.m; if (!m) return;
  m.flash = Math.min(1, 0.55 + 0.35 * power); m.flashColor = color;
  m.shake = Math.max(m.shake, 6 * power);
  m.ky += dir * 16 * power; m.kx += rand(-6, 6) * power;
  m.kr = (m.kr || 0) + rand(-3, 3) * power;
}
async function lift(u, on = true, dur = 160) {
  u.el.classList.toggle('acting', on);
  return tweenCard(u, on ? { s: 1.07, y: u.side === 'hero' ? -16 : 16 } : { s: 1, y: 0 }, dur, ease.outCubic);
}
/** Lunge a fraction of the way toward a target card and come back. */
async function lunge(u, target, k = 0.32, dur = 170, hold = 60) {
  const a = center(u), b = center(target);
  const dx = (b.x - a.x) * k, dy = (b.y - a.y) * k;
  await tweenCard(u, { x: dx, y: dy, r: clamp(dx * 0.02, -6, 6), s: 1.1 }, dur, ease.inCubic);
  return async () => { await wait(hold); await tweenCard(u, { x: 0, y: u.side === 'hero' ? -16 : 16, r: 0, s: 1.07 }, 240, ease.outCubic); };
}

function updateBoard(dt, units) {
  const t = clock.t;
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i], k = clamp((t - tw.t0) / tw.dur, 0, 1), v = tw.e(k);
    for (const key in tw.to) tw.m[key] = lerp(tw.from[key], tw.to[key], v);
    if (k >= 1) { tweens.splice(i, 1); tw.res(); }
  }
  const dts = dt / 1000;
  for (const u of units) {
    const m = u.m; if (!m || !u.el) continue;
    if (m.flash > 0) m.flash = Math.max(0, m.flash - dt / 220);
    if (m.shake > 0) m.shake = Math.max(0, m.shake - dt / 26);
    const damp = Math.pow(0.0004, dts * 2.2);
    m.kx *= damp; m.ky *= damp; m.kr = (m.kr || 0) * damp;
    const sx = m.shake ? rand(-m.shake, m.shake) : 0, sy = m.shake ? rand(-m.shake, m.shake) * 0.6 : 0;
    const tx = m.x + m.kx + sx, ty = m.y + m.ky + sy;
    u.body.style.transform = `translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,0) rotate(${(m.r + m.kr).toFixed(2)}deg) scale(${m.s.toFixed(3)}) rotateX(${m.rx.toFixed(1)}deg) rotateY(${m.ry.toFixed(1)}deg)`;
    if (m.o !== 1 || u._o !== m.o) { u.body.style.opacity = m.o; u._o = m.o; }
    const ry = ((m.ry % 360) + 360) % 360, back = ry > 90 && ry < 270;
    if (back !== !!u._back) { u.el.classList.toggle('show-back', back); u._back = back; }
    const fl = u.el.querySelector('.c-flash');
    if (m.flash > 0.01 || u._fl) { fl.style.opacity = m.flash.toFixed(3); if (m.flashColor) fl.style.background = m.flashColor; u._fl = m.flash > 0.01; }
    // health bar easing
    u.hpShown += (u.hp - u.hpShown) * Math.min(1, dt / 90);
    u.hpLag += (u.hpShown - u.hpLag) * Math.min(1, dt / 600);
    const hp = u.el.querySelector('.c-hp');
    const pct = clamp(u.hpShown / u.maxHp, 0, 1), lag = clamp(u.hpLag / u.maxHp, 0, 1), sh = clamp((u.barrier || 0) / u.maxHp, 0, 1);
    hp.children[0].style.width = (lag * 100).toFixed(2) + '%';
    hp.children[1].style.width = (pct * 100).toFixed(2) + '%';
    hp.children[2].style.width = (sh * 100).toFixed(2) + '%';
  }
}

/** Gentle tilt toward the pointer while it hovers or presses a card (living-card feel). */
function bindTilt(stageEl, getUnit) {
  let cur = null;
  stageEl.addEventListener('pointermove', e => {
    const c = e.target.closest('.card'); const u = c && getUnit(c.dataset.uid);
    if (cur && cur !== u) { cur.m.rx = 0; cur.m.ry = 0; cur = null; }
    if (!u || !u.alive || u.el.classList.contains('acting')) return;
    const r = c.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    u.m.ry = px * 10; u.m.rx = -py * 10; cur = u;
    c.style.setProperty('--mx', ((px + 0.5) * 100).toFixed(1) + '%'); c.style.setProperty('--my', ((py + 0.5) * 100).toFixed(1) + '%');
  });
  stageEl.addEventListener('pointerleave', () => { if (cur) { cur.m.rx = 0; cur.m.ry = 0; cur = null; } });
}

/** Deal-in animation: card flies in from off-board, spinning from its back to its face. */
async function dealIn(u, delay = 0, fromTop = true) {
  const m = u.m;
  Object.assign(m, { y: fromTop ? -420 : 420, x: rand(-60, 60), r: rand(-25, 25), s: 0.6, o: 0, ry: 180 });
  u.el.classList.add('flipping');
  await wait(delay);
  m.o = 1;
  await tweenCard(u, { y: 0, x: 0, r: 0, s: 1, ry: 0 }, 520, ease.outBack);
  u.el.classList.remove('flipping');
}


// ===== skills =====
// Technique choreography on cards. Each technique gets a ctx from battle.js:
// ctx.hit / heal / shield / status / burn / delay / cleanse / revive apply the rules and show feedback.

const C = (u, fy = 0.5) => board.center(u, fy);

function projectile(key, a, b, o = {}) {
  const dur = o.dur ?? 340, arcH = o.arc ?? 40;
  const path = k => { const e = (o.ease || ease.inQuad)(k); return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e - Math.sin(Math.PI * e) * arcH }; };
  V.fx(key, { w: o.w ?? 180, dur, path, spin: o.spin || 0, rot: o.rot || 0, fadeIn: 0.05, fadeOut: 0.08, ax: o.ax ?? 0.5, flip: o.flip, bloom: o.bloom ?? 0.3 });
  if (o.trail) for (let i = 0; i < 10; i++) wait(i * dur / 10).then(() => { const p = path(i / 10); V.emitP(o.trail, p.x, p.y, 3, { color: o.color, speed: [10, 70], life: [250, 550] }); });
  return wait(dur);
}
function frostFx(t) {
  const c = C(t);
  V.fx('ice_burst', { x: c.x, y: c.y, w: 260, dur: 520, s0: 0.6, s1: 1.1 });
  V.emitP('shard', c.x, c.y, 10, { color: 'ice', speed: [80, 300] });
  V.floatText('FROST SEAL', c.x, c.y - 70, 'info');
  sfx('ice');
}
async function cut(x) { await ui.cutin(x.u, x.t, x.emp); }
function burstAt(key, u, o = {}) { const c = C(u, o.fy ?? 0.5); return V.fx(key, { x: c.x, y: c.y, w: o.w ?? 300, dur: o.dur ?? 520, s0: o.s0 ?? 0.7, s1: o.s1 ?? 1.15, bloom: 0.3, ...o.extra }); }

const SKILLS = {
  // ===================== Ling Shuang — Water (ice), Sword =====================
  async ling_s1(x) {
    const { u, target: t } = x;
    sfx('dash');
    const back = await board.lunge(u, t, 0.36, 170);
    const c = C(t);
    sfx('slash');
    V.fx('ice_crescent', { x: c.x, y: c.y, w: 330, dur: 420, rot: -0.4, sweep: { a0: -Math.PI, a1: Math.PI, t: 0.3, color: 'ice' }, bloom: 0.4, s0: 0.9, s1: 1.12, fadeIn: 0.01 });
    V.emitP('shard', c.x, c.y, 12, { color: 'ice', speed: [200, 600], up: 100 });
    const h = x.hit(t, 1.0, { color: 'ice', flash: '#d6f0ff' });
    if (h && t.alive && x.chance(x.petal(1) ? 0.5 : 0.3) && x.status(t, 'frost', 1)) frostFx(t);
    await back();
  },
  async ling_s2(x) {
    const { u } = x;
    const fs = x.foes(), cu = C(u, 0.35);
    sfx('charge');
    V.fx('ice_sigil', { x: cu.x, y: cu.y, w: 300, dur: 900, back: true, spin: 1.4, s0: 0.4, s1: 1 });
    V.emitP('snow', cu.x, cu.y, 20, { color: 'ice', speed: [40, 200], spread: 60, life: [600, 1100] });
    await wait(300);
    sfx('ice');
    for (const f of fs) {
      const c = C(f);
      for (let k = 0; k < 4; k++) {
        const sx = c.x + rand(-90, 90), ex = c.x + rand(-55, 55), ey = c.y + rand(-60, 50), d = k * 60;
        V.fx('ice_sword', { w: 64, dur: 270, delay: d, ay: 0.95, rot: Math.atan2(ey + 80, ex - sx) - Math.PI / 2, fadeIn: 0.05, fadeOut: 0.05, bloom: 0.45, path: kk => ({ x: lerp(sx, ex, ease.inQuad(kk)), y: lerp(-80, ey, ease.inQuad(kk)) }) });
      }
    }
    await wait(300);
    sfx('shatter'); V.shake(7, 260);
    for (const f of fs) { burstAt('ice_burst', f, { w: 280 }); x.hit(f, 0.75, { color: 'ice', small: true }); if (f.alive) x.delay(f, 1); }
    if (x.emp) { const tg = fs.filter(f => f.alive).sort((a, b) => b.hp - a.hp)[0]; if (tg && x.status(tg, 'frost', 1)) frostFx(tg); }
    if (x.petal(2)) { const lo = fs.filter(f => f.alive && !x.hasStatus(f, 'frost')).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]; if (lo && x.status(lo, 'frost', 1)) frostFx(lo); }
    await wait(420);
  },
  async ling_s3(x) {
    const { u, target: t } = x;
    await cut(x);
    const c = C(t);
    V.fx('ice_sigil', { x: c.x, y: c.y, w: 380, dur: 1700, back: true, spin: -0.8, s0: 0.3, s1: 1.05 });
    const finisher = () => (x.hasStatus(t, 'frost') || t.hp / t.maxHp < 0.5) ? 1.5 : 1;
    const n = 10, R = 520;
    sfx('charge');
    for (let i = 0; i < n; i++) {
      const ang = -1.1 + 2.2 * i / (n - 1), sx = c.x + Math.sin(ang) * R, sy = c.y - Math.cos(ang) * R;
      V.fx('ice_sword', { w: 80, dur: 300, delay: i * 40, ay: 0.92, rot: -ang, fadeOut: 0.1, bloom: 0.5, path: k => ({ x: lerp(sx, c.x, ease.inCubic(k)), y: lerp(sy, c.y, ease.inCubic(k)) }) });
    }
    const strikes = x.petal(6) ? 6 : 4;
    for (let k = 0; k < strikes; k++) {
      await wait(k ? 95 : 300);
      sfx('slash');
      V.fx('ice_crescent', { x: c.x + rand(-20, 20), y: c.y + rand(-30, 30), w: 340, dur: 420, rot: [0.3, -0.9, 1.4, -0.2][k % 4], flip: k % 2 === 1, sweep: { a0: -Math.PI, a1: Math.PI, t: 0.28, color: 'ice' }, bloom: 0.4 });
      x.hit(t, 0.7 * finisher(), { color: 'ice', small: k < strikes - 1, keepFrost: true });
      if (!t.alive) break;
    }
    if (x.emp) for (const f of x.foes().filter(f => f !== t)) {
      const fc = C(f);
      for (let i = 0; i < 4; i++) V.fx('ice_sword', { w: 60, dur: 240, delay: i * 40, ay: 0.95, rot: 0, path: k => ({ x: fc.x + (i - 1.5) * 26, y: lerp(-80, fc.y, ease.inQuad(k)) }) });
      wait(260).then(() => x.hit(f, 0.6, { color: 'ice', small: true }));
    }
    await wait(120);
    sfx('shatter'); sfx('boom'); hitStop(130); slowMo(0.35, 520); V.flash('#d8f2ff', 0.45, 0.0035); V.shake(14, 420);
    V.fx('ice_burst', { x: c.x, y: c.y, w: 560, dur: 900, s0: 0.4, s1: 1.25, bloom: 0.3 });
    V.ring({ x: c.x, y: c.y, r1: 420, color: 'ice', dur: 700, width: 20 });
    if (t.alive && x.status(t, 'frost', 1)) frostFx(t);
    await wait(500);
  },

  // ===================== Mo Yingyue — Wood (thunder), Shadow =====================
  async mo_s1(x) {
    const { u, target: t } = x;
    sfx('dash');
    const back = await board.lunge(u, t, 0.42, 130);
    const c = C(t);
    for (let i = 0; i < 2; i++) {
      sfx('slash'); sfx('zap');
      V.fx('thunder_x', { x: c.x, y: c.y, w: 300, dur: 420, s0: 0.6, s1: 1.15, rot: i ? 0.45 : -0.25, flip: !!i, bloom: 0.4, ease: ease.outExpo });
      V.bolt({ x0: c.x - 120 + i * 240, y0: c.y - 90, x1: c.x + 120 - i * 240, y1: c.y + 90, color: 'violet', width: 3, dur: 180, branches: 1 });
      x.hit(t, 0.55, { color: 'violet', small: i === 0, flash: '#e6d0ff' });
      if (!t.alive) break;
      await wait(130);
    }
    if (x.petal(1) && t.alive) {
      sfx('slash'); sfx('zap');
      V.fx('thunder_x', { x: c.x, y: c.y, w: 340, dur: 420, s0: 0.6, s1: 1.2, rot: 1.2, bloom: 0.45, ease: ease.outExpo });
      V.bolt({ x0: c.x, y0: c.y - 120, x1: c.x, y1: c.y + 100, color: 'violet', width: 4, dur: 200, branches: 2 });
      x.hit(t, 0.4, { color: 'violet', flash: '#e6d0ff' });
      await wait(120);
    }
    await back();
  },
  async mo_s2(x) {
    const { u, target: t } = x;
    const a = C(u), c = C(t);
    sfx('zap');
    // blink: vanish into lightning, strike through, reappear
    board.tweenCard(u, { o: 0.15, s: 0.92 }, 90);
    V.bolt({ x0: a.x, y0: a.y, x1: c.x, y1: c.y, color: 'violet', width: 6, dur: 300, branches: 3 });
    V.emitP('spark', a.x, a.y, 16, { color: 'violet', speed: [200, 500] });
    await wait(130);
    sfx('slash'); sfx('thunder');
    V.fx('thunder_burst', { x: c.x, y: c.y, w: 360, dur: 480, s0: 0.6, s1: 1.2, bloom: 0.4 });
    V.fx('thunder_x', { x: c.x, y: c.y, w: 320, dur: 420, s0: 0.7, s1: 1.2, rot: 0.2, bloom: 0.4 });
    x.hit(t, 1.5, { color: 'violet', flash: '#e6d0ff' });
    if (x.petal(2) && t.alive && x.status(t, 'mark', 1)) V.floatText('KARMIC MARK', c.x, c.y - 70, 'info');
    V.shake(8, 240);
    await wait(160);
    await board.tweenCard(u, { o: 1, s: 1.07 }, 140);
    const s1 = u.techs[0]; s1.cur = 0; board.refreshCard(u);
    V.floatText('THUNDERFANG READY', a.x, a.y - 120, 'info');
    if (x.emp) for (const al of x.allies()) { for (const tt of al.techs) if (tt.cur > 0 && tt.cd > 1 && tt !== x.t) tt.cur -= 1; board.refreshCard(al); const ac = C(al, 0.8); V.emitP('spark', ac.x, ac.y, 8, { color: 'violet', speed: [60, 200] }); }
    await wait(200);
  },
  async mo_s3(x) {
    const { u } = x;
    let t = x.target;
    await cut(x);
    let c = C(t);
    sfx('charge');
    V.fx('glow:violet', { x: c.x, y: c.y, w: 380, dur: 600, s0: 0.3, s1: 1.2, alpha: 0.6 });
    await wait(260);
    for (let i = 0; i < 3; i++) {
      sfx('thunder'); sfx('zap');
      V.bolt({ x0: c.x + rand(-80, 80), y0: -40, x1: c.x + rand(-20, 20), y1: c.y, color: 'violet', width: 7, dur: 320, branches: 3 });
      V.fx('thunder_bolt', { x: c.x, y: c.y + 120, w: 360, ay: 1, dur: 520, s0: 0.9, s1: 1.05, bloom: 0.3 });
      const missing = 1 + (1 - t.hp / t.maxHp);
      const h = x.hit(t, 0.95 * missing, { color: 'violet', small: i < 2, flash: '#efe0ff' });
      V.flash('#c9a8ff', 0.18);
      if (h && h.killed && x.petal(4)) { x.gainQi(5); V.floatText('+5 SPIRIT QI', c.x, c.y - 110, 'harmony', { size: 26, label: 'EXECUTION' }); }
      if (!t.alive) {
        const next = x.petal(6) && i < 2 ? x.foes().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] : null;
        if (!next) break;
        t = next; c = C(t); V.floatText('THE THUNDER LEAPS', c.x, c.y - 90, 'info');
      }
      await wait(170);
    }
    sfx('boom'); hitStop(120); slowMo(0.35, 480); V.shake(14, 420);
    V.fx('thunder_burst', { x: c.x, y: c.y, w: 560, dur: 800, s0: 0.5, s1: 1.25, bloom: 0.4 });
    V.ring({ x: c.x, y: c.y, r1: 420, color: 'violet', dur: 700, width: 18 });
    if (t.alive && x.status(t, 'shock', 1)) V.floatText('SOUL SHOCK', c.x, c.y - 70, 'info');
    if (x.emp) { u.techs[1].cur = 0; board.refreshCard(u); }
    await wait(450);
  },

  // ===================== Yan Feihong — Fire, Arcane =====================
  async yan_s1(x) {
    const { u, target: t } = x;
    const a = C(u, 0.35), c = C(t);
    sfx('fire');
    V.fx('fire_sigil', { x: a.x, y: a.y, w: 180, dur: 500, back: true, s0: 0.4, s1: 1 });
    await projectile('fire_crescent', a, c, { w: 230, dur: 330, spin: 10, arc: 50, trail: 'ember', color: 'fire' });
    V.fx('fire_burst', { x: c.x, y: c.y, w: 300, dur: 520, s0: 0.6, s1: 1.15, bloom: 0.3 });
    V.emitP('ember', c.x, c.y, 16, { color: 'fire', speed: [80, 300] });
    const h = x.hit(t, 1.0, { color: 'fire', flash: '#ffd2b0' });
    if (h && t.alive && x.chance(x.petal(1) ? 0.7 : 0.4) && x.burn(t, 2)) V.floatText('FIRE POISON', c.x, c.y - 70, 'info');
    await wait(260);
  },
  async yan_s2(x) {
    const fs = x.foes();
    sfx('charge');
    for (const f of fs) { const c = C(f); V.fx('fire_sigil', { x: c.x, y: c.y + 60, w: 280, dur: 1100, back: true, spin: 1, s0: 0.3, s1: 1.05 }); }
    await wait(420);
    sfx('fire'); sfx('boom'); V.shake(9, 300);
    for (const f of fs) {
      const c = C(f);
      V.fx('fire_burst', { x: c.x, y: c.y, w: 320, dur: 600, s0: 0.5, s1: 1.2, bloom: 0.3 });
      V.emitP('ember', c.x, c.y + 40, 18, { color: 'fire', speed: [60, 260], spread: 50 });
      x.hit(f, 0.7, { color: 'fire', small: true });
      if (f.alive) x.burn(f, (x.petal(2) ? 3 : 2) + (x.emp ? 1 : 0));
    }
    await wait(500);
  },
  async yan_s3(x) {
    const { u } = x;
    await cut(x);
    const fs = x.foes().sort((a, b) => C(a).x - C(b).x);
    const g = board.geo, y = g.enemyY + 150;
    const x0 = g.x0 - 420, x1 = g.W + 420, dur = 1150;
    sfx('fire'); sfx('ult');
    const path = k => ({ x: lerp(x0, x1, ease.inOutCubic(k)), y: y - Math.sin(k * Math.PI) * 40 });
    V.fx('phoenix', { w: 760, dur, path, fadeIn: 0.06, fadeOut: 0.1, bloom: 0.3 });
    for (let i = 0; i < 22; i++) wait(i * dur / 22).then(() => { const p = path(i / 22); V.emitP('ember', p.x - 160, p.y + rand(-80, 80), 6, { color: 'fire', speed: [30, 160], life: [500, 1100] }); });
    const hits = fs.map(f => {
      const cx = C(f).x; let k = 0;
      for (let s = 0; s <= 1; s += 0.01) if (path(s).x >= cx) { k = s; break; }
      return [k * dur, f];
    });
    const start = performance.now();
    let el = 0;
    for (const [tm, f] of hits) {
      await wait(Math.max(0, tm - el)); el = tm;
      if (!f.alive) continue;
      const c = C(f);
      V.fx('fire_burst', { x: c.x, y: c.y, w: 380, dur: 650, s0: 0.5, s1: 1.25, bloom: 0.35 });
      V.emitP('ember', c.x, c.y, 22, { color: 'fire', speed: [80, 360] });
      const burning = x.hasStatus(f, 'burn');
      x.hit(f, 1.7 * (burning ? 1.3 : 1), { color: 'fire' });
      if (x.emp && burning && f.alive) {
        const s = f.status.find(st => st.id === 'burn');
        if (s) { const extra = s.value * s.turns; f.hp = Math.max(0, f.hp - extra); V.floatText(extra.toLocaleString('en-US'), c.x + 40, c.y + 50, 'dmg', { label: 'DETONATE' }); board.refreshCard(f); }
      }
    }
    void start;
    sfx('boom'); hitStop(110); V.shake(12, 380); V.flash('#ffc89a', 0.3);
    if (x.petal(6) && u.alive) { x.B.phoenix = { u, left: 2 }; const cu = C(u, 0.3); V.floatText('THE PHOENIX CIRCLES', cu.x, cu.y, 'harmony', { size: 26 }); }
    await wait(600);
  },

  // ===================== Su Lianhua — Earth (jade), Healer =====================
  async su_s1(x) {
    const { u, target: t } = x;
    const a = C(u, 0.4), c = C(t);
    sfx('whoosh');
    for (let k = 0; k < 3; k++) {
      wait(k * 90).then(() => projectile('lotus_petal', a, { x: c.x + rand(-30, 30), y: c.y + rand(-30, 30) }, { w: 150, dur: 330, arc: (k - 1) * 90, ax: 0.8, trail: 'petal', color: 'pink' })).then(() => {
        if (!t.alive) return;
        V.emitP('petal', c.x, c.y, 6, { color: 'pink', speed: [80, 260] });
        x.hit(t, 0.3, { color: 'jade', small: true });
      });
    }
    await wait(560);
    const als = x.allies().filter(v => v.alive).sort((p, q) => p.hp / p.maxHp - q.hp / q.maxHp).slice(0, x.petal(1) ? 2 : 1);
    for (const [i, al] of als.entries()) { const ac = C(al); V.orb({ x0: a.x, y0: a.y, x1: ac.x, y1: ac.y, color: 'jade', dur: 420, arc: i ? 60 : -60, size: 16 }); }
    if (als.length) await wait(420);
    for (const al of als) {
      const ac = C(al);
      V.fx('heal_burst', { x: ac.x, y: ac.y, w: 240, dur: 600, s0: 0.6, s1: 1.1 });
      V.emitP('petal', ac.x, ac.y, 8, { color: 'jade', speed: [30, 140], up: 60 });
      sfx('heal'); x.heal(al, 0.7);
    }
    await wait(200);
  },
  async su_s2(x) {
    const { u } = x;
    const a = C(u, 0.4);
    sfx('heal');
    V.fx('lotus_bloom', { x: a.x, y: a.y, w: 420, dur: 1400, s0: 0.2, s1: 1, fadeIn: 0.12, alpha: 0.75, ease: ease.outBack });
    await wait(350);
    for (const al of x.allies()) {
      const c = C(al);
      V.fx('heal_burst', { x: c.x, y: c.y, w: 280, dur: 700, s0: 0.5, s1: 1.15 });
      V.emitP('petal', c.x, c.y + 60, 10, { color: 'jade', speed: [40, 160], up: 80, spread: 50 });
      x.heal(al, 0.95);
      if (x.cleanse(al, x.petal(2) ? 2 : 1)) V.floatText('CLEANSED', c.x, c.y - 70, 'info');
      if (x.emp) x.status(al, 'clear', 1);
    }
    await wait(550);
  },
  async su_s3(x) {
    const { u } = x;
    await cut(x);
    const a = C(u, 0.35);
    V.rays({ x: a.x, y: a.y, color: 'gold', len: 520, dur: 1600, alpha: 0.5 });
    V.fx('lotus_bloom', { x: board.geo.W / 2, y: board.geo.heroY + 150, w: 900, dur: 2200, s0: 0.2, s1: 1, fadeIn: 0.12, alpha: 0.55, back: true, ease: ease.outBack });
    sfx('heal');
    await wait(300);
    if (x.emp || (x.petal(6) && !u.lotusRevived)) {
      const dead = x.B.units.find(v => v.side === u.side && !v.alive);
      if (dead) { x.revive(dead, 0.3); if (!x.emp) u.lotusRevived = true; }
    }
    for (const al of x.allies()) {
      const c = C(al);
      V.fx('jade_pillar', { x: c.x, y: c.y + 150, w: 230, ay: 1, dur: 1200, s0: 0.8, s1: 1.05, fadeIn: 0.12, bloom: 0.25 });
      V.emitP('petal', c.x, c.y, 10, { color: 'gold', speed: [30, 150], up: 60, spread: 60 });
      x.shield(al, 1.3);
      x.status(al, 'dew', x.petal(4) ? 3 : 2);
      await wait(90);
    }
    await wait(650);
  },

  // ===================== Enemies =====================
  async claw(x) {
    const { u, target: t } = x;
    sfx('whoosh');
    const back = await board.lunge(u, t, 0.34, 170);
    const c = C(t);
    sfx('slash');
    V.fx('ghost_slash', { x: c.x, y: c.y, w: 340, dur: 520, s0: 0.85, s1: 1.1, flip: true, sweep: { a0: -Math.PI, a1: Math.PI, t: 0.3, color: 'violet' }, bloom: 0.3, fadeIn: 0.01 });
    x.hit(t, u.boss ? 1.1 : 1.0, { color: 'violet', flash: '#e0c8ff' });
    await back();
  },
  async lash(x) {
    const { u, target: t } = x;
    const a = C(u, 0.55), c = C(t);
    sfx('ghost');
    V.bolt({ x0: a.x, y0: a.y, x1: c.x, y1: c.y, color: 'violet', width: 5, dur: 260, branches: 1, jitter: 0.12 });
    await wait(160);
    V.fx('ghost_flame', { x: c.x, y: c.y + 110, w: 250, ay: 1, dur: 900, s0: 0.5, s1: 1.1, bloom: 0.3 });
    const h = x.hit(t, 1.1, { color: 'violet' });
    if (h && t.alive && Math.random() < 0.5 && x.burn(t, 2)) V.floatText('NETHERBURN', c.x, c.y - 70, 'info');
    await wait(300);
  },
  async cinder(x) {
    sfx('ghost'); V.flash('#ff9a5a', 0.15);
    const hs = x.foes();
    for (const h of hs) { const c = C(h); V.fx('ghost_flame', { x: c.x, y: c.y + 120, w: 240, ay: 1, dur: 900, s0: 0.5, s1: 1.1, bloom: 0.3 }); }
    await wait(300);
    for (const h of hs) { const c = C(h); V.emitP('ember', c.x, c.y, 10, { color: 'fire', speed: [60, 220] }); x.hit(h, 0.55, { color: 'fire', small: true }); if (h.alive && Math.random() < 0.5) x.burn(h, 2); }
    V.shake(6, 240);
    await wait(420);
  },
  async bind(x) {
    const { target: t } = x; const c = C(t);
    sfx('ghost');
    V.fx('curse_sigil', { x: c.x, y: c.y + 40, w: 300, dur: 1100, back: true, spin: -1, s0: 0.3, s1: 1 });
    await wait(380);
    V.emitP('smoke', c.x, c.y + 60, 8, { speed: [20, 90], spread: 50 });
    x.hit(t, 1.3, { color: 'gold' });
    if (t.alive) { x.delay(t, 1); V.floatText('TECHNIQUES DELAYED', c.x, c.y - 70, 'info'); }
    await wait(380);
  },
  async spear(x) {
    const { u, target: t } = x; const a = C(u, 0.55), c = C(t);
    sfx('whoosh');
    await projectile('ghost_skull', a, c, { w: 230, dur: 420, arc: 30, ax: 0.3, trail: 'wisp', color: 'white' });
    V.fx('ghost_burst', { x: c.x, y: c.y, w: 300, dur: 520, s0: 0.6, s1: 1.15 });
    x.hit(t, 1.7, { color: 'white', critBonus: 0.5 });
    await wait(300);
  },
  async tide(x) {
    sfx('rumble');
    const hs = x.foes(), g = board.geo;
    V.fx('ghost_burst', { x: g.W / 2, y: g.heroY + 140, w: 900, dur: 900, s0: 0.4, s1: 1.2, alpha: 0.7 });
    await wait(320);
    for (const h of hs) { const c = C(h); V.emitP('wisp', c.x, c.y, 8, { color: 'ice', speed: [30, 120], spread: 60 }); x.hit(h, 0.5, { color: 'ice', small: true }); if (h.alive) x.status(h, 'disrupt', 1); }
    V.shake(7, 260);
    await wait(420);
  },
  async thorns(x) {
    const { u, target: t } = x; const c = C(t);
    const back = await board.lunge(u, t, 0.3, 170);
    for (let i = 0; i < 2; i++) {
      sfx('slash');
      V.fx('ghost_slash', { x: c.x, y: c.y, w: 300, dur: 460, rot: i ? 0.6 : -0.3, flip: !!i, bloom: 0.3 });
      x.hit(t, 0.6, { color: 'green', small: i === 0 });
      if (!t.alive) break;
      await wait(140);
    }
    if (t.alive && x.status(t, 'venom', 2)) V.floatText('GU VENOM', c.x, c.y - 70, 'info');
    await back();
  },
  async curse(x) {
    sfx('ghost');
    const hs = x.foes();
    for (const h of hs) { const c = C(h); V.fx('curse_sigil', { x: c.x, y: c.y + 30, w: 320, dur: 1400, back: true, spin: -1, s0: 0.2, s1: 1 }); }
    await wait(420);
    const bc = C(x.u, 0.5);
    for (const h of hs) { const c = C(h); projectile('ghost_skull', bc, c, { w: 200, dur: 380, arc: 60, ax: 0.3, trail: 'wisp', color: 'violet' }); }
    await wait(380);
    for (const h of hs) { x.hit(h, 0.6, { color: 'violet', small: true }); if (h.alive) x.status(h, 'wither', 1); }
    V.shake(7, 260);
    await wait(420);
  },
  async cataclysm(x) {
    await ui.cutin(x.u, x.t, false, true);
    const hs = x.foes(), g = board.geo;
    V.flash('#6a3cff', 0.35); sfx('rumble'); sfx('ghost');
    V.fx('ghost_burst', { x: g.W / 2, y: g.heroY + 150, w: 1100, dur: 1300, s0: 0.3, s1: 1.25, alpha: 0.85 });
    for (const h of hs) { const c = C(h); V.fx('ghost_flame', { x: c.x, y: c.y + 140, w: 300, ay: 1, dur: 1300, s0: 0.4, s1: 1.15, bloom: 0.35 }); V.fx('curse_sigil', { x: c.x, y: c.y + 40, w: 300, dur: 1300, back: true, spin: 1.2 }); }
    await wait(500);
    sfx('boom'); hitStop(110); V.shake(16, 520);
    for (const h of hs) { const c = C(h); V.emitP('wisp', c.x, c.y, 10, { color: 'violet', speed: [40, 200], spread: 60 }); V.emitP('ember', c.x, c.y, 10, { color: 'violet', speed: [60, 260] }); x.hit(h, 1.7, { color: 'violet' }); if (h.alive) x.burn(h, 2); }
    await wait(650);
  },
};

// ---------------- data-driven techniques ----------------
// Founders and the prototype's wraiths keep their hand-made choreography (SKILLS above, matched through CHOREO).
// Every other technique runs SKILLS.generic: it reads the technique's effects from the game data and plays
// shared effects for the caster's phase, the way the spec plans it ("effects come from her phase's shared set").

const CHOREO = {
  'skill:ling_shuang_s1': 'ling_s1', 'skill:ling_shuang_s2': 'ling_s2', 'skill:ling_shuang_s3': 'ling_s3',
  'skill:mo_yingyue_s1': 'mo_s1', 'skill:mo_yingyue_s2': 'mo_s2', 'skill:mo_yingyue_s3': 'mo_s3',
  'skill:yan_feihong_s1': 'yan_s1', 'skill:yan_feihong_s2': 'yan_s2', 'skill:yan_feihong_s3': 'yan_s3',
  'skill:su_lianhua_s1': 'su_s1', 'skill:su_lianhua_s2': 'su_s2', 'skill:su_lianhua_s3': 'su_s3',
  'skill:grave_claw': 'claw', 'skill:cinder_wail': 'cinder', 'skill:grave_bind': 'bind', 'skill:bone_spear': 'spear',
  'skill:black_tide': 'tide', 'skill:soul_thorns': 'thorns', 'skill:netherflame_lash': 'lash',
  'skill:withering_curse': 'curse', 'skill:netherflame_cataclysm': 'cataclysm',
};

const PHASE_FX = {
  water: { slash: 'ice_crescent', burst: 'ice_burst', sigil: 'ice_sigil', missile: 'ice_sword', col: 'ice', sfx: 'ice', part: 'shard' },
  wood:  { slash: 'thunder_x', burst: 'thunder_burst', sigil: 'curse_sigil', missile: 'thunder_bolt', col: 'violet', sfx: 'thunder', part: 'spark' },
  fire:  { slash: 'fire_crescent', burst: 'fire_burst', sigil: 'fire_sigil', missile: 'fire_crescent', col: 'fire', sfx: 'boom', part: 'ember' },
  earth: { slash: 'lotus_petal', burst: 'lotus_bloom', sigil: 'jade_pillar', missile: 'lotus_petal', col: 'gold', sfx: 'hit', part: 'petal' },
  metal: { slash: 'ice_crescent', burst: 'thunder_blade', sigil: 'ice_sigil', missile: 'ice_sword', col: 'white', sfx: 'slash', part: 'shard' },
  yin:   { slash: 'ghost_slash', burst: 'ghost_burst', sigil: 'curse_sigil', missile: 'ghost_skull', col: 'violet', sfx: 'ghost', part: 'wisp' },
  yang:  { slash: 'fire_crescent', burst: 'lotus_bloom', sigil: 'fire_sigil', missile: 'lotus_petal', col: 'gold', sfx: 'heal', part: 'glow' },
};
const MELEE = new Set(['path:sword', 'path:guardian', 'path:shadow', 'assassin', 'brute', 'beast', 'minion', 'boss', 'tank']);

/** Pick an effect's targets. */
function effTargets(x, e, techTarget) {
  const { u, target } = x;
  const fs = foes(u), as = allies(u);
  const tg = e.target || ({ enemy: 'enemy', allEnemies: 'all_enemies', allAllies: 'all_allies', self: 'self', ally: 'ally' })[techTarget] || 'enemy';
  switch (tg) {
    case 'enemy': case 'that_enemy': return target && target.side !== u.side ? [target] : fs.slice(0, 1);
    case 'all_enemies': return fs;
    case 'other_enemies': return fs.filter(f => f !== target);
    case 'healthiest_enemy': return fs.sort((a, b) => b.hp - a.hp).slice(0, 1);
    case 'healthiest_other_enemy': return fs.filter(f => f !== target).sort((a, b) => b.hp - a.hp).slice(0, 1);
    case 'self': return [u];
    case 'ally': case 'that_ally': return target && target.side === u.side ? [target] : [u];
    case 'all_allies': case 'allies': return as;
    case 'lowest_ally': case 'healed_ally': return as.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp).slice(0, 1);
    case 'lowest_2_allies': return as.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp).slice(0, 2);
    case 'highest_atk_2_allies': return as.sort((a, b) => b.atk - a.atk).slice(0, 2);
    case 'lowest_enemy': return fs.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp).slice(0, 1);
    case 'lowest_max_hp_ally': return as.sort((a, b) => a.maxHp - b.maxHp).slice(0, 1);
    case 'most_debuffed_ally': return as.sort((a, b) => b.status.filter(s => STATUS[s.id].debuff).length - a.status.filter(s => STATUS[s.id].debuff).length).slice(0, 1);
    case 'highest_atk_ally': return as.sort((a, b) => b.atk - a.atk).slice(0, 1);
    case 'adjacent_allies': return as.filter(a => Math.abs(a.slot - u.slot) === 1);
    case 'enemies_with_heart_demon': return fs.filter(f => has(f, 'demon'));
    default: return techTarget === 'enemy' ? (target ? [target] : fs.slice(0, 1)) : (techTarget === 'allEnemies' ? fs : as);
  }
}

SKILLS.generic = async function generic(x) {
  const { u, t, emp } = x;
  const fx = PHASE_FX[u.phase] || PHASE_FX.yin;
  const melee = MELEE.has(u.path) || MELEE.has(u.profile);
  const effects = [...(t.effects || [])];
  if (emp && t.empEffects) { if (t.empEffects.some(e => e.first)) effects.unshift(...t.empEffects); else effects.push(...t.empEffects); }
  if (t.ult && u.cutin) await ui.cutin(u, t, emp, u.side === 'enemy');
  else if (t.ult && u.side === 'enemy') await ui.cutin(u, t, emp, true);
  const cu = C(u, 0.4);
  const dmgEffects = effects.filter(e => e.do === 'damage');
  const area = t.target === 'allEnemies' || dmgEffects.some(e => e.target === 'all_enemies');
  let back = null;
  // wind-up
  if (dmgEffects.length) {
    if (area) {
      sfx('charge');
      V.fx(fx.sigil, { x: cu.x, y: cu.y, w: 300, dur: 800, back: true, spin: 1.2, s0: 0.4, s1: 1 });
      await wait(320);
    } else if (melee && x.target && x.target.side !== u.side) {
      sfx('dash'); back = await board.lunge(u, x.target, 0.34, 170);
    } else if (x.target && x.target.side !== u.side) {
      sfx('whoosh'); await projectile(fx.missile, cu, C(x.target), { w: 170, dur: 360, arc: 40, ax: 0.5, trail: fx.part === 'petal' ? 'petal' : 'glow', color: fx.col, rot: 0 });
    }
  }
  for (const e of effects) {
    if (!u.alive) break;
    const ts = effTargets(x, e, t.target);
    switch (e.do) {
      case 'damage': {
        const hits = e.hits || 1;
        for (let k = 0; k < hits; k++) {
          for (const f of ts) {
            if (!f.alive) continue;
            const c = C(f);
            let p = e.power || 1;
            if (e.bonusVs && e.bonusVs.some(s => has(f, s))) p *= 1 + (e.bonus || 0.3);
            if (e.missingHealthBonus) p *= 1 + e.missingHealthBonus * (1 - f.hp / f.maxHp);
            if (e.bonusPerDebuff) p *= 1 + Math.min(0.5, e.bonusPerDebuff * f.status.filter(s => STATUS[s.id].debuff).length);
            if (e.rampPerHit) p *= 1 + e.rampPerHit * k;
            V.fx(area ? fx.burst : (melee ? fx.slash : fx.burst), { x: c.x + rand(-14, 14), y: c.y + rand(-14, 14), w: area ? 260 : 320, dur: 460, rot: rand(-0.6, 0.6), flip: k % 2 === 1, s0: 0.75, s1: 1.12, bloom: 0.35, fadeIn: 0.02 });
            V.emitP(fx.part, c.x, c.y, area ? 6 : 10, { color: fx.col, speed: [120, 420] });
            sfx(k ? 'hit' : fx.sfx);
            const h = x.hit(f, p, { color: fx.col, small: hits > 1 || area, pierce: e.pierce, critBonus: e.critBonus });
            if (h) x.dealt = (x.dealt || 0) + h.dmg;
            if (h && e.detonate && f.alive) await x.flare(f, e.detonate === true ? 'burn' : e.detonate);
          }
          if (area) V.shake(6, 220);
          await wait(hits > 1 ? 120 : 200);
        }
        break;
      }
      case 'heal': {
        sfx('heal');
        for (const a of ts) { const c = C(a); V.fx('heal_burst', { x: c.x, y: c.y, w: 240, dur: 650 }); V.emitP('petal', c.x, c.y, 8, { color: 'jade', speed: [30, 140], up: 60 }); x.heal(a, e.power || 0.8, { pctMaxHp: e.pctMaxHp }); }
        await wait(260); break;
      }
      case 'shield': {
        for (const a of ts) { const c = C(a); V.ring({ x: c.x, y: c.y, r0: 40, r1: 190, color: 'gold', width: 10, dur: 560 }); x.shield(a, e.power || 0.8, { pctOfMaxHp: e.pctOfMaxHp, turns: e.turns }); }
        sfx('heal'); await wait(240); break;
      }
      case 'apply': {
        const id = sid(e.status); if (!id) break;
        if (e.when === 'dispelled' && !x.lastDispelled) break;
        const debuff = STATUS[id].debuff;
        for (const a of ts) {
          if (!a.alive) continue;
          if (e.chance && Math.random() >= (e.chance + (t.mods?.chance || 0)) * (has(u, 'mist') && debuff ? 0.5 : 1)) continue;
          const ok = id === 'burn' ? x.burn(a, e.turns || 2) : x.status(a, id, e.turns || 1, { stacks: e.stacks, src: u, value: id === 'wound' ? Math.round(atkOf(u) * 0.12) : undefined });
          if (ok) {
            const c = C(a), k = ts.indexOf(a);
            if (debuff) { V.fx('curse_sigil', { x: c.x, y: c.y + 20, w: 200, dur: 600, back: true, spin: -1, s0: 0.3, s1: 0.9, alpha: 0.7 }); }
            else V.ring({ x: c.x, y: c.y, r0: 30, r1: 150, color: fx.col, width: 6, dur: 480 });
            V.floatText(STATUS[id].name.toUpperCase(), c.x, c.y - 96 + (k % 2) * 18, 'info', { size: 22 });
          }
        }
        await wait(200); break;
      }
      case 'cleanse': {
        for (const a of ts) { const n = x.cleanse(a, e.all ? 99 : (e.count || 1)); if (n) { const c = C(a); V.floatText('CLEANSED', c.x, c.y - 60, 'info'); V.emitP('glow', c.x, c.y, 8, { color: 'white', speed: [30, 120] }); } }
        await wait(160); break;
      }
      case 'dispel': {
        x.lastDispelled = 0;
        for (const a of ts) { if (e.chance && Math.random() >= e.chance) continue; const n = x.dispel(a, e.all ? 99 : (e.count || 1)); x.lastDispelled += n; if (n) { const c = C(a); V.floatText('BUFF REMOVED', c.x, c.y - 60, 'info'); } }
        await wait(160); break;
      }
      case 'lifesteal': { // heal for a share of the damage this technique dealt
        const amt = Math.round((x.dealt || 0) * (e.pct || 0.3));
        if (amt && u.alive) { const n = applyHealAmount(u, u, amt); if (n) { const c = C(u); V.floatText('+' + Math.min(n, u.maxHp).toLocaleString('en-US'), c.x, c.y, 'heal', { label: 'DEVOURED' }); } }
        break;
      }
      case 'transform': { // Hundun scrambles every charging cooldown by a random shift; effect resistance resists it
        if (e.what !== 'cooldowns') break;
        const [lo, hi] = e.range || [-1, 2];
        for (const a of ts) {
          if (!a.alive) continue;
          const res = Math.min(RULES.resistCap ?? 0.85, Math.max(0, (a.res || 0) - (u.acc || 0)));
          const c = C(a);
          if (res > 0 && Math.random() < res) { V.floatText('RESISTED', c.x, c.y - 40, 'info'); continue; }
          for (const tt of a.techs) if (tt.cur > 0) tt.cur = Math.max(0, Math.min(tt.cd, tt.cur + lo + Math.floor(Math.random() * (hi - lo + 1))));
          V.floatText('SCRAMBLED', c.x, c.y - 60, 'info'); V.emitP('wisp', c.x, c.y, 10, { color: 'violet', speed: [40, 160] });
          board.refreshCard(a);
        }
        await wait(240); break;
      }
      case 'delay': for (const a of ts) { if (a.alive) { x.delay(a, e.turns || 1); const c = C(a); V.floatText('DELAYED', c.x, c.y - 60, 'info'); } } break;
      case 'refresh': {
        const who = e.target === 'all_allies' ? allies(u) : (e.target ? ts : [u]);
        for (const a of who) for (const tt of a.techs) {
          const slotOk = !e.slot || tt.slot === e.slot || (e.skill && tt.id === e.skill);
          if (!slotOk || tt === t) continue;
          tt.cur = e.ready ? 0 : Math.max(0, tt.cur - (e.turns || 1));
        }
        who.forEach(a => board.refreshCard(a)); break;
      }
      case 'qi': x.gainQi(e.amount || 1); break;
      case 'cost_health': { const amt = Math.round(u.maxHp * (e.pct || 0.1)); u.hp = Math.max(1, u.hp - amt); board.refreshCard(u); break; }
      case 'revive': for (const a of (e.self ? [u] : B.units.filter(z => z.side === u.side && !z.alive))) { x.revive(a, e.pct || 0.3); break; } break;
      case 'extend': for (const a of ts) { const s = has(a, e.status); if (s) s.turns += e.turns || 1; } break;
      default: break; // passive-only verbs (stat, harmony, summon...) are read by later builds
    }
  }
  if (back) await back();
  await wait(220);
};

// ===== battle =====
// Battle rules and flow: team turns, cooldown rings, Haste, Five Phases, Phase Qi, Harmony chains and Kindred Qi,
// Spirit Qi, empowering, statuses, boss Qi shield, waves, Fortuitous Encounters, Heavenly Tribulation, Twin Blooms,
// enemy AI and auto battle. startBattle(def) plays one battle and resolves with its result.

const B = {
  units: [], round: 1, side: 'hero', phase: 'idle', busy: false, over: false, result: null, wave: 0,
  qi: 4, gather: 0, points: {}, chain: { len: 0, last: null, list: [] }, kin: { phase: null, uid: null, n: 0 }, maxChain: 0,
  sel: null, emp: false, pendingEnc: null, encounter: null, auto: false, gate: null, tutorial: false, endTurnResolve: null,
  def: null, combos: new Set(), log: { casts: 0 }, resolve: null, counters: [], comboQi: 0,
};
const listeners = {};
const on = (evt, fn) => { (listeners[evt] || (listeners[evt] = [])).push(fn); return () => { listeners[evt] = listeners[evt].filter(f => f !== fn); }; };
const off = (evt) => { delete listeners[evt]; };
const emit = (evt, data) => (listeners[evt] || []).slice().forEach(f => { try { f(data); } catch (e) { console.error(e); } });

let uidN = 0;
const freshPoints = () => Object.fromEntries([...CYCLE, 'yin', 'yang'].map(p => [p, 0]));

function makeUnit(d, side, slot) {
  return {
    uid: 'u' + (++uidN), key: d.key, id: d.id, side, slot, name: d.name, cn: d.cn, title: d.title, phase: d.phase, path: d.path,
    pathName: d.pathName, family: d.family, profile: d.profile, art: d.art, lvl: d.lvl, cutin: d.cutin, face: d.face, rarity: d.rarity,
    maxHp: d.hp, hp: d.hp, atk: d.atk, defense: d.def, crit: d.crit, critDmg: d.critDmg, haste: d.haste || 0, hasteMeter: 0,
    techs: d.techs.map(t => ({ ...t, cur: t.start ?? 0 })), status: [], barrier: 0, alive: true,
    wide: !!d.wide, boss: !!d.boss, qiShield: d.qiShield ? { max: d.qiShield, cur: d.qiShield } : null,
    attached: [null, null], stats: { dmg: 0, heal: 0, taken: 0 }, d,
    // gear: accuracy, effect resistance, healing, 4-piece sets and the Spirit Artefact (power = share of its Divine +15 values)
    acc: d.acc || 0, res: d.res || 0, healRecv: d.healRecv || 0, healing: d.healing || 0,
    sets4: new Set(d.sets4 || []), artefact: d.artefact || null, gearPhaseQi: d.gearPhaseQi || 0, targeted: d.targeted || 1,
    passives: d.passives || [],
    // growth: open Dao Blossom petals (the founders' choreography reads them) and counterattack mastery
    petals: d.petals || 0, counterMod: Math.max(0, ...(d.techs || []).map(t => t.mods?.counter || 0)),
  };
}
/** Has this heroine opened petal n of her Dao Blossom? */
const petal = (u, n) => (u.petals || 0) >= n;
// Passives that are a plain stat with no condition (Ning Suxin's +15% accuracy) apply when the unit is made.
const STAT_FIELD = { 'stat:acc': 'acc', 'stat:res': 'res', 'stat:crit': 'crit', 'stat:crit_dmg': 'critDmg', 'stat:haste': 'haste', 'stat:healing': 'healing', 'stat:heal_received': 'healRecv' };
function applyStaticPassives(u) {
  for (const p of u.passives) if (p.trigger === 'always') for (const e of p.effects || []) if (e.do === 'stat' && e.stat && !e.when && STAT_FIELD[e.stat]) u[STAT_FIELD[e.stat]] += e.value;
}
const getUnit = uid => B.units.find(u => u.uid === uid);
const heroes = () => B.units.filter(u => u.side === 'hero');
const enemies = () => B.units.filter(u => u.side === 'enemy');
const foes = u => B.units.filter(x => x.side !== u.side && x.alive);
const allies = u => B.units.filter(x => x.side === u.side && x.alive);
const has = (u, id) => u.status.find(s => s.id === sid(id));
function advantage(a, d) {
  if (OVER[a] === d) return 1;
  if (OVER[d] === a) return -1;
  return 0;
}
const combo = id => B.combos.has(id);
// Effective stats with buffs and debuffs.
const atkOf = u => u.atk * (has(u, 'surge') ? 1.5 : 1);
const defOf = u => u.defense * (has(u, 'iron') ? 1.6 : 1) * (has(u, 'bshatter') ? 0.3 : 1) * (u.hp / u.maxHp < 0.5 ? hasWhen(u, 'below_half_health').reduce((m, e) => m * (1 + (e.stat === 'stat:def' ? e.value : 0)), 1) : 1);
const critOf = u => u.crit + (has(u, 'intent') ? 0.3 : 0) + (u.attached && u.attached.some(a => a && a.id === 'sword_insight') ? 0.25 : 0);
const hasteOf = u => (u.haste || 0) + (has(u, 'wind') ? 30 : 0);
// Gear: a 4-piece set effect she wears, and her Spirit Artefact's power if it is the one named.
const set4 = (u, id) => !!(u.sets4 && u.sets4.has(id));
const artPow = (u, id) => (u.artefact && u.artefact.id === id ? u.artefact.power : 0);
const SKIPS_TURN = new Set(['frost', 'shock', 'dream']);
function gearCallout(u, text) { const c = board.center(u, 0.16); V.floatText(text, c.x, c.y, 'info', { size: 20 }); B.log.gear[text] = (B.log.gear[text] || 0) + 1; }
// ======================= passives (levels 30 and 50) =======================
/** A heroine's passive effects for a trigger, each with its passive's id and name. */
const pFx = (u, trig, verb) => (u.passives || []).filter(p => p.trigger === trig).flatMap(p => (p.effects || []).filter(e => !verb || e.do === verb).map(e => ({ ...e, pid: p.id, pname: p.name })));
const hasWhen = (u, when, verb = 'stat') => pFx(u, 'always', verb).filter(e => e.when === when);
/** "once per turn" and "once per battle" bookkeeping. */
function useOnce(u, e) {
  if (!e.once) return true;
  const k = `${u.uid}:${e.pid}:${e.do}:${e.once === 'turn' ? `${B.round}${B.side}` : 'battle'}`;
  if (B.onceUsed.has(k)) return false;
  B.onceUsed.add(k); return true;
}
function passiveCallout(u, name) { const c = board.center(u, 0.1); V.floatText(String(name).toUpperCase(), c.x, c.y, 'harmony', { size: 22, label: 'PASSIVE' }); B.log.passives[name] = (B.log.passives[name] || 0) + 1; }
/** The cards beside one on its side of the board. */
function beside(t) {
  const row = B.units.filter(x => x.side === t.side && x.alive).sort((a, b) => (a.slotX ?? a.slot) - (b.slotX ?? b.slot));
  const i = row.indexOf(t);
  return i < 0 ? [] : [row[i - 1], row[i + 1]].filter(Boolean);
}

// ======================= setup =======================
/**
 * def = { heroes: [unit defs], waves: [{ title, sub, boss, enemies: [unit defs] }], tutorial, combos: [combo ids],
 *         side: 'Netherflame Sect', stageName }
 * Resolves with { win, rounds, log, heroes: [{ id, alive, dmg, heal }] }.
 */
async function startBattle(def) {
  autoRunning = false; ending = false;
  for (const u of B.units) u.el && u.el.remove();
  Object.assign(B, {
    units: [], round: 1, side: 'hero', phase: 'idle', busy: false, over: false, result: null, wave: 0,
    qi: RULES.qiStart, gather: 0, points: { hero: freshPoints(), enemy: freshPoints() },
    chain: { len: 0, last: null, list: [] }, kin: { phase: null, uid: null, n: 0 }, maxChain: 0, sel: null, emp: false,
    pendingEnc: null, encounter: null, tutorial: !!def.tutorial, def, combos: new Set(def.combos || []), counters: [], comboQi: 0,
    log: { casts: 0, falls: 0, empowers: 0, shatters: 0, encounters: 0, maxKills: 0, kindred: 0, harmony: 0, combos: {}, gear: {}, passives: {} },
  });
  def.heroes.forEach((d, i) => B.units.push(makeUnit(d, 'hero', i)));
  B.gourdDone = false; B.onceUsed = new Set(); B.phoenix = null;
  for (const u of heroes()) applyStaticPassives(u);
  B.pendingStart = heroes().flatMap(u => pFx(u, 'battle_start', 'apply').map(e => ({ u, e })));
  for (const u of heroes()) {
    if (u.gearPhaseQi) B.points.hero[u.phase] += u.gearPhaseQi;                       // Five Elements, 2 pieces
    const pearl = artPow(u, 'art:dinghai_pearl'); if (pearl) B.points.hero[GEN[u.phase]] += Math.max(1, Math.round(2 * pearl));
    const pouch = artPow(u, 'art:qiankun_pouch'); if (pouch) B.qi = Math.min(RULES.qiMax, B.qi + Math.max(1, Math.round(6 * pouch)));
    if (artPow(u, 'art:wind_fire_wheels')) for (const t of u.techs) t.cur = Math.max(0, t.cur - 1);
  }
  for (const u of heroes()) board.createCard(u, ui.boardEl);
  ui.resetBattle(def);
  const done = new Promise(res => { B.resolve = res; });
  for (const [i, u] of heroes().entries()) board.dealIn(u, i * 90, false);
  await wait(500);
  await spawnWave(0);
  emit('ready');
  loop();
  return done;
}

async function spawnWave(i) {
  B.wave = i;
  const w = B.def.waves[i];
  for (const u of enemies()) u.el && u.el.remove();
  B.units = B.units.filter(u => u.side === 'hero');
  // lay the wave out centred on the four slots (a boss card is two slots wide)
  const widths = w.enemies.map(d => d.wide ? 2 : 1), total = widths.reduce((a, b) => a + b, 0);
  let x = (4 - total) / 2;
  w.enemies.forEach((d, j) => { const u = makeUnit(d, 'enemy', j); u.slotX = x; x += widths[j]; B.units.push(u); });
  ui.waveInfo(i, B.def.waves.length);
  await ui.banner(w.title, w.sub, w.boss ? 'boss' : '');
  const es = enemies();
  es.forEach(u => board.createCard(u, ui.boardEl));
  sfx('whoosh');
  await Promise.all(es.map((u, j) => board.dealIn(u, j * 120, true)));
  const b = es.find(u => u.boss);
  if (b) {
    const c = board.center(b);
    V.shake(14, 420); V.flash('#ff9a6a', 0.3); sfx('boom');
    V.ring({ x: c.x, y: c.y, r0: 40, r1: 420, color: 'fire', width: 18, dur: 700 });
    V.emitP('ember', c.x, c.y, 26, { color: 'fire', speed: [60, 260], spread: 120, life: [700, 1400] });
    board.hitCard(b, { power: 0.8, color: '#ffb08a' });
  }
  ui.refreshAll();
  if (i === 0 && B.pendingStart?.length) {
    for (const { u, e } of B.pendingStart) { for (const a of e.target === 'all_allies' ? allies(u) : [u]) addStatus(a, e.status, e.turns || 1, { src: u }); passiveCallout(u, e.pname); }
    B.pendingStart = null;
  }
  emit('wave', { index: i, boss: !!b });
}

// ======================= main loop =======================
async function loop() {
  while (!B.over) {
    await heroTurn();
    if (B.over) break;
    await enemyTurn();
    if (B.over) break;
    B.round++;
  }
}

async function heroTurn() {
  for (const h of heroes()) h.castsThisTurn = 0;
  B.side = 'hero'; B.phase = 'start'; B.chain = { len: 0, last: null, list: [] }; B.kin = { phase: null, uid: null, n: 0 }; B.comboQi = 0;
  board.geo.side = 'hero'; ui.setTurn('hero'); ui.showChain();
  await ui.turnBanner('Your Turn', `Round ${B.round}`, 'hero');
  await startOfTurn('hero');
  if (await checkEnd()) return;
  const gain = RULES.qiBase + heroes().filter(h => h.alive).length * RULES.qiPerHeroine + B.gather * 2;
  B.qi = Math.min(RULES.qiMax, B.qi + gain); ui.qiGain(gain);
  for (const h of heroes()) if (h.alive && h.attached.some(a => a && a.id === 'phase_bead')) addPoints(h, h.phase, 1, true);
  B.encounter = B.round % 2 === 0 ? { offers: rollOffers(), bought: false, rerolls: 0 } : null;
  for (const h of heroes()) markSkip(h);
  B.phase = 'input';
  ui.refreshAll();
  emit('turnStart', { side: 'hero', round: B.round });
  if (B.encounter) emit('encounterReady');
  const done = new Promise(res => { B.endTurnResolve = res; });
  if (B.auto) runAuto();
  await done;
  B.endTurnResolve = null;
  deselect();
  if (B.over) return;
  B.phase = 'end';
  endOfTurn('hero');
  ui.refreshAll();
  emit('turnEnd', { side: 'hero', round: B.round });
}

function markSkip(u) {
  u.skip = !!(has(u, 'frost') || has(u, 'shock') || has(u, 'dream'));
}

async function enemyTurn() {
  B.side = 'enemy'; B.phase = 'enemy'; B.chain = { len: 0, last: null, list: [] }; B.kin = { phase: null, uid: null, n: 0 };
  board.geo.side = 'enemy'; ui.setTurn('enemy'); ui.showChain();
  await ui.turnBanner('Enemy Turn', null, 'enemy');
  await startOfTurn('enemy');
  if (await checkEnd()) return;
  for (const e of enemies()) markSkip(e);
  ui.refreshAll();
  const order = chainOrder(enemies().filter(e => e.alive));
  for (const e of order) {
    if (B.over) return;
    if (!e.alive) continue;
    if (e.skip) {
      const c = board.center(e, 0.42);
      V.floatText(has(e, 'frost') ? 'FROZEN' : (has(e, 'dream') ? 'DREAMING' : 'STUNNED'), c.x, c.y, 'info');
      board.hitCard(e, { power: 0.3, color: '#9fd6ff' }); await wait(420); continue;
    }
    const dm = has(e, 'demon');
    if (dm && (dm.stacks || 0) >= 3) { await charmedStrike(e); if (await checkEnd()) return; continue; }
    const ready = e.techs.filter(t => t.cur <= 0 && !t.blocked).sort((a, b) => (b.ult ? 9 : b.cd) - (a.ult ? 9 : a.cd));
    for (const t of ready) {
      if (!e.alive || B.over) break;
      const tg = aiTarget(e, t);
      if (!tg) break;
      await doCast(e, t, tg, false);
      await wait(180);
      if (await checkEnd()) return;
    }
  }
  if (B.over) return;
  endOfTurn('enemy');
  ui.refreshAll();
  emit('turnEnd', { side: 'enemy', round: B.round });
  await wait(250);
}

/** Heart Demon at 3 stacks: the unit strikes one of its own allies with its basic technique, then the stacks clear. */
async function charmedStrike(e) {
  removeStatus(e, 'demon');
  const mates = allies(e).filter(x => x !== e);
  const c = board.center(e, 0.4);
  V.floatText('CHARMED', c.x, c.y, 'big', { label: 'HEART DEMON' });
  sfx('ghost'); await wait(380);
  if (!mates.length) return;
  const victim = mates.sort((a, b) => a.hp - b.hp)[0];
  const t = e.techs[0];
  B.busy = true;
  await board.lift(e, true);
  const back = await board.lunge(e, victim, 0.3, 170);
  const h = applyDamage(e, victim, (t.effects?.find(x => x.do === 'damage')?.power) || 1, { noCrit: true });
  if (h) {
    const vc = board.center(victim, 0.45);
    V.fx('ghost_slash', { x: vc.x, y: vc.y, w: 300, dur: 480, bloom: 0.3 });
    V.floatText(h.dmg.toLocaleString('en-US'), vc.x, vc.y, 'dmg', { label: 'BETRAYED' });
    board.hitCard(victim, { power: 1 });
    if (h.killed) killUnit(victim);
  }
  await back();
  await board.lift(e, false);
  B.busy = false;
  emit('charm', { u: e, victim });
  if (combo('combo:sweet_poison')) { const v = has(e, 'venom'); if (v && victim.alive) addStatus(victim, 'venom', v.turns, { src: v.src }); }
  if (combo('combo:queens_thorns')) comboFire('combo:queens_thorns', e, () => gainQi(1));
}

/** Order units so that consecutive phases follow the generating cycle (longest Harmony chains first). */
function chainOrder(units) {
  const left = [...units], out = [];
  while (left.length) {
    let start = left.find(u => !left.some(v => GEN[v.phase] === u.phase && v !== u)) || left[0];
    let cur = start;
    while (cur) {
      out.push(cur); left.splice(left.indexOf(cur), 1);
      cur = left.find(v => v.phase === GEN[cur.phase] && v.phase !== cur.phase);
    }
  }
  return out;
}

// ======================= turn start / end effects =======================
async function startOfTurn(side) {
  for (const u of B.units.filter(x => x.side === side)) {
    const tangled = u.alive && has(u, 'entangle');
    const tick = u.d?.script?.cooldownTick || 1; // Qiongqi's techniques recharge two turns at a time
    if (!tangled) for (const t of u.techs) if (t.cur > 0) t.cur = Math.max(0, t.cur - tick);
    // Haste: a meter fills each turn; at 100 her charging techniques recharge one extra turn.
    const hs = u.alive ? hasteOf(u) : 0;
    if (hs > 0) {
      u.hasteMeter += hs;
      if (u.hasteMeter >= RULES.hasteFull) {
        u.hasteMeter -= RULES.hasteFull;
        if (!tangled && u.techs.some(t => t.cur > 0)) {
          for (const t of u.techs) if (t.cur > 0) t.cur -= 1;
          const c = board.center(u, 0.3); V.floatText('HASTE', c.x, c.y, 'info'); V.emitP('wisp', c.x, c.y, 8, { color: 'jade', speed: [40, 160] });
        }
      }
    }
    if (tangled) { const c = board.center(u, 0.3); V.floatText('ENTANGLED', c.x, c.y, 'info'); }
    u.techs.forEach((t, i) => { t.blocked = !!(u.alive && has(u, 'sealed') && i > 0); });
    board.refreshCard(u);
  }
  // Qilin: the ally with the lowest health takes a Spirit Shield of 8% of the wearer's max health until the next turn
  for (const w of B.units.filter(x => x.side === side && x.alive && set4(x, 'set:qilin'))) {
    const to = allies(w).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    const amt = Math.round(w.maxHp * 0.08);
    if (to && amt > to.barrier) {
      to.barrier = amt; addStatus(to, 'shield', 2, { src: w });
      const c = board.center(to, 0.45); V.floatText('+' + amt.toLocaleString('en-US'), c.x, c.y + 30, 'shield', { label: 'AUSPICIOUS GUARD' });
      B.log.gear['AUSPICIOUS GUARD'] = (B.log.gear['AUSPICIOUS GUARD'] || 0) + 1;
    }
  }
  // Vermilion Phoenix Covenant (Yan Feihong, petal 6): the phoenix circles back at the start of her next two turns
  if (side === 'hero' && B.phoenix && B.phoenix.left > 0) {
    const pu = B.phoenix.u; B.phoenix.left -= 1;
    const fs = enemies().filter(f => f.alive);
    if (pu.alive && fs.length) {
      const g = board.geo, y = g.enemyY + 150, x0 = g.x0 - 320, x1 = g.W + 320, dur = 820;
      const path = k => ({ x: lerp(x0, x1, ease.inOutCubic(k)), y: y - Math.sin(k * Math.PI) * 30 });
      sfx('fire'); V.fx('phoenix', { w: 560, dur, path, fadeIn: 0.06, fadeOut: 0.1, bloom: 0.3 });
      await wait(dur * 0.45);
      for (const f of fs) {
        const h = applyDamage(pu, f, 0.4); if (!h) continue;
        const c = board.center(f);
        V.fx('fire_burst', { x: c.x, y: c.y, w: 300, dur: 560, s0: 0.5, s1: 1.15, bloom: 0.3 });
        V.floatText(h.dmg.toLocaleString('en-US'), c.x, c.y, h.crit ? 'crit' : 'dmg', { label: 'CIRCLING PHOENIX', size: 30 });
        board.hitCard(f, { power: 0.6, color: '#ffb08a' });
        if (h.killed) killUnit(f);
      }
      await wait(450);
    }
    if (B.phoenix && B.phoenix.left <= 0) B.phoenix = null;
  }
  const us = B.units.filter(u => u.side === side && u.alive);
  if (B.round >= RULES.tribulationRound) {
    const pct = RULES.tribulationBase + RULES.tribulationStep * (B.round - RULES.tribulationRound);
    if (side === 'hero' && B.round === RULES.tribulationRound) await ui.banner('Heavenly Tribulation', 'Lightning strikes every card at the start of its turn', 'trib');
    V.flash('#c9b8ff', 0.4); sfx('thunder');
    for (const u of us) {
      const c = board.center(u);
      V.bolt({ x0: c.x + rand(-40, 40), y0: -40, x1: c.x, y1: c.y, color: 'violet', width: 5, dur: 360, branches: 3 });
      V.fx('thunder_burst', { x: c.x, y: c.y, w: 300, dur: 420 });
      const dmg = Math.round(u.maxHp * pct);
      u.hp = Math.max(0, u.hp - dmg);
      V.floatText(dmg.toLocaleString('en-US'), c.x, c.y - 30, side === 'hero' ? 'enemy' : 'dmg', { label: 'TRIBULATION' });
      board.hitCard(u, { power: 0.8, color: '#d9c8ff' });
      if (u.hp <= 0) killUnit(u);
    }
    V.shake(10, 300);
    await wait(650);
  }
  let any = false;
  for (const u of us) {
    if (!u.alive) continue;
    const c = board.center(u);
    for (const s of [...u.status]) {
      if (s.id === 'burn' || s.id === 'wound') {
        const dmg = s.id === 'burn' ? s.value : Math.round((s.value || 0) * (s.stacks || 1));
        if (!dmg) continue;
        u.hp = Math.max(0, u.hp - dmg); any = true;
        if (s.id === 'burn') { V.fx('fire_burst', { x: c.x, y: c.y + 30, w: 220, dur: 500 }); V.emitP('ember', c.x, c.y + 40, 14, { color: 'fire', speed: [40, 180], spread: 50 }); }
        else V.emitP('spark', c.x, c.y, 14, { color: 'fire', speed: [80, 260] });
        V.floatText(dmg.toLocaleString('en-US'), c.x, c.y - 10, side === 'hero' ? 'enemy' : 'dmg', { label: STATUS[s.id].name.toUpperCase() });
        board.hitCard(u, { power: 0.4, color: '#ff9a6a' });
        if (s.src) s.src.stats.dmg += dmg;
      } else if (s.id === 'venom') {
        const dmg = Math.round(u.maxHp * 0.06); u.hp = Math.max(0, u.hp - dmg); any = true;
        V.emitP('glow', c.x, c.y, 12, { color: 'green', speed: [30, 120], spread: 60 });
        V.floatText(dmg.toLocaleString('en-US'), c.x, c.y - 10, side === 'hero' ? 'enemy' : 'dmg', { label: 'GU VENOM' });
        board.hitCard(u, { power: 0.35, color: '#9be36e' });
        if (s.src) s.src.stats.dmg += dmg;
      } else if (s.id === 'dew' && !has(u, 'wither')) {
        const amt = Math.min(u.maxHp - u.hp, Math.round(u.maxHp * 0.06)); u.hp += amt; any = true;
        V.emitP('petal', c.x, c.y, 8, { color: 'jade', speed: [30, 120], spread: 60, up: 60 });
        V.floatText('+' + amt.toLocaleString('en-US'), c.x, c.y - 10, 'heal');
      }
    }
    if (u.hp <= 0) killUnit(u);
  }
  if (any) { sfx('hit'); await wait(600); }
  ui.refreshAll();
}

function endOfTurn(side) {
  for (const u of B.units.filter(x => x.side === side)) {
    for (const s of u.status) s.turns -= 1;
    const expired = u.status.filter(s => s.turns <= 0);
    u.status = u.status.filter(s => s.turns > 0);
    for (const s of expired) {
      if (s.id === 'shield') u.barrier = 0;
      if (s.id === 'shatter' && u.qiShield && u.alive) {
        u.qiShield.cur = u.qiShield.max;
        const c = board.center(u);
        V.ring({ x: c.x, y: c.y, r0: 60, r1: 260, color: 'gold', width: 10, dur: 600 });
        V.floatText('QI SHIELD RESTORED', c.x, c.y - 70, 'info');
      }
    }
    if (u.qiShield && u.alive && !expired.some(x => x.id === 'shatter') && u.qiShield.cur < u.qiShield.max) {
      u.qiShield.cur = u.qiShield.max;
      const c = board.center(u); V.ring({ x: c.x, y: c.y, r0: 60, r1: 240, color: 'gold', width: 8, dur: 520 });
    }
    u.skip = false;
    board.refreshCard(u);
  }
}

// ======================= statuses =======================
/** Add a status by short or data id. extra: { value, src, stacks }. Returns true if it landed. */
function addStatus(u, id, turns, extra = {}) {
  id = sid(id);
  if (!u.alive || !id) return false;
  const d = STATUS[id];
  if (d.debuff && has(u, 'clear')) { const c = board.center(u, 0.4); V.floatText('IMMUNE', c.x, c.y, 'info'); return false; }
  const src = extra.src;
  if (d.debuff && src && src.side !== u.side) {
    // Still Water: the first debuff that would land on her each enemy turn goes back to its caster
    if (set4(u, 'set:still_water') && B.side !== u.side && u.mirrorRound !== B.round && src.alive) {
      u.mirrorRound = B.round; gearCallout(u, 'MIRROR LAKE');
      addStatus(src, id, turns + (B.side === src.side ? 1 : 0), { ...extra, src: u });
      return false;
    }
    // effect resistance against the caster's accuracy
    const resist = Math.min(RULES.resistCap ?? 0.85, Math.max(0, (u.res || 0) - (src.acc || 0)));
    if (resist > 0 && Math.random() < resist) { const c = board.center(u, 0.4); V.floatText('RESISTED', c.x, c.y - 40, 'info'); B.log.gear.RESISTED = (B.log.gear.RESISTED || 0) + 1; return false; }
    // Heavenly Eye: her debuffs last a turn longer (not the ones that skip turns) and chip a boss's Qi shield
    if (set4(src, 'set:heavenly_eye')) {
      if (!SKIPS_TURN.has(id)) turns += 1;
      if (u.boss && u.qiShield && !has(u, 'shatter') && u.qiShield.cur > 0) { u.qiShield.cur -= 1; if (u.qiShield.cur === 0) shatter(u); }
    }
  }
  const ex = has(u, id);
  if (id === 'demon' || id === 'wound') {
    const n = extra.stacks || 1;
    if (ex) { ex.stacks = Math.min(id === 'wound' ? 5 : 3, (ex.stacks || 1) + n); ex.turns = Math.max(ex.turns, turns); if (extra.src) ex.src = extra.src; if (extra.value) ex.value = Math.max(ex.value || 0, extra.value); }
    else u.status.push({ id, turns: id === 'demon' ? 99 : turns, stacks: Math.min(3, n), ...extra, stacks: Math.min(id === 'wound' ? 5 : 3, n) });
  } else if (ex) { ex.turns = Math.max(ex.turns, turns); if (extra.value) ex.value = Math.max(ex.value || 0, extra.value); if (extra.src) ex.src = extra.src; }
  else u.status.push({ id, turns, ...extra });
  if ((id === 'frost' || id === 'shock' || id === 'dream') && B.side === u.side && B.phase === 'input') u.skip = true;
  if (id === 'sealed') u.techs.forEach((t, i) => { if (i > 0) t.blocked = true; });
  board.refreshCard(u);
  // passives on the caster: Lingering Embers (Fire Poison lasts longer), Qi when she lands a debuff
  if (src && src.side !== u.side && d.debuff) {
    for (const e of pFx(src, 'always', 'extend')) if (sid(e.status) === id) { const st = has(u, id); if (st) st.turns += e.turns || 1; }
    if (src.side === 'hero') for (const e of pFx(src, 'on_debuff', 'qi')) if (useOnce(src, e)) { gainQi(e.amount || 1); passiveCallout(src, e.pname); }
    // Song of the Jasmine (Ning Suxin, petal 4): landing a debuff also gives her +10% damage for the turn
    if (src.side === 'hero') for (const e of pFx(src, 'on_debuff', 'stat')) if (e.damageBonus && useOnce(src, e)) src.turnBonus = { k: `${B.round}${B.side}`, v: e.damageBonus };
  }
  // Heaven-Shaking Seal: taunting an enemy also disrupts its Qi
  if (id === 'provoke' && src && artPow(src, 'art:heaven_shaking_seal')) addStatus(u, 'disrupt', turns, { src });
  return true;
}
function removeStatus(u, id) {
  id = sid(id);
  u.status = u.status.filter(s => s.id !== id);
  if (id === 'shield') u.barrier = 0;
  if (id === 'sealed') u.techs.forEach(t => { t.blocked = false; });
  board.refreshCard(u);
}
/** Remove up to n debuffs (Shattered stays). Returns the removed statuses. */
function cleanse(u, n = 1) {
  const debuffs = u.status.filter(s => STATUS[s.id].debuff && s.id !== 'shatter');
  const gone = debuffs.slice(0, n);
  gone.forEach(s => removeStatus(u, s.id));
  return gone;
}
/** Remove up to n buffs from an enemy. */
function dispel(u, n = 1) {
  const buffs = u.status.filter(s => !STATUS[s.id].debuff);
  const gone = buffs.slice(0, n);
  gone.forEach(s => removeStatus(u, s.id));
  return gone;
}

// ======================= damage & healing =======================
const phaseMul = (side, phase) => 1 + RULES.pointBonus * (B.points[side][phase] || 0);

function computeHit(src, tgt, power, o = {}) {
  const phase = o.phase || src.phase;
  const adv = advantage(phase, tgt.phase);
  let mul = phaseMul(src.side, phase) * (o.hm || 1) * (o.emp ? RULES.empowerMul : 1) * (o.extraMul || 1) * (o.mast || 1);
  if (src.turnBonus && src.turnBonus.k === `${B.round}${B.side}`) mul *= 1 + src.turnBonus.v; // Song of the Jasmine (petal 4)
  if (adv > 0) mul *= RULES.advMul; else if (adv < 0) mul *= RULES.resMul;
  if (has(src, 'disrupt')) mul *= 0.7;
  if (has(tgt, 'mark')) mul *= RULES.markMul;
  if (has(tgt, 'shatter')) mul *= RULES.shatterMul;
  if (tgt.attached && tgt.attached.some(a => a && a.id === 'jade_robe')) mul *= 0.8;
  const frost = !o.keepFrost && has(tgt, 'frost');
  let twin = null;
  if (frost) {
    if (src.id === 'hero:mo_yingyue' && combo('combo:frost_and_thunder')) { mul *= 1.6; twin = 'combo:frost_and_thunder'; }
    else mul *= RULES.frostBreakMul;
  }
  const glance = has(src, 'mist') && Math.random() < 0.5;
  if (glance) mul *= 0.5;
  // passives that change damage
  for (const e of hasWhen(src, 'single_target_vs_below_half')) if (o.single && tgt.hp / tgt.maxHp < 0.5) mul *= 1 + e.damageBonus;
  for (const e of hasWhen(src, 'target_skips_turn')) if (has(tgt, 'frost') || has(tgt, 'shock') || has(tgt, 'dream')) mul *= 1 + e.damageBonus;
  if (src.nextTechBonus) mul *= 1 + src.nextTechBonus;
  for (const w of B.units) if (w.alive && w.side === tgt.side) for (const e of hasWhen(w, 'while_she_stands')) if (e.damageTaken) mul *= 1 + e.damageTaken;
  let pCrit = 0;
  for (const e of pFx(src, 'on_cast', 'stat')) if (e.when === 'first_technique_each_turn' && e.stat === 'stat:crit' && src.castsThisTurn === 1) pCrit += e.value;
  const critCh = critOf(src) + (adv > 0 ? RULES.advCrit : 0) + (o.critBonus || 0) + pCrit;
  const crit = !o.noCrit && !glance && Math.random() < critCh;
  if (crit) mul *= src.critDmg;
  const def = defOf(tgt) * (1 - (o.pierce || 0));
  const dmg = Math.max(1, Math.round(atkOf(src) * power / (1 + def / RULES.defK) * mul * rand(0.95, 1.05)));
  return { dmg, crit, adv, frost, glance, twin };
}

/** Apply damage (Golden Bell, shield first), break Frost Seals and Lotus Dreams, chip Qi shields. Returns the hit record. */
function applyDamage(src, tgt, power, o = {}) {
  if (!tgt.alive) return null;
  const h = computeHit(src, tgt, power, o);
  B.log.hits = (B.log.hits || 0) + 1;
  if (has(tgt, 'bell')) { h.dmg = 0; h.bell = true; const c = board.center(tgt, 0.4); V.floatText('GOLDEN BELL', c.x, c.y - 30, 'info'); }
  if (h.frost) removeStatus(tgt, 'frost');
  if (has(tgt, 'dream')) { removeStatus(tgt, 'dream'); h.woke = true; }
  let absorbed = 0;
  if (tgt.barrier > 0 && h.dmg > 0) {
    absorbed = Math.min(tgt.barrier, h.dmg); tgt.barrier -= absorbed;
    if (tgt.barrier <= 0) { removeStatus(tgt, 'shield'); emit('shieldBreak', { u: tgt }); }
  }
  tgt.hp = Math.max(0, tgt.hp - (h.dmg - absorbed));
  src.stats.dmg += h.dmg; tgt.stats.taken += h.dmg - absorbed;
  h.absorbed = absorbed;
  if (tgt.qiShield && !has(tgt, 'shatter') && tgt.alive && !h.bell) {
    tgt.qiShield.cur = Math.max(0, tgt.qiShield.cur - (h.adv > 0 ? 2 : 1));
    if (tgt.qiShield.cur === 0) { shatter(tgt); h.shattered = true; }
  }
  h.killed = tgt.hp <= 0;
  if (h.dmg > 0 && src.side !== tgt.side && tgt.side === 'hero' && !h.killed) {
    for (const e of pFx(tgt, 'on_hit_taken')) {
      if (!useOnce(tgt, e)) continue;
      if (e.do === 'qi') { gainQi(h.crit && e.critAmount ? e.critAmount : (e.amount || 1)); passiveCallout(tgt, e.pname); }
      if (e.do === 'stat' && e.damageBonus) { tgt.nextTechBonus = e.damageBonus; passiveCallout(tgt, e.pname); }
      if (e.do === 'apply') addStatus(tgt, e.status, e.turns || 1, { src: tgt });               // Rude Awakening (petal 4): Iron Body
    }
  }
  // Twin Blooms that fire on a hit
  if (h.twin === 'combo:frost_and_thunder' && !h.killed) comboFire(h.twin, src, () => addStatus(tgt, 'shock', 1));
  if (tgt.id === 'hero:wei_zi' && src.side === 'enemy' && combo('combo:phoenix_among_peonies')) {
    const b = has(src, 'burn');
    if (b && b.value) comboFire('combo:phoenix_among_peonies', tgt, () => { B.pendingFlares = (B.pendingFlares || []); B.pendingFlares.push(src); });
  }
  // Thorn Lotus strikes back at single-target attackers, after the technique resolves.
  if (o.single && has(tgt, 'thorns') && !h.killed && src.alive) B.counters.push({ u: tgt, target: src });
  board.refreshCard(tgt);
  return h;
}

/** Heal: o.raw skips the healing stats (an amount already counted), o.noOverflow stops Blood Lotus passing it on. */
function applyHealAmount(src, tgt, amount, o = {}) {
  if (!tgt.alive) return 0;
  if (has(tgt, 'wither')) { const c = board.center(tgt, 0.4); V.floatText('WITHERED', c.x, c.y, 'info'); return 0; }
  let pHeal = 0;
  if (!o.raw) {
    for (const e of hasWhen(src, 'target_below_30pct')) if (e.stat === 'stat:healing' && tgt.hp / tgt.maxHp < 0.3) pHeal += e.value;
    for (const e of hasWhen(src, 'extends_harmony_chain')) if (e.stat === 'stat:healing' && src.castExtended) pHeal += e.value;
  }
  const amt = Math.round(o.raw ? amount : amount * (1 + (src.healing || 0) + pHeal) * (1 + (tgt.healRecv || 0))), real = Math.min(tgt.maxHp - tgt.hp, amt);
  tgt.hp += real; src.stats.heal += real;
  board.refreshCard(tgt);
  // Blood Lotus: healing past her full health flows to the ally with the lowest health
  if (!o.noOverflow && amt > real && set4(tgt, 'set:blood_lotus')) {
    const to = allies(tgt).filter(a => a !== tgt && a.hp < a.maxHp).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (to) {
      const n = applyHealAmount(src, to, amt - real, { raw: true, noOverflow: true });
      if (n) { const c = board.center(to, 0.45); V.floatText('+' + Math.min(n, to.maxHp).toLocaleString('en-US'), c.x, c.y + 20, 'heal', { label: 'CRIMSON BLOOM' }); B.log.gear['CRIMSON BLOOM'] = (B.log.gear['CRIMSON BLOOM'] || 0) + 1; }
    }
  }
  return amt;
}

function shatter(u) {
  addStatus(u, 'shatter', 1);
  const ult = u.techs.find(t => t.ult); if (ult) ult.cur += 1;
  B.log.shatters++;
  const c = board.center(u);
  V.flash('#ffe7a8', 0.45); V.shake(12, 380); sfx('shatter'); hitStop(90);
  V.emitP('shard', c.x, c.y, 34, { color: 'gold', speed: [240, 820], life: [400, 900] });
  V.ring({ x: c.x, y: c.y, r0: 40, r1: 340, color: 'gold', width: 16, dur: 520 });
  V.floatText('SHATTERED', c.x, c.y - 60, 'big', { label: 'QI SHIELD BROKEN' });
  board.refreshCard(u);
  emit('shatter', u);
}

function killUnit(u) {
  if (!u.alive) return;
  if (u.side === 'hero') {
    // Rising from the Mud: once per battle an ally who would fall survives at 1 health behind a Spirit Shield
    for (const sv of heroes().filter(x => x.alive)) for (const e of pFx(sv, 'on_fall', 'heal')) {
      if (e.when !== 'ally_would_fall' || !useOnce(sv, e)) continue;
      u.hp = 1; const sh = pFx(sv, 'on_fall', 'shield')[0];
      if (sh) { u.barrier = Math.max(u.barrier, Math.round(atkOf(sv) * (sh.power || 0.6))); addStatus(u, 'shield', 2, { src: sv }); }
      passiveCallout(u, e.pname); board.refreshCard(u); return;
    }
    // Vermilion Rebirth: once per battle she rises at 30% health with her ultimate ready
    for (const e of pFx(u, 'on_fall', 'revive')) {
      if (!e.self || !useOnce(u, e)) continue;
      u.hp = Math.round(u.maxHp * (e.pct || 0.3)); u.status = u.status.filter(x => !STATUS[x.id].debuff);
      for (const r of pFx(u, 'on_fall', 'refresh')) { const t3 = u.techs.find(x => x.slot === r.skill) || u.techs[2]; if (t3) t3.cur = 0; }
      const c = board.center(u); V.fx('phoenix', { x: c.x, y: c.y, w: 420, dur: 900, s0: 0.6, s1: 1.1 });
      passiveCallout(u, e.pname); board.refreshCard(u); return;
    }
  }
  const fi = u.attached ? u.attached.findIndex(a => a && a.id === 'phoenix_feather') : -1;
  const rb = has(u, 'rebirth');
  if (fi >= 0 || rb) {
    if (fi >= 0) u.attached[fi] = null; else removeStatus(u, 'rebirth');
    u.hp = Math.round(u.maxHp * (fi >= 0 ? 0.4 : 0.3));
    const c = board.center(u);
    V.fx('phoenix', { x: c.x, y: c.y, w: 420, dur: 900, s0: 0.6, s1: 1.1 });
    V.emitP('ember', c.x, c.y, 30, { color: 'fire', speed: [80, 300], spread: 60 });
    V.floatText('REBIRTH', c.x, c.y - 40, 'big', { label: fi >= 0 ? 'PHOENIX FEATHER' : 'PHOENIX REBIRTH' });
    sfx('heal'); board.refreshCard(u);
    return;
  }
  // Lingering Embers (Yan Feihong, petal 4): each burning enemy that falls gives the team 1 Spirit Qi
  if (u.side === 'enemy' && has(u, 'burn')) {
    const yan = heroes().find(x => x.alive && x.id === 'hero:yan_feihong' && petal(x, 4));
    if (yan) { gainQi(1); passiveCallout(yan, 'Lingering Embers'); }
  }
  u.alive = false; u.hp = 0; u.status = []; u.barrier = 0; u.skip = false;
  if (u.side === 'enemy') { gainQi(RULES.qiPerKill); B.castKills = (B.castKills || 0) + 1; }
  else B.log.falls++;
  board.refreshCard(u);
  ui.killFx(u);
  // a falling heroine's last gift (Lin Chaxue: Spirit Shields for every ally)
  for (const e of pFx(u, 'on_fall', 'shield')) {
    if (e.target !== 'all_allies' || !useOnce(u, e)) continue;
    for (const a of allies(u)) { a.barrier = Math.max(a.barrier, Math.round(u.maxHp * (e.pctOfMaxHp || 0.15))); addStatus(a, 'shield', e.turns || 2, { src: u }); }
    passiveCallout(u, e.pname);
  }
  // ...and statuses for every ally (Lin Chaxue, petal 4: Clear Heart)
  for (const e of pFx(u, 'on_fall', 'apply')) {
    if (!useOnce(u, e)) continue;
    for (const a of e.target === 'all_allies' ? allies(u) : []) addStatus(a, e.status, e.turns || 1, { src: u });
  }
}
function gainQi(n) { if (!n) return; B.qi = Math.max(0, Math.min(RULES.qiMax, B.qi + n)); ui.qiGain(n); }

/** Show a Twin Bloom firing, count it, then run its effect. */
function comboFire(id, u, fn) {
  B.log.combos[id] = (B.log.combos[id] || 0) + 1;
  const name = (B.def.comboNames || {})[id] || 'Twin Bloom';
  const c = board.center(u, 0.25);
  V.floatText(name.toUpperCase(), c.x, c.y - 30, 'harmony', { label: 'TWIN BLOOM 并蒂', size: 30 });
  V.ring({ x: c.x, y: c.y, r0: 30, r1: 220, color: 'gold', width: 8, dur: 520 });
  emit('combo', { id, u });
  fn && fn();
}

// ======================= Phase Qi, Harmony and Kindred Qi =======================
/** Step the chain for a cast and return its damage multiplier (the better of Harmony and Kindred Qi). */
function chainStep(u) {
  const c = B.chain, k = B.kin;
  if (c.last && GEN[c.last] === u.phase && c.last !== u.phase && c.len < 9) { c.len += 1; c.list.push(u.phase); }
  else if (c.len >= 2 && set4(u, 'set:five_elements')) { c.list.push(u.phase); gearCallout(u, 'UNBROKEN CYCLE'); } // the chain holds
  else { c.len = 1; c.list = [u.phase]; }
  // Kindred Qi: the same phase again, from a different card
  if (k.phase === u.phase && k.uid !== u.uid) k.n += 1; else if (k.phase !== u.phase) k.n = 0;
  k.phase = u.phase; k.uid = u.uid;
  c.last = u.phase;
  if (u.side === 'hero') { B.maxChain = Math.max(B.maxChain, c.len); B.log.harmony = Math.max(B.log.harmony, c.len); B.log.kindred = Math.max(B.log.kindred, k.n); }
  ui.showChain();
  const harm = 1 + RULES.harmonyStep * (Math.min(c.len, RULES.harmonyCap) - 1);
  const kin = 1 + Math.min(RULES.kindredCap, RULES.kindredStep * k.n);
  return Math.max(harm, kin);
}
function addPoints(u, phase, n, quiet = false) {
  if (!(phase in B.points[u.side])) return;
  B.points[u.side][phase] += n;
  ui.pointFly(u, phase, n, quiet);
}

// ======================= casting =======================
async function doCast(u, t, target, emp) {
  B.busy = true; ui.lock();
  emit('castStart', { u, t, target });
  if (emp && !(t.emp && B.qi >= t.emp.cost)) emp = false;
  if (emp) { B.qi -= t.emp.cost; ui.qiGain(-t.emp.cost); if (u.side === 'hero') B.log.empowers++; }
  t.cur = t.cd;
  board.refreshCard(u);
  u.castsThisTurn = (u.castsThisTurn || 0) + 1;
  const lenBefore = B.chain.len;
  const hm = chainStep(u);
  u.castExtended = B.chain.len > lenBefore && B.chain.len >= 2;
  const ctx = makeCtx(u, t, target, emp, hm);
  B.log.casts++; B.log[t.id] = (B.log[t.id] || 0) + 1;
  B.castKills = 0; B.counters = []; B.pendingFlares = [];
  ui.castBanner(u, t, emp, hm);
  await board.lift(u, true);
  try {
    const run = SKILLS[t.chor] || SKILLS.generic;
    await run(ctx);
    gearOnCast(u, t);
  } catch (e) { console.error('skill error', t.id, e); }
  await board.lift(u, false);
  if (u.side === 'hero') B.log.maxKills = Math.max(B.log.maxKills, B.castKills || 0);
  u.nextTechBonus = 0; u.castExtended = false;
  if (u.alive) addPoints(u, GEN[u.phase], t.ult ? 2 : 1);
  if (B.chain.len >= 2) {
    const c = board.center(u, 0.2);
    V.floatText(`HARMONY ×${B.chain.len}`, c.x, c.y + 6, 'harmony', { label: B.chain.list.map(p => PHASES[p].glyph).join(' → '), size: 34 });
    if (B.chain.len === RULES.harmonyCap && u.side === 'hero') { gainQi(RULES.harmonyQi); ui.harmonyBurst(); }
  } else if (B.kin.n >= 1) {
    const c = board.center(u, 0.2);
    V.floatText(`KINDRED +${Math.round(Math.min(RULES.kindredCap, RULES.kindredStep * B.kin.n) * 100)}%`, c.x, c.y + 6, 'harmony', { label: `${PHASES[u.phase].glyph} 同气`, size: 30 });
  }
  // Thorn Lotus counters and Phoenix Among Peonies flares, after the technique
  for (const k of B.counters) if (k.u.alive && k.target.alive) {
    const h = applyDamage(k.u, k.target, 0.5 * (1 + (k.u.counterMod || 0)), { noCrit: true });
    if (h) { const c = board.center(k.target, 0.45); V.fx('ghost_slash', { x: c.x, y: c.y, w: 260, dur: 420, flip: true }); V.floatText(h.dmg.toLocaleString('en-US'), c.x, c.y, k.u.side === 'hero' ? 'dmg' : 'enemy', { label: 'THORN LOTUS' }); board.hitCard(k.target, { power: 0.6 }); if (h.killed) killUnit(k.target); }
  }
  for (const f of B.pendingFlares) if (f.alive) await flare(f, 'burn');
  B.counters = []; B.pendingFlares = [];
  await wait(120);
  B.busy = false;
  ui.refreshAll();
  emit('cast', { u, t, target, emp });
  await checkEnd();
}

/** A damage-over-time status burns all its remaining damage at once. */
async function flare(u, id) {
  const s = has(u, id); if (!s || !u.alive) return 0;
  const dmg = Math.round((s.value || 0) * Math.max(1, s.turns) * (s.stacks || 1));
  removeStatus(u, id);
  if (!dmg) return 0;
  const c = board.center(u);
  V.fx('fire_burst', { x: c.x, y: c.y, w: 360, dur: 620, s0: 0.5, s1: 1.2 }); V.emitP('ember', c.x, c.y, 24, { color: 'fire', speed: [80, 320] });
  u.hp = Math.max(0, u.hp - dmg); if (s.src) s.src.stats.dmg += dmg;
  V.floatText(dmg.toLocaleString('en-US'), c.x, c.y - 20, u.side === 'enemy' ? 'crit' : 'ecrit', { label: 'FLARE' });
  board.hitCard(u, { power: 1, color: '#ffb08a' }); sfx('boom'); V.shake(6, 200);
  if (u.hp <= 0) killUnit(u);
  await wait(320);
  return dmg;
}

function makeCtx(u, t, target, emp, hm) {
  const pos = x => board.center(x);
  const single = t.target === 'enemy';
  const ctx = {
    u, t, target, emp, hm, side: u.side, B,
    foes: () => foes(u), allies: () => allies(u), pos,
    /** Damage + feedback (number, shake, sparks). */
    hit(tgt, power, o = {}) {
      if (!tgt || !tgt.alive) return null;
      // Black Tortoise: a single-target hit on an ally below 30% health strikes the wearer instead, for 25% less
      if (single && !o.splash && u.side !== tgt.side && tgt.hp / tgt.maxHp < 0.3) {
        const g = allies(tgt).filter(a => a !== tgt && set4(a, 'set:black_tortoise')).sort((a, b) => b.hp / b.maxHp - a.hp / a.maxHp)[0];
        if (g) { gearCallout(g, 'SHELL OF THE NORTH'); tgt = g; power *= 0.75; }
      }
      const sealed = u.id === 'hero:ling_shuang' && petal(u, 4) && !!has(tgt, 'frost');
      const h = applyDamage(u, tgt, power, { hm, emp, single, mast: 1 + (t.mods?.dmg || 0), ...o });
      if (!h) return null;
      // Biting Frost (Ling Shuang, petal 4): the first time each turn she hits a Frost Sealed enemy, +1 Spirit Qi
      if (sealed && useOnce(u, { once: 'turn', pid: 'ling_petal4', do: 'qi' })) { gainQi(1); passiveCallout(u, 'Biting Frost'); }
      const c = board.center(tgt, o.fy ?? 0.45);
      const style = u.side === 'hero' ? (h.crit ? 'crit' : 'dmg') : (h.crit ? 'ecrit' : 'enemy');
      const label = h.glance ? 'GLANCE' : (h.adv > 0 ? 'OVERCOME' : (h.adv < 0 ? 'RESISTED' : (h.frost ? 'SEAL BROKEN' : null)));
      if (!h.bell) V.floatText(h.dmg.toLocaleString('en-US'), c.x + rand(-30, 30), c.y + rand(-20, 10), style, { label: h.crit ? null : label, size: o.small ? 30 : undefined });
      if (h.absorbed) V.floatText(`-${h.absorbed.toLocaleString('en-US')}`, c.x + 50, c.y + 40, 'shield', { label: 'SHIELD' });
      board.hitCard(tgt, { power: (o.small ? 0.5 : 1) * (h.crit ? 1.3 : 1), dir: tgt.side === 'enemy' ? -1 : 1, color: o.flash || '#ffffff' });
      const col = o.color || PHASES[o.phase || u.phase].col;
      V.emitP('spark', c.x, c.y, h.crit ? 18 : 10, { color: col, speed: [200, 640] });
      if (h.crit) { hitStop(70); V.shake(9, 240); sfx('crit'); } else { sfx('hit'); if (!o.small) V.shake(4, 160); }
      if (h.killed) killUnit(tgt);
      if (!o.splash) gearOnHit(ctx, tgt, h, power, o);
      if (u.side === 'hero') {
        if (h.killed && !tgt.alive) for (const e of pFx(u, 'on_kill', 'refresh')) { const t3 = u.techs.find(x => x.slot === e.skill) || u.techs[2]; if (t3 && t3.cur > 0) { t3.cur = e.ready ? 0 : Math.max(0, t3.cur - (e.turns || 1)); board.refreshCard(u); passiveCallout(u, e.pname); } }
        if (h.crit) for (const e of pFx(u, 'on_crit', 'qi')) if (useOnce(u, e)) { gainQi(e.amount || 1); passiveCallout(u, e.pname); }
      }
      return h;
    },
    heal(tgt, power, o = {}) {
      if (!tgt || !tgt.alive) return 0;
      const base = o.pctMaxHp ? tgt.maxHp * o.pctMaxHp : atkOf(u) * power;
      const amt = base * phaseMul(u.side, u.phase) * hm * (emp ? RULES.empowerMul : 1) * (1 + (t.mods?.heal || 0)) * rand(0.97, 1.03);
      const real = applyHealAmount(u, tgt, amt);
      if (real) { const c = board.center(tgt, 0.45); V.floatText('+' + real.toLocaleString('en-US'), c.x + rand(-20, 20), c.y, 'heal'); }
      for (const e of pFx(u, 'on_heal', 'cleanse')) { let n = 0; for (const st of e.statuses || []) if (has(tgt, st)) { removeStatus(tgt, st); n++; } if (n) passiveCallout(tgt, e.pname); }
      return real;
    },
    shield(tgt, power, o = {}) {
      if (!tgt || !tgt.alive) return 0;
      const base = o.pctOfMaxHp ? u.maxHp * o.pctOfMaxHp : atkOf(u) * power;
      const amt = Math.round(base * phaseMul(u.side, u.phase) * hm * (emp ? RULES.empowerMul : 1) * (1 + (t.mods?.shield || 0)));
      tgt.barrier = Math.max(tgt.barrier, amt);
      addStatus(tgt, 'shield', o.turns || 2, { src: u });
      const c = board.center(tgt, 0.45); V.floatText('+' + amt.toLocaleString('en-US'), c.x, c.y + 30, 'shield', { label: 'SPIRIT SHIELD' });
      return amt;
    },
    status: (tgt, id, turns, extra = {}) => addStatus(tgt, id, turns, extra.src ? extra : { ...extra, src: u }),
    /** Roll a technique's effect chance, with her mastery's bonus. */
    chance: base => Math.random() < base + (t.mods?.chance || 0),
    /** Has she opened petal n? (the founders' choreography plays their petals) */
    petal: n => petal(u, n),
    burn(tgt, turns = 2) {
      if (u.id === 'hero:yan_feihong' && combo('combo:phoenix_among_peonies') && has(tgt, 'provoke')?.src?.id === 'hero:wei_zi') turns += 1;
      return addStatus(tgt, 'burn', turns, { value: Math.round(atkOf(u) * 0.35 * phaseMul(u.side, 'fire') * (emp ? RULES.empowerMul : 1)), src: u });
    },
    cleanse(tgt, n) {
      const gone = cleanse(tgt, n);
      if (gone.length && u.id === 'hero:su_lianhua' && u.side === 'hero' && combo('combo:returned_karma')) {
        for (const s of gone) {
          const es = foes(u); if (!es.length) break;
          const dst = es.sort((a, b) => a.status.filter(x => STATUS[x.id].debuff).length - b.status.filter(x => STATUS[x.id].debuff).length)[0];
          comboFire('combo:returned_karma', dst, () => {
            addStatus(dst, s.id, Math.max(1, s.turns), { value: s.value, stacks: s.stacks, src: u });
            if (B.comboQi < 2) { B.comboQi++; gainQi(1); }
          });
        }
      }
      return gone.length;
    },
    delay(tgt, n = 1) { for (const tt of tgt.techs) if (tt.cd > 1) tt.cur += n; board.refreshCard(tgt); },
    hasStatus: (x, id) => has(x, id),
    revive(tgt, pct) {
      if (tgt.alive) return;
      tgt.alive = true; tgt.hp = Math.round(tgt.maxHp * pct); tgt.status = []; tgt.barrier = 0;
      board.refreshCard(tgt); ui.reviveFx(tgt);
    },
    gainQi,
    dispel: (tgt, n) => dispel(tgt, n).length,
    flare: (tgt, id) => flare(tgt, sid(id)),
  };
  return ctx;
}

// ======================= gear effects on hits and casts =======================
function gearOnHit(x, tgt, h, power, o) {
  const u = x.u;
  if (!h || !u.alive) return;
  // Vermilion Bird: her critical hits apply Fire Poison for 2 turns
  if (h.crit && tgt.alive && set4(u, 'set:vermilion_bird')) addStatus(tgt, 'burn', 2, { value: Math.round(atkOf(u) * 0.35 * phaseMul(u.side, 'fire')), src: u });
  // Blood Lotus: she heals for 20% of the damage she deals
  if (h.dmg > 0 && set4(u, 'set:blood_lotus') && u.hp < u.maxHp) {
    const n = applyHealAmount(u, u, h.dmg * 0.2);
    if (n) { const c = board.center(u, 0.45); V.floatText('+' + Math.min(n, u.maxHp).toLocaleString('en-US'), c.x, c.y + 10, 'heal', { label: 'CRIMSON BLOOM' }); B.log.gear['CRIMSON BLOOM'] = (B.log.gear['CRIMSON BLOOM'] || 0) + 1; }
  }
  // White Tiger: her single-target hits also strike the cards beside the target for 30%
  if (o.single !== false && x.t.target === 'enemy' && set4(u, 'set:white_tiger') && h.dmg > 0) {
    for (const n of beside(tgt)) { const s = x.hit(n, power * 0.3, { splash: true, noCrit: true, small: true }); if (s) gearCallout(n, "TIGER'S POUNCE"); }
  }
  // Sword Heart: when her technique defeats an enemy, her S1 is ready again, once per turn
  if (h.killed && set4(u, 'set:sword_heart') && u.edgeRound !== B.round) {
    const s1 = u.techs.find(t => t.slot === 's1') || u.techs[0];
    if (s1 && s1.cur > 0) { s1.cur = 0; u.edgeRound = B.round; gearCallout(u, 'UNBROKEN EDGE'); board.refreshCard(u); }
  }
  // Demon-Revealing Mirror: her first hit of the battle strips buffs
  const mir = artPow(u, 'art:demon_revealing_mirror');
  if (mir && !u.mirrorDone && tgt.alive) { u.mirrorDone = true; if (dispel(tgt, Math.max(1, Math.round(2 * mir))).length) gearCallout(tgt, 'DEMON REVEALED'); }
  // Immortal-Binding Rope: a chance to Entangle on hit
  const rope = artPow(u, 'art:immortal_binding_rope');
  if (rope && tgt.alive && Math.random() < 0.2 * rope && addStatus(tgt, 'entangle', 1, { src: u })) gearCallout(tgt, 'BOUND');
}
function gearOnCast(u, t) {
  // Azure Dragon: her ultimate brings every ally's charging S2 a turn closer
  if (t.ult && set4(u, 'set:azure_dragon')) {
    let any = false;
    for (const a of allies(u)) for (const tt of a.techs) if (tt.slot === 's2' && tt.cur > 0) { tt.cur -= 1; any = true; board.refreshCard(a); }
    if (any) gearCallout(u, 'RISING DRAGON');
  }
  // Plantain Fan: her area techniques delay the enemy technique closest to ready by a turn
  if (t.target === 'allEnemies' && artPow(u, 'art:plantain_fan')) {
    const cands = foes(u).flatMap(f => f.techs.filter(tt => tt.cd > 1).map(tt => ({ f, tt }))).sort((a, b) => a.tt.cur - b.tt.cur);
    if (cands[0]) { cands[0].tt.cur += 1; board.refreshCard(cands[0].f); gearCallout(cands[0].f, 'DELAYED'); }
  }
  // Purple-Gold Gourd: the first enemy to cast an ultimate has its meridians sealed
  if (u.side === 'enemy' && t.ult && u.alive && !B.gourdDone) {
    const g = heroes().find(h => h.alive && artPow(h, 'art:purple_gold_gourd'));
    if (g) { B.gourdDone = true; if (addStatus(u, 'sealed', 2, { src: g })) gearCallout(u, 'SEALED BY THE GOURD'); }
  }
}

// ======================= player input =======================
function canAct(u) { return B.phase === 'input' && !B.busy && !B.over && u.side === 'hero' && u.alive && !u.skip; }
function validTargets(u, t) {
  if (t.target === 'self') return [u];
  if (t.target === 'enemy' || t.target === 'allEnemies') {
    let fs = foes(u);
    if (t.target === 'enemy') {
      const pv = has(u, 'provoke'); if (pv && pv.src && pv.src.alive) return [pv.src];
      const seen = fs.filter(f => !has(f, 'veil')); if (seen.length) fs = seen;
    }
    return fs;
  }
  return allies(u);
}
function selectTech(u, i) {
  const t = u.techs[i];
  if (B.pendingEnc) return;
  if (!canAct(u) || t.cur > 0 || t.blocked) { ui.techInfo(u, t); return; }
  if (B.gate && !B.gate('select', { u, t, i })) return;
  if (B.sel && B.sel.u === u && B.sel.i === i) {
    // second tap on a multi-target technique casts it; on a single-target one it keeps the
    // selection, so a double-click never undoes the first click (Cancel or an empty tap deselects)
    if (t.target !== 'enemy') return chooseTarget(validTargets(u, t)[0]);
    return;
  }
  B.sel = { u, t, i }; B.emp = false;
  ui.showSelection();
  emit('selected', { u, t, i });
}
function deselect() { B.sel = null; B.emp = false; ui.showSelection(); }
function toggleEmpower() {
  if (!B.sel || !B.sel.t.emp) return;
  if (!B.emp && B.qi < B.sel.t.emp.cost) return;
  if (B.gate && !B.gate('empower', B.sel)) return;
  B.emp = !B.emp; ui.showSelection();
  emit('empower', { on: B.emp });
}
async function chooseTarget(tgt) {
  if (B.pendingEnc) return applyPendingEncounter(tgt);
  if (!B.sel || !tgt) return;
  const { u, t } = B.sel;
  if (!validTargets(u, t).includes(tgt)) return;
  if (B.gate && !B.gate('target', { u, t, target: tgt })) return;
  const emp = B.emp;
  deselect();
  await doCast(u, t, tgt, emp);
  if (B.auto && B.phase === 'input' && !B.over) runAuto();
}
function endTurn() {
  if (B.phase !== 'input' || B.busy || B.over || !B.endTurnResolve) return;
  if (B.gate && !B.gate('endTurn')) return;
  sfx('click');
  B.phase = 'ending';
  B.endTurnResolve();
}
/** Leave the battle: it counts as a defeat. */
function forfeit() { if (!B.over) finish(false, true); }

// ======================= auto battle =======================
let autoRunning = false;
function setAuto(v) {
  B.auto = v; ui.refreshControls();
  if (v && B.phase === 'input' && !B.busy) runAuto();
}
async function runAuto() {
  if (autoRunning) return; autoRunning = true;
  try {
    deselect();
    for (let pass = 0; pass < 4 && B.auto && !B.over && B.phase === 'input'; pass++) {
      const order = chainOrder(heroes().filter(h => h.alive && !h.skip && h.techs.some(t => t.cur <= 0 && !t.blocked)));
      if (!order.length) break;
      for (const h of order) {
        if (!B.auto || B.over || B.phase !== 'input') return;
        if (!h.alive || h.skip) continue;
        const t = bestTech(h); if (!t) continue;
        const tg = autoTarget(h, t); if (!tg) continue;
        const emp = !!(t.emp && B.qi >= t.emp.cost && (t.ult ? B.qi >= t.emp.cost + 2 : B.qi >= t.emp.cost + 10));
        await doCast(h, t, tg, emp);
        await wait(150);
      }
    }
    if (B.auto && !B.over && B.phase === 'input' && B.encounter && !B.encounter.bought) await autoEncounter();
    if (B.auto && !B.over && B.phase === 'input') { await wait(250); endTurn(); }
  } finally { autoRunning = false; }
}
const isHealing = t => t.heals || (t.effects || []).some(e => e.do === 'heal' || e.do === 'cleanse');
function bestTech(h) {
  const ready = h.techs.filter(t => t.cur <= 0 && !t.blocked);
  if (!ready.length) return null;
  const hurt = allies(h).some(a => a.hp / a.maxHp < 0.72 || a.status.some(s => STATUS[s.id].debuff));
  const score = t => (t.ult ? 30 : t.cd * 5) - (t.target === 'allAllies' && isHealing(t) && !t.ult && !hurt ? 100 : 0);
  return ready.sort((a, b) => score(b) - score(a))[0];
}
function autoTarget(h, t) {
  if (t.target !== 'enemy') return validTargets(h, t)[0];
  const fs = validTargets(h, t); if (!fs.length) return null;
  const multi = t.multi;
  const sc = f => {
    let s = 0;
    const adv = advantage(h.phase, f.phase);
    s += adv > 0 ? 3 : (adv < 0 ? -2 : 0);
    s += (1 - f.hp / f.maxHp) * 2.5;
    if (f.boss) s += multi && f.qiShield && !has(f, 'shatter') ? 2.5 : 0.5;
    if (computeHit(h, f, 1).dmg > f.hp) s += 2;
    return s + Math.random() * 0.3;
  };
  return fs.sort((a, b) => sc(b) - sc(a))[0];
}
function aiTarget(e, t) {
  let hs = foes(e); if (!hs.length) return null;
  if (t.target !== 'enemy') return t.target === 'allAllies' ? allies(e)[0] : hs[0];
  const pv = has(e, 'provoke'); if (pv && pv.src && pv.src.alive) return pv.src;
  const seen = hs.filter(h => !has(h, 'veil')); if (seen.length) hs = seen;
  // the Black Tortoise array's front heroine draws single-target techniques
  const sc = h => (advantage(e.phase, h.phase) > 0 ? 2 : 0) + (1 - h.hp / h.maxHp) * 1.6 - (h.barrier > 0 ? 0.6 : 0) + Math.random() * 0.8 + ((h.targeted || 1) - 1) * 2;
  return hs.sort((a, b) => sc(b) - sc(a))[0];
}

// ======================= Fortuitous Encounters =======================
function rollOffers() {
  // later rounds bring rarer finds
  const q = B.round, pLeg = Math.min(0.3, 0.02 + 0.03 * q), pRare = Math.min(0.55, 0.15 + 0.06 * q);
  const out = [];
  let guard = 0;
  while (out.length < 3 && guard++ < 50) {
    const r = Math.random(), rar = r < pLeg ? 3 : (r < pLeg + pRare ? 2 : 1);
    const pool = ENCOUNTERS.filter(e => e.rarity === rar && !out.includes(e));
    if (pool.length) out.push(pick(pool));
  }
  return out;
}
function rerollEncounter() {
  const e = B.encounter; if (!e || e.bought || e.rerolls >= 1 || B.qi < 2) return;
  if (B.gate && !B.gate('reroll')) return;
  B.qi -= 2; ui.qiGain(-2); e.rerolls++; e.offers = rollOffers(); sfx('click'); ui.openShop();
}
async function buyEncounter(i) {
  const e = B.encounter; if (!e || e.bought || B.busy) return;
  const offr = e.offers[i]; if (!offr || B.qi < offr.cost) return;
  if (B.gate && !B.gate('buy', offr)) return;
  if (offr.target === 'none') {
    e.bought = true; B.qi -= offr.cost; ui.qiGain(-offr.cost); ui.closeShop(); B.log.encounters++;
    await applyEncounter(offr, null);
    emit('encounterDone', offr);
  } else {
    if (offr.attach && !heroes().some(h => h.alive && h.attached.includes(null))) return;
    B.pendingEnc = offr; ui.closeShop(); ui.showSelection();
    emit('encounterTarget', offr);
  }
}
function cancelPending() { B.pendingEnc = null; ui.showSelection(); }
function encounterTargets(offr) {
  if (offr.target === 'enemy') return enemies().filter(x => x.alive);
  return heroes().filter(h => h.alive && (!offr.attach || h.attached.includes(null)));
}
async function applyPendingEncounter(tgt) {
  const offr = B.pendingEnc; if (!offr || !tgt || !encounterTargets(offr).includes(tgt)) return;
  B.pendingEnc = null; B.encounter.bought = true; B.qi -= offr.cost; ui.qiGain(-offr.cost); ui.showSelection(); B.log.encounters++;
  await applyEncounter(offr, tgt);
  emit('encounterDone', offr);
}
async function applyEncounter(offr, tgt) {
  B.busy = true; ui.lock();
  sfx('charge');
  const strongest = [...heroes()].filter(h => h.alive).sort((a, b) => b.atk - a.atk)[0];
  switch (offr.id) {
    case 'thunder_tal': {
      V.flash('#c58bff', 0.3); sfx('thunder');
      for (const f of enemies().filter(x => x.alive)) {
        const c = board.center(f);
        V.bolt({ x0: c.x + rand(-60, 60), y0: -40, x1: c.x, y1: c.y, color: 'violet', width: 5, dur: 380, branches: 3 });
        V.fx('thunder_burst', { x: c.x, y: c.y, w: 320, dur: 460 });
        const h = applyDamage(strongest, f, 0.9, { phase: 'wood', noCrit: true });
        if (h) { V.floatText(h.dmg.toLocaleString('en-US'), c.x, c.y - 20, 'dmg', { label: 'THUNDER TALISMAN' }); board.hitCard(f, { power: 0.9 }); if (h.killed) killUnit(f); }
        await wait(140);
      }
      V.shake(10, 300); break;
    }
    case 'frost_tal': {
      const c = board.center(tgt); sfx('ice');
      V.fx('ice_sigil', { x: c.x, y: c.y, w: 300, dur: 700, back: true }); V.fx('ice_burst', { x: c.x, y: c.y, w: 280, dur: 500 });
      addStatus(tgt, 'frost', 1); V.floatText('FROST SEAL', c.x, c.y - 40, 'info'); board.hitCard(tgt, { power: 0.6, color: '#bfe6ff' }); break;
    }
    case 'qi_pill':
      sfx('heal');
      for (const h of heroes().filter(x => x.alive)) { const c = board.center(h); V.fx('heal_burst', { x: c.x, y: c.y, w: 260, dur: 700 }); const amt = applyHealAmount(h, h, h.maxHp * 0.2); if (amt) V.floatText('+' + amt.toLocaleString('en-US'), c.x, c.y, 'heal'); }
      break;
    case 'gather_array': B.gather += 1; V.floatText('+2 SPIRIT QI EACH TURN', board.geo.W / 2, board.geo.heroY - 20, 'info'); break;
    case 'mark_tal':
      for (const f of enemies().filter(x => x.alive)) { const c = board.center(f); V.fx('curse_sigil', { x: c.x, y: c.y, w: 260, dur: 700, back: true }); addStatus(f, 'mark', 2); }
      break;
    case 'heaven_pill': {
      for (const t of tgt.techs) t.cur = 0;
      const c = board.center(tgt); V.beam({ x: c.x, y: c.y + 150, w: 160, h: 520, color: 'gold', dur: 900 }); V.floatText('ALL TECHNIQUES READY', c.x, c.y - 50, 'info'); sfx('heal');
      break;
    }
    default: { // attachments
      const k = tgt.attached.indexOf(null); if (k >= 0) tgt.attached[k] = offr;
      const c = board.center(tgt); V.ring({ x: c.x, y: c.y, r0: 30, r1: 200, color: 'gold', width: 10, dur: 600 });
      V.emitP('glow', c.x, c.y, 14, { color: 'gold', speed: [40, 160], spread: 60 });
      V.floatText(offr.name.toUpperCase(), c.x, c.y - 40, 'info');
    }
  }
  await wait(450);
  B.busy = false;
  ui.refreshAll();
  await checkEnd();
}
async function autoEncounter() {
  const e = B.encounter;
  const ok = e.offers.map((o, i) => [o, i]).filter(([o]) => B.qi >= o.cost + 2 && (!o.attach || heroes().some(h => h.alive && h.attached.includes(null))));
  if (!ok.length) return;
  const [o, i] = ok.sort((a, b) => b[0].rarity - a[0].rarity)[0];
  await buyEncounter(i);
  if (B.pendingEnc) {
    const ts = encounterTargets(o);
    const tg = o.target === 'enemy' ? ts.sort((a, b) => b.hp - a.hp)[0] : ts.sort((a, b) => b.atk - a.atk)[0];
    await chooseTarget(tg);
  }
}

// ======================= end conditions =======================
let ending = false;
async function checkEnd() {
  if (B.over) return true;
  if (!heroes().some(h => h.alive)) { await finish(false); return true; }
  if (!enemies().some(e => e.alive) && !ending) {
    ending = true;
    try {
      await wait(700);
      if (B.wave + 1 < B.def.waves.length) {
        deselect(); B.pendingEnc = null;
        await spawnWave(B.wave + 1);
      } else { await finish(true); return true; }
    } finally { ending = false; }
  }
  return false;
}
async function finish(win, retreat = false) {
  if (B.over) return;
  B.over = true; B.result = win ? 'win' : 'lose'; B.phase = 'over';
  deselect();
  if (B.endTurnResolve) B.endTurnResolve();
  if (!retreat) {
    await wait(600);
    sfx(win ? 'win' : 'lose');
    if (win) { slowMo(0.4, 500); for (const h of heroes().filter(x => x.alive)) board.lift(h, true, 300); }
    await wait(win ? 1100 : 700);
  }
  emit(win ? 'victory' : 'defeat');
  const res = {
    win, retreat, rounds: B.round, log: { ...B.log, maxChain: B.maxChain },
    heroes: heroes().map(h => ({ id: h.id, alive: h.alive, dmg: Math.round(h.stats.dmg), heal: Math.round(h.stats.heal), taken: Math.round(h.stats.taken) })),
  };
  const r = B.resolve; B.resolve = null;
  if (r) r(res);
}

// ===== ui =====
// Interface: side panels, Harmony track, technique panel, banners, cut-ins, encounter shop,
// card details, tooltips, results. Builds its own DOM inside the scaled #stage.

const $ = (s, r = document) => r.querySelector(s);
const fmt = n => Math.round(n).toLocaleString('en-US');
const TARGET_TXT = { enemy: 'One enemy', allEnemies: 'All enemies', ally: 'One ally', allAllies: 'All allies', self: 'Self' };
const glyphIcon = t => t.icon.startsWith('g:') ? `<span class="glyph">${t.icon.slice(2)}</span>` : `<img src="assets/ui/${t.icon}.webp" alt="">`;
const LOTUS = `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="currentColor"><path d="M32 6c6 8 8 17 0 30C24 23 26 14 32 6z"/><path d="M10 22c10 0 17 5 21 15-11 2-19-3-21-15z" opacity=".85"/><path d="M54 22c-10 0-17 5-21 15 11 2 19-3 21-15z" opacity=".85"/><path d="M4 38c11-4 21-1 28 7-12 6-22 3-28-7z" opacity=".7"/><path d="M60 38c-11-4-21-1-28 7 12 6 22 3 28-7z" opacity=".7"/></g></svg>`;

const CYCLE_SVG = (() => {
  const cx = 105, cy = 80, R = 58, nodes = [['火', '#ff8048', -90], ['土', '#e4b45a', -18], ['金', '#efe6c8', 54], ['水', '#7cc6ff', 126], ['木', '#86e38f', 198]];
  const pos = nodes.map(([g, c, a]) => [g, c, cx + Math.cos(a * Math.PI / 180) * R, cy + Math.sin(a * Math.PI / 180) * R]);
  const arc = (i) => { const a0 = (nodes[i][2] + 15) * Math.PI / 180, a1 = (nodes[(i + 1) % 5][2] - 15) * Math.PI / 180; return `<path d="M${cx + Math.cos(a0) * R} ${cy + Math.sin(a0) * R} A${R} ${R} 0 0 1 ${cx + Math.cos(a1) * R} ${cy + Math.sin(a1) * R}" stroke="#e8c77d" stroke-width="2" fill="none" marker-end="url(#ga)"/>`; };
  const star = (i) => { const a = pos[i], b = pos[(i + 2) % 5], dx = b[2] - a[2], dy = b[3] - a[3], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L; return `<line x1="${a[2] + ux * 16}" y1="${a[3] + uy * 16}" x2="${b[2] - ux * 18}" y2="${b[3] - uy * 18}" stroke="#ff7a8a" stroke-width="1.6" stroke-dasharray="4 3" marker-end="url(#oa)"/>`; };
  return `<svg viewBox="0 0 210 160"><defs><marker id="ga" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#e8c77d"/></marker><marker id="oa" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#ff7a8a"/></marker></defs>
    ${[0, 1, 2, 3, 4].map(arc).join('')}${[0, 1, 2, 3, 4].map(star).join('')}
    ${pos.map(([g, c, x, y]) => `<circle cx="${x}" cy="${y}" r="15" fill="${c}" stroke="#fff3c4" stroke-width="1.5"/><text x="${x}" y="${y + 6}" text-anchor="middle" font-family="Noto Serif SC, serif" font-weight="900" font-size="16" fill="#10141c">${g}</text>`).join('')}
    <text x="6" y="157" text-anchor="start" font-family="Cinzel, serif" font-size="10.5" fill="#e8c77d">— feeds</text><text x="204" y="157" text-anchor="end" font-family="Cinzel, serif" font-size="10.5" fill="#ff7a8a">overcomes - -</text></svg>`;
})();

const ui = {
  stage: null, boardEl: null,
  init(stage) {
    this.stage = stage;
    stage.insertAdjacentHTML('beforeend', `
      <div id="bg"><div class="bg-img"></div><div class="bg-shade"></div><div class="bg-table"></div></div>
      <div id="mid"><div id="chain"></div></div>
      <div id="lp">
        <div class="side side-enemy">
          <div class="side-title"><span id="side-name">Enemies</span><em id="wave">Wave 1/2</em></div>
          <div class="pool" id="pool-enemy"></div>
          <div class="cyc-ref"><div class="cyc-t">Five Phases</div>${CYCLE_SVG}</div>
        </div>
        <div class="side side-hero">
          <div class="qi-box" id="qi-box"><div class="qi-ic">${LOTUS}</div><div><b id="qi">0</b><small>Spirit Qi</small></div><i id="qi-pop"></i></div>
          <div class="pool-title">Phase Qi <small>+8% per point</small></div>
          <div class="pool" id="pool-hero"></div>
        </div>
      </div>
      <div id="rp">
        <div class="ctls">
          <button class="ctl" id="b-help" aria-label="How to play">?</button>
          <button class="ctl" id="b-auto">Auto</button>
          <button class="ctl" id="b-speed">×1</button>
          <button class="ctl" id="b-sound" aria-label="Sound"><svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg></button>
          <button class="ctl" id="b-restart" aria-label="Retreat" title="Retreat">⚑</button>
        </div>
        <div class="seal" id="seal"><small>Round</small><b id="round">1</b><span id="whose">Your turn</span></div>
        <div id="techcard"></div>
        <button id="b-enc" class="enc"><span class="g">奇遇</span><span>Encounter</span></button>
        <button id="b-end" class="endturn"><span>End Turn</span></button>
      </div>
      <div id="world"><canvas id="fxb"></canvas><div id="board"></div><canvas id="fxf"></canvas></div>
      <div id="turnban"></div>
      <div id="banner"></div>
      <div id="cutin"></div>
      <div id="tip"></div>
      <div id="shop" class="modal"></div>
      <div id="detail" class="modal"></div>
      <div id="result" class="modal"></div>
      <div id="tut"></div>`);
    this.boardEl = $('#board', stage);
    this.bind();
  },

  bind() {
    const st = this.stage;
    st.addEventListener('click', e => {
      if (BT.B.gate && !e.target.closest('#tut .tut-tip') && !BT.B.gate('click', e)) { e.stopPropagation(); e.preventDefault(); return; }
      const tb = e.target.closest('.tech');
      const card = e.target.closest('.card');
      if (tb && card) {
        const u = BT.getUnit(card.dataset.uid), i = +tb.dataset.i;
        if (u.side === 'hero' && !BT.B.pendingEnc && !(BT.B.sel && validTarget(card))) { BT.selectTech(u, i); return; }
        if (u.side === 'enemy' && !(BT.B.sel || BT.B.pendingEnc)) { this.techInfo(u, u.techs[i], tb); return; }
      }
      if (card) {
        const u = BT.getUnit(card.dataset.uid);
        if ((BT.B.sel || BT.B.pendingEnc) && card.classList.contains('targetable')) { sfx('click'); BT.chooseTarget(u); return; }
        if (!BT.B.sel && !BT.B.pendingEnc) { if (BT.B.gate && !BT.B.gate('detail', u)) return; this.openDetail(u); return; }
        return;
      }
      if (e.target.closest('#b-end')) { BT.endTurn(); return; }
      if (e.target.closest('#b-enc')) { this.openShop(); return; }
      if (e.target.closest('#b-auto')) { BT.setAuto(!BT.B.auto); sfx('click'); return; }
      if (e.target.closest('#b-speed')) { clock.speed = clock.speed >= 3 ? 1 : clock.speed + 1; document.documentElement.style.setProperty('--spd', clock.speed); this.refreshControls(); sfx('click'); return; }
      if (e.target.closest('#b-sound')) { audio.muted = !audio.muted; this.refreshControls(); return; }
      if (e.target.closest('#b-restart')) { this.onRetreat && this.onRetreat(); return; }
      if (e.target.closest('#b-help')) { this.onHelp && this.onHelp(); return; }
      if (e.target.closest('.emp-btn')) { BT.toggleEmpower(); sfx('click'); return; }
      if (e.target.closest('.tc-cancel')) { if (BT.B.pendingEnc) BT.cancelPending(); else BT.deselect(); return; }
      if (e.target.closest('.offer .buy')) { BT.buyEncounter(+e.target.closest('.offer').dataset.i); return; }
      if (e.target.closest('#shop .reroll')) { BT.rerollEncounter(); return; }
      if (e.target.closest('#shop .leave') || e.target.id === 'shop') { this.closeShop(); return; }
      if (e.target.closest('#detail')) { this.closeDetail(); return; }
      if (!e.target.closest('#rp') && !e.target.closest('#lp') && (BT.B.sel)) BT.deselect();
    }, true);
    board.bindTilt(st, uid => BT.getUnit(uid));
  },

  resetBattle(def) {
    $('#result').classList.remove('show'); this.closeShop(); this.closeDetail();
    if (def) { $('#side-name').textContent = def.side || 'Enemies'; $('.bg-img', this.stage).style.backgroundImage = def.bg ? `url(${def.bg})` : ''; }
    this.refreshAll(); this.showChain();
  },

  // ---------------- panels ----------------
  refreshAll() {
    const B = BT.B; if (!B.points.hero) return;
    for (const u of B.units) board.refreshCard(u);
    $('#qi').textContent = B.qi;
    this.renderPool('hero'); this.renderPool('enemy');
    $('#round').textContent = B.round;
    const enc = $('#b-enc');
    enc.classList.toggle('show', !!B.encounter && B.side === 'hero' && !B.over);
    enc.classList.toggle('used', !!(B.encounter && B.encounter.bought));
    enc.classList.toggle('glow', !!(B.encounter && !B.encounter.bought));
    const canEnd = B.phase === 'input' && !B.busy && !B.over;
    $('#b-end').classList.toggle('disabled', !canEnd);
    const anyReady = BT.heroes().some(h => h.alive && !h.skip && h.techs.some(t => t.cur <= 0));
    $('#b-end').classList.toggle('pulse', canEnd && !anyReady);
    for (const u of B.units) u.el && u.el.classList.toggle('can-act', B.side === 'hero' && B.phase === 'input' && u.side === 'hero' && u.alive && !u.skip && u.techs.some(t => t.cur <= 0));
    this.showSelection();
    this.refreshControls();
  },
  renderPool(side) {
    const B = BT.B, el = $(`#pool-${side}`);
    const keys = side === 'hero' ? CYCLE : [...CYCLE, 'yin'];
    el.innerHTML = keys.map(k => {
      const p = PHASES[k], n = B.points[side][k] || 0;
      return `<div class="orb${n ? ' on' : ''}" data-ph="${k}" style="--pc:${p.color}" title="${p.name}: +${n * 8}% ${p.name} damage and healing"><i>${p.glyph}</i><b>${n}</b>${side === 'hero' ? `<small>+${n * 8}%</small>` : ''}</div>`;
    }).join('');
  },
  waveInfo(i, n) { $('#wave').textContent = i + 1 === n ? 'Boss wave' : `Wave ${i + 1}/${n}`; },
  setTurn(side) {
    const s = $('#seal'); s.classList.toggle('enemy', side === 'enemy');
    $('#whose').textContent = side === 'hero' ? 'Your turn' : 'Enemy turn';
    $('#round').textContent = BT.B.round;
    this.refreshAll();
  },
  refreshControls() {
    $('#b-auto').classList.toggle('on', BT.B.auto);
    $('#b-speed').textContent = '×' + clock.speed;
    $('#b-sound').classList.toggle('off', audio.muted);
  },
  lock() { this.refreshAll(); },
  qiGain(n) {
    $('#qi').textContent = BT.B.qi;
    const p = $('#qi-pop'); p.textContent = (n > 0 ? '+' : '') + n; p.className = n > 0 ? 'up' : 'down';
    void p.offsetWidth; p.classList.add('go');
    $('#qi-box').classList.remove('bump'); void $('#qi-box').offsetWidth; $('#qi-box').classList.add('bump');
  },
  stagePos(el) {
    const r = el.getBoundingClientRect(), sr = this.stage.getBoundingClientRect(), s = V.view.s;
    return { x: (r.left + r.width / 2 - sr.left) / s, y: (r.top + r.height / 2 - sr.top) / s };
  },
  pointFly(u, phase, n, quiet) {
    const orbEl = $(`#pool-${u.side} .orb[data-ph="${phase}"]`);
    if (!orbEl || !u.el) { this.renderPool(u.side); return; }
    const a = board.center(u, 0.3), b = this.stagePos(orbEl);
    V.orb({ x0: a.x, y0: a.y, x1: b.x, y1: b.y, color: PHASES[phase].col, dur: quiet ? 500 : 650, size: 14 + n * 4 });
    wait(quiet ? 500 : 650).then(() => {
      this.renderPool(u.side);
      const o = $(`#pool-${u.side} .orb[data-ph="${phase}"]`);
      if (o) { o.classList.add('bump'); }
      V.emitP('glow', b.x, b.y, 6, { color: PHASES[phase].col, speed: [30, 120], life: [300, 600] });
    });
  },
  showChain() {
    const c = BT.B.chain, el = $('#chain');
    const list = c.list || [];
    if (!list.length) { this._chainN = 0; el.className = 'idle'; el.innerHTML = `<span class="lbl">Harmony</span>${CYCLE.map((p, i) => `<i style="--pc:${PHASES[p].color}">${PHASES[p].glyph}</i>${i < 4 ? '<em>›</em>' : ''}`).join('')}`; return; }
    el.className = `live ${BT.B.side}`;
    const prevN = this._chainN;
    const mult = Math.round(RULES.harmonyStep * (Math.min(c.len, RULES.harmonyCap) - 1) * 100);
    el.innerHTML = `<span class="lbl">Harmony ×${c.len}</span>${list.map((p, i) => `<i class="lit${i === list.length - 1 && this._chainN !== list.length ? ' new' : ''}" style="--pc:${PHASES[p].color}">${PHASES[p].glyph}</i>${i < list.length - 1 ? '<em>›</em>' : ''}`).join('')}${c.len < 5 ? `<em>›</em><i class="next" style="--pc:${PHASES[GEN[c.last]].color}">${PHASES[GEN[c.last]].glyph}</i>` : ''}<span class="mul">${mult ? `+${mult}%` : 'start'}</span>`;
    this._chainN = list.length; void prevN;
  },
  harmonyBurst() {
    const g = board.geo;
    V.flash('#ffe8a8', 0.25); sfx('win');
    V.floatText('FIVE PHASES HARMONY', g.W / 2, g.heroY - 26, 'big', { label: '+2 SPIRIT QI' });
    V.rays({ x: g.W / 2, y: g.heroY - 26, color: 'gold', len: 600, dur: 1400, alpha: 0.45 });
  },

  // ---------------- selection & technique panel ----------------
  showSelection() {
    const B = BT.B, tc = $('#techcard');
    for (const u of B.units) if (u.el) {
      u.el.classList.remove('targetable', 'selected', 'dimmed');
      u.el.querySelectorAll('.tech').forEach(b => b.classList.remove('sel'));
      const adv = u.el.querySelector('.c-adv'); adv.className = 'c-adv'; adv.textContent = '';
    }
    if (B.pendingEnc) {
      const ts = BT.encounterTargets(B.pendingEnc);
      for (const u of B.units) if (u.el && u.alive) u.el.classList.add(ts.includes(u) ? 'targetable' : 'dimmed');
      tc.className = 'show'; tc.innerHTML = `<div class="tc-h"><span class="tc-ic glyph r${B.pendingEnc.rarity}">${B.pendingEnc.glyph}</span><div><b>${B.pendingEnc.name}</b><small>${B.pendingEnc.kind} · ${B.pendingEnc.cost} Spirit Qi</small></div></div><p>${B.pendingEnc.desc}</p><div class="tc-hint">Choose ${B.pendingEnc.target === 'enemy' ? 'an enemy' : 'a heroine'}</div><button class="tc-cancel">Cancel</button>`;
      return;
    }
    if (!B.sel) {
      const hint = B.phase === 'input' && !B.over ? (B.auto ? 'Auto battle is playing your turn.' : 'Tap a glowing technique on one of your cards.') : (B.side === 'enemy' ? 'The enemy is acting…' : '');
      tc.className = 'hint'; tc.innerHTML = hint ? `<div class="tc-hint">${hint}</div>` : '';
      return;
    }
    const { u, t, i } = B.sel;
    u.el.classList.add('selected');
    u.el.querySelectorAll('.tech')[i].classList.add('sel');
    const ts = BT.validTargets(u, t);
    for (const x of B.units) if (x.el && x.alive && x !== u) x.el.classList.add(ts.includes(x) ? 'targetable' : 'dimmed');
    if (ts.includes(u)) u.el.classList.add('targetable');
    if (t.target === 'enemy' || t.target === 'allEnemies') for (const f of ts) {
      const a = BT.advantage(u.phase, f.phase), el = f.el.querySelector('.c-adv');
      if (a > 0) { el.className = 'c-adv good'; el.innerHTML = `<b>▲</b>${PHASES[u.phase].glyph} overcomes ${PHASES[f.phase].glyph}`; }
      else if (a < 0) { el.className = 'c-adv bad'; el.innerHTML = `<b>▼</b>${PHASES[f.phase].glyph} overcomes ${PHASES[u.phase].glyph}`; }
    }
    const c = B.chain, cont = c.last && GEN[c.last] === u.phase && c.last !== u.phase;
    const nextLen = cont ? c.len + 1 : 1;
    const canEmp = t.emp && (B.emp || B.qi >= t.emp.cost);
    tc.className = 'show';
    tc.innerHTML = `
      <div class="tc-h"><span class="tc-ic">${glyphIcon(t)}</span><div><b>${t.name}</b><small>${t.ult ? 'Ultimate · ' : ''}Cooldown ${t.cd} · ${TARGET_TXT[t.target]}</small></div></div>
      <p>${t.desc}</p>
      ${nextLen > 1 ? `<div class="tc-harm">Harmony ×${nextLen}: +${Math.round((Math.min(nextLen, RULES.harmonyCap) - 1) * RULES.harmonyStep * 100)}% (${PHASES[c.last].glyph} feeds ${PHASES[u.phase].glyph})</div>` : (c.len ? `<div class="tc-harm off">Breaks the Harmony chain (${PHASES[GEN[c.last]].glyph} would continue it)</div>` : '')}
      ${t.emp ? `<button class="emp-btn${B.emp ? ' on' : ''}${canEmp ? '' : ' no'}"><span>✦ Empower</span><em>${t.emp.cost} Spirit Qi</em><small>${t.emp.desc}</small></button>` : ''}
      <div class="tc-hint">${t.target === 'enemy' ? 'Tap an enemy' : (t.target === 'allEnemies' ? 'Tap any enemy, or the technique again' : (t.target === 'self' ? 'Tap her card, or the technique again' : 'Tap any ally, or the technique again'))}</div>
      <button class="tc-cancel">Cancel</button>`;
  },
  techInfo(u, t, btn) {
    const tip = $('#tip');
    const ready = t.cur <= 0;
    tip.innerHTML = `<b>${t.name}</b><small>${t.ult ? 'Ultimate · ' : ''}Cooldown ${t.cd} · ${TARGET_TXT[t.target]} · ${ready ? 'ready' : `ready in ${t.cur} turn${t.cur > 1 ? 's' : ''}`}</small><p>${t.desc}</p>`;
    const el = btn || u.el.querySelectorAll('.tech')[u.techs.indexOf(t)];
    const p = this.stagePos(el);
    tip.style.left = Math.max(170, Math.min(V.view.W - 170, p.x)) + 'px';
    tip.style.top = (u.side === 'enemy' ? p.y + 40 : p.y - 40) + 'px';
    tip.className = 'show ' + (u.side === 'enemy' ? 'below' : 'above');
    clearTimeout(this._tipT); this._tipT = setTimeout(() => tip.className = '', 3200);
  },
  castBanner(u, t, emp, hm) {
    const tc = $('#techcard'), B = BT.B;
    tc.className = 'show cast ' + u.side;
    tc.innerHTML = `<div class="tc-who">${u.name}${u.side === 'enemy' ? ' casts' : ''}</div>
      <div class="tc-h"><span class="tc-ic">${glyphIcon(t)}</span><div><b>${t.name}</b><small>${emp ? '✦ Empowered · ' : ''}${t.ult ? 'Ultimate · ' : ''}${TARGET_TXT[t.target]}</small></div></div>
      ${B.chain.len > 1 ? `<div class="tc-harm">Harmony ×${B.chain.len}: +${Math.round((hm - 1) * 100)}%</div>` : ''}
      <p>${t.desc}</p>`;
  },

  // ---------------- banners & cut-ins ----------------
  async turnBanner(title, sub, side) {
    const b = $('#turnban');
    b.className = side; b.innerHTML = `<div><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
    void b.offsetWidth; b.classList.add('show'); sfx('turn');
    await wait(820); b.classList.add('out'); await wait(260); b.className = '';
  },
  async banner(title, sub, kind = '') {
    const b = $('#banner');
    b.className = kind; b.innerHTML = `<b>${title}</b>${sub ? `<small>${sub}</small>` : ''}`;
    void b.offsetWidth; b.classList.add('show');
    await wait(1250); b.classList.add('out'); await wait(380); b.className = '';
  },
  async cutin(u, t, emp, enemy = false) {
    const c = $('#cutin'), ph = PHASES[u.phase];
    c.style.setProperty('--el', ph.color);
    const art = enemy || !u.cutin ? `assets/cards/${u.art}.webp` : `assets/ui/${u.cutin}.webp`;
    c.className = enemy ? 'enemy' : '';
    c.innerHTML = `<div class="ci-wash"></div><div class="ci-lines"></div>
      <div class="ci-band ci-back"></div>
      <div class="ci-band ci-main"><div class="ci-art" style="background-image:url(${art})"></div><div class="ci-shine"></div></div>
      <div class="ci-text"><small>${u.name}${emp ? ' · ✦ Empowered' : ''}</small><b>${t.name}</b><i>${ph.glyph}</i></div>
      <div class="ci-flash"></div>`;
    void c.offsetWidth; c.classList.add('show');
    sfx('ult');
    await wait(1100);
    c.classList.add('out');
    await wait(280);
    c.className = '';
  },
  killFx(u) {
    const c = board.center(u);
    sfx('shatter');
    V.emitP('shard', c.x, c.y, 18, { color: PHASES[u.phase].col, speed: [160, 520] });
    V.emitP('wisp', c.x, c.y, 14, { color: u.side === 'enemy' ? 'violet' : 'white', speed: [30, 160], rect: [180, 260], life: [600, 1200] });
    V.emitP('smoke', c.x, c.y + 40, 6, { speed: [20, 80], spread: 60 });
    u.el.classList.add('dying');
    if (u.side === 'enemy') {
      board.tweenCard(u, { s: 0.86, y: -20 }, 700);
      wait(720).then(() => { u.el.classList.add('gone'); });
    }
  },
  reviveFx(u) {
    u.el.classList.remove('dying', 'dead', 'gone');
    const c = board.center(u);
    V.beam({ x: c.x, y: c.y + 160, w: 180, h: 560, color: 'gold', dur: 1000 });
    V.emitP('petal', c.x, c.y, 14, { color: 'gold', speed: [40, 180], up: 80, spread: 60 });
    V.floatText('REVIVED', c.x, c.y - 40, 'big');
    board.refreshCard(u);
  },

  // ---------------- encounter shop ----------------
  openShop() {
    const B = BT.B, e = B.encounter;
    if (!e || B.side !== 'hero' || B.phase !== 'input' || B.busy) return;
    if (B.gate && !B.gate('openShop')) return;
    BT.deselect();
    const s = $('#shop');
    const R = ['', 'Common', 'Rare', 'Legendary'];
    s.innerHTML = `<div class="shop-box" onclick="event.stopPropagation()">
      <div class="shop-h"><span class="g">奇遇</span><div><b>Fortuitous Encounter</b><small>Later rounds bring rarer finds</small></div></div>
      <div class="offers">${e.offers.map((o, i) => `
        <div class="offer r${o.rarity}${e.bought ? ' sold' : ''}" data-i="${i}">
          <div class="o-rar">${R[o.rarity]} · ${o.kind}</div>
          <div class="o-g">${o.glyph}</div>
          <b>${o.name}</b>
          <p>${o.desc}</p>
          <button class="buy${B.qi < o.cost || e.bought ? ' no' : ''}">${LOTUS}<span>${o.cost}</span></button>
        </div>`).join('')}</div>
      <div class="shop-f"><span class="have">${LOTUS} ${B.qi} Spirit Qi</span>
        <button class="reroll${e.rerolls >= 1 || B.qi < 2 || e.bought ? ' no' : ''}">Reroll · 2</button>
        <button class="leave">${e.bought ? 'Close' : 'Leave'}</button></div>
    </div>`;
    s.classList.add('show');
    BT.emit('shopOpen');
  },
  closeShop() { const s = $('#shop'); if (s && s.classList.contains('show')) { s.classList.remove('show'); BT.emit('shopClose'); } },

  // ---------------- card details ----------------
  openDetail(u) {
    const d = $('#detail'), ph = PHASES[u.phase];
    const hero = null;
    d.innerHTML = `<div class="det-box" style="--ph:${ph.color}">
      <div class="det-art" style="background-image:url(assets/cards/${u.art}.webp)"></div>
      <div class="det-info">
        <div class="det-h"><span class="det-ph">${ph.glyph}</span><div><b>${u.name}</b><small>${u.title || ''}${u.pathName ? ` · ${u.pathName}` : ''} · ${ph.name} · Level ${u.lvl}</small></div></div>
        <div class="det-stats"><span>Health <b>${fmt(u.hp)} / ${fmt(u.maxHp)}</b></span><span>Attack <b>${fmt(u.atk)}</b></span><span>Defense <b>${fmt(u.defense)}</b></span><span>Critical <b>${Math.round(u.crit * 100)}%</b></span></div>
        <div class="det-cyc">${ph.name} feeds <b style="color:${PHASES[GEN[u.phase]]?.color}">${PHASES[GEN[u.phase]]?.name}</b>${OVER[u.phase] ? ` · overcomes <b style="color:${PHASES[OVER[u.phase]].color}">${PHASES[OVER[u.phase]].name}</b>` : ' · neutral to the five phases'}</div>
        ${u.techs.map(t => `<div class="det-t"><span class="tc-ic">${glyphIcon(t)}</span><div><b>${t.name}</b> <small>${t.ult ? 'Ultimate · ' : ''}CD ${t.cd} · ${TARGET_TXT[t.target]}${t.cur > 0 ? ` · ready in ${t.cur}` : ' · ready'}</small><p>${t.desc}</p>${t.emp ? `<p class="emp">✦ Empowered (${t.emp.cost} Spirit Qi): ${t.emp.desc}</p>` : ''}</div></div>`).join('')}
        ${u.status.length ? `<div class="det-st">${u.status.map(s => `<span style="--sc:${STATUS[s.id].color}"><i>${STATUS[s.id].glyph}</i>${STATUS[s.id].name} (${s.turns}): ${STATUS[s.id].desc}</span>`).join('')}</div>` : ''}
        ${u.attached && u.attached.some(Boolean) ? `<div class="det-st">${u.attached.filter(Boolean).map(a => `<span><i>${a.glyph}</i>${a.name}: ${a.desc}</span>`).join('')}</div>` : ''}
        ${u.qiShield ? `<div class="det-st"><span><i>盾</i>Qi shield ${u.qiShield.cur}/${u.qiShield.max}: every hit breaks a segment, and it refills after its turn. At zero it is Shattered: +30% damage taken until its turn ends, and its ultimate is delayed by 1 turn.</span></div>` : ''}
        <div class="det-close">Tap anywhere to close</div>
      </div></div>`;
    d.classList.add('show');
  },
  closeDetail() { $('#detail').classList.remove('show'); },

  // ---------------- results ----------------
  resultOld(win) {
    const B = BT.B, r = $('#result');
    const hs = BT.heroes();
    const mvp = [...hs].sort((a, b) => (b.stats.dmg + b.stats.heal * 1.2) - (a.stats.dmg + a.stats.heal * 1.2))[0];
    r.className = 'modal show ' + (win ? 'win' : 'lose');
    r.innerHTML = `<div class="res-box">
      <div class="res-title">${win ? 'Victory' : 'Defeat'}</div>
      <div class="res-sub">${win ? 'The Netherflame Matriarch is banished.' : 'Your Blossoms have fallen…'} · ${B.round} rounds · longest Harmony ×${B.maxChain}</div>
      <div class="res-list">${hs.map(h => `<div class="res-h ${h === mvp ? 'mvp' : ''} ${h.alive ? '' : 'dead'}"><img src="assets/ui/${h.face}.webp" alt=""><div><b>${h.name}${h === mvp ? ' <i>MVP</i>' : ''}</b><span>Damage ${fmt(h.stats.dmg)}${h.stats.heal ? ' · Healing ' + fmt(h.stats.heal) : ''}</span></div></div>`).join('')}</div>
      <div class="res-btns"><button class="gold-btn again">${win ? 'Play again' : 'Try again'}</button><button class="ghost-btn tut-again">Replay tutorial</button></div>
    </div>`;
  },
};

function validTarget(card) { return card.classList.contains('targetable'); }


// ===== tutorial =====
// Guided first battle: spotlight + Tao Yao tooltips, gated actions, event-driven steps.

const ph = (g, c) => `<span class="ph" style="color:${c}">${g}</span>`;
const W_ = ph('水', '#7cc6ff'), WD = ph('木', '#86e38f'), F_ = ph('火', '#ff8048'), E_ = ph('土', '#e4b45a'), M_ = ph('金', '#efe6c8');

let active = false, idx = -1, unsub = [], hidden = false, extraQueue = [], current = null, seen = {};
const hero = k => BT.heroes().find(h => h.key === k);
const foe = k => BT.enemies().find(e => e.key === k);
const techBtn = (k, i) => hero(k) && hero(k).el.querySelectorAll('.tech')[i];
const cardEl = u => u && u.el;



// ---------------- steps ----------------
const STEPS = [
  { id: 'welcome', text: `Welcome to the Hundred Blossoms Pavilion! I'm <b>Tao Yao</b>. Let me show you how Blossoms fight. It only takes one turn.` },
  { id: 'heroes', target: () => BT.heroes().map(cardEl), place: 'above', text: `These are your four <b>Blossoms</b>. Each card shows her <b>phase</b> (top left), her <b>health</b> and three <b>techniques</b>.` },
  { id: 'enemies', target: () => BT.enemies().map(cardEl), place: 'below', text: `The <b>Netherflame Sect</b>. Destroy every enemy card to win. Two waves of wraiths stand in this dream.` },
  { id: 'rings', target: () => hero('ling').el.querySelector('.c-techs'), place: 'above', text: `Glowing techniques are <b>ready</b>. A number in the ring counts the turns until it is ready again. Each turn you may cast <b>every</b> ready technique, in any order.` },
  { id: 'cycle', target: () => $('#chain'), place: 'below', cycle: true, text: `Everything follows the <b>Five Phases</b>. Gold arrows: each phase <b>feeds</b> the next. Red arrows: each phase <b>overcomes</b> another for +30% damage.` },
  { id: 'ling', target: () => techBtn('ling', 0), place: 'above', arrow: true, wait: 'selected', allowEls: () => [techBtn('ling', 0)], allow: (a, p) => a !== 'select' || p.t.chor === 'ling_s1',
    text: `Ling Shuang is ${W_} <b>Water</b>, and Water overcomes ${F_} Fire. Tap her <b>Frost Crescent</b>.` },
  { id: 'ling-t', needSel: ['ling', 0], target: () => cardEl(foe('ember_wraith')), place: 'below', arrow: true, wait: 'cast', allowEls: () => [cardEl(foe('ember_wraith'))], allow: (a, p) => a !== 'target' || p.target.key === 'ember_wraith',
    text: `The green tag on the <b>Ember Wraith</b> means ${W_} Water overcomes ${F_} Fire: +30% damage. Tap the wraith to strike.` },
  { id: 'mo', target: () => [techBtn('mo', 0), $('#chain')], place: 'above', arrow: true, wait: 'selected', allowEls: () => [techBtn('mo', 0)], allow: (a, p) => a !== 'select' || p.t.chor === 'mo_s1',
    text: `${W_} Water feeds ${WD} Wood. Casting <b>Mo Yingyue</b> next continues the <b>Harmony chain</b>: +15% per link. Tap her <b>Thunderfang Cross</b>.` },
  { id: 'mo-t', needSel: ['mo', 0], target: () => cardEl(foe('mire_wraith')), place: 'below', arrow: true, wait: 'cast', allowEls: () => [cardEl(foe('mire_wraith'))], allow: (a, p) => a !== 'target' || p.target.key === 'mire_wraith',
    text: `${WD} Wood overcomes ${E_} Earth. Strike the <b>Mire Wraith</b>.` },
  { id: 'yan', target: () => techBtn('yan', 0), place: 'above', arrow: true, wait: 'selected', allowEls: () => [techBtn('yan', 0)], allow: (a, p) => a !== 'select' || p.t.chor === 'yan_s1',
    text: `${WD} Wood feeds ${F_} Fire: <b>Yan Feihong</b> is next in the chain. Tap her <b>Vermilion Talisman</b>.` },
  { id: 'yan-t', needSel: ['yan', 0], target: () => cardEl(foe('bone_wraith')), place: 'below', arrow: true, wait: 'cast', allowEls: () => [cardEl(foe('bone_wraith'))], allow: (a, p) => a !== 'target' || p.target.key === 'bone_wraith',
    text: `${F_} Fire overcomes ${M_} Metal. Burn the <b>Bone Wraith</b>.` },
  { id: 'su', target: () => techBtn('su', 0), place: 'above', arrow: true, wait: 'selected', allowEls: () => [techBtn('su', 0)], allow: (a, p) => a !== 'select' || p.t.chor === 'su_s1',
    text: `${F_} Fire makes ${E_} Earth: close the chain with <b>Su Lianhua</b>. Her <b>Petal Blades</b> also heal the most injured ally.` },
  { id: 'su-t', needSel: ['su', 0], target: () => BT.enemies().filter(e => e.alive).map(cardEl), place: 'below', wait: 'cast', allowEls: () => BT.enemies().map(cardEl),
    text: `Tap any enemy. That makes a <b>Harmony ×4</b>, worth +45% on the last link plus bonus Spirit Qi!` },
  { id: 'points', target: () => $('#pool-hero'), place: 'right', text: `Each technique also adds <b>Phase Qi</b> to the phase it feeds. Every point gives that phase <b>+8%</b> for the rest of the battle, so your chain grows stronger each turn.` },
  { id: 'qi', target: () => $('#qi-box'), place: 'right', text: `<b>Spirit Qi</b> flows in every turn. Spend it to <b>✦ Empower</b> a technique, or on <b>Fortuitous Encounters</b>.` },
  { id: 'mo2', target: () => techBtn('mo', 1), place: 'above', arrow: true, wait: 'selected', allowEls: () => [techBtn('mo', 1)], allow: (a, p) => a !== 'select' || p.t.chor === 'mo_s2',
    text: `Mo's <b>Shadow Lightning Step</b> is ready too, and it refreshes her Thunderfang Cross. It starts a new chain, which is fine. Tap it.` },
  { id: 'emp', target: () => $('#techcard .emp-btn'), place: 'left', wait: 'empower', allowEls: () => [$('#techcard .emp-btn')],
    text: `Tap <b>✦ Empower</b>: it spends 6 Spirit Qi for +35% damage and a bonus effect.` },
  { id: 'emp-t', needSel: ['mo', 1, true], target: () => BT.enemies().filter(e => e.alive).map(cardEl), place: 'below', wait: 'cast', allowEls: () => BT.enemies().map(cardEl),
    text: `Empowered! Now tap any enemy.` },
  { id: 'end', target: () => $('#b-end'), place: 'left', wait: 'turnEnd', free: true,
    text: `Thunderfang is ready again: use it if you like. Unused techniques keep their charge. When you are done, tap <b>End Turn</b>.` },
  { id: 'enemy', target: () => BT.enemies().filter(e => e.alive).map(u => u.el.querySelector('.c-techs')), place: 'below', onTurn: 'hero',
    text: `The enemy follows the same rules, Harmony included. Watch the rings on their cards: a <b>1</b> means that technique fires on their next turn.` },
  { id: 'enc', target: () => $('#b-enc'), place: 'left', arrow: true, wait: 'shopOpen', allowEls: () => [$('#b-enc')],
    text: `Even rounds bring a <b>Fortuitous Encounter</b> (奇遇): talismans, pills and treasures for Spirit Qi. Tap it.` },
  { id: 'shop', target: () => $('#shop .offers'), place: 'below', wait: 'shopClose', free: true,
    text: `Buy one if you can afford it, or leave. Later rounds bring rarer finds.` },
  { id: 'done', text: `That's everything! <b>Auto</b> and <b>×2</b> are at the top right, and tapping a card shows its details. Good luck, Pavilion Master.`, last: true },
];
const EXTRA = {
  boss: { id: 'boss', target: () => BT.enemies().find(e => e.boss)?.el, place: 'below',
    text: `A <b>boss</b> carries a gold <b>Qi shield</b>. Every hit breaks one segment (two if your phase overcomes it), and it refills after the boss's turn. Break all 12 in one turn (multi-hit techniques help) to <b>Shatter</b> it: +30% damage, and its ultimate (top right of its card) is delayed.` },
};

// ---------------- DOM ----------------
function el() { return $('#tut'); }
function build() {
  el().innerHTML = `<div class="tut-hole none"></div><div class="tut-arrow"></div><div class="tut-tip"><div class="tut-face"></div><div class="tut-body"><div class="tut-name">Tao Yao<span class="tut-n"></span></div><div class="tut-cycle"></div><div class="tut-text"></div><div class="tut-act"><button class="skip">Skip tutorial</button><span class="wait"></span><button class="next">Next</button></div></div></div>`;
  el().querySelector('.next').addEventListener('click', e => { e.stopPropagation(); next(); });
  el().querySelector('.skip').addEventListener('click', e => { e.stopPropagation(); tut_finish(); });
}

function rectOf(targets) {
  const list = (Array.isArray(targets) ? targets : [targets]).filter(Boolean);
  if (!list.length) return null;
  const sr = ui.stage.getBoundingClientRect(), s = V.view.s;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const t of list) { const r = t.getBoundingClientRect(); if (!r.width && !r.height) continue; x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); }
  if (x0 > x1) return null;
  return { x: (x0 - sr.left) / s, y: (y0 - sr.top) / s, w: (x1 - x0) / s, h: (y1 - y0) / s };
}

function render() {
  const st = current; if (!st || !active) return;
  const root = el(); root.classList.add('on');
  const hole = root.querySelector('.tut-hole'), tip = root.querySelector('.tut-tip'), arrow = root.querySelector('.tut-arrow');
  root.querySelector('.tut-text').innerHTML = st.text;
  root.querySelector('.tut-cycle').innerHTML = st.cycle ? CYCLE_SVG : '';
  root.querySelector('.tut-cycle').style.display = st.cycle ? '' : 'none';
  const main = STEPS.indexOf(st);
  root.querySelector('.tut-n').textContent = main >= 0 ? `${main + 1} / ${STEPS.length}` : '';
  const waits = !!st.wait;
  root.querySelector('.next').style.display = waits ? 'none' : '';
  root.querySelector('.next').textContent = st.last ? 'Start' : (main < 0 ? 'Got it' : 'Next');
  root.querySelector('.wait').textContent = waits ? (st.free ? '' : 'Your move…') : '';
  root.querySelector('.skip').style.visibility = st.last || main < 0 ? 'hidden' : '';
  if (hidden) { root.classList.remove('on'); return; }
  const r = st.target ? rectOf(st.target()) : null;
  const pad = 8;
  if (r) {
    hole.className = 'tut-hole' + (st.free ? ' pass' : '');
    Object.assign(hole.style, { left: r.x - pad + 'px', top: r.y - pad + 'px', width: r.w + pad * 2 + 'px', height: r.h + pad * 2 + 'px' });
  } else { hole.className = 'tut-hole none'; Object.assign(hole.style, { left: V.view.W / 2 + 'px', top: '360px' }); }
  // place the tip
  const tw = 470, th = tip.offsetHeight || 170, W = V.view.W, H = V.view.H, m = 18;
  let x = (W - tw) / 2, y = (H - th) / 2;
  if (r) {
    if (st.place === 'above') { x = r.x + r.w / 2 - tw / 2; y = r.y - th - m - (st.arrow ? 34 : 0); }
    else if (st.place === 'below') { x = r.x + r.w / 2 - tw / 2; y = r.y + r.h + m + (st.arrow ? 34 : 0); }
    else if (st.place === 'left') { x = r.x - tw - m - 10; y = r.y + r.h / 2 - th / 2; }
    else if (st.place === 'right') { x = r.x + r.w + m + 10; y = r.y + r.h / 2 - th / 2; }
  }
  x = Math.max(110, Math.min(W - tw - 12, x)); y = Math.max(12, Math.min(H - th - 12, y));
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
  if (r && st.arrow) {
    const below = st.place === 'below';
    arrow.style.display = 'block';
    arrow.className = 'tut-arrow ' + (st.place === 'left' ? 'right' : (below ? 'up' : 'down'));
    if (st.place === 'left') { arrow.style.left = r.x - 36 + 'px'; arrow.style.top = r.y + r.h / 2 - 14 + 'px'; }
    else { arrow.style.left = r.x + r.w / 2 - 14 + 'px'; arrow.style.top = (below ? r.y + r.h + 10 : r.y - 38) + 'px'; }
  } else arrow.style.display = 'none';
}

/** A target step needs its technique selected: restore it if a stray tap cleared it. */
function ensureSel(st) {
  if (!st || !st.needSel || BT.B.side !== 'hero' || BT.B.phase !== 'input' || BT.B.busy) return;
  const [k, i, emp] = st.needSel, h = hero(k), t = h && h.techs[i];
  if (!t) return;
  const g = BT.B.gate; BT.B.gate = null;
  try {
    if ((!BT.B.sel || BT.B.sel.t !== t) && t.cur <= 0) BT.selectTech(h, i);
    if (emp && BT.B.sel && BT.B.sel.t === t && !BT.B.emp) BT.toggleEmpower();
  } finally { BT.B.gate = g; }
}
function show(st) { current = st; hidden = false; ensureSel(st); render(); requestAnimationFrame(render); }
function hide() { hidden = true; el().classList.remove('on'); }

function next() {
  if (!active) return;
  if (current && STEPS.indexOf(current) < 0) { current = null; if (extraQueue.length) return show(extraQueue.shift()); if (idx >= STEPS.length) { passive(); return; } return show(STEPS[idx]); }
  if (current && current.last) { passive(); return; }
  idx++;
  if (idx >= STEPS.length) { passive(); return; }
  const st = STEPS[idx];
  if (st.onTurn && !(BT.B.side === st.onTurn && BT.B.phase === 'input')) { current = st; hide(); return; }
  show(st);
}
/** Tutorial done with its script: let the player play, keep watching for one-off tips. */
function passive() {
  current = null; idx = STEPS.length; hide();
  BT.B.gate = null;
  try { localStorage.setItem('ibc_tut_done', '1'); } catch (e) {}
}
function tut_finish() { passive(); seen.boss = true; }

// ---------------- gate ----------------
function gate(action, payload) {
  if (!active || !current || hidden && !current.free && !current.wait) return true;
  if (current.free) return true;
  if (action === 'click') {
    const e = payload;
    if (e.target.closest('#detail')) return true;          // a details panel can always be closed
    if (!current.wait) return false;                       // reading step: block the board
    const els = (current.allowEls ? current.allowEls() : []).filter(Boolean);
    const ok = els.some(x => x.contains(e.target));
    if (ok) ensureSel(current);
    return ok;
  }
  if (action === 'detail') return false;                   // no detail panels during guided steps
  if (current.allow) return current.allow(action, payload);
  return true;
}

// ---------------- events ----------------
function onEvt(name, data) {
  if (!active) return;
  if (name === 'castStart' && current && !current.free) { if (current.wait) hide(); return; }
  if (name === 'cast' && current) {
    if (current.wait === 'cast') { advanceSoon(); return; }
    if (hidden && BT.B.side === 'hero' && BT.B.phase === 'input' && !current.onTurn) show(current);
    return;
  }
  if (current && current.wait === name) { advanceSoon(); return; }
  if (name === 'turnStart' && data.side === 'hero') {
    if (current && current.onTurn === 'hero') { setTimeout(() => show(current), 200); return; }
    if (extraQueue.length && !current) { setTimeout(() => show(extraQueue.shift()), 200); }
  }
  if (name === 'wave' && data.boss && !seen.boss) {
    seen.boss = true;
    if (idx >= STEPS.length || !current) { const tip = EXTRA.boss; BT.B.gate = gate; if (BT.B.side === 'hero' && BT.B.phase === 'input') setTimeout(() => show(tip), 300); else extraQueue.push(tip); }
    else extraQueue.push(EXTRA.boss);
  }
  if ((name === 'victory' || name === 'defeat')) { hide(); BT.B.gate = null; }
}
function advanceSoon() { hide(); setTimeout(() => next(), 260); }

const tutorial = {
  begin() {
    this.stop();
    active = true; idx = -1; current = null; extraQueue = []; seen = {};
    build();
    BT.B.gate = gate;
    unsub = ['ready', 'selected', 'empower', 'castStart', 'cast', 'turnStart', 'turnEnd', 'shopOpen', 'shopClose', 'encounterDone', 'wave', 'victory', 'defeat']
      .map(n => BT.on(n, d => onEvt(n, d || {})));
    unsub.push(BT.on('ready', () => setTimeout(() => next(), 350)));
  },
  stop() {
    active = false; unsub.forEach(f => f()); unsub = []; current = null; hide();
    if (el()) el().innerHTML = '';
  },
  relayout() { if (active && current && !hidden) render(); },
  get active() { return active; },
  get step() { return active && current && !hidden ? current.id : null; },
};



export { BT, V, board, ui, tutorial, clock, wait, rand, pick, clamp, lerp, ease, sfx, audio, initAudio, loadAll, loadImage, images, initVfx, resizeVfx, updateVfx, renderVfx, tickClock, timeScale, shakeState, PHASES, GEN, OVER, CYCLE, RULES, STATUS, SID, sid, configureRules, FX_LIST, CHOREO, CYCLE_SVG, LOTUS, hitStop, slowMo };
