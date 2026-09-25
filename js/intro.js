// Stage 1 opening cutscene.
//
//   feed   : a satellite replay, full screen. The alien cruiser burns in,
//            takes a hit, breaks apart and scatters escape pods over the fields.
//   zoom   : the camera pulls back, and the replay turns out to be playing on
//            the wall monitor of an ops room: Handler Voss and the agent.
//   talk   : Voss briefs the agent line by line (typed out, talking portrait);
//            the monitor follows along with each line.
//   choice : ACCEPT ORDERS.
//   out    : fade to black, stage/scene title card, then onAccept().
//
// The pictures are drawn into the game's low-res buffer (main.js calls
// update/render while its state is 'intro'). The dialogue box, choice, SKIP
// and title card are DOM in #cine so the text gets the pixel font.
//
// The pull-back is a real camera move: the replay is rendered at the
// monitor's aspect, sized to cover the screen, and the room and the replay
// scale down together around one fixed pivot until the replay sits in the
// monitor at 1:1. Works the same in portrait and landscape.
import { sfx } from './audio.js';
import { buildShip, shatter, buildMiniPod, buildDebris, pixelText, textWidth } from './data/storyArt.js';
import { drawSeal } from './briefing.js';
import { STAGE1 } from './data/stage1.js';

const FEED_T = 7.0;      // replay, full screen
const ZOOM_T = 2.2;      // pull back to the ops room
const SETTLE_T = 0.7;    // beat before Voss speaks
const OUT_T = 3.4;       // fade + title card after ACCEPT ORDERS
const HORIZON = 0.8;     // replay horizon, as a fraction of the screen height
const CPS = 42;          // dialogue typing speed (chars/s)

const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const rand = (a, b) => a + Math.random() * (b - a);
const hash = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// filled pixel disc
function disc(ctx, cx, cy, r, col) {
  ctx.fillStyle = col;
  cx = Math.round(cx); cy = Math.round(cy); r = Math.max(0, Math.round(r));
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy) + 0.35);
    ctx.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return [c, x];
}

/* ============================ THE REPLAY ============================ */
// Action runs in "window" coords (u, v in 0..1 across the visible screen)
// so it is framed the same in portrait and landscape; the sky, stars and
// ground fill the whole replay canvas around it.
class Feed {
  constructor() {
    this.shipImg = buildShip();
    this.frags = shatter(this.shipImg, 7, 11);
    this.podImg = buildMiniPod();
    this.t = 0;
    this.parts = []; this.pods = []; this.booms = []; this.glows = [];
    this.pieces = null;
    this.flash = 0; this.shake = 0; this.emit = 0; this.podsOut = 0; this.landed = 0;
    this.s = this.shipAt(0); this.rot = 0;
    this.stars = Array.from({ length: 110 }, (_, i) => ({
      u: hash(i * 3 + 1), v: hash(i * 3 + 2) * 0.9, ph: hash(i * 3 + 3) * 6.28, big: hash(i * 7 + 5) < 0.14,
    }));
    this.city = Array.from({ length: 30 }, (_, i) => ({ u: 0.03 + hash(i * 5 + 9) * 0.27, h: hash(i * 5 + 10), c: hash(i * 5 + 11) }));
  }

  shipAt(t) { return { u: 1.12 - 0.105 * t - 0.004 * t * t, v: -0.12 + 0.085 * t + 0.012 * t * t }; }
  shipVel(t) { return { u: -0.105 - 0.008 * t, v: 0.085 + 0.024 * t }; }

  boom(u, v, r, dur) { this.booms.push({ u, v, r, dur, t: 0 }); }

