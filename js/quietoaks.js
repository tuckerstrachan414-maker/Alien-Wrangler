// Stage 2, Scene 1 (Quiet Oaks) director.
//
//   arrive -> letterboxed: the van rolls in along Acorn Ln with its
//             headlights on and pulls up at the curb; the lights go off,
//             the agent climbs out and looks up and down the street.
//   hunt   -> catch the three that came here in the truck, under Maple
//             Street's noise rules (Voss warns at half and at four-fifths
//             full). Every one loaded into the van pays. A tip about the
//             noise, a hint for the gadget in slot 1 (and whether it's
//             quiet), a ping on the nearest hider when nothing has moved in
//             a while, a nag at the gate.
//   gather -> the third is caught (grabbed, or the last of them secured
//             some other way) and the signal comes through. The one in his
//             hands lights up; more of them creep out of the bushes and walk
//             in out of the dark (a mixed crowd: Grunts, a couple of Scouts,
//             an armoured Trooper, a shimmering Elite), stand round him with
//             their eyes lit, taking in the message, then turn as one and
//             march off together, two by two, out through the QUIET OAKS
//             gate. He keeps hold of his. Voss on the radio: "Agent?" Fade.
//   busted -> the noise meter filled: every light on the street snaps on,
//             sirens, the aliens scatter, the agent freezes. Fade; the scene
//             is failed and the results offer a retry.
//
// The objective panel, radio, markers and cutscene plumbing come from the
// shared StoryDirector (director.js); the words from data/stage2.js.
import { sfx } from './audio.js';
import { findPath } from './nav.js';
import { StoryDirector } from './director.js';
import { Alien } from './entities.js';
import { GEAR } from './data/missions.js';
import { TILE } from './data/sprites.js';
import { pixelText } from './data/storyArt.js';
import { RADIO_QO, OBJECTIVES_QO, HINTS_QO, GLOW_QO, TIPS_QO, FAILS } from './data/stage2.js';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => 1 - (1 - t) * (1 - t);

// Who answers the call: mostly Grunts, a couple of Scouts, a Trooper, an Elite.
const CROWD = ['grunt', 'grunt', 'scout', 'grunt', 'grunt', 'trooper', 'grunt', 'grunt',
  'scout', 'grunt', 'elite', 'grunt', 'grunt', 'grunt'];
const SYMBOLS = '!#$&%*?';
const BEAT = 0.9;              // the signal's pulse (seconds)

// The agent's reactions ('#' = an ink-outlined pixel).
const GLYPHS = {
  bang: ['##', '##', '##', '##', '##', '##', '..', '##', '##'],
  query: ['.###.', '##.##', '...##', '..##.', '..##.', '.....', '..##.', '..##.'],
};

export class QuietOaksScene extends StoryDirector {
  constructor(game) {
    // the gadget hint names whatever is in slot 1
    const g1 = GEAR.find(x => x.id === game.loadout[0]);
    const name = g1 ? g1.short : 'GADGET';
    const hints = { gadget: Object.fromEntries(Object.entries(HINTS_QO.gadget).map(([k, v]) => [k, v.replace('{G}', name)])) };
    super(game, { objectives: OBJECTIVES_QO, hints, glow: GLOW_QO });
    this.gadget = g1 || null;
    this.step = 'arrive';          // arrive | hunt | gather | busted
    this.sinceFlush = 0;
    this.nagT = -99;
    this.targets = game.aliens.slice();      // the three from the truck
    this.seedHiding();
    this.startArrival();
  }

  // The three have gone to ground in three different yards, none of them
  // close to where the van pulls up.
  seedHiding() {
    const g = this.game, map = g.map, spawn = map.spawn;
    const houses = map.houseList || [];
    const yardOf = (s) => {
      let best = -1, bd = 1e9;
      houses.forEach((h, i) => {
        const d = Math.hypot(s.x - (h.x0 + h.x1) / 2, s.y - h.base);
        if (d < bd) { bd = d; best = i; }
      });
      return best;
    };
    const byYard = new Map();
    for (const s of g.hideSpots) {
      if (Math.hypot(s.x - spawn.x, s.y - spawn.y) < 220) continue;
      const k = yardOf(s);
      if (!byYard.has(k)) byYard.set(k, []);
      byYard.get(k).push(s);
    }
    const yards = [...byYard.keys()].sort(() => Math.random() - 0.5);
    this.targets.forEach((a, i) => {
      const list = byYard.get(yards[i % yards.length]) || g.hideSpots;
      const s = list[Math.floor(Math.random() * list.length)];
      if (!s) return;
      a.hideSpot = s; a.x = s.x; a.y = s.y;
    });
  }

