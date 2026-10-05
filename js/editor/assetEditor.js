// The asset editor (ASSETS mode): repaint any prop, ground tile or
// character sprite pixel by pixel, set a prop's collision box and flags,
// import / export PNGs, and make brand-new props and tiles. Every change
// goes into the working assets bundle (ws.assetBundle -> maps/assets.json
// when published) and into the live defs, so the maps update at once.
import { buildTiles, buildActors, buildVan, buildUfo, canvas, flipX, C, T, TILE } from '../data/sprites.js';
import {
  listAssets, getAsset, assetInfo, originalAsset, overrideAsset, revertAsset, isOverridden,
  registerCustomAsset, removeCustomAsset, registerCustomTile, removeCustomTile, customTiles,
  tileName, TILE_NAMES, CUSTOM_TILE_BASE,
} from '../data/assets.js';
import { TERRAIN, clearTexCache } from '../terrain.js';
import { ACTOR_SLOTS, getActorSprite, setActorSprite, decodePng } from '../edits.js';
import { h, clear, thumb, toast, formBox, confirmBox, download, pickFile, slug } from './dom.js';

const MIRROR_PAIRS = Object.fromEntries(['A', 'B', 'C', 'I', 'J', 'K'].map(k => [`png:house${k}`, `png:house${k}Flipped`]));
const BLEND_GROUPS = ['road', 'soil', 'grass', 'woods', 'forest'];
const ACTOR_NAMES = {
  'player.down': 'Agent (facing down)', 'player.up': 'Agent (facing up)', 'player.right': 'Agent (facing right; left is mirrored)',
  'player.proneR': 'Agent face-down after a missed dive', 'player.diveR': 'Agent mid-dive', van: 'The van', ufo: 'The UFO',
};
const actorName = (slot) => ACTOR_NAMES[slot] || slot.replace(/^alien\.(\w+)\.(\w+)$/, (_, t, d) => `${t[0].toUpperCase() + t.slice(1)} alien (facing ${d === 'right' ? 'right; left is mirrored' : d})`);

