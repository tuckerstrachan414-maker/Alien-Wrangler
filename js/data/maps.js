import { T, TILE, paintForest, scorchDecal, mulberry } from './sprites.js';
import {
  barnArt, nestWall, greenhouseArt, greenhouseBackWall,
  strawScatter, mudPatch, footprints, floorTool, spilledBucket, grainSpill, brokenBoards, eggClutch, brokenPot,
} from './barnyardArt.js';
import { paintPath } from '../terrain.js';
import { PROPS, YARD, HWY, getAsset, assetId, cropAsset } from './assets.js';
import { HighwayStrip, CW, NP, TH, STATION_SET, CLEARING_SET } from './highwayStrip.js';

// A map = ground tile grid + props (with solids & hide spots) + van + player spawn.
// World units are pixels; tiles are 16px.
//
// Every map is plain data underneath (a "map doc", see toDoc): the ground
// grid, an ordered list of objects (props, bodies, hiding spots, walk-in
// buildings), the art painted into the ground (roads, forest canopy,
// decals), the van, the spawn and any story-scene markers. The builders
// below write a map's doc by placing things (MapBuilder records as it
// goes), and the game always builds the map it plays from a doc
// (compileMap). The map editor (editor.html) edits docs; an edited doc
// saved in maps/<id>.json (or kept as a local draft in the browser)
// replaces the builder's (see setMapEdits / mapDoc).

const clone = (o) => (o === undefined ? o : JSON.parse(JSON.stringify(o)));

// Walk-in buildings. `art` draws the shell + cutaway (barnyardArt.js), and
// `backWall` is the inside face of the back wall: a separate y-sorted prop
// that comes with the building. A missing door is parked off the canvas.
const NO_DOOR = [-999, -999];
export const BUILDING_KINDS = {
  barn: {
    name: 'Barn',
    rustle: '#d9b85a',                        // hay flies when something stirs in here
    defaults: { w: 224, d: 160, t: 8, H: 30, G: 28, floor: T.BARN_FLOOR, doors: { s: [80, 128], e: [64, 96] } },
    art: ({ w, d, H, G, t, doors }) => barnArt({ w, d, H, G, t, south: doors.s || NO_DOOR, east: doors.e }),
    backWall: ({ w, H, t }) => ({ def: nestWall(w, H, t), dx: 0, dy: -H }),
  },
  greenhouse: {
    name: 'Greenhouse',
    rustle: null,
    defaults: { w: 112, d: 80, t: 4, H: 22, G: 12, floor: T.GH_FLOOR, glass: true, insideAlpha: 0.1, behindAlpha: 0.7,
      doors: { s: [48, 64], n: [48, 64] } },
    art: ({ w, d, H, G, t, doors }) => greenhouseArt({ w, d, H, G, t, south: doors.s || NO_DOOR }),
    backWall: ({ w, t, doors }) => ({ def: greenhouseBackWall(w, t, doors.n || NO_DOOR), dx: 0, dy: -5 }),
  },
};
const BUILDING_ART = new Map();               // same params, same canvases: build them once

// Ground art, painted into the ground canvas after the tiles (and their
// blended edges), in order. Each op is plain data, so the editor can move it.
export const PAINT_OPS = {
  path: (g, tiles, o) => paintPath(g, tiles, o.pts, {
    halfW: o.halfW ?? 22, texIds: o.tex || [T.ROAD_DIRT, T.ROAD_DIRT2], ...(o.rut !== undefined ? { rut: o.rut } : {}),
  }),
  forest: (g, tiles, o) => paintForest(g, o.x, o.y, o.w, o.h, o.seed ?? 1),
  scorch: (g, tiles, o) => g.drawImage(scorchDecal(o.w, o.h, o.seed ?? 1), o.x, o.y),
  straw: (g, tiles, o) => strawScatter(g, o.x, o.y, o.w, o.h, o.count ?? 40, o.seed ?? 1),
  mud: (g, tiles, o) => mudPatch(g, o.x, o.y, o.rx, o.ry, o.seed ?? 1),
  footprints: (g, tiles, o) => footprints(g, o.pts, o.seed ?? 1, { step: o.step ?? 7, start: o.start ?? 0 }),
  tool: (g, tiles, o) => floorTool(g, o.kind, o.x, o.y, o.ang ?? 0),
  bucket: (g, tiles, o) => spilledBucket(g, o.x, o.y),
  grain: (g, tiles, o) => grainSpill(g, o.x, o.y, o.w, o.h, o.seed ?? 1),
  boards: (g, tiles, o) => brokenBoards(g, o.x, o.y),
  eggs: (g, tiles, o) => eggClutch(g, o.x, o.y),
  pot: (g, tiles, o) => brokenPot(g, o.x, o.y),
};

export function runPaintOps(g, tiles, ops) {
  for (const o of ops) {
    const f = PAINT_OPS[o.op];
    if (f) f(g, tiles, o);
  }
}

export class MapBuilder {
  constructor(name, tw, th, baseTile) {
    this.name = name;
    this.tw = tw; this.th = th;
    this.w = tw * TILE; this.h = th * TILE;
    this.ground = new Array(tw * th).fill(baseTile);
    this.props = [];
    this.solids = [];
    this.hideSpots = [];
    this.homes = [];        // window glow points for the stealth system
    this.stealth = false;   // neighbourhood: keep-quiet suspicion mechanic
    this.tint = null;       // e.g. 'night' -> dark overlay
    this.volcano = null;    // {x,y} crater -> ambient smoke (the first of volcanoes)
    this.volcanoes = [];    // every volcano's crater
    this.smoke = [];        // [{x,y}] thin smoke columns (crashed pods)
    this.blend = false;     // soft dithered edges between ground textures (terrain.js)
    this.paintGround = null; // (ctx, tiles) => extra art baked into the ground canvas
    this.buildings = [];    // walk-in buildings: the roof fades while the agent is inside
    this.van = { x: 60, y: 60 };
    this.spawn = { x: 80, y: 80 };
    // what goes in the map's doc
    this.record = true;     // off for Highway 29, which streams in forever
    this.objects = [];      // props, bodies, hiding spots, buildings, in the order they went down
    this.paintOps = [];     // ground art (PAINT_OPS), in order
    this.decals = [];       // ground art that came with a prop (a pod's scorch mark)
    this.story = {};        // story-scene markers the director needs (see RIGS)
    this.missing = [];      // asset ids a doc asked for that don't exist
    // world border walls
    const B = 6;
    this.solids.push(
      { x: -B, y: -B, w: this.w + B * 2, h: B, jumpable: false },
      { x: -B, y: this.h, w: this.w + B * 2, h: B, jumpable: false },
      { x: -B, y: -B, w: B, h: this.h + B * 2, jumpable: false },
      { x: this.w, y: -B, w: B, h: this.h + B * 2, jumpable: false },
    );
  }

  fill(tile, tx, ty, tw, th) {
    for (let y = ty; y < ty + th; y++)
      for (let x = tx; x < tx + tw; x++)
        if (x >= 0 && y >= 0 && x < this.tw && y < this.th)
          this.ground[y * this.tw + x] = tile;
    return this;
  }

  // Seeded variety: swap base tiles for alt randomly
  variety(from, to, chance, seed) {
    let s = seed;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    for (let i = 0; i < this.ground.length; i++)
      if (this.ground[i] === from && rnd() < chance) this.ground[i] = to;
    return this;
  }

  prop(key, x, y, opts = {}) {
    return this.customProp(PROPS[key], x, y, opts);
  }

  // Like prop(), but takes a prop definition directly instead of a PROPS[key]
  // lookup (any def registered in assets.js). `extra` is anything that comes
  // with this one prop and moves with it (offsets from its top-left):
  //   spot:  { x, y, inside }  a hiding spot of its own (a pod's open hatch)
  //   smoke: [{ x, y }]        thin smoke columns
  //   decal: { op, x, y, ... } ground art under it (a PAINT_OPS op)
  customProp(def, x, y, opts = {}, extra = null) {
    const o = { t: 'prop', a: this.record ? assetId(def) : null, x, y };
    for (const k of ['noSolid', 'noHide', 'see']) if (opts[k]) o[k] = true;
    if (extra) for (const k of ['spot', 'smoke', 'decal']) if (extra[k]) o[k] = clone(extra[k]);
    if (this.record) this.objects.push(o);
    this.placeProp(def, x, y, o);
    return this;
  }

