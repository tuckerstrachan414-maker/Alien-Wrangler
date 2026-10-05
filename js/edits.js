// Map + asset edits made in the editor (editor.html), and how the game picks
// them up at boot.
//
// Two places an edit can live:
//   published  files in the repo's maps/ folder: manifest.json lists the
//              edited maps (maps/<id>.json each) and whether there's an
//              assets.json (repainted props / tiles / characters, new ones).
//              Everyone who loads the game gets these.
//   draft      the editor's working copy, in this browser's localStorage.
//              While "play my drafts" is on (the default) a draft wins
//              over the published file, so the editor's Play Test shows a
//              change the moment it's made, before it's published.
// Whatever isn't edited comes from the builders in js/data/maps.js.
import { normalizeDoc, setMapEdits, MAP_INFO } from './data/maps.js';
import {
  overrideAsset, registerCustomAsset, registerCustomTile, CUSTOM_TILE_BASE,
} from './data/assets.js';
import { TERRAIN } from './terrain.js';
import { canvas, flipX } from './data/sprites.js';
import { addEditedMaps } from './data/missions.js';

export const EDITS_DIR = 'maps/';
export const DRAFTS_KEY = 'alien-wrangler-editor-v1';
export const MANIFEST_FORMAT = 'alien-wrangler-edits';
export const ASSETS_FORMAT = 'alien-wrangler-assets';

/* ---------------- published (maps/ in the repo) ---------------- */

async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

// { manifest, maps: { id: doc }, assets: bundle | null, errors: [] }
export async function fetchPublished(base = EDITS_DIR) {
  const res = { manifest: null, maps: {}, assets: null, errors: [] };
  try {
    res.manifest = await getJSON(`${base}manifest.json`);
  } catch {
    return res;                                   // no edits published yet
  }
  const ids = Array.isArray(res.manifest.maps) ? res.manifest.maps : [];
  await Promise.all(ids.map(async (id) => {
    try { res.maps[id] = normalizeDoc(await getJSON(`${base}${encodeURIComponent(id)}.json`), id); }
    catch (e) { res.errors.push(`map ${id}: ${e.message}`); }
  }));
  if (res.manifest.assets) {
    try {
      const a = await getJSON(`${base}assets.json`);
      if (a.format && a.format !== ASSETS_FORMAT) throw new Error('not an assets file');
      res.assets = a;
    } catch (e) { res.errors.push(`assets: ${e.message}`); }
  }
  return res;
}

/* ---------------- drafts (this browser) ---------------- */

// { version, play, maps: { id: { doc, updated } | { deleted: true, updated } }, assets: bundle | null }
export function readDrafts() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(DRAFTS_KEY) || 'null'); } catch { d = null; }
  if (!d || typeof d !== 'object') d = {};
  return {
    version: 1,
    play: d.play !== false,
    maps: d.maps && typeof d.maps === 'object' ? d.maps : {},
    assets: d.assets && typeof d.assets === 'object' ? d.assets : null,
    assetsUpdated: d.assetsUpdated || 0,
  };
}

export function writeDrafts(d) {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(d));
}

// What the game should play: published edits, with drafts laid over them
// (when drafts are switched on).
export function mergeEdits(published, drafts) {
  const maps = { ...published.maps };
  const localMaps = [];
  let assets = published.assets;
  let localAssets = false;
  if (drafts && drafts.play) {
    for (const [id, d] of Object.entries(drafts.maps)) {
      if (!d) continue;
      if (d.deleted) { if (maps[id]) localMaps.push(id); delete maps[id]; continue; }
      try { maps[id] = normalizeDoc(d.doc, id); localMaps.push(id); } catch { /* unreadable draft: skip */ }
    }
    if (drafts.assets) { assets = drafts.assets; localAssets = true; }
  }
  return { maps, assets, localMaps, localAssets };
}

/* ---------------- applying an assets bundle ---------------- */

export function emptyAssetBundle() {
  return { format: ASSETS_FORMAT, version: 1, props: {}, customProps: {}, tiles: {}, customTiles: {}, actors: {} };
}

// A PNG data URL as a canvas (so it reads back like the drawn art does).
export async function decodePng(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const [c, x] = canvas(img.naturalWidth, img.naturalHeight);
  x.drawImage(img, 0, 0);
  return c;
}

const rect = (r) => (r && isFinite(r.x) && isFinite(r.y) && isFinite(r.w) && isFinite(r.h)
  ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.max(1, Math.round(r.w)), h: Math.max(1, Math.round(r.h)) } : null);

