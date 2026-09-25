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

// Master SFX level from the settings screen (0..100 -> 0..1).
function level() {
  if (save.muted) return 0;
  const v = typeof save.sfxVolume === 'number' ? save.sfxVolume : 100;
  return Math.max(0, Math.min(100, v)) / 100;
}

function tone(freq, dur, type = 'square', vol = 0.12, slide = 0, delay = 0) {
  const lv = level();
  if (!ctx || lv <= 0) return;
  vol *= lv;
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

// White-noise burst with a linear fade. `hp`/`lp` (Hz) optionally band it,
// which is what makes a typewriter key sound like a clack instead of a hiss.
function noise(dur, vol = 0.1, delay = 0, hp = 0, lp = 0) {
  const lv = level();
  if (!ctx || lv <= 0) return;
  vol *= lv;
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  let node = src;
  if (hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
  if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
  node.connect(g).connect(ctx.destination);
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
  // Skills upgrade: a rising 3-note power-up chime.
  levelUp: () => { [520, 780, 1040].forEach((f, i) => tone(f, 0.12, 'square', 0.09, 0, i * 0.07)); tone(1560, 0.2, 'triangle', 0.06, 0, 0.21); },
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
  // Noise Maker: sharp crack, a chest-thump, then a faint ear-ring
  bang:    () => {
    noise(0.05, 0.4, 0, 1800);
    noise(0.45, 0.32, 0.01, 0, 1400);
    tone(95, 0.45, 'triangle', 0.3, -60, 0.005);
    tone(3100, 0.9, 'sine', 0.018, -200, 0.12);
  },
  // ---- weapons ----
  zap:     () => { noise(0.14, 0.14, 0, 2600); tone(1500, 0.12, 'sawtooth', 0.06, -1000); tone(900, 0.08, 'square', 0.04, 700, 0.05); },
  dart:    () => { noise(0.05, 0.07, 0, 3200); tone(1800, 0.05, 'sine', 0.03, -700); },
  toss:    () => tone(300, 0.16, 'triangle', 0.08, 320),
  cage:    () => { tone(220, 0.08, 'square', 0.09, -60); tone(330, 0.1, 'square', 0.07, -80, 0.06); noise(0.06, 0.08, 0, 1400); },
  hook:    () => { noise(0.08, 0.08, 0, 1600); tone(700, 0.12, 'sawtooth', 0.05, -400); },
  reel:    () => tone(300, 0.22, 'square', 0.05, 520),
  inflate: () => { noise(0.35, 0.06, 0, 1800, 5000); tone(200, 0.35, 'sine', 0.06, 420); },
  pop:     () => { noise(0.08, 0.2, 0, 800); tone(500, 0.06, 'square', 0.06, -300); },
  shield:  () => { tone(300, 0.3, 'sine', 0.08, 320); tone(600, 0.3, 'sine', 0.04, 620, 0.05); },
  block:   () => { tone(1200, 0.08, 'square', 0.05, -500); noise(0.04, 0.06, 0, 2000); },
  cryo:    () => { noise(0.4, 0.12, 0, 3000); tone(2400, 0.3, 'sine', 0.03, -1200); },
  hypno:   () => { [0, 1, 2].forEach(i => tone(420 + i * 130, 0.18, 'sine', 0.06, i % 2 ? -160 : 220, i * 0.08)); },
  evac:    () => { tone(200, 0.5, 'sine', 0.08, 1200); tone(400, 0.5, 'triangle', 0.05, 1600, 0.05); noise(0.3, 0.04, 0, 3000); },
  // typewriter (mission brief)
  type:    () => {
    noise(0.018, 0.07 + Math.random() * 0.03, 0, 1400 + Math.random() * 900, 6500);
    tone(1500 + Math.random() * 500, 0.012, 'square', 0.012);
  },
  typeReturn: () => { noise(0.1, 0.05, 0, 700, 3000); tone(2100, 0.2, 'sine', 0.04, 0, 0.06); },
  stamp:   () => { noise(0.1, 0.25, 0, 0, 900); tone(85, 0.22, 'triangle', 0.22, -35); },
  // ---- story cutscenes ----
  // the cruiser burning in: a long low roar
  rumble:  () => { noise(2.6, 0.16, 0, 0, 260); tone(46, 2.4, 'sawtooth', 0.05, -12); },
  boom:    (big = false) => {
    noise(big ? 1.1 : 0.5, big ? 0.34 : 0.2, 0, 0, big ? 700 : 1100);
    tone(big ? 60 : 90, big ? 0.9 : 0.4, 'triangle', big ? 0.3 : 0.18, -30);
  },
  pod:     () => { tone(520 + Math.random() * 200, 0.12, 'square', 0.04, 500); noise(0.08, 0.05, 0.02, 1800); },
  static:  () => noise(0.22, 0.07, 0, 1500, 7000),
  // Handler Voss "talking": a low blip per syllable, pitch wobbling a little
  voice:   () => tone(150 + Math.random() * 45, 0.05, 'square', 0.035, -20),
  radio:   () => { noise(0.07, 0.06, 0, 1200, 5000); tone(1320, 0.05, 'square', 0.035, 0, 0.07); tone(990, 0.05, 'square', 0.035, 0, 0.12); },
  accept:  () => { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.16, 'square', 0.08, 0, i * 0.08)); tone(1046, 0.4, 'triangle', 0.06, 0, 0.32); },
  // the agent's double-take: two rising yelps
  startle: () => { tone(500, 0.08, 'square', 0.09, 500); tone(700, 0.12, 'square', 0.09, 700, 0.1); },
  objective: () => { tone(880, 0.06, 'square', 0.06); tone(1175, 0.1, 'square', 0.06, 0, 0.07); },
  stampede: () => { noise(1.4, 0.12, 0, 200, 1200); [0, 0.18, 0.34, 0.5, 0.66].forEach(d => tone(900 + Math.random() * 300, 0.08, 'square', 0.04, 400, d)); },
  // the agent losing his temper: a stamp of the foot, and a muttered growl
  stomp:   () => { tone(70, 0.14, 'triangle', 0.18, -30); noise(0.09, 0.12, 0, 0, 900); },
  grumble: () => { [190, 160, 130, 150].forEach((f, i) => tone(f + Math.random() * 20, 0.08, 'square', 0.05, -30, i * 0.09)); noise(0.3, 0.03, 0.05, 300, 1500); },
  sceneClear: () => { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.16, 'square', 0.08, 0, i * 0.11)); },
  // ---- Highway 29 ----
  // missing the jump: into the creek, then the bubbles
  splash:  () => { noise(0.4, 0.22, 0, 0, 1600); noise(0.12, 0.1, 0, 2400); [0.12, 0.2, 0.3].forEach(d => tone(500 + Math.random() * 300, 0.06, 'sine', 0.05, 400, d)); },
  // the shock gun: a rising whine as it charges, then the crack and buzz
  charge:  () => { tone(320, 0.5, 'sine', 0.05, 1500); tone(640, 0.5, 'square', 0.02, 2600, 0.05); },
  shock:   () => { noise(0.08, 0.3, 0, 2000); noise(0.7, 0.14, 0.03, 1200, 6000); tone(110, 0.7, 'sawtooth', 0.12, -30); tone(55, 0.8, 'square', 0.06, 20, 0.05); },
  crackle: () => { noise(0.04, 0.05 + Math.random() * 0.04, 0, 2500); },
  // somebody hopping into the back of a truck, its doors slamming
  clonk:   () => { tone(120, 0.1, 'triangle', 0.1, -40); noise(0.06, 0.06, 0, 300, 2000); },
  slam:    () => { tone(80, 0.18, 'triangle', 0.2, -30); noise(0.12, 0.18, 0, 200, 2400); },
  whistle: () => { tone(1320, 0.14, 'sine', 0.04, 60); tone(1760, 0.2, 'sine', 0.04, -80, 0.16); },
  // the semi: the engine turning over, then pulling away
  engine:  () => { [0, 0.16, 0.3].forEach(d => noise(0.1, 0.12, d, 0, 500)); tone(42, 1.1, 'sawtooth', 0.09, 16, 0.4); noise(1.1, 0.06, 0.4, 0, 300); },
  driveOff: () => { tone(46, 2.4, 'sawtooth', 0.09, 70); noise(2.4, 0.07, 0, 0, 400); tone(92, 2.2, 'square', 0.025, 90, 0.2); },
  // a car going by on the highway
  whoosh:  () => { noise(0.7, 0.14, 0, 400, 3000); tone(300, 0.6, 'sawtooth', 0.03, -180); },
  // the agent dragging himself along, and giving up
  scrape:  () => noise(0.16, 0.05, 0, 200, 1400),
  sigh:    () => { tone(330, 0.4, 'triangle', 0.07, -60); tone(247, 0.7, 'triangle', 0.07, -70, 0.35); },
};
