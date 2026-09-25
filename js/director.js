// Shared machinery for a story scene's director (tutorial.js is Scene 1,
// barnyard.js is Scene 2). A director rides along with Game: game.js tells
// it what happens (on()), runs it every frame (update()) and lets it draw
// (renderWorld() in world space, renderScreen() over everything). While
// `locked` it has the controls; with `ownsPlayer` it walks the agent itself.
//
// Here: the objective panel, how-to hints worded for the controls in use
// (with the matching control glowing), Handler Voss on the radio, objective
// markers, the SKIP button, cutscene letterboxing and fades, and walking
// the agent along a scripted path.
import { sfx } from './audio.js';
import { getControlMode, inputMethod } from './input.js';
import { overlapsJumpable } from './nav.js';

const GRAV = 430;

export class StoryDirector {
  // script: { objectives: {key: text}, hints: {key: {buttons, gestures, keys, pad}}, glow: {scheme: {key: elementId}} }
  constructor(game, script = {}) {
    this.game = game;
    this.objectives = script.objectives || {};
    this.hints = script.hints || {};
    this.glowTargets = script.glow || {};
    this.t = 0;
    this.stepT = 0;
    this.step = 'intro';
    this.locked = false;          // true while a cutscene has the controls
    this.ownsPlayer = false;      // ...and walks the agent itself
    this.moveInput = { move: { x: 0, y: 0 }, mag: 0, sprint: false, sprintToggle: false, sprintEdge: false, edgeSpent: false };
    this.seen = {};               // one-off lines/tips already used
    this.radioQ = [];
    this.radioT = 0;
    this.tipT = 0;
    this.glowEl = null;
    this.scheme = null;
    this.marker = null;           // {x, y, kind} objective marker on the map
    this.cs = null;               // cutscene state (letterbox, fade, phase...)
    this.buildDom();
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
    this.skipEl.addEventListener('click', (e) => { e.stopPropagation(); sfx.click(); this.onSkip(); });

    hud.appendChild(this.el);
    hud.appendChild(this.radioEl);
    hud.appendChild(this.skipEl);
  }

  // SKIP during a cutscene: by default, straight to the end of the scene.
  onSkip() { this.endScene(); }

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
    const h = this.hints[key];
    return h ? h[this.currentScheme()] || h.keys : '';
  }

  objective(key, count) {
    this.objKey = key;
    this.objText.textContent = this.objectives[key] + (count !== undefined ? ` ${count}` : '');
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
    const targets = key && this.glowTargets[this.currentScheme()];
    const el = targets && targets[key] ? document.getElementById(targets[key]) : null;
    if (el === this.glowEl) return;
    if (this.glowEl) this.glowEl.classList.remove('tut-glow');
    this.glowEl = el;
    if (el) el.classList.add('tut-glow');
  }

  // `keep`: a line that matters (story beats) holds its place in the queue
  radio(text, keep = false) {
    if (!text) return;
    text = text.toUpperCase();              // the whole UI speaks in capitals
    if (this.radioCur === text || this.radioQ.some(q => q.text === text)) return;
    // otherwise only the newest line waits: an old "grab it!" is no use once
    // it's grabbed
    this.radioQ = this.radioQ.filter(q => q.keep);
    this.radioQ.push({ text, keep });
  }

  // Tip timer, control scheme changes, the radio. Call once a frame while
  // the scene is in play.
  tickUi(dt) {
    if (this.tipT > 0) { this.tipT -= dt; if (this.tipT <= 0) this.paintHints(); }
    if (this.scheme !== this.currentScheme()) this.paintHints();
    this.updateRadio(dt);
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
      this.radioCur = this.radioQ.shift().text;
      this.radioT = 0;
      this.radioShown = -1;
      this.radioFrame = null;
      this.radioText.textContent = '';
      this.radioEl.classList.remove('hidden');
      sfx.radio();
    }
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

  /* ---------------- cutscenes ---------------- */

  // Take the controls: HUD panels and touch controls step aside, the agent
  // stops dead, SKIP shows if `skip`.
  enterCutscene({ skip = true } = {}) {
    const p = this.game.player;
    this.locked = true;
    this.marker = null;
    this.setGlow(null);
    this.radioQ.length = 0;
    this.radioCur = null;
    for (const e of [this.el, this.radioEl]) e.classList.add('hidden');
    this.skipEl.classList.toggle('hidden', !skip);
    document.getElementById('hud').classList.add('cinematic');
    document.getElementById('controls').classList.add('hidden');
    this.moveInput.move.x = 0; this.moveInput.move.y = 0; this.moveInput.mag = 0;
    p.vx = 0; p.vy = 0;
  }

  // Hand the controls back.
  exitCutscene() {
    this.locked = false;
    this.ownsPlayer = false;
    this.el.classList.remove('hidden');
    this.skipEl.classList.add('hidden');
    document.getElementById('hud').classList.remove('cinematic');
    document.getElementById('controls').classList.remove('hidden');
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
    this.game.finishStory({ fled: this.fled || 0 });
  }

  /* ---------------- drawing ---------------- */

  // World-space: the objective marker (a pulsing ring + bobbing arrow, and an
  // edge arrow when it's off screen).
  renderWorld(ctx, camX, camY, vw, vh) {
    const g = this.game, t = this.t;
    const m = this.marker;
    if (!m) return;
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

  // One pixel "!" (2px wide), outlined, top-left at (x, y).
  bang(ctx, x, y, col) {
    ctx.fillStyle = '#14141e';
    ctx.fillRect(x - 1, y - 1, 4, 8); ctx.fillRect(x - 1, y + 8, 4, 4);
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 2, 6); ctx.fillRect(x, y + 9, 2, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, 1, 2);
  }

  // Screen-space: letterbox bars and fades for a cutscene.
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
