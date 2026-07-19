import { T, TILE, buildProps } from './sprites.js';

// A map = ground tile grid + props (with solids & hide spots) + van + player spawn.
// World units are pixels; tiles are 16px.

const PROPS = buildProps();

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

  placeVan(x, y) {
    this.van = { x, y };
    // van body blocks; deposit zone handled in game.js by radius from door
    this.solids.push({ x: x + 1, y: y + 6, w: 40, h: 20, jumpable: false });
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
// Buildings, cars, streetlamps, trees, mailboxes and trash cans here are
// PNGs from a user-supplied city asset pack (assets/maple/, via pngProps.js)
// instead of the procedural canvas art — Maple Street only, every other map
// is unaffected. Falls back to the procedural suburban art if the PNGs
// haven't loaded (assets.pngProps missing).
export function buildNeighborhood(assets) {
  const png = assets && assets.pngProps;
  const m = new MapBuilder('Maple Street', 40, 34, T.GRASS);
  m.variety(T.GRASS, T.GRASS2, 0.3, 41);
  m.stealth = true;
  m.tint = 'night';

  // road grid (cross of asphalt) with concrete sidewalks
  m.fill(T.CONCRETE, 0, 13, 40, 8);       // horizontal corridor
  m.fill(T.ASPHALT, 0, 15, 40, 4);        // horizontal road
  m.fill(T.CONCRETE, 15, 0, 8, 34);       // vertical corridor
  m.fill(T.ASPHALT, 17, 0, 4, 34);        // vertical road

  // driveways (concrete) from each house down/up to the road
  for (const dx of [88, 232, 392, 536]) m.fill(T.CONCRETE, (dx / 16) | 0, 12, 3, 2);
  for (const dx of [88, 232, 392, 536]) m.fill(T.CONCRETE, (dx / 16) | 0, 20, 3, 2);

  if (png) {
    // top row of buildings (facing down toward the road)
    const topHouses = [png.houseA, png.houseB, png.houseC, png.houseA];
    const topX = [40, 208, 380, 540];
    for (let i = 0; i < topX.length; i++) {
      m.customHouse(topHouses[i], topX[i], 88);
      m.customProp(png.mailbox, topX[i] - 14, 195);
    }
    // bottom row of buildings
    const botHouses = [png.houseC, png.houseA, png.houseB, png.houseC];
    const botX = [40, 208, 380, 540];
    for (let i = 0; i < botX.length; i++) {
      m.customHouse(botHouses[i], botX[i], 340);
      m.customProp(png.mailbox, botX[i] - 26, 340);
    }

    // parked cars / truck on driveways / curbs
    m.customProp(png.carRed, 96, 192); m.customProp(png.carBlue, 250, 192);
    m.customProp(png.truck, 96, 268); m.customProp(png.carRed, 420, 268); m.customProp(png.carBlue, 560, 192);

    // street trees + lamps along the sidewalks
    for (const [x, y] of [[8, 60], [270, 60], [470, 60], [610, 60], [110, 500], [430, 500], [590, 480], [8, 240]])
      m.customProp(png.tree, x, y);
    for (const [x, y] of [[250, 216], [360, 216], [250, 296], [140, 216], [470, 296]])
      m.customProp(png.lamp, x, y);

    // trash cans tucked around
    for (const [x, y] of [[20, 130], [300, 470], [610, 130], [8, 470], [470, 470]])
      m.customProp(png.trashcan, x, y);
  } else {
    // ---- procedural fallback (identical to the original art) ----
    const topHouses = [['houseCream', 40], ['houseTan', 208], ['houseBrick', 380], ['houseCream', 540]];
    for (const [key, x] of topHouses) {
      m.house(key, x, 108);
      m.prop('mailbox', x + 68, 176);
    }
    const botHouses = [['houseBrick', 40], ['houseCream', 208], ['houseTan', 380], ['houseBrick', 540]];
    for (const [key, x] of botHouses) {
      m.house(key, x, 300);
      m.prop('mailbox', x - 6, 300);
    }
    m.prop('carRed', 96, 192); m.prop('carBlue', 250, 192);
    m.prop('carWhite', 96, 268); m.prop('carRed', 420, 268); m.prop('carBlue', 560, 192);
    for (const [x, y] of [[8, 60], [270, 60], [470, 60], [610, 60], [110, 500], [430, 500], [590, 480], [8, 240]])
      m.prop('tree', x, y);
    for (const [x, y] of [[250, 216], [360, 216], [250, 296], [140, 216], [470, 296]])
      m.prop('lamppost', x, y);
    for (const [x, y] of [[20, 130], [300, 470], [610, 130], [8, 470], [470, 470]])
      m.prop('trashcan', x, y);
  }

  // hedges dividing the yards (prime hiding, vaultable) — kept procedural
  const hedges = [
    [150, 110], [150, 150], [322, 110], [478, 130],
    [150, 360], [322, 360], [322, 400], [478, 370],
    [40, 200], [590, 300],
  ];
  for (const [x, y] of hedges) m.prop('hedge', x, y);

  // bushes tucked around — kept procedural
  for (const [x, y] of [[120, 470], [360, 130], [220, 500], [520, 500], [80, 380]])
    m.prop('bush', x, y);

  m.placeVan(240, 208);                    // agent's van idling on the road
  m.spawn = { x: 300, y: 250 };
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

export const MAP_BUILDERS = {
  playground: buildPlayground,
  farmhouse: buildFarmhouse,
  shipyard: buildShipyard,
  neighborhood: buildNeighborhood,
  tropical: buildTropical,
};
