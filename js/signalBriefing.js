// Stage 2's opening cutscene: the signal briefing.
//
//   card    : a black STAGE 2 / THE SIGNAL title card
//   fadein  : up from black on the ops room. Handler Voss, the agent, and
//             an analyst at her workstation with her back to us, decoding
//             (she never turns round). An EXIT in the back wall.
//   talk    : Voss's lines, typed out with his talking portrait; the wall
//             monitor follows each one (the broadcast going out across the
//             continent, the decoder, the invasion, CCTV of the truck,
//             Quiet Oaks)
//   hand    : "You can read through it if you want": Voss walks over and
//             hands the agent the folder, and the transcript opens; the
//             briefing waits until it's put away (read)
//   walk    : after "Do not fail this time agent" the agent turns and heads
//             for the door, until "But before you go..." stops him; then he
//             turns back round to face Voss for "You might need some gear"
//   out     : fade to black, then onDone() (main.js opens the Field Locker)
//
// Tap / Enter / A moves it along, SKIP / Esc / Start skips to the end. The
// room, the dialogue box and the walk cycle are the shared ops-room pieces
// in cutscene.js; the words are in data/stage2.js.
import { sfx } from './audio.js';
import { pixelText, textWidth, buildAnalyst, buildFolder } from './data/storyArt.js';
import { buildHighwayActors } from './data/highwayArt.js';
import { drawSeal } from './briefing.js';
import { STAGE2, SIGNAL } from './data/stage2.js';
import { openTranscript } from './transcript.js';
import {
  DialogueBox, roomLayout, drawOpsRoom, drawDesk, drawMonitor, drawWalker, floorShadow,
  lerp, easeInOut, hash, blink, disc, makeCanvas,
} from './cutscene.js';

const CARD_T = 2.1;      // the title card
const FADE_T = 1.0;      // up from black on the room
const SETTLE_T = 0.5;    // beat before Voss speaks
const HAND_WALK = 0.8;   // Voss walking over with the folder
const HAND_HOLD = 0.45;  // ...holding it out
const HAND_PASS = 0.3;   // ...and it changing hands
const WALK_T = 1.05;     // the agent heading for the door before Voss calls
const OUT_T = 1.1;       // fade to black at the end

const LINES = STAGE2.intro.lines;
const SYMBOLS = '!#$&*%?';          // the 3x5 font's @ reads as an e

/* ============================ THE MONITOR ============================ */
// What the wall screen shows under each line, drawn natively at the
// monitor's size (R). tm = seconds since the screen changed.

function screenBg(ctx, R, col, starsSeed) {
  ctx.fillStyle = col;
  ctx.fillRect(R.x, R.y, R.w, R.h);
  if (starsSeed) {
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = hash(i + starsSeed) < 0.2 ? '#c8d4f0' : '#5a6890';
      ctx.fillRect(R.x + Math.floor(hash(i * 2 + starsSeed) * R.w), R.y + Math.floor(hash(i * 3 + starsSeed) * R.h), 1, 1);
    }
  }
}

// A 1px pixel ring.
function ring(ctx, cx, cy, r, col) {
  if (r < 1) return;
  ctx.fillStyle = col;
  const n = Math.max(8, Math.round(r * 6));
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.8), 1, 1);
  }
}

// The continent, rasterised once per monitor size (a rough North America:
// broad across the north, tapering down to the isthmus).
const CONTINENT = [[0.03, 0.24], [0.1, 0.12], [0.22, 0.1], [0.36, 0.06], [0.52, 0.08], [0.62, 0.04],
  [0.76, 0.08], [0.86, 0.18], [0.8, 0.26], [0.74, 0.24], [0.7, 0.32], [0.82, 0.36], [0.78, 0.46],
  [0.72, 0.54], [0.74, 0.65], [0.68, 0.6], [0.62, 0.58], [0.56, 0.62], [0.52, 0.72], [0.5, 0.84],
  [0.46, 0.92], [0.42, 0.8], [0.36, 0.7], [0.3, 0.62], [0.24, 0.56], [0.18, 0.44], [0.14, 0.32], [0.08, 0.3]];
