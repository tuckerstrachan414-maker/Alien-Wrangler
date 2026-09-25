import { collide, overlapsJumpable, findPath, lineBlocked } from './nav.js';
import { ALIEN_STATS } from './data/missions.js';
import { updateSprintVisual } from './input.js';

const GRAV = 430;

function faceFrom(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/* ================================ PLAYER ================================ */

export class Player {
  constructor(x, y, fx) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.r = 5;
    this.z = 0; this.zv = 0;
    this.facing = 'down';
    this.dir = { x: 0, y: 1 };
    this.state = 'normal';      // normal | dashing | diving | prone | stunned
    this.stateT = 0;
    this.fx = fx;               // gear effects
    this.stamina = fx.staminaMax;
    this.staminaDelay = 0;
    this.carried = [];
    this.dashCd = 0;
    this.grabCd = 0;
    this.cd = {};               // weapon id -> reload seconds left
    this.shieldT = 0;           // Riot Shield bubble time left
    this.shieldLv = 0;
    this.isDecoy = false;
    this.walkT = 0;
    this.moving = false;
    this.diveHit = false;
    this.alpha = 1;             // story cutscenes fade the agent into the trees
  }

  get airborne() { return this.z > 6; }
  get baseSpeed() { return 80 * this.fx.speedMul; }
  get sprintSpeed() { return 124 * this.fx.speedMul; }
  get carryPenalty() { return Math.max(0.62, 1 - this.carried.length * 0.12); }
  get canAct() { return this.state === 'normal' || this.state === 'dashing'; }

  spendStamina(cost) {
    if (this.stamina < cost) return false;
    this.stamina -= cost;
    this.staminaDelay = 0.7;
    return true;
  }

  tryJump() {
    if (!this.canAct || this.airborne || this.z > 0) return false;
    this.zv = 138;
    this.z = 0.1;
    return true;
  }

  // Point the agent along a given direction (dive aim assist). Without one
  // the move keeps using the way you're already running / facing.
  aim(dir) {
    if (!dir) return;
    const len = Math.hypot(dir.x, dir.y);
    if (len < 0.001) return;
    this.dir.x = dir.x / len;
    this.dir.y = dir.y / len;
    this.facing = faceFrom(this.dir.x, this.dir.y);
  }

  tryDash(dir) {
    if (!this.canAct || this.dashCd > 0) return false;
    if (this.stamina < 18) return false;
    this.aim(dir);
    this.spendStamina(18);
    this.state = 'dashing';
    this.stateT = 0.16;
    this.dashCd = 1.1;
    const d = this.dir;
    this.vx = d.x * 300; this.vy = d.y * 300;
    return true;
  }

  tryDive(dir) {
    if (!this.canAct || this.airborne) return false;
    if (this.stamina < 22) return false;
    this.aim(dir);
    this.spendStamina(22);
    this.state = 'diving';
    this.stateT = 0.32;
    this.diveHit = false;
    const d = this.dir;
    this.vx = d.x * 290; this.vy = d.y * 290;
    return true;
  }

  // Grapple Hook wall shot: fly to (x, y), clearing fences and bales.
  zipTo(x, y) {
    if (!this.canAct) return false;
    const dx = x - this.x, dy = y - this.y, d = Math.hypot(dx, dy);
    if (d < 14) return false;
    this.aim({ x: dx, y: dy });
    this.state = 'zipping';
    this.stateT = d / 320;
    this.vx = dx / d * 320; this.vy = dy / d * 320;
    return true;
  }

  stun(dur, knockX = 0, knockY = 0) {
    this.state = 'stunned';
    this.stateT = dur * this.fx.stunMul;
    this.vx = knockX; this.vy = knockY;
    const dropped = this.carried.slice();
    this.carried.length = 0;
    return dropped; // game scatters them
  }

  grabPoint() {
    const reach = 12;
    return { x: this.x + this.dir.x * reach, y: this.y + this.dir.y * reach, r: 15 * this.fx.grabMul };
  }

  update(dt, map, moveIn) {
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.grabCd = Math.max(0, this.grabCd - dt);
    for (const k in this.cd) this.cd[k] = Math.max(0, this.cd[k] - dt);
    this.shieldT = Math.max(0, this.shieldT - dt);
    this.stateT -= dt;

    // vertical (jump)
    if (this.z > 0 || this.zv !== 0) {
      this.z += this.zv * dt;
      this.zv -= GRAV * dt;
      if (this.z <= 0) { this.z = 0; this.zv = 0; }
    }

    if (this.state === 'stunned' || this.state === 'prone') {
      this.vx *= Math.pow(0.002, dt); this.vy *= Math.pow(0.002, dt);
      this.x += this.vx * dt; this.y += this.vy * dt;
      const p = collide(map, this.x, this.y, this.r, false);
      this.x = p.x; this.y = p.y;
      if (this.stateT <= 0) this.state = 'normal';
      this.moving = false;
      this.regen(dt);
      return;
    }

    if (this.state === 'diving') {
      this.x += this.vx * dt; this.y += this.vy * dt;
      const p = collide(map, this.x, this.y, this.r, true); // dives clear low stuff
      this.x = p.x; this.y = p.y;
      if (this.stateT <= 0) {
        if (this.diveHit) {
          this.state = 'normal';
        } else {
          this.state = 'prone';
          this.stateT = 1.05 * this.fx.recoveryMul;
        }
        this.vx = 0; this.vy = 0;
      }
      return;
    }

    if (this.state === 'dashing' || this.state === 'zipping') {
      this.x += this.vx * dt; this.y += this.vy * dt;
      const p = collide(map, this.x, this.y, this.r, this.airborne || this.state === 'zipping');
      this.x = p.x; this.y = p.y;
      if (this.stateT <= 0) { this.state = 'normal'; }
      return;
    }

    // normal locomotion
    const mx = moveIn.move.x, my = moveIn.move.y;
    const mag = Math.min(1, moveIn.mag);
    this.moving = mag > 0.12;
    let sprinting = moveIn.sprint && this.stamina > 1 && this.moving;
    if (sprinting) {
      this.stamina = Math.max(0, this.stamina - 20 * dt);
      this.staminaDelay = 0.5;
    }
    // stamina ran dry while trying to sprint: kill the toggle so it doesn't
    // silently resume the instant stamina regens — re-press required
    if (moveIn.sprintToggle && this.moving && this.stamina <= 1) {
      moveIn.sprintToggle = false;
      updateSprintVisual();
    }
    // same for no-buttons edge-sprint: stop until the thumb eases back inside
    // the sprint ring and pushes out again (otherwise it would stutter along
    // on every sliver of regen)
    if (moveIn.sprintEdge && !moveIn.edgeSpent && this.moving && this.stamina <= 1) {
      moveIn.edgeSpent = true;
      updateSprintVisual();
    }
    // Two speeds only, walk or sprint — how far the stick/thumb is pushed
    // doesn't creep the speed up or down, it only picks a direction.
    const top = (sprinting ? this.sprintSpeed : this.baseSpeed) * this.carryPenalty * (this.moving ? 1 : 0);
    const ax = 900;
    const tx = this.moving ? mx / Math.max(0.001, Math.hypot(mx, my)) * top : 0;
    const ty = this.moving ? my / Math.max(0.001, Math.hypot(mx, my)) * top : 0;
    this.vx += Math.max(-ax * dt, Math.min(ax * dt, tx - this.vx));
    this.vy += Math.max(-ax * dt, Math.min(ax * dt, ty - this.vy));

    if (this.moving) {
      this.dir.x = mx / Math.max(0.001, Math.hypot(mx, my));
      this.dir.y = my / Math.max(0.001, Math.hypot(mx, my));
      this.facing = faceFrom(this.dir.x, this.dir.y);
      this.walkT += dt * (sprinting ? 11 : 7);
    }
    this.sprinting = sprinting;

    this.x += this.vx * dt; this.y += this.vy * dt;
    const p = collide(map, this.x, this.y, this.r, this.airborne);
    this.x = p.x; this.y = p.y;

    this.regen(dt);
  }

  regen(dt) {
    this.staminaDelay -= dt;
    if (this.staminaDelay <= 0 && this.stamina < this.fx.staminaMax) {
      this.stamina = Math.min(this.fx.staminaMax, this.stamina + 17 * dt);
    }
  }
}

