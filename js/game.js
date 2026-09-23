import { TILE } from './data/sprites.js';
import { MAP_BUILDERS } from './data/maps.js';
import { gearEffects, ALIEN_STATS, abandonFee, NOISE_MAKER } from './data/missions.js';
import { buildNav, collide } from './nav.js';
import { Player, Alien } from './entities.js';
import { input, consumePress, setButtonCooling, getControlMode } from './input.js';
import { sfx } from './audio.js';
import { save } from './save.js';
import { resolveLoadout } from './loadout.js';

const DEPOSIT_R = 30;

// Dive aim assist (no-buttons mode): the dive goes the way you're running,
// bent onto an alien inside this reach and cone of that direction.
const DIVE_REACH = 104;
const DIVE_CONE = Math.cos(30 * Math.PI / 180);

// Net Gun aim assist: a fired net bends onto an alien inside this reach and
// cone of your aim, so a near-miss still connects.
const NET_AIM_REACH = 130;
const NET_AIM_CONE = Math.cos(22 * Math.PI / 180);

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

    this.vanDoor = { x: this.map.van.x + 50, y: this.map.van.y + 15 };
    this.announce(mission.name.toUpperCase(), 2.2);
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
  }

  onAlienAttack(a) {
    sfx.alert();
    this.popup(a.x, a.y - 16, '!!', '#ff5e6c');
  }

  rustle(a) {
    for (let i = 0; i < 3; i++) {
      this.particles.push({
        x: a.x + (Math.random() - 0.5) * 10, y: a.y - 4 - Math.random() * 6,
        vx: (Math.random() - 0.5) * 14, vy: -8 - Math.random() * 10,
        life: 0.7, t: 0.7, color: '#54a34a', size: 1,
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

  fireNet() {
    const p = this.player;
    if (!this.fx.netgun || p.netCd > 0 || !p.canAct) return;
    p.netCd = this.fx.netgun >= 2 ? 4.5 : 6;
    sfx.net();
    // Slight aim assist: bend the shot onto a nearby alien roughly ahead of
    // you rather than firing dead straight along your facing.
    let dir = { x: p.dir.x, y: p.dir.y };
    let bestD = 1e9;
    for (const a of this.aliens) {
      if (!a.grabbable || a.z >= 16) continue;
      const ax = a.x - p.x, ay = a.y - p.y;
      const d = Math.hypot(ax, ay);
      if (d > NET_AIM_REACH || d < 0.001) continue;
      if ((ax * p.dir.x + ay * p.dir.y) / d < NET_AIM_CONE) continue;
      if (d < bestD) { bestD = d; dir = { x: ax / d, y: ay / d }; }
    }
    this.projectiles.push({
      type: 'net', x: p.x + dir.x * 8, y: p.y - 4 + dir.y * 8,
      vx: dir.x * 210, vy: dir.y * 210, life: 0.65,
    });
  }

  // Noise Maker: a deafening bang centred on the agent. Anything loose (or
  // hiding) inside stunR is knocked out of cover / out of its cloak and
  // stunned; hidden aliens out to pingR get a marker for a few seconds.
  detonateNoise() {
    const p = this.player;
    const nm = NOISE_MAKER[this.fx.noisemaker];
    if (!nm || p.noiseCd > 0 || p.state === 'stunned' || p.state === 'prone') return;
    p.noiseCd = nm.cd;
    sfx.bang();
    this.shake = 8;
    this.flash = 0.28;
    this.shockwaves.push({ x: p.x, y: p.y, r: 4, max: nm.stunR, t: 0.45, life: 0.45, col: '#ffffff' });
    this.shockwaves.push({ x: p.x, y: p.y, r: 4, max: nm.pingR, t: 0.8, life: 0.8, col: '#41f0d8' });
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, sp = 50 + Math.random() * 60;
      this.particles.push({
        x: p.x, y: p.y - 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 - 10,
        life: 0.45, t: 0.45, color: Math.random() < 0.5 ? '#fff6c8' : '#ffd75e', size: 1,
      });
    }
    this.popup(p.x, p.y - 26, 'BANG!', '#fff6c8');

    // Only aliens actually caught hiding get stunned by the blast — a loose
    // one already running or attacking just gets its cloak blown and is
    // revealed, not knocked down.
    let stunned = 0, pinged = 0, revealed = 0;
    for (const a of this.aliens) {
      const d = Math.hypot(a.x - p.x, a.y - p.y);
      if (d <= nm.stunR) {
        if (a.state === 'beaming' && a.riseZ < 26) {
          // blasted out of the tractor beam — it drops back to the ground
          a.riseZ = 0;
          a.state = 'running';
          if (this.ufo && this.ufo.target === a) this.ufo.state = 'pick';
        }
        if (!a.free) continue;
        const wasHiding = a.state === 'hiding';
        if (wasHiding) {
          // blown out of cover: pop it a step toward the agent so the
          // foliage/container isn't still hiding it
          a.flush(this);
          const len = d || 1;
          const pos = collide(this.map, a.x + (p.x - a.x) / len * 12, a.y + (p.y - a.y) / len * 12, a.r, false);
          a.x = pos.x; a.y = pos.y;
          a.zv = 100; a.z = 0.1;
        }
        a.revealT = nm.pingT;
        a.cloaked = false;
        if (a.state === 'netted') {
          a.stateT = Math.max(a.stateT, nm.stunT);
        } else if (wasHiding) {
          a.stunned(nm.stunT);
          this.popup(a.x, a.y - 16, 'STUNNED!', '#fff6c8');
          stunned++;
        } else {
          this.popup(a.x, a.y - 16, 'REVEALED!', '#41f0d8');
          revealed++;
        }
      } else if (d <= nm.pingR && a.free) {
        a.revealT = nm.pingT;
        if (a.state === 'hiding') pinged++;
      }
    }
    if (stunned + pinged + revealed === 0) this.popup(p.x, p.y - 34, 'NOTHING NEARBY', '#8fa0c4');

    // On Maple Street a bang is the loudest thing you can possibly do.
    if (this.stealth) this.noisePulse(p.x, p.y, 70);
  }

  // Fire the gadget in loadout slot 0 / 1. An empty slot 1 falls back to a
  // plain grab so a no-buttons tap is never dead.
  useGadget(slot) {
    const id = this.loadout[slot];
    if (id === 'noisemaker') this.detonateNoise();
    else if (id === 'netgun') this.fireNet();
    else if (slot === 0) this.grabAttempt();
  }

  gadgetCooling(slot) {
    const p = this.player;
    const id = this.loadout[slot];
    if (id === 'noisemaker') return p.noiseCd > 0;
    if (id === 'netgun') return p.netCd > 0;
    return false;
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
    if (p.tryDive(aim)) sfx.dive();
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

    // actions
    if (consumePress('jump')) { if (p.tryJump()) sfx.jump(); }
    if (consumePress('dash')) { if (p.tryDash()) { sfx.dash(); this.puff(p.x, p.y); if (this.stealth) this.noisePulse(p.x, p.y, 18); } }
    if (consumePress('dive')) this.diveAction();
    if (consumePress('grab')) this.grabAttempt();
    if (consumePress('gadget1')) this.useGadget(0);
    if (consumePress('gadget2')) this.useGadget(1);

    const gestures = getControlMode() === 'gestures';
    if (gestures) this.autoGrab();

    const wasDiving = p.state === 'diving';
    p.update(dt, this.map, input);
    if (wasDiving && p.state === 'prone') {
      sfx.thud(); this.puff(p.x, p.y, '#8a6a45');
      if (this.stealth) this.noisePulse(p.x, p.y, 26);
    }

    if (this.stealth) this.updateStealth(dt);
    if (this.map.volcano) this.updateVolcano(dt);

    // dive capture sweep
    if (p.state === 'diving') {
      for (const a of this.aliens) {
        if (!a.grabbable) continue;
        if (Math.hypot(a.x - p.x, a.y - p.y) < 13 && a.z < 16) {
          if (this.tryCapture(a, true)) { p.diveHit = true; break; }
        }
      }
    }

    // aliens
    for (const a of this.aliens) a.update(dt, this);

    // projectiles
    for (const pr of this.projectiles) {
      pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      pr.life -= dt;
      if (pr.type === 'bolt') {
        if (p.state !== 'stunned' && !p.airborne && p.state !== 'prone' &&
            Math.hypot(p.x - pr.x, p.y - 4 - pr.y) < 7) {
          // a solid punt back along the bolt's flight, not just a stagger
          this.playerHit(null, 1.15, pr.vx * 0.9, pr.vy * 0.9);
          pr.life = 0;
        }
      } else if (pr.type === 'net') {
        for (const a of this.aliens) {
          if (!a.free || a.state === 'netted') continue;
          if (Math.hypot(a.x - pr.x, a.y - 4 - pr.y) < 9) {
            a.state = 'netted';
            a.stateT = this.fx.netgun >= 2 ? 4 : 3;
            a.vx = 0; a.vy = 0;
            a.cloaked = false;
            this.popup(a.x, a.y - 16, 'PINNED!', '#ffd75e');
            this.puff(a.x, a.y, '#ffd75e');
            pr.life = 0;
            break;
          }
        }
      }
      // walls stop projectiles
      const c = collide(this.map, pr.x, pr.y, 2, true);
      if (c.x !== pr.x || c.y !== pr.y) pr.life = 0;
    }
    this.projectiles = this.projectiles.filter(pr => pr.life > 0);

    // deposit at the van
    if (p.carried.length && Math.hypot(p.x - this.vanDoor.x, p.y - this.vanDoor.y) < DEPOSIT_R) {
      for (const a of p.carried) {
        a.state = 'deposited';
        this.captured++;
        if (!this.mission.sandbox) save.totalCaptured++;
      }
      sfx.deposit(); sfx.cash();
      this.popup(this.vanDoor.x, this.vanDoor.y - 24, `+${p.carried.length} SECURED`, '#59d98c');
      this.puff(this.vanDoor.x, this.vanDoor.y - 8, '#59d98c');
      p.carried.length = 0;
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

    // camera
    const lerp = 1 - Math.pow(0.001, dt);
    this.cam.x += (p.x - this.cam.x) * lerp;
    this.cam.y += (p.y - this.cam.y) * lerp;

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

    // mission end?
    const loose = this.aliens.filter(a => a.free || a.state === 'beaming');
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

  updateUfo(dt) {
    const u = this.ufo;
    if (!u) return;
    if (u.state === 'pick') {
      const next = this.aliens.find(a => a.free);
      if (!next) {
        u.state = 'leave';
        return;
      }
      u.target = next;
      u.state = 'travel';
    } else if (u.state === 'travel') {
      const t = u.target;
      if (!t.free) { u.state = 'pick'; return; }
      const tx = t.x, ty = t.y - 64;
      const d = Math.hypot(tx - u.x, ty - u.y);
      const sp = 170 * dt;
      if (d < sp || d < 3) { u.x = tx; u.y = ty; u.state = 'channel'; u.t = 0; }
      else { u.x += (tx - u.x) / d * sp; u.y += (ty - u.y) / d * sp; }
    } else if (u.state === 'channel') {
      const t = u.target;
      if (!t.free) { u.state = 'pick'; return; }
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

    // ---- build y-sorted render list ----
    const items = [];
    for (const pr of map.props) items.push({ y: pr.baseY, kind: 'prop', pr });
    for (const a of this.aliens) {
      if (a.state === 'carried' || a.state === 'deposited' || a.state === 'escaped') continue;
      if (a.state === 'hiding') {
        if (a.revealT > 0) items.push({ y: a.y + 6, kind: 'hidden', a });   // Noise Maker ping
        continue;
      }
      items.push({ y: a.y, kind: 'alien', a });
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

    // projectiles
    for (const pr of this.projectiles) {
      if (pr.type === 'bolt') {
        ctx.fillStyle = '#41f0d8';
        ctx.fillRect(Math.round(pr.x - 2 - camX), Math.round(pr.y - 2 - camY), 4, 4);
        ctx.fillStyle = '#e8f6ff';
        ctx.fillRect(Math.round(pr.x - 1 - camX), Math.round(pr.y - 1 - camY), 2, 2);
      } else {
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

    // edge arrows: carrying -> van; drones -> loose aliens; endgame -> everyone
    if (p.carried.length) this.edgeArrow(ctx, vw, vh, camX, camY, this.vanDoor.x, this.vanDoor.y, '#59d98c');
    const endgame = !this.mission.endless && (this.timer < 25 || this.beamPhase);
    for (const a of this.aliens) {
      if (!(a.free || a.state === 'beaming')) continue;
      if (this.droneTracks(a)) this.droneArrow(ctx, vw, vh, camX, camY, a);
      else if (endgame) this.edgeArrow(ctx, vw, vh, camX, camY, a.x, a.y, '#ffd75e');
    }

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
    ctx.globalAlpha = 0.25;
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
    this.shadow(ctx, x, y, 12);

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
      if (p.sprinting && Math.random() < 0.3) {
        this.particles.push({ x: p.x - p.dir.x * 6, y: p.y, vx: -p.dir.x * 10, vy: -4, life: 0.3, t: 0.3, color: '#c8c8d0', size: 1 });
      }
    }
  }

  drawAlien(ctx, a, camX, camY) {
    const set = this.assets.actors.aliens[a.tier];
    const x = Math.round(a.x - camX), y = Math.round(a.y - camY);
    const rise = Math.round(a.riseZ || 0);
    const lift = Math.round(a.z) + rise;

    if (a.state !== 'beaming') this.shadow(ctx, x, y, 9);

    let alpha = 1;
    if (a.cloaked) alpha = 0.13;
    ctx.globalAlpha = alpha;
    const img = set[a.facing] || set.down;
    const moving = Math.hypot(a.vx, a.vy) > 12;
    this.drawWalking(ctx, img, x - 5, y - 11 - lift, a.walkT, moving && a.z === 0);
    ctx.globalAlpha = 1;

    if (a.state === 'netted') {
      ctx.strokeStyle = '#ffd75e';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 6, y - 12 - lift, 12, 13);
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 6 - lift); ctx.lineTo(x + 6, y - 6 - lift);
      ctx.moveTo(x, y - 12 - lift); ctx.lineTo(x, y + 1 - lift);
      ctx.stroke();
    }
    if (a.state === 'stunned') this.drawStars(ctx, x, y - 16 - lift);
    if (a.state === 'attack') {
      ctx.fillStyle = '#ff5e6c';
      ctx.fillRect(x - 1, y - 18 - lift, 2, 4);
      ctx.fillRect(x - 1, y - 13 - lift, 2, 2);
    }
  }

  drawStars(ctx, x, y) {
    for (let i = 0; i < 3; i++) {
      const a = this.time * 6 + i * (Math.PI * 2 / 3);
      ctx.fillStyle = '#ffd75e';
      ctx.fillRect(Math.round(x + Math.cos(a) * 7) - 1, Math.round(y + Math.sin(a) * 2) - 1, 2, 2);
    }
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
