// Shared machinery for the story cutscenes set in the ops room: Stage 1's
// opening (intro.js) and Stage 2's signal briefing (signalBriefing.js).
//
//   DialogueBox      the DOM in #cine: talking portrait, the speaker's name,
//                    the line typing itself out (a word the script writes in
//                    capitals keeps its punch), the next arrow, SKIP, an
//                    optional choice button and the stage / scene title card
//   roomLayout()     where the monitor, the floor and the people go, for this
//                    screen (portrait or landscape) and this dialogue box
//   drawOpsRoom()    the room itself: back wall, ceiling lights, the agency
//                    seal, equipment racks, the floor, the monitor's bezel
//   drawDesk()       the console desk in the foreground
//   drawMonitor()    a wall-screen picture, with static, scanlines and glass
//   drawWalker()     a standing sprite taking steps (legs split off and
//                    stepping, the same walk cycle the game uses)
//
// The pictures are drawn into the game's low-res buffer; the text is DOM so
// it gets the pixel font.
import { sfx } from './audio.js';

const CPS = 42;          // dialogue typing speed (chars/s)

export const lerp = (a, b, t) => a + (b - a) * t;
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const rand = (a, b) => a + Math.random() * (b - a);
export const hash = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
export const blink = (tm, rate = 3) => Math.floor(tm * rate) % 2 === 0;

// filled pixel disc
export function disc(ctx, cx, cy, r, col) {
  ctx.fillStyle = col;
  cx = Math.round(cx); cy = Math.round(cy); r = Math.max(0, Math.round(r));
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy) + 0.35);
    ctx.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return [c, x];
}

/* ============================ THE DIALOGUE BOX ============================ */

export class DialogueBox {
  // opts: { speaker, portrait: {closed, open, blink}, lines: [text] (the box
  // is sized for the longest), choice (label) + onChoice, onSkip, onTap
  // (a tap anywhere else), card: { stage, scene } }
  constructor(root, opts) {
    this.root = root;
    this.opts = opts;
    this.portrait = opts.portrait;
    this.clock = 0;
    this.blinkT = 2; this.blinking = 0;
    this.mouth = 'closed';
    this.runs = [];
    this.total = 0;
    this.typed = 0;
    this.lineDone = true;
    this.build();
  }

  build() {
    const el = (tag, cls, html) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (html !== undefined) e.innerHTML = html;
      return e;
    };
    const o = this.opts;
    const r = this.root;
    r.innerHTML = '';
    r.classList.remove('hidden', 'fade-out');

    this.skipBtn = el('button', 'cine-skip', 'SKIP');
    this.skipBtn.addEventListener('click', (e) => { e.stopPropagation(); sfx.click(); if (o.onSkip) o.onSkip(); });

    this.dlg = el('div', 'dlg pending');
    this.face = el('canvas', 'dlg-face pixel-canvas');
    this.face.width = 28; this.face.height = 30;
    const body = el('div', 'dlg-body');
    this.nameEl = el('div', 'dlg-name', o.speaker);
    body.appendChild(this.nameEl);
    this.textEl = el('div', 'dlg-text');
    body.appendChild(this.textEl);
    this.nextEl = el('i', 'dlg-next hidden');
    this.dlg.appendChild(this.face);
    this.dlg.appendChild(body);
    this.dlg.appendChild(this.nextEl);

    this.choiceEl = el('div', 'dlg-choice hidden');
    if (o.choice) {
      const accept = el('button', 'menu-btn primary', o.choice);
      accept.addEventListener('click', (e) => { e.stopPropagation(); if (o.onChoice) o.onChoice(); });
      this.choiceEl.appendChild(accept);
    }

    this.card = el('div', 'title-card hidden', titleCardHtml(o.card || {}));

