// Two control schemes, picked in Settings:
//
//   'buttons'  — floating joystick lower-left, action buttons lower-right.
//   'gestures' — no buttons. The screen is split down the middle:
//                LEFT  : drag to walk, flick up to dash, double-tap to sprint.
//                RIGHT : tap to grab, double-tap for the weapon (net gun),
//                        flick up to dive, flick down to jump.
//
// Both halves are percentage-sized, so the split follows the screen in
// portrait and landscape alike.
//
// Keyboard fallback (desktop): WASD/arrows + Shift sprint, Space jump,
// J grab, K dash, L dive, N net, Esc/P pause.
import { initAudio, resumeAudio } from './audio.js';
import { save } from './save.js';

const JOY_RADIUS = 40;

/* ---- gesture tuning ----
   A "flick" is a fast, mostly-vertical move sampled over a short rolling
   window, so slowly dragging the thumb upward to walk north never trips the
   dash. A "tap" is short in both time and travel. */
const TAP_MS = 250;        // max duration of a tap
const TAP_SLOP = 18;       // max travel (px) during a tap
const DTAP_MS = 320;       // max gap between the two taps of a double-tap
const DTAP_SLOP = 70;      // max distance between the two taps
const FLICK_WINDOW = 200;  // ms of pointer history a flick is measured over
const FLICK_SPEED = 420;   // px/s minimum
const FLICK_AXIS = 1.4;    // |dy| must beat |dx| by this much
const FLICK_RELOCK = 300;  // ms before the same finger may flick again

// Flick distance scales a little with the screen's short side so it feels the
// same on a phone in landscape as it does in portrait.
let flickDist = 40;
function measure() {
  const shortSide = Math.min(window.innerWidth, window.innerHeight);
  flickDist = Math.max(30, Math.min(62, Math.round(shortSide * 0.085)));
}
measure();
window.addEventListener('resize', measure);
window.addEventListener('orientationchange', () => setTimeout(measure, 250));

export const input = {
  move: { x: 0, y: 0 },
  mag: 0,
  sprintHeld: false,     // keyboard Shift (hold-to-sprint)
  sprintToggle: false,   // SPRINT button / left-hand double-tap (toggle)
  get sprint() { return this.sprintToggle || this.sprintHeld; },
  presses: {},           // edge-triggered action flags
};

let controlMode = 'buttons';
let netAvailable = false;

export function consumePress(name) {
  if (input.presses[name]) { input.presses[name] = false; return true; }
  return false;
}

export function updateSprintVisual() {
  const btn = document.getElementById('btn-sprint');
  if (btn) btn.classList.toggle('active', input.sprintToggle);
  const base = document.getElementById('joy-base');
  if (base) base.classList.toggle('sprinting', input.sprint);
  const pill = document.getElementById('hud-sprint');
  if (pill) pill.classList.toggle('hidden', !(controlMode === 'gestures' && input.sprint));
}

export function clearInput() {
  input.move.x = 0; input.move.y = 0; input.mag = 0;
  input.sprintHeld = false; input.sprintToggle = false;
  input.presses = {};
  resetPointers();
  updateSprintVisual();
}

/* ---------------- control mode ---------------- */

export function setControlMode(mode) {
  controlMode = mode === 'gestures' ? 'gestures' : 'buttons';
  const controls = document.getElementById('controls');
  if (controls) controls.classList.toggle('mode-gestures', controlMode === 'gestures');
  applyHintVisibility();
  resetPointers();
  const base = document.getElementById('joy-base');
  if (base) base.classList.add('hidden');
  input.move.x = 0; input.move.y = 0; input.mag = 0;
  updateSprintVisual();
}

export function getControlMode() { return controlMode; }

function applyHintVisibility() {
  const hints = document.getElementById('gesture-hints');
  if (hints) hints.classList.toggle('on', controlMode === 'gestures' && save.gestureHints !== false);
  const net = document.getElementById('hint-net');
  if (net) net.classList.toggle('hidden', !netAvailable);
}

export function refreshHints() { applyHintVisibility(); }

/* ---------------- shared gesture bookkeeping ---------------- */

const tracked = new Map();   // pointerId -> gesture state

function resetPointers() { tracked.clear(); }

function track(e) {
  const now = performance.now();
  const p = {
    x0: e.clientX, y0: e.clientY, t0: now,
    maxDist: 0, fired: false, lockUntil: 0,
    samples: [{ x: e.clientX, y: e.clientY, t: now }],
  };
  tracked.set(e.pointerId, p);
  return p;
}

function sample(p, e) {
  const now = performance.now();
  p.samples.push({ x: e.clientX, y: e.clientY, t: now });
  // keep one sample older than the window so short flicks still have an anchor
  let cut = 0;
  for (let i = 0; i < p.samples.length - 1; i++) {
    if (now - p.samples[i].t > FLICK_WINDOW) cut = i; else break;
  }
  if (cut > 0) p.samples.splice(0, cut);
  p.maxDist = Math.max(p.maxDist, Math.hypot(e.clientX - p.x0, e.clientY - p.y0));
  return now;
}

