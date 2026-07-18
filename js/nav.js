import { TILE } from './data/sprites.js';

// Coarse nav grid over the map. Cells blocked by non-jumpable solids are walls;
// jumpable solids are passable (aliens hop them, the player must jump).

export function buildNav(map) {
  const gw = map.tw, gh = map.th;
  const cells = new Uint8Array(gw * gh); // 0 open, 1 wall, 2 hop
  for (const s of map.solids) {
    const x0 = Math.max(0, Math.floor(s.x / TILE));
    const y0 = Math.max(0, Math.floor(s.y / TILE));
    const x1 = Math.min(gw - 1, Math.floor((s.x + s.w - 1) / TILE));
    const y1 = Math.min(gh - 1, Math.floor((s.y + s.h - 1) / TILE));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * gw + x;
        if (s.jumpable) { if (cells[i] === 0) cells[i] = 2; }
        else cells[i] = 1;
      }
    }
  }
  return { gw, gh, cells };
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// BFS path from world (x0,y0) to (x1,y1). Returns array of world waypoints (cell centers) or null.
export function findPath(nav, x0, y0, x1, y1) {
  const { gw, gh, cells } = nav;
  const sx = Math.max(0, Math.min(gw - 1, Math.floor(x0 / TILE)));
  const sy = Math.max(0, Math.min(gh - 1, Math.floor(y0 / TILE)));
  const tx = Math.max(0, Math.min(gw - 1, Math.floor(x1 / TILE)));
  const ty = Math.max(0, Math.min(gh - 1, Math.floor(y1 / TILE)));
  if (cells[ty * gw + tx] === 1) return null;

  const prev = new Int32Array(gw * gh).fill(-1);
  const start = sy * gw + sx, target = ty * gw + tx;
  if (start === target) return [{ x: x1, y: y1 }];
  prev[start] = start;
  let queue = [start];
  let found = false;
  let guard = 0;
  while (queue.length && !found && guard < 2600) {
    const next = [];
    for (const cur of queue) {
      const cx = cur % gw, cy = (cur / gw) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const ni = ny * gw + nx;
        if (prev[ni] !== -1 || cells[ni] === 1) continue;
        // no diagonal squeezing through wall corners
        if (dx && dy && (cells[cy * gw + nx] === 1 || cells[ny * gw + cx] === 1)) continue;
        prev[ni] = cur;
        if (ni === target) { found = true; break; }
        next.push(ni);
        guard++;
      }
      if (found) break;
    }
    queue = next;
  }
  if (!found) return null;
  const path = [];
  let cur = target;
  while (cur !== start) {
    const cx = cur % gw, cy = (cur / gw) | 0;
    path.push({ x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2 });
    cur = prev[cur];
  }
  path.reverse();
  path.push({ x: x1, y: y1 });
  return path;
}

// Circle vs solid AABBs; returns resolved position. airborne skips jumpable.
export function collide(map, x, y, r, airborne = false) {
  for (const s of map.solids) {
    if (airborne && s.jumpable) continue;
    const cx = Math.max(s.x, Math.min(x, s.x + s.w));
    const cy = Math.max(s.y, Math.min(y, s.y + s.h));
    const dx = x - cx, dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 === 0) {
        // Center inside the box: push out the shortest side
        const left = x - s.x, right = s.x + s.w - x;
        const top = y - s.y, bot = s.y + s.h - y;
        const min = Math.min(left, right, top, bot);
        if (min === left) x = s.x - r;
        else if (min === right) x = s.x + s.w + r;
        else if (min === top) y = s.y - r;
        else y = s.y + s.h + r;
      } else {
        const d = Math.sqrt(d2);
        x = cx + dx / d * r;
        y = cy + dy / d * r;
      }
    }
  }
  return { x, y };
}

export function overlapsJumpable(map, x, y, r) {
  for (const s of map.solids) {
    if (!s.jumpable) continue;
    const cx = Math.max(s.x, Math.min(x, s.x + s.w));
    const cy = Math.max(s.y, Math.min(y, s.y + s.h));
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

export function lineBlocked(map, x0, y0, x1, y1) {
  // sample every 8px; jumpable solids don't block sight
  const dx = x1 - x0, dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.floor(dist / 8));
  for (let i = 1; i < steps; i++) {
    const px = x0 + dx * i / steps, py = y0 + dy * i / steps;
    for (const s of map.solids) {
      if (s.jumpable) continue;
      if (px >= s.x && px <= s.x + s.w && py >= s.y && py <= s.y + s.h) return true;
    }
  }
  return false;
}