  placeProp(def, x, y, o) {
    const pr = { key: o.a || null, x, y, img: def.img, tall: def.tall, baseY: y + def.img.height };
    if (o.see) pr.see = true;             // crown thins out while the agent is under it
    this.props.push(pr);
    if (def.solid && !o.noSolid) {
      this.solids.push({ x: x + def.solid.x, y: y + def.solid.y, w: def.solid.w, h: def.solid.h, jumpable: def.jumpable });
    }
    if (def.extraSolids) {
      for (const s of def.extraSolids)
        this.solids.push({ x: x + s.x, y: y + s.y, w: s.w, h: s.h, jumpable: def.jumpable });
    }
    if (def.hide && !o.noHide) {
      const cx = x + def.img.width / 2;
      const cy = def.solid ? y + def.solid.y + def.solid.h / 2 : y + def.img.height / 2;
      this.hideSpots.push({ x: cx, y: cy, inside: !def.solid || def.jumpable });
    }
    if (o.spot) this.hideSpots.push({ x: x + o.spot.x, y: y + o.spot.y, inside: !!o.spot.inside });
    for (const s of o.smoke || []) this.smoke.push({ x: x + s.x, y: y + s.y });
    if (o.decal) this.decals.push({ ...o.decal, x: x + o.decal.x, y: y + o.decal.y });
    // a house's lit windows are "homes" for the stealth system
    for (const w of def.windows || []) this.homes.push({ x: x + w.x, y: y + w.y, w: w.w, h: w.h, alertT: 0 });
    if (def.crater) this.volcanoes.push({ x: x + def.crater.x, y: y + def.crater.y });
  }

  // Place a house (its lit windows register as stealth "homes").
  house(key, x, y) {
    return this.customProp(PROPS[key], x, y);
  }

  // Like house(), but takes a prop definition directly (see customProp()).
  customHouse(def, x, y) {
    return this.customProp(def, x, y);
  }

  fenceRowH(x, y, count) {
    for (let i = 0; i < count; i++) this.prop('fenceH', x + i * 16, y);
    return this;
  }
  fenceRowV(x, y, count) {
    for (let i = 0; i < count; i++) this.prop('fenceV', x, y + i * 16);
    return this;
  }

  // Bodies with no prop of their own (forest bands, the sea): { x, y, w, h, jumpable, glass }.
  solid(...rects) {
    for (const r of rects) {
      const s = { x: r.x, y: r.y, w: r.w, h: r.h, jumpable: !!r.jumpable };
      if (r.glass) s.glass = true;
      this.solids.push(s);
      if (this.record) {
        const o = { t: 'solid', x: r.x, y: r.y, w: r.w, h: r.h };
        if (r.jumpable) o.jumpable = true;
        if (r.glass) o.glass = true;
        this.objects.push(o);
      }
    }
    return this;
  }

  // Hiding spots with no prop of their own: { x, y, inside }. `tutor` marks
  // the one Stage 1's tutorial hides its first alien in.
  hide(...spots) {
    for (const sp of spots) {
      const s = { x: sp.x, y: sp.y, inside: !!sp.inside };
      if (sp.rustle) s.rustle = sp.rustle;
      if (sp.tutor) s.tutor = true;
      this.hideSpots.push(s);
      if (this.record) this.objects.push({ t: 'hide', ...s });
    }
    return this;
  }

  // Ground art (a PAINT_OPS op), painted over the tiles in order.
  paint(...ops) {
    for (const op of ops) this.paintOps.push(clone(op));
    return this;
  }

  // A walk-in building on a tile-aligned footprint (x, y, w, d in px). Its
  // walls run `t` thick round the outside edge of the footprint, broken by
  // doors = { n, s, e, w: [a, b) } (local px along that side), so the nav
  // grid sees solid wall cells with open doorway cells. `kind` picks its
  // art (BUILDING_KINDS: H = eaves height, G = roof rise); `floor` fills
  // the inside with a ground tile. Glass walls stop bodies but not eyes.
  // Hiding spots inside the footprint belong to it (done()).
  building(x, y, w, d, { id, kind, t, doors = {}, H, G, floor, glass = false, insideAlpha = 0, behindAlpha = 0.4 }) {
    const K = BUILDING_KINDS[kind];
    if (this.record) {
      const o = { t: 'building', id, kind, x, y, w, d, wall: t, H, G, doors: clone(doors) };
      if (floor !== undefined && floor !== null) o.floor = floor;
      if (glass) o.glass = true;
      if (insideAlpha) o.insideAlpha = insideAlpha;
      if (behindAlpha !== 0.4) o.behindAlpha = behindAlpha;
      this.objects.push(o);
    }
    const wall = (sx, sy, sw, sh) => this.solids.push({ x: sx, y: sy, w: sw, h: sh, jumpable: false, glass });
    const run = (side, len, place) => {
      const gap = doors[side];
      if (!gap) { place(0, len); return; }
      if (gap[0] > 0) place(0, gap[0]);
      if (gap[1] < len) place(gap[1], len);
    };
    run('n', w, (a, b) => wall(x + a, y, b - a, t));
    run('s', w, (a, b) => wall(x + a, y + d - t, b - a, t));
    run('w', d, (a, b) => wall(x, y + a, t, b - a));
    run('e', d, (a, b) => wall(x + w - t, y + a, t, b - a));
    if (floor !== undefined && floor !== null) this.fill(floor, x / TILE, y / TILE, w / TILE, d / TILE);
    const key = JSON.stringify([kind, w, d, H, G, t, doors]);
    let made = BUILDING_ART.get(key);
    if (!made) {
      made = { art: K.art({ w, d, H, G, t, doors }), back: K.backWall ? K.backWall({ w, d, H, G, t, doors }) : null };
      BUILDING_ART.set(key, made);
    }
    const art = made.art;
    const b = {
      id, kind, x0: x, y0: y, x1: x + w, y1: y + d, baseY: y + d, t,
      shell: art.shell, cut: art.cut, ax: x + art.ox, ay: y + art.oy,
      topAt: (wx) => y + art.top(wx - x),     // roof's top edge on screen at world x
      alpha: 1, insideAlpha, behindAlpha, glass, force: null, rustle: K.rustle,
    };
    this.buildings.push(b);
    if (made.back) this.placeProp(made.back.def, x + made.back.dx, y + made.back.dy, {});
    return b;
  }

  placeVan(x, y) {
    this.van = { x, y };
    // van body blocks; deposit zone handled in game.js by radius from door
    this.vanSolid = { x: x + 1, y: y + 6, w: 40, h: 20, jumpable: false };
    this.solids.push(this.vanSolid);
    return this;
  }

  done() {
    // a hiding spot inside a walk-in building is in it: the roof hides its
    // rustle, and a story scene can ask for spots by building (zone)
    for (const s of this.hideSpots) {
      const b = this.buildings.find(q => s.x >= q.x0 && s.x < q.x1 && s.y >= q.y0 && s.y < q.y1);
      if (!b) continue;
      s.zone = b.id;
      s.bld = b;
      if (b.rustle && !s.rustle) s.rustle = b.rustle;
    }
    this.volcano = this.volcanoes[0] || null;
    if (!this.paintGround && (this.paintOps.length || this.decals.length)) {
      const ops = this.paintOps.concat(this.decals);
      this.paintGround = (g, tiles) => runPaintOps(g, tiles, ops);
    }
    this.props.sort((a, b) => a.baseY - b.baseY);
    return this;
  }
}

/* ------------------------- PLAYGROUND ------------------------- */
export function buildPlayground() {
  const m = new MapBuilder('Sunny Pines Playground', 38, 32, T.GRASS);
  m.variety(T.GRASS, T.GRASS2, 0.35, 7);

  // asphalt parking strip along the bottom + path loop
  m.fill(T.ASPHALT, 0, 28, 38, 4);
  m.fill(T.PATH, 4, 25, 30, 2);
  m.fill(T.PATH, 8, 8, 2, 17);
  m.fill(T.PATH, 28, 8, 2, 17);
  m.fill(T.PATH, 8, 8, 22, 2);

  // woodchip play zone + sand zone
  m.fill(T.WOODCHIP, 12, 12, 14, 9);
  m.fill(T.SAND, 27, 14, 7, 6);

  // playground equipment
  m.prop('slide', 200, 190);
  m.prop('swing', 300, 200);
  m.prop('junglegym', 210, 270);
  m.prop('sandbox', 448, 236);
  m.prop('bench', 150, 396); m.prop('bench', 340, 396);
  m.prop('bench', 152, 130, {}); m.prop('bench', 360, 130);

  // trees ringing the park
  const trees = [
    [24, 20], [90, 12], [170, 8], [260, 14], [350, 10], [440, 18], [530, 12], [575, 60],
    [18, 90], [12, 180], [20, 280], [16, 360],
    [580, 140], [572, 240], [578, 330],
    [70, 60], [500, 70], [110, 340], [480, 350],
  ];
  for (const [x, y] of trees) m.prop('tree', x, y);

  // bushes (prime hiding)
  const bushes = [
    [120, 170], [420, 150], [140, 250], [470, 300], [260, 100],
    [360, 260], [80, 300], [540, 200], [200, 350], [430, 90],
  ];
  for (const [x, y] of bushes) m.prop('bush', x, y);

  // fences framing the park entrance
  m.fenceRowH(64, 408, 8); m.fenceRowH(320, 408, 8);
  m.prop('lamppost', 100, 380); m.prop('lamppost', 460, 380);

  m.placeVan(40, 460);
  m.spawn = { x: 110, y: 470 };
  return m.done();
}

