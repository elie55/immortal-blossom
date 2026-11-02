// Tooltips: press an item, a currency, a reward, a piece of gear, a heroine's chip, a phase, a stat, a realm or a
// battle status to see what it is. Anything marked data-tip="<key>" has one. The key is a record id (cur:, item:,
// hero:, phase:, stat:, realm:, path:, faction:, set:, art:), gear:<piece id>, status:<engine id> in battle, or a key
// from tipObject() for what is not a record (a salvaged piece, an artefact reward, a drop table's gear odds).
// data-tip-note adds a line in green.
//
// A tap (or click) shows it when the element does nothing else. Where a tap already does something (a gear tile that
// selects, a gift that is given, a card in battle), a long press shows it instead and the tap that ends the press is
// swallowed. With a mouse, resting on the element shows it too. A tap anywhere, Escape or the Android back button
// closes it.
import { App, esc, tipObjectOf, pieceIconUrl, slotGlyph, PH_COLOR, PH_GLYPH, SET_COLOR } from './app.js';
import { get, all, iconUrl, faceUrl, num, keyOf, hasArt, phaseOf, realmOf, nextRealm } from './data.js';
import { qty, piece, owned, prog } from './state.js';
import { pieceName, pieceCn, rarityColor, ROMAN, tierOrder } from './gear.js';
import { pieceBody, twoPieceText } from './ring.js';
import { statusInfo } from './engine.js';

const TIP_HOLD_MS = 450, TIP_HOVER_MS = 400;
/** Elements whose tap already does something: their tooltip waits for a long press. */
const TIP_ACTIVE = '[data-act], button, a, select, input, label, .mini, .rg-grid .gt, .card, .pk, [data-arr]';
const TIP_CAT = { exp_pill: 'EXP pill', breakthrough_pill: 'Breakthrough pill', essence: 'Meridian essence', crystal: 'Dao crystal', scroll: 'Mastery scroll',
  bodhi: 'Mastery leaf', herb: 'Spirit herb', ore: 'Forging ore', dust: 'Forging material', dao_mark: 'Engraving mark', artefact_essence: 'Artefact material',
  flag: 'Array material', egg: 'Spirit beast egg', elixir: 'Secret Realm elixir', manual: 'Forging manual', fragment: 'Natal gear fragment', gift: 'Gift' };
const TIP_GRADE = ['', '#d6d6d6', '#8fe6a8', '#7cc6ff', '#c58bff', '#ffd36a'];
const TIP_STAT_ROW = { Health: 'stat:hp', Attack: 'stat:atk', Defense: 'stat:def', Critical: 'stat:crit', 'Crit damage': 'stat:crit_dmg', Haste: 'stat:haste', Accuracy: 'stat:acc', Resistance: 'stat:res' };
/** The stat id a "Health 3,082" row stands for, to mark it with data-tip. */
export const statTipOf = label => TIP_STAT_ROW[label] || '';

let tipEl = null, tipAnchor = null, tipMode = '', tipHoldT = 0, tipHoverT = 0, tipSwallowUntil = 0, tipPress = null, tipRaf = 0, tipHeld = false;

// ---------------- what a tooltip says ----------------
const tipHead = ({ icon, glyph, round, name, cn, sub, color }) => `<div class="tp-head">
    <div class="tp-ic${round ? ' round' : ''}"${color ? ` style="--pc:${color}"` : ''}>${icon ? `<img src="${icon}" alt="">` : `<span class="g">${esc(glyph || '物')}</span>`}</div>
    <div><b${color ? ` style="--tc:${color}"` : ''}>${esc(name)}${cn ? `<span class="cn">${esc(cn)}</span>` : ''}</b>${sub ? `<small>${sub}</small>` : ''}</div></div>`;

