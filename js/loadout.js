// Gadget loadout: you can own every gadget, but only GADGET_SLOTS of them ride
// along on a mission. Slot 1 fires on a right-thumb TAP (or the first gadget
// button), slot 2 on a SWIPE RIGHT (or the second button).
//
// An account's `loadout` (save.loadout for the PLAY-mode bank, the story
// wallet's own for the story; see account.js) is just the player's preferred
// order. It is always resolved against what is actually owned, and empty
// slots auto-fill with owned gadgets, so buying your first gadget equips it
// without a trip to a menu.
import { GADGETS, GADGET_SLOTS } from './data/missions.js';
import { save } from './save.js';
import { CONTRACT } from './account.js';

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

// Put gadget `id` into `slot`; if it already sits in the other slot the two
// swap. The new order is saved on `acct`.
export function equipGadget(gear, slot, id, acct = CONTRACT) {
  const lo = resolveLoadout(gear, acct.loadout);
  const at = lo.indexOf(id);
  if (at === slot) return lo;
  if (at >= 0) [lo[at], lo[slot]] = [lo[slot], lo[at]];
  else lo[slot] = id;
  acct.loadout = lo.filter(Boolean);
  acct.persist();
  return resolveLoadout(gear, acct.loadout);
}

// Tap a slot in a menu: step it to the next owned gadget.
export function cycleSlot(gear, slot, acct = CONTRACT) {
  const owned = ownedGadgets(gear);
  if (!owned.length) return resolveLoadout(gear, acct.loadout);
  const lo = resolveLoadout(gear, acct.loadout);
  const cur = owned.indexOf(lo[slot]);
  return equipGadget(gear, slot, owned[(cur + 1) % owned.length], acct);
}

export function swapSlots(gear, acct = CONTRACT) {
  const lo = resolveLoadout(gear, acct.loadout);
  if (lo.length < 2) return lo;
  return equipGadget(gear, 0, lo[1], acct);
}

// How each slot is fired under the current control scheme (HTML: the pixel
// font has no arrow glyphs, so the arrow is a CSS shape).
export function slotControl(slot, mode = save.controlMode) {
  if (mode === 'gestures') return slot === 0 ? 'TAP' : 'SWIPE <i class="arr rt"></i>';
  return slot === 0 ? 'BUTTON 1' : 'BUTTON 2';
}