  /* ---------------- arrival ---------------- */

  startArrival() {
    const g = this.game, p = g.player, map = g.map;
    this.enterCutscene({ skip: false });
    this.ownsPlayer = true;
    const v = map.van;
    this.vanHome = { x: v.x, y: v.y };
    g.moveVan(map.arrive.x0, map.arrive.lane);
    p.alpha = 0;
    p.facing = 'right';
    g.cam.x = this.vanHome.x + 60; g.cam.y = this.vanHome.y + 10;
    g.camTarget = { x: this.vanHome.x + 40, y: this.vanHome.y + 12 };
    g.camEase = 0.08;
    this.cs = { t: 0, phase: 'roll', pt: 0, lb: 1, fade: 1, lights: 1 };
    sfx.engine();
  }

  updateArrival(dt) {
    const g = this.game, p = g.player, map = g.map, cs = this.cs;
    cs.t += dt; cs.pt += dt;
    if (cs.phase === 'roll') {
      // in along the lane, easing off, pulling in to the curb
      const k = ease(Math.min(1, cs.pt / 2.3));
      const x = map.arrive.x0 + (this.vanHome.x - map.arrive.x0) * k;
      const y = map.arrive.lane + (this.vanHome.y - map.arrive.lane) * clamp((k - 0.55) / 0.45, 0, 1);
      g.moveVan(x, y);
      cs.fade = Math.max(0, 1 - cs.pt / 0.7);
      if (cs.pt > 1.7 && !cs.braked) { cs.braked = true; sfx.brake(); }
      if (cs.pt >= 2.3) { cs.phase = 'park'; cs.pt = 0; g.moveVan(this.vanHome.x, this.vanHome.y); }
    } else if (cs.phase === 'park') {
      cs.lights = Math.max(0, 1 - cs.pt / 0.5);
      if (cs.pt > 0.7) {
        cs.phase = 'out'; cs.pt = 0;
        sfx.clonk();
        p.x = g.vanDoor.x - 2; p.y = g.vanDoor.y + 2;
        p.facing = 'right';
      }
    } else if (cs.phase === 'out') {
      // out he climbs, a couple of steps clear of the van
      p.alpha = Math.min(1, cs.pt / 0.25);
      p.x = g.vanDoor.x - 2 + Math.min(1, cs.pt / 0.6) * 12;
      p.moving = cs.pt < 0.6;
      if (p.moving) p.walkT += dt * 9;
      if (cs.pt > 0.9) { cs.phase = 'look'; cs.pt = 0; p.moving = false; }
    } else if (cs.phase === 'look') {
      p.facing = cs.pt < 0.3 ? 'right' : cs.pt < 0.65 ? 'left' : cs.pt < 0.95 ? 'up' : 'down';
      cs.lb = Math.max(0, 1 - Math.max(0, cs.pt - 0.7) / 0.4);
      if (cs.pt > 1.15) this.startHunt();
    }
  }

  startHunt() {
    const g = this.game, p = g.player;
    this.cs = null;
    p.alpha = 1;
    g.camTarget = null;
    this.exitCutscene();
    this.step = 'hunt';
    this.stepT = 0;
    this.objective('catch', `${g.captured}/${g.mission.goal}`);
    this.radio(RADIO_QO.start, true);
    this.radio(RADIO_QO.goal, true);
  }

  /* ---------------- events from the game ---------------- */

  // All three are in hand or in the van.
  allCaught() {
    return this.targets.every(a => a.state === 'carried' || a.state === 'deposited');
  }

