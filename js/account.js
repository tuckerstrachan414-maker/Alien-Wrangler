// Whose money and gear a screen is working with. Both accounts have the same
// shape, so the shop, the loadout pickers and the game don't care which one
// they're handed:
//
//   CONTRACT - the PLAY-mode bank: contracts and the original shop
//   STORY    - the story wallet. The Stage 2 briefing opens it with the
//              agency's starting cash; story scenes pay into it.
//
//   acct.cash / acct.gear / acct.loadout / acct.advancedSlot, acct.persist()
import { save, persist } from './save.js';

export const CONTRACT = {
  id: 'contract',
  label: 'BANK',
  get cash() { return save.cash; },
  set cash(v) { save.cash = v; },
  get gear() { return save.gear; },
  get loadout() { return save.loadout; },
  set loadout(v) { save.loadout = v; },
  get advancedSlot() { return save.advancedSlot; },
  set advancedSlot(v) { save.advancedSlot = v; },
  persist,
};

// Until the wallet is opened the story account reads as empty and writes to
// it go nowhere (nothing offers the locker before the briefing opens it, and
// a stray write must never open it early with nothing in it).
const CLOSED = Object.freeze({ cash: 0, gear: Object.freeze({}), loadout: Object.freeze([]), advancedSlot: null });
const wallet = () => save.story.wallet || CLOSED;
const writable = () => save.story.wallet || {};

export const STORY = {
  id: 'story',
  label: 'BALANCE',
  get open() { return !!save.story.wallet; },
  get cash() { return wallet().cash; },
  set cash(v) { writable().cash = v; },
  get gear() { return wallet().gear; },
  get loadout() { return wallet().loadout; },
  set loadout(v) { writable().loadout = v; },
  get advancedSlot() { return wallet().advancedSlot; },
  set advancedSlot(v) { writable().advancedSlot = v; },
  persist,
};

// Open the story wallet with `cash` in it. Does nothing (and keeps every
// dollar and gadget) if it's already open, so replaying the briefing never
// resets it.
export function openStoryWallet(cash) {
  if (!save.story.wallet) {
    save.story.wallet = { cash, gear: {}, loadout: [], advancedSlot: null };
    persist();
  }
  return save.story.wallet;
}
