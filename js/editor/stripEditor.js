// Highway 29 in the editor. Its woods are grown from code as the agent
// walks (no two runs need the same layout stored), so there's no map to
// paint; what can be edited is the hand-placed set pieces: the gas station
// lot + verge, and the clearing's stumps and rocks. This shows a preview of
// that stretch exactly as the game lays it out, and lets the Select, Prop
// and Erase tools move, add and remove the pieces in it.
import { buildHighway29, defaultStripDoc } from '../data/maps.js';
import { CW, NP, TH } from '../data/highwayStrip.js';
import { getAsset, assetInfo } from '../data/assets.js';
import { TILE } from '../data/sprites.js';
import { paintMapGround } from '../groundRender.js';
import { $, h, clear, thumb, toast, confirmBox } from './dom.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const SECTIONS = {
  station: {
    label: 'GAS STATION', list: 'station', queue: ['woods', 'final', 'final', 'final'], after: 'backdrop', span: CW * 3,
    help: 'Highway 29 and the gas station across it, the last stretch of Scene 3. The trucker walks out of the store’s door in the getaway cutscene, so moving the store moves him too.',
  },
  clearing: {
    label: 'CLEARING', list: 'clearing', queue: ['clearing', 'forest'], after: 'forest', span: CW,
    help: 'The sunny clearing about halfway through the woods: its stumps, rock and bracken.',
  },
};
export const STRIP_TOOLS = ['select', 'pan', 'prop', 'erase'];

export function openStrip(ed, ws, id, hooks) {
  if (ed.strip) ed.strip.leave();
  ed.strip = new StripSession(ed, ws, id, hooks);
  ed.strip.enter();
}

export function leaveStrip(ed) {
  if (ed.strip) ed.strip.leave();
}

class StripSession {
  constructor(ed, ws, id, hooks) {
    this.ed = ed;
    this.ws = ws;
    this.id = id;
    this.hooks = hooks;
    this.section = 'station';
    this.grounds = {};
    this.work = null;               // the doc mid-drag
  }

  get doc() { return this.work || this.ws.doc(this.id); }
  get S() { return SECTIONS[this.section]; }
  get pieces() { return this.doc[this.S.list]; }

  enter() {
    const ed = this.ed;
    if (ed.working) ed.cancelWork();
    ed.id = this.id;
    ed.sel = [];
    ed.hover = null;
    // the view reads a few doc fields; a stand-in with nothing in it
    ed.doc = { tw: NP * CW / TILE, th: TH, ground: [], objects: [], paint: [], story: {}, van: { x: 0, y: 0 }, spawn: { x: 0, y: 0 } };
    document.body.classList.add('strip-mode');
    if (!['select', 'pan', 'prop', 'erase'].includes(ed.tool.id)) ed.setTool('select');
    this.rebuild();
    this.frame();
    this.note();
    ed.ui.onSelection();
    ed.ui.onDoc();
    ed.ui.showTab('palette', 'props');
  }

  leave() {
    document.body.classList.remove('strip-mode');
    $('#strip-note').classList.add('hidden');
    this.ed.strip = null;
  }

  frame() {
    const m = this.ed.map;
    const o = this.origin();
    const v = this.ed.view;
    // the whole section, with a bit of the woods either side
    const z = Math.min((v.cssW - 40) / (this.S.span + 96), (v.cssH - 130) / m.h);
    v.z = z >= 1 ? Math.floor(z * 4) / 4 : Math.max(0.25, z);
    v.centerOn(o + this.S.span / 2, m.h / 2 + 30 / v.z);
  }

  // Where the section starts on the preview canvas.
  origin() {
    const st = this.ed.map.strip;
    return (this.section === 'station' ? st.finalAt : st.clearingAt) * CW;
  }

  rebuild() {
    const ed = this.ed;
    const m = buildHighway29(ed.assets, { edit: this.doc, queue: this.S.queue, after: this.S.after });
    // the ground doesn't depend on the set pieces: paint it once a section
    if (!this.grounds[this.section]) this.grounds[this.section] = paintMapGround(m, ed.assets.tiles);
    ed.map = m;
    ed.ground = this.grounds[this.section];
    ed.view.invalidateNav();
    ed.view.request();
  }

  // ws said the doc changed (an edit, undo, redo)
  refresh() { this.work = null; this.ed.sel = this.ed.sel.filter(s => s.k === 'set' && this.pieces[s.i]); this.rebuild(); this.ed.ui.onSelection(); this.ed.ui.onDoc(); }

  commit(doc, label) {
    this.work = null;
    if (!this.ws.commit(this.id, doc, label)) this.rebuild();
  }

