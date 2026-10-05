// Editor tools. Each one gets world-space pointer events from main.js:
//   down(p, e) / move(p, e) / up(p, e)   p = { x, y, tx, ty } (world px + tile)
//   hover(p)                             no buttons held
//   overlay(ctx, view, hair)             draw its preview (world space)
//   options()                            the floating options bar (or null)
import { T, TILE } from '../data/sprites.js';
import { getAsset, assetInfo, cropAsset, tileName } from '../data/assets.js';
import { POD_EXTRA, BUILDING_KINDS } from '../data/maps.js';
import { h, toast } from './dom.js';
import { PAINT_KINDS, newBuilding } from './schema.js';
import { uniqueBuildingId } from './mapEditor.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const opt = (label, ...kids) => h('div.opt-group', label ? h('span.lbl', label) : null, ...kids);
function seg(options, value, onPick) {
  const wrap = h('span.seg');
  for (const o of options) {
    const b = h(`button${String(o.value) === String(value) ? '.on' : ''}`, { type: 'button', title: o.title || '' }, o.label);
    b.addEventListener('click', () => { for (const c of wrap.children) c.classList.remove('on'); b.classList.add('on'); onPick(o.value); });
    wrap.appendChild(b);
  }
  return wrap;
}
const check = (label, value, onChange, title = '') => {
  const i = h('input', { type: 'checkbox', checked: !!value });
  i.addEventListener('change', () => onChange(i.checked));
  return h('label', { title }, i, ' ', label);
};

// Extras some props bring with them when placed fresh.
const PRESETS = { pod: () => POD_EXTRA(1 + Math.floor(Math.random() * 999)) };

