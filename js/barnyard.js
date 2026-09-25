// Stage 1, Scene 2 (Barnyard) director.
//
//   arrive -> a short letterboxed cut: the agent jogs in up the dirt road
//             from the fields, pulls up and looks the place over.
//   hunt   -> secure 6 of the 12 that got away. Voss points out the barn
//             the first time the agent comes near it (while something is
//             hiding in there), says what he makes of the place when the
//             agent first steps inside, and pings a hiding alien if the
//             agent goes a long while without flushing one.
//   finale -> the 6th alien goes in the van and every one still out there
//             breaks cover and runs for the tree line to the north, melting
//             into the trees (the barn roof lifts so you see them scramble
//             out of it). The agent jumps ("!?"), then fumes: stamps his
//             feet, a vein pops, steam, a "#*%!" -- and dashes after them.
//             Cut to the edge of the woods: he plunges in behind the last
//             stragglers, and the scene ends.
//
// The objective panel, radio, markers and cutscene plumbing come from the
// shared StoryDirector (director.js).
import { sfx } from './audio.js';
import { findPath } from './nav.js';
import { StoryDirector } from './director.js';
import { RADIO2, OBJECTIVES2 } from './data/stage1.js';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Outlined pixel glyphs for the agent's reactions ('#' = ink-outlined pixel).
const GLYPHS = {
  bang: ['##', '##', '##', '##', '##', '##', '..', '##', '##'],
  query: ['.###.', '##.##', '...##', '..##.', '..##.', '.....', '..##.', '..##.'],
  vein: ['.#...#.', '.##.##.', '..#.#..', '.......', '..#.#..', '.##.##.', '.#...#.'],
  veinS: ['#...#', '##.##', '.....', '##.##', '#...#'],
  '#': ['#.#', '###', '#.#', '###', '#.#'],
  '*': ['...', '#.#', '.#.', '#.#', '...'],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'],
};

export class BarnyardScene extends StoryDirector {
  constructor(game) {
    super(game, { objectives: OBJECTIVES2 });
    this.step = 'arrive';         // arrive | hunt | finale
    this.sinceFlush = 0;
    this.helpT = 0;
    this.nagT = -99;
    this.seedHiding();
    this.startArrival();
  }

  // Where the twelve have gone to ground: four in the barn, two in the
  // greenhouse, the rest scattered round the yard (never right by the road
  // the agent walks in on).
  seedHiding() {
    const g = this.game, spawn = g.map.spawn;
    const taken = new Set();
    const pick = (pred) => {
      const free = g.hideSpots.filter(s => pred(s) && !taken.has(s) &&
        Math.hypot(s.x - spawn.x, s.y - spawn.y) > 140);
      return free.length ? free[Math.floor(Math.random() * free.length)] : null;
    };
    const plan = ['barn', 'barn', 'barn', 'barn', 'greenhouse', 'greenhouse'];
    g.aliens.forEach((a, i) => {
      const zone = plan[i];
      const s = pick(zone ? (q) => q.zone === zone : (q) => !q.zone) || pick(() => true);
      if (!s) return;
      taken.add(s);
      a.hideSpot = s; a.x = s.x; a.y = s.y;
    });
  }

  /* ---------------- arrival ---------------- */

  startArrival() {
    const g = this.game, p = g.player, map = g.map;
    this.enterCutscene({ skip: false });
    this.ownsPlayer = true;
    p.x = map.arrive.x; p.y = map.arrive.y;
    p.facing = 'up'; p.dir.x = 0; p.dir.y = -1;
    g.cam.x = p.x; g.cam.y = p.y - 60;
    // up the road to where the scene hands over
    this.playerPath = map.road.filter(q => q.y < p.y - 4 && q.y > map.spawn.y + 4)
      .concat([{ x: map.spawn.x, y: map.spawn.y }]);
    this.pathI = 0;
    this.cs = { t: 0, phase: 'jog', pt: 0, lb: 1, fade: 0 };
  }

