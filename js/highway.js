// Stage 1, Scene 3 (Highway 29) director.
//
//   arrive -> the agent pushes out of the undergrowth at the left edge of
//             the woods and has a look round.
//   hunt   -> secure 3 of the 6. The woods have no end: they stream in from
//             the right as he pushes on (highwayStrip.js), the aliens keep
//             slipping on to hiding places further along (and run that way
//             when flushed), and the van follows on the fire road. About
//             halfway, a sunny clearing with a spiral of leaves in it.
//   bolt   -> the 3rd goes in the van: the woods run out just past the edge
//             of the screen, and the last three break cover and bolt.
//   pursue -> after them: the woods thin out to a creek. They leap it and
//   creek     wait on the far bank. He has to jump it (miss, and he's in the
//             water and climbing back out).
//   chase  -> about 15 seconds of open woods, and they're always just too
//             quick: they keep their lead, and burst clear if he dives.
//             Highway 29 turns up just in time.
//   shot   -> they pull up on the verge, turn, and one of them shoots him
//             with a shock gun.
//   finale -> on him, flat out and crackling; across the road to where they
//             leap into the back of an armoured black semi at the gas
//             station and pull the doors shut; the driver strolls out with
//             his coffee, climbs in without a clue and drives off; back to
//             the agent, crawling after it, then head down in the dirt. Fade.
//
// No radio in this one: just the objective panel. The panel, hints, markers
// and cutscene plumbing come from the shared StoryDirector (director.js).
import { sfx } from './audio.js';
import { findPath } from './nav.js';
import { TILE } from './data/sprites.js';
import { StoryDirector } from './director.js';
import { OBJECTIVES3, HINTS3, GLOW3 } from './data/stage1.js';
import { buildHighwayActors } from './data/highwayArt.js';
import { CW, NP, THK, FN, FS, CREEK_HW, STATION, FINAL_W, SPIRAL } from './data/highwayStrip.js';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const AHEAD = 380;          // how far ahead of the agent they'll go to ground
const CHASE_T = 14.3;       // aim for this; they reach the highway at about 15s
const LEADS = [54, 70, 88]; // how far in front of him each one keeps

// A little pixel glyph with an ink outline ('#' = pixel), top-left at (x, y).
function glyph(ctx, rows, x, y, col) {
  ctx.fillStyle = '#14141e';
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') ctx.fillRect(x + i - 1, y + j - 1, 3, 3); });
  ctx.fillStyle = col;
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') ctx.fillRect(x + i, y + j, 1, 1); });
}
const NOTE = ['.##', '.#.#', '.#', '##', '##'];

// Crackling electricity: a crooked pixel line from (x0, y0) to (x1, y1).
function arc(ctx, x0, y0, x1, y1, col, core) {
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 3));
  let px = x0, py = y0;
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    const qx = Math.round(x0 + (x1 - x0) * k + (i < n ? rand(-2, 2) : 0));
    const qy = Math.round(y0 + (y1 - y0) * k + (i < n ? rand(-2, 2) : 0));
    const steps = Math.max(Math.abs(qx - px), Math.abs(qy - py), 1);
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(px + (qx - px) * s / steps), y = Math.round(py + (qy - py) * s / steps);
      ctx.fillStyle = col; ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3);
      ctx.fillStyle = core; ctx.fillRect(x, y, 1, 1);
    }
    px = qx; py = qy;
  }
}

let ART = null;

export class HighwayScene extends StoryDirector {
  constructor(game) {
    super(game, { objectives: OBJECTIVES3, hints: HINTS3, glow: GLOW3 });
    this.art = ART || (ART = buildHighwayActors());
    this.strip = game.map.strip;
    this.strip.settle(game);
    this.step = 'arrive';     // arrive | hunt | bolt | pursue | creek | chase | shot | finale
    this.sinceFlush = 0;
    this.helpT = 0;
    this.vanV = 0;
    this.vanGoal = null;
    this.dustT = 0;
    this.look = 0;            // camera look-ahead while he's running them down
    this.splashes = 0;
    this.final = false;
    this.pose = null;         // the agent drawn by us (zapped, down, crawling...)
    this.flash = 0;
    this.notes = [];
    game.hideBias = (a, s) => this.hideBias(a, s);
    game.fleeBias = { x: 1, y: 0, w: 1.1 };
    this.seedHiding();
    this.startArrival();
  }

  // Canvas x of things laid out in world coordinates.
  get ox() { return this.strip.ox; }
  creekX(y) { return this.strip.creekCx(y) - this.ox; }
  finalX(lx) { return this.strip.finalAt * CW + lx - this.ox; }
  viewW() { return this.game.view.w || 360; }

  // Six of them, spread out along the woods ahead, none right on top of him.
  seedHiding() {
    const g = this.game;
    const taken = new Set();
    g.aliens.forEach((a, i) => {
      const want = 250 + i * 145 + rand(-30, 30);
      const free = g.hideSpots.filter(s => !taken.has(s) && Math.abs(s.x - want) < 70);
      const s = free.length ? free[Math.floor(Math.random() * free.length)]
        : g.hideSpots.filter(q => !taken.has(q) && q.x > 200).sort((p, q) => Math.abs(p.x - want) - Math.abs(q.x - want))[0];
      if (!s) return;
      taken.add(s);
      a.hideSpot = s; a.x = s.x; a.y = s.y;
      a.sneakT = rand(9, 16);
    });
  }

  /* ---------------- arrival ---------------- */

  startArrival() {
    const g = this.game, p = g.player;
    this.enterCutscene({ skip: false });
    this.ownsPlayer = true;
    p.x = 30; p.y = 234; p.alpha = 0;
    p.facing = 'right'; p.dir.x = 1; p.dir.y = 0;
    g.cam.x = 150; g.cam.y = p.y;
    this.playerPath = [{ x: 136, y: 234 }];
    this.pathI = 0;
    this.cs = { t: 0, phase: 'push', pt: 0, lb: 1, fade: 0, leafT: 0 };
  }

  updateArrival(dt) {
    const g = this.game, p = g.player, cs = this.cs;
    cs.t += dt; cs.pt += dt;
    if (cs.phase === 'push') {
      // shouldering through the undergrowth at the edge of the woods
      this.runPlayer(dt, 62);
      p.sprinting = false;
      p.alpha = clamp((p.x - 46) / 16, 0, 1);
      cs.leafT -= dt;
      if (p.x > 40 && p.x < 78 && cs.leafT <= 0) {
        cs.leafT = 0.09;
        this.leaves(p.x + rand(-4, 6), p.y - rand(4, 14), 3);
        if (Math.random() < 0.3) sfx.scrape();
      }
      if (this.pathI >= this.playerPath.length || cs.pt > 3) {
        cs.phase = 'look'; cs.pt = 0;
        p.moving = false; p.sprinting = false; p.alpha = 1;
      }
    } else if (cs.phase === 'look') {
      // pulls up, looks round the trees
      p.facing = cs.pt < 0.3 ? 'right' : cs.pt < 0.6 ? 'up' : cs.pt < 0.9 ? 'down' : 'right';
      cs.lb = Math.max(0, 1 - Math.max(0, cs.pt - 0.7) / 0.4);
      if (cs.pt > 1.1) this.startHunt();
    }
    this.integrateZ(p, dt);
  }