  on(evt) {
    if (this.step === 'gather' || this.step === 'busted') return;
    const g = this.game;
    switch (evt) {
      case 'busted':
        this.startBusted();
        break;
      case 'flush':
        this.sinceFlush = 0;
        if (this.step === 'hunt' && !this.seen.spotted) { this.seen.spotted = true; this.radio(RADIO_QO.spotted); }
        break;
      case 'grab':
        if (this.allCaught()) this.startGather();
        break;
      case 'secure':
        if (this.allCaught()) { this.startGather(); return; }
        this.objective('catch', `${g.captured}/${g.mission.goal}`);
        this.radio(RADIO_QO.secured[Math.min(g.captured, RADIO_QO.secured.length - 1)]);
        break;
      case 'hit':
        if (!this.seen.tackled) { this.seen.tackled = true; this.radio(RADIO_QO.tackled); }
        break;
    }
  }

  /* ---------------- per frame ---------------- */

  update(dt) {
    this.t += dt;
    this.stepT += dt;
    if (this.step === 'arrive') { this.updateArrival(dt); return; }
    if (this.step === 'gather') { this.updateGather(dt); return; }
    if (this.step === 'busted') { this.updateBusted(dt); return; }
    const g = this.game, p = g.player, map = g.map;
    this.sinceFlush += dt;

    // the tips: the noise first, then the gadget in slot 1 (and whether it's quiet)
    if (!this.seen.noiseTip && this.stepT > 3) { this.seen.noiseTip = true; this.tip(TIPS_QO.noise, 6); }
    if (this.gadget && !this.seen.gadgetTip && this.stepT > 10) {
      this.seen.gadgetTip = true;
      this.tip(this.hintText('gadget'), 6, 'gadget');
    }
    if (this.gadget && !this.seen.quietTip && this.stepT > 17) {
      this.seen.quietTip = true;
      const quiet = TIPS_QO.quiet.includes(this.gadget.id);
      const loud = this.gadget.id === 'noisemaker';
      if (quiet || loud) this.tip((quiet ? TIPS_QO.silent : TIPS_QO.loud).replace('{G}', this.gadget.short), 6);
    }

    // Voss hears it getting loud
    const s = g.suspicion;
    if (s >= 50 && !this.seen.n50) { this.seen.n50 = true; this.radio(RADIO_QO.noise50); }
    if (s >= 80 && !this.seen.n80) { this.seen.n80 = true; this.radio(RADIO_QO.noise80, true); }
    if (s < 25) { this.seen.n50 = false; this.seen.n80 = false; }

    // lost for a while: ping the nearest hider
    if (this.sinceFlush > 28 && !p.carried.length) {
      this.sinceFlush = 0;
      const a = this.nearestHidden();
      if (a) { this.radio(RADIO_QO.lost); this.helpT = 6; this.helpAlien = a; }
    }
    this.marker = null;
    if (this.helpT > 0) {
      this.helpT -= dt;
      if (this.helpAlien && this.helpAlien.state === 'hiding') this.marker = { x: this.helpAlien.x, y: this.helpAlien.y, kind: 'find' };
      else this.helpT = 0;
    }
    if (p.carried.length) this.marker = { x: g.vanDoor.x, y: g.vanDoor.y, kind: 'van' };

    // heading out of the gate before the job's done
    if (map.gate && p.y > map.h - 110 && Math.abs(p.x - map.gate.x) < 80 && this.t - this.nagT > 12) {
      this.nagT = this.t;
      this.radio(RADIO_QO.exitNag);
    }

    this.tickUi(dt);
  }

  /* ---------------- the gathering ---------------- */

  startGather() {
    const g = this.game, p = g.player;
    this.step = 'gather';
    this.enterCutscene();
    this.ownsPlayer = true;
    p.state = 'normal'; p.vx = 0; p.vy = 0; p.moving = false; p.sprinting = false; p.z = 0; p.zv = 0;
    this.marker = null;
    g.camTarget = { x: p.x, y: p.y - 8 };
    g.camEase = 0.06;
    this.cs = { t: 0, phase: 'hush', pt: 0, lb: 0, fade: 0, beatT: 0, glow: 0, sym: 0 };
    this.crowd = this.buildCrowd();
    this.fled = this.crowd.length;
  }

