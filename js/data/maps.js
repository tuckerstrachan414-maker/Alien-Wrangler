import { T, TILE, buildProps, cropRow, paintForest, scorchDecal, mulberry } from './sprites.js';
import {
  barnArt, nestWall, greenhouseArt, greenhouseBackWall, buildBarnyardProps,
  strawScatter, mudPatch, footprints, floorTool, spilledBucket, grainSpill, brokenBoards, eggClutch, brokenPot,
} from './barnyardArt.js';
import { paintPath } from '../terrain.js';
import { buildNav } from '../nav.js';
import { buildHighwayProps } from './highwayArt.js';
import { HighwayStrip, CW, NP, TH } from './highwayStrip.js';
import {
  houseArt, carArt, buildQuietOaksProps, paintAsphalt, paintConcrete, paintCurb, paintCrosswalk,
  paintDeck, paintPool, paintFlowerBed, paintLawnStripes, paintMulchRing, paintStain,
} from './quietOaksArt.js';

// A map = ground tile grid + props (with solids & hide spots) + van + player spawn.
// World units are pixels; tiles are 16px.

const PROPS = buildProps();
const YARD = buildBarnyardProps();
const HWY = buildHighwayProps();
const OAKS = buildQuietOaksProps();

class MapBuilder {
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
    this.volcano = null;    // {x,y} crater -> ambient smoke
    this.smoke = [];        // [{x,y}] thin smoke columns (crashed pods)
    this.blend = false;     // soft dithered edges between ground textures (terrain.js)
    this.paintGround = null; // (ctx, tiles) => extra art baked into the ground canvas
    this.buildings = [];    // walk-in buildings: the roof fades while the agent is inside
    this.van = { x: 60, y: 60 };
    this.spawn = { x: 80, y: 80 };
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
    return this.customProp(PROPS[key], x, y, opts, key);
  }

  // Like prop(), but takes a prop definition directly instead of a PROPS[key]
  // lookup — used for map-specific PNG-backed props (e.g. Maple Street).
  customProp(def, x, y, opts = {}, key = null) {
    const pr = { key, x, y, img: def.img, tall: def.tall, baseY: y + def.img.height };
    if (opts.see) pr.see = true;          // crown thins out while the agent is under it
    this.props.push(pr);
    if (def.solid && !opts.noSolid) {
      this.solids.push({ x: x + def.solid.x, y: y + def.solid.y, w: def.solid.w, h: def.solid.h, jumpable: def.jumpable });
    }
    if (def.extraSolids) {
      for (const s of def.extraSolids)
        this.solids.push({ x: x + s.x, y: y + s.y, w: s.w, h: s.h, jumpable: def.jumpable });
    }
    if (def.hide && !opts.noHide) {
      const cx = x + def.img.width / 2;
      const cy = def.solid ? y + def.solid.y + def.solid.h / 2 : y + def.img.height / 2;
      this.hideSpots.push({ x: cx, y: cy, inside: !def.solid || def.jumpable });
    }
    return this;
  }

  // Place a house and register its lit windows as stealth "homes".
  house(key, x, y) {
    return this.customHouse(PROPS[key], x, y);
  }

  // Like house(), but takes a prop definition directly (see customProp()).
  customHouse(def, x, y) {
    this.customProp(def, x, y);
    for (const w of def.windows || []) {
      this.homes.push({ x: x + w.x, y: y + w.y, w: w.w, h: w.h, alertT: 0 });
    }
    return this;
  }

  fenceRowH(x, y, count) {
    for (let i = 0; i < count; i++) this.prop('fenceH', x + i * 16, y);
    return this;
  }
  fenceRowV(x, y, count) {
    for (let i = 0; i < count; i++) this.prop('fenceV', x, y + i * 16);
    return this;
  }

  // A walk-in building on a tile-aligned footprint (x, y, w, d in px). Its
  // walls run `t` thick round the outside edge of the footprint, broken by
  // doors = { n, s, e, w: [a, b) } (local px along that side), so the nav
  // grid sees solid wall cells with open doorway cells. `art` is the
  // { shell, cut, ox, oy } pair from barnyardArt.js; `floor` fills the
  // inside with a ground tile. Glass walls stop bodies but not eyes.
  building(x, y, w, d, { t, doors = {}, art, floor, glass = false, insideAlpha = 0, behindAlpha = 0.4 }) {
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
    if (floor !== undefined) this.fill(floor, x / TILE, y / TILE, w / TILE, d / TILE);
    const b = {
      x0: x, y0: y, x1: x + w, y1: y + d, baseY: y + d, t,
      shell: art.shell, cut: art.cut, ax: x + art.ox, ay: y + art.oy,
      topAt: (wx) => y + art.top(wx - x),     // roof's top edge on screen at world x
      alpha: 1, insideAlpha, behindAlpha, glass, force: null,
    };
    this.buildings.push(b);
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
    m.hideSpots.push({ x, y, inside: true });

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
  m.solids.push({ x: 0, y: 0, w: m.w, h: 4 * TILE - 4, jumpable: false });

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
  m.solids.push(
    { x: 0, y: 0, w: m.w, h: 3 * TILE, jumpable: false },
    { x: 0, y: m.h - 3 * TILE, w: m.w, h: 3 * TILE, jumpable: false },
    { x: 0, y: 0, w: 3 * TILE, h: m.h, jumpable: false },
    { x: m.w - 3 * TILE, y: 0, w: 3 * TILE, h: m.h, jumpable: false },
  );

  // volcano dead centre (its own vegetated base sits straight on the jungle)
  const vx = m.w / 2 - 60, vy = m.h / 2 - 62;
  m.prop('volcano', vx, vy);
  // a few loose boulders + cooled-lava rubble around the foot
  m.prop('rock', vx + 8, vy + 96); m.prop('rock', vx + 104, vy + 92);
  const cr = PROPS.volcano.crater;
  m.volcano = { x: vx + cr.x, y: vy + cr.y };

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
  // Painted as a smooth curve in paintGround (tiles can only step 16px at a
  // time); where it cuts through the forest the floor is grass.
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
  // the road as a route for scripted runs, south to north, and the exit
  m.road = ROAD.slice(1, -1).map(([x, y]) => ({ x, y }));
  m.exit = { x: roadX(0), y: -30 };
  m.roadX = roadX;

  // ---- thick forest: solid bands with a gap where the road passes ----
  const gapT = [roadX(F / 2) - 30, roadX(F / 2) + 30];
  const gapB = [roadX(H - F / 2) - 30, roadX(H - F / 2) + 30];
  m.solids.push(
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
      const def = cropRow(kind, tw * TILE, seed + k);
      m.customProp(def, tx * TILE, base - def.img.height + 1);
    }
  };
  rows('corn', CORN_W, 8, 10);
  rows('corn', CORN_E, 8, 40);
  rows('corn', TUTOR, 8, 70);
  rows('sunflower', SUN_E, 16, 90);

  // ---- hiding spots: deep in the tall crops, the wheat and the pumpkins ----
  const spots = (xs, ys) => { for (const y of ys) for (const x of xs) m.hideSpots.push({ x, y, inside: true }); };
  spots([84, 132, 180, 228, 270], [92, 132, 172]);           // west corn
  spots([468, 516, 564, 612, 656], [392, 432, 476]);         // east corn
  spots([452, 500, 548, 596, 644], [96, 150]);               // sunflowers
  spots([96, 150], [256, 300, 350]);                         // west wheat
  spots([100, 180, 260], [584]);                             // south-west wheat
  spots([470, 560, 650], [572]);                             // south-east wheat
  spots([230, 280], [262]);                                  // pumpkins
  // the tutorial patch: close enough to the van to find on your first go
  m.tutorSpot = { x: 296, y: 360, inside: true };
  m.hideSpots.push(m.tutorSpot, { x: 320, y: 390, inside: true });

  // ---- crashed escape pods: scorched craters, smoke, room to hide in the hatch ----
  const decals = [];
  const pod = (x, y, seed) => {
    decals.push({ img: scorchDecal(46, 28, seed), x: x - 9, y: y - 2 });
    m.prop('pod', x, y);
    m.smoke.push({ x: x + 9, y: y + 12 });
    m.hideSpots.push({ x: x + 24, y: y + 22, inside: true });
  };
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

  m.paintGround = (g, tiles) => {
    paintPath(g, tiles, ROAD.map(([x, y]) => ({ x, y })), { halfW: 22, texIds: [T.ROAD_DIRT, T.ROAD_DIRT2] });
    paintForest(g, 0, 0, F, H, 75);
    paintForest(g, W - F, 0, F, H, 76);
    paintForest(g, 0, 0, gapT[0], F, 71);
    paintForest(g, gapT[1], 0, W - gapT[1], F, 72);
    paintForest(g, 0, H - F, gapB[0], F, 73);
    paintForest(g, gapB[1], H - F, W - gapB[1], F, 74);
    for (const d of decals) g.drawImage(d.img, d.x, d.y);
  };

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
  m.road = ROAD.map(([x, y]) => ({ x, y }));
  m.roadX = roadX;
  m.treeLine = FN;                            // aliens bolt for y < this at the end

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
  m.solids.push(
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
  const barn = m.building(BX, BY, BW, BD, {
    t: BT, doors: barnDoors, floor: T.BARN_FLOOR,
    art: barnArt({ w: BW, d: BD, H: BH, G: 28, t: BT, south: barnDoors.s, east: barnDoors.e }),
  });
  m.barn = barn;
  m.customProp(nestWall(BW, BH, BT), BX, BY - BH);
  const inBarn = (x, y) => m.hideSpots.push({ x, y, inside: true, zone: 'barn', bld: barn, rustle: '#d9b85a' });
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
  const gh = m.building(GX, GY, GW, GD, {
    t: GT, doors: ghDoors, floor: T.GH_FLOOR, glass: true, insideAlpha: 0.1, behindAlpha: 0.7,
    art: greenhouseArt({ w: GW, d: GD, H: 22, G: 12, t: GT, south: ghDoors.s }),
  });
  m.greenhouse = gh;
  m.customProp(greenhouseBackWall(GW, GT, ghDoors.n), GX, GY - 5);
  const inGh = (x, y) => m.hideSpots.push({ x, y, inside: true, zone: 'greenhouse', bld: gh });
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
  m.hideSpots.push({ x: 141, y: 414, inside: false });
  const bushes = [[66, 150], [214, 96], [322, 116], [566, 104], [644, 250], [626, 396], [440, 500],
    [214, 520], [84, 470], [296, 552], [602, 540], [66, 300], [510, 128], [100, 540], [118, 548],
    [252, 470], [470, 556], [520, 486], [660, 470], [632, 330], [150, 110], [400, 100]];
  for (const [x, y] of bushes) m.prop('bush', x, y);
  // a few lone shade trees out in the open
  for (const [x, y] of [[606, 300], [150, 500], [548, 520], [250, 96]]) {
    m.prop('tree', x, y, { noHide: true });
    m.hideSpots.push({ x: x + 15, y: Math.floor((y + 26) / TILE) * TILE - 4, inside: false });   // clear of the trunk's nav cell
  }
  m.prop('hay', 196, 442); m.prop('hay', 560, 456); m.prop('hay', 84, 204);
  m.fenceRowH(64, 132, 6);                   // pasture rails between the barn and the trees
  m.fenceRowH(430, 128, 5);
  m.fenceRowV(330, 464, 5);                  // along the road, south of the yard
  m.prop('mailbox', 428, 390);

  m.paintGround = (g, tiles) => {
    paintPath(g, tiles, ROAD.map(([x, y]) => ({ x, y })), { halfW: 22, texIds: [T.ROAD_DIRT, T.ROAD_DIRT2] });
    paintForest(g, 0, 0, W, FN, 91);
    paintForest(g, 0, FN, F, H - FN, 92);
    paintForest(g, W - F, FN, F, gapE[0] - FN, 93);
    paintForest(g, W - F, gapE[1], F, H - gapE[1], 94);
    paintForest(g, 0, H - F, gapS[0], F, 95);
    paintForest(g, gapS[1], H - F, W - gapS[1], F, 96);

    // ---- the barn floor: nothing where it should be ----
    const IX = BX + BT, IY = BY + BT, IW = BW - BT * 2, ID = BD - BT * 2;
    strawScatter(g, IX, IY, IW, ID, 150, 501);
    strawScatter(g, IX + 6, IY, IW - 60, 12, 70, 502);           // pulled out of the nests
    strawScatter(g, IX, IY + 30, 44, ID - 30, 60, 503);            // the pens
    strawScatter(g, 270, 300, 56, 56, 40, 504);                   // round the bales
    mudPatch(g, 146, 344, 12, 7, 5);                              // pen B, churned up
    mudPatch(g, 216, 350, 16, 6, 7);                              // at the doors
    mudPatch(g, 318, 290, 9, 5, 9);                               // at the side door
    mudPatch(g, 204, 296, 6, 3, 11);
    footprints(g, [{ x: 212, y: 382 }, { x: 210, y: 334 }, { x: 196, y: 292 }, { x: 174, y: 266 }, { x: 146, y: 262 }], 31);
    footprints(g, [{ x: 228, y: 380 }, { x: 238, y: 326 }, { x: 262, y: 294 }, { x: 300, y: 290 }, { x: 344, y: 288 }, { x: 382, y: 292 }], 33);
    footprints(g, [{ x: 232, y: 372 }, { x: 252, y: 300 }, { x: 246, y: 246 }, { x: 236, y: 226 }], 35, { step: 8 });
    footprints(g, [{ x: 150, y: 350 }, { x: 170, y: 330 }, { x: 196, y: 318 }], 37, { step: 8 });
    floorTool(g, 'pitchfork', 180, 314, -0.62);
    floorTool(g, 'rake', 176, 346, 0.18);
    floorTool(g, 'shovel', 276, 316, 2.5);
    floorTool(g, 'hammer', 228, 262, 1.1);
    spilledBucket(g, 206, 330);
    grainSpill(g, 288, 232, 18, 8, 41);
    brokenBoards(g, 258, 256);
    eggClutch(g, 124, 220);
    // hay dragged out into the yard, prints heading for the road
    strawScatter(g, 188, 368, 70, 22, 40, 505);
    footprints(g, [{ x: 250, y: 386 }, { x: 290, y: 440 }, { x: 330, y: 470 }], 39, { step: 9 });

    // ---- the greenhouse: one pot didn't make it ----
    brokenPot(g, 514, 326);
    strawScatter(g, 470, 300, 100, 60, 6, 506);
  };

  m.placeVan(292, 400);
  const arriveY = 548;
  m.spawn = { x: Math.round(roadX(arriveY)), y: arriveY };
  m.arrive = { x: Math.round(roadX(H - 6)), y: H - 6 };
  return m.done();
}

