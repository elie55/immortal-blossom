// The Fate Pond: summon heroines with Fate Incense. A lotus opens (white 3★, violet 4★, gold 5★), the cards flip,
// and every new heroine introduces herself. The first ten-summon is guided by Tao Yao.
import { App, npcSays, esc, phTag, starStr } from './app.js';
import { get, cardUrl, phaseOf, SLICE_HEROES, hasArt, num } from './data.js';
import { qty, pondPool, pityLeft, summon, data, grant } from './state.js';
import { sfx } from './engine.js';

const RC = { 3: '#dfe8ff', 4: '#c58bff', 5: '#ffcf5a' };
App.register('pond', {
  cls: 'stg stg-pond pond',
  render(el, { guided } = {}) {
    const { pond, by } = pondPool();
    const feat = pond.featured.order.find(h => by[5].includes(h)) || by[5][0];
    const f = feat && get(feat);
    const inc = qty('cur:fate_incense');
    if (guided && inc < 10 && !data().pond.guided) grant([{ cur: 'cur:fate_incense', qty: 10 - inc }]);
    // the "Invocation" stage: the painted heroine and dragon over the lotus altar; the banner list on the left, the
    // featured card beside the banner, the rates, the history and the pity on the right
    const first = guided && !data().pond.guided;
    const gap = pond.pity.guaranteedAt, done = gap - pityLeft();
    const incense = '<img src="assets/icons/fate_incense.webp" alt="">';
    const ic = k => (hasArt(`ui/${k}.webp`) ? `assets/ui/${k}.webp` : 'assets/ui/hall_pond.webp');
    const lst = (i, label, sub, act) => `<button class="plq pl-plq p${i}${i === 2 ? ' lit' : ''}" data-act="${act}"><b>${label}${sub ? `<small>${sub}</small>` : ''}</b></button>`;
    el.innerHTML = `<div class="scr-bg"></div>
      ${App.chrome('pond', { chips: ['cur:spirit_stones', 'cur:immortal_jade', 'cur:fate_incense', 'cur:blossom_dew'] })}
      <div class="plq title-plq p1"><b>Fate Pond</b></div>
      ${lst(2, 'Featured Banner', f ? esc(f.name) : '', 'rates')}
      ${lst(3, 'In the Pond', `${SLICE_HEROES.length} heroines`, 'pool')}
      ${lst(4, 'Your Fate', first ? 'guided' : `${data().pond.fatePoints} Fate Points`, 'fate')}
      ${lst(5, 'Summon History', `${data().log?.summons || 0} summons`, 'history')}
      ${f ? `<div class="pond-ribbon">Featured 5★</div>
        <div class="pond-band"><b>${esc(f.name)}</b><small>Half of every 5★ summon brings ${esc(f.name)}, ${esc(f.title)}.</small></div>
        <div class="pond-pill">${first ? 'Your first ten summons are guided' : `${phTag(phaseOf(f.phase))} ${esc(get(f.phase)?.name || '')} · ${esc(get(f.path)?.name || '')}`}</div>
        <div class="pond-feat-art" data-tip="${feat}" style="background-image:url(${cardUrl(feat)})"><img src="assets/ui/orb_${phaseOf(f.phase)}.webp" alt=""><i>${starStr(5)}</i></div>` : ''}
      <button class="plq pr-plq tplq p1" data-act="rates"><img src="${ic('ic_rates')}" alt=""><b>Rates</b></button>
      <button class="plq pr-plq tplq p2" data-act="history"><img src="${ic('ic_book')}" alt=""><b>History</b></button>
      <button class="plq pr-plq tplq p3" data-act="fate"><img src="${ic('ic_gift')}" alt=""><b>Fate</b></button>
      <div class="pity-num">${first ? 'Guided' : `${done} / ${gap}`}</div>
      <div class="pity-bar"><i style="width:${first ? 0 : Math.round(done / gap * 100)}%"></i></div>
      <div class="pity-note">${f ? `<img src="${cardUrl(feat)}" alt="">` : ''}<span>${first ? 'A 5★ answers your first ten summons!' : `A 5★ within <b>${pityLeft()}</b> summons`}</span></div>
      <button class="pbtn one" data-act="one"${first ? ' disabled' : ''}><b>Summon ×1</b><small>${incense} ×1</small></button>
      <button class="pbtn ten" data-act="ten"><b>Summon ×10</b><small>${incense} ×10</small></button>
      ${first ? '' : App.nav('pond')}`;
    if (guided && !data().pond.guided) setTimeout(() => App.dialog({ title: 'Tao Yao', cn: '桃夭', body: npcSays('npc:tao_yao', '<p>Light ten sticks of Fate Incense at once and follow the threads. Whoever answers will walk down to Peach Blossom Ford with you. I have a very good feeling about this one!</p>'), buttons: [{ label: 'Light the incense', value: true }] }), 400);
    const run = async (n) => {
      if (qty('cur:fate_incense') < n) { App.toast(`You need ${n} Fate Incense. Clear stages and open star chests for more.`); return; }
      const res = summon(n);
      if (!res) return;
      data().log.summons = (data().log.summons || 0) + n;
      await reveal(el, res);
      if (guided) { App.go('hall', {}, { root: true }); return; }
      App.go('pond', {}, { replace: true });
    };
    const rates = () => App.dialog({ title: 'Rates', cn: '概率', body: `<p>5★ <b class="gold">${(pond.rates['5'] * 100).toFixed(0)}%</b> · 4★ <b class="gold">${(pond.rates['4'] * 100).toFixed(0)}%</b> · 3★ <b class="gold">${(pond.rates['3'] * 100).toFixed(0)}%</b></p>
        <p>Half of every 5★ summon brings the featured heroine, ${f ? esc(f.name) : ''}. Ten summons always bring a 4★ or better. From the ${pond.pity.softFrom}th summon without a 5★ the odds rise, and the ${pond.pity.guaranteedAt}th is certain.</p>` });
    App.bind(el, {
      one: () => run(1), ten: () => run(10), rates,
      pool: () => App.dialog({ title: 'In the Pond', cn: '命池', body: `<div class="pk-grid">${SLICE_HEROES.map(h => `<div class="pk" data-tip="${h}"><img src="${cardUrl(h)}" alt=""><b>${esc(get(h).name)}</b><small>${starStr(get(h).rarity)} · ${esc(get(get(h).phase)?.name || '')}</small></div>`).join('')}</div>` }),
      fate: () => App.dialog({ title: 'Your Fate', cn: '命', body: `<p>${first ? 'Your first ten summons are guided: a 5★ will answer.' : `A 5★ is certain within <b class="gold">${pityLeft()}</b> summons. You hold <b class="gold">${data().pond.fatePoints}</b> Fate Points.`}</p><p class="mut">Every summon without a 5★ brings the guaranteed one closer; a 5★ resets the count.</p>` }),
      history: () => App.dialog({ title: 'Summon History', cn: '记', body: `<p>${data().log.summons || 0} summons so far · ${ownedCount()} heroines gathered.</p>` }),
    });
    void num;
  },
});
const ownedCount = () => Object.keys(data().heroes || {}).length;