/* ------------------------- FARMHOUSE ------------------------- */
export function buildFarmhouse() {
  const m = new MapBuilder("Hollow Creek Farm", 40, 34, T.GRASS);
  m.variety(T.GRASS, T.GRASS2, 0.3, 13);

  // dirt road along bottom, farmyard center
  m.fill(T.DIRT, 0, 29, 40, 5);
  m.fill(T.DIRT, 12, 12, 16, 17);
  m.variety(T.DIRT, T.GRAVEL, 0.12, 5);

  // cornfield block (left) with internal hiding
  m.fill(T.CORNFIELD, 2, 2, 9, 14);
  // corn hide spots (in the rows)
  for (const [x, y] of [[60, 60], [120, 100], [70, 180], [140, 200], [100, 140]])
    m.hide({ x, y, inside: true });

  // barn + silo (top center-right)
  m.prop('barn', 300, 30);
  m.prop('silo', 400, 44);

  // farm props
  m.prop('tractor', 200, 260);
  m.prop('coop', 480, 180);
  m.prop('scarecrow', 120, 260);
  m.prop('hay', 250, 160); m.prop('hay', 290, 300); m.prop('hay', 460, 300);
  m.prop('hay', 520, 120); m.prop('hay', 180, 380);
  m.prop('crate', 350, 120); m.prop('crate', 370, 128);
  m.prop('barrel', 392, 118);

  // animal pen (fenced)
  m.fenceRowH(432, 368, 6); m.fenceRowH(432, 448, 6);
  m.fenceRowV(428, 372, 5); m.fenceRowV(530, 372, 5);
  m.prop('hay', 470, 396);

  // trees on the fringes
  const trees = [
    [20, 300], [30, 380], [90, 440], [200, 20], [250, 8], [560, 20],
    [600, 90], [605, 200], [598, 300], [560, 460], [300, 440],
  ];
  for (const [x, y] of trees) m.prop('tree', x, y);

  const bushes = [[180, 120], [240, 220], [420, 250], [540, 250], [350, 380], [60, 250]];
  for (const [x, y] of bushes) m.prop('bush', x, y);

  m.prop('lamppost', 280, 420);

  m.placeVan(60, 484);
  m.spawn = { x: 130, y: 496 };
  return m.done();
}

/* ------------------------- SHIPYARD ------------------------- */
export function buildShipyard() {
  const m = new MapBuilder('Rust Harbor Shipyard', 40, 34, T.CONCRETE);
  m.variety(T.CONCRETE, T.GRAVEL, 0.15, 21);

  // water + dock along the top
  m.fill(T.WATER, 0, 0, 40, 4);
  m.fill(T.PLANK, 0, 4, 40, 3);
  // water is impassable
  m.solid({ x: 0, y: 0, w: m.w, h: 4 * TILE - 4, jumpable: false });

  // asphalt loading lanes
  m.fill(T.ASPHALT, 0, 29, 40, 5);
  m.fill(T.ASPHALT, 6, 12, 28, 3);
  m.fill(T.ASPHALT, 6, 22, 28, 3);

  // boats moored at the dock
  m.prop('boat', 90, 22, { noSolid: true }); m.prop('boat', 420, 20, { noSolid: true });

  // container maze (the heart of the yard)
  m.prop('containerR', 80, 150); m.prop('containerB', 140, 150);
  m.prop('containerOpen', 80, 190);
  m.prop('containerG', 300, 150); m.prop('containerR', 360, 150);
  m.prop('containerB', 300, 190); m.prop('containerOpen', 420, 190);
  m.prop('containerG', 140, 300); m.prop('containerOpen', 200, 300);
  m.prop('containerR', 380, 300); m.prop('containerB', 440, 300);
  m.prop('containerG', 480, 150);

  // crane overlooking the yard
  m.prop('crane', 560, 120);

  // clutter: crates, barrels, pallets, dumpster
  m.prop('crate', 250, 200); m.prop('crate', 268, 206); m.prop('crate', 258, 184);
  m.prop('crate', 520, 260); m.prop('crate', 60, 260);
  m.prop('barrel', 240, 160); m.prop('barrel', 254, 158); m.prop('barrel', 540, 300);
  m.prop('barrel', 100, 350); m.prop('barrel', 114, 356);
  m.prop('pallet', 300, 260, { noSolid: true }); m.prop('pallet', 160, 360, { noSolid: true });
  m.prop('dumpster', 340, 380); m.prop('dumpster', 80, 410);
  m.prop('rock', 500, 400); m.prop('rock', 200, 430);
  m.prop('lamppost', 60, 130); m.prop('lamppost', 300, 130); m.prop('lamppost', 520, 380);
  m.prop('lamppost', 250, 420);

  m.placeVan(48, 476);
  m.spawn = { x: 120, y: 488 };
  return m.done();
}

