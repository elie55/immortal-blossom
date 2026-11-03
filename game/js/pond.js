// The Fate Pond: summon heroines with Fate Incense. A lotus opens (white 3★, violet 4★, gold 5★), the cards flip,
// and every new heroine introduces herself. The first ten-summon is guided by Tao Yao.
import { App, npcSays, esc, phTag, starStr } from './app.js';
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
    // after the "Invocation" mockup: the pond's 5★ heroines on the left, the featured one in the light of the lotus
    // altar with her banner, her card and two more beside it, the rates and the pity counter on the right
    const first = guided && !data().pond.guided;
    const fives = [feat, ...by[5].filter(h => h !== feat)].filter(Boolean).slice(0, 4);
    const side = [feat, ...[...by[5].filter(h => h !== feat), ...by[4]].slice(0, 2)].filter(Boolean);
    const gap = pond.pity.guaranteedAt, done = gap - pityLeft();
    const incense = '<img class="ic" src="assets/icons/fate_incense.webp" alt="">';
    el.innerHTML = `<div class="scr-bg" style="background-image:url(assets/bg/${hasArt('bg/summon_altar.webp') ? 'summon_altar' : (hasArt('bg/home_terrace.webp') ? 'home_terrace' : 'pavilion')}.webp)"></div><div class="scr-shade"></div>
      <div class="pond-altar"><i></i></div>
      ${f ? `<div class="pond-hero" style="background-image:url(${cardUrl(feat)})" data-tip="${feat}"></div>` : ''}
      ${App.topbar({ title: 'Fate Pond', cn: '命池', back: false, chips: ['cur:immortal_jade', 'cur:fate_incense', 'cur:blossom_dew'], icon: 'assets/ui/hall_pond.webp' })}
      <div class="pond-list">${fives.map((h, i) => `<div class="pl-e${i === 0 ? ' on' : ''}" data-tip="${h}"><div class="pl-art" style="background-image:url(${cardUrl(h)})"></div>
        <span><b>${i === 0 ? 'Featured' : esc(get(h).name)}</b><small>${i === 0 ? esc(get(h).name) : `${esc(get(h).title)}`}</small><i>${starStr(5)}</i></span></div>`).join('')}</div>
      ${f ? `<div class="pond-banner"><span class="ribbon">Featured 5★</span>
        <div class="pb-band"><b>${esc(f.name)}</b><small>Half of every 5★ summon brings ${esc(f.name)}, ${esc(f.title)}.</small></div>
        <div class="pb-pill">${first ? 'Your first ten summons are guided' : `${phTag(phaseOf(f.phase))} ${esc(get(f.phase)?.name || '')} · ${esc(get(f.path)?.name || '')}`}</div></div>` : ''}
      <div class="pond-cards">${side.map((h, i) => `<div class="pc-c${i === 0 ? ' big' : ''}" data-tip="${h}" style="background-image:url(${cardUrl(h)})"><img src="assets/ui/orb_${phaseOf(get(h).phase)}.webp" alt=""><i>${starStr(get(h).rarity)}</i></div>`).join('')}</div>
      <div class="pond-side">
        <button class="tplate" data-act="rates"><img src="${hasArt('ui/ic_rates.webp') ? 'assets/ui/ic_rates.webp' : 'assets/ui/hall_phases.webp'}" alt=""><b>Rates</b></button>
        <div class="tplate"><img src="${hasArt('ui/ic_gift.webp') ? 'assets/ui/ic_gift.webp' : 'assets/ui/hall_pond.webp'}" alt=""><b>Fate</b></div>
        <div class="pity"><b>${first ? '—' : `${done} / ${gap}`}</b><div class="pf-bar"><i style="width:${first ? 0 : Math.round(done / gap * 100)}%"></i></div></div>
        <div class="pity-note">${f ? `<img src="${cardUrl(feat)}" alt="">` : ''}<span>${first ? 'A 5★ answers your first ten summons!' : `A 5★ within <b>${pityLeft()}</b> summons · ${data().pond.fatePoints} Fate Points`}</span></div>
      </div>
      <div class="pond-act">
        <button class="pbtn" data-act="one"${first ? ' disabled' : ''}><b>Summon ×1</b><small>${incense} ×1</small></button>
        <button class="pbtn red" data-act="ten"><b>Summon ×10</b><small>${incense} ×10</small></button>
      </div>
      ${first ? '' : App.nav('pond')}`;
    if (guided && !data().pond.guided) setTimeout(() => App.dialog({ title: 'Tao Yao', cn: '桃夭', body: npcSays('npc:tao_yao', '<p>Light ten sticks of Fate Incense at once and follow the threads. Whoever answers will walk down to Peach Blossom Ford with you. I have a very good feeling about this one!</p>'), buttons: [{ label: 'Light the incense', value: true }] }), 400);
    const run = async (n) => {
      if (qty('cur:fate_incense') < n) { App.toast(`You need ${n} Fate Incense. Clear stages and open star chests for more.`); return; }
      const res = summon(n);
      if (!res) return;
      await reveal(el, res);
      if (guided) { App.go('hall', {}, { root: true }); return; }
      App.go('pond', {}, { replace: true });
    };
    App.bind(el, {
      one: () => run(1), ten: () => run(10),
      rates: () => App.dialog({ title: 'Rates', cn: '概率', body: `<p>5★ <b class="gold">${(pond.rates['5'] * 100).toFixed(0)}%</b> · 4★ <b class="gold">${(pond.rates['4'] * 100).toFixed(0)}%</b> · 3★ <b class="gold">${(pond.rates['3'] * 100).toFixed(0)}%</b></p>
        <p>Half of every 5★ summon brings the featured heroine. Ten summons always bring a 4★ or better. From the ${pond.pity.softFrom}th summon without a 5★ the odds rise, and the ${pond.pity.guaranteedAt}th is certain.</p>
        <p class="mut">In the pond: ${SLICE_HEROES.map(h => `${esc(get(h).name)} ${starStr(get(h).rarity)}`).join(', ')}.</p>` }),
    });
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
