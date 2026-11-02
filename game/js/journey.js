// Journey (the chapter map), Formation (team ready) and the victory screens.
import { App, esc, phTag, rewardChip, starStr, PH_COLOR } from './app.js';
import { get, all, cardUrl, faceUrl, locBg, enemyArt, phaseOf, heroStats, power, teamCombos, teamThreads, battleExp, num, hasArt, hdStage, arrayText } from './data.js';
import { data, persist, isCleared, isUnlocked, stars, stageState, chapterStars, starRewardState, claimStarReward, ownedHeroes, owned, prog, finalStats, arraysOpen, currentArray, arrayLevel, setArray } from './state.js';
import { Flow, Scene, missionText } from './story.js';
import { runTrial } from './trials.js';

const KIND = { battle: ['战', 'Battle', ''], story: ['卷', 'Story', 'story'], commission: ['委', 'Commission', ''], encounter: ['遇', 'Encounter', 'story'], boss: ['首', 'Boss', 'boss'] };
const miniCard = (hid, extra = '', cls = '') => {
  const h = get(hid), p = prog(hid);
  return `<div class="mini ${cls}" data-hid="${hid}" style="background-image:url(${cardUrl(hid)})">${phTag(phaseOf(h.phase))}<span class="rar">${starStr(h.rarity)}</span>
    <div class="nm">${esc(h.name)}</div><div class="lv">${p ? `Lv ${p.level}` : (extra || '')}</div>${extra && p ? extra : ''}</div>`;
};
export { miniCard };