const landCache = new Map();
function continentCanvas(w, h) {
  const key = `${w}x${h}`;
  if (landCache.has(key)) return landCache.get(key);
  const [c, x] = makeCanvas(w, h);
  const pts = CONTINENT.map(([u, v]) => [u * w, v * h]);
  const inside = (px, py) => {
    let hit = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      if (!inside(px + 0.5, py + 0.5)) continue;
      const edge = !inside(px - 0.5, py + 0.5) || !inside(px + 1.5, py + 0.5) || !inside(px + 0.5, py - 0.5) || !inside(px + 0.5, py + 1.5);
      x.fillStyle = edge ? '#3fa0b8' : ((px + py) % 4 === 0 ? '#1a4660' : '#143a52');
      x.fillRect(px, py, 1, 1);
    }
  }
  landCache.set(key, { c, inside });
  return landCache.get(key);
}

// Where the broadcast is going out from (fractions of the screen).
const SOURCES = [[0.22, 0.2], [0.44, 0.16], [0.64, 0.14], [0.36, 0.36], [0.58, 0.4], [0.32, 0.54], [0.48, 0.7]];

// The decoder's read-out, from the transcript in data/stage2.js.
const DECODED = (SIGNAL.meta.find(([k]) => k === 'DECODED') || [0, '??%'])[1];

