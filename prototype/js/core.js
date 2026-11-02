// Core helpers: game clock, async waits, asset loading, easing, tiny synth SFX.

const clock = { t: 0, speed: 1, paused: false, timers: [], hitstop: 0, slowUntil: 0, slowFactor: 1 };

/** Resolve after `ms` of *game* time (respects pause and the x2 speed toggle). */
function wait(ms) {
  return new Promise(res => clock.timers.push({ at: clock.t + ms, res }));
}
/** Freeze the whole battle for a few real milliseconds: the "impact frame" feel. */
function hitStop(ms) { clock.hitstop = Math.max(clock.hitstop, ms / clock.speed); }
/** Slow time down (factor < 1) for `ms` real milliseconds. */
function slowMo(factor, ms) { clock.slowFactor = factor; clock.slowUntil = performance.now() + ms / clock.speed; }
/** Game-time multiplier for this real frame (hit-stop > slow-mo > normal). */
function timeScale(dtReal) {
  if (clock.hitstop > 0) { clock.hitstop -= dtReal; return 0.02; }
  if (performance.now() < clock.slowUntil) return clock.slowFactor;
  return 1;
}
function tickClock(dtMs) {
  clock.t += dtMs;
  if (!clock.timers.length) return;
  const due = clock.timers.filter(t => t.at <= clock.t);
  if (due.length) {
    clock.timers = clock.timers.filter(t => t.at > clock.t);
    due.forEach(t => t.res());
  }
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const ease = {
  linear: t => t,
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inCubic: t => t * t * t,
  inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outQuint: t => 1 - Math.pow(1 - t, 5),
  inQuad: t => t * t,
  outQuad: t => 1 - (1 - t) * (1 - t),
  inQuint: t => t * t * t * t * t,
  outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: t => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outElastic: t => { if (t <= 0 || t >= 1) return t; return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1; },
};

const images = {};
function loadImage(key, src) {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => { images[key] = im; res(im); };
    im.onerror = () => { console.warn('missing image', src); res(null); };
    im.src = src;
  });
}
async function loadAll(list, onProgress) {
  let done = 0;
  await Promise.all(list.map(([k, s]) => loadImage(k, s).then(() => onProgress && onProgress(++done / list.length))));
}