  sparks(u, v, n, W, H) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(30, 90);
      this.parts.push({ u, v, vu: Math.cos(a) * sp / W, vv: Math.sin(a) * sp / H, t: 0, life: rand(0.4, 0.9), kind: 'spark' });
    }
  }

  ejectPod(src, vel) {
    this.podsOut++;
    sfx.pod();
    this.pods.push({ u: src.u, v: src.v, vu: vel.u * 0.4 + rand(-0.15, 0.12), vv: vel.v * 0.3 + rand(-0.12, -0.02) });
  }

  breakUp(s, vel, W, H) {
    this.flash = 1; this.shake = 5;
    sfx.boom(true);
    this.boom(s.u, s.v, 15, 0.95);
    this.sparks(s.u, s.v, 26, W, H);
    const c = Math.cos(this.rot), sn = Math.sin(this.rot);
    this.pieces = this.frags.map(f => {
      const ox = f.cx - this.shipImg.width / 2, oy = f.cy - this.shipImg.height / 2;
      const rx = ox * c - oy * sn, ry = ox * sn + oy * c;
      return {
        img: f.img, cx: f.cx, cy: f.cy, u: s.u + rx / W, v: s.v + ry / H,
        vu: vel.u * 0.7 + rx / W * 1.6 + rand(-0.02, 0.02), vv: vel.v * 0.55 + ry / H * 1.6 + rand(-0.03, 0.01),
        rot: this.rot, vr: rand(-2.4, 2.4),
      };
    });
  }

  update(dt, W, H) {
    const t = (this.t += dt);
    this.flash = Math.max(0, this.flash - dt * 3);
    this.shake = Math.max(0, this.shake - dt * 5);
    const s = this.shipAt(t), vel = this.shipVel(t);
    const dl = Math.hypot(vel.u * W, vel.v * H) || 1;
    const dx = vel.u * W / dl, dy = vel.v * H / dl;       // travel direction, screen px
    if (!this.pieces) {
      this.s = s;
      this.rot = Math.atan2(dy, dx) - Math.PI + (this.hit ? Math.sin(t * 9) * 0.06 : 0);
    }

    // the story beats
    if (!this.hit && t >= 1.9) { this.hit = true; this.boom(s.u, s.v, 7, 0.5); this.sparks(s.u, s.v, 10, W, H); sfx.boom(); this.shake = 2; }
    if (!this.pieces && t >= 3.55) this.breakUp(s, vel, W, H);
    if (this.pieces && !this.hit2 && t >= 4.5 && this.pieces.length) {
      this.hit2 = true;
      const p = this.pieces[0];
      this.boom(p.u, p.v, 9, 0.6); this.sparks(p.u, p.v, 12, W, H); sfx.boom(); this.shake = 2.5;
    }
    while (this.podsOut < 10 && t >= 2.4 + this.podsOut * 0.16) {
      const src = this.pieces && this.pieces.length ? this.pieces[this.podsOut % this.pieces.length] : s;
      this.ejectPod(src, vel);
    }

    // trails, at a fixed rate whatever the frame rate
    this.emit += dt;
    while (this.emit > 1 / 120) {
      this.emit -= 1 / 120;
      if (!this.pieces && t > 0.15) {
        // fire streams back along the hull from the nose and pours off the tail
        for (const back of [8, 24]) {
          const tu = s.u - dx * back / W, tv = s.v - dy * back / H;
          const sp = rand(8, 22);
          this.parts.push({
            u: tu + rand(-3, 3) / W, v: tv + rand(-3, 3) / H,
            vu: (-dx * sp + rand(-5, 5)) / W, vv: (-dy * sp + rand(-5, 5)) / H,
            t: 0, life: back > 10 ? rand(0.6, 1.4) : rand(0.2, 0.4), kind: 'fire',
          });
        }
      }
      for (const p of this.pieces || []) {
        if (Math.random() < 0.3) this.parts.push({ u: p.u, v: p.v, vu: rand(-4, 4) / W, vv: rand(-8, 0) / H, t: 0, life: rand(0.4, 0.9), kind: 'fire' });
      }
      for (const p of this.pods) {
        if (Math.random() < 0.35) this.parts.push({ u: p.u, v: p.v, vu: 0, vv: -3 / H, t: 0, life: 0.7, kind: 'trail' });
      }
    }

    for (const p of this.parts) {
      p.u += p.vu * dt; p.v += p.vv * dt; p.t += dt;
      if (p.kind === 'spark') p.vv += 70 / H * dt;
    }
    this.parts = this.parts.filter(p => p.t < p.life);
    for (const p of this.pods) {
      p.vv += 0.14 * dt; p.u += p.vu * dt; p.v += p.vv * dt;
      if (p.v >= HORIZON - 0.004) { p.dead = true; this.glows.push({ u: p.u, t: 0, life: 0.8, pod: true }); }
    }
    this.pods = this.pods.filter(p => !p.dead);
    if (this.pieces) {
      for (const p of this.pieces) {
        p.vv += 0.06 * dt; p.u += p.vu * dt; p.v += p.vv * dt; p.rot += p.vr * dt;
        if (p.v >= HORIZON + 0.01) {
          p.dead = true;
          this.glows.push({ u: p.u, t: 0, life: 2.6 });
          if (this.landed++ < 2) sfx.boom();
        }
      }
      this.pieces = this.pieces.filter(p => !p.dead);
    }
    for (const b of this.booms) b.t += dt;
    this.booms = this.booms.filter(b => b.t < b.dur);
    for (const g of this.glows) g.t += dt;
    this.glows = this.glows.filter(g => g.t < g.life);
  }

  // Draw into a replay canvas of FW x FH; `win` is where the visible screen
  // sits inside it (the action is framed to that window).
  render(ctx, FW, FH, win) {
    const t = this.t;
    const W = win.w, H = win.h;
    const X = (u) => win.x + u * W, Y = (v) => win.y + v * H;
    const hy = Math.round(Y(HORIZON));

    // dusk sky
    const g = ctx.createLinearGradient(0, 0, 0, hy);
    g.addColorStop(0, '#060a1c');
    g.addColorStop(Math.max(0, Math.min(1, Y(0.35) / hy)), '#15163a');
    g.addColorStop(Math.max(0, Math.min(1, Y(0.62) / hy)), '#3e2550');
    g.addColorStop(1, '#a8503c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FW, hy);
    for (const s of this.stars) {
      const y = s.v * hy * 0.85;
      ctx.globalAlpha = (0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.9 + s.ph))) * (1 - y / hy);
      ctx.fillStyle = s.big ? '#e6efff' : '#9db2da';
      ctx.fillRect(Math.round(s.u * FW), Math.round(y), s.big ? 2 : 1, s.big ? 2 : 1);
    }
    ctx.globalAlpha = 1;
    // cloud banks: lumpy dark tops, lit orange from below by the sunset
    for (const [cv, cu, cw, sp, seed] of [[0.47, 0.08, 0.3, 3, 1], [0.58, 0.55, 0.26, 2, 2], [0.68, 0.18, 0.34, 4, 3], [0.73, 0.7, 0.2, 3, 4]]) {
      const w = Math.max(24, Math.round(cw * W));
      const y = Math.round(Y(cv));
      const x0 = Math.round(((X(cu) + t * sp) % (FW + w)) - w * 0.3);
      for (let i = 0; i < w; i++) {
        const e = Math.min(i, w - 1 - i);                       // rounded ends
        const top = Math.round(Math.min(e * 0.5, 3 + 2 * Math.sin(i * 0.35 + seed * 2) + Math.sin(i * 0.9 + seed)));
        if (top <= 0) continue;
        ctx.fillStyle = '#2a1f3e'; ctx.fillRect(x0 + i, y - top, 1, top + 2);
        ctx.fillStyle = '#3a2a4e'; ctx.fillRect(x0 + i, y - top, 1, 1);
        if (e > 1) { ctx.fillStyle = e > 3 ? '#d0704a' : '#8a4a4a'; ctx.fillRect(x0 + i, y + 2, 1, 1); }
      }
    }

    // wreckage fires glowing up off the horizon
    for (const gl of this.glows) {
      const k = gl.t / gl.life, x = X(gl.u);
      const a = gl.pod ? (1 - k) * 0.8 : Math.min(1, gl.t * 3) * (1 - k * 0.7);
      ctx.globalAlpha = a * 0.35;
      disc(ctx, x, hy, (gl.pod ? 4 : 10) + k * (gl.pod ? 3 : 8), gl.pod ? '#bff8ff' : '#f07018');
      ctx.globalAlpha = a * 0.8;
      disc(ctx, x, hy, gl.pod ? 1 : 4, gl.pod ? '#ffffff' : '#ffc23a');
    }
    ctx.globalAlpha = 1;

    // ground: rolling hills, a tree line, faint field rows and the city
    ctx.fillStyle = '#0b0f18';
    ctx.fillRect(0, hy, FW, FH - hy);
    ctx.fillStyle = '#111827';
    for (let x = 0; x < FW; x++) {
      const bump = Math.round(1.5 + 1.5 * Math.sin(x * 0.043) + 1.2 * Math.sin(x * 0.117 + 2) + (x % 6 < 3 ? 1 : 0));
      ctx.fillRect(x, hy - bump, 1, bump + 1);
    }
    ctx.fillStyle = '#141c2c';
    for (const d of [3, 8, 15, 25]) if (hy + d < FH) ctx.fillRect(0, hy + d, FW, 1);
    for (const l of this.city) {
      const x = Math.round(X(l.u)), y = hy - 2 - Math.round(l.h * 5);
      ctx.fillStyle = '#10141f'; ctx.fillRect(x - 1, y, 3, hy - y);
      ctx.fillStyle = l.c < 0.6 ? '#ffd75e' : '#e8ecf4';
      if (Math.sin(t * 2 + l.c * 30) > -0.8) ctx.fillRect(x, y + 1, 1, 1);
    }

    ctx.save();
    if (this.shake > 0.2) ctx.translate(Math.round(rand(-1, 1) * this.shake), Math.round(rand(-1, 1) * this.shake));

    // fire, smoke, sparks, pod trails
    for (const p of this.parts) {
      const k = p.t / p.life;
      const x = Math.round(X(p.u)), y = Math.round(Y(p.v));
      if (p.kind === 'fire') {
        if (k < 0.5) {
          ctx.fillStyle = k < 0.1 ? '#fff2c0' : k < 0.22 ? '#ffd75e' : k < 0.36 ? '#f07018' : '#c23a12';
          const sz = k < 0.22 ? 3 : 2;
          ctx.fillRect(x - 1, y - 1, sz, sz);
        } else {
          ctx.globalAlpha = (1 - k) * 1.6;
          ctx.fillStyle = k < 0.72 ? '#4a4452' : '#2a2530';
          const sz = 2 + Math.round(k * 3);
          ctx.fillRect(x - (sz >> 1), y - (sz >> 1), sz, sz);
          ctx.globalAlpha = 1;
        }
      } else if (p.kind === 'trail') {
        ctx.globalAlpha = (1 - k) * 0.7;
        ctx.fillStyle = '#c8d4e0';
        ctx.fillRect(x, y, 1, 1);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = k < 0.5 ? '#fff6c8' : '#ffb35e';
        ctx.fillRect(x, y, 1, 1);
      }
    }

    // escape pods, braking thruster flickering underneath
    for (const p of this.pods) {
      const x = Math.round(X(p.u)), y = Math.round(Y(p.v));
      ctx.drawImage(this.podImg, x - 2, y - 3);
      ctx.fillStyle = Math.floor(t * 20) % 2 ? '#ffd75e' : '#f07018';
      ctx.fillRect(x - 1, y + 3, 2, 1 + (Math.floor(t * 30) % 2));
    }

    // the cruiser, then its pieces
    if (!this.pieces) {
      const x = X(this.s.u), y = Y(this.s.v);
      const vel = this.shipVel(t);
      const dl = Math.hypot(vel.u * W, vel.v * H) || 1;
      const nx = x + vel.u * W / dl * 25, ny = y + vel.v * H / dl * 25;
      // re-entry plasma: a hot bow shock wrapped round the nose
      const fl = Math.floor(t * 24) % 2;
      disc(ctx, nx, ny, 4 + fl, '#f07018');
      disc(ctx, nx, ny, 3, '#ffc23a');
      disc(ctx, nx - vel.u * W / dl, ny - vel.v * H / dl, 2, '#fff2c0');
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.rotate(this.rot);
      ctx.drawImage(this.shipImg, -this.shipImg.width / 2, -this.shipImg.height / 2);
      ctx.restore();
    } else {
      for (const p of this.pieces) {
        ctx.save();
        ctx.translate(Math.round(X(p.u)), Math.round(Y(p.v)));
        ctx.rotate(p.rot);
        ctx.drawImage(p.img, -Math.round(p.cx), -Math.round(p.cy));
        ctx.restore();
      }
    }

    // explosions: white core, yellow, orange rim, fading out
    for (const b of this.booms) {
      const k = b.t / b.dur, x = X(b.u), y = Y(b.v);
      const r = b.r * (0.35 + 0.65 * Math.sqrt(k));
      ctx.globalAlpha = 1 - k;
      disc(ctx, x, y, r, '#c23a12');
      disc(ctx, x, y, r * 0.75, '#f07018');
      disc(ctx, x, y, r * 0.5 * (1 - k * 0.6), '#ffd75e');
      if (k < 0.4) disc(ctx, x, y, r * 0.3, '#ffffff');
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(0.8, this.flash);
      ctx.fillStyle = '#fff6e0';
      ctx.fillRect(0, 0, FW, FH);
      ctx.globalAlpha = 1;
    }
    // video scanlines
    ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
    for (let y = 0; y < FH; y += 2) ctx.fillRect(0, y, FW, 1);
  }
}

