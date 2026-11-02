#!/usr/bin/env python3
"""Economy simulation for the core loop alpha: a player who plays two 45-minute sessions a day.

    python3 tools/economy_sim.py [--hours 30] [--seed 1] [--runs 20] [--report docs/economy-report.md]

It replays the game's rules from data/ (stats by level and realm, gear rolls and refining, EXP, drop tables,
first-clear and star rewards, the Sect's timers, duties, the Market and the Fate Pond) with a simple player:
collect the Sect, spend, then fight the next Journey stage when the team can win it, and farm what is
missing when it cannot. Whether a battle is won comes from a power ratio calibrated on the real engine
(tools/calibration: the founders on auto). The output is a timeline of play hours: chapters, realms, gear,
heroines and currencies, and the content still ahead at each hour.
"""
import argparse
import glob
import json
import math
import os
import random
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REC = {}
for f in glob.glob(os.path.join(ROOT, 'data', '**', '*.json'), recursive=True):
    d = json.load(open(f))
    for r in d.get('records', []):
        REC[r['id']] = r
get = REC.get
of_type = lambda t: [r for k, r in REC.items() if k.startswith(t + ':')]

# ---------------- calibration (the real engine, founders on auto, no gear) ----------------
# A team wins on auto when its strength (offense x effective health) is at least theta times the stage's (see
# stage_power), where theta belongs to the stage's class (story battle, story boss, Heaven-Defying, each hunt, the
# Valley, the shrines) and is fitted from tools/calibration.jsonl: the founders on auto, the lowest level at which
# they win a stage (tools/calibrate.cjs --bisect). A player fighting by hand needs MANUAL x theta (an assumption:
# good targeting and timing are worth about 15% of strength).
THETA_DEFAULT = 0.2
MANUAL = 0.85
CAL_FILE = os.path.join(ROOT, 'tools', 'calibration.jsonl')
# Battle length at x1, fitted from the same battles: SEC_A seconds per enemy at margin 1 (strength just at theta),
# shorter as the margin grows (margin ** -SEC_B), within SEC_CLIP of the base.
SEC_A, SEC_B, SEC_CLIP = 26.8, 0.32, (0.45, 1.4)
# The player's time outside battles: menus each session (gear, the Sect), Valley sweeps (three stars: a Valley level
# won by hand with this margin), at most SWEEP_BUDGET runs a session.
MENU_MINUTES = 4.0
FARM_MARGIN = 1.25   # the player farms on auto only where the margin is at least this (about 87% of wins)
SWEEP_MINUTES = 0.03
SWEEP_BUDGET = 40
THREE_STAR_MARGIN = 1.4
# Battles are noisy (critical hits, effect chances, who the enemy focuses): a team wins when its margin times
# exp(WIN_SIGMA x a standard normal draw) reaches 1, so at margin 1 it wins half the time.
WIN_SIGMA = 0.2

