// The title screen, the Pavilion Hall (lobby) and settings.
import { App, esc } from './app.js';
import { get, cardUrl, npcUrl, SLICE_HEROES, hasArt } from './data.js';
import { data, flags, hasProgress, ownedHeroes, owned, qty, persist, exportCode, importCode, resetSave, SAVE } from './state.js';
import { Flow } from './story.js';

// ---------------- title ----------------
App.register('title', {
  cls: 'title-scr',
  render(el) {
    const cont = hasProgress();
    el.innerHTML = `<div class="scr-bg" style="background-image:url(assets/bg/${hasArt('bg/jade_pool.webp') ? 'jade_pool' : 'pavilion'}.webp)"></div><div class="scr-shade"></div>
      <div class="logo"><div class="cn">百花仙阁</div><h1>IMMORTAL BLOSSOMS</h1><p>Rebuild the fallen Pavilion. Gather the reborn Blossoms.</p></div>
      <div class="title-btns">${cont ? '<button class="btn" data-act="cont">Continue</button>' : '<button class="btn" data-act="new">Begin</button>'}${cont ? '<button class="btn ink" data-act="settings">Settings</button>' : ''}</div>
      <div class="title-foot">VERTICAL SLICE · CHAPTER 1 · SAVED ON THIS DEVICE</div>`;
    App.bind(el, {
      new: () => Flow.newGame(),
      cont: () => {
        if (!flags()['pond:fate_pond'] && !data().stages['stage:v1c1_02']?.clear) { Flow.playStage(Flow.nextStage().id); return; }
        if (!data().pond.guided) { App.go('pond', { guided: true }, { root: true }); return; }
        App.go('hall', {}, { root: true });
      },
      settings: () => settingsDialog(),
    });
  },
});

// ---------------- Pavilion Hall ----------------
const LOCKED = { sect: 'The Sect mountain opens with the core loop alpha', market: 'The Market opens with the core loop alpha', trials: 'Trials open after chapter 2' };
App.register('hall', {
  cls: 'hall',
  render(el) {
    const d = data();
    const mine = ownedHeroes();
    const lobby = (d.lobby && owned(d.lobby)) ? d.lobby : mine[0];
    const lh = lobby && get(lobby);
    const next = Flow.nextStage();
    const feat = SLICE_HEROES.find(h => get(h).rarity === 5);
    el.innerHTML = `<div class="scr-bg" style="background-image:url(assets/bg/pavilion.webp)"></div><div class="scr-shade"></div>
      ${lh ? `<div class="lobby-girl" data-act="tap" style="background-image:url(${cardUrl(lobby)})"></div>
        <div class="lobby-name"><span>${esc(lh.cn)}</span><b>${esc(lh.name)}</b><small>${esc(lh.title)}</small></div>` : ''}
      ${App.topbar({ back: false, title: 'Hundred Blossoms Pavilion', cn: '百花阁', chips: ['cur:spirit_stones', 'cur:immortal_jade', 'cur:fate_incense', 'cur:blossom_dew'] })}
      <div class="hall-left">
        <div class="disc" data-act="settings"><i>設</i>Settings</div>
        <div class="disc" data-act="rules"><i>五</i>Five Phases</div>
        <div class="disc" data-act="ring"><i>戒</i>Storage Ring</div>
        <div class="disc locked" data-act="locked" data-k="trials"><i>途</i>Path of Ascension</div>
      </div>
      <div class="hall-menu">
        <button class="hm" data-act="journey"><span class="g">历</span><span><b>Journey</b><small>${next ? `Next: ${esc(next.name)}` : 'Chapter 1 complete'}</small></span>${next ? '<i class="dot"></i>' : ''}</button>
        <button class="hm" data-act="heroines"><span class="g">芳</span><span><b>Heroines</b><small>${mine.length} of ${SLICE_HEROES.length} gathered</small></span></button>
        <button class="hm" data-act="pond"><span class="g">莲</span><span><b>Fate Pond</b><small>${qty('cur:fate_incense')} Fate Incense</small></span>${qty('cur:fate_incense') >= 1 ? '<i class="dot"></i>' : ''}</button>
        <button class="hm locked" data-act="locked" data-k="sect"><span class="g">宗</span><span><b>The Sect</b><small>Caves, garden, alchemy</small></span></button>
        <button class="hm locked" data-act="locked" data-k="market"><span class="g">市</span><span><b>Market</b><small>Myriad Treasures Guild</small></span></button>
      </div>
      ${feat ? `<div class="hall-banner" data-act="pond" style="background-image:url(${cardUrl(feat)})"><div><b>Fate Pond · Featured</b><small>${esc(get(feat).name)} ${esc(get(feat).cn)}, ${esc(get(feat).title)}</small></div></div>` : ''}`;
    const say = (text, who = 'npc:tao_yao') => {
      el.querySelector('.bubble')?.remove();
      const b = document.createElement('div'); b.className = 'bubble';
      b.style.left = '9%'; b.style.top = '150px';
      b.innerHTML = `${who === 'npc:tao_yao' ? '<b style="font-family:Cinzel">Tao Yao</b><br>' : ''}${text}`;
      el.appendChild(b); clearTimeout(this._bt); this._bt = setTimeout(() => b.remove(), 5200);
    };
    if (!flags().seen.hall) { flags().seen.hall = true; persist(); setTimeout(() => say(`Welcome home, Pavilion Master! Smoke still rises over <b>Peach Blossom Ford</b>: open the <b>Journey</b> when your team is ready.`), 600); }
    else if (next && Math.random() < 0.5) setTimeout(() => say(`Next on the road: <b>${esc(next.name)}</b>.`), 700);
    App.bind(el, {
      journey: () => App.go('journey', {}),
      heroines: () => App.go('heroines', {}),
      pond: () => App.go('pond', {}),
      settings: () => settingsDialog(),
      rules: () => App.rulesDialog(),
      ring: () => App.go('ring', {}),
      locked: (b) => App.toast(LOCKED[b.dataset.k] || 'Coming soon'),
      tap: () => { const q = lh.quotes || {}; const lines = [q.intro, q.victory, q.ultimate, lh.profile?.motto].filter(Boolean); say(`<b style="font-family:Cinzel">${esc(lh.name)}</b><br>“${esc(lines[Math.floor(Math.random() * lines.length)])}”`, lobby); },
    });
    void npcUrl;
  },
});