const SCREENS = {
  // the signal going out across the continent
  broadcast(ctx, R, tm) {
    screenBg(ctx, R, '#020a16');
    ctx.fillStyle = '#071628';
    for (let x = R.x + 3; x < R.x + R.w; x += 9) ctx.fillRect(x, R.y, 1, R.h);
    for (let y = R.y + 3; y < R.y + R.h; y += 9) ctx.fillRect(R.x, y, R.w, 1);
    const land = continentCanvas(R.w, R.h);
    ctx.drawImage(land.c, R.x, R.y);
    SOURCES.forEach(([u, v], i) => {
      const x = R.x + u * R.w, y = R.y + v * R.h;
      for (const off of [0, 0.5]) {
        const k = (tm * 0.55 + hash(i + 3) + off) % 1;
        ctx.globalAlpha = 1 - k;
        ring(ctx, x, y, 1 + k * R.w * 0.11, '#ff9e5e');
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = blink(tm + hash(i), 3) ? '#ffd75e' : '#ff5e6c';
      ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
    });
    pixelText(ctx, 'BROADCAST', R.x + 3, R.y + 3, '#6ec2ff');
    if (blink(tm, 2)) pixelText(ctx, R.w >= 84 ? 'SIGNAL: CONTINENTAL' : 'CONTINENTAL', R.x + 3, R.y + R.h - 8, '#ff9e5e');
  },

  // the interpreters' decoder: the waveform, and the message coming through
  // a word at a time (most of it still symbols)
  decode(ctx, R, tm) {
    screenBg(ctx, R, '#021008');
    const mid = R.y + Math.round(R.h * 0.36);
    ctx.fillStyle = '#0f4a2a';
    ctx.fillRect(R.x, mid, R.w, 1);
    let py = mid;
    for (let x = 0; x < R.w; x++) {
      const y = Math.round(mid + Math.sin(x * 0.31 + tm * 7) * R.h * 0.1 * Math.sin(x * 0.05 + tm) + Math.sin(x * 0.9 - tm * 11) * 1.5);
      ctx.fillStyle = '#41f0a0';
      ctx.fillRect(R.x + x, Math.min(py, y), 1, Math.abs(y - py) + 1);
      py = y;
    }
    // two rows of the message: a few words decoded, the rest re-rolling
    const words = ['STUDY', '#####', 'EARTH', '####', 'PREPARE', '######'];
    let x = R.x + 3, y = R.y + Math.round(R.h * 0.6);
    words.forEach((w, i) => {
      const plain = !w.startsWith('#');
      let s = w;
      if (!plain) s = w.split('').map((_, j) => SYMBOLS[Math.floor(hash(i * 13 + j + Math.floor(tm * 12)) * SYMBOLS.length)]).join('');
      if (x + textWidth(s) > R.x + R.w - 3) { x = R.x + 3; y += 7; }
      if (y > R.y + R.h - 15) return;
      pixelText(ctx, s, x, y, plain ? '#bff0cf' : '#e0b83c');
      x += textWidth(s) + 4;
    });
    pixelText(ctx, 'DECODER', R.x + 3, R.y + 3, '#41f0a0');
    const label = `DECODED ${DECODED}`;
    pixelText(ctx, label, R.x + 3, R.y + R.h - 8, '#41f0a0');
    const bx = R.x + 7 + textWidth(label), bw = R.x + R.w - 4 - bx;
    if (bw > 8) {
      ctx.fillStyle = '#0f4a2a'; ctx.fillRect(bx, R.y + R.h - 7, bw, 3);
      ctx.fillStyle = blink(tm, 2) ? '#41f0a0' : '#2c9a6a';
      ctx.fillRect(bx, R.y + R.h - 7, Math.round(bw * (parseInt(DECODED, 10) || 0) / 100), 3);
    }
  },

  // what it's for: markers closing in on the Earth
  invasion(ctx, R, tm) {
    screenBg(ctx, R, '#03060f', 53);
    const cx = Math.round(R.x + R.w * 0.5), cy = Math.round(R.y + R.h * 0.55), r = Math.round(R.h * 0.27);
    disc(ctx, cx, cy, r + 1, '#6fb8ff');
    disc(ctx, cx, cy, r, '#1e4a8a');
    // land drifting round as the globe turns, shaded toward the night side
    const spin = Math.floor(tm * 3);
    for (let y = -r + 1; y < r; y++) {
      for (let x = -r + 1; x < r; x++) {
        if (x * x + y * y >= (r - 1) * (r - 1)) continue;
        const land = hash(Math.floor((x + spin) / 4) * 13 + Math.floor(y / 4) * 7) + hash(Math.floor((x + spin) / 7) * 5 + Math.floor(y / 6) * 11);
        if (land < 1.15) continue;
        ctx.fillStyle = x + y > r * 0.6 ? '#1f5229' : '#2c6e3a';
        ctx.fillRect(cx + x, cy + y, 1, 1);
      }
    }
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2 + 0.3;
      const k = (tm * 0.25 + hash(i * 7)) % 1;
      const d = lerp(R.w * 0.62, r + 4, k);
      const x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d * 0.6);
      ctx.fillStyle = '#5a1a24';
      for (let s = 1; s < 5; s++) ctx.fillRect(Math.round(cx + Math.cos(a) * (d + s * 3)), Math.round(cy + Math.sin(a) * (d + s * 3) * 0.6), 1, 1);
      ctx.fillStyle = '#ff5e6c'; ctx.fillRect(x - 1, y - 1, 3, 3);
      ctx.fillStyle = '#ffd0d4'; ctx.fillRect(x, y, 1, 1);
    }
    pixelText(ctx, 'THREAT', R.x + 3, R.y + 3, '#6ec2ff');
    if (blink(tm, 2)) pixelText(ctx, 'INVASION', R.x + 3, R.y + R.h - 8, '#ff5e6c');
  },

  // the last anyone saw of them: the gas station camera on Highway 29
  truck(ctx, R, tm, art) {
    screenBg(ctx, R, '#16201c');
    // the forecourt from the camera on the canopy: road, pumps, the store
    const road = R.y + Math.round(R.h * 0.62);
    ctx.fillStyle = '#20282a'; ctx.fillRect(R.x, road, R.w, Math.round(R.h * 0.24));
    ctx.fillStyle = '#56604a';
    for (let x = R.x + 2 - Math.floor(tm * 2) % 2; x < R.x + R.w; x += 8) ctx.fillRect(x, road + Math.round(R.h * 0.12), 4, 1);
    ctx.fillStyle = '#2a3430'; ctx.fillRect(R.x + 4, R.y + 9, Math.round(R.w * 0.34), Math.round(R.h * 0.3));
    for (let i = 0; i < 3; i++) { ctx.fillStyle = '#3e4a42'; ctx.fillRect(R.x + Math.round(R.w * 0.48) + i * 9, R.y + Math.round(R.h * 0.3), 3, 5); }
    // the semi, side on along the road (the overhead art turned on its side)
    const semi = art.semi, k = Math.min(0.5, (R.w * 0.66) / semi.h);
    const sw = Math.round(semi.h * k), sh = Math.round(semi.w * k);
    const sx = Math.round(R.x + R.w * 0.52 - sw / 2), sy = road - Math.round(sh * 0.55);
    ctx.save();
    ctx.translate(sx + sw, sy);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(semi.closed, 0, 0, semi.w, semi.h, 0, 0, sh, sw);
    ctx.restore();
    if (blink(tm, 2)) { ctx.strokeStyle = '#ff5e6c'; ctx.lineWidth = 1; ctx.strokeRect(sx - 2.5, sy - 2.5, sw + 5, sh + 5); }
    // grain
    for (let i = 0; i < R.w * R.h * 0.04; i++) {
      const g = hash(i * 3.1 + Math.floor(tm * 15) * 977);
      ctx.fillStyle = g < 0.5 ? 'rgba(200, 220, 200, 0.12)' : 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(R.x + Math.floor(hash(i * 1.7 + Math.floor(tm * 15)) * R.w), R.y + Math.floor(g * R.h), 1, 1);
    }
    pixelText(ctx, 'CAM 3  HWY 29', R.x + 3, R.y + 3, '#c8d8c0');
    if (blink(tm, 2)) { ctx.fillStyle = '#ff5e6c'; ctx.fillRect(R.x + R.w - 6, R.y + 3, 3, 3); }
    pixelText(ctx, 'LAST SEEN', R.x + 3, R.y + R.h - 8, '#ffd75e');
  },

  // where they went: a subdivision off the highway, three blips in it
  target(ctx, R, tm) {
    screenBg(ctx, R, '#06122a');
    ctx.fillStyle = '#0c2044';
    for (let x = R.x + 4; x < R.x + R.w; x += 10) ctx.fillRect(x, R.y, 1, R.h);
    for (let y = R.y + 4; y < R.y + R.h; y += 10) ctx.fillRect(R.x, y, R.w, 1);
    // the streets: a cross, a cul-de-sac at the top, the gate at the bottom
    const cx = Math.round(R.x + R.w * 0.5), ey = Math.round(R.y + R.h * 0.55);
    ctx.fillStyle = '#3a4a68';
    ctx.fillRect(cx - 1, R.y + Math.round(R.h * 0.2), 3, R.h);
    ctx.fillRect(R.x + Math.round(R.w * 0.14), ey - 1, Math.round(R.w * 0.72), 3);
    disc(ctx, cx, R.y + Math.round(R.h * 0.2), 4, '#3a4a68');
    disc(ctx, cx, R.y + Math.round(R.h * 0.2), 1, '#06122a');
    // houses along them
    for (let i = 0; i < 12; i++) {
      const side = i % 2 ? 1 : -1, n = i >> 1;
      const hx = R.x + Math.round(R.w * (0.18 + (n % 6) * 0.12)), hy = ey + side * 6 - (side < 0 ? 3 : 0);
      if (Math.abs(hx - cx) < 5) continue;
      ctx.fillStyle = '#26324c'; ctx.fillRect(hx, hy, 5, 3);
      if (hash(i + 40) < 0.3) { ctx.fillStyle = '#ffd75e'; ctx.fillRect(hx + 2, hy + 1, 1, 1); }
    }
    // three of them in there
    for (let i = 0; i < 3; i++) {
      if (!blink(tm + i * 0.3, 2.5)) continue;
      ctx.fillStyle = '#ff5e6c';
      ctx.fillRect(R.x + Math.round(R.w * (0.3 + i * 0.18)), ey + (i === 1 ? -9 : 6), 2, 2);
    }
    const label = 'QUIET OAKS';
    const lx = Math.round(R.x + R.w * 0.5 - textWidth(label) / 2), ly = R.y + Math.round(R.h * 0.72);
    if (blink(tm, 2)) { ctx.strokeStyle = '#ff5e6c'; ctx.lineWidth = 1; ctx.strokeRect(lx - 2.5, ly - 2.5, textWidth(label) + 5, 10); }
    pixelText(ctx, label, lx, ly, '#ffd75e');
    pixelText(ctx, 'TARGET', R.x + 3, R.y + 3, '#6ec2ff');
  },
};

