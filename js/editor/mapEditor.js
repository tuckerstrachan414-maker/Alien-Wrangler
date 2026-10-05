// The map editor: holds the open map's doc, rebuilds it the way the game
// does (compileMap + the ground canvas), and owns selection, picking,
// moving, resizing, delete / duplicate / copy / paste and the shortcuts.
// Tools (tools.js) and panels (panels.js, inspector.js) work through it.
import { TILE, canvas } from '../data/sprites.js';
import { compileMap, runPaintOps } from '../data/maps.js';
import { getAsset } from '../data/assets.js';
import { blendGround } from '../terrain.js';
import { missingTile } from '../groundRender.js';
import { MapView, handlesOf } from './view.js';
import { objBox, objAnchor, paintBox, paintAnchor, movePaint, PAINT_KINDS } from './schema.js';
import { toast } from './dom.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const MASKS = new WeakMap();

// Is pixel (x, y) of an image solid? (picking props by their actual shape)
function alphaAt(img, x, y) {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return 0;
  let m = MASKS.get(img);
  if (!m) {
    const [c, g] = canvas(img.width, img.height);
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    const a = new Uint8Array(img.width * img.height);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    m = { w: img.width, a };
    MASKS.set(img, m);
  }
  return m.a[y * m.w + x];
}

const inBox = (b, x, y, pad = 0) => x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;
const segDist = (p, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
};

export const DEFAULT_LAYERS = {
  ground: true, props: true, buildings: true, roofs: 'fade', van: true, hides: true, solids: false, nav: false,
  paint: true, fx: true, story: true, grid: false, night: true,
};

export class MapEditor {
  constructor(ws, assets, ui) {
    this.ws = ws;
    this.assets = assets;
    this.ui = ui;                         // { onSelection, onDoc, onTool, status(text) } (main.js wires panels)
    this.id = null;
    this.doc = null;
    this.map = null;
    this.ground = null;                   // the full ground canvas (what the game draws)
    this.base = null;                     // tiles + blended edges only
    this.tileSig = '';
    this.paintSig = '';
    this.working = false;
    this.sel = [];
    this.hover = null;
    this.marquee = null;
    this.clip = null;
    this.layers = { ...DEFAULT_LAYERS };
    try { Object.assign(this.layers, JSON.parse(localStorage.getItem('aw-editor-layers') || '{}')); } catch { /* defaults */ }
    this.snap = +(localStorage.getItem('aw-editor-snap') || 1) || 1;
    this.view = new MapView(document.getElementById('view'), this);
    this.tool = null;
    this.tools = {};
    ws.on((evt, data) => {
      if (evt === 'doc' && data.id === this.id && !this.working) {
        this.doc = ws.doc(this.id);
        this.pruneSelection();
        this.rebuild();
      }
      if (evt === 'assets' && this.id) { this.tileSig = ''; this.paintSig = ''; this.rebuild(); }
    });
  }

  saveLayers() { try { localStorage.setItem('aw-editor-layers', JSON.stringify(this.layers)); } catch { /* fine */ } }
  setSnap(n) { this.snap = n; try { localStorage.setItem('aw-editor-snap', String(n)); } catch { /* fine */ } }

  /* ---------------- open + rebuild ---------------- */

  open(id) {
    if (this.working) this.cancelWork();
    this.id = id;
    this.doc = this.ws.doc(id);
    this.sel = [];
    this.hover = null;
    this.tileSig = ''; this.paintSig = '';
    this.rebuild();
    this.view.fit(this.map);
    if (this.tool && this.tool.reset) this.tool.reset();
    this.ui.onSelection();
  }

  // Compile the doc and bring the ground canvas up to date. `quick`: the
  // tiles changed under a brush stroke; skip the (slow) blended edges.
  rebuild({ quick = false } = {}) {
    if (!this.doc) return;
    this.map = compileMap(this.doc);
    this.view.invalidateNav();
    const tiles = this.assets.tiles;
    const tsig = this.map.tw + 'x' + this.map.th + ':' + this.map.blend + ':' + this.map.ground.join(',');
    const psig = JSON.stringify([this.map.paintOps, this.map.decals]);
    if (!quick && tsig !== this.tileSig) {
      const [c, g] = canvas(this.map.w, this.map.h);
      for (let ty = 0; ty < this.map.th; ty++)
        for (let tx = 0; tx < this.map.tw; tx++)
          g.drawImage(tiles[this.map.ground[ty * this.map.tw + tx]] || missingTile(), tx * TILE, ty * TILE);
      if (this.map.blend) blendGround(g, this.map, tiles);
      this.base = c;
      this.tileSig = tsig;
      this.paintSig = '';
    }
    if (!quick && psig !== this.paintSig) {
      const [c, g] = canvas(this.map.w, this.map.h);
      g.drawImage(this.base, 0, 0);
      runPaintOps(g, tiles, this.map.paintOps.concat(this.map.decals));
      this.ground = c;
      this.paintSig = psig;
    }
    this.view.request();
    this.ui.onDoc();
  }

