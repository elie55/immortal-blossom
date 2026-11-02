// Boot: stage scaling, asset loading, frame loop, start/restart.

const stage = document.getElementById('stage');
ui.init(stage);
initVfx(document.getElementById('fxb'), document.getElementById('fxf'));
const world = document.getElementById('world');

/** Space left for the stage: the viewport minus the page's side gutter and the safe-area padding on :root. */
function insets() {
  const rs = getComputedStyle(document.documentElement), bs = getComputedStyle(document.body);
  return { l: parseFloat(bs.paddingLeft) || 0, r: parseFloat(bs.paddingRight) || 0, t: parseFloat(rs.paddingTop) || 0, b: parseFloat(rs.paddingBottom) || 0 };
}
function layout() {
  const ins = insets(), H = 720;
  const vw = Math.max(320, window.innerWidth - ins.l - ins.r), vh = Math.max(200, window.innerHeight - ins.t - ins.b);
  const W = Math.round(Math.max(1360, Math.min(1640, vw / vh * H)));
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

async function start(withTutorial) {
  clock.timers.length = 0; board.clearTweens(); clock.hitstop = 0; clock.slowUntil = 0;
  BT.B.endTurnResolve = null; BT.B.auto = false; BT.B.gate = null;
  tutorial.stop();
  if (withTutorial) tutorial.begin();
  await BT.startBattle({ tutorial: withTutorial });
}
ui.onRestart = (withTutorial) => start(withTutorial);

const assets = [
  ...FX_LIST.map(k => ['fx_' + k, `assets/fx/${k}.webp`]),
  ...HEROES.map(h => ['card_' + h.key, `assets/cards/${h.art}.webp`]),
  ...HEROES.map(h => ['cut_' + h.key, `assets/ui/${h.cutin}.webp`]),
  ...HEROES.flatMap(h => h.techs.map(t => ['ic_' + t.icon, `assets/ui/${t.icon}.webp`])),
  ...[...new Set(Object.values(ENEMIES).map(e => e.art))].map(a => ['card_' + a, `assets/cards/${a}.webp`]),
  ['bg', 'assets/bg/arena.webp'], ['taoyao', 'assets/ui/taoyao.webp'],
];
const ld = document.getElementById('loading');
loadAll(assets, p => {
  ld.querySelector('#load-bar b').style.width = (p * 100).toFixed(0) + '%';
  ld.querySelector('#load-pct').textContent = (p * 100).toFixed(0) + '%';
}).then(() => {
  ld.classList.add('ready');
  const go = (tut) => { initAudio(); ld.classList.add('gone'); start(tut); };
  document.getElementById('btn-start').addEventListener('click', () => go(true));
  document.getElementById('btn-skip').addEventListener('click', () => go(false));
  if (new URLSearchParams(location.search).has('auto')) { go(false); setTimeout(() => BT.setAuto(true), 1500); }
  if (new URLSearchParams(location.search).has('tut')) go(true);
});
window.__ibc = { BT, board, clock, ui, tutorial };