// ---------- Synth SFX (no audio files needed; replace with real SFX later) ----------
let actx = null, master = null;
const audio = { muted: false };
function initAudio() {
  if (actx) return;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain(); master.gain.value = 0.55; master.connect(actx.destination);
  } catch (e) { actx = null; }
}
function noiseBuffer(sec) {
  const b = actx.createBuffer(1, Math.floor(actx.sampleRate * sec), actx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function env(g, t0, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
}
function noise({ dur = 0.3, type = 'bandpass', f0 = 2000, f1 = 600, q = 1, vol = 0.5, a = 0.005 }) {
  const t0 = actx.currentTime;
  const src = actx.createBufferSource(); src.buffer = noiseBuffer(dur + 0.05);
  const f = actx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
  const g = actx.createGain(); env(g, t0, a, vol, dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(t0); src.stop(t0 + dur + 0.05);
}
function tone({ dur = 0.3, type = 'sine', f0 = 440, f1 = 440, vol = 0.3, a = 0.005, delay = 0 }) {
  const t0 = actx.currentTime + delay;
  const o = actx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = actx.createGain(); env(g, t0, a, vol, dur);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + a + 0.05);
}
function sfx(name) {
  if (!actx || audio.muted || clock.paused) return;
  switch (name) {
    case 'slash': noise({ dur: 0.18, f0: 6000, f1: 900, q: 0.8, vol: 0.35 }); break;
    case 'hit': noise({ dur: 0.16, type: 'lowpass', f0: 1800, f1: 120, vol: 0.6 }); tone({ dur: 0.14, type: 'triangle', f0: 160, f1: 50, vol: 0.4 }); break;
    case 'crit': noise({ dur: 0.25, type: 'lowpass', f0: 3000, f1: 100, vol: 0.7 }); tone({ dur: 0.25, type: 'square', f0: 220, f1: 40, vol: 0.18 }); break;
    case 'dash': noise({ dur: 0.22, f0: 900, f1: 3500, q: 0.6, vol: 0.18 }); break;
    case 'fire': noise({ dur: 0.6, type: 'lowpass', f0: 900, f1: 200, vol: 0.5, a: 0.03 }); break;
    case 'boom': noise({ dur: 0.9, type: 'lowpass', f0: 1200, f1: 60, vol: 0.8, a: 0.01 }); tone({ dur: 0.7, type: 'sine', f0: 90, f1: 30, vol: 0.5 }); break;
    case 'ice': [1800, 2400, 3100].forEach((f, i) => tone({ dur: 0.35, type: 'triangle', f0: f, f1: f * 1.02, vol: 0.12, delay: i * 0.04 })); noise({ dur: 0.3, f0: 8000, f1: 3000, q: 2, vol: 0.15 }); break;
    case 'thunder': noise({ dur: 0.5, type: 'highpass', f0: 3000, f1: 400, vol: 0.55, a: 0.002 }); noise({ dur: 0.9, type: 'lowpass', f0: 400, f1: 50, vol: 0.6, a: 0.02 }); break;
    case 'heal': [523, 659, 784, 1046].forEach((f, i) => tone({ dur: 0.5, type: 'sine', f0: f, f1: f, vol: 0.13, delay: i * 0.07 })); break;
    case 'ghost': tone({ dur: 0.8, type: 'sawtooth', f0: 300, f1: 140, vol: 0.08, a: 0.1 }); noise({ dur: 0.7, f0: 700, f1: 300, q: 4, vol: 0.2, a: 0.1 }); break;
    case 'ult': tone({ dur: 1.2, type: 'sawtooth', f0: 110, f1: 440, vol: 0.12, a: 0.2 }); noise({ dur: 1.0, f0: 500, f1: 5000, q: 0.7, vol: 0.2, a: 0.3 }); break;
    case 'whoosh': noise({ dur: 0.28, f0: 400, f1: 4200, q: 0.9, vol: 0.22, a: 0.04 }); break;
    case 'charge': tone({ dur: 0.9, type: 'sine', f0: 180, f1: 900, vol: 0.12, a: 0.25 }); noise({ dur: 0.9, f0: 300, f1: 6000, q: 3, vol: 0.12, a: 0.4 }); break;
    case 'shatter': [2600, 3300, 4100, 5200].forEach((f, i) => tone({ dur: 0.25, type: 'triangle', f0: f, f1: f * 0.9, vol: 0.09, delay: i * 0.025 })); noise({ dur: 0.35, type: 'highpass', f0: 5000, f1: 2000, vol: 0.3 }); break;
    case 'rumble': noise({ dur: 1.2, type: 'lowpass', f0: 220, f1: 40, vol: 0.7, a: 0.05 }); break;
    case 'zap': noise({ dur: 0.12, type: 'highpass', f0: 6000, f1: 1500, vol: 0.35, a: 0.001 }); tone({ dur: 0.1, type: 'square', f0: 1400, f1: 300, vol: 0.06 }); break;
    case 'turn': tone({ dur: 0.12, type: 'sine', f0: 880, f1: 1320, vol: 0.08 }); break;
    case 'click': tone({ dur: 0.06, type: 'triangle', f0: 1200, f1: 900, vol: 0.08 }); break;
    case 'win': [392, 523, 659, 784, 1046].forEach((f, i) => tone({ dur: 0.7, type: 'triangle', f0: f, f1: f, vol: 0.15, delay: i * 0.12 })); break;
    case 'lose': [392, 349, 311, 262].forEach((f, i) => tone({ dur: 0.8, type: 'triangle', f0: f, f1: f * 0.98, vol: 0.15, delay: i * 0.2 })); break;
  }
}