  // Paint tiles straight onto the ground canvas (live brush feedback).
  paintTilesNow(cells) {
    if (!this.ground) return;
    const g = this.ground.getContext('2d');
    for (const [tx, ty, id] of cells) g.drawImage(this.assets.tiles[id] || missingTile(), tx * TILE, ty * TILE);
    this.view.request();
  }

  /* ---------------- changing the doc ---------------- */

  // Start (or continue) an edit that shows live and lands as one undo step.
  beginWork() {
    if (!this.working) { this.doc = clone(this.ws.doc(this.id)); this.working = true; }
    return this.doc;
  }
  endWork(label) {
    if (!this.working) return;
    this.working = false;
    const d = this.doc;
    if (!this.ws.commit(this.id, d, label)) { this.doc = this.ws.doc(this.id); this.rebuild(); }
  }
  cancelWork() {
    if (!this.working) return;
    this.working = false;
    this.doc = this.ws.doc(this.id);
    this.rebuild();
  }

  // One-shot edit: fn(doc) changes a copy; returning false calls it off.
  edit(label, fn) {
    if (this.working) this.endWork('edit');
    const d = clone(this.ws.doc(this.id));
    if (fn(d) === false) return false;
    return this.ws.commit(this.id, d, label);
  }

  undo() { if (this.working) this.cancelWork(); if (this.ws.undo(this.id)) this.pruneSelection(); else toast('Nothing to undo'); }
  redo() { if (this.working) this.cancelWork(); if (this.ws.redo(this.id)) this.pruneSelection(); else toast('Nothing to redo'); }

  /* ---------------- selection ---------------- */

  key(s) { return s ? `${s.k}:${s.i ?? ''}:${s.j ?? ''}` : ''; }
  isSelected(s) { const k = this.key(s); return this.sel.some(q => this.key(q) === k); }
  select(list, add = false) {
    if (!add) this.sel = [];
    for (const s of list) {
      if (!s) continue;
      const k = this.key(s);
      const at = this.sel.findIndex(q => this.key(q) === k);
      if (at >= 0 && add) this.sel.splice(at, 1);
      else if (at < 0) this.sel.push(s);
    }
    this.view.request();
    this.ui.onSelection();
  }
  pruneSelection() {
    const d = this.doc;
    this.sel = this.sel.filter(s => {
      if (s.k === 'obj') return !!d.objects[s.i];
      if (s.k === 'paint') return !!d.paint[s.i];
      if (s.k === 'pt') return !!(d.paint[s.i] && d.paint[s.i].pts && d.paint[s.i].pts[s.j]);
      if (s.k === 'arrive') return !!(d.story && d.story.arrive);
      if (s.k === 'treeLine') return !!(d.story && typeof d.story.treeLine === 'number');
      return true;
    });
    this.ui.onSelection();
  }

  // The box an item is edited by (buildings: their footprint).
  boxOf(s) {
    const d = this.doc;
    switch (s.k) {
      case 'obj': {
        const o = d.objects[s.i];
        if (!o) return null;
        if (o.t === 'building') return { x: o.x, y: o.y, w: o.w, h: o.d };
        return objBox(o);
      }
      case 'paint': return d.paint[s.i] ? paintBox(d.paint[s.i]) : null;
      case 'pt': { const p = d.paint[s.i] && d.paint[s.i].pts[s.j]; return p ? { x: p.x - 3, y: p.y - 3, w: 6, h: 6 } : null; }
      case 'van': return { x: d.van.x, y: d.van.y, w: 46, h: 30 };
      case 'spawn': return { x: d.spawn.x - 6, y: d.spawn.y - 15, w: 12, h: 16 };
      case 'arrive': return d.story.arrive ? { x: d.story.arrive.x - 4, y: d.story.arrive.y - 12, w: 12, h: 14 } : null;
      case 'treeLine': return { x: 0, y: d.story.treeLine - 2, w: d.tw * TILE, h: 4 };
      default: return null;
    }
  }