  startHunt() {
    const g = this.game;
    this.cs = null;
    this.exitCutscene();
    this.step = 'hunt';
    this.stepT = 0;
    this.objective('secure', `${g.captured}/${g.mission.goal}`);
  }

  /* ---------------- events from the game ---------------- */

  on(evt) {
    const g = this.game;
    if (this.step !== 'hunt') return;
    if (evt === 'flush') this.sinceFlush = 0;
    if (evt === 'secure') {
      if (g.captured >= g.mission.goal) { this.startBolt(); return; }
      this.objective('secure', `${g.captured}/${g.mission.goal}`);
    }
  }

  /* ---------------- per frame ---------------- */

  update(dt) {
    this.t += dt;
    this.stepT += dt;
    this.strip.tick();          // paint in a slice of any ground that's streamed in
    this.flash = Math.max(0, this.flash - dt);
    for (const n of this.notes) n.t += dt;
    this.notes = this.notes.filter(n => n.t < 1.2);
    switch (this.step) {
      case 'arrive': this.updateArrival(dt); return;
      case 'hunt': this.updateHunt(dt); break;
      case 'bolt': this.updateBolt(dt); return;
      case 'pursue': case 'creek': this.updatePursue(dt); break;
      case 'chase': this.updateChase(dt); break;
      case 'shot': this.updateShot(dt); return;
      case 'finale': this.updateFinale(dt); return;
    }
    this.tickUi(dt);
  }

  /* ---------------- the endless woods ---------------- */

  // Once he's far enough along: drop the piece behind him, slide
  // everything back, stream the next one in ahead (all well off screen).
  stream() {
    const g = this.game, p = g.player, map = g.map;
    const at = Math.max(640, CW + THK + this.viewW() / 2 + 48);
    if (p.x < at) return;
    const cut = CW + THK + 40;
    for (const a of g.aliens) {
      if (a.targetSpot && a.targetSpot.x < cut) { a.targetSpot = null; a.path = null; a.repathT = 0; }
      if (a.free && a.x < cut) this.relocate(a);
    }
    if (map.van.x < cut) {
      // hunting: the van catches up (off screen); after that it's done with
      if (this.step === 'hunt') g.moveVan(p.x - 150, this.vanY(p.x - 150));
      else g.moveVan(-2000, map.van.y);
      this.vanV = 0; this.vanGoal = null;
    }
    this.strip.shift();
    g.shiftWorld(-CW);
    this.strip.settle(g);
  }

  // Where they may go to ground: on along the woods, never back the way
  // they came, never so far ahead he'd never find them.
  hideBias(a, s) {
    const p = this.game.player;
    const far = a.x > p.x + AHEAD - 60;          // already as far on as they go: nearest will do
    if (s.x > Math.max(p.x + AHEAD, a.x + 30) || s.x < THK + 40) return null;
    if (s.x < a.x - (far ? 60 : 24)) return null;
    return far ? -Math.abs(s.x - a.x) : (s.x - a.x) * 0.8;
  }

  // Put an alien that's fallen behind (off screen) in a free hiding place
  // ahead of him, also off screen: it slipped past him in the trees.
  relocate(a) {
    const g = this.game, p = g.player;
    const lo = p.x + this.viewW() / 2 + 30, hi = p.x + AHEAD;
    const clear = (s) => !g.spotOccupied(s, a) && !g.aliens.some(o => o !== a && o.free && Math.hypot(o.x - s.x, o.y - s.y) < 50);
    let spots = g.hideSpots.filter(s => s.x > lo && s.x < hi && clear(s));
    if (!spots.length) spots = g.hideSpots.filter(s => s.x > p.x + 60 && clear(s)).sort((q, r) => q.x - r.x).slice(0, 4);
    const s = spots[Math.floor(Math.random() * spots.length)];
    if (!s) {
      // nowhere free to hide just now: it's off ahead of him, still looking
      a.state = 'running';
      a.x = lo + 20; a.y = clamp(a.y, FN + 40, FS - 60);
      a.vx = 0; a.vy = 0; a.z = 0; a.zv = 0;
      a.targetSpot = null; a.path = null; a.repathT = 0; a.chase = -3;
      return;
    }
    a.state = 'hiding';
    a.hideSpot = s; a.x = s.x; a.y = s.y;
    a.vx = 0; a.vy = 0; a.z = 0; a.zv = 0;
    a.targetSpot = null; a.path = null; a.chase = 0;
    a.sneakT = rand(10, 18);
  }

  // The drift east: now and then one creeps on to a hiding place further
  // along; one he's left behind and can't see slips ahead of him unseen.
  herd(dt) {
    const g = this.game, p = g.player;
    const camL = g.cam.x - this.viewW() / 2;
    for (const a of g.aliens) {
      if (!a.free) continue;
      const behind = a.x < p.x - 230 && a.x < camL - 16;
      if (a.state === 'hiding') {
        if (behind) { this.relocate(a); continue; }
        if (a.sneakT === undefined) a.sneakT = rand(9, 16);
        if (Math.hypot(a.x - p.x, a.y - p.y) > 120 && a.x < p.x + 250) a.sneakT -= dt;
        if (a.sneakT <= 0) {
          a.sneakT = rand(10, 18);
          g.rustle(a);
          a.state = 'running';
          a.chase = -3; a.repathT = 0;
          a.targetSpot = null; a.path = null;
        }
      } else if (a.state === 'running') {
        // left behind, or run off the far end with nowhere to go, out of
        // sight: it's gone to ground somewhere up ahead
        const camR = g.cam.x + this.viewW() / 2;
        if (behind || (!a.targetSpot && a.x > p.x + AHEAD + 40 && a.x > camR + 16)) this.relocate(a);
      }
    }
  }

  vanY(x) {
    const y = this.strip.trackY(x + 23 + this.ox);
    return y === null ? this.game.map.van.y : Math.round(y - 20);
  }