// The prop fields an assets.json entry may carry, as a def patch.
export async function propPatch(p) {
  const patch = {};
  if (p.png) patch.img = await decodePng(p.png);
  if ('solid' in p) patch.solid = rect(p.solid);
  if (Array.isArray(p.extraSolids)) patch.extraSolids = p.extraSolids.map(rect).filter(Boolean);
  if (p.extraSolids === null) patch.extraSolids = undefined;
  for (const f of ['jumpable', 'hide', 'tall']) if (f in p) patch[f] = !!p[f];
  if (Array.isArray(p.windows)) patch.windows = p.windows.map(rect).filter(Boolean);
  return patch;
}

// Actor sprite slots the asset editor can repaint. Left-facing sprites are
// the right-facing ones mirrored, so they follow automatically.
export const ACTOR_SLOTS = [
  'player.down', 'player.up', 'player.right', 'player.proneR', 'player.diveR',
  ...['grunt', 'scout', 'trooper', 'elite'].flatMap(t => [`alien.${t}.down`, `alien.${t}.up`, `alien.${t}.right`]),
  'van', 'ufo',
];
const MIRRORS = { right: 'left', proneR: 'proneL', diveR: 'diveL' };

export function setActorSprite(assets, slot, img) {
  const parts = slot.split('.');
  if (parts[0] === 'van') { assets.van = img; return; }
  if (parts[0] === 'ufo') { assets.ufo = img; return; }
  const set = parts[0] === 'player' ? assets.actors.player : assets.actors.aliens[parts[1]];
  if (!set) return;
  const key = parts[parts.length - 1];
  set[key] = img;
  if (MIRRORS[key]) set[MIRRORS[key]] = flipX(img);
}

export function getActorSprite(assets, slot) {
  const parts = slot.split('.');
  if (parts[0] === 'van') return assets.van;
  if (parts[0] === 'ufo') return assets.ufo;
  const set = parts[0] === 'player' ? assets.actors.player : assets.actors.aliens[parts[1]];
  return set ? set[parts[parts.length - 1]] : null;
}

// Apply a whole bundle (once, at boot). Returns a list of problems.
export async function applyAssetBundle(assets, bundle) {
  const errors = [];
  if (!bundle) return errors;
  const each = async (obj, fn) => {
    for (const [k, v] of Object.entries(obj || {})) {
      try { await fn(k, v); } catch (e) { errors.push(`${k}: ${e.message}`); }
    }
  };
  await each(bundle.customTiles, async (k, t) => {
    const id = +k;
    if (!(id >= CUSTOM_TILE_BASE) || !t.png) return;
    assets.tiles[id] = await decodePng(t.png);
    registerCustomTile(id, t.name || `Tile ${id}`);
    if (t.blend && t.blend.group) TERRAIN[id] = { group: String(t.blend.group), pri: +t.blend.pri || 0 };
  });
  await each(bundle.tiles, async (k, t) => {
    const id = +k;
    if (t.png && assets.tiles[id]) assets.tiles[id] = await decodePng(t.png);
  });
  await each(bundle.customProps, async (id, p) => {
    if (!p.png) return;
    const patch = await propPatch(p);
    registerCustomAsset(id, {
      img: patch.img, solid: patch.solid || null, jumpable: !!patch.jumpable, hide: !!patch.hide, tall: !!patch.tall,
      ...(patch.extraSolids && patch.extraSolids.length ? { extraSolids: patch.extraSolids } : {}),
    }, p.name);
  });
  await each(bundle.props, async (id, p) => { overrideAsset(id, await propPatch(p)); });
  await each(bundle.actors, async (slot, url) => {
    if (ACTOR_SLOTS.includes(slot) && url) setActorSprite(assets, slot, await decodePng(url));
  });
  return errors;
}

/* ---------------- the game's boot ---------------- */

// Load every edit and put it in place before anything is drawn or built.
// Returns what came from where, for the build badge.
export async function loadEditsForGame(assets) {
  const published = await fetchPublished();
  const drafts = readDrafts();
  const eff = mergeEdits(published, drafts);
  const errors = published.errors.concat(await applyAssetBundle(assets, eff.assets));
  setMapEdits(eff.maps);
  addEditedMaps(Object.values(eff.maps).map(doc => ({
    id: doc.id, name: doc.name, custom: !MAP_INFO[doc.id],
  })));
  for (const e of errors) console.warn('map editor edits:', e);
  return {
    published: Object.keys(published.maps).length + (published.assets ? 1 : 0),
    localMaps: eff.localMaps, localAssets: eff.localAssets, errors,
  };
}
