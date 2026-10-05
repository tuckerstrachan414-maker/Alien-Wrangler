// The CHECK panel: things about a map that would break the game or a story
// scene, found before you play it. Each problem: { sev: 'error'|'warn'|'info',
// text, detail, at: {x, y}, sel }.
import { TILE } from '../data/sprites.js';
import { buildNav } from '../nav.js';

const DEPOSIT_R = 30;   // game.js: how close to the van door counts as "at the van"

// Every nav cell the agent can get to from the spawn (walking, or jumping
// what can be jumped), the way the game's pathfinding moves.
function reachable(nav, sx, sy) {
  const { gw, gh, cells } = nav;
  const seen = new Uint8Array(gw * gh);
  const start = sy * gw + sx;
  if (sx < 0 || sy < 0 || sx >= gw || sy >= gh || cells[start] === 1) return seen;
  const q = [start];
  seen[start] = 1;
  while (q.length) {
    const cur = q.pop();
    const cx = cur % gw, cy = (cur / gw) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
      const ni = ny * gw + nx;
      if (seen[ni] || cells[ni] === 1) continue;
      if (dx && dy && (cells[cy * gw + nx] === 1 || cells[ny * gw + cx] === 1)) continue;
      seen[ni] = 1;
      q.push(ni);
    }
  }
  return seen;
}

const insideSolid = (map, x, y, jump = false) => map.solids.some(s => (jump || !s.jumpable) && x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.h);

