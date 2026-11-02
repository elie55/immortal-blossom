// Heroines: the roster, a heroine's overview (stats, techniques and mastery, gear, meridians, Dao Blossom, bond,
// Twin Blooms and Karmic Threads), Cultivate and Breakthrough.
import { App, esc, phTag, starStr, SET_COLOR, PH_COLOR, PH_GLYPH, npcSays, compact } from './app.js';
import { get, all, cardUrl, faceUrl, heroArt, phaseOf, SLICE_HEROES, expToNext, levelCap, realmOf, nextRealm, iconUrl, num, techOf, masteryCap, meridians, bondLevel, bondNext, bondBonus, growthBonus, keyOf } from './data.js';
import { data, persist, owned, prog, qty, atCap, breakthroughCost, breakthrough, canPay, pillPlan, usePills, finalStats, heroBonus,
  masteryNext, masteryUp, meridianSlots, meridiansOpen, nodeNext, openNode, renDuState, openRenDu, chooseRenDu, petalCost, openPetal,
  giftTaste, giveGift, teaToday, takeTea } from './state.js';
import { V, sfx } from './engine.js';
import { heroGearStrip, twoPieceText } from './ring.js';

/** The sets she wears, with their bonuses and effects. */
function gearSets(hid) {
  const b = heroBonus(hid);
  const rows = Object.entries(b.count).filter(([, n]) => n >= 2).map(([id, n]) => { const s = get(id);
    return `<div class="tq"><div class="ic"><span style="color:${SET_COLOR[id]}">${esc(s.cn[0])}</span></div><div><b>${esc(s.name)} ${esc(s.cn)}</b><small>${n >= 4 ? '4' : '2'} PIECES</small><p>${esc(twoPieceText(s))}</p>${n >= 4 ? `<p class="emp">${esc(s.fourPiece.name)}: ${esc(s.fourPiece.text)}</p>` : ''}</div></div>`; }).join('');
  const art = b.artefact ? get(b.artefact.id) : null;
  return rows + (art ? `<div class="tq"><div class="ic"><span>宝</span></div><div><b>${esc(art.name)} ${esc(art.cn)}</b><small>ARTEFACT · ${Math.round(b.artefact.power * 100)}%</small><p>${esc(art.passive.text)}</p></div></div>` : '')
    || '<p class="mut">No set bonus yet. Two pieces of a set give its bonus, four its effect.</p>';
}

const PILLS = ['item:qi_gathering_pill', 'item:spirit_condensing_pill', 'item:heaven_earth_pill', 'item:nine_revolution_golden_pill'];
const HV_TABS = [['tech', 'Techniques'], ['gear', 'Gear'], ['meri', 'Meridians'], ['bloom', 'Blossom'], ['bond', 'Bond'], ['ties', 'Ties']];
const hvIcon = ic => (ic.startsWith('g:') ? `<span>${ic.slice(2)}</span>` : `<img src="assets/ui/${ic}.webp" alt="">`);
/** A cost as chips: have / need, dimmed when short. */
const costChips = cost => `<div class="got hv-cost">${cost.map(c => { const id = c.item || c.cur, have = qty(id);
  return `<div class="rw-i${have >= c.qty ? '' : ' done'}" title="${esc(get(id)?.name)}">${iconUrl(id) ? `<img src="${iconUrl(id)}" alt="">` : '<span class="g">材</span>'}<em>${compact(have)}/${compact(c.qty)}</em></div>`; }).join('')}</div>`;

App.register('heroines', {
  cls: 'heroines',
  render(el) {
    const list = [...SLICE_HEROES].sort((a, b) => (owned(b) - owned(a)) || (get(b).rarity - get(a).rarity) || ((prog(b)?.level || 0) - (prog(a)?.level || 0)));
    el.innerHTML = `<div class="scr-bg" style="background-image:url(assets/bg/pavilion.webp);filter:blur(6px) brightness(.45)"></div><div class="scr-shade"></div>
      ${App.topbar({ title: 'Heroines', cn: '群芳' })}
      <div class="roster-grid">${list.map(h => { const r = get(h), p = prog(h);
        return `<div class="mini${p ? '' : ' unknown'}" data-act="open" data-hid="${h}" style="background-image:url(${cardUrl(h)})">${phTag(phaseOf(r.phase))}<span class="rar">${starStr(r.rarity)}</span>
          <div class="nm">${p ? esc(r.name) : '???'}</div><div class="lv">${p ? `Lv ${p.level}` : 'Not met'}</div>${p && p.petals ? `<span class="petals">✿${p.petals}</span>` : ''}</div>`; }).join('')}</div>`;
    App.bind(el, { open: (b) => { if (!owned(b.dataset.hid)) { App.toast('Meet her through the Fate Pond or the story'); return; } App.go('heroine', { hid: b.dataset.hid }); } });
  },
});