/* ============================ THE CUTSCENE ============================ */

export class SignalBriefing {
  // root: #cine; onDone(): the room has faded to black
  constructor(assets, root, { onDone }) {
    this.assets = assets;
    this.root = root;
    this.onDone = onDone;
    this.phase = 'card';
    this.t = 0;
    this.clock = 0;
    this.li = -1;
    this.screen = { mode: 'static', t: 0, staticT: 0 };
    this.seal = (() => { const c = document.createElement('canvas'); c.width = 26; c.height = 26; drawSeal(c); return c; })();
    this.analyst = buildAnalyst();
    this.folderImg = buildFolder();
    this.art = { semi: buildHighwayActors().semi };
    // Voss: k = 0 at his spot -> 1 beside the agent; the agent: k = 0 at his
    // spot -> 1 at the door
    this.voss = { k: 0, walking: false, walkT: 0, face: 'right', hold: false };
    this.agent = { k: 0, walking: false, walkT: 0, face: 'right', folder: false };
    this.folderFly = null;        // the folder changing hands: 0..1
    this.transcript = null;
    this.typeT = 0;
    this.box = new DialogueBox(root, {
      speaker: STAGE2.intro.speaker,
      portrait: assets.voss.portrait,
      lines: LINES.map(l => l.text),
      onSkip: () => this.skip(),
      onTap: () => this.advance(),
      card: { stage: STAGE2.name, scene: STAGE2.sub },
    });
    this.box.showCard();
    sfx.typeReturn();
  }