/* ------------------------- HIGHWAY 29 (Stage 1, Scene 3) ------------------------- */
// The woods the last of them ran into, heading east: thick with trees,
// bushes, boulders and mossy logs, a fire road along the south edge the van
// can follow, and no end to them until the director says so. Past them a
// creek, open woods, and Highway 29 with a gas station on the far side. The
// woods stream in a piece at a time as the agent pushes on (highwayStrip.js
// does the laying out and painting; the director decides what comes next).
export function buildHighway29() {
  const m = new MapBuilder('Highway 29', NP * CW / TILE, TH, T.WOODS);
  m.blend = true;
  const strip = new HighwayStrip(m, PROPS, HWY);
  m.strip = strip;
  strip.init();
  m.paintGround = (g, tiles) => strip.paintGround(g, tiles);
  m.placeVan(150, Math.round(strip.trackY(173)) - 20);
  m.van.flip = true;                          // nose east, the way they're headed
  m.spawn = { x: 130, y: 232 };
  return m.done();
}

/* ------------------------- QUIET OAKS (Stage 2, Scene 1) ------------------------- */
// A sleeping subdivision at night, with Maple Street's noise rules (sprint,
// dash and dive quietly, especially near the houses).
//
// The street plan: Oak Hollow Dr comes in from the south through the brick
// QUIET OAKS entrance and runs north to a cul-de-sac, round an island with
// the old Quiet Oak on it; Acorn Ln crosses it east-west and runs out into
// the oak woods that ring the whole place. Every street has a curb, a grass
// verge (street trees, lamps, hydrants, mailboxes, bins) and a sidewalk.
//
// Fourteen houses, every one facing its street: the north side of Acorn Ln
// shows us its fronts (porch, door, garage), the south side its backs (the
// street is behind them; decks and back doors toward us), and the two on the
// cul-de-sac stand side on, porch and garage toward the bulb. Each has a
// driveway from its garage to the curb, usually with a car on it nose in, a
// walk to the porch, a mailbox and the bins out at the curb (it's trash
// night), and a backyard behind a fence: patios, pools, play sets, sheds.
// Cars parked on the street sit at the curb facing the way traffic runs on
// that side, clear of driveways, hydrants and the intersection.
//
// Drawn by quietOaksArt.js; the night itself (darkness with pools of light
// round the lamps, porches and lit windows) is map.night, drawn by the game.
const QO = {
  W: 896, H: 832, F: 48,
  roadX: [416, 480],           // Oak Hollow Dr
  roadY: [464, 528],           // Acorn Ln
  bulb: { x: 448, y: 200, r: 72, island: 26, ring: 104 },
  gateGap: [384, 512],         // the way out through the woods to the south
};

