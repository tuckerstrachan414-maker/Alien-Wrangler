import { buildTiles, buildActors, buildVan, buildUfo } from './data/sprites.js';
import { getMission, gearEffects } from './data/missions.js';
import { loadSave, save, persist } from './save.js';
import { setupInput, consumePress, clearInput, showNetButton } from './input.js';
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

const ui = new UI(uiRoot, assets, {
  startMission(n) {
    const m = getMission(n);
    ui.clear();
    hud.classList.remove('hidden');
    controls.classList.remove('hidden');
    game.startMission(m);
    showNetButton(gearEffects(save.gear).netgun > 0);
    clearInput();
    state = 'play';
  },
  resume() {
    ui.clear();
    clearInput();
    state = 'play';
  },
  restart() {
    ui.clear();
    game.startMission(game.mission);
    clearInput();
    state = 'play';
  },
  quitToMenu() {
    state = 'menu';
    game.running = false;
    hud.classList.add('hidden');
    controls.classList.add('hidden');
    ui.showTitle();
  },
});

game.onEnd = (r) => {
  save.cash += r.pay;
  if (r.cleared && r.mission.id >= save.missionsCleared) {
    save.missionsCleared = r.mission.id + 1;
  }
  save.bestPay[r.mission.id] = Math.max(save.bestPay[r.mission.id] || 0, r.pay);
  persist();
  state = 'menu';
  hud.classList.add('hidden');
  controls.classList.add('hidden');
  setTimeout(() => ui.showResults(r), 650);
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
  timerText.textContent = game.beamPhase ? '0:00' : fmtTime(game.timer);
  hudTimer.classList.toggle('urgent', game.timer < 30 || game.beamPhase);
  scoreText.textContent = `${game.captured}/${game.totalAliens}`;
  const projected = Math.max(0, game.mission.pay - game.escaped * game.mission.escapeCost);
  cashText.textContent = `${projected}`;
  warnEl.classList.toggle('hidden', !(game.timer <= 30 && game.timer > 26.5 && game.phase === 'play'));
  const p = game.player;
  const pct = Math.round(p.stamina / p.fx.staminaMax * 100);
  stamBar.style.width = `${pct}%`;
  stamBar.classList.toggle('low', pct < 25);
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

  if ((state === 'play' || state === 'paused') && game.map) {
    game.render(bctx, viewW, viewH);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(buf, 0, 0, viewW, viewH, 0, 0, viewW * scale, viewH * scale);
  } else {
    ctx.fillStyle = '#0a0c14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

ui.showTitle();
requestAnimationFrame(frame);

// debug/testing hook
window.__aw = { game, ui, save, get state() { return state; } };
