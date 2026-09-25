import { TILE } from './data/sprites.js';
import { MAP_BUILDERS } from './data/maps.js';
import { gearEffects, ALIEN_STATS, abandonFee, WEAPONS, GADGETS } from './data/missions.js';
import { buildNav, collide } from './nav.js';
import { Player, Alien } from './entities.js';
import { input, consumePress, setButtonCooling, getControlMode } from './input.js';
import { sfx } from './audio.js';
import { save } from './save.js';
import { resolveLoadout } from './loadout.js';
import {
  REGISTRY, fireWeapon, weaponCooling, updateWeapons, updateProjectile, projectileWall,
  renderGround, renderTop, drawCage, snoreCloud,
} from './weapons.js';
import { DecoyAgent } from './decoy.js';
import { blendGround } from './terrain.js';

const DEPOSIT_R = 30;
const ACTIONS = ['jump', 'dash', 'dive', 'grab', 'gadget1', 'gadget2'];

// Dive aim assist (no-buttons mode): the dive goes the way you're running,
// bent onto an alien inside this reach and cone of that direction.
const DIVE_REACH = 104;
const DIVE_CONE = Math.cos(30 * Math.PI / 180);

// Field Drones Mk.II paints each tier its own arrow colour.
const TIER_COLORS = { grunt: '#7be06a', scout: '#6ec2ff', trooper: '#d7dfea', elite: '#c78bff' };

export class Game {
  constructor(assets) {
    this.assets = assets;   // { tiles, actors:{player,aliens}, van, ufo }
    this.onEnd = null;      // set by ui
    this.running = false;
  }

  startMission(mission) {
    this.mission = mission;
    // Sandbox runs carry their own loadout; contracts use what you own.
    this.fx = gearEffects(mission.gear || save.gear);
    // only two gadgets ride along: [slot 1 = tap / button 1, slot 2 = swipe right / button 2]
    this.loadout = resolveLoadout(mission.gear || save.gear);
    this.map = MAP_BUILDERS[mission.map](this.assets);
    this.nav = buildNav(this.map);
    this.hideSpots = this.map.hideSpots;

    // pre-render ground
    this.groundCv = document.createElement('canvas');
    this.groundCv.width = this.map.w; this.groundCv.height = this.map.h;
    const g = this.groundCv.getContext('2d');
    g.imageSmoothingEnabled = false;
    for (let ty = 0; ty < this.map.th; ty++)
      for (let tx = 0; tx < this.map.tw; tx++)
        g.drawImage(this.assets.tiles[this.map.ground[ty * this.map.tw + tx]], tx * TILE, ty * TILE);
    if (this.map.blend) blendGround(g, this.map, this.assets.tiles);
    if (this.map.paintGround) this.map.paintGround(g, this.assets.tiles);

    this.player = new Player(this.map.spawn.x, this.map.spawn.y, this.fx);
    this.aliens = [];
    this.spawnAliens(mission.aliens);

    this.timer = mission.time;
    this.phase = 'play';        // play | beam | return | done
    this.beamPhase = false;
    this.ufo = null;
    this.captured = 0;
    this.escaped = 0;
    this.totalAliens = this.aliens.length;
    this.earned = 0;
    this.forceFail = false;

    this.projectiles = [];
    this.particles = [];
    this.popups = [];
    this.cam = { x: this.player.x, y: this.player.y };
    this.shake = 0;
    this.msg = null; this.msgT = 0;
    this.flash = 0;             // Noise Maker white-out (seconds left)
    this.fullNagT = -9;         // last auto-grab "HANDS FULL" popup
    this.shockwaves = [];       // Noise Maker blast rings
    this.decoys = [];           // Decoy Agents out hunting
    this.deployables = [];      // bait, cages, courier drones, evac beams
    this.zaps = [];             // stun-gun arcs + hypno beams (drawn briefly)
    this.hypnoSeq = 0;          // conga-line order for hypnotized aliens
    this.evacNagT = -9;
    this.running = true;
    this.time = 0;
    // screen-space margins (buffer px) kept clear for edge arrows; main.js
    // measures the HUD strip + safe areas and fills this in
    if (!this.insets) this.insets = { top: 10, right: 10, bottom: 10, left: 10 };

    // stealth (neighbourhood) + ambient state
    this.stealth = !!this.map.stealth;
    this.suspicion = 0;
    this.fines = 0;
    this.rings = [];
    this.homes = this.map.homes || [];
    for (const h of this.homes) h.alertT = 0;
    this.volcanoT = 0;
    this.smokeT = 0;

    // Story scenes hand the mission to a director (tutorial.js) that can
    // take the controls for a cutscene. main.js attaches it after this.
    this.director = null;
    this.camTarget = null;      // {x,y}: camera follows this instead of the agent
    this.camEase = 0.001;       // fraction of the gap left after 1s (smaller = snappier)

    this.vanDoor = { x: this.map.van.x + 50, y: this.map.van.y + 15 };
    this.announce(mission.announce || mission.name.toUpperCase(), 2.2);
  }

  // Tell the director (if any) that something happened.
  emit(evt, data) {
    if (this.director) this.director.on(evt, data);
  }

  spawnAliens(counts) {
    const spawn = this.map.spawn;
    const spots = this.hideSpots
      .filter(s => Math.hypot(s.x - spawn.x, s.y - spawn.y) > 140)
      .sort(() => Math.random() - 0.5);
    let i = 0;
    for (const [tier, n] of Object.entries(counts)) {
      for (let k = 0; k < n; k++) {
        const spot = spots[i % spots.length] || this.hideSpots[0];
        i++;
        this.aliens.push(new Alien(tier, spot));
      }
    }
  }

  spotOccupied(spot, self) {
    for (const a of this.aliens) {
      if (a === self) continue;
      if ((a.state === 'hiding' && a.hideSpot === spot) || (a.targetSpot === spot)) return true;
    }
    return false;
  }

  /* ---------------- events from entities ---------------- */

  onAlienFlushed(a) {
    sfx.squeak();
    this.popup(a.x, a.y - 16, '!', '#ffd75e');
    this.emit('flush', a);
  }

  onAlienAttack(a) {
    sfx.alert();
    this.popup(a.x, a.y - 16, '!!', '#ff5e6c');
    this.emit('attack', a);
  }

  rustle(a) {
    const spot = a.hideSpot;
    // particles draw over everything, so a rustle under a solid roof would
    // give the hider away through the tiles: indoors it only shows once the
    // roof is off (or it's glass)
    if (spot && spot.bld && spot.bld.alpha > 0.6 && !spot.bld.glass) return;
    for (let i = 0; i < 3; i++) {
      this.particles.push({
        x: a.x + (Math.random() - 0.5) * 10, y: a.y - 4 - Math.random() * 6,
        vx: (Math.random() - 0.5) * 14, vy: -8 - Math.random() * 10,
        life: 0.7, t: 0.7, color: (spot && spot.rustle) || '#54a34a', size: 1,
      });
    }
  }

