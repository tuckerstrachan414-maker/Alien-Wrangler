// Soft transitions between ground textures, so a field doesn't end in a hard
// 16px staircase where grass meets soil or road.
//
// Every tile belongs to a terrain group with a priority. Along a border the
// higher-priority terrain bleeds a few pixels into its lower neighbour
// (grass creeps over the road edge and into the crop plots, the forest floor
// over the grass). The bleed is ordered-dithered rather than alpha-blended so
// it stays crisp pixel art, and its depth wobbles with a noise field sampled
// in world space, so the edge is organic and continuous from tile to tile.
//
// Opt-in per map: set `map.blend = true` and every tile listed in TERRAIN
// joins in; unlisted tiles keep their hard edges.
import { T, TILE } from './data/sprites.js';

export const TERRAIN = {
  [T.ROAD_DIRT]: { group: 'road', pri: 0 },
  [T.ROAD_DIRT2]: { group: 'road', pri: 0 },
  [T.DIRT]: { group: 'road', pri: 0 },
  [T.GRAVEL]: { group: 'road', pri: 0 },
  [T.SOIL]: { group: 'soil', pri: 1 },
  [T.CARROT]: { group: 'carrot', pri: 1.1 },
  [T.CABBAGE]: { group: 'cabbage', pri: 1.2 },
  [T.LETTUCE]: { group: 'lettuce', pri: 1.3 },
  [T.PUMPKIN]: { group: 'pumpkin', pri: 1.4 },
  [T.WHEAT]: { group: 'wheat', pri: 1.5 },
  [T.CORNFIELD]: { group: 'corn', pri: 1.6 },
  [T.GRASS]: { group: 'grass', pri: 2 },
  [T.GRASS2]: { group: 'grass', pri: 2 },
  [T.MEADOW]: { group: 'grass', pri: 2 },
  [T.FOREST]: { group: 'forest', pri: 3 },
};

// 4x4 ordered-dither thresholds
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);