/* ============================ THE MONITOR ============================ */
// What the ops-room wall screen shows under each line of the briefing, drawn
// natively at the monitor's size (R). tm = seconds since the screen changed.
const DEBRIS = buildDebris();
const SHIP_SMALL = buildShip();

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

const blink = (tm, rate = 3) => Math.floor(tm * rate) % 2 === 0;

const SCREENS = {
  orbit(ctx, R, tm) {
    screenBg(ctx, R, '#03060f', 17);
    // Earth's limb along the bottom, atmosphere glowing on the rim
    const r = R.h * 1.3, cx = R.x + R.w * 0.42, cy = R.y + R.h + r * 0.62;
    for (let y = Math.max(R.y, Math.ceil(cy - r - 3)); y < R.y + R.h; y++) {
      const dy = y - cy;
      const half = Math.sqrt(Math.max(0, r * r - dy * dy));
      const halfA = Math.sqrt(Math.max(0, (r + 3) * (r + 3) - dy * dy));
      ctx.fillStyle = '#16305a'; ctx.fillRect(Math.round(cx - halfA), y, Math.round(halfA * 2), 1);
      if (half > 0) {
        ctx.fillStyle = '#1e4a8a'; ctx.fillRect(Math.round(cx - half), y, Math.round(half * 2), 1);
        ctx.fillStyle = '#6fb8ff';
        ctx.fillRect(Math.round(cx - half), y, 1, 1); ctx.fillRect(Math.round(cx + half) - 1, y, 1, 1);
      }
    }
    ctx.fillStyle = '#2c6e3a';                                  // a continent or two
    ctx.fillRect(Math.round(cx - r * 0.2), Math.round(cy - r + 5), 12, 3);
    ctx.fillRect(Math.round(cx + r * 0.15), Math.round(cy - r + 8), 8, 4);
    // the craft sliding in along a dotted track, ringed in red
    const k = Math.min(1, tm / 3.5);
    const bx = R.x + R.w * lerp(1.02, 0.76, k), by = R.y + R.h * lerp(0.08, 0.3, k);
    ctx.fillStyle = '#41f0d8';
    for (let i = 0; i < 16; i++) {
      const q = i / 16;
      if (i % 2 === 0) ctx.fillRect(Math.round(R.x + R.w * lerp(0.76, 0.2, q)), Math.round(R.y + R.h * (0.3 + q * q * 0.25)), 1, 1);
    }
    ctx.fillStyle = '#b98cf5'; ctx.fillRect(Math.round(bx) - 2, Math.round(by), 5, 2);
    if (blink(tm)) { ctx.strokeStyle = '#ff5e6c'; ctx.lineWidth = 1; ctx.strokeRect(Math.round(bx) - 5, Math.round(by) - 3, 11, 8); }
    pixelText(ctx, 'ORBIT TRACK', R.x + 3, R.y + 3, '#41f0d8');
    if (blink(tm, 2)) pixelText(ctx, 'UNKNOWN CRAFT', R.x + 3, R.y + R.h - 8, '#ff5e6c');
  },

  radar(ctx, R, tm) {
    screenBg(ctx, R, '#021008');
    const cx = Math.round(R.x + R.w * 0.5), cy = Math.round(R.y + R.h * 0.55);
    const rr = Math.min(R.w, R.h) * 0.42;
    ctx.strokeStyle = '#0f4a2a'; ctx.lineWidth = 1;
    for (const f of [0.3, 0.6, 1]) { ctx.beginPath(); ctx.arc(cx + 0.5, cy + 0.5, Math.round(rr * f), 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = '#0f4a2a'; ctx.fillRect(cx - Math.round(rr), cy, Math.round(rr * 2), 1); ctx.fillRect(cx, cy - Math.round(rr), 1, Math.round(rr * 2));
    // sweep with a fading tail
    for (let i = 0; i < 6; i++) {
      const a = tm * 2.4 - i * 0.07;
      ctx.globalAlpha = 1 - i / 6;
      ctx.strokeStyle = '#41f0a0';
      ctx.beginPath(); ctx.moveTo(cx + 0.5, cy + 0.5); ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // the satellite ring (outer) and the craft parked just past its far edge
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      ctx.fillStyle = '#41f0d8'; ctx.fillRect(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr), 2, 2);
    }
    const sa = -0.6, sx = Math.round(cx + Math.cos(sa) * (rr + 6)), sy = Math.round(cy + Math.sin(sa) * (rr + 6));
    if (blink(tm, 4)) { ctx.fillStyle = '#e08bff'; ctx.fillRect(sx - 1, sy - 1, 3, 3); }
    ctx.fillStyle = '#ff5e6c'; ctx.fillRect(sx - 3, sy - 3, 1, 1); ctx.fillRect(sx + 3, sy - 3, 1, 1); ctx.fillRect(sx - 3, sy + 3, 1, 1); ctx.fillRect(sx + 3, sy + 3, 1, 1);
    pixelText(ctx, 'SAT NETWORK', R.x + 3, R.y + 3, '#41f0a0');
    pixelText(ctx, 'WARNING:', R.x + 3, R.y + R.h - 8, '#41f0a0');
    if (blink(tm, 2)) pixelText(ctx, 'BYPASSED', R.x + 3 + textWidth('WARNING: '), R.y + R.h - 8, '#ff5e6c');
  },

  impact(ctx, R, tm) {
    screenBg(ctx, R, '#03060f', 41);
    // loop: the rock drifts in, strikes the hull, the ship lurches
    const cyc = tm % 3.6;
    const sx = Math.round(R.x + R.w * 0.62 - SHIP_SMALL.width / 2), sy = Math.round(R.y + R.h * 0.5 - SHIP_SMALL.height / 2);
    const hitX = sx + 20, hitY = sy + 8;
    const hit = cyc > 1.5;
    ctx.save();
    ctx.translate(sx + SHIP_SMALL.width / 2, sy + SHIP_SMALL.height / 2);
    if (hit) {
      const k = Math.min(1, (cyc - 1.5) / 1.5);
      ctx.rotate(k * 0.35);
      ctx.translate(Math.round(k * 4), Math.round(k * 6));
      if (cyc < 1.8) ctx.translate(Math.round(rand(-1, 1)), Math.round(rand(-1, 1)));
    }
    ctx.drawImage(SHIP_SMALL, -SHIP_SMALL.width / 2, -SHIP_SMALL.height / 2);
    ctx.restore();
    if (!hit) {
      const k = cyc / 1.5;
      ctx.drawImage(DEBRIS, Math.round(lerp(R.x - 12, hitX - 8, k)), Math.round(lerp(R.y + R.h * 0.08, hitY - 5, k)));
    } else if (cyc < 2.2) {
      const k = (cyc - 1.5) / 0.7;
      ctx.globalAlpha = 1 - k;
      disc(ctx, hitX, hitY, 3 + k * 9, '#f07018');
      disc(ctx, hitX, hitY, 2 + k * 5, '#ffd75e');
      disc(ctx, hitX, hitY, 2, '#ffffff');
      ctx.globalAlpha = 1;
    }
    pixelText(ctx, 'SAT-7 REPLAY', R.x + 3, R.y + 3, '#41f0d8');
    if (hit && blink(tm, 3)) pixelText(ctx, 'HULL IMPACT', R.x + 3, R.y + R.h - 8, '#ff5e6c');
  },

  map(ctx, R, tm) {
    screenBg(ctx, R, '#06122a');
    ctx.fillStyle = '#0c2044';
    for (let x = R.x + 4; x < R.x + R.w; x += 10) ctx.fillRect(x, R.y, 1, R.h);
    for (let y = R.y + 4; y < R.y + R.h; y += 10) ctx.fillRect(R.x, y, R.w, 1);
    // city to the south, farmland to the north, one road between
    const ccx = Math.round(R.x + R.w * 0.5), ccy = Math.round(R.y + R.h * 0.8);
    ctx.fillStyle = '#8a6640'; ctx.fillRect(ccx, Math.round(R.y + R.h * 0.2), 1, ccy - Math.round(R.y + R.h * 0.2));
    for (let i = 0; i < 18; i++) {
      const bx = ccx - 18 + Math.floor(hash(i + 60) * 36), by = ccy - 6 + Math.floor(hash(i + 90) * 12);
      ctx.fillStyle = '#3a4a68'; ctx.fillRect(bx, by, 4, 3);
      if (hash(i + 120) < 0.6) { ctx.fillStyle = '#ffd75e'; ctx.fillRect(bx + 1, by + 1, 1, 1); }
    }
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i % 2 ? '#1c4a2a' : '#2c6e3a';
      ctx.fillRect(Math.round(R.x + R.w * (0.28 + (i % 5) * 0.09)), Math.round(R.y + R.h * (0.12 + Math.floor(i / 5) * 0.14)), Math.round(R.w * 0.08), Math.round(R.h * 0.12));
    }
    pixelText(ctx, 'CITY', ccx + 22, ccy - 2, '#8fa0c4');
    // trajectory: a dotted arc drawing itself in from the corner to the LZ
    const lx = Math.round(R.x + R.w * 0.44), ly = Math.round(R.y + R.h * 0.25);
    const k = Math.min(1, tm / 1.6);
    ctx.fillStyle = '#ff9e5e';
    for (let i = 0; i < 40 * k; i++) {
      const q = i / 40;
      const x = lerp(lerp(R.x + R.w - 2, R.x + R.w * 0.8, q), lerp(R.x + R.w * 0.8, lx, q), q);
      const y = lerp(lerp(R.y + 2, R.y + R.h * 0.05, q), lerp(R.y + R.h * 0.05, ly, q), q);
      if (i % 2 === 0) ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    if (k >= 1) {
      ctx.strokeStyle = blink(tm) ? '#ff5e6c' : '#ffd75e';
      ctx.lineWidth = 1;
      ctx.strokeRect(lx - 4, ly - 4, 9, 9);
      ctx.fillStyle = '#ff5e6c'; ctx.fillRect(lx, ly, 1, 1);
      pixelText(ctx, 'LZ', lx + 7, ly - 2, '#ff5e6c');
    }
    pixelText(ctx, 'TRAJECTORY', R.x + 3, R.y + 3, '#6ec2ff');
    pixelText(ctx, 'N', R.x + R.w - 6, R.y + 3, '#8fa0c4');
    if (R.w >= 108) pixelText(ctx, 'RURAL FIELD N. OF CITY', R.x + 3, R.y + R.h - 8, '#ffd75e');
  },

  target(ctx, R, tm) {
    screenBg(ctx, R, '#0a1a10');
    // the landing zone from above: crop rows, the road, forest round the edge
    ctx.fillStyle = '#16301b';
    ctx.fillRect(R.x, R.y, R.w, 4); ctx.fillRect(R.x, R.y + R.h - 4, R.w, 4);
    ctx.fillRect(R.x, R.y, 4, R.h); ctx.fillRect(R.x + R.w - 4, R.y, 4, R.h);
    ctx.fillStyle = '#1f4a26';
    for (let y = R.y + 7; y < R.y + R.h - 5; y += 3) ctx.fillRect(R.x + 6, y, R.w - 12, 1);
    const rx = Math.round(R.x + R.w * 0.5);
    ctx.fillStyle = '#6b5236';
    for (let y = R.y; y < R.y + R.h; y++) ctx.fillRect(rx + Math.round(Math.sin(y * 0.09) * 3) - 1, y, 3, 1);
    // hostiles
    for (let i = 0; i < 15; i++) {
      if (!blink(tm + hash(i + 7), 2.5)) continue;
      const x = Math.round(R.x + 8 + hash(i + 200) * (R.w - 16)), y = Math.round(R.y + 8 + hash(i + 300) * (R.h - 20));
      ctx.fillStyle = '#ff5e6c'; ctx.fillRect(x, y, 2, 2);
    }
    // the van and the agent
    const vx = rx - 7, vy = Math.round(R.y + R.h * 0.7);
    ctx.fillStyle = '#20242e'; ctx.fillRect(vx, vy, 5, 3);
    if (blink(tm, 3)) {
      ctx.fillStyle = '#41f0d8'; ctx.fillRect(rx + 3, vy, 2, 2);
      pixelText(ctx, 'YOU', rx + 7, vy - 1, '#41f0d8');
    }
    pixelText(ctx, 'LANDING ZONE', R.x + 6, R.y + 6, '#59d98c');
    pixelText(ctx, 'HOSTILES: 15', R.x + 6, R.y + R.h - 10, '#ff5e6c');
  },
};

/* ============================ THE CUTSCENE ============================ */

export class Intro {
  // root: #cine; onAccept(): called once the title card is up
  constructor(assets, root, { onAccept }) {
    this.assets = assets;
    this.root = root;
    this.onAccept = onAccept;
    this.feed = new Feed();
    this.phase = 'feed';
    this.t = 0;
    this.clock = 0;
    this.li = -1;
    this.screen = { mode: 'feed', t: 0, staticT: 0 };
    this.feedCv = null; this.feedCtx = null;
    this.roomCv = null; this.roomCtx = null;
    this.seal = (() => { const c = document.createElement('canvas'); c.width = 26; c.height = 26; drawSeal(c); return c; })();
    this.blinkT = 2; this.blinking = 0;
    this.mouth = 'closed';
    this.agentHop = 0;
    this.buildDom();
    setTimeout(() => sfx.rumble(), 250);
  }

  /* ---------- DOM: dialogue box, choice, skip, title card ---------- */

  buildDom() {
    const el = (tag, cls, html) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (html !== undefined) e.innerHTML = html;
      return e;
    };
    const r = this.root;
    r.innerHTML = '';
    r.classList.remove('hidden', 'fade-out');

    this.skipBtn = el('button', 'cine-skip', 'SKIP');
    this.skipBtn.addEventListener('click', (e) => { e.stopPropagation(); sfx.click(); this.skip(); });

    this.dlg = el('div', 'dlg pending');
    this.face = el('canvas', 'dlg-face pixel-canvas');
    this.face.width = 28; this.face.height = 30;
    const body = el('div', 'dlg-body');
    body.appendChild(el('div', 'dlg-name', STAGE1.intro.speaker));
    this.textEl = el('div', 'dlg-text');
    body.appendChild(this.textEl);
    this.nextEl = el('i', 'dlg-next hidden');
    this.dlg.appendChild(this.face);
    this.dlg.appendChild(body);
    this.dlg.appendChild(this.nextEl);

    this.choiceEl = el('div', 'dlg-choice hidden');
    const accept = el('button', 'menu-btn primary', STAGE1.intro.choice);
    accept.addEventListener('click', (e) => { e.stopPropagation(); this.accept(); });
    this.choiceEl.appendChild(accept);

    this.card = el('div', 'title-card hidden',
      `<div class="tc-stage">${STAGE1.name}</div>` +
      `<div class="tc-scene">SCENE 1: ${STAGE1.scenes[0].name.toUpperCase()}</div>`);

    this.dlg.appendChild(this.choiceEl);
    r.appendChild(this.dlg);
    r.appendChild(this.skipBtn);
    r.appendChild(this.card);
    // a tap anywhere else moves things along
    r.addEventListener('click', () => this.advance());
    this.drawFace();
    // size the box for the longest line up front, so it never grows mid-scene
    // (and the room laid out above it never jumps)
    this.fitBox = () => {
      const longest = STAGE1.intro.lines.reduce((a, l) => (l.text.length > a.length ? l.text : a), '');
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
    x.drawImage(this.assets.voss.portrait[frame], 0, 0);
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

  /* ---------- flow ---------- */

  setScreen(mode) {
    if (this.screen.mode === mode) return;
    this.screen = { mode, t: 0, staticT: 0.3 };
    sfx.static();
  }

  startTalk() {
    this.phase = 'talk';
    this.dlg.classList.remove('pending');
    this.nextLine();
  }

  nextLine() {
    this.li++;
    const line = STAGE1.intro.lines[this.li];
    this.setScreen(line.screen);
    this.setLine(line.text);
  }

  finishLine() {
    this.typed = this.total;
    this.paintTyped();
    this.lineDone = true;
    this.mouth = 'closed';
    if (this.li >= STAGE1.intro.lines.length - 1) this.showChoice();
    else this.nextEl.classList.remove('hidden');
  }

  showChoice() {
    if (this.phase === 'choice') return;
    this.phase = 'choice';
    this.nextEl.classList.add('hidden');
    this.choiceEl.classList.remove('hidden');
    this.skipBtn.classList.add('hidden');
  }

  // tap / Enter / A button
  advance() {
    if (this.phase === 'feed' || this.phase === 'zoom') {
      // fast-forward the replay, straight to the room
      this.phase = 'settle'; this.t = 0;
      this.setScreen('static');
    } else if (this.phase === 'talk') {
      if (!this.lineDone) this.finishLine();
      else if (this.li < STAGE1.intro.lines.length - 1) { sfx.click(); this.nextLine(); }
    } else if (this.phase === 'choice') {
      this.accept();
    }
  }

  // SKIP / Esc / Start: the whole briefing, straight to the order
  skip() {
    if (this.phase === 'choice' || this.phase === 'out') return;
    this.dlg.classList.remove('pending');
    this.li = STAGE1.intro.lines.length - 2;
    this.nextLine();
    this.finishLine();
  }

  accept() {
    if (this.phase === 'out') return;
    this.phase = 'out';
    this.t = 0;
    sfx.accept();
    this.choiceEl.classList.add('hidden');
    this.skipBtn.classList.add('hidden');
    this.agentHop = 0.001;
  }

  // main.js: the mission is up behind the title card, fade the overlay away
  finish() {
    this.root.classList.add('fade-out');
    setTimeout(() => this.destroy(), 700);
  }

  destroy() {
    window.removeEventListener('resize', this.fitBox);
    this.root.innerHTML = '';
    this.root.classList.add('hidden');
    this.root.classList.remove('fade-out');
  }

  update(dt) {
    this.t += dt;
    this.clock += dt;
    this.screen.t += dt;
    this.screen.staticT = Math.max(0, this.screen.staticT - dt);

    if (this.phase === 'feed' || this.phase === 'zoom') {
      const v = this.view || { w: 200, h: 300 };
      this.feed.update(dt, v.w, v.h);
    }
    if (this.phase === 'feed' && this.t >= FEED_T) { this.phase = 'zoom'; this.t = 0; }
    else if (this.phase === 'zoom' && this.t >= ZOOM_T) { this.phase = 'settle'; this.t = 0; this.setScreen('static'); }
    else if (this.phase === 'settle' && this.t >= SETTLE_T) this.startTalk();

    if (this.phase === 'talk' && !this.lineDone) {
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
      if (this.typed >= this.total) this.finishLine();
    }

    // blinking, now and then
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinking = 0.13; this.blinkT = 2 + Math.random() * 2.5; }
    this.blinking = Math.max(0, this.blinking - dt);
    this.drawFace();

    if (this.agentHop > 0) this.agentHop += dt;
    if (this.phase === 'out') {
      if (this.t >= 1.0 && this.card.classList.contains('hidden')) {
        this.dlg.classList.add('hidden');
        this.card.classList.remove('hidden');
        sfx.typeReturn();
      }
      if (this.t >= OUT_T && !this.accepted) {
        this.accepted = true;
        this.onAccept();
      }
    }
  }

  /* ---------- drawing ---------- */

  // Room layout for this screen: the monitor, where people stand, and where
  // the DOM dialogue box starts (so nobody stands behind it).
  layout(vw, vh) {
    const k = vh / Math.max(1, window.innerHeight);
    const box = this.dlg.getBoundingClientRect();
    const dlgTop = box.height ? Math.min(vh, Math.floor(box.top * k)) : Math.floor(vh * 0.66);
    const portrait = vh > vw;
    let mw, mh;
    if (portrait) {
      mw = Math.min(vw - 18, 156) & ~1;
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
    const R = { x: Math.round((vw - mw) / 2), y: my, w: mw, h: mh };
    const wallBottom = R.y + R.h + 16;
    const floor = dlgTop - wallBottom;
    const feetY = portrait ? Math.round(wallBottom + Math.max(22, floor * 0.4)) : Math.min(dlgTop - 3, wallBottom + 22);
    const desk = dlgTop - feetY > 44 ? { y: dlgTop - 26 } : null;
    const spread = Math.min(mw * 0.32, 46);
    return { vw, vh, dlgTop, R, wallBottom, feetY, desk, vossX: Math.round(vw / 2 - spread), agentX: Math.round(vw / 2 + spread) };
  }

  // Foreground console: desk top, the backs of two screens, keyboard lights.
  drawDesk(ctx, L) {
    const { vw, vh } = L, y = L.desk.y, t = this.clock;
    for (const cx of [Math.round(vw * 0.2), Math.round(vw * 0.8)]) {
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
    const mx = Math.round(vw * 0.35);
    ctx.fillStyle = '#05070d'; ctx.fillRect(mx - 1, y - 6, 7, 6);
    ctx.fillStyle = '#d7dfea'; ctx.fillRect(mx, y - 5, 5, 5); ctx.fillRect(mx + 5, y - 4, 1, 2);
    ctx.fillStyle = '#b3261e'; ctx.fillRect(mx, y - 3, 5, 1);
  }

  poses() {
    const line = STAGE1.intro.lines[Math.max(0, this.li)];
    let voss = 'right', agent = 'up';
    if (this.phase === 'talk' || this.phase === 'choice' || this.phase === 'out') {
      if (line.pose === 'monitor') voss = 'up';
      if (line.pose === 'point') { voss = this.lineDone ? 'right' : 'pointR'; agent = 'left'; }
    }
    if (this.phase === 'choice') { voss = 'right'; agent = 'left'; }
    if (this.phase === 'out') { voss = 'right'; agent = this.t > 0.35 ? 'down' : 'left'; }
    return { voss, agent };
  }

  drawRoom(ctx, L) {
    const { vw, vh, R, wallBottom, feetY } = L;
    const t = this.clock;
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
    if (R.y >= 44) ctx.drawImage(this.seal, Math.round(vw / 2 - 13), Math.max(11, Math.round((R.y + 8) / 2 - 13)));
    // equipment racks either side of the screen, LEDs blinking
    for (const rx of [R.x - 22, R.x + R.w + 8]) {
      if (rx < 2 || rx + 14 > vw - 2) continue;
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

    // Voss and the agent
    const { voss, agent } = this.poses();
    const A = this.assets.actors.player, VS = this.assets.voss;
    const shadow = (x) => {
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(x, feetY, 6, 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    };
    shadow(L.vossX); shadow(L.agentX);
    const talkBob = this.phase === 'talk' && !this.lineDone && this.mouth === 'open' ? 1 : 0;
    const vImg = { right: VS.right, up: VS.up, pointR: VS.pointR }[voss] || VS.right;
    ctx.drawImage(vImg, L.vossX - 6, feetY - 15 - talkBob);
    let hop = 0;
    if (this.agentHop > 0.35 && this.agentHop < 1.0) hop = Math.round(Math.abs(Math.sin((this.agentHop - 0.35) * Math.PI * 3)) * 3);
    ctx.drawImage(A[agent] || A.up, L.agentX - 6, feetY - 15 - hop);
    if (L.desk) this.drawDesk(ctx, L);
  }

  drawScreen(ctx, R) {
    const s = this.screen;
    ctx.save();
    ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
    const fn = SCREENS[s.mode];
    if (fn) fn(ctx, R, s.t);
    else { ctx.fillStyle = '#05070d'; ctx.fillRect(R.x, R.y, R.w, R.h); }
    if (s.staticT > 0 || s.mode === 'static') {
      // snow + a rolling tear
      for (let i = 0; i < R.w * R.h * 0.35; i++) {
        const v = Math.random() * 200 | 0;
        ctx.fillStyle = `rgb(${v},${v},${v + 20})`;
        ctx.fillRect(R.x + (Math.random() * R.w | 0), R.y + (Math.random() * R.h | 0), 1, 1);
      }
      ctx.fillStyle = 'rgba(230, 240, 255, 0.25)';
      ctx.fillRect(R.x, R.y + ((this.clock * 120) % R.h | 0), R.w, 2);
    }
    // scanlines + a glint of glass
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    for (let y = R.y; y < R.y + R.h; y += 2) ctx.fillRect(R.x, y, R.w, 1);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(R.x + 2, R.y + 2, Math.round(R.w * 0.3), 1);
    ctx.restore();
  }

  // The replay canvas: monitor-shaped, big enough to cover the screen when
  // the camera is all the way in (zoom Zc).
  ensureCanvases(vw, vh, R, Zc) {
    const FW = Math.ceil(R.w * Zc), FH = Math.ceil(R.h * Zc);
    if (!this.feedCv || this.feedCv.width !== FW || this.feedCv.height !== FH) [this.feedCv, this.feedCtx] = makeCanvas(FW, FH);
    if (!this.roomCv || this.roomCv.width !== vw || this.roomCv.height !== vh) [this.roomCv, this.roomCtx] = makeCanvas(vw, vh);
  }

  render(ctx, vw, vh) {
    this.view = { w: vw, h: vh };
    const L = this.layout(vw, vh);
    const R = L.R;
    ctx.imageSmoothingEnabled = false;

    if (this.phase === 'feed' || this.phase === 'zoom') {
      // camera zoom: Zc (replay fills the screen) -> 1 (room at rest),
      // about a fixed pivot P so it's a pure pull-back
      const Zc = Math.max(1.05, vw / R.w, vh / R.h);
      const z = this.phase === 'feed' ? 0 : easeInOut(Math.min(1, this.t / ZOOM_T));
      const Z = Math.pow(Zc, 1 - z);
      const Rc = { x: R.x + R.w / 2, y: R.y + R.h / 2 };
      const P = { x: (vw / 2 - Rc.x * Zc) / (1 - Zc), y: (vh / 2 - Rc.y * Zc) / (1 - Zc) };
      const map = (x, y) => ({ x: P.x + (x - P.x) * Z, y: P.y + (y - P.y) * Z });
      this.ensureCanvases(vw, vh, R, Zc);

      if (z > 0) {
        this.roomCtx.clearRect(0, 0, vw, vh);
        this.drawRoom(this.roomCtx, L);
        const o = map(0, 0);
        ctx.drawImage(this.roomCv, Math.round(o.x), Math.round(o.y), Math.round(vw * Z), Math.round(vh * Z));
      }
      // the replay, in the monitor's place (1:1 while the camera is all the way in)
      const FW = this.feedCv.width, FH = this.feedCv.height;
      const r0 = map(R.x, R.y);
      const at0 = { x: P.x + (R.x - P.x) * Zc, y: P.y + (R.y - P.y) * Zc };   // replay origin at full zoom
      const win = { x: -at0.x, y: -at0.y, w: vw, h: vh };
      this.feedCtx.clearRect(0, 0, FW, FH);
      this.feed.render(this.feedCtx, FW, FH, win);
      ctx.imageSmoothingEnabled = z > 0;
      ctx.drawImage(this.feedCv, Math.round(r0.x), Math.round(r0.y), Math.round(R.w * Z), Math.round(R.h * Z));
      ctx.imageSmoothingEnabled = false;

      // "replay" read-outs sit on the glass, not in the footage; they fade as we pull back
      const hudA = this.phase === 'feed' ? Math.min(1, this.t * 2) : Math.max(0, 1 - this.t * 3);
      if (hudA > 0) this.drawFeedHud(ctx, vw, vh, hudA);
    } else {
      this.drawRoom(ctx, L);
      this.drawScreen(ctx, R);
    }

    // fade in from black at the very start, out to black after ACCEPT
    let black = 0;
    if (this.phase === 'feed') black = Math.max(0, 1 - this.t / 0.9);
    if (this.phase === 'out') black = Math.min(1, Math.max(0, (this.t - 0.4) / 0.6));
    if (black > 0) {
      ctx.globalAlpha = black;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalAlpha = 1;
    }
  }

  drawFeedHud(ctx, vw, vh, a) {
    ctx.globalAlpha = a;
    const c = '#e8ecf4';
    ctx.fillStyle = c;
    // viewfinder corners
    for (const [x, y, sx, sy] of [[4, 4, 1, 1], [vw - 5, 4, -1, 1], [4, vh - 5, 1, -1], [vw - 5, vh - 5, -1, -1]]) {
      ctx.fillRect(x, y, 7 * sx, 1); ctx.fillRect(x, y, 1, 7 * sy);
    }
    // (top-right is where the SKIP button sits, so everything hugs the left)
    pixelText(ctx, 'SAT-7 / REPLAY', 9, 9, c);
    if (Math.floor(this.clock * 2) % 2 === 0) { ctx.fillStyle = '#ff5e6c'; ctx.fillRect(9, 17, 3, 3); }
    pixelText(ctx, 'REC', 14, 16, c);
    const secs = 4 * 3600 + 12 * 60 + 30 - Math.floor(this.feed.t);
    const hh = Math.floor(secs / 3600), mm = Math.floor(secs / 60) % 60, ss = secs % 60;
    pixelText(ctx, `-${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`, 9, vh - 14, c);
    ctx.globalAlpha = 1;
  }
}
