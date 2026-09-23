// Two control schemes, picked in Settings:
//
//   'buttons'  — floating joystick lower-left, action buttons lower-right.
//   'gestures' — no buttons. The screen is split down the middle:
//                LEFT  (legs)  : drag to walk; push the thumb out past the
//                                sprint ring (a little beyond full speed) to
//                                sprint. Aliens you touch are grabbed
//                                automatically.
//                RIGHT (hands) : DOUBLE TAP = gadget slot 1, SWIPE RIGHT =
//                                gadget slot 2, SWIPE UP = jump, SWIPE DOWN =
//                                dive, SWIPE LEFT = dash. Dive and dash both
//                                go the way you are running, not the way you
//                                swiped.
//
//   Nothing the right thumb does ever interrupts walking, and the left thumb
//   has no taps or flicks at all, so steering can never misfire an action.
//
// Both halves are percentage-sized, so the split follows the screen in
// portrait and landscape alike.
//
// Keyboard fallback (desktop): WASD/arrows + Shift sprint, Space jump,
// J grab, K dash, L dive, Q/N gadget 1, E/B gadget 2, Esc/P pause.
import { initAudio, resumeAudio } from './audio.js';
import { save } from './save.js';

const JOY_RADIUS = 40;

/* ---- gesture tuning ----
   A swipe is a move of at least flickDist inside a short rolling window. The
   right thumb has no drag meaning of its own any more, so the speed floor is
   low: it only has to reject a resting thumb slowly drifting, never a lazy
   swipe. A "tap" is short in both time and travel. */
const TAP_MS = 250;        // max duration of a tap
const TAP_SLOP = 18;       // max travel (px) during a tap
const FLICK_WINDOW = 250;  // ms of pointer history a swipe is measured over
const FLICK_SPEED = 200;   // px/s minimum
const EDGE_HYST = 10;      // px the thumb must fall back inside the ring to stop sprinting
const DOUBLE_TAP_MS = 320; // max gap between the two taps of a double-tap
const DOUBLE_TAP_SLOP = 40; // max travel (px) between the two taps

// Flick distance and the sprint ring scale a little with the screen's short
// side so they feel the same on a phone in landscape as in portrait. The ring
// sits well outside full walking speed (JOY_RADIUS), so you only sprint when
// you mean to.
let flickDist = 40;
let sprintR = 76;
function measure() {
  const shortSide = Math.min(window.innerWidth, window.innerHeight);
  flickDist = Math.max(30, Math.min(62, Math.round(shortSide * 0.085)));
  sprintR = Math.max(66, Math.min(96, Math.round(shortSide * 0.195)));
  document.documentElement.style.setProperty('--sprint-r', `${sprintR}px`);
}
measure();
window.addEventListener('resize', measure);
window.addEventListener('orientationchange', () => setTimeout(measure, 250));

export const input = {
  move: { x: 0, y: 0 },
  mag: 0,
  sprintHeld: false,     // keyboard Shift (hold-to-sprint)
  sprintToggle: false,   // SPRINT button (buttons mode toggle)
  sprintEdge: false,     // no-buttons: thumb pushed out past the sprint ring
  edgeSpent: false,      // stamina ran dry at the ring: ease back inside it to re-arm
  get sprint() { return this.sprintToggle || this.sprintHeld || (this.sprintEdge && !this.edgeSpent); },
  presses: {},           // edge-triggered action flags
};

let controlMode = 'buttons';
let gadgetSlots = [];    // equipped gadget GEAR entries, [tap slot, swipe-right slot]

export function consumePress(name) {
  if (input.presses[name]) { input.presses[name] = false; return true; }
  return false;
}

export function updateSprintVisual() {
  const btn = document.getElementById('btn-sprint');
  if (btn) btn.classList.toggle('active', input.sprintToggle);
  const base = document.getElementById('joy-base');
  if (base) {
    base.classList.toggle('sprinting', input.sprint);
    base.classList.toggle('spent', input.sprintEdge && input.edgeSpent);
  }
  const pill = document.getElementById('hud-sprint');
  if (pill) pill.classList.toggle('hidden', !(controlMode === 'gestures' && input.sprint));
}