// ---------------- settings ----------------
export function settingsDialog() {
  const s = data().settings;
  const where = { idb: 'this browser (IndexedDB)', local: 'this browser (local storage)', memory: 'memory only: export a save code to keep it' }[SAVE.storage];
  return App.dialog({
    title: 'Settings', cn: '设置',
    body: `<p>Progress is saved automatically in ${where}.</p>
      <div class="pill-row"><b>Sound effects</b><button class="btn ink" data-k="mute">${s.muted ? 'Off' : 'On'}</button></div>
      <div class="pill-row"><b>Story text speed</b><button class="btn ink" data-k="text">${s.textSpeed >= 2 ? 'Fast' : 'Normal'}</button></div>
      <div class="pill-row"><b>Save code<small>Copy it to keep your progress or move it to another device.</small></b><button class="btn ink" data-k="export">Export</button><button class="btn ink" data-k="import">Import</button></div>
      <div class="pill-row"><b>Start over<small>Erase this save and begin again.</small></b><button class="btn red" data-k="reset">Reset</button></div>
      <div class="exp-area"></div>`,
    buttons: [{ label: 'Close', value: true }],
    onOpen: (w, close) => w.addEventListener('click', async e => {
      const b = e.target.closest('[data-k]'); if (!b) return;
      const area = w.querySelector('.exp-area');
      if (b.dataset.k === 'mute') { s.muted = !s.muted; b.textContent = s.muted ? 'Off' : 'On'; persist(); }
      if (b.dataset.k === 'text') { s.textSpeed = s.textSpeed >= 2 ? 1 : 2.5; b.textContent = s.textSpeed >= 2 ? 'Fast' : 'Normal'; persist(); }
      if (b.dataset.k === 'export') { area.innerHTML = `<textarea readonly>${exportCode()}</textarea>`; const t = area.querySelector('textarea'); t.select(); try { await navigator.clipboard.writeText(t.value); App.toast('Save code copied'); } catch (err) { App.toast('Select the code and copy it'); } }
      if (b.dataset.k === 'import') {
        area.innerHTML = `<textarea placeholder="Paste a save code here"></textarea><div class="dlg-btns"><button class="btn" data-k="load">Load this save</button></div>`;
      }
      if (b.dataset.k === 'load') { try { await importCode(area.querySelector('textarea').value); close(true); App.toast('Save loaded'); App.go('title', {}, { root: true }); } catch (err) { App.toast('That code is not a valid save'); } }
      if (b.dataset.k === 'reset') { if (await App.confirm('Start over?', 'This erases every heroine, item and cleared stage on this device.', 'Erase')) { await resetSave(); close(true); App.go('title', {}, { root: true }); } }
    }),
  });
}
