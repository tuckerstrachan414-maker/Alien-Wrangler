import { buildTiles, buildActors, buildVan, buildUfo, T } from './data/sprites.js';
import { loadPngProps } from './data/pngProps.js';
import { getMission } from './data/missions.js';
import { loadSave, save, persist } from './save.js';
import {
  setupInput, consumePress, clearInput, showNetButton,
  setControlMode, refreshHints,
} from './input.js';
import { Game } from './game.js';
import { UI } from './ui.js';

loadSave();
setupInput();

const assets = {
  tiles: buildTiles(),
  actors: buildActors(),
  van: buildVan(),
  ufo: buildUfo(),
};

// Maple Street's buildings/cars/roads/props are PNGs from a user-supplied
// asset pack; every other map stays procedural. If they fail to load,
// buildNeighborhood() falls back to the original canvas art.
try {
  assets.pngProps = await loadPngProps();
  const t = assets.pngProps.tiles;
  assets.tiles[T.ROAD_PNG] = t.road;
  assets.tiles[T.CROSSWALK_H] = t.crosswalkH;
  assets.tiles[T.CROSSWALK_V] = t.crosswalkV;
  assets.tiles[T.LANE_H] = t.laneH;
  assets.tiles[T.LANE_V] = t.laneV;
  assets.tiles[T.MANHOLE] = t.manhole;
  assets.tiles[T.DRAIN] = t.drain;
} catch (err) {
  console.warn('Maple Street PNG props failed to load, using procedural fallback:', err);
}

// ---- HUD pixel icons (drawn in code, match the game art) ----
function iconCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  draw((px, py, pw, ph, col) => { x.fillStyle = col; x.fillRect(px, py, pw, ph); });
  c.className = 'pixel-canvas';
  return c;
}
function buildHudIcons() {
  const ufo = iconCanvas(14, 9, (p) => {
    p(5, 0, 4, 1, '#bfeaff'); p(4, 1, 6, 1, '#8fd4f5');
    p(2, 3, 10, 1, '#aab6c6'); p(0, 4, 14, 2, '#7d8a9c'); p(2, 6, 10, 1, '#5a6577');
    p(2, 4, 1, 1, '#41f0d8'); p(5, 4, 1, 1, '#ffd75e'); p(8, 4, 1, 1, '#41f0d8'); p(11, 4, 1, 1, '#ffd75e');
  });
  const coin = iconCanvas(10, 10, (p) => {
    p(3, 0, 4, 1, '#14141e'); p(2, 1, 6, 1, '#14141e');
    p(1, 2, 8, 6, '#14141e'); p(2, 8, 6, 1, '#14141e'); p(3, 9, 4, 1, '#14141e');
    p(3, 1, 4, 1, '#ffe790'); p(2, 2, 6, 6, '#ffd75e'); p(3, 8, 4, 1, '#e0b83c');
    p(3, 3, 1, 4, '#c99a2c'); p(5, 2, 1, 6, '#fff2c0');
  });
  const alien = assets.actors.aliens.grunt.down;
  document.getElementById('ico-ufo').appendChild(ufo);
  document.getElementById('ico-coin').appendChild(coin);
  document.getElementById('ico-alien').appendChild((() => {
    const c = document.createElement('canvas');
    c.width = alien.width; c.height = alien.height;
    c.getContext('2d').drawImage(alien, 0, 0);
    c.className = 'pixel-canvas';
    return c;
  })());
}
buildHudIcons();

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');
const controls = document.getElementById('controls');
const uiRoot = document.getElementById('ui-root');

const timerText = document.getElementById('timer-text');
const hudTimer = document.getElementById('hud-timer');
const scoreText = document.getElementById('score-text');
const cashText = document.getElementById('cash-text');
const warnEl = document.getElementById('hud-warning');
const stamBar = document.getElementById('stamina-bar');

let state = 'menu';    // menu | play | paused
let scale = 4;
let viewW = 200, viewH = 400;

// low-res buffer the world renders into, blitted up to the real canvas
const buf = document.createElement('canvas');
const bctx = buf.getContext('2d');

function resize() {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  // Zoom is based on the SHORT screen side so sprites are the same size in
  // portrait and landscape — landscape just reveals a wider strip of world.
  const shortSide = Math.min(canvas.width, canvas.height);
  scale = Math.max(3, Math.min(9, Math.round(shortSide / 165)));
  viewW = Math.ceil(canvas.width / scale);
  viewH = Math.ceil(canvas.height / scale);
  buf.width = viewW; buf.height = viewH;
  bctx.imageSmoothingEnabled = false;
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));
resize();

const game = new Game(assets);

function enterMission(mission) {
  ui.clear();
  hud.classList.remove('hidden');
  controls.classList.remove('hidden');
  game.startMission(mission);
  showNetButton(game.fx.netgun > 0);
  clearInput();
  state = 'play';
}

function leaveMission() {
  state = 'menu';
  hud.classList.add('hidden');
  controls.classList.add('hidden');
  clearInput();
}

const ui = new UI(uiRoot, assets, {
  startMission(n) { enterMission(getMission(n)); },
  startSandbox(mission) { enterMission(mission); },
  resume() {
    ui.clear();
    clearInput();
    state = 'play';
  },
  restart() {
    enterMission(game.mission);
  },
  abandonMission() {
    if (!game.mission) { leaveMission(); ui.showTitle(); return; }
    game.abandon();
  },
  quitToMenu() {
    game.running = false;
    leaveMission();
    ui.showTitle();
  },
  currentMission() { return game.mission; },
  applySettings() {
    setControlMode(save.controlMode);
    refreshHints();
  },
});

