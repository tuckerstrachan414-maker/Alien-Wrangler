// The ADD (palette), VIEW (layers), MAP (settings) and CHECK (problems) panels.
import { TILE } from '../data/sprites.js';
import { listAssets, getAsset, isOverridden, tileName, TILE_NAMES } from '../data/assets.js';
import { BUILDING_KINDS, MAP_INFO } from '../data/maps.js';
import { h, clear, thumb, toast, confirmBox } from './dom.js';
import { PAINT_KINDS } from './schema.js';

/* ================= ADD ================= */

export function renderPalette(ed, root, sub = 'tiles') {
  clear(root);
  const S = ed.toolState;
  const tabs = h('div.chips', { style: { marginBottom: '10px' } });
  const body = h('div');
  const show = (k) => {
    for (const c of tabs.children) c.classList.toggle('on', c.dataset.k === k);
    ed.paletteSub = k;
    clear(body);
    if (k === 'tiles') tilesSection(ed, body);
    else if (k === 'props') propsSection(ed, body);
    else moreSection(ed, body);
  };
  for (const [k, label] of [['tiles', 'GROUND TILES'], ['props', 'PROPS'], ['more', 'BUILD + ART']]) {
    const c = h('button.chip', { type: 'button', onclick: () => show(k) }, label);
    c.dataset.k = k;
    tabs.appendChild(c);
  }
  root.append(tabs, body);
  show(sub || ed.paletteSub || 'tiles');
  void S;
}

function tilesSection(ed, body) {
  const S = ed.toolState;
  body.append(h('p.hint', 'Pick a tile, then paint with ', h('b', 'Paint'), ' (B), ', h('b', 'Rect'), ' (R) or ', h('b', 'Fill'), ' (G). Right-click the map to pick up the tile under the cursor.'));
  const ids = Object.keys(TILE_NAMES).map(Number).filter(id => ed.assets.tiles[id]).sort((a, b) => a - b);
  const grid = h('div.swatches');
  for (const id of ids) {
    const c = document.createElement('canvas');
    c.width = TILE; c.height = TILE;
    c.getContext('2d').drawImage(ed.assets.tiles[id], 0, 0);
    const b = h(`button.swatch${S.tile === id ? '.on' : ''}`, { type: 'button', title: `${tileName(id)} (#${id})` }, c);
    b.addEventListener('click', () => {
      S.tile = id;
      for (const x of grid.children) x.classList.remove('on');
      b.classList.add('on');
      if (!ed.tool.tiles) ed.setTool('brush'); else ed.ui.onTool();
    });
    grid.appendChild(b);
  }
  body.append(grid, h('p.hint', { style: { marginTop: '10px' } }, 'Tiles with soft edges blend into their neighbours on maps with ', h('b', 'Soft ground edges'), ' on (MAP tab). New tiles are made in ASSETS.'));
}

function propsSection(ed, body) {
  const S = ed.toolState;
  const search = h('input.search', { type: 'search', placeholder: 'Search props…', value: ed.propSearch || '' });
  const list = h('div');
  const draw = () => {
    clear(list);
    const q = search.value.trim().toLowerCase();
    ed.propSearch = search.value;
    const groups = new Map();
    for (const a of listAssets()) {
      if (q && !a.name.toLowerCase().includes(q) && !a.id.toLowerCase().includes(q)) continue;
      if (!groups.has(a.group)) groups.set(a.group, []);
      groups.get(a.group).push(a);
    }
    if (!groups.size) list.append(h('p.hint', 'No props match.'));
    for (const [g, items] of groups) {
      list.append(h('div.group-title', g));
      const grid = h('div.assets-grid');
      for (const a of items) {
        const def = getAsset(a.id);
        const card = h(`button.asset-card${S.asset === a.id ? '.on' : ''}${isOverridden(a.id) || a.kind === 'custom' ? '.mod' : ''}`,
          { type: 'button', title: `${a.name} (${a.id})` }, thumb(def.img, 52, 44), h('span.nm', a.name));
        card.addEventListener('click', () => {
          S.asset = a.id;
          for (const x of list.querySelectorAll('.asset-card')) x.classList.remove('on');
          card.classList.add('on');
          if (ed.tool.id !== 'prop') ed.setTool('prop'); else ed.ui.onTool();
        });
        grid.appendChild(card);
      }
      list.append(grid);
    }
  };
  search.addEventListener('input', draw);
  body.append(search, h('p.hint', 'Pick a prop, then click the map to place it (its base goes where you click). Alt+click a prop on the map with the Pick tool to grab its kind.'), list);
  draw();
}