  /* ---------- flow ---------- */

  setScreen(mode) {
    if (this.screen.mode === mode) return;
    this.screen = { mode, t: 0, staticT: 0.3 };
    sfx.static();
  }

  startTalk() {
    this.phase = 'talk';
    this.t = 0;
    this.box.show();
    this.nextLine();
  }

  nextLine() {
    this.li++;
    const line = LINES[this.li];
    this.setScreen(line.screen);
    this.box.setLine(line.text);
    this.turnT = 0;
  }

  finishLine() {
    this.box.complete();
    this.box.showNext(true);
  }

  // What comes after the line that's up: the folder changing hands, the
  // agent heading for the door, the next line, or the end.
  afterLine() {
    const line = LINES[this.li];
    if (line.beat === 'folder' && !this.agent.folder) { this.startHand(); return; }
    const next = LINES[this.li + 1];
    if (!next) { this.startOut(); return; }
    sfx.click();
    if (next.beat === 'walkout') this.startWalk();
    else this.nextLine();
  }

  // Voss brings the folder over.
  startHand() {
    this.phase = 'hand';
    this.t = 0;
    this.box.showNext(false);
    this.voss.walking = true;
  }

  // The transcript is open; the briefing carries on once it's closed.
  startRead() {
    this.phase = 'read';
    this.t = 0;
    this.transcript = openTranscript(this.root, {
      onClose: () => {
        this.transcript = null;
        if (this.phase !== 'read') return;
        this.phase = 'talk';
        this.nextLine();
      },
    });
  }

  // "[Player begins to walk out]": the box steps aside while he goes.
  startWalk() {
    this.phase = 'walk';
    this.t = 0;
    this.box.show(false);
    this.agent.face = 'right';
    this.agent.walking = true;
  }

  // "But before you go...": he stops where he is.
  callBack() {
    this.agent.walking = false;
    this.phase = 'talk';
    this.box.show();
    this.nextLine();
  }

  startOut() {
    if (this.phase === 'out') return;
    if (this.transcript) { const tr = this.transcript; this.transcript = null; tr.close(); }
    // still black (skipped off the title card): stay black
    const dark = this.phase === 'card' || (this.phase === 'fadein' && this.t < FADE_T * 0.5);
    this.phase = 'out';
    this.t = dark ? OUT_T * 0.8 : 0;
    this.box.showNext(false);
    this.box.showSkip(false);
    this.box.hide();
    this.voss.walking = false; this.agent.walking = false;
  }

  // Off the title card and up from black on the room.
  endCard() {
    this.box.card.classList.add('hidden');
    this.phase = 'fadein'; this.t = 0;
    this.setScreen('broadcast');
  }

  // tap / Enter / A button
  advance() {
    if (this.phase === 'card') this.endCard();
    else if (this.phase === 'fadein' || this.phase === 'settle') this.startTalk();
    else if (this.phase === 'talk') {
      if (!this.box.lineDone) this.finishLine();
      else this.afterLine();
    } else if (this.phase === 'read') {
      if (this.transcript) this.transcript.close();
    } else if (this.phase === 'walk') {
      this.callBack();
    }
  }

  // SKIP / Esc / Start: straight to the end
  skip() {
    if (this.phase === 'out') return;
    this.box.card.classList.add('hidden');
    this.startOut();
  }

  // main.js: the next screen is up underneath; the room went to black, so
  // hold black over it and fade that away
  finish() {
    const cover = document.createElement('div');
    cover.className = 'title-card';
    this.root.appendChild(cover);
    this.root.classList.add('fade-out');
    setTimeout(() => this.destroy(), 700);
  }

  destroy() {
    if (this.transcript) { const tr = this.transcript; this.transcript = null; tr.close(); }
    this.box.destroy();
  }