game.onEnd = (r) => {
  if (!r.mission.sandbox) {
    save.cash += r.pay;
    if (r.abandoned) save.cash = Math.max(0, save.cash - (r.fee || 0));
    if (r.cleared && !r.abandoned && r.mission.id >= save.missionsCleared) {
      save.missionsCleared = r.mission.id + 1;
    }
    if (!r.abandoned) {
      save.bestPay[r.mission.id] = Math.max(save.bestPay[r.mission.id] || 0, r.pay);
    }
    persist();
  }
  leaveMission();
  // an abandon is a deliberate exit — no need to sit on the frozen field
  setTimeout(() => ui.showResults(r), r.abandoned ? 0 : 650);
};

document.getElementById('btn-pause').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (state === 'play') pause();
});

function pause() {
  if (state !== 'play') return;
  state = 'paused';
  ui.showPause();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'play') pause();
});

function fmtTime(t) {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function updateHud() {
  const endless = !!game.mission.endless;
  timerText.textContent = endless ? 'FREE' : game.beamPhase ? '0:00' : fmtTime(game.timer);
  hudTimer.classList.toggle('urgent', !endless && (game.timer < 30 || game.beamPhase));
  scoreText.textContent = `${game.captured}/${game.totalAliens}`;
  cashText.textContent = `${game.projectedPay()}`;
  warnEl.classList.toggle('hidden', !(!endless && game.timer <= 30 && game.timer > 26.5 && game.phase === 'play'));
  const p = game.player;
  const pct = Math.round(p.stamina / p.fx.staminaMax * 100);
  stamBar.style.width = `${pct}%`;
  stamBar.classList.toggle('low', pct < 25);
}

/* ---------------- animated menu backdrop ----------------
   Drawn into the same low-res buffer the world uses, so the night sky behind
   the menus is the same chunky pixel art as the game. */
const STARS = Array.from({ length: 110 }, () => ({
  x: Math.random(), y: Math.random(),
  phase: Math.random() * Math.PI * 2,
  size: Math.random() < 0.18 ? 2 : 1,
}));
let menuT = 0;

function ridge(y, amp, wave, color) {
  bctx.fillStyle = color;
  bctx.beginPath();
  bctx.moveTo(0, viewH);
  for (let x = 0; x <= viewW; x += 3) {
    bctx.lineTo(x, y + Math.sin(x * wave) * amp + Math.sin(x * wave * 0.37 + 1.7) * amp * 0.7);
  }
  bctx.lineTo(viewW, viewH);
  bctx.closePath();
  bctx.fill();
}

function drawMenuBackdrop(dt) {
  menuT += dt;
  const w = viewW, h = viewH;

  const sky = bctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#0e1433');
  sky.addColorStop(0.5, '#0b0f20');
  sky.addColorStop(1, '#070911');
  bctx.fillStyle = sky;
  bctx.fillRect(0, 0, w, h);

  for (const s of STARS) {
    bctx.globalAlpha = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(menuT * 1.7 + s.phase));
    bctx.fillStyle = s.size > 1 ? '#e6efff' : '#9db2da';
    bctx.fillRect((s.x * w) | 0, (s.y * h * 0.72) | 0, s.size, s.size);
  }
  bctx.globalAlpha = 1;

  // moon, low and to one side
  const mx = (w * 0.76) | 0, my = (h * 0.13) | 0;
  bctx.globalAlpha = 0.16;
  bctx.fillStyle = '#9fd8ff';
  bctx.beginPath(); bctx.arc(mx, my, 16, 0, Math.PI * 2); bctx.fill();
  bctx.globalAlpha = 1;
  bctx.fillStyle = '#dfe9f5';
  bctx.beginPath(); bctx.arc(mx, my, 9, 0, Math.PI * 2); bctx.fill();
  bctx.fillStyle = '#c3cfe0';
  bctx.fillRect(mx - 4, my - 3, 3, 3);
  bctx.fillRect(mx + 2, my + 1, 2, 2);
  bctx.fillRect(mx - 1, my + 4, 2, 2);

  // a UFO trawling slowly across, dragging a faint beam
  const span = w + 90;
  const ux = ((menuT * 11) % span) - 45;
  const uy = h * 0.3 + Math.sin(menuT * 0.9) * 3;
  const gy = h * 0.78;
  const grad = bctx.createLinearGradient(0, uy, 0, gy);
  grad.addColorStop(0, 'rgba(120, 240, 255, 0.16)');
  grad.addColorStop(1, 'rgba(120, 240, 255, 0)');
  bctx.fillStyle = grad;
  bctx.beginPath();
  bctx.moveTo(ux - 5, uy + 6);
  bctx.lineTo(ux + 5, uy + 6);
  bctx.lineTo(ux + 16, gy);
  bctx.lineTo(ux - 16, gy);
  bctx.closePath();
  bctx.fill();
  bctx.drawImage(assets.ufo, Math.round(ux - 24), Math.round(uy - 11));

  ridge(h * 0.8, 7, 0.02, '#111d2c');
  ridge(h * 0.9, 5, 0.035, '#080c13');
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (state === 'play') {
    if (consumePress('pause')) { pause(); return; }
    game.update(dt);
    if (game.running) updateHud();
  }

  const blit = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(buf, 0, 0, viewW, viewH, 0, 0, viewW * scale, viewH * scale);
  };

  if ((state === 'play' || state === 'paused') && game.map) {
    game.render(bctx, viewW, viewH);
    blit();
  } else {
    drawMenuBackdrop(dt);
    blit();
  }
}

setControlMode(save.controlMode);
refreshHints();
ui.showTitle();
requestAnimationFrame(frame);

// debug/testing hook
window.__aw = { game, ui, save, get state() { return state; } };
