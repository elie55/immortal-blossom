// The title screen, the Pavilion Hall (lobby) and settings.
import { App, esc, PH_COLOR } from './app.js';
import { get, cardUrl, faceUrl, npcUrl, locBg, phaseOf, SLICE_HEROES, hasArt } from './data.js';
import { data, flags, hasProgress, ownedHeroes, owned, qty, persist, exportCode, importCode, resetSave, SAVE, lobbyTap, chapterStars } from './state.js';
import { Flow } from './story.js';
import { modeOpen } from './trials.js';
import { bldUnlocked, sectAlerts } from './sect.js';

// ---------------- title ----------------
App.register('title', {
  cls: 'title-scr',
  render(el) {
    const cont = hasProgress();
    el.innerHTML = `<div class="scr-bg" style="background-image:url(assets/bg/${hasArt('bg/jade_pool.webp') ? 'jade_pool' : 'pavilion'}.webp)"></div><div class="scr-shade"></div>
      <div class="logo"><div class="cn">百花仙阁</div><h1>IMMORTAL BLOSSOMS</h1><p>Rebuild the fallen Pavilion. Gather the reborn Blossoms.</p></div>
      <div class="title-btns">${cont ? '<button class="btn" data-act="cont">Continue</button>' : '<button class="btn" data-act="new">Begin</button>'}${cont ? '<button class="btn ink" data-act="settings">Settings</button>' : ''}</div>
      <div class="title-foot">CORE LOOP ALPHA · VOLUME 1 · SAVED ON THIS DEVICE</div>`;
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

// ---------------- the chrome's data: the profile plate, the bottom bar's locks and alerts, the settings ----------------
const lobbyHero = () => { const d = data(), mine = ownedHeroes(); return (d.lobby && owned(d.lobby)) ? d.lobby : mine[0]; };
App.profile = () => {
  const lob = lobbyHero(), ch = Flow.chapter(), st = ch ? chapterStars(ch) : { have: 0, max: 1 };
  return { face: lob ? (faceUrl(lob) || cardUrl(lob)) : 'assets/ui/taoyao.webp', name: 'Pavilion Master', lv: ch ? ch.number : 1,
    pct: st.max ? st.have / st.max : 0, line: ch ? `Chapter ${ch.number} · ★ ${st.have} / ${st.max}` : '' };
};
App.navState = () => ({
  locked: { sect: bldUnlocked('bld:main_hall') ? '' : 'The Sect opens as you clear Peach Blossom Ford', market: bldUnlocked('bld:tea_house') ? '' : 'The Market opens once chapter 1 is cleared' },
  dots: { pond: qty('cur:fate_incense') >= 1, sect: bldUnlocked('bld:main_hall') && !!sectAlerts() },
});
App.openSettings = () => settingsDialog();

// ---------------- Pavilion Hall (the home screen) ----------------
/** A menu icon from assets/ui (tools/hall_icons.py, tools/ui_kit.py), or a fallback while the art is missing. */
const menuArt = (key, fb = '') => (hasArt(`ui/${key}.webp`) ? `assets/ui/${key}.webp` : (fb ? `assets/ui/${fb}.webp` : ''));

App.register('hall', {
  cls: 'stg stg-home hall',
  render(el) {
    const mine = ownedHeroes();
    const lobby = lobbyHero();
    const lh = lobby && get(lobby);
    const next = Flow.nextStage(), ch = Flow.chapter();
    const feat = SLICE_HEROES.find(h => get(h).rarity === 5);
    const team = (data().team || []).filter(h => owned(h)).slice(0, 4);
    for (const h of mine) { if (team.length >= 4) break; if (!team.includes(h)) team.push(h); }
    const trialsOpen = modeOpen('mode:hunts');
    const plq = (cls, act, icon, label, opts = {}) => `<button class="plq ${cls}${opts.locked ? ' locked' : ''}${opts.on ? ' on' : ''}" data-act="${act}" aria-label="${esc(label)}"><img src="${icon}" alt=""><b>${label}</b>${opts.dot ? '<i class="dot">!</i>' : ''}</button>`;
    el.innerHTML = `<div class="scr-bg"></div>
      ${App.chrome('home', { cn: '百花阁' })}
      ${lh ? `<button class="lobby-tap" data-act="tap" aria-label="${esc(lh.name)}"></button>` : ''}
      ${plq('hl-plq p1', 'trials', menuArt('ic_trophy', 'hall_trials'), 'Trials', { locked: !trialsOpen })}
      ${plq('hl-plq p2', 'ring', menuArt('ic_ring', 'hall_ring'), 'Storage Ring')}
      ${plq('hl-plq p3', 'sect', menuArt('ic_home', 'hall_sect'), 'The Sect', { locked: !bldUnlocked('bld:main_hall'), dot: bldUnlocked('bld:main_hall') && !!sectAlerts() })}
      ${feat ? `<button class="hall-event" data-act="pond"><div class="he-art" style="background-image:url(${cardUrl(feat)})"></div>
        <span class="ribbon">Featured 5★</span><b>${esc(get(feat).name)}</b><small>${esc(get(feat).title)}</small><em>Fate Pond · half of every 5★</em></button>` : ''}
      <div class="hall-team"><div class="ht-label">My Team</div><button class="ht-edit hit round" data-gact="nav" data-to="team" aria-label="Edit the team"></button>
        ${[0, 1, 2, 3, 4].map(i => { const h = team[i]; return h ? `<div class="ht-c p${i + 1}" data-tip="${h}" style="background-image:url(${cardUrl(h)})"><img class="ht-ph" src="assets/ui/orb_${phaseOf(get(h).phase)}.webp" alt=""><i>${'★'.repeat(get(h).rarity)}</i></div>` : `<div class="ht-c empty p${i + 1}"></div>`; }).join('')}</div>
      <div class="hall-camp" data-act="journey">
        <div class="hc-art" style="background-image:url(${ch ? locBg(ch.location) : 'assets/bg/peach_ford.webp'})"></div>
        <div class="hc-plate"><img src="${menuArt('ic_banner', 'hall_journey')}" alt=""><b>Journey</b><small>${next ? esc(next.name) : 'Volume 1 complete'}</small></div>
      </div>
      <button class="hall-go" data-act="go"><span>${next ? 'Begin' : 'Journey'}</span></button>
      ${plq('hr-plq tplq p1', 'pond', menuArt('ic_summon', 'hall_pond'), 'Fate Pond', { dot: qty('cur:fate_incense') >= 1 })}
      ${plq('hr-plq tplq p2', 'heroines', menuArt('ic_book', 'hall_heroines'), 'Heroines')}
      ${plq('hr-plq tplq p3', 'team', menuArt('ic_team', 'tab_gear'), 'Team')}
      ${App.nav('hall')}`;
    const say = (text, who = 'npc:tao_yao') => {
      el.querySelector('.bubble')?.remove();
      const b = document.createElement('div'); b.className = 'bubble';
      b.style.left = '300px'; b.style.top = '130px';
      b.innerHTML = `${who === 'npc:tao_yao' ? '<b style="font-family:Cinzel">Tao Yao</b><br>' : ''}${text}`;
      el.appendChild(b); clearTimeout(this._bt); this._bt = setTimeout(() => b.remove(), 5200);
    };
    App.openNews = () => say(next ? `Next on the road: <b>${esc(next.name)}</b>.${sectAlerts() ? ' The Sect has news for you.' : ''}` : 'Volume 1 is complete. More chapters come with the content beta.');
    if (!flags().seen.hall) { flags().seen.hall = true; persist(); setTimeout(() => say(`Welcome home, Pavilion Master! Smoke still rises over <b>Peach Blossom Ford</b>: press <b>Begin</b> when your team is ready.`), 600); }
    else if (next && Math.random() < 0.5) setTimeout(() => say(`Next on the road: <b>${esc(next.name)}</b>.`), 700);
    App.bind(el, {
      journey: () => App.go('journey', {}),
      go: () => (next ? Flow.playStage(next.id) : App.go('journey', {})),
      trials: () => (trialsOpen ? App.go('trials', {}) : App.toast('Trials open once Peach Blossom Ford is safe (clear chapter 1)')),
      heroines: () => App.navGo('heroines'),
      pond: () => App.navGo('pond'),
      team: () => App.navGo('team'),
      sect: () => App.navGo('sect'),
      ring: () => App.go('ring', {}),
      tap: () => { const q = lh.quotes || {}; const lines = [q.intro, q.victory, q.ultimate, lh.profile?.motto].filter(Boolean); const b = lobbyTap(lobby); say(`<b style="font-family:Cinzel">${esc(lh.name)}</b><br>“${esc(lines[Math.floor(Math.random() * lines.length)])}”${b ? `<br><small style="color:#f6b3cc">Bond +${b.pts}${b.after > b.before ? ` · bond ${b.after}!` : ''}</small>` : ''}`, lobby); },
    });
    void npcUrl; void PH_COLOR;
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