// Returns 'up' | 'down' | null for the rolling window ending at the latest sample.
function flick(p, now) {
  if (now < p.lockUntil) return null;
  const last = p.samples[p.samples.length - 1];
  const anchor = p.samples[0];
  const dt = (last.t - anchor.t) / 1000;
  if (dt < 0.016) return null;
  const dx = last.x - anchor.x;
  const dy = last.y - anchor.y;
  if (Math.abs(dy) < flickDist) return null;
  if (Math.abs(dy) < Math.abs(dx) * FLICK_AXIS) return null;
  if (Math.abs(dy) / dt < FLICK_SPEED) return null;
  return dy < 0 ? 'up' : 'down';
}

function armAfterFlick(p, now) {
  p.fired = true;
  p.lockUntil = now + FLICK_RELOCK;
  p.samples = [p.samples[p.samples.length - 1]];
}

function isTap(p, now) {
  return !p.fired && (now - p.t0) <= TAP_MS && p.maxDist <= TAP_SLOP;
}

// Capturing a pointer that the browser has already let go of throws; losing
// the capture is survivable (the zone still sees its own moves), an exception
// mid-handler is not.
function capture(el, e) {
  try { el.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
}

/* ---------------- touch feedback ---------------- */

function tapFx(x, y, kind) {
  const controls = document.getElementById('controls');
  if (!controls || controlMode !== 'gestures') return;
  const d = document.createElement('div');
  d.className = `tap-fx ${kind}`;
  d.style.left = `${x}px`;
  d.style.top = `${y}px`;
  controls.appendChild(d);
  d.addEventListener('animationend', () => d.remove());
  setTimeout(() => d.remove(), 600);
}

/* ---------------- setup ---------------- */

export function setupInput() {
  const joyZone = document.getElementById('joy-zone');
  const joyBase = document.getElementById('joy-base');
  const joyKnob = document.getElementById('joy-knob');
  const actZone = document.getElementById('act-zone');

  let joyId = null;
  let origin = { x: 0, y: 0 };
  let lastLeftTap = 0, lastLeftTapPos = { x: 0, y: 0 };
  let lastRightTap = 0, lastRightTapPos = { x: 0, y: 0 };

  const setKnob = (dx, dy) => {
    joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  };

  /* ---- left half: movement (both modes) ---- */

  joyZone.addEventListener('pointerdown', (e) => {
    initAudio(); resumeAudio();
    if (joyId !== null) return;
    joyId = e.pointerId;
    origin = { x: e.clientX, y: e.clientY };
    joyBase.style.left = `${e.clientX}px`;
    joyBase.style.top = `${e.clientY}px`;
    joyBase.classList.remove('hidden');
    setKnob(0, 0);
    track(e);
    capture(joyZone, e);
    e.preventDefault();
  });

  joyZone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joyId) return;
    let dx = e.clientX - origin.x;
    let dy = e.clientY - origin.y;
    const len = Math.hypot(dx, dy);
    if (len > JOY_RADIUS) { dx = dx / len * JOY_RADIUS; dy = dy / len * JOY_RADIUS; }
    setKnob(dx, dy);
    input.mag = Math.min(1, len / JOY_RADIUS);
    if (len > 2) {
      input.move.x = dx / JOY_RADIUS;
      input.move.y = dy / JOY_RADIUS;
    }

    if (controlMode !== 'gestures') return;
    const p = tracked.get(e.pointerId);
    if (!p) return;
    const now = sample(p, e);
    if (flick(p, now) === 'up') {
      input.presses.dash = true;
      armAfterFlick(p, now);
      tapFx(e.clientX, e.clientY, 'swipe');
      // The stick keeps following the thumb — the dash just fires alongside it,
      // so a flick never interrupts the walk.
    }
  });

  const joyEnd = (e) => {
    if (e.pointerId !== joyId) return;
    const p = tracked.get(e.pointerId);
    joyId = null;
    joyBase.classList.add('hidden');
    input.move.x = 0; input.move.y = 0; input.mag = 0;
    if (p) {
      const now = performance.now();
      if (controlMode === 'gestures' && e.type === 'pointerup' && isTap(p, now)) {
        const near = Math.hypot(e.clientX - lastLeftTapPos.x, e.clientY - lastLeftTapPos.y) < DTAP_SLOP;
        if (now - lastLeftTap < DTAP_MS && near) {
          input.sprintToggle = !input.sprintToggle;
          updateSprintVisual();
          tapFx(e.clientX, e.clientY, 'toggle');
          lastLeftTap = 0;
        } else {
          lastLeftTap = now;
          lastLeftTapPos = { x: e.clientX, y: e.clientY };
        }
      }
      tracked.delete(e.pointerId);
    }
  };
  joyZone.addEventListener('pointerup', joyEnd);
  joyZone.addEventListener('pointercancel', joyEnd);

  /* ---- right half: actions (gesture mode only) ---- */

  actZone.addEventListener('pointerdown', (e) => {
    initAudio(); resumeAudio();
    if (controlMode !== 'gestures') return;
    track(e);
    capture(actZone, e);
    e.preventDefault();
  });

  actZone.addEventListener('pointermove', (e) => {
    const p = tracked.get(e.pointerId);
    if (!p || controlMode !== 'gestures') return;
    const now = sample(p, e);
    const dir = flick(p, now);
    if (!dir) return;
    input.presses[dir === 'up' ? 'dive' : 'jump'] = true;
    armAfterFlick(p, now);
    tapFx(e.clientX, e.clientY, 'swipe');
  });

  const actEnd = (e) => {
    const p = tracked.get(e.pointerId);
    if (!p) return;
    tracked.delete(e.pointerId);
    if (controlMode !== 'gestures' || e.type !== 'pointerup') return;
    const now = performance.now();
    if (!isTap(p, now)) return;
    const near = Math.hypot(e.clientX - lastRightTapPos.x, e.clientY - lastRightTapPos.y) < DTAP_SLOP;
    if (now - lastRightTap < DTAP_MS && near && netAvailable) {
      // second tap = weapon. GRAB already fired on the first tap, which keeps
      // single taps instant; a wasted grab at net range costs nothing.
      input.presses.net = true;
      tapFx(e.clientX, e.clientY, 'double');
      lastRightTap = 0;
    } else {
      input.presses.grab = true;
      tapFx(e.clientX, e.clientY, 'tap');
      lastRightTap = now;
      lastRightTapPos = { x: e.clientX, y: e.clientY };
    }
  };
  actZone.addEventListener('pointerup', actEnd);
  actZone.addEventListener('pointercancel', actEnd);

  /* ---- action buttons (buttons mode) ---- */

  const bind = (id, action) => {
    const el = document.getElementById(id);
    el.addEventListener('pointerdown', (e) => {
      initAudio(); resumeAudio();
      input.presses[action] = true;
      el.classList.add('pressed');
      e.preventDefault();
      e.stopPropagation();
    });
    const up = () => el.classList.remove('pressed');
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  };
  bind('btn-grab', 'grab');
  bind('btn-dive', 'dive');
  bind('btn-dash', 'dash');
  bind('btn-jump', 'jump');
  bind('btn-net', 'net');

  // SPRINT is a toggle, not a momentary action
  const sprintBtn = document.getElementById('btn-sprint');
  sprintBtn.addEventListener('pointerdown', (e) => {
    initAudio(); resumeAudio();
    input.sprintToggle = !input.sprintToggle;
    updateSprintVisual();
    e.preventDefault();
    e.stopPropagation();
  });

  // Keyboard fallback
  const keys = {};
  const keyActions = {
    KeyJ: 'grab', KeyZ: 'grab', Enter: 'grab',
    KeyK: 'dash', KeyX: 'dash',
    KeyL: 'dive', KeyC: 'dive',
    Space: 'jump',
    KeyN: 'net', KeyV: 'net',
    Escape: 'pause', KeyP: 'pause',
  };
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys[e.code] = true;
    const act = keyActions[e.code];
    if (act) { input.presses[act] = true; e.preventDefault(); }
    updateKeyMove();
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    updateKeyMove();
  });

  function updateKeyMove() {
    let x = 0, y = 0;
    if (keys.KeyA || keys.ArrowLeft) x -= 1;
    if (keys.KeyD || keys.ArrowRight) x += 1;
    if (keys.KeyW || keys.ArrowUp) y -= 1;
    if (keys.KeyS || keys.ArrowDown) y += 1;
    input.sprintHeld = !!(keys.ShiftLeft || keys.ShiftRight);
    if (x || y) {
      const len = Math.hypot(x, y);
      input.move.x = x / len; input.move.y = y / len;
      input.mag = 1;
    } else if (joyId === null) {
      input.move.x = 0; input.move.y = 0; input.mag = 0;
    }
    updateSprintVisual();
  }

  // Unlock audio on the very first touch anywhere (incl. menus)
  document.addEventListener('pointerdown', () => { initAudio(); resumeAudio(); });

  // Kill iOS double-tap zoom / long-press
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}

// Cooldown display — mirrored onto the gesture legend so both schemes show it.
const COOL_HINT = { 'btn-dash': 'hint-dash', 'btn-dive': 'hint-dive', 'btn-net': 'hint-net' };

export function setButtonCooling(id, cooling) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('cooling', cooling);
  const hint = document.getElementById(COOL_HINT[id]);
  if (hint) hint.classList.toggle('cooling', cooling);
}

export function showNetButton(show) {
  netAvailable = !!show;
  const el = document.getElementById('btn-net');
  if (el) el.classList.toggle('hidden', !show);
  applyHintVisibility();
}