  // The van keeps up along the fire road: when he's got well ahead of it
  // (or doubled back past it) it drives over, but never while he's close.
  driveVan(dt) {
    const g = this.game, p = g.player, v = g.map.van;
    const cx = v.x + 23;
    const carrying = p.carried.length > 0;
    const lo = p.x - (carrying ? 230 : 170), hi = p.x + (carrying ? 230 : 110);
    if (this.vanGoal === null && (cx < lo || cx > hi)) this.vanGoal = p.x - (carrying ? 10 : 50);
    const near = Math.hypot(p.x - g.vanDoor.x, p.y - g.vanDoor.y) < 56 || Math.hypot(p.x - cx, p.y - v.y - 15) < 40;
    let want = 0;
    if (this.vanGoal !== null && !near) {
      this.vanGoal = Math.max(THK + 70, this.vanGoal);
      const dx = this.vanGoal - cx;
      if (Math.abs(dx) < 4) this.vanGoal = null;
      else want = Math.sign(dx) * Math.min(150, Math.abs(dx) * 2 + 24);
    }
    this.vanV += clamp(want - this.vanV, -240 * dt, 240 * dt);
    if (Math.abs(this.vanV) < 0.5) { this.vanV = 0; return; }
    const nx = v.x + this.vanV * dt;
    g.moveVan(nx, this.vanY(nx));
    this.dustT -= dt;
    if (this.dustT <= 0) {
      this.dustT = 0.06;
      const bx = this.vanV > 0 ? v.x + 4 : v.x + 42;
      g.particles.push({ x: bx, y: v.y + 28, vx: -Math.sign(this.vanV) * 18 + rand(-6, 6), vy: -rand(4, 10), life: 0.5, t: 0.5, color: '#a88a60', size: 1 });
    }
  }

  updateHunt(dt) {
    const g = this.game, p = g.player, strip = this.strip;
    this.sinceFlush += dt;
    this.stream();
    this.driveVan(dt);
    this.herd(dt);

    // about halfway: a clearing comes through the trees
    if (!this.clearingQueued && (g.captured >= 1 || strip.ox / CW + NP >= 10)) {
      this.clearingQueued = true;
      strip.queue.push('clearing');
    }
    if (strip.clearingAt !== null && p.x + this.ox > strip.clearingAt * CW + SPIRAL.x - 60) this.clearingSeen = true;

    // lost for a while: mark the nearest one hiding
    if (this.sinceFlush > 30 && !p.carried.length) {
      this.sinceFlush = 0;
      const a = this.nearestHidden();
      if (a) { this.helpT = 6; this.helpAlien = a; }
    }
    this.marker = null;
    if (this.helpT > 0) {
      this.helpT -= dt;
      if (this.helpAlien && this.helpAlien.state === 'hiding') this.marker = { x: this.helpAlien.x, y: this.helpAlien.y, kind: 'find' };
      else this.helpT = 0;
    }
    if (p.carried.length) this.marker = { x: g.vanDoor.x, y: g.vanDoor.y, kind: 'van' };
  }

  /* ---------------- the woods run out ---------------- */

  startBolt() {
    const g = this.game, p = g.player, strip = this.strip;
    this.step = 'bolt';
    this.stepT = 0;
    g.hideBias = null;
    g.fleeBias = null;
    this.enterCutscene({ skip: false });
    // everything past the edge of the screen: the woods thinning to a creek
    const from = Math.min(Math.ceil((p.x + this.viewW() / 2 + 40) / CW) * CW, strip.w - 3 * CW);
    const queue = [];
    const clearingAhead = strip.clearingAt === null || strip.clearingAt * CW - this.ox >= from;
    if (!this.clearingSeen && clearingAhead) queue.push('clearing');
    queue.push('exit', 'creek');
    strip.replaceAhead(from, queue, 'woods');
    strip.settle(g);

    this.runners = g.aliens.filter(a => a.free).sort((a, b) => a.y - b.y);
    this.fled = this.runners.length;
    const lanes = [FN + 70, (FN + FS) / 2 - 10, FS - 80];
    this.runners.forEach((a, i) => {
      if (a.x > from - 20) { a.x = from - rand(26, 60); }        // off screen either way
      a.lane = lanes[i % 3] + rand(-12, 12);
      a.popAt = 0.3 + i * 0.28;
      if (a.state !== 'hiding') {
        a.state = 'scripted';
        a.script = { path: [], i: 0, speed: 0, wait: 99, face: { x: a.x + 10, y: a.y }, hold: true };
      }
    });
    this.cs = { t: 0, phase: 'bolt', pt: 0, lb: 0, fade: 0 };
  }

  // From wherever it is to the creek, over it (updateRunners does the leap)
  // and a little way up the far bank, to wait.
  creekRoute(a, i) {
    const g = this.game;
    const y = a.lane;
    const cx = this.creekX(y);
    const near = { x: cx - CREEK_HW - 26, y };
    const path = findPath(g.nav, a.x, a.y, near.x, near.y) || [near];
    return path.concat([{ x: cx + CREEK_HW + 30, y }, { x: cx + CREEK_HW + 48 + i * 7, y: y + rand(-6, 6) }]);
  }

  updateBolt(dt) {
    const g = this.game, p = g.player, cs = this.cs;
    cs.t += dt; cs.pt += dt;
    cs.lb = Math.min(1, cs.lb + dt * 2.5);
    this.runners.forEach((a, i) => {
      if (a.popped || cs.t < a.popAt) return;
      a.popped = true;
      if (a.state === 'hiding') g.rustle(a);
      a.state = 'scripted';
      a.script = { path: this.creekRoute(a, i), i: 0, speed: rand(128, 140), wait: 0, face: null, hold: true };
      g.popup(a.x, a.y - 16, '!', '#ffd75e');
      g.puff(a.x, a.y, '#8fe870');
      if (i % 2 === 0) sfx.squeak();
    });
    this.updateRunners(dt);
    if (cs.t > 0.5 && !cs.rumbled) { cs.rumbled = true; sfx.stampede(); g.shake = 2.5; }
    if (cs.phase === 'bolt') {
      // over to where they're running, then back to him
      const on = this.runners.filter(a => a.popped);
      if (cs.t > 0.45 && on.length) {
        // ride along with the pack as they tear off through the trees
        const cx = on.reduce((s, a) => s + a.x, 0) / on.length;
        const cy = on.reduce((s, a) => s + a.y, 0) / on.length;
        g.camTarget = { x: cx + 20, y: cy };
        g.camEase = 0.03;
      }
      if (cs.t > 2.9) {
        cs.phase = 'startle'; cs.pt = 0;
        g.camTarget = { x: p.x, y: p.y };
        g.camEase = 0.03;
        this.ownsPlayer = true;
        p.state = 'normal'; p.vx = 0; p.vy = 0; p.moving = false;
        p.facing = 'right'; p.dir.x = 1; p.dir.y = 0;
      }
    } else if (cs.phase === 'startle') {
      if (!cs.jumped && cs.pt > 0.25) { cs.jumped = true; sfx.startle(); p.zv = 140; p.z = 0.1; }
      this.integrateZ(p, dt);
      if (cs.pt > 1.2) {
        this.cs = null;
        this.exitCutscene();
        g.camTarget = null;
        this.step = 'pursue';
        this.stepT = 0;
        this.marker = null;
        this.objective('follow');
      }
    }
  }