const copyCanvas = (img) => { const [c, x] = canvas(img.width, img.height); x.drawImage(img, 0, 0); return c; };
const pixels = (img) => { const c = img.getContext ? img : copyCanvas(img); return c.getContext('2d').getImageData(0, 0, c.width, c.height); };
function sameImage(a, b) {
  if (!a || !b || a.width !== b.width || a.height !== b.height) return false;
  const da = pixels(a).data, db = pixels(b).data;
  for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) return false;
  return true;
}
const hex2 = (n) => n.toString(16).padStart(2, '0');
const rgbaHex = (r, g, b) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;
const parseHex = (s) => { const m = /^#?([0-9a-f]{6})$/i.exec(s); if (!m) return null; const v = parseInt(m[1], 16); return [v >> 16, (v >> 8) & 255, v & 255]; };
const flipRectY = (r, hgt) => r && { x: r.x, y: hgt - r.y - r.h, w: r.w, h: r.h };

export class AssetEditor {
  constructor(root, ws, assets, hooks) {
    this.root = root;
    this.ws = ws;
    this.assets = assets;
    this.hooks = hooks;
    this.kind = 'prop';            // prop | tile | actor
    this.id = null;
    this.work = null;              // the canvas being edited
    this.meta = null;              // prop: { solid, jumpable, hide, tall }
    this.z = 8; this.px = 0; this.py = 0;
    this.toolId = 'pencil';
    this.color = [20, 16, 25, 255];
    this.mirror = false;
    this.grid = true;
    this.syncFlip = true;
    this.hist = new Map();         // key -> { past: [], future: [] }
    this.built = false;
    this.search = '';
    // pristine art, for Revert (the boot already applied edits over the live set)
    this.orig = { tiles: buildTiles(), actors: buildActors(), van: buildVan(), ufo: buildUfo() };
    if (assets.pngProps) {
      const t = assets.pngProps.tiles;
      Object.assign(this.orig.tiles, { [T.ROAD_PNG]: t.road, [T.CROSSWALK_H]: t.crosswalkH, [T.CROSSWALK_V]: t.crosswalkV,
        [T.LANE_H]: t.laneH, [T.LANE_V]: t.laneV, [T.MANHOLE]: t.manhole, [T.DRAIN]: t.drain });
    }
  }

  get bundle() { return this.ws.assetBundle; }

  /* ---------------- layout ---------------- */

  build() {
    if (this.built) return;
    this.built = true;
    const r = this.root;
    this.listEl = h('div.ae-list');
    this.tabsEl = h('div.ae-tabs', [['prop', 'PROPS'], ['tile', 'TILES'], ['actor', 'CHARACTERS']].map(([k, l]) => {
      const b = h('button', { type: 'button', onclick: () => { this.kind = k; this.renderList(); } }, l);
      b.dataset.k = k;
      return b;
    }));
    this.toolsEl = h('div.ae-tools');
    this.cv = h('canvas#ae-canvas');
    this.wrap = h('div.ae-canvas-wrap', this.cv);
    this.colorsEl = h('div.ae-colors');
    this.sideEl = h('div.ae-side');
    r.append(h('div.ae-browser', this.tabsEl, this.listEl), h('div.ae-center', this.toolsEl, this.wrap, this.colorsEl), this.sideEl);
    this.ctx = this.cv.getContext('2d');
    new ResizeObserver(() => this.resize()).observe(this.wrap);
    document.addEventListener('keyup', (e) => { if (e.key === ' ') this.space = false; });
    this.bindPointer();
    this.renderTools();
    this.renderColors();
  }

  show() {
    this.build();
    this.renderList();
    if (!this.id) this.open('prop', 'tree');
    else { this.resize(); this.renderSide(); }
  }

  /* ---------------- the list ---------------- */

  renderList() {
    for (const b of this.tabsEl.children) b.classList.toggle('on', b.dataset.k === this.kind);
    const L = clear(this.listEl);
    if (this.kind === 'prop') {
      const s = h('input.search', { type: 'search', placeholder: 'Search props…', value: this.search });
      s.addEventListener('input', () => { this.search = s.value; draw(); });
      const body = h('div');
      L.append(h('div.btn-row', h('button.btn.small.primary', { type: 'button', onclick: () => this.newProp() }, '+ NEW PROP')), s, body);
      const draw = () => {
        clear(body);
        const q = this.search.trim().toLowerCase();
        const groups = new Map();
        for (const a of listAssets()) {
          if (q && !a.name.toLowerCase().includes(q) && !a.id.includes(q)) continue;
          if (!groups.has(a.group)) groups.set(a.group, []);
          groups.get(a.group).push(a);
        }
        for (const [g, items] of groups) {
          body.append(h('div.group-title', g));
          body.append(h('div.assets-grid', items.map(a => this.card(thumb(getAsset(a.id).img, 52, 44), a.name, this.id === a.id && this.kind === 'prop',
            isOverridden(a.id) || a.kind === 'custom', () => this.open('prop', a.id)))));
        }
      };
      draw();
    } else if (this.kind === 'tile') {
      L.append(h('div.btn-row', h('button.btn.small.primary', { type: 'button', onclick: () => this.newTile() }, '+ NEW TILE')),
        h('div.assets-grid', Object.keys(TILE_NAMES).map(Number).filter(id => this.assets.tiles[id]).sort((a, b) => a - b).map(id =>
          this.card(thumb(this.assets.tiles[id], 52, 44), `${tileName(id)}`, this.kind === 'tile' && this.id === id,
            !!(this.bundle.tiles[id] || this.bundle.customTiles[id]), () => this.open('tile', id)))));
    } else {
      L.append(h('p.hint', 'The agent, the aliens, the van and the UFO. Sizes are fixed (the game lines them up by size).'),
        h('div.assets-grid', ACTOR_SLOTS.map(slot => this.card(thumb(getActorSprite(this.assets, slot), 52, 44), actorName(slot),
          this.kind === 'actor' && this.id === slot, !!this.bundle.actors[slot], () => this.open('actor', slot)))));
    }
  }

  card(img, name, on, mod, onClick) {
    return h(`button.asset-card${on ? '.on' : ''}${mod ? '.mod' : ''}`, { type: 'button', title: name, onclick: onClick }, img, h('span.nm', name));
  }

  /* ---------------- opening an asset ---------------- */

  open(kind, id) {
    this.build();
    this.kind = kind;
    this.id = id;
    let img;
    if (kind === 'prop') {
      const def = getAsset(id);
      if (!def) { toast(`No asset ${id}`, 'err'); return; }
      img = def.img;
      this.meta = { solid: def.solid ? { ...def.solid } : null, jumpable: !!def.jumpable, hide: !!def.hide, tall: !!def.tall };
    } else if (kind === 'tile') {
      img = this.assets.tiles[id];
      this.meta = null;
    } else {
      img = getActorSprite(this.assets, id);
      this.meta = null;
    }
    this.work = copyCanvas(img);
    if (this.toolId === 'box' && kind !== 'prop') this.toolId = 'pencil';
    this.userZoomed = false;
    this.fit();
    this.renderList();
    this.renderTools();
    this.renderColors();
    this.renderSide();
  }

  histKey() { return `${this.kind}:${this.id}`; }
  history() {
    const k = this.histKey();
    if (!this.hist.has(k)) this.hist.set(k, { past: [], future: [] });
    return this.hist.get(k);
  }
  snap() { return { img: copyCanvas(this.work), meta: this.meta ? JSON.parse(JSON.stringify(this.meta)) : null }; }
  pushUndo() {
    const hst = this.history();
    hst.past.push(this.snap());
    if (hst.past.length > 100) hst.past.shift();
    hst.future.length = 0;
  }
  undo() {
    const hst = this.history();
    if (!hst.past.length) { toast('Nothing to undo'); return; }
    hst.future.push(this.snap());
    const s = hst.past.pop();
    this.work = s.img; this.meta = s.meta;
    this.commit();
  }
  redo() {
    const hst = this.history();
    if (!hst.future.length) { toast('Nothing to redo'); return; }
    hst.past.push(this.snap());
    const s = hst.future.pop();
    this.work = s.img; this.meta = s.meta;
    this.commit();
  }

  // Write the working copy into the live asset + the bundle.
  commit() {
    const B = this.bundle, id = this.id;
    if (this.kind === 'prop') {
      const custom = id.startsWith('custom:');
      const meta = this.meta;
      if (custom) {
        const prev = B.customProps[id] || {};
        B.customProps[id] = { name: prev.name || assetInfo(id).name, png: this.work.toDataURL(), ...meta };
        registerCustomAsset(id, { img: copyCanvas(this.work), ...meta }, B.customProps[id].name);
      } else {
        const o = originalAsset(id);
        const origMeta = { solid: o.solid ? { ...o.solid } : null, jumpable: !!o.jumpable, hide: !!o.hide, tall: !!o.tall };
        const pxChanged = !sameImage(this.work, o.img);
        const metaChanged = JSON.stringify(meta) !== JSON.stringify(origMeta);
        if (!pxChanged && !metaChanged) { delete B.props[id]; revertAsset(id); }
        else {
          const entry = { ...meta };
          if (pxChanged) entry.png = this.work.toDataURL();
          B.props[id] = entry;
          if (!pxChanged) revertAsset(id);
          overrideAsset(id, { img: pxChanged ? copyCanvas(this.work) : o.img, ...meta });
        }
        // the facing-up twin of a Maple Street house follows it
        const twin = MIRROR_PAIRS[id];
        if (twin && this.syncFlip && getAsset(twin)) {
          const flipped = flipCanvasY(this.work);
          const to = originalAsset(twin);
          const tMeta = { solid: flipRectY(meta.solid, this.work.height), jumpable: meta.jumpable, hide: meta.hide, tall: meta.tall };
          if (!pxChanged && !metaChanged) { delete B.props[twin]; revertAsset(twin); }
          else {
            B.props[twin] = { ...tMeta, ...(pxChanged ? { png: flipped.toDataURL() } : {}) };
            if (!pxChanged) revertAsset(twin);
            overrideAsset(twin, { img: pxChanged ? flipped : to.img, ...tMeta, windows: (getAsset(id).windows || []).map(w => flipRectY(w, this.work.height)) });
          }
        }
      }
    } else if (this.kind === 'tile') {
      if (id >= CUSTOM_TILE_BASE) {
        const prev = B.customTiles[id] || {};
        B.customTiles[id] = { ...prev, png: this.work.toDataURL() };
      } else if (sameImage(this.work, this.orig.tiles[id])) delete B.tiles[id];
      else B.tiles[id] = { png: this.work.toDataURL() };
      this.assets.tiles[id] = copyCanvas(this.work);
      clearTexCache(this.assets.tiles);
    } else {
      const o = getActorSlotOrig(this.orig, id);
      if (sameImage(this.work, o)) delete B.actors[id];
      else B.actors[id] = this.work.toDataURL();
      setActorSprite(this.assets, id, copyCanvas(this.work));
    }
    this.ws.assetsChanged();
    this.hooks.changed();
    this.draw();
    this.renderSide();
    this.refreshCard();
  }

  refreshCard() {
    // cheap: re-render the list's thumbnails only when it's showing this kind
    clearTimeout(this.listT);
    this.listT = setTimeout(() => this.renderList(), 150);
  }

  async revert() {
    if (!await confirmBox('Revert this asset?', 'Back to how it looks in the game’s code (every change to it goes).', 'Revert', true)) return;
    this.pushUndo();
    if (this.kind === 'prop') {
      const o = originalAsset(this.id);
      this.work = copyCanvas(o.img);
      this.meta = { solid: o.solid ? { ...o.solid } : null, jumpable: !!o.jumpable, hide: !!o.hide, tall: !!o.tall };
    } else if (this.kind === 'tile') this.work = copyCanvas(this.orig.tiles[this.id]);
    else this.work = copyCanvas(getActorSlotOrig(this.orig, this.id));
    this.commit();
    this.fit();
  }

  /* ---------------- new assets ---------------- */

  async newProp() {
    const cur = this.kind === 'prop' && this.id ? getAsset(this.id) : null;
    const v = await formBox('NEW PROP', [
      { key: 'name', label: 'Name', value: 'My prop' },
      { key: 'start', label: 'Start from', type: 'select', value: cur ? 'copy' : 'blank', options: [
        { value: 'blank', label: 'A blank canvas' }, ...(cur ? [{ value: 'copy', label: `A copy of ${assetInfo(this.id).name}` }] : []),
        { value: 'png', label: 'A PNG file…' }] },
      { key: 'w', label: 'Width', type: 'number', value: cur ? cur.img.width : 24, min: 1, max: 512, help: 'Blank canvas only. Pixels: a bush is 20 wide, a tree 30, a house 64.' },
      { key: 'h', label: 'Height', type: 'number', value: cur ? cur.img.height : 24, min: 1, max: 512 },
    ], 'CREATE', 'A new prop you can place on any map. It’s saved with your assets and published with them.', (x) => (slug(x.name) ? null : 'Give it a name'));
    if (!v) return;
    let img;
    if (v.start === 'png') {
      const [f] = await pickFile('image/png,image/*');
      if (!f) return;
      try { img = await fileToCanvas(f); } catch (e) { toast(e.message, 'err', 5000); return; }
    } else if (v.start === 'copy' && cur) img = copyCanvas(cur.img);
    else img = canvas(Math.max(1, Math.min(512, Math.round(v.w))), Math.max(1, Math.min(512, Math.round(v.h))))[0];
    let id = `custom:${slug(v.name)}`;
    while (getAsset(id)) id = `custom:${slug(v.name)}-${1 + Math.floor(Math.random() * 999)}`;
    const meta = cur && v.start === 'copy'
      ? { solid: cur.solid ? { ...cur.solid } : null, jumpable: !!cur.jumpable, hide: !!cur.hide, tall: !!cur.tall }
      : { solid: { x: 1, y: Math.max(0, img.height - Math.ceil(img.height / 3)), w: Math.max(1, img.width - 2), h: Math.max(1, Math.ceil(img.height / 3) - 1) }, jumpable: false, hide: false, tall: true };
    this.bundle.customProps[id] = { name: v.name.trim(), png: img.toDataURL(), ...meta };
    registerCustomAsset(id, { img, ...meta }, v.name.trim());
    this.ws.assetsChanged();
    this.hooks.changed();
    this.kind = 'prop';
    this.open('prop', id);
    toast(`Made ${v.name.trim()}. Paint it, set its collision box, then PLACE ON MAP.`, 'ok', 4000);
  }

  async newTile() {
    const cur = this.kind === 'tile' && this.id !== null ? this.id : T.GRASS;
    const v = await formBox('NEW GROUND TILE', [
      { key: 'name', label: 'Name', value: 'My tile' },
      { key: 'start', label: 'Start from', type: 'select', value: 'copy', options: [{ value: 'copy', label: `A copy of ${tileName(cur)}` }, { value: 'blank', label: 'A blank tile' }, { value: 'png', label: 'A 16×16 PNG…' }] },
      { key: 'blend', label: 'Soft edges', type: 'select', value: '', options: [{ value: '', label: 'No (hard edges)' }, ...BLEND_GROUPS.map(g => ({ value: g, label: `Blend like ${g}` }))] },
    ], 'CREATE', 'A 16×16 ground tile you can paint on any map.', (x) => (x.name.trim() ? null : 'Give it a name'));
    if (!v) return;
    let img;
    if (v.start === 'png') {
      const [f] = await pickFile('image/png,image/*');
      if (!f) return;
      try { img = fitTo(await fileToCanvas(f), TILE, TILE); } catch (e) { toast(e.message, 'err', 5000); return; }
    } else if (v.start === 'copy') img = copyCanvas(this.assets.tiles[cur]);
    else { img = canvas(TILE, TILE)[0]; const x = img.getContext('2d'); x.fillStyle = '#4a9a42'; x.fillRect(0, 0, TILE, TILE); }
    let id = CUSTOM_TILE_BASE;
    while (this.assets.tiles[id] || this.bundle.customTiles[id]) id++;
    const blend = v.blend ? { group: v.blend, pri: { road: 0, soil: 1, grass: 2, woods: 2.5, forest: 3 }[v.blend] } : null;
    this.bundle.customTiles[id] = { name: v.name.trim(), png: img.toDataURL(), blend };
    this.assets.tiles[id] = img;
    registerCustomTile(id, v.name.trim());
    if (blend) TERRAIN[id] = blend;
    clearTexCache(this.assets.tiles);
    this.ws.assetsChanged();
    this.hooks.changed();
    this.open('tile', id);
  }

  async deleteCustom() {
    const used = this.usage();
    if (!await confirmBox('Delete this asset?', used ? `It’s used on ${used}. Those spots will show as missing until you replace them.` : 'It isn’t used on any map.', 'Delete', true)) return;
    if (this.kind === 'prop') {
      delete this.bundle.customProps[this.id];
      removeCustomAsset(this.id);
    } else {
      delete this.bundle.customTiles[this.id];
      delete this.assets.tiles[this.id];
      delete TERRAIN[this.id];
      removeCustomTile(this.id);
      clearTexCache(this.assets.tiles);
    }
    this.ws.assetsChanged();
    this.hooks.changed();
    this.id = null;
    this.open(this.kind === 'prop' ? 'prop' : 'tile', this.kind === 'prop' ? 'tree' : T.GRASS);
  }

  // "3 maps" (how many maps use the open asset)
  usage() {
    let n = 0;
    for (const id of this.ws.mapIds()) {
      const d = this.ws.doc(id);
      if (!d) continue;
      const hit = d.strip ? this.kind === 'prop' && [...d.station, ...d.clearing].some(q => q.a === this.id)
        : this.kind === 'prop' ? d.objects.some(o => o.t === 'prop' && o.a === this.id) : d.ground.some(r => r.includes(this.id));
      if (hit) n++;
    }
    return n ? `${n} map${n > 1 ? 's' : ''}` : '';
  }

  async importPng() {
    const [f] = await pickFile('image/png,image/*');
    if (!f) return;
    let img;
    try { img = await fileToCanvas(f); } catch (e) { toast(e.message, 'err', 5000); return; }
    const want = this.kind === 'tile' ? [TILE, TILE] : this.kind === 'actor' ? [this.work.width, this.work.height] : null;
    if (want && (img.width !== want[0] || img.height !== want[1])) {
      toast(`That PNG is ${img.width}\u00D7${img.height}; this one has to be ${want[0]}\u00D7${want[1]}, so it was cropped / padded from the top-left`, 'warn', 5000);
      img = fitTo(img, want[0], want[1]);
    }
    this.pushUndo();
    if (this.kind === 'prop' && this.meta.solid) {
      // keep the collision box where it was relative to the base
      const dy = img.height - this.work.height;
      this.meta.solid.y = Math.max(0, this.meta.solid.y + dy);
      this.meta.solid.w = Math.min(this.meta.solid.w, img.width);
    }
    this.work = img;
    this.commit();
    this.fit();
  }

  exportPng() {
    const name = this.kind === 'prop' ? this.id.replace(':', '-') : this.kind === 'tile' ? `tile-${this.id}` : this.id;
    this.work.toBlob((b) => download(`${name}.png`, b));
  }

  resizeCanvas(w, hh, anchor) {
    w = Math.max(1, Math.min(512, Math.round(w))); hh = Math.max(1, Math.min(512, Math.round(hh)));
    if (w === this.work.width && hh === this.work.height) return;
    this.pushUndo();
    const ax = anchor.includes('l') ? 0 : anchor.includes('r') ? 1 : 0.5;
    const ay = anchor.includes('t') ? 0 : anchor.includes('b') ? 1 : 0.5;
    const dx = Math.round((w - this.work.width) * ax), dy = Math.round((hh - this.work.height) * ay);
    const [c, x] = canvas(w, hh);
    x.drawImage(this.work, dx, dy);
    this.work = c;
    if (this.meta && this.meta.solid) { this.meta.solid.x += dx; this.meta.solid.y += dy; }
    this.commit();
    this.fit();
  }

  /* ---------------- tools + colours ---------------- */

  renderTools() {
    const T2 = [
      ['pencil', '✏', 'PEN', 'b', 'Draw pixels (right-click erases)'],
      ['eraser', '⬜', 'ERASE', 'e', 'Clear pixels to transparent'],
      ['fill', '\u{1FAA3}', 'FILL', 'g', 'Fill the patch of one colour'],
      ['pick', '\u{1F489}', 'PICK', 'i', 'Pick up a colour'],
      ['line', '╱', 'LINE', 'l', 'Drag a straight line'],
      ['rect', '▭', 'BOX', 'r', 'Drag a box outline (Shift: filled)'],
      ['move', '✥', 'SHIFT', 'm', 'Drag to shift the whole picture (tiles wrap round)'],
    ];
    if (this.kind === 'prop') T2.push(['box', '\u{1F9F1}', 'BLOCK', 'c', 'Drag to set the collision box (the part the agent bumps into)']);
    const el = clear(this.toolsEl);
    for (const [id, ico, label, key, tip] of T2) {
      el.append(h(`button.tool-btn${this.toolId === id ? '.on' : ''}`, { type: 'button', title: `${tip} (${key.toUpperCase()})`, onclick: () => { this.toolId = id; this.renderTools(); } },
        h('span.ico', ico), label));
    }
    el.append(h('span.sep'));
    const tog = (label, on, fn, tip) => h(`button.tool-btn${on ? '.on' : ''}`, { type: 'button', title: tip, onclick: fn }, h('span.ico', label[0]), label.slice(2));
    el.append(tog('↔ MIRROR', this.mirror, () => { this.mirror = !this.mirror; this.renderTools(); }, 'Draw on both halves at once'));
    el.append(tog('# GRID', this.grid, () => { this.grid = !this.grid; this.renderTools(); this.draw(); }, 'Pixel grid'));
    el.append(h('span.sep'));
    el.append(h('button.tool-btn', { type: 'button', title: 'Flip left-right', onclick: () => this.transform('h') }, h('span.ico', '⇆'), 'FLIP'));
    el.append(h('button.tool-btn', { type: 'button', title: 'Flip upside down', onclick: () => this.transform('v') }, h('span.ico', '⇅'), 'FLIP'));
    el.append(h('span.sep'));
    el.append(h('button.tool-btn', { type: 'button', title: 'Zoom in', onclick: () => this.zoom(1) }, h('span.ico', '+'), 'ZOOM'));
    el.append(h('button.tool-btn', { type: 'button', title: 'Zoom out', onclick: () => this.zoom(-1) }, h('span.ico', '−'), 'ZOOM'));
    el.append(h('button.tool-btn', { type: 'button', title: 'Fit', onclick: () => this.fit() }, h('span.ico', '▣'), 'FIT'));
  }

  renderColors() {
    const el = clear(this.colorsEl);
    const [r, g, b, a] = this.color;
    const cur = h('div.ae-cur', { style: { background: a ? `rgba(${r},${g},${b},${a / 255})` : 'transparent' }, title: 'Current colour' });
    const inp = h('input', { type: 'color', value: rgbaHex(r, g, b), title: 'Choose any colour' });
    inp.addEventListener('input', () => { const c = parseHex(inp.value); this.color = [...c, 255]; this.renderColors(); });
    const hex = h('input', { type: 'text', value: rgbaHex(r, g, b), style: { width: '78px', fontFamily: 'var(--mono)' } });
    hex.addEventListener('change', () => { const c = parseHex(hex.value.trim()); if (c) { this.color = [...c, 255]; this.renderColors(); } });
    const swatch = (col, on) => {
      const c = parseHex(col);
      return h(`button${on ? '.on' : ''}`, { type: 'button', title: col, style: { background: col }, onclick: () => { this.color = [...c, 255]; this.renderColors(); } });
    };
    const curHex = rgbaHex(r, g, b);
    const game = [...new Set(Object.values(C))];
    const used = this.work ? usedColors(this.work, 40) : [];
    el.append(cur, inp, hex,
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0, flex: 1 } },
        h('div.ae-pal', h('button.clear', { type: 'button', title: 'Transparent (erase)', onclick: () => { this.color = [0, 0, 0, 0]; this.renderColors(); } }),
          used.map(c => swatch(c, a && c === curHex))),
        h('div.ae-pal', { title: 'The game’s material palette' }, game.map(c => swatch(c, a && c === curHex)))));
  }

  zoom(d) {
    this.userZoomed = true;
    const r = this.wrap.getBoundingClientRect();
    const cx = r.width / 2, cy = r.height / 2;
    const wx = (cx - this.px) / this.z, wy = (cy - this.py) / this.z;
    this.z = Math.max(1, Math.min(48, d > 0 ? this.z + Math.max(1, Math.round(this.z * 0.25)) : this.z - Math.max(1, Math.round(this.z * 0.2))));
    this.px = cx - wx * this.z; this.py = cy - wy * this.z;
    this.draw();
  }

  fit() {
    if (!this.work) return;
    const r = this.wrap.getBoundingClientRect();
    const pad = 40;
    this.z = Math.max(1, Math.min(48, Math.floor(Math.min((r.width - pad) / this.work.width, (r.height - pad) / this.work.height))));
    this.px = Math.round((r.width - this.work.width * this.z) / 2);
    this.py = Math.round((r.height - this.work.height * this.z) / 2);
    this.draw();
  }

  resize() {
    if (!this.cv) return;
    const r = this.wrap.getBoundingClientRect();
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.cv.width = Math.max(1, Math.round(r.width * this.dpr));
    this.cv.height = Math.max(1, Math.round(r.height * this.dpr));
    // keep the picture fitted to the canvas until you zoom it yourself
    if (!this.userZoomed && r.width > 50) this.fit();
    else this.draw();
  }

  transform(dir) {
    this.pushUndo();
    const [c, x] = canvas(this.work.width, this.work.height);
    if (dir === 'h') { x.translate(this.work.width, 0); x.scale(-1, 1); } else { x.translate(0, this.work.height); x.scale(1, -1); }
    x.drawImage(this.work, 0, 0);
    this.work = c;
    if (this.meta && this.meta.solid) {
      const s = this.meta.solid;
      if (dir === 'h') s.x = this.work.width - s.x - s.w; else s.y = this.work.height - s.y - s.h;
    }
    this.commit();
  }

  /* ---------------- drawing the editing canvas ---------------- */

  draw() {
    if (!this.cv || !this.work) return;
    const x = this.ctx, k = this.dpr || 1;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, this.cv.width, this.cv.height);
    x.setTransform(k, 0, 0, k, 0, 0);
    x.imageSmoothingEnabled = false;
    const W = this.work.width, H = this.work.height, z = this.z;
    // the canvas area (a darker frame round the picture)
    x.fillStyle = 'rgba(0,0,0,0.25)';
    x.fillRect(this.px - 1, this.py - 1, W * z + 2, H * z + 2);
    if (this.kind === 'tile') {
      // neighbours, faded, so seams show
      x.globalAlpha = 0.35;
      for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) x.drawImage(this.work, this.px + dx * W * z, this.py + dy * H * z, W * z, H * z);
      x.globalAlpha = 1;
    }
    x.drawImage(this.work, this.px, this.py, W * z, H * z);
    if (this.grid && z >= 6) {
      x.strokeStyle = 'rgba(255,255,255,0.08)';
      x.lineWidth = 1;
      x.beginPath();
      for (let i = 0; i <= W; i++) { x.moveTo(this.px + i * z + 0.5, this.py); x.lineTo(this.px + i * z + 0.5, this.py + H * z); }
      for (let j = 0; j <= H; j++) { x.moveTo(this.px, this.py + j * z + 0.5); x.lineTo(this.px + W * z, this.py + j * z + 0.5); }
      x.stroke();
    }
    x.strokeStyle = 'rgba(110,194,255,0.6)';
    x.strokeRect(this.px - 0.5, this.py - 0.5, W * z + 1, H * z + 1);
    if (this.kind === 'prop' && this.meta) {
      const s = this.meta.solid;
      if (s) {
        x.fillStyle = this.meta.jumpable ? 'rgba(255,215,94,0.18)' : 'rgba(255,94,108,0.2)';
        x.strokeStyle = this.meta.jumpable ? '#ffd75e' : '#ff5e6c';
        x.lineWidth = 2;
        x.fillRect(this.px + s.x * z, this.py + s.y * z, s.w * z, s.h * z);
        x.strokeRect(this.px + s.x * z, this.py + s.y * z, s.w * z, s.h * z);
        x.lineWidth = 1;
      }
      if (this.meta.hide) {
        const cx = W / 2, cy = s ? s.y + s.h / 2 : H / 2;
        x.fillStyle = (!s || this.meta.jumpable) ? '#59d98c' : '#ffb35e';
        x.beginPath(); x.arc(this.px + cx * z, this.py + cy * z, Math.max(4, Math.min(10, z * 0.6)), 0, Math.PI * 2); x.fill();
      }
      // base line: where the prop meets the ground (y-sorting)
      x.strokeStyle = 'rgba(65,240,216,0.7)';
      x.setLineDash([4, 3]);
      x.beginPath(); x.moveTo(this.px - 10, this.py + H * z + 0.5); x.lineTo(this.px + W * z + 10, this.py + H * z + 0.5); x.stroke();
      x.setLineDash([]);
    }
    if (this.preview) this.preview();
  }

  /* ---------------- pointer ---------------- */

  cell(e) {
    const r = this.cv.getBoundingClientRect();
    return { x: Math.floor((e.clientX - r.left - this.px) / this.z), y: Math.floor((e.clientY - r.top - this.py) / this.z),
      fx: (e.clientX - r.left - this.px) / this.z, fy: (e.clientY - r.top - this.py) / this.z };
  }

  bindPointer() {
    const cv = this.cv;
    const ptrs = new Map();
    let st = null;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      if (!this.work) return;
      cv.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) {
        if (st && st.changed) { this.commit(); }
        const [a, b] = [...ptrs.values()];
        st = { pinch: true, d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        return;
      }
      if (e.button === 1 || this.space) { st = { pan: true, x: e.clientX, y: e.clientY }; return; }
      const c = this.cell(e);
      const tool = e.button === 2 && this.toolId === 'pencil' ? 'eraser' : this.toolId;
      st = { tool, start: c, last: c, shift: e.shiftKey, changed: false };
      if (tool === 'pick') { this.pickColor(c); st = null; return; }
      this.pushUndo();
      st.base = copyCanvas(this.work);
      if (tool === 'pencil' || tool === 'eraser') { this.plot(c.x, c.y, tool === 'eraser'); st.changed = true; }
      else if (tool === 'fill') { this.flood(c.x, c.y); st.changed = true; }
      else if (tool === 'box') { st.box = true; }
      this.draw();
    });
    cv.addEventListener('pointermove', (e) => {
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!st) return;
      if (st.pinch && ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        this.px += cx - st.cx; this.py += cy - st.cy;
        if (d / st.d > 1.25 || d / st.d < 0.8) { this.zoom(d > st.d ? 1 : -1); st.d = d; }
        st.cx = cx; st.cy = cy;
        this.draw();
        return;
      }
      if (st.pan) { this.px += e.clientX - st.x; this.py += e.clientY - st.y; st.x = e.clientX; st.y = e.clientY; this.draw(); return; }
      const c = this.cell(e);
      if (st.tool === 'pencil' || st.tool === 'eraser') {
        line(st.last.x, st.last.y, c.x, c.y, (x, y) => this.plot(x, y, st.tool === 'eraser'));
        st.last = c; st.changed = true;
        this.draw();
      } else if (st.tool === 'line' || st.tool === 'rect') {
        this.work = copyCanvas(st.base);
        if (st.tool === 'line') line(st.start.x, st.start.y, c.x, c.y, (x, y) => this.plot(x, y, false));
        else rectCells(st.start, c, e.shiftKey || st.shift, (x, y) => this.plot(x, y, false));
        st.changed = true;
        this.draw();
      } else if (st.tool === 'move') {
        const dx = c.x - st.start.x, dy = c.y - st.start.y;
        this.work = shifted(st.base, dx, dy, this.kind === 'tile');
        st.dx = dx; st.dy = dy; st.changed = dx || dy;
        this.draw();
      } else if (st.tool === 'box') {
        const x0 = Math.max(0, Math.min(st.start.x, c.x)), y0 = Math.max(0, Math.min(st.start.y, c.y));
        const x1 = Math.min(this.work.width, Math.max(st.start.x, c.x) + 1), y1 = Math.min(this.work.height, Math.max(st.start.y, c.y) + 1);
        this.meta.solid = { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
        st.changed = true;
        this.draw();
      }
    });
    const end = (e) => {
      ptrs.delete(e.pointerId);
      if (!st) return;
      if (st.pinch) { if (!ptrs.size) st = null; return; }
      const s = st;
      st = null;
      if (s.pan) return;
      if (s.tool === 'move' && s.changed && this.meta && this.meta.solid && this.kind === 'prop') { /* the box stays put: it's the footprint */ }
      if (s.changed) this.commit();
      else this.history().past.pop();
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || Math.abs(e.deltaY) >= 30) this.zoom(e.deltaY < 0 ? 1 : -1);
      else { this.px -= e.deltaX; this.py -= e.deltaY; this.draw(); }
    }, { passive: false });
  }

  plot(x, y, erase) {
    const W = this.work.width, H = this.work.height;
    const g = this.work.getContext('2d');
    const put = (px, py) => {
      if (px < 0 || py < 0 || px >= W || py >= H) return;
      g.clearRect(px, py, 1, 1);
      if (!erase && this.color[3]) { g.fillStyle = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${this.color[3] / 255})`; g.fillRect(px, py, 1, 1); }
    };
    put(x, y);
    if (this.mirror) put(W - 1 - x, y);
  }

  flood(x, y) {
    const W = this.work.width, H = this.work.height;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const g = this.work.getContext('2d');
    const img = g.getImageData(0, 0, W, H), d = img.data;
    const at = (i) => (d[i] << 24 | d[i + 1] << 16 | d[i + 2] << 8 | d[i + 3]) >>> 0;
    const from = at((y * W + x) * 4);
    const [r, gg, b, a] = this.color;
    const to = (r << 24 | gg << 16 | b << 8 | a) >>> 0;
    if (from === to) return;
    const stack = [[x, y]];
    while (stack.length) {
      const [px, py] = stack.pop();
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const i = (py * W + px) * 4;
      if (at(i) !== from) continue;
      d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = a;
      stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
    }
    g.putImageData(img, 0, 0);
  }

  pickColor(c) {
    if (c.x < 0 || c.y < 0 || c.x >= this.work.width || c.y >= this.work.height) return;
    const p = this.work.getContext('2d').getImageData(c.x, c.y, 1, 1).data;
    this.color = [p[0], p[1], p[2], p[3]];
    this.renderColors();
    this.toolId = 'pencil';
    this.renderTools();
  }

  /* ---------------- side panel ---------------- */

  renderSide() {
    const el = clear(this.sideEl);
    if (!this.work) return;
    const W = this.work.width, H = this.work.height;
    let title, sub, note = null;
    if (this.kind === 'prop') { const i = assetInfo(this.id); title = i ? i.name : this.id; sub = this.id; }
    else if (this.kind === 'tile') { title = tileName(this.id); sub = `ground tile #${this.id}`; }
    else { title = actorName(this.id); sub = this.id; note = 'Fixed size: the game positions characters by their size.'; }
    el.append(h('div.sec-title', title.toUpperCase(), h('span.sub', sub)));

    // preview on the ground, at game sizes
    const prev = h('div.ae-preview');
    const grass = this.assets.tiles[T.GRASS];
    for (const s of [1, 2, 3]) {
      const pw = this.kind === 'tile' ? TILE * 3 : W + 16, ph = this.kind === 'tile' ? TILE * 3 : H + 12;
      const [c, x] = canvas(pw, ph);
      for (let ty = 0; ty < ph; ty += TILE) for (let tx = 0; tx < pw; tx += TILE) x.drawImage(this.kind === 'tile' ? this.work : grass, tx, ty);
      if (this.kind !== 'tile') x.drawImage(this.work, 8, 6);
      c.style.width = `${pw * s}px`; c.style.height = `${ph * s}px`;
      prev.append(c);
    }
    el.append(prev);
    if (note) el.append(h('p.hint', note));

    const changed = this.kind === 'prop' ? (isOverridden(this.id) || this.id.startsWith('custom:')) : this.kind === 'tile' ? !!(this.bundle.tiles[this.id] || this.bundle.customTiles[this.id]) : !!this.bundle.actors[this.id];
    el.append(h('div.note-box', changed ? h('span', { style: { color: '#ffd75e' } }, this.id.toString().startsWith('custom:') || this.id >= CUSTOM_TILE_BASE ? 'Made in the editor. ' : 'Changed from the original. ')
      : 'As drawn in the game’s code. ', 'Changes save as you go and show on every map straight away.'));

    if (this.kind === 'prop') {
      const m = this.meta;
      const num = (label, v, set, o = {}) => {
        const i = h('input', { type: 'number', value: v, min: o.min ?? 0, max: o.max });
        i.addEventListener('change', () => { this.pushUndo(); set(Math.round(+i.value)); this.commit(); });
        return h('div.field', h('div.k', label), h('div.v', i));
      };
      const flag = (label, v, set, sm) => {
        const i = h('input', { type: 'checkbox', checked: !!v });
        i.addEventListener('change', () => { this.pushUndo(); set(i.checked); this.commit(); });
        return h('label.check', i, h('span', label, sm ? h('small', sm) : null));
      };
      el.append(h('div.sec-title', { style: { marginTop: '10px' } }, 'HOW IT PLAYS'),
        flag('Has a collision box', !!m.solid, (v) => { m.solid = v ? { x: 0, y: Math.floor(H * 0.6), w: W, h: H - Math.floor(H * 0.6) } : null; }, 'The agent and aliens bump into it (red box; drag one with BLOCK)'));
      if (m.solid) {
        el.append(h('div.field', h('div.k', 'Box'), h('div.v',
          ...['x', 'y', 'w', 'h'].map(k => { const i = h('input', { type: 'number', value: m.solid[k], min: k === 'w' || k === 'h' ? 1 : -64, style: { width: '56px' }, title: k });
            i.addEventListener('change', () => { this.pushUndo(); m.solid[k] = Math.round(+i.value); this.commit(); }); return i; }))));
        el.append(flag('Hop over', m.jumpable, (v) => { m.jumpable = v; }, 'Low enough to jump (fences, bales, crates)'));
      }
      el.append(flag('Aliens hide in it', m.hide, (v) => { m.hide = v; }, 'Every copy of it on a map is a hiding spot (green dot)'),
        flag('Tall', m.tall, (v) => { m.tall = v; }, 'Drawn over the agent when they walk behind it'));
      if (MIRROR_PAIRS[this.id]) {
        const i = h('input', { type: 'checkbox', checked: this.syncFlip });
        i.addEventListener('change', () => { this.syncFlip = i.checked; });
        el.append(h('label.check', i, h('span', 'Update the facing-up copy too', h('small', 'The houses across the street use a flipped copy of this one'))));
      }
      // size
      const wI = h('input', { type: 'number', value: W, min: 1, max: 512 }), hI = h('input', { type: 'number', value: H, min: 1, max: 512 });
      const anc = h('select', [['bc', 'keep the base (bottom middle)'], ['tl', 'top-left'], ['mc', 'centre'], ['bl', 'bottom-left'], ['br', 'bottom-right']].map(([v, l]) => h('option', { value: v }, l)));
      el.append(h('div.sec-title', { style: { marginTop: '10px' } }, 'CANVAS SIZE', h('span.sub', `${W}×${H}px`)),
        h('div.field', h('div.k', 'Size'), h('div.v', wI, h('span.xy', '×'), hI)),
        h('div.field', h('div.k', 'Anchor'), h('div.v', anc)),
        h('button.btn.small', { type: 'button', onclick: () => this.resizeCanvas(+wI.value, +hI.value, anc.value) }, 'RESIZE'));
    }
    if (this.kind === 'tile' && this.id >= CUSTOM_TILE_BASE) {
      const t = this.bundle.customTiles[this.id] || {};
      const nameI = h('input', { type: 'text', value: t.name || '' });
      nameI.addEventListener('change', () => { t.name = nameI.value.trim() || t.name; registerCustomTile(this.id, t.name); this.ws.assetsChanged(); this.renderList(); });
      const bl = h('select', [['', 'No (hard edges)'], ...BLEND_GROUPS.map(g => [g, `Blend like ${g}`])].map(([v, l]) => h('option', { value: v, selected: (t.blend ? t.blend.group : '') === v }, l)));
      bl.addEventListener('change', () => {
        t.blend = bl.value ? { group: bl.value, pri: { road: 0, soil: 1, grass: 2, woods: 2.5, forest: 3 }[bl.value] } : null;
        if (t.blend) TERRAIN[this.id] = t.blend; else delete TERRAIN[this.id];
        clearTexCache(this.assets.tiles);
        this.ws.assetsChanged(); this.hooks.changed();
      });
      el.append(h('div.field', h('div.k', 'Name'), h('div.v', nameI)), h('div.field', h('div.k', 'Soft edges'), h('div.v', bl)));
    }
    if (this.kind === 'prop' && this.id.startsWith('custom:')) {
      const t = this.bundle.customProps[this.id] || {};
      const nameI = h('input', { type: 'text', value: t.name || assetInfo(this.id).name });
      nameI.addEventListener('change', () => { t.name = nameI.value.trim() || t.name; assetInfo(this.id).name = t.name; this.ws.assetsChanged(); this.renderList(); this.renderSide(); });
      el.insertBefore(h('div.field', h('div.k', 'Name'), h('div.v', nameI)), el.children[1]);
    }

    const row = h('div.btn-row', { style: { marginTop: '12px' } });
    if (this.kind === 'prop') row.append(h('button.btn.small.primary', { type: 'button', onclick: () => this.hooks.placeOnMap(this.id) }, 'PLACE ON MAP'));
    row.append(h('button.btn.small', { type: 'button', onclick: () => this.importPng() }, 'IMPORT PNG'), h('button.btn.small', { type: 'button', onclick: () => this.exportPng() }, 'EXPORT PNG'));
    const custom = (this.kind === 'prop' && this.id.startsWith('custom:')) || (this.kind === 'tile' && this.id >= CUSTOM_TILE_BASE);
    if (custom) row.append(h('button.btn.small.danger', { type: 'button', onclick: () => this.deleteCustom() }, 'DELETE'));
    else if (changed) row.append(h('button.btn.small.danger', { type: 'button', onclick: () => this.revert() }, 'REVERT'));
    el.append(row);
    if (this.kind === 'prop') el.append(h('p.hint', 'Used on ', h('b', this.usage() || 'no maps'), '. The dashed cyan line is the prop’s base: where it meets the ground (the agent walks behind it above that line).'));
  }

  async reloadBundle() { this.renderList(); if (this.id !== null) this.open(this.kind, this.id); }

  key(e) {
    if (!this.work) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); return; }
    if (mod) return;
    if (e.key === ' ') { this.space = true; return; }
    const map = { b: 'pencil', p: 'pencil', e: 'eraser', g: 'fill', i: 'pick', l: 'line', r: 'rect', m: 'move', c: 'box' };
    const t = map[e.key.toLowerCase()];
    if (t && (t !== 'box' || this.kind === 'prop')) { this.toolId = t; this.renderTools(); }
    if (e.key === '+' || e.key === '=') this.zoom(1);
    if (e.key === '-') this.zoom(-1);
    if (e.key === '0') this.fit();
  }
}

