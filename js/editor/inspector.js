// The EDIT panel: every field of whatever is selected. Each change is one
// undo step (ed.edit).
import { TILE } from '../data/sprites.js';
import { getAsset, assetInfo, isOverridden, tileName, TILE_NAMES } from '../data/assets.js';
import { BUILDING_KINDS, MAP_INFO } from '../data/maps.js';
import { h, clear, thumb } from './dom.js';
import { PAINT_KINDS, BUILDING_FIELDS } from './schema.js';
import { fitDoors } from './mapEditor.js';

const STORY_MAPS = ['farmfields', 'barnyard'];

export function renderInspector(ed, root, hooks) {
  clear(root);
  const d = ed.doc;
  if (!d) return;
  const sel = ed.sel;

  // a field that writes through ed.edit
  const num = (label, value, apply, o = {}) => {
    const i = h('input', { type: 'number', value: Math.round(value * 100) / 100, step: o.step || 1, min: o.min, max: o.max });
    i.addEventListener('change', () => {
      let v = +i.value;
      if (!isFinite(v)) return;
      if (o.min !== undefined) v = Math.max(o.min, v);
      if (o.max !== undefined) v = Math.min(o.max, v);
      ed.edit(`set ${label.toLowerCase()}`, (doc) => apply(doc, v));
    });
    return h('div.field', h('div.k', label), h('div.v', i, o.unit ? h('span.xy', o.unit) : null));
  };
  const flag = (label, value, apply, small = '') => {
    const i = h('input', { type: 'checkbox', checked: !!value });
    i.addEventListener('change', () => ed.edit(`set ${label.toLowerCase()}`, (doc) => apply(doc, i.checked)));
    return h('label.check', i, h('span', label, small ? h('small', small) : null));
  };
  const pick = (label, value, options, apply) => {
    const s = h('select', options.map(o => h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label)));
    s.addEventListener('change', () => ed.edit(`set ${label.toLowerCase()}`, (doc) => apply(doc, s.value)));
    return h('div.field', h('div.k', label), h('div.v', s));
  };
  const text = (label, value, apply) => {
    const i = h('input', { type: 'text', value: value ?? '' });
    i.addEventListener('change', () => ed.edit(`set ${label.toLowerCase()}`, (doc) => apply(doc, i.value.trim())));
    return h('div.field', h('div.k', label), h('div.v', i));
  };
  const tileOptions = (withNone) => (withNone ? [{ value: '', label: '(none: keep painted tiles)' }] : [])
    .concat(Object.keys(TILE_NAMES).map(Number).filter(id => ed.assets.tiles[id]).sort((a, b) => a - b).map(id => ({ value: id, label: `${tileName(id)} (#${id})` })));
  const actions = (...btns) => h('div.btn-row', btns);
  const btn = (label, fn, kind = '') => h(`button.btn.small${kind ? '.' + kind : ''}`, { type: 'button', onclick: fn }, label);
  const common = () => actions(btn('DUPLICATE', () => ed.duplicate()), btn('DELETE', () => ed.deleteSelection(), 'danger'));

  if (!sel.length) {
    root.appendChild(h('div.sec', h('div.sec-title', 'NOTHING SELECTED'),
      h('p.hint', 'Pick the ', h('b', 'Select'), ' tool (V) and click anything on the map: a prop, a hiding spot, a building, the van, a road.'),
      h('p.hint', 'Drag to move it. Shift+click to select more, or drag a box on empty ground. ', h('b', 'Delete'), ' removes, ', h('b', 'Ctrl+D'), ' duplicates, arrow keys nudge (Shift: a whole tile).'),
      h('p.hint', 'Every change is saved as a draft in this browser straight away. ', h('b', 'PLAY TEST'), ' plays it; ', h('b', 'PUBLISH'), ' puts it in the game for everyone.')));
    return;
  }

  if (sel.length > 1) {
    const counts = {};
    for (const s of sel) {
      const k = s.k === 'obj' ? d.objects[s.i].t : s.k;
      counts[k] = (counts[k] || 0) + 1;
    }
    root.appendChild(h('div.sec', h('div.sec-title', `${sel.length} SELECTED`),
      h('p.hint', Object.entries(counts).map(([k, n]) => `${n} ${k}${n > 1 ? 's' : ''}`).join(', ')),
      h('p.hint', 'Drag any of them to move them all; arrow keys nudge.'),
      actions(btn('DUPLICATE', () => ed.duplicate()), btn('COPY', () => ed.copySelection()), btn('DELETE ALL', () => ed.deleteSelection(), 'danger'))));
    return;
  }

  const s = sel[0];
  const sec = h('div.sec');
  root.appendChild(sec);

  if (s.k === 'van') {
    sec.append(h('div.sec-title', 'THE VAN'), h('p.hint', 'Where the agent secures captured aliens: the glowing door at the back.'),
      num('X', d.van.x, (doc, v) => { doc.van.x = v; }), num('Y', d.van.y, (doc, v) => { doc.van.y = v; }),
      flag('Facing right', d.van.flip, (doc, v) => { if (v) doc.van.flip = true; else delete doc.van.flip; }, 'Turns it round: the door is then on the left'));
    return;
  }
  if (s.k === 'spawn') {
    sec.append(h('div.sec-title', 'AGENT SPAWN'), h('p.hint', 'Where the agent starts. Aliens start in hiding spots at least 140px away.'),
      num('X', d.spawn.x, (doc, v) => { doc.spawn.x = v; }), num('Y', d.spawn.y, (doc, v) => { doc.spawn.y = v; }));
    return;
  }
  if (s.k === 'arrive') {
    sec.append(h('div.sec-title', 'WALK-IN START'), h('p.hint', 'Scene 2 opens with the agent jogging in from here, up the story road to the spawn point.'),
      num('X', d.story.arrive.x, (doc, v) => { doc.story.arrive.x = v; }), num('Y', d.story.arrive.y, (doc, v) => { doc.story.arrive.y = v; }));
    return;
  }
  if (s.k === 'treeLine') {
    sec.append(h('div.sec-title', 'TREE LINE'), h('p.hint', 'At the end of Scene 2 the aliens still loose bolt north past this line and into the trees.'),
      num('Y', d.story.treeLine, (doc, v) => { doc.story.treeLine = v; }));
    return;
  }
  if (s.k === 'pt') {
    const o = d.paint[s.i];
    const p = o.pts[s.j];
    sec.append(h('div.sec-title', `POINT ${s.j + 1} OF ${o.pts.length}`, h('span.sub', PAINT_KINDS[o.op].label)),
      num('X', p.x, (doc, v) => { doc.paint[s.i].pts[s.j].x = v; }), num('Y', p.y, (doc, v) => { doc.paint[s.i].pts[s.j].y = v; }),
      actions(btn('SELECT WHOLE PATH', () => ed.select([{ k: 'paint', i: s.i }])),
        btn('REMOVE POINT', () => ed.deleteSelection(), 'danger')));
    return;
  }

  if (s.k === 'paint') {
    const o = d.paint[s.i];
    const K = PAINT_KINDS[o.op];
    sec.append(h('div.sec-title', `${K.icon} ${K.label.toUpperCase()}`, h('span.sub', 'ground art')));
    if (K.help) sec.append(h('p.hint', K.help));
    for (const [key, label, type, opts = {}] of K.fields) {
      if (type === 'select') sec.append(pick(label, o[key], opts.options.map(v => ({ value: v, label: v })), (doc, v) => { doc.paint[s.i][key] = v; }));
      else if (type === 'deg') sec.append(num(label, (o[key] || 0) * 180 / Math.PI, (doc, v) => { doc.paint[s.i][key] = v * Math.PI / 180; }, { unit: '°' }));
      else if (type === 'tiles') {
        const tex = o.tex || [];
        [0, 1].forEach(k => sec.append(pick(`${label} ${k + 1}`, tex[k] ?? tex[0], tileOptions(false), (doc, v) => {
          const t = (doc.paint[s.i].tex || [29, 31]).slice();
          t[k] = +v;
          doc.paint[s.i].tex = t;
        })));
      } else sec.append(num(label, o[key] ?? 0, (doc, v) => { doc.paint[s.i][key] = Math.round(v); }, opts));
    }
    if (o.op === 'path' && STORY_MAPS.includes(d.id)) {
      sec.append(flag('Story road', o.id === 'road', (doc, v) => {
        for (const q of doc.paint) if (q.id === 'road') delete q.id;
        if (v) doc.paint[s.i].id = 'road';
      }, d.id === 'farmfields' ? 'The stampede at the end of Scene 1 runs up this road (in point order) and off the map at its last point.' : 'The agent jogs in along this road at the start of Scene 2.'));
    }
    if (o.pts) {
      sec.append(h('p.hint', `${o.pts.length} points. Drag a point to move it; Alt+click the road to add one; double-click a point to remove it.`),
        actions(btn('REVERSE DIRECTION', () => ed.edit('reverse path', (doc) => { doc.paint[s.i].pts.reverse(); }))));
    }
    sec.append(h('div.sec-title', 'DRAWING ORDER', h('span.sub', `${s.i + 1} of ${d.paint.length}`)),
      h('p.hint', 'Ground art is painted in order: later art goes over earlier art.'),
      actions(
        btn('TO BACK', () => movePaintOrder(ed, s.i, 0)), btn('BACK ONE', () => movePaintOrder(ed, s.i, s.i - 1)),
        btn('FORWARD ONE', () => movePaintOrder(ed, s.i, s.i + 1)), btn('TO FRONT', () => movePaintOrder(ed, s.i, d.paint.length - 1))),
      common());
    return;
  }

  const o = d.objects[s.i];
  if (!o) return;
  const set = (fn) => (doc, v) => fn(doc.objects[s.i], v);

  if (o.t === 'prop') {
    const def = getAsset(o.a), info = assetInfo(o.a);
    sec.append(h('div.sec-title', info ? info.name.toUpperCase() : o.a, h('span.sub', o.a)));
    if (def) {
      const c = thumb(def.img, Math.min(280, Math.max(48, def.img.width * 3)), Math.min(150, Math.max(40, def.img.height * 3)));
      c.className = 'thumb-big';
      sec.append(c);
    } else sec.append(h('div.note-box.red', `This prop's asset (${o.a}) doesn't exist, so it isn't drawn in the game.`));
    sec.append(num('X', o.x, set((q, v) => { q.x = v; })), num('Y', o.y, set((q, v) => { q.y = v; })));
    if (def) {
      const facts = [];
      facts.push(def.solid ? `${def.jumpable ? 'hop-over' : 'solid'} ${def.solid.w}×${def.solid.h} collision` : 'no collision (walk through)');
      if (def.hide) facts.push('aliens hide in/behind it');
      if (def.tall) facts.push('tall (the agent goes behind it)');
      if (def.windows) facts.push('lit windows (noise meter)');
      if (def.crater) facts.push('smoking crater');
      sec.append(h('div.note-box', facts.join(' · '), isOverridden(o.a) ? h('div', { style: { color: '#ffd75e', marginTop: '4px' } }, 'Repainted in the asset editor.') : null,
        h('div.btn-row', btn('EDIT THIS ASSET', () => hooks.editAsset(o.a)), btn('SWAP FOR PALETTE PROP', () => {
          const a = ed.toolState.asset;
          const nd = getAsset(a);
          if (!nd || a === o.a) return;
          ed.edit('swap prop', (doc) => {
            const q = doc.objects[s.i];
            // keep its base where it was
            q.x = Math.round(q.x + def.img.width / 2 - nd.img.width / 2);
            q.y = Math.round(q.y + def.img.height - nd.img.height);
            q.a = a;
          });
        }))));
      if (def.solid) sec.append(flag('No collision', o.noSolid, set((q, v) => { if (v) q.noSolid = true; else delete q.noSolid; }), 'Walk straight through this one'));
      if (def.hide) sec.append(flag('No hiding spot', o.noHide, set((q, v) => { if (v) q.noHide = true; else delete q.noHide; }), 'Aliens won’t hide in this one'));
      if (def.tall) sec.append(flag('See-through crown', o.see, set((q, v) => { if (v) q.see = true; else delete q.see; }), 'Fades while the agent stands under it'));
    }
    // extras that move with it
    sec.append(h('div.sec-title', 'COMES WITH', h('span.sub', 'move with the prop')));
    sec.append(flag('Its own hiding spot', !!o.spot, set((q, v) => { if (v) q.spot = { x: Math.round((def ? def.img.width : 16) / 2), y: def ? def.img.height - 2 : 14, inside: true }; else delete q.spot; }),
      'A spot at an offset from the prop (like a pod’s open hatch)'));
    if (o.spot) {
      sec.append(num('Spot X', o.spot.x, set((q, v) => { q.spot.x = v; }), { unit: 'from left' }), num('Spot Y', o.spot.y, set((q, v) => { q.spot.y = v; }), { unit: 'from top' }),
        flag('Spot is inside cover', o.spot.inside, set((q, v) => { q.spot.inside = v; })));
    }
    sec.append(flag('Smoke column', !!(o.smoke && o.smoke.length), set((q, v) => { if (v) q.smoke = [{ x: Math.round((def ? def.img.width : 16) / 2), y: 4 }]; else delete q.smoke; })));
    if (o.smoke && o.smoke.length) sec.append(num('Smoke X', o.smoke[0].x, set((q, v) => { q.smoke[0].x = v; })), num('Smoke Y', o.smoke[0].y, set((q, v) => { q.smoke[0].y = v; })));
    sec.append(flag('Scorch mark under it', !!(o.decal && o.decal.op === 'scorch'), set((q, v) => {
      if (v) { const w = def ? def.img.width : 20; q.decal = { op: 'scorch', x: -Math.round(w * 0.3), y: -2, w: Math.round(w * 1.6), h: Math.round(w), seed: 1 + Math.floor(Math.random() * 999) }; } else delete q.decal;
    })));
    if (o.decal) sec.append(num('Scorch seed', o.decal.seed || 1, set((q, v) => { q.decal.seed = Math.round(v); })));
    sec.append(common());
    return;
  }

  if (o.t === 'hide') {
    const spot = ed.map.hideSpots.find(q => q.src === s.i);
    sec.append(h('div.sec-title', 'HIDING SPOT'),
      h('p.hint', 'Aliens start hidden in spots like this and run for them when chased.'),
      num('X', o.x, set((q, v) => { q.x = v; })), num('Y', o.y, set((q, v) => { q.y = v; })),
      pick('Kind', o.inside ? 'in' : 'behind', [{ value: 'in', label: 'Inside cover (crops, bushes)' }, { value: 'behind', label: 'Behind something solid' }],
        set((q, v) => { q.inside = v === 'in'; })));
    if (spot && spot.zone) sec.append(h('div.note-box', `Inside the building "${spot.zone}": its roof hides the rustling until the agent walks in.`));
    if (d.id === 'farmfields') sec.append(flag('Tutorial hider', o.tutor, (doc, v) => {
      for (const q of doc.objects) if (q.t === 'hide') delete q.tutor;
      if (v) doc.objects[s.i].tutor = true;
    }, 'Scene 1’s first alien always hides here, so a new player finds it'));
    sec.append(common());
    return;
  }

  if (o.t === 'solid') {
    sec.append(h('div.sec-title', 'COLLISION BOX'),
      h('p.hint', 'An invisible wall. Drag its corners to resize.'),
      num('X', o.x, set((q, v) => { q.x = v; })), num('Y', o.y, set((q, v) => { q.y = v; })),
      num('Width', o.w, set((q, v) => { q.w = v; }), { min: 1 }), num('Height', o.h, set((q, v) => { q.h = v; }), { min: 1 }),
      flag('Hop over', o.jumpable, set((q, v) => { if (v) q.jumpable = true; else delete q.jumpable; }), 'The agent can jump it and aliens hop it'),
      flag('Glass', o.glass, set((q, v) => { if (v) q.glass = true; else delete q.glass; }), 'Blocks bodies, not line of sight'),
      common());
    return;
  }

  if (o.t === 'building') {
    const K = BUILDING_KINDS[o.kind];
    sec.append(h('div.sec-title', `${(K ? K.name : o.kind).toUpperCase()}`, h('span.sub', 'walk-in building')),
      h('p.hint', 'Its roof lifts while the agent is inside. Dragging it brings everything inside along (hold Alt to move just the building).'),
      text('Id', o.id, (doc, v) => { doc.objects[s.i].id = v || o.kind; }));
    if (d.id === 'barnyard' && (o.id === 'barn' || o.id === 'greenhouse')) sec.append(h('div.note-box.gold', `Scene 2 hides aliens in the building with id "${o.id}". Keep the id to keep that.`));
    for (const [key, label, , opts] of BUILDING_FIELDS) {
      sec.append(num(label, o[key] ?? 0, set((q, v) => {
        q[key] = ['x', 'y', 'w', 'd'].includes(key) ? Math.round(v / TILE) * TILE : Math.round(v);
        if (key === 'w' || key === 'd' || key === 'wall') fitDoors(q);
      }), opts));
    }
    sec.append(pick('Floor', o.floor ?? '', tileOptions(true), set((q, v) => { if (v === '') delete q.floor; else q.floor = +v; })));
    sec.append(flag('Glass walls', o.glass, set((q, v) => { if (v) q.glass = true; else delete q.glass; }), 'You can see in (and aliens see out)'));
    sec.append(num('Roof when inside', o.insideAlpha || 0, set((q, v) => { q.insideAlpha = Math.max(0, Math.min(1, v)); }), { step: 0.1, min: 0, max: 1, unit: '0 = gone' }));
    sec.append(num('Roof when behind', o.behindAlpha ?? 0.4, set((q, v) => { q.behindAlpha = Math.max(0, Math.min(1, v)); }), { step: 0.1, min: 0, max: 1 }));
    sec.append(h('div.sec-title', 'DOORS', h('span.sub', 'px along each wall')));
    for (const [side, name, len] of [['s', 'Front (south)', o.w], ['n', 'Back (north)', o.w], ['e', 'Right (east)', o.d], ['w', 'Left (west)', o.d]]) {
      const dr = o.doors && o.doors[side];
      const row = h('div.field', h('div.k', name));
      const on = h('input', { type: 'checkbox', checked: !!dr });
      on.addEventListener('change', () => ed.edit('door', (doc) => {
        const q = doc.objects[s.i];
        q.doors = q.doors || {};
        if (on.checked) { const a = Math.round((len / 2 - 24) / 8) * 8; q.doors[side] = [Math.max(q.wall || 8, a), Math.min(len - (q.wall || 8), a + 48)]; }
        else delete q.doors[side];
      }));
      const v = h('div.v', on);
      if (dr) {
        for (const k of [0, 1]) {
          const i = h('input', { type: 'number', value: dr[k], step: 8, min: 0, max: len });
          i.addEventListener('change', () => ed.edit('door', (doc) => { doc.objects[s.i].doors[side][k] = Math.max(0, Math.min(len, Math.round(+i.value))); }));
          v.append(i);
        }
      }
      row.append(v);
      sec.append(row);
    }
    sec.append(h('p.hint', 'Side-wall doors only show as gaps in the cutaway (the barn art draws its east door). Front doors are drawn on the building.'), common());
  }
}

function movePaintOrder(ed, from, to) {
  const n = ed.doc.paint.length;
  to = Math.max(0, Math.min(n - 1, to));
  if (to === from) return;
  ed.edit('reorder ground art', (doc) => {
    const [o] = doc.paint.splice(from, 1);
    doc.paint.splice(to, 0, o);
  });
  ed.select([{ k: 'paint', i: to }]);
}

export { MAP_INFO };