/* ================================ ALIEN ================================ */

let ALIEN_ID = 1;
const FREE_STATES = ['hiding', 'running', 'attack', 'netted', 'stunned', 'lured', 'reeled', 'hypno'];

export class Alien {
  constructor(tier, spot) {
    this.id = ALIEN_ID++;
    this.tier = tier;
    this.stats = ALIEN_STATS[tier];
    this.x = spot.x; this.y = spot.y;
    this.vx = 0; this.vy = 0;
    this.r = 4;
    this.z = 0; this.zv = 0;
    // hiding | running | attack | netted | stunned | lured | reeled | hypno |
    // carried | airlift | deposited | beaming | escaped |
    // scripted | fled (story cutscenes)
    this.state = 'hiding';
    this.script = null;          // scripted: { path, i, speed, wait, face }
    this.stateT = 0;
    this.hideSpot = spot;
    this.facing = 'down';
    this.chase = 0;              // pressure meter -> attack
    this.repathT = 0;
    this.path = null;
    this.pathI = 0;
    this.targetSpot = null;
    this.dashCd = 0;
    this.attackT = 0;
    this.boltCd = 0;
    this.cloakT = Math.random() * 3;
    this.cloaked = false;
    this.helmet = this.stats.armored;
    this.walkT = 0;
    this.settleT = 0;
    this.riseZ = 0;              // beam lift height
    this.rustleT = 1 + Math.random() * 3;
    this.wanderT = 0;
    this.alpha = 1;              // story cutscenes fade it out into the trees
    this.revealT = 0;            // Noise Maker ping: marked + can't cloak while > 0
    this.look = 'stars';         // how a stun is drawn: stars | zzz | ice | zap
    this.drowsyT = 0;            // Tranq Dart: slowed, then falls asleep
    this.sleepFor = 0;
    this.snoreR = 0;
    this.bait = null;            // Bait Burger it's heading for / eating
    this.eatT = 0;
    this.cage = null;            // Trap Cage holding it (state 'netted')
    this.reelTo = null;          // Grapple Hook: who is reeling it in
    this.reelT = 0;
    this.hypnoT = 0;             // Hypno Ray trance
    this.hypnoWalk = false;
    this.hypnoIdx = 0;
    this.hypnoLead = null;
    this.spath = null;           // seek() path cache
    this.spathI = 0;
    this.seekT = 0;
    this.cornerCd = 0;           // pincer (agent + decoy) grace period
  }