  updateArrival(dt) {
    const g = this.game, p = g.player, cs = this.cs;
    cs.t += dt; cs.pt += dt;
    if (cs.phase === 'jog') {
      this.runPlayer(dt, 104);
      if (this.pathI >= this.playerPath.length || cs.pt > 2.5) {
        cs.phase = 'look'; cs.pt = 0;
        p.moving = false; p.sprinting = false;
      }
    } else if (cs.phase === 'look') {
      // pull up, look left, look right
      p.facing = cs.pt < 0.25 ? 'up' : cs.pt < 0.55 ? 'left' : cs.pt < 0.85 ? 'right' : 'up';
      cs.lb = Math.max(0, 1 - Math.max(0, cs.pt - 0.6) / 0.4);
      if (cs.pt > 1.0) this.startHunt();
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
    this.radio(RADIO2.start, true);
    this.radio(RADIO2.goal, true);
  }

  /* ---------------- events from the game ---------------- */

  on(evt) {
    if (this.step === 'finale') return;
    const g = this.game;
    switch (evt) {
      case 'flush':
        this.sinceFlush = 0;
        if (this.step === 'hunt' && !this.seen.spotted) { this.seen.spotted = true; this.radio(RADIO2.spotted); }
        break;
      case 'secure':
        if (g.captured >= g.mission.goal) { this.startFinale(); return; }
        this.objective('secure', `${g.captured}/${g.mission.goal}`);
        this.radio(RADIO2.secured[Math.min(g.captured, RADIO2.secured.length - 1)]);
        break;
      case 'hit':
        if (!this.seen.tackled) { this.seen.tackled = true; this.radio(RADIO2.tackled); }
        break;
    }
  }

  /* ---------------- per frame ---------------- */

  update(dt) {
    this.t += dt;
    this.stepT += dt;
    if (this.step === 'arrive') { this.updateArrival(dt); return; }
    if (this.step === 'finale') { this.updateFinale(dt); return; }
    const g = this.game, p = g.player, map = g.map;
    this.sinceFlush += dt;

    // the barn: point it out, then (the first time he's in) remark on it
    const b = map.barn;
    if (b) {
      const inside = p.x > b.x0 && p.x < b.x1 && p.y > b.y0 && p.y < b.y1;
      if (inside && !this.seen.inBarn) {
        this.seen.inBarn = this.seen.barn = true;
        this.radio(RADIO2.inBarn, true);
      } else if (!this.seen.barn && this.stepT > 4) {
        const near = Math.hypot(p.x - (b.x0 + b.x1) / 2, p.y - b.y1) < 130;
        const hider = g.aliens.some(a => a.state === 'hiding' && a.hideSpot && a.hideSpot.bld === b);
        if (near && hider) { this.seen.barn = true; this.radio(RADIO2.barn); }
      }
    }

    // lost for a while: ping the nearest hider
    if (this.sinceFlush > 28 && !p.carried.length) {
      this.sinceFlush = 0;
      const a = this.nearestHidden();
      if (a) { this.radio(RADIO2.lost); this.helpT = 6; this.helpAlien = a; }
    }
    this.marker = null;
    if (this.helpT > 0) {
      this.helpT -= dt;
      if (this.helpAlien && this.helpAlien.state === 'hiding') this.marker = { x: this.helpAlien.x, y: this.helpAlien.y, kind: 'find' };
      else this.helpT = 0;
    }
    if (p.carried.length) this.marker = { x: g.vanDoor.x, y: g.vanDoor.y, kind: 'van' };

    // heading off down the road before the job's done
    if (this.t - this.nagT > 12 && (p.y > map.h - 70 || p.x > map.w - 70)) {
      this.nagT = this.t;
      this.radio(RADIO2.exitNag);
    }

    this.tickUi(dt);
  }

  /* ---------------- the finale: off to the tree line ---------------- */

  startFinale() {
    const g = this.game, p = g.player, map = g.map;
    this.step = 'finale';
    this.enterCutscene();
    const edge = map.treeLine;
    // everyone still out there, nearest first, freezes where they stand
    this.runners = g.aliens
      .filter(a => a.free || a.state === 'airlift')
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    this.runners.forEach((a, i) => {
      a.popAt = 0.6 + i * 0.32;
      a.inTrees = false;
      if (a.state !== 'hiding') {
        a.state = 'scripted';
        a.script = { path: [], i: 0, speed: 0, wait: 99, face: { x: a.x, y: edge } };
      }
    });
    this.fled = this.runners.length;
    // the stretch of tree line they all make for: roughly above the middle
    // of the pack, so the camera can hold on it and watch them pour in
    const xs = this.runners.map(a => a.x).sort((a, b) => a - b);
    this.focusX = clamp(xs.length ? xs[xs.length >> 1] : p.x, 110, map.w - 110);
    // lift the roof off any (solid) building they're bolting out of
    for (const b of map.buildings) {
      if (b.glass) continue;
      if (this.runners.some(a => a.x > b.x0 && a.x < b.x1 && a.y > b.y0 && a.y < b.y1)) b.force = 0;
    }
    this.cs = { t: 0, phase: this.runners.length ? 'bolt' : 'look', pt: 0, lb: 0, fade: 0 };
  }

  releaseRoofs() {
    for (const b of this.game.map.buildings) b.force = null;
  }

  // From wherever it is to the stretch of tree line the pack is making
  // for, then on in.
  routeFor(a) {
    const g = this.game, map = g.map, edge = map.treeLine;
    const tx = clamp(this.focusX + (a.x - this.focusX) * 0.3 + rand(-22, 22), 70, map.w - 70);
    const ty = edge + 22;
    const path = findPath(g.nav, a.x, a.y, tx, ty) || [{ x: tx, y: ty }];
    return path.concat([{ x: tx + rand(-6, 6), y: edge - 30 }]);
  }

  updateFinale(dt) {
    const g = this.game, p = g.player, map = g.map, cs = this.cs;
    const edge = map.treeLine;
    cs.t += dt; cs.pt += dt;
    cs.lb = Math.min(1, cs.lb + dt * 2.5);

    // the pack: out of cover one by one, and fading into the trees
    let k = 0;
    for (const a of this.runners) {
      if (!a.popped && cs.t >= a.popAt) {
        a.popped = true;
        if (a.state === 'hiding') g.rustle(a);
        a.state = 'scripted';
        a.script = { path: this.routeFor(a), i: 0, speed: rand(104, 124), wait: 0 };
        g.popup(a.x, a.y - 16, '!', '#ffd75e');
        g.puff(a.x, a.y, '#8fe870');
        if (k++ % 2 === 0) sfx.squeak();
      }
      if (a.state === 'scripted' || a.state === 'fled') a.alpha = clamp((a.y - (edge - 22)) / 28, 0, 1);
      if (a.popped && !a.inTrees && a.y < edge + 4) {
        a.inTrees = true;
        this.leaves(a.x, edge + 2);
        if (!cs.lastIn || cs.t > cs.lastIn) cs.lastIn = cs.t;
      }
    }

    if (cs.phase === 'bolt') {
      if (cs.t > 0.45 && !cs.rumbled) { cs.rumbled = true; sfx.stampede(); g.shake = 3; }
      // on the agent while the nearest ones burst out, then up to the
      // tree line to watch the rest pour in
      if (cs.t > 1.4) {
        g.camTarget = { x: this.focusX, y: edge + 44 };
        g.camEase = 0.12;
      }
      const gone = this.runners.filter(a => a.state === 'fled').length;
      if ((gone >= this.runners.length && cs.t > (cs.lastIn || 0) + 0.9) || cs.t > 11) {
        cs.phase = 'look'; cs.pt = 0;
        this.releaseRoofs();
      }
    } else if (cs.phase === 'look') {
      // back to the agent, staring at where they went
      g.camTarget = { x: p.x, y: p.y - 10 };
      g.camEase = 0.03;
      if (cs.pt > 1.1) {
        cs.phase = 'startle'; cs.pt = 0;
        this.ownsPlayer = true;
        p.state = 'normal'; p.vx = 0; p.vy = 0;
        p.facing = 'up'; p.dir.x = 0; p.dir.y = -1;
        p.moving = false;
      }
    } else if (cs.phase === 'startle') {
      // "!" then "?": they WHAT?
      if (!cs.jumped) { cs.jumped = true; sfx.startle(); p.zv = 150; p.z = 0.1; g.shake = 2.5; }
      p.moving = false;
      if (cs.pt > 1.0) { cs.phase = 'fume'; cs.pt = 0; cs.stomps = 0; cs.steamT = 0; }
    } else if (cs.phase === 'fume') {
      // frustration: turns to us, stamps twice, a vein pops, steam, "#*%!"
      p.moving = false;
      p.facing = cs.pt < 1.75 ? 'down' : 'up';
      const stompAt = [0.12, 0.6];
      if (cs.stomps < stompAt.length && cs.pt >= stompAt[cs.stomps]) {
        cs.stomps++;
        p.zv = 72; p.z = 0.1;
        cs.air = true;
      }
      if (cs.air && p.z === 0) {
        cs.air = false;
        sfx.stomp(); g.shake = 1.8;
        g.puff(p.x, p.y, '#8a6a45');
      }
      if (cs.pt > 0.55 && !cs.grumbled) { cs.grumbled = true; sfx.grumble(); }
      cs.steamT -= dt;
      if (cs.pt > 0.25 && cs.pt < 1.8 && cs.steamT <= 0) {
        cs.steamT = 0.11;
        const side = Math.random() < 0.5 ? -1 : 1;
        g.particles.push({
          x: p.x + side * 5, y: p.y - 17 - p.z, vx: side * (6 + Math.random() * 6), vy: -16 - Math.random() * 8,
          grav: -6, life: 0.6, t: 0.6, color: Math.random() < 0.5 ? '#eef1f7' : '#c8ccd6', size: 2,
        });
      }
      if (cs.pt > 2.05) {
        cs.phase = 'dash'; cs.pt = 0;
        g.camTarget = null;
        // off after them, towards where they went in
        cs.aimX = this.focusX !== undefined ? this.focusX : p.x;
        const path = findPath(g.nav, p.x, p.y, cs.aimX, edge + 22) || [{ x: cs.aimX, y: edge + 22 }];
        this.playerPath = path;
        this.pathI = 0;
      }
    } else if (cs.phase === 'dash') {
      // a few strides, then a quick fade...
      this.runPlayer(dt, 128);
      cs.fade = clamp((cs.pt - 0.55) / 0.35, 0, 1);
      if (cs.pt > 0.95) this.cutToTrees();
    } else if (cs.phase === 'trees') {
      // ...cut to the edge of the woods: he plunges in after the stragglers
      this.runPlayer(dt, 124);
      p.alpha = clamp((p.y - (edge - 20)) / 26, 0, 1);
      if (!cs.inTrees && p.y < edge + 4) { cs.inTrees = true; this.leaves(p.x, edge + 2); sfx.stomp(); }
      cs.fade = cs.pt < 0.3 ? 1 - cs.pt / 0.3 : clamp((cs.pt - 1.75) / 0.7, 0, 1);
      if (cs.pt > 2.5) this.endScene();
    }
    if (cs.phase === 'startle' || cs.phase === 'fume') this.integrateZ(p, dt);
  }

  // Short of the tree line, right behind the last two into the woods.
  cutToTrees() {
    const g = this.game, p = g.player, map = g.map, cs = this.cs, edge = map.treeLine;
    cs.phase = 'trees'; cs.pt = 0;
    const x = cs.aimX;
    p.x = x; p.y = edge + 86; p.z = 0; p.zv = 0; p.alpha = 1;
    p.facing = 'up'; p.dir.x = 0; p.dir.y = -1;
    g.cam.x = x; g.cam.y = edge + 44;
    g.camTarget = { x, y: edge + 44 };
    g.camEase = 0.05;
    this.playerPath = [{ x, y: edge - 26 }];
    this.pathI = 0;
    this.runners.slice(-2).forEach((a, i) => {
      a.x = x + (i ? 18 : -14); a.y = edge + 58 - i * 14; a.z = 0; a.zv = 0;
      a.alpha = 1; a.inTrees = false;
      a.state = 'scripted';
      a.script = { path: [{ x: a.x + rand(-4, 4), y: edge - 30 }], i: 0, speed: 74, wait: 0 };
    });
  }

  endScene() {
    this.releaseRoofs();
    super.endScene();
  }

  // Leaves thrown up where something crashes into the tree line.
  leaves(x, y) {
    const g = this.game;
    for (let i = 0; i < 7; i++) {
      g.particles.push({
        x: x + (Math.random() - 0.5) * 12, y: y - Math.random() * 10,
        vx: (Math.random() - 0.5) * 30, vy: -10 - Math.random() * 18,
        life: 0.8, t: 0.8, color: ['#3d8636', '#57a648', '#2c6127'][i % 3], size: 1,
      });
    }
  }

  /* ---------------- drawing ---------------- */

  // An outlined pixel bitmap, top-left at (x, y).
  glyph(ctx, rows, x, y, col) {
    ctx.fillStyle = '#14141e';
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') ctx.fillRect(x + i - 1, y + j - 1, 3, 3); });
    ctx.fillStyle = col;
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') ctx.fillRect(x + i, y + j, 1, 1); });
  }

  renderWorld(ctx, camX, camY, vw, vh) {
    super.renderWorld(ctx, camX, camY, vw, vh);
    const cs = this.cs;
    if (!cs || this.step !== 'finale') return;
    const p = this.game.player;
    const hx = Math.round(p.x - camX), hy = Math.round(p.y - camY - 21 - p.z);

    if (cs.phase === 'startle') {
      // "!" springs up, then "?" beside it
      const pop1 = cs.pt < 0.1 ? 3 : 0;
      this.glyph(ctx, GLYPHS.bang, hx - 4, hy - 9 - pop1, '#ffd75e');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(hx - 4, hy - 9 - pop1, 1, 2);
      if (cs.pt > 0.3) {
        const pop2 = cs.pt < 0.4 ? 3 : 0;
        this.glyph(ctx, GLYPHS.query, hx + 1, hy - 8 - pop2, '#eef1f7');
      }
    } else if (cs.phase === 'fume') {
      // the vein, throbbing, up by his temple
      if (cs.pt > 0.12) {
        const big = Math.floor(cs.pt * 8) % 2 === 0;
        const v = big ? GLYPHS.vein : GLYPHS.veinS;
        this.glyph(ctx, v, hx + (big ? 4 : 5), hy - (big ? 8 : 7), '#ff5e6c');
      }
      // the swearing
      if (cs.pt > 0.7 && cs.pt < 1.95) {
        const pop = cs.pt < 0.8 ? 2 : 0;
        const bx = hx - 26, by = hy - 16 - pop;
        const bw = 21, bh = 11;
        ctx.fillStyle = '#14141e';
        ctx.fillRect(bx + 1, by, bw - 2, bh); ctx.fillRect(bx, by + 1, bw, bh - 2);
        ctx.fillRect(bx + bw - 6, by + bh - 1, 4, 2); ctx.fillRect(bx + bw - 3, by + bh + 1, 3, 2);   // tail
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(bx + 2, by + 1, bw - 4, bh - 2); ctx.fillRect(bx + 1, by + 2, bw - 2, bh - 4);
        ctx.fillRect(bx + bw - 5, by + bh - 1, 2, 1); ctx.fillRect(bx + bw - 2, by + bh + 1, 1, 1);
        const cols = { '#': '#14141e', '*': '#d8303e', '%': '#14141e', '!': '#d8303e' };
        let gx = bx + 3;
        for (const ch of '#*%!') {
          const rows = GLYPHS[ch];
          ctx.fillStyle = cols[ch];
          rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') ctx.fillRect(gx + i, by + 3 + j, 1, 1); });
          gx += 4;
        }
      }
    }
  }
}