  note() {
    const el = clear($('#strip-note'));
    el.classList.remove('hidden');
    el.append(h('b', 'Highway 29 '), 'grows its woods from code as the agent walks, so there’s no map to paint. Its hand-placed set pieces can be moved, added and removed: ',
      h('div.btn-row', { style: { margin: '6px 0 0' } }, Object.entries(SECTIONS).map(([k, S]) =>
        h(`button.chip${this.section === k ? '.on' : ''}`, { type: 'button', onclick: () => this.setSection(k) }, S.label))));
  }

  setSection(k) {
    this.section = k;
    this.ed.sel = [];
    this.rebuild();
    this.frame();
    this.note();
    this.ed.ui.onSelection();
    this.ed.ui.onDoc();
  }

  /* ---------------- picking + boxes ---------------- */

  propOf(i) { return this.ed.map.props.find(p => p.setPiece && p.setPiece.list === this.S.list && p.setPiece.i === i); }

  boxOf(s) {
    const pr = s.k === 'set' && this.propOf(s.i);
    return pr ? { x: pr.x, y: pr.y, w: pr.img.width, h: pr.img.height } : null;
  }

  pick(x, y) {
    const props = this.ed.map.props.filter(p => p.setPiece && p.setPiece.list === this.S.list).sort((a, b) => b.baseY - a.baseY);
    for (const p of props) if (x >= p.x && x < p.x + p.img.width && y >= p.y && y < p.y + p.img.height) return { k: 'set', i: p.setPiece.i };
    return null;
  }

