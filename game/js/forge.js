// The Artifact Forge (炼器阁): craft a piece of a chosen set and slot from a Forging Manual, forge Spirit Artefacts
// from Artefact Essence, and (from Mahayana) natal gear from fragments. One job at a time; it takes real hours.
import { App, esc, rewardChip, gearTile, slotGlyph, SET_COLOR, compact } from './app.js';
import { get, all, iconUrl, num, hasArt } from './data.js';
import { qty, canPay, forgeJob, startForge, collectForge, highestTierId } from './state.js';
import { ROMAN, tierOrder, rarityColor } from './gear.js';
import { twoPieceText } from './ring.js';
import { sfx } from './engine.js';

const SET_SLOTS = ['slot:helmet', 'slot:body', 'slot:gloves', 'slot:pants', 'slot:boots', 'slot:ring', 'slot:pendant'];
const recipes = () => (get('bld:artifact_forge')?.recipes || []).map(get).filter(Boolean);
const kindOf = r => (r.output?.gear ? 'set' : r.output?.art ? 'art' : 'unique');
const left = ms => { const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(x).padStart(2, '0')}s`; };
const odds = o => Object.entries(o).map(([k, v]) => `<span style="color:${rarityColor(k)}">${esc(get(k).name)} ${Math.round(v * 100)}%</span>`).join(' · ');

App.register('forge', {
  cls: 'forge',
  render(el, { tab = 'set', sel = null, slot = 'slot:helmet' } = {}) {
    const list = recipes().filter(r => kindOf(r) === tab);
    const cur = get(sel) || list[0];
    const job = forgeJob();
    const draw = () => {
      const j = forgeJob(), now = Date.now();
      const jr = j && get(j.recipe), ready = j && now >= j.end;
      const jobHtml = j ? `<div class="fg-job${ready ? ' ready' : ''}"><div class="fg-fire"></div>
          <b>${esc(jr.name)}</b>${j.slot ? `<small>${esc(get(j.slot).name)}</small>` : ''}
          <div class="expbar"><i style="width:${Math.min(100, (now - j.start) / (j.end - j.start) * 100).toFixed(1)}%"></i></div>
          <span class="fg-left">${ready ? 'Ready' : left(j.end - now)}</span>
          ${ready ? '<button class="btn jade" data-act="collect">Collect</button>' : ''}</div>`
        : '<p class="mut fg-idle">The furnace is cold. Choose a recipe and forge.</p>';
      el.querySelector('.fg-work').innerHTML = `<h3>THE FURNACE</h3>${jobHtml}<p class="mut fg-note">Crafted pieces are tier ${ROMAN[tierOrder(highestTierId())]}, the highest you have cleared.</p>`;
    };
    const out = cur?.output || {};
    const setRec = out.gear ? get(out.gear.set) : null;
    const missing = cur ? cur.inputs.filter(c => qty(c.item || c.cur) < c.qty) : [];
    const realmOk = !cur?.requiresRealm;
    el.innerHTML = `<div class="scr-bg" style="background-image:url(${hasArt('bg/artifact_forge.webp') ? 'assets/bg/artifact_forge.webp' : 'assets/bg/pavilion.webp'});filter:brightness(.5)"></div><div class="scr-shade"></div>
      ${App.topbar({ title: 'Artifact Forge', cn: '炼器阁', chips: ['cur:spirit_stones', 'item:forging_dust', 'item:black_iron', 'item:artefact_essence'] })}
      <div class="fg-work panel"></div>
      <div class="fg-list panel">
        <div class="tabs"><button class="${tab === 'set' ? 'on' : ''}" data-act="tab" data-t="set">Set pieces</button><button class="${tab === 'art' ? 'on' : ''}" data-act="tab" data-t="art">Artefacts</button><button class="${tab === 'unique' ? 'on' : ''}" data-act="tab" data-t="unique">Natal gear</button></div>
        <div class="fg-recipes">${list.map(r => { const o = r.output; const ic = o.gear ? `<span class="g" style="color:${SET_COLOR[o.gear.set]}">${esc(get(o.gear.set).cn[0])}</span>` : (o.art && iconUrl(o.art.replace('art:', 'art_')) ? '' : '');
          const icon = o.art ? (hasArt(`icons/art_${o.art.slice(4)}.webp`) ? `<img src="assets/icons/art_${o.art.slice(4)}.webp" alt="">` : '<span class="g">宝</span>') : (o.unique ? '<span class="g">命</span>' : ic);
          const manual = r.inputs.find(c => c.item && c.item.startsWith('item:manual_'));
          return `<div class="fg-r${r.id === cur?.id ? ' on' : ''}" data-act="sel" data-r="${r.id}"><div class="fg-ic">${icon}</div><span><b>${esc(r.name)}</b><small>${manual ? `${qty(manual.item)} manual${qty(manual.item) === 1 ? '' : 's'}` : (r.requiresRealm ? `Needs ${esc(get(r.requiresRealm).name)}` : `${r.hours || 1} h`)}</small></span></div>`; }).join('') || '<p class="mut">Nothing here yet.</p>'}</div>
      </div>
      <div class="fg-detail panel">${cur ? `<h2>${esc(cur.name)}</h2>
        ${setRec ? `<div class="pd-set"><b style="color:${SET_COLOR[setRec.id]}">${esc(setRec.name)} ${esc(setRec.cn)}</b><p class="on">2 pieces: ${esc(twoPieceText(setRec))}</p><p class="on">4 pieces · <b>${esc(setRec.fourPiece.name)}</b>: ${esc(setRec.fourPiece.text)}</p></div>
          <div class="sd-h">SLOT</div><div class="fg-slots">${SET_SLOTS.map(s => `<button class="${s === slot ? 'on' : ''}" data-act="slot" data-s="${s}"><i>${slotGlyph(s)}</i>${esc(get(s).name)}</button>`).join('')}</div>
          <p class="fg-odds">${odds(out.gear.rarityOdds)}</p>` : ''}
        ${out.art ? `<div class="pd-set"><b>${esc(get(out.art).name)} ${esc(get(out.art).cn)}</b><p class="on">${esc(get(out.art).passive.text)}</p><p>${esc(get(out.rarity)?.name || '')} · for the ${get(out.art).paths.map(p => (p === 'all' ? 'every' : esc(get(p)?.name))).join(' and ')} path</p></div>` : ''}
        ${out.unique ? `<div class="pd-set"><b>${esc(get(out.unique).name)} ${esc(get(out.unique).cn)}</b><p class="on">${esc(get(out.unique).effect)}</p></div>` : ''}
        <div class="sd-h">NEEDS · ${cur.hours || 1} HOURS</div>
        <div class="got" style="justify-content:flex-start">${cur.inputs.map(c => `<div class="rw-i${qty(c.item || c.cur) >= c.qty ? '' : ' done'}" title="${esc(get(c.item || c.cur)?.name)}">${iconUrl(c.item || c.cur) ? `<img src="${iconUrl(c.item || c.cur)}" alt="">` : '<span class="g">材</span>'}<em>${compact(qty(c.item || c.cur))}/${compact(c.qty)}</em></div>`).join('')}</div>
        ${missing.length ? `<p class="mut">${missing.map(c => esc(get(c.item || c.cur)?.name)).join(', ')}: ${missing.some(c => (c.item || '').startsWith('item:manual_')) ? 'manuals drop in the Demon Hunts.' : 'not enough yet.'}</p>` : ''}
        <div class="sd-btns"><button class="btn${!job && !missing.length && realmOk ? '' : ' off'}" data-act="forge">${job ? 'The furnace is busy' : (realmOk ? 'Forge' : `Needs ${esc(get(cur.requiresRealm).name)}`)}</button></div>` : ''}</div>`;
    draw();
    const timer = setInterval(() => { if (!el.isConnected) { clearInterval(timer); return; } if (forgeJob()) draw(); }, 1000);
    const again = (o = {}) => App.go('forge', { tab, sel: cur?.id, slot, ...o }, { replace: true });
    App.bind(el, {
      tab: (b) => App.go('forge', { tab: b.dataset.t }, { replace: true }),
      sel: (b) => again({ sel: b.dataset.r }),
      slot: (b) => again({ slot: b.dataset.s }),
      forge: () => {
        if (forgeJob()) { App.toast('One job at a time: collect the furnace first'); return; }
        if (!canPay(cur.inputs)) { App.toast('Missing materials'); return; }
        if (startForge(cur.id, out.gear ? slot : null)) { sfx('charge'); App.toast(`The furnace roars: ready in ${cur.hours || 1} hours`); again(); }
      },
      collect: async () => {
        const got = collectForge(); if (!got) return;
        sfx('crit');
        await App.dialog({ title: 'Forged!', cn: '出炉', body: `<div class="got" style="justify-content:center">${gearTile(got.gear, { cls: 'big' })}</div><p style="text-align:center">${esc(get(got.gear.rarity).name)} ${esc(got.gear.kind === 'art' ? get(got.gear.art).name : `${get(got.gear.set)?.name || ''} ${get(got.gear.slot).name}`)} joins your Storage Ring.</p>`, buttons: [{ label: 'Wonderful', value: true }] });
        again();
      },
    });
    void all; void rewardChip;
  },
});