# ---------------- rules ----------------
G = get('rules:growth')
GEAR = get('rules:gear')
exp_to_next = lambda L: 90 * L * L
level_cap = lambda bt: 10 * (bt + 1)
growth = lambda L, bt: (1 + 0.08 * (L - 1)) * (1 + 0.1 * bt)
egrowth = lambda L: (1 + 0.08 * (L - 1)) * (1 + 0.1 * ((L - 1) // 10))
REALMS = sorted(of_type('realm'), key=lambda r: r['order'])
TIERS = sorted(of_type('tier'), key=lambda t: t['order'])
TIER_OF = {t['id']: t for t in TIERS}
RARITY = {r['id']: r for r in of_type('rarity')}
power = lambda s: s['atk'] * (1 + s['crit'] * (s['critDmg'] - 1)) * 2.2 + s['hp'] * 0.32 + s['def'] * 1.6


# Enemies' Health and Attack rise a further enemyGearPar per realm (rules:growth), as the gear players wear does;
# STAGE_MUL scales whole classes of stages (see stage_class), both for tuning (--gear-par, --stage-mul).
POWER_BASE = G.get('enemyPowerBase', 1)
GEAR_PAR = G.get('enemyGearPar', 0)
STAGE_MUL = dict(G.get('stageMultiplier', {}))
def epar(L, par=None, base=None):
    """Health and Attack multiplier of an enemy at level L: enemyPowerBase x (1 + enemyGearPar[realm]); a number for
    enemyGearPar means that much per realm."""
    gp = GEAR_PAR if par is None else par; r = (L - 1) // 10
    x = gp[min(r, len(gp) - 1)] if isinstance(gp, (list, tuple)) else gp * r
    return (POWER_BASE if base is None else base) * (1 + x)


DEF_K = 900
offense = lambda s: s['atk'] * (1 + s['crit'] * (s['critDmg'] - 1))
ehp = lambda s: s['hp'] * (1 + s['def'] / DEF_K)


def enemy_stats(eid, level, mul=1.0, par=None, base=None):
    b = get(eid)['base']; g = egrowth(level); p = epar(level, par, base) * mul
    return {'hp': b['hp'] * g * p, 'atk': b['atk'] * g * p, 'def': b['def'] * g, 'crit': b['crit'], 'critDmg': b['critDmg']}


STAGE_POWER = {}   # tuning overrides of a stage's own power: {(stage id, hd?): x}


def stage_own_power(st, hd=0):
    if st.get('tutorial') and not hd: return 1 / max(1e-9, STAGE_MUL.get(stage_class(st, hd), 1.0))   # the tutorial keeps its numbers
    k = (st['id'], bool(hd))
    if k in STAGE_POWER: return STAGE_POWER[k]
    return ((st.get('heavenDefying') or {}).get('power', 1) if hd else st.get('power', 1))


def stage_power(st, hd=0, par=None, muls=None, base=None, own=None):
    """A stage's strength, Lanchester-style: each wave's total offense times its total effective health, summed over the
    waves fought one after another (at each enemy's level + the Heaven-Defying offset; shielded elites count more)."""
    tot = 0; mul = (STAGE_MUL if muls is None else muls).get(stage_class(st, hd), 1.0) * (stage_own_power(st, hd) if own is None else own)
    for w in st.get('waves', []):
        o = h = 0
        for e in w:
            if e['enemy'] == 'enemy:heart_demon':
                if st.get('demon'): o += st['demon'][0]; h += st['demon'][1] * 1.15   # her copy, with a Qi shield
                continue
            s = enemy_stats(e['enemy'], e['level'] + hd, mul, par, base)
            k = 1.15 if (hd and get(e['enemy']).get('profile') != 'minion') or get(e['enemy']).get('qiShield') else 1
            o += offense(s); h += ehp(s) * k
        tot += o * h
    return tot


# ---------------- gear ----------------
SLOTS = [s for s in of_type('slot') if s['id'] != 'slot:artefact']
POSITIONS = ['slot:weapon', 'slot:helmet', 'slot:body', 'slot:gloves', 'slot:pants', 'slot:boots', 'slot:ring', 'slot:ring', 'slot:pendant']


def roll_in(rng, lo_hi):
    lo, hi = lo_hi
    return lo + rng.random() * (hi - lo)


def make_piece(rng, tier, rarity, slot=None, gset=None):
    slot = slot or rng.choice(POSITIONS)
    s = get(slot); m = rng.choice(s['mainStats'])
    key = f"{m['stat']}/{'pct' if m['form'] in ('%', 'pct') else 'flat'}"
    r = RARITY[rarity]
    subs = []
    for _ in range(r['substatsAtDrop']):
        subs.append([rng.choice(SUBKEYS), [roll_in(rng, r['rolls'])]])
    return {'slot': slot, 'tier': tier, 'rarity': rarity, 'main': key, 'roll': roll_in(rng, r['rolls']), 'subs': subs, 'plus': 0, 'set': gset if s.get('countsForSets') else None}


SUBKEYS = ['stat:atk/flat', 'stat:atk/pct', 'stat:hp/flat', 'stat:hp/pct', 'stat:def/flat', 'stat:def/pct', 'stat:crit/pct', 'stat:crit_dmg/pct', 'stat:haste/flat', 'stat:acc/pct', 'stat:res/pct']


def piece_lines(p):
    sc = TIER_OF[p['tier']]['baseScale']
    out = defaultdict(float)
    out[p['main']] += GEAR['mainStatAtTierVIII'].get(p['main'], 0) * sc * p['roll'] * (1 + 0.06 * p['plus']) / 1.9
    for k, rolls in p['subs']:
        out[k] += GEAR['substatRollAtTierVIII'].get(k, 0) * sc * sum(rolls)
    return out


def refine_cost(p):
    L = p['plus'] + 1; sc = TIER_OF[p['tier']]['baseScale']
    return round(400 * L * sc), max(1, round(4 * L * sc))


def refine_once(rng, p):
    p['plus'] += 1
    if p['plus'] in GEAR['refineMilestones']:
        r = RARITY[p['rarity']]
        if len(p['subs']) < 4:
            p['subs'].append([rng.choice(SUBKEYS), [roll_in(rng, r['rolls'])]])
        else:
            rng.choice(p['subs'])[1].append(roll_in(rng, r['rolls']))


def salvage_value(p):
    r = RARITY[p['rarity']]; mul = TIER_OF[p['tier']]['baseScale'] / 0.2
    dust = stones = 0
    for c in r['salvage']:
        if c.get('item') == 'item:forging_dust': dust += c['qty'] * mul
        if c.get('cur') == 'cur:spirit_stones': stones += c['qty'] * mul
    for L in range(p['plus']):
        s, d = refine_cost({**p, 'plus': L}); stones += 0.8 * s; dust += 0.8 * d
    return int(stones), int(dust)


# ---------------- the player ----------------
class Player:
    def __init__(self, rng):
        self.rng = rng
        self.w = Counter()          # wallet: currencies and items
        self.heroes = {}            # hid: {level, exp, bt, petals, gear: {pos: piece}, mastery, meridians}
        self.cleared = set(); self.stars = {}; self.hd_cleared = set()
        self.minutes = 0.0          # active play
        self.day = 0; self.session = 0
        self.log = []
        self.pulls = 0; self.pity = 0; self.guided = False
        self.sect = {'main': 1, 'caves': 1, 'garden': 1, 'alchemy': 1, 'missions': 1, 'tea': 1, 'arrays': 1}
        self.bond = Counter()
        self.stats_time = Counter()  # minutes per activity
        self.milestones = []
        self.trial_best = Counter()  # mode: best level cleared
        self.three_star = set()      # Valley levels won with a wide margin (three stars: sweepable)
        self._cache = {}             # stats by heroine, cleared whenever levels, gear or growth change
        self.sweeps = 0

    # ----- heroines -----
    def gain(self, hid):
        self._cache.pop(hid, None)
        if hid not in self.heroes:
            self.heroes[hid] = {'level': 1, 'exp': 0, 'bt': 0, 'petals': 0, 'gear': {}, 'mastery': 0, 'merid': 0}
            return 'new'
        h = self.heroes[hid]
        if h['petals'] < 6: h['petals'] += 1; return 'petal'
        self.w['cur:blossom_dew'] += {3: 10, 4: 30, 5: 80}[get(hid)['rarity']]; return 'dew'

    def add_exp(self, hid, exp):
        self._cache.pop(hid, None)
        h = self.heroes[hid]; h['exp'] += exp
        cap = level_cap(h['bt'])
        while h['level'] < cap and h['exp'] >= exp_to_next(h['level']):
            h['exp'] -= exp_to_next(h['level']); h['level'] += 1

    def stats(self, hid):
        c = self._cache.get(hid)
        if c is None: c = self._cache[hid] = self._stats(hid)
        return c

    def _stats(self, hid):
        h = self.heroes[hid]; b = get(hid)['base']; g = growth(h['level'], h['bt'])
        bond = (G['bondStatBonus'][min(9, self.bond_level(hid) - 1)])
        # meridian nodes, opened Lung (Attack), Kidney (Health), Heart (critical damage), Spleen (Defense), then Liver (Haste)
        n = min(h['merid'], 5 * min(5, h['bt'])); node = lambda k: min(5, max(0, n - 5 * k))
        base = {'hp': b['hp'] * g * (1 + bond + 0.03 * node(1)), 'atk': b['atk'] * g * (1 + bond + 0.03 * node(0)), 'def': b['def'] * g * (1 + bond + 0.04 * node(3)),
                'crit': b['crit'], 'critDmg': b['critDmg'] + 0.05 * node(2)}
        t = defaultdict(float)
        for p in h['gear'].values():
            for k, v in piece_lines(p).items(): t[k] += v
        s = {'hp': base['hp'] * (1 + t['stat:hp/pct']) + t['stat:hp/flat'], 'atk': base['atk'] * (1 + t['stat:atk/pct']) + t['stat:atk/flat'],
             'def': base['def'] * (1 + t['stat:def/pct']) + t['stat:def/flat'], 'crit': min(1, base['crit'] + t['stat:crit/pct']), 'critDmg': base['critDmg'] + t['stat:crit_dmg/pct']}
        return s

    def hero_power(self, hid):
        """For choosing the team and gear: offense times effective health (mastery and petals add damage)."""
        o, h = self.hero_oh(hid)
        return math.sqrt(o * h)

    def hero_oh(self, hid):
        h = self.heroes[hid]; s = self.stats(hid)
        return offense(s) * (1 + 0.02 * h['mastery']) * (1 + 0.04 * h['petals']), ehp(s)

    def team(self):
        return sorted(self.heroes, key=lambda x: -self.hero_power(x))[:4]

    def team_power(self, level=None):
        """The team's strength: total offense times total effective health. Story guests (founders at the stage's level)
        fill empty slots early on."""
        O = H = 0
        for hid in self.team():
            o, h = self.hero_oh(hid); O += o; H += h
        if level and len(self.heroes) < 4:
            b = get('hero:su_lianhua')['base']; g = growth(level, (level - 1) // 10)
            s = {k: b[k] * (g if k in ('hp', 'atk', 'def') else 1) for k in b}
            O += (4 - len(self.heroes)) * offense(s); H += (4 - len(self.heroes)) * ehp(s)
        return O * H

    def bond_level(self, hid):
        L = G['bondLevels']; pts = self.bond[hid]; lv = 1
        for i in range(1, len(L)):
            if pts >= L[i]: lv = i + 1
        return lv

    # ----- rewards -----
    def grant(self, lst, why=''):
        for r in lst or []:
            if r.get('cur') or r.get('item'): self.w[r.get('cur') or r.get('item')] += r.get('qty', 1)
            elif r.get('hero'): self.gain(r['hero'])
            elif r.get('gear'):
                g = r['gear']
                self.take_piece(make_piece(self.rng, g.get('tier', 'tier:i'), g.get('rarity', 'rarity:rare'), g.get('slot') if g.get('slot') not in (None, 'any') else None, g.get('set')))

    def roll_drops(self, did, mul=1):
        d = get(did)
        if not d: return
        for _ in range(d.get('rolls', 1) * mul):
            for e in d.get('entries', []):
                if self.rng.random() > e.get('chance', 1): continue
                if e.get('gear'):
                    g = e['gear']; rar = self.rng.choices(list(g['rarityOdds']), weights=list(g['rarityOdds'].values()))[0]
                    gset = g.get('set') or (self.rng.choice(g['sets']) if g.get('sets') else None)
                    self.take_piece(make_piece(self.rng, g['tier'], rar, None if g.get('slot') in (None, 'any') else g['slot'], gset)); continue
                if e.get('drops'): self.roll_drops(e['drops']); continue
                q = e.get('qty', 1); lo, hi = q if isinstance(q, list) else (q, q)
                self.w[e.get('cur') or e.get('item')] += round(lo + self.rng.random() * (hi - lo))

    def take_piece(self, p):
        """Equip it on the team heroine it helps most, or salvage it. A piece is judged as if refined as far as the one
        it replaces (refining comes next, and salvaging the old piece returns most of what it cost)."""
        best, gain_best, pos_best = None, 0, None
        for hid in self.team():
            h = self.heroes[hid]
            for pos in ([p['slot']] if p['slot'] != 'slot:ring' else ['ring1', 'ring2']):
                key = pos if p['slot'] == 'slot:ring' else p['slot']
                old = h['gear'].get(key)
                before = self.hero_power(hid)
                trial = dict(p, plus=max(p['plus'], old['plus'] if old else 0))
                h['gear'][key] = trial; self._cache.pop(hid, None); after = self.hero_power(hid)
                if old: h['gear'][key] = old
                else: del h['gear'][key]
                self._cache.pop(hid, None)
                if after - before > max(gain_best, 0.02 * before if old else 0): best, gain_best, pos_best = hid, after - before, key
        if best:
            old = self.heroes[best]['gear'].get(pos_best)
            self.heroes[best]['gear'][pos_best] = p; self._cache.pop(best, None)
            if old: self.salvage(old)
        else:
            self.salvage(p)

    def salvage(self, p):
        s, d = salvage_value(p); self.w['cur:spirit_stones'] += s; self.w['item:forging_dust'] += d

    # ----- spending -----
    def spend(self):
        self._spend(); self._cache.clear()

    def _spend(self):
        w = self.w
        # pills on the team, to the level cap
        for hid in self.team():
            h = self.heroes[hid]
            for pill, exp in (('item:nine_revolution_golden_pill', 150000), ('item:heaven_earth_pill', 49500), ('item:spirit_condensing_pill', 16500), ('item:qi_gathering_pill', 5500)):
                while w[pill] > 0 and h['level'] < level_cap(h['bt']) and w['cur:spirit_stones'] >= exp * 0.1:
                    w[pill] -= 1; w['cur:spirit_stones'] -= exp * 0.1; self.add_exp(hid, exp)
        # breakthroughs (tribulations from Core Formation: won when the team can beat a stage of the trial's level)
        for hid in self.team():
            h = self.heroes[hid]
            if h['level'] < level_cap(h['bt']) or h['bt'] >= 7: continue
            to = REALMS[h['bt'] + 1]; cost = to.get('breakthroughCost') or []
            if all(w[c.get('item') or c.get('cur')] >= c['qty'] for c in cost):
                trial = next((t for t in of_type('trial') if t['realm'] == to['id']), None)
                if trial:                      # her tribulation: lightning, then her Heart Demon, with three allies
                    st = trial_stage(trial, self, hid)
                    if not self.can_win(st, manual=True): continue
                    if not self.fight(st, manual=True, kind='tribulations'): continue
                for c in cost: w[c.get('item') or c.get('cur')] -= c['qty']
                h['bt'] += 1; self.add_exp(hid, 0)
                if h['bt'] >= 2: self.grant([r for r in (next((t for t in of_type('trial') if t['realm'] == to['id']), {}) or {}).get('firstClearRewards', []) if r.get('cur') or r.get('item')])
                self.event(f"{get(hid)['name']} reaches {to['name']}")
        # summons: every ten incense; jade becomes incense at the Market
        while w['cur:immortal_jade'] >= 160 + 300:
            w['cur:immortal_jade'] -= 160; w['cur:fate_incense'] += 1
        while w['cur:fate_incense'] >= 10:
            w['cur:fate_incense'] -= 10; self.summon(10)
        # refining the team's gear (weapon and main stats first), keeping a reserve of stones
        for _ in range(60):
            cands = [(hid, k, p) for hid in self.team() for k, p in self.heroes[hid]['gear'].items() if p['plus'] < 15]
            if not cands: break
            hid, k, p = min(cands, key=lambda c: c[2]['plus'])
            s, d = refine_cost(p)
            if w['cur:spirit_stones'] < s + 20000 or w['item:forging_dust'] < d: break
            w['cur:spirit_stones'] -= s; w['item:forging_dust'] -= d; refine_once(self.rng, p)
        # mastery with scrolls and leaves (levels 1-3 scrolls only, 4-5 need Bodhi leaves)
        cost = {1: (2, 0), 2: (4, 0), 3: (8, 0), 4: (12, 1), 5: (16, 2)}
        for hid in self.team():
            h = self.heroes[hid]
            while h['mastery'] < 15:
                lvl = h['mastery'] // 3 + 1
                sc, lf = cost[min(5, lvl)]
                if w['item:enlightenment_scroll'] >= sc and w['item:bodhi_leaf'] >= lf:
                    w['item:enlightenment_scroll'] -= sc; w['item:bodhi_leaf'] -= lf; h['mastery'] += 1
                else: break
        # meridian nodes with essences (any phase, averaged) and stones
        for hid in self.team():
            h = self.heroes[hid]
            while h['merid'] < 5 * min(5, h['bt']):
                n = h['merid'] % 5 + 1; ess = 10 * n * 1.2; st = 5000 * n
                tot = sum(w[k] for k in ('item:metal_essence', 'item:wood_essence', 'item:water_essence', 'item:fire_essence', 'item:earth_essence'))
                if tot >= ess and w['cur:spirit_stones'] >= st + 30000:
                    left = ess
                    for k in sorted(('item:metal_essence', 'item:wood_essence', 'item:water_essence', 'item:fire_essence', 'item:earth_essence'), key=lambda k: -w[k]):
                        take = min(w[k], left); w[k] -= take; left -= take
                    w['cur:spirit_stones'] -= st; h['merid'] += 1
                else: break
        # petals with Blossom Dew, on the strongest heroine first
        for hid in self.team():
            h = self.heroes[hid]
            while h['petals'] < 6 and w['cur:blossom_dew'] >= get('sys:dao_blossom')['petalDewCost'][h['petals']]:
                w['cur:blossom_dew'] -= get('sys:dao_blossom')['petalDewCost'][h['petals']]; h['petals'] += 1
        # Sect buildings: caves, garden, alchemy and missions first, under the Main Hall's cap
        cap_main = max(1, 2 * self.chapters_cleared())
        for b, bid in (('main', 'bld:main_hall'), ('caves', 'bld:closed_door_caves'), ('garden', 'bld:spirit_herb_garden'), ('alchemy', 'bld:alchemy_pavilion'), ('missions', 'bld:mission_hall'), ('tea', 'bld:tea_house')):
            cap = cap_main if b == 'main' else self.sect['main']
            while self.sect[b] < cap:
                c = get(bid)['upgradeCost'][self.sect[b] - 1][0]['qty']
                if w['cur:spirit_stones'] < c + 40000: break
                w['cur:spirit_stones'] -= c; self.sect[b] += 1

    def summon(self, n):
        pond = get('pond:fate_pond'); pool = [h for h in pond['pool'] if get(h).get('art', {}).get('card') and os.path.exists(os.path.join(ROOT, 'game', 'assets', 'cards', get(h)['art']['card'] + '.webp'))]
        # the four new heroines are in the alpha even before their cards are cut
        pool += [h for h in ('hero:hu_qiangwei', 'hero:gui_chanjuan', 'hero:gu_youlan', 'hero:ying_wucai') if h not in pool]
        by = {3: [], 4: [], 5: []}
        for h in pool: by[get(h)['rarity']].append(h)
        res = []
        if n == 10 and not self.guided:
            self.guided = True
            picks = [by[5][0]] + self.rng.sample([h for h in by[4] if h != 'hero:su_lianhua'], 2)
            picks += [self.rng.choice(by[3]) for _ in range(7)]
        else:
            picks = []
            for i in range(n):
                self.pity += 1
                r5 = 0.03 + (0.05 * (self.pity - 49) if self.pity >= 50 else 0)
                if self.pity >= 60: r5 = 1
                x = self.rng.random(); rar = 5 if x < r5 else (4 if x < r5 + 0.15 else 3)
                if rar == 5: self.pity = 0
                picks.append(self.rng.choice(by[rar]))
        for h in picks:
            res.append((h, self.gain(h)))
        self.pulls += n
        new = [get(h)['name'] for h, k in res if k == 'new']
        if new: self.event('Summons: ' + ', '.join(new))

    # ----- time and the Sect -----
    def chapters_cleared(self):
        return sum(1 for ch in of_type('chapter') if all(s in self.cleared for s in ch['stages'] if get(s).get('waves')))

    def idle(self, hours):
        """What the Sect makes while the player is away (between sessions)."""
        w = self.w; hrs = min(12, hours)
        # caves: the four lowest heroines not in the team... or the team (the player seats the team)
        rate = get('bld:closed_door_caves')['expPerHour'][self.sect['caves'] - 1]
        slots = get('bld:closed_door_caves')['slots'][self.sect['caves'] - 1]
        for hid in sorted(self.heroes, key=lambda x: -self.hero_power(x))[:slots]:
            self.add_exp(hid, rate * hrs)
        # garden
        b = get('bld:spirit_herb_garden'); mul = 1 + b['levelBonus'] * (self.sect['garden'] - 1)
        best = 1 + max([h['bt'] for h in self.heroes.values()] or [0])
        for p in b['produces']:
            if self.sect['garden'] >= p.get('fromLevel', 1) and best >= (get(p['fromRealm'])['order'] if p.get('fromRealm') else 1):
                w[p.get('cur') or p.get('item')] += p['perHour'] * hrs * mul
        # alchemy: brew what is missing (breakthrough pills for the team, then EXP pills), one 12-hour batch per furnace
        fur = get('bld:alchemy_pavilion')['furnaces'][self.sect['alchemy'] - 1]
        for _ in range(fur):
            self.brew(hrs)
        # missions: the best expeditions open, at their length (rewards on average)
        slots = get('bld:mission_hall')['slots'][self.sect['missions'] - 1]
        ex = [e for e in (get(x) for x in get('bld:mission_hall')['expeditions']) if self.sect['missions'] >= get('bld:mission_hall')['unlockByHours'][str(e['hours'])] and e['requires'].get('heroines', 1) <= len(self.heroes)]
        ex.sort(key=lambda e: -e['hours'])
        for e in ex[:slots]:
            runs = max(1, int(hrs // e['hours']))
            for _ in range(runs):
                for r in e['rewards']:
                    if self.rng.random() < r.get('chance', 1): w[r.get('cur') or r.get('item')] += r['qty']

    def brew(self, hrs):
        w = self.w
        need_bt = [REALMS[self.heroes[h]['bt'] + 1] for h in self.team() if self.heroes[h]['bt'] < 7 and self.heroes[h]['level'] >= level_cap(self.heroes[h]['bt']) - 3]
        order = []
        for r in need_bt:
            pill = (r.get('breakthroughCost') or [{}])[0].get('item')
            if pill and w[pill] < 1: order.append('recipe:brew_' + pill.split(':')[1])
        order += ['recipe:brew_heaven_earth_pill', 'recipe:brew_spirit_condensing_pill', 'recipe:brew_qi_gathering_pill']
        q = get('bld:alchemy_pavilion')['quality']; shift = q['shiftPerLevel'] * (self.sect['alchemy'] - 1) + q['alchemistShift'] + q['healerShift']
        low = max(q['lowFloor'], q['odds']['Low'] - shift); moved = q['odds']['Low'] - low
        mean = low * 1 + q['odds']['Middle'] * 1 + (q['odds']['High'] + moved * 0.6) * 2 + (q['odds']['Perfect'] + moved * 0.4) * 3
        for rid in order:
            r = get(rid)
            if not r: continue
            n = int(min(10, hrs // r['hours']))
            while n > 0 and not all(w[c.get('item') or c.get('cur')] >= c['qty'] * n for c in r['inputs']): n -= 1
            if n <= 0: continue
            for c in r['inputs']: w[c.get('item') or c.get('cur')] -= c['qty'] * n
            w[r['output']['item']] += r['output']['qty'] * n * mean
            self.w['duty:brew'] += n
            return

    def sweep_valley(self, levels):
        """Valley levels with three stars sweep at once (drops only): the player sweeps for EXP pills while the team is
        below its cap, and for stones when they run low, a few seconds a run."""
        best = max((s for s in levels if s['id'] in self.three_star), key=lambda s: s['level'], default=None)
        if not best: return
        runs = 0
        while runs < SWEEP_BUDGET and (any(self.heroes[h]['level'] < level_cap(self.heroes[h]['bt']) for h in self.team()) or self.w['cur:spirit_stones'] < 150000):
            self.roll_drops(best.get('drops')); runs += 1
            if runs % 5 == 0: self.spend()
        m = runs * SWEEP_MINUTES; self.minutes += m; self.stats_time['valley sweeps'] += m; self.sweeps += runs

    def daily(self):
        """Duties (five done in normal play), the weekly chest once a week, tea, the Market's weekly buys."""
        w = self.w; self._cache.clear()
        for t in get('chest:daily')['tiers']: self.grant(t['rewards'])
        if self.day % 7 == 6:
            for t in get('chest:weekly')['tiers'][:2]: self.grant(t['rewards'])
            # Merit Exchange: a Bodhi Leaf and scrolls; Myriad Treasures: scrolls and flags with spare jade
            for item, price, lim in (('item:bodhi_leaf', 400, 1), ('item:enlightenment_scroll', 50, 10)):
                for _ in range(lim):
                    if w['cur:sect_merit'] >= price: w['cur:sect_merit'] -= price; w[item] += 1
        if self.heroes:
            hid = self.team()[0]; self.bond[hid] += 30
            for h in self.team(): self.bond[h] += 20  # battles together

    # ----- battles -----
    def ratio(self, st, hd=0):
        lv = max((e['level'] for w in st.get('waves', []) for e in w), default=1) + hd
        return self.team_power(lv) / max(1, stage_power(st, hd))

    def margin(self, st, manual=False, hd=0):
        """The team's strength over what the stage needs: above 1 it wins (on auto, or by hand when manual)."""
        return self.ratio(st, hd) / (theta(st, hd) * (MANUAL if manual else 1))

    def can_win(self, st, manual=False, hd=0):
        """A player tries a stage when the team looks strong enough (manual play beats the auto AI)."""
        return self.margin(st, manual, hd) >= 1

    def battle_minutes(self, st, manual, hd=0):
        n = sum(len(w) for w in st.get('waves', []))
        k = max(0.2, self.margin(st, False, hd))
        sec = SEC_A * n * min(SEC_CLIP[1], max(SEC_CLIP[0], k ** -SEC_B))
        return sec / (2 if manual else 3) / 60 + (0.6 if manual else 0.25)

    def fight(self, st, manual=False, hd=0, kind='journey'):
        """One battle: True if won. EXP and time (rewards are the caller's)."""
        m = self.battle_minutes(st, manual, hd)
        self.minutes += m
        if self.margin(st, manual, hd) * math.exp(WIN_SIGMA * self.rng.gauss(0, 1)) < 1:
            self.stats_time['battles lost'] += m
            return False
        self.stats_time[kind] += m
        exp = 12 * sum((e['level'] + hd) ** 2 for w in st['waves'] for e in w)
        for hid in self.team(): self.add_exp(hid, exp)
        return True

    def event(self, text):
        self.log.append((round(self.minutes / 60, 2), text))


def journey_order():
    out = []
    for ch in sorted(of_type('chapter'), key=lambda c: c['id']):
        out += [(ch['id'], s) for s in ch['stages']]
    return out


def scene_minutes(st):
    """Reading a stage's scenes: about 4.5 seconds a line."""
    sc = st.get('scenes') or {}
    lines = sum(len(get(x).get('lines', [])) for x in (sc.values() if isinstance(sc, dict) else sc) if isinstance(x, str) and get(x))
    return lines * 4.5 / 60


def simulate(hours=30, seed=1, verbose=False):
    rng = random.Random(seed)
    P = Player(rng)
    order = journey_order()
    i = 0
    session_len = 45
    modes = {'mode:hunts': [s for s in of_type('stage') if s.get('mode') == 'mode:hunts'],
             'mode:valley': sorted([s for s in of_type('stage') if s.get('mode') == 'mode:valley'], key=lambda s: s['level']),
             'mode:shrines': [s for s in of_type('stage') if s.get('mode') == 'mode:shrines']}
    timeline = []
    next_mark = 1
    read = set()
    while P.minutes < hours * 60:
        # a session: collect the Sect, spend, a few minutes in menus (gear, the Sect), sweeps, then play for 45 minutes
        if P.session % 2 == 0 and P.session: P.day += 1; P.daily()
        P.idle(12 if P.session else 0)
        P.spend()
        end = P.minutes + session_len
        P.minutes += MENU_MINUTES; P.stats_time['menus'] += MENU_MINUTES
        P.sweep_valley(modes['mode:valley'])
        P.spend()
        while P.minutes < end:
            if i < len(order):
                ch, sid = order[i]; st = get(sid)
                if not st.get('waves'):        # a story stage: scenes only
                    m = scene_minutes(st) + 0.3; P.minutes += m; P.stats_time['story'] += m
                    P.grant(st.get('firstClearRewards')); P.cleared.add(sid); i += 1
                    P.spend(); continue
                if st.get('fixedTeam') or P.can_win(st, manual=True):
                    if sid not in read:        # its scenes, the first time only
                        read.add(sid); m = scene_minutes(st); P.minutes += m; P.stats_time['story'] += m
                    if st.get('fixedTeam') or P.fight(st, manual=True):
                        P.cleared.add(sid); P.grant(st.get('firstClearRewards')); P.roll_drops(st.get('drops'))
                        i += 1
                        chap = get(ch)
                        if all(s in P.cleared for s in chap['stages']):
                            P.event(f"{chap['name']} cleared"); P.grant([r for t in chap.get('starRewards', []) for r in t['rewards']])
                        P.spend(); continue
            farm(P, modes, journey_done=i >= len(order))
            P.spend()
        P.session += 1
        while P.minutes / 60 >= next_mark:
            timeline.append(snapshot(P, i, order, modes, next_mark)); next_mark += 1
    return P, timeline


def farm(P, modes, journey_done):
    """The next Journey stage is out of reach (or the Journey is done): new first clears first (Heaven-Defying, the
    next level of each trial), then the farming that adds the most: EXP below the cap, gear, essences."""
    # new content the team can beat: Heaven-Defying stages in order, then the next level of each hunt, the Valley, each shrine
    firsts = []
    # Heaven-Defying opens chapter by chapter, once the chapter is cleared; its stages go in order
    for ch in sorted(of_type('chapter'), key=lambda c: c['id']):
        if not all(x in P.cleared for x in ch['stages'] if get(x).get('waves')): break
        nxt = next((get(x) for x in ch['stages'] if get(x).get('heavenDefying') and x not in P.hd_cleared), None)
        if nxt: firsts.append(('heaven_defying', nxt, nxt['heavenDefying']['levelOffset'])); break
    for m, lst in modes.items():
        if not mode_open(P, m): continue
        groups = defaultdict(list)
        for s in lst: groups[s.get('hunt') or s.get('phase') or m].append(s)
        for g, ss in groups.items():
            ss.sort(key=lambda s: s['level'])
            nxt = next((s for s in ss if s['id'] not in P.cleared), None)
            if nxt and realm_open(P, nxt): firsts.append((m, nxt, 0))
    firsts = [f for f in firsts if P.can_win(f[1], manual=True, hd=f[2])]
    if firsts:
        kind, st, hd = min(firsts, key=lambda f: stage_power(f[1], f[2]))
        if P.fight(st, manual=True, hd=hd, kind=kind):
            if kind == 'heaven_defying':
                P.hd_cleared.add(st['id']); P.grant(st['heavenDefying'].get('firstClearRewards')); P.roll_drops(st['heavenDefying'].get('drops'))
                if len(P.hd_cleared) % 7 == 0: P.event(f'{len(P.hd_cleared)} Heaven-Defying stages cleared')
            else:
                P.cleared.add(st['id']); P.grant(st.get('firstClearRewards')); P.roll_drops(st.get('drops'))
                P.trial_best[kind] = max(P.trial_best[kind], st['level'])
                if kind == 'mode:valley' and P.margin(st, True) >= THREE_STAR_MARGIN: P.three_star.add(st['id'])
                if kind == 'mode:hunts' and st['level'] % 2 == 1: P.event(f"{get(st['hunt'])['name'] if get(st.get('hunt', '')) else 'Hunt'} level {st['level']} cleared")
        return
    # farming: repeat the best beatable stage of the mode that helps most
    tl = P.team()
    capped = all(P.heroes[h]['level'] >= level_cap(P.heroes[h]['bt']) for h in tl) if tl else False
    best = {}
    for m, lst in modes.items():
        ok = [s for s in lst if s['id'] in P.cleared and P.margin(s) >= FARM_MARGIN]   # farm where auto wins reliably
        best[m] = max(ok, key=lambda s: s['level']) if ok else None
    r = P.rng.random()
    if not capped and best['mode:valley'] and r < 0.45: choice = 'mode:valley'
    elif best['mode:hunts'] and r < 0.8: choice = 'mode:hunts'
    elif best['mode:shrines']: choice = 'mode:shrines'
    else: choice = next((m for m in ('mode:hunts', 'mode:valley') if best[m]), None)
    if not choice:
        done = [get(s) for s in P.cleared if get(s).get('waves') and s.startswith('stage:v1c')]
        if not done: P.minutes += 1; return
        st = max(done, key=lambda s: max(e['level'] for w in s['waves'] for e in w))
        if P.fight(st, kind='journey_replay'): P.roll_drops(st.get('drops'))
        return
    st = best[choice]
    if P.fight(st, kind=choice):
        P.roll_drops(st.get('drops'), 2 if choice == 'mode:shrines' and P.rng.random() < 0.2 else 1)
        if choice == 'mode:valley' and P.margin(st, True) >= THREE_STAR_MARGIN: P.three_star.add(st['id'])


def mode_open(P, m):
    u = get(m).get('unlock')
    if isinstance(u, dict) and u.get('clear'): return u['clear'] in P.cleared
    if isinstance(u, dict) and u.get('realm'): return max([h['bt'] for h in P.heroes.values()] or [0]) + 1 >= get(u['realm'])['order']
    return True


def realm_open(P, s):
    if s.get('mode') == 'mode:valley':
        return max([h['bt'] for h in P.heroes.values()] or [0]) + 1 >= s['level']
    u = get(s.get('mode')).get('unlock') or {}
    if isinstance(u, dict) and u.get('clear') and u['clear'] not in P.cleared: return False
    return True


def snapshot(P, i, order, modes, hour=None):
    tl = P.team()
    return {
        'hour': hour if hour is not None else round(P.minutes / 60), 'day': P.day + 1,
        'journey': f"{order[min(i, len(order) - 1)][1][6:] if i < len(order) else 'Volume 1 done'}",
        'chapters': P.chapters_cleared(), 'hd': len(P.hd_cleared),
        'team': ', '.join(f"{get(h)['name'].split()[0]} {P.heroes[h]['level']}/{level_cap(P.heroes[h]['bt'])}" for h in tl),
        'power': round(math.sqrt(P.team_power())), 'gear': gear_text(P), 'heroines': len(P.heroes), 'fives': sum(1 for h in P.heroes if get(h)['rarity'] == 5),
        'pulls': P.pulls, 'stones': round(P.w['cur:spirit_stones']), 'jade': round(P.w['cur:immortal_jade']), 'dew': round(P.w['cur:blossom_dew']),
        'hunt': P.trial_best['mode:hunts'], 'valley': P.trial_best['mode:valley'], 'shrine': P.trial_best['mode:shrines'],
        'sect': f"main {P.sect['main']} caves {P.sect['caves']} garden {P.sect['garden']} alch {P.sect['alchemy']}",
    }


def gear_text(P):
    ps = [p for h in P.team() for p in P.heroes[h]['gear'].values()]
    if not ps: return '-'
    t = Counter(p['tier'][5:].upper() for p in ps).most_common(1)[0][0]
    r = Counter(RARITY[p['rarity']]['name'] for p in ps).most_common(1)[0][0]
    return f"{len(ps)} pieces, mostly {t} {r}, +{sum(p['plus'] for p in ps) / len(ps):.1f}"


def trial_stage(trial, P, hid):
    """A tribulation as a stage: the trial's lightning waves, then her Heart Demon (her stats at the trial's level, with
    her gear, 2.6 times her Health)."""
    h = P.heroes[hid]; keep = h['level']
    lv = max(e['level'] for w in trial['waves'] for e in w)
    h['level'] = lv; P._cache.pop(hid, None); s = P.stats(hid); h['level'] = keep; P._cache.pop(hid, None)
    return {'id': trial['id'], 'trial': trial['id'], 'mode': None, 'waves': trial['waves'], 'power': trial.get('power', 1), 'demon': (offense(s), ehp(s) * 2.6)}


def calib_trial(trial_id, hid, level):
    """A tribulation as calibrated: her Heart Demon from her stats without gear, at the realm of team level `level`."""
    P = Player(random.Random(0)); P.gain(hid); P.heroes[hid]['bt'] = min(7, (level - 1) // 10)
    return trial_stage(get(trial_id), P, hid)


def stage_class(st, hd=0):
    """The win model's classes: story battles and bosses, their Heaven-Defying versions, each hunt, the Valley, shrines."""
    if st.get('trial'): return 'trial'
    m = st.get('mode')
    if m == 'mode:hunts': return st['hunt'].replace(':', ' ')
    if m == 'mode:valley': return 'valley'
    if m == 'mode:shrines': return 'shrine'
    return ('hd ' if hd else 'story ') + ('boss' if st.get('kind') == 'boss' else 'battle')


_THETA = None


def thetas():
    """theta per class from the bisection summaries: at the boundary between the highest level that lost and the lowest
    that won (the geometric mean of the two ratios), the median over the class's stages. A stage that level 1 already
    wins only bounds theta from above and is left out."""
    global _THETA
    if _THETA is None:
        by = defaultdict(list)
        if os.path.exists(CAL_FILE):
            for line in open(CAL_FILE):
                c = json.loads(line)
                if not c.get('summary') or c['threshold'] < 2: continue
                prm = (c.get('gearPar', 0), c.get('stageMul', {}), c.get('powerBase', 1), c.get('stagePower', 1))   # the enemies as the engine had them then
                L = c['threshold']
                if c.get('trial'):       # a tribulation: her Heart Demon is her copy, at her realm when the team was at L
                    sp = lambda Lx: stage_power(calib_trial(c['trial'], c['hero'], Lx), 0, *prm)
                    by['trial'].append(math.sqrt(founders_strength(L) / sp(L) * founders_strength(L - 1) / sp(L - 1)))
                    continue
                st = get(c['stage']); hd = st['heavenDefying']['levelOffset'] if c.get('hd') else 0
                sp = stage_power(st, hd, *prm)
                by[stage_class(st, hd)].append(math.sqrt(founders_strength(L) * founders_strength(L - 1)) / sp)
        import statistics
        _THETA = {k: statistics.median(v) for k, v in by.items()}
    return _THETA


def theta(st, hd=0):
    t = thetas(); c = stage_class(st, hd)
    if c in t: return t[c]
    if c == 'trial' and 'hd boss' in t: return t['hd boss']     # uncalibrated: like a Heaven-Defying boss
    fam = [v for k, v in t.items() if k.split()[0] == c.split()[0]]   # an uncalibrated hunt takes the others' median
    return sorted(fam)[len(fam) // 2] if fam else THETA_DEFAULT


CAL_FILES = [CAL_FILE]


def founders_strength(level, gear=None):
    """The calibration team's strength: the four founders at a level (and realm), with uniform gear if given."""
    P = Player(random.Random(0))
    for h in ('hero:ling_shuang', 'hero:mo_yingyue', 'hero:yan_feihong', 'hero:su_lianhua'):
        P.gain(h); P.heroes[h]['level'] = level; P.heroes[h]['bt'] = min(7, (level - 1) // 10)
        if gear:
            tier, rarity, plus = gear
            roll = {'rarity:rare': 0.47, 'rarity:epic': 0.57, 'rarity:legendary': 0.67, 'rarity:mythic': 0.77}.get(rarity, 0.5)
            nsub = min(4, {'rarity:rare': 1, 'rarity:epic': 2, 'rarity:legendary': 2, 'rarity:mythic': 3}.get(rarity, 1) + plus // 3)
            subs = ['stat:atk/pct', 'stat:crit/pct', 'stat:hp/pct', 'stat:def/pct'][:nsub]
            for pos, key in (('slot:weapon', 'stat:atk/flat'), ('slot:helmet', 'stat:hp/flat'), ('slot:body', 'stat:def/flat'), ('slot:gloves', 'stat:atk/pct'), ('slot:pants', 'stat:hp/pct'),
                             ('slot:boots', 'stat:atk/pct'), ('ring1', 'stat:atk/pct'), ('ring2', 'stat:hp/pct'), ('slot:pendant', 'stat:crit_dmg/pct')):
                P.heroes[h]['gear'][pos] = {'slot': pos, 'tier': tier, 'rarity': rarity, 'main': key, 'roll': roll, 'subs': [[k, [roll]] for k in subs], 'plus': plus, 'set': None}
    return P.team_power()


def calibration_rows():
    rows = []
    for f in CAL_FILES:
        if not os.path.exists(f): continue
        for line in open(f):
            c = json.loads(line)
            if c.get('summary'): continue
            gear = (c['tier'], c['rarity'], c['plus']) if c.get('tier') else None
            c['R'] = founders_strength(c['level'], gear) / stage_power(get(c['stage']), get(c['stage'])['heavenDefying']['levelOffset'] if c.get('hd') else 0, c.get('gearPar', 0), c.get('stageMul', {}), c.get('powerBase', 1), c.get('stagePower', 1))
            if gear: c['gear'] = f"{c['tier'][5:].upper()} {c['rarity'][7:]} +{c['plus']}"
            rows.append(c)
    return sorted(rows, key=lambda c: c['R'])


MILESTONES = [('Peach Blossom Ford cleared', 'Journey chapter 1 cleared'), ('Frostpeak cleared', 'Chapter 2 cleared'), ('Moonshadow Bamboo Sea cleared', 'Chapter 3 cleared'),
              ('Vermilion Ruins cleared', 'Chapter 4 cleared'), ('Gate of the Jade Pool cleared', 'Volume 1 cleared (chapter 5)')]


def milestones(P):
    """The first time each milestone happened in a run, in hours of play."""
    m = {}
    names = dict(MILESTONES)
    for t, txt in P.log:
        if txt in names: m.setdefault(names[txt], t)
        if ' reaches ' in txt: m.setdefault('First heroine in ' + txt.split(' reaches ')[1], t)
        if txt.endswith('Heaven-Defying stages cleared'): m.setdefault(f'{txt.split()[0]} of 35 Heaven-Defying stages cleared', t)
        if txt.endswith('cleared') and ' level ' in txt: m.setdefault(f"A hunt at level {txt.split(' level ')[1].split()[0]} cleared", t)
    return m


def report(runs, hours, path):
    """A markdown report: when the milestones come (median and spread over all runs), the median run hour by hour, the
    win model's calibration and where the time goes."""
    import statistics as stx
    marks = defaultdict(list)
    for P, tl in runs:
        for k, t in milestones(P).items(): marks[k].append(t)
    order = sorted(marks.items(), key=lambda kv: stx.median(kv[1]))
    P, tl = runs[len(runs) // 2]
    out = ['# Economy simulation', '',
           f'Generated by `tools/economy_sim.py --hours {hours:g} --runs {len(runs)}`: {len(runs)} players, each playing {hours:g} hours in two 45-minute sessions a day. '
           'The simulation replays the data\'s rules (stats by level and realm, gear rolls and refining, EXP, drop tables, first-clear and star rewards, '
           'the Sect\'s timers, duties, the Market and the Fate Pond) with a simple player, and decides battles with a win model calibrated on the real engine '
           '(below). Enemy power comes from `rules:growth`: '
           f'Health and Attack times {POWER_BASE:g}, times 1 + ' + (('(' + ', '.join(f'{x:g}' for x in GEAR_PAR) + ') by realm') if isinstance(GEAR_PAR, (list, tuple)) else f'{GEAR_PAR:g} a realm')
           + (', times each class\'s multiplier (' + ', '.join(f'{k} {v:g}' for k, v in sorted(STAGE_MUL.items())) + ')' if STAGE_MUL else '') + ', and some stages\' own `power`.', '',
           '## When things happen (hours of play)', '', '| Milestone | Median | Earliest | Latest | Runs |', '| --- | --- | --- | --- | --- |']
    for k, v in order:
        if len(v) < max(2, len(runs) // 4): continue
        out.append(f'| {k} | {stx.median(v):.1f} | {min(v):.1f} | {max(v):.1f} | {len(v)}/{len(runs)} |')
    out += ['', '## One player, hour by hour (the median seed)', '', '| Hour | Day | Journey | Heaven-Defying | Team (level/cap) | Gear | Heroines (5★) | Summons | Best hunt / Valley / shrine | Stones | Sect |',
            '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |']
    for r in tl:
        out.append(f"| {r['hour']} | {r['day']} | {r['journey']} | {r['hd']} | {r['team']} | {r['gear']} | {r['heroines']} ({r['fives']}) | {r['pulls']} | {r['hunt']} / {r['valley']} / {r['shrine']} | {r['stones']:,} | {r['sect']} |")
    tot = Counter()
    for P2, _ in runs: tot.update(P2.stats_time)
    names = {'mode:hunts': 'Demon Hunts', 'mode:shrines': 'Five Phases Shrines', 'mode:valley': 'Medicine King Valley battles', 'valley sweeps': 'Medicine King Valley sweeps',
             'heaven_defying': 'Heaven-Defying stages', 'journey': 'Journey battles', 'journey_replay': 'Journey battles again', 'story': 'Reading the story',
             'menus': 'Menus: gear, the Sect, summons', 'battles lost': 'Battles lost', 'tribulations': 'Tribulations'}
    out += ['', '## Where the time goes (all players)', '', '| Activity | Share of play |', '| --- | --- |']
    allm = sum(tot.values()) or 1
    for k, v in tot.most_common(): out.append(f'| {names.get(k, k)} | {v / allm:.0%} |')
    out += ['', 'The player: two 45-minute sessions a day, 12 hours apart (the Sect works in between); four minutes of menus a session; '
            f'Journey stages and first clears by hand, tried once the margin reaches 1; farming on auto where the margin is at least {FARM_MARGIN:g} '
            f'(about nine wins in ten); Medicine King Valley swept at three stars (up to {SWEEP_BUDGET} runs a session while the team is under its level cap '
            'or short of Spirit Stones). Gear goes to whichever team heroine it helps most, judged as if refined as far as the piece it replaces, and refining '
            'spends what is left above a reserve of stones. Breakthroughs need the pill, the stones and, from Core Formation on, a won tribulation.']
    th = thetas()
    out += ['', '## The win model', '',
            'A team wins when its strength, offense (Attack with critical hits) times effective Health (Health with Defense) summed over the team, reaches theta '
            'times the stage\'s strength (the same product for each wave, summed over the waves). Theta belongs to a class of stages and comes from real battles: '
            'the four founders on auto, without gear, against each stage below at every level until the lowest level that wins at least two battles in three '
            f'(`tools/calibrate.cjs --bisect`). By hand a player needs {MANUAL:g} of the strength. Battles are noisy: the margin is multiplied by a log-normal '
            f'draw (sigma {WIN_SIGMA:g}) before the test, so at margin 1 a team wins half the time.', '',
            '| Class | Theta | Stages |', '| --- | --- | --- |']
    by = defaultdict(list)
    for line in (open(CAL_FILE) if os.path.exists(CAL_FILE) else []):
        c = json.loads(line)
        if not c.get('summary') or c.get('verify'): continue
        if c.get('trial'): by['trial'].append(f"{get(c['trial'])['name']} for {get(c['hero'])['name']} (level {c['threshold']})"); continue
        by[stage_class(get(c['stage']), get(c['stage'])['heavenDefying']['levelOffset'] if c.get('hd') else 0)].append(f"{c['stage'][6:]}{' HD' if c.get('hd') else ''} (level {c['threshold']})")
    for k in sorted(th): out.append(f"| {k} | {th[k]:.3f} | {', '.join(by.get(k, []))} |")
    out += ['', 'A level of 0 means the founders already won at level 1 (it only bounds theta, so it is left out of the fit); -1 means they lost even at level 80.']
    # the check: the same bisection with the new enemy numbers, against what the model predicted
    rows, before = [], {}
    for line in (open(CAL_FILE) if os.path.exists(CAL_FILE) else []):
        c = json.loads(line)
        if not c.get('summary') or not c.get('stage'): continue
        k = (c['stage'], bool(c.get('hd')))
        if c.get('verify'): rows.append(c)
        elif c['threshold'] >= 2: before[k] = c
    if rows:
        out += ['', '## Checking the model', '', 'After the new enemy numbers went into the data, the same bisection ran again on stages of each kind. '
                'The prediction is the lowest level at which the founders reach the stage\'s own theta (from the first calibration) against its new strength.', '',
                '| Stage | Level of its enemies | Founders needed before | Predicted now | Measured now |', '| --- | --- | --- | --- | --- |']
        for c in rows:
            k = (c['stage'], bool(c.get('hd'))); b = before.get(k)
            if not b: continue
            st = get(c['stage']); hd = st['heavenDefying']['levelOffset'] if c.get('hd') else 0
            old_p = (b.get('gearPar', 0), b.get('stageMul', {}), b.get('powerBase', 1), b.get('stagePower', 1))
            new_p = (c.get('gearPar', 0), c.get('stageMul', {}), c.get('powerBase', 1), c.get('stagePower', 1))
            t = math.sqrt(founders_strength(b['threshold']) * founders_strength(b['threshold'] - 1)) / stage_power(st, hd, *old_p)
            need = t * stage_power(st, hd, *new_p)
            pred = next((L for L in range(1, 81) if founders_strength(L) >= need), 81)
            lv = max(e['level'] for w in st['waves'] for e in w) + hd
            out.append(f"| {c['stage'][6:]}{' HD' if c.get('hd') else ''} | {lv} | {b['threshold']} | {pred} | {c['threshold']} |")
    open(path, 'w').write('\n'.join(out) + '\n')
    return path


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--hours', type=float, default=30)
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--runs', type=int, default=1)
    ap.add_argument('--report', default=None)
    ap.add_argument('--quiet', action='store_true')
    ap.add_argument('--power-base', type=float, default=None, help='override rules:growth enemyPowerBase')
    ap.add_argument('--gear-par', default=None, help='override rules:growth enemyGearPar (a number or a JSON list by realm)')
    ap.add_argument('--stage-mul', default=None, help='override rules:growth stageMultiplier (JSON)')
    a = ap.parse_args()
    if a.power_base is not None: POWER_BASE = a.power_base
    if a.gear_par is not None: GEAR_PAR = json.loads(a.gear_par)
    if a.stage_mul: STAGE_MUL.update(json.loads(a.stage_mul))
    runs = []
    for seed in range(a.seed, a.seed + a.runs):
        P, tl = simulate(a.hours, seed)
        runs.append((P, tl))
        if not a.quiet:
            for row in tl: print(row)
            print('time by activity (h):', {k: round(v / 60, 1) for k, v in P.stats_time.items()})
            print('events:', P.log[:60])
    if a.report: print('report:', report(runs, a.hours, a.report))