function tipItem(rec) {
  const cur = rec.id.startsWith('cur:');
  const kind = cur ? 'Currency' : (TIP_CAT[rec.category] || 'Item');
  const hero = rec.hero && get(rec.hero);
  return tipHead({ icon: iconUrl(rec.id), name: rec.name, cn: rec.cn, sub: `${kind}${!cur && rec.rarity ? ` · ${'★'.repeat(rec.rarity)}` : ''}`, color: cur ? null : TIP_GRADE[rec.rarity] })
    + `<p>${esc(rec.about || '')}</p>${hero ? `<p class="tp-mut">Belongs to ${esc(hero.name)}'s natal gear.</p>` : ''}
    <p class="tp-own">You have <b>${num(qty(rec.id))}</b></p>`;
}

function tipHero(rec) {
  const p = owned(rec.id) ? prog(rec.id) : null, ph = phaseOf(rec.phase);
  return tipHead({ icon: faceUrl(rec.id), glyph: rec.cn?.[0], round: true, name: rec.name, cn: rec.cn, color: PH_COLOR[ph],
    sub: `${'★'.repeat(rec.rarity)} · ${esc(get(rec.phase)?.name)} · ${esc(get(rec.path)?.name)}` })
    + `<p><i>${esc(rec.title)}</i>${get(rec.faction) ? ` · ${esc(get(rec.faction).name)}` : ''}</p>
    <p class="tp-own">${p ? `In your Pavilion · level <b>${p.level}</b> · ${esc(realmOf(p.bt).name)}` : 'Not met yet'}</p>`;
}

function tipPhase(rec) {
  const k = phaseOf(rec.id), R = get('rules:combat') || {}, adv = R.advantage || { damage: 1.3, critChance: 0.15 }, dis = R.disadvantage || { damage: 0.75 };
  const named = id => { const r = get(id); return r ? `<b style="color:${PH_COLOR[phaseOf(id)]}">${esc(r.name)} ${PH_GLYPH[phaseOf(id)]}</b>` : ''; };
  const head = tipHead({ glyph: PH_GLYPH[k], name: rec.name, cn: PH_GLYPH[k], sub: esc(rec.style || ''), color: PH_COLOR[k] });
  if (k === 'yin' || k === 'yang') {
    return head + `<p>Outside the Five Phases: it neither overcomes nor yields to any of them, so it fights every phase on even terms.</p>`;
  }
  const by = all('phase').find(p => p.overcomes === rec.id);
  return head + `<p>Feeds ${named(rec.feeds)}: a ${esc(get(rec.feeds)?.name)} technique right after a ${esc(rec.name)} one grows the Harmony chain.</p>
    <p>Overcomes ${named(rec.overcomes)}: +${Math.round((adv.damage - 1) * 100)}% damage and +${Math.round(adv.critChance * 100)}% critical chance against it.</p>
    ${by ? `<p>Yields to ${named(by.id)}: ${Math.round((dis.damage - 1) * 100)}% damage against it.</p>` : ''}`;
}

function tipStat(rec) {
  return tipHead({ glyph: '数', name: rec.name, sub: 'Stat' }) + `<p>${esc(rec.about || '')}</p>`;
}

function tipRealm(rec) {
  const nx = nextRealm(rec.order - 1);
  return tipHead({ glyph: rec.cn?.[0], name: rec.name, cn: rec.cn, sub: `Realm ${rec.order} of ${all('realm').length}` })
    + `<p>Levels ${rec.levels[0]} to ${rec.levels[1]}.${rec.statBonus ? ` Breaking through into it raised every stat by ${Math.round(rec.statBonus * 100)}%.` : ''}</p>
    <p class="tp-mut">${nx ? `At level ${rec.levelCap}, a breakthrough (pills and a heavenly tribulation) leads to ${esc(nx.name)} ${esc(nx.cn)}.` : 'The peak of cultivation.'}</p>`;
}

function tipRecord(rec, kind) {
  return tipHead({ glyph: rec.cn?.[0], name: rec.name, cn: rec.cn, sub: kind }) + `<p>${esc(rec.role || rec.about || rec.effect || '')}</p>`;
}

function tipSet(rec) {
  return tipHead({ glyph: rec.cn?.[0], name: rec.name, cn: rec.cn, sub: 'Gear set', color: SET_COLOR[rec.id] })
    + `<p>2 pieces: ${esc(twoPieceText(rec))}</p><p>4 pieces · <b class="gold">${esc(rec.fourPiece.name)}</b>: ${esc(rec.fourPiece.text)}</p>`;
}

function tipArtefact(rec) {
  const icon = hasArt(`icons/art_${keyOf(rec.id)}.webp`) ? `assets/icons/art_${keyOf(rec.id)}.webp` : null;
  return tipHead({ icon, glyph: '宝', name: rec.name, cn: rec.cn, sub: 'Spirit Artefact' })
    + `<p>${esc(rec.passive?.text || '')}</p><p class="tp-mut">For the ${rec.paths.map(x => (x === 'all' ? 'every' : esc(get(x)?.name))).join(' and ')} path${rec.paths.length > 1 ? 's' : ''}.</p>`;
}

function tipGear(p, salvaged) {
  const r = get(p.rarity), col = rarityColor(p.rarity);
  const sub = `${esc(r?.glyph || '')} ${esc(r?.name || '')}${p.kind === 'art' ? '' : ` · Tier ${ROMAN[tierOrder(p.tier)]}`} · +${p.plus || 0}`;
  const where = salvaged ? `<p class="tp-mut">Salvaged on arrival for ${salvaged.map(c => `${num(c.qty)} ${esc(get(c.cur || c.item)?.name)}`).join(', ')} (Storage Ring, auto-salvage).</p>`
    : p.hero ? `<p class="tp-own">Worn by <b>${esc(get(p.hero)?.name)}</b></p>` : (p.id ? '<p class="tp-own">In the Storage Ring</p>' : '');
  return tipHead({ icon: pieceIconUrl(p), glyph: slotGlyph(p.slot), name: pieceName(p), cn: pieceCn(p), sub, color: col }) + `<div class="tp-gear">${pieceBody(p, p.hero || null)}</div>${where}`;
}

function tipOdds({ odds: g, chance }) {
  const rows = Object.entries(g.rarityOdds).sort((a, b) => (get(b[0])?.order || 0) - (get(a[0])?.order || 0))
    .map(([k, v]) => `<span style="color:${rarityColor(k)}">${esc(get(k)?.name)} ${Math.round(v * 100)}%</span>`).join(' · ');
  return tipHead({ glyph: '器', name: 'Gear', sub: `Tier ${ROMAN[tierOrder(g.tier)]}${g.sets || g.set ? ' · with a set' : ''}` })
    + `<p>A random piece of gear. Its rarity:</p><p class="tp-odds">${rows}</p>${chance != null && chance < 1 ? `<p class="tp-mut">Drops in ${Math.round(chance * 100)}% of runs.</p>` : ''}`;
}

function tipStatus(k) {
  const d = statusInfo(k); if (!d) return '';
  return tipHead({ glyph: d.glyph, name: d.name, sub: d.debuff ? 'Debuff' : 'Buff', color: d.color }) + `<p>${esc(d.desc)}</p>`;
}

/** The tooltip's inside for a data-tip key, or '' when there is nothing to say. */
function tipHtml(key) {
  if (!key) return '';
  if (key.startsWith('obj:')) {
    const o = tipObjectOf(key); if (!o) return '';
    if (o.piece) return tipGear(o.piece, o.salvaged);
    if (o.odds) return tipOdds(o);
    return '';
  }
  if (key.startsWith('gear:')) { const p = piece(key.slice(5)); return p ? tipGear(p) : ''; }
  if (key.startsWith('status:') && statusInfo(key.slice(7))) return tipStatus(key.slice(7));
  const rec = get(key); if (!rec) return '';
  switch (key.split(':')[0]) {
    case 'cur': case 'item': return tipItem(rec);
    case 'hero': return tipHero(rec);
    case 'phase': return tipPhase(rec);
    case 'stat': return tipStat(rec);
    case 'realm': return tipRealm(rec);
    case 'path': return tipRecord(rec, 'Path');
    case 'faction': return tipRecord(rec, 'Faction');
    case 'set': return tipSet(rec);
    case 'art': return tipArtefact(rec);
    default: return rec.name ? tipRecord(rec, '') : '';
  }
}

// ---------------- showing it ----------------
function tipPlace() {
  const st = App.stage, sr = st.getBoundingClientRect(), s = sr.width / st.offsetWidth || 1, r = tipAnchor.getBoundingClientRect();
  const ax = (r.left - sr.left) / s, ay = (r.top - sr.top) / s, aw = r.width / s, ah = r.height / s;
  const W = st.offsetWidth, H = st.offsetHeight, tw = tipEl.offsetWidth, th = tipEl.offsetHeight, gap = 12;
  let top = ay - th - gap, below = false;
  if (top < 8) { top = ay + ah + gap; below = true; if (top + th > H - 8) top = Math.max(8, H - 8 - th); }
  const left = Math.min(W - tw - 8, Math.max(8, ax + aw / 2 - tw / 2));
  tipEl.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  tipEl.classList.toggle('below', below);
  tipEl.style.setProperty('--ax', `${Math.round(Math.min(tw - 20, Math.max(20, ax + aw / 2 - left)))}px`);
}

function tipShow(a, mode) {
  let html = '';
  try { html = tipHtml(a.dataset.tip); } catch (e) { console.warn('tooltip', a.dataset.tip, e); }
  if (!html) return;
  tipEl.innerHTML = `<div class="tp-in">${html}${a.dataset.tipNote ? `<p class="tp-note">${esc(a.dataset.tipNote)}</p>` : ''}</div><i class="tp-arr"></i>`;
  tipAnchor = a; tipMode = mode;
  tipEl.classList.add('on');
  tipPlace();
  cancelAnimationFrame(tipRaf);
  const follow = () => { if (!tipAnchor) return; if (!tipAnchor.isConnected) { hideTip(); return; } tipPlace(); tipRaf = requestAnimationFrame(follow); };
  tipRaf = requestAnimationFrame(follow);
}

/** Close the open tooltip; true if there was one (the Android back button closes it before anything else). */
export function hideTip() {
  clearTimeout(tipHoverT);
  if (!tipAnchor) return false;
  tipAnchor = null; tipMode = '';
  cancelAnimationFrame(tipRaf);
  tipEl.classList.remove('on');
  return true;
}

// ---------------- pressing, holding, hovering ----------------
const tipTarget = e => (e.target && e.target.closest ? e.target.closest('[data-tip]') : null);

function tipDown(e) {
  if (tipEl.contains(e.target)) return;
  const a = tipTarget(e);
  if (tipAnchor && a !== tipAnchor) hideTip();
  clearTimeout(tipHoldT); tipPress = null;
  if (!a || (e.pointerType === 'mouse' && e.button !== 0)) return;
  tipPress = { x: e.clientX, y: e.clientY, a };
  tipHoldT = setTimeout(() => {
    if (!tipPress || tipPress.a !== a || !a.isConnected) return;
    tipPress = null; tipShow(a, 'pinned');
    if (tipAnchor === a) tipHeld = true; // the release that ends the press must not also act
  }, TIP_HOLD_MS);
}
function tipMove(e) { if (tipPress && Math.hypot(e.clientX - tipPress.x, e.clientY - tipPress.y) > 10) { clearTimeout(tipHoldT); tipPress = null; } }
function tipUp() { clearTimeout(tipHoldT); tipPress = null; if (tipHeld) { tipHeld = false; tipSwallowUntil = performance.now() + 450; } }
function tipClick(e) {
  if (tipSwallowUntil && performance.now() < tipSwallowUntil) { tipSwallowUntil = 0; e.stopPropagation(); e.preventDefault(); return; }
  tipSwallowUntil = 0;
  const a = tipTarget(e); if (!a || tipEl.contains(a)) return;
  if (a.closest(TIP_ACTIVE)) return; // it has its own action: a long press shows its tooltip
  if (tipAnchor === a && tipMode === 'pinned') { hideTip(); return; }
  tipShow(a, 'pinned');
}
function tipOver(e) {
  if (e.pointerType !== 'mouse') return;
  const a = tipTarget(e); if (!a || a === tipAnchor) return;
  clearTimeout(tipHoverT);
  tipHoverT = setTimeout(() => { if (a.isConnected && a.matches(':hover') && tipMode !== 'pinned') tipShow(a, 'hover'); }, TIP_HOVER_MS);
}
function tipOut(e) {
  if (e.pointerType !== 'mouse') return;
  const a = tipTarget(e); if (!a || (e.relatedTarget && a.contains(e.relatedTarget))) return;
  clearTimeout(tipHoverT);
  if (tipAnchor === a && tipMode === 'hover') hideTip();
}

/** Wire the tooltips to the stage (once, at boot). */
export function initTips(stage) {
  tipEl = document.createElement('div');
  tipEl.id = 'itip';
  stage.appendChild(tipEl);
  // a press on the tooltip itself closes it and goes no further, so nothing under it is pressed by mistake
  tipEl.addEventListener('pointerdown', e => { e.stopPropagation(); hideTip(); tipSwallowUntil = performance.now() + 600; });
  document.addEventListener('pointerdown', tipDown, true);
  document.addEventListener('pointermove', tipMove, true);
  document.addEventListener('pointerup', tipUp, true);
  document.addEventListener('pointercancel', tipUp, true);
  document.addEventListener('click', tipClick, true);
  document.addEventListener('contextmenu', e => { if (tipTarget(e)) e.preventDefault(); }, true);
  document.addEventListener('pointerover', tipOver, true);
  document.addEventListener('pointerout', tipOut, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); }, true);
  document.addEventListener('scroll', () => { if (tipMode === 'hover') hideTip(); }, true);
  App.closeTip = hideTip;
}