  update(dt) {
    this.t += dt;
    this.clock += dt;
    this.screen.t += dt;
    this.screen.staticT = Math.max(0, this.screen.staticT - dt);

    if (this.phase === 'card' && this.t >= CARD_T) this.endCard();
    else if (this.phase === 'fadein' && this.t >= FADE_T) { this.phase = 'settle'; this.t = 0; }
    else if (this.phase === 'settle' && this.t >= SETTLE_T) this.startTalk();

    const v = this.voss, a = this.agent;
    if (this.phase === 'hand') {
      // over he comes, holds the folder out, and it changes hands
      const t = this.t;
      v.k = easeInOut(Math.min(1, t / HAND_WALK));
      v.walking = t < HAND_WALK;
      v.face = 'right';
      v.hold = t >= HAND_WALK && t < HAND_WALK + HAND_HOLD + HAND_PASS;
      if (t >= HAND_WALK && !this.handSfx) { this.handSfx = true; sfx.paper(); }
      if (t >= HAND_WALK + HAND_HOLD) this.folderFly = Math.min(1, (t - HAND_WALK - HAND_HOLD) / HAND_PASS);
      if (t >= HAND_WALK + HAND_HOLD + HAND_PASS) {
        a.folder = true; this.folderFly = null; v.hold = false;
        this.startRead();
      }
    } else if (v.k > 0 && this.phase !== 'out') {
      // ...then back to his spot
      v.k = Math.max(0, v.k - dt / HAND_WALK);
      v.walking = v.k > 0;
      v.face = v.k > 0 ? 'left' : 'right';
    }
    if (this.phase === 'walk') {
      a.k = Math.min(1, a.k + dt / (WALK_T * 1.25));
      if (this.t >= WALK_T) this.callBack();
    }
    // once he's been called back, he turns round to face Voss
    const line = LINES[Math.max(0, this.li)];
    if (this.phase === 'talk' && line.beat === 'walkout' && this.box.lineDone) {
      this.turnT += dt;
      if (this.turnT > 0.35 && a.face !== 'left') { a.face = 'left'; sfx.click(); }
    }
    if (v.walking) v.walkT += dt * 10;
    if (a.walking) a.walkT += dt * 10;

    // Voss talking (and blinking, now and then)
    this.box.update(dt, this.phase === 'talk', () => this.finishLine());

    // the analyst's keyboard, between Voss's lines
    if (['settle', 'talk', 'hand', 'walk'].includes(this.phase) && this.box.lineDone && this.analystTyping()) {
      this.typeT -= dt;
      if (this.typeT <= 0) { this.typeT = 0.14 + hash(Math.floor(this.clock * 7)) * 0.22; sfx.type(); }
    }

    if (this.phase === 'out' && this.t >= OUT_T && !this.done) {
      this.done = true;
      this.onDone();
    }
  }

  // Her rhythm: bursts of typing, pauses, and now and then a lean in to
  // listen to something in her headset.
  analystMode() {
    const c = this.clock % 7.3;
    if (c > 5.6) return 'lean';
    if (c % 2.4 > 1.7) return 'pause';
    return 'type';
  }
  analystTyping() { return this.analystMode() === 'type'; }

  /* ---------- drawing ---------- */

  layout(vw, vh) {
    const L = roomLayout(vw, vh, this.box.dlg, { door: true });
    // the analyst's workstation: in the foreground on the left when there's
    // a console down there (portrait), otherwise in the room, left of the
    // racks
    if (L.desk) L.analyst = { x: Math.round(vw * 0.26), deskY: L.desk.y };
    else L.analyst = { x: Math.max(28, Math.round((L.R.x - 22) / 2)), deskY: Math.min(L.wallBottom + 3, L.dlgTop - 10) };
    // where Voss stops to hand over the folder, and where the agent walks to
    L.handX = L.agentX - 14;
    L.doorX = L.door.x + L.door.w / 2 - 6;
    return L;
  }

  // Voss's pose for the line that's up.
  vossPose() {
    const v = this.voss;
    if (v.walking) return v.face;
    if (v.hold) return 'pointR';
    if (this.phase !== 'talk') return 'right';
    const line = LINES[Math.max(0, this.li)];
    if (line.pose === 'monitor') return 'up';
    if (line.pose === 'point') return this.box.lineDone ? 'right' : 'pointR';
    return 'right';
  }