    this.dlg.appendChild(this.choiceEl);
    r.appendChild(this.dlg);
    r.appendChild(this.skipBtn);
    r.appendChild(this.card);
    // a tap anywhere else moves things along
    r.addEventListener('click', () => { if (o.onTap) o.onTap(); });
    this.drawFace();
    // size the box for the longest line up front, so it never grows mid-scene
    // (and the room laid out above it never jumps)
    this.fitBox = () => {
      const longest = (o.lines || []).reduce((a, l) => (l.length > a.length ? l : a), '');
      const keep = this.textEl.innerHTML;
      this.textEl.style.minHeight = '';
      this.textEl.textContent = longest.toUpperCase();
      this.textEl.style.minHeight = `${this.textEl.offsetHeight}px`;
      this.textEl.innerHTML = keep;
    };
    this.fitBox();
    window.addEventListener('resize', this.fitBox);
  }

  drawFace() {
    const frame = this.blinking > 0 ? 'blink' : this.mouth;
    if (frame === this.faceFrame) return;
    this.faceFrame = frame;
    const x = this.face.getContext('2d');
    x.clearRect(0, 0, 28, 30);
    x.drawImage(this.portrait[frame], 0, 0);
  }

  // Split a line into plain / emphasised runs: a word the script writes in
  // capitals ("YOU") keeps its punch once everything is upper-cased.
  setLine(text) {
    this.textEl.innerHTML = '';
    this.runs = [];
    for (const part of text.split(/\b([A-Z]{2,})\b/)) {
      if (!part) continue;
      const em = /^[A-Z]{2,}$/.test(part);
      const span = document.createElement(em ? 'em' : 'span');
      const shown = document.createElement('span');
      const ghost = document.createElement('span');
      ghost.className = 'ghost';
      ghost.textContent = part.toUpperCase();
      span.appendChild(shown); span.appendChild(ghost);
      this.textEl.appendChild(span);
      this.runs.push({ text: part.toUpperCase(), shown, ghost });
    }
    this.total = this.runs.reduce((n, r) => n + r.text.length, 0);
    this.typed = 0;
    this.shownChars = 0;
    this.lineDone = false;
    this.nextEl.classList.add('hidden');
  }

  paintTyped() {
    let left = Math.floor(this.typed);
    for (const r of this.runs) {
      const n = Math.max(0, Math.min(r.text.length, left));
      r.shown.textContent = r.text.slice(0, n);
      r.ghost.textContent = r.text.slice(n);
      left -= r.text.length;
    }
  }

  // The whole line at once (a tap while it's typing, or it finished).
  complete() {
    this.typed = this.total;
    this.paintTyped();
    this.lineDone = true;
    this.mouth = 'closed';
  }

  // Once a frame. `talking`: type the current line on (voice blips, mouth
  // flapping); `onDone` is called the frame the line finishes typing.
  update(dt, talking, onDone) {
    this.clock += dt;
    if (talking && !this.lineDone) {
      const before = Math.floor(this.typed);
      this.typed = Math.min(this.total, this.typed + dt * CPS);
      const now = Math.floor(this.typed);
      if (now !== before) {
        this.paintTyped();
        // a voice blip every other letter
        const all = this.runs.map(r => r.text).join('');
        for (let i = before; i < now; i++) if (/[A-Z]/.test(all[i]) && i % 3 === 0) { sfx.voice(); break; }
      }
      this.mouth = Math.floor(this.clock * 9) % 2 ? 'open' : 'closed';
      if (this.typed >= this.total) onDone();
    }

    // blinking, now and then
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinking = 0.13; this.blinkT = 2 + Math.random() * 2.5; }
    this.blinking = Math.max(0, this.blinking - dt);
    this.drawFace();
  }

  show(on = true) { this.dlg.classList.toggle('pending', !on); }
  hide(on = true) { this.dlg.classList.toggle('hidden', on); }
  showNext(on) { this.nextEl.classList.toggle('hidden', !on); }
  showChoice(on) { this.choiceEl.classList.toggle('hidden', !on); }
  showSkip(on) { this.skipBtn.classList.toggle('hidden', !on); }
  showCard() { this.card.classList.remove('hidden'); }

  destroy() {
    window.removeEventListener('resize', this.fitBox);
    this.root.innerHTML = '';
    this.root.classList.add('hidden');
    this.root.classList.remove('fade-out');
  }
}

