// Immortal Blossoms — card battle prototype data.
// Everything a designer tweaks lives here: phases, heroines, enemies, waves, encounters, statuses.

const PHASES = {
  water: { name: 'Water', glyph: '水', color: '#7cc6ff', col: 'ice' },
  wood:  { name: 'Wood',  glyph: '木', color: '#86e38f', col: 'jade' },
  fire:  { name: 'Fire',  glyph: '火', color: '#ff8048', col: 'fire' },
  earth: { name: 'Earth', glyph: '土', color: '#e4b45a', col: 'gold' },
  metal: { name: 'Metal', glyph: '金', color: '#efe6c8', col: 'white' },
  yin:   { name: 'Yin',   glyph: '阴', color: '#b98cff', col: 'violet' },
};
/** Generating cycle (who feeds whom): casting a technique adds Phase Qi to the phase it feeds. */
const GEN = { water: 'wood', wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', yin: 'yin' };
/** Overcoming cycle (who beats whom). */
const OVER = { metal: 'wood', wood: 'earth', earth: 'water', water: 'fire', fire: 'metal' };
const CYCLE = ['water', 'wood', 'fire', 'earth', 'metal'];

const RULES = {
  advMul: 1.3, resMul: 0.75, advCrit: 0.15,  // overcoming: +30% damage, +15% crit; overcome: -25%
  pointBonus: 0.08,                          // each Phase Qi point: +8% for that phase
  harmonyStep: 0.15,                         // each Harmony link: +15%
  empowerMul: 1.35,
  defK: 900,                                 // damage / (1 + DEF / K)
  qiStart: 4, qiBase: 2, qiPerHeroine: 1, qiPerKill: 3, qiMax: 30,
  shatterMul: 1.3, frostBreakMul: 1.3, markMul: 1.25,
  tribulationRound: 12, tribulationBase: 0.06, tribulationStep: 0.03,
};

const HEROES = [
  {
    key: 'ling', name: 'Ling Shuang', title: 'Frostblade Saint', phase: 'water', path: 'Sword', lvl: 30,
    art: 'card_ling', cutin: 'ling_cutin', face: 'ling_face', fx: 'ice',
    hp: 10400, atk: 1320, def: 520, crit: 0.2, critDmg: 1.6,
    techs: [
      { id: 'ling_s1', name: 'Frost Crescent', icon: 'ling_s1', cd: 1, start: 0, target: 'enemy',
        desc: 'Slash one enemy for 100% ATK. 30% chance to Frost Seal it for 1 turn.' },
      { id: 'ling_s2', name: 'Rain of Frozen Swords', icon: 'ling_s2', cd: 3, start: 2, target: 'allEnemies',
        desc: 'Ice swords hit every enemy for 75% ATK and delay their charging techniques by 1 turn.',
        emp: { cost: 6, desc: '+35% damage and Frost Seals the healthiest enemy.' } },
      { id: 'ling_s3', name: 'Ten-Thousand Frost Array', icon: 'ling_s3', cd: 5, start: 4, target: 'enemy', ult: true,
        desc: 'Four sword strikes on one enemy for 70% ATK each, +50% against Frost Sealed or wounded enemies. Frost Seals it.',
        emp: { cost: 10, desc: '+35% damage and a second fan of swords hits every other enemy for 60% ATK.' } },
    ],
  },
  {
    key: 'mo', name: 'Mo Yingyue', title: 'Violet Thunder Assassin', phase: 'wood', path: 'Shadow', lvl: 30,
    art: 'card_mo', cutin: 'mo_cutin', face: 'mo_face', fx: 'thunder',
    hp: 9200, atk: 1400, def: 450, crit: 0.3, critDmg: 1.7,
    techs: [
      { id: 'mo_s1', name: 'Thunderfang Cross', icon: 'mo_s1', cd: 1, start: 0, target: 'enemy',
        desc: 'Two dagger strikes on one enemy for 55% ATK each.' },
      { id: 'mo_s2', name: 'Shadow Lightning Step', icon: 'mo_s2', cd: 3, start: 0, target: 'enemy',
        desc: 'Blink through one enemy for 150% ATK. Thunderfang Cross is ready again.',
        emp: { cost: 6, desc: '+35% damage and every ally\'s charging special techniques get 1 turn closer.' } },
      { id: 'mo_s3', name: 'Heaven\'s Execution', icon: 'mo_s3', cd: 5, start: 4, target: 'enemy', ult: true,
        desc: 'Three strikes of judgement lightning for 95% ATK each, +1% per 1% health the target is missing. Soul Shock for 1 turn.',
        emp: { cost: 10, desc: '+35% damage and Shadow Lightning Step is ready again.' } },
    ],
  },
  {
    key: 'yan', name: 'Yan Feihong', title: 'Vermilion Phoenix Arcanist', phase: 'fire', path: 'Arcane', lvl: 30,
    art: 'card_yan', cutin: 'yan_cutin', face: 'yan_face', fx: 'fire',
    hp: 9800, atk: 1450, def: 470, crit: 0.2, critDmg: 1.6,
    techs: [
      { id: 'yan_s1', name: 'Vermilion Talisman', icon: 'yan_s1', cd: 1, start: 0, target: 'enemy',
        desc: 'Talisman fire hits one enemy for 100% ATK. 40% chance of Fire Poison for 2 turns.' },
      { id: 'yan_s2', name: 'Scarlet Inferno', icon: 'yan_s2', cd: 3, start: 2, target: 'allEnemies',
        desc: 'Fire sigils hit every enemy for 70% ATK and apply Fire Poison for 2 turns.',
        emp: { cost: 6, desc: '+35% damage and Fire Poison lasts 3 turns.' } },
      { id: 'yan_s3', name: 'Vermilion Phoenix Covenant', icon: 'yan_s3', cd: 5, start: 4, target: 'allEnemies', ult: true,
        desc: 'The Vermilion Phoenix sweeps every enemy for 170% ATK, +30% against burning enemies.',
        emp: { cost: 10, desc: '+35% damage and every Fire Poison deals its remaining damage at once.' } },
    ],
  },
  {
    key: 'su', name: 'Su Lianhua', title: 'Jade Lotus Sage', phase: 'earth', path: 'Healer', lvl: 30,
    art: 'card_su', cutin: 'su_cutin', face: 'su_face', fx: 'jade',
    hp: 11200, atk: 1050, def: 640, crit: 0.12, critDmg: 1.5,
    techs: [
      { id: 'su_s1', name: 'Petal Blades', icon: 'su_s1', cd: 1, start: 0, target: 'enemy',
        desc: 'Three petals hit one enemy for 30% ATK each. The most injured ally recovers 70% ATK.' },
      { id: 'su_s2', name: 'Jade Lotus Revival', icon: 'su_s2', cd: 3, start: 2, target: 'allAllies',
        desc: 'Every ally recovers 95% ATK and loses one debuff.',
        emp: { cost: 6, desc: '+35% healing and Clear Heart: immune to debuffs for 1 turn.' } },
      { id: 'su_s3', name: 'Thousand-Petal Sanctuary', icon: 'su_s3', cd: 5, start: 4, target: 'allAllies', ult: true,
        desc: 'Every ally gains a Spirit Shield of 130% ATK and Lotus Dew (recovers 6% health per turn) for 2 turns.',
        emp: { cost: 10, desc: '+35% shield and a fallen ally returns at 30% health.' } },
    ],
  },
];

const claw = { id: 'claw', name: 'Grave Claw', icon: 'g:爪', cd: 1, start: 0, target: 'enemy', desc: 'Rakes one heroine for 100% ATK.' };
const W = { hp: 8400, atk: 1600, def: 480, crit: 0.1, critDmg: 1.5, lvl: 28, title: 'Netherflame Spirit' };
const ENEMIES = {
  ember:   { ...W, name: 'Ember Wraith', phase: 'fire', art: 'wraith_ember', techs: [claw,
    { id: 'cinder', name: 'Cinder Wail', icon: 'g:嚎', cd: 3, start: 3, target: 'allEnemies', desc: 'Burning shriek: every heroine takes 55% ATK, 50% chance of Fire Poison.' }] },
  mire:    { ...W, name: 'Mire Wraith', phase: 'earth', art: 'wraith_mire', techs: [claw,
    { id: 'bind', name: 'Grave Bind', icon: 'g:缚', cd: 3, start: 2, target: 'enemy', desc: 'Grave mud binds one heroine: 130% ATK and her charging techniques are delayed by 1 turn.' }] },
  bone:    { ...W, name: 'Bone Wraith', phase: 'metal', art: 'wraith_bone', techs: [claw,
    { id: 'spear', name: 'Bone Spear', icon: 'g:矛', cd: 3, start: 3, target: 'enemy', desc: 'A spear of bone: 170% ATK on one heroine with +50% critical chance.' }] },
  drowned: { ...W, hp: 7800, atk: 1800, name: 'Drowned Wraith', phase: 'water', art: 'wraith_drowned', techs: [claw,
    { id: 'tide', name: 'Black Tide', icon: 'g:潮', cd: 3, start: 2, target: 'allEnemies', desc: 'A black wave: every heroine takes 50% ATK and Qi Disruption (-30% damage) for 1 turn.' }] },
  thorn:   { ...W, hp: 7800, atk: 1800, name: 'Thorn Wraith', phase: 'wood', art: 'wraith_thorn', techs: [claw,
    { id: 'thorns', name: 'Soul Thorns', icon: 'g:棘', cd: 3, start: 3, target: 'enemy', desc: 'Two thorn lashes on one heroine for 60% ATK each and Gu Venom for 2 turns.' }] },
  boss: {
    name: 'Netherflame Matriarch', title: 'Mistress of the Withered Garden', phase: 'yin', art: 'boss_matriarch', wide: true, boss: true,
    hp: 75000, atk: 2500, def: 640, crit: 0.12, critDmg: 1.5, lvl: 35, qiShield: 12,
    techs: [
      { id: 'lash', name: 'Netherflame Lash', icon: 'g:鞭', cd: 1, start: 0, target: 'enemy', desc: 'Whips one heroine for 110% ATK, 50% chance of Fire Poison.' },
      { id: 'curse', name: 'Withering Curse', icon: 'g:枯', cd: 3, start: 2, target: 'allEnemies', desc: 'Every heroine takes 60% ATK and Withering (cannot be healed) for 1 turn.' },
      { id: 'cataclysm', name: 'Netherflame Cataclysm', icon: 'g:冥', cd: 4, start: 3, target: 'allEnemies', ult: true, tele: true,
        desc: 'Netherflame engulfs every heroine for 150% ATK and Fire Poison for 2 turns. Shatter her Qi shield to delay it.' },
    ],
  },
};

const WAVES = [
  { title: 'Wave 1', sub: 'Peach Blossom Ford', enemies: ['ember', 'mire', 'bone'] },
  { title: 'Final wave', sub: 'The Netherflame Matriarch descends', enemies: ['drowned', 'boss', 'thorn'], boss: true },
];

const STATUS = {
  frost:   { name: 'Frost Seal', glyph: '冰', color: '#7cc6ff', debuff: true, desc: 'Skips its next turn. The next hit breaks the seal for +30% damage.' },
  shock:   { name: 'Soul Shock', glyph: '晕', color: '#c58bff', debuff: true, desc: 'Skips its next turn.' },
  burn:    { name: 'Fire Poison', glyph: '火', color: '#ff7b45', debuff: true, desc: 'Takes fire damage at the start of its turn.' },
  venom:   { name: 'Gu Venom', glyph: '毒', color: '#9be36e', debuff: true, desc: 'Loses 6% of max health at the start of its turn.' },
  wither:  { name: 'Withering', glyph: '枯', color: '#a88bc0', debuff: true, desc: 'Cannot be healed.' },
  disrupt: { name: 'Qi Disruption', glyph: '乱', color: '#e07070', debuff: true, desc: 'Deals 30% less damage.' },
  mark:    { name: 'Karmic Mark', glyph: '印', color: '#ff5a7a', debuff: true, desc: 'Takes 25% more damage.' },
  shatter: { name: 'Shattered', glyph: '碎', color: '#ffd27a', debuff: true, desc: 'Qi shield broken: takes 30% more damage until its turn ends, and its ultimate was delayed by 1 turn.' },
  shield:  { name: 'Spirit Shield', glyph: '盾', color: '#ffe08a', debuff: false, desc: 'Absorbs damage.' },
  dew:     { name: 'Lotus Dew', glyph: '露', color: '#9ff0b8', debuff: false, desc: 'Recovers 6% of max health at the start of its turn.' },
  clear:   { name: 'Clear Heart', glyph: '净', color: '#ffffff', debuff: false, desc: 'Immune to debuffs.' },
};

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