  // Which way the agent faces: the monitor while Voss shows him something
  // on it, Voss while he's being talked to or handed the folder, the door
  // while he heads for it (until he turns back round).
  agentFace() {
    const a = this.agent;
    let face;
    if (a.walking || a.k > 0) face = a.face;
    else if (this.phase === 'hand' || this.phase === 'read') face = 'left';
    else if (this.phase === 'talk') face = LINES[Math.max(0, this.li)].pose === 'monitor' ? 'up' : 'left';
    else face = this.lastFace || 'up';
    this.lastFace = face;
    return face;
  }

  drawDoor(ctx, L) {
    const d = L.door, t = this.clock;
    // frame, the door (a strip of light under it), the EXIT sign above
    ctx.fillStyle = '#05070d'; ctx.fillRect(d.x - 2, d.y - 2, d.w + 4, d.h + 2);
    ctx.fillStyle = '#2b2f38'; ctx.fillRect(d.x - 1, d.y - 1, d.w + 2, d.h + 1);
    ctx.fillStyle = '#1e2536'; ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.fillStyle = '#26304a'; ctx.fillRect(d.x, d.y, d.w, 1); ctx.fillRect(d.x, d.y, 1, d.h);
    ctx.fillStyle = '#141a2c'; ctx.fillRect(d.x + Math.floor(d.w / 2), d.y, 1, d.h);   // the two leaves
    ctx.fillStyle = '#3a4768'; ctx.fillRect(d.x + 3, d.y + 6, 3, 2); ctx.fillRect(d.x + d.w - 6, d.y + 6, 3, 2);   // windows
    ctx.fillStyle = '#8791a0'; ctx.fillRect(d.x + Math.floor(d.w / 2) - 2, d.y + 14, 1, 3); ctx.fillRect(d.x + Math.floor(d.w / 2) + 1, d.y + 14, 1, 3);
    ctx.globalAlpha = 0.5; ctx.fillStyle = '#cfe8ff'; ctx.fillRect(d.x, d.y + d.h - 1, d.w, 1); ctx.globalAlpha = 1;
    // keypad by the frame, blinking
    ctx.fillStyle = '#05070d'; ctx.fillRect(d.x + d.w + 3, d.y + 11, 4, 6);
    ctx.fillStyle = Math.floor(t * 1.5) % 2 ? '#59d98c' : '#1c4a2a'; ctx.fillRect(d.x + d.w + 4, d.y + 12, 2, 1);
    const sx = Math.round(d.x + d.w / 2 - 9), sy = d.y - 10;
    ctx.fillStyle = '#05070d'; ctx.fillRect(sx - 1, sy - 1, 19, 9);
    ctx.fillStyle = '#1c4a2a'; ctx.fillRect(sx, sy, 17, 7);
    pixelText(ctx, 'EXIT', sx + 2, sy + 1, '#7dffb0');
    ctx.globalAlpha = 0.08; ctx.fillStyle = '#7dffb0'; ctx.fillRect(sx - 4, sy - 3, 25, 14); ctx.globalAlpha = 1;
  }

  // Her desk, her screen (facing us, over her shoulder) and her.
  drawAnalyst(ctx, L) {
    const { x, deskY } = L.analyst, t = this.clock;
    if (!L.desk) {
      // a desk of her own out on the floor
      ctx.fillStyle = '#05070d'; ctx.fillRect(x - 22, deskY - 1, 44, 10);
      ctx.fillStyle = '#2b3654'; ctx.fillRect(x - 21, deskY, 42, 3);
      ctx.fillStyle = '#3a4768'; ctx.fillRect(x - 21, deskY, 42, 1);
      ctx.fillStyle = '#121828'; ctx.fillRect(x - 21, deskY + 3, 42, 5);
    }
    // the monitor, lit, on its stand
    const mx = x - 15, my = deskY - 20, mw = 30, mh = 18;
    ctx.fillStyle = '#05070d'; ctx.fillRect(mx - 1, my - 1, mw + 2, mh + 2);
    ctx.fillStyle = '#2b2f38'; ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = '#05070d'; ctx.fillRect(x - 2, my + mh + 1, 4, 1);
    const sx = mx + 2, sy = my + 2, sw = mw - 4, sh = mh - 4;
    ctx.fillStyle = '#031409'; ctx.fillRect(sx, sy, sw, sh);
    // columns of symbols scrolling up, a waveform along the bottom
    for (let c = 0; c < 6; c++) {
      for (let r = 0; r < 3; r++) {
        const k = hash(c * 31 + r * 7 + Math.floor(t * 6 + c));
        ctx.fillStyle = k < 0.15 ? '#e0b83c' : k < 0.7 ? '#41f0a0' : '#1f7a50';
        ctx.fillRect(sx + 1 + c * 4, sy + 1 + r * 3, k < 0.5 ? 2 : 3, 1);
      }
    }
    for (let i = 0; i < sw; i++) {
      ctx.fillStyle = '#7dffb0';
      ctx.fillRect(sx + i, sy + sh - 3 + Math.round(Math.sin(i * 0.9 + t * 9) * Math.sin(i * 0.2 + t)), 1, 1);
    }
    ctx.globalAlpha = 0.1; ctx.fillStyle = '#7dffb0'; ctx.fillRect(mx - 4, my - 3, mw + 8, mh + 6); ctx.globalAlpha = 1;
    // her, in front of it, back to us
    const mode = this.analystMode();
    const img = mode === 'lean' ? this.analyst.lean
      : mode === 'type' ? this.analyst.type[Math.floor(t * 7) % 2] : this.analyst.type[0];
    ctx.drawImage(img, x - 9, deskY - 13);
  }

