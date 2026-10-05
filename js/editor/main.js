// Map + asset editor boot (editor.html). Builds the game's assets the same
// way the game does, loads published edits (maps/) and this browser's
// drafts, and wires the map editor, the asset editor and publishing up to
// the page.
import { buildTiles, buildActors, buildVan, buildUfo, T, TILE } from '../data/sprites.js';
import { loadPngProps } from '../data/pngProps.js';
import { registerPngProps, tileName, TILE_NAMES } from '../data/assets.js';
import { MAP_INFO } from '../data/maps.js';
import { fetchPublished, readDrafts, applyAssetBundle } from '../edits.js';
import { Workspace, formatDoc } from './workspace.js';
import { MapEditor } from './mapEditor.js';
import { makeTools, TOOL_ORDER } from './tools.js';
import { renderInspector } from './inspector.js';
import { renderPalette, renderLayers, renderMapPanel, renderProblems } from './panels.js';
import { validate } from './validate.js';
import { $, h, clear, toast, modal, formBox, confirmBox, popupMenu, download, pickFile, slug } from './dom.js';
import { AssetEditor } from './assetEditor.js';
import { openPublish, exportZip, importFiles } from './publish.js';
import { STRIP_TOOLS } from './stripEditor.js';

/* ---------------- assets, edits ---------------- */

const assets = { tiles: buildTiles(), actors: buildActors(), van: buildVan(), ufo: buildUfo() };
try {
  assets.pngProps = await loadPngProps();
  const t = assets.pngProps.tiles;
  Object.assign(assets.tiles, {
    [T.ROAD_PNG]: t.road, [T.CROSSWALK_H]: t.crosswalkH, [T.CROSSWALK_V]: t.crosswalkV, [T.LANE_H]: t.laneH,
    [T.LANE_V]: t.laneV, [T.MANHOLE]: t.manhole, [T.DRAIN]: t.drain,
  });
} catch (err) {
  console.warn('Maple Street PNGs failed to load:', err);
}
registerPngProps(assets.pngProps);

const published = await fetchPublished();
const drafts = readDrafts();
const bootErrors = published.errors.concat(await applyAssetBundle(assets, drafts.assets || published.assets));
const ws = new Workspace(assets, published);

/* ---------------- the map editor ---------------- */

let problems = [];
const ui = {
  onSelection() { if (activeTab === 'inspect' || ed.sel.length) refreshInspector(); updateStatusSel(); },
  onDoc() { scheduleChecks(); refreshInspector(); refreshTop(); },
  onTool() { refreshToolbar(); refreshOptions(); if (activeTab === 'palette') renderPalette(ed, $('#tab-palette'), ed.paletteSub); },
  onLayers() { if (activeTab === 'layers') renderLayers(ed, $('#tab-layers')); },
  showTab(tab, sub) { showTab(tab, sub); },
  status(text) { $('#status').textContent = text; },
};
const ed = new MapEditor(ws, assets, ui);
ed.tools = makeTools(ed);
ed.setTool = (id) => {
  if (ed.strip && !STRIP_TOOLS.includes(id)) { toast('On Highway 29 only Select, Pan, Prop and Erase apply (set pieces)', 'warn'); return; }
  if (ed.tool && ed.tool.cancel) ed.tool.cancel();
  ed.tool = ed.tools[id] || ed.tools.select;
  ed.hover = null;
  try { localStorage.setItem('aw-editor-tool', ed.tool.id); } catch { /* fine */ }
  ui.onTool();
  $('#view').style.cursor = ed.tool.cursor || (ed.tool.id === 'select' ? 'default' : 'crosshair');
  ed.view.request();
};
ed.tool = ed.tools.select;

/* ---------------- toolbar ---------------- */

