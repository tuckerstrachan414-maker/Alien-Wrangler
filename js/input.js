// Touch: floating joystick in the lower-left zone, action buttons lower-right.
// Keyboard fallback (desktop): WASD/arrows + Shift sprint, Space jump,
// J grab, K dash, L dive, N net.
import { initAudio, resumeAudio } from './audio.js';

const JOY_RADIUS = 40;
const SPRINT_MAG = 0.92;

export const input = {
  move: { x: 0, y: 0 },
  mag: 0,
  sprint: false,
  presses: {},           // edge-triggered action flags
};

export function consumePress(name) {
  if (input.presses[name]) { input.presses[name] = false; return true; }
  return false;
}

export function clearInput() {
  input.move.x = 0; input.move.y = 0; input.mag = 0; input.sprint = false;
  input.presses = {};
}

export function setupInput() {
  const joyZone = document.getElementById('joy-zone');
  const joyBase = document.getElementById('joy-base');
  const joyKnob = document.getElementById('joy-knob');

  let joyId = null;
  let origin = { x: 0, y: 0 };

  const setKnob = (dx, dy) => {
    joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  };

  const joyMove = (e) => {
    if (e.pointerId !== joyId) return;
    let dx = e.clientX - origin.x;
    let dy = e.clientY - origin.y;
    const len = Math.hypot(dx, dy);
    if (len > JOY_RADIUS) { dx = dx / len * JOY_RADIUS; dy = dy / len * JOY_RADIUS; }
    setKnob(dx, dy);
    const mag = Math.min(1, len / JOY_RADIUS);
    input.mag = mag;
    if (len > 2) {
      input.move.x = dx / JOY_RADIUS;
      input.move.y = dy / JOY_RADIUS;
    }
    input.sprint = mag >= SPRINT_MAG;
    joyBase.classList.toggle('sprinting', input.sprint);
  };

  const joyEnd = (e) => {
    if (e.pointerId !== joyId) return;
    joyId = null;
    joyBase.classList.add('hidden');
    input.move.x = 0; input.move.y = 0; input.mag = 0; input.sprint = false;
  };

  joyZone.addEventListener('pointerdown', (e) => {
    initAudio(); resumeAudio();
    if (joyId !== null) return;
    joyId = e.pointerId;
    origin = { x: e.clientX, y: e.clientY };
    joyBase.style.left = `${e.clientX}px`;
    joyBase.style.top = `${e.clientY}px`;
    joyBase.classList.remove('hidden');
    setKnob(0, 0);
    joyZone.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  joyZone.addEventListener('pointermove', joyMove);
  joyZone.addEventListener('pointerup', joyEnd);
  joyZone.addEventListener('pointercancel', joyEnd);

  // Action buttons
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
    if (x || y) {
      const len = Math.hypot(x, y);
      input.move.x = x / len; input.move.y = y / len;
      input.mag = 1;
      input.sprint = !!(keys.ShiftLeft || keys.ShiftRight);
    } else if (joyId === null) {
      input.move.x = 0; input.move.y = 0; input.mag = 0; input.sprint = false;
    }
  }

  // Unlock audio on the very first touch anywhere (incl. menus)
  document.addEventListener('pointerdown', () => { initAudio(); resumeAudio(); });

  // Kill iOS double-tap zoom / long-press
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}

// HUD button cooldown display
export function setButtonCooling(id, cooling) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('cooling', cooling);
}

export function showNetButton(show) {
  const el = document.getElementById('btn-net');
  if (el) el.classList.toggle('hidden', !show);
}