  // The runners: leap the creek as they reach it, and wherever they're
  // standing, keep an eye on him and hop about (taunting).
  updateRunners(dt) {
    const g = this.game, p = g.player;
    for (const a of this.runners || []) {
      if (a.state !== 'scripted') continue;
      const s = a.script;
      if (this.strip.creekAt !== null && !a.leapt && a.z === 0) {
        const d = a.x - this.creekX(a.y);
        if (d > -CREEK_HW - 12 && d < 0 && s.wait <= 0) { a.leapt = true; a.zv = 170; a.z = 0.1; sfx.jump(); }
      }
      if (s.wait > 0 && s.hold) {
        s.face = { x: p.x, y: p.y };
        if (a.z === 0 && Math.random() < dt * 1.3) { a.zv = rand(70, 100); a.z = 0.1; }
      }
      a.burstT = Math.max(0, (a.burstT || 0) - dt);
    }
  }

  // Camera leads him a little, so there's room to see them ahead.
  leadCamera(dt) {
    const g = this.game, p = g.player;
    const want = Math.min(44, this.viewW() * 0.25);
    this.look += (want - this.look) * Math.min(1, dt * 2);
    g.camTarget = { x: p.x + this.look, y: p.y };
    g.camEase = 0.001;
  }

  /* ---------------- the creek ---------------- */

  updatePursue(dt) {
    const g = this.game, p = g.player;
    this.stream();
    this.leadCamera(dt);
    this.updateRunners(dt);
    if (this.dunk) { this.updateDunk(dt); return; }
    const cx = this.creekX(p.y);
    if (this.step === 'pursue' && p.x > cx - 120) {
      this.nearSide = true;
      this.step = 'creek';
      this.stepT = 0;
      this.objective('creek');
      this.hint('creek');
    }
    if (this.step !== 'creek') return;
    const d = p.x - cx;
    const grounded = p.z === 0 && p.zv === 0, landing = grounded && this.wasUp;
    this.wasUp = !grounded;
    // walking (or dashing) up to it, he stops at the edge: it has to be jumped
    if (grounded && !landing && (p.state === 'normal' || p.state === 'dashing') && this.nearSide && d > -CREEK_HW - 1 && d < 0) {
      p.x = cx - CREEK_HW - 1;
      if (p.vx > 0) p.vx = 0;
      if (p.state === 'dashing') p.state = 'normal';
      return;
    }
    this.nearSide = d < 0;
    // came down in the water (too short a jump, or a dive): in he goes
    if (Math.abs(d) < CREEK_HW - 3 && p.z < 2) { this.startDunk(); return; }
    // over, and on the far bank
    if (d > CREEK_HW + 2 && p.z === 0) this.startChase();
  }

  startDunk() {
    const g = this.game, p = g.player;
    this.splashes++;
    this.locked = true;
    this.ownsPlayer = true;
    this.hint(null);
    p.state = 'normal'; p.vx = 0; p.vy = 0; p.z = 0; p.zv = 0; p.moving = false;
    p.alpha = 0;
    this.dunk = { t: 0, x: p.x, y: p.y };
    this.wasUp = false;
    sfx.splash();
    g.shake = 2;
    this.splashFx(p.x, p.y, 14);
  }

  splashFx(x, y, n) {
    const g = this.game;
    for (let i = 0; i < n; i++) {
      const a = rand(Math.PI * 1.1, Math.PI * 1.9);
      g.particles.push({
        x: x + rand(-4, 4), y: y - 2, vx: Math.cos(a) * rand(20, 50), vy: Math.sin(a) * rand(30, 60),
        grav: 160, life: 0.6, t: 0.6, color: i % 3 ? '#9fd4f5' : '#ffffff', size: i % 4 ? 1 : 2,
      });
    }
  }

  // In up to his chest, flailing; then hauls himself out on the near bank,
  // dripping, and gives himself a shake.
  updateDunk(dt) {
    const g = this.game, p = g.player, k = this.dunk;
    k.t += dt;
    if (k.t < 0.9) {
      if (Math.random() < dt * 9) this.splashFx(k.x + rand(-5, 5), k.y, 2);
    } else if (!k.out) {
      k.out = true;
      const bank = this.creekX(k.y) - CREEK_HW - 24;
      p.x = bank; p.y = k.y;
      p.alpha = 1; p.facing = 'left'; p.z = 0.1; p.zv = 110;
      this.splashFx(bank + 10, k.y, 6);
    }
    if (k.out) {
      this.integrateZ(p, dt);
      if (Math.random() < dt * 14) {
        g.particles.push({ x: p.x + rand(-5, 5), y: p.y - rand(2, 14), vx: 0, vy: 10, grav: 90, life: 0.35, t: 0.35, color: '#9fd4f5', size: 1 });
      }
      if (k.t > 1.25) p.facing = 'right';
    }
    if (k.t > 1.7) {
      this.dunk = null;
      this.locked = false;
      this.ownsPlayer = false;
      p.facing = 'right'; p.dir.x = 1; p.dir.y = 0;
      this.hint('creek');
      this.tip(this.hintText('runup'), 6, 'runup');
    }
  }

  /* ---------------- the chase ---------------- */

  startChase() {
    const g = this.game, p = g.player;
    this.step = 'chase';
    this.stepT = 0;
    this.chaseT = 0;
    this.chaseDist = 0;
    this.lastWX = p.x + this.ox;
    this.hint(null);
    this.objective('chase');
    sfx.squeak();
    this.runners.forEach((a, i) => {
      a.leapt = true;
      a.repathT = i * 0.1;
      a.script = { path: [], i: 0, speed: 0, wait: 0, face: null, hold: true };
      g.popup(a.x, a.y - 16, '!', '#ffd75e');
    });
  }

  // Put Highway 29 in, off screen, in time for them to reach it at about
  // CHASE_T seconds at the pace he's been going.
  timeForHighway() {
    const p = this.game.player, strip = this.strip;
    const from = Math.ceil((p.x + this.viewW() / 2 + 40) / CW) * CW;
    if (from + FINAL_W * CW > strip.w) return null;
    const pace = clamp(this.chaseDist / Math.max(1, this.chaseT), 70, 124);
    const eta = this.chaseT + (from + STATION.stopX - (p.x + LEADS[1])) / pace;
    return (eta >= CHASE_T - 0.3 || this.chaseT >= CHASE_T - 2) ? from : null;
  }

  // A cell they can run to near (x, y): out of any tree trunk.
  openNear(x, y) {
    const { gw, gh, cells } = this.game.nav;
    for (const dy of [0, -16, 16, -32, 32]) {
      const cx = Math.floor(x / TILE), cy = Math.floor((y + dy) / TILE);
      if (cx >= 0 && cy >= 0 && cx < gw && cy < gh && cells[cy * gw + cx] !== 1) return { x, y: y + dy };
    }
    return { x, y };
  }