/* ---------------- helpers ---------------- */

function getActorSlotOrig(orig, slot) {
  const parts = slot.split('.');
  if (parts[0] === 'van') return orig.van;
  if (parts[0] === 'ufo') return orig.ufo;
  const set = parts[0] === 'player' ? orig.actors.player : orig.actors.aliens[parts[1]];
  return set[parts[parts.length - 1]];
}

function flipCanvasY(src) {
  const [c, x] = canvas(src.width, src.height);
  x.translate(0, src.height); x.scale(1, -1);
  x.drawImage(src, 0, 0);
  return c;
}

function line(x0, y0, x1, y1, plot) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 4096; n++) {
    plot(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function rectCells(a, b, filled, plot) {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (filled || x === x0 || x === x1 || y === y0 || y === y1) plot(x, y);
}

function shifted(src, dx, dy, wrap) {
  const [c, x] = canvas(src.width, src.height);
  if (wrap) {
    for (const ox of [-src.width, 0, src.width]) for (const oy of [-src.height, 0, src.height]) x.drawImage(src, dx + ox, dy + oy);
  } else x.drawImage(src, dx, dy);
  return c;
}

function usedColors(img, max) {
  const d = pixels(img).data, n = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const k = rgbaHex(d[i], d[i + 1], d[i + 2]);
    n.set(k, (n.get(k) || 0) + 1);
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(e => e[0]);
}

// A picked image file as a canvas (sprites, not photos: 512px at most).
async function fileToCanvas(f) {
  const url = URL.createObjectURL(f);
  let c;
  try { c = await decodePng(url); } finally { URL.revokeObjectURL(url); }
  if (c.width > 512 || c.height > 512) throw new Error(`that image is ${c.width}\u00D7${c.height}; sprites can be up to 512\u00D7512 pixels`);
  return c;
}

// Crop / pad an image to exactly w x h (top-left aligned).
function fitTo(img, w, hh) {
  if (img.width === w && img.height === hh) return img;
  const [c, x] = canvas(w, hh);
  x.drawImage(img, 0, 0);
  return c;
}

export { flipX };