export function makeTools(ed) {
  const S = {                                       // shared tool settings (remembered)
    tile: T.GRASS, brush: 1, fillAll: false,
    asset: 'tree', scatter: false, spacing: 1, noSolid: false, noHide: false, see: false,
    inside: true, jumpable: false, glass: false,
    art: 'mud', crop: 'corn', cropSpots: true, building: 'barn',
  };
  try { Object.assign(S, JSON.parse(localStorage.getItem('aw-editor-tools') || '{}')); } catch { /* defaults */ }
  const remember = () => { try { localStorage.setItem('aw-editor-tools', JSON.stringify(S)); } catch { /* fine */ } };
  ed.toolState = S;

  const inMap = (tx, ty) => ed.doc && tx >= 0 && ty >= 0 && tx < ed.doc.tw && ty < ed.doc.th;
  const snapPt = (x, y) => {
    const g = ed.snap;
    return g > 1 ? { x: Math.round(x / g) * g, y: Math.round(y / g) * g } : { x: Math.round(x), y: Math.round(y) };
  };
  const tileSwatch = () => {
    const c = document.createElement('canvas');
    c.width = TILE; c.height = TILE;
    c.className = 'opt-swatch';
    const img = ed.assets.tiles[S.tile];
    if (img) c.getContext('2d').drawImage(img, 0, 0);
    c.title = tileName(S.tile);
    return c;
  };
  const tileOpt = () => opt('TILE', tileSwatch(), h('span', tileName(S.tile)),
    h('button.btn.small', { type: 'button', onclick: () => ed.ui.showTab('palette', 'tiles') }, 'CHANGE'));

  /* ---------------- select ---------------- */
  const select = {
    id: 'select', label: 'Select', icon: '\u{1F446}', hotkey: 'v',
    help: 'Click to select, drag to move (snaps to the grid you pick). Shift+click adds to the selection; drag on empty ground to box-select. Drag a corner to resize boxes and buildings. Alt+click a road to add a point; double-click a point to remove it.',
    st: null,
    down(p, e) {
      const s = ed.pick(p.x, p.y);
      const hnd = ed.handleAt(p.x, p.y);
      this.st = { x: p.x, y: p.y, moved: false, cx: e.clientX, cy: e.clientY };
      if (hnd >= 0) { this.st.resize = ed.startResize(hnd); return; }
      // Alt+click on a road / trail adds a point there
      if (e.altKey && s && s.k === 'paint' && ed.doc.paint[s.i].pts) {
        const o = ed.doc.paint[s.i];
        let best = 0, bd = 1e9;
        for (let j = 0; j < o.pts.length - 1; j++) {
          const a = o.pts[j], b = o.pts[j + 1];
          const d = Math.hypot((a.x + b.x) / 2 - p.x, (a.y + b.y) / 2 - p.y);
          if (d < bd) { bd = d; best = j; }
        }
        const q = { x: Math.round(p.x), y: Math.round(p.y) };
        ed.edit('add point', (d) => { d.paint[s.i].pts.splice(best + 1, 0, q); });
        ed.select([{ k: 'pt', i: s.i, j: best + 1 }]);
        this.st = null;
        return;
      }
      if (s) {
        if (e.shiftKey) { ed.select([s], true); this.st.noMove = true; return; }
        if (!ed.isSelected(s)) ed.select([s]);
        this.st.pending = true;
      } else if (e.pointerType === 'touch') {
        this.st.pan = true;
        if (!e.shiftKey) ed.select([]);
      } else {
        if (!e.shiftKey) ed.select([]);
        this.st.box = true;
        this.st.add = e.shiftKey;
        ed.marquee = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      }
    },
    move(p, e) {
      const st = this.st;
      if (!st) return;
      if (st.resize) { st.resize.move(p.x, p.y); return; }
      if (st.pan) { ed.view.pan(e.clientX - st.cx, e.clientY - st.cy); st.cx = e.clientX; st.cy = e.clientY; return; }
      if (st.box) { ed.marquee.x1 = p.x; ed.marquee.y1 = p.y; ed.view.request(); return; }
      if (st.pending && !st.noMove) {
        if (!st.moved && Math.hypot(e.clientX - st.cx, e.clientY - st.cy) < 4) return;
        if (!st.mover) st.mover = ed.startMove(e.altKey);
        st.moved = true;
        st.mover.move(p.x - st.x, p.y - st.y);
      }
    },
    up(p, e) {
      const st = this.st;
      this.st = null;
      if (!st) return;
      if (st.resize) { st.resize.end(); return; }
      if (st.box) {
        const m = ed.marquee;
        ed.marquee = null;
        if (Math.abs(m.x1 - m.x0) > 1 || Math.abs(m.y1 - m.y0) > 1) ed.select(ed.pickBox(m.x0, m.y0, m.x1, m.y1), st.add);
        ed.view.request();
        return;
      }
      if (st.mover) st.mover.end();
    },
    dbl(p) {
      const s = ed.pick(p.x, p.y);
      if (s && s.k === 'pt') {
        const o = ed.doc.paint[s.i];
        if (o.pts.length <= 2) { toast('A path needs at least 2 points', 'warn'); return; }
        ed.edit('remove point', (d) => { d.paint[s.i].pts.splice(s.j, 1); });
        ed.select([{ k: 'paint', i: s.i }]);
      }
    },
    cancel() { if (this.st && (this.st.mover || this.st.resize)) (this.st.mover || this.st.resize).cancel(); this.st = null; ed.marquee = null; },
    options() {
      return opt('SNAP', seg([1, 4, 8, 16].map(v => ({ value: v, label: v === 1 ? '1px' : `${v}`, title: v === 16 ? 'One tile' : `${v}px grid` })), ed.snap, v => ed.setSnap(+v)));
    },
  };

  /* ---------------- pan ---------------- */
  const pan = {
    id: 'pan', label: 'Pan', icon: '✋', hotkey: 'h', cursor: 'grab',
    help: 'Drag to move around. (Any tool: hold Space, or drag with the middle mouse button or two fingers; scroll or pinch to zoom.)',
    down(p, e) { this.last = { x: e.clientX, y: e.clientY }; },
    move(p, e) { if (!this.last) return; ed.view.pan(e.clientX - this.last.x, e.clientY - this.last.y); this.last = { x: e.clientX, y: e.clientY }; },
    up() { this.last = null; },
  };

  /* ---------------- tiles ---------------- */
  const paintCells = (tx, ty, id, out) => {
    const d = ed.doc, r = S.brush, o = Math.floor((r - 1) / 2);
    for (let y = ty - o; y < ty - o + r; y++) for (let x = tx - o; x < tx - o + r; x++) {
      if (!inMap(x, y) || d.ground[y][x] === id) continue;
      d.ground[y][x] = id;
      out.push([x, y, id]);
    }
  };
  const brush = {
    id: 'brush', label: 'Paint', icon: '\u{1F58C}', hotkey: 'b', tiles: true,
    help: 'Paint ground tiles. Right-click picks up the tile under the cursor. [ and ] change the brush size.',
    down(p, e) {
      if (e.button === 2) { pickTile(p); return; }
      ed.beginWork();
      this.last = { tx: p.tx, ty: p.ty };
      const cells = [];
      paintCells(p.tx, p.ty, S.tile, cells);
      ed.paintTilesNow(cells);
    },
    move(p) {
      if (!this.last) return;
      const cells = [];
      // fill in along the stroke so a fast drag leaves no gaps
      let { tx: x0, ty: y0 } = this.last;
      const x1 = p.tx, y1 = p.ty, dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (let n = 0; n < 512; n++) {
        paintCells(x0, y0, S.tile, cells);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
      this.last = { tx: p.tx, ty: p.ty };
      ed.paintTilesNow(cells);
    },
    up() { if (!this.last) return; this.last = null; ed.endWork('paint tiles'); },
    cancel() { if (this.last) { this.last = null; ed.cancelWork(); } },
    hover(p) { this.at = p; ed.view.request(); },
    overlay(ctx, view, hair) {
      if (!this.at) return;
      const r = S.brush, o = Math.floor((r - 1) / 2);
      ctx.strokeStyle = '#ffd75e'; ctx.lineWidth = hair * 1.5;
      ctx.strokeRect((this.at.tx - o) * TILE, (this.at.ty - o) * TILE, r * TILE, r * TILE);
      ctx.lineWidth = hair;
    },
    options() {
      return [tileOpt(), opt('SIZE', seg([1, 2, 3, 5, 7].map(v => ({ value: v, label: String(v) })), S.brush, v => { S.brush = +v; remember(); }))];
    },
  };

  const rect = {
    id: 'rect', label: 'Rect', icon: '▦', hotkey: 'r', tiles: true,
    help: 'Drag a rectangle to fill it with the tile.',
    down(p, e) { if (e.button === 2) { pickTile(p); return; } this.r = { tx0: p.tx, ty0: p.ty, tx1: p.tx, ty1: p.ty }; ed.view.request(); },
    move(p) { if (!this.r) return; this.r.tx1 = p.tx; this.r.ty1 = p.ty; ed.view.request(); },
    up() {
      const r = this.r;
      this.r = null;
      if (!r) return;
      const [x0, x1] = [Math.min(r.tx0, r.tx1), Math.max(r.tx0, r.tx1)], [y0, y1] = [Math.min(r.ty0, r.ty1), Math.max(r.ty0, r.ty1)];
      ed.edit('fill rectangle', (d) => {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inMap(x, y)) d.ground[y][x] = S.tile;
      });
    },
    cancel() { this.r = null; ed.view.request(); },
    hover(p) { this.at = p; ed.view.request(); },
    overlay(ctx, view, hair) {
      ctx.strokeStyle = '#ffd75e'; ctx.lineWidth = hair * 1.5;
      if (this.r) {
        const r = this.r, x0 = Math.min(r.tx0, r.tx1), y0 = Math.min(r.ty0, r.ty1);
        ctx.fillStyle = 'rgba(255, 215, 94, 0.15)';
        ctx.fillRect(x0 * TILE, y0 * TILE, (Math.abs(r.tx1 - r.tx0) + 1) * TILE, (Math.abs(r.ty1 - r.ty0) + 1) * TILE);
        ctx.strokeRect(x0 * TILE, y0 * TILE, (Math.abs(r.tx1 - r.tx0) + 1) * TILE, (Math.abs(r.ty1 - r.ty0) + 1) * TILE);
      } else if (this.at) ctx.strokeRect(this.at.tx * TILE, this.at.ty * TILE, TILE, TILE);
      ctx.lineWidth = hair;
    },
    options() { return [tileOpt()]; },
  };

  const fill = {
    id: 'fill', label: 'Fill', icon: '\u{1FAA3}', hotkey: 'g', tiles: true,
    help: 'Flood-fill the patch of matching tiles you click (or every tile of that kind, with "whole map" on).',
    down(p, e) {
      if (e.button === 2) { pickTile(p); return; }
      if (!inMap(p.tx, p.ty)) return;
      ed.edit('flood fill', (d) => {
        const from = d.ground[p.ty][p.tx];
        if (from === S.tile) return false;
        if (S.fillAll) {
          for (const row of d.ground) for (let x = 0; x < row.length; x++) if (row[x] === from) row[x] = S.tile;
          return true;
        }
        const stack = [[p.tx, p.ty]];
        while (stack.length) {
          const [x, y] = stack.pop();
          if (!inMap(x, y) || d.ground[y][x] !== from) continue;
          d.ground[y][x] = S.tile;
          stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
        return true;
      });
    },
    options() { return [tileOpt(), opt('', check('Whole map', S.fillAll, v => { S.fillAll = v; remember(); }, 'Replace every tile of the clicked kind'))]; },
  };

  const pickTile = (p) => {
    if (!inMap(p.tx, p.ty)) return;
    S.tile = ed.doc.ground[p.ty][p.tx];
    remember();
    toast(`Picked ${tileName(S.tile)}`);
    ed.ui.onTool();
  };
  const eyedrop = {
    id: 'eyedrop', label: 'Pick', icon: '\u{1F489}', hotkey: 'i', tiles: true,
    help: 'Click a tile to paint with it (then back to the brush). Click a prop with Alt held to stamp that prop.',
    down(p, e) {
      if (e.altKey) {
        const s = ed.pick(p.x, p.y);
        const o = s && s.k === 'obj' && ed.doc.objects[s.i];
        if (o && o.t === 'prop') { S.asset = o.a; remember(); ed.setTool('prop'); return; }
      }
      pickTile(p);
      ed.setTool('brush');
    },
  };

  /* ---------------- props ---------------- */
  const placeProp = (p) => {
    const def = getAsset(S.asset);
    if (!def) { toast('Pick a prop in the ADD panel first', 'warn'); return null; }
    const w = def.img.width, hh = def.img.height;
    const a = snapPt(p.x, p.y);
    const o = { t: 'prop', a: S.asset, x: Math.round(a.x - w / 2), y: Math.round(a.y - hh) };
    if (S.noSolid) o.noSolid = true;
    if (S.noHide) o.noHide = true;
    if (S.see) o.see = true;
    const key = S.asset.replace(/^[a-z]+:/, '');
    if (PRESETS[S.asset] || PRESETS[key]) Object.assign(o, (PRESETS[S.asset] || PRESETS[key])());
    return o;
  };
  const prop = {
    id: 'prop', label: 'Prop', icon: '\u{1F333}', hotkey: 'p',
    help: 'Click to place the prop (its base goes where you click). Turn on Scatter and drag to spray them, e.g. a stand of trees.',
    down(p) {
      const o = placeProp(p);
      if (!o) return;
      if (S.scatter) {
        ed.beginWork();
        ed.doc.objects.push(o);
        this.placed = [o];
        ed.rebuild();
        return;
      }
      ed.edit('place prop', (d) => { d.objects.push(o); });
      ed.select([{ k: 'obj', i: ed.doc.objects.length - 1 }]);
    },
    move(p) {
      this.at = p;
      if (!this.placed) { ed.view.request(); return; }
      const def = getAsset(S.asset);
      const gap = Math.max(4, def.img.width * S.spacing);
      const last = this.placed[this.placed.length - 1];
      const lx = last.x + def.img.width / 2, ly = last.y + def.img.height;
      if (Math.hypot(p.x - lx, p.y - ly) < gap) return;
      const jitter = { x: p.x + (Math.random() - 0.5) * gap * 0.5, y: p.y + (Math.random() - 0.5) * gap * 0.5 };
      const o = placeProp(jitter);
      ed.doc.objects.push(o);
      this.placed.push(o);
      ed.rebuild();
    },
    up() { if (this.placed) { this.placed = null; ed.endWork('scatter props'); } },
    cancel() { if (this.placed) { this.placed = null; ed.cancelWork(); } },
    hover(p) { this.at = p; ed.view.request(); },
    overlay(ctx) {
      if (!this.at) return;
      const def = getAsset(S.asset);
      if (!def) return;
      const o = placeProp(this.at);
      ctx.globalAlpha = 0.6;
      ctx.drawImage(def.img, o.x, o.y);
      ctx.globalAlpha = 1;
      if (def.solid && !S.noSolid) {
        ctx.strokeStyle = def.jumpable ? '#ffd75e' : '#ff5e6c';
        ctx.strokeRect(o.x + def.solid.x, o.y + def.solid.y, def.solid.w, def.solid.h);
      }
    },
    options() {
      const def = getAsset(S.asset), info = assetInfo(S.asset);
      const sw = document.createElement('canvas');
      sw.className = 'opt-swatch';
      sw.width = 26; sw.height = 26;
      if (def) {
        const g = sw.getContext('2d'); g.imageSmoothingEnabled = false;
        const k = Math.min(26 / def.img.width, 26 / def.img.height);
        g.drawImage(def.img, (26 - def.img.width * k) / 2, (26 - def.img.height * k) / 2, def.img.width * k, def.img.height * k);
      }
      return [
        opt('PROP', sw, h('span', info ? info.name : S.asset), h('button.btn.small', { type: 'button', onclick: () => ed.ui.showTab('palette', 'props') }, 'CHANGE')),
        opt('', check('Scatter', S.scatter, v => { S.scatter = v; remember(); ed.ui.onTool(); }, 'Drag to spray props'),
          S.scatter ? h('input', { type: 'range', min: 0.5, max: 3, step: 0.25, value: S.spacing, title: 'Spacing', oninput: (e) => { S.spacing = +e.target.value; remember(); } }) : null),
        opt('NEW ONES', check('No collision', S.noSolid, v => { S.noSolid = v; remember(); }), check('No hiding', S.noHide, v => { S.noHide = v; remember(); }),
          check('See-through crown', S.see, v => { S.see = v; remember(); }, 'Thins out while the agent walks under it')),
        select.options(),
      ];
    },
  };

  /* ---------------- hiding spots ---------------- */
  const hide = {
    id: 'hide', label: 'Hide', icon: '\u{1F441}', hotkey: 's',
    help: 'Click to add a hiding spot. "Inside" spots are in cover (crops, bushes); "behind" spots are tucked behind something solid. Aliens only spawn in spots 140px or more from the agent’s spawn.',
    down(p) {
      const a = snapPt(p.x, p.y);
      ed.edit('add hiding spot', (d) => { d.objects.push({ t: 'hide', x: a.x, y: a.y, inside: !!S.inside }); });
      ed.select([{ k: 'obj', i: ed.doc.objects.length - 1 }]);
    },
    hover(p) { this.at = p; ed.view.request(); },
    overlay(ctx) {
      if (!this.at) return;
      const a = snapPt(this.at.x, this.at.y);
      ctx.globalAlpha = 0.6; ctx.fillStyle = S.inside ? '#59d98c' : '#ffb35e';
      ctx.beginPath(); ctx.arc(a.x, a.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    },
    options() {
      return [opt('KIND', seg([{ value: 'in', label: 'INSIDE', title: 'In cover: crops, bushes, open containers' }, { value: 'behind', label: 'BEHIND', title: 'Tucked behind something solid' }],
        S.inside ? 'in' : 'behind', v => { S.inside = v === 'in'; remember(); })), select.options()];
    },
  };

  /* ---------------- collision boxes ---------------- */
  const solid = {
    id: 'solid', label: 'Block', icon: '\u{1F9F1}', hotkey: 'c',
    help: 'Drag to draw a collision box (walls, water, thick forest). Hop-over boxes can be jumped; glass blocks bodies but not eyes. Turn on VIEW › Collision to see every box.',
    down(p) { const a = snapPt(p.x, p.y); this.r = { x0: a.x, y0: a.y, x1: a.x, y1: a.y }; if (!ed.layers.solids) { ed.layers.solids = true; ed.saveLayers(); ed.ui.onLayers(); } },
    move(p) { if (!this.r) return; const a = snapPt(p.x, p.y); this.r.x1 = a.x; this.r.y1 = a.y; ed.view.request(); },
    up(p) {
      const r = this.r;
      this.r = null;
      if (!r) return;
      const x = Math.min(r.x0, r.x1), y = Math.min(r.y0, r.y1), w = Math.abs(r.x1 - r.x0), hh = Math.abs(r.y1 - r.y0);
      if (w < 2 || hh < 2) {
        const s = ed.pick(p.x, p.y);
        ed.select(s ? [s] : []);
        return;
      }
      ed.edit('add collision box', (d) => {
        const o = { t: 'solid', x, y, w, h: hh };
        if (S.jumpable) o.jumpable = true;
        if (S.glass) o.glass = true;
        d.objects.push(o);
      });
      ed.select([{ k: 'obj', i: ed.doc.objects.length - 1 }]);
    },
    cancel() { this.r = null; ed.view.request(); },
    overlay(ctx, view, hair) {
      if (!this.r) return;
      const r = this.r;
      ctx.fillStyle = 'rgba(255, 94, 108, 0.2)'; ctx.strokeStyle = S.glass ? '#6ec2ff' : S.jumpable ? '#ffd75e' : '#ff5e6c';
      ctx.fillRect(Math.min(r.x0, r.x1), Math.min(r.y0, r.y1), Math.abs(r.x1 - r.x0), Math.abs(r.y1 - r.y0));
      ctx.lineWidth = hair * 1.5;
      ctx.strokeRect(Math.min(r.x0, r.x1), Math.min(r.y0, r.y1), Math.abs(r.x1 - r.x0), Math.abs(r.y1 - r.y0));
      ctx.lineWidth = hair;
    },
    options() {
      return [opt('NEW BOXES', check('Hop over', S.jumpable, v => { S.jumpable = v; remember(); }, 'The agent can jump it, aliens hop it'),
        check('Glass', S.glass, v => { S.glass = v; remember(); }, 'Blocks bodies, not line of sight')), select.options()];
    },
  };

  /* ---------------- ground art ---------------- */
  const art = {
    id: 'art', label: 'Art', icon: '\u{1F3A8}', hotkey: 'd',
    help: 'Paint art into the ground: mud, straw, scorch marks, dropped tools, forest canopy, dirt roads and footprint trails. Roads and trails: click their points, double-click (or Enter) to finish.',
    down(p) {
      const K = PAINT_KINDS[S.art];
      const a = snapPt(p.x, p.y);
      if (K.points) {
        if (!this.pts) this.pts = [];
        this.pts.push(a);
        ed.view.request();
        return;
      }
      if (K.rect && S.art !== 'scorch') { this.r = { x0: a.x, y0: a.y, x1: a.x, y1: a.y }; return; }
      this.add(K.make(a.x, a.y));
    },
    move(p) { this.at = p; if (this.r) { const a = snapPt(p.x, p.y); this.r.x1 = a.x; this.r.y1 = a.y; } ed.view.request(); },
    up() {
      const r = this.r;
      this.r = null;
      if (!r) return;
      const K = PAINT_KINDS[S.art];
      const w = Math.abs(r.x1 - r.x0), hh = Math.abs(r.y1 - r.y0);
      const o = w > 3 && hh > 3 ? K.make(Math.min(r.x0, r.x1), Math.min(r.y0, r.y1), w, hh) : K.make(r.x0, r.y0);
      this.add(o);
    },
    dbl() { this.finish(); },
    key(e) { if (e.key === 'Enter') { this.finish(); return true; } return false; },
    finish() {
      const pts = this.pts;
      this.pts = null;
      if (!pts) return;
      // a double-click lands two points on the same spot
      const clean = pts.filter((q, i) => i === 0 || Math.hypot(q.x - pts[i - 1].x, q.y - pts[i - 1].y) > 1);
      if (clean.length < 2) { toast('Click at least two points, then double-click to finish', 'warn'); ed.view.request(); return; }
      this.add(PAINT_KINDS[S.art].make(clean));
    },
    add(o) {
      ed.edit(`add ${PAINT_KINDS[o.op].label.toLowerCase()}`, (d) => { d.paint.push(o); });
      ed.select([{ k: 'paint', i: ed.doc.paint.length - 1 }]);
    },
    cancel() { this.pts = null; this.r = null; ed.view.request(); },
    reset() { this.pts = null; this.r = null; },
    hover(p) { this.at = p; ed.view.request(); },
    overlay(ctx, view, hair) {
      ctx.strokeStyle = '#d69bff'; ctx.fillStyle = '#d69bff'; ctx.lineWidth = hair * 1.5;
      if (this.pts) {
        ctx.beginPath();
        this.pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
        if (this.at) ctx.lineTo(this.at.x, this.at.y);
        ctx.stroke();
        for (const q of this.pts) ctx.fillRect(q.x - 2, q.y - 2, 4, 4);
      }
      if (this.r) {
        const r = this.r;
        ctx.strokeRect(Math.min(r.x0, r.x1), Math.min(r.y0, r.y1), Math.abs(r.x1 - r.x0), Math.abs(r.y1 - r.y0));
      }
      ctx.lineWidth = hair;
    },
    options() {
      const sel = h('select', Object.entries(PAINT_KINDS).map(([k, K]) => h('option', { value: k, selected: k === S.art }, `${K.icon} ${K.label}`)));
      sel.addEventListener('change', () => { S.art = sel.value; this.pts = null; remember(); ed.ui.onTool(); });
      return [opt('ART', sel, h('span.hint', { style: { margin: 0 } }, PAINT_KINDS[S.art].points ? 'click points, double-click to finish' : PAINT_KINDS[S.art].rect ? 'drag a box (or click)' : 'click to place')), select.options()];
    },
  };

  /* ---------------- crop field ---------------- */
  const crops = {
    id: 'crops', label: 'Crops', icon: '\u{1F33D}', hotkey: 'f',
    help: 'Drag a rectangle (in tiles) to plant a field: tilled soil with rows of tall corn or sunflowers you can wade through, with hiding spots in it.',
    down(p) { this.r = { tx0: p.tx, ty0: p.ty, tx1: p.tx, ty1: p.ty }; },
    move(p) { this.at = p; if (this.r) { this.r.tx1 = p.tx; this.r.ty1 = p.ty; } ed.view.request(); },
    up() {
      const r = this.r;
      this.r = null;
      if (!r || !ed.doc) return;
      const tx = clamp(Math.min(r.tx0, r.tx1), 0, ed.doc.tw - 1), ty = clamp(Math.min(r.ty0, r.ty1), 0, ed.doc.th - 1);
      const tw = Math.min(ed.doc.tw - tx, Math.abs(r.tx1 - r.tx0) + 1), th = Math.min(ed.doc.th - ty, Math.abs(r.ty1 - r.ty0) + 1);
      if (tw < 1 || th < 1) return;
      const pitch = S.crop === 'corn' ? 8 : 16;
      const seed0 = 1 + Math.floor(Math.random() * 5000);
      ed.edit(`plant ${S.crop}`, (d) => {
        for (let y = ty; y < ty + th; y++) for (let x = tx; x < tx + tw; x++) d.ground[y][x] = T.SOIL;
        for (let k = 0, base = ty * TILE + (pitch === 8 ? 6 : 12); base < (ty + th) * TILE; k++, base += pitch) {
          const def = cropAsset(S.crop, tw * TILE, seed0 + k);
          d.objects.push({ t: 'prop', a: `crop:${S.crop}:${tw * TILE}:${seed0 + k}`, x: tx * TILE, y: base - def.img.height + 1 });
        }
        if (S.cropSpots) {
          const sx = Math.max(1, Math.round(tw * TILE / 48)), sy = Math.max(1, Math.round(th * TILE / 44));
          for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) {
            d.objects.push({ t: 'hide', x: Math.round(tx * TILE + (i + 0.5) * tw * TILE / sx), y: Math.round(ty * TILE + (j + 0.5) * th * TILE / sy), inside: true });
          }
        }
      });
    },
    cancel() { this.r = null; ed.view.request(); },
    hover(p) { this.at = p; ed.view.request(); },
    overlay(ctx, view, hair) {
      ctx.strokeStyle = '#9ee07f'; ctx.lineWidth = hair * 1.5;
      if (this.r) {
        const r = this.r, x0 = Math.min(r.tx0, r.tx1), y0 = Math.min(r.ty0, r.ty1);
        ctx.fillStyle = 'rgba(158, 224, 127, 0.15)';
        ctx.fillRect(x0 * TILE, y0 * TILE, (Math.abs(r.tx1 - r.tx0) + 1) * TILE, (Math.abs(r.ty1 - r.ty0) + 1) * TILE);
        ctx.strokeRect(x0 * TILE, y0 * TILE, (Math.abs(r.tx1 - r.tx0) + 1) * TILE, (Math.abs(r.ty1 - r.ty0) + 1) * TILE);
      } else if (this.at) ctx.strokeRect(this.at.tx * TILE, this.at.ty * TILE, TILE, TILE);
      ctx.lineWidth = hair;
    },
    options() {
      return [opt('CROP', seg([{ value: 'corn', label: 'CORN' }, { value: 'sunflower', label: 'SUNFLOWERS' }], S.crop, v => { S.crop = v; remember(); }),
        check('Add hiding spots', S.cropSpots, v => { S.cropSpots = v; remember(); }))];
    },
  };

  /* ---------------- buildings ---------------- */
  const building = {
    id: 'building', label: 'Build', icon: '\u{1F3DA}', hotkey: 'u',
    help: 'Click to put down a walk-in building (its roof lifts while the agent is inside). Resize it and edit its doors in the EDIT panel.',
    spot(p) {
      const D = BUILDING_KINDS[S.building].defaults;
      return { x: Math.round((p.x - D.w / 2) / TILE) * TILE, y: Math.round((p.y - D.d / 2) / TILE) * TILE, w: D.w, d: D.d };
    },
    down(p) {
      const s = this.spot(p);
      ed.edit(`add ${S.building}`, (d) => { d.objects.push(newBuilding(S.building, s.x, s.y, uniqueBuildingId(d, S.building))); });
      ed.select([{ k: 'obj', i: ed.doc.objects.length - 1 }]);
      ed.setTool('select');
    },
    hover(p) { this.at = p; ed.view.request(); },
    overlay(ctx, view, hair) {
      if (!this.at) return;
      const s = this.spot(this.at);
      ctx.fillStyle = 'rgba(255, 215, 94, 0.15)'; ctx.strokeStyle = '#ffd75e'; ctx.lineWidth = hair * 1.5;
      ctx.fillRect(s.x, s.y, s.w, s.d); ctx.strokeRect(s.x, s.y, s.w, s.d);
      ctx.lineWidth = hair;
    },
    options() {
      return [opt('BUILDING', seg(Object.entries(BUILDING_KINDS).map(([k, K]) => ({ value: k, label: K.name.toUpperCase() })), S.building, v => { S.building = v; remember(); }))];
    },
  };

  /* ---------------- erase ---------------- */
  const erase = {
    id: 'erase', label: 'Erase', icon: '\u{1F9F9}', hotkey: 'e',
    help: 'Click (or drag over) props, hiding spots, boxes and ground art to delete them.',
    down(p) { ed.beginWork(); this.on = true; this.zap(p); },
    move(p) { if (this.on) this.zap(p); else this.hover(p); },
    zap(p) {
      const s = ed.pick(p.x, p.y, { points: false });
      if (!s) return;
      const d = ed.doc;
      if (s.k === 'obj') d.objects.splice(s.i, 1);
      else if (s.k === 'paint') d.paint.splice(s.i, 1);
      else return;
      ed.sel = [];
      ed.rebuild();
    },
    up() { if (this.on) { this.on = false; ed.endWork('erase'); ed.ui.onSelection(); } },
    cancel() { if (this.on) { this.on = false; ed.cancelWork(); } },
    hover(p) { ed.hover = ed.pick(p.x, p.y, { points: false }); ed.view.request(); },
  };

  return { select, pan, brush, rect, fill, eyedrop, prop, hide, solid, art, crops, building, erase };
}

export const TOOL_ORDER = ['select', 'pan', '-', 'brush', 'rect', 'fill', 'eyedrop', '-', 'prop', 'crops', 'building', 'hide', 'solid', 'art', '-', 'erase'];
