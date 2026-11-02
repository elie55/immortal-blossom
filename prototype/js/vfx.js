// VFX layer: two transparent canvases (behind and in front of the cards) in stage coordinates.
// Sprite effects (alpha-luminance art drawn additively), shockwave rings, procedural lightning,
// light pillars, god rays, particles, screen flash and floating combat text.

const view = { W: 1600, H: 720, s: 1, dpr: 1 };
const L = { back: null, front: null };   // { cv, ctx }
const fxBack = [], fxFront = [], parts = [], texts = [];
let flashA = 0, flashColor = '#fff', flashDecay = 0.004;
const shakeState = { amp: 0, until: 0, dur: 1, x: 0, y: 0 };
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function initVfx(back, front) {
  L.back = { cv: back, ctx: back.getContext('2d') };
  L.front = { cv: front, ctx: front.getContext('2d') };
  makeGlows();
}
function resizeVfx(W, H, s) {
  view.W = W; view.H = H; view.s = s; view.dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const l of [L.back, L.front]) {
    l.cv.width = Math.round(W * s * view.dpr); l.cv.height = Math.round(H * s * view.dpr);
    l.cv.style.width = W + 'px'; l.cv.style.height = H + 'px';
  }
}

// ---------------- screen effects ----------------
function shake(amp = 8, dur = 260) {
  if (reduceMotion) amp *= 0.3;
  shakeState.amp = Math.max(amp, shakeState.amp * 0.5); shakeState.until = clock.t + dur; shakeState.dur = dur;
}
function flash(color = '#ffffff', a = 0.5, decay = 0.004) { flashColor = color; flashA = (reduceMotion ? a * 0.4 : a) * 0.6; flashDecay = decay * 0.6; }

