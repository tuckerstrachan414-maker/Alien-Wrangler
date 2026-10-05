// Every prop the maps are built from, under a stable id, so a map can be
// saved as plain data (maps/<id>.json) and edited in the map editor
// (editor.html), and so the asset editor can repaint a prop (or add a new
// one) and have every map pick the change up.
//
// Ids:
//   tree, bush, hay ...           the shared set (sprites.js buildProps)
//   yard:well ...                 the barnyard set (barnyardArt.js)
//   hwy:boulder ...               the Highway 29 woods set (highwayArt.js)
//   png:houseI ...                Maple Street's PNG pack (pngProps.js, once loaded)
//   crop:corn:224:10              a generated row of tall crops (kind:width:seed)
//   custom:<name>                 made in the asset editor
//
// Defs are shared objects: an override from the asset editor swaps a def's
// image / collision / flags in place, so it applies everywhere it's used.
import { buildProps, cropRow, canvas, T } from './sprites.js';
import { buildBarnyardProps } from './barnyardArt.js';
import { buildHighwayProps } from './highwayArt.js';

export const PROPS = buildProps();
export const YARD = buildBarnyardProps();
export const HWY = buildHighwayProps();

const DEFS = new Map();      // id -> def
const IDS = new WeakMap();   // def -> id
const INFO = new Map();      // id -> { id, name, group, kind: 'builtin' | 'png' | 'custom' | 'crop' }
const ORIGINAL = new Map();  // id -> the def as it was before any override

// Palette groups for the shared set (anything not listed lands in Misc).
const SHARED_GROUPS = {
  Playground: ['tree', 'bush', 'slide', 'swing', 'sandbox', 'junglegym', 'bench', 'fenceH', 'fenceV'],
  Farm: ['hay', 'barn', 'silo', 'tractor', 'coop', 'scarecrow', 'scarecrowRed', 'scarecrowBlue', 'pine', 'pod'],
  Shipyard: ['containerR', 'containerB', 'containerG', 'containerOpen', 'crate', 'barrel', 'pallet', 'crane', 'boat'],
  Street: ['rock', 'lamppost', 'dumpster', 'houseCream', 'houseTan', 'houseBrick', 'carRed', 'carBlue', 'carWhite',
    'mailbox', 'trashcan', 'hedge'],
  Island: ['volcano', 'palm', 'fern', 'hut', 'tikitorch', 'log'],
};

const NAMES = {
  fenceH: 'Fence (across)', fenceV: 'Fence (up/down)', junglegym: 'Jungle gym', hay: 'Hay bale',
  scarecrowRed: 'Scarecrow (plaid + crow)', scarecrowBlue: 'Scarecrow (denim)', pod: 'Crashed escape pod',
  containerR: 'Container (red)', containerB: 'Container (blue)', containerG: 'Container (green)',
  containerOpen: 'Container (open, hide inside)', houseCream: 'House (cream)', houseTan: 'House (tan)',
  houseBrick: 'House (brick)', carRed: 'Car (red)', carBlue: 'Car (blue)', carWhite: 'Car (white)',
  tikitorch: 'Tiki torch', pine: 'Pine tree', tree: 'Round tree',
  'yard:well': 'Stone well', 'yard:haypile': 'Hay pile', 'yard:gateOpen': 'Gate (hanging open)',
  'yard:sackTorn': 'Sack (torn)', 'yard:benchA': 'Potting bench A', 'yard:benchB': 'Potting bench B',
  'yard:benchC': 'Potting bench C', 'yard:benchD': 'Potting bench D',
  'hwy:logMoss': 'Mossy log', 'hwy:mossRock': 'Mossy rock', 'hwy:bigTree': 'Big oak', 'hwy:tuft': 'Grass tuft',
  'hwy:sign29': 'Route 29 sign', 'hwy:priceSign': 'Gas price sign', 'hwy:iceBox': 'Ice box',
  'hwy:canopy': 'Gas station canopy', 'hwy:store': 'Gas station store',
  'png:houseA': 'Apartment A', 'png:houseB': 'Apartment B', 'png:houseC': 'Apartment C',
  'png:houseI': 'Home I', 'png:houseJ': 'Home J', 'png:houseK': 'Home K',
  'png:houseAFlipped': 'Apartment A (facing up)', 'png:houseBFlipped': 'Apartment B (facing up)',
  'png:houseCFlipped': 'Apartment C (facing up)', 'png:houseIFlipped': 'Home I (facing up)',
  'png:houseJFlipped': 'Home J (facing up)', 'png:houseKFlipped': 'Home K (facing up)',
  'png:carRed': 'Car (red)', 'png:carBlue': 'Car (blue)', 'png:truck': 'Truck', 'png:truck2': 'Truck 2',
  'png:lamp': 'Street lamp', 'png:tree': 'Street tree', 'png:trashcan': 'Trash can', 'png:mailbox': 'Mailbox',
  'png:trafficlight': 'Traffic light',
};