  pickBox(x0, y0, x1, y1) {
    const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)], [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
    return this.ed.map.props.filter(p => p.setPiece && p.setPiece.list === this.S.list)
      .filter(p => p.x + p.img.width / 2 >= ax && p.x + p.img.width / 2 <= bx && p.baseY >= ay && p.baseY <= by)
      .map(p => ({ k: 'set', i: p.setPiece.i }));
  }

  /* ---------------- changes ---------------- */

  startMove() {
    const start = clone(this.ws.doc(this.id));
    const sel = this.ed.sel.filter(s => s.k === 'set');
    const list = this.S.list;
    return {
      move: (dx, dy) => {
        const g = Math.max(1, this.ed.snap);
        const ddx = Math.round(dx / g) * g, ddy = Math.round(dy / g) * g;
        const d = clone(start);
        for (const s of sel) { d[list][s.i].x += ddx; d[list][s.i].base += ddy; }
        this.work = d;
        this.rebuild();
      },
      end: () => { if (this.work) this.commit(this.work, 'move set piece'); },
      cancel: () => { this.work = null; this.rebuild(); },
    };
  }

  edit(label, fn) {
    const d = clone(this.ws.doc(this.id));
    if (fn(d) === false) return;
    this.commit(d, label);
  }

  nudge(dx, dy) {
    const sel = this.ed.sel.filter(s => s.k === 'set');
    if (!sel.length) return;
    this.edit('nudge', (d) => { for (const s of sel) { d[this.S.list][s.i].x += dx; d[this.S.list][s.i].base += dy; } });
  }

  deleteSelection() {
    const idx = new Set(this.ed.sel.filter(s => s.k === 'set').map(s => s.i));
    if (!idx.size) return;
    this.edit('delete set piece', (d) => { d[this.S.list] = d[this.S.list].filter((_, i) => !idx.has(i)); });
    this.ed.sel = [];
    this.ed.ui.onSelection();
  }

  duplicate() {
    const sel = this.ed.sel.filter(s => s.k === 'set');
    if (!sel.length) return;
    const n0 = this.pieces.length;
    this.edit('duplicate set piece', (d) => { for (const s of sel) d[this.S.list].push({ ...d[this.S.list][s.i], x: d[this.S.list][s.i].x + 16, base: d[this.S.list][s.i].base + 16 }); });
    this.ed.select(sel.map((_, k) => ({ k: 'set', i: n0 + k })));
  }

  // A prop the Prop tool put down at canvas top-left (x, y).
  addPiece(a, x, y) {
    const def = getAsset(a);
    if (!def) return;
    const o = this.origin();
    const q = this.section === 'station'
      ? { a, x: Math.round(x - o), base: Math.round(y + def.img.height) }
      : { a, x: Math.round(x + def.img.width / 2 - o), base: Math.round(y + def.img.height) };
    if (q.x < 0 || q.x >= this.S.span) { toast(`Put it inside the ${this.S.label.toLowerCase()} stretch (between the dashed lines): set pieces outside it never stream in`, 'warn', 5000); return; }
    const n = this.pieces.length;
    this.edit('add set piece', (d) => { d[this.S.list].push(q); });
    this.ed.select([{ k: 'set', i: n }]);
  }

  erase(s) {
    if (!s || s.k !== 'set') return;
    this.edit('erase set piece', (d) => { d[this.S.list].splice(s.i, 1); });
    this.ed.sel = [];
    this.ed.ui.onSelection();
  }

  overlay(ctx, view, hair) {
    // the section's bounds: pieces outside them never get laid out
    const o = this.origin(), m = this.ed.map;
    ctx.strokeStyle = '#ffd75e';
    ctx.setLineDash([6 * hair, 4 * hair]);
    ctx.lineWidth = hair * 1.5;
    ctx.beginPath();
    for (const x of [o, o + this.S.span]) { ctx.moveTo(x, 0); ctx.lineTo(x, m.h); }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = hair;
  }

  /* ---------------- panels ---------------- */

  inspector(root) {
    clear(root);
    const sel = this.ed.sel.filter(s => s.k === 'set');
    if (!sel.length) {
      root.append(h('div.sec-title', `HIGHWAY 29 · ${this.S.label}`), h('p.hint', this.S.help),
        h('p.hint', 'Click a set piece to select it, drag to move it. Pick a prop in ADD and click inside the dashed lines to add one. Erase (or Delete) removes one.'));
      return;
    }
    if (sel.length > 1) {
      root.append(h('div.sec-title', `${sel.length} SET PIECES`), h('div.btn-row', h('button.btn.small', { type: 'button', onclick: () => this.duplicate() }, 'DUPLICATE'),
        h('button.btn.small.danger', { type: 'button', onclick: () => this.deleteSelection() }, 'DELETE')));
      return;
    }
    const i = sel[0].i, q = this.pieces[i];
    const def = getAsset(q.a), info = assetInfo(q.a);
    root.append(h('div.sec-title', (info ? info.name : q.a).toUpperCase(), h('span.sub', q.a)));
    if (def) { const c = thumb(def.img, Math.min(280, def.img.width * 3), Math.min(150, def.img.height * 3)); c.className = 'thumb-big'; root.append(c); }
    const num = (label, key, help) => {
      const inp = h('input', { type: 'number', value: q[key] });
      inp.addEventListener('change', () => this.edit(`set ${key}`, (d) => { d[this.S.list][i][key] = Math.round(+inp.value); }));
      return h('div.field', h('div.k', label), h('div.v', inp, help ? h('span.xy', help) : null));
    };
    root.append(num(this.section === 'station' ? 'Left edge X' : 'Middle X', 'x', `0–${this.S.span - 1}`), num('Base Y', 'base', 'ground line'));
    if (q.a === 'hwy:store') root.append(h('div.note-box.gold', 'The getaway cutscene uses this: the trucker walks out of the store’s door with his coffee.'));
    root.append(h('div.btn-row', h('button.btn.small', { type: 'button', onclick: () => this.duplicate() }, 'DUPLICATE'),
      h('button.btn.small.danger', { type: 'button', onclick: () => this.deleteSelection() }, 'DELETE')));
  }

  mapPanel(root) {
    clear(root);
    const st = this.ws.status(this.id);
    root.append(h('div.sec-title', 'HIGHWAY 29', h('span.sub', 'Stage 1, Scene 3')),
      h('p.hint', 'The woods stream in from code as the agent walks: thick woods, a clearing, a creek, open woods, then Highway 29 and the gas station. The hand-placed set pieces are what you can rearrange.'),
      h('div.note-box', st.draft ? 'Edited (not published yet). PLAY TEST plays Scene 3 with it.' : st.published ? 'Edited and published.' : 'As built into the game.'),
      h('div.sec-title', 'SECTION'),
      h('div.chips', Object.entries(SECTIONS).map(([k, S]) => h(`button.chip${this.section === k ? '.on' : ''}`, { type: 'button', onclick: () => { this.setSection(k); this.mapPanel(root); } }, S.label))),
      h('p.hint', { style: { marginTop: '8px' } }, this.S.help),
      h('div.btn-row', h('button.btn.small', { type: 'button', onclick: async () => {
        if (!await confirmBox(`Reset the ${this.S.label.toLowerCase()}?`, 'Its set pieces go back to how the game lays them out.', 'Reset', true)) return;
        const def = defaultStripDoc(this.id);
        this.edit('reset section', (d) => { d[this.S.list] = def[this.S.list]; });
      } }, 'RESET THIS SECTION')));
  }
}