/* ------------------------- NEIGHBORHOOD ------------------------- */
// Stealth map: catch the aliens without waking the neighbours. Loud moves
// (sprint/dash/dive) near a house raise Suspicion; max it out and the block
// wakes up — the aliens scatter and you get fined.
//
// Real block layout: a horizontal street crossed by a side street, sidewalks
// on every edge, a marked crosswalk + traffic lights at the intersection,
// and two house lots per side of the cross street (split into a west block
// and an east block) — each house set back in its own yard with a driveway
// running from the garage straight down to the curb, a car parked on it and
// a mailbox at the curb end. Streetlamps and trees live on the sidewalk/yard
// strip only, never on the asphalt.
//
// Buildings, cars, the streetlamp/tree/mailbox/trash can, the traffic
// lights and the road/crosswalk tiles are all PNGs from a user-supplied
// city asset pack (assets/maple/, via pngProps.js) — Maple Street only,
// every other map is unaffected. Falls back to the original procedural
// suburban layout if the PNGs haven't loaded (assets.pngProps missing).
export function buildNeighborhood(assets) {
  const png = assets && assets.pngProps;
  const m = new MapBuilder('Maple Street', 40, 34, T.GRASS);
  m.variety(T.GRASS, T.GRASS2, 0.3, 41);
  m.stealth = true;
  m.tint = 'night';

  if (!png) {
    // ---- procedural fallback (identical to the original art/layout) ----
    m.fill(T.CONCRETE, 0, 13, 40, 8);
    m.fill(T.ASPHALT, 0, 15, 40, 4);
    m.fill(T.CONCRETE, 15, 0, 8, 34);
    m.fill(T.ASPHALT, 17, 0, 4, 34);
    for (const dx of [88, 232, 392, 536]) m.fill(T.CONCRETE, (dx / 16) | 0, 12, 3, 2);
    for (const dx of [88, 232, 392, 536]) m.fill(T.CONCRETE, (dx / 16) | 0, 20, 3, 2);
    const topHouses = [['houseCream', 40], ['houseTan', 208], ['houseBrick', 380], ['houseCream', 540]];
    for (const [key, x] of topHouses) { m.house(key, x, 108); m.prop('mailbox', x + 68, 176); }
    const botHouses = [['houseBrick', 40], ['houseCream', 208], ['houseTan', 380], ['houseBrick', 540]];
    for (const [key, x] of botHouses) { m.house(key, x, 300); m.prop('mailbox', x - 6, 300); }
    m.prop('carRed', 96, 192); m.prop('carBlue', 250, 192);
    m.prop('carWhite', 96, 268); m.prop('carRed', 420, 268); m.prop('carBlue', 560, 192);
    for (const [x, y] of [[8, 60], [270, 60], [470, 60], [610, 60], [110, 500], [430, 500], [590, 480], [8, 240]])
      m.prop('tree', x, y);
    for (const [x, y] of [[250, 216], [360, 216], [250, 296], [140, 216], [470, 296]])
      m.prop('lamppost', x, y);
    for (const [x, y] of [[20, 130], [300, 470], [610, 130], [8, 470], [470, 470]])
      m.prop('trashcan', x, y);
    const hedges = [[150, 130], [150, 170], [322, 130], [478, 150], [150, 320], [322, 320], [322, 360], [478, 330], [40, 200], [590, 300]];
    for (const [x, y] of hedges) m.prop('hedge', x, y);
    for (const [x, y] of [[120, 470], [360, 130], [220, 500], [520, 500], [80, 380]]) m.prop('bush', x, y);
    m.placeVan(240, 208);
    m.spawn = { x: 300, y: 250 };
    return m.done();
  }

  // ---- road grid: 8-tile sidewalk corridors with a centered 4-tile road ----
  m.fill(T.CONCRETE, 0, 13, 40, 8);         // horizontal sidewalk corridor
  m.fill(T.CONCRETE, 15, 0, 8, 34);         // vertical sidewalk corridor
  m.fill(T.ROAD_PNG, 0, 15, 40, 4);         // horizontal road
  m.fill(T.ROAD_PNG, 17, 0, 4, 34);         // vertical road
  m.variety(T.ROAD_PNG, T.MANHOLE, 0.035, 51);
  m.variety(T.ROAD_PNG, T.DRAIN, 0.025, 52);

  // crosswalks: one per approach, laid across the road at the intersection
  m.fill(T.CROSSWALK_H, 15, 15, 2, 4); m.fill(T.CROSSWALK_H, 21, 15, 2, 4);   // west / east legs
  m.fill(T.CROSSWALK_V, 17, 13, 4, 2); m.fill(T.CROSSWALK_V, 17, 19, 4, 2);   // north / south legs

  // center-line lane markings on the straight approaches (not through the junction)
  m.fill(T.LANE_H, 0, 16, 15, 1); m.fill(T.LANE_H, 23, 16, 17, 1);
  m.fill(T.LANE_V, 18, 0, 1, 13); m.fill(T.LANE_V, 18, 21, 1, 13);

  // traffic lights at two diagonal corners of the intersection
  m.customProp(png.trafficlight, 248, 214);
  m.customProp(png.trafficlight, 352, 322);

  // ---- house lots: cross street splits the block into a west/east side, ----
  // ---- 2 houses each side per row, each with its own driveway + curb cut ----
  const LOT_X = [64, 176, 448, 560];        // lot centers, tile-aligned
  const TOP_FRONT_Y = 160;                  // top row: houses' door (bottom) edge
  const BOT_FRONT_Y = 384;                  // bottom row: houses' door (top) edge, mirrored art

  const topDefs = [png.houseI, png.houseJ, png.houseA, png.houseK];
  const botDefs = [png.houseCFlipped, png.houseKFlipped, png.houseIFlipped, png.houseJFlipped];
  const carDefs = [png.carRed, png.truck2, png.carBlue, png.truck];

  for (let i = 0; i < LOT_X.length; i++) {
    const lx = LOT_X[i];

    // driveway: 2-tile concrete strip from the curb up to the house
    m.fill(T.CONCRETE, lx / 16 - 1, 10, 2, 3);   // top row: rows 10-12 (y160-208)
    m.fill(T.CONCRETE, lx / 16 - 1, 21, 2, 3);   // bottom row: rows 21-23 (y336-384)

    // top-row house, bottom (door) edge sits at TOP_FRONT_Y, facing the road
    const th = topDefs[i];
    m.customHouse(th, lx - th.img.width / 2, TOP_FRONT_Y - th.img.height);
    // bottom-row house, mirrored so its door (now at the top of the art) faces the road
    const bh = botDefs[i];
    m.customHouse(bh, lx - bh.img.width / 2, BOT_FRONT_Y);

    // car parked on the driveway; mailbox offset clear of the widest vehicle (the truck)
    const car = carDefs[i];
    m.customProp(car, lx - car.img.width / 2, Math.round(184 - car.img.height / 2));
    m.customProp(png.mailbox, lx + 40, 195);
    const car2 = carDefs[(i + 2) % carDefs.length];
    m.customProp(car2, lx - car2.img.width / 2, Math.round(360 - car2.img.height / 2));
    m.customProp(png.mailbox, lx + 40, 339);
  }

  // hedges marking the property line between the two houses on each side
  // (procedural — no matching PNG asset — but scoped to this map only via
  // customProp(), so it doesn't touch the shared 'hedge' used elsewhere)
  m.customProp(PROPS.hedge, 112, 152); m.customProp(PROPS.hedge, 112, 356);
  m.customProp(PROPS.hedge, 496, 152); m.customProp(PROPS.hedge, 496, 356);

  // street trees tucked into the gaps between driveways/mailboxes — clear of
  // the road, crosswalks and every mailbox footprint
  for (const x of [16, 134, 390, 518]) {
    m.customProp(png.tree, x, 176);
    m.customProp(png.tree, x, 340);
  }
  // trash cans at the curb, clear of mailboxes and the intersection corners
  for (const [x, y] of [[16, 220], [615, 228], [16, 324], [615, 312]])
    m.customProp(png.trashcan, x, y);

  // streetlamps on the sidewalk strip only — never on the asphalt — spaced
  // between driveways and clear of the crosswalk/intersection zone
  for (const x of [95, 205, 405, 505]) {
    m.customProp(png.lamp, x, 224);
    m.customProp(png.lamp, x, 320);
  }

  // agent's van idling curbside on the west approach, clear of the crosswalk
  m.placeVan(150, 250);
  m.spawn = { x: 150, y: 270 };
  return m.done();
}

/* ------------------------- TROPICAL ISLAND ------------------------- */
export function buildTropical() {
  const m = new MapBuilder('Isla Verde', 44, 38, T.WATER);
  // island: sand beach ring, lush jungle interior
  m.fill(T.SAND, 3, 3, 38, 32);
  m.fill(T.JUNGLE, 5, 5, 34, 28);
  m.variety(T.JUNGLE, T.FLOWERS, 0.07, 17);   // occasional flower clusters
  // keep the player out of the ocean
  m.solid(
    { x: 0, y: 0, w: m.w, h: 3 * TILE, jumpable: false },
    { x: 0, y: m.h - 3 * TILE, w: m.w, h: 3 * TILE, jumpable: false },
    { x: 0, y: 0, w: 3 * TILE, h: m.h, jumpable: false },
    { x: m.w - 3 * TILE, y: 0, w: 3 * TILE, h: m.h, jumpable: false },
  );

  // volcano dead centre (its own vegetated base sits straight on the jungle);
  // its crater smokes (the prop's `crater`)
  const vx = m.w / 2 - 60, vy = m.h / 2 - 62;
  m.prop('volcano', vx, vy);
  // a few loose boulders + cooled-lava rubble around the foot
  m.prop('rock', vx + 8, vy + 96); m.prop('rock', vx + 104, vy + 92);

  // palms ringing the beach + scattered inland
  const palms = [
    [70, 70], [180, 46], [300, 40], [470, 60], [600, 70], [640, 200],
    [60, 240], [60, 400], [180, 500], [360, 520], [520, 510], [630, 400],
    [430, 120], [250, 150], [150, 320], [560, 320],
  ];
  for (const [x, y] of palms) m.prop('palm', x, y);

  // ferns (lush hiding) + huts + tiki torches + logs + rocks
  const ferns = [
    [120, 120], [230, 220], [420, 220], [520, 160], [140, 420],
    [300, 300], [480, 400], [560, 440], [200, 380], [400, 480], [90, 180], [610, 300],
  ];
  for (const [x, y] of ferns) m.prop('fern', x, y);

  m.prop('hut', 110, 180); m.prop('hut', 520, 240);
  m.prop('tikitorch', 250, 260); m.prop('tikitorch', 420, 300);
  m.prop('tikitorch', 160, 440); m.prop('tikitorch', 500, 180);
  m.prop('log', 320, 420); m.prop('log', 200, 300); m.prop('log', 470, 460);
  m.prop('rock', 380, 200); m.prop('rock', 260, 470); m.prop('rock', 540, 380);
  m.prop('bush', 300, 250); m.prop('bush', 420, 350);

  m.placeVan(90, 300);                     // beached van
  m.spawn = { x: 160, y: 300 };
  return m.done();
}

/* ------------------------- FARM FIELDS (Stage 1, Scene 1) ------------------------- */
// Where the escape pods came down: rows and rows of crops either side of a
// dirt road, walled in by thick forest. The road runs north out of the map
// through a gap in the trees; that's the exit to Scene 2 and the way the
// aliens bolt once three of them have been caught.
//
// Tall crops (corn, sunflowers) are row props you wade through; everything
// else is ground tiles. Ground textures fade into each other (map.blend) and
// the forest canopy, scorch marks and so on are painted into the ground.
// What a crashed pod brings with it: its scorched crater under it, a thin
// column of smoke, and room to hide in the open hatch.
export const POD_EXTRA = (seed = 1) => ({
  decal: { op: 'scorch', x: -9, y: -2, w: 46, h: 28, seed },
  smoke: [{ x: 9, y: 12 }],
  spot: { x: 24, y: 22, inside: true },
});

