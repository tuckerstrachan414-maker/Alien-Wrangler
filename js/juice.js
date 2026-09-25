// Game feel: particles, afterimages, ground marks, impact stars, flashes,
// hit-stop, camera kick, squash & stretch, and icons that fly up to the HUD.
//
// Purely cosmetic. Gameplay code says *what* happened (juice.grabHit(a),
// juice.netHit(a), ...) and this module decides how it looks. Anything that
// can be spotted by watching state change frame to frame (landings, a cloak
// flickering on, ice cracking when a freeze wears off, a net tearing) is
// picked up here in update() so entities.js doesn't have to know about it.
//
// Settings → SHAKE & FLASH OFF turns off camera shake, kick, freeze-frames
// and full-screen flashes, but keeps the particles.
import { save } from './save.js';
import { sfx } from './audio.js';

const MAX_PARTICLES = 700;
const MAX_DECALS = 60;
const TAU = Math.PI * 2;

// Ground dust and hiding-cover debris per map.
const DUST = {
  playground: ['#c9d39a', '#9fb070', '#e3e6c4'],
  farmhouse: ['#c3a070', '#8a6a45', '#dcc49a'],
  shipyard: ['#b3b7bf', '#80858f', '#d4d7dc'],
  neighborhood: ['#9aa0ae', '#6d7382', '#c0c5d0'],
  tropical: ['#f0e2b4', '#cdb57c', '#fff4d0'],
};
const COVER = {
  playground: ['#54a34a', '#3f8a3a', '#8fd07a'],
  farmhouse: ['#e0c95e', '#a6c44e', '#6f9a3a'],
  shipyard: ['#c0683c', '#8a8f99', '#e09456'],
  neighborhood: ['#4f9a4a', '#2f6e3a', '#86c875'],
  tropical: ['#3fae5a', '#2a8a48', '#9be274'],
};

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export class Juice {
  constructor(game) {
    this.game = game;
    this.tints = new WeakMap();    // sprite -> colour -> silhouette canvas
    this.reset();
  }

  reset() {
    this.ghosts = [];      // fading afterimages
    this.decals = [];      // marks left on the ground
    this.marks = [];       // impact stars, grab swipes (short-lived shapes)
    this.flyers = [];      // screen-space icons flying to the HUD
    this.flashes = [];     // full-screen colour flashes
    this.vig = null;       // pulsing edge vignette
    this.stopT = 0;        // hit-stop
    this.kx = 0; this.ky = 0;
    this.ghostT = 0;
    this.stepT = 0;
    this.hudDelay = 0;
    this.lastSec = 99;
    this.emberT = 0;
    this.ufoSeen = false;
  }

  get full() { return save.screenFx !== false; }
  get map() { return this.game.mission ? this.game.mission.map : 'playground'; }
  get dustCols() { return DUST[this.map] || DUST.playground; }

  /* ============================ primitives ============================ */

  // Push one particle. Beyond the plain {x, y, vx, vy, life, color, size}
  // the old code used, a particle may carry:
  //   drag   velocity decay per second      shape  px | streak | star | note | shard
  //   grav   downward pull (default 20)     glow   draw additively
  //   ramp   colours over its life          shrink size eases down to 1px
  //   z, vz  bouncing debris with a shadow
  add(p) {
    const ps = this.game.particles;
    if (ps.length >= MAX_PARTICLES) ps.splice(0, ps.length - MAX_PARTICLES + 1);
    if (p.t === undefined) p.t = p.life;
    if (!p.size) p.size = 1;
    ps.push(p);
    return p;
  }

  burst(x, y, colors, n = 8, sp = 40, life = 0.45, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = sp * rnd(0.45, 1.15);
      this.add({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - (o.up ?? 6),
        life: life * rnd(0.7, 1.1), color: colors[i % colors.length],
        size: o.size ? (typeof o.size === 'number' ? o.size : pick(o.size)) : 1,
        drag: o.drag ?? 3, grav: o.grav ?? 20, glow: o.glow, shape: o.shape, shrink: o.shrink,
      });
    }
  }

  sparks(x, y, colors, n = 6, sp = 90, life = 0.25, dir = null, spread = TAU) {
    const base = dir ? Math.atan2(dir.y, dir.x) : 0;
    for (let i = 0; i < n; i++) {
      const a = base + (Math.random() - 0.5) * spread, s = sp * rnd(0.5, 1.2);
      this.add({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7,
        life: life * rnd(0.6, 1.2), color: colors[i % colors.length],
        shape: 'streak', glow: true, drag: 6, grav: 60,
      });
    }
  }

  dust(x, y, n = 6, sp = 26, o = {}) {
    const c = this.dustCols;
    for (let i = 0; i < n; i++) {
      const a = o.dir ? Math.atan2(o.dir.y, o.dir.x) + (Math.random() - 0.5) * (o.spread ?? 1.6) : Math.random() * TAU;
      const s = sp * rnd(0.4, 1.1);
      this.add({
        x: x + rnd(-2, 2), y: y + rnd(-1, 1), vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5 - rnd(2, 8),
        life: rnd(0.35, 0.6) * (o.life ?? 1), color: pick(c), size: Math.random() < 0.35 ? 2 : 1,
        drag: 4, grav: -6, shrink: true,
      });
    }
  }

  // Ellipse ring on the ground (shares the Noise Maker shockwave renderer).
  ring(x, y, max, life, col, lw = 1, fill = 0) {
    this.game.shockwaves.push({ x, y, r: 2, max, t: life, life, col, lw, fill });
  }

  // Four-point impact star, white hot for a couple of frames.
  star(x, y, col = '#ffffff', size = 7, life = 0.16) {
    this.marks.push({ kind: 'star', x, y, col, size, t: life, life });
  }

  // Grab swipe: a quick crescent in front of the agent.
  swipe(x, y, dir, col = '#e8f0ff') {
    this.marks.push({ kind: 'swipe', x, y, ang: Math.atan2(dir.y, dir.x), col, t: 0.14, life: 0.14 });
  }

  flash(col, a = 0.4, life = 0.2) {
    const k = this.full ? 1 : 0.3;
    this.flashes.push({ col, a: a * k, t: life, life });
  }

  vignette(col, a = 0.5, life = 0.5) {
    this.vig = { col, a: this.full ? a : a * 0.5, t: life, life };
  }

  shake(n) { if (this.full) this.game.shake = Math.max(this.game.shake, n); }

  kick(dx, dy, amt = 3) {
    if (!this.full) return;
    const l = Math.hypot(dx, dy) || 1;
    this.kx += dx / l * amt; this.ky += dy / l * amt;
  }

  hitstop(t) { if (this.full) this.stopT = Math.max(this.stopT, t); }

  squash(e, sx, sy) { if (e) { e.sqx = sx; e.sqy = sy; } }

  // A fading copy of a sprite, tinted flat (dash / dive / zip trails).
  ghost(img, x, y, col, o = {}) {
    if (!img) return;
    this.ghosts.push({ img: this.tint(img, col), x, y, rot: o.rot || 0, t: o.life || 0.2, life: o.life || 0.2, a: o.a ?? 0.55 });
    if (this.ghosts.length > 40) this.ghosts.shift();
  }

  tint(img, col) {
    let m = this.tints.get(img);
    if (!m) { m = new Map(); this.tints.set(img, m); }
    let c = m.get(col);
    if (!c) {
      c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = col;
      g.fillRect(0, 0, c.width, c.height);
      m.set(col, c);
    }
    return c;
  }

  // A mark on the ground, drawn once into its own little canvas.
  decal(kind, x, y, o = {}) {
    const r = Math.ceil(o.r || 8);
    const w = r * 2 + 2, h = Math.ceil(r * 1.2) + 2;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const dot = (dx, dy, col, s = 1) => { g.fillStyle = col; g.fillRect(Math.round(w / 2 + dx), Math.round(h / 2 + dy), s, s); };
    if (kind === 'blast') {
      // a scuffed ring where the bang blew the dust flat
      const c = this.dustCols;
      for (let i = 0; i < r * 6; i++) {
        const a = Math.random() * TAU, d = rnd(0.55, 1) * r;
        dot(Math.cos(a) * d, Math.sin(a) * d * 0.55, Math.random() < 0.5 ? c[1] : c[2]);
      }
      for (let i = 0; i < r; i++) {
        const a = Math.random() * TAU, d = rnd(0, 0.3) * r;
        dot(Math.cos(a) * d, Math.sin(a) * d * 0.55, '#3a3228');
      }
    } else if (kind === 'frost') {
      const arc = o.dir ? Math.atan2(o.dir.y, o.dir.x) : 0, spread = o.spread ?? TAU;
      for (let i = 0; i < r * r * 0.3; i++) {
        const a = arc + (Math.random() - 0.5) * spread, d = (o.dir ? rnd(0.15, 1) : Math.sqrt(Math.random())) * r;
        dot(Math.cos(a) * d - (o.dir ? o.dir.x * r * 0.5 : 0), Math.sin(a) * d * 0.55 - (o.dir ? o.dir.y * r * 0.28 : 0),
          pick(['#dff6ff', '#bfefff', '#ffffff', '#9fd8f0']), Math.random() < 0.25 ? 2 : 1);
      }
    } else if (kind === 'splat') {
      for (let i = 0; i < 24; i++) {
        const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * r;
        dot(Math.cos(a) * d, Math.sin(a) * d * 0.55, pick(['#c8322a', '#e04a38', '#f0c230']), Math.random() < 0.4 ? 2 : 1);
      }
    } else if (kind === 'skid') {
      // a dirt streak back along the slide (dir = travel direction)
      const d = o.dir || { x: 1, y: 0 };
      for (let i = 0; i < r * 5; i++) {
        const k = Math.random() * r * 1.8 - r * 0.9, side = rnd(-2.5, 2.5);
        dot(-d.x * k + -d.y * side, (-d.y * k + d.x * side) * 0.8, pick([this.dustCols[1], '#5a4a36']));
      }
    } else if (kind === 'zap') {
      for (let i = 0; i < 4; i++) {
        let a = Math.random() * TAU, px = 0, py = 0;
        for (let s = 0; s < r; s++) {
          a += rnd(-0.8, 0.8);
          px += Math.cos(a); py += Math.sin(a) * 0.55;
          dot(px, py, s < 2 ? '#1a1a22' : '#2a2f3a');
        }
      }
    }
    this.decals.push({ c, x: x - w / 2, y: y - h / 2, t: o.life || 7, life: o.life || 7, a: o.a ?? 0.7 });
    if (this.decals.length > MAX_DECALS) this.decals.shift();
  }

  // Icon that flies from a world point up to a HUD pill ('score' | 'cash').
  toHud(wx, wy, kind, col) {
    this.hudDelay = Math.max(this.hudDelay, 0) + 0.09;
    this.flyers.push({ wx, wy, kind, col, delay: this.hudDelay, t: 0, dur: 0.55, sx: null, sy: null });
  }

  /* ============================= events ============================= */
  // Agent

  jump(p) {
    this.dust(p.x, p.y, 5, 20);
    this.squash(p, 0.8, 1.25);
  }

  land(e, big) {
    this.dust(e.x, e.y, big ? 8 : 3, big ? 28 : 16);
    if (big) this.ring(e.x, e.y, 9, 0.22, this.dustCols[2]);
    this.squash(e, 1.3, 0.72);
  }

  dash(p) {
    this.dust(p.x, p.y, 7, 34, { dir: { x: -p.dir.x, y: -p.dir.y }, spread: 1.4 });
    this.decal('skid', p.x - p.dir.x * 6, p.y - p.dir.y * 6, { r: 6, dir: p.dir, life: 3 });
    this.kick(p.dir.x, p.dir.y, 2);
    this.squash(p, 1.25, 0.82);
  }

  dive(p) {
    this.squash(p, 1.2, 0.85);
    this.dust(p.x, p.y, 4, 20, { dir: { x: -p.dir.x, y: -p.dir.y } });
  }

  // Missed dive: belly flop into the dirt.
  bellyFlop(p) {
    this.dust(p.x, p.y, 12, 36);
    this.decal('skid', p.x - p.dir.x * 8, p.y - p.dir.y * 8, { r: 10, dir: p.dir, life: 5 });
    this.ring(p.x, p.y, 12, 0.28, this.dustCols[2]);
    this.shake(2.5);
  }

  whiff(gp, dir) {
    this.swipe(gp.x, gp.y - 6, dir);
    this.dust(gp.x, gp.y, 2, 12);
  }

  grabHit(a, viaDive) {
    this.star(a.x, a.y - 7, '#ffffff', viaDive ? 9 : 7);
    this.burst(a.x, a.y - 6, ['#59d98c', '#b8ffd2', '#ffffff'], viaDive ? 12 : 8, 55, 0.4, { shape: 'star', glow: true, drag: 5 });
    this.ring(a.x, a.y, viaDive ? 16 : 11, 0.25, '#59d98c', 1);
    this.squash(a, 1.4, 0.6);
    this.squash(this.game.player, 1.15, 0.88);
    this.hitstop(viaDive ? 0.07 : 0.045);
    this.shake(viaDive ? 3 : 1.5);
    if (viaDive) this.dust(a.x, a.y, 10, 34);
  }

  // Armor knocked off: the helmet goes spinning away and bounces.
  helmetOff(a, from) {
    const dx = a.x - from.x, dy = a.y - from.y, l = Math.hypot(dx, dy) || 1;
    this.add({
      x: a.x, y: a.y - 2, z: 10, vz: 110, vx: dx / l * 55 + rnd(-10, 10), vy: dy / l * 30,
      life: 1.4, color: '#c9d2dd', size: 3, shape: 'shard', grav: 0,
    });
    this.sparks(a.x, a.y - 9, ['#ffffff', '#ffe9a0', '#9fc7e8'], 8, 110, 0.22);
    this.star(a.x, a.y - 9, '#ffffff', 8);
    this.squash(a, 1.35, 0.65);
    this.hitstop(0.05);
  }

  playerStunned(p, dropped) {
    this.sparks(p.x, p.y - 12, ['#ffd75e', '#ff5e6c', '#ffffff'], 12, 100, 0.3);
    this.star(p.x, p.y - 10, '#ff9e5e', 10, 0.2);
    this.vignette('#ff2a3a', 0.5, 0.55);
    this.flash('#ff5e6c', 0.22, 0.14);
    this.hitstop(0.08);
    this.squash(p, 1.35, 0.7);
    for (const al of dropped) this.burst(al.x, al.y - 4, ['#ff9e5e', '#ffffff'], 5, 40, 0.35);
  }

  secured(x, y, n) {
    this.ring(x, y, 22, 0.4, '#59d98c', 2);
    this.ring(x, y, 34, 0.6, '#b8ffd2', 1);
    this.burst(x, y - 8, ['#59d98c', '#ffd75e', '#6ec2ff', '#ff8fb8', '#ffffff'], 14 + n * 4, 70, 0.8,
      { up: 30, grav: 80, drag: 1.5, size: [1, 2], shape: 'shard' });
    for (let i = 0; i < 8; i++) {
      this.add({ x: x + rnd(-10, 10), y: y - rnd(0, 6), vx: 0, vy: -rnd(30, 60), life: rnd(0.5, 0.9),
        color: pick(['#b8ffd2', '#ffffff']), glow: true, grav: 0, drag: 1 });
    }
    this.game.vanBump = 0.3;
    this.flash('#59d98c', 0.12, 0.18);
  }

  // Aliens

  flushed(a) {
    const c = COVER[this.map] || COVER.playground;
    for (let i = 0; i < 12; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, s = rnd(30, 70);
      this.add({ x: a.x + rnd(-4, 4), y: a.y - 4, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s,
        life: rnd(0.5, 0.8), color: pick(c), size: Math.random() < 0.4 ? 2 : 1, grav: 110, drag: 2, shape: 'shard' });
    }
    this.squash(a, 0.75, 1.35);
  }

  alienAttack(a) {
    this.ring(a.x, a.y, 12, 0.3, '#ff5e6c', 1);
    this.squash(a, 1.25, 0.8);
  }

  boltFire(a, dx, dy) {
    this.star(a.x + dx * 6, a.y - 6 + dy * 6, '#41f0d8', 5, 0.1);
    this.sparks(a.x + dx * 6, a.y - 6 + dy * 6, ['#41f0d8', '#e8f6ff'], 4, 60, 0.15, { x: dx, y: dy }, 1);
  }

  alienDash(a) {
    this.dust(a.x, a.y, 6, 30);
    a.ghostT = 0.25;
  }

  cornered(a) {
    this.burst(a.x, a.y - 8, ['#ffb07a', '#ffffff'], 8, 40, 0.35, { shape: 'star' });
    for (let i = 0; i < 3; i++) {
      this.add({ x: a.x + rnd(-5, 5), y: a.y - 14, vx: rnd(-20, 20), vy: -rnd(20, 40), life: 0.5,
        color: '#8fd4ff', size: 1, grav: 140 });
    }
    this.squash(a, 1.2, 0.8);
  }

  escaped(a, u) {
    const top = u ? { x: u.x, y: u.y + 6 } : { x: a.x, y: a.y - 46 };
    this.burst(top.x, top.y, ['#9ff5ff', '#ffffff', '#ff5e6c'], 16, 60, 0.6, { glow: true, grav: 0 });
    this.ring(a.x, a.y, 20, 0.5, '#ff5e6c', 1);
    this.vignette('#ff2a3a', 0.4, 0.45);
  }

  snatched(a) {
    this.burst(a.x, a.y - 10, ['#9ff5ff', '#59d98c', '#ffffff'], 14, 70, 0.5, { glow: true, shape: 'star' });
    this.star(a.x, a.y - 10, '#9ff5ff', 11, 0.22);
    this.flash('#9ff5ff', 0.18, 0.15);
    this.hitstop(0.06);
  }

  ufoArrive() {
    this.flash('#9ff5ff', 0.45, 0.45);
    this.vignette('#41f0d8', 0.5, 1.2);
  }

  // Gadgets

  // Every gadget going off: a flash at the muzzle and a little recoil.
  muzzle(user, col, n = 5, dir = user.dir) {
    const x = user.x + dir.x * 8, y = user.y - 6 + dir.y * 8;
    this.star(x, y, col, 5, 0.1);
    this.sparks(x, y, [col, '#ffffff'], n, 70, 0.14, dir, 1.1);
    this.squash(user, 0.9, 1.1);
    if (!user.isDecoy) this.kick(-dir.x, -dir.y, 1.5);
  }

  netHit(a) {
    for (let i = 0; i < 10; i++) {
      const ang = i / 10 * TAU;
      this.add({ x: a.x, y: a.y - 6, vx: Math.cos(ang) * 50, vy: Math.sin(ang) * 30, life: 0.3,
        color: i % 2 ? '#ffd75e' : '#fff2b0', shape: 'streak', drag: 10, grav: 0 });
    }
    this.ring(a.x, a.y, 12, 0.25, '#ffd75e', 1);
    this.squash(a, 1.3, 0.7);
    this.hitstop(0.035);
  }

  netTear(a) {
    this.burst(a.x, a.y - 6, ['#ffd75e', '#c9a93a'], 10, 45, 0.45, { shape: 'streak', grav: 90 });
  }

  noiseBlast(user, nm, agent) {
    this.decal('blast', user.x, user.y, { r: Math.min(14, nm.stunR * 0.14), life: 5, a: 0.6 });
    this.ring(user.x, user.y, nm.stunR * 0.6, 0.3, '#fff6c8', 3);
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * TAU, s = rnd(40, 90);
      this.add({ x: user.x, y: user.y, z: 2, vz: rnd(80, 160), vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6,
        life: rnd(0.8, 1.2), color: pick(this.dustCols), size: pick([1, 2]), grav: 0 });
    }
    this.sparks(user.x, user.y - 6, ['#fff6c8', '#ffd75e', '#ffffff'], 14, 150, 0.3);
    if (agent) { this.hitstop(0.06); this.vignette('#fff6c8', 0.35, 0.4); }
  }

  zapHit(a, second) {
    this.star(a.x, a.y - 6, second ? '#ffffff' : '#9fe8ff', second ? 9 : 7, 0.14);
    this.sparks(a.x, a.y - 6, ['#9fe8ff', '#ffffff', '#6ec2ff'], 8, 100, 0.22);
    this.decal('zap', a.x, a.y, { r: 7, life: 4 });
    this.squash(a, 0.8, 1.25);
    a.crackleT = 1.2;
  }

  zapFizzle(pt) {
    this.sparks(pt.x, pt.y, ['#6ec2ff', '#ffffff'], 6, 60, 0.2);
  }

  dartHit(a) {
    this.burst(a.x, a.y - 7, ['#c9a8ff', '#e8dcff', '#ffffff'], 8, 35, 0.5, { size: [1, 2], grav: -10 });
    this.star(a.x, a.y - 7, '#e8dcff', 5, 0.12);
    this.squash(a, 1.15, 0.85);
  }

  dartPlink(a, pr) {
    this.sparks(a.x, a.y - 9, ['#ffffff', '#ffe9a0'], 6, 90, 0.18);
    const l = Math.hypot(pr.vx, pr.vy) || 1;
    this.add({ x: a.x, y: a.y - 8, z: 6, vz: 90, vx: -pr.vx / l * 40 + rnd(-20, 20), vy: -pr.vy / l * 25,
      life: 0.9, color: '#d7dfea', size: 2, shape: 'shard', grav: 0 });
  }

  baitLand(x, y) {
    this.decal('splat', x, y, { r: 6, life: 12 });
    this.burst(x, y - 3, ['#e0a050', '#c8322a', '#59b84a', '#f0c230'], 10, 45, 0.45, { up: 20, grav: 120 });
    this.dust(x, y, 4, 18);
  }

  foodComa(a) {
    for (let i = 0; i < 8; i++) {
      this.add({ x: a.x + rnd(-4, 4), y: a.y - 10, vx: rnd(-12, 12), vy: -rnd(10, 22), grav: -4, drag: 1,
        life: 1, color: pick(['#ffb35e', '#fff2c8']), size: 2, shrink: true });
    }
  }

  cageSet(x, y) {
    this.dust(x, y, 6, 22);
    this.ring(x, y, 10, 0.25, '#c9b48a', 1);
    this.sparks(x, y - 3, ['#ffe9a0', '#ffffff'], 4, 50, 0.15);
  }

  cageSnap(c, a) {
    this.star(c.x, c.y - 8, '#ffb35e', 9, 0.16);
    this.sparks(c.x, c.y - 8, ['#ffb35e', '#ffe9a0', '#ffffff'], 10, 110, 0.22);
    this.dust(c.x, c.y, 8, 30);
    this.shake(2);
    this.hitstop(0.04);
    this.squash(a, 1.35, 0.65);
  }

  cageBreak(c) {
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * TAU, s = rnd(30, 70);
      this.add({ x: c.x, y: c.y - 4, z: 6, vz: rnd(60, 120), vx: Math.cos(ang) * s, vy: Math.sin(ang) * s * 0.6,
        life: 0.9, color: pick(['#ffb35e', '#c9b48a', '#6f6552']), size: 1, shape: 'shard', grav: 0 });
    }
    this.dust(c.x, c.y, 5, 22);
  }

  courierLift(x, y) {
    this.dust(x, y, 10, 40);
    this.ring(x, y, 14, 0.35, '#b8ffd2', 1);
  }

  hookHit(a) {
    this.star(a.x, a.y - 6, '#ffffff', 7, 0.12);
    this.sparks(a.x, a.y - 6, ['#d7dfea', '#ffffff'], 6, 90, 0.18);
    this.squash(a, 1.3, 0.75);
    a.ghostT = 0.5;
  }

  hookWall(x, y, vx, vy) {
    const l = Math.hypot(vx, vy) || 1;
    this.sparks(x, y, ['#ffe9a0', '#ffffff', '#d7dfea'], 10, 110, 0.22, { x: -vx / l, y: -vy / l }, 2.2);
    this.star(x, y, '#ffffff', 6, 0.12);
    this.dust(x, y + 4, 4, 20);
  }

  zip(p) {
    this.ring(p.x, p.y, 10, 0.2, '#d7dfea', 1);
    this.kick(p.dir.x, p.dir.y, 3);
  }

  decoyInflate(d) {
    this.ring(d.x, d.y, 14, 0.3, '#ffffff', 1);
    this.ring(d.x, d.y, 20, 0.45, '#ffb07a', 1);
    this.burst(d.x, d.y - 8, ['#ffffff', '#ffe0cc'], 8, 45, 0.4, { grav: -20, size: [1, 2], shrink: true });
    this.squash(d, 0.6, 1.5);
  }

  decoyPop(d) {
    this.star(d.x, d.y - 8, '#ffb07a', 11, 0.18);
    this.ring(d.x, d.y, 18, 0.3, '#ffb07a', 2);
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * TAU, s = rnd(40, 90);
      this.add({ x: d.x, y: d.y - 6, z: 8, vz: rnd(70, 140), vx: Math.cos(ang) * s, vy: Math.sin(ang) * s * 0.6,
        life: 1.2, color: pick(['#ffb07a', '#e07a4a', '#2a2f45']), size: 2, shape: 'shard', grav: 0 });
    }
    this.shake(2);
  }

  shieldUp(u) {
    this.ring(u.x, u.y, 16, 0.3, '#ffffff', 2);
    this.ring(u.x, u.y, 24, 0.5, '#7fe3ff', 1);
    this.burst(u.x, u.y - 8, ['#7fe3ff', '#ffffff'], 10, 40, 0.4, { shape: 'star', glow: true, grav: 0 });
  }

  shieldBlock(u, from, reflect) {
    const dx = from ? from.x - u.x : 0, dy = from ? from.y - u.y : -1, l = Math.hypot(dx, dy) || 1;
    const x = u.x + dx / l * 10, y = u.y - 8 + dy / l * 10;
    this.star(x, y, reflect ? '#ffffff' : '#7fe3ff', reflect ? 10 : 8, 0.16);
    this.sparks(x, y, ['#7fe3ff', '#ffffff', '#bff4ff'], 10, 110, 0.22, { x: dx / l, y: dy / l }, 1.8);
    this.kick(-dx, -dy, 2);
    this.shake(1.5);
    u.shieldHitT = 0.2;
    if (reflect) this.flash('#7fe3ff', 0.14, 0.1);
  }

  shieldBash(a, u) {
    this.star(a.x, a.y - 7, '#ffffff', 9, 0.16);
    this.sparks(a.x, a.y - 7, ['#7fe3ff', '#ffffff'], 8, 110, 0.22, { x: a.x - u.x, y: a.y - u.y }, 1.8);
    this.dust(a.x, a.y, 6, 30);
    this.hitstop(0.05);
    this.squash(a, 1.4, 0.6);
  }

  shieldDrop(u) {
    for (let i = 0; i < 10; i++) {
      const ang = i / 10 * TAU;
      this.add({ x: u.x + Math.cos(ang) * 10, y: u.y - 8 + Math.sin(ang) * 11, vx: Math.cos(ang) * 25, vy: Math.sin(ang) * 25,
        life: 0.35, color: i % 2 ? '#7fe3ff' : '#ffffff', grav: 30, drag: 2 });
    }
  }

  cryoSpray(user, dir, T) {
    this.decal('frost', user.x + dir.x * T.range * 0.55, user.y + dir.y * T.range * 0.55,
      { r: Math.min(30, T.range * 0.45), dir, spread: T.cone * 2 * Math.PI / 180, life: 5, a: 0.55 });
    this.muzzle(user, '#bfefff', 3, dir);
  }

  cryoNova(user, T) {
    this.decal('frost', user.x, user.y, { r: Math.min(30, T.range * 0.5), life: 5, a: 0.5 });
    this.flash('#bfefff', 0.3, 0.25);
    this.ring(user.x, user.y, T.range * 0.9, 0.6, '#ffffff', 2);
  }

  frozen(a) {
    this.burst(a.x, a.y - 6, ['#ffffff', '#bfefff'], 6, 30, 0.4, { shape: 'star', glow: true, grav: 0 });
    this.squash(a, 1.15, 0.9);
  }

  iceShatter(a) {
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * TAU, s = rnd(30, 80);
      this.add({ x: a.x + rnd(-4, 4), y: a.y - rnd(2, 12), z: rnd(2, 8), vz: rnd(40, 110),
        vx: Math.cos(ang) * s, vy: Math.sin(ang) * s * 0.6, life: rnd(0.6, 1),
        color: pick(['#ffffff', '#bfefff', '#9fd8f0']), size: pick([1, 2]), shape: 'shard', grav: 0 });
    }
    this.sparks(a.x, a.y - 7, ['#ffffff', '#bfefff'], 5, 70, 0.18);
  }

  hypnoHit(a) {
    for (let i = 0; i < 3; i++) this.marks.push({ kind: 'spiral', x: a.x, y: a.y - 8, t: 0.5 + i * 0.12, life: 0.5 + i * 0.12, r0: 6 + i * 5 });
    this.burst(a.x, a.y - 8, ['#e08bff', '#ffffff', '#ff8fe0'], 8, 40, 0.5, { shape: 'star', glow: true, grav: 0 });
    this.squash(a, 0.8, 1.2);
  }

  snappedOut(a) {
    this.burst(a.x, a.y - 10, ['#e08bff', '#ff9e5e'], 8, 40, 0.4, { shape: 'star' });
    this.squash(a, 1.2, 0.8);
  }

  cloak(a, on) {
    for (let i = 0; i < 10; i++) {
      this.add({ x: a.x + rnd(-5, 5), y: a.y - rnd(0, 13), vx: rnd(-8, 8), vy: on ? -rnd(10, 25) : rnd(-6, 6),
        life: rnd(0.3, 0.5), color: pick(['#c78bff', '#ffffff', '#9ff5ff']), glow: true, grav: 0 });
    }
  }

  evac(x, y) {
    for (let i = 0; i < 10; i++) {
      this.add({ x: x + rnd(-7, 7), y: y - rnd(0, 20), vx: rnd(-4, 4), vy: -rnd(60, 110), life: rnd(0.4, 0.7),
        color: pick(['#8cffbe', '#ffffff', '#59d98c']), shape: 'streak', glow: true, grav: 0, drag: 0.5 });
    }
    this.ring(x, y, 14, 0.4, '#8cffbe', 1);
  }

  /* ============================== update ============================== */

  update(dt) {
    const g = this.game, p = g.player;

    // camera kick springs back; squash relaxes
    const k = Math.pow(0.0005, dt);
    this.kx *= k; this.ky *= k;
    const relax = (e) => {
      if (e.sqx === undefined) return;
      const r = Math.min(1, dt * 13);
      e.sqx += (1 - e.sqx) * r; e.sqy += (1 - e.sqy) * r;
    };
    relax(p);
    for (const a of g.aliens) relax(a);
    for (const d of g.decoys) relax(d);
    if (g.vanBump > 0) g.vanBump = Math.max(0, g.vanBump - dt);

    this.watchPlayer(dt, p);
    for (const a of g.aliens) this.watchAlien(dt, a);
    for (const d of g.decoys) this.watchShield(dt, d);
    this.watchShield(dt, p);

    // projectile trails
    for (const pr of g.projectiles) {
      pr.age = (pr.age || 0) + dt;
      if (pr.type === 'bolt' || pr.type === 'rbolt') {
        this.add({ x: pr.x + rnd(-1, 1), y: pr.y + rnd(-1, 1), vx: 0, vy: 0, life: 0.18,
          color: pr.type === 'bolt' ? '#41f0d8' : '#7fe3ff', glow: true, grav: 0 });
      } else if (pr.type === 'dart' && Math.random() < 0.6) {
        this.add({ x: pr.x, y: pr.y, vx: 0, vy: 0, life: 0.15, color: '#e8dcff', grav: 0 });
      } else if (pr.type === 'net' && Math.random() < 0.5) {
        this.add({ x: pr.x + rnd(-3, 3), y: pr.y + rnd(-3, 3), vx: -pr.vx * 0.1, vy: -pr.vy * 0.1, life: 0.2, color: '#ffd75e', grav: 0 });
      } else if (pr.type === 'lob' && Math.random() < 0.3) {
        this.add({ x: pr.x, y: pr.y - pr.h - 3, vx: rnd(-6, 6), vy: 0, life: 0.3, color: '#ffffff', grav: -10 });
      }
    }

    this.watchUfo(dt);
    this.watchClock();

    // volcano embers (Isla Verde)
    if (g.map.volcano) {
      this.emberT -= dt;
      if (this.emberT <= 0) {
        this.emberT = rnd(0.3, 0.9);
        const v = g.map.volcano;
        this.add({ x: v.x + rnd(-6, 6), y: v.y - 4, vx: rnd(-18, 18), vy: -rnd(30, 60), life: rnd(0.8, 1.4),
          ramp: ['#fff2a0', '#ffb35e', '#ff5e3a', '#8a2a1a'], glow: true, grav: 40 });
      }
    }

    // particles
    for (const pt of g.particles) {
      if (pt.drag) { const f = Math.exp(-pt.drag * dt); pt.vx *= f; pt.vy *= f; }
      pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.t -= dt;
      if (pt.vz !== undefined) {
        pt.vz -= 320 * dt; pt.z += pt.vz * dt;
        if (pt.z <= 0) { pt.z = 0; pt.vz = -pt.vz * 0.45; pt.vx *= 0.55; pt.vy *= 0.55; if (pt.vz < 18) pt.vz = 0; }
        pt.spin = (pt.spin || 0) + dt * Math.hypot(pt.vx, pt.vy) * 0.2;
      } else pt.vy += (pt.grav ?? 20) * dt;
    }
    g.particles = g.particles.filter(pt => pt.t > 0);

    for (const gh of this.ghosts) gh.t -= dt;
    this.ghosts = this.ghosts.filter(gh => gh.t > 0);
    for (const m of this.marks) m.t -= dt;
    this.marks = this.marks.filter(m => m.t > 0);
    for (const d of this.decals) d.t -= dt;
    this.decals = this.decals.filter(d => d.t > 0);
    for (const f of this.flashes) f.t -= dt;
    this.flashes = this.flashes.filter(f => f.t > 0);
    if (this.vig) { this.vig.t -= dt; if (this.vig.t <= 0) this.vig = null; }
    this.hudDelay -= dt;
    for (const f of this.flyers) {
      if (f.delay > 0) { f.delay -= dt; continue; }
      f.t += dt;
      if (f.t >= f.dur && !f.done) {
        f.done = true;
        if (g.onHudPing) g.onHudPing(f.kind);
        sfx.tick();
      }
    }
    this.flyers = this.flyers.filter(f => !f.done);
  }

  watchPlayer(dt, p) {
    const A = this.game.assets.actors.player;
    // landing from a jump
    if (p._jz > 6 && p.z === 0) this.land(p, true);
    p._jz = p.z;

    // afterimages + speed streaks while dashing, diving or zipping
    const fast = p.state === 'dashing' || p.state === 'diving' || p.state === 'zipping';
    if (fast) {
      this.ghostT -= dt;
      if (this.ghostT <= 0) {
        this.ghostT = 0.035;
        const col = p.state === 'zipping' ? '#d7dfea' : p.state === 'diving' ? '#ffd75e' : '#6ec2ff';
        if (p.state === 'diving') {
          const img = p.dir.x < 0 ? A.diveL : A.diveR;
          let rot = Math.atan2(p.dir.y, Math.abs(p.dir.x) < 0.3 ? 0.0001 : p.dir.x);
          if (p.dir.x < 0) rot -= Math.PI;
          this.ghost(img, p.x, p.y - 4, col, { rot, life: 0.18 });
        } else {
          const img = A[p.facing] || A.down;
          this.ghost(img, p.x, p.y - 7 - Math.round(p.z), col, { life: 0.18 });
        }
      }
      this.add({ x: p.x + rnd(-6, 6), y: p.y - rnd(2, 14), vx: -p.vx * 0.5, vy: -p.vy * 0.5, life: 0.12,
        color: '#ffffff', shape: 'streak', grav: 0 });
    }
    if (p._js === 'zipping' && p.state !== 'zipping') this.land(p, true);
    p._js = p.state;

    // footstep dust while sprinting
    if (p.sprinting && p.moving && p.z === 0 && p.state === 'normal') {
      const step = Math.floor(p.walkT / Math.PI);
      if (step !== this.stepT) { this.stepT = step; this.dust(p.x - p.dir.x * 4, p.y, 2, 14, { life: 0.7 }); }
    }

    // stun: sparks fizzing off the agent
    if (p.state === 'stunned' && Math.random() < dt * 14) {
      this.add({ x: p.x + rnd(-6, 6), y: p.y - rnd(6, 18), vx: rnd(-20, 20), vy: -rnd(10, 30), life: 0.25,
        color: pick(['#ffd75e', '#ffffff']), glow: true, grav: 40 });
    }
  }

  watchAlien(dt, a) {
    const onField = a.free || a.state === 'beaming';
    // hop landings (fences, bales, a Scout's panic dash)
    if (a._jz > 4 && a.z === 0 && onField) this.land(a, false);
    a._jz = a.z;

    // afterimages for a panic dash / being reeled in
    if (a.ghostT > 0 || a.state === 'reeled') {
      a.ghostT = (a.ghostT || 0) - dt;
      a._gt = (a._gt || 0) - dt;
      if (a._gt <= 0 && !a.cloaked) {
        a._gt = 0.04;
        const set = this.game.assets.actors.aliens[a.tier];
        this.ghost(set[a.facing] || set.down, a.x, a.y - 5 - Math.round(a.z), a.state === 'reeled' ? '#d7dfea' : '#6ec2ff', { life: 0.16, a: 0.45 });
      }
    }

    // state changes worth a flourish
    const was = a._js;
    if (was !== undefined && was !== a.state) {
      if (was === 'stunned' && a._jl === 'ice') this.iceShatter(a);
      else if (was === 'stunned' && a._jl === 'zzz' && a.state === 'running') this.burst(a.x, a.y - 12, ['#c9a8ff', '#ffffff'], 5, 25, 0.35);
      if (was === 'netted' && a.state === 'running') {
        if (a._jcage) this.cageBreak(a._jcage); else this.netTear(a);
      }
      if (was === 'hypno' && a.state === 'running') this.snappedOut(a);
      if (a.state === 'hypno') this.hypnoHit(a);
      if (a.state === 'stunned' && a.look === 'zzz' && was === 'lured') this.foodComa(a);
    }
    if (a.state === 'stunned' && a.look === 'ice' && was !== undefined && (was !== 'stunned' || a._jl !== 'ice')) this.frozen(a);
    if (a._jc !== undefined && a._jc !== a.cloaked && onField) this.cloak(a, a.cloaked);
    a._js = a.state; a._jl = a.look; a._jc = a.cloaked; a._jcage = a.cage;

    // lingering electric crackle after a zap
    if (a.crackleT > 0) {
      a.crackleT -= dt;
      if (Math.random() < dt * 18 && onField) {
        this.add({ x: a.x + rnd(-5, 5), y: a.y - rnd(2, 12), vx: rnd(-30, 30), vy: rnd(-30, 10), life: 0.12,
          color: pick(['#9fe8ff', '#ffffff']), shape: 'streak', glow: true, grav: 0 });
      }
    }
    // frost glints on a frozen alien
    if (a.state === 'stunned' && a.look === 'ice' && Math.random() < dt * 6) {
      this.add({ x: a.x + rnd(-5, 5), y: a.y - rnd(2, 12), vx: 0, vy: 0, life: 0.3, color: '#ffffff', shape: 'star', size: 3, glow: true, grav: 0 });
    }
    // hypnotized conga line hums along
    if (a.state === 'hypno' && Math.random() < dt * 1.6) {
      this.add({ x: a.x + rnd(-3, 3), y: a.y - 18, vx: rnd(-8, 8), vy: -18, life: 0.9, color: pick(['#e08bff', '#ff8fe0']),
        shape: 'note', grav: 0, drag: 0.5 });
    }
    // a tackle charge kicks up dirt
    if (a.state === 'attack' && a.stats.attackType !== 'bolt' && a.z === 0 && Math.random() < dt * 14) {
      this.dust(a.x, a.y, 1, 10, { life: 0.6 });
    }
    // a sleeper drifts a little dream-dust
    if (a.state === 'stunned' && a.look === 'zzz' && Math.random() < dt * 2) {
      this.add({ x: a.x + rnd(-3, 3), y: a.y - 12, vx: rnd(-4, 4), vy: -8, life: 0.8, color: '#e8dcff', grav: -2, glow: true });
    }
  }

  watchShield(dt, u) {
    if (u._jsh > 0 && !(u.shieldT > 0)) this.shieldDrop(u);
    u._jsh = u.shieldT;
    if (u.shieldHitT > 0) u.shieldHitT -= dt;
    if (u.shieldT > 0 && Math.random() < dt * 7) {
      const ang = Math.random() * TAU;
      this.add({ x: u.x + Math.cos(ang) * 11, y: u.y - 8 + Math.sin(ang) * 12, vx: 0, vy: -6, life: 0.3,
        color: '#bff4ff', glow: true, grav: 0 });
    }
  }

  watchUfo(dt) {
    const u = this.game.ufo;
    if (!u) return;
    if (!this.ufoSeen) { this.ufoSeen = true; this.ufoArrive(); }
    if ((u.state === 'travel' || u.state === 'leave') && Math.random() < dt * 30) {
      this.add({ x: u.x + rnd(-14, 14), y: u.y + 4, vx: rnd(-6, 6), vy: 10, life: 0.4,
        color: pick(['#41f0d8', '#ffd75e', '#9ff5ff']), glow: true, grav: 0 });
    }
    if (u.state === 'channel' && u.target && Math.random() < dt * 40) {
      // energy gathering in toward the alien about to be lifted
      const t = u.target, ang = Math.random() * TAU, r = rnd(14, 22);
      this.add({ x: t.x + Math.cos(ang) * r, y: t.y - 4 + Math.sin(ang) * r * 0.5, vx: -Math.cos(ang) * r * 3.2,
        vy: -Math.sin(ang) * r * 1.6, life: 0.3, color: pick(['#9ff5ff', '#ffffff']), glow: true, grav: 0 });
    }
  }

  // Mission clock: a red edge pulse at the 30s warning and every second of
  // the last ten.
  watchClock() {
    const g = this.game;
    if (g.phase !== 'play' || g.mission.endless) return;
    const sec = Math.ceil(g.timer);
    if (sec !== this.lastSec) {
      if (sec === 30 || (sec <= 10 && sec > 0)) this.vignette('#ff2a3a', sec <= 5 ? 0.5 : 0.32, 0.5);
      this.lastSec = sec;
    }
  }

  /* ============================== render ============================== */

  renderDecals(ctx, camX, camY) {
    for (const d of this.decals) {
      ctx.globalAlpha = Math.min(1, d.t / (d.life * 0.3)) * d.a;
      ctx.drawImage(d.c, Math.round(d.x - camX), Math.round(d.y - camY));
    }
    ctx.globalAlpha = 1;
  }

  renderGhosts(ctx, camX, camY) {
    for (const gh of this.ghosts) {
      ctx.globalAlpha = Math.max(0, gh.t / gh.life) * gh.a;
      const x = Math.round(gh.x - camX), y = Math.round(gh.y - camY);
      if (gh.rot) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(gh.rot);
        ctx.drawImage(gh.img, -gh.img.width / 2, -gh.img.height / 2);
        ctx.restore();
      } else ctx.drawImage(gh.img, x - (gh.img.width >> 1), y - (gh.img.height >> 1));
    }
    ctx.globalAlpha = 1;
  }

  renderParticles(ctx, camX, camY) {
    for (const pt of this.game.particles) {
      const k = Math.max(0, pt.t / pt.life);
      ctx.globalAlpha = pt.vz !== undefined ? Math.min(1, k * 3) : k;
      if (pt.glow) ctx.globalCompositeOperation = 'lighter';
      const col = pt.ramp ? pt.ramp[Math.min(pt.ramp.length - 1, ((1 - k) * pt.ramp.length) | 0)] : pt.color;
      ctx.fillStyle = col;
      const s = pt.shrink ? Math.max(1, Math.round(pt.size * k + 0.4)) : pt.size;
      const x = Math.round(pt.x - camX), y = Math.round(pt.y - camY - (pt.z || 0));
      switch (pt.shape) {
        case 'streak': {
          const l = Math.min(6, Math.hypot(pt.vx, pt.vy) * 0.04 + 1);
          const n = Math.hypot(pt.vx, pt.vy) || 1;
          const dx = pt.vx / n, dy = pt.vy / n;
          for (let i = 0; i < l; i++) ctx.fillRect(Math.round(x - dx * i), Math.round(y - dy * i), 1, 1);
          break;
        }
        case 'star':
          ctx.fillRect(x, y - 1, 1, 3); ctx.fillRect(x - 1, y, 3, 1);
          if (s > 2 && k > 0.5) { ctx.fillRect(x, y - 2, 1, 5); ctx.fillRect(x - 2, y, 5, 1); }
          break;
        case 'note':
          ctx.fillRect(x, y, 2, 2); ctx.fillRect(x + 1, y - 4, 1, 4); ctx.fillRect(x + 2, y - 4, 1, 1);
          break;
        case 'shard': {
          if (pt.vz !== undefined) {
            ctx.globalAlpha *= 0.3;
            ctx.fillStyle = '#000';
            ctx.fillRect(x, Math.round(pt.y - camY), s, 1);
            ctx.globalAlpha = Math.min(1, k * 3);
            ctx.fillStyle = col;
          }
          const flip = Math.floor((pt.spin || pt.t * 12)) % 2;
          ctx.fillRect(x, y, flip ? s : Math.max(1, s - 1), flip ? Math.max(1, s - 1) : s);
          break;
        }
        default:
          if (pt.vz !== undefined && pt.z > 0) {
            ctx.globalAlpha *= 0.3;
            ctx.fillStyle = '#000';
            ctx.fillRect(x, Math.round(pt.y - camY), s, 1);
            ctx.globalAlpha = Math.min(1, k * 3);
            ctx.fillStyle = col;
          }
          ctx.fillRect(x, y, s, s);
      }
      if (pt.glow) ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  renderMarks(ctx, camX, camY) {
    for (const m of this.marks) {
      const k = Math.max(0, m.t / m.life);
      const x = Math.round(m.x - camX), y = Math.round(m.y - camY);
      if (m.kind === 'star') {
        // big for the first frame, then collapses to a point
        const r = Math.max(1, Math.round(m.size * (0.4 + 0.6 * k)));
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = k;
        ctx.fillStyle = m.col;
        ctx.fillRect(x - r, y, r * 2 + 1, 1);
        ctx.fillRect(x, y - r, 1, r * 2 + 1);
        const d = Math.round(r * 0.45);
        ctx.fillRect(x - d, y - d, 1, 1); ctx.fillRect(x + d, y - d, 1, 1);
        ctx.fillRect(x - d, y + d, 1, 1); ctx.fillRect(x + d, y + d, 1, 1);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 1, y - 1, 3, 3);
        ctx.globalCompositeOperation = 'source-over';
      } else if (m.kind === 'swipe') {
        ctx.globalAlpha = k;
        ctx.strokeStyle = m.col;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const sweep = (1 - k) * 1.6;
        ctx.arc(x, y, 9, m.ang - 1.1 + sweep * 0.3, m.ang + 1.1 * (0.3 + sweep), false);
        ctx.stroke();
      } else if (m.kind === 'spiral') {
        ctx.globalAlpha = k;
        const r = m.r0 * k + 1;
        for (let i = 0; i < 10; i++) {
          const a = i / 10 * TAU + (1 - k) * 8;
          ctx.fillStyle = i % 2 ? '#e08bff' : '#ffffff';
          ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.6), 1, 1);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // Screen-space layer: flashes, vignette and icons flying to the HUD.
  renderScreen(ctx, vw, vh, camX, camY) {
    const g = this.game;
    if (this.vig) {
      const a = this.vig.a * Math.sin(Math.PI * Math.min(1, (1 - this.vig.t / this.vig.life) * 1.4 + 0.15));
      if (a > 0.01) {
        const out = Math.hypot(vw / 2, vh / 2);
        const grad = ctx.createRadialGradient(vw / 2, vh / 2, out * 0.5, vw / 2, vh / 2, out);
        grad.addColorStop(0, rgba(this.vig.col, 0));
        grad.addColorStop(1, rgba(this.vig.col, a));
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, vw, vh);
      }
    }
    for (const f of this.flashes) {
      ctx.globalAlpha = f.a * (f.t / f.life);
      ctx.fillStyle = f.col;
      ctx.fillRect(0, 0, vw, vh);
    }
    ctx.globalAlpha = 1;

    const tg = g.hudTargets || {};
    for (const f of this.flyers) {
      if (f.delay > 0) continue;
      if (f.sx === null) { f.sx = f.wx - camX; f.sy = f.wy - camY; }
      const to = tg[f.kind] || { x: vw - 20, y: 12 };
      const k = Math.min(1, f.t / f.dur), e = k * k * (3 - 2 * k);
      const cx = f.sx + (to.x - f.sx) * 0.15, cy = Math.min(f.sy, to.y) - 40;
      const x = Math.round((1 - e) * (1 - e) * f.sx + 2 * (1 - e) * e * cx + e * e * to.x);
      const y = Math.round((1 - e) * (1 - e) * f.sy + 2 * (1 - e) * e * cy + e * e * to.y);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = f.col;
      ctx.fillRect(x - 3, y - 3, 7, 7);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#0a0c14';
      ctx.fillRect(x - 2, y - 2, 5, 5);
      ctx.fillStyle = f.col;
      ctx.fillRect(x - 1, y - 1, 3, 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 1, y - 1, 1, 1);
    }
  }
}