function moreSection(ed, body) {
  const S = ed.toolState;
  const btn = (label, title, fn) => h('button.chip', { type: 'button', title, onclick: fn }, label);
  body.append(h('div.sec-title', 'WALK-IN BUILDINGS'),
    h('div.chips', Object.entries(BUILDING_KINDS).map(([k, K]) => btn(K.name.toUpperCase(), `Put down a ${K.name.toLowerCase()}`, () => { S.building = k; ed.setTool('building'); }))),
    h('p.hint', 'The roof lifts while the agent is inside. Resize and edit doors in EDIT.'));
  body.append(h('div.sec-title', 'GROUND ART'),
    h('div.chips', Object.entries(PAINT_KINDS).map(([k, K]) => btn(`${K.icon} ${K.label}`, K.help || '', () => { S.art = k; ed.setTool('art'); }))),
    h('p.hint', 'Painted into the ground under everything. Roads and footprints: click points, double-click to finish.'));
  body.append(h('div.sec-title', 'TALL CROPS'),
    h('div.chips', btn('\u{1F33D} CORN FIELD', '', () => { S.crop = 'corn'; ed.setTool('crops'); }), btn('\u{1F33B} SUNFLOWER FIELD', '', () => { S.crop = 'sunflower'; ed.setTool('crops'); })),
    h('p.hint', 'Drag a rectangle: soil, rows to wade through, hiding spots.'));
  body.append(h('div.sec-title', 'GAMEPLAY'),
    h('div.chips',
      btn('\u{1F441} HIDING SPOT (INSIDE)', 'In cover: crops, bushes', () => { S.inside = true; ed.setTool('hide'); }),
      btn('\u{1F441} HIDING SPOT (BEHIND)', 'Tucked behind something solid', () => { S.inside = false; ed.setTool('hide'); }),
      btn('\u{1F9F1} COLLISION BOX', 'An invisible wall', () => { S.jumpable = false; S.glass = false; ed.setTool('solid'); }),
      btn('\u{1F9F1} HOP-OVER BOX', 'A low wall the agent can jump', () => { S.jumpable = true; S.glass = false; ed.setTool('solid'); })),
    h('p.hint', 'The van and the agent’s spawn are always on the map: select and drag them.'));
}

/* ================= VIEW ================= */

const LAYER_ROWS = [
  ['ground', 'Ground', 'Tiles + painted ground art'],
  ['props', 'Props', ''],
  ['buildings', 'Buildings', ''],
  ['van', 'Van + spawn', ''],
  ['hides', 'Hiding spots', 'green: inside cover, orange: behind'],
  ['solids', 'Collision', 'red: solid, yellow: hop-over, blue: glass. Solid outline = a box of its own; dashed = from a prop'],
  ['nav', 'Nav grid', 'How the aliens see the map: red cells walls, yellow cells hop-over'],
  ['paint', 'Ground art outlines', 'Roads, decals, forest (to select them)'],
  ['fx', 'Smoke, craters, windows', ''],
  ['story', 'Story markers', 'Story road, tree line, walk-in start, stampede exit'],
  ['grid', 'Tile grid', ''],
  ['night', 'Night tint', 'Maple Street’s 3am look'],
];

export function renderLayers(ed, root) {
  clear(root);
  root.append(h('div.sec-title', 'SHOW'));
  for (const [k, label, sub] of LAYER_ROWS) {
    const i = h('input', { type: 'checkbox', checked: !!ed.layers[k] });
    i.addEventListener('change', () => { ed.layers[k] = i.checked; ed.saveLayers(); ed.view.request(); });
    root.append(h('label.layer-row', i, h('span.k', label, sub ? h('small', h('br'), sub) : null)));
  }
  root.append(h('div.sec-title', { style: { marginTop: '12px' } }, 'ROOFS'));
  const seg = h('div.chips');
  for (const [v, label] of [['on', 'ON'], ['fade', 'FADED'], ['off', 'OFF (INSIDE)']]) {
    const c = h(`button.chip${ed.layers.roofs === v ? '.on' : ''}`, { type: 'button' }, label);
    c.addEventListener('click', () => { ed.layers.roofs = v; ed.saveLayers(); ed.view.request(); for (const x of seg.children) x.classList.remove('on'); c.classList.add('on'); });
    seg.append(c);
  }
  root.append(seg, h('p.hint', { style: { marginTop: '12px' } }, 'Selecting only picks what’s shown: hide a layer to click through it.'));
}

/* ================= MAP ================= */