// The black STAGE / SCENE title card.
export function titleCardHtml({ stage = '', scene = '' }) {
  return `<div class="tc-stage">${stage}</div><div class="tc-scene">${scene}</div>`;
}

/* ============================ THE OPS ROOM ============================ */

// Room layout for this screen: the monitor, where people stand, and where
// the DOM dialogue box starts (so nobody stands behind it). With `door`
// there's a way out in the back wall to the right of the monitor (in
// portrait the monitor shrinks and moves over to make room for it).
const DOOR_W = 16, DOOR_H = 26;
export function roomLayout(vw, vh, dlgEl, { door = false } = {}) {
  const k = vh / Math.max(1, window.innerHeight);
  const box = dlgEl.getBoundingClientRect();
  const dlgTop = box.height ? Math.min(vh, Math.floor(box.top * k)) : Math.floor(vh * 0.66);
  const portrait = vh > vw;
  const doorRoom = door && portrait ? DOOR_W + 18 : 0;
  let mw, mh;
  if (portrait) {
    mw = (Math.min(vw - 18, 156) - doorRoom) & ~1;
    mh = Math.round(mw * 0.58);
  } else {
    mh = Math.max(40, Math.min(dlgTop - 38, 96));
    mw = Math.round(mh / 0.58);
    if (mw > vw * 0.6) { mw = Math.round(vw * 0.6); mh = Math.round(mw * 0.58); }
  }
  // portrait: the seal above the screen, people out on the floor, a console
  // desk in the foreground; landscape: everything in one band above the box
  const my = portrait ? Math.max(44, Math.round(dlgTop * 0.2))
    : Math.max(6, Math.round((dlgTop - mh - 50) * 0.35));
  const R = { x: Math.round((vw - mw - doorRoom) / 2), y: my, w: mw, h: mh };
  const wallBottom = R.y + R.h + 16;
  const floor = dlgTop - wallBottom;
  const feetY = portrait ? Math.round(wallBottom + Math.max(22, floor * 0.4)) : Math.min(dlgTop - 3, wallBottom + 22);
  const desk = dlgTop - feetY > 44 ? { y: dlgTop - 26 } : null;
  const spread = Math.min(mw * 0.32, 46);
  const L = { vw, vh, dlgTop, portrait, R, wallBottom, feetY, desk, spread, vossX: Math.round(vw / 2 - spread), agentX: Math.round(vw / 2 + spread) };
  if (door) {
    const dx = portrait ? R.x + R.w + 12 : Math.min(vw - DOOR_W - 10, R.x + R.w + 30);
    L.door = { x: dx, y: wallBottom - 4 - DOOR_H, w: DOOR_W, h: DOOR_H };
  }
  return L;
}