  updateChase(dt) {
    const g = this.game, p = g.player;
    this.chaseT += dt;
    const wx = p.x + this.ox;
    this.chaseDist += Math.max(0, wx - this.lastWX);
    this.lastWX = wx;
    this.stream();
    this.leadCamera(dt);
    if (!this.final) {
      const from = this.timeForHighway();
      if (from !== null) {
        this.strip.replaceAhead(from, ['final', 'final', 'final'], 'backdrop');
        this.strip.settle(g);
        this.final = true;
      }
    }
    const stop = this.final ? this.finalX(STATION.stopX) : Infinity;
    const packY = clamp(230 + 70 * Math.sin(this.chaseT * 0.45), FN + 50, FS - 70);
    const pv = Math.max(0, p.vx);
    let arrived = 0;
    this.runners.forEach((a, i) => {
      const s = a.script;
      const lead = Math.min(LEADS[i], this.viewW() / 2 + this.look - 26);
      const gap = a.x - p.x;
      let tx = Math.max(p.x + lead, a.x - 4);
      const ty = packY + (i - 1) * 26;
      if (this.final) tx = Math.min(tx, stop - i * 3);
      if (this.final && a.x >= stop - i * 3 - 6) { a.arrived = true; arrived++; }
      // just out of reach: if he closes in, or dives, they burst clear
      if ((gap < 30 || (p.state === 'diving' && gap < 130)) && !a.burstT && !a.arrived) {
        a.burstT = 0.45;
        a.zv = 110; a.z = 0.1;
        g.puff(a.x, a.y, '#8fe870');
      }
      let v = pv + (lead - gap) * 2.4;
      if (a.burstT > 0) v = 235;
      s.speed = clamp(v, 0, 240);
      a.repathT -= dt;
      if (a.repathT <= 0) {
        a.repathT = 0.3;
        const t = this.openNear(tx, ty);
        s.path = findPath(g.nav, a.x, a.y, t.x, t.y) || [t];
        s.i = 0;
        s.wait = 0;
      }
      if (s.speed < 14 && a.z === 0 && Math.random() < dt * 1.5) { a.zv = rand(70, 100); a.z = 0.1; }
    });
    this.updateRunners(dt);
    // at the highway: the first of them pulls up on the verge (the rest right
    // behind), with him close enough to see, and they turn on him
    const near = this.runners.some(a => Math.hypot(a.x - p.x, a.y - p.y) < 200);
    const bunched = this.runners.every(a => a.x > stop - 40);
    if (this.final && arrived && bunched && near) this.startShot();
  }

  /* ---------------- the shock gun ---------------- */

  startShot() {
    const g = this.game, p = g.player;
    this.step = 'shot';
    this.stepT = 0;
    this.enterCutscene();
    this.ownsPlayer = true;
    this.hint(null);
    g.camTarget = { x: (p.x + this.finalX(STATION.stopX)) / 2, y: p.y };
    g.camEase = 0.04;
    // the one nearest his line does the shooting
    this.shooter = this.runners.slice().sort((a, b) => Math.abs(a.y - p.y) - Math.abs(b.y - p.y))[0];
    for (const a of this.runners) {
      a.script = { path: [], i: 0, speed: 0, wait: 1e9, face: { x: p.x, y: p.y }, hold: true };
    }
    // whatever he was doing (mid-jump, face down after a dive), he's on his feet
    this.skid = { vx: p.vx, vy: p.vy };
    p.state = 'normal';
    p.moving = false; p.sprinting = false;
    this.cs = { t: 0, phase: 'turn', pt: 0, lb: 0, fade: 0 };
  }

  gunAt() {
    const a = this.shooter;
    return { x: a.x - 7, y: a.y - 5 - a.z };
  }

  updateShot(dt) {
    const g = this.game, p = g.player, cs = this.cs;
    cs.t += dt; cs.pt += dt;
    cs.lb = Math.min(1, cs.lb + dt * 2.5);
    // he skids to a stop
    this.skid.vx *= Math.pow(0.004, dt); this.skid.vy *= Math.pow(0.004, dt);
    p.x += this.skid.vx * dt; p.y += this.skid.vy * dt;
    this.integrateZ(p, dt);
    for (const a of this.runners) a.script.face = { x: p.x, y: p.y };
    if (cs.phase === 'turn') {
      if (cs.pt > 0.35 && !this.gunOut) { this.gunOut = true; sfx.click(); }
      if (cs.pt > 0.5) { p.facing = 'right'; p.dir.x = 1; p.dir.y = 0; }
      if (cs.pt > 0.8) { cs.phase = 'charge'; cs.pt = 0; sfx.charge(); }
    } else if (cs.phase === 'charge') {
      if (Math.random() < dt * 30) {
        const m = this.gunAt();
        g.particles.push({ x: m.x + rand(-2, 2), y: m.y + rand(-2, 2), vx: rand(-20, 20), vy: rand(-20, 20), grav: 0, life: 0.2, t: 0.2, color: Math.random() < 0.5 ? '#41f0d8' : '#ffffff', size: 1 });
      }
      if (cs.pt > 0.55) {
        cs.phase = 'zap'; cs.pt = 0;
        const m = this.gunAt();
        this.bolt = { t: 0.35, x0: m.x, y0: m.y, x1: p.x, y1: p.y - 8 };
        g.zaps.push({ pts: [{ x: m.x, y: m.y }, { x: p.x, y: p.y - 8 }], t: 0.35, life: 0.35 });
        this.flash = 0.14;
        g.shake = 6;
        sfx.shock();
        this.pose = 'zap';
      }
    } else if (cs.phase === 'zap') {
      if (this.bolt) { this.bolt.t -= dt; if (this.bolt.t <= 0) this.bolt = null; }
      if (cs.pt > 0.2) this.gunOut = false;
      if (cs.pt > 1.0) {
        // down he goes
        this.pose = 'down';
        sfx.thud();
        g.puff(p.x, p.y, '#8a6a45');
        g.shake = 2;
        this.startFinale();
      }
    }
  }

  /* ---------------- the getaway ---------------- */

  startFinale() {
    const g = this.game, p = g.player;
    this.step = 'finale';
    this.stepT = 0;
    this.semiDoors = 'open';
    this.cs = { t: 0, phase: 'down', pt: 0, lb: 1, fade: 0, crackT: 0 };
    g.camTarget = { x: p.x, y: p.y - 6 };
    g.camEase = 0.02;
  }

  // Where the semi is (canvas coords): its image's top-left, and how far
  // it's pulled out.
  semiPos() {
    const S = this.art.semi, m = this.semiMove || { dx: 0, dy: 0 };
    const x = this.finalX(STATION.semi.x) + m.dx, base = STATION.semi.base + m.dy;
    return { x, y: base - S.base, base, cx: x + S.w / 2 };
  }

  storeDoor() {
    const D = this.strip.X.store.door, img = this.strip.X.store.img;
    return { x: this.finalX(STATION.store.x) + D.x, y: STATION.store.base - img.height + D.y, w: D.w, h: D.h };
  }