// ---------------- Journey ----------------
App.register('journey', {
  cls: 'journey',
  render(el, params) {
    const chs = Flow.chapters().filter(c => Flow.chapterOpen(c));
    const ch = get(params.ch) && Flow.chapterOpen(get(params.ch)) ? get(params.ch) : Flow.chapter();
    const hd = !!params.hd && Flow.chapterDone(ch);
    // Heaven-Defying: the chapter's battles again, harder, unlocking one after another
    const stages = hd ? ch.stages.map(get).filter(x => x.heavenDefying).reduce((a, x) => (a.push(hdStage(x, a[a.length - 1]?.id || null)), a), []) : ch.stages.map(get);
    const byId = id => stages.find(x => x.id === id);
    let sel = byId(params.sel) || (hd ? stages.find(x => !isCleared(x.id)) : (Flow.nextStage()?.chapter === ch.id ? Flow.nextStage() : null)) || stages[stages.length - 1];
    const ci = chs.indexOf(ch);
    const draw = () => {
      const { have, max } = chapterStars(ch);
      const rs = starRewardState(ch);
      el.innerHTML = `<div class="scr-bg" style="background-image:url(${locBg(ch.location)})${hd ? ';filter:saturate(.6) hue-rotate(-20deg) brightness(.8)' : ''}"></div><div class="scr-shade"></div>
        ${App.topbar({ title: 'Journey', cn: '历程', extra: `<div class="ch-nav">${ci > 0 ? `<button class="tl" data-act="chap" data-c="${chs[ci - 1].id}">‹ Chapter ${chs[ci - 1].number}</button>` : ''}${ci < chs.length - 1 ? `<button class="tl" data-act="chap" data-c="${chs[ci + 1].id}">Chapter ${chs[ci + 1].number} ›</button>` : ''}${Flow.chapterDone(ch) ? `<button class="tl hdb${hd ? ' on' : ''}" data-act="hd">${hd ? 'Normal' : 'Heaven-Defying 逆天'}</button>` : ''}</div>` })}
        <div class="ch-head"><small>VOLUME 1 · CHAPTER ${ch.number}${hd ? ' · <span class="hd-tag">HEAVEN-DEFYING</span>' : ''}</small><b>${esc(ch.name)}</b><span>${esc(ch.cn)}</span></div>
        <div class="st-list">${stages.map((s, i) => {
          const [g, label, c] = KIND[s.kind] || KIND.battle, un = isUnlocked(s), n = stars(s.id);
          return `<button class="st${s === sel ? ' sel' : ''}${un ? '' : ' locked'}" data-act="pick" data-sid="${s.id}"><span class="k ${c}">${g}</span>
            <span><b>${i + 1}. ${esc(s.name)}</b><small>${label.toUpperCase()}${isCleared(s.id) ? ' · CLEARED' : ''}</small></span>
            ${s.waves ? `<span class="stars">${[0, 1, 2].map(k => `<i class="${k < n ? 'on' : ''}">★</i>`).join('')}</span>` : ''}</button>`;
        }).join('')}</div>
        <div class="st-detail panel">${detail(sel)}</div>
        ${hd ? '' : `<div class="star-bar panel"><span class="cnt">★ ${have} / ${max}</span><div class="track"><i style="width:${(have / max * 100).toFixed(1)}%"></i></div>
          ${rs.map((r, i) => `<button class="chest${r.claimed ? ' claimed' : (r.ready ? ' ready' : '')}" data-act="chest" data-i="${i}" title="${r.need} stars">${r.claimed ? '✓' : '宝'}</button>`).join('')}</div>`}`;
    };
    const detail = (s) => {
      const [, label] = KIND[s.kind] || KIND.battle, un = isUnlocked(s), cleared = isCleared(s.id), ss = stageState(s.id);
      const foes = s.waves ? [...new Map(s.waves.flat().map(e => [e.enemy, e])).values()] : [];
      const drops = s.drops ? (get(s.drops).entries || []).filter(e => e.cur || e.item || e.gear) : [];
      const exp = s.waves ? battleExp(s) : 0;
      return `<div class="sd-scroll"><div class="kind">${hd ? 'HEAVEN-DEFYING' : label.toUpperCase()} · ${esc(get(s.location)?.name || '')}</div><h2>${esc(s.name)}</h2><p class="beat">${esc(hd ? s.mechanic || '' : s.beat || '')}</p>
        ${foes.length ? `<div class="sd-h">ENEMIES</div><div class="foes">${foes.map(f => { const e = get(f.enemy); return `<span class="foe"><img src="assets/cards/${enemyArt(e)}.webp" alt="">${phTag(phaseOf(e.phase))}${esc(e.name)} <span class="mut">Lv ${f.level}</span></span>`; }).join('')}</div>` : ''}
        ${s.missions ? `<div class="sd-h">MISSIONS</div><div class="missions">${s.missions.map((m, i) => `<span class="${ss?.missions?.[i] ? 'ok' : ''}">${esc(missionText(m))}</span>`).join('')}</div>` : ''}
        <div class="sd-h">REWARDS${exp ? ` · <span class="mut">${num(exp)} EXP each</span>` : ''}</div><div class="rw">${(s.firstClearRewards || []).map(r => rewardChip(r, 'first' + (cleared ? ' done' : ''))).join('')}${drops.map(d => (d.gear ? rewardChip({ gearOdds: d.gear, chance: d.chance }) : rewardChip({ cur: d.cur, item: d.item, qty: Array.isArray(d.qty) ? d.qty[1] : d.qty }))).join('')}</div>
        </div><div class="sd-btns">${cleared && (s.scenes?.before || s.scenes?.after) ? '<button class="btn ink" data-act="story">Story</button>' : ''}
          <button class="btn${un ? '' : ' off'}" data-act="go">${s.waves ? (cleared ? 'Fight again' : 'Formation') : (cleared ? 'Replay' : 'Begin')}</button></div>`;
    };
    draw();
    App.bind(el, {
      pick: (b) => { const s = byId(b.dataset.sid); if (!isUnlocked(s)) { App.toast('Clear the stage before it first'); return; } sel = s; draw(); },
      go: () => { if (!isUnlocked(sel)) return; if (hd) runTrial(sel, () => App.go('journey', { ch: ch.id, hd: true, sel: sel.id }, { root: true }), 0); else Flow.playStage(sel.id); },
      chap: (b) => App.go('journey', { ch: b.dataset.c }, { replace: true }),
      hd: () => App.go('journey', { ch: ch.id, hd: !hd }, { replace: true }),
      story: async () => { if (sel.scenes.before) await Scene.play(sel.scenes.before); if (sel.scenes.after) await Scene.play(sel.scenes.after, { title: false }); App.go('journey', { ch: ch.id, sel: sel.id }, { root: true }); },
      chest: async (b) => { const i = +b.dataset.i, r = starRewardState(ch)[i]; if (r.claimed) return; if (!r.ready) { App.toast(`Collect ${r.need} stars to open this chest`); return; } const g = claimStarReward(ch, i); await App.rewardsDialog(g, 'Star reward'); draw(); },
    });
  },
});