// Back wall, ceiling lights, the seal, racks, floor, the screen's glow and
// the monitor's bezel (the picture itself is drawMonitor()).
export function drawOpsRoom(ctx, L, t, seal) {
  const { vw, vh, R, wallBottom } = L;
  // back wall: dark panels, trim, ceiling strip with lights
  ctx.fillStyle = '#141a2c'; ctx.fillRect(0, 0, vw, wallBottom);
  for (let x = (vw / 2 % 22) | 0; x < vw; x += 22) { ctx.fillStyle = '#0f1424'; ctx.fillRect(x, 8, 1, wallBottom - 8); ctx.fillStyle = '#19203a'; ctx.fillRect(x + 1, 8, 1, wallBottom - 8); }
  ctx.fillStyle = '#0a0d18'; ctx.fillRect(0, 0, vw, 8);
  for (let x = (vw / 2 % 48) - 3 | 0; x < vw; x += 48) {
    ctx.fillStyle = '#cfe8ff'; ctx.fillRect(x, 6, 6, 1);
    ctx.globalAlpha = 0.06; ctx.fillStyle = '#cfe8ff'; ctx.fillRect(x - 6, 7, 18, 20); ctx.globalAlpha = 1;
  }
  ctx.fillStyle = '#232c46'; ctx.fillRect(0, wallBottom - 4, vw, 1);
  ctx.fillStyle = '#0c1020'; ctx.fillRect(0, wallBottom - 3, vw, 3);
  // agency seal above the screen, when there's room for it
  if (R.y >= 44) ctx.drawImage(seal, Math.round(vw / 2 - 13), Math.max(11, Math.round((R.y + 8) / 2 - 13)));
  // equipment racks either side of the screen, LEDs blinking (never where
  // the door is)
  for (const rx of [R.x - 22, R.x + R.w + 8]) {
    if (rx < 2 || rx + 14 > vw - 2) continue;
    if (L.door && rx + 15 > L.door.x - 3 && rx - 1 < L.door.x + L.door.w + 3) continue;
    ctx.fillStyle = '#05070d'; ctx.fillRect(rx - 1, R.y - 1, 16, R.h + 2);
    ctx.fillStyle = '#1b2338'; ctx.fillRect(rx, R.y, 14, R.h);
    for (let y = R.y + 3; y < R.y + R.h - 3; y += 5) {
      ctx.fillStyle = '#10152a'; ctx.fillRect(rx + 1, y + 3, 12, 1);
      const on = hash(Math.floor(t * 3) + y * 7 + rx) > 0.4;
      ctx.fillStyle = on ? (hash(y + rx) < 0.5 ? '#59d98c' : '#41f0d8') : '#23304a';
      ctx.fillRect(rx + 2, y, 1, 1);
      ctx.fillStyle = hash(Math.floor(t * 5) + y) > 0.7 ? '#ff5e6c' : '#23304a';
      ctx.fillRect(rx + 5, y, 1, 1);
    }
  }
  // floor
  ctx.fillStyle = '#0d1120'; ctx.fillRect(0, wallBottom, vw, vh - wallBottom);
  ctx.fillStyle = '#121830';
  for (let y = wallBottom + 5, s = 5; y < vh; s += 2, y += s) ctx.fillRect(0, y, vw, 1);
  for (let x = (vw / 2 % 24) | 0; x < vw; x += 24) ctx.fillRect(x, wallBottom, 1, vh - wallBottom);
  // the screen's glow on the wall and floor
  ctx.globalAlpha = 0.07; ctx.fillStyle = '#6ec2ff';
  ctx.fillRect(R.x - 8, R.y - 8, R.w + 16, R.h + 16);
  ctx.fillRect(R.x, wallBottom, R.w, Math.min(vh - wallBottom, 30));
  ctx.globalAlpha = 1;
  // monitor bezel
  ctx.fillStyle = '#05070d'; ctx.fillRect(R.x - 4, R.y - 4, R.w + 8, R.h + 8);
  ctx.fillStyle = '#2b2f38'; ctx.fillRect(R.x - 3, R.y - 3, R.w + 6, R.h + 6);
  ctx.fillStyle = '#434a56'; ctx.fillRect(R.x - 3, R.y - 3, R.w + 6, 1);
  ctx.fillStyle = '#05070d'; ctx.fillRect(R.x - 1, R.y - 1, R.w + 2, R.h + 2);
  ctx.fillStyle = '#59d98c'; ctx.fillRect(R.x + R.w - 4, R.y + R.h + 1, 1, 1);
  ctx.fillStyle = Math.floor(t * 2) % 2 ? '#ff5e6c' : '#5a1a24'; ctx.fillRect(R.x + R.w - 7, R.y + R.h + 1, 1, 1);
}