function refreshToolbar() {
  const bar = $('#toolbar');
  if (!bar.children.length) {
    for (const id of TOOL_ORDER) {
      if (id === '-') { bar.appendChild(h('div.tool-sep')); continue; }
      const t = ed.tools[id];
      const b = h('button.tool-btn', { type: 'button', title: `${t.label} (${t.hotkey.toUpperCase()})\n${t.help || ''}`, onclick: () => ed.setTool(id) },
        h('span.ico', t.icon), t.label.toUpperCase());
      b.dataset.tool = id;
      bar.appendChild(b);
    }
  }
  for (const b of bar.querySelectorAll('.tool-btn')) b.classList.toggle('on', b.dataset.tool === ed.tool.id);
}

function refreshOptions() {
  const box = clear($('#tool-options'));
  const o = ed.tool.options ? ed.tool.options() : null;
  if (o) for (const n of [].concat(o)) if (n) box.appendChild(n);
  if (!ed.tool.help) return;
  // tips on by default on a big screen, off on a phone (they'd cover the map)
  let show = window.innerWidth > 900;
  try { const v = localStorage.getItem('aw-editor-help'); if (v !== null) show = v !== '0'; } catch { /* fine */ }
  const toggle = (on) => { try { localStorage.setItem('aw-editor-help', on ? '1' : '0'); } catch { /* fine */ } refreshOptions(); };
  box.appendChild(show
    ? h('div.opt-group.help', { style: { maxWidth: '520px', color: '#8f9bb8' } }, ed.tool.help,
      h('button.btn.small', { type: 'button', title: 'Hide tool tips', onclick: () => toggle(false) }, 'HIDE'))
    : h('button.btn.small', { type: 'button', title: 'Show tips for this tool', onclick: () => toggle(true) }, '? HELP'));
}

/* ---------------- sidebar tabs ---------------- */

let activeTab = 'palette';
function showTab(tab, sub) {
  activeTab = tab;
  for (const b of document.querySelectorAll('#sidebar .tabs button')) b.classList.toggle('on', b.dataset.tab === tab);
  for (const el of document.querySelectorAll('#sidebar .tab-body')) el.classList.toggle('hidden', el.id !== `tab-${tab}`);
  $('#sidebar').classList.remove('collapsed');
  if (tab === 'palette') renderPalette(ed, $('#tab-palette'), sub || ed.paletteSub);
  else if (tab === 'inspect') refreshInspector(true);
  else if (tab === 'layers') renderLayers(ed, $('#tab-layers'));
  else if (tab === 'map') { if (ed.strip) ed.strip.mapPanel($('#tab-map')); else renderMapPanel(ed, $('#tab-map'), mapHooks); }
  else if (tab === 'problems') renderProblems(ed, $('#tab-problems'), problems);
}
for (const b of document.querySelectorAll('#sidebar .tabs button')) {
  b.addEventListener('click', () => {
    // on a phone, tapping the open tab folds the sheet away
    if (b.dataset.tab === activeTab && window.innerWidth <= 900) { $('#sidebar').classList.toggle('collapsed'); return; }
    showTab(b.dataset.tab);
  });
}

function refreshInspector(force = false) {
  if (!force && ed.sel.length && activeTab !== 'inspect') { showTab('inspect'); return; }
  if (activeTab !== 'inspect') return;
  if (ed.strip) { ed.strip.inspector($('#tab-inspect')); return; }
  renderInspector(ed, $('#tab-inspect'), { editAsset: (id) => { setMode('assets'); assetEditor.open('prop', id); } });
}

let checkTimer = 0;
function scheduleChecks() {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(() => {
    if (!ed.map) return;
    problems = ed.strip ? [] : validate(ed.doc, ed.map, assets.tiles);
    const errs = problems.filter(p => p.sev === 'error').length, warns = problems.filter(p => p.sev === 'warn').length;
    const c = $('#problem-count');
    c.textContent = errs ? ` ${errs}` : warns ? ` ${warns}` : '';
    c.classList.toggle('warn', !errs && !!warns);
    if (activeTab === 'problems') renderProblems(ed, $('#tab-problems'), problems);
    if (activeTab === 'map') { if (ed.strip) ed.strip.mapPanel($('#tab-map')); else renderMapPanel(ed, $('#tab-map'), mapHooks); }
  }, 250);
}

/* ---------------- top bar ---------------- */