export function clearInput() {
  input.move.x = 0; input.move.y = 0; input.mag = 0;
  input.sprintHeld = false; input.sprintToggle = false;
  input.sprintEdge = false; input.edgeSpent = false;
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
  input.sprintEdge = false; input.edgeSpent = false;
  updateSprintVisual();
}

export function getControlMode() { return controlMode; }

function applyHintVisibility() {
  const hints = document.getElementById('gesture-hints');
  if (hints) hints.classList.toggle('on', controlMode === 'gestures' && save.gestureHints !== false);
  // TAP falls back to a plain grab when slot 1 is empty; SWIPE RIGHT does
  // nothing without a second gadget, so its hint goes dark.
  const g1 = document.getElementById('hint-g1');
  if (g1) g1.innerHTML = `2xTAP<b>${gadgetSlots[0] ? gadgetSlots[0].short : 'GRAB'}</b>`;
  const g2 = document.getElementById('hint-g2');
  if (g2) {
    g2.innerHTML = `<i class="arr rt"></i><b>${gadgetSlots[1] ? gadgetSlots[1].short : '-'}</b>`;
    g2.classList.toggle('empty', !gadgetSlots[1]);
  }
}

export function refreshHints() { applyHintVisibility(); }

/* ---------------- shared gesture bookkeeping ---------------- */

const tracked = new Map();   // pointerId -> gesture state
let lastTapT = -1e9, lastTapX = 0, lastTapY = 0;   // pending first tap of a double-tap

function resetPointers() {
  tracked.clear();
  lastTapT = -1e9;
}

function track(e) {
  const now = e.timeStamp || performance.now();
  const p = {
    x0: e.clientX, y0: e.clientY, t0: now,
    maxDist: 0, fired: false,
    samples: [{ x: e.clientX, y: e.clientY, t: now }],
  };
  tracked.set(e.pointerId, p);
  return p;
}

// A gap this long between moves means the thumb was resting, not just that
// the page dropped frames (Chrome delivers pointermoves once per frame, so a
// phone struggling at 20fps sends them ~50ms apart mid-swipe).
const REST_MS = 100;

function sample(p, e) {
  // Browsers batch the moves of a slow frame into one event; the coalesced
  // list has every real sample, which keeps flick speed honest on busy frames.
  const evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
  for (const ce of evs.length ? evs : [e]) addSample(p, ce.clientX, ce.clientY, ce.timeStamp || performance.now());
  const last = p.samples[p.samples.length - 1];
  p.maxDist = Math.max(p.maxDist, Math.hypot(last.x - p.x0, last.y - p.y0));
}

function addSample(p, x, y, now) {
  // After the thumb has rested, the only anchor left is a stale sample from
  // before the rest, which made a flick look slow and silently dropped it.
  // Re-stamp the resting position as "one frame ago" so the flick is measured
  // from the moment the thumb actually started moving.
  const prev = p.samples[p.samples.length - 1];
  if (prev && now - prev.t > REST_MS) p.samples = [{ x: prev.x, y: prev.y, t: now - 16 }];
  p.samples.push({ x, y, t: now });
  // keep one sample older than the window so short flicks still have an anchor
  let cut = 0;
  for (let i = 0; i < p.samples.length - 1; i++) {
    if (now - p.samples[i].t > FLICK_WINDOW) cut = i; else break;
  }
  if (cut > 0) p.samples.splice(0, cut);
}