  updateFinale(dt) {
    const g = this.game, p = g.player, cs = this.cs;
    cs.t += dt; cs.pt += dt;
    // electricity all over him to begin with; after, the odd spark
    cs.crackT -= dt;
    if (cs.phase === 'down' || cs.phase === 'cross') {
      this.cracks = Math.random() < 0.5 ? 3 : 2;
      this.crackLife = 0.1;
      if (cs.crackT <= 0) { cs.crackT = rand(0.08, 0.2); sfx.crackle(); }
      if (Math.random() < dt * 12) {
        g.particles.push({ x: p.x + rand(-8, 8), y: p.y - 4 + rand(-3, 3), vx: rand(-25, 25), vy: -rand(10, 30), grav: 60, life: 0.25, t: 0.25, color: Math.random() < 0.5 ? '#41f0d8' : '#ffffff', size: 1 });
      }
    } else if (this.pose && cs.crackT <= 0) {
      cs.crackT = rand(0.5, 1.3);
      this.cracks = 1;
      this.crackLife = 0.08;
      sfx.crackle();
    }
    this.crackLife = Math.max(0, (this.crackLife || 0) - dt);
    const semi = this.semiPos();

    if (cs.phase === 'down') {
      // on him: flat out, lit up
      if (cs.pt > 1.8) {
        cs.phase = 'cross'; cs.pt = 0;
        // over the road to the back of the semi
        this.runners.forEach((a, i) => {
          const tx = semi.cx + (i - 1) * 7, ty = semi.base + 16 + i * 4;
          a.script = { path: [{ x: this.finalX(STATION.lanes[0]), y: a.y + (ty - a.y) * 0.3 }, { x: tx, y: ty }], i: 0, speed: rand(118, 132), wait: 0, face: null, hold: true };
          a.board = { at: { x: tx, y: ty }, delay: i * 0.35 };
        });
      }
    } else if (cs.phase === 'cross' || cs.phase === 'board') {
      // follow them across, then hold on the back of the truck
      const on = this.runners.filter(a => a.state === 'scripted');
      const cx = on.length ? on.reduce((s, a) => s + a.x, 0) / on.length : semi.cx;
      const cy = on.length ? on.reduce((s, a) => s + a.y, 0) / on.length : semi.base;
      g.camTarget = cs.phase === 'board' ? { x: semi.cx, y: semi.base - 30 } : { x: cx, y: cy - 10 };
      g.camEase = 0.05;
      // a car comes down the southbound lane just behind the last of them
      const lane = this.finalX(STATION.lanes[0]);
      if (!this.car && this.runners.every(a => a.x > lane + 22)) {
        this.car = { x: lane, y: -50, v: 290 };
      }
      let inside = 0;
      for (const a of this.runners) {
        if (a.state === 'fled') { inside++; continue; }
        const b = a.board;
        if (!b.jumping && Math.hypot(a.x - b.at.x, a.y - b.at.y) < 10) {
          b.delay -= dt;
          if (b.delay <= 0) {
            // leap in the back
            // a low leap, up into the doorway and gone into the dark
            b.jumping = true;
            a.zv = 95; a.z = 0.1;
            a.script = { path: [{ x: b.at.x, y: semi.base - 12 }], i: 0, speed: 95, wait: 0, face: null, hold: true };
            sfx.jump();
          }
        }
        if (b.jumping && a.y < semi.base - 4) {
          a.state = 'fled';
          sfx.clonk();
        }
      }
      if (cs.phase === 'cross' && this.runners.some(a => a.board.jumping)) { cs.phase = 'board'; cs.pt = 0; }
      if (inside >= this.runners.length) {
        if (!cs.shutAt) cs.shutAt = cs.t + 0.45;
        if (cs.t > cs.shutAt && this.semiDoors === 'open') this.semiDoors = 'half';
        if (cs.t > cs.shutAt + 0.12 && this.semiDoors === 'half') { this.semiDoors = 'closed'; sfx.slam(); g.shake = 1.5; }
        if (cs.t > cs.shutAt + 0.8) {
          cs.phase = 'driver'; cs.pt = 0;
          const d = this.storeDoor();
          this.driver = { x: d.x + d.w / 2, y: d.y + d.h - 6, walkT: 0, face: 'down', path: null, i: 0, doorOpen: true, noteT: 0.3 };
          const cabX = semi.x + this.art.semi.cabDoor.x - 6, cabY = semi.y + this.art.semi.cabDoor.y + 4;
          this.driver.path = [
            { x: d.x + d.w / 2, y: d.y + d.h + 12 },
            { x: cabX, y: d.y + d.h + 12 },
            { x: cabX, y: cabY },
          ];
          this.cabDoor = 0;
        }
      }
    } else if (cs.phase === 'driver') {
      // out he strolls with his coffee, whistling; never looks round
      const d = this.driver, D = this.storeDoor();
      g.camTarget = { x: (D.x + semi.x) / 2, y: semi.y + 20 };
      g.camEase = 0.04;
      if (d.path) {
        const wp = d.path[d.i];
        const dx = wp.x - d.x, dy = wp.y - d.y, dist = Math.hypot(dx, dy);
        if (dist < 1.5) {
          d.i++;
          if (d.i >= d.path.length) {
            d.path = null;
            cs.climbAt = cs.pt;
            this.cabDoor = 1;
            sfx.click();
          }
        } else {
          const sp = 60 * dt;
          d.x += dx / dist * Math.min(sp, dist); d.y += dy / dist * Math.min(sp, dist);
          d.face = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
          d.walkT += dt * 7;
        }
        if (d.y > D.y + D.h + 4) d.doorOpen = false;
        d.noteT -= dt;
        if (d.noteT <= 0) {
          d.noteT = 0.9;
          this.notes.push({ x: d.x + 4, y: d.y - 20, t: 0 });
          sfx.whistle();
        }
      } else if (cs.climbAt !== undefined) {
        const k = cs.pt - cs.climbAt;
        if (k > 0.2 && !d.inside) { d.inside = true; }
        if (k > 0.55 && this.cabDoor) { this.cabDoor = 0; sfx.slam(); }
        if (k > 1.0) {
          cs.phase = 'start'; cs.pt = 0;
          sfx.engine();
          this.semiMove = { dx: 0, dy: 0, v: 0 };
        }
      }
    } else if (cs.phase === 'start' || cs.phase === 'drive') {
      // engine turns over, black smoke off the stacks, and away north
      const S = this.art.semi, m = this.semiMove;
      if (Math.random() < dt * (cs.phase === 'start' ? 16 : 10)) {
        for (const e of S.exhaust) {
          g.particles.push({ x: semi.x + e.x + rand(-1, 1), y: semi.y + e.y, vx: rand(-4, 4), vy: -rand(14, 24), grav: -6, life: 0.9, t: 0.9, color: Math.random() < 0.5 ? '#2a2e38' : '#5a606a', size: 2 });
        }
      }
      if (cs.phase === 'start') {
        g.camTarget = { x: semi.cx, y: semi.y + 40 };
        if (cs.pt > 1.0) { cs.phase = 'drive'; cs.pt = 0; sfx.driveOff(); }
      } else {
        m.v = Math.min(170, m.v + 70 * dt);
        m.dy -= m.v * dt;
        // pulls out into the northbound lane as it goes
        const laneX = this.finalX(STATION.lanes[1]) - S.w / 2;
        const home = this.finalX(STATION.semi.x);
        m.dx = (laneX - home) * clamp(-m.dy / 110, 0, 1);
        g.camTarget = { x: semi.cx, y: Math.max(semi.y + 60, 90) };
        g.camEase = 0.05;
        if (cs.pt > 3.2) { cs.phase = 'back'; cs.pt = 0; }
      }
    } else if (cs.phase === 'back') {
      // back to him
      g.camTarget = { x: p.x, y: p.y - 6 };
      g.camEase = 0.02;
      if (cs.pt > 1.6) { cs.phase = 'crawl'; cs.pt = 0; this.pose = 'crawlA'; cs.stroke = 0; }
    } else if (cs.phase === 'crawl') {
      // drags himself a little way after it
      const stroke = Math.floor(cs.pt / 0.5);
      if (stroke !== cs.stroke) {
        cs.stroke = stroke;
        this.pose = stroke % 2 ? 'crawlB' : 'crawlA';
        p.x += 2;
        sfx.scrape();
        g.puff(p.x - 7, p.y - 1, '#8a6a45');
      }
      if (cs.pt > 2.4) { cs.phase = 'defeat'; cs.pt = 0; this.pose = 'headDown'; g.puff(p.x + 6, p.y - 2, '#8a6a45'); sfx.sigh(); }
    } else if (cs.phase === 'defeat') {
      if (cs.pt > 1.6) { cs.phase = 'fade'; cs.pt = 0; }
    } else if (cs.phase === 'fade') {
      cs.fade = clamp(cs.pt / 1.3, 0, 1);
      if (cs.pt > 1.5) this.endScene();
    }

    // once it's rolling it keeps going, up and off the map
    if (this.semiMove && cs.phase !== 'start' && cs.phase !== 'drive') this.semiMove.dy -= this.semiMove.v * dt;

    // the passing car
    if (this.car) {
      const c = this.car;
      c.y += c.v * dt;
      if (!c.heard && c.y > g.cam.y - 120) { c.heard = true; sfx.whoosh(); }
      if (c.y > g.map.h + 60) this.car = null;
    }
  }

