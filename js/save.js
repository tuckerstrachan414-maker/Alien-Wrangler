const KEY = 'alien-wrangler-save-v1';

const DEFAULT = {
  cash: 0,
  missionsCleared: 0,      // next mission index to play
  gear: {},                // id -> level
  totalCaptured: 0,
  bestPay: {},             // missionId -> best payout
  muted: false,
};

export const save = { ...DEFAULT };

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(save, DEFAULT, JSON.parse(raw));
  } catch (e) { /* fresh save */ }
  return save;
}

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* private mode */ }
}

export function resetSave() {
  Object.keys(save).forEach(k => delete save[k]);
  Object.assign(save, JSON.parse(JSON.stringify(DEFAULT)));
  persist();
}