  resizable(s) {
    if (s.k === 'obj') { const o = this.doc.objects[s.i]; return !!o && (o.t === 'solid' || o.t === 'building'); }
    if (s.k === 'paint') { const o = this.doc.paint[s.i]; return !!o && (!!(PAINT_KINDS[o.op] || {}).rect || o.op === 'mud'); }
    return false;
  }

  // What's under world point (x, y): the topmost visible, selectable thing.
  pick(x, y, { points = true } = {}) {
    const d = this.doc, L = this.layers, map = this.map;
    if (!map) return null;
    const tol = 6 / this.view.z;
    if (L.paint && points) {
      for (let i = d.paint.length - 1; i >= 0; i--) {
        const o = d.paint[i];
        if (!o.pts) continue;
        for (let j = 0; j < o.pts.length; j++) if (Math.hypot(o.pts[j].x - x, o.pts[j].y - y) <= tol + 1) return { k: 'pt', i, j };
      }
    }
    if (L.story) {
      const st = d.story || {};
      if (st.arrive && inBox(this.boxOf({ k: 'arrive' }), x, y, tol / 2)) return { k: 'arrive' };
    }
    if (L.van) {
      if (inBox(this.boxOf({ k: 'spawn' }), x, y)) return { k: 'spawn' };
    }
    if (L.hides) {
      for (let i = map.hideSpots.length - 1; i >= 0; i--) {
        const s = map.hideSpots[i];
        if (Math.hypot(s.x - x, s.y - y) <= Math.max(tol, 4)) return s.src !== undefined ? { k: 'obj', i: s.src } : null;
      }
    }
    // props, front to back (by what's actually drawn there)
    const fine = this.view.z >= 1.5;
    if (L.props || L.buildings || L.van) {
      const items = [];
      if (L.props) for (const pr of map.props) if (pr.src !== undefined) items.push({ y: pr.baseY, pr });
      if (L.van) items.push({ y: map.van.y + 28, van: true });
      items.sort((a, b) => b.y - a.y);
      for (const it of items) {
        if (it.van) { if (inBox(this.boxOf({ k: 'van' }), x, y)) return { k: 'van' }; continue; }
        const pr = it.pr;
        if (!inBox({ x: pr.x, y: pr.y, w: pr.img.width, h: pr.img.height }, x, y)) continue;
        if (fine && !alphaAt(pr.img, x - pr.x, y - pr.y)) continue;
        return { k: 'obj', i: pr.src };
      }
    }
    if (L.buildings) {
      for (let i = map.buildings.length - 1; i >= 0; i--) {
        const b = map.buildings[i];
        if (x >= b.x0 && x <= b.x1 && y >= b.topAt(x) && y <= b.y1) return { k: 'obj', i: b.src };
      }
    }
    if (L.solids || this.tool && this.tool.id === 'solid') {
      for (let i = d.objects.length - 1; i >= 0; i--) {
        const o = d.objects[i];
        if (o.t === 'solid' && inBox(o, x, y, tol / 2)) return { k: 'obj', i };
      }
    }
    if (L.paint) {
      for (let i = d.paint.length - 1; i >= 0; i--) {
        const o = d.paint[i];
        if (o.pts) {
          const r = (o.op === 'path' ? (o.halfW ?? 22) : 4) + tol / 2;
          for (let j = 0; j < o.pts.length - 1; j++) if (segDist({ x, y }, o.pts[j], o.pts[j + 1]) <= r) return { k: 'paint', i };
        } else if (inBox(paintBox(o), x, y, tol / 3)) return { k: 'paint', i };
      }
    }
    if (L.story && d.story && typeof d.story.treeLine === 'number' && Math.abs(y - d.story.treeLine) <= tol) return { k: 'treeLine' };
    return null;
  }

  // Everything whose anchor is inside a box (box-select).
  pickBox(x0, y0, x1, y1) {
    const d = this.doc, L = this.layers, out = [];
    const bx = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
    d.objects.forEach((o, i) => {
      const vis = o.t === 'prop' ? L.props : o.t === 'hide' ? L.hides : o.t === 'solid' ? L.solids : L.buildings;
      if (vis && inBox(bx, objAnchor(o).x, objAnchor(o).y)) out.push({ k: 'obj', i });
    });
    if (L.paint) d.paint.forEach((o, i) => { const a = paintAnchor(o); if (inBox(bx, a.x, a.y)) out.push({ k: 'paint', i }); });
    if (L.van) {
      if (inBox(bx, d.van.x + 23, d.van.y + 15)) out.push({ k: 'van' });
      if (inBox(bx, d.spawn.x, d.spawn.y)) out.push({ k: 'spawn' });
    }
    return out;
  }