// Any-direction flick: returns a unit vector for the rolling window ending at
// the latest sample, or null.
function flickAny(p) {
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

// Right-thumb swipe -> action, split into four 90-degree wedges.
function swipeAction(dir) {
  if (Math.abs(dir.y) >= Math.abs(dir.x)) return dir.y < 0 ? 'jump' : 'dive';
  return dir.x < 0 ? 'dash' : 'gadget2';
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
    capture(joyZone, e);
    e.preventDefault();
  });

  joyZone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joyId) return;
    const rx = e.clientX - origin.x;
    const ry = e.clientY - origin.y;
    const len = Math.hypot(rx, ry);
    // Walking speed tops out at JOY_RADIUS. In no-buttons mode the knob keeps
    // travelling out to the sprint ring so you can see how close you are.
    const knobMax = controlMode === 'gestures' ? sprintR + 4 : JOY_RADIUS;
    const k = len > knobMax ? knobMax / len : 1;
    setKnob(rx * k, ry * k);
    input.mag = Math.min(1, len / JOY_RADIUS);
    if (len > 2) {
      const w = Math.min(len, JOY_RADIUS) / len / JOY_RADIUS;
      input.move.x = rx * w;
      input.move.y = ry * w;
    }

    if (controlMode !== 'gestures') return;
    // Past the ring = sprint, with a little hysteresis so the edge doesn't
    // flicker. Falling back inside it also re-arms a sprint that ran dry.
    const on = input.sprintEdge ? len > sprintR - EDGE_HYST : len >= sprintR;
    if (!on) input.edgeSpent = false;
    if (on !== input.sprintEdge) {
      input.sprintEdge = on;
      updateSprintVisual();
    }
  });

  const joyEnd = (e) => {
    if (e.pointerId !== joyId) return;
    joyId = null;
    joyBase.classList.add('hidden');
    input.move.x = 0; input.move.y = 0; input.mag = 0;
    if (input.sprintEdge || input.edgeSpent) {
      input.sprintEdge = false; input.edgeSpent = false;
      updateSprintVisual();
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

  // One swipe per touch: the thumb drifting back after a flick can't fire a
  // second, opposite action (a dive that bounces into a jump, say).
  actZone.addEventListener('pointermove', (e) => {
    const p = tracked.get(e.pointerId);
    if (!p || p.fired || controlMode !== 'gestures') return;
    sample(p, e);
    const dir = flickAny(p);
    if (!dir) return;
    const act = swipeAction(dir);
    p.fired = true;
    if (act === 'gadget2' && !gadgetSlots[1]) return;
    input.presses[act] = true;
    tapFx(e.clientX, e.clientY, act === 'gadget2' ? 'double' : 'swipe');
  });

  const actEnd = (e) => {
    const p = tracked.get(e.pointerId);
    if (!p) return;
    tracked.delete(e.pointerId);
    if (controlMode !== 'gestures' || e.type !== 'pointerup') return;
    const now = e.timeStamp || performance.now();
    if (!isTap(p, now)) return;
    // Two taps close together in time and place fire gadget1; a lone tap
    // just arms the window and shows feedback so the thumb has something to
    // react to while waiting for the second tap.
    const sinceLast = now - lastTapT;
    const dist = Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY);
    if (sinceLast <= DOUBLE_TAP_MS && dist <= DOUBLE_TAP_SLOP) {
      lastTapT = -1e9;
      input.presses.gadget1 = true;
      tapFx(e.clientX, e.clientY, 'tap');
    } else {
      lastTapT = now; lastTapX = e.clientX; lastTapY = e.clientY;
      tapFx(e.clientX, e.clientY, 'tap');
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
  bind('btn-g1', 'gadget1');
  bind('btn-g2', 'gadget2');

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
    KeyQ: 'gadget1', KeyN: 'gadget1',
    KeyE: 'gadget2', KeyB: 'gadget2', KeyV: 'gadget2',
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

// Equipped gadgets (GEAR entries, slot order). Buttons mode gets one button
// per slot, labelled and coloured for the gadget in it; the gesture legend
// relabels TAP / SWIPE RIGHT to match.
export function showGadgets(slots) {
  gadgetSlots = slots.slice(0, 2);
  ['btn-g1', 'btn-g2'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    const g = gadgetSlots[i];
    el.classList.toggle('hidden', !g);
    el.textContent = g ? g.short : '';
    if (g) el.dataset.gadget = g.id; else delete el.dataset.gadget;
  });
  applyHintVisibility();
}