// Foreground console: desk top, the backs of screens (at these fractions
// of the width), keyboard lights, and the mug.
export function drawDesk(ctx, L, t, { screens = [0.2, 0.8], mug = 0.35 } = {}) {
  const { vw, vh } = L, y = L.desk.y;
  for (const cx of screens.map(f => Math.round(vw * f))) {
    ctx.fillStyle = '#05070d'; ctx.fillRect(cx - 14, y - 17, 28, 17);
    ctx.fillStyle = '#1b2338'; ctx.fillRect(cx - 13, y - 16, 26, 15);
    ctx.fillStyle = '#26304a'; ctx.fillRect(cx - 13, y - 16, 26, 1);
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#6ec2ff'; ctx.fillRect(cx - 12, y - 19, 24, 2); ctx.globalAlpha = 1;
  }
  ctx.fillStyle = '#05070d'; ctx.fillRect(0, y - 1, vw, vh - y + 1);
  ctx.fillStyle = '#2b3654'; ctx.fillRect(0, y, vw, 3);
  ctx.fillStyle = '#3a4768'; ctx.fillRect(0, y, vw, 1);
  ctx.fillStyle = '#121828'; ctx.fillRect(0, y + 3, vw, vh - y - 3);
  for (let x = 6; x < vw - 6; x += 5) {
    const on = hash(x * 3 + Math.floor(t * 2)) > 0.55;
    ctx.fillStyle = on ? (hash(x) < 0.5 ? '#59d98c' : '#6ec2ff') : '#1f2840';
    ctx.fillRect(x, y + 7, 2, 1);
  }
  // a mug, because there is always a mug
  const mx = Math.round(vw * mug);
  ctx.fillStyle = '#05070d'; ctx.fillRect(mx - 1, y - 6, 7, 6);
  ctx.fillStyle = '#d7dfea'; ctx.fillRect(mx, y - 5, 5, 5); ctx.fillRect(mx + 5, y - 4, 1, 2);
  ctx.fillStyle = '#b3261e'; ctx.fillRect(mx, y - 3, 5, 1);
}

// The wall screen: `screen` = { mode, t, staticT }; screens[mode] draws the
// picture natively at R's size (an unknown mode is a dark screen). Static
// rolls over it while it changes channel.
export function drawMonitor(ctx, R, screens, screen, clock) {
  ctx.save();
  ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
  const fn = screens[screen.mode];
  if (fn) fn(ctx, R, screen.t);
  else { ctx.fillStyle = '#05070d'; ctx.fillRect(R.x, R.y, R.w, R.h); }
  if (screen.staticT > 0 || screen.mode === 'static') {
    // snow + a rolling tear
    for (let i = 0; i < R.w * R.h * 0.35; i++) {
      const v = Math.random() * 200 | 0;
      ctx.fillStyle = `rgb(${v},${v},${v + 20})`;
      ctx.fillRect(R.x + (Math.random() * R.w | 0), R.y + (Math.random() * R.h | 0), 1, 1);
    }
    ctx.fillStyle = 'rgba(230, 240, 255, 0.25)';
    ctx.fillRect(R.x, R.y + ((clock * 120) % R.h | 0), R.w, 2);
  }
  // scanlines + a glint of glass
  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  for (let y = R.y; y < R.y + R.h; y += 2) ctx.fillRect(R.x, y, R.w, 1);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(R.x + 2, R.y + 2, Math.round(R.w * 0.3), 1);
  ctx.restore();
}

// A 12x16 character standing at (x, y) top-left, taking steps while
// `moving`: the bottom 4 rows (the legs) split and step, the body bobs.
export function drawWalker(ctx, img, x, y, walkT, moving) {
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

// A soft shadow under someone standing in the room.
export function floorShadow(ctx, x, y) {
  ctx.globalAlpha = 0.35; ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(x, y, 6, 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}