  /* ---------------- moving ---------------- */

  // The position an item is dragged by (what snapping lines up).
  posOf(d, s) {
    switch (s.k) {
      case 'obj': { const o = d.objects[s.i]; return o ? { x: o.x, y: o.y } : null; }
      case 'paint': { const o = d.paint[s.i]; return o ? (o.pts ? { ...o.pts[0] } : { x: o.x, y: o.y }) : null; }
      case 'pt': return { ...d.paint[s.i].pts[s.j] };
      case 'van': return { ...d.van };
      case 'spawn': return { ...d.spawn };
      case 'arrive': return { ...d.story.arrive };
      case 'treeLine': return { x: 0, y: d.story.treeLine };
      default: return null;
    }
  }

  // Shift the given items by (dx, dy) in doc d.
  shift(d, items, dx, dy) {
    for (const s of items) {
      if (s.k === 'obj') { const o = d.objects[s.i]; if (o) { o.x += dx; o.y += dy; } }
      else if (s.k === 'paint') movePaint(d.paint[s.i], dx, dy);
      else if (s.k === 'pt') { const p = d.paint[s.i].pts[s.j]; p.x += dx; p.y += dy; }
      else if (s.k === 'van') { d.van.x += dx; d.van.y += dy; }
      else if (s.k === 'spawn') { d.spawn.x += dx; d.spawn.y += dy; }
      else if (s.k === 'arrive') { d.story.arrive.x += dx; d.story.arrive.y += dy; }
      else if (s.k === 'treeLine') d.story.treeLine += dy;
    }
  }

  // Everything that moves with a building when it's dragged: things whose
  // base is inside its footprint.
  contentsOf(d, bi) {
    const b = d.objects[bi], out = [];
    const inside = (p) => p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.d;
    d.objects.forEach((o, i) => { if (i !== bi && o.t !== 'building' && inside(objAnchor(o))) out.push({ k: 'obj', i }); });
    d.paint.forEach((o, i) => { if (inside(paintAnchor(o))) out.push({ k: 'paint', i }); });
    return out;
  }

  // Start dragging the selection. Returns a mover: move(dxWorld, dyWorld, alt), end(), cancel().
  startMove(alt = false) {
    const start = clone(this.ws.doc(this.id));
    const items = this.sel.slice();
    const extra = [];
    const buildings = [];
    for (const s of items) {
      if (s.k === 'obj' && start.objects[s.i] && start.objects[s.i].t === 'building') {
        buildings.push(s.i);
        if (!alt) for (const c of this.contentsOf(start, s.i)) if (!this.isSelected(c) && !extra.some(e => this.key(e) === this.key(c))) extra.push(c);
      }
    }
    // a selected path point drags just itself; a selected path drags all its points
    const moving = items.concat(extra).filter(s => !(s.k === 'pt' && items.some(q => q.k === 'paint' && q.i === s.i)));
    const primary = moving[0];
    const p0 = primary && this.posOf(start, primary);
    const grid = buildings.length ? Math.max(TILE, this.snap) : this.snap;
    this.beginWork();
    return {
      move: (dx, dy) => {
        if (!p0) return;
        let tx = p0.x + dx, ty = p0.y + dy;
        tx = Math.round(tx / grid) * grid; ty = Math.round(ty / grid) * grid;
        if (grid === 1) { tx = Math.round(tx); ty = Math.round(ty); }
        const ddx = tx - p0.x, ddy = ty - p0.y;
        const d = clone(start);
        this.shift(d, moving, ddx, ddy);
        this.doc = d;
        this.rebuild();
      },
      end: () => {
        for (const bi of buildings) vacateFloor(start, this.doc, bi);
        this.endWork('move');
      },
      cancel: () => this.cancelWork(),
    };
  }

