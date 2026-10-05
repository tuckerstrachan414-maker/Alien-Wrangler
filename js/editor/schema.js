// What every editable thing in a map doc is: its fields (for the inspector),
// its bounds (for picking and box-select), and how it moves.
import { T, TILE } from '../data/sprites.js';
import { getAsset } from '../data/assets.js';
import { BUILDING_KINDS } from '../data/maps.js';

const rnd = () => 1 + Math.floor(Math.random() * 9000);

/* ---------------- ground art (doc.paint) ---------------- */
// fields: [key, label, type, opts]; type: int | num | deg | tile | text | select | bool
export const PAINT_KINDS = {
  path: {
    label: 'Dirt road', icon: '\u{1F6E3}', points: true,
    help: 'A smooth road painted over the tiles. Drag its points; Alt+click a stretch to add a point, double-click a point to remove it.',
    fields: [['halfW', 'Half width', 'int', { min: 4, max: 60 }], ['rut', 'Wheel ruts', 'int', { min: 0, max: 30 }],
      ['tex', 'Textures', 'tiles']],
    make: (pts) => ({ op: 'path', pts, halfW: 22, tex: [T.ROAD_DIRT, T.ROAD_DIRT2] }),
  },
  footprints: {
    label: 'Muddy footprints', icon: '\u{1F463}', points: true,
    help: 'A trail of prints along its points. Alt+click to add a point, double-click one to remove it.',
    fields: [['step', 'Stride', 'int', { min: 3, max: 20 }], ['seed', 'Seed', 'int']],
    make: (pts) => ({ op: 'footprints', pts, seed: rnd(), step: 7 }),
  },
  forest: {
    label: 'Forest canopy', icon: '\u{1F332}', rect: true,
    help: 'Dense tree tops painted into the ground. Nobody can walk under it unless you leave it open: add a collision box over it to wall it off.',
    fields: [['x', 'X', 'int'], ['y', 'Y', 'int'], ['w', 'Width', 'int', { min: 4 }], ['h', 'Height', 'int', { min: 4 }], ['seed', 'Seed', 'int']],
    make: (x, y, w = 96, h = 64) => ({ op: 'forest', x, y, w, h, seed: rnd() }),
  },
  scorch: {
    label: 'Scorch mark', icon: '\u{1F525}', rect: true,
    fields: [['x', 'X', 'int'], ['y', 'Y', 'int'], ['w', 'Width', 'int', { min: 4 }], ['h', 'Height', 'int', { min: 4 }], ['seed', 'Seed', 'int']],
    make: (x, y) => ({ op: 'scorch', x: x - 23, y: y - 14, w: 46, h: 28, seed: rnd() }),
  },
  straw: {
    label: 'Loose straw', icon: '\u{1F33E}', rect: true,
    fields: [['x', 'X', 'int'], ['y', 'Y', 'int'], ['w', 'Width', 'int', { min: 1 }], ['h', 'Height', 'int', { min: 1 }],
      ['count', 'Strands', 'int', { min: 1, max: 600 }], ['seed', 'Seed', 'int']],
    make: (x, y, w = 48, h = 32) => ({ op: 'straw', x, y, w, h, count: 40, seed: rnd() }),
  },
  grain: {
    label: 'Spilled grain', icon: '\u{1F33D}', rect: true,
    fields: [['x', 'X', 'int'], ['y', 'Y', 'int'], ['w', 'Width', 'int', { min: 1 }], ['h', 'Height', 'int', { min: 1 }], ['seed', 'Seed', 'int']],
    make: (x, y, w = 18, h = 8) => ({ op: 'grain', x, y, w, h, seed: rnd() }),
  },
  mud: {
    label: 'Mud patch', icon: '\u{1F7E4}',
    fields: [['x', 'Centre X', 'int'], ['y', 'Centre Y', 'int'], ['rx', 'Radius X', 'int', { min: 1 }], ['ry', 'Radius Y', 'int', { min: 1 }], ['seed', 'Seed', 'int']],
    make: (x, y) => ({ op: 'mud', x, y, rx: 10, ry: 6, seed: rnd() }),
  },
  tool: {
    label: 'Dropped tool', icon: '\u{1F528}',
    fields: [['kind', 'Tool', 'select', { options: ['pitchfork', 'rake', 'shovel', 'hammer'] }], ['x', 'Handle X', 'int'], ['y', 'Handle Y', 'int'], ['ang', 'Angle', 'deg']],
    make: (x, y) => ({ op: 'tool', kind: 'pitchfork', x, y, ang: 0.3 }),
  },
  bucket: { label: 'Spilled bucket', icon: '\u{1FAA3}', fields: [['x', 'X', 'int'], ['y', 'Y', 'int']], make: (x, y) => ({ op: 'bucket', x: x - 4, y: y - 4 }) },
  boards: { label: 'Broken boards', icon: '\u{1FAB5}', fields: [['x', 'X', 'int'], ['y', 'Y', 'int']], make: (x, y) => ({ op: 'boards', x: x - 7, y: y - 4 }) },
  eggs: { label: 'Egg clutch', icon: '\u{1F95A}', fields: [['x', 'X', 'int'], ['y', 'Y', 'int']], make: (x, y) => ({ op: 'eggs', x: x - 7, y: y - 4 }) },
  pot: { label: 'Broken pot', icon: '\u{1FAB4}', fields: [['x', 'X', 'int'], ['y', 'Y', 'int']], make: (x, y) => ({ op: 'pot', x: x - 4, y: y - 3 }) },
};