  // Where the crowd comes from (bushes and hedges on screen, and just off
  // each edge of it) and where each one stands, round the agent.
  buildCrowd() {
    const g = this.game, p = g.player, map = g.map, nav = g.nav;
    const vw = g.view.w || 200, vh = g.view.h || 300;
    const camX = clamp(g.cam.x, vw / 2, map.w - vw / 2) - vw / 2;
    const camY = clamp(g.cam.y, vh / 2, map.h - vh / 2) - vh / 2;
    const open = (x, y) => {
      const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
      return cx >= 0 && cy >= 0 && cx < nav.gw && cy < nav.gh && nav.cells[cy * nav.gw + cx] !== 1;
    };
    // the ring round him: two loose rings, every spot somewhere you can stand
    const slots = [];
    for (let i = 0; i < CROWD.length; i++) {
      const inner = i < 7;
      const a = (i / (inner ? 7 : 7)) * Math.PI * 2 + (inner ? 0 : Math.PI / 7) + rand(-0.12, 0.12);
      let r = inner ? 34 : 54;
      let x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r * 0.75;
      for (let tries = 0; tries < 6 && !open(x, y); tries++) {
        r *= 0.82;
        x = p.x + Math.cos(a) * r; y = p.y + Math.sin(a) * r * 0.75;
      }
      slots.push({ x, y });
    }
    // out of the bushes on screen first, then in from the edges
    const onScreen = g.hideSpots
      .filter(s => s.x > camX + 10 && s.x < camX + vw - 10 && s.y > camY + 20 && s.y < camY + vh - 10 &&
        Math.hypot(s.x - p.x, s.y - p.y) > 40)
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))
      .slice(0, 6);
    const edges = [];
    const ring = Math.max(vw, vh) * 0.62;
    for (let k = 0; k < 24 && edges.length < CROWD.length; k++) {
      const a = k / 24 * Math.PI * 2 + 0.2;
      for (let f = 1; f > 0.4; f -= 0.1) {
        const x = p.x + Math.cos(a) * ring * f, y = p.y + Math.sin(a) * ring * f * 0.8;
        if (x < 20 || y < 20 || x > map.w - 20 || y > map.h - 20 || !open(x, y)) continue;
        const sx = x - camX, sy = y - camY;
        if (sx > -2 && sx < vw + 2 && sy > -2 && sy < vh + 2 && f < 1) continue;   // only from out of view
        edges.push({ x, y });
        break;
      }
    }
    return CROWD.map((tier, i) => {
      const fromBush = i < onScreen.length;
      const src = fromBush ? onScreen[i] : (edges[(i - onScreen.length) % Math.max(1, edges.length)] || { x: p.x + 160, y: p.y });
      const a = new Alien(tier, { x: src.x, y: src.y });
      a.state = 'scripted';
      a.alpha = 0;
      a.cloaked = false;
      a.helmet = tier === 'trooper';
      a.crowd = { i, fromBush, slot: slots[i], startAt: fromBush ? 0.8 + i * 0.28 : 1.3 + (i - onScreen.length) * 0.22, src };
      a.script = { path: [], i: 0, speed: 0, wait: 99, face: { x: p.x, y: p.y } };
      a.facing = 'down';
      g.aliens.push(a);
      return a;
    });
  }

  updateGather(dt) {
    const g = this.game, p = g.player, map = g.map, cs = this.cs;
    cs.t += dt; cs.pt += dt;
    cs.lb = Math.min(1, cs.lb + dt * 2.5);
    // the signal pulsing, while it lasts
    if (cs.phase === 'hush' || cs.phase === 'emerge' || cs.phase === 'receive') {
      cs.beatT -= dt;
      if (cs.beatT <= 0) { cs.beatT = BEAT; cs.pulse = 0; sfx.signal(); }
      cs.pulse = (cs.pulse || 0) + dt;
      cs.glow = Math.min(1, cs.glow + dt * 1.5);
    } else {
      cs.glow = Math.max(0, cs.glow - dt * 3);
    }
    cs.sym += dt;
    // the one he's holding pulls at him the whole time the others are here
    p.strain = cs.phase === 'march' ? 2 : cs.phase === 'receive' ? 1 : cs.phase === 'after' ? 0.5 : 0;

    for (const a of this.crowd) this.moveCrowd(a, cs, dt);

    if (cs.phase === 'hush') {
      // he freezes: "!"
      if (cs.pt > 0.35 && !cs.startled) { cs.startled = true; sfx.startle(); p.zv = 120; p.z = 0.1; }
      if (cs.pt > 0.8) { cs.phase = 'emerge'; cs.pt = 0; }
    } else if (cs.phase === 'emerge') {
      // looking round as they come
      p.facing = ['left', 'right', 'down', 'up'][Math.floor(cs.pt / 0.7) % 4];
      const here = this.crowd.filter(a => a.crowd.arrived).length;
      if (here >= this.crowd.length || cs.pt > 9) {
        cs.phase = 'receive'; cs.pt = 0;
        // pull the camera back a touch so the whole ring is in
        g.camTarget = { x: p.x, y: p.y - 4 };
      }
    } else if (cs.phase === 'receive') {
      p.facing = 'down';
      if (cs.pt > 3.6) {
        // the message ends: silence, then every head turns at once
        cs.phase = 'turn'; cs.pt = 0;
      }
    } else if (cs.phase === 'turn') {
      if (cs.pt > 0.7 && !cs.turned) {
        cs.turned = true;
        sfx.stomp();
        for (const a of this.crowd) a.script.face = { x: map.gate.x, y: map.gate.y };
      }
      if (cs.pt > 1.4) this.startMarch();
    } else if (cs.phase === 'march') {
      // follow the column, hold at the gate as the tail goes through
      const on = this.crowd.filter(a => a.state === 'scripted' && a.y < map.h + 10);
      if (on.length) {
        const cx = on.reduce((s, a) => s + a.x, 0) / on.length, cy = on.reduce((s, a) => s + a.y, 0) / on.length;
        g.camTarget = { x: cx, y: Math.min(cy, map.h - 60) };
        g.camEase = 0.1;
      }
      p.facing = 'down';
      for (const a of this.crowd) {
        if (a.state === 'scripted' || a.state === 'fled') a.alpha = clamp((map.h + 14 - a.y) / 40, 0, 1);
      }
      const gone = this.crowd.filter(a => a.state === 'fled' || a.y > map.h + 6).length;
      if ((gone >= this.crowd.length && cs.pt > 2) || cs.pt > 22) {
        cs.phase = 'after'; cs.pt = 0;
        g.camTarget = { x: p.x, y: p.y - 6 };
        g.camEase = 0.04;
      }
    } else if (cs.phase === 'after') {
      // back on him, still hanging on to his: "?" -- and Voss
      p.facing = 'down';
      if (cs.pt > 1.0 && !cs.called) {
        cs.called = true;
        this.radioEl.classList.add('cine-ok');
        this.radio(RADIO_QO.aftermath, true);
      }
      if (cs.called) this.updateRadio(dt);
      if (cs.pt > 4.6) cs.fade = Math.min(1, (cs.pt - 4.6) / 0.8);
      if (cs.pt > 5.6) this.endScene();
    }
    if (cs.phase === 'hush') this.integrateZ(p, dt);
  }

  // One of the crowd: hidden until it's time, out of its bush (or in from
  // the dark) to its place in the ring, then stood there with its eyes lit.
  moveCrowd(a, cs, dt) {
    const g = this.game, p = g.player, c = a.crowd;
    if (cs.phase === 'march' || cs.phase === 'after') return;
    if (!c.started && cs.t >= c.startAt) {
      c.started = true;
      a.alpha = 1;
      if (c.fromBush) {
        g.rustle({ x: c.src.x, y: c.src.y, hideSpot: null });
        g.puff(c.src.x, c.src.y, '#8fe870');
        if (c.i % 2 === 0) sfx.squeak();
      }
      const path = findPath(g.nav, a.x, a.y, c.slot.x, c.slot.y) || [];
      path.push({ x: c.slot.x, y: c.slot.y });
      a.script = { path, i: 0, speed: c.fromBush ? 46 : 40, wait: 0, hold: true, face: { x: p.x, y: p.y } };
    }
    if (!c.started) { a.alpha = 0; return; }
    if (!c.arrived && a.script.wait > 1e8) c.arrived = true;
    if (c.arrived) a.script.face = cs.phase === 'turn' && cs.turned ? a.script.face : { x: p.x, y: p.y };
  }

  // The way out, along the streets: from wherever the crowd is to the
  // nearest street (Acorn Ln, Oak Hollow Dr, or round the cul-de-sac), along
  // it to Oak Hollow Dr, and down that out of the gate.
  streetRoute(from) {
    const map = this.game.map, st = map.streets, B = st.bulb;
    const ox = (st.roadX[0] + st.roadX[1]) / 2, ay = (st.roadY[0] + st.roadY[1]) / 2;
    const out = [{ x: ox, y: map.h - 30 }, { x: ox, y: map.h + 40 }];
    const toB = Math.atan2(from.y - B.y, from.x - B.x);
    const ring = { x: B.x + Math.cos(toB) * 48, y: B.y + Math.sin(toB) * 48 };
    const options = [
      { d: Math.abs(from.y - ay), route: [{ x: clamp(from.x, 90, map.w - 90), y: ay }, { x: ox, y: ay }] },
      { d: from.y > B.y + 70 ? Math.abs(from.x - ox) : 1e9, route: [{ x: ox, y: clamp(from.y, B.y + 70, map.h - 40) }] },
      // round the island, never across it
      { d: Math.hypot(from.x - B.x, from.y - B.y) - 60, route: [ring].concat(ring.y < B.y + 20 ? [{ x: ring.x < B.x ? B.x - 50 : B.x + 50, y: B.y + 24 }] : []).concat([{ x: ox, y: B.y + 76 }]) },
    ];
    const best = options.reduce((a, b) => (b.d < a.d ? b : a));
    return best.route.concat(out);
  }

  // Message received: off they go, two by two, down the street and out the
  // gate.
  startMarch() {
    const g = this.game, cs = this.cs;
    cs.phase = 'march'; cs.pt = 0;
    const mx = this.crowd.reduce((s, a) => s + a.x, 0) / this.crowd.length;
    const my = this.crowd.reduce((s, a) => s + a.y, 0) / this.crowd.length;
    const route = this.streetRoute({ x: mx, y: my });
    // order them by how near the route's start they are, pair them off
    const order = this.crowd.slice().sort((a, b) => Math.hypot(a.x - route[0].x, a.y - route[0].y) - Math.hypot(b.x - route[0].x, b.y - route[0].y));
    order.forEach((a, i) => {
      const side = i % 2 ? 1 : -1;
      const lane = route.map((q, j) => {
        const n = route[Math.min(route.length - 1, j + 1)], pv = route[Math.max(0, j - 1)];
        const dx = n.x - pv.x, dy = n.y - pv.y, l = Math.hypot(dx, dy) || 1;
        return { x: q.x - dy / l * 7 * side, y: q.y + dx / l * 7 * side };
      });
      const join = findPath(g.nav, a.x, a.y, lane[0].x, lane[0].y) || [];
      a.script = { path: join.concat(lane), i: 0, speed: 50, wait: Math.floor(i / 2) * 0.55, face: { x: lane[0].x, y: lane[0].y } };
      a.marchT = 0;
    });
    sfx.signal();
  }

  endScene() {
    if (this.ended) return;
    const g = this.game, p = g.player;
    // he kept hold of his: it goes in the van with the rest
    for (const a of p.carried.slice()) g.secureAlien(a);
    p.carried.length = 0;
    p.strain = 0;
    this.radioEl.classList.remove('cine-ok');
    super.endScene();
  }

  // SKIP: straight to the end of the gathering (the arrival and the bust
  // can't be skipped).
  onSkip() {
    if (this.step === 'gather') {
      for (const a of this.crowd || []) { a.state = 'fled'; a.alpha = 0; }
      this.endScene();
    }
  }

  /* ---------------- busted ---------------- */

  startBusted() {
    const g = this.game, p = g.player;
    if (this.step === 'busted' || this.step === 'gather') return;
    this.step = 'busted';
    this.enterCutscene({ skip: false });
    this.ownsPlayer = true;
    p.vx = 0; p.vy = 0; p.moving = false; p.sprinting = false;
    g.shake = 6;
    sfx.alert();
    g.announce('NEIGHBORS CALLED THE COPS!', 3.2);
    // every window on the street lights up, and stays lit
    for (const h of g.homes) h.alertT = 99;
    // they scatter
    for (const a of g.aliens) if (a.free && a.state === 'hiding') a.flush(g);
    this.cs = { t: 0, phase: 'lights', pt: 0, lb: 0, fade: 0, sirenT: 0 };
  }

  updateBusted(dt) {
    const g = this.game, p = g.player, cs = this.cs;
    cs.t += dt; cs.pt += dt;
    cs.lb = Math.min(1, cs.lb + dt * 2.5);
    cs.sirenT -= dt;
    if (cs.sirenT <= 0) { cs.sirenT = 1.5; sfx.siren(); }
    p.moving = false;
    p.facing = cs.t < 0.6 ? p.facing : 'down';
    if (cs.t > 0.3 && !cs.startled) { cs.startled = true; sfx.startle(); p.zv = 130; p.z = 0.1; }
    this.integrateZ(p, dt);
    if (cs.t > 2.8) cs.fade = Math.min(1, (cs.t - 2.8) / 0.8);
    if (cs.t > 3.8 && !this.ended) {
      this.ended = true;
      g.failStory({ reason: FAILS.noise });
    }
  }

  /* ---------------- light ---------------- */

  // Extra lights for the night: the van's headlights rolling in, and the
  // street waking up when it all goes wrong.
  nightLights() {
    const g = this.game, cs = this.cs, out = [];
    if (this.step === 'arrive' && cs && cs.lights > 0) {
      const v = g.map.van;
      out.push({ x: v.x - 16, y: v.y + 22, r: 30, k: cs.lights, warm: 0.3 });
      out.push({ x: v.x - 40, y: v.y + 22, r: 36, k: cs.lights * 0.8, warm: 0.2 });
    }
    if (this.step === 'gather' && cs && cs.glow > 0) {
      // a faint cyan pool round him while the signal comes through
      const p = g.player;
      out.push({ x: p.x, y: p.y, r: 60, k: 0.4 * cs.glow });
    }
    return out;
  }

  /* ---------------- drawing ---------------- */

  // An outlined pixel bitmap, top-left at (x, y).
  glyph(ctx, rows, x, y, col) {
    ctx.fillStyle = '#14141e';
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') ctx.fillRect(x + i - 1, y + j - 1, 3, 3); });
    ctx.fillStyle = col;
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') ctx.fillRect(x + i, y + j, 1, 1); });
  }

  // Eyes lit in time with the signal, and a pulse rising off the head.
  signalGlow(ctx, x, y, facing, k, beat) {
    const on = beat < 0.45;
    ctx.globalAlpha = k * (on ? 1 : 0.55);
    ctx.fillStyle = on ? '#bffcff' : '#41f0d8';
    if (facing === 'down') { ctx.fillRect(x - 3, y + 4, 2, 2); ctx.fillRect(x + 1, y + 4, 2, 2); }
    else if (facing === 'left') ctx.fillRect(x - 4, y + 4, 2, 2);
    else if (facing === 'right') ctx.fillRect(x + 2, y + 4, 2, 2);
    // the ring going up off the head
    const r = 2 + beat * 6;
    ctx.globalAlpha = k * Math.max(0, 1 - beat / BEAT) * 0.8;
    ctx.strokeStyle = '#41f0d8';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x, y - 4 - beat * 8, r, r * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  renderWorld(ctx, camX, camY, vw, vh) {
    super.renderWorld(ctx, camX, camY, vw, vh);
    const g = this.game, p = g.player, cs = this.cs;
    if (!cs) return;
    const hx = Math.round(p.x - camX), hy = Math.round(p.y - camY - 21 - p.z);
    if (this.step === 'gather') {
      const beat = cs.pulse || 0;
      // the crowd's eyes, and a bubble of the message over each of them
      for (const a of this.crowd) {
        if (a.alpha <= 0 || a.state !== 'scripted') continue;
        const ax = Math.round(a.x - camX), ay = Math.round(a.y - camY - 11);
        if (a.tier === 'elite') a.alpha = 0.55 + 0.35 * Math.sin(this.t * 9 + a.id);    // the shimmer
        if (cs.glow > 0) this.signalGlow(ctx, ax, ay, a.facing, cs.glow * Math.min(1, a.alpha * 1.4), beat);
        if (cs.phase === 'receive' && a.crowd.arrived) {
          const sym = Array.from({ length: 3 }, (_, j) => SYMBOLS[Math.floor((Math.sin((a.id + j) * 91.7 + Math.floor(cs.sym * 8)) * 0.5 + 0.5) * SYMBOLS.length) % SYMBOLS.length]).join('');
          const bx = ax - 7, by = ay - 12;
          ctx.fillStyle = '#14141e'; ctx.fillRect(bx - 1, by - 1, 15, 9);
          ctx.fillStyle = '#0a2a2a'; ctx.fillRect(bx, by, 13, 7);
          ctx.fillStyle = '#14141e'; ctx.fillRect(ax - 1, by + 7, 2, 2);
          pixelText(ctx, sym, bx + 1, by + 1, '#7ff8e8');
        }
      }
      // the one he's holding lights up too
      if (cs.glow > 0) {
        p.carried.forEach((a, i) => this.signalGlow(ctx, hx + (p.strain ? Math.round(Math.sin(g.time * 30) * p.strain) : 0), hy - 6 - i * 9 - 10, 'down', cs.glow, cs.pulse || 0));
      }
      // the signal itself: a ring washing out from him on every beat
      if (cs.glow > 0 && cs.pulse !== undefined) {
        const k = cs.pulse / BEAT;
        ctx.globalAlpha = Math.max(0, 1 - k) * 0.5 * cs.glow;
        ctx.strokeStyle = '#41f0d8';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(hx, Math.round(p.y - camY), 10 + k * 90, (10 + k * 90) * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (cs.phase === 'hush' && cs.pt > 0.35) this.glyph(ctx, GLYPHS.bang, hx - 1, hy - 12 - (cs.pt < 0.45 ? 3 : 0), '#ffd75e');
      if (cs.phase === 'after' && cs.pt > 0.3) this.glyph(ctx, GLYPHS.query, hx - 2, hy - 30 - (cs.pt < 0.4 ? 3 : 0), '#eef1f7');
    } else if (this.step === 'busted') {
      if (cs.t > 0.3) this.glyph(ctx, GLYPHS.bang, hx - 1, hy - 12 - (cs.t < 0.4 ? 3 : 0), '#ff5e6c');
    }
  }

  // Letterbox and fades (StoryDirector), plus the police lights flickering
  // in at the edges of the screen when the street wakes up.
  renderScreen(ctx, vw, vh) {
    const cs = this.cs;
    if (this.step === 'busted' && cs) {
      const red = Math.floor(cs.t * 6) % 2 === 0;
      const k = Math.min(1, cs.t / 0.5) * (0.28 + 0.12 * Math.sin(cs.t * 20));
      ctx.globalAlpha = k;
      ctx.fillStyle = red ? '#ff3040' : '#3060ff';
      ctx.fillRect(0, 0, Math.round(vw * 0.18), vh);
      ctx.fillStyle = red ? '#3060ff' : '#ff3040';
      ctx.fillRect(vw - Math.round(vw * 0.18), 0, Math.round(vw * 0.18), vh);
      ctx.globalAlpha = 1;
    }
    if (this.step === 'gather' && cs && cs.glow > 0 && cs.pulse !== undefined && cs.pulse < 0.15) {
      ctx.globalAlpha = 0.07 * cs.glow;
      ctx.fillStyle = '#41f0d8';
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalAlpha = 1;
    }
    super.renderScreen(ctx, vw, vh);
  }
}