function mapLabel(id) {
  const st = ws.status(id);
  const tag = (ws.isStrip(id) ? ' (set pieces)' : '') + (st.draft ? ' • edited' : st.published ? ' • published' : '');
  const kind = MAP_INFO[id] ? (MAP_INFO[id].story ? `Stage 1 · ` : '') : 'Custom · ';
  return `${kind}${ws.name(id)}${tag}`;
}

function refreshMapList() {
  const sel = $('#map-select');
  clear(sel);
  for (const id of ws.mapIds()) sel.appendChild(h('option', { value: id, selected: id === ed.id }, mapLabel(id)));
}

function refreshTop() {
  if (!ed.id) return;
  $('#btn-undo').disabled = !ws.canUndo(ed.id);
  $('#btn-redo').disabled = !ws.canRedo(ed.id);
  const opt = $(`#map-select option[value="${CSS.escape(ed.id)}"]`);
  if (opt) opt.textContent = mapLabel(ed.id);
}

function refreshSaveState() {
  const el = $('#save-state');
  if (ws.lastSaveError) { el.textContent = 'NOT SAVED: browser storage full'; el.className = ''; el.style.color = '#ff5e6c'; return; }
  el.style.color = '';
  const pend = ws.pendingChanges();
  const n = pend.maps.length + (pend.assets ? 1 : 0);
  el.textContent = n ? `Draft saved · ${n} change${n > 1 ? 's' : ''} to publish` : 'All published';
  el.className = n ? 'draft' : 'clean';
}
ws.on((evt) => {
  if (evt === 'saved') refreshSaveState();
  if (evt === 'saveError') toast('Couldn’t save your draft: this browser’s storage is full. Publish or export your work.', 'err', 6000);
  if (evt === 'maps') refreshMapList();
});

function openMap(id) {
  if (ws.isStrip(id)) { stripMode(id); return; }
  $('#strip-note').classList.add('hidden');
  ed.open(id);
  try { localStorage.setItem('aw-editor-map', id); } catch { /* fine */ }
  refreshMapList();
  refreshTop();
  refreshSaveState();
  if (activeTab === 'map') renderMapPanel(ed, $('#tab-map'), mapHooks);
  if (activeTab === 'inspect') refreshInspector(true);
}

// Highway 29 streams its woods in forever as you play: show a preview, and
// say what can be edited.
async function stripMode(id) {
  const { openStrip } = await import('./stripEditor.js');
  openStrip(ed, ws, id, { back: () => openMap(localStorage.getItem('aw-editor-map') || 'playground') });
}

$('#map-select').addEventListener('change', (e) => openMap(e.target.value));
$('#btn-undo').addEventListener('click', () => (mode === 'assets' ? assetEditor.undo() : ed.undo()));
$('#btn-redo').addEventListener('click', () => (mode === 'assets' ? assetEditor.redo() : ed.redo()));