const ptsBox = (pts, pad) => {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
};

export function paintBox(o) {
  switch (o.op) {
    case 'path': return ptsBox(o.pts, (o.halfW ?? 22) + 2);
    case 'footprints': return ptsBox(o.pts, 5);
    case 'forest': case 'scorch': case 'straw': case 'grain': return { x: o.x, y: o.y, w: o.w, h: o.h };
    case 'mud': return { x: o.x - o.rx - 2, y: o.y - o.ry - 2, w: o.rx * 2 + 4, h: o.ry * 2 + 4 };
    case 'tool': {
      const L = o.kind === 'hammer' ? 10 : 27, ex = o.x + Math.cos(o.ang || 0) * L, ey = o.y + Math.sin(o.ang || 0) * L;
      return ptsBox([{ x: o.x, y: o.y }, { x: ex, y: ey }], 5);
    }
    case 'bucket': return { x: o.x, y: o.y - 2, w: 21, h: 11 };
    case 'boards': return { x: o.x, y: o.y, w: 15, h: 8 };
    case 'eggs': return { x: o.x - 2, y: o.y - 1, w: 18, h: 10 };
    case 'pot': return { x: o.x - 1, y: o.y - 3, w: 11, h: 10 };
    default: return { x: o.x || 0, y: o.y || 0, w: 8, h: 8 };
  }
}

export function movePaint(o, dx, dy) {
  if (o.pts) for (const p of o.pts) { p.x += dx; p.y += dy; }
  else { o.x += dx; o.y += dy; }
}

// The point a paint op is "at" (for box-select and moving with a building).
export function paintAnchor(o) {
  if (o.pts) return o.pts[0];
  if (o.op === 'mud') return { x: o.x, y: o.y };
  const b = paintBox(o);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/* ---------------- objects (doc.objects) ---------------- */

export function objBox(o) {
  if (o.t === 'prop') {
    const def = getAsset(o.a);
    const w = def ? def.img.width : 16, h = def ? def.img.height : 16;
    return { x: o.x, y: o.y, w, h };
  }
  if (o.t === 'solid') return { x: o.x, y: o.y, w: o.w, h: o.h };
  if (o.t === 'hide') return { x: o.x - 5, y: o.y - 5, w: 10, h: 10 };
  if (o.t === 'building') {
    const H = (o.H || 30) + (o.G || 0) + 2;
    return { x: o.x, y: o.y - H, w: o.w, h: o.d + H };
  }
  return { x: o.x, y: o.y, w: 8, h: 8 };
}

// Where an object stands (its base): props by the middle of their bottom edge.
export function objAnchor(o) {
  if (o.t === 'prop') {
    const b = objBox(o);
    return { x: b.x + b.w / 2, y: b.y + b.h };
  }
  if (o.t === 'solid' || o.t === 'building') return { x: o.x + o.w / 2, y: o.y + (o.t === 'building' ? o.d : o.h) / 2 };
  return { x: o.x, y: o.y };
}

export function objLabel(o) {
  if (o.t === 'prop') {
    const def = getAsset(o.a);
    return def ? null : `missing asset ${o.a}`;
  }
  return null;
}

export const BUILDING_FIELDS = [
  ['x', 'X', 'int', { step: TILE }], ['y', 'Y', 'int', { step: TILE }], ['w', 'Width', 'int', { step: TILE, min: TILE * 3 }],
  ['d', 'Depth', 'int', { step: TILE, min: TILE * 3 }], ['wall', 'Wall', 'int', { min: 2, max: 16 }],
  ['H', 'Eaves height', 'int', { min: 8, max: 80 }], ['G', 'Roof rise', 'int', { min: 0, max: 60 }],
];

export function newBuilding(kind, x, y, id) {
  const D = BUILDING_KINDS[kind].defaults;
  const o = { t: 'building', id, kind, x, y, w: D.w, d: D.d, wall: D.t, H: D.H, G: D.G, doors: JSON.parse(JSON.stringify(D.doors)) };
  if (D.floor !== undefined) o.floor = D.floor;
  if (D.glass) o.glass = true;
  if (D.insideAlpha) o.insideAlpha = D.insideAlpha;
  if (D.behindAlpha !== undefined && D.behindAlpha !== 0.4) o.behindAlpha = D.behindAlpha;
  return o;
}
