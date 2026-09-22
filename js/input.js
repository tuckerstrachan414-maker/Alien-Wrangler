// Two control schemes, picked in Settings:
//
//   'buttons'  — floating joystick lower-left, action buttons lower-right.
//   'gestures' — no buttons. The screen is split down the middle:
//                LEFT  (legs)  : drag to walk, flick up to jump, double-tap
//                                for the Noise Maker. Low fences / bales /
//                                crates are vaulted automatically.
//                RIGHT (hands) : tap to grab, HOLD to sprint, swipe in ANY
//                                direction to dive that way (a dash if no
//                                alien is in reach), double-tap for the net.
//
//   Nothing the right thumb does ever interrupts walking, so sprinting and
//   diving never cost you your stride; the only left-hand tap gesture is the
//   Noise Maker, which you set off standing next to a hiding spot anyway.
//
// Both halves are percentage-sized, so the split follows the screen in
// portrait and landscape alike.
//
// Keyboard fallback (desktop): WASD/arrows + Shift sprint, Space jump,
// J grab, K dash, L dive, N net, B noise maker, Esc/P pause.
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
const HOLD_MS = 170;       // right thumb held this long (without a flick) = sprint

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
  sprintToggle: false,   // SPRINT button (buttons mode toggle)
  sprintHold: 0,         // right-half fingers currently held down (no-buttons mode)
  holdSpent: false,      // stamina ran dry mid-hold: lift and press again to sprint
  get sprint() { return this.sprintToggle || this.sprintHeld || (this.sprintHold > 0 && !this.holdSpent); },
  presses: {},           // edge-triggered action flags
  swipeDir: { x: 0, y: 1 },  // direction of the latest right-half swipe
};

let controlMode = 'buttons';
let netAvailable = false;
let noiseAvailable = false;

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
  input.holdSpent = false;
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
  const noise = document.getElementById('hint-noise');
  if (noise) noise.classList.toggle('hidden', !noiseAvailable);
}

export function refreshHints() { applyHintVisibility(); }

/* ---------------- shared gesture bookkeeping ---------------- */

const tracked = new Map();   // pointerId -> gesture state

function resetPointers() {
  for (const p of tracked.values()) endHold(p);
  tracked.clear();
  input.sprintHold = 0;
}

// Right-thumb hold = sprint. Each held finger owns one "hold" and a pixel ring
// that sits under it so you can see the sprint is live.
function startHold(p) {
  if (p.holding) return;
  p.holding = true;
  input.sprintHold++;
  input.holdSpent = false;
  const controls = document.getElementById('controls');
  if (controls) {
    p.ring = document.createElement('div');
    p.ring.className = 'hold-fx';
    controls.appendChild(p.ring);
    moveHold(p);
  }
  updateSprintVisual();
}

function moveHold(p) {
  if (!p.ring) return;
  const last = p.samples[p.samples.length - 1];
  p.ring.style.left = `${last.x}px`;
  p.ring.style.top = `${last.y}px`;
}

function endHold(p) {
  clearTimeout(p.holdTimer);
  if (p.ring) { p.ring.remove(); p.ring = null; }
  if (!p.holding) return;
  p.holding = false;
  input.sprintHold = Math.max(0, input.sprintHold - 1);
  updateSprintVisual();
}

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
  // After the thumb has rested, the only anchor left is a stale sample from
  // before the rest, which made a flick look slow and silently dropped it.
  // Re-stamp the resting position as "one frame ago" so the flick is measured
  // from the moment the thumb actually started moving.
  const prev = p.samples[p.samples.length - 1];
  if (prev && now - prev.t > 50) p.samples = [{ x: prev.x, y: prev.y, t: now - 16 }];
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

// Any-direction flick: returns a unit vector for the rolling window ending at
// the latest sample, or null. Used by the right thumb (swipe = dive that way).
function flickAny(p, now) {
  if (now < p.lockUntil) return null;
  const last = p.samples[p.samples.length - 1];
  const anchor = p.samples[0];
  const dt = (last.t - anchor.t) / 1000;
  if (dt < 0.016) return null;
  const dx = last.x - anchor.x;
  const dy = last.y - anchor.y;
  const d = Math.hypot(dx, dy);
  if (d < flickDist) return null;
  if (d / dt < FLICK_SPEED) return null;
  return { x: dx / d, y: dy / d };
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
      input.presses.jump = true;
      armAfterFlick(p, now);
      tapFx(e.clientX, e.clientY, 'swipe');
      // The stick keeps following the thumb — the hop just fires alongside it,
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
        if (now - lastLeftTap < DTAP_MS && near && noiseAvailable) {
          input.presses.noise = true;
          tapFx(e.clientX, e.clientY, 'bang');
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
    const p = track(e);
    // Still down after HOLD_MS and not a flick-in-progress -> sprint until lifted.
    p.holdTimer = setTimeout(() => {
      if (tracked.get(e.pointerId) === p) startHold(p);
    }, HOLD_MS);
    capture(actZone, e);
    e.preventDefault();
  });

  actZone.addEventListener('pointermove', (e) => {
    const p = tracked.get(e.pointerId);
    if (!p || controlMode !== 'gestures') return;
    const now = sample(p, e);
    moveHold(p);
    const dir = flickAny(p, now);
    if (!dir) return;
    input.swipeDir = dir;
    input.presses.swipe = true;
    armAfterFlick(p, now);
    tapFx(e.clientX, e.clientY, 'swipe');
  });

  const actEnd = (e) => {
    const p = tracked.get(e.pointerId);
    if (!p) return;
    tracked.delete(e.pointerId);
    endHold(p);
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
  bind('btn-noise', 'noise');

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
    KeyB: 'noise', KeyE: 'noise',
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
// Only touches the DOM when a state actually flips (this runs every frame).
const coolState = new Map();

export function setButtonCooling(id, cooling) {
  if (coolState.get(id) === cooling) return;
  coolState.set(id, cooling);
  const el = document.getElementById(id);
  if (el) el.classList.toggle('cooling', cooling);
}

export function showNetButton(show) {
  netAvailable = !!show;
  const el = document.getElementById('btn-net');
  if (el) el.classList.toggle('hidden', !show);
  applyHintVisibility();
}

export function showNoiseButton(show) {
  noiseAvailable = !!show;
  const el = document.getElementById('btn-noise');
  if (el) el.classList.toggle('hidden', !show);
  applyHintVisibility();
}
