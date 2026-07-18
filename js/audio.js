// Tiny WebAudio synth for SFX. iOS unlocks audio on first touch.
import { save } from './save.js';

let ctx = null;

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { ctx = null; }
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function tone(freq, dur, type = 'square', vol = 0.12, slide = 0, delay = 0) {
  if (!ctx || save.muted) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur, vol = 0.1, delay = 0) {
  if (!ctx || save.muted) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  src.connect(g).connect(ctx.destination);
  src.start(t0);
}

export const sfx = {
  jump:    () => tone(320, 0.12, 'square', 0.08, 260),
  dash:    () => { noise(0.08, 0.08); tone(180, 0.1, 'sawtooth', 0.06, 120); },
  dive:    () => { tone(260, 0.18, 'sawtooth', 0.08, -140); noise(0.1, 0.05, 0.12); },
  thud:    () => { tone(90, 0.15, 'triangle', 0.14, -40); noise(0.1, 0.1); },
  grab:    () => { tone(500, 0.07, 'square', 0.1, 300); tone(820, 0.09, 'square', 0.08, 200, 0.06); },
  deposit: () => { tone(520, 0.08, 'square', 0.1); tone(660, 0.08, 'square', 0.1, 0, 0.08); tone(880, 0.12, 'square', 0.1, 0, 0.16); },
  cash:    () => { tone(980, 0.06, 'square', 0.08); tone(1320, 0.1, 'square', 0.08, 0, 0.06); },
  alert:   () => tone(700, 0.1, 'square', 0.07, -200),
  squeak:  () => tone(900, 0.1, 'square', 0.06, 420),
  stun:    () => { tone(140, 0.3, 'sawtooth', 0.12, -60); noise(0.15, 0.08); },
  bolt:    () => tone(620, 0.12, 'sawtooth', 0.07, -380),
  net:     () => { noise(0.06, 0.09); tone(440, 0.1, 'square', 0.06, -180); },
  beamLoop:() => tone(72, 0.5, 'sawtooth', 0.05, 24),
  escape:  () => { tone(600, 0.2, 'triangle', 0.1, 500); tone(1100, 0.3, 'triangle', 0.08, 700, 0.18); },
  fail:    () => { tone(220, 0.25, 'sawtooth', 0.1, -80); tone(160, 0.35, 'sawtooth', 0.1, -60, 0.2); },
  win:     () => { [440, 550, 660, 880].forEach((f, i) => tone(f, 0.14, 'square', 0.09, 0, i * 0.09)); },
  click:   () => tone(600, 0.04, 'square', 0.05),
  ufo:     () => { tone(60, 1.2, 'sawtooth', 0.07, 30); tone(48, 1.2, 'sawtooth', 0.05, 20, 0.05); },
};