  // Leaves thrown up where he pushes through the undergrowth.
  leaves(x, y, n = 7) {
    const g = this.game;
    for (let i = 0; i < n; i++) {
      g.particles.push({
        x: x + (Math.random() - 0.5) * 8, y: y - Math.random() * 6,
        vx: (Math.random() - 0.5) * 30, vy: -10 - Math.random() * 18,
        life: 0.8, t: 0.8, color: ['#3d8636', '#57a648', '#2c6127', '#8a5a2c'][i % 4], size: 1,
      });
    }
  }

  /* ---------------- drawing ---------------- */

  // Flat on the ground: the creek's current running south.
  renderGround(ctx, camX, camY, vw, vh) {
    if (this.strip.creekAt === null) return;
    const y0 = Math.max(FN - 6, Math.floor(camY)), y1 = Math.min(FS + 8, Math.ceil(camY + vh));
    const flow = Math.floor(this.t * 22);
    ctx.fillStyle = 'rgba(160, 205, 235, 0.55)';
    for (let y = y0; y < y1; y++) {
      const cx = this.creekX(y);
      if (cx < camX - 30 || cx > camX + vw + 30) continue;
      for (let k = -1; k <= 1; k++) {
        if ((y * 5 + k * 11 - flow + 1000) % 17 !== 0) continue;
        ctx.fillRect(Math.round(cx + k * 7 + Math.sin(y * 0.2 + k) * 2 - camX), y - camY, k ? 2 : 3, 1);
      }
    }
  }