export function renderMapPanel(ed, root, hooks) {
  clear(root);
  const d = ed.doc;
  if (!d) return;
  const ws = ed.ws;
  const st = ws.status(ed.id);
  const info = MAP_INFO[ed.id];

  const nameI = h('input', { type: 'text', value: d.name, maxlength: 60 });
  nameI.addEventListener('change', () => {
    const v = nameI.value.replace(/[<>&"'`]/g, '').trim().slice(0, 60);   // plain text (the game's menus use HTML)
    nameI.value = v || d.name;
    if (v) ed.edit('rename map', (doc) => { doc.name = v; });
    hooks.mapsChanged();
  });
  root.append(h('div.sec', h('div.sec-title', 'MAP', h('span.sub', ed.id)),
    h('div.field', h('div.k', 'Name'), h('div.v', nameI)),
    h('div.note-box', statusText(st, info))));

  // ---- size ----
  const wI = h('input', { type: 'number', value: d.tw, min: 8, max: 256 });
  const hI = h('input', { type: 'number', value: d.th, min: 8, max: 256 });
  let anchor = 'tl';
  const anchors = h('div', { style: { display: 'inline-grid', gridTemplateColumns: 'repeat(3, 18px)', gap: '2px' } });
  for (const a of ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br']) {
    const b = h(`button.chip${a === anchor ? '.on' : ''}`, { type: 'button', title: 'Keep the map pinned to this side', style: { padding: '0', width: '18px', height: '18px' } }, '');
    b.addEventListener('click', () => { anchor = a; for (const x of anchors.children) x.classList.remove('on'); b.classList.add('on'); });
    anchors.append(b);
  }
  const fillSel = h('select', Object.keys(TILE_NAMES).map(Number).filter(id => ed.assets.tiles[id]).map(id => h('option', { value: id, selected: id === mostCommonTile(d) }, tileName(id))));
  root.append(h('div.sec', h('div.sec-title', 'SIZE', h('span.sub', `${d.tw * TILE} × ${d.th * TILE} px`)),
    h('div.field', h('div.k', 'Tiles'), h('div.v', wI, h('span.xy', '×'), hI)),
    h('div.field', h('div.k', 'Pin to'), h('div.v', anchors)),
    h('div.field', h('div.k', 'New ground'), h('div.v', fillSel)),
    h('button.btn.small', { type: 'button', onclick: () => {
      const tw = Math.max(8, Math.min(256, Math.round(+wI.value))), th = Math.max(8, Math.min(256, Math.round(+hI.value)));
      if (tw === d.tw && th === d.th) { toast('That’s already its size'); return; }
      ed.edit('resize map', (doc) => resizeDoc(doc, tw, th, anchor, +fillSel.value));
      ed.view.fit(ed.map);
    } }, 'RESIZE')));

  // ---- how it plays ----
  const flag = (label, value, apply, sub) => {
    const i = h('input', { type: 'checkbox', checked: !!value });
    i.addEventListener('change', () => ed.edit(label, (doc) => apply(doc, i.checked)));
    return h('label.check', i, h('span', label, sub ? h('small', sub) : null));
  };
  root.append(h('div.sec', h('div.sec-title', 'HOW IT PLAYS'),
    flag('Soft ground edges', d.blend, (doc, v) => { doc.blend = v; }, 'Grass, crops, forest and roads fade into each other instead of meeting on a hard tile edge'),
    flag('Night', d.tint === 'night', (doc, v) => { doc.tint = v ? 'night' : null; }, 'A dark blue wash over the ground (Maple Street)'),
    flag('Noise meter (stealth)', d.stealth, (doc, v) => { doc.stealth = v; }, 'Loud moves near lit house windows wake the neighbours and blow the job')));

  // ---- story markers ----
  if (info && info.story && !info.strip) {
    const sec = h('div.sec', h('div.sec-title', `STAGE 1, SCENE ${info.story}`));
    sec.append(h('p.hint', 'This map is built around a story scene. Its markers are on the map (VIEW › Story markers): drag them. CHECK tells you if an edit would trip the scene up.'));
    if (ed.id === 'barnyard') {
      const ty = h('input', { type: 'number', value: d.story.treeLine ?? 64 });
      ty.addEventListener('change', () => ed.edit('tree line', (doc) => { doc.story.treeLine = Math.round(+ty.value); }));
      sec.append(h('div.field', h('div.k', 'Tree line Y'), h('div.v', ty)));
    }
    root.append(sec);
  }

  // ---- whole-map actions ----
  const acts = h('div.sec', h('div.sec-title', 'THIS MAP'));
  const row = h('div.btn-row');
  if (st.draft) row.append(h('button.btn.small', { type: 'button', onclick: async () => {
    if (await confirmBox('Throw away your changes?', st.published ? 'Back to the published version of this map.' : 'Back to how the map is built into the game.', 'Throw away', true)) { ed.ws.revert(ed.id, 'published'); hooks.mapsChanged(); }
  } }, st.published ? 'REVERT TO PUBLISHED' : 'REVERT TO BUILT-IN'));
  if (info && st.published) row.append(h('button.btn.small', { type: 'button', onclick: async () => {
    if (await confirmBox('Go back to the built-in map?', 'Your published edit of this map is removed the next time you publish.', 'Use built-in', true)) { ed.ws.revert(ed.id, 'builtin'); hooks.mapsChanged(); }
  } }, 'RESET TO BUILT-IN'));
  row.append(h('button.btn.small', { type: 'button', onclick: () => hooks.duplicateMap() }, 'DUPLICATE AS NEW MAP'));
  row.append(h('button.btn.small', { type: 'button', onclick: () => hooks.exportMap() }, 'EXPORT .JSON'));
  if (!info) row.append(h('button.btn.small.danger', { type: 'button', onclick: () => hooks.deleteMap() }, 'DELETE MAP'));
  acts.append(row);
  root.append(acts);
}

function statusText(st, info) {
  if (!info) return st.published ? (st.draft ? 'A map you made. Published, with unpublished changes.' : 'A map you made. Published: it’s in Sandbox for everyone.') : 'A map you made. Not published yet: only this browser has it (it’s in Sandbox here).';
  if (st.draft && st.published) return 'Edited and published, with more changes not published yet.';
  if (st.draft) return 'Edited (not published yet). PLAY TEST plays your version; PUBLISH puts it in the game.';
  if (st.published) return 'Edited and published: everyone plays this version.';
  return 'The built-in map. Edit anything and it’s saved as your draft.';
}

export function mostCommonTile(d) {
  const n = new Map();
  for (const row of d.ground) for (const t of row) n.set(t, (n.get(t) || 0) + 1);
  let best = 0, bc = -1;
  for (const [t, c] of n) if (c > bc) { bc = c; best = t; }
  return best;
}

// New size in tiles, keeping the map pinned to `anchor` (tl, tc, ... br).
export function resizeDoc(doc, tw, th, anchor, fill) {
  const ax = anchor[1] === 'l' ? 0 : anchor[1] === 'c' ? 0.5 : 1;
  const ay = anchor[0] === 't' ? 0 : anchor[0] === 'm' ? 0.5 : 1;
  const ox = Math.round((tw - doc.tw) * ax), oy = Math.round((th - doc.th) * ay);
  const ground = [];
  for (let y = 0; y < th; y++) {
    const row = [];
    for (let x = 0; x < tw; x++) {
      const sx = x - ox, sy = y - oy;
      row.push(sx >= 0 && sy >= 0 && sx < doc.tw && sy < doc.th ? doc.ground[sy][sx] : fill);
    }
    ground.push(row);
  }
  const dx = ox * TILE, dy = oy * TILE;
  for (const o of doc.objects) { o.x += dx; o.y += dy; }
  for (const o of doc.paint) { if (o.pts) for (const p of o.pts) { p.x += dx; p.y += dy; } else { o.x += dx; o.y += dy; } }
  doc.van.x += dx; doc.van.y += dy;
  doc.spawn.x += dx; doc.spawn.y += dy;
  if (doc.story.arrive) { doc.story.arrive.x += dx; doc.story.arrive.y += dy; }
  if (typeof doc.story.treeLine === 'number') doc.story.treeLine += dy;
  doc.ground = ground;
  doc.tw = tw; doc.th = th;
}

/* ================= CHECK ================= */

export function renderProblems(ed, root, problems) {
  clear(root);
  const errs = problems.filter(p => p.sev === 'error').length, warns = problems.filter(p => p.sev === 'warn').length;
  root.append(h('div.sec-title', 'MAP CHECK', h('span.sub', problems.length ? `${errs} error${errs === 1 ? '' : 's'}, ${warns} warning${warns === 1 ? '' : 's'}` : 'all clear')));
  if (!problems.length) {
    root.append(h('div.note-box', 'Nothing found that would break the game: the agent can reach the van and the hiding spots, and the story markers are in order.'));
    return;
  }
  root.append(h('p.hint', 'Click one to show it on the map. Errors break the game or a story scene; warnings are worth a look.'));
  for (const p of problems) {
    const row = h('div.problem', h(`span.sev.${p.sev}`, p.sev === 'error' ? 'ERROR' : p.sev === 'warn' ? 'WARN' : 'NOTE'),
      h('div', p.text, p.detail ? h('small', p.detail) : null));
    row.addEventListener('click', () => {
      if (p.sel) ed.select([p.sel]);
      if (p.at) { if (ed.view.z < 2) ed.view.z = 2; ed.view.centerOn(p.at.x, p.at.y); }
    });
    root.append(row);
  }
}