  get free() { return FREE_STATES.includes(this.state); }
  // under the agent's control already (hypnotized / being reeled in): not
  // something to grab, stun or beam up
  get controlled() { return this.state === 'hypno' || this.state === 'reeled'; }
  get grabbable() {
    return (this.free && !this.controlled) || (this.state === 'beaming' && this.riseZ < 26);
  }

  flush(game) {
    if (this.state !== 'hiding') return;
    this.state = 'running';
    this.chase = 0;
    this.repathT = 0;
    game.onAlienFlushed(this);
  }

  stunned(dur, look = 'stars') {
    this.state = 'stunned';
    this.stateT = dur;
    this.look = look;
    this.vx = 0; this.vy = 0;
  }

  // Tranq Dart: the drowsy spell ran out, so it drops where it stands.
  fallAsleep(game) {
    this.drowsyT = 0;
    if (!this.free || this.controlled) return;
    if (this.state === 'netted') this.stateT = Math.max(this.stateT, this.sleepFor);
    else this.stunned(this.sleepFor, 'zzz');
    game.popup(this.x, this.y - 16, 'ZZZ...', '#c9a8ff');
    if (this.snoreR) {
      game.snoreCloud(this, this.snoreR, this.sleepFor * 0.75);
      this.snoreR = 0;
    }
  }

  // Bait Burger: sneak over to it (out of hiding if need be).
  lure(bait) {
    this.state = 'lured';
    this.bait = bait;
    this.eatT = 0;
    this.seekT = 0;
    this.chase = 0;
  }

  // Walk to (tx, ty), pathing around walls when there's no straight line.
  seek(game, tx, ty, top, accel, dt) {
    this.seekT -= dt;
    if (this.seekT <= 0) {
      this.seekT = 0.6;
      this.spath = lineBlocked(game.map, this.x, this.y, tx, ty)
        ? findPath(game.nav, this.x, this.y, tx, ty) : null;
      this.spathI = 0;
    }
    let dx = tx - this.x, dy = ty - this.y;
    if (this.spath) {
      while (this.spathI < this.spath.length - 1 &&
        Math.hypot(this.spath[this.spathI].x - this.x, this.spath[this.spathI].y - this.y) < 7) this.spathI++;
      const wp = this.spath[this.spathI];
      dx = wp.x - this.x; dy = wp.y - this.y;
    }
    this.accelToward(dx, dy, top, accel, dt);
  }