export function buildFarmFields() {
  const m = new MapBuilder('Farm Fields', 46, 42, T.GRASS);
  const W = m.w, H = m.h, F = 48;             // F: forest band thickness
  const rnd = mulberry(4242);
  m.variety(T.GRASS, T.GRASS2, 0.3, 61);
  m.variety(T.GRASS, T.MEADOW, 0.07, 62);
  m.blend = true;

  // ---- plots (tiles) ----
  const CORN_W = [4, 4, 14, 8], CORN_E = [28, 23, 14, 8], SUN_E = [27, 4, 15, 7];
  const TUTOR = [16, 20, 5, 5];               // the little corn patch by the van
  for (const p of [CORN_W, CORN_E, SUN_E, TUTOR]) m.fill(T.SOIL, ...p);
  m.fill(T.WHEAT, 4, 14, 7, 9);               // west wheat
  m.fill(T.PUMPKIN, 12, 14, 7, 4);
  m.fill(T.CABBAGE, 4, 25, 9, 7);
  m.fill(T.CARROT, 14, 27, 4, 6);
  m.fill(T.WHEAT, 4, 34, 14, 4);              // south-west wheat
  m.fill(T.LETTUCE, 27, 14, 7, 7);
  m.fill(T.CARROT, 36, 14, 7, 7);
  m.fill(T.WHEAT, 27, 33, 16, 5);             // south-east wheat

  // ---- forest floor round the edge (canopy is painted on top) ----
  m.fill(T.FOREST, 0, 0, m.tw, 3).fill(T.FOREST, 0, m.th - 3, m.tw, 3);
  m.fill(T.FOREST, 0, 0, 3, m.th).fill(T.FOREST, m.tw - 3, 0, 3, m.th);

  // ---- the dirt road: a gentle S from the south edge to the north exit ----
  // Painted as a smooth curve (a 'path' op: tiles can only step 16px at a
  // time); where it cuts through the forest the floor is grass. It's also
  // the route the aliens stampede up at the end (RIGS.farmfields).
  const ROAD = [[376, H + 30], [376, 560], [360, 480], [360, 380], [392, 300], [392, 210], [360, 130], [360, -40]];
  const roadX = (y) => {
    for (let i = 0; i < ROAD.length - 1; i++) {
      const [x0, y0] = ROAD[i], [x1, y1] = ROAD[i + 1];
      if (y <= y0 && y >= y1) return x0 + (x1 - x0) * (y0 - y) / (y0 - y1);
    }
    return ROAD[ROAD.length - 1][0];
  };
  for (let ty = 0; ty < m.th; ty++) {
    if (ty >= 3 && ty < m.th - 3) continue;
    const cx = roadX(ty * TILE + TILE / 2);
    for (let tx = 0; tx < m.tw; tx++) {
      if (Math.abs(tx * TILE + TILE / 2 - cx) < 34) m.ground[ty * m.tw + tx] = T.GRASS2;
    }
  }

  // ---- thick forest: solid bands with a gap where the road passes ----
  const gapT = [roadX(F / 2) - 30, roadX(F / 2) + 30];
  const gapB = [roadX(H - F / 2) - 30, roadX(H - F / 2) + 30];
  m.solid(
    { x: 0, y: 0, w: gapT[0], h: F + 6, jumpable: false },
    { x: gapT[1], y: 0, w: W - gapT[1], h: F + 6, jumpable: false },
    { x: 0, y: H - F + 2, w: gapB[0], h: F, jumpable: false },
    { x: gapB[1], y: H - F + 2, w: W - gapB[1], h: F, jumpable: false },
    { x: 0, y: 0, w: F - 2, h: H, jumpable: false },
    { x: W - F + 2, y: 0, w: F - 2, h: H, jumpable: false },
  );
  // a front row of real trees along each inner edge (these y-sort with the
  // actors); the canopy behind them is baked into the ground
  const edgeTree = (cx, baseY) => {
    const key = rnd() < 0.45 ? 'pine' : 'tree';
    const img = PROPS[key].img;
    m.prop(key, Math.round(cx - img.width / 2), Math.round(baseY - img.height), { noHide: true });
  };
  const inGap = (x, gap) => x > gap[0] - 16 && x < gap[1] + 16;
  for (let x = 10; x < W - 4; x += 14 + Math.floor(rnd() * 4)) {
    if (!inGap(x, gapT)) edgeTree(x + (rnd() - 0.5) * 4, F + 4 + rnd() * 6);
    if (!inGap(x, gapB)) edgeTree(x + (rnd() - 0.5) * 4, H - F + 20 + rnd() * 8);
  }
  for (let y = F + 18; y < H - F + 10; y += 13 + Math.floor(rnd() * 4)) {
    edgeTree(F - 12 + (rnd() - 0.5) * 6, y);
    edgeTree(W - F + 12 + (rnd() - 0.5) * 6, y);
  }

  // ---- tall crops: one prop per row ----
  const rows = (kind, [tx, ty, tw, th], pitch, seed) => {
    for (let k = 0, base = ty * TILE + (pitch === 8 ? 6 : 12); base < (ty + th) * TILE; k++, base += pitch) {
      const def = cropAsset(kind, tw * TILE, seed + k);
      m.customProp(def, tx * TILE, base - def.img.height + 1);
    }
  };
  rows('corn', CORN_W, 8, 10);
  rows('corn', CORN_E, 8, 40);
  rows('corn', TUTOR, 8, 70);
  rows('sunflower', SUN_E, 16, 90);

  // ---- hiding spots: deep in the tall crops, the wheat and the pumpkins ----
  const spots = (xs, ys) => { for (const y of ys) for (const x of xs) m.hide({ x, y, inside: true }); };
  spots([84, 132, 180, 228, 270], [92, 132, 172]);           // west corn
  spots([468, 516, 564, 612, 656], [392, 432, 476]);         // east corn
  spots([452, 500, 548, 596, 644], [96, 150]);               // sunflowers
  spots([96, 150], [256, 300, 350]);                         // west wheat
  spots([100, 180, 260], [584]);                             // south-west wheat
  spots([470, 560, 650], [572]);                             // south-east wheat
  spots([230, 280], [262]);                                  // pumpkins
  // the tutorial patch: close enough to the van to find on your first go
  m.hide({ x: 296, y: 360, inside: true, tutor: true }, { x: 320, y: 390, inside: true });

  // ---- crashed escape pods: scorched craters, smoke, room to hide in the hatch ----
  const pod = (x, y, seed) => m.customProp(PROPS.pod, x, y, {}, POD_EXTRA(seed));
  pod(128, 316, 3);                                          // west wheat
  pod(440, 184, 5);                                          // by the road, north
  pod(610, 266, 7);                                          // east carrots
  pod(490, 546, 9);                                          // south-east wheat
  pod(206, 350, 11);                                         // beside the tutorial patch

  // ---- scarecrows ----
  const crows = [['scarecrow', 150, 96], ['scarecrowRed', 78, 232], ['scarecrowBlue', 122, 430],
    ['scarecrowRed', 500, 248], ['scarecrowBlue', 590, 88], ['scarecrow', 624, 546], ['scarecrowBlue', 250, 560]];
  for (const [key, x, y] of crows) m.prop(key, x, y);

  // ---- fences + hay bales to hop (and to teach hopping) ----
  m.fenceRowH(240, 410, 6);                                  // south of the tutorial patch
  m.fenceRowV(330, 520, 5);                                  // along the road, west side
  m.fenceRowV(424, 500, 5);                                  // along the road, east side
  m.prop('hay', 150, 198); m.prop('hay', 300, 540); m.prop('hay', 520, 342);
  m.prop('hay', 438, 452); m.prop('hay', 588, 200);

  m.paint(
    { op: 'path', id: 'road', pts: ROAD.map(([x, y]) => ({ x, y })), halfW: 22, tex: [T.ROAD_DIRT, T.ROAD_DIRT2] },
    { op: 'forest', x: 0, y: 0, w: F, h: H, seed: 75 },
    { op: 'forest', x: W - F, y: 0, w: F, h: H, seed: 76 },
    { op: 'forest', x: 0, y: 0, w: gapT[0], h: F, seed: 71 },
    { op: 'forest', x: gapT[1], y: 0, w: W - gapT[1], h: F, seed: 72 },
    { op: 'forest', x: 0, y: H - F, w: gapB[0], h: F, seed: 73 },
    { op: 'forest', x: gapB[1], y: H - F, w: W - gapB[1], h: F, seed: 74 },
  );

  m.placeVan(300, 450);
  m.spawn = { x: 374, y: 486 };
  return m.done();
}