// ---------------- glow sprites ----------------
const glowCache = {};
const COL = { white: [255, 255, 255], gold: [255, 214, 120], fire: [255, 130, 50], ice: [140, 210, 255], violet: [195, 120, 255], jade: [120, 255, 170], pink: [255, 150, 200], cyan: [80, 255, 230], red: [255, 70, 60], green: [140, 255, 120] };
function makeGlows() {
  for (const [k, c] of Object.entries(COL)) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.22, `rgba(${c},0.95)`); gr.addColorStop(0.55, `rgba(${c},0.35)`); gr.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); glowCache[k] = cv;
  }
  const soft = (name, rgb, a) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(0.5, `rgba(${rgb},${a * 0.45})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); glowCache[name] = cv;
  };
  soft('smoke', '70,62,80', 0.32); soft('dust', '214,198,170', 0.4);
}

/**
 * Sprite effect. o: x,y, w, rot, dur, delay, fadeIn, fadeOut, s0,s1, vx,vy, spin, flip, alpha, blend,
 * ax,ay (anchor), sy (squash), path(k)->{x,y,rot}, back (behind cards), sweep {a0,a1,t,color}, bloom, flicker
 */
function fx(key, o = {}) {
  const img = key.startsWith('glow:') ? glowCache[key.slice(5)] : images['fx_' + key];
  if (!img) return null;
  const e = {
    kind: 'img', img, x: o.x || 0, y: o.y || 0, w: o.w || img.width, rot: o.rot || 0, t0: clock.t + (o.delay || 0), dur: o.dur || 600,
    fadeIn: o.fadeIn ?? 0.1, fadeOut: o.fadeOut ?? 0.45, s0: o.s0 ?? 1, s1: o.s1 ?? 1, vx: o.vx || 0, vy: o.vy || 0,
    ax: o.ax ?? 0.5, ay: o.ay ?? 0.5, spin: o.spin || 0, flip: !!o.flip, alpha: o.alpha ?? 1, blend: o.blend || 'lighter',
    sy: o.sy ?? 1, e: o.ease || ease.outCubic, path: o.path || null, sweep: o.sweep || null, bloom: o.bloom || 0, flicker: o.flicker || 0,
  };
  (o.back ? fxBack : fxFront).push(e);
  return e;
}
function ring(o) {
  const e = { kind: 'ring', x: o.x, y: o.y, r0: o.r0 ?? 10, r1: o.r1 ?? 200, w: o.width ?? 12, sy: o.sy ?? 1, rgb: COL[o.color || 'white'], t0: clock.t + (o.delay || 0), dur: o.dur || 500, alpha: o.alpha ?? 1, e: o.ease || ease.outCubic };
  (o.back ? fxBack : fxFront).push(e); return e;
}
function bolt(o) {
  const e = { kind: 'bolt', x0: o.x0, y0: o.y0, x1: o.x1, y1: o.y1, rgb: COL[o.color || 'violet'], w: o.width ?? 4, t0: clock.t + (o.delay || 0), dur: o.dur || 260, jitter: o.jitter ?? 0.22, branches: o.branches ?? 2, refresh: o.refresh ?? 45, seedAt: -1, pts: null, br: [], alpha: o.alpha ?? 1 };
  fxFront.push(e); return e;
}
function beam(o) {
  const e = { kind: 'beam', x: o.x, y: o.y, w: o.w ?? 120, h: o.h ?? 700, rgb: COL[o.color || 'white'], t0: clock.t + (o.delay || 0), dur: o.dur || 900, alpha: o.alpha ?? 1 };
  (o.back ? fxBack : fxFront).push(e); return e;
}
function rays(o) {
  const e = { kind: 'rays', x: o.x, y: o.y, rgb: COL[o.color || 'gold'], n: o.n ?? 14, len: o.len ?? 420, t0: clock.t + (o.delay || 0), dur: o.dur || 1400, spin: o.spin ?? 0.35, alpha: o.alpha ?? 0.6, seed: Math.random() * 10 };
  fxBack.push(e); return e;
}
/** Orb that flies along a curve from a to b (Phase Qi feedback). */
function orb(o) {
  const e = { kind: 'orb', x0: o.x0, y0: o.y0, x1: o.x1, y1: o.y1, col: o.color || 'gold', t0: clock.t + (o.delay || 0), dur: o.dur || 650, size: o.size || 18, arc: o.arc ?? -120 };
  fxFront.push(e); return e;
}

// ---------------- particles ----------------
/** vfx_emit(type, x, y, n, o): spark | glow | ember | shard | petal | wisp | smoke | snow | debris */
function vfx_emit(type, x, y, n, o = {}) {
  const sp = o.speed || [120, 520], an = o.angle || [0, Math.PI * 2], sz = o.size || defaultSize[type], lf = o.life || [350, 900];
  for (let i = 0; i < n; i++) {
    const a = rand(an[0], an[1]), v = rand(sp[0], sp[1]);
    const rx = o.rect ? rand(-o.rect[0] / 2, o.rect[0] / 2) : (o.spread ? rand(-o.spread, o.spread) : 0);
    const ry = o.rect ? rand(-o.rect[1] / 2, o.rect[1] / 2) : (o.spread ? rand(-o.spread, o.spread) * 0.6 : 0);
    parts.push({
      type, x: x + rx, y: y + ry, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.up || 0),
      g: o.gravity ?? gravityOf[type], drag: o.drag ?? dragOf[type], size: rand(sz[0], sz[1]), life: rand(lf[0], lf[1]), age: -(o.delay ? rand(0, o.delay) : 0),
      rot: rand(0, 6.28), vr: rand(-8, 8), rgb: COL[o.color || 'white'], col: o.color || 'white', ph: rand(0, 6.28), alpha: o.alpha ?? 1, back: !!o.back,
    });
  }
}
const defaultSize = { spark: [3, 6], glow: [12, 34], ember: [3, 7], shard: [6, 15], petal: [7, 12], wisp: [26, 60], smoke: [40, 90], snow: [2, 4.5], debris: [4, 9], dust: [30, 70] };
const gravityOf = { spark: 260, glow: 0, ember: -120, shard: 700, petal: 40, wisp: -70, smoke: -30, snow: 30, debris: 1200, dust: -20 };
const dragOf = { spark: 2.6, glow: 1.6, ember: 1.2, shard: 1.4, petal: 2.0, wisp: 1.4, smoke: 1.8, snow: 1.5, debris: 0.6, dust: 2.4 };

// ---------------- floating text ----------------
function floatText(text, x, y, style = 'dmg', o = {}) {
  texts.push({ text: String(text), x: x + rand(-6, 6), y, t0: clock.t + (o.delay || 0), style, label: o.label || null, rot: rand(-0.06, 0.06), dur: style === 'info' || style === 'harmony' ? 1400 : 1150, size: o.size });
}

// ---------------- update ----------------
function updateVfx(dt) {
  const t = clock.t, dts = dt / 1000;
  if (flashA > 0) flashA = Math.max(0, flashA - flashDecay * dt);
  for (const list of [fxBack, fxFront]) for (let i = list.length - 1; i >= 0; i--) if (t > list[i].t0 + list[i].dur) list.splice(i, 1);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.age += dt;
    if (p.age < 0) continue;
    if (p.age > p.life) { parts.splice(i, 1); continue; }
    const d = Math.exp(-p.drag * dts);
    p.vx *= d; p.vy = p.vy * d + p.g * dts;
    if (p.type === 'wisp' || p.type === 'petal' || p.type === 'ember' || p.type === 'snow') p.vx += Math.sin(p.age / 180 + p.ph) * 40 * dts * (p.type === 'petal' ? 3 : 1);
    p.x += p.vx * dts; p.y += p.vy * dts; p.rot += p.vr * dts;
  }
  if (parts.length > 1100) parts.splice(0, parts.length - 1100);
  for (let i = texts.length - 1; i >= 0; i--) if (t > texts[i].t0 + texts[i].dur) texts.splice(i, 1);
  if (t < shakeState.until) {
    const k = (shakeState.until - t) / shakeState.dur, a = shakeState.amp * k * k;
    shakeState.x = rand(-a, a); shakeState.y = rand(-a, a) * 0.7;
  } else { shakeState.x = 0; shakeState.y = 0; }
}

// ---------------- render ----------------
function renderVfx() {
  const sc = view.s * view.dpr;
  for (const [l, list, front] of [[L.back, fxBack, false], [L.front, fxFront, true]]) {
    const ctx = l.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, l.cv.width, l.cv.height);
    ctx.setTransform(sc, 0, 0, sc, 0, 0);
    drawFxList(ctx, list);
    drawParticles(ctx, !front);
    if (front) {
      drawTexts(ctx);
      if (flashA > 0.005) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, flashA); ctx.fillStyle = flashColor; ctx.fillRect(-50, -50, view.W + 100, view.H + 100); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    }
  }
}

function drawFxList(ctx, list) {
  const t = clock.t;
  for (const e of list) {
    if (t < e.t0) continue;
    const k = clamp((t - e.t0) / e.dur, 0, 1), el = (t - e.t0) / 1000;
    if (e.kind === 'ring') { drawRingFx(ctx, e, k); continue; }
    if (e.kind === 'bolt') { drawBolt(ctx, e, k, t); continue; }
    if (e.kind === 'beam') { drawBeam(ctx, e, k); continue; }
    if (e.kind === 'rays') { drawRays(ctx, e, k, el); continue; }
    if (e.kind === 'orb') { drawOrb(ctx, e, k); continue; }
    let a = e.alpha;
    if (k < e.fadeIn) a *= k / e.fadeIn;
    if (k > 1 - e.fadeOut) a *= (1 - k) / e.fadeOut;
    if (e.flicker) a *= 1 - e.flicker * Math.random();
    const scl = lerp(e.s0, e.s1, e.e(k));
    let x = e.x + e.vx * el, y = e.y + e.vy * el;
    if (e.path) { const p = e.path(k); x = p.x; y = p.y; if (p.rot != null) e.rot = p.rot; }
    const w = e.w * scl, h = w * (e.img.height / e.img.width);
    ctx.save(); ctx.globalAlpha = clamp(a, 0, 1); ctx.globalCompositeOperation = e.blend;
    ctx.translate(x, y); ctx.scale(1, e.sy); ctx.rotate(e.rot + e.spin * el); if (e.flip) ctx.scale(-1, 1);
    if (e.sweep) {
      const sk = ease.outCubic(clamp(k / (e.sweep.t || 0.35), 0, 1));
      const a0 = e.sweep.a0, a1 = a0 + (e.sweep.a1 - e.sweep.a0) * sk, R = Math.max(w, h);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, Math.min(a0, a1), Math.max(a0, a1)); ctx.closePath(); ctx.clip();
      if (sk < 1) { const r = (e.sweep.r ?? 0.36) * w; ctx.drawImage(glowCache[e.sweep.color || 'white'], Math.cos(a1) * r - w * 0.16, Math.sin(a1) * r - w * 0.16, w * 0.32, w * 0.32); }
    }
    ctx.drawImage(e.img, -w * e.ax, -h * e.ay, w, h);
    if (e.bloom) { ctx.globalAlpha = clamp(a * e.bloom, 0, 1); const b = 1.14; ctx.drawImage(e.img, -w * e.ax * b, -h * e.ay * b, w * b, h * b); }
    ctx.restore();
  }
}
function drawRingFx(ctx, e, k) {
  const v = e.e(k), r = lerp(e.r0, e.r1, v), a = e.alpha * Math.pow(1 - k, 1.4);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(e.x, e.y); ctx.scale(1, e.sy);
  ctx.strokeStyle = `rgba(${e.rgb},${a * 0.28})`; ctx.lineWidth = e.w * (1 - k) * 2.6 + 2; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = `rgba(${e.rgb},${a * 0.85})`; ctx.lineWidth = e.w * (1 - k) + 1; ctx.stroke();
  ctx.strokeStyle = `rgba(255,255,255,${a * 0.7})`; ctx.lineWidth = Math.max(1, e.w * (1 - k) * 0.3); ctx.stroke();
  ctx.restore();
}
function boltPoints(x0, y0, x1, y1, jit, depth = 5) {
  let pts = [[x0, y0], [x1, y1]];
  let off = Math.hypot(x1 - x0, y1 - y0) * jit;
  for (let d = 0; d < depth; d++) {
    const np = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const mx = (ax + bx) / 2, my = (ay + by) / 2, nx = -(by - ay), ny = bx - ax, nl = Math.hypot(nx, ny) || 1, o = rand(-off, off);
      np.push([mx + nx / nl * o, my + ny / nl * o], pts[i + 1]);
    }
    pts = np; off *= 0.5;
  }
  return pts;
}
function strokePts(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); }
function drawBolt(ctx, e, k, t) {
  if (!e.pts || t - e.seedAt > e.refresh) {
    e.seedAt = t; e.pts = boltPoints(e.x0, e.y0, e.x1, e.y1, e.jitter); e.br = [];
    for (let b = 0; b < e.branches; b++) {
      const p = e.pts[Math.floor(rand(0.2, 0.8) * e.pts.length)], ang = Math.atan2(e.y1 - e.y0, e.x1 - e.x0) + rand(-1.1, 1.1), len = Math.hypot(e.x1 - e.x0, e.y1 - e.y0) * rand(0.15, 0.35);
      e.br.push(boltPoints(p[0], p[1], p[0] + Math.cos(ang) * len, p[1] + Math.sin(ang) * len, 0.3, 3));
    }
  }
  const a = e.alpha * (k < 0.15 ? 1 : Math.pow(1 - (k - 0.15) / 0.85, 0.7)) * (0.7 + 0.3 * Math.random());
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const [wm, col, am] of [[6, e.rgb, 0.16], [2.6, e.rgb, 0.5], [1, '255,255,255', 0.95]]) {
    ctx.strokeStyle = `rgba(${col},${a * am})`; ctx.lineWidth = e.w * wm; strokePts(ctx, e.pts);
    ctx.lineWidth = e.w * wm * 0.5; for (const b of e.br) strokePts(ctx, b);
  }
  ctx.restore();
}
function drawBeam(ctx, e, k) {
  const env = Math.sin(Math.PI * Math.min(1, k * 1.15)), w = e.w * (0.3 + 0.7 * env), a = e.alpha * env;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(0, e.y, 0, e.y - e.h);
  g.addColorStop(0, `rgba(${e.rgb},${a * 0.9})`); g.addColorStop(0.6, `rgba(${e.rgb},${a * 0.35})`); g.addColorStop(1, `rgba(${e.rgb},0)`);
  ctx.fillStyle = g; ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.ellipse(e.x, e.y - e.h / 2, w / 2, e.h / 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = `rgba(255,255,255,${a * 0.6})`; ctx.fillRect(e.x - w * 0.08, e.y - e.h * 0.85, w * 0.16, e.h * 0.85);
  ctx.restore();
}
function drawRays(ctx, e, k, el) {
  const env = Math.sin(Math.PI * k), a = e.alpha * env;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(e.x, e.y); ctx.rotate(e.seed + el * e.spin);
  for (let i = 0; i < e.n; i++) {
    const ang = i / e.n * Math.PI * 2, len = e.len * (0.6 + 0.4 * Math.sin(i * 7.3 + e.seed)), wd = 0.07 + 0.05 * Math.sin(i * 3.1);
    const g = ctx.createLinearGradient(0, 0, Math.cos(ang) * len, Math.sin(ang) * len);
    g.addColorStop(0, `rgba(${e.rgb},${a * 0.55})`); g.addColorStop(1, `rgba(${e.rgb},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(ang - wd) * len, Math.sin(ang - wd) * len); ctx.lineTo(Math.cos(ang + wd) * len, Math.sin(ang + wd) * len); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function drawOrb(ctx, e, k) {
  const v = ease.inOutCubic(k), x = lerp(e.x0, e.x1, v), y = lerp(e.y0, e.y1, v) + Math.sin(Math.PI * v) * e.arc;
  const s = e.size * (1 + 0.4 * Math.sin(Math.PI * k)), img = glowCache[e.col] || glowCache.gold;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) { // trail
    const kv = ease.inOutCubic(Math.max(0, k - i * 0.035)), tx = lerp(e.x0, e.x1, kv), ty = lerp(e.y0, e.y1, kv) + Math.sin(Math.PI * kv) * e.arc;
    ctx.globalAlpha = 0.5 * (1 - i / 5); ctx.drawImage(img, tx - s * 0.7, ty - s * 0.7, s * 1.4, s * 1.4);
  }
  ctx.globalAlpha = 1; ctx.drawImage(img, x - s, y - s, s * 2, s * 2);
  ctx.restore();
}
function drawParticles(ctx, back) {
  ctx.save();
  for (const p of parts) {
    if (p.age < 0 || p.back !== back) continue;
    const k = p.age / p.life, a = (k < 0.1 ? k / 0.1 : 1 - Math.pow((k - 0.1) / 0.9, 1.6)) * p.alpha;
    switch (p.type) {
      case 'spark': {
        const sp = Math.hypot(p.vx, p.vy), len = Math.min(50, sp * 0.04 + p.size * 2), nx = p.vx / (sp || 1), ny = p.vy / (sp || 1);
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.lineCap = 'round';
        ctx.strokeStyle = `rgba(${p.rgb},0.9)`; ctx.lineWidth = p.size * 0.8 * (1 - k * 0.6);
        ctx.beginPath(); ctx.moveTo(p.x - nx * len, p.y - ny * len); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = p.size * 0.3; ctx.stroke();
        break;
      }
      case 'glow': case 'ember': case 'wisp': case 'snow': {
        const s = p.size * (p.type === 'wisp' ? 0.6 + k : (p.type === 'glow' ? 1 - k * 0.7 : 1));
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * (p.type === 'ember' ? 0.6 + 0.4 * Math.sin(p.age / 40 + p.ph) : (p.type === 'wisp' ? 0.4 : 1));
        ctx.drawImage(glowCache[p.col] || glowCache.white, p.x - s, p.y - s, s * 2, s * 2);
        break;
      }
      case 'shard': {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
        const tr = ctx.getTransform(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        const s = p.size; ctx.fillStyle = `rgba(${p.rgb},0.8)`;
        ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.32, 0); ctx.lineTo(0, s * 0.6); ctx.lineTo(-s * 0.32, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.moveTo(0, -s * 0.7); ctx.lineTo(s * 0.1, 0); ctx.lineTo(0, s * 0.3); ctx.lineTo(-s * 0.1, 0); ctx.closePath(); ctx.fill();
        ctx.setTransform(tr);
        break;
      }
      case 'petal': {
        const tr = ctx.getTransform();
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
        ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(Math.sin(p.age / 120 + p.ph), 1);
        const s = p.size, g = ctx.createLinearGradient(0, -s, 0, s);
        g.addColorStop(0, '#fff3f8'); g.addColorStop(1, p.col === 'gold' ? '#ffd27a' : (p.col === 'jade' ? '#9ff0c0' : '#ff8fc0'));
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.45, s, 0, 0, Math.PI * 2); ctx.fill();
        ctx.setTransform(tr);
        break;
      }
      case 'smoke': case 'dust': {
        const s = p.size * (0.6 + k * 1.1);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a * 0.8;
        ctx.drawImage(glowCache[p.type], p.x - s, p.y - s * 0.75, s * 2, s * 1.5);
        break;
      }
      case 'debris': {
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
        ctx.fillStyle = p.col === 'white' ? '#2a2430' : `rgb(${p.rgb})`; const s = p.size;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-s / 2, -s / 2, s, s * 0.7); ctx.restore();
        break;
      }
    }
  }
  ctx.restore();
}