  update(dt, game) {
    const p = game.player;
    const map = game.map;
    const st = this.stats;
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.boltCd = Math.max(0, this.boltCd - dt);
    this.revealT = Math.max(0, this.revealT - dt);
    if (this.drowsyT > 0) {
      this.drowsyT -= dt;
      if (this.drowsyT <= 0) this.fallAsleep(game);
    }
    const slow = this.drowsyT > 0 ? 0.5 : 1;
    this.cornerCd = Math.max(0, this.cornerCd - dt);

    // hop physics
    if (this.z > 0 || this.zv !== 0) {
      this.z += this.zv * dt; this.zv -= GRAV * dt;
      if (this.z <= 0) { this.z = 0; this.zv = 0; }
    }

    const distP = Math.hypot(p.x - this.x, p.y - this.y);
    // what it's running from / fighting: the agent, or a Decoy Agent nearer to it
    const th = game.threatFor(this);
    const distT = th === p ? distP : Math.hypot(th.x - this.x, th.y - this.y);

    // Elite cloaking while loose (a Noise Maker bang scrambles it for a while)
    if (st.cloak && this.revealT <= 0 && (this.state === 'running' || this.state === 'attack')) {
      this.cloakT -= dt;
      if (this.cloakT <= 0) {
        this.cloaked = !this.cloaked;
        this.cloakT = this.cloaked ? 1.6 : 2.2;
      }
    } else this.cloaked = false;

    switch (this.state) {
      case 'hiding': {
        this.rustleT -= dt;
        if (this.rustleT <= 0) { this.rustleT = 2.5 + Math.random() * 3; game.rustle(this); }
        const seen = distP < st.detectR && !lineBlocked(map, this.x, this.y, p.x, p.y);
        const stepped = distP < 24;
        if (seen || stepped || game.beamPhase) this.flush(game);
        break;
      }

      case 'stunned': {
        this.stateT -= dt;
        if (this.stateT <= 0) { this.state = 'running'; this.chase = 0; this.look = 'stars'; }
        break;
      }

      case 'netted': {
        this.stateT -= dt;
        if (this.stateT <= 0) { this.state = 'running'; this.chase = -2; this.cage = null; }
        break;
      }

      case 'lured': {
        const b = this.bait;
        if (!b || b.dead) {
          this.bait = null; this.state = 'running'; this.chase = 0; this.repathT = 0;
          break;
        }
        const db = Math.hypot(b.x - this.x, b.y - this.y);
        if (db < 9) {
          // chewing: too busy to notice the agent at all
          this.eatT += dt;
          this.vx *= 0.8; this.vy *= 0.8;
          this.facing = faceFrom(b.x - this.x, b.y - this.y + 0.01);
          if (Math.random() < dt * 5) game.crumbs(this);
        } else {
          // still sneaking over: a close agent spooks it
          if (distP < 30) {
            this.bait = null; this.state = 'running'; this.chase = 0; this.repathT = 0;
            break;
          }
          this.seek(game, b.x, b.y, st.run * slow, st.accel, dt);
        }
        break;
      }

      case 'reeled': {
        const o = this.reelTo || p;
        const dx = o.x - this.x, dy = o.y - this.y;
        const d = Math.hypot(dx, dy) || 1;
        this.reelT -= dt;
        if (d < 12 || this.reelT <= 0) { game.onReelArrive(this); break; }
        this.vx = dx / d * 290; this.vy = dy / d * 290;
        break;
      }

      case 'hypno': {
        this.hypnoT -= dt;
        if (this.hypnoT <= 0) {
          this.state = 'running'; this.chase = -2; this.repathT = 0;
          game.popup(this.x, this.y - 16, 'SNAPPED OUT', '#ff9e5e');
          break;
        }
        if (this.hypnoWalk) {
          this.seek(game, game.vanDoor.x, game.vanDoor.y, 78, 500, dt);
        } else {
          // conga line: follow the agent, or whoever is in front of it
          const lead = this.hypnoLead || p;
          const d = Math.hypot(lead.x - this.x, lead.y - this.y);
          if (d > 14) this.seek(game, lead.x, lead.y, d > 40 ? 175 : 120, 700, dt);
          else { this.vx *= 0.8; this.vy *= 0.8; }
        }
        break;
      }

      case 'running': {
        // Pincer: caught between the agent and a Decoy Agent on the far side,
        // it panics and cowers for a moment. Grab it!
        if (this.cornerCd <= 0 && distP < 72 && game.cornered(this)) {
          this.cornerCd = 4;
          this.stunned(1.4);
          game.popup(this.x, this.y - 16, 'CORNERED!', '#ffb07a');
          break;
        }
        // pressure builds while the agent (or a decoy) is close
        if (distT < 95) this.chase += dt;
        else this.chase = Math.max(-3, this.chase - dt * 0.7);

        // find a hiding spot: far from player, reachable
        this.repathT -= dt;
        if (this.repathT <= 0) {
          this.repathT = 1.2 + Math.random() * 0.6;
          this.pickHideTarget(game, th);
        }

        let tx = 0, ty = 0;
        if (this.targetSpot && this.path && this.pathI < this.path.length) {
          const wp = this.path[this.pathI];
          const d = Math.hypot(wp.x - this.x, wp.y - this.y);
          if (d < 7) this.pathI++;
          if (this.pathI < this.path.length) {
            const w2 = this.path[this.pathI];
            tx = w2.x - this.x; ty = w2.y - this.y;
          }
          // arrived at the spot?
          const ds = Math.hypot(this.targetSpot.x - this.x, this.targetSpot.y - this.y);
          if (ds < 8 && distT > 105) {
            this.settleT += dt;
            if (this.settleT > 0.4) {
              this.state = 'hiding';
              this.hideSpot = this.targetSpot;
              this.targetSpot = null; this.path = null;
              this.chase = 0; this.settleT = 0;
              break;
            }
          } else this.settleT = 0;
        } else {
          // no plan: flee vector with obstacle steering
          const away = this.steerAway(game, th, distT);
          tx = away.x; ty = away.y;
        }

        // burst dash away when the agent gets close
        if (st.dashPower && this.dashCd <= 0 && distT < 46) {
          const len = distT || 1;
          this.vx = (this.x - th.x) / len * st.dashPower;
          this.vy = (this.y - th.y) / len * st.dashPower;
          this.dashCd = 2.2;
          this.zv = 90; this.z = 0.1;
          game.puff(this.x, this.y, '#cfe6ff');
        }

        this.accelToward(tx, ty, (distT < 130 ? st.sprint : st.run) * slow, st.accel, dt);

        // out of options -> attack
        if (this.chase > st.chaseToAttack) {
          this.state = 'attack';
          this.attackT = 3.2;
          game.onAlienAttack(this);
        }
        break;
      }

      case 'attack': {
        // goes for the agent, or a Decoy Agent that got in its face
        this.attackT -= dt;
        const len = distT || 1;
        this.facing = faceFrom(th.x - this.x, th.y - this.y);
        if (st.attackType === 'bolt') {
          // keep distance and shoot
          const want = 80;
          const dir = distT < want ? -1 : 0.4;
          this.accelToward((th.x - this.x) * dir, (th.y - this.y) * dir, st.run * slow, st.accel, dt);
          if (this.boltCd <= 0 && !lineBlocked(map, this.x, this.y, th.x, th.y)) {
            this.boltCd = 1.7;
            game.spawnBolt(this, (th.x - this.x) / len, (th.y - this.y) / len);
          }
        } else {
          // tackle charge
          this.accelToward(th.x - this.x, th.y - this.y, st.sprint * 1.25 * slow, st.accel * 1.5, dt);
          if (th.isDecoy) {
            if (distT < 11) { game.hitDecoy(th, this); this.attackT = 0; }
          } else if (distP < 11 && p.state !== 'stunned' && !p.airborne) {
            game.playerHit(this, 0.85, (p.x - this.x) / len * 140, (p.y - this.y) / len * 140);
            this.attackT = 0;
          }
          if (this.state !== 'attack') break;   // bounced off a shield
        }
        if (this.attackT <= 0) {
          this.state = 'running';
          this.chase = -4; // grace period before it can attack again
          this.repathT = 0;
        }
        break;
      }

      case 'beaming': {
        // locked in the beam, rising
        this.vx = 0; this.vy = 0;
        break;
      }

      case 'scripted': {
        // a story cutscene is running it along a set route (Stage 1's
        // stampede down the road): no collision, hops anything low, and
        // it's gone ('fled') once it runs off the end of the route
        const s = this.script;
        if (s.wait > 0) {
          s.wait -= dt;
          this.vx *= 0.8; this.vy *= 0.8;
          if (s.face) this.facing = faceFrom(s.face.x - this.x, s.face.y - this.y);
          break;
        }
        while (s.i < s.path.length && Math.hypot(s.path[s.i].x - this.x, s.path[s.i].y - this.y) < 8) s.i++;
        const wp = s.path[s.i];
        if (!wp) { this.state = 'fled'; this.vx = 0; this.vy = 0; break; }
        this.accelToward(wp.x - this.x, wp.y - this.y, s.speed, 900, dt);
        this.x += this.vx * dt; this.y += this.vy * dt;
        if (this.z === 0 && overlapsJumpable(map, this.x, this.y, this.r + 2)) { this.zv = 95; this.z = 0.1; }
        this.facing = faceFrom(this.vx, this.vy);
        this.walkT += dt * 12;
        break;
      }
    }

    // integrate + collide (aliens pass jumpable solids, hopping over them)
    if (this.free) {
      this.x += this.vx * dt; this.y += this.vy * dt;
      const pos = collide(map, this.x, this.y, this.r, true);
      this.x = pos.x; this.y = pos.y;
      if (overlapsJumpable(map, this.x, this.y, this.r + 2) && this.z === 0 && Math.hypot(this.vx, this.vy) > 20) {
        this.zv = 95; this.z = 0.1;
      }
      if (Math.hypot(this.vx, this.vy) > 8) {
        this.facing = faceFrom(this.vx, this.vy);
        this.walkT += dt * 10;
      }
    }
  }