  // A held folder, in front of whoever is holding it.
  drawFolder(ctx, x, y) {
    ctx.drawImage(this.folderImg, Math.round(x), Math.round(y));
  }

  drawRoom(ctx, L) {
    const { feetY } = L;
    drawOpsRoom(ctx, L, this.clock, this.seal);
    this.drawDoor(ctx, L);
    if (!L.desk) this.drawAnalyst(ctx, L);

    // Voss and the agent
    const A = this.assets.actors.player, VS = this.assets.voss;
    const v = this.voss, a = this.agent;
    const vx = Math.round(lerp(L.vossX, L.handX, v.k));
    const ax = Math.round(lerp(L.agentX, L.doorX, a.k));
    floorShadow(ctx, vx, feetY); floorShadow(ctx, ax, feetY);
    const pose = this.vossPose();
    const talkBob = this.phase === 'talk' && !this.box.lineDone && this.box.mouth === 'open' ? 1 : 0;
    const vImg = { right: VS.right, left: VS.left, up: VS.up, pointR: VS.pointR }[pose] || VS.right;
    if (v.walking) drawWalker(ctx, vImg, vx - 6, feetY - 15, v.walkT, true);
    else ctx.drawImage(vImg, vx - 6, feetY - 15 - talkBob);
    // the folder: out in Voss's hand, flying across, or held by the agent
    const vHand = { x: vx + 4, y: feetY - 9 };
    const aFace = this.agentFace();
    const aHand = { x: ax + (aFace === 'right' ? -1 : -9), y: feetY - 9 };
    if (v.hold && this.folderFly === null) this.drawFolder(ctx, vHand.x, vHand.y);
    const aImg = A[aFace] || A.up;
    if (a.walking) drawWalker(ctx, aImg, ax - 6, feetY - 15, a.walkT, true);
    else ctx.drawImage(aImg, ax - 6, feetY - 15);
    if (this.folderFly !== null) {
      const k = easeInOut(this.folderFly);
      this.drawFolder(ctx, lerp(vHand.x, aHand.x, k), lerp(vHand.y, aHand.y, k) - Math.sin(k * Math.PI) * 3);
    } else if (a.folder && aFace !== 'up') {
      this.drawFolder(ctx, aHand.x + (aFace === 'right' ? 5 : 0), aHand.y + 1);
    }

    if (L.desk) {
      drawDesk(ctx, L, this.clock, { screens: [0.82], mug: 0.6 });
      this.drawAnalyst(ctx, L);
    }
  }

  render(ctx, vw, vh) {
    const L = this.layout(vw, vh);
    ctx.imageSmoothingEnabled = false;
    if (this.phase === 'card') {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, vw, vh);
      return;
    }
    this.drawRoom(ctx, L);
    const screens = this.screenFns || (this.screenFns = Object.fromEntries(Object.entries(SCREENS)
      .map(([k, fn]) => [k, (c, R, tm) => fn(c, R, tm, this.art)])));
    drawMonitor(ctx, L.R, screens, this.screen, this.clock);

    // up from black at the start, down to black at the end
    let black = 0;
    if (this.phase === 'fadein') black = Math.max(0, 1 - this.t / FADE_T);
    if (this.phase === 'out') black = Math.min(1, this.t / (OUT_T * 0.8));
    if (black > 0) {
      ctx.globalAlpha = black;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalAlpha = 1;
    }
  }
}