const TEXT = {
  dmg:     { size: 40, fill: ['#fff6c8', '#ffb34a'], stroke: '#3a1606' },
  crit:    { size: 54, fill: ['#fff1a0', '#ff4a1a'], stroke: '#3a0a02', label: 'CRITICAL', glow: 'gold' },
  enemy:   { size: 40, fill: ['#ffe0e0', '#ff4d5e'], stroke: '#2a0508' },
  ecrit:   { size: 52, fill: ['#ffe0e0', '#ff2a3a'], stroke: '#2a0508', label: 'CRITICAL', glow: 'red' },
  heal:    { size: 38, fill: ['#eaffd8', '#5fe36e'], stroke: '#0f3315', glow: 'jade' },
  shield:  { size: 34, fill: ['#fffbe0', '#ffd76a'], stroke: '#2a1c04' },
  info:    { size: 26, fill: ['#ffffff', '#cfe6ff'], stroke: '#0c1830' },
  harmony: { size: 44, fill: ['#ffffff', '#ffe08a'], stroke: '#2a1806', glow: 'gold' },
  big:     { size: 58, fill: ['#ffffff', '#ffd27a'], stroke: '#2a1806', glow: 'gold' },
};
function drawTexts(ctx) {
  const t = clock.t;
  for (const tx of texts) {
    const el = t - tx.t0; if (el < 0) continue;
    const k = el / tx.dur, st = TEXT[tx.style] || TEXT.dmg, size = tx.size || st.size;
    const slam = el < 140 ? 1 + 1.2 * Math.pow(1 - el / 140, 2) : 1;
    const rise = k > 0.55 ? ease.inQuad((k - 0.55) / 0.45) * 50 : 0;
    const a = k > 0.72 ? 1 - (k - 0.72) / 0.28 : Math.min(1, el / 60);
    ctx.save(); ctx.globalAlpha = clamp(a, 0, 1);
    ctx.translate(tx.x, tx.y - rise); ctx.rotate(tx.rot * (1 - Math.min(1, el / 200))); ctx.scale(slam, slam);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (st.glow && el < 500) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - el / 500) * 0.7; ctx.drawImage(glowCache[st.glow], -size * 1.6, -size * 0.9, size * 3.2, size * 1.8); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = clamp(a, 0, 1); }
    const label = tx.label || st.label;
    if (label) { ctx.font = `700 ${Math.round(Math.max(13, size * 0.3))}px Cinzel, serif`; ctx.lineWidth = 4; ctx.strokeStyle = '#1a0a02'; ctx.strokeText(label, 0, -size * 0.68); ctx.fillStyle = '#ffd98a'; ctx.fillText(label, 0, -size * 0.68); }
    ctx.font = `${tx.style === 'info' || tx.style === 'harmony' || tx.style === 'big' ? '' : 'italic '}700 ${size}px ${tx.style === 'info' || tx.style === 'harmony' || tx.style === 'big' ? 'Cinzel, serif' : 'Oswald, Impact, sans-serif'}`;
    ctx.lineWidth = Math.max(5, size * 0.17); ctx.strokeStyle = st.stroke; ctx.lineJoin = 'round'; ctx.strokeText(tx.text, 0, 0);
    const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2); g.addColorStop(0, st.fill[0]); g.addColorStop(1, st.fill[1]);
    ctx.fillStyle = g; ctx.fillText(tx.text, 0, 0);
    ctx.restore();
  }
}