// ---------------- Formation ----------------
App.register('formation', {
  cls: 'formation',
  render(el, { st, resolve }) {
    const guests = (st.guests || []).filter(g => !owned(g));
    const roster = ownedHeroes().sort((a, b) => (prog(b).level - prog(a).level) || (get(b).rarity - get(a).rarity));
    let team = [...guests, ...(data().team || []).filter(h => owned(h) && !guests.includes(h))].slice(0, 4);
    for (const h of roster) { if (team.length >= 4) break; if (!team.includes(h)) team.push(h); }
    const draw = () => {
      const stats = team.map(h => (prog(h) ? finalStats(h) : heroStats(h, Math.max(...st.waves.flat().map(e => e.level)), 0)));
      const pw = stats.reduce((a, s) => a + power(s), 0);
      const combos = teamCombos(team), threads = teamThreads(team);
      // chain preview: the team in feeding order
      const phases = team.map(h => phaseOf(get(h).phase));
      const order = ['water', 'wood', 'fire', 'earth', 'metal'];
      let best = [];
      for (const start of order) { const run = []; let p = start; while (phases.includes(p) && !run.includes(p)) { run.push(p); p = order[(order.indexOf(p) + 1) % 5]; } if (run.length > best.length) best = run; }
      el.innerHTML = `<div class="scr-bg" style="background-image:url(${locBg(st.location)})"></div><div class="scr-shade"></div>
        ${App.topbar({ title: 'Formation', cn: '布阵' })}
        <div class="fm-side l panel"><h3>ARRAY</h3><button class="fm-array" data-act="array"><b class="gold">${esc(get(currentArray()).name)} 阵</b><small>${esc(get(currentArray()).theme)}</small><span>Change ›</span></button>
          <div class="mut">${arraysOpen().length > 1 ? `${arraysOpen().length} of 5 arrays open` : 'More arrays unlock with the chapter bosses.'}</div>
          <h3 style="margin-top:14px">POWER</h3><div class="power">${num(pw)}</div>
          <h3 style="margin-top:14px">TWIN BLOOMS 并蒂</h3>${combos.length ? combos.map(c => `<div class="twin"><b>${esc(c.name)} ${esc(c.cn)}</b><small>${esc(c.howTo)}</small></div>`).join('') : '<div class="mut">No combo in this team. Pairs such as Ling Shuang and Mo Yingyue, or Wei Zi and Yan Feihong, have one.</div>'}
          ${threads.length ? `<h3 style="margin-top:14px">RESONANCE 因缘</h3>${threads.map(t => `<div class="twin"><b>${esc(get(t.a).name)} · ${esc(get(t.b).name)}</b><small>${esc((t.kind || '').replace(/_/g, ' '))}: +5% Attack for both</small></div>`).join('')}` : ''}</div>
        <div class="fm-slots">${[0, 1, 2, 3].map(i => { const h = team[i]; const g = h && guests.includes(h);
          return `<div class="fm-slot${h ? '' : ' empty'}${g ? ' guest' : ''}" data-act="slot" data-i="${i}">${h ? miniCard(h, g ? '<span class="lv">Guest</span>' : '') : ''}<div class="pos">${['Front · 1', '2', '3', 'Rear · 4'][i]}<small>${esc(arrayText(currentArray(), i, arrayLevel(currentArray())))}</small></div></div>`; }).join('')}</div>
        <div class="fm-chain">${best.length > 1 ? `<span class="mut">Harmony order</span> ${best.map(p => phTag(p)).join('<em>›</em>')} <span class="gold">×${best.length}</span>` : '<span class="mut">No two phases of this team feed each other: try Kindred Qi or mix phases.</span>'}</div>
        <div class="fm-side r panel"><h3>ENEMIES</h3>${st.waves.map((w, i) => `<div class="wave-line"><span class="mut">Wave ${i + 1}</span>${w.map(e => { const r = get(e.enemy); return `${phTag(phaseOf(r.phase))}`; }).join('')}<span class="mut">Lv ${Math.max(...w.map(e => e.level))}</span></div>`).join('')}
          <div class="mut" style="margin-top:8px">Their phases: pick heroines whose phase overcomes them (Water › Fire › Metal › Wood › Earth › Water).</div></div>
        <div class="fm-go"><button class="btn red" data-act="start"${team.length ? '' : ' disabled'}>Begin battle</button></div>
        <div class="fm-roster panel">${roster.map(h => miniCard(h, '', team.includes(h) ? 'inteam' : '')).join('') || '<div class="mut">Summon heroines at the Fate Pond.</div>'}</div>`;
    };
    draw();
    el.addEventListener('click', e => {
      const m = e.target.closest('.fm-roster .mini');
      if (m) { const h = m.dataset.hid; if (team.includes(h)) team = team.filter(x => x !== h); else if (team.length < 4) team.push(h); else App.toast('The team is full: tap a slot to remove a heroine'); draw(); return; }
    });
    App.bind(el, {
      array: () => App.dialog({
        title: 'Battle Array', cn: '阵法', body: `<div class="arr-list">${all('array').map(a => { const open = arraysOpen().some(x => x.id === a.id);
          return `<button class="arr${a.id === currentArray() ? ' on' : ''}${open ? '' : ' locked'}" data-arr="${a.id}"><b>${esc(a.name)}</b><small>${esc(a.theme)}</small><span>${[0, 1, 2, 3].map(i => esc(arrayText(a.id, i, arrayLevel(a.id)))).join(' · ')}</span>${open ? '' : `<em>Clear ${esc(get(a.unlockedBy)?.name)}</em>`}</button>`; }).join('')}</div>`,
        onOpen: (w, close) => w.addEventListener('click', e => { const b = e.target.closest('[data-arr]'); if (!b || b.classList.contains('locked')) return; setArray(b.dataset.arr); close(true); }),
      }).then(() => draw()),
      slot: (b) => { const h = team[+b.dataset.i]; if (!h) return; if (guests.includes(h)) { App.toast(`${get(h).name} insists on coming`); return; } team = team.filter(x => x !== h); draw(); },
      start: () => { if (!team.length) return; data().team = team.filter(h => owned(h)); persist(); resolve(team); },
      back: () => resolve(null),
    });
    // the built-in back handler goes to the previous screen; a cancelled formation ends the stage instead
    el.querySelector('[data-act="back"]').addEventListener('click', e => { e.stopPropagation(); resolve(null); }, true);
  },
});

