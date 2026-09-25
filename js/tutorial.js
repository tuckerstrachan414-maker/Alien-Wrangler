// Stage 1, Scene 1 (Farm Fields) director: the tutorial, and the cutscene
// that ends it.
//
// Tutorial steps, each with an objective and a how-to hint worded for the
// controls actually in use (touch buttons / no-buttons gestures / keyboard /
// gamepad), with the matching on-screen control glowing:
//   move   -> walk a little
//   find   -> flush a hiding alien (the nearest one is marked at first)
//   grab   -> catch it (sprint + dive hints if it gets away from you)
//   load   -> carry it into the van's glow
//   secure -> secure 3 in all. Jump / dash / tackle / missed-dive tips turn
//             up the first time they matter; Handler Voss chimes in on the radio.
//
// Once the 3rd alien is secured: STAMPEDE. The other twelve break cover all
// over the fields and bolt north down the dirt road; the agent does a
// double-take ("!!!"), then gives chase up the road, and the scene ends.
import { sfx } from './audio.js';
import { getControlMode, inputMethod } from './input.js';
import { overlapsJumpable, findPath } from './nav.js';
import { RADIO, OBJECTIVES, CONTROL_HINTS, TIPS, GLOW_TARGETS } from './data/stage1.js';

const GRAV = 430;
const rand = (a, b) => a + Math.random() * (b - a);

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.stepT = 0;
    this.step = 'intro';          // intro | move | find | grab | load | secure | stampede
    this.locked = false;          // true while the stampede cutscene has the controls
    this.ownsPlayer = false;      // ...and walks the agent itself
    this.moveInput = { move: { x: 0, y: 0 }, mag: 0, sprint: false, sprintToggle: false, sprintEdge: false, edgeSpent: false };
    this.seen = {};               // one-off tips already shown
    this.moved = 0;
    this.lastPos = { x: game.player.x, y: game.player.y };
    this.sinceFlush = 0;
    this.chaseSlowT = 0;
    this.radioQ = [];
    this.radioT = 0;
    this.tipT = 0;
    this.glowEl = null;
    this.scheme = null;
    this.marker = null;           // {x, y, kind} objective marker on the map
    this.nagT = -99;
    this.cs = null;               // stampede cutscene state

    this.placeTutorAlien();
    this.buildDom();
  }

  // The first alien always hides in the little corn patch by the van, so a
  // brand-new player finds one without wandering the whole map.
  placeTutorAlien() {
    const g = this.game, spot = g.map.tutorSpot;
    const a = g.aliens[0];
    if (!spot || !a) return;
    for (const o of g.aliens) {
      if (o === a || o.hideSpot !== spot) continue;
      const free = g.hideSpots.find(s => s !== spot && !g.aliens.some(q => q.hideSpot === s) &&
        Math.hypot(s.x - g.map.spawn.x, s.y - g.map.spawn.y) > 140);
      if (free) { o.hideSpot = free; o.x = free.x; o.y = free.y; }
    }
    a.x = spot.x; a.y = spot.y; a.hideSpot = spot;
    this.tutorAlien = a;
  }

  /* ---------------- DOM: objective, hints, radio, skip ---------------- */

  buildDom() {
    const hud = document.getElementById('hud');
    this.el = document.createElement('div');
    this.el.className = 'tut';
    this.el.innerHTML =
      '<div class="tut-obj hidden"><i>OBJECTIVE</i><b></b></div>' +
      '<div class="tut-hint hidden"></div>' +
      '<div class="tut-hint alt hidden"></div>';
    this.objEl = this.el.querySelector('.tut-obj');
    this.objText = this.objEl.querySelector('b');
    const hints = this.el.querySelectorAll('.tut-hint');
    this.hintEl = hints[0];
    this.hint2El = hints[1];

    this.radioEl = document.createElement('div');
    this.radioEl.className = 'radio hidden';
    this.radioEl.innerHTML = '<canvas class="radio-face pixel-canvas" width="28" height="30"></canvas>' +
      '<div class="radio-body"><b>VOSS</b><span></span></div>';
    this.radioFace = this.radioEl.querySelector('canvas');
    this.radioText = this.radioEl.querySelector('span');

    this.skipEl = document.createElement('button');
    this.skipEl.className = 'cine-skip tut-skip hidden';
    this.skipEl.textContent = 'SKIP';
    this.skipEl.addEventListener('click', (e) => { e.stopPropagation(); sfx.click(); this.endScene(); });

    hud.appendChild(this.el);
    hud.appendChild(this.radioEl);
    hud.appendChild(this.skipEl);
  }

  destroy() {
    this.setGlow(null);
    for (const e of [this.el, this.radioEl, this.skipEl]) if (e) e.remove();
    const hud = document.getElementById('hud');
    if (hud) hud.classList.remove('cinematic');
  }

  // Which wording / on-screen control fits the controls in use right now.
  currentScheme() {
    const m = inputMethod();
    if (m === 'touch') return getControlMode() === 'gestures' ? 'gestures' : 'buttons';
    return m;
  }

  hintText(key) {
    const h = CONTROL_HINTS[key];
    return h ? h[this.currentScheme()] || h.keys : '';
  }

  objective(key, count) {
    this.objKey = key;
    this.objText.textContent = OBJECTIVES[key] + (count !== undefined ? ` ${count}` : '');
    this.objEl.classList.remove('hidden');
    this.objEl.classList.remove('flash');
    void this.objEl.offsetWidth;          // restart the flash animation
    this.objEl.classList.add('flash');
    sfx.objective();
  }

  // Main how-to line (and the control it names glows).
  hint(key) {
    this.hintKey = key;
    this.paintHints();
  }

  // Second line: an extra tip under the main hint (sprint, dive...).
  hint2(key) {
    if (this.hint2Key === key) return;
    this.hint2Key = key;
    this.paintHints();
  }

  // A one-off tip borrows the second line for a few seconds.
  tip(text, dur = 5, glowKey = null) {
    this.tipText = text;
    this.tipGlow = glowKey;
    this.tipT = dur;
    this.paintHints();
  }

  paintHints() {
    const main = this.hintKey ? this.hintText(this.hintKey) : '';
    this.hintEl.textContent = main;
    this.hintEl.classList.toggle('hidden', !main);
    let alt = '';
    if (this.tipT > 0) alt = this.tipText;
    else if (this.hint2Key) alt = this.hintText(this.hint2Key);
    this.hint2El.textContent = alt;
    this.hint2El.classList.toggle('hidden', !alt);
    const glowKey = this.tipT > 0 && this.tipGlow ? this.tipGlow : this.hint2Key || this.hintKey;
    this.setGlow(glowKey);
    this.scheme = this.currentScheme();
  }

  setGlow(key) {
    const targets = key && GLOW_TARGETS[this.currentScheme()];
    const el = targets && targets[key] ? document.getElementById(targets[key]) : null;
    if (el === this.glowEl) return;
    if (this.glowEl) this.glowEl.classList.remove('tut-glow');
    this.glowEl = el;
    if (el) el.classList.add('tut-glow');
  }

  radio(text) {
    if (!text) return;
    text = text.toUpperCase();              // the whole UI speaks in capitals
    if (this.radioCur === text) return;
    // only the newest line waits: an old "grab it!" is no use once it's grabbed
    this.radioQ = [text];
  }

  /* ---------------- events from the game ---------------- */

  on(evt, a) {
    if (this.step === 'stampede') return;
    const g = this.game;
    switch (evt) {
      case 'flush':
        this.sinceFlush = 0;
        if (this.step === 'find' || this.step === 'move' || this.step === 'intro') this.go('grab', a);
        else if (this.step === 'secure' && !this.seen.sprint2 && !g.player.sprinting) {
          this.seen.sprint2 = true;
          this.hint2('sprint');
        }
        break;
      case 'grab':
        if (['intro', 'move', 'find', 'grab'].includes(this.step)) this.go('load');
        break;
      case 'secure':
        if (g.captured >= (g.mission.goal || 3)) { this.startStampede(); return; }
        if (this.step !== 'secure') this.go('secure');
        else this.objective('secure', `${g.captured}/${g.mission.goal}`);
        this.radio(g.captured === 1 ? RADIO.secured1 : RADIO.secured2);
        if (g.captured === 2 && !this.seen.dash) { this.seen.dash = true; this.tip(this.hintText('dash'), 6, 'dash'); }
        break;
      case 'hit':
        if (!this.seen.tackled) {
          this.seen.tackled = true;
          this.radio(RADIO.tackled);
          this.tip(TIPS.tackled, 6);
        }
        break;
      case 'diveMiss':
        if (!this.seen.diveMiss) { this.seen.diveMiss = true; this.tip(TIPS.diveMiss, 5); }
        break;
      case 'jump':
        this.seen.jump = true;
        break;
    }
  }

  go(step, target) {
    this.step = step;
    this.stepT = 0;
    this.hint2Key = null;
    this.marker = null;
    const g = this.game;
    switch (step) {
      case 'move':
        this.objective('move');
        this.hint('move');
        break;
      case 'find':
        this.objective('find');
        this.hint('find');
        this.radio(RADIO.search);
        break;
      case 'grab':
        this.target = target || null;
        this.objective('grab');
        this.hint('grab');
        this.radio(RADIO.flushed);
        break;
      case 'load':
        this.objective('load');
        this.hint('load');
        this.radio(RADIO.grabbed);
        break;
      case 'secure':
        this.objective('secure', `${g.captured}/${g.mission.goal}`);
        this.hint(null);
        break;
    }
  }

  /* ---------------- per frame ---------------- */

  update(dt) {
    this.t += dt;
    this.stepT += dt;
    if (this.step === 'stampede') { this.updateStampede(dt); return; }
    const g = this.game, p = g.player;

    // how far the agent has walked (for the first objective)
    this.moved += Math.hypot(p.x - this.lastPos.x, p.y - this.lastPos.y);
    this.lastPos.x = p.x; this.lastPos.y = p.y;
    this.sinceFlush += dt;

    if (this.step === 'intro') {
      if (this.t > 0.9 && !this.saidHello) { this.saidHello = true; this.radio(RADIO.start); }
      if (this.t > 1.6) this.go('move');
    } else if (this.step === 'move') {
      if (this.moved > 60 && this.stepT > 1.2) this.go('find');
    } else if (this.step === 'find') {
      // mark the nearest hiding alien after a moment (the tutor one first),
      // and make it rustle more often so the "watch for rustling" lands
      const a = this.tutorAlien && this.tutorAlien.state === 'hiding' ? this.tutorAlien : this.nearestHidden();
      if (a) {
        a.rustleT = Math.min(a.rustleT, 1.3);
        if (this.stepT > 2.5) this.marker = { x: a.x, y: a.y, kind: 'find' };
      }
    } else if (this.step === 'grab') {
      const a = this.target;
      if (!a || !a.free) {
        // it slipped back into cover (or something else happened to it)
        if (a && a.state === 'hiding') { this.radio(RADIO.lost); this.go('find'); }
      } else {
        const d = Math.hypot(a.x - p.x, a.y - p.y);
        // falling behind on foot: teach sprint; close but not close enough: dive
        if (a.state === 'running' && d > 45 && !p.sprinting) this.chaseSlowT += dt; else this.chaseSlowT = 0;
        if (this.chaseSlowT > 1.0) this.hint2('sprint');
        else if (this.stepT > 5 && d < 95 && !this.hint2Key) this.hint2('dive');
        if (this.hint2Key === 'sprint' && p.sprinting) this.hint2(this.stepT > 5 ? 'dive' : null);
      }
    } else if (this.step === 'load') {
      this.marker = { x: g.vanDoor.x, y: g.vanDoor.y, kind: 'van' };
      if (!p.carried.length) {
        // dropped it (tackled): back to catching it
        const loose = g.aliens.find(a => a.free && a.state !== 'hiding');
        this.go('grab', loose);
      }
    } else if (this.step === 'secure') {
      // lost for a while? ping the nearest hiding alien
      if (this.sinceFlush > 25 && !p.carried.length) {
        this.sinceFlush = 0;
        const a = this.nearestHidden();
        if (a) { this.radio(RADIO.lost); this.helpT = 6; this.helpAlien = a; }
      }
      if (this.helpT > 0) {
        this.helpT -= dt;
        if (this.helpAlien && this.helpAlien.state === 'hiding') this.marker = { x: this.helpAlien.x, y: this.helpAlien.y, kind: 'find' };
        else this.helpT = 0;
      } else if (!p.carried.length) this.marker = null;
      if (p.carried.length) this.marker = { x: g.vanDoor.x, y: g.vanDoor.y, kind: 'van' };
      if (this.hint2Key === 'sprint' && p.sprinting) this.hint2(null);
    }

    // walked into a fence or bale without jumping: teach jump (once)
    if (!this.seen.jumpTip && !this.seen.jump && p.moving && p.z === 0 && this.t > 3 &&
        overlapsJumpable(g.map, p.x + p.dir.x * 4, p.y + p.dir.y * 4, p.r + 1)) {
      this.seen.jumpTip = true;
      this.tip(this.hintText('jump'), 6, 'jump');
    }
    // heading out the north exit before the job's done
    const map = g.map;
    if (map.roadX && p.y < 96 && Math.abs(p.x - map.roadX(p.y)) < 40 && this.t - this.nagT > 12) {
      this.nagT = this.t;
      this.radio(RADIO.exitNag);
    }

    // tip timer, control scheme changes, radio
    if (this.tipT > 0) { this.tipT -= dt; if (this.tipT <= 0) this.paintHints(); }
    if (this.scheme !== this.currentScheme()) this.paintHints();
    this.updateRadio(dt);
  }

  nearestHidden() {
    const g = this.game, p = g.player;
    let best = null, bd = 1e9;
    for (const a of g.aliens) {
      if (a.state !== 'hiding') continue;
      const d = Math.hypot(a.x - p.x, a.y - p.y);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  updateRadio(dt) {
    if (this.radioCur) {
      this.radioT += dt;
      const shown = Math.min(this.radioCur.length, Math.floor(this.radioT * 55));
      if (shown !== this.radioShown) {
        this.radioShown = shown;
        this.radioText.textContent = this.radioCur.slice(0, shown);
        if (shown < this.radioCur.length && shown % 4 === 0) sfx.voice();
      }
      const talking = shown < this.radioCur.length;
      const frame = talking && Math.floor(this.radioT * 9) % 2 ? 'open' : 'closed';
      if (frame !== this.radioFrame) {
        this.radioFrame = frame;
        const x = this.radioFace.getContext('2d');
        x.clearRect(0, 0, 28, 30);
        x.drawImage(this.game.assets.voss.portrait[frame], 0, 0);
      }
      // linger long enough to read, less if something newer is waiting
      const hold = this.radioQ.length ? 0.9 : 2.2 + this.radioCur.length / 30;
      if (this.radioT > this.radioCur.length / 55 + hold) {
        this.radioCur = null;
        this.radioEl.classList.add('hidden');
      }
    } else if (this.radioQ.length) {
      this.radioCur = this.radioQ.shift();
      this.radioT = 0;
      this.radioShown = -1;
      this.radioFrame = null;
      this.radioText.textContent = '';
      this.radioEl.classList.remove('hidden');
      sfx.radio();
    }
  }

  /* ---------------- the stampede ---------------- */

  startStampede() {
    const g = this.game, p = g.player, map = g.map;
    this.step = 'stampede';
    this.locked = true;
    this.marker = null;
    this.setGlow(null);
    this.radioQ.length = 0;
    this.radioCur = null;
    for (const e of [this.el, this.radioEl]) e.classList.add('hidden');
    this.skipEl.classList.remove('hidden');
    document.getElementById('hud').classList.add('cinematic');
    document.getElementById('controls').classList.add('hidden');
    this.moveInput.move.x = 0; this.moveInput.move.y = 0; this.moveInput.mag = 0;
    p.vx = 0; p.vy = 0;

    // everyone still out there, nearest first, freezes where they are
    const road = map.road;
    this.runners = g.aliens
      .filter(a => a.free || a.state === 'airlift')
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    this.runners.forEach((a, i) => {
      a.popAt = 0.7 + i * 0.13;
      if (a.state !== 'hiding') {
        a.state = 'scripted';
        a.script = { path: [], i: 0, speed: 0, wait: 99, face: { x: map.roadX(a.y), y: a.y } };
      }
    });
    this.cs = { t: 0, phase: 'bolt', lb: 0, fade: 0, marks: 0 };
    this.fled = this.runners.length;
    this.roadTail = (y) => {
      // the rest of the road north of y, then out through the gap in the trees
      const pts = road.filter(q => q.y < y - 8).sort((a, b) => b.y - a.y);
      pts.push({ x: map.roadX(30), y: 30 }, { x: map.exit.x, y: map.exit.y });
      return pts;
    };
  }

  // Route from wherever the alien is onto the road, then north off the map.
  routeFor(a) {
    const g = this.game, map = g.map;
    const jy = Math.max(90, Math.min(map.h - 90, a.y - 30));
    const join = { x: map.roadX(jy), y: jy };
    const path = findPath(g.nav, a.x, a.y, join.x, join.y) || [join];
    return path.concat(this.roadTail(jy));
  }

  updateStampede(dt) {
    const g = this.game, p = g.player, map = g.map, cs = this.cs;
    cs.t += dt;
    cs.lb = Math.min(1, cs.lb + dt * 2.5);

    if (cs.phase === 'bolt') {
      if (cs.t > 0.55 && !cs.rumbled) { cs.rumbled = true; sfx.stampede(); g.shake = 3; }
      // pop them out of cover one by one and send them running
      let k = 0;
      for (const a of this.runners) {
        if (a.popped || cs.t < a.popAt) continue;
        a.popped = true;
        if (a.state === 'hiding') g.rustle(a);
        a.state = 'scripted';
        a.script = { path: this.routeFor(a), i: 0, speed: rand(125, 150), wait: 0 };
        g.popup(a.x, a.y - 16, '!', '#ffd75e');
        g.puff(a.x, a.y, '#8fe870');
        if (k++ % 3 === 0) sfx.squeak();
      }
      // camera rides with the pack
      const on = this.runners.filter(a => a.popped && a.state === 'scripted' && a.y > 20);
      if (on.length && cs.t > 0.9) {
        const cx = on.reduce((s, a) => s + a.x, 0) / on.length;
        const cy = on.reduce((s, a) => s + a.y, 0) / on.length;
        g.camTarget = { x: cx, y: Math.max(70, cy - 20) };
        g.camEase = 0.08;
      }
      const gone = this.runners.filter(a => a.state === 'fled').length;
      if ((gone >= this.runners.length * 0.75 && cs.t > 4) || cs.t > 9.5) {
        cs.phase = 'look'; cs.pt = 0;
        g.camTarget = { x: p.x, y: p.y };
        g.camEase = 0.03;
      }
    } else if (cs.phase === 'look') {
      cs.pt += dt;
      if (cs.pt > 1.1) {
        cs.phase = 'startle'; cs.pt = 0;
        this.ownsPlayer = true;
        // face the road
        const rx = map.roadX(p.y) - p.x;
        p.facing = Math.abs(rx) > 20 ? (rx > 0 ? 'right' : 'left') : 'up';
        p.state = 'normal'; p.vx = 0; p.vy = 0;
      }
    } else if (cs.phase === 'startle') {
      cs.pt += dt;
      // "!" "!" "!" pop in over his head, with a jump of surprise and a shake
      const marks = Math.min(3, Math.floor(cs.pt / 0.16) + 1);
      if (marks > cs.marks) {
        cs.marks = marks;
        if (marks === 1) { sfx.startle(); p.zv = 150; p.z = 0.1; g.shake = 2.5; }
      }
      if (cs.pt > 0.75 && !cs.hop2) { cs.hop2 = true; p.zv = 90; p.z = 0.1; }
      this.integrateZ(p, dt);
      p.moving = false;
      if (cs.pt > 1.7) {
        cs.phase = 'dash'; cs.pt = 0;
        g.camTarget = null;
        const jy = Math.max(90, Math.min(map.h - 90, p.y));
        this.playerPath = findPath(g.nav, p.x, p.y, map.roadX(jy), jy) || [{ x: map.roadX(jy), y: jy }];
        this.playerPath = this.playerPath.concat(this.roadTail(jy));
        this.pathI = 0;
      }
    } else if (cs.phase === 'dash') {
      // off after them... quick fade, then cut to him already on the road
      cs.pt += dt;
      this.runPlayer(dt, 124);
      cs.fade = Math.max(0, Math.min(1, (cs.pt - 0.6) / 0.35));
      if (cs.pt > 1.0) this.cutToRoad();
    } else if (cs.phase === 'road') {
      cs.pt += dt;
      this.runPlayer(dt, 124);
      cs.fade = Math.max(0, 1 - cs.pt / 0.35);
      if (p.y < 76 || cs.pt > 3.4) { cs.phase = 'out'; cs.pt = 0; }
    } else if (cs.phase === 'out') {
      cs.pt += dt;
      this.runPlayer(dt, 124);
      cs.fade = Math.min(1, cs.pt / 0.9);
      if (cs.pt > 1.1) this.endScene();
    }
  }

  // The agent, on the road some way short of the tree line, still chasing
  // the last few stragglers.
  cutToRoad() {
    const g = this.game, p = g.player, map = g.map, cs = this.cs;
    cs.phase = 'road'; cs.pt = 0;
    const y0 = 260;
    p.x = map.roadX(y0); p.y = y0; p.z = 0; p.zv = 0;
    g.cam.x = p.x; g.cam.y = p.y - 40;
    this.playerPath = this.roadTail(y0);
    this.pathI = 0;
    const lag = this.runners.slice(-3);
    lag.forEach((a, i) => {
      const y = 180 - i * 34;
      a.x = map.roadX(y) + rand(-8, 8); a.y = y; a.z = 0; a.zv = 0;
      a.state = 'scripted';
      a.script = { path: this.roadTail(y), i: 0, speed: 112, wait: 0 };
    });
  }

  // Walk the agent along this.playerPath at `speed`, animating as he goes.
  runPlayer(dt, speed) {
    const p = this.game.player;
    const path = this.playerPath || [];
    while (this.pathI < path.length && Math.hypot(path[this.pathI].x - p.x, path[this.pathI].y - p.y) < 6) this.pathI++;
    const wp = path[this.pathI];
    if (!wp) { p.moving = false; return; }
    const dx = wp.x - p.x, dy = wp.y - p.y, d = Math.hypot(dx, dy) || 1;
    p.x += dx / d * speed * dt; p.y += dy / d * speed * dt;
    p.dir.x = dx / d; p.dir.y = dy / d;
    p.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    p.moving = true;
    p.sprinting = true;
    p.walkT += dt * 11;
    if (p.z === 0 && overlapsJumpable(this.game.map, p.x, p.y, p.r)) { p.zv = 110; p.z = 0.1; }
    this.integrateZ(p, dt);
  }

  integrateZ(p, dt) {
    if (p.z > 0 || p.zv !== 0) {
      p.z += p.zv * dt; p.zv -= GRAV * dt;
      if (p.z <= 0) { p.z = 0; p.zv = 0; }
    }
  }

  endScene() {
    if (this.ended) return;
    this.ended = true;
    sfx.sceneClear();
    const g = this.game;
    g.finishStory({ fled: this.fled || 0 });
  }

  /* ---------------- drawing ---------------- */

  // World-space: objective markers, and the agent's "!!!".
  renderWorld(ctx, camX, camY, vw, vh) {
    const g = this.game, t = this.t;
    const m = this.marker;
    if (m) {
      const x = Math.round(m.x - camX), y = Math.round(m.y - camY);
      const col = m.kind === 'van' ? '#59d98c' : '#ffd75e';
      const pulse = (t * 1.4) % 1;
      ctx.globalAlpha = 1 - pulse;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y + 2, 6 + pulse * 10, (6 + pulse * 10) * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      // bobbing arrow overhead
      const ay = y - (m.kind === 'van' ? 34 : 26) + Math.round(Math.sin(t * 5) * 2);
      ctx.fillStyle = '#14141e';
      ctx.fillRect(x - 3, ay - 1, 7, 3); ctx.fillRect(x - 2, ay + 2, 5, 1); ctx.fillRect(x - 1, ay + 3, 3, 1); ctx.fillRect(x, ay + 4, 1, 1);
      ctx.fillStyle = col;
      ctx.fillRect(x - 2, ay, 5, 1); ctx.fillRect(x - 1, ay + 1, 3, 1); ctx.fillRect(x, ay + 2, 1, 1);
      g.edgeArrow(ctx, vw, vh, camX, camY, m.x, m.y, col);
    }

    const cs = this.cs;
    if (cs && cs.phase === 'startle') {
      const p = g.player;
      const hx = Math.round(p.x - camX), hy = Math.round(p.y - camY - 21 - p.z);
      for (let i = 0; i < cs.marks; i++) {
        const age = cs.pt - i * 0.16;
        const pop = age < 0.1 ? 3 : 0;                    // each one springs up as it lands
        const ox = [-7, 0, 7][i], oy = [2, 0, 2][i];
        this.bang(ctx, hx + ox, hy + oy - pop - 6, i === 1 ? '#ff5e6c' : '#ffd75e');
      }
    }
  }

  // One pixel "!" (2px wide), outlined, top-left at (x, y).
  bang(ctx, x, y, col) {
    ctx.fillStyle = '#14141e';
    ctx.fillRect(x - 1, y - 1, 4, 8); ctx.fillRect(x - 1, y + 8, 4, 4);
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 2, 6); ctx.fillRect(x, y + 9, 2, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, 1, 2);
  }

  // Screen-space: letterbox bars and fades for the stampede.
  renderScreen(ctx, vw, vh) {
    const cs = this.cs;
    if (!cs) return;
    const bar = Math.round(vh * 0.1 * cs.lb);
    ctx.fillStyle = '#000';
    if (bar > 0) { ctx.fillRect(0, 0, vw, bar); ctx.fillRect(0, vh - bar, vw, bar); }
    if (cs.fade > 0) {
      ctx.globalAlpha = cs.fade;
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalAlpha = 1;
    }
  }
}