  // Y-sorted set pieces: the semi, its driver, the car, the store door,
  // and the agent himself whenever he's in a pose of ours.
  sceneItems() {
    const items = [];
    const g = this.game, p = g.player;
    if (this.final) {
      const s = this.semiPos(), S = this.art.semi;
      items.push({ y: s.base, draw: (ctx, camX, camY) => this.drawSemi(ctx, camX, camY, s, S) });
      const d = this.driver;
      if (d && d.doorOpen) {
        const D = this.storeDoor();
        items.push({ y: STATION.store.base + 0.5, draw: (ctx, camX, camY) => {
          ctx.fillStyle = '#141019'; ctx.fillRect(D.x - camX, D.y - camY, D.w, D.h);
          ctx.fillStyle = '#3a3226'; ctx.fillRect(D.x + 1 - camX, D.y + 1 - camY, D.w - 2, D.h - 1);
          ctx.fillStyle = '#616b7a'; ctx.fillRect(D.x + D.w - camX, D.y - camY, 3, D.h);     // door swung open
          ctx.fillStyle = '#6fa8cc'; ctx.fillRect(D.x + D.w + 1 - camX, D.y + 2 - camY, 1, D.h - 6);
        } });
      }
      if (d && !d.inside) {
        items.push({ y: d.y, draw: (ctx, camX, camY) => {
          const x = Math.round(d.x - camX), y = Math.round(d.y - camY);
          g.shadow(ctx, x, y, 11);
          g.drawWalking(ctx, this.art.driver[d.face], x - 6, y - 16, d.walkT, !!d.path);
          // steam off his coffee
          if (d.face !== 'up' && Math.floor(this.t * 6) % 3 === 0) { ctx.fillStyle = 'rgba(238,241,247,0.7)'; ctx.fillRect(x + 6, y - 10 - Math.floor(this.t * 6) % 2, 1, 1); }
        } });
      }
    }
    if (this.car) {
      const c = this.car;
      items.push({ y: c.y, draw: (ctx, camX, camY) => {
        const x = Math.round(c.x - camX), y = Math.round(c.y - camY);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 8, y - 30, 18, 30);
        ctx.drawImage(this.art.car, x - 10, y - 34);
        ctx.fillStyle = 'rgba(220,230,240,0.5)';
        ctx.fillRect(x - 7, y - 44 - (Math.floor(this.t * 20) % 4), 1, 6); ctx.fillRect(x + 6, y - 46 - (Math.floor(this.t * 20) % 3), 1, 7);
      } });
    }
    if (this.dunk) {
      const k = this.dunk;
      items.push({ y: k.y, draw: (ctx, camX, camY) => this.drawSwimmer(ctx, camX, camY, k) });
    }
    if (this.pose) {
      p.alpha = 0;
      items.push({ y: p.y, draw: (ctx, camX, camY) => this.drawPose(ctx, camX, camY) });
    }
    if (this.gunOut && this.shooter) {
      const a = this.shooter;
      items.push({ y: a.y + 0.1, draw: (ctx, camX, camY) => {
        const m = this.gunAt();
        ctx.drawImage(this.art.gun, Math.round(m.x - 1 - camX), Math.round(m.y - 1 - camY));
      } });
    }
    return items;
  }

  drawSemi(ctx, camX, camY, s, S) {
    const x = Math.round(s.x - camX), y = Math.round(s.y - camY);
    if (x > this.game.view.w + 10 || x + S.w < -10 || y > this.game.view.h + 10 || y + S.h < -10) return;
    // its shadow on the ground, off to the lower right
    ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
    ctx.fillRect(x + 6, y + 30, S.w - 4, S.base - 26);
    const shake = this.cs && this.cs.phase === 'start' ? (Math.floor(this.t * 30) % 2) : 0;
    ctx.drawImage(S[this.semiDoors || 'open'], x, y - shake);
    if (this.cabDoor) {
      // the driver's door swung open on the near side of the cab
      const dx = x + S.cabDoor.x, dy = y + S.cabDoor.y;
      ctx.fillStyle = '#141019'; ctx.fillRect(dx - 7, dy - 1, 8, 12);
      ctx.fillStyle = '#242832'; ctx.fillRect(dx - 6, dy, 6, 10);
      ctx.fillStyle = '#1e2a38'; ctx.fillRect(dx - 6, dy, 6, 4);
    }
  }

  drawSwimmer(ctx, camX, camY, k) {
    const x = Math.round(k.x - camX), y = Math.round(k.y - camY);
    if (k.out) return;
    const bob = Math.round(Math.sin(k.t * 14) * 1);
    const img = this.game.assets.actors.player.down;
    // head and shoulders above the water, arms thrashing
    ctx.drawImage(img, 0, 0, img.width, 9, x - 6, y - 10 + bob, img.width, 9);
    ctx.fillStyle = '#e3a877';
    const flap = Math.floor(k.t * 10) % 2;
    ctx.fillRect(x - 9, y - 7 - flap * 3 + bob, 2, 2); ctx.fillRect(x + 7, y - 4 - (1 - flap) * 3 + bob, 2, 2);
    // the waterline round him
    ctx.fillStyle = '#9fd4f5';
    const r = 7 + Math.floor(k.t * 6) % 3;
    ctx.fillRect(x - r, y - 1 + bob, r * 2, 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - r + 1, y - 2 + bob, 2, 1); ctx.fillRect(x + r - 3, y - 2 + bob, 2, 1);
  }

  // The agent in one of our poses, with the electricity crackling round him.
  drawPose(ctx, camX, camY) {
    const g = this.game, p = g.player, A = g.assets.actors.player;
    const x = Math.round(p.x - camX), y = Math.round(p.y - camY);
    if (this.pose === 'zap') {
      g.shadow(ctx, x, y, 12);
      const on = Math.floor(this.t * 14) % 2 === 0;
      ctx.drawImage(on ? this.art.zapped : A.right, x - 6, y - 15 + (on ? 0 : -1));
      for (let i = 0; i < 3; i++) {
        const a = rand(0, Math.PI * 2);
        arc(ctx, x + Math.cos(a) * 3, y - 8 + Math.sin(a) * 5, x + Math.cos(a) * 11, y - 8 + Math.sin(a) * 9, '#41f0d8', '#ffffff');
      }
      return;
    }
    const img = this.pose === 'down' ? A.proneR : this.pose === 'headDown' ? this.art.headDown
      : this.pose === 'crawlB' ? this.art.crawl[1] : this.art.crawl[0];
    g.shadow(ctx, x, y, 14);
    const twitch = this.crackLife > 0 && this.cs && this.cs.phase === 'down' ? Math.round(rand(-1, 1)) : 0;
    ctx.drawImage(img, Math.round(x - img.width / 2) + twitch, Math.round(y - 4 - img.height / 2));
    if (this.crackLife > 0) {
      for (let i = 0; i < (this.cracks || 1); i++) {
        const sx = x + rand(-7, 7), sy = y - 4 + rand(-3, 3);
        const a = rand(0, Math.PI * 2);
        arc(ctx, sx, sy, sx + Math.cos(a) * rand(5, 9), sy + Math.sin(a) * rand(3, 6), '#41f0d8', '#ffffff');
      }
    }
    // a wisp of smoke off him while he's still smoking
    if (this.cs && (this.cs.phase === 'down' || this.cs.phase === 'cross') && Math.random() < 0.15) {
      g.particles.push({ x: p.x + rand(-4, 6), y: p.y - 8, vx: rand(-3, 3), vy: -12, grav: -4, life: 0.8, t: 0.8, color: '#a8a4a8', size: 1 });
    }
  }

  renderWorld(ctx, camX, camY, vw, vh) {
    super.renderWorld(ctx, camX, camY, vw, vh);
    const g = this.game, p = g.player;
    const hx = Math.round(p.x - camX), hy = Math.round(p.y - camY - 21 - p.z);
    const cs = this.cs;
    if (this.step === 'bolt' && cs && cs.phase === 'startle' && cs.pt > 0.25) {
      const pop = cs.pt < 0.35 ? 3 : 0;
      this.bang(ctx, hx - 1, hy - 8 - pop, '#ffd75e');
    }
    if (this.step === 'shot' && cs && cs.phase !== 'turn') {
      if (cs.phase === 'charge') this.bang(ctx, hx - 1, hy - 8, '#ff5e6c');
    }
    // the shot itself: a fat crooked bolt from the gun to him
    if (this.bolt) {
      const b = this.bolt;
      for (let i = 0; i < 2; i++) arc(ctx, b.x0 - camX, b.y0 - camY, b.x1 - camX, b.y1 - camY, i ? '#41f0d8' : '#9ff5ff', '#ffffff');
    }
    // giving up: a little '...' over him, a dot at a time
    if (this.step === 'finale' && cs && (cs.phase === 'defeat' || cs.phase === 'fade')) {
      const dots = cs.phase === 'fade' ? 3 : Math.min(3, Math.floor(Math.max(0, cs.pt - 0.35) / 0.3));
      if (dots > 0) {
        const bx = Math.round(p.x + 2 - camX), by = Math.round(p.y - 24 - camY);
        ctx.fillStyle = '#14141e';
        ctx.fillRect(bx, by, 15, 8); ctx.fillRect(bx + 1, by - 1, 13, 10); ctx.fillRect(bx + 2, by + 9, 3, 2);
        ctx.fillStyle = '#eef1f7';
        ctx.fillRect(bx + 1, by, 13, 8); ctx.fillRect(bx + 2, by + 8, 2, 1);
        ctx.fillStyle = '#14141e';
        for (let i = 0; i < dots; i++) ctx.fillRect(bx + 3 + i * 4, by + 4, 2, 2);
      }
    }
    for (const n of this.notes) {
      ctx.globalAlpha = Math.max(0, 1 - n.t / 1.2);
      glyph(ctx, NOTE, Math.round(n.x + Math.sin(n.t * 5) * 2 - camX), Math.round(n.y - n.t * 12 - camY), '#eef1f7');
      ctx.globalAlpha = 1;
    }
  }

  renderScreen(ctx, vw, vh) {
    super.renderScreen(ctx, vw, vh);
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(0.85, this.flash * 6);
      ctx.fillStyle = '#e8fbff';
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalAlpha = 1;
    }
  }
}