/* ------------------------- BARNYARD (Stage 1, Scene 2) ------------------------- */
// Where the dirt road out of the fields leads: a big red barn at the side of
// the road, a glass greenhouse across from it, a stone well in the yard and
// bushes scattered about, all hemmed in by forest. The north edge is the
// deep tree line the last of the aliens make for.
//
// The barn and the greenhouse are walk-in buildings (MapBuilder.building):
// their roofs fade out while the agent is inside. The barn is a wreck
// inside: empty pens, hay and tools everywhere, mud tracked through, and
// every nest box on the back wall emptied.
export function buildBarnyard() {
  const m = new MapBuilder('Barnyard', 46, 40, T.GRASS);
  const W = m.w, H = m.h, F = 48, FN = 64;    // F: forest band, FN: the deeper north tree line
  const rnd = mulberry(5151);
  m.variety(T.GRASS, T.GRASS2, 0.3, 81);
  m.variety(T.GRASS, T.MEADOW, 0.09, 82);
  m.blend = true;

  // ---- the dirt road: up from the fields (south), past the barn, then off east ----
  const ROAD = [[360, H + 30], [360, 600], [368, 530], [384, 460], [394, 390], [398, 320], [404, 262],
    [424, 222], [462, 196], [520, 184], [600, 180], [680, 178], [W + 40, 178]];
  const roadX = (y) => {
    for (let i = 0; i < 6; i++) {
      const [x0, y0] = ROAD[i], [x1, y1] = ROAD[i + 1];
      if (y <= y0 && y >= y1) return x0 + (x1 - x0) * (y0 - y) / (y0 - y1);
    }
    return ROAD[6][0];
  };
  const gapS = [roadX(H - F / 2) - 30, roadX(H - F / 2) + 30];
  const gapE = [178 - 30, 178 + 30];
  m.story.treeLine = FN;                      // aliens bolt for y < this at the end

  // ---- forest round the edge; a thick tree line along the north ----
  m.fill(T.FOREST, 0, 0, m.tw, FN / TILE).fill(T.FOREST, 0, m.th - 3, m.tw, 3);
  m.fill(T.FOREST, 0, 0, 3, m.th).fill(T.FOREST, m.tw - 3, 0, 3, m.th);
  for (let ty = m.th - 3; ty < m.th; ty++) {
    for (let tx = 0; tx < m.tw; tx++) {
      const cx = tx * TILE + TILE / 2;
      if (cx > gapS[0] - 4 && cx < gapS[1] + 4) m.ground[ty * m.tw + tx] = T.GRASS2;
    }
  }
  for (let ty = 0; ty < m.th; ty++) {
    const cy = ty * TILE + TILE / 2;
    if (cy < gapE[0] - 4 || cy > gapE[1] + 4) continue;
    for (let tx = m.tw - 3; tx < m.tw; tx++) m.ground[ty * m.tw + tx] = T.GRASS2;
  }
  m.solid(
    { x: 0, y: 0, w: W, h: FN + 4, jumpable: false },
    { x: 0, y: 0, w: F - 2, h: H, jumpable: false },
    { x: W - F + 2, y: 0, w: F - 2, h: gapE[0], jumpable: false },
    { x: W - F + 2, y: gapE[1], w: F - 2, h: H - gapE[1], jumpable: false },
    { x: 0, y: H - F + 2, w: gapS[0], h: F, jumpable: false },
    { x: gapS[1], y: H - F + 2, w: W - gapS[1], h: F, jumpable: false },
  );
  const edgeTree = (cx, baseY) => {
    const key = rnd() < 0.5 ? 'pine' : 'tree';
    const img = PROPS[key].img;
    m.prop(key, Math.round(cx - img.width / 2), Math.round(baseY - img.height), { noHide: true });
  };
  // the tree line: a ragged double row of trunks along the north edge
  for (let x = 8; x < W - 4; x += 12 + Math.floor(rnd() * 5)) {
    edgeTree(x + (rnd() - 0.5) * 4, FN + 2 + rnd() * 5);
    if (rnd() < 0.55) edgeTree(x + 6 + (rnd() - 0.5) * 4, FN - 8 + rnd() * 4);
  }
  for (let x = 10; x < W - 4; x += 14 + Math.floor(rnd() * 4)) {
    if (x < gapS[0] - 16 || x > gapS[1] + 16) edgeTree(x + (rnd() - 0.5) * 4, H - F + 20 + rnd() * 8);
  }
  for (let y = FN + 20; y < H - F + 10; y += 13 + Math.floor(rnd() * 4)) {
    edgeTree(F - 12 + (rnd() - 0.5) * 6, y);
    if (y < gapE[0] - 10 || y > gapE[1] + 24) edgeTree(W - F + 12 + (rnd() - 0.5) * 6, y);
  }

  // ---- the farmyard: packed dirt from the barn doors out to the road ----
  m.fill(T.DIRT, 8, 23, 16, 5);
  m.fill(T.DIRT, 21, 17, 3, 2);

  // ---- the barn ----
  const BX = 112, BY = 208, BW = 224, BD = 160, BT = 8, BH = 30;
  const barnDoors = { s: [80, 128], e: [64, 96] };
  // (its back wall, with the nest boxes, comes with it: BUILDING_KINDS.barn)
  m.building(BX, BY, BW, BD, { id: 'barn', kind: 'barn', t: BT, H: BH, G: 28, doors: barnDoors, floor: T.BARN_FLOOR });
  const inBarn = (x, y) => m.hide({ x, y, inside: true });   // in the barn: done() files it under the barn
  // two pens along the west wall, gates hanging open
  for (const y of [240, 272, 288, 304, 336]) m.prop('fenceV', 164, y);
  for (const x of [120, 136, 152]) { m.prop('fenceH', x, 236); m.prop('fenceH', x, 292); }
  m.customProp(YARD.gateOpen, 168, 256);
  m.customProp(YARD.gateOpen, 168, 320);
  m.customProp(YARD.haypile, 122, 250, { noHide: true }); inBarn(136, 257);
  m.customProp(YARD.trough, 138, 272);
  m.customProp(YARD.haypile, 124, 318, { noHide: true }); inBarn(138, 325);
  // loose hay under the nests, sacks, the workbench, a tipped barrow, bales
  m.customProp(YARD.haypile, 190, 222, { noHide: true }); inBarn(204, 229);
  m.customProp(YARD.sack, 262, 216); m.customProp(YARD.sack, 274, 219);
  m.customProp(YARD.sackTorn, 286, 226);
  m.customProp(YARD.workbench, 306, 218, { noHide: true }); inBarn(316, 246);
  m.customProp(YARD.wheelbarrow, 244, 286, { noHide: true }); inBarn(256, 294);
  m.prop('hay', 304, 316, { noHide: true }); inBarn(314, 328);
  m.prop('hay', 278, 340, { noHide: true });
  m.prop('hay', 300, 340, { noHide: true }); inBarn(300, 351);

  // ---- the greenhouse, across the road ----
  const GX = 464, GY = 288, GW = 112, GD = 80, GT = 4;
  const ghDoors = { s: [48, 64], n: [48, 64] };
  m.building(GX, GY, GW, GD, {
    id: 'greenhouse', kind: 'greenhouse', t: GT, H: 22, G: 12, doors: ghDoors, floor: T.GH_FLOOR,
    glass: true, insideAlpha: 0.1, behindAlpha: 0.7,
  });
  const inGh = (x, y) => m.hide({ x, y, inside: true });
  m.customProp(YARD.benchA, 470, 292, { noHide: true }); inGh(490, 310);
  m.customProp(YARD.benchB, 530, 292, { noHide: true }); inGh(550, 310);
  m.customProp(YARD.benchC, 470, 336, { noHide: true }); inGh(490, 346);
  m.customProp(YARD.benchD, 530, 336, { noHide: true }); inGh(550, 346);
  // a vegetable garden out front, a path up the middle to the door
  m.fill(T.CABBAGE, 29, 24, 3, 3);
  m.fill(T.CARROT, 33, 24, 3, 3);
  m.fill(T.DIRT, 32, 23, 1, 5);

  // ---- the well, bushes, hay, fences, the mailbox ----
  // (the well and the shade trees are solid, so their hiding spot is just
  // behind them, where a fleeing alien can actually get to)
  m.customProp(YARD.well, 126, 398, { noHide: true });
  m.hide({ x: 141, y: 414, inside: false });
  const bushes = [[66, 150], [214, 96], [322, 116], [566, 104], [644, 250], [626, 396], [440, 500],
    [214, 520], [84, 470], [296, 552], [602, 540], [66, 300], [510, 128], [100, 540], [118, 548],
    [252, 470], [470, 556], [520, 486], [660, 470], [632, 330], [150, 110], [400, 100]];
  for (const [x, y] of bushes) m.prop('bush', x, y);
  // a few lone shade trees out in the open
  for (const [x, y] of [[606, 300], [150, 500], [548, 520], [250, 96]]) {
    m.prop('tree', x, y, { noHide: true });
    m.hide({ x: x + 15, y: Math.floor((y + 26) / TILE) * TILE - 4, inside: false });   // clear of the trunk's nav cell
  }
  m.prop('hay', 196, 442); m.prop('hay', 560, 456); m.prop('hay', 84, 204);
  m.fenceRowH(64, 132, 6);                   // pasture rails between the barn and the trees
  m.fenceRowH(430, 128, 5);
  m.fenceRowV(330, 464, 5);                  // along the road, south of the yard
  m.prop('mailbox', 428, 390);

  const IX = BX + BT, IY = BY + BT, IW = BW - BT * 2, ID = BD - BT * 2;
  const pts = (...xy) => xy.map(([x, y]) => ({ x, y }));
  m.paint(
    { op: 'path', id: 'road', pts: ROAD.map(([x, y]) => ({ x, y })), halfW: 22, tex: [T.ROAD_DIRT, T.ROAD_DIRT2] },
    { op: 'forest', x: 0, y: 0, w: W, h: FN, seed: 91 },
    { op: 'forest', x: 0, y: FN, w: F, h: H - FN, seed: 92 },
    { op: 'forest', x: W - F, y: FN, w: F, h: gapE[0] - FN, seed: 93 },
    { op: 'forest', x: W - F, y: gapE[1], w: F, h: H - gapE[1], seed: 94 },
    { op: 'forest', x: 0, y: H - F, w: gapS[0], h: F, seed: 95 },
    { op: 'forest', x: gapS[1], y: H - F, w: W - gapS[1], h: F, seed: 96 },

    // ---- the barn floor: nothing where it should be ----
    { op: 'straw', x: IX, y: IY, w: IW, h: ID, count: 150, seed: 501 },
    { op: 'straw', x: IX + 6, y: IY, w: IW - 60, h: 12, count: 70, seed: 502 },       // pulled out of the nests
    { op: 'straw', x: IX, y: IY + 30, w: 44, h: ID - 30, count: 60, seed: 503 },      // the pens
    { op: 'straw', x: 270, y: 300, w: 56, h: 56, count: 40, seed: 504 },              // round the bales
    { op: 'mud', x: 146, y: 344, rx: 12, ry: 7, seed: 5 },                            // pen B, churned up
    { op: 'mud', x: 216, y: 350, rx: 16, ry: 6, seed: 7 },                            // at the doors
    { op: 'mud', x: 318, y: 290, rx: 9, ry: 5, seed: 9 },                             // at the side door
    { op: 'mud', x: 204, y: 296, rx: 6, ry: 3, seed: 11 },
    { op: 'footprints', pts: pts([212, 382], [210, 334], [196, 292], [174, 266], [146, 262]), seed: 31 },
    { op: 'footprints', pts: pts([228, 380], [238, 326], [262, 294], [300, 290], [344, 288], [382, 292]), seed: 33 },
    { op: 'footprints', pts: pts([232, 372], [252, 300], [246, 246], [236, 226]), seed: 35, step: 8 },
    { op: 'footprints', pts: pts([150, 350], [170, 330], [196, 318]), seed: 37, step: 8 },
    { op: 'tool', kind: 'pitchfork', x: 180, y: 314, ang: -0.62 },
    { op: 'tool', kind: 'rake', x: 176, y: 346, ang: 0.18 },
    { op: 'tool', kind: 'shovel', x: 276, y: 316, ang: 2.5 },
    { op: 'tool', kind: 'hammer', x: 228, y: 262, ang: 1.1 },
    { op: 'bucket', x: 206, y: 330 },
    { op: 'grain', x: 288, y: 232, w: 18, h: 8, seed: 41 },
    { op: 'boards', x: 258, y: 256 },
    { op: 'eggs', x: 124, y: 220 },
    // hay dragged out into the yard, prints heading for the road
    { op: 'straw', x: 188, y: 368, w: 70, h: 22, count: 40, seed: 505 },
    { op: 'footprints', pts: pts([250, 386], [290, 440], [330, 470]), seed: 39, step: 9 },

    // ---- the greenhouse: one pot didn't make it ----
    { op: 'pot', x: 514, y: 326 },
    { op: 'straw', x: 470, y: 300, w: 100, h: 60, count: 6, seed: 506 },
  );

  m.placeVan(292, 400);
  const arriveY = 548;
  m.spawn = { x: Math.round(roadX(arriveY)), y: arriveY };
  m.story.arrive = { x: Math.round(roadX(H - 6)), y: H - 6 };   // where the scene's walk-in starts
  return m.done();
}

