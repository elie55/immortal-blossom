// Trials: the battle modes outside the story. The hub; the Demon Hunts (five beasts, thirteen levels, gear sets);
// Medicine King Valley (EXP pills, the day's phase, sweeps after three stars); the Five Phases Shrines (essences
// and scrolls, one shrine doubled each weekday). Battles here can repeat on Auto and the spoils add up.
import { App, esc, rewardChip, phTag, PH_COLOR, PH_GLYPH, npcSays, SET_COLOR, mergeRewards } from './app.js';
import { get, all, locBg, enemyArt, phaseOf, stageBattle, todayPhase, num, hasArt, keyOf, realmOf } from './data.js';
import { data, persist, isCleared, stars, clearStage, heroBonus, ownedHeroes, prog, currentArray, arrayLevel } from './state.js';
import { missionText, missionDone } from './story.js';
import { twoPieceText } from './ring.js';
import { ROMAN, tierOrder, rarityColor } from './gear.js';

const ROMAN13 = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII'];
const MODE_CN = { 'mode:hunts': '猎妖', 'mode:valley': '药王谷', 'mode:shrines': '五行祠', 'mode:secret_realms': '秘境', 'mode:pagoda': '镇妖塔', 'mode:tower': '天试塔', 'mode:raids': '天劫' };
const PHASES5 = ['phase:metal', 'phase:wood', 'phase:water', 'phase:fire', 'phase:earth'];
const SHRINE_OF = { 'phase:metal': 'metal', 'phase:wood': 'wood', 'phase:water': 'water', 'phase:fire': 'fire', 'phase:earth': 'earth' };

// ---------------- unlocks ----------------
const bestRealm = () => Math.max(0, ...ownedHeroes().map(h => prog(h).bt || 0)); // 0 = Qi Refining
export function modeOpen(modeId) {
  const u = get(modeId)?.unlock;
  if (!u || u === 'start') return true;
  if (u.clear) return isCleared(u.clear);
  if (u.realm) return bestRealm() + 1 >= (get(u.realm)?.order || 99);
  return false;
}
const unlockText = (modeId) => { const u = get(modeId)?.unlock; if (!u) return ''; if (u.clear) return `Clear ${get(u.clear)?.name}`; if (u.realm) return `A heroine in ${get(u.realm)?.name}`; return String(u); };
/** Hunt and shrine levels open one after another; Valley levels open with the realms. */
function levelOpen(st, list) {
  if (st.mode === 'mode:valley') return modeOpen('mode:valley') && bestRealm() + 1 >= st.level;
  const i = list.indexOf(st.id);
  return modeOpen(st.mode) && (i <= 0 || isCleared(list[i - 1]));
}
/** The Valley's phase today; at weekends the player picks it. */
export function valleyPhase() { return todayPhase('mode:valley', data().flags.valleyPick || 'phase:metal'); }
const doubledShrine = () => todayPhase('mode:shrines', null);

