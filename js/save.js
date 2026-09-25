const KEY = 'alien-wrangler-save-v1';

const DEFAULT = {
  cash: 0,
  missionsCleared: 0,      // next mission index to play
  gear: {},                // id -> level
  loadout: [],             // preferred gadget order: [tap slot, swipe-right slot]
  advancedSlot: null,      // equipped advanced-gear id (e.g. 'drones'), or null
  totalCaptured: 0,
  bestPay: {},             // missionId -> best payout
  muted: false,
  sfxVolume: 100,          // 0..100 master SFX level
  controlMode: 'buttons',  // 'buttons' | 'gestures'
  gestureHints: true,      // show the gesture legend in no-buttons mode
  sandbox: {               // free-play loadout, remembered between sessions
    map: 'playground',
    aliens: { grunt: 2, scout: 1, trooper: 0, elite: 0 },
    time: 180,             // seconds, or 0 for no time limit
    gear: {},
  },
  story: {                 // Stage 1 (tutorial) progress
    introSeen: false,      // watched (or skipped) the opening briefing
    scenesCleared: 0,      // highest scene of Stage 1 finished
  },
};

const clone = (o) => JSON.parse(JSON.stringify(o));

export const save = clone(DEFAULT);

// Old saves predate the settings/sandbox blocks, so fill in anything missing
// instead of trusting whatever shape came out of localStorage.
function normalize() {
  if (typeof save.sfxVolume !== 'number' || !isFinite(save.sfxVolume)) save.sfxVolume = 100;
  save.sfxVolume = Math.max(0, Math.min(100, Math.round(save.sfxVolume / 25) * 25));
  if (save.controlMode !== 'gestures') save.controlMode = 'buttons';
  save.gestureHints = save.gestureHints !== false;
  const sb = (save.sandbox && typeof save.sandbox === 'object') ? save.sandbox : {};
  save.sandbox = {
    map: typeof sb.map === 'string' ? sb.map : DEFAULT.sandbox.map,
    aliens: { ...DEFAULT.sandbox.aliens, ...(sb.aliens || {}) },
    time: typeof sb.time === 'number' ? sb.time : DEFAULT.sandbox.time,
    gear: { ...(sb.gear || {}) },
  };
  const st = (save.story && typeof save.story === 'object') ? save.story : {};
  save.story = {
    introSeen: st.introSeen === true,
    scenesCleared: Number.isFinite(st.scenesCleared) ? Math.max(0, Math.floor(st.scenesCleared)) : 0,
  };
  if (!save.gear || typeof save.gear !== 'object') save.gear = {};
  save.loadout = Array.isArray(save.loadout) ? save.loadout.filter(id => typeof id === 'string').slice(0, 2) : [];
  save.advancedSlot = typeof save.advancedSlot === 'string' ? save.advancedSlot : null;
  migrateGear(save.gear);
  migrateGear(save.sandbox.gear);
}

// Tracker Goggles were replaced by the Noise Maker (same two price tiers), so
// anyone who bought goggles keeps what they paid for as the same Noise Maker level.
function migrateGear(gear) {
  if (!gear.goggles) { delete gear.goggles; return; }
  gear.noisemaker = Math.max(gear.noisemaker || 0, Math.min(2, gear.goggles));
  delete gear.goggles;
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(save, clone(DEFAULT), JSON.parse(raw));
  } catch (e) { /* fresh save */ }
  normalize();
  return save;
}

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* private mode */ }
}

export function resetSave() {
  Object.keys(save).forEach(k => delete save[k]);
  Object.assign(save, clone(DEFAULT));
  persist();
}