function hash(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// smooth value noise in [0, 1]
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// How far pixel (px, py) of a tile sits from the side / corner it shares with
// the neighbour at offset (dx, dy).
function edgeDist(dx, dy, px, py) {
  const ex = dx < 0 ? px + 0.5 : TILE - 0.5 - px;
  const ey = dy < 0 ? py + 0.5 : TILE - 0.5 - py;
  if (dx === 0) return ey;
  if (dy === 0) return ex;
  return Math.hypot(ex, ey);
}

// Pixel data of a 16x16 tile texture, cached per tile set.
const TEX_CACHE = new WeakMap();
function texOf(tiles, id) {
  let cache = TEX_CACHE.get(tiles);
  if (!cache) TEX_CACHE.set(tiles, cache = new Map());
  let d = cache.get(id);
  if (!d) {
    const c = document.createElement('canvas');
    c.width = TILE; c.height = TILE;
    const x = c.getContext('2d');
    x.drawImage(tiles[id], 0, 0);
    d = x.getImageData(0, 0, TILE, TILE).data;
    cache.set(id, d);
  }
  return d;
}

// Re-paint the borders of an already tile-drawn ground canvas.
export function blendGround(ctx, map, tiles, table = TERRAIN) {
  const { tw, th, ground } = map;
  const W = tw * TILE, H = th * TILE;
  const img = ctx.getImageData(0, 0, W, H);
  const out = img.data;
  const tex = (id) => texOf(tiles, id);
  // off-map neighbours repeat the edge tile, so the map border never blends
  const idAt = (x, y) => ground[Math.max(0, Math.min(th - 1, y)) * tw + Math.max(0, Math.min(tw - 1, x))];

  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      const me = table[ground[ty * tw + tx]];
      if (!me) continue;
      // higher-priority neighbours, grouped (a group's texture comes from
      // an edge neighbour when there is one: it lines up best)
      const nbs = [];
      const groups = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const id = idAt(tx + dx, ty + dy);
          const t = table[id];
          if (!t || t.pri <= me.pri) continue;
          nbs.push({ dx, dy, group: t.group });
          let g = groups.find(q => q.group === t.group);
          if (!g) groups.push(g = { group: t.group, pri: t.pri, id, edge: !(dx && dy) });
          else if (!g.edge && !(dx && dy)) { g.id = id; g.edge = true; }
        }
      }
      if (!nbs.length) continue;
      groups.sort((a, b) => a.pri - b.pri);
      for (const g of groups) { g.tex = tex(g.id); g.nbs = nbs.filter(n => n.group === g.group); }

      for (let py = 0; py < TILE; py++) {
        const wy = ty * TILE + py;
        for (let px = 0; px < TILE; px++) {
          const wx = tx * TILE + px;
          // bleed depth: 1..8px, wandering along the border; solid up to a
          // wavy line, then a thin dithered fringe
          const depth = 1 + 7 * noise(wx * 0.11, wy * 0.11);
          const thr = BAYER[(wy & 3) * 4 + (wx & 3)];
          let pick = null;
          for (const g of groups) {
            let cov = 0;
            for (const n of g.nbs) cov = Math.max(cov, (depth - edgeDist(n.dx, n.dy, px, py)) / 2.5 + 0.5);
            if (cov > thr) pick = g;           // later groups outrank earlier ones
          }
          if (!pick) continue;
          const si = (py * TILE + px) * 4, di = (wy * W + wx) * 4;
          out[di] = pick.tex[si]; out[di + 1] = pick.tex[si + 1]; out[di + 2] = pick.tex[si + 2];
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Paint a smooth road along a polyline straight into the ground canvas: the
// texture of `texIds` (mixed per tile so no pattern repeats), a wobbly
// dithered edge, a darker packed shoulder and two faint wheel ruts. Used
// instead of road tiles, which can only turn in 16px stair steps.
export function paintPath(ctx, tiles, pts, { halfW = 22, texIds, rut = 8 } = {}) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const pad = halfW + 6;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const bx0 = Math.max(0, Math.floor(Math.min(...xs) - pad)), bx1 = Math.min(W, Math.ceil(Math.max(...xs) + pad));
  const by0 = Math.max(0, Math.floor(Math.min(...ys) - pad)), by1 = Math.min(H, Math.ceil(Math.max(...ys) + pad));
  if (bx1 <= bx0 || by1 <= by0) return;
  const bw = bx1 - bx0, bh = by1 - by0;
  const img = ctx.getImageData(bx0, by0, bw, bh);
  const out = img.data;
  const texes = texIds.map(id => texOf(tiles, id));

  for (let y = 0; y < bh; y++) {
    const wy = by0 + y;
    for (let x = 0; x < bw; x++) {
      const wx = bx0 + x;
      // nearest point on the polyline, and which side of it we're on
      let best = 1e9, side = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const len2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((wx + 0.5 - a.x) * dx + (wy + 0.5 - a.y) * dy) / len2));
        const ex = wx + 0.5 - (a.x + dx * t), ey = wy + 0.5 - (a.y + dy * t);
        const d = Math.hypot(ex, ey);
        if (d < best) { best = d; side = (dx * ey - dy * ex) / Math.sqrt(len2); }
      }
      const edge = halfW + 5 * (noise(wx * 0.08, wy * 0.08) - 0.5);
      const cov = (edge - best) / 3 + 0.5;
      if (cov <= BAYER[(wy & 3) * 4 + (wx & 3)]) continue;
      const tex = texes[(hash(wx >> 4, wy >> 4) * texes.length) | 0];
      const si = (((wy & 15) * TILE) + (wx & 15)) * 4, di = (y * bw + x) * 4;
      // packed shoulder along the edge, ruts a wheel-width either side of centre
      let k = cov < 1.4 ? 0.86 : 1;
      if (Math.abs(Math.abs(side) - rut) < 1.6 && noise(wx * 0.3, wy * 0.3) > 0.3) k *= 0.84;
      out[di] = tex[si] * k; out[di + 1] = tex[si + 1] * k; out[di + 2] = tex[si + 2] * k;
      // loose pebbles, scattered at random (a lit top over a shadow)
      if (cov > 2) {
        if (hash(wx * 7 + 3, wy * 13) < 0.005) { out[di] = 182; out[di + 1] = 176; out[di + 2] = 164; }
        else if (hash(wx * 7 + 3, (wy - 1) * 13) < 0.005) { out[di] = 110; out[di + 1] = 104; out[di + 2] = 96; }
      }
    }
  }
  ctx.putImageData(img, bx0, by0);
}