  puff(x, y, color = '#c8c8d0') {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        x, y: y - 2, vx: Math.cos(a) * 26, vy: Math.sin(a) * 16 - 6,
        life: 0.4, t: 0.4, color, size: 1,
      });
    }
  }

  spawnBolt(a, dx, dy) {
    sfx.bolt();
    this.projectiles.push({ type: 'bolt', x: a.x, y: a.y - 6, vx: dx * 155, vy: dy * 155, life: 1.5 });
  }

  playerHit(source, dur, kx, ky) {
    const p = this.player;
    if (p.shieldT > 0) {
      // Riot Shield: the hit never lands; a tackler bounces off seeing stars
      // (long enough to grab it)
      sfx.block();
      this.popup(p.x, p.y - 20, 'BLOCKED', '#7fe3ff');
      if (source) {
        source.stunned(2);
        this.popup(source.x, source.y - 16, 'BOUNCED!', '#7fe3ff');
      }
      return;
    }
    // getting stunned snaps anyone following you out of their trance
    for (const a of this.aliens) {
      if (a.state !== 'hypno' || a.hypnoWalk) continue;
      a.state = 'running'; a.chase = -2; a.repathT = 0;
      this.popup(a.x, a.y - 16, 'TRANCE BROKEN', '#ff9e5e');
    }
    const dropped = this.player.stun(dur, kx, ky);
    sfx.stun();
    this.shake = 5;
    if (this.stealth) this.noisePulse(this.player.x, this.player.y, 24);
    this.popup(this.player.x, this.player.y - 20, 'STUNNED', '#ff5e6c');
    for (const al of dropped) {
      al.state = 'running';
      al.chase = -2;
      al.x = this.player.x + (Math.random() - 0.5) * 24;
      al.y = this.player.y + (Math.random() - 0.5) * 24;
      this.popup(al.x, al.y - 14, 'BROKE FREE', '#ff9e5e');
    }
    this.emit('hit', { dropped: dropped.length });
  }

  popup(x, y, text, color) {
    this.popups.push({ x, y, text, color, t: 1.1, life: 1.1 });
  }

  announce(text, dur = 1.6) {
    this.msg = text; this.msgT = dur;
  }

  /* ---------------- capture logic ---------------- */

  tryCapture(a, viaDive = false) {
    if (!a.grabbable) return false;
    if (a.helmet && a.state !== 'netted') {
      a.helmet = false;
      a.stunned(0.85);
      sfx.thud();
      this.shake = 3;
      this.puff(a.x, a.y, '#9aa7b5');
      this.popup(a.x, a.y - 16, 'ARMOR OFF!', '#9fc7e8');
      return true; // counts as a hit (dive won't knock you prone)
    }
    if (this.player.carried.length >= this.fx.carryMax) {
      this.popup(this.player.x, this.player.y - 20, 'HANDS FULL', '#ff9e5e');
      return false;
    }
    a.state = 'carried';
    a.cloaked = false;
    this.player.carried.push(a);
    sfx.grab();
    this.puff(a.x, a.y, '#59d98c');
    this.popup(a.x, a.y - 16, 'GOT ONE!', '#59d98c');
    if (this.ufo && this.ufo.target === a) this.ufo.state = 'pick';
    this.emit('grab', a);
    return true;
  }

  grabAttempt() {
    const p = this.player;
    if (p.grabCd > 0 || !p.canAct) return;
    p.grabCd = 0.35;
    const gp = p.grabPoint();
    let hit = false;
    for (const a of this.aliens) {
      if (!a.grabbable) continue;
      if (Math.hypot(a.x - gp.x, a.y - gp.y) < gp.r + a.r && a.z < 14) {
        if (this.tryCapture(a)) { hit = true; break; }
      }
    }
    if (!hit) this.puff(gp.x, gp.y, '#8fa0c4');
  }

  // Fire the gadget in loadout slot 0 / 1. An empty slot 1 falls back to a
  // plain grab so a no-buttons tap is never dead.
  useGadget(slot) {
    const id = this.loadout[slot];
    if (id) fireWeapon(this, this.player, id, this.fx.lv[id]);
    else if (slot === 0) this.grabAttempt();
  }

  gadgetCooling(slot) {
    const id = this.loadout[slot];
    return !!id && weaponCooling(this, this.player, id, this.fx.lv[id]);
  }

  /* ---------------- weapon hooks ---------------- */

  // Who an alien is running from / going for: the agent, or a Decoy Agent
  // that's nearer and close enough to have its attention.
  threatFor(a) {
    const p = this.player;
    let best = p, bd = Math.hypot(p.x - a.x, p.y - a.y);
    for (const d of this.decoys) {
      if (d.dead) continue;
      const dd = Math.hypot(d.x - a.x, d.y - a.y);
      if (dd < d.reach && dd < bd) { best = d; bd = dd; }
    }
    return best;
  }

  // Is alien `a` pinned between the agent and a decoy on its far side?
  cornered(a) {
    const p = this.player;
    const px = p.x - a.x, py = p.y - a.y, pl = Math.hypot(px, py) || 1;
    for (const d of this.decoys) {
      if (d.dead) continue;
      const dx = d.x - a.x, dy = d.y - a.y, dl = Math.hypot(dx, dy);
      if (dl > 72) continue;
      if ((px * dx + py * dy) / (pl * (dl || 1)) < -0.25) return d;
    }
    return null;
  }

  spawnDecoys(lv) {
    const T = WEAPONS.decoy[lv];
    for (const d of this.decoys) this.popDecoy(d, false);
    this.decoys = [];
    // Mk.I brings the other gadget in your loadout; Mk.II+ everything you own
    const ids = T.allOwned
      ? GADGETS.map(g => g.id).filter(id => this.fx.lv[id] > 0)
      : this.loadout.slice();
    const usable = ids.filter(id => REGISTRY[id] && REGISTRY[id].decoyWants);
    const p = this.player;
    // side by side, across your facing
    const sx = -p.dir.y, sy = p.dir.x;
    for (let i = 0; i < T.count; i++) {
      const off = T.count > 1 ? (i ? 14 : -14) : 0;
      const pos = collide(this.map, p.x + p.dir.x * 10 + sx * off, p.y + p.dir.y * 10 + sy * off, 5, false);
      const d = new DecoyAgent(pos.x, pos.y, T, usable, this.fx.lv);
      d.dir = { x: p.dir.x, y: p.dir.y };
      this.decoys.push(d);
      this.puff(pos.x, pos.y, '#ffb07a');
    }
    this.popup(p.x, p.y - 24, T.count > 1 ? 'DECOY SQUAD!' : 'DECOY OUT!', '#ffb07a');
  }

  hitDecoy(d, src) {
    if (d.dead) return;
    if (d.shieldT > 0) {
      sfx.block();
      if (src) { src.stunned(1.2); this.popup(src.x, src.y - 16, 'BOUNCED!', '#7fe3ff'); }
      return;
    }
    d.hp--;
    sfx.thud();
    this.puff(d.x, d.y - 4, '#ffb07a');
    if (d.hp <= 0) this.popDecoy(d, true);
    else this.popup(d.x, d.y - 20, `${d.hp} HP`, '#ffb07a');
  }

  popDecoy(d, loudly) {
    if (d.popped) return;
    d.popped = true;
    d.dead = true;
    sfx.pop();
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        x: d.x, y: d.y - 8, vx: Math.cos(a) * 50, vy: Math.sin(a) * 30 - 10,
        life: 0.5, t: 0.5, color: i % 2 ? '#ffb07a' : '#2a2f45', size: 1,
      });
    }
    if (loudly) this.popup(d.x, d.y - 20, 'POP!', '#ffb07a');
  }

  // Grapple Hook: a reeled-in alien reached the agent — straight into your hands.
  onReelArrive(a) {
    const p = this.player;
    a.reelTo = null;
    a.stunned(0.6);
    if (Math.hypot(a.x - p.x, a.y - p.y) > 40) { a.stateT = 1.1; return; }
    if (!this.tryCapture(a)) a.stateT = 1.2;
  }

  snoreCloud(a, r, dur) { snoreCloud(this, a, r, dur); }

  // A stun bolt hit a Riot Shield: Mk.I soaks it, Mk.II+ sends it back.
  shieldBolt(user, pr) {
    sfx.block();
    if (WEAPONS.shield[user.shieldLv] && WEAPONS.shield[user.shieldLv].reflect) {
      pr.type = 'rbolt';
      pr.vx *= -1.15; pr.vy *= -1.15;
      pr.life = 1.2;
      pr.x += pr.vx * 0.03; pr.y += pr.vy * 0.03;
      this.popup(user.x, user.y - 20, 'REFLECT!', '#7fe3ff');
    } else {
      pr.life = 0;
      this.popup(user.x, user.y - 20, 'BLOCKED', '#7fe3ff');
    }
  }

  crumbs(a) {
    this.particles.push({
      x: a.x + (Math.random() - 0.5) * 6, y: a.y - 6,
      vx: (Math.random() - 0.5) * 20, vy: -10 - Math.random() * 10,
      life: 0.4, t: 0.4, color: Math.random() < 0.5 ? '#d98b3a' : '#6b3a22', size: 1,
    });
  }

  // Count an alien as locked in the van (the van door, Evac, a courier drone,
  // a hypnotized alien walking in on its own).
  secureAlien(a) {
    if (a.state === 'deposited') return;
    a.state = 'deposited';
    a.cage = null;
    a.bait = null;
    this.captured++;
    if (!this.mission.sandbox) save.totalCaptured++;
    if (this.ufo && this.ufo.target === a) this.ufo.state = 'pick';
    this.emit('secure', a);
  }

  // Aliens the UFO may take: loose, and not already under the agent's control.
  ufoCanTake(a) {
    return a.free && !a.controlled;
  }

  // Dive the way you're running. In no-buttons mode it bends onto an alien
  // that's roughly ahead (a thumb swipe can't aim as finely as a stick).
  diveAction() {
    const p = this.player;
    if (!p.canAct || p.airborne) return;
    let aim = null;
    if (getControlMode() === 'gestures') {
      let bestD = 1e9;
      for (const a of this.aliens) {
        if (!a.grabbable || a.z >= 16) continue;
        const ax = a.x + a.vx * 0.12 - p.x, ay = a.y + a.vy * 0.12 - p.y;
        const d = Math.hypot(ax, ay);
        if (d > DIVE_REACH || d < 0.001) continue;
        if ((ax * p.dir.x + ay * p.dir.y) / d < DIVE_CONE && d > 16) continue;
        if (d < bestD) { bestD = d; aim = { x: ax / d, y: ay / d }; }
      }
    }
    if (p.tryDive(aim)) { sfx.dive(); this.emit('dive'); }
  }

  // No-buttons mode has no GRAB control: touching a loose alien with your
  // hands (the same reach a tap of GRAB would have) scoops it up.
  autoGrab() {
    const p = this.player;
    if (p.grabCd > 0 || !p.canAct) return;
    const gp = p.grabPoint();
    for (const a of this.aliens) {
      if (!a.grabbable || a.z >= 14) continue;
      if (Math.hypot(a.x - gp.x, a.y - gp.y) >= gp.r + a.r) continue;
      if (p.carried.length >= this.fx.carryMax && !(a.helmet && a.state !== 'netted')) {
        if (this.time - this.fullNagT > 1.6) {
          this.fullNagT = this.time;
          this.popup(p.x, p.y - 20, 'HANDS FULL', '#ff9e5e');
        }
        return;
      }
      p.grabCd = 0.35;
      this.tryCapture(a);
      return;
    }
  }

  /* ---------------- update ---------------- */

  update(dt) {
    if (!this.running) return;
    this.time += dt;
    const p = this.player;
    // a director cutscene has the controls: swallow the player's input
    const locked = !!(this.director && this.director.locked);

    // actions
    if (locked) {
      for (const a of ACTIONS) consumePress(a);
    } else {
      if (consumePress('jump')) { if (p.tryJump()) { sfx.jump(); this.emit('jump'); } }
      if (consumePress('dash')) { if (p.tryDash()) { sfx.dash(); this.puff(p.x, p.y); if (this.stealth) this.noisePulse(p.x, p.y, 18); this.emit('dash'); } }
      if (consumePress('dive')) this.diveAction();
      if (consumePress('grab')) this.grabAttempt();
      if (consumePress('gadget1')) this.useGadget(0);
      if (consumePress('gadget2')) this.useGadget(1);
    }

    const gestures = getControlMode() === 'gestures';
    if (gestures && !locked) this.autoGrab();

    const wasDiving = p.state === 'diving';
    // the director can walk the agent itself (scripted run) or just feed it
    // a stick direction; otherwise it's the player's input
    if (!(locked && this.director.ownsPlayer)) {
      p.update(dt, this.map, locked ? this.director.moveInput : input);
    }
    if (wasDiving && p.state === 'prone') {
      sfx.thud(); this.puff(p.x, p.y, '#8a6a45');
      if (this.stealth) this.noisePulse(p.x, p.y, 26);
      this.emit('diveMiss');
    }

    if (this.stealth) this.updateStealth(dt);
    if (this.map.volcano) this.updateVolcano(dt);
    if (this.map.smoke.length) this.updateSmoke(dt);

    // dive capture sweep
    if (p.state === 'diving') {
      for (const a of this.aliens) {
        if (!a.grabbable) continue;
        if (Math.hypot(a.x - p.x, a.y - p.y) < 13 && a.z < 16) {
          if (this.tryCapture(a, true)) { p.diveHit = true; break; }
        }
      }
    }

    // weapons: bait, cages, courier drones, hypno line, shield bash
    updateWeapons(this, dt);

    // decoy agents
    for (const d of this.decoys) d.update(dt, this);
    for (const d of this.decoys) if (d.dead) this.popDecoy(d, d.hp <= 0);
    this.decoys = this.decoys.filter(d => !d.dead);

    // aliens
    for (const a of this.aliens) a.update(dt, this);

    // projectiles
    for (const pr of this.projectiles) {
      pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      pr.life -= dt;
      if (pr.type === 'bolt') {
        if (p.state !== 'stunned' && !p.airborne && p.state !== 'prone' &&
            Math.hypot(p.x - pr.x, p.y - 4 - pr.y) < 7) {
          if (p.shieldT > 0) this.shieldBolt(p, pr);
          // a solid punt back along the bolt's flight, not just a stagger
          else { this.playerHit(null, 1.15, pr.vx * 0.9, pr.vy * 0.9); pr.life = 0; }
        } else {
          for (const d of this.decoys) {
            if (Math.hypot(d.x - pr.x, d.y - 4 - pr.y) >= 7) continue;
            if (d.shieldT > 0) this.shieldBolt(d, pr);
            else { this.hitDecoy(d, null); pr.life = 0; }
            break;
          }
        }
      } else if (pr.type === 'net') {
        for (const a of this.aliens) {
          if (!a.free || a.controlled || a.state === 'netted') continue;
          if (Math.hypot(a.x - pr.x, a.y - 4 - pr.y) < 9) {
            a.state = 'netted';
            a.stateT = pr.pin || 3;
            a.bait = null;
            a.vx = 0; a.vy = 0;
            a.cloaked = false;
            this.popup(a.x, a.y - 16, 'PINNED!', '#ffd75e');
            this.puff(a.x, a.y, '#ffd75e');
            pr.life = 0;
            break;
          }
        }
      } else if (updateProjectile(this, pr, dt)) {
        continue;                                  // lobbed: flies over walls
      }
      // walls stop projectiles
      if (pr.life <= 0) continue;
      const c = collide(this.map, pr.x, pr.y, 2, true);
      if (c.x !== pr.x || c.y !== pr.y) { projectileWall(this, pr, c); pr.life = 0; }
    }
    this.projectiles = this.projectiles.filter(pr => pr.life > 0);

    // deposit at the van: what you carry, plus any hypnotized alien that
    // follows (or sleepwalks) you into the glow
    let secured = 0;
    if (p.carried.length && Math.hypot(p.x - this.vanDoor.x, p.y - this.vanDoor.y) < DEPOSIT_R) {
      for (const a of p.carried) { this.secureAlien(a); secured++; }
      p.carried.length = 0;
    }
    for (const a of this.aliens) {
      if (a.state === 'hypno' && Math.hypot(a.x - this.vanDoor.x, a.y - this.vanDoor.y) < DEPOSIT_R) {
        this.secureAlien(a); secured++;
      }
    }
    if (secured) {
      sfx.deposit(); sfx.cash();
      this.popup(this.vanDoor.x, this.vanDoor.y - 24, `+${secured} SECURED`, '#59d98c');
      this.puff(this.vanDoor.x, this.vanDoor.y - 8, '#59d98c');
    }

    // mission clock (sandbox runs with no time limit never call the UFO in)
    if (this.phase === 'play' && !this.mission.endless) {
      this.timer -= dt;
      if (this.timer <= 30.05 && this.timer + dt > 30.05) sfx.alert();
      if (this.timer <= 0) {
        this.timer = 0;
        this.phase = 'beam';
        this.beamPhase = true;
        sfx.ufo();
        this.announce('UFO ARRIVED — LAST CHANCE!', 2.5);
        this.ufo = { x: this.cam.x, y: this.cam.y - 200, state: 'pick', target: null, t: 0, beamT: 0 };
        this.shake = 4;
      }
    }

    if (this.phase === 'beam') this.updateUfo(dt);

    // particles + popups
    for (const pt of this.particles) {
      pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.t -= dt;
      pt.vy += (pt.grav ?? 20) * dt;
    }
    this.particles = this.particles.filter(pt => pt.t > 0);
    for (const r of this.rings) { r.r += r.spd * dt; r.t -= dt; }
    this.rings = this.rings.filter(r => r.t > 0);
    for (const w of this.shockwaves) {
      w.t -= dt;
      w.r = 4 + (w.max - 4) * (1 - Math.pow(Math.max(0, w.t / w.life), 2.2));
    }
    this.shockwaves = this.shockwaves.filter(w => w.t > 0);
    this.flash = Math.max(0, this.flash - dt);
    for (const pp of this.popups) { pp.y -= 14 * dt; pp.t -= dt; }
    this.popups = this.popups.filter(pp => pp.t > 0);
    this.msgT -= dt;
    this.shake = Math.max(0, this.shake - dt * 12);

    // the director runs its script after the world has moved
    if (this.director) this.director.update(dt);
    if (!this.running) return;

    // walk-in buildings: lift the roof off while the agent is inside
    if (this.map.buildings.length) this.updateBuildings(dt);

    // camera: the agent, or whatever a cutscene is looking at
    const focus = this.camTarget || p;
    const lerp = 1 - Math.pow(this.camTarget ? this.camEase : 0.001, dt);
    this.cam.x += (focus.x - this.cam.x) * lerp;
    this.cam.y += (focus.y - this.cam.y) * lerp;

    // button cooldown UI
    setButtonCooling('btn-dash', p.dashCd > 0 || p.stamina < 18);
    setButtonCooling('btn-dive', p.stamina < 22 || !p.canAct);
    const g1 = this.gadgetCooling(0), g2 = this.gadgetCooling(1);
    setButtonCooling('btn-g1', g1);
    setButtonCooling('btn-g2', g2);
    setButtonCooling('hint-g1', g1);
    setButtonCooling('hint-g2', g2);
    setButtonCooling('hint-jump', !p.canAct || p.z > 0);
    setButtonCooling('hint-dive', p.stamina < 22 || !p.canAct || p.airborne);
    setButtonCooling('hint-dash', p.dashCd > 0 || p.stamina < 18 || !p.canAct);
    setButtonCooling('hint-sprint', input.edgeSpent || p.stamina <= 1);

    // mission end? (a story scene's director decides that for itself)
    if (this.director) return;
    const loose = this.aliens.filter(a => a.free || a.state === 'beaming' || a.state === 'airlift');
    if (this.phase === 'beam' && loose.length === 0) {
      if (p.carried.length > 0) {
        this.phase = 'return';
        this.announce('RETURN TO VAN!', 2);
      } else this.finish();
    } else if (this.phase === 'return' && p.carried.length === 0) {
      this.finish();
    } else if (this.phase === 'play' && loose.length === 0 && p.carried.length === 0) {
      // caught everyone early
      this.finish();
    }
  }

  // Each walk-in building's shell (roof + front wall) fades right out while
  // the agent is inside its footprint, and half out while the agent is
  // tucked behind it, so they're never lost under the roof. A cutscene can
  // pin it (b.force) to show what's going on inside.
  updateBuildings(dt) {
    const p = this.player;
    const k = 1 - Math.pow(0.0004, dt);
    for (const b of this.map.buildings) {
      let target = 1;
      if (b.force != null) target = b.force;
      else if (p.x > b.x0 && p.x < b.x1 && p.y > b.y0 && p.y < b.y1 + 2) target = b.insideAlpha;
      else if (p.y < b.y0 + b.t && p.x + 6 > b.ax && p.x - 6 < b.ax + b.shell.width && p.y > b.topAt(p.x) + 1) target = b.behindAlpha;
      b.alpha += (target - b.alpha) * k;
      if (Math.abs(target - b.alpha) < 0.01) b.alpha = target;
    }
  }

  updateUfo(dt) {
    const u = this.ufo;
    if (!u) return;
    if (u.state === 'pick') {
      const next = this.aliens.find(a => this.ufoCanTake(a));
      if (!next) {
        // hypnotized / hooked / airlifted aliens can still slip free: hover
        // until they're dealt with, only leave once nobody is left
        if (!this.aliens.some(a => a.free || a.state === 'airlift')) u.state = 'leave';
        return;
      }
      u.target = next;
      u.state = 'travel';
    } else if (u.state === 'travel') {
      const t = u.target;
      if (!this.ufoCanTake(t)) { u.state = 'pick'; return; }
      const tx = t.x, ty = t.y - 64;
      const d = Math.hypot(tx - u.x, ty - u.y);
      const sp = 170 * dt;
      if (d < sp || d < 3) { u.x = tx; u.y = ty; u.state = 'channel'; u.t = 0; }
      else { u.x += (tx - u.x) / d * sp; u.y += (ty - u.y) / d * sp; }
    } else if (u.state === 'channel') {
      const t = u.target;
      if (!this.ufoCanTake(t)) { u.state = 'pick'; return; }
      // track slowly if target still moving
      u.x += (t.x - u.x) * Math.min(1, dt * 4);
      u.t += dt;
      if (u.t > 0.75) {
        t.state = 'beaming';
        t.riseZ = 0;
        u.state = 'lift';
        sfx.beamLoop();
      }
    } else if (u.state === 'lift') {
      const t = u.target;
      if (t.state !== 'beaming') { u.state = 'pick'; return; } // snatched!
      const liftTime = 2.3 + (ALIEN_STATS[t.tier].beamBonus ? -ALIEN_STATS[t.tier].beamBonus * 0.4 : 0);
      t.riseZ += dt * (46 / liftTime);
      if (Math.random() < 0.4) this.beamSparkle(t);
      if (t.riseZ >= 46) {
        t.state = 'escaped';
        this.escaped++;
        sfx.escape();
        this.popup(t.x, t.y - 40, 'ESCAPED', '#ff5e6c');
        u.state = 'pick';
      }
    } else if (u.state === 'leave') {
      u.y -= 140 * dt;
    }
  }

  beamSparkle(t) {
    this.particles.push({
      x: t.x + (Math.random() - 0.5) * 16, y: t.y - Math.random() * 40,
      vx: 0, vy: -30, life: 0.5, t: 0.5, color: '#9ff5ff', size: 1,
    });
  }

  /* ---------------- stealth (neighbourhood) ---------------- */

  // How loud you are here: 1x out in the open, ~3x on a doorstep.
  noiseGain(x, y) {
    let near = 1e9;
    for (const h of this.homes) near = Math.min(near, Math.hypot(h.x - x, h.y - y));
    return 1 + Math.max(0, (260 - near) / 260) * 2;
  }

  updateStealth(dt) {
    const p = this.player;
    if (this.phase === 'play' || this.phase === 'beam') {
      if (p.sprinting && p.moving && p.z === 0) {
        this.suspicion += this.noiseGain(p.x, p.y) * 9 * dt;   // sprinting is loud
      } else {
        this.suspicion -= 7 * dt;                              // quiet -> calm down
      }
    }
    this.suspicion = Math.max(0, Math.min(100, this.suspicion));
    for (const h of this.homes) h.alertT = Math.max(0, h.alertT - dt);
    if (this.suspicion >= 100) this.noiseComplaint();
  }

  noisePulse(x, y, amount) {
    const g = this.noiseGain(x, y);
    this.suspicion = Math.min(100, this.suspicion + amount * g * 0.5);
    this.rings.push({ x, y, r: 4, spd: 90, t: 0.6, life: 0.6 });
    const reach = amount * 5;
    for (const h of this.homes) if (Math.hypot(h.x - x, h.y - y) < reach) h.alertT = 1.1;
    if (this.suspicion >= 100) this.noiseComplaint();
  }

  // The block waking up doesn't cost a fine any more — it blows the whole
  // job. Everyone scatters and the mission ends right there as a loss.
  noiseComplaint() {
    this.shake = 6;
    sfx.alert();
    this.announce('NEIGHBORS CALLED THE COPS!', 2.4);
    for (const h of this.homes) h.alertT = 1.8;
    for (const a of this.aliens) a.flush(this);   // everyone scatters
    this.forceFail = true;
    this.finish();
  }

  updateVolcano(dt) {
    this.volcanoT += dt;
    if (this.volcanoT < 0.22) return;
    this.volcanoT = 0;
    const v = this.map.volcano;
    this.particles.push({
      x: v.x + (Math.random() - 0.5) * 10, y: v.y - 4,
      vx: (Math.random() - 0.5) * 8, vy: -16 - Math.random() * 8,
      grav: -5, life: 2.2, t: 2.2,
      color: Math.random() < 0.3 ? '#8a8078' : '#b8b0a8', size: 2,
    });
  }

  // Thin grey columns drifting up off the crashed pods.
  updateSmoke(dt) {
    this.smokeT += dt;
    if (this.smokeT < 0.18) return;
    this.smokeT = 0;
    for (const s of this.map.smoke) {
      if (Math.random() < 0.45) continue;
      this.particles.push({
        x: s.x + (Math.random() - 0.5) * 4, y: s.y,
        vx: 3 + (Math.random() - 0.5) * 5, vy: -12 - Math.random() * 7,
        grav: -3, life: 1.9, t: 1.9,
        color: Math.random() < 0.35 ? '#6e6a70' : '#a8a4a8', size: Math.random() < 0.5 ? 2 : 1,
      });
    }
  }

  // A story scene is over (the director calls this). No pay, no deductions:
  // just what happened, for the story results screen.
  finishStory(extra = {}) {
    if (!this.running) return;
    this.running = false;
    const results = {
      mission: this.mission, story: true, captured: this.captured,
      total: this.totalAliens, cleared: true, abandoned: false, ...extra,
    };
    if (this.onEnd) this.onEnd(results);
  }

  // pay = base minus escaped aliens and noise fines (both cost escapeCost)
  projectedPay() {
    const m = this.mission;
    return Math.max(0, m.pay - (this.escaped + this.fines) * m.escapeCost);
  }

  // Walking out early: no payout at all, plus the agency's cleanup fee.
  abandon() {
    if (!this.running) return;
    this.running = false;
    const m = this.mission;
    sfx.fail();
    const results = {
      mission: m, captured: this.captured, escaped: this.escaped,
      total: this.totalAliens, basePay: m.pay, deduction: 0, pay: 0,
      cleared: false, fines: this.fines, abandoned: true,
      fee: abandonFee(m),
    };
    if (this.onEnd) this.onEnd(results);
  }

  finish() {
    if (!this.running) return;
    this.running = false;
    const m = this.mission;
    const deduction = (this.escaped + this.fines) * m.escapeCost;
    const pay = this.projectedPay();
    const cleared = this.captured > 0 && !this.forceFail;
    if (cleared) sfx.win(); else sfx.fail();
    const results = {
      mission: m, captured: this.captured, escaped: this.escaped,
      total: this.totalAliens, basePay: m.pay, deduction, pay, cleared,
      fines: this.fines, abandoned: false, fee: 0,
    };
    if (this.onEnd) this.onEnd(results);
  }

  /* ---------------- render ---------------- */

  render(ctx, vw, vh) {
    const map = this.map;
    const p = this.player;
    let camX = Math.round(Math.max(vw / 2, Math.min(map.w - vw / 2, this.cam.x)) - vw / 2);
    let camY = Math.round(Math.max(vh / 2, Math.min(map.h - vh / 2, this.cam.y)) - vh / 2);
    if (map.w < vw) camX = -((vw - map.w) / 2) | 0;
    if (map.h < vh) camY = -((vh - map.h) / 2) | 0;
    if (this.shake > 0.3) {
      camX += Math.round((Math.random() - 0.5) * this.shake);
      camY += Math.round((Math.random() - 0.5) * this.shake);
    }

    ctx.fillStyle = '#0a0c14';
    ctx.fillRect(0, 0, vw, vh);
    ctx.drawImage(this.groundCv, -camX, -camY);

    // night tint (neighbourhood): dark blue wash over the ground
    if (map.tint === 'night') {
      ctx.fillStyle = 'rgba(14, 20, 54, 0.44)';
      ctx.fillRect(0, 0, vw, vh);
    }

    // bait, evac beams: flat on the ground under everything
    renderGround(this, ctx, camX, camY);

    // ---- build y-sorted render list ----
    const items = [];
    for (const pr of map.props) {
      // off-screen props (a big map is mostly trees and crop rows) are skipped
      const img = pr.img;
      if (pr.x - camX > vw || pr.x + img.width - camX < 0 || pr.y - camY > vh || pr.baseY - camY < 0) continue;
      items.push({ y: pr.baseY, kind: 'prop', pr });
    }
    for (const a of this.aliens) {
      if (a.state === 'carried' || a.state === 'deposited' || a.state === 'escaped' || a.state === 'fled') continue;
      if (a.state === 'hiding') {
        if (a.revealT > 0) items.push({ y: a.y + 6, kind: 'hidden', a });   // Noise Maker ping
        continue;
      }
      items.push({ y: a.y, kind: 'alien', a });
    }
    for (const d of this.decoys) items.push({ y: d.y, kind: 'decoy', d });
    for (const c of this.deployables) if (c.kind === 'cage') items.push({ y: c.y + 0.5, kind: 'cage', c });
    for (const b of map.buildings) {
      if (b.ax - camX > vw || b.ax + b.shell.width - camX < 0 || b.ay - camY > vh || b.baseY - camY < 0) continue;
      items.push({ y: b.baseY, kind: 'building', b });
    }
    items.push({ y: p.y, kind: 'player' });
    items.push({ y: map.van.y + 28, kind: 'van' });
    items.sort((i1, i2) => i1.y - i2.y);

    for (const it of items) {
      if (it.kind === 'prop') {
        ctx.drawImage(it.pr.img, it.pr.x - camX, it.pr.y - camY);
      } else if (it.kind === 'van') {
        const v = map.van;
        this.shadow(ctx, v.x + 23 - camX, v.y + 27 - camY, 20);
        ctx.drawImage(this.assets.van, v.x - camX, v.y - camY);
        // deposit glow
        const pulse = 0.45 + Math.sin(this.time * 5) * 0.2;
        ctx.globalAlpha = p.carried.length ? pulse : 0.18;
        ctx.fillStyle = '#59d98c';
        ctx.beginPath();
        ctx.arc(this.vanDoor.x - camX, this.vanDoor.y - camY, DEPOSIT_R - 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (it.kind === 'player') {
        this.drawPlayer(ctx, camX, camY);
      } else if (it.kind === 'alien') {
        this.drawAlien(ctx, it.a, camX, camY);
      } else if (it.kind === 'decoy') {
        this.drawDecoy(ctx, it.d, camX, camY);
      } else if (it.kind === 'cage') {
        drawCage(this, ctx, it.c, camX, camY);
      } else if (it.kind === 'building') {
        // cutaway walls under the shell, the shell at its current fade
        const b = it.b;
        const bx = Math.round(b.ax - camX), by = Math.round(b.ay - camY);
        if (b.alpha < 0.999) ctx.drawImage(b.cut, bx, by);
        if (b.alpha > 0.001) {
          ctx.globalAlpha = b.alpha;
          ctx.drawImage(b.shell, bx, by);
          ctx.globalAlpha = 1;
        }
      } else if (it.kind === 'hidden') {
        // Noise Maker ping marker (fades out over its last second)
        const a = it.a;
        const by = Math.sin(this.time * 6) * 2;
        ctx.globalAlpha = 0.35 * Math.min(1, a.revealT);
        const spr = this.assets.actors.aliens[a.tier].down;
        ctx.drawImage(spr, Math.round(a.x - 5 - camX), Math.round(a.y - 12 - camY));
        ctx.globalAlpha = Math.min(1, a.revealT);
        ctx.fillStyle = '#41f0d8';
        ctx.fillRect(Math.round(a.x - 1 - camX), Math.round(a.y - 22 + by - camY), 3, 3);
        ctx.fillRect(Math.round(a.x - camX), Math.round(a.y - 19 + by - camY), 1, 2);
        ctx.globalAlpha = 1;
      }
    }

    // stealth: lit windows on woken homes + expanding noise rings
    if (this.stealth) {
      for (const h of this.homes) {
        if (h.alertT <= 0) continue;
        const a = Math.min(1, h.alertT) * (0.5 + 0.3 * Math.sin(this.time * 20));
        ctx.globalAlpha = Math.max(0, a);
        ctx.fillStyle = '#ffe58a';
        ctx.fillRect(Math.round(h.x - camX), Math.round(h.y - camY), h.w, h.h);
        ctx.globalAlpha = 1;
      }
      for (const r of this.rings) {
        ctx.globalAlpha = Math.max(0, r.t / r.life) * 0.6;
        ctx.strokeStyle = '#ffd75e';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(r.x - camX, r.y - camY, r.r, r.r * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Noise Maker blast rings
    for (const w of this.shockwaves) {
      ctx.globalAlpha = Math.max(0, w.t / w.life) * 0.8;
      ctx.strokeStyle = w.col;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(Math.round(w.x - camX), Math.round(w.y - camY), w.r, w.r * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Field Drones: two little quadcopters riding along above the agent
    if (this.fx.drones) this.drawDrones(ctx, camX, camY);

    // beam + UFO on top
    if (this.ufo) this.drawUfo(ctx, camX, camY);

    // weapon fx: zaps, hook lines, darts, lobbed bait, courier drones
    renderTop(this, ctx, camX, camY);

    // projectiles
    for (const pr of this.projectiles) {
      if (pr.type === 'bolt') {
        ctx.fillStyle = '#41f0d8';
        ctx.fillRect(Math.round(pr.x - 2 - camX), Math.round(pr.y - 2 - camY), 4, 4);
        ctx.fillStyle = '#e8f6ff';
        ctx.fillRect(Math.round(pr.x - 1 - camX), Math.round(pr.y - 1 - camY), 2, 2);
      } else if (pr.type === 'net') {
        ctx.strokeStyle = '#ffd75e';
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(pr.x - 4 - camX), Math.round(pr.y - 4 - camY), 8, 8);
        ctx.beginPath();
        ctx.moveTo(pr.x - 4 - camX, pr.y - camY); ctx.lineTo(pr.x + 4 - camX, pr.y - camY);
        ctx.moveTo(pr.x - camX, pr.y - 4 - camY); ctx.lineTo(pr.x - camX, pr.y + 4 - camY);
        ctx.stroke();
      }
    }

    // particles
    for (const pt of this.particles) {
      ctx.globalAlpha = Math.max(0, pt.t / pt.life);
      ctx.fillStyle = pt.color;
      ctx.fillRect(Math.round(pt.x - camX), Math.round(pt.y - camY), pt.size, pt.size);
    }
    ctx.globalAlpha = 1;

    // popups
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    for (const pp of this.popups) {
      ctx.globalAlpha = Math.min(1, pp.t / (pp.life * 0.5));
      ctx.fillStyle = '#14141e';
      ctx.fillText(pp.text, Math.round(pp.x - camX) + 1, Math.round(pp.y - camY) + 1);
      ctx.fillStyle = pp.color;
      ctx.fillText(pp.text, Math.round(pp.x - camX), Math.round(pp.y - camY));
    }
    ctx.globalAlpha = 1;

    // story scenes: objective markers, the agent's "!!!", etc.
    if (this.director) this.director.renderWorld(ctx, camX, camY, vw, vh);

    // edge arrows: carrying -> van; drones -> loose aliens; endgame -> everyone
    if (p.carried.length) this.edgeArrow(ctx, vw, vh, camX, camY, this.vanDoor.x, this.vanDoor.y, '#59d98c');
    const endgame = !this.mission.endless && (this.timer < 25 || this.beamPhase);
    for (const a of this.aliens) {
      if (!(a.free || a.state === 'beaming')) continue;
      if (this.droneTracks(a)) this.droneArrow(ctx, vw, vh, camX, camY, a);
      else if (endgame) this.edgeArrow(ctx, vw, vh, camX, camY, a.x, a.y, '#ffd75e');
    }
    // a full cage out of sight: go collect it; decoys: where your helpers are
    for (const c of this.deployables) {
      if (c.kind === 'cage' && c.held) this.edgeArrow(ctx, vw, vh, camX, camY, c.x, c.y, '#ffb35e');
    }
    for (const d of this.decoys) this.edgeArrow(ctx, vw, vh, camX, camY, d.x, d.y, '#ffb07a');

    // Noise Maker white-out
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(0.55, this.flash * 2.2);
      ctx.fillStyle = '#fff6e0';
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalAlpha = 1;
    }

    // announcement
    if (this.msgT > 0 && this.msg) {
      ctx.font = 'bold 9px monospace';
      ctx.globalAlpha = Math.min(1, this.msgT * 2);
      ctx.fillStyle = '#14141e';
      ctx.fillText(this.msg, (vw / 2 | 0) + 1, 31);
      ctx.fillStyle = '#ffd75e';
      ctx.fillText(this.msg, vw / 2 | 0, 30);
      ctx.globalAlpha = 1;
    }

    // stealth suspicion meter (screen space, top-centre)
    if (this.stealth) this.drawSuspicion(ctx, vw);

    // cutscene letterbox / fades sit over everything
    if (this.director) this.director.renderScreen(ctx, vw, vh);

    ctx.textAlign = 'left';
  }

  drawSuspicion(ctx, vw) {
    const s = this.suspicion / 100;
    const bw = 70, bh = 6, bx = (vw / 2 - bw / 2) | 0, by = 46;
    const col = s > 0.8 ? '#ff5e6c' : s > 0.5 ? '#ffd75e' : '#59d98c';
    // frame
    ctx.fillStyle = '#0d0f1a'; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    ctx.fillStyle = '#2a3350'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    ctx.fillStyle = '#11141f'; ctx.fillRect(bx, by, bw, bh);
    // fill (pulses red when near max)
    ctx.globalAlpha = s > 0.8 ? 0.7 + 0.3 * Math.sin(this.time * 16) : 1;
    ctx.fillStyle = col; ctx.fillRect(bx, by, Math.round(bw * s), bh);
    ctx.globalAlpha = 1;
    // threshold ticks
    ctx.fillStyle = '#0d0f1a';
    ctx.fillRect(bx + (bw * 0.5 | 0), by, 1, bh);
    ctx.fillRect(bx + (bw * 0.8 | 0), by, 1, bh);
    // label
    ctx.font = 'bold 6px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0a0c14'; ctx.fillText('NOISE', (vw / 2 | 0) + 1, by - 2);
    ctx.fillStyle = col; ctx.fillText('NOISE', vw / 2 | 0, by - 3);
  }

  shadow(ctx, x, y, w) {
    const a = ctx.globalAlpha;
    ctx.globalAlpha = 0.25 * a;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, y, w / 2, w / 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawWalking(ctx, img, x, y, walkT, moving) {
    // split legs (bottom 4 rows) and alternate their offset for a step cycle
    const w = img.width, h = img.height;
    const split = h - 4;
    const bob = moving ? (Math.sin(walkT * 2) > 0 ? -1 : 0) : 0;
    ctx.drawImage(img, 0, 0, w, split, x, y + bob, w, split);
    const phase = Math.sin(walkT * 2) > 0;
    const lOff = moving ? (phase ? 1 : 0) : 0;
    const rOff = moving ? (phase ? 0 : 1) : 0;
    ctx.drawImage(img, 0, split, w / 2, 4, x, y + split - 1 + lOff + bob, w / 2, 4);
    ctx.drawImage(img, w / 2, split, w / 2, 4, x + w / 2, y + split - 1 + rOff + bob, w / 2, 4);
  }

  drawPlayer(ctx, camX, camY) {
    const p = this.player;
    const A = this.assets.actors.player;
    const x = Math.round(p.x - camX), y = Math.round(p.y - camY);
    if (p.alpha <= 0) return;
    ctx.globalAlpha = p.alpha;
    this.shadow(ctx, x, y, 12);
    ctx.globalAlpha = p.alpha;

    if (p.state === 'prone' || p.state === 'diving') {
      const img = p.state === 'diving'
        ? (p.dir.x < 0 ? A.diveL : A.diveR)
        : (p.dir.x < 0 ? A.proneL : A.proneR);
      const ang = Math.atan2(p.dir.y, Math.abs(p.dir.x) < 0.3 ? 0.0001 : p.dir.x);
      ctx.save();
      ctx.translate(x, y - 4);
      // rotate towards dive direction (mirrored sprites handle left)
      let rot = ang;
      if (p.dir.x < 0) rot = ang - Math.PI;
      ctx.rotate(rot);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
    } else {
      const img = A[p.facing] || A.down;
      const lift = Math.round(p.z);
      this.drawWalking(ctx, img, x - 6, y - 15 - lift, p.walkT, p.moving && p.z === 0);
      // carried aliens stacked overhead
      let stackY = y - 27 - lift + Math.round(Math.sin(this.time * 8) * 1);
      for (const a of p.carried) {
        const spr = this.assets.actors.aliens[a.tier].down;
        ctx.drawImage(spr, x - 5, stackY - 10);
        stackY -= 9;
      }
      if (p.state === 'stunned') this.drawStars(ctx, x, y - 20 - lift);
      if (p.shieldT > 0) this.drawShield(ctx, p, x, y - lift);
      if (p.sprinting && Math.random() < 0.3 * p.alpha) {
        this.particles.push({ x: p.x - p.dir.x * 6, y: p.y, vx: -p.dir.x * 10, vy: -4, life: 0.3, t: 0.3, color: '#c8c8d0', size: 1 });
      }
    }
    ctx.globalAlpha = 1;
  }

  drawAlien(ctx, a, camX, camY) {
    const set = this.assets.actors.aliens[a.tier];
    const x = Math.round(a.x - camX), y = Math.round(a.y - camY);
    const rise = Math.round(a.riseZ || 0);
    const lift = Math.round(a.z) + rise;

    if (a.state !== 'beaming' && a.alpha > 0) {
      ctx.globalAlpha = a.alpha;
      this.shadow(ctx, x, y, 9);
    }

    let alpha = a.alpha;
    if (alpha <= 0) return;
    if (a.cloaked) alpha *= 0.13;
    ctx.globalAlpha = alpha;
    const img = set[a.facing] || set.down;
    const moving = Math.hypot(a.vx, a.vy) > 12;
    this.drawWalking(ctx, img, x - 5, y - 11 - lift, a.walkT, moving && a.z === 0);
    ctx.globalAlpha = 1;

    if (a.state === 'stunned' && a.look === 'ice') {
      // frozen solid: a pale block of ice round it
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#bfefff';
      ctx.fillRect(x - 6, y - 13 - lift, 12, 14);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 5, y - 12 - lift, 1, 5);
      ctx.fillRect(x - 4, y - 12 - lift, 3, 1);
      ctx.globalAlpha = 1;
    }
    if (a.state === 'hypno') {
      // spinning spiral eyes over its head
      const t = this.time * 8;
      for (let i = 0; i < 4; i++) {
        const ang = t + i * Math.PI / 2;
        ctx.fillStyle = i % 2 ? '#e08bff' : '#ffffff';
        ctx.fillRect(Math.round(x + Math.cos(ang) * 3) - 1, Math.round(y - 17 - lift + Math.sin(ang) * 1.5), 2, 1);
      }
    }
    if (a.drowsyT > 0 && Math.floor(this.time * 4) % 2) {
      ctx.fillStyle = '#c9a8ff';
      ctx.fillRect(x + 4, y - 16 - lift, 2, 1);
      ctx.fillRect(x + 5, y - 15 - lift, 1, 1);
      ctx.fillRect(x + 4, y - 14 - lift, 2, 1);
    }

    if (a.state === 'netted' && !a.cage) {
      ctx.strokeStyle = '#ffd75e';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 6, y - 12 - lift, 12, 13);
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 6 - lift); ctx.lineTo(x + 6, y - 6 - lift);
      ctx.moveTo(x, y - 12 - lift); ctx.lineTo(x, y + 1 - lift);
      ctx.stroke();
    }
    if (a.state === 'stunned') {
      if (a.look === 'zzz') this.drawZzz(ctx, x, y - 16 - lift);
      else if (a.look !== 'ice') this.drawStars(ctx, x, y - 16 - lift, a.look === 'zap' ? '#9fe8ff' : '#ffd75e');
    }
    if (a.state === 'attack') {
      ctx.fillStyle = '#ff5e6c';
      ctx.fillRect(x - 1, y - 18 - lift, 2, 4);
      ctx.fillRect(x - 1, y - 13 - lift, 2, 2);
    }
  }

  drawStars(ctx, x, y, color = '#ffd75e') {
    for (let i = 0; i < 3; i++) {
      const a = this.time * 6 + i * (Math.PI * 2 / 3);
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x + Math.cos(a) * 7) - 1, Math.round(y + Math.sin(a) * 2) - 1, 2, 2);
    }
  }

  // Tranq'd / food coma: little Zs drifting up
  drawZzz(ctx, x, y) {
    for (let i = 0; i < 2; i++) {
      const k = (this.time * 0.8 + i * 0.5) % 1;
      const zx = Math.round(x + 2 + k * 5 + i * 2), zy = Math.round(y + 2 - k * 8);
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#c9a8ff';
      ctx.fillRect(zx, zy, 3, 1);
      ctx.fillRect(zx + 1, zy + 1, 1, 1);
      ctx.fillRect(zx, zy + 2, 3, 1);
    }
    ctx.globalAlpha = 1;
  }

  // Riot Shield bubble (blinks as it runs out)
  drawShield(ctx, u, x, y) {
    if (u.shieldT < 1 && Math.floor(this.time * 12) % 2) return;
    const pulse = 0.35 + 0.15 * Math.sin(this.time * 8);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#7fe3ff';
    ctx.beginPath();
    ctx.ellipse(x, y - 8, 11, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = WEAPONS.shield[u.shieldLv] && WEAPONS.shield[u.shieldLv].bash ? '#ffffff' : '#bff4ff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Decoy Agent: the agent's own sprite, tinted like a blow-up doll and
  // wobbling as it runs, with its HP pips overhead.
  drawDecoy(ctx, d, camX, camY) {
    if (!this.decoySprites) {
      this.decoySprites = {};
      for (const [k, img] of Object.entries(this.assets.actors.player)) {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = 'rgba(255, 150, 90, 0.42)';
        g.fillRect(0, 0, c.width, c.height);
        this.decoySprites[k] = c;
      }
    }
    const x = Math.round(d.x - camX), y = Math.round(d.y - camY);
    if (d.t < 2 && Math.floor(this.time * 10) % 2) return;   // about to deflate
    this.shadow(ctx, x, y, 12);
    const img = this.decoySprites[d.facing] || this.decoySprites.down;
    const wob = Math.round(Math.sin(this.time * 9 + d.wob) * 1);
    this.drawWalking(ctx, img, x - 6 + wob, y - 15, d.walkT, d.moving);
    // air valve
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 4 + wob, y - 15, 1, 1);
    for (let i = 0; i < d.maxHp; i++) {
      ctx.fillStyle = i < d.hp ? '#ffb07a' : '#3a2a2a';
      ctx.fillRect(x - d.maxHp * 1.5 + i * 3, y - 21, 2, 2);
    }
    if (d.shieldT > 0) this.drawShield(ctx, d, x, y);
  }

  drawUfo(ctx, camX, camY) {
    const u = this.ufo;
    const x = Math.round(u.x - camX), y = Math.round(u.y - camY);
    // beam
    if (u.state === 'channel' || u.state === 'lift') {
      const t = u.target;
      const groundY = Math.round(t.y - camY);
      const topY = y + 10;
      const w = u.state === 'lift' ? 22 : 10 + u.t * 16;
      const grad = ctx.createLinearGradient(0, topY, 0, groundY);
      grad.addColorStop(0, 'rgba(120, 240, 255, 0.65)');
      grad.addColorStop(1, 'rgba(120, 240, 255, 0.12)');
      ctx.fillStyle = grad;
      const wob = Math.sin(this.time * 9) * 2;
      ctx.beginPath();
      ctx.moveTo(x - 5, topY);
      ctx.lineTo(x + 5, topY);
      ctx.lineTo(x + w / 2 + wob, groundY + 4);
      ctx.lineTo(x - w / 2 + wob, groundY + 4);
      ctx.closePath();
      ctx.fill();
      // beam ground ring
      ctx.strokeStyle = 'rgba(160, 250, 255, 0.5)';
      ctx.beginPath();
      ctx.ellipse(x + wob, groundY + 3, w / 2, w / 6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    const hover = Math.sin(this.time * 3) * 2;
    ctx.drawImage(this.assets.ufo, x - 24, y - 11 + hover);
  }

  // Where an off-screen world point lands on the screen border (inside the
  // HUD/safe-area insets), or null when the point is on screen.
  edgePoint(vw, vh, camX, camY, wx, wy) {
    const ins = this.insets;
    const x0 = ins.left + 8, x1 = vw - ins.right - 8;
    const y0 = ins.top + 8, y1 = vh - ins.bottom - 8;
    const sx = wx - camX, sy = wy - camY;
    if (sx > 4 && sx < vw - 4 && sy > 4 && sy < vh - 4) return null; // on screen
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let dx = sx - cx, dy = sy - cy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const scaleX = Math.abs(dx) > 1e-4 ? (x1 - cx) / Math.abs(dx) : 1e9;
    const scaleY = Math.abs(dy) > 1e-4 ? (y1 - cy) / Math.abs(dy) : 1e9;
    const s = Math.min(scaleX, scaleY);
    return { x: cx + dx * s, y: cy + dy * s, ang: Math.atan2(dy, dx) };
  }

  edgeArrow(ctx, vw, vh, camX, camY, wx, wy, color) {
    const e = this.edgePoint(vw, vh, camX, camY, wx, wy);
    if (!e) return;
    ctx.save();
    ctx.translate(Math.round(e.x), Math.round(e.y));
    ctx.rotate(e.ang);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(4, 0); ctx.lineTo(-3, -3); ctx.lineTo(-3, 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Field Drones follow anything loose that isn't hiding. Mk.I loses Elites
  // while they're cloaked; Mk.II sees through the cloak.
  droneTracks(a) {
    const lv = this.fx.drones;
    if (!lv || a.state === 'hiding') return false;
    if (!(a.free || a.state === 'beaming')) return false;
    if (a.cloaked && lv < 2) return false;
    return true;
  }

  droneArrow(ctx, vw, vh, camX, camY, a) {
    const e = this.edgePoint(vw, vh, camX, camY, a.x, a.y - 6);
    if (!e) return;
    const mk2 = this.fx.drones >= 2;
    const color = mk2 ? TIER_COLORS[a.tier] || '#41f0d8' : '#41f0d8';
    const dist = Math.hypot(a.x - this.player.x, a.y - this.player.y);
    // closer targets get a bigger arrow; a slow pulse so it reads as "live"
    const size = dist < 160 ? 1.25 : dist < 320 ? 1 : 0.8;
    const pulse = 0.75 + 0.25 * Math.sin(this.time * 6 + a.id);
    ctx.save();
    ctx.translate(Math.round(e.x), Math.round(e.y));
    ctx.rotate(e.ang);
    ctx.scale(size, size);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#0a0c14';
    ctx.beginPath();
    ctx.moveTo(7, 0); ctx.lineTo(-5, -6); ctx.lineTo(-2, 0); ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(5, 0); ctx.lineTo(-3, -4); ctx.lineTo(-1, 0); ctx.lineTo(-3, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
    if (mk2) {
      // range readout (1 tile = 1 m) tucked just inside the arrow
      const m = Math.round(dist / 16);
      const tx = Math.round(e.x - Math.cos(e.ang) * 12);
      const ty = Math.round(e.y - Math.sin(e.ang) * 10) + 2;
      ctx.font = 'bold 6px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0a0c14';
      ctx.fillText(`${m}m`, tx + 1, ty + 1);
      ctx.fillStyle = color;
      ctx.fillText(`${m}m`, tx, ty);
    }
  }

  drawDrones(ctx, camX, camY) {
    const p = this.player;
    const blink = Math.floor(this.time * 3) % 2 === 0;
    for (let i = 0; i < 2; i++) {
      const a = this.time * 1.7 + i * Math.PI;
      const x = Math.round(p.x + Math.cos(a) * 11 - camX);
      const y = Math.round(p.y - 30 - p.z + Math.sin(a) * 3 + Math.sin(this.time * 5 + i) - camY);
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#000';
      ctx.fillRect(Math.round(p.x + Math.cos(a) * 11 - camX) - 1, Math.round(p.y - camY), 3, 1);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#141019';
      ctx.fillRect(x - 3, y - 1, 7, 3);
      ctx.fillStyle = '#8791a0';
      ctx.fillRect(x - 2, y, 5, 1);
      ctx.fillStyle = '#d7dfea';
      ctx.fillRect(x - 3, y - 2, 2, 1);
      ctx.fillRect(x + 2, y - 2, 2, 1);
      ctx.fillStyle = blink === (i === 0) ? '#41f0d8' : '#ff5e6c';
      ctx.fillRect(x, y, 1, 1);
    }
  }
}
