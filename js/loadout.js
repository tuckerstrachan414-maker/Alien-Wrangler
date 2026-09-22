// Gadget loadout: you can own every gadget, but only GADGET_SLOTS of them ride
// along on a mission. Slot 1 fires on a right-thumb TAP (or the first gadget
// button), slot 2 on a SWIPE RIGHT (or the second button).
//
// save.loadout is just the player's preferred order. It is always resolved
// against what is actually owned, and empty slots auto-fill with owned
// gadgets, so buying your first gadget equips it without a trip to a menu.
import { GADGETS, GADGET_SLOTS } from './data/missions.js';
import { save, persist } from './save.js';

const isGadget = (id) => GADGETS.some(g => g.id === id);

export function ownedGadgets(gear) {
  return GADGETS.filter(g => (gear[g.id] || 0) > 0).map(g => g.id);
}

// -> array of gadget ids, length <= GADGET_SLOTS, slot order preserved.
export function resolveLoadout(gear, pref = save.loadout) {
  const owned = ownedGadgets(gear);
  const out = [];
  for (const id of pref || []) {
    if (out.length >= GADGET_SLOTS) break;
    if (isGadget(id) && owned.includes(id) && !out.includes(id)) out.push(id);
  }
  for (const id of owned) {
    if (out.length >= GADGET_SLOTS) break;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

// Put gadget `id` into `slot`; if it already sits in the other slot the two swap.
export function equipGadget(gear, slot, id) {
  const lo = resolveLoadout(gear);
  const at = lo.indexOf(id);
  if (at === slot) return lo;
  if (at >= 0) [lo[at], lo[slot]] = [lo[slot], lo[at]];
  else lo[slot] = id;
  save.loadout = lo.filter(Boolean);
  persist();
  return resolveLoadout(gear);
}

// Tap a slot in a menu: step it to the next owned gadget.
export function cycleSlot(gear, slot) {
  const owned = ownedGadgets(gear);
  if (!owned.length) return resolveLoadout(gear);
  const lo = resolveLoadout(gear);
  const cur = owned.indexOf(lo[slot]);
  return equipGadget(gear, slot, owned[(cur + 1) % owned.length]);
}

export function swapSlots(gear) {
  const lo = resolveLoadout(gear);
  if (lo.length < 2) return lo;
  return equipGadget(gear, 0, lo[1]);
}

// How each slot is fired under the current control scheme (HTML: the pixel
// font has no arrow glyphs, so the arrow is a CSS shape).
export function slotControl(slot, mode = save.controlMode) {
  if (mode === 'gestures') return slot === 0 ? 'TAP' : 'SWIPE <i class="arr rt"></i>';
  return slot === 0 ? 'BUTTON 1' : 'BUTTON 2';
}