// ---------------- the battle loop: formation, battles (repeated on Auto), results ----------------
/** Fight a trial stage: formation, then one battle or a run of repeats, then the spoils. back() returns to the mode. */
export async function runTrial(st, back, repeat = 0) {
  const team = await new Promise(r => App.go('formation', { st, resolve: r }, { replace: true }));
  if (!team) { back(); return; }
  await battleLoop(st, team, back, repeat);
}
async function battleLoop(st, team, back, repeat) {
  const total = Math.max(1, repeat), loot = [], exp = {};
  let runs = 0, res = null, out = null;
  const doubled = st.mode === 'mode:shrines' && st.phase === doubledShrine();
  while (runs < total) {
    const def = stageBattle(st, team, data().heroes, currentArray(), { arrayLevel: arrayLevel(currentArray()), gear: heroBonus, dayPhase: valleyPhase() });
    if (repeat) { def.auto = true; if (runs) App.toast(`Repeat battle ${runs + 1} of ${total}`); }
    data().log.battles++;
    res = await App.runBattle(def);
    if (!res || !res.win) {
      await App.dialog({ title: res?.retreat ? 'Retreated' : 'Defeat', cn: '败', body: `<p>${runs ? `${runs} of ${total} battles won before the defeat. Their spoils are yours.` : 'Your Blossoms have fallen.'} Refine your gear, cultivate, or try an easier level.</p>${loot.length ? `<div class="got" style="justify-content:flex-start">${mergeRewards(loot).map(g => rewardChip(g)).join('')}</div>` : ''}`, buttons: [{ label: 'Back', value: true }], dismiss: false });
      back(); return;
    }
    out = clearStage(st, { win: true, missions: (st.missions || []).map(m => missionDone(m, res)), heroes: res.heroes, dropMul: doubled ? 2 : 1 });
    runs++; loot.push(...out.granted);
    for (const x of out.exp) exp[x.id] = exp[x.id] ? { ...x, exp: exp[x.id].exp + x.exp, before: exp[x.id].before } : { ...x };
  }
  const all3 = stars(st.id) === 3 && st.mode === 'mode:valley';
  const choice = await new Promise(r => App.go('results', {
    st, res, out: repeat ? { ...out, granted: mergeRewards(loot), exp: Object.values(exp), runs } : out, resolve: r,
    actions: [{ label: 'Back', value: 'back', cls: 'ink' }, ...(all3 ? [] : [{ label: 'Repeat ×5', value: 'r5', cls: 'ink' }]), { label: 'Again', value: 'again' }],
  }, { replace: true }));
  if (choice === 'again') return battleLoop(st, team, back, 0);
  if (typeof choice === 'string' && choice.startsWith('r')) return battleLoop(st, team, back, +choice.slice(1));
  back();
}
/** Sweep a three-star level: its drops at once, no battle. */
async function sweep(st, n) {
  const got = [];
  for (let i = 0; i < n; i++) got.push(...clearStage(st, { win: true, sweep: true }).granted);
  await App.rewardsDialog(mergeRewards(got), n > 1 ? `Swept ×${n}` : 'Swept', '扫荡');
}

// ---------------- shared bits ----------------
const enemyLv = st => { const ls = (st.waves || []).flat().map(e => e.level); return ls.length ? `Lv ${Math.min(...ls)}–${Math.max(...ls)}` : ''; };
function dropChips(st, mul = 1) {
  const d = get(st.drops); if (!d) return '';
  return (d.entries || []).map(e => {
    if (e.gear) return rewardChip({ gearOdds: e.gear, chance: e.chance });
    if (!(e.cur || e.item)) return '';
    const q = Array.isArray(e.qty) ? e.qty[1] : (e.qty || 1);
    return rewardChip({ cur: e.cur, item: e.item, qty: q * mul * (d.rolls || 1) });
  }).join('');
}
const starRow = st => (st.missions ? `<span class="tr-stars">${[0, 1, 2].map(i => `<i class="${(data().stages[st.id]?.missions || [])[i] ? 'on' : ''}">★</i>`).join('')}</span>` : '');