/* ------------------------- HIGHWAY 29 (Stage 1, Scene 3) ------------------------- */
// The woods the last of them ran into, heading east: thick with trees,
// bushes, boulders and mossy logs, a fire road along the south edge the van
// can follow, and no end to them until the director says so. Past them a
// creek, open woods, and Highway 29 with a gas station on the far side. The
// woods stream in a piece at a time as the agent pushes on (highwayStrip.js
// does the laying out and painting; the director decides what comes next).
// The set pieces in it (the gas station, the clearing's stumps) come from
// its doc (an edit of them, else STATION_SET / CLEARING_SET); `opts` is
// for the map editor's preview: { edit, queue, after } lays the pieces it
// wants to show straight away.
export function buildHighway29(assets, opts = {}) {
  const m = new MapBuilder('Highway 29', NP * CW / TILE, TH, T.WOODS);
  m.record = false;                           // streamed in forever: never saved as a doc
  m.blend = true;
  const strip = new HighwayStrip(m, PROPS, HWY, opts.edit || EDITS.highway29 || null);
  m.strip = strip;
  if (opts.queue) { strip.queue = opts.queue.slice(); strip.after = opts.after || 'forest'; }
  strip.init();
  m.paintGround = (g, tiles) => strip.paintGround(g, tiles);
  m.placeVan(150, Math.round(strip.trackY(173)) - 20);
  m.van.flip = true;                          // nose east, the way they're headed
  m.spawn = { x: 130, y: 232 };
  return m.done();
}

/* ------------------------- MAPS, DOCS, EDITS ------------------------- */

// The built-in maps. story: the Stage 1 scene it's built around (its
// director reads the markers RIGS works out). strip: streamed in forever
// as the agent goes (Highway 29), so it has no doc of its own.
export const MAP_INFO = {
  playground: { name: 'Sunny Pines Playground', build: buildPlayground },
  farmhouse: { name: 'Hollow Creek Farm', build: buildFarmhouse },
  shipyard: { name: 'Rust Harbor Shipyard', build: buildShipyard },
  neighborhood: { name: 'Maple Street', build: buildNeighborhood },
  tropical: { name: 'Isla Verde', build: buildTropical },
  farmfields: { name: 'Farm Fields', build: buildFarmFields, story: 1 },
  barnyard: { name: 'Barnyard', build: buildBarnyard, story: 2 },
  highway29: { name: 'Highway 29', build: buildHighway29, story: 3, strip: true },
};

export const DOC_FORMAT = 'alien-wrangler-map';
export const DOC_VERSION = 1;

// A built map as plain, JSON-ready data (what maps/<id>.json holds).
export function toDoc(m, id) {
  const ground = [];
  for (let ty = 0; ty < m.th; ty++) ground.push(m.ground.slice(ty * m.tw, (ty + 1) * m.tw));
  const doc = {
    format: DOC_FORMAT, version: DOC_VERSION, id, name: m.name, tw: m.tw, th: m.th,
    blend: !!m.blend, tint: m.tint || null, stealth: !!m.stealth,
    ground, objects: clone(m.objects), paint: clone(m.paintOps),
    van: { x: m.van.x, y: m.van.y, ...(m.van.flip ? { flip: true } : {}) },
    spawn: { x: m.spawn.x, y: m.spawn.y },
    story: clone(m.story),
  };
  return doc;
}

// The x of a road (a list of points) at height y: along the first stretch
// of it that spans y, else wherever it ends.
export function roadXOf(pts) {
  return (y) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (y <= Math.max(a.y, b.y) && y >= Math.min(a.y, b.y)) {
        return a.y === b.y ? a.x : a.x + (b.x - a.x) * (a.y - y) / (a.y - b.y);
      }
    }
    return pts.length ? pts[pts.length - 1].x : 0;
  };
}

const pathById = (m, id) => m.paintOps.find(o => o.op === 'path' && o.id === id && o.pts && o.pts.length > 1);