// Which way traffic runs past each curb (right-hand traffic): a car parked
// there faces this way.
export const PARK_FACE = { acornN: 'left', acornS: 'right', oakW: 'down', oakE: 'up' };

export function buildQuietOaks() {
  const m = new MapBuilder('Quiet Oaks', 56, 52, T.GRASS);
  const { W, H, F } = QO;
  const [RX0, RX1] = QO.roadX, [RY0, RY1] = QO.roadY;
  const B = QO.bulb;
  const rnd = mulberry(7272);
  m.variety(T.GRASS, T.GRASS2, 0.3, 91);
  m.stealth = true;
  m.night = { dark: 'rgba(7, 10, 30, 0.62)', lights: [] };
  m.streets = { ...QO, curbs: [] };
  // a light in the dark: radius r, `warm` its coloured glow, `k` how much of
  // the dark it lifts
  const light = (x, y, r, warm = 0.14, k = 1) => m.night.lights.push({ x: Math.round(x), y: Math.round(y), r, warm, k });

  // ground jobs, run in paintGround in this order (later on top)
  const layers = { lawn: [], yard: [], drive: [], walk: [], beds: [], street: [], top: [] };
  const drives = [];           // driveway rects (the street can't park across their mouths)
  const parked = [];           // cars on the street, for the validator
  m.parking = parked;
  m.drives = drives;
  m.houseList = [];

  // A prop that hides an alien but can't be walked into: its hiding spot
  // goes just behind it (north), or in front if something's there.
  const blocked = (x, y) => m.solids.some(q => !q.jumpable && x > q.x - 4 && x < q.x + q.w + 4 && y > q.y - 4 && y < q.y + q.h + 4);
  const place = (def, x, y, opts = {}) => {
    const hideBehind = def.hide && def.solid && !def.jumpable;
    m.customProp(def, Math.round(x), Math.round(y), { ...opts, noHide: hideBehind || opts.noHide });
    if (hideBehind && !opts.noHide) {
      const sx = x + def.solid.x + def.solid.w / 2;
      const back = y + def.solid.y - 6, front = y + def.solid.y + def.solid.h + 6;
      m.pendingHides = m.pendingHides || [];
      m.pendingHides.push({ x: Math.round(sx), ys: [back, front] });
    }
  };

  /* ---------------- the woods all round ---------------- */
  const [G0, G1] = QO.gateGap;
  m.solids.push(
    { x: 0, y: 0, w: W, h: F + 2, jumpable: false },
    { x: 0, y: 0, w: F - 2, h: H, jumpable: false },
    { x: W - F + 2, y: 0, w: F - 2, h: H, jumpable: false },
    { x: 0, y: H - F + 4, w: G0 - 8, h: F, jumpable: false },
    { x: G1 + 8, y: H - F + 4, w: W - G1 - 8, h: F, jumpable: false },
  );
  const edgeTree = (cx, baseY) => {
    const pick = rnd();
    const def = pick < 0.35 ? OAKS.oak : pick < 0.6 ? OAKS.oak2 : pick < 0.8 ? PROPS.tree : PROPS.pine;
    m.customProp(def, Math.round(cx - def.img.width / 2), Math.round(baseY - def.img.height), { noHide: true });
  };
  for (let x = 10; x < W - 4; x += 16 + Math.floor(rnd() * 8)) edgeTree(x, F + 6 + rnd() * 6);
  for (let x = 12; x < W - 4; x += 16 + Math.floor(rnd() * 8)) {
    if (x > G0 - 118 && x < G1 + 118) continue;            // keep the entrance walls clear
    edgeTree(x, H - F + 22 + rnd() * 6);
  }
  for (let y = F + 26; y < H - F; y += 18 + Math.floor(rnd() * 8)) {
    edgeTree(F - 10 + rnd() * 6, y);
    edgeTree(W - F + 10 - rnd() * 6, y);
  }

  /* ---------------- the street lamps (first, so the rest keeps clear) ---------------- */
  const lamp = (x, baseY, left) => {
    const def = left ? OAKS.lampL : OAKS.lampR;
    const px = Math.round(x - (left ? 17 : 5)), py = Math.round(baseY - 43);
    place(def, px, py);
    light(px + def.head.x, baseY + 2, 54, 0.1, 0.86);
  };
  // Acorn Ln
  lamp(104, RY0 - 4, false); lamp(600, RY0 - 4, false);
  lamp(316, RY1 + 12, true); lamp(800, RY1 + 12, true);
  // Oak Hollow Dr
  lamp(408, 352, false); lamp(408, 664, false);
  lamp(488, 316, true); lamp(488, 760, true);
  // round the bulb
  lamp(B.x - 80, B.y + 30, false); lamp(B.x + 80, B.y + 30, true);

  /* ---------------- the houses ---------------- */
  // north row (fronts to us), south row (backs to us), the cul-de-sac (side on)
  const LOTS = [
    { x0: 48, x1: 160, side: 'n', build: 'ranch', color: 'sage', garage: 'right', lit: [1], car: ['suv', 'silver'], yard: ['patio', 'swing'] },
    { x0: 160, x1: 272, side: 'n', build: 'colonial', color: 'white', garage: 'left', lit: [], car: ['sedan', 'black'], yard: ['pool'], hoop: true },
    { x0: 272, x1: 384, side: 'n', build: 'bungalow', color: 'yellow', garage: 'right', lit: [3], car: ['hatch', 'red'], yard: ['garden', 'doghouse'] },
    { x0: 512, x1: 624, side: 'n', build: 'cape', color: 'blue', garage: 'left', lit: [0], car: ['minivan', 'beige'], yard: ['trampoline', 'patio'] },
    { x0: 624, x1: 736, side: 'n', build: 'split', color: 'brick', garage: 'right', lit: [], car: ['sedan', 'blue'], yard: ['shed', 'garden'] },
    { x0: 736, x1: 848, side: 'n', build: 'ranch', color: 'grey', garage: 'left', lit: [2], car: ['pickup', 'red'], yard: ['kiddie', 'patio'] },
    { x0: 48, x1: 160, side: 's', build: 'colonial', color: 'tan', garage: 'right', lit: [2], car: ['sedan', 'white'], yard: ['pool'] },
    { x0: 160, x1: 272, side: 's', build: 'ranch', color: 'cream', garage: 'left', lit: [], car: ['hatch', 'green'], yard: ['swing', 'shed'] },
    { x0: 272, x1: 384, side: 's', build: 'cape', color: 'sage', garage: 'right', lit: [1], car: null, yard: ['trampoline', 'garden'] },
    { x0: 512, x1: 624, side: 's', build: 'ranch', color: 'yellow', garage: 'left', lit: [0], car: ['sedan', 'maroon'], yard: ['doghouse', 'patio'] },
    { x0: 624, x1: 736, side: 's', build: 'colonial', color: 'grey', garage: 'right', lit: [], car: ['suv', 'black'], yard: ['pool'] },
    { x0: 736, x1: 848, side: 's', build: 'split', color: 'white', garage: 'left', lit: [3], car: ['hatch', 'silver'], yard: ['shed', 'kiddie'] },
    { cul: 'w', build: 'colonial', color: 'brick', lit: [2], car: ['sedan', 'green'], yard: ['pool', 'swing', 'shed'] },
    { cul: 'e', build: 'ranch', color: 'blue', lit: [0], car: ['suv', 'white'], yard: ['trampoline', 'garden', 'doghouse'] },
  ];
  const N_BASE = 384;          // north row: where the walls meet the ground (on a tile line,
                               // so the front yard's first row of tiles is clear to walk)
  const S_TOP = 628;           // south row: the front (north) wall's line
  const N_FENCE = 258, S_FENCE = 756;    // the backyards' rear fences

  // the curbside things for one house: the mailbox one side of the
  // driveway, the bins the other (whichever way round fits on the verge
  // without bumping into the neighbours' or anything else, inside the lot)
  const free = (r) => !m.solids.some(q => r.x < q.x + q.w + 2 && q.x < r.x + r.w + 2 && r.y < q.y + q.h + 2 && q.y < r.y + r.h + 2);
  const curbside = (dx0, dx1, vergeY, lot) => {
    const sol = (def, x, y) => ({ x: x + def.solid.x, y: y + def.solid.y, w: def.solid.w, h: def.solid.h });
    const layouts = [
      { mb: dx0 - 15, bins: dx1 + 3 },
      { mb: dx1 + 4, bins: dx0 - 24 },
      { mb: dx0 - 15, bins: dx0 - 40 },
      { mb: dx1 + 4, bins: dx1 + 19 },
    ];
    for (const L of layouts) {
      const parts = [sol(OAKS.mailbox, L.mb, vergeY - 4), sol(OAKS.binTrash, L.bins, vergeY - 1), sol(OAKS.binRecycle, L.bins + 11, vergeY - 1)];
      if (parts.some(r => r.x < lot.x0 + 2 || r.x + r.w > lot.x1 - 2)) continue;
      if (!parts.every(free)) continue;
      place(OAKS.mailbox, L.mb, vergeY - 4);
      place(OAKS.binTrash, L.bins, vergeY - 1);
      place(OAKS.binRecycle, L.bins + 11, vergeY - 1);
      return;
    }
    place(OAKS.mailbox, dx0 - 15, vergeY - 4);       // no room for the bins: just the mailbox
  };

  // a few things in a backyard (area x0..x1, y0..y1)
  const yard = (kinds, x0, x1, y0, y1, seed) => {
    const r = mulberry(seed);
    let cx = x0 + 6;
    for (const k of kinds) {
      const room = x1 - cx - 6;
      if (k === 'pool') {
        const pw = Math.min(64, x1 - x0 - 24), ph = Math.min(30, y1 - y0 - 18);
        const px0 = Math.round((x0 + x1) / 2 - pw / 2), py0 = Math.round((y0 + y1) / 2 - ph / 2);
        layers.yard.push((g) => paintPool(g, px0, py0, pw, ph));
        m.solids.push({ x: px0, y: py0, w: pw, h: ph, jumpable: false });
        place(OAKS.patioSet, px0 + pw + 4 > x1 - 24 ? px0 - 26 : px0 + pw + 6, py0 + 4);
        continue;
      }
      if (k === 'patio') {
        const pw = 34, ph = 22;
        layers.yard.push((g) => paintConcrete(g, cx, y1 - ph - 4, pw, ph, { slab: 11 }));
        place(OAKS.patioSet, cx + 6, y1 - ph);
        cx += pw + 8;
        continue;
      }
      if (k === 'garden') {
        const gw = Math.min(40, room), gh = 14;
        if (gw > 12) layers.beds.push((g) => paintFlowerBed(g, cx, y0 + 6, gw, gh, seed + cx));
        place(OAKS.gnome, cx + 4 + Math.floor(r() * (gw - 12)), y0 + 4);
        cx += gw + 8;
        continue;
      }
      const def = { swing: OAKS.swingSet, shed: OAKS.shed, trampoline: OAKS.trampoline, doghouse: OAKS.doghouse, kiddie: OAKS.kiddiePool }[k];
      if (!def) continue;
      const w = def.img.width, h = def.img.height;
      const yy = k === 'shed' ? y0 + 2 : Math.round(y0 + (y1 - y0 - h) * (0.3 + r() * 0.4));
      place(def, Math.min(cx, x1 - w - 6), yy);
      cx += w + 10;
    }
  };

  for (const lot of LOTS) {
    if (lot.cul) { cul(lot); continue; }
    const north = lot.side === 'n';
    const def = houseArt({ build: lot.build, color: lot.color, facing: north ? 'front' : 'back', garageSide: lot.garage, lit: lot.lit, seed: lot.x0 });
    const cx = (lot.x0 + lot.x1) / 2;
    const hx = Math.round(Math.max(lot.x0 + 8, Math.min(lot.x1 - 8 - def.w, cx - def.w / 2)));
    const footD = def.solid.h + 1;
    const base = north ? N_BASE : S_TOP + footD - 2;
    const hy = base + 2 - def.h;
    m.customHouse(def, hx, hy);
    const house = { x0: hx, x1: hx + def.w, y0: hy, base, side: lot.side, def, lot };
    m.houseList.push(house);
    const wallTop = base - (def.solid.h - 1);
    // the driveway: up to the garage door, or alongside the house if there isn't one
    let dx0, dx1;
    if (def.garage) { dx0 = hx + def.garage.x0; dx1 = hx + def.garage.x1; }
    else if (lot.garage === 'left') { dx1 = hx - 3; dx0 = dx1 - 24; }
    else { dx0 = hx + def.w + 3; dx1 = dx0 + 24; }
    const curbY = north ? RY0 : RY1;
    const dy0 = north ? (def.garage ? base : wallTop - 4) : curbY;
    const dy1 = north ? curbY : (def.garage ? S_TOP : base + 6);
    const drive = { x: dx0, y: dy0, w: dx1 - dx0, h: dy1 - dy0, side: north ? 'acornN' : 'acornS' };
    drives.push(drive);
    house.drive = drive;
    layers.drive.push((g) => { paintConcrete(g, drive.x, drive.y, drive.w, drive.h, { slab: 18, along: 'y' }); paintStain(g, drive.x + drive.w / 2, north ? curbY - 40 : curbY + 46); });
    // the car on it, nose in toward the garage
    if (lot.car) {
      const car = carArt(lot.car[0], lot.car[1], north ? 'up' : 'down');
      const carX = Math.round(dx0 + (dx1 - dx0) / 2 - car.w / 2);
      const carY = north ? (def.garage ? QO.roadY[0] - 32 - car.h : wallTop - 2) : (def.garage ? 562 : base - car.h - 4);
      place(car, carX, carY);
      house.car = { x: carX, y: carY, def: car };
    }
    if (lot.hoop) place(OAKS.hoop, dx1 - 6, north ? base - 26 : curbY + 40);
    // the walk from the door out to the sidewalk, and the porch light
    const doorX = hx + (north ? def.door.x : def.mainX + Math.floor(def.mainW / 2));
    if (north) {
      layers.walk.push((g) => paintConcrete(g, doorX - 3, base + 1, 7, QO.roadY[0] - 32 - base - 1, { slab: 6, along: 'y' }));
      light(hx + def.porch.x, base + 3, 22);
      if (def.garage) light(hx + (def.garage.x0 + def.garage.x1) / 2, base + 3, 18, 0.1);
      // a bed of shrubs along the front of the house
      const bx0 = hx + def.mainX + 2, bx1 = hx + def.mainX + def.mainW - 2;
      layers.beds.push((g) => { paintFlowerBed(g, bx0, base + 2, Math.max(0, doorX - 6 - bx0), 7, lot.x0); paintFlowerBed(g, doorX + 6, base + 2, Math.max(0, bx1 - doorX - 6), 7, lot.x0 + 1); });
      for (const sx of [bx0 + 1, bx1 - 17]) if (Math.abs(sx + 8 - doorX) > 14) place(OAKS[(lot.x0 / 16) % 3 ? 'shrub' : 'azalea'], sx, base);
      layers.lawn.push((g) => paintLawnStripes(g, lot.x0 + 4, base + 9, lot.x1 - lot.x0 - 8, QO.roadY[0] - 32 - base - 10, 'x'));
    } else {
      layers.walk.push((g) => paintConcrete(g, doorX - 3, QO.roadY[1] + 32, 7, S_TOP - QO.roadY[1] - 32, { slab: 6, along: 'y' }));
      light(doorX, S_TOP - 3, 20);                          // the porch light round the front
      light(hx + def.porch.x, base + 4, 18);                // the light by the back door
      // the deck off the back
      const dkx = hx + def.mainX + 4, dkw = def.mainW - 8;
      layers.yard.push((g) => paintDeck(g, dkx, base + 2, dkw, 14));
      layers.lawn.push((g) => paintLawnStripes(g, lot.x0 + 4, QO.roadY[1] + 34, lot.x1 - lot.x0 - 8, S_TOP - QO.roadY[1] - 52, 'x'));
    }
    // lit windows spill a little light
    for (const w of def.windows) if (w.lit) light(hx + w.x + w.w / 2, base + 4, 14, 0.24);
    // the mailbox and the bins out at the curb
    curbside(dx0, dx1, north ? RY0 - 16 : RY1, lot);
    // the backyard, fenced
    if (north) {
      const yb = hy + 2;                                    // the roof's top edge: the yard's behind it
      yard(lot.yard, lot.x0, lot.x1, N_FENCE + 18, yb - 4, lot.x0 + 3);
    } else {
      yard(lot.yard, lot.x0, lot.x1, base + 22, S_FENCE - 2, lot.x0 + 5);
    }
  }

  // The cul-de-sac's two: side on to us, the street end toward the bulb.
  function cul(lot) {
    const west = lot.cul === 'w';
    const def = houseArt({ build: lot.build, color: lot.color, facing: 'side', garageSide: west ? 'right' : 'left', lit: lot.lit, seed: west ? 3 : 5 });
    const base = 236;
    const hx = west ? 314 - def.w : 582;
    const hy = base + 2 - def.h;
    m.customHouse(def, hx, hy);
    const house = { x0: hx, x1: hx + def.w, y0: hy, base, side: west ? 'culW' : 'culE', def, lot };
    m.houseList.push(house);
    const bodyEnd = west ? hx + def.body.x1 : hx + def.body.x0;
    const curbAt = (y) => B.x + (west ? -1 : 1) * Math.sqrt(Math.max(0, B.r * B.r - (y - B.y) ** 2));
    const ringAt = (y) => B.x + (west ? -1 : 1) * Math.sqrt(Math.max(0, B.ring * B.ring - (y - B.y) ** 2));
    const dy0 = base - 40, dy1 = base - 18;        // the garage is on the street end, beside the porch
    const cx0 = west ? bodyEnd : Math.round(curbAt(dy0)) - 2;
    const cx1 = west ? Math.round(curbAt(dy0)) + 2 : bodyEnd;
    const drive = { x: cx0, y: dy0, w: cx1 - cx0, h: dy1 - dy0, side: 'bulb' };
    drives.push(drive);
    house.drive = drive;
    layers.drive.push((g) => { paintConcrete(g, drive.x, drive.y, drive.w, drive.h, { slab: 18 }); paintStain(g, west ? cx0 + 18 : cx1 - 18, dy0 + 10); });
    const car = carArt(lot.car[0], lot.car[1], west ? 'left' : 'right');
    const carX = west ? bodyEnd + 3 : bodyEnd - 3 - car.w;
    place(car, carX, dy0 + Math.round((dy1 - dy0 - car.h) / 2));
    house.car = { x: carX, y: dy0, def: car };
    // the walk from the porch to the sidewalk round the bulb
    const py = base - 8;
    const wx0 = west ? hx + def.w - 1 : Math.round(ringAt(py)) - 6;
    const wx1 = west ? Math.round(ringAt(py)) + 6 : hx + 1;
    layers.walk.push((g) => paintConcrete(g, wx0, py - 3, wx1 - wx0, 7, { slab: 6 }));
    light(hx + def.porch.x, base + 3, 22);
    for (const w of def.windows) if (w.lit) light(hx + w.x + w.w / 2, base + 4, 14, 0.24);
    // the backyard: everything on the far side of the house, out to the woods
    const yx0 = west ? F + 6 : hx + def.w + 10, yx1 = west ? hx - 10 : W - F - 6;
    yard(lot.yard, yx0, yx1, F + 26, N_FENCE - 6, west ? 71 : 73);
    place(OAKS.mailbox, west ? Math.round(curbAt(dy0 - 6)) - 16 : Math.round(curbAt(dy0 - 6)) + 4, dy0 - 22);
  }

  /* ---------------- fences round the backyards ---------------- */
  const fenceH = (x0, x1, y) => { for (let x = x0; x + 16 <= x1; x += 16) place(OAKS.privacyH, x, y); };
  const fenceV = (x, y0, y1) => { for (let y = y0; y < y1; y += 16) place(OAKS.privacyV, x, y); };
  fenceH(F + 8, RX0 - 52, N_FENCE); fenceH(RX1 + 52, W - F - 8, N_FENCE);
  fenceH(F + 8, 288, S_FENCE); fenceH(608, W - F - 8, S_FENCE);
  for (const x of [157, 269, 621, 733]) {
    fenceV(x, N_FENCE + 16, N_BASE - 70);                    // between the north row's yards (a gate gap by the houses)
    fenceV(x, S_TOP + 54, S_FENCE - 4);                      // ...and the south row's
  }

  /* ---------------- the street furniture ---------------- */
  // the entrance: brick walls either side of the road, lanterns on the pillars
  place(OAKS.monument, 286, H - F - 30);
  place(OAKS.monument, 514, H - F - 30);
  for (const x of [287, 371, 515, 599]) { place(OAKS.lantern, x, H - F - 42, { noHide: true }); light(x + 5, H - F, 30, 0.25); }
  layers.beds.push((g) => { paintFlowerBed(g, 292, H - F + 6, 88, 8, 801); paintFlowerBed(g, 520, H - F + 6, 88, 8, 802); });
  // hydrants, signs, barricades where Acorn Ln runs into the woods
  place(OAKS.hydrant, 362, RY0 - 15);
  place(OAKS.hydrant, 524, RY1 + 2);
  place(OAKS.hydrant, 402, 600);
  place(OAKS.stopSign, 360, RY1 - 17);          // for traffic heading east, on its right
  place(OAKS.stopSign, 514, RY0 - 31);          // ...and heading west
  place(OAKS.streetSign, 466, RY0 - 47);        // on the corner verge
  place(OAKS.slowSign, 484, 690);
  for (const y of [RY0 + 2, RY0 + 30]) { place(OAKS.barricade, F + 2, y); place(OAKS.barricade, W - F - 36, y); }
  // street trees on the verges, between everything else
  const vergeOk = (x, y, w = 22) => !m.solids.some(q => x + w > q.x - 6 && x < q.x + q.w + 6 && y + 6 > q.y - 6 && y < q.y + q.h + 6) &&
    !drives.some(d => x + w > d.x - 8 && x < d.x + d.w + 8 && y + 4 > d.y && y < d.y + d.h);
  const streetTree = (x, baseY) => {
    const def = rnd() < 0.5 ? OAKS.maple : OAKS.maple2;
    const tx = Math.round(x - def.img.width / 2), ty = Math.round(baseY - def.img.height);
    const sx = tx + def.solid.x, sy = ty + def.solid.y;
    if (!vergeOk(sx - 4, sy, def.solid.w + 8)) return;
    place(def, tx, ty, { see: true });
    layers.top.push((g) => paintMulchRing(g, x, baseY - 3, 6));
  };
  for (let x = 72; x < W - 60; x += 48) {
    if (x > RX0 - 40 && x < RX1 + 40) continue;
    streetTree(x + 12, RY0 - 4);
    streetTree(x + 36, RY1 + 12);
  }
  for (let y = 300; y < H - 80; y += 56) {
    if (y > RY0 - 40 && y < RY1 + 40) continue;
    streetTree(408, y + 20);
    streetTree(488, y + 46);
  }
  // the Quiet Oak itself, on the island
  const qo = OAKS.quietOak;
  place(qo, B.x - qo.img.width / 2, B.y + 10 - qo.img.height, { see: true });
  // and the oaks the place is named for, out in the big yards (wherever one
  // fits: clear of everything solid, every house and every driveway)
  const fits = (x0, y0, x1, y1) => !m.solids.some(q => x1 > q.x - 4 && x0 < q.x + q.w + 4 && y1 > q.y - 4 && y0 < q.y + q.h + 4) &&
    !m.houseList.some(h => x1 > h.x0 - 6 && x0 < h.x1 + 6 && y1 > h.y0 - 6 && y0 < h.base + 4) &&
    !drives.some(d => x1 > d.x - 6 && x0 < d.x + d.w + 6 && y1 > d.y - 6 && y0 < d.y + d.h + 6);
  const yardOak = (cx, baseY, big = true) => {
    const def = big ? (rnd() < 0.5 ? OAKS.oak : OAKS.oak2) : OAKS.maple;
    const x = Math.round(cx - def.img.width / 2), y = Math.round(baseY - def.img.height);
    const sx = x + def.solid.x, sy = y + def.solid.y;
    if (!fits(sx - 10, sy - 6, sx + def.solid.w + 10, sy + def.solid.h + 4)) return;
    place(def, x, y, { see: true });
    layers.top.push((g) => paintMulchRing(g, Math.round(cx), Math.round(baseY - 3), 7));
  };
  for (const [x, y] of [[96, 248], [196, 140], [72, 150], [370, 92], [528, 92], [690, 244], [790, 150], [840, 236],
    [92, 752], [214, 748], [344, 744], [560, 748], [690, 744], [820, 752], [330, 300], [566, 300]]) yardOak(x, y);

  /* ---------------- cars parked along the curbs ---------------- */
  // facing the way traffic runs on that side, never across a driveway mouth,
  // by a hydrant or near the intersection
  const PARKS = [
    { side: 'acornN', at: [116, 288, 668], cars: [['sedan', 'blue'], ['hatch', 'white'], ['suv', 'green']] },
    { side: 'acornS', at: [80, 236, 596, 760], cars: [['sedan', 'silver'], ['minivan', 'maroon'], ['pickup', 'blue'], ['sedan', 'beige']] },
    { side: 'oakW', at: [312, 360, 680], cars: [['hatch', 'red'], ['sedan', 'black'], ['suv', 'silver']] },
    { side: 'oakE', at: [372, 640], cars: [['sedan', 'white'], ['hatch', 'blue']] },
  ];
  const mouthClear = (side, a0, a1) => !drives.some(d => d.side === side && a1 > d.x - 8 && a0 < d.x + d.w + 8);
  for (const P of PARKS) {
    P.at.forEach((a, i) => {
      const [type, color] = P.cars[i % P.cars.length];
      const car = carArt(type, color, PARK_FACE[P.side]);
      let x, y;
      if (P.side === 'acornN') { x = a; y = RY0 + 1; }
      else if (P.side === 'acornS') { x = a; y = RY1 - 1 - car.h; }
      else if (P.side === 'oakW') { x = RX0 + 1; y = a; }
      else { x = RX1 - 1 - car.w; y = a; }
      const horiz = P.side.startsWith('acorn');
      if (horiz && !mouthClear(P.side, x, x + car.w)) return;
      place(car, x, y);
      parked.push({ side: P.side, x, y, w: car.w, h: car.h, face: car.face });
    });
  }

  /* ---------------- the van ---------------- */
  // at the north curb of Acorn Ln, west of the intersection, nose west
  m.placeVan(176, RY0 - 6);
  m.spawn = { x: 236, y: RY0 + 12 };
  m.arrive = { x0: 400, lane: RY0 + 2 };       // the van rolls in from here (Acorn Ln, heading west)
  m.gate = { x: (G0 + G1) / 2, y: H + 30 };

  /* ---------------- hiding spots for the solid things ---------------- */
  for (const ph of m.pendingHides || []) {
    const y = ph.ys.find(yy => yy > F + 4 && yy < H - F && !blocked(ph.x, yy));
    if (y !== undefined) m.hideSpots.push({ x: ph.x, y: Math.round(y), inside: false });
  }
  delete m.pendingHides;
  // Aliens path on a 16px grid: a spot in a tile that a wall touches can't
  // be got to, so nudge each one into the nearest walkable tile (a step or
  // two at most; a hider is never drawn, it just has to be by its cover).
  const nav = buildNav(m);
  const walkable = (x, y) => {
    const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    return cx >= 0 && cy >= 0 && cx < nav.gw && cy < nav.gh && nav.cells[cy * nav.gw + cx] !== 1;
  };
  m.hideSpots = m.hideSpots.filter((sp) => {
    if (walkable(sp.x, sp.y)) return true;
    for (const r of [6, 10, 14, 18]) {
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const x = sp.x + dx * r, y = sp.y + dy * r;
        if (walkable(x, y) && !blocked(x, y)) { sp.x = Math.round(x); sp.y = Math.round(y); return true; }
      }
    }
    return false;
  });

  /* ---------------- the ground ---------------- */
  m.paintGround = (g, tiles) => {
    for (const f of layers.lawn) f(g);
    for (const f of layers.yard) f(g);
    for (const f of layers.drive) f(g);
    for (const f of layers.walk) f(g);
    // sidewalks: along both streets, round the bulb
    const walkRing = (x, y) => { const d = Math.hypot(x - B.x, (y - B.y)); return d >= B.ring - 16 && d < B.ring; };
    paintConcrete(g, F, RY0 - 32, RX0 - 32 - F, 16);
    paintConcrete(g, RX1 + 32, RY0 - 32, W - F - RX1 - 32, 16);
    paintConcrete(g, F, RY1 + 16, RX0 - 32 - F, 16);
    paintConcrete(g, RX1 + 32, RY1 + 16, W - F - RX1 - 32, 16);
    const bulbFoot = B.y + Math.round(Math.sqrt(B.ring * B.ring - 64 * 64));
    paintConcrete(g, RX0 - 32, bulbFoot - 8, 16, RY0 - bulbFoot + 8, { along: 'y' });
    paintConcrete(g, RX1 + 16, bulbFoot - 8, 16, RY0 - bulbFoot + 8, { along: 'y' });
    paintConcrete(g, RX0 - 32, RY1, 16, H - RY1, { along: 'y' });
    paintConcrete(g, RX1 + 16, RY1, 16, H - RY1, { along: 'y' });
    // the sidewalks cross Acorn Ln and Oak Hollow Dr at the corners
    paintConcrete(g, RX0 - 32, RY0 - 32, 16, 16); paintConcrete(g, RX1 + 16, RY0 - 32, 16, 16);
    paintConcrete(g, RX0 - 32, RY1 + 16, 16, 16); paintConcrete(g, RX1 + 16, RY1 + 16, 16, 16);
    for (let y = B.y - B.ring; y < B.y + B.ring; y++) {
      for (let x = B.x - B.ring; x < B.x + B.ring; x++) {
        if (!walkRing(x + 0.5, y + 0.5)) continue;
        if (y > B.y && Math.abs(x + 0.5 - B.x) < 32) continue;               // the road comes in here
        // slab joints every so often round the ring
        const joint = Math.abs(((Math.atan2(y + 0.5 - B.y, x + 0.5 - B.x) * 16 / Math.PI) % 1 + 1) % 1 - 0.5) > 0.47;
        g.fillStyle = joint ? '#8f9196' : hash2(x, y) < 0.06 ? '#c4c6ca' : '#a9abb0';
        g.fillRect(x, y, 1, 1);
      }
    }
    // the driveways cut across the sidewalks to the curb
    for (const d of drives) {
      const north = d.side === 'acornN', south = d.side === 'acornS';
      if (north) paintConcrete(g, d.x, RY0 - 32, d.w, 32, { slab: 16, along: 'y' });
      if (south) paintConcrete(g, d.x, RY1, d.w, 32, { slab: 16, along: 'y' });
    }
    // the road: Acorn Ln, Oak Hollow Dr, the bulb (round the island)
    paintAsphalt(g, F - 8, RY0, W - F * 2 + 16, RY1 - RY0);
    paintAsphalt(g, RX0, B.y + B.island + 4, RX1 - RX0, H - B.y - B.island - 4);
    paintAsphalt(g, B.x - B.r, B.y - B.r, B.r * 2, B.r * 2, (x, y) => {
      const d = Math.hypot(x - B.x, y - B.y);
      return d < B.r && d >= B.island;
    });
    // curbs: along the verges, round the bulb and the island, cut at the driveways
    const cut = (x0, x1, side) => drives.filter(d => d.side === side && x1 > d.x && x0 < d.x + d.w);
    const curbRun = (x0, x1, y, side) => {
      let x = x0;
      const cuts = cut(x0, x1, side).sort((a, b) => a.x - b.x);
      for (const c of cuts) { if (c.x - 2 > x) paintCurb(g, x, y, c.x - 2 - x, 2); x = c.x + c.w + 2; }
      if (x < x1) paintCurb(g, x, y, x1 - x, 2);
    };
    curbRun(F - 8, RX0 - 2, RY0 - 2, 'acornN'); curbRun(RX1 + 2, W - F + 8, RY0 - 2, 'acornN');
    curbRun(F - 8, RX0 - 2, RY1, 'acornS'); curbRun(RX1 + 2, W - F + 8, RY1, 'acornS');
    const mouth = B.y + Math.round(Math.sqrt(B.r * B.r - 32 * 32));
    paintCurb(g, RX0 - 2, mouth, 2, RY0 - mouth - 2); paintCurb(g, RX1, mouth, 2, RY0 - mouth - 2);
    paintCurb(g, RX0 - 2, RY1, 2, H - RY1); paintCurb(g, RX1, RY1, 2, H - RY1);
    for (let a = 0; a < Math.PI * 2; a += 0.01) {
      for (const [r, out] of [[B.r, 1], [B.island, -1]]) {
        const x = Math.round(B.x + Math.cos(a) * (r + (out > 0 ? 0 : -1))), y = Math.round(B.y + Math.sin(a) * (r + (out > 0 ? 0 : -1)));
        if (out > 0 && y > B.y && Math.abs(x - B.x) < 32) continue;
        if (out > 0 && drives.some(d => d.side === 'bulb' && x >= d.x - 1 && x <= d.x + d.w + 1 && y >= d.y && y <= d.y + d.h)) continue;
        g.fillStyle = Math.sin(a) < -0.3 ? '#d4d8dc' : '#b4b8be';
        g.fillRect(x, y, 2, 2);
      }
    }
    // crosswalks on the four approaches, a stop line before each
    paintCrosswalk(g, RX0 - 32, RY0, 16, RY1 - RY0, false);
    paintCrosswalk(g, RX1 + 16, RY0, 16, RY1 - RY0, false);
    paintCrosswalk(g, RX0, RY0 - 32, RX1 - RX0, 16, true);
    paintCrosswalk(g, RX0, RY1 + 16, RX1 - RX0, 16, true);
    g.fillStyle = '#c8ccd2';
    g.fillRect(RX0 - 36, (RY0 + RY1) / 2, 2, (RY1 - RY0) / 2);               // eastbound stops
    g.fillRect(RX1 + 34, RY0, 2, (RY1 - RY0) / 2);                          // westbound
    g.fillRect((RX0 + RX1) / 2, RY0 - 36, (RX1 - RX0) / 2, 2);              // southbound
    g.fillRect(RX0, RY1 + 34, (RX1 - RX0) / 2, 2);                          // northbound
    for (const f of layers.beds) f(g);
    // the island under the Quiet Oak: grass, a ring of mulch at its foot
    paintMulchRing(g, B.x, B.y + 6, 14);
    for (const f of layers.top) f(g);
    // the woods all round
    paintForest(g, 0, 0, W, F, 301);
    paintForest(g, 0, F, F, H - F, 302);
    paintForest(g, W - F, F, F, H - F, 304);
    paintForest(g, F, H - F, G0 - F - 8, F, 306);
    paintForest(g, G1 + 8, H - F, W - F - G1 - 8, F, 307);
  };
  return m.done();
}

function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export const MAP_BUILDERS = {
  playground: buildPlayground,
  farmhouse: buildFarmhouse,
  shipyard: buildShipyard,
  neighborhood: buildNeighborhood,
  tropical: buildTropical,
  farmfields: buildFarmFields,
  barnyard: buildBarnyard,
  highway29: buildHighway29,
  quietoaks: buildQuietOaks,
};
