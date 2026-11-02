// The Fate Pond: summon heroines with Fate Incense. A lotus opens (white 3★, violet 4★, gold 5★), the cards flip,
// and every new heroine introduces herself. The first ten-summon is guided by Tao Yao.
import { App, esc, phTag, starStr } from './app.js';
import { get, cardUrl, phaseOf, SLICE_HEROES, hasArt, num } from './data.js';
import { qty, pondPool, pityLeft, summon, data, grant } from './state.js';
import { sfx } from './engine.js';

const RC = { 3: '#dfe8ff', 4: '#c58bff', 5: '#ffcf5a' };
App.register('pond', {
  cls: 'pond',
  render(el, { guided } = {}) {
    const { pond, by } = pondPool();
    const feat = pond.featured.order.find(h => by[5].includes(h)) || by[5][0];
    const f = feat && get(feat);
    const inc = qty('cur:fate_incense');
    if (guided && inc < 10 && !data().pond.guided) grant([{ cur: 'cur:fate_incense', qty: 10 - inc }]);
    el.innerHTML = `<div class="scr-bg" style="background-image:url(assets/bg/${hasArt('bg/fate_pond.webp') ? 'fate_pond' : 'pavilion'}.webp)"></div><div class="scr-shade"></div>
      ${App.topbar({ title: 'Fate Pond', cn: '命池', back: !guided, chips: ['cur:immortal_jade', 'cur:fate_incense', 'cur:blossom_dew'] })}
      ${f ? `<div class="pond-feat" style="background-image:url(${cardUrl(feat)})"><div><i>FEATURED 5★</i><b>${esc(f.name)} <span class="cn" style="font-size:28px">${esc(f.cn)}</span></b><small>${esc(f.title)} · half of every 5★ summon</small></div></div>` : ''}
      <div class="pond-info panel"><h3>RATES</h3>5★ ${(pond.rates['5'] * 100).toFixed(0)}% · 4★ ${(pond.rates['4'] * 100).toFixed(0)}% · 3★ ${(pond.rates['3'] * 100).toFixed(0)}%<br>
        Ten summons always bring a 4★ or better. From the ${pond.pity.softFrom}th summon without a 5★ the odds rise, and the ${pond.pity.guaranteedAt}th is certain.
        <h3 style="margin-top:10px">YOUR FATE</h3>${data().pond.guided ? `A 5★ within <b class="gold">${pityLeft()}</b> summons · ${data().pond.fatePoints} Fate Points` : '<b class="gold">Your first ten summons are guided: a 5★ will answer.</b>'}
        <h3 style="margin-top:10px">IN THE POND</h3><div style="display:flex;gap:6px;flex-wrap:wrap">${SLICE_HEROES.map(h => `<span title="${esc(get(h).name)}">${phTag(phaseOf(get(h).phase))}</span>`).join('')}</div></div>
      <div class="pond-act">
        <button class="btn ink" data-act="one"${guided && !data().pond.guided ? ' disabled' : ''}>Summon ×1<small><img class="ic" src="assets/icons/fate_incense.webp" style="width:22px;height:22px;vertical-align:-5px"> 1</small></button>
        <button class="btn" data-act="ten">Summon ×10<small><img class="ic" src="assets/icons/fate_incense.webp" style="width:22px;height:22px;vertical-align:-5px"> 10</small></button>
      </div>`;
    if (guided && !data().pond.guided) setTimeout(() => App.dialog({ title: 'Tao Yao', cn: '桃夭', body: `<div style="display:flex;gap:18px;align-items:center"><img src="assets/npc/tao_yao.webp" style="width:150px;height:150px;border-radius:50%;object-fit:cover;object-position:50% 20%"><p>Light ten sticks of Fate Incense at once and follow the threads. Whoever answers will walk down to Peach Blossom Ford with you. I have a very good feeling about this one!</p></div>`, buttons: [{ label: 'Light the incense', value: true }] }), 400);
    const run = async (n) => {
      if (qty('cur:fate_incense') < n) { App.toast(`You need ${n} Fate Incense. Clear stages and open star chests for more.`); return; }
      const res = summon(n);
      if (!res) return;
      await reveal(el, res);
      if (guided) { App.go('hall', {}, { root: true }); return; }
      App.go('pond', {}, { replace: true });
    };
    App.bind(el, { one: () => run(1), ten: () => run(10) });
    void num;
  },
});

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