// ---------------- the tabs ----------------
function techTab(hid, p) {
  const h = get(hid), art = heroArt(hid);
  const petalLine = sid => (h.petals || []).filter(x => x.modifies === sid && !x.mastery).map(x => `<p class="pt${x.n <= (p.petals || 0) ? ' on' : ''}">✿${x.n} ${esc(x.text)}</p>`).join('');
  const techs = h.skills.map((sid, i) => {
    const sk = get(sid), lv = (p.mastery || {})[sid] || 0, steps = sk.mastery || [], cap = masteryCap(hid, sid, p.petals || 0);
    const t = techOf(sid, art.icons[i], false, { hid, petals: p.petals || 0, mastery: lv, halfEmp: p.renDu === sid });
    const next = masteryNext(hid, sid);
    const six = (h.petals || []).find(x => x.modifies === sid && x.mastery === 6);
    return `<div class="tq tm"><div class="ic">${hvIcon(art.icons[i])}${lv ? `<em class="tm-lv">+${lv}</em>` : ''}</div><div class="tm-b">
      <b>${esc(sk.name)}</b><small>${['S1', 'S2', 'S3 · ULTIMATE'][i]} · CD ${t.cd}${t.cd < sk.cooldown ? ` <s>${sk.cooldown}</s>` : ''}</small>
      <p>${esc(sk.text)}</p>
      ${sk.empower ? `<p class="emp">✦ Empower (${t.emp.cost} Spirit Qi${t.emp.cost < sk.empower.cost ? ', halved by Ren and Du' : ''}): ${esc(sk.empower.text)}</p>` : ''}
      ${petalLine(sid)}
      <div class="tm-steps">${steps.map((s, k) => `<i class="${k < lv ? 'on' : (k === lv ? 'nx' : '')}${k >= cap ? ' lk' : ''}" title="Mastery +${k + 1}${k >= cap && six ? `: needs Dao Blossom petal ${six.n}` : ''}"><u>+${k + 1}</u>${esc(s.replace(/ \(petal \d\)/, ''))}</i>`).join('')}</div>
      ${next ? `<div class="tm-up">${costChips(next.cost)}<button class="btn sm${next.locked || !canPay(next.cost) ? ' off' : ''}" data-act="master" data-sid="${sid}">${next.locked ? `Petal ${six?.n || ''} first` : `Master +${next.level}`}</button></div>` : '<div class="tm-max">Mastered</div>'}
    </div></div>`;
  }).join('');
  const passives = (h.passives || []).map(get).map((ps, i) => `<div class="tq${p.level >= [30, 50][i] ? '' : ' locked'}"><div class="ic"><span>${['卅', '五'][i]}</span></div><div><b>${esc(ps.name)}</b><small>PASSIVE · LEVEL ${[30, 50][i]}</small><p>${esc(ps.text)}</p>${petalLine(ps.id)}</div></div>`).join('');
  return techs + passives + '<p class="mut hv-note">Enlightenment Scrolls come from the Five Phases Shrines; Bodhi Leaves from the Merit Exchange.</p>';
}

