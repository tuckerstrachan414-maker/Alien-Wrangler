import { TILE } from './data/sprites.js';
import { MAP_BUILDERS } from './data/maps.js';
import { gearEffects, ALIEN_STATS } from './data/missions.js';
import { buildNav, collide } from './nav.js';
import { Player, Alien } from './entities.js';
import { input, consumePress, setButtonCooling } from './input.js';
import { sfx } from './audio.js';
import { save } from './save.js';

const DEPOSIT_R = 30;

export class Game {
  constructor(assets) {
    this.assets = assets;   // { tiles, actors:{player,aliens}, van, ufo }
    this.onEnd = null;      // set by ui
    this.running = false;
  }

  startMission(mission) {
    this.mission = mission;
    this.fx = gearEffects(save.gear);
    this.map = MAP_BUILDERS[mission.map]();
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

    this.projectiles = [];
    this.particles = [];
    this.popups = [];
    this.cam = { x: this.player.x, y: this.player.y };
    this.shake = 0;
    this.msg = null; this.msgT = 0;
    this.running = true;
    this.time = 0;

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
    this.projectiles.push({
      type: 'net', x: p.x + p.dir.x * 8, y: p.y - 4 + p.dir.y * 8,
      vx: p.dir.x * 210, vy: p.dir.y * 210, life: 0.65,
    });
  }

  /* ---------------- update ---------------- */

  update(dt) {
    if (!this.running) return;
    this.time += dt;
    const p = this.player;

    // actions
    if (consumePress('jump')) { if (p.tryJump()) sfx.jump(); }
    if (consumePress('dash')) { if (p.tryDash()) { sfx.dash(); this.puff(p.x, p.y); if (this.stealth) this.noisePulse(p.x, p.y, 18); } }
    if (consumePress('dive')) { if (p.tryDive()) sfx.dive(); }
    if (consumePress('grab')) this.grabAttempt();
    if (consumePress('net')) this.fireNet();

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
          this.playerHit(null, 1.15, pr.vx * 0.4, pr.vy * 0.4);
          pr.life = 0;
        }
      } else if (pr.type === 'net') {
        for (const a of this.aliens) {
          if (!a.free || a.state === 'netted') continue;
          if (Math.hypot(a.x - pr.x, a.y - 4 - pr.y) < 9) {
            a.state = 'netted';
            a.stateT = this.fx.netgun >= 2 ? 4 : 3;
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
        save.totalCaptured++;
      }
      sfx.deposit(); sfx.cash();
      this.popup(this.vanDoor.x, this.vanDoor.y - 24, `+${p.carried.length} SECURED`, '#59d98c');
      this.puff(this.vanDoor.x, this.vanDoor.y - 8, '#59d98c');
      p.carried.length = 0;
    }

    // mission clock
    if (this.phase === 'play') {
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
    setButtonCooling('btn-net', p.netCd > 0);

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

  noiseComplaint() {
    this.suspicion = 45;
    this.fines++;
    this.shake = 6;
    sfx.alert();
    this.announce(`NEIGHBORS WOKE UP!  -$${this.mission.escapeCost}`, 2.4);
    for (const h of this.homes) h.alertT = 1.8;
    for (const a of this.aliens) a.flush(this);   // everyone scatters
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

  finish() {
    if (!this.running) return;
    this.running = false;
    const m = this.mission;
    const deduction = (this.escaped + this.fines) * m.escapeCost;
    const pay = this.projectedPay();
    const cleared = this.captured > 0;
    if (cleared) sfx.win(); else sfx.fail();
    const results = {
      mission: m, captured: this.captured, escaped: this.escaped,
      total: this.totalAliens, basePay: m.pay, deduction, pay, cleared,
      fines: this.fines,
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

    // hide-spot shimmer for goggles
    const fx = this.fx;

    // ---- build y-sorted render list ----
    const items = [];
    for (const pr of map.props) items.push({ y: pr.baseY, kind: 'prop', pr });
    for (const a of this.aliens) {
      if (a.state === 'carried' || a.state === 'deposited' || a.state === 'escaped') continue;
      if (a.state === 'hiding') {
        const dist = Math.hypot(a.x - p.x, a.y - p.y);
        if (fx.goggleRange > dist) items.push({ y: a.y + 6, kind: 'hidden', a });
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
        // goggle marker
        const a = it.a;
        const by = Math.sin(this.time * 6) * 2;
        ctx.globalAlpha = 0.35;
        const spr = this.assets.actors.aliens[a.tier].down;
        ctx.drawImage(spr, Math.round(a.x - 5 - camX), Math.round(a.y - 12 - camY));
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#41f0d8';
        ctx.fillRect(Math.round(a.x - 1 - camX), Math.round(a.y - 22 + by - camY), 3, 3);
        ctx.fillRect(Math.round(a.x - camX), Math.round(a.y - 19 + by - camY), 1, 2);
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

    // edge arrows: carrying -> van; endgame -> loose aliens
    if (p.carried.length) this.edgeArrow(ctx, vw, vh, camX, camY, this.vanDoor.x, this.vanDoor.y, '#59d98c');
    if (this.timer < 25 || this.beamPhase) {
      for (const a of this.aliens) {
        if (a.free || a.state === 'beaming') this.edgeArrow(ctx, vw, vh, camX, camY, a.x, a.y, '#ffd75e');
      }
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
    if (a.cloaked) {
      const dist = Math.hypot(a.x - this.player.x, a.y - this.player.y);
      alpha = this.fx.goggleRange > dist ? 0.55 : 0.13;
    }
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

  edgeArrow(ctx, vw, vh, camX, camY, wx, wy, color) {
    const sx = wx - camX, sy = wy - camY;
    if (sx > 8 && sx < vw - 8 && sy > 8 && sy < vh - 8) return; // on screen
    const cx = vw / 2, cy = vh / 2;
    let dx = sx - cx, dy = sy - cy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const m = 10;
    let ax = cx + dx * (cx - m) / Math.max(Math.abs(dx), 0.001);
    let ay = cy + dy * (cy - m) / Math.max(Math.abs(dy), 0.001);
    // clamp properly: scale so the point sits on screen bounds
    const scaleX = dx !== 0 ? (cx - m) / Math.abs(dx) : 1e9;
    const scaleY = dy !== 0 ? (cy - m) / Math.abs(dy) : 1e9;
    const s = Math.min(scaleX, scaleY);
    ax = cx + dx * s; ay = cy + dy * s;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(4, 0); ctx.lineTo(-3, -3); ctx.lineTo(-3, 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