  accelToward(dx, dy, top, accel, dt) {
    const len = Math.hypot(dx, dy);
    if (len < 0.001) { this.vx *= 0.9; this.vy *= 0.9; return; }
    const tx = dx / len * top, ty = dy / len * top;
    this.vx += Math.max(-accel * dt, Math.min(accel * dt, tx - this.vx));
    this.vy += Math.max(-accel * dt, Math.min(accel * dt, ty - this.vy));
  }

  // p = whatever it's fleeing (the agent or a decoy), distP = how far that is
  steerAway(game, p, distP) {
    const map = game.map;
    // sample 8 directions, prefer away from the agent and unblocked
    let best = null, bestScore = -1e9;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const dx = Math.cos(a), dy = Math.sin(a);
      const px = this.x + dx * 34, py = this.y + dy * 34;
      if (px < 8 || py < 8 || px > map.w - 8 || py > map.h - 8) continue;
      const c = collide(map, px, py, this.r, true);
      const moved = Math.hypot(c.x - px, c.y - py);
      const awayDot = (dx * (this.x - p.x) + dy * (this.y - p.y)) / Math.max(1, distP);
      const inertia = (dx * this.vx + dy * this.vy) / Math.max(20, Math.hypot(this.vx, this.vy));
      const score = awayDot * 2 + inertia * 0.6 - moved * 0.4 + Math.random() * 0.3;
      if (score > bestScore) { bestScore = score; best = { x: dx, y: dy }; }
    }
    return best || { x: this.x - p.x, y: this.y - p.y };
  }

  pickHideTarget(game, p = game.player) {
    let best = null, bestScore = -1e9;
    for (const s of game.hideSpots) {
      if (game.spotOccupied(s, this)) continue;
      const dP = Math.hypot(s.x - p.x, s.y - p.y);
      if (dP < 120) continue;
      const dA = Math.hypot(s.x - this.x, s.y - this.y);
      if (dA > this.stats.hideSeekR * 2.6) continue;
      const score = dP * 1.1 - dA * 1.0 + Math.random() * 40;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    if (best) {
      const path = findPath(game.nav, this.x, this.y, best.x, best.y);
      if (path) {
        this.targetSpot = best;
        this.path = path;
        this.pathI = 0;
        return;
      }
    }
    this.targetSpot = null;
    this.path = null;
  }
}