$('#btn-new-map').addEventListener('click', async () => {
  const tiles = Object.keys(TILE_NAMES).map(Number).filter(id => assets.tiles[id]);
  const v = await formBox('NEW MAP', [
    { key: 'name', label: 'Name', value: 'My Map' },
    { key: 'tw', label: 'Width', type: 'number', value: 40, min: 12, max: 256, help: 'In tiles (16px). The built-in maps are 38–46 wide.' },
    { key: 'th', label: 'Height', type: 'number', value: 34, min: 12, max: 256 },
    { key: 'tile', label: 'Ground', type: 'select', value: T.GRASS, options: tiles.map(id => ({ value: id, label: tileName(id) })) },
  ], 'CREATE', 'A blank map with the van and the agent’s spawn in the bottom-left corner. It shows up in Sandbox once it’s saved.', (v) => {
    if (!v.name.trim()) return 'Give it a name';
    if (!slug(v.name)) return 'The name needs some letters or numbers';
    return null;
  });
  if (!v) return;
  let id = slug(v.name);
  while (ws.mapIds().includes(id)) id = id.replace(/-?\d*$/, '') + '-' + (1 + Math.floor(Math.random() * 99));
  ws.createMap(id, v.name.replace(/[<>&"'`]/g, '').trim().slice(0, 60) || id, Math.max(12, Math.min(256, Math.round(v.tw))), Math.max(12, Math.min(256, Math.round(v.th))), +v.tile);
  refreshMapList();
  openMap(id);
  toast(`Made "${v.name.trim()}". Add props from the ADD panel.`, 'ok');
});

const mapHooks = {
  mapsChanged() { refreshMapList(); refreshTop(); refreshSaveState(); renderMapPanel(ed, $('#tab-map'), mapHooks); },
  async duplicateMap() {
    const v = await formBox('DUPLICATE MAP', [{ key: 'name', label: 'Name', value: `${ws.name(ed.id)} copy` }], 'DUPLICATE',
      'A new map starting as a copy of this one (story markers are left behind: a copy is for Sandbox).', (x) => (slug(x.name) ? null : 'Give it a name'));
    if (!v) return;
    let id = slug(v.name);
    while (ws.mapIds().includes(id)) id += '-2';
    ws.duplicateMap(ed.id, id, v.name.replace(/[<>&"'`]/g, '').trim().slice(0, 60) || id);
    openMap(id);
  },
  exportMap() {
    ws.flush();
    download(`${ed.id}.json`, formatDoc(ws.doc(ed.id)));
  },
  async deleteMap() {
    if (!await confirmBox('Delete this map?', `"${ws.name(ed.id)}" will be gone${ws.status(ed.id).published ? ' from the game the next time you publish' : ''}. This can't be undone.`, 'Delete', true)) return;
    ws.deleteMap(ed.id);
    openMap('playground');
  },
};

$('#btn-play').addEventListener('click', () => {
  ws.flush();
  if (!ws.drafts.play) { ws.setPlayDrafts(true); toast('Turned "Game plays my drafts" back on'); }
  const id = ed.id;
  const info = MAP_INFO[id];
  const go = (q) => window.open(`index.html?${q}`, 'alien-wrangler-playtest');
  if (ws.isStrip(id)) { go('scene=3'); return; }
  if (info && info.story) {
    popupMenu($('#btn-play'), [
      { label: `▶  Free play on ${ws.name(id)} (Sandbox roster)`, onClick: () => go(`playtest=${encodeURIComponent(id)}`) },
      { label: `▶  Play Stage 1, Scene ${info.story} (the story)`, onClick: () => go(`scene=${info.story}`) },
    ]);
    return;
  }
  go(`playtest=${encodeURIComponent(id)}`);
});

$('#btn-publish').addEventListener('click', () => openPublish(ws, { done: () => { refreshMapList(); refreshSaveState(); } }));

$('#btn-more').addEventListener('click', () => {
  popupMenu($('#btn-more'), [
    { label: `${ws.drafts.play ? '☑' : '☐'}  Game plays my drafts (this browser)`, onClick: () => { ws.setPlayDrafts(!ws.drafts.play); toast(ws.drafts.play ? 'The game in this browser plays your drafts' : 'The game in this browser plays only what’s published'); } },
    '-',
    { label: 'Export this map (.json)', onClick: () => mapHooks.exportMap() },
    { label: 'Export everything edited (.zip)', onClick: () => exportZip(ws) },
    { label: 'Import maps / assets (.json or .zip)…', onClick: async () => {
      const files = await pickFile('.json,.zip,application/json,application/zip', true);
      if (!files.length) return;
      try {
        const r = await importFiles(ws, files);
        refreshMapList();
        if (r.maps.length) openMap(r.maps[0]);
        if (r.assets) { await assetEditor.reloadBundle(); }
        toast(`Imported ${r.maps.length} map${r.maps.length === 1 ? '' : 's'}${r.assets ? ' and assets' : ''}`, 'ok');
      } catch (e) { toast(`Import failed: ${e.message}`, 'err', 5000); }
    } },
    '-',
    { label: 'Keyboard shortcuts', onClick: showShortcuts },
    { label: 'How edits get into the game', onClick: showHowItWorks },
  ]);
});

function showShortcuts() {
  const rows = [
    ['V / H / B / R / G / I', 'Select, pan, paint, rectangle, fill, pick tile'],
    ['P / F / U / S / C / D / E', 'Prop, crops, building, hiding spot, collision box, ground art, erase'],
    ['Space (hold) or middle drag', 'Pan'],
    ['Scroll / pinch, + / −, 0', 'Zoom, fit the map'],
    ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
    ['Delete', 'Delete the selection'],
    ['Ctrl+C / Ctrl+V / Ctrl+D', 'Copy, paste at the cursor, duplicate'],
    ['Arrows (Shift: 16px)', 'Nudge the selection'],
    ['[ / ]', 'Brush size'],
    ['Alt+drag a building', 'Move just the building, not what’s in it'],
    ['Esc', 'Cancel / deselect'],
  ];
  modal({ title: 'SHORTCUTS', body: h('div', rows.map(([k, v]) => h('div.field', h('div.k', { style: { width: '190px', fontFamily: 'var(--mono)', fontSize: '11.5px', color: '#e8ecf4' } }, k), h('div.v', v)))) });
}

function showHowItWorks() {
  modal({
    title: 'HOW EDITS GET INTO THE GAME', wide: true,
    body: h('div',
      h('p', h('b', 'Drafts. '), 'Every change is saved in this browser straight away. The game in this same browser plays your drafts (the build tag at the top says LOCAL EDITS), so ', h('b', 'PLAY TEST'), ' shows a change the moment you make it. Nobody else sees drafts.'),
      h('p', h('b', 'Publishing. '), 'PUBLISH writes your changes into the repo’s ', h('code', 'maps/'), ' folder (one ', h('code', '<map>.json'), ' per edited map, ', h('code', 'assets.json'), ' for repainted and new assets, ', h('code', 'manifest.json'), ' listing them). Once that lands on the branch the game deploys from, everyone gets it.'),
      h('p', h('b', 'Precedence. '), 'A draft beats a published file, which beats the map built into the game’s code. Revert a map (MAP tab) to drop your draft.'),
      h('p', h('b', 'Highway 29 '), 'streams its woods in forever as you play, so it has no map file; the gas station and clearing set pieces can be rearranged.')),
  });
}

/* ---------------- mode: maps / assets ---------------- */

let mode = 'map';
const assetEditor = new AssetEditor($('#asset-mode'), ws, assets, {
  changed: () => {
    if (ed.strip) { ed.strip.grounds = {}; ed.strip.rebuild(); }
    else if (ed.id) { ed.tileSig = ''; ed.paintSig = ''; ed.rebuild(); }
    refreshSaveState();
  },
  placeOnMap: (id) => { setMode('map'); ed.toolState.asset = id; ed.setTool('prop'); showTab('palette', 'props'); },
});
function setMode(m) {
  mode = m;
  for (const b of document.querySelectorAll('.modes button')) b.classList.toggle('on', b.dataset.mode === m);
  $('#map-mode').classList.toggle('hidden', m !== 'map');
  $('#asset-mode').classList.toggle('hidden', m !== 'assets');
  $('.map-picker').classList.toggle('hidden', m !== 'map');
  if (m === 'assets') { assetEditor.show(); $('#btn-undo').disabled = false; $('#btn-redo').disabled = false; }
  else { ed.view.resize(); refreshTop(); if (activeTab === 'palette') renderPalette(ed, $('#tab-palette'), ed.paletteSub); }
}
for (const b of document.querySelectorAll('.modes button')) b.addEventListener('click', () => setMode(b.dataset.mode));

/* ---------------- the canvas: pointer, wheel, keys ---------------- */

const cv = $('#view');
const pointers = new Map();
let gesture = null;          // { kind: 'pan' | 'pinch' | 'tool', ... }
let spaceDown = false;
let lastWorld = null;

function worldAt(e) {
  const w = ed.view.toWorld(e.clientX, e.clientY);
  return { x: w.x, y: w.y, tx: Math.floor(w.x / TILE), ty: Math.floor(w.y / TILE) };
}

function updateStatus(p) {
  if (!ed.map || !p) return;
  const inMap = p.tx >= 0 && p.ty >= 0 && p.tx < ed.map.tw && p.ty < ed.map.th;
  const tile = inMap ? tileName(ed.map.ground[p.ty * ed.map.tw + p.tx]) : 'off the map';
  ui.status(`${Math.round(p.x)}, ${Math.round(p.y)} px · tile ${p.tx}, ${p.ty} (${tile}) · ${Math.round(ed.view.z * 100)}%${hoverName()}`);
}
function hoverName() {
  const s = ed.hover;
  if (!s) return '';
  if (s.k === 'set') { const q = ed.strip && ed.strip.pieces[s.i]; return q ? ` · ${q.a} (set piece)` : ''; }
  if (s.k === 'obj') { const o = ed.doc.objects[s.i]; return o ? ` · ${o.t === 'prop' ? o.a : o.t === 'building' ? `${o.kind} "${o.id}"` : o.t === 'hide' ? 'hiding spot' : 'collision box'}` : ''; }
  return ` · ${s.k === 'pt' ? 'road point' : s.k === 'paint' ? ed.doc.paint[s.i].op : s.k}`;
}
function updateStatusSel() { if (lastWorld) updateStatus(lastWorld); }

cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('pointerdown', (e) => {
  if (!ed.map) return;
  cv.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    // second finger: whatever the first one started becomes a pinch
    if (gesture && gesture.kind === 'tool' && ed.tool.cancel) ed.tool.cancel();
    const [a, b] = [...pointers.values()];
    gesture = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    return;
  }
  if (pointers.size > 2) return;
  if (e.button === 1 || spaceDown || (e.button === 2 && !ed.tool.tiles)) {
    gesture = { kind: 'pan', x: e.clientX, y: e.clientY };
    cv.style.cursor = 'grabbing';
    return;
  }
  gesture = { kind: 'tool' };
  ed.tool.down && ed.tool.down(worldAt(e), e);
});
cv.addEventListener('pointermove', (e) => {
  if (!ed.map) return;
  const p = worldAt(e);
  lastWorld = p;
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gesture && gesture.kind === 'pinch' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    ed.view.pan(cx - gesture.cx, cy - gesture.cy);
    if (gesture.d > 0) ed.view.zoomAt(d / gesture.d, cx, cy);
    Object.assign(gesture, { d, cx, cy });
    return;
  }
  if (gesture && gesture.kind === 'pan') {
    ed.view.pan(e.clientX - gesture.x, e.clientY - gesture.y);
    gesture.x = e.clientX; gesture.y = e.clientY;
    return;
  }
  if (gesture && gesture.kind === 'tool') ed.tool.move && ed.tool.move(p, e);
  else {
    if (ed.tool.hover) ed.tool.hover(p);
    else if (ed.tool.id === 'select') {
      const s = ed.pick(p.x, p.y);
      if (ed.key(s) !== ed.key(ed.hover)) { ed.hover = s; ed.view.request(); }
      const hnd = ed.handleAt(p.x, p.y);
      cv.style.cursor = hnd >= 0 ? (hnd < 4 ? (hnd === 0 || hnd === 3 ? 'nwse-resize' : 'nesw-resize') : hnd < 6 ? 'ns-resize' : 'ew-resize') : s ? 'move' : 'default';
    }
  }
  updateStatus(p);
});
const endPointer = (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (gesture && gesture.kind === 'pinch') { if (!pointers.size) gesture = null; return; }
  if (gesture && gesture.kind === 'tool') ed.tool.up && ed.tool.up(worldAt(e), e);
  if (gesture && gesture.kind === 'pan') cv.style.cursor = ed.tool.cursor || (ed.tool.id === 'select' ? 'default' : 'crosshair');
  gesture = null;
};
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', (e) => { if (gesture && gesture.kind === 'tool' && ed.tool.cancel) ed.tool.cancel(); pointers.delete(e.pointerId); gesture = null; });
cv.addEventListener('pointerleave', () => { if (!gesture && ed.hover) { ed.hover = null; ed.view.request(); } });
cv.addEventListener('dblclick', (e) => { if (ed.tool.dbl) ed.tool.dbl(worldAt(e), e); });
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  // a mouse wheel (or trackpad pinch) zooms; trackpad scrolling pans
  const pinch = e.ctrlKey;
  const trackpad = !pinch && e.deltaMode === 0 && (Math.abs(e.deltaX) > 0.5 || Math.abs(e.deltaY) < 30);
  if (trackpad) ed.view.pan(-e.deltaX, -e.deltaY);
  else ed.view.zoomAt(Math.exp(-e.deltaY * (pinch ? 0.01 : 0.0018)), e.clientX, e.clientY);
  if (lastWorld) updateStatus(worldAt(e));
}, { passive: false });

for (const b of document.querySelectorAll('#view-buttons button')) {
  b.addEventListener('click', () => {
    if (b.dataset.zoom === 'in') ed.view.zoomAt(1.5);
    else if (b.dataset.zoom === 'out') ed.view.zoomAt(1 / 1.5);
    else ed.view.fit(ed.map);
  });
}

const typing = (e) => /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable;
document.addEventListener('keydown', (e) => {
  if (typing(e) || $('#modal-root').children.length) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mode === 'assets') { assetEditor.key(e); return; }
  if (!ed.map) return;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) ed.redo(); else ed.undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); ed.redo(); return; }
  if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); ed.copySelection(); return; }
  if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); ed.paste(lastWorld); return; }
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); ed.duplicate(); return; }
  if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); ed.select(ed.pickBox(-1e5, -1e5, 1e5, 1e5)); return; }
  if (mod) return;
  if (ed.tool.key && ed.tool.key(e)) { e.preventDefault(); return; }
  if (e.key === ' ') { if (!spaceDown) { spaceDown = true; cv.style.cursor = 'grab'; } e.preventDefault(); return; }
  if (e.key === 'Escape') { if (ed.tool.cancel) ed.tool.cancel(); ed.select([]); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); ed.deleteSelection(); return; }
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (arrows[e.key]) { e.preventDefault(); const k = e.shiftKey ? TILE : 1; ed.nudge(arrows[e.key][0] * k, arrows[e.key][1] * k); return; }
  if (e.key === '+' || e.key === '=') { ed.view.zoomAt(1.5); return; }
  if (e.key === '-' || e.key === '_') { ed.view.zoomAt(1 / 1.5); return; }
  if (e.key === '0') { ed.view.fit(ed.map); return; }
  if (e.key === '[' || e.key === ']') {
    const sizes = [1, 2, 3, 5, 7];
    const i = Math.max(0, sizes.indexOf(ed.toolState.brush) + (e.key === ']' ? 1 : -1));
    ed.toolState.brush = sizes[Math.min(sizes.length - 1, i)];
    ui.onTool(); ed.view.request();
    return;
  }
  const t = Object.values(ed.tools).find(q => q.hotkey === e.key.toLowerCase());
  if (t) ed.setTool(t.id);
});
document.addEventListener('keyup', (e) => {
  if (e.key === ' ' && spaceDown) { spaceDown = false; cv.style.cursor = ed.tool.cursor || (ed.tool.id === 'select' ? 'default' : 'crosshair'); }
});
window.addEventListener('beforeunload', () => ws.flush());
document.addEventListener('visibilitychange', () => { if (document.hidden) ws.flush(); });

/* ---------------- go ---------------- */

refreshToolbar();
const startTool = localStorage.getItem('aw-editor-tool');
ed.setTool(ed.tools[startTool] ? startTool : 'select');
const q = new URLSearchParams(location.search);
const startMap = q.get('map') || localStorage.getItem('aw-editor-map') || 'playground';
openMap(ws.mapIds().includes(startMap) && !ws.isStrip(startMap) ? startMap : 'playground');
showTab('palette');
$('#app').classList.remove('booting');
if (q.get('mode') === 'assets') setMode('assets');
if (bootErrors.length) toast(`Some edits failed to load: ${bootErrors[0]}`, 'err', 6000);

// for tests / the console
window.__editor = { ed, ws, assets, assetEditor, setMode, openMap, showTab };