// ---------------- the hub ----------------
App.register('trials', {
  cls: 'trials',
  render(el) {
    const vp = valleyPhase(), dp = doubledShrine();
    const card = (mode, title, cn, sub, bg, act, extra = '') => { const open = modeOpen(mode);
      return `<div class="tr-card${open ? '' : ' locked'}" data-act="${open ? act : 'lockedmode'}" data-mode="${mode}" style="background-image:url(${bg})"><div class="tr-shade"></div>
        <div class="tr-txt"><span class="cn">${esc(cn)}</span><b>${esc(title)}</b><small>${esc(sub)}</small>${extra}${open ? '' : `<em>${esc(unlockText(mode))}</em>`}</div></div>`; };
    const small = (mode, title) => `<div class="tr-mini${modeOpen(mode) ? '' : ' locked'}" data-act="soon" data-mode="${mode}"><span class="cn">${esc(MODE_CN[mode] || '')}</span><b>${esc(title)}</b><small>${modeOpen(mode) ? 'Coming with the content beta' : esc(unlockText(mode))}</small></div>`;
    el.innerHTML = `<div class="scr-bg" style="background-image:url(${locBg('loc:howling_gorge') || 'assets/bg/arena.webp'});filter:blur(4px) brightness(.4)"></div><div class="scr-shade"></div>
      ${App.topbar({ title: 'Trials', cn: '试炼', chips: ['cur:spirit_stones', 'cur:immortal_jade', 'item:forging_dust'] })}
      <div class="tr-hub">
        ${card('mode:hunts', 'Demon Hunts', '猎妖', 'Gear sets and Forging Manuals', locBg('loc:howling_gorge'), 'hunts')}
        ${card('mode:valley', 'Medicine King Valley', '药王谷', 'EXP pills and Spirit Stones', locBg('loc:medicine_king_valley'), 'valley', vp ? `<span class="tr-today">${phTag(phaseOf(vp))} Today: ${esc(get(vp).name)}</span>` : '<span class="tr-today">Weekend: pick the phase</span>')}
        ${card('mode:shrines', 'Five Phases Shrines', '五行祠', 'Essences and Enlightenment Scrolls', locBg('loc:five_phases_shrines'), 'shrines', dp ? `<span class="tr-today">${phTag(phaseOf(dp))} ×2 today: ${esc(get(dp).name)}</span>` : '<span class="tr-today">Weekend: every shrine at ×1</span>')}
        ${card('mode:hunts', 'Artifact Forge', '炼器阁', 'Forge set pieces from manuals', hasArt('bg/artifact_forge.webp') ? 'assets/bg/artifact_forge.webp' : 'assets/bg/pavilion.webp', 'forge')}
      </div>
      <div class="tr-more">${small('mode:secret_realms', 'Secret Realms')}${small('mode:pagoda', 'Demon-Sealing Pagoda')}${small('mode:tower', 'Heavenly Trial Tower')}${small('mode:raids', 'Tribulation Raids')}</div>`;
    App.bind(el, {
      hunts: () => App.go('hunts', {}), valley: () => App.go('valley', {}), shrines: () => App.go('shrines', {}), forge: () => App.go('forge', {}),
      lockedmode: (b) => App.toast(`${unlockText(b.dataset.mode)} to open it`),
      soon: (b) => App.toast(modeOpen(b.dataset.mode) ? 'This mode arrives with the content beta' : `${unlockText(b.dataset.mode)} to open it`),
    });
  },
});

// ---------------- Demon Hunts ----------------
App.register('hunts', {
  cls: 'hunts',
  render(el, { hunt = 'hunt:qiongqi', sel = null }) {
    const hunts = get('mode:hunts').hunts.map(get), h = get(hunt), lv = h.levels.map(get);
    const cur = get(sel) || lv.filter(s => levelOpen(s, h.levels)).pop() || lv[0];
    const bossArt = hh => enemyArt(get(hh.creature));
    el.innerHTML = `<div class="scr-bg" style="background-image:url(${locBg(h.location)});filter:brightness(.55)"></div><div class="scr-shade"></div>
      ${App.topbar({ title: 'Demon Hunts', cn: '猎妖', chips: ['cur:spirit_stones', 'item:forging_dust', 'item:black_iron'] })}
      <div class="hu-list">${hunts.map(x => `<div class="hu-b${x.id === hunt ? ' on' : ''}" data-act="hunt" data-h="${x.id}" style="background-image:url(assets/cards/${bossArt(x)}.webp)"><b>${esc(x.name)} <span class="cn">${esc(x.cn)}</span></b><small>${x.sets.map(s => `<i style="--sc:${SET_COLOR[s]}">${esc(get(s).cn[0])}</i>`).join('')}</small></div>`).join('')}</div>
      <div class="hu-detail panel">
        <div class="hu-head"><div><h2>${esc(h.name)} <span class="cn gold">${esc(h.cn)}</span></h2><p class="mut">${esc(get(h.creature).title || '')} · ${esc(get(h.location).name)}</p></div></div>
        <p class="hu-gim">${esc(h.gimmick)}</p>
        <div class="hu-sets">${h.sets.map(sid => { const s = get(sid); return `<div class="hu-set" style="--sc:${SET_COLOR[sid]}"><b>${esc(s.name)} ${esc(s.cn)}</b><span>2: ${esc(twoPieceText(s))}</span><span>4: ${esc(s.fourPiece.name)}. ${esc(s.fourPiece.text)}</span></div>`; }).join('')}</div>
        <div class="hu-levels">${lv.map(s => { const open = levelOpen(s, h.levels), done = isCleared(s.id);
          return `<button class="hu-lv${s.id === cur.id ? ' on' : ''}${open ? '' : ' locked'}${done ? ' done' : ''}" data-act="lv" data-s="${s.id}">${ROMAN13[s.level]}</button>`; }).join('')}</div>
        <div class="hu-cur"><b>${esc(cur.name)}</b> <span class="mut">Tier ${ROMAN[tierOrder(cur.tier)]} · ${esc(get(cur.realm).name)} · enemies ${enemyLv(cur)}</span></div>
        <div class="rw">${dropChips(cur)}</div>
        <div class="sd-btns">${levelOpen(cur, h.levels) ? `<button class="btn" data-act="go">Battle</button>${isCleared(cur.id) ? '<button class="btn ink" data-act="rep" data-n="5">Repeat ×5</button><button class="btn ink" data-act="rep" data-n="10">×10</button>' : ''}` : `<button class="btn off">Clear ${esc(get(h.levels[Math.max(0, h.levels.indexOf(cur.id) - 1)]).name)} first</button>`}</div>
      </div>`;
    const back = () => App.go('hunts', { hunt, sel: cur.id }, { replace: true });
    App.bind(el, {
      hunt: (b) => App.go('hunts', { hunt: b.dataset.h }, { replace: true }),
      lv: (b) => { const s = get(b.dataset.s); if (!levelOpen(s, h.levels)) { App.toast('Clear the level before it first'); return; } App.go('hunts', { hunt, sel: s.id }, { replace: true }); },
      go: () => runTrial(cur, back, 0),
      rep: (b) => runTrial(cur, back, +b.dataset.n),
    });
  },
});