// Story-scene markers the directors read, worked out from the doc so an
// edited map keeps its scene working (move the road and the stampede runs
// up the new one). Anything missing falls back to something harmless.
export const RIGS = {
  farmfields(m) {
    const road = pathById(m, 'road');
    const pts = road ? road.pts : [{ x: m.spawn.x, y: m.h + 30 }, { x: m.spawn.x, y: -40 }];
    m.roadX = roadXOf(pts);
    m.road = pts.slice(1, -1).map(q => ({ x: q.x, y: q.y }));
    if (!m.road.length) m.road = [{ x: m.roadX(m.h / 2), y: m.h / 2 }];
    m.exit = { x: m.roadX(0), y: -30 };
    // the tutorial's first hider: the marked spot, else the one nearest the van
    m.tutorSpot = m.hideSpots.find(q => q.tutor) ||
      m.hideSpots.slice().sort((a, b) => Math.hypot(a.x - m.van.x, a.y - m.van.y) - Math.hypot(b.x - m.van.x, b.y - m.van.y))[0] || null;
  },
  barnyard(m) {
    const road = pathById(m, 'road');
    const pts = road ? road.pts : [{ x: m.spawn.x, y: m.h + 30 }, { x: m.spawn.x, y: m.spawn.y }];
    m.road = pts.map(q => ({ x: q.x, y: q.y }));
    m.roadX = roadXOf(pts);
    m.treeLine = m.story.treeLine ?? 64;
    m.arrive = m.story.arrive ? { x: m.story.arrive.x, y: m.story.arrive.y } : { x: m.spawn.x, y: m.h - 6 };
    m.barn = m.buildings.find(b => b.id === 'barn') || null;
    m.greenhouse = m.buildings.find(b => b.id === 'greenhouse') || null;
  },
};

// Build the map the game plays from a doc.
export function compileMap(doc) {
  const m = new MapBuilder(doc.name, doc.tw, doc.th, 0);
  m.id = doc.id;
  for (let ty = 0; ty < m.th; ty++) {
    const row = (doc.ground && doc.ground[ty]) || [];
    for (let tx = 0; tx < m.tw; tx++) m.ground[ty * m.tw + tx] = row[tx] ?? 0;
  }
  m.blend = !!doc.blend;
  m.tint = doc.tint || null;
  m.stealth = !!doc.stealth;
  (doc.objects || []).forEach((o, i) => {
    const mark = [m.props.length, m.solids.length, m.hideSpots.length, m.buildings.length];
    if (o.t === 'prop') {
      const def = getAsset(o.a);
      if (!def) { m.missing.push(o.a); return; }
      m.customProp(def, o.x, o.y, o, o);
    } else if (o.t === 'solid') {
      m.solid(o);
    } else if (o.t === 'hide') {
      m.hide(o);
    } else if (o.t === 'building' && BUILDING_KINDS[o.kind]) {
      m.building(o.x, o.y, o.w, o.d, { ...o, t: o.wall });
    }
    // which doc object each piece came from (the editor picks by it)
    [m.props, m.solids, m.hideSpots, m.buildings].forEach((list, k) => { for (let j = mark[k]; j < list.length; j++) list[j].src = i; });
  });
  m.paint(...(doc.paint || []));
  m.story = clone(doc.story || {});
  const v = doc.van || { x: 40, y: m.h - 60 };
  m.placeVan(v.x, v.y);
  if (v.flip) m.van.flip = true;
  m.spawn = doc.spawn ? { x: doc.spawn.x, y: doc.spawn.y } : { x: v.x + 70, y: v.y + 12 };
  if (RIGS[doc.id]) RIGS[doc.id](m);
  return m.done();
}

// A brand-new map: one ground tile all over, the van and spawn near the
// bottom-left corner.
export function blankDoc(id, name, tw, th, tile = T.GRASS) {
  return {
    format: DOC_FORMAT, version: DOC_VERSION, id, name, tw, th, blend: false, tint: null, stealth: false,
    ground: Array.from({ length: th }, () => new Array(tw).fill(tile)),
    objects: [], paint: [],
    van: { x: 40, y: Math.max(16, th * TILE - 70) }, spawn: { x: 110, y: Math.max(28, th * TILE - 58) }, story: {},
  };
}

// Tidy a doc that came out of a file or a draft: fill in anything missing
// and drop what can't be right, so a hand-edited file can't crash the game.
export function normalizeDoc(raw, id = raw && raw.id) {
  if (!raw || typeof raw !== 'object') throw new Error('not a map');
  if (raw.format && raw.format !== DOC_FORMAT) throw new Error(`not a map file (${raw.format})`);
  if ((raw.version || 1) > DOC_VERSION) throw new Error(`made by a newer editor (version ${raw.version})`);
  if (raw.strip || (MAP_INFO[id] && MAP_INFO[id].strip)) {
    const pieces = (v, d) => (Array.isArray(v) ? v : d).filter(q => q && typeof q.a === 'string' && isFinite(q.x) && isFinite(q.base))
      .map(q => ({ a: q.a, x: Math.round(+q.x), base: Math.round(+q.base) }));
    return { format: DOC_FORMAT, version: DOC_VERSION, id: String(id), name: (MAP_INFO[id] && MAP_INFO[id].name) || String(id), strip: true,
      station: pieces(raw.station, STATION_SET), clearing: pieces(raw.clearing, CLEARING_SET) };
  }
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const tw = Math.max(4, Math.min(256, Math.round(num(raw.tw, 40))));
  const th = Math.max(4, Math.min(256, Math.round(num(raw.th, 34))));
  const ground = [];
  for (let y = 0; y < th; y++) {
    const row = Array.isArray(raw.ground) && Array.isArray(raw.ground[y]) ? raw.ground[y] : [];
    ground.push(Array.from({ length: tw }, (_, x) => Math.max(0, Math.round(num(row[x], 0)))));
  }
  const pt = (p, d) => (p && typeof p === 'object' ? { x: num(p.x, d.x), y: num(p.y, d.y) } : { ...d });
  const objects = (Array.isArray(raw.objects) ? raw.objects : []).filter(o => o && typeof o === 'object' &&
    ['prop', 'solid', 'hide', 'building'].includes(o.t) && isFinite(o.x) && isFinite(o.y));
  const paint = (Array.isArray(raw.paint) ? raw.paint : []).filter(o => o && PAINT_OPS[o.op]);
  const van = pt(raw.van, { x: 40, y: th * TILE - 70 });
  if (raw.van && raw.van.flip) van.flip = true;
  return {
    format: DOC_FORMAT, version: DOC_VERSION, id: String(id || raw.id || 'map'),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 60) : String(id || 'Untitled map'),
    tw, th, blend: !!raw.blend, tint: raw.tint === 'night' ? 'night' : null, stealth: !!raw.stealth,
    ground, objects: clone(objects), paint: clone(paint), van, spawn: pt(raw.spawn, { x: van.x + 70, y: van.y + 12 }),
    story: raw.story && typeof raw.story === 'object' ? clone(raw.story) : {},
    ...(raw.custom ? { custom: true } : {}),
  };
}

const DEFAULT_DOCS = new Map();   // the builders' docs (they never change once built)
let EDITS = {};                    // id -> doc that replaces the builder's (maps/<id>.json or a draft)

// Highway 29's doc: just its set pieces (the rest streams in from code).
export function defaultStripDoc(id = 'highway29') {
  return { format: DOC_FORMAT, version: DOC_VERSION, id, name: MAP_INFO[id].name, strip: true, station: clone(STATION_SET), clearing: clone(CLEARING_SET) };
}

export function defaultMapDoc(id, assets) {
  const info = MAP_INFO[id];
  if (!info) return null;
  if (info.strip) return defaultStripDoc(id);
  const key = `${id}:${assets && assets.pngProps ? 'png' : 'drawn'}`;
  if (!DEFAULT_DOCS.has(key)) DEFAULT_DOCS.set(key, toDoc(info.build(assets), id));
  return clone(DEFAULT_DOCS.get(key));
}

// docs: { id: doc } for every edited (or brand-new) map.
export function setMapEdits(docs) { EDITS = { ...(docs || {}) }; }
export function mapEdits() { return EDITS; }
export function customMapIds() { return Object.keys(EDITS).filter(id => !MAP_INFO[id]); }

// The doc a map is played from: its edit if it has one, else the builder's.
export function mapDoc(id, assets) {
  return EDITS[id] ? clone(EDITS[id]) : defaultMapDoc(id, assets);
}

export function buildMap(id, assets) {
  const info = MAP_INFO[id];
  if (info && info.strip) return info.build(assets);
  const doc = mapDoc(id, assets);
  if (!doc) throw new Error(`no such map: ${id}`);
  return compileMap(doc);
}

// id -> (assets) => map, for every built-in map (and, through buildMap, any edit of it).
export const MAP_BUILDERS = Object.fromEntries(Object.keys(MAP_INFO).map(id => [id, (assets) => buildMap(id, assets)]));