// ---------------- Victory ----------------
App.register('results', {
  cls: 'results',
  render(el, { st, res, out, resolve, actions = null }) {
    const hs = res.heroes;
    const mvp = [...hs].sort((a, b) => (b.dmg + b.heal * 1.2) - (a.dmg + a.heal * 1.2))[0];
    const mh = get(mvp.id);
    const missions = st.missions || [];
    el.innerHTML = `<div class="scr-bg" style="background-image:url(${locBg(st.location)});filter:blur(3px) brightness(.5)"></div><div class="scr-shade"></div>
      <div class="mvp" style="background-image:url(${cardUrl(mvp.id)})"></div>
      <div class="mvp-tag"><i>MVP</i><b>${esc(mh.name)}</b><span class="cn gold" style="font-size:28px;letter-spacing:.3em">${esc(mh.cn || '')}</span></div>
      <div class="res-right">
        <div class="res-title">Victory</div>
        <div class="seals">${missions.map((m, i) => `<div class="seal-m${out.missions[i] ? ' ok' : ''}" style="--d:${0.3 + i * 0.35}s">${esc(missionText(m))}</div>`).join('')}</div>
        <div class="res-sec panel"><h3>CULTIVATION</h3><div class="exp-row">${out.exp.map(x => `<span class="exp-h"><img src="${faceUrl(x.id)}" alt=""><span>${esc(get(x.id).name)}<br><b>+${num(x.exp)} EXP</b> ${x.after > x.before ? `<span class="up">Lv ${x.after}!</span>` : `<span class="mut">Lv ${x.after}</span>`}${x.atCap ? ' <span class="mut">(cap)</span>' : ''}</span></span>`).join('') || '<span class="mut">A dream: no EXP.</span>'}</div></div>
        <div class="res-sec panel"><h3>SPOILS${out.runs > 1 ? ` · ${out.runs} BATTLES` : ''}${out.first ? ' · FIRST CLEAR' : ''}</h3><div class="got" style="justify-content:flex-start">${out.granted.map(g => g.hero ? rewardChip({ hero: g.hero }, 'first') : rewardChip(g)).join('') || '<span class="mut">Nothing this time.</span>'}</div></div>
        <div class="res-btns"><button class="btn ink" data-act="report">Battle report</button>${actions ? actions.map(a => `<button class="btn ${a.cls || ''}" data-act="choose" data-v="${esc(a.value)}">${esc(a.label)}</button>`).join('') : '<button class="btn" data-act="go">Continue</button>'}</div>
      </div>`;
    App.bind(el, {
      go: () => resolve(),
      choose: (b) => resolve(b.dataset.v),
      report: () => App.dialog({ title: 'Battle report', cn: '战报', body: `<p class="mut">${res.rounds} rounds · longest Harmony ×${res.log.maxChain || 0}${Object.keys(res.log.combos || {}).length ? ' · Twin Blooms fired: ' + Object.entries(res.log.combos).map(([k, n]) => `${esc(get(k)?.name)} ×${n}`).join(', ') : ''}${Object.keys(res.log.gear || {}).length ? ' · Gear: ' + Object.entries(res.log.gear).map(([k, n]) => `${esc(k.charAt(0) + k.slice(1).toLowerCase())} ×${n}`).join(', ') : ''}</p>
        <table class="report"><tr><td></td><td class="n">Damage</td><td class="n">Healing</td><td class="n">Taken</td></tr>${hs.map(h => `<tr><td>${esc(get(h.id).name)}${h.alive ? '' : ' <span class="mut">(fell)</span>'}</td><td class="n">${num(h.dmg)}</td><td class="n">${num(h.heal)}</td><td class="n">${num(h.taken)}</td></tr>`).join('')}</table>` }),
    });
    void PH_COLOR; void hasArt; void all;
  },
});
