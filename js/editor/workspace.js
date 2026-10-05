// The editor's working state: which doc each map is on, the drafts kept in
// this browser (saved on every change, so nothing is ever lost and the
// game's Play Test sees them at once), undo history per map, the working
// assets bundle, and what's changed since the last publish.
import { MAP_INFO, defaultMapDoc, normalizeDoc, blankDoc } from '../data/maps.js';
import { readDrafts, writeDrafts, emptyAssetBundle } from '../edits.js';

const json = (o) => JSON.stringify(o);
// key-order-proof JSON, for "is this the same as that"
export function canon(o) {
  if (Array.isArray(o)) return `[${o.map(canon).join(',')}]`;
  if (o && typeof o === 'object') return `{${Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canon(o[k])}`).join(',')}}`;
  return JSON.stringify(o);
}
const same = (a, b) => canon(a) === canon(b);
const clone = (o) => JSON.parse(JSON.stringify(o));
const HISTORY_MAX = 200;

export class Workspace {
  constructor(assets, published) {
    this.assets = assets;
    this.published = published;          // fetchPublished() result (maps/ in the repo)
    this.drafts = readDrafts();
    this.docs = new Map();               // id -> working doc
    this.hist = new Map();               // id -> { past: [json], future: [json] }
    this.listeners = new Set();
    this.saveTimer = 0;
    this.lastSaveError = null;
    this.assetBundle = clone(this.drafts.assets || published.assets || emptyAssetBundle());
    for (const k of ['props', 'customProps', 'tiles', 'customTiles', 'actors']) this.assetBundle[k] = this.assetBundle[k] || {};
    this.pruneDrafts();
  }

  // Drafts that now match what's published (a publish has deployed) are
  // done with; so are deletions the published manifest already reflects.
  pruneDrafts() {
    let changed = false;
    for (const [id, dr] of Object.entries(this.drafts.maps)) {
      if (!dr) { delete this.drafts.maps[id]; changed = true; continue; }
      if (dr.deleted) { if (!this.published.maps[id]) { delete this.drafts.maps[id]; changed = true; } continue; }
      const base = this.baseDoc(id);
      let doc = null;
      try { doc = normalizeDoc(dr.doc, id); } catch { /* unreadable: leave it */ }
      if (doc && base && same(base, doc)) { delete this.drafts.maps[id]; changed = true; }
    }
    if (this.drafts.assets && same(normalizeBundle(this.drafts.assets), normalizeBundle(this.published.assets || emptyAssetBundle()))) {
      this.drafts.assets = null;
      changed = true;
    }
    if (changed) this.persist();
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(evt, data) { for (const fn of this.listeners) fn(evt, data); }

  /* ---------------- which maps ---------------- */

  isCustom(id) { return !MAP_INFO[id]; }
  isStrip(id) { return !!(MAP_INFO[id] && MAP_INFO[id].strip); }

  mapIds() {
    const ids = Object.keys(MAP_INFO);
    const extra = new Set([...Object.keys(this.published.maps), ...Object.keys(this.drafts.maps)]);
    for (const id of extra) {
      if (MAP_INFO[id] || ids.includes(id)) continue;
      const d = this.drafts.maps[id];
      if (d && d.deleted) continue;
      ids.push(id);
    }
    return ids;
  }

  // The doc a map goes back to if its draft is thrown away.
  baseDoc(id) {
    if (this.published.maps[id]) return clone(this.published.maps[id]);
    if (MAP_INFO[id]) return defaultMapDoc(id, this.assets);
    return null;
  }
  builtinDoc(id) { return MAP_INFO[id] ? defaultMapDoc(id, this.assets) : null; }

  doc(id) {
    if (this.docs.has(id)) return this.docs.get(id);
    let d = null;
    const dr = this.drafts.maps[id];
    if (dr && dr.doc) { try { d = normalizeDoc(dr.doc, id); } catch { d = null; } }
    if (!d) d = this.baseDoc(id);
    if (d) this.docs.set(id, d);
    return d;
  }

  name(id) {
    const d = this.isStrip(id) ? null : this.doc(id);
    return (d && d.name) || (MAP_INFO[id] && MAP_INFO[id].name) || id;
  }

  // { draft, published, custom, changed } for the map list / save badge
  status(id) {
    const dr = this.drafts.maps[id];
    const pub = !!this.published.maps[id];
    return { draft: !!dr, deleted: !!(dr && dr.deleted), published: pub, custom: this.isCustom(id) };
  }

  /* ---------------- changes + history ---------------- */

  history(id) {
    if (!this.hist.has(id)) this.hist.set(id, { past: [], future: [] });
    return this.hist.get(id);
  }

  // Make `doc` the map's doc (one undo step).
  commit(id, doc, label = 'edit') {
    const prev = this.doc(id);
    const h = this.history(id);
    const pj = json(prev);
    if (same(prev, doc)) return false;
    h.past.push(pj);
    if (h.past.length > HISTORY_MAX) h.past.shift();
    h.future.length = 0;
    this.docs.set(id, doc);
    this.scheduleSave(id);
    this.emit('doc', { id, label });
    return true;
  }

  canUndo(id) { return this.history(id).past.length > 0; }
  canRedo(id) { return this.history(id).future.length > 0; }

  undo(id) {
    const h = this.history(id);
    if (!h.past.length) return false;
    h.future.push(json(this.doc(id)));
    this.docs.set(id, JSON.parse(h.past.pop()));
    this.scheduleSave(id);
    this.emit('doc', { id, label: 'undo' });
    return true;
  }

  redo(id) {
    const h = this.history(id);
    if (!h.future.length) return false;
    h.past.push(json(this.doc(id)));
    this.docs.set(id, JSON.parse(h.future.pop()));
    this.scheduleSave(id);
    this.emit('doc', { id, label: 'redo' });
    return true;
  }

  /* ---------------- drafts (localStorage) ---------------- */

  scheduleSave(id) {
    this.pendingSave = this.pendingSave || new Set();
    this.pendingSave.add(id);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 350);
  }

  // A map's draft is dropped once it matches what it would go back to.
  flush() {
    clearTimeout(this.saveTimer);
    if (!this.pendingSave || !this.pendingSave.size) return;
    for (const id of this.pendingSave || []) {
      const doc = this.docs.get(id);
      if (!doc) continue;
      const base = this.baseDoc(id);
      if (base && same(base, doc)) delete this.drafts.maps[id];
      else this.drafts.maps[id] = { doc, updated: Date.now() };
    }
    this.pendingSave = new Set();
    this.persist();
  }

  persist() {
    try {
      writeDrafts(this.drafts);
      this.lastSaveError = null;
    } catch (e) {
      this.lastSaveError = e;
      this.emit('saveError', e);
    }
    this.emit('saved');
  }

  setPlayDrafts(on) { this.drafts.play = !!on; this.persist(); }

  // Throw the draft away: back to the published file, or the built-in map.
  revert(id, to = 'published') {
    const target = to === 'builtin' ? this.builtinDoc(id) : this.baseDoc(id);
    if (!target) return false;
    if (to === 'builtin' && this.published.maps[id]) {
      // the published edit stays in the repo until a publish removes it;
      // the draft says "use the built-in map" until then
      this.docs.set(id, target);
      this.drafts.maps[id] = { doc: target, updated: Date.now() };
      this.persist();
    } else {
      this.docs.set(id, target);
      delete this.drafts.maps[id];
      this.persist();
    }
    this.hist.delete(id);
    this.emit('doc', { id, label: 'revert' });
    return true;
  }

  createMap(id, name, tw, th, tile) {
    const doc = blankDoc(id, name, tw, th, tile);
    doc.custom = true;
    this.docs.set(id, doc);
    this.drafts.maps[id] = { doc, updated: Date.now() };
    this.persist();
    this.emit('maps');
    return doc;
  }

  duplicateMap(fromId, id, name) {
    const doc = clone(this.doc(fromId));
    doc.id = id; doc.name = name; doc.custom = true;
    doc.story = {};
    this.docs.set(id, doc);
    this.drafts.maps[id] = { doc, updated: Date.now() };
    this.persist();
    this.emit('maps');
    return doc;
  }

  // Custom maps only. A published one is marked deleted until a publish removes it.
  deleteMap(id) {
    if (!this.isCustom(id)) return false;
    this.docs.delete(id);
    this.hist.delete(id);
    if (this.published.maps[id]) this.drafts.maps[id] = { deleted: true, updated: Date.now() };
    else delete this.drafts.maps[id];
    this.persist();
    this.emit('maps');
    return true;
  }

  // Adopt a doc from a file.
  importDoc(raw, idOverride = null) {
    const doc = normalizeDoc(raw, idOverride || raw.id);
    if (!MAP_INFO[doc.id]) doc.custom = true;
    if (this.isStrip(doc.id)) throw new Error('Highway 29 is streamed in as you play and has no map file');
    const exists = this.docs.has(doc.id) || this.mapIds().includes(doc.id);
    if (exists) this.commit(doc.id, doc, 'import');
    else { this.docs.set(doc.id, doc); this.drafts.maps[doc.id] = { doc, updated: Date.now() }; this.persist(); }
    this.emit('maps');
    return doc;
  }

  /* ---------------- assets ---------------- */

  // The asset editor changed the working bundle.
  assetsChanged() {
    const pub = this.published.assets || emptyAssetBundle();
    this.drafts.assets = same(normalizeBundle(pub), normalizeBundle(this.assetBundle)) ? null : clone(this.assetBundle);
    this.drafts.assetsUpdated = Date.now();
    this.persist();
    this.emit('assets');
  }

  /* ---------------- publishing ---------------- */

  // Everything that differs from what's published: the files a publish writes.
  pendingChanges() {
    this.flush();
    const maps = [];
    for (const id of this.mapIds()) {
      if (this.isStrip(id)) continue;
      const dr = this.drafts.maps[id];
      if (!dr) continue;
      const pub = this.published.maps[id];
      if (dr.deleted) continue;
      const doc = this.doc(id);
      const builtin = this.builtinDoc(id);
      // going back to exactly the built-in map = drop the published file
      if (builtin && same(builtin, doc)) { if (pub) maps.push({ id, action: 'delete' }); continue; }
      if (!pub || !same(pub, doc)) maps.push({ id, action: pub ? 'update' : 'add', doc });
    }
    for (const [id, dr] of Object.entries(this.drafts.maps)) {
      if (dr && dr.deleted && this.published.maps[id]) maps.push({ id, action: 'delete' });
    }
    const pubAssets = this.published.assets || emptyAssetBundle();
    const assetsChanged = !same(normalizeBundle(pubAssets), normalizeBundle(this.assetBundle));
    const bundleEmpty = isEmptyBundle(this.assetBundle);
    return { maps, assets: assetsChanged ? (bundleEmpty ? 'delete' : 'update') : null };
  }

  // The full set of files the repo's maps/ folder should hold after a publish.
  publishFiles() {
    const pend = this.pendingChanges();
    const keep = new Set(Object.keys(this.published.maps));
    const files = {};
    for (const c of pend.maps) {
      if (c.action === 'delete') keep.delete(c.id);
      else { keep.add(c.id); files[`maps/${c.id}.json`] = formatDoc(c.doc); }
    }
    const assetsOn = pend.assets ? pend.assets !== 'delete' : !!this.published.assets;
    if (pend.assets === 'update') files['maps/assets.json'] = JSON.stringify(normalizeBundle(this.assetBundle), null, 1) + '\n';
    const manifest = { format: 'alien-wrangler-edits', version: 1, maps: [...keep].sort(), assets: assetsOn };
    files['maps/manifest.json'] = JSON.stringify(manifest, null, 2) + '\n';
    const deletions = pend.maps.filter(c => c.action === 'delete').map(c => `maps/${c.id}.json`);
    if (pend.assets === 'delete') deletions.push('maps/assets.json');
    return { files, deletions, pend, manifest };
  }

  // After a publish went through: what's published is what we have now.
  // The drafts stay (identical to what was published) until the site has
  // redeployed with the new files, so the game in this browser never shows
  // the old version in between; pruneDrafts() drops them on a later load.
  markPublished() {
    const { pend } = this.publishFiles();
    for (const c of pend.maps) {
      if (c.action === 'delete') delete this.published.maps[c.id];
      else this.published.maps[c.id] = clone(c.doc);
    }
    if (pend.assets) this.published.assets = pend.assets === 'delete' ? null : clone(this.assetBundle);
    this.persist();
    this.emit('maps');
  }
}

export function isEmptyBundle(b) {
  return !b || ['props', 'customProps', 'tiles', 'customTiles', 'actors'].every(k => !b[k] || !Object.keys(b[k]).length);
}

export function normalizeBundle(b) {
  const out = { format: 'alien-wrangler-assets', version: 1 };
  for (const k of ['props', 'customProps', 'tiles', 'customTiles', 'actors']) {
    const src = (b && b[k]) || {};
    out[k] = Object.fromEntries(Object.keys(src).sort().map(id => [id, src[id]]));
  }
  return out;
}

// A doc as a file: readable, one ground row per line (so a diff of a map
// edit shows which rows changed).
export function formatDoc(doc) {
  const { ground, objects, paint, ...head } = doc;
  const lines = ['{'];
  const entries = Object.entries(head);
  for (const [k, v] of entries) lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  lines.push('  "ground": [');
  ground.forEach((row, i) => lines.push(`    ${JSON.stringify(row)}${i < ground.length - 1 ? ',' : ''}`));
  lines.push('  ],');
  lines.push('  "objects": [');
  objects.forEach((o, i) => lines.push(`    ${JSON.stringify(o)}${i < objects.length - 1 ? ',' : ''}`));
  lines.push('  ],');
  lines.push('  "paint": [');
  paint.forEach((o, i) => lines.push(`    ${JSON.stringify(o)}${i < paint.length - 1 ? ',' : ''}`));
  lines.push('  ]');
  lines.push('}');
  return lines.join('\n') + '\n';
}