export function humanize(key) {
  const s = key.replace(/^[a-z]+:/, '').replace(/([a-z])([A-Z0-9])/g, '$1 $2').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function register(id, def, group, kind = 'builtin', name = null) {
  DEFS.set(id, def);
  IDS.set(def, id);
  INFO.set(id, { id, name: name || NAMES[id] || humanize(id), group, kind });
}

{
  const grouped = new Set();
  for (const [group, keys] of Object.entries(SHARED_GROUPS)) {
    for (const k of keys) if (PROPS[k]) { register(k, PROPS[k], group); grouped.add(k); }
  }
  for (const k of Object.keys(PROPS)) if (!grouped.has(k)) register(k, PROPS[k], 'Misc');
  for (const k of Object.keys(YARD)) register(`yard:${k}`, YARD[k], 'Barnyard');
  for (const k of Object.keys(HWY)) register(`hwy:${k}`, HWY[k], 'Woods & Highway');
}

// Maple Street's PNG pack loads asynchronously (main.js); register it once
// it's in. Missing (failed to load) = those ids just don't resolve.
export function registerPngProps(png) {
  if (!png) return;
  for (const [k, def] of Object.entries(png)) {
    if (k === 'tiles' || !def || !def.img) continue;
    register(`png:${k}`, def, 'Maple Street (PNG)', 'png');
  }
}

// A row of tall crops (sprites.js cropRow), under an id that says how to
// make it again.
export function cropAsset(kind, w, seed) {
  const id = `crop:${kind}:${w}:${seed}`;
  if (DEFS.has(id)) return DEFS.get(id);
  const def = cropRow(kind, w, seed);
  register(id, def, 'Crops', 'crop', `${kind === 'corn' ? 'Corn' : 'Sunflower'} row (${w}px)`);
  return def;
}

export function getAsset(id) {
  if (DEFS.has(id)) return DEFS.get(id);
  const m = /^crop:(corn|sunflower):(\d+):(-?\d+)$/.exec(id || '');
  if (m) return cropAsset(m[1], +m[2], +m[3]);
  return null;
}

export function assetId(def) {
  const id = IDS.get(def);
  if (!id) throw new Error('assetId: prop def is not registered (add it to js/data/assets.js)');
  return id;
}

export function assetInfo(id) { return INFO.get(id) || null; }

// Everything placeable, for the editor's palette (crop rows are made by the
// editor's crop tool instead, so they're left out).
export function listAssets() {
  return [...INFO.values()].filter(i => i.kind !== 'crop');
}

/* ---------------- overrides (asset editor) ---------------- */

const FIELDS = ['img', 'solid', 'extraSolids', 'jumpable', 'hide', 'tall', 'windows'];

function snapshot(def) {
  const o = {};
  for (const f of FIELDS) if (f in def) o[f] = def[f];
  return o;
}

// The def as the game draws it before any override (what Revert goes back to).
export function originalAsset(id) {
  const def = DEFS.get(id);
  if (!def) return null;
  return ORIGINAL.get(id) || snapshot(def);
}

// Replace parts of a prop: { img, solid, extraSolids, jumpable, hide, tall, windows }.
export function overrideAsset(id, patch) {
  const def = DEFS.get(id);
  if (!def) return false;
  if (!ORIGINAL.has(id)) ORIGINAL.set(id, snapshot(def));
  for (const f of FIELDS) if (f in patch) {
    if (patch[f] === undefined) delete def[f];
    else def[f] = patch[f];
  }
  return true;
}

export function revertAsset(id) {
  const def = DEFS.get(id), orig = ORIGINAL.get(id);
  if (!def || !orig) return;
  for (const f of FIELDS) {
    if (f in orig) def[f] = orig[f];
    else delete def[f];
  }
  ORIGINAL.delete(id);
}

export function isOverridden(id) { return ORIGINAL.has(id); }

// A prop made from scratch in the asset editor.
export function registerCustomAsset(id, def, name) {
  if (!/^custom:[a-z0-9][a-z0-9_-]*$/.test(id)) throw new Error(`bad custom asset id: ${id}`);
  const prev = DEFS.get(id);
  if (prev) { Object.assign(prev, def); INFO.get(id).name = name || INFO.get(id).name; return prev; }
  register(id, def, 'Custom', 'custom', name);
  return def;
}

export function removeCustomAsset(id) {
  if (!id.startsWith('custom:')) return;
  DEFS.delete(id);
  INFO.delete(id);
}

/* ---------------- ground tiles ---------------- */

export const TILE_NAMES = Object.fromEntries(Object.entries(T).map(([k, v]) => [v, humanize(k.toLowerCase().replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase()))]));
Object.assign(TILE_NAMES, {
  [T.GRASS2]: 'Grass 2', [T.CORNFIELD]: 'Cornfield (flat)', [T.LAVAROCK]: 'Lava rock',
  [T.ROAD_PNG]: 'Road (PNG)', [T.CROSSWALK_H]: 'Crosswalk (across)', [T.CROSSWALK_V]: 'Crosswalk (up/down)',
  [T.LANE_H]: 'Lane line (across)', [T.LANE_V]: 'Lane line (up/down)', [T.ROAD_DIRT]: 'Dirt road',
  [T.ROAD_DIRT2]: 'Dirt road 2', [T.BARN_FLOOR]: 'Barn floor', [T.GH_FLOOR]: 'Greenhouse pavers',
  [T.WOODS2]: 'Woods 2', [T.GLADE2]: 'Glade (flowers)', [T.FOREST]: 'Forest floor',
});

// Ids at or above this belong to tiles made in the asset editor.
export const CUSTOM_TILE_BASE = 64;
const CUSTOM_TILES = new Map();   // id -> { id, name }

export function registerCustomTile(id, name) {
  CUSTOM_TILES.set(id, { id, name });
  TILE_NAMES[id] = name;
}
export function removeCustomTile(id) { CUSTOM_TILES.delete(id); delete TILE_NAMES[id]; }
export function customTiles() { return [...CUSTOM_TILES.values()]; }
export function tileName(id) { return TILE_NAMES[id] || `Tile ${id}`; }

/* ---------------- helpers ---------------- */

// A blank prop image (for new custom assets).
export function blankImage(w, h) { return canvas(w, h)[0]; }
