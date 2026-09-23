// Advanced-gear loadout: passive kit (e.g. Field Drones) with a single slot,
// separate from the two hand-fired gadget slots in loadout.js. You can own
// every advanced item, but only one rides along on a mission.
import { ADVANCED_GEAR } from './data/missions.js';
import { save, persist } from './save.js';

export function ownedAdvanced(gear) {
  return ADVANCED_GEAR.filter(g => (gear[g.id] || 0) > 0).map(g => g.id);
}

// -> equipped advanced-gear id, or null.
export function resolveAdvanced(gear, pref = save.advancedSlot) {
  const owned = ownedAdvanced(gear);
  if (pref && owned.includes(pref)) return pref;
  return owned[0] || null;
}

// Equip `id`; tapping the already-equipped item unequips it.
export function equipAdvanced(gear, id) {
  const cur = resolveAdvanced(gear);
  save.advancedSlot = cur === id ? null : id;
  persist();
  return resolveAdvanced(gear);
}

// Tap the slot in a menu: step to the next owned advanced item.
export function cycleAdvancedSlot(gear) {
  const owned = ownedAdvanced(gear);
  if (!owned.length) return resolveAdvanced(gear);
  const cur = owned.indexOf(resolveAdvanced(gear));
  save.advancedSlot = owned[(cur + 1) % owned.length];
  persist();
  return resolveAdvanced(gear);
}