// ---------------- Medicine King Valley ----------------
App.register('valley', {
  cls: 'valley',
  render(el, { sel = null } = {}) {
    const m = get('mode:valley'), lv = m.stages.map(get);
    const ph = valleyPhase(), weekend = !todayPhase('mode:valley', null);
    const cur = get(sel) || lv.filter(s => levelOpen(s, m.stages)).pop() || lv[0];
    el.innerHTML = `<div class="scr-bg" style="background-image:url(${locBg(m.location)});filter:brightness(.55)"></div><div class="scr-shade"></div>
      ${App.topbar({ title: 'Medicine King Valley', cn: '药王谷', chips: ['cur:spirit_stones', 'item:qi_gathering_pill', 'item:spirit_condensing_pill'] })}
      <div class="va-left panel">${npcSays('npc:medicine_king', `<p>My furnaces got away from me, I admit it. Today they burn with <b style="color:${PH_COLOR[phaseOf(ph)]}">${esc(get(ph).name)}</b> ${PH_GLYPH[phaseOf(ph)]}: bring heroines whose phase overcomes it. Every pill they drop is yours.</p>`)}
        ${weekend ? `<div class="va-pick"><span class="mut">Weekend: choose the furnaces' phase</span><div>${PHASES5.map(p => `<button class="ph-pick${p === ph ? ' on' : ''}" data-act="pick" data-p="${p}" style="--pc:${PH_COLOR[phaseOf(p)]}">${PH_GLYPH[phaseOf(p)]}</button>`).join('')}</div></div>` : ''}
        <p class="mut va-gate">A level opens when one of your heroines reaches its realm. Three stars unlock the sweep.</p></div>
      <div class="va-levels panel">${lv.map(s => { const open = levelOpen(s, m.stages);
        return `<div class="va-lv${s.id === cur.id ? ' on' : ''}${open ? '' : ' locked'}" data-act="lv" data-s="${s.id}"><span class="k">${ROMAN13[s.level]}</span><span><b>${esc(get(s.realm).name)}</b><small>${open ? `Tier ${ROMAN[tierOrder(s.tier)]} · enemies ${enemyLv(s)}` : `Needs a heroine in ${esc(get(s.realm).name)}`}</small></span>${starRow(s)}</div>`; }).join('')}</div>
      <div class="va-detail panel"><h2>${esc(cur.name)}</h2>
        <div class="missions">${(cur.missions || []).map((mm, i) => `<span class="${(data().stages[cur.id]?.missions || [])[i] ? 'ok' : ''}">${esc(missionText(mm))}</span>`).join('')}</div>
        <div class="sd-h">PER RUN · about ${num(cur.expPerRun || 0)} EXP in pills</div><div class="rw">${dropChips(cur)}</div>
        <div class="sd-btns">${levelOpen(cur, m.stages) ? `${stars(cur.id) === 3 ? '<button class="btn jade" data-act="sweep" data-n="1">Sweep</button><button class="btn jade" data-act="sweep" data-n="10">Sweep ×10</button>' : ''}<button class="btn" data-act="go">Battle</button>${isCleared(cur.id) && stars(cur.id) < 3 ? '<button class="btn ink" data-act="rep" data-n="5">Repeat ×5</button>' : ''}` : '<button class="btn off">Locked</button>'}</div>
      </div>`;
    const back = () => App.go('valley', { sel: cur.id }, { replace: true });
    App.bind(el, {
      pick: (b) => { data().flags.valleyPick = b.dataset.p; persist(); back(); },
      lv: (b) => { const s = get(b.dataset.s); if (!levelOpen(s, m.stages)) { App.toast(`Needs a heroine in ${get(s.realm).name}`); return; } App.go('valley', { sel: s.id }, { replace: true }); },
      go: () => runTrial(cur, back, 0),
      rep: (b) => runTrial(cur, back, +b.dataset.n),
      sweep: async (b) => { await sweep(cur, +b.dataset.n); App.bumpChips(); back(); },
    });
  },
});

// ---------------- Five Phases Shrines ----------------
App.register('shrines', {
  cls: 'shrines',
  render(el, { phase = null, sel = null } = {}) {
    const m = get('mode:shrines'), dp = doubledShrine();
    const ph = phase || dp || 'phase:metal';
    const list = m.stages.filter(id => id.includes(`shrine_${SHRINE_OF[ph]}_`));
    const lv = list.map(get);
    const cur = get(sel) || lv.filter(s => levelOpen(s, list)).pop() || lv[0];
    const doubled = ph === dp;
    const boss = get((cur.waves || []).flat().find(e => get(e.enemy).boss)?.enemy);
    el.innerHTML = `<div class="scr-bg" style="background-image:url(${locBg(m.location)});filter:brightness(.55)"></div><div class="scr-shade"></div>
      ${App.topbar({ title: 'Five Phases Shrines', cn: '五行祠', chips: ['cur:spirit_stones', `item:${SHRINE_OF[ph]}_essence`, 'item:enlightenment_scroll'] })}
      <div class="sh-tabs">${PHASES5.map(p => `<button class="sh-tab${p === ph ? ' on' : ''}" data-act="ph" data-p="${p}" style="--pc:${PH_COLOR[phaseOf(p)]}"><i>${PH_GLYPH[phaseOf(p)]}</i>${esc(get(p).name)}${p === dp ? '<em>×2</em>' : ''}</button>`).join('')}</div>
      <div class="va-levels panel sh-levels">${lv.map(s => { const open = levelOpen(s, list);
        return `<div class="va-lv${s.id === cur.id ? ' on' : ''}${open ? '' : ' locked'}${isCleared(s.id) ? ' done' : ''}" data-act="lv" data-s="${s.id}"><span class="k" style="background:${PH_COLOR[phaseOf(ph)]}">${ROMAN13[s.level]}</span><span><b>${esc(s.name)}</b><small>${esc(get(s.realm).name)} · enemies ${enemyLv(s)}</small></span></div>`; }).join('')}</div>
      <div class="va-detail panel"><h2>${esc(cur.name)}${doubled ? ' <span class="tr-x2">×2 today</span>' : ''}</h2>
        ${boss ? `<p class="mut">Guarded by <b class="gold">${esc(boss.name)}</b> ${esc(boss.cn || '')}</p>` : ''}
        <div class="sd-h">PER RUN${doubled ? ' · DOUBLED' : ''}</div><div class="rw">${dropChips(cur, doubled ? 2 : 1)}</div>
        <div class="sd-btns">${levelOpen(cur, list) ? `<button class="btn" data-act="go">Battle</button>${isCleared(cur.id) ? '<button class="btn ink" data-act="rep" data-n="5">Repeat ×5</button>' : ''}` : '<button class="btn off">Clear the level before it</button>'}</div>
      </div>`;
    const back = () => App.go('shrines', { phase: ph, sel: cur.id }, { replace: true });
    App.bind(el, {
      ph: (b) => App.go('shrines', { phase: b.dataset.p }, { replace: true }),
      lv: (b) => { const s = get(b.dataset.s); if (!levelOpen(s, list)) { App.toast('Clear the level before it first'); return; } App.go('shrines', { phase: ph, sel: s.id }, { replace: true }); },
      go: () => runTrial(cur, back, 0),
      rep: (b) => runTrial(cur, back, +b.dataset.n),
    });
    void rarityColor; void keyOf; void all; void realmOf;
  },
});