/** The reveal: a lotus opens in the colour of the best result, then each card flips; new 4★ and 5★ heroines introduce themselves. */
async function reveal(el, res) {
  const best = Math.max(...res.map(r => get(r.hero).rarity));
  const ov = document.createElement('div'); ov.className = 'reveal';
  ov.innerHTML = `<div class="bud" style="--pc:${RC[best]}">${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<i style="--r:${i * 45}deg;transform:rotate(${i * 45}deg) scale(.3)"></i>`).join('')}<div class="core"></div></div>`;
  el.appendChild(ov);
  sfx('charge');
  await new Promise(r => setTimeout(r, 300));
  ov.querySelector('.bud').classList.add('open');
  sfx(best === 5 ? 'win' : 'ult');
  await new Promise(r => setTimeout(r, best === 5 ? 1900 : 1300));
  ov.innerHTML = `<div class="pulls${res.length === 1 ? ' one' : ''}">${res.map(r => { const h = get(r.hero);
    return `<div class="pull" style="--rc:${RC[h.rarity]}"><div><div class="front" style="background-image:url(${cardUrl(r.hero)})"><em>${r.isNew ? 'NEW' : (r.petal ? `PETAL ${r.petal}` : `+${r.dew} DEW`)}</em><b>${esc(h.name)}</b><small>${starStr(h.rarity)}</small></div><div class="back">蓮</div></div></div>`; }).join('')}</div>`;
  const cards = [...ov.querySelectorAll('.pull')];
  for (let i = 0; i < cards.length; i++) { await new Promise(r => setTimeout(r, res.length > 1 ? 180 : 300)); cards[i].classList.add('flip'); sfx(get(res[i].hero).rarity >= 4 ? 'crit' : 'click'); }
  await new Promise(r => setTimeout(r, 600));
  for (const r of res) if (r.isNew && get(r.hero).rarity >= 4) await intro(ov, r.hero);
  await new Promise(r => { const tip = document.createElement('div'); tip.className = 'toast'; tip.style.animation = 'none'; tip.style.top = 'auto'; tip.style.bottom = '30px'; tip.textContent = 'Tap to continue'; ov.appendChild(tip); ov.addEventListener('click', r, { once: true }); });
  const fresh = res.filter(r => r.isNew && get(r.hero).rarity < 4);
  ov.remove();
  if (fresh.length) App.toast(`${fresh.map(r => esc(get(r.hero).name)).join(', ')} joined the Pavilion`);
}
function intro(ov, hid) {
  const h = get(hid);
  return new Promise(res => {
    const d = document.createElement('div'); d.className = 'intro';
    d.innerHTML = `<div class="art" style="background-image:url(${cardUrl(hid)})"></div><div class="txt"><div class="stars">${starStr(h.rarity)}</div><div class="cnm">${esc(h.cn)}</div><h1>${esc(h.name)}</h1>
      <div class="tg">${phTag(phaseOf(h.phase))} ${esc(get(h.phase).name)} · ${esc(get(h.path).name)} · ${esc(h.title)}</div><p>“${esc(h.quotes?.intro || '')}”</p><div class="mut" style="font:600 18px Cinzel">TAP TO CONTINUE</div></div>`;
    ov.appendChild(d); sfx('win');
    d.addEventListener('click', () => { d.remove(); res(); }, { once: true });
  });
}
