// Boot: stage scaling, the frame loop that drives battles, asset preloading, the save, then the title screen.
import { ui, board, BT, clock, tickClock, timeScale, initVfx, resizeVfx, updateVfx, renderVfx, shakeState, tutorial, configureRules, loadAll, FX_LIST, initAudio } from './engine.js';
import { get, SLICE_HEROES, heroArt, stageBattle, heroUnit, hdStage, trialStage } from './data.js';
import { loadSave, SAVE, addPiece, equip, heroBonus, gainHero, finalStats, grant, rollDrops } from './state.js';
import { makePiece, makeArtefact } from './gear.js';
import { App } from './app.js';
import { Scene, Flow } from './story.js';
import './journey.js';
import './hall.js';
import './heroines.js';
import './pond.js';
import './ring.js';
import './sect.js';
import './trials.js';
import './forge.js';
import { initTips, hideTip } from './tips.js';

const stage = document.getElementById('stage');
const battleEl = document.getElementById('battle');
ui.init(battleEl);
initVfx(battleEl.querySelector('#fxb'), battleEl.querySelector('#fxf'));
const world = battleEl.querySelector('#world');
configureRules(get('rules:combat'));
App.boot(stage);
initTips(stage);

/** Space left for the stage: the viewport minus the page's side gutter and the safe-area padding on :root. */
function insets() {
  const rs = getComputedStyle(document.documentElement), bs = getComputedStyle(document.body);
  return { l: parseFloat(bs.paddingLeft) || 0, r: parseFloat(bs.paddingRight) || 0, t: parseFloat(rs.paddingTop) || 0, b: parseFloat(rs.paddingBottom) || 0 };
}
function layout() {
  const ins = insets(), H = 720;
  const vw = Math.max(320, window.innerWidth - ins.l - ins.r), vh = Math.max(200, window.innerHeight - ins.t - ins.b);
  const W = Math.round(Math.max(1280, Math.min(1640, vw / vh * H))); // 16:9 fills the screen (PC first)
  const s = Math.min(vw / W, vh / H);
  stage.style.width = W + 'px'; stage.style.height = H + 'px';
  stage.style.transform = `translate(${(ins.l + (vw - W * s) / 2).toFixed(1)}px, ${(ins.t + (vh - H * s) / 2).toFixed(1)}px) scale(${s})`;
  board.layoutBoard(W, H);
  stage.style.setProperty('--x0', board.geo.x0 + 'px');
  stage.style.setProperty('--rowW', (4 * board.CARD.w + 3 * board.CARD.gap) + 'px');
  resizeVfx(W, H, s);
  for (const u of BT.B.units) if (u.el) board.placeCard(u);
  tutorial.relayout();
}
window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => setTimeout(layout, 200));
layout();

let last = performance.now();
function frame(now) {
  const dt = Math.min(50, now - last); last = now;
  if (!clock.paused) {
    const g = dt * clock.speed * timeScale(dt);
    tickClock(g);
    board.updateBoard(g, BT.B.units);
    updateVfx(g);
  }
  renderVfx();
  world.style.transform = shakeState.x || shakeState.y ? `translate3d(${shakeState.x.toFixed(1)}px,${shakeState.y.toFixed(1)}px,0)` : '';
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Preload the effect sprites (drawn on canvas) and the first screens' art.
const assets = [
  ...FX_LIST.map(k => ['fx_' + k, `assets/fx/${k}.webp`]),
  ['bg_pavilion', 'assets/bg/pavilion.webp'],
  ...SLICE_HEROES.map(h => ['card_' + h, `assets/cards/${heroArt(h).card}.webp`]),
];
const ld = document.getElementById('loading');
Promise.all([loadSave(), loadAll(assets, p => {
  ld.querySelector('#load-bar b').style.width = (p * 100).toFixed(0) + '%';
  ld.querySelector('#load-pct').textContent = (p * 100).toFixed(0) + '%';
})]).then(() => {
  ld.classList.add('gone');
  setTimeout(() => ld.remove(), 700);
  App.go('title', {}, { root: true });
  const unlock = () => { initAudio(); window.removeEventListener('pointerdown', unlock); };
  window.addEventListener('pointerdown', unlock);
});
// Android (Capacitor): the hardware back button steps back through the game instead of closing it
const capApp = window.Capacitor?.Plugins?.App;
if (capApp?.addListener) capApp.addListener('backButton', () => { if (!hideTip() && !App.hardwareBack()) capApp.minimizeApp?.(); });

window.__ib = {
  App, BT, clock, tutorial, save: () => SAVE.data,
  /** Test hook: fight a stage with any team at a given level. */
  fight: (stageId, team, level = 5) => App.runBattle(stageBattle(get(stageId), team, {}, 'array:yellow_dragon', { fixedLevel: level })),
  /** Test hook: play one story scene. */
  scene: (sceneId) => Scene.play(sceneId),
  /** Test hooks for gear: make pieces, equip them, fight with owned heroines, their levels and their gear. */
  gear: { makePiece, makeArtefact, addPiece, equip, heroBonus, finalStats, gainHero, grant, rollDrops },
  fightOwned: (stageId, team) => App.runBattle(stageBattle(get(stageId), team, SAVE.data.heroes, 'array:yellow_dragon', { gear: heroBonus })),
  /** Test hook: fight with growth records ({ hid: { level, bt, petals, mastery, meridians, bond } }), no gear. */
  fightWith: (stageId, team, progress) => App.runBattle(stageBattle(get(stageId), team, progress, 'array:yellow_dragon', {})),
  /** Test hook: fight a stage (or its Heaven-Defying version) with the save's heroines, their growth and gear. */
  fightSave: (stageId, team, hd = false) => App.runBattle(stageBattle(hd ? hdStage(get(stageId)) : get(stageId), team, SAVE.data.heroes, 'array:yellow_dragon', { gear: heroBonus })),
  /** Test hook: a heroine's tribulation (trial id) with the save's heroines, their growth and gear. */
  fightTrial: (trialId, hid, team) => App.runBattle(stageBattle(trialStage(get(trialId), hid), team, SAVE.data.heroes, 'array:yellow_dragon', { gear: heroBonus })),
  heroUnit,
  flow: Flow, get,
  /** Test hook: drive the game clock in fixed steps (no frame pacing) until `done` settles, so a battle resolves in
   *  seconds; clock.t still counts the game time a player would watch at x1. `onInput` runs at the first input phase. */
  turbo: async (done, { step = 20, cap = 1800e3, onInput } = {}) => {
    let fin = false, out; done.then(r => { fin = true; out = r; });
    const ch = new MessageChannel(); let wake = null; ch.port1.onmessage = () => wake && wake();
    const yieldNow = () => new Promise(r => { wake = r; ch.port2.postMessage(0); });
    clock.paused = true; const t0 = clock.t; let fired = !onInput;
    try {
      while (!fin && clock.t - t0 < cap) {
        tickClock(step); board.updateBoard(step, BT.B.units); updateVfx(step);
        await yieldNow();
        if (!fired && BT.B.phase === 'input') { fired = true; onInput(); }
      }
    } finally { clock.paused = false; }
    return fin ? out : { timeout: true };
  },
};
