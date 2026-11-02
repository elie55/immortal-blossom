// Heroines: the roster, a heroine's overview (stats, techniques, Twin Blooms, profile), Cultivate and Breakthrough.
import { App, esc, phTag, starStr, SET_COLOR } from './app.js';
import { get, all, cardUrl, faceUrl, heroArt, phaseOf, SLICE_HEROES, expToNext, levelCap, realmOf, nextRealm, iconUrl, num } from './data.js';
import { data, persist, owned, prog, qty, atCap, breakthroughCost, breakthrough, canPay, pillPlan, usePills, finalStats, heroBonus } from './state.js';
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

App.register('heroine', {
  cls: 'heroine',
  render(el, { hid, tab = 'tech' }) {
    const h = get(hid), p = prog(hid), art = heroArt(hid), s = finalStats(hid), realm = realmOf(p.bt);
    const cap = levelCap(p.bt), need = expToNext(p.level), capped = p.level >= cap;
    const combos = all('combo').filter(c => c.members.includes(hid));
    const techs = h.skills.map((sid, i) => ({ sk: get(sid), icon: art.icons[i] }));
    const passives = h.passives.map(get);
    const icon = ic => ic.startsWith('g:') ? `<span>${ic.slice(2)}</span>` : `<img src="assets/ui/${ic}.webp" alt="">`;
    const nr = nextRealm(p.bt);
    el.innerHTML = `<div class="scr-bg" style="background-image:url(assets/bg/pavilion.webp);filter:blur(6px) brightness(.4)"></div><div class="scr-shade"></div>
      ${App.topbar({ title: h.name, cn: h.cn, chips: ['cur:spirit_stones', 'item:qi_gathering_pill', 'cur:blossom_dew'] })}
      <div class="hv-art" style="background-image:url(${cardUrl(hid)})"><span class="stars">${starStr(h.rarity)}</span><span class="cnm">${esc(h.cn)}</span></div>
      <div class="hv-info panel">
        <h2>${esc(h.name)}</h2><div class="ttl">${esc(h.title)}</div>
        <div class="tagline">${phTag(phaseOf(h.phase))} ${esc(get(h.phase).name)} · ${esc(get(h.path).name)} · ${esc(get(h.faction)?.name || '')}</div>
        <div class="realm"><b>${esc(realm.cn)}</b><span>${esc(realm.name)}</span></div>
        <div class="lvl">Level ${p.level} <small>/ ${cap}</small></div>
        <div class="expbar"><i style="width:${capped ? 100 : Math.min(100, p.exp / need * 100).toFixed(1)}%"></i></div>
        <div class="mut" style="font:600 17px Oswald">${capped ? (nr ? `Level cap: break through to ${esc(nr.name)} to go on (${num(p.exp)} EXP banked)` : 'Peak of cultivation') : `${num(p.exp)} / ${num(need)} EXP`}</div>
        <div class="stats"><div>Health <b>${num(s.hp)}</b></div><div>Attack <b>${num(s.atk)}</b></div><div>Defense <b>${num(s.def)}</b></div><div>Critical <b>${Math.round(s.crit * 100)}%</b></div><div>Crit damage <b>${Math.round(s.critDmg * 100)}%</b></div><div>Haste <b>${s.haste}</b></div></div>
        <div class="petal-row">Dao Blossom ${[1, 2, 3, 4, 5, 6].map(n => `<i class="${n <= p.petals ? 'on' : ''}"></i>`).join('')}</div>
        <div class="hv-btns">
          <button class="btn jade" data-act="cultivate"${capped ? ' disabled' : ''}>Cultivate</button>
          <button class="btn${capped && nr ? '' : ' off'}" data-act="break">Breakthrough</button>
          <button class="btn ink" data-act="lobby">${data().lobby === hid ? 'In the hall' : 'Show in hall'}</button>
        </div>
      </div>
      <div class="hv-tabs panel">
        <div class="tabs"><button class="${tab === 'tech' ? 'on' : ''}" data-act="tab" data-t="tech">Techniques</button><button class="${tab === 'gear' ? 'on' : ''}" data-act="tab" data-t="gear">Gear</button><button class="${tab === 'twin' ? 'on' : ''}" data-act="tab" data-t="twin">Twin Blooms</button><button class="${tab === 'prof' ? 'on' : ''}" data-act="tab" data-t="prof">Profile</button></div>
        ${tab === 'gear' ? `${heroGearStrip(hid)}${gearSets(hid)}<button class="btn" data-act="gear" style="margin-top:6px">Manage gear</button>` : ''}
        ${tab === 'tech' ? techs.map(({ sk, icon: ic }, i) => `<div class="tq"><div class="ic">${icon(ic)}</div><div><b>${esc(sk.name)}</b><small>${['S1', 'S2', 'S3 · ULTIMATE'][i]} · CD ${sk.cooldown}</small><p>${esc(sk.text)}</p>${sk.empower ? `<p class="emp">✦ Empower (${sk.empower.cost} Spirit Qi): ${esc(sk.empower.text)}</p>` : ''}</div></div>`).join('')
          + passives.map((ps, i) => `<div class="tq${p.level >= [30, 50][i] ? '' : ' locked'}"><div class="ic"><span>${['卅', '五'][i]}</span></div><div><b>${esc(ps.name)}</b><small>PASSIVE · LEVEL ${[30, 50][i]}</small><p>${esc(ps.text)}</p></div></div>`).join('') : ''}
        ${tab === 'twin' ? (combos.length ? combos.map(c => { const mate = c.members.find(m => m !== hid); const m = get(mate);
          return `<div class="tq${owned(mate) ? '' : ' locked'}"><div class="ic">${faceUrl(mate) ? `<img src="${faceUrl(mate)}" alt="">` : `<span>${esc((m.cn || m.name)[0])}</span>`}</div><div><b>${esc(c.name)} ${esc(c.cn)}</b><small>WITH ${esc(m.name.toUpperCase())}${owned(mate) ? '' : ' · NOT MET'}</small><p>${esc(c.text)}</p><p class="emp">${esc(c.howTo)}</p></div></div>`; }).join('') : '<p class="mut">She has no Twin Bloom yet.</p>') : ''}
        ${tab === 'prof' ? `<div class="prof"><p><i>“${esc(h.quotes?.intro || '')}”</i></p>${Object.entries(h.profile || {}).map(([k, v]) => `<b>${esc(k.toUpperCase())}</b>${esc(v)}`).join('')}<b>FLOWER</b>${esc(h.flower)}<b>BIRTHDAY · ZODIAC</b>${esc(h.birthday || '')} · ${esc(h.zodiac || '')}</div>` : ''}
      </div>`;
    App.bind(el, {
      tab: (b) => App.go('heroine', { hid, tab: b.dataset.t }, { replace: true }),
      gear: () => App.go('ring', { hid }),
      lobby: () => { data().lobby = hid; persist(); App.toast(`${esc(h.name)} now waits in the hall`); App.go('heroine', { hid, tab }, { replace: true }); },
      cultivate: () => cultivateDialog(hid).then(() => App.go('heroine', { hid, tab }, { replace: true })),
      break: () => { if (!atCap(hid)) { App.toast(`Reach level ${cap} first`); return; } breakthroughDialog(hid).then(() => App.go('heroine', { hid, tab }, { replace: true })); },
    });
    void iconUrl; void qty; void canPay;
  },
});

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
    body: `<p><b class="gold">${esc(h.name)}</b> stands at the peak of <b>${esc(from.name)} ${esc(from.cn)}</b>. Breaking through to <b>${esc(to.name)} ${esc(to.cn)}</b> raises her level cap to ${levelCap(p.bt + 1)} and every stat by 10%.</p>
      <div class="got" style="justify-content:flex-start">${cost.map(c => `<div class="rw-i${qty(c.item || c.cur) >= c.qty ? '' : ' done'}"><img src="${iconUrl(c.item || c.cur)}" alt=""><em>${num(qty(c.item || c.cur))}/${num(c.qty)}</em></div>`).join('')}</div>
      <p class="mut">Health ${num(s0.hp)} → ${num(s1.hp)} · Attack ${num(s0.atk)} → ${num(s1.atk)} · Defense ${num(s0.def)} → ${num(s1.def)}</p>
      ${ok ? '' : `<p style="color:#ff9a8a">You need ${cost.filter(c => qty(c.item || c.cur) < c.qty).map(c => esc(get(c.item || c.cur).name)).join(' and ')}. The first Foundation Pill comes from the Wraith Captain.</p>`}`,
    buttons: [{ label: 'Not yet', cls: 'ink', value: false }, { label: 'Break through', cls: ok ? '' : 'off', value: true }],
  }).then(async go => {
    if (!go || !ok) return;
    if (!breakthrough(hid)) { App.toast('The breakthrough failed'); return; }
    sfx('thunder');
    await App.dialog({ title: 'Breakthrough!', cn: to.cn, body: `<div style="text-align:center"><div style="width:220px;height:330px;margin:0 auto;border-radius:14px;background:url(${cardUrl(hid)}) center 15%/cover;box-shadow:0 0 50px #ffcf5a, inset 0 0 0 2px #ffcf5a;animation:pulse 1.4s infinite"></div><p><b class="gold">${esc(h.name)}</b> enters <b>${esc(to.name)}</b>. Her level cap rises to ${levelCap(p.bt)}.</p></div>`, buttons: [{ label: 'Wonderful', value: true }] });
  });
}
void V;
