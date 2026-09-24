// Decoy Agent: an inflatable stand-in that runs around hunting aliens.
//
// It can't grab anything. Instead it flanks its target from the far side so
// the alien bolts away from it (toward the real agent), walks right up to
// hidden aliens to flush them, soaks up tackles and stun bolts meant for
// you, and fires your gear through the same weapon code you use.
import { findPath, collide, lineBlocked } from './nav.js';
import { REGISTRY, targetable } from './weapons.js';

const SPEED = 120;          // as quick as the agent's sprint, so it can get round a runner
const FLUSH_R = 22;         // how close it has to get to spook a hider

function faceFrom(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

export class DecoyAgent {
  // T = WEAPONS.decoy[lv]; gadgets = ids it may fire; lvOf = id -> level
  constructor(x, y, T, gadgets, lvOf) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.r = 5; this.z = 0;
    this.dir = { x: 0, y: 1 };
    this.facing = 'down';
    this.hp = T.hp; this.maxHp = T.hp;
    this.t = T.t; this.life = T.t;
    this.reach = T.reach;               // how far it pulls aliens' attention
    this.gadgets = gadgets;
    this.lvOf = lvOf;
    this.cd = {};
    for (const id of gadgets) this.cd[id] = 0.6 + Math.random() * 0.6;   // brief warm-up
    this.actT = 0;                      // gap between two gadget uses
    this.shieldT = 0; this.shieldLv = 0;
    this.isDecoy = true;
    this.dead = false;
    this.target = null;
    this.retargetT = 0;
    this.path = null; this.pathI = 0; this.repathT = 0;
    this.walkT = 0; this.moving = false;
    this.wob = Math.random() * 6;
  }

  get canAct() { return !this.dead; }
  get state() { return 'normal'; }

  // Soonest-useful alien: loose ones first (nearest), then hiders to flush.
  // A squad spreads out: skip targets another decoy already has if it can.
  pickTarget(game) {
    const taken = new Set(game.decoys.filter(d => d !== this && !d.dead).map(d => d.target));
    let best = null, bestScore = 1e9;
    for (const a of game.aliens) {
      const hunting = targetable(a) && a.state !== 'stunned' && a.state !== 'netted';
      const hidden = a.state === 'hiding';
      if (!hunting && !hidden) continue;
      let score = Math.hypot(a.x - this.x, a.y - this.y);
      if (hidden) score += 400;
      if (taken.has(a)) score += 250;
      if (score < bestScore) { bestScore = score; best = a; }
    }
    return best;
  }

  update(dt, game) {
    this.t -= dt;
    if (this.t <= 0 || this.hp <= 0) { this.dead = true; return; }
    for (const k in this.cd) this.cd[k] = Math.max(0, this.cd[k] - dt);
    this.shieldT = Math.max(0, this.shieldT - dt);
    this.actT = Math.max(0, this.actT - dt);

    this.retargetT -= dt;
    const t = this.target;
    const stale = !t || !(t.free || t.state === 'hiding') || t.controlled || t.state === 'stunned' || t.state === 'netted';
    if (stale || this.retargetT <= 0) {
      this.target = this.pickTarget(game);
      this.retargetT = 0.5;
    }
    const tgt = this.target;

    // ---- where to stand ----
    // Herd, don't chase: swing wide round the alien to its far side from the
    // agent, and only then close in, so it bolts toward you rather than away.
    let gx = this.x, gy = this.y;
    if (tgt) {
      const p = game.player;
      // aim for where it's heading, not where it is, so it can be cut off
      const lx = tgt.x + tgt.vx * 0.45, ly = tgt.y + tgt.vy * 0.45;
      const L = Math.hypot(lx - p.x, ly - p.y) || 1;
      const ux = (lx - p.x) / L, uy = (ly - p.y) / L;         // agent -> alien
      const rx = this.x - tgt.x, ry = this.y - tgt.y;
      const along = rx * ux + ry * uy;                        // > 0: already behind it
      if (along > 12 || L < 40) {
        gx = tgt.x - ux * 6; gy = tgt.y - uy * 6;             // push it your way
      } else {
        // round whichever side it's already on, keeping a berth so it
        // doesn't spook the wrong way on the way past
        const px = -uy, py = ux;
        const side = rx * px + ry * py >= 0 ? 1 : -1;
        const wide = along < -20 ? 50 : 30;
        const f = collide(game.map, lx + ux * 40 + px * side * wide, ly + uy * 40 + py * side * wide, this.r, false);
        gx = f.x; gy = f.y;
      }
      const d = Math.hypot(tgt.x - this.x, tgt.y - this.y);
      if (tgt.state === 'hiding' && d < FLUSH_R && along > 0) {
        tgt.flush(game);
        game.popup(tgt.x, tgt.y - 16, 'FLUSHED!', '#ff9e5e');
      }
    }

    // ---- move there (path round walls) ----
    this.repathT -= dt;
    if (this.repathT <= 0) {
      this.repathT = 0.5;
      this.path = lineBlocked(game.map, this.x, this.y, gx, gy) ? findPath(game.nav, this.x, this.y, gx, gy) : null;
      this.pathI = 0;
    }
    let mx = gx - this.x, my = gy - this.y;
    if (this.path) {
      while (this.pathI < this.path.length - 1 &&
        Math.hypot(this.path[this.pathI].x - this.x, this.path[this.pathI].y - this.y) < 7) this.pathI++;
      const wp = this.path[this.pathI];
      mx = wp.x - this.x; my = wp.y - this.y;
    }
    const ml = Math.hypot(mx, my);
    this.moving = ml > 4;
    const tx = this.moving ? mx / ml * SPEED : 0, ty = this.moving ? my / ml * SPEED : 0;
    const ax = 700 * dt;
    this.vx += Math.max(-ax, Math.min(ax, tx - this.vx));
    this.vy += Math.max(-ax, Math.min(ax, ty - this.vy));
    this.x += this.vx * dt; this.y += this.vy * dt;
    const pos = collide(game.map, this.x, this.y, this.r, true);   // hops fences like the aliens
    this.x = pos.x; this.y = pos.y;
    if (this.moving) {
      this.dir = { x: mx / ml, y: my / ml };
      this.facing = faceFrom(mx, my);
      this.walkT += dt * 9;
    }

    // ---- use the agent's gear on it ----
    if (this.actT > 0) return;
    for (const id of this.gadgets) {
      const w = REGISTRY[id], lv = this.lvOf[id] || 0;
      if (!w || !w.decoyWants || !lv || (this.cd[id] || 0) > 0) continue;
      if (!w.decoyWants(game, this, lv, tgt)) continue;
      let at;
      if (tgt) {
        const dx = tgt.x - this.x, dy = tgt.y - this.y, dl = Math.hypot(dx, dy) || 1;
        this.dir = { x: dx / dl, y: dy / dl };
        this.facing = faceFrom(dx, dy);
        // drop cages / bait where it's about to be, not where it was
        at = { x: tgt.x + tgt.vx * 0.35, y: tgt.y + tgt.vy * 0.35 };
      }
      if (w.fire(game, this, lv, { at })) { this.actT = 0.5; break; }
    }
  }
}