  // Resize the single selected item from handle h (handlesOf order).
  startResize(h) {
    const s = this.sel[0];
    const start = clone(this.ws.doc(this.id));
    const b0 = this.boxOf(s);
    const isB = s.k === 'obj' && start.objects[s.i].t === 'building';
    const grid = isB ? TILE : this.snap;
    this.beginWork();
    return {
      move: (wx, wy) => {
        let { x, y, w, h: hh } = b0;
        let x1 = x + w, y1 = y + hh;
        const sx = Math.round(wx / grid) * grid, sy = Math.round(wy / grid) * grid;
        const min = isB ? TILE * 3 : 2;
        if ([0, 2, 6].includes(h)) x = Math.min(sx, x1 - min);
        if ([1, 3, 7].includes(h)) x1 = Math.max(sx, x + min);
        if ([0, 1, 4].includes(h)) y = Math.min(sy, y1 - min);
        if ([2, 3, 5].includes(h)) y1 = Math.max(sy, y + min);
        const d = clone(start);
        applyBox(d, s, { x, y, w: x1 - x, h: y1 - y });
        this.doc = d;
        this.rebuild();
      },
      end: () => { if (isB) vacateFloor(start, this.doc, s.i); this.endWork('resize'); },
      cancel: () => this.cancelWork(),
    };
  }

  handleAt(x, y) {
    if (this.sel.length !== 1 || !this.resizable(this.sel[0])) return -1;
    const b = this.boxOf(this.sel[0]);
    const r = 6 / this.view.z;
    const hs = handlesOf(b);
    for (let i = 0; i < hs.length; i++) if (Math.abs(hs[i][0] - x) <= r && Math.abs(hs[i][1] - y) <= r) return i;
    return -1;
  }

  nudge(dx, dy) {
    if (!this.sel.length) return;
    this.edit('nudge', (d) => { this.shift(d, this.sel, dx, dy); });
  }

  /* ---------------- delete / duplicate / copy / paste ---------------- */

  deleteSelection() {
    if (!this.sel.length) return;
    const fixed = this.sel.filter(s => ['van', 'spawn', 'arrive', 'treeLine'].includes(s.k));
    if (fixed.length === this.sel.length) { toast('The van, the spawn point and story markers can be moved but not deleted', 'warn'); return; }
    const sel = this.sel.slice();
    this.edit('delete', (d) => {
      const pts = sel.filter(s => s.k === 'pt').sort((a, b) => b.j - a.j);
      for (const s of pts) {
        const o = d.paint[s.i];
        if (!o || sel.some(q => q.k === 'paint' && q.i === s.i)) continue;
        if (o.pts.length <= 2) { toast('A path needs at least 2 points (delete the whole path instead)', 'warn'); continue; }
        o.pts.splice(s.j, 1);
      }
      const objs = new Set(sel.filter(s => s.k === 'obj').map(s => s.i));
      const paints = new Set(sel.filter(s => s.k === 'paint').map(s => s.i));
      d.objects = d.objects.filter((_, i) => !objs.has(i));
      d.paint = d.paint.filter((_, i) => !paints.has(i));
    });
    this.sel = [];
    this.ui.onSelection();
  }

  copySelection() {
    const d = this.ws.doc(this.id);
    const objects = this.sel.filter(s => s.k === 'obj').map(s => clone(d.objects[s.i])).filter(Boolean);
    const paint = this.sel.filter(s => s.k === 'paint').map(s => clone(d.paint[s.i])).filter(Boolean);
    if (!objects.length && !paint.length) { toast('Select some props, spots, boxes or ground art to copy', 'warn'); return false; }
    this.clip = { objects, paint };
    try { localStorage.setItem('aw-editor-clip', JSON.stringify(this.clip)); } catch { /* fine */ }
    toast(`Copied ${objects.length + paint.length} item${objects.length + paint.length > 1 ? 's' : ''}`);
    return true;
  }

