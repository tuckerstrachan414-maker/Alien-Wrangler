// Advanced-gear loadout: passive kit (e.g. Field Drones) with a single slot,
// separate from the two hand-fired gadget slots in loadout.js. You can own
// every advanced item, but only one rides along on a mission.
// Which one is equipped is saved on an account (see account.js).
import { ADVANCED_GEAR } from './data/missions.js';
import { save } from './save.js';
import { CONTRACT } from './account.js';

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
export function equipAdvanced(gear, id, acct = CONTRACT) {
  const cur = resolveAdvanced(gear, acct.advancedSlot);
  acct.advancedSlot = cur === id ? null : id;
  acct.persist();
  return resolveAdvanced(gear, acct.advancedSlot);
}

// Tap the slot in a menu: step to the next owned advanced item.
export function cycleAdvancedSlot(gear, acct = CONTRACT) {
  const owned = ownedAdvanced(gear);
  if (!owned.length) return resolveAdvanced(gear, acct.advancedSlot);
  const cur = owned.indexOf(resolveAdvanced(gear, acct.advancedSlot));
  acct.advancedSlot = owned[(cur + 1) % owned.length];
  acct.persist();
  return resolveAdvanced(gear, acct.advancedSlot);
}