const RING_ORDER = ['phase:wood', 'phase:fire', 'phase:earth', 'phase:metal', 'phase:water']; // the generating cycle, clockwise
function meridianTab(hid, p, sel) {
  const ms = meridians().filter(m => m.stat), rd = renDuState(hid), slots = meridianSlots(hid), open = meridiansOpen(hid);
  const by = Object.fromEntries(ms.map(m => [m.phase, m]));
  const pos = RING_ORDER.map((ph, k) => { const a = (-90 + k * 72) * Math.PI / 180; return { m: by[ph], x: +(220 + Math.cos(a) * 104).toFixed(1), y: +(150 + Math.sin(a) * 104).toFixed(1) }; });
  const cur = sel === 'ren_du' ? null : (ms.find(m => m.key === sel) || ms.find(m => (p.meridians || {})[m.key]) || by[get(hid).phase] || ms[0]);
  const node = ({ m, x, y }) => {
    const n = (p.meridians || {})[m.key] || 0, col = PH_COLOR[phaseOf(m.phase)];
    const pips = [0, 1, 2, 3, 4].map(i => { const a = (-90 + i * 72) * Math.PI / 180; return `<circle cx="${(x + Math.cos(a) * 41).toFixed(1)}" cy="${(y + Math.sin(a) * 41).toFixed(1)}" r="5" class="pip${i < n ? ' on' : ''}" style="--pc:${col}"/>`; }).join('');
    return `<g class="mnode${cur === m ? ' sel' : ''}${n ? ' open' : ''}" data-act="msel" data-k="${m.key}" style="--pc:${col}"><circle cx="${x}" cy="${y}" r="31" class="disc"/>${pips}
      <text x="${x}" y="${y + 1}" class="mcn">${esc(m.cn[0])}</text><text x="${x}" y="${y + 57}" class="mnm">${esc(m.name.toUpperCase())}${n ? ` ${n}/5` : ''}</text></g>`;
  };
  const edges = pos.map((a, k) => { const b = pos[(k + 1) % 5]; return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`; }).join('');
  const spokes = pos.map(a => `<line class="spoke" x1="220" y1="150" x2="${a.x}" y2="${a.y}"/>`).join('');
  const svg = `<svg class="meri-svg" viewBox="0 0 440 300">${edges}${spokes}${pos.map(node).join('')}
    <g class="mnode rendu${sel === 'ren_du' ? ' sel' : ''}${rd?.open ? ' open' : ''}" data-act="msel" data-k="ren_du"><circle cx="220" cy="150" r="30" class="disc"/><text x="220" y="151" class="mcn" style="font-size:18px">任督</text></g></svg>`;
  let detail;
  if (cur) {
    const n = (p.meridians || {})[cur.key] || 0, nx = nodeNext(hid, cur.key), own = cur.phase === get(hid).phase;
    const statName = { 'stat:atk': 'Attack', 'stat:hp': 'Health', 'stat:def': 'Defense', 'stat:crit_dmg': 'Crit damage', 'stat:haste': 'Haste' }[cur.stat];
    const fmt = v => (cur.stat === 'stat:haste' ? `+${v}` : `+${Math.round(v * 100)}%`);
    detail = `<div class="md-h"><b style="color:${PH_COLOR[phaseOf(cur.phase)]}">${esc(cur.name)} meridian ${esc(cur.cn)}</b><small>${esc(get(cur.phase).name)} · ${statName} ${fmt(cur.perNode)} a node${own ? ' · her own phase: twice the essence' : ''}</small></div>
      <p>${n}/5 nodes open: <b class="gold">${fmt(+(cur.perNode * n).toFixed(2))} ${statName}</b>${n < 5 ? ` · all five give ${fmt(+(cur.perNode * 5).toFixed(2))}` : ''}</p>
      ${nx ? `<div class="tm-up">${costChips(nx.cost)}<button class="btn sm${nx.locked || !canPay(nx.cost) ? ' off' : ''}" data-act="node" data-k="${cur.key}">${nx.locked ? 'No free slot' : `Open node ${nx.level}`}</button></div>${nx.locked ? `<p class="mut">${esc(nx.locked)}.</p>` : ''}` : '<div class="tm-max">Fully open</div>'}`;
  } else {
    detail = `<div class="md-h"><b class="gold">Ren and Du vessels 任督二脉</b><small>Opens at ${esc(get(rd.realm)?.name || 'Body Integration')}</small></div>
      <p>${esc(rd.text.charAt(0).toUpperCase() + rd.text.slice(1))}.</p>
      ${rd.open ? `<div class="sd-btns">${get(hid).skills.slice(1).map(sid => `<button class="btn sm${p.renDu === sid ? '' : ' ink'}" data-act="rendu" data-sid="${sid}">${esc(get(sid).name)}</button>`).join('')}</div>`
        : `<div class="tm-up">${costChips(rd.cost)}<button class="btn sm${rd.can && canPay(rd.cost) ? '' : ' off'}" data-act="openrd">${rd.can ? 'Open the vessels' : `Needs ${esc(get(rd.realm)?.name)}`}</button></div>`}`;
  }
  return `<p class="mut hv-note">Meridian slots: <b class="gold">${open} / ${slots}</b> in use. Each breakthrough opens one, up to five; choose the order. Essences come from the Five Phases Shrines.</p>${svg}<div class="md">${detail}</div>`;
}

function blossomTab(hid, p, sel) {
  const h = get(hid), n = p.petals || 0, cost = petalCost(hid);
  const pick = Math.min(6, Math.max(1, +sel || Math.min(6, n + 1)));
  const petals = (h.petals || []).map(x => {
    const a = -90 + (x.n - 1) * 60, on = x.n <= n;
    return `<g class="ptl${on ? ' on' : ''}${x.n === pick ? ' sel' : ''}${x.n === n + 1 ? ' nx' : ''}" data-act="psel" data-n="${x.n}" transform="rotate(${a + 90} 300 160)">
      <path d="M300 160 C 262 118, 266 52, 300 26 C 334 52, 338 118, 300 160 Z"/><text x="300" y="80" transform="rotate(${-(a + 90)} 300 80)">${x.n}</text></g>`;
  }).join('');
  const face = faceUrl(hid);
  const svg = `<svg class="bloom-svg" viewBox="150 18 300 286"><defs><radialGradient id="pg"><stop offset="0" stop-color="#fff2f7"/><stop offset=".6" stop-color="#f6b3cc"/><stop offset="1" stop-color="#d9709a"/></radialGradient>
    <clipPath id="hc"><circle cx="300" cy="160" r="40"/></clipPath></defs>${petals}
    <circle cx="300" cy="160" r="44" class="heart"/>${face ? `<image href="${face}" x="258" y="118" width="84" height="84" clip-path="url(#hc)" preserveAspectRatio="xMidYMin slice"/>` : ''}</svg>`;
  const x = h.petals[pick - 1];
  return `<p class="mut hv-note">${esc(h.flower)} · <b class="gold">${n} / 6 petals</b>${n >= 6 ? ' · Full Bloom: her petals drift across her card in battle' : ''}</p>${svg}
    <div class="md"><div class="md-h"><b class="${x.n <= n ? 'gold' : ''}">Petal ${x.n} ${x.n <= n ? '· open' : ''}</b><small>${esc(get(x.modifies)?.name || '')}</small></div><p>${esc(x.text)}</p>
    ${cost ? `<div class="tm-up">${costChips(cost)}<button class="btn sm${canPay(cost) ? '' : ' off'}" data-act="petal">Open petal ${n + 1}</button></div>` : '<div class="tm-max">Full Bloom</div>'}
    <p class="mut">Each duplicate from the Fate Pond opens a petal too; past Full Bloom it becomes Blossom Dew. Every fight is tuned for heroines with no petals.</p></div>`;
}

const PROFILE_KEYS = [['motto', 'Motto'], ['specialty', 'Specialty'], ['hobby', 'Hobby'], ['likes', 'Likes'], ['dislikes', 'Dislikes']];
function bondTab(hid, p) {
  const h = get(hid), pts = p.bond || 0, lv = bondLevel(pts), next = bondNext(lv), prev = (get('rules:growth').bondLevels || [])[lv - 1] || 0;
  const unl = get('rules:growth').bondUnlocks || [], at = k => (unl.find(u => u.profile === k) || {}).level || 1, voiceAt = k => (unl.find(u => u.voice === k) || {}).level || 1;
  const tea = teaToday(), bs = bondBonus(lv);
  const outfits = (h.bondRewards || []).map(r => `<div class="bd-row${lv >= r.level ? '' : ' locked'}"><span class="lvl">${r.level}</span><b>${esc(get(r.outfit)?.name || 'Outfit')}</b><small>${lv >= r.level ? 'Unlocked · painted in a later build' : 'Outfit'}</small></div>`).join('');
  return `<div class="bd-top"><div class="bd-lv"><small>BOND</small><b>${lv}</b></div><div style="flex:1">
      <div class="expbar"><i style="width:${next ? Math.min(100, (pts - prev) / (next - prev) * 100).toFixed(1) : 100}%"></i></div>
      <div class="mut" style="font:600 16px Oswald">${next ? `${num(pts)} / ${num(next)} points to bond ${lv + 1}` : `${num(pts)} points · the deepest bond`}</div>
      <div class="bd-bonus">${bs ? `+${Math.round(bs * 100)}% Health, Attack and Defense` : 'Bond 3 adds +2% Health, Attack and Defense'}</div></div></div>
    <div class="sd-btns"><button class="btn sm${tea ? ' off' : ' jade'}" data-act="tea">${tea ? (tea === hid ? 'Tea taken today' : `Tea with ${esc(get(tea).name)} today`) : 'Take tea (+30)'}</button><button class="btn sm" data-act="gift">Give a gift</button></div>
    <div class="bd-prof">${PROFILE_KEYS.map(([k, label]) => lv >= at(k) ? `<b>${label.toUpperCase()}</b><span>${esc(h.profile?.[k] || '')}</span>` : `<b>${label.toUpperCase()}</b><span class="mut">Bond ${at(k)}</span>`).join('')}
      <b>FLOWER</b><span>${esc(h.flower)}</span><b>BIRTHDAY · ZODIAC</b><span>${esc(h.birthday || '')} · ${esc(h.zodiac || '')}</span></div>
    <div class="sd-h">VOICES</div>${['intro', 'victory', 'ultimate'].map(k => `<div class="bd-row${lv >= voiceAt(k) ? '' : ' locked'}"><span class="lvl">${voiceAt(k)}</span>${lv >= voiceAt(k) ? `<i>“${esc(h.quotes?.[k] || '')}”</i>` : `<small>${k === 'intro' ? 'Greeting' : k === 'victory' ? 'Victory line' : 'Ultimate line'}</small>`}</div>`).join('')}
    <div class="sd-h">OUTFITS</div>${outfits}
    <p class="mut hv-note">Bond grows by fighting together (+1 a battle), gifts (liked ones count double), one tea a day and taps in the hall.</p>`;
}

const THREAD_KIND = { rivals: 'Rivals', sworn_sisters: 'Sworn sisters', master_disciple: 'Master and disciple', old_friends: 'Old friends', clan_kin: 'Clan kin', garden_neighbours: 'Garden neighbours', sworn_guard: 'Sworn guard', life_debt: 'A life debt' };
function tiesTab(hid) {
  const combos = all('combo').filter(c => c.members.includes(hid));
  const threads = all('thread').filter(t => t.a === hid || t.b === hid);
  const mateIc = mate => { const m = get(mate); return faceUrl(mate) ? `<img src="${faceUrl(mate)}" alt="">` : `<span>${esc((m.cn || m.name)[0])}</span>`; };
  const tb = combos.map(c => { const mate = c.members.find(m => m !== hid); const m = get(mate);
    return `<div class="tq${owned(mate) ? '' : ' locked'}"><div class="ic">${mateIc(mate)}</div><div><b>${esc(c.name)} ${esc(c.cn)}</b><small>WITH ${esc(m.name.toUpperCase())}${owned(mate) ? '' : ' · NOT MET'}</small><p>${esc(c.text)}</p><p class="emp">${esc(c.howTo)}</p></div></div>`; }).join('') || '<p class="mut">She has no Twin Bloom yet.</p>';
  const kt = threads.map(t => { const mate = t.a === hid ? t.b : t.a, m = get(mate);
    return `<div class="tq${owned(mate) ? '' : ' locked'}"><div class="ic">${mateIc(mate)}</div><div><b>${esc(m.name)}</b><small>${esc((THREAD_KIND[t.kind] || t.kind).toUpperCase())}${owned(mate) ? '' : ' · NOT MET'}</small><p>${esc(t.story)}</p></div></div>`; }).join('');
  return `<div class="sd-h">TWIN BLOOMS 并蒂</div>${tb}<div class="sd-h">KARMIC THREADS 因缘</div><p class="mut hv-note">Field her with a heroine she is tied to and both gain Resonance: +5% Attack.</p>${kt}`;
}

App.register('heroine', {
  cls: 'heroine',
  render(el, { hid, tab = 'tech', sel = null }) {
    const h = get(hid), p = prog(hid), s = finalStats(hid), realm = realmOf(p.bt);
    const cap = levelCap(p.bt), need = expToNext(p.level), capped = p.level >= cap;
    const nr = nextRealm(p.bt), g = growthBonus(p);
    const extra = [g.atk && `${Math.round(g.atk * 100)}% ATK`, g.hp && `${Math.round(g.hp * 100)}% HP`, g.def && `${Math.round(g.def * 100)}% DEF`].filter(Boolean);
    el.innerHTML = `<div class="scr-bg" style="background-image:url(assets/bg/pavilion.webp);filter:blur(6px) brightness(.4)"></div><div class="scr-shade"></div>
      ${App.topbar({ title: h.name, cn: h.cn, chips: ['cur:spirit_stones', 'item:enlightenment_scroll', 'cur:blossom_dew'] })}
      <div class="hv-art${p.petals >= 6 ? ' bloom' : ''}" style="background-image:url(${cardUrl(hid)})"><span class="stars">${starStr(h.rarity)}</span><span class="cnm">${esc(h.cn)}</span>${p.petals >= 6 ? `<div class="c-bloom">${'<i></i>'.repeat(8)}</div>` : ''}</div>
      <div class="hv-info panel">
        <h2>${esc(h.name)}</h2><div class="ttl">${esc(h.title)}</div>
        <div class="tagline">${phTag(phaseOf(h.phase))} ${esc(get(h.phase).name)} · ${esc(get(h.path).name)} · ${esc(get(h.faction)?.name || '')}</div>
        <div class="realm"><b>${esc(realm.cn)}</b><span>${esc(realm.name)}</span></div>
        <div class="lvl">Level ${p.level} <small>/ ${cap}</small></div>
        <div class="expbar"><i style="width:${capped ? 100 : Math.min(100, p.exp / need * 100).toFixed(1)}%"></i></div>
        <div class="mut" style="font:600 17px Oswald">${capped ? (nr ? `Level cap: break through to ${esc(nr.name)} to go on (${num(p.exp)} EXP banked)` : 'Peak of cultivation') : `${num(p.exp)} / ${num(need)} EXP`}</div>
        <div class="stats"><div>Health <b>${num(s.hp)}</b></div><div>Attack <b>${num(s.atk)}</b></div><div>Defense <b>${num(s.def)}</b></div><div>Critical <b>${Math.round(s.crit * 100)}%</b></div><div>Crit damage <b>${Math.round(s.critDmg * 100)}%</b></div><div>Haste <b>${s.haste}</b></div></div>
        ${extra.length ? `<div class="mut hv-grow">Meridians and bond: +${extra.join(' · +')}</div>` : ''}
        <div class="petal-row" data-act="tab" data-t="bloom">Dao Blossom ${[1, 2, 3, 4, 5, 6].map(n => `<i class="${n <= p.petals ? 'on' : ''}"></i>`).join('')}<span class="bd-chip">Bond ${bondLevel(p.bond || 0)}</span></div>
        <div class="hv-btns">
          <button class="btn jade" data-act="cultivate"${capped ? ' disabled' : ''}>Cultivate</button>
          <button class="btn${capped && nr ? '' : ' off'}" data-act="break">Breakthrough</button>
          <button class="btn ink" data-act="lobby">${data().lobby === hid ? 'In the hall' : 'Show in hall'}</button>
        </div>
      </div>
      <div class="hv-tabs panel">
        <div class="tabs">${HV_TABS.map(([k, label]) => `<button class="${tab === k ? 'on' : ''}" data-act="tab" data-t="${k}">${label}</button>`).join('')}</div>
        ${tab === 'tech' ? techTab(hid, p) : ''}
        ${tab === 'gear' ? `${heroGearStrip(hid)}${gearSets(hid)}<button class="btn" data-act="gear" style="margin-top:6px">Manage gear</button>` : ''}
        ${tab === 'meri' ? meridianTab(hid, p, sel) : ''}
        ${tab === 'bloom' ? blossomTab(hid, p, sel) : ''}
        ${tab === 'bond' ? bondTab(hid, p) : ''}
        ${tab === 'ties' ? tiesTab(hid) : ''}
      </div>`;
    const again = (o = {}) => App.go('heroine', { hid, tab, sel, ...o }, { replace: true });
    App.bind(el, {
      tab: (b) => App.go('heroine', { hid, tab: b.dataset.t }, { replace: true }),
      gear: () => App.go('ring', { hid }),
      lobby: () => { data().lobby = hid; persist(); App.toast(`${esc(h.name)} now waits in the hall`); again(); },
      cultivate: () => cultivateDialog(hid).then(() => again()),
      break: () => { if (!atCap(hid)) { App.toast(`Reach level ${cap} first`); return; } breakthroughDialog(hid).then(() => again()); },
      master: (b) => {
        const nx = masteryNext(hid, b.dataset.sid); if (!nx) return;
        if (nx.locked) { App.toast('Open the Dao Blossom petal for this technique first'); return; }
        if (!masteryUp(hid, b.dataset.sid)) { App.toast('Not enough materials'); return; }
        sfx('charge'); App.toast(`${esc(get(b.dataset.sid).name)} reaches mastery +${nx.level}: ${esc(nx.text)}`); again();
      },
      msel: (b) => again({ sel: b.dataset.k }),
      node: (b) => {
        const nx = nodeNext(hid, b.dataset.k); if (!nx) return;
        if (nx.locked) { App.toast(nx.locked); return; }
        if (!openNode(hid, b.dataset.k)) { App.toast('Not enough essence or Spirit Stones'); return; }
        sfx('heal'); App.toast(`Meridian node ${nx.level} opens`); again({ sel: b.dataset.k });
      },
      openrd: () => { const rd = renDuState(hid); if (!rd.can) { App.toast(`She must reach ${esc(get(rd.realm).name)} first`); return; } if (!openRenDu(hid)) { App.toast('Not enough materials'); return; } sfx('thunder'); again({ sel: 'ren_du' }); },
      rendu: (b) => { chooseRenDu(hid, b.dataset.sid); App.toast(`The vessels flow into ${esc(get(b.dataset.sid).name)}`); again({ sel: 'ren_du' }); },
      psel: (b) => again({ sel: b.dataset.n }),
      petal: async () => {
        const n = (p.petals || 0) + 1;
        if (!openPetal(hid)) { App.toast('Not enough Blossom Dew'); return; }
        sfx('heal');
        await App.dialog({ title: `Petal ${n} opens`, cn: '花开', body: `<p style="text-align:center"><b class="gold">${esc(h.name)}</b>: ${esc(h.petals[n - 1].text)}.</p>${n === 6 ? '<p style="text-align:center">Full Bloom! Her petals now drift across her card.</p>' : ''}`, buttons: [{ label: 'Wonderful', value: true }] });
        again({ sel: n });
      },
      tea: async () => { await teaDialog(hid); again(); },
      gift: () => giftDialog(hid).then(() => again()),
    });
    void V; void PH_GLYPH; void keyOf; void bondBonus;
  },
});

/** Today's tea with a heroine (one a day, at the Tea House or from her Bond tab). */
export async function teaDialog(hid) {
  const h = get(hid), t = teaToday();
  if (t) { App.toast(t === hid ? 'You already shared tea today' : `You took tea with ${esc(get(t).name)} today`); return null; }
  const r = takeTea(hid); if (!r) return null;
  sfx('heal');
  const lines = [h.profile?.motto, h.quotes?.intro, h.quotes?.victory].filter(Boolean);
  await App.dialog({ title: 'Tea at the Pavilion', cn: '品茶', body: npcSays(hid, `<p><b class="gold">${esc(h.name)}</b> warms her hands on the cup.</p><p><i>“${esc(lines[Math.floor(Math.random() * lines.length)] || '...')}”</i></p><p>Bond +${r.pts}${r.after > r.before ? ` · <b class="gold">bond ${r.after}!</b>` : ''}</p>`), buttons: [{ label: 'Until tomorrow', value: true }] });
  return r;
}
/** Give gifts: liked ones count double; her tastes show once the bond reveals them. */
export function giftDialog(hid) {
  const h = get(hid), unl = get('rules:growth').bondUnlocks || [];
  const lvAt = k => (unl.find(u => u.reveals === k) || {}).level || 99;
  const body = () => {
    const lv = bondLevel(prog(hid).bond || 0);
    const gifts = all('item').filter(i => i.category === 'gift' && qty(i.id) > 0);
    const shown = id => { const t = giftTaste(hid, id).taste; return (t === 'liked' && lv >= lvAt('likes')) ? '♥' : (t === 'disliked' && lv >= lvAt('dislikes')) ? '✕' : ''; };
    return gifts.length ? `<div class="gift-grid">${gifts.map(i => `<button class="gift" data-g="${i.id}" title="${esc(i.name)}"><img src="${iconUrl(i.id)}" alt=""><em>${qty(i.id)}</em>${shown(i.id) ? `<span class="${shown(i.id) === '♥' ? 'lk' : 'dk'}">${shown(i.id)}</span>` : ''}<small>${esc(i.name)}</small></button>`).join('')}</div>
      <p class="mut">Bond ${lv} · ${num(prog(hid).bond || 0)} points. Her likes show at bond ${lvAt('likes')}, her dislikes at bond ${lvAt('dislikes')}.</p>`
      : '<p class="mut">No gifts yet. Old Qian sells some at the Ford, and they drop in the Journey.</p>';
  };
  return App.dialog({
    title: `A gift for ${h.name}`, cn: '赠礼', body: `<div class="gd">${body()}</div>`, buttons: [{ label: 'Done', value: true }],
    onOpen: (w) => w.addEventListener('click', e => {
      const b = e.target.closest('.gift'); if (!b) return;
      const r = giveGift(hid, b.dataset.g); if (!r) return;
      sfx(r.taste === 'liked' ? 'crit' : 'heal');
      App.toast(`${esc(h.name)} ${r.taste === 'liked' ? 'loves it' : r.taste === 'disliked' ? 'accepts it politely' : 'thanks you'}: bond +${r.pts}${r.after > r.before ? ` · bond ${r.after}!` : ''}`);
      w.querySelector('.gd').innerHTML = body();
    }),
  });
}

function cultivateDialog(hid) {
  const sel = Object.fromEntries(PILLS.map(id => [id, 0]));
  const p = prog(hid), h = get(hid);
  const preview = () => {
    const plan = pillPlan(sel);
    let lv = p.level, exp = p.exp + plan.exp; const cap = levelCap(p.bt);
    while (lv < cap && exp >= expToNext(lv)) { exp -= expToNext(lv); lv++; }
    return { plan, lv };
  };
  const body = () => {
    const { plan, lv } = preview();
    const have = PILLS.filter(id => qty(id) > 0);
    return `${have.length ? have.map(id => `<div class="pill-row"><img src="${iconUrl(id)}" alt=""><b>${esc(get(id).name)}<small>+${num(get(id).exp)} EXP · you have ${qty(id)}</small></b>
      <div class="stepper"><button data-k="-" data-id="${id}">−</button><span>${sel[id]}</span><button data-k="+" data-id="${id}">+</button></div></div>`).join('')
      : '<p class="mut">No EXP pills yet. They drop in Peach Blossom Ford and come from first clears.</p>'}
      <p>Level <b class="gold">${p.level} → ${lv}</b> · +${num(plan.exp)} EXP · <img class="ic" src="${iconUrl('cur:spirit_stones')}" style="width:24px;vertical-align:-5px"> ${num(plan.stones)} Spirit Stones (you have ${num(qty('cur:spirit_stones'))})</p>`;
  };
  return App.dialog({
    title: `Cultivate ${h.name}`, cn: '修炼', body: `<div class="cv">${body()}</div>`,
    buttons: [{ label: 'Cancel', cls: 'ink', value: false }, { label: 'Auto-fill', cls: 'ink', keep: true, onClick: (w) => { const cap = levelCap(p.bt); for (const id of PILLS) sel[id] = 0; for (const id of PILLS) { while (sel[id] < qty(id) && preview().lv < cap) sel[id]++; } w.querySelector('.cv').innerHTML = body(); } }, { label: 'Cultivate', value: true }],
    onOpen: (w) => w.addEventListener('click', e => {
      const b = e.target.closest('.stepper button'); if (!b) return;
      const id = b.dataset.id;
      if (b.dataset.k === '+' && sel[id] < qty(id)) sel[id]++;
      if (b.dataset.k === '-' && sel[id] > 0) sel[id]--;
      w.querySelector('.cv').innerHTML = body();
    }),
  }).then(ok => {
    if (!ok) return;
    if (!Object.values(sel).some(Boolean)) return;
    const r = usePills(hid, sel);
    if (!r) { App.toast('Not enough Spirit Stones'); return; }
    sfx('heal');
    App.toast(r.after > r.before ? `${esc(h.name)} reaches level ${r.after}!` : `${esc(h.name)} gains EXP`);
  });
}

function breakthroughDialog(hid) {
  const h = get(hid), p = prog(hid), from = realmOf(p.bt), to = nextRealm(p.bt), cost = breakthroughCost(hid);
  const ok = canPay(cost);
  const s0 = finalStats(hid, p.level, p.bt), s1 = finalStats(hid, p.level, p.bt + 1);
  return App.dialog({
    title: 'Breakthrough', cn: '突破',
    body: `<p><b class="gold">${esc(h.name)}</b> stands at the peak of <b>${esc(from.name)} ${esc(from.cn)}</b>. Breaking through to <b>${esc(to.name)} ${esc(to.cn)}</b> raises her level cap to ${levelCap(p.bt + 1)}, every stat by 10%, and opens ${p.bt + 1 <= 5 ? 'a meridian slot' : 'the way to the Ren and Du vessels'}.</p>
      <div class="got" style="justify-content:flex-start">${cost.map(c => `<div class="rw-i${qty(c.item || c.cur) >= c.qty ? '' : ' done'}"><img src="${iconUrl(c.item || c.cur)}" alt=""><em>${num(qty(c.item || c.cur))}/${num(c.qty)}</em></div>`).join('')}</div>
      <p class="mut">Health ${num(s0.hp)} → ${num(s1.hp)} · Attack ${num(s0.atk)} → ${num(s1.atk)} · Defense ${num(s0.def)} → ${num(s1.def)}</p>
      ${ok ? '' : `<p style="color:#ff9a8a">You need ${cost.filter(c => qty(c.item || c.cur) < c.qty).map(c => esc(get(c.item || c.cur).name)).join(' and ')}. The first Foundation Pill comes from the Wraith Captain.</p>`}`,
    buttons: [{ label: 'Not yet', cls: 'ink', value: false }, { label: 'Break through', cls: ok ? '' : 'off', value: true }],
  }).then(async go => {
    if (!go || !ok) return;
    if (!breakthrough(hid)) { App.toast('The breakthrough failed'); return; }
    sfx('thunder');
    await App.dialog({ title: 'Breakthrough!', cn: to.cn, body: `<div style="text-align:center"><div style="width:220px;height:330px;margin:0 auto;border-radius:14px;background:url(${cardUrl(hid)}) center 15%/cover;box-shadow:0 0 50px #ffcf5a, inset 0 0 0 2px #ffcf5a;animation:pulse 1.4s infinite"></div><p><b class="gold">${esc(h.name)}</b> enters <b>${esc(to.name)}</b>. Her level cap rises to ${levelCap(p.bt)}${p.bt <= 5 ? ', and a meridian slot opens' : ''}.</p></div>`, buttons: [{ label: 'Wonderful', value: true }] });
  });
}