  // Paste the clipboard centred on (x, y), or offset a little when no point is given.
  paste(at = null) {
    let clip = this.clip;
    if (!clip) { try { clip = JSON.parse(localStorage.getItem('aw-editor-clip') || 'null'); } catch { clip = null; } }
    if (!clip) { toast('Nothing copied yet', 'warn'); return; }
    const items = clip.objects.map(o => objAnchor(o)).concat(clip.paint.map(paintAnchor));
    const cx = items.reduce((s, p) => s + p.x, 0) / items.length, cy = items.reduce((s, p) => s + p.y, 0) / items.length;
    let dx = 16, dy = 16;
    if (at) { dx = at.x - cx; dy = at.y - cy; }
    const g = clip.objects.some(o => o.t === 'building') ? TILE : Math.max(1, this.snap);
    dx = Math.round(dx / g) * g; dy = Math.round(dy / g) * g;
    const sel = [];
    this.edit('paste', (d) => {
      for (const src of clip.objects) {
        const o = clone(src);
        o.x += dx; o.y += dy;
        if (o.t === 'building') o.id = uniqueBuildingId(d, o.id || o.kind);
        if (o.t === 'hide') delete o.tutor;
        d.objects.push(o);
        sel.push({ k: 'obj', i: d.objects.length - 1 });
      }
      for (const src of clip.paint) {
        const o = clone(src);
        movePaint(o, dx, dy);
        delete o.id;
        d.paint.push(o);
        sel.push({ k: 'paint', i: d.paint.length - 1 });
      }
    });
    this.select(sel);
  }

  duplicate() {
    if (this.copySelection()) this.paste();
  }

  /* ---------------- misc ---------------- */

  status(text) { this.ui.status(text); }
}

// Write a new box back into an item (solids, buildings, rect ground art, mud).
export function applyBox(d, s, b) {
  if (s.k === 'obj') {
    const o = d.objects[s.i];
    if (o.t === 'building') { o.x = b.x; o.y = b.y; o.w = b.w; o.d = b.h; fitDoors(o); }
    else { o.x = b.x; o.y = b.y; o.w = b.w; o.h = b.h; }
  } else if (s.k === 'paint') {
    const o = d.paint[s.i];
    if (o.op === 'mud') { o.x = b.x + b.w / 2; o.y = b.y + b.h / 2; o.rx = Math.max(1, Math.round(b.w / 2 - 2)); o.ry = Math.max(1, Math.round(b.h / 2 - 2)); }
    else { o.x = b.x; o.y = b.y; o.w = b.w; o.h = b.h; }
  }
}

// Keep a building's doors inside its walls after a resize.
export function fitDoors(o) {
  for (const [side, len] of [['n', o.w], ['s', o.w], ['e', o.d], ['w', o.d]]) {
    const dr = o.doors && o.doors[side];
    if (!dr) continue;
    const span = Math.min(dr[1] - dr[0], len - 2 * (o.wall || 8));
    let a = Math.min(dr[0], len - (o.wall || 8) - span);
    a = Math.max(o.wall || 8, a);
    o.doors[side] = [a, a + Math.max(TILE, span)];
  }
}

export function uniqueBuildingId(d, base) {
  base = String(base || 'building').replace(/\d+$/, '') || 'building';
  const taken = new Set(d.objects.filter(o => o.t === 'building').map(o => o.id));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(base + n)) return base + n;
}

// A building moved or shrank: the floor tiles it left behind go back to
// whatever ground surrounds where it stood.
export function vacateFloor(before, after, bi) {
  const b0 = before.objects[bi], b1 = after.objects[bi];
  if (!b0 || !b1 || b0.floor === undefined) return;
  const tw = after.tw, th = after.th;
  const cell = (x, y) => (x >= 0 && y >= 0 && x < tw && y < th ? after.ground[y][x] : null);
  const tx0 = Math.round(b0.x / TILE), ty0 = Math.round(b0.y / TILE), tw0 = Math.round(b0.w / TILE), td0 = Math.round(b0.d / TILE);
  const inNew = (x, y) => x * TILE >= b1.x && x * TILE < b1.x + b1.w && y * TILE >= b1.y && y * TILE < b1.y + b1.d;
  // the most common tile just outside the old footprint
  const count = new Map();
  for (let x = tx0 - 1; x <= tx0 + tw0; x++) for (const y of [ty0 - 1, ty0 + td0]) { const c = cell(x, y); if (c !== null && c !== b0.floor) count.set(c, (count.get(c) || 0) + 1); }
  for (let y = ty0; y < ty0 + td0; y++) for (const x of [tx0 - 1, tx0 + tw0]) { const c = cell(x, y); if (c !== null && c !== b0.floor) count.set(c, (count.get(c) || 0) + 1); }
  let fill = 0, best = -1;
  for (const [c, n] of count) if (n > best) { best = n; fill = c; }
  for (let y = ty0; y < ty0 + td0; y++) for (let x = tx0; x < tx0 + tw0; x++) {
    if (cell(x, y) === b0.floor && !inNew(x, y)) after.ground[y][x] = fill;
  }
}

export { getAsset };