export function validate(doc, map, tiles) {
  const out = [];
  const add = (sev, text, detail = '', at = null, sel = null) => out.push({ sev, text, detail, at, sel });
  const nav = buildNav(map);
  const { gw, gh, cells } = nav;
  const cellOf = (x, y) => ({ cx: Math.floor(x / TILE), cy: Math.floor(y / TILE) });
  const sp = map.spawn;
  const s = cellOf(sp.x, sp.y);

  // ---- the agent's spawn ----
  if (sp.x < 0 || sp.y < 0 || sp.x >= map.w || sp.y >= map.h) {
    add('error', 'The spawn point is off the map', 'Drag the agent (SPAWN) back onto the map.', sp, { k: 'spawn' });
  } else if (insideSolid(map, sp.x, sp.y)) {
    add('error', 'The agent spawns inside something solid', 'They’d be stuck from the start. Move the spawn point onto open ground.', sp, { k: 'spawn' });
  }
  // the agent is pushed clear of anything they start overlapping, so the
  // walk starts from the nearest open nav cell
  let start = { cx: Math.max(0, Math.min(gw - 1, s.cx)), cy: Math.max(0, Math.min(gh - 1, s.cy)) };
  if (cells[start.cy * gw + start.cx] === 1) {
    let best = null, bd = 1e9;
    for (let cy = start.cy - 2; cy <= start.cy + 2; cy++) for (let cx = start.cx - 2; cx <= start.cx + 2; cx++) {
      if (cx < 0 || cy < 0 || cx >= gw || cy >= gh || cells[cy * gw + cx] === 1) continue;
      const dd = Math.hypot(cx * TILE + 8 - sp.x, cy * TILE + 8 - sp.y);
      if (dd < bd) { bd = dd; best = { cx, cy }; }
    }
    if (best) start = best;
  }
  const reach = reachable(nav, start.cx, start.cy);
  const canReach = (x, y, r = 0) => {
    const c0 = cellOf(x - r, y - r), c1 = cellOf(x + r, y + r);
    for (let cy = Math.max(0, c0.cy); cy <= Math.min(gh - 1, c1.cy); cy++)
      for (let cx = Math.max(0, c0.cx); cx <= Math.min(gw - 1, c1.cx); cx++) {
        if (!reach[cy * gw + cx]) continue;
        if (r && Math.hypot(cx * TILE + 8 - x, cy * TILE + 8 - y) > r) continue;
        return true;
      }
    return false;
  };

  // ---- the van ----
  const v = map.van;
  const door = v.flip ? { x: v.x - 4, y: v.y + 15 } : { x: v.x + 50, y: v.y + 15 };
  if (v.x < -10 || v.y < -10 || v.x > map.w || v.y > map.h) add('error', 'The van is off the map', '', v, { k: 'van' });
  else if (!canReach(door.x, door.y, DEPOSIT_R - 4)) {
    add('error', 'The agent can’t reach the van’s back door', 'Captured aliens are secured at the glowing rear door. Clear a way to it from the spawn (or move the van).', door, { k: 'van' });
  }

  // ---- hiding spots ----
  const spots = map.hideSpots;
  if (!spots.length) {
    add('error', 'There are no hiding spots', 'Aliens start in hiding spots: the game needs at least one. Add bushes, crops, or use the Hide tool.');
  } else {
    const far = spots.filter(q => Math.hypot(q.x - sp.x, q.y - sp.y) > 140);
    if (!far.length) add('warn', 'Every hiding spot is close to the spawn', 'Aliens start 140px or more from the agent. With no spot that far, they all start in the same one.');
    else if (far.length < 6) add('info', `Only ${far.length} hiding spot${far.length > 1 ? 's' : ''} far enough from the spawn`, 'Big rosters will double up in them.');
    let stuck = 0, cut = 0, inProps = 0;
    for (const q of spots) {
      const c = cellOf(q.x, q.y);
      const sel = q.src !== undefined ? { k: 'obj', i: q.src } : null;
      const src = q.src !== undefined ? doc.objects[q.src] : null;
      if (c.cx < 0 || c.cy < 0 || c.cx >= gw || c.cy >= gh) { add('warn', 'A hiding spot is off the map', '', q, sel); continue; }
      if (cells[c.cy * gw + c.cx] === 1) {
        // a solid prop's own spot (a car, a tree): aliens start "behind" it
        // and get pushed clear when they run; they just never run back to it
        if (src && src.t !== 'hide') { inProps++; continue; }
        if (stuck++ < 8) add('warn', 'A hiding spot is in a wall cell', 'An alien can start here but can’t run back to it (aliens path on a 16px grid). Move it clear of the wall.', q, sel);
      } else if (!reach[c.cy * gw + c.cx]) {
        if (cut++ < 8) add('warn', 'The agent can’t get to this hiding spot', 'It’s walled off from the spawn, so an alien hiding here could never be caught.', q, sel);
      }
    }
    if (stuck > 8) add('warn', `${stuck - 8} more hiding spots in wall cells`);
    if (inProps) add('info', `${inProps} hiding spot${inProps > 1 ? 's sit' : ' sits'} inside solid props`, 'Trees, cars, bins and the like: aliens can start behind them, but once flushed they never run back to them. The built-in maps work this way too.');
    if (cut > 8) add('warn', `${cut - 8} more hiding spots the agent can’t reach`);
  }

  // ---- assets + tiles ----
  for (const id of new Set(map.missing)) add('error', `Missing asset: ${id}`, 'A prop here uses an asset that doesn’t exist (a custom asset that was deleted?). It won’t show in the game.');
  const badTiles = new Set();
  for (const row of doc.ground) for (const t of row) if (!tiles[t]) badTiles.add(t);
  for (const t of badTiles) add('error', `Unknown ground tile #${t}`, 'Shown as magenta checks. Paint over it, or re-create the custom tile.');

  // ---- outside the map ----
  let off = 0;
  doc.objects.forEach((o, i) => {
    if (o.x < -64 || o.y < -64 || o.x > map.w + 32 || o.y > map.h + 32) { if (off++ < 4) add('info', 'Something is out past the edge of the map', 'It won’t be seen in the game.', { x: o.x, y: o.y }, { k: 'obj', i }); }
  });

  // ---- story scenes ----
  const road = doc.paint.findIndex(o => o.op === 'path' && o.id === 'road');
  const roadBlocked = () => {
    if (road < 0) return;
    const pts = doc.paint[road].pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 8);
      for (let k = 0; k <= n; k++) {
        const x = a.x + (b.x - a.x) * k / n, y = a.y + (b.y - a.y) * k / n;
        if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
        if (insideSolid(map, x, y)) {
          add('warn', 'Something solid blocks the story road', 'The scene’s scripted runs follow the road and can get caught here.', { x, y }, { k: 'paint', i: road });
          return;
        }
      }
    }
  };
  if (doc.id === 'farmfields') {
    if (road < 0) add('error', 'Scene 1 needs its story road', 'The stampede at the end runs up the dirt road marked "story road" and off the north edge. Select a road and tick "Story road", or the aliens run straight north.');
    else roadBlocked();
    if (!doc.objects.some(o => o.t === 'hide' && o.tutor)) add('warn', 'No tutorial hiding spot', 'The tutorial’s first alien hides in the spot ticked "Tutorial hider" (else the one nearest the van). Tick one near the van.');
    if (map.exit && insideSolid(map, map.exit.x, Math.max(2, 20))) add('warn', 'The stampede exit is walled off', 'The road’s north end runs into the forest wall. Leave a gap in it.', map.exit, { k: 'paint', i: road });
  }
  if (doc.id === 'barnyard') {
    if (road < 0) add('warn', 'Scene 2 has no story road', 'The agent’s walk-in follows the road marked "story road". Without it he walks straight up from the WALK-IN START marker.');
    else roadBlocked();
    if (!map.barn) add('warn', 'Scene 2 has no barn', 'Four of the twelve hide in the building with id "barn". Without one they hide outside.');
    if (!map.greenhouse) add('warn', 'Scene 2 has no greenhouse', 'Two of the twelve hide in the building with id "greenhouse". Without one they hide outside.');
    const ar = map.arrive;
    if (ar && insideSolid(map, ar.x, ar.y - 4)) add('error', 'The walk-in start is inside something solid', '', ar, { k: 'arrive' });
    if (typeof doc.story.treeLine === 'number' && (doc.story.treeLine < 8 || doc.story.treeLine > map.h - 8)) add('warn', 'The tree line is off the map', 'At the end the aliens bolt north past this line.', null, { k: 'treeLine' });
  }

  const order = { error: 0, warn: 1, info: 2 };
  out.sort((a, b) => order[a.sev] - order[b.sev]);
  return out;
}
