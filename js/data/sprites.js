// All pixel art is generated at boot from string grids / draw code.
// No external assets — everything renders crisp at integer scale.
//
// ART BIBLE
//  * One light source, top-left. Highlights on top/left faces, core shadow
//    on bottom/right, plus a 1px near-black outline (C.ink) on every object.
//  * Shared material ramps (wood / steel / foliage / etc.) are reused across
//    every prop so the whole set reads like one artist drew it.

export const TILE = 16;

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

// Build a sprite canvas from row strings + char->color palette. '.' = transparent.
export function makeSprite(rows, pal) {
  const h = rows.length, w = rows[0].length;
  const [c, ctx] = canvas(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.' || ch === ' ') continue;
      ctx.fillStyle = pal[ch] || '#f0f';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

export function flipX(src) {
  const [c, ctx] = canvas(src.width, src.height);
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return c;
}

// Deterministic rng for tile speckles
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ===================== SHARED MATERIAL PALETTE ===================== */
// Every prop pulls its colours from here so materials stay consistent.
export const C = {
  ink:  '#141019',  // outline (warm near-black)
  ink2: '#241d2e',  // soft occlusion outline
  shadow: '#0d0b12',

  // wood: fences, crates, benches, pallets, docks, barn door, sandbox frame
  wd0: '#3b2716', wd1: '#5c3d22', wd2: '#7a5230', wd3: '#96683c', wd4: '#b5854f', wd5: '#d4a869',
  // steel: silo, crane, containers' edges, dumpster, poles, wheels, van/ufo
  mt0: '#2b2f38', mt1: '#434a56', mt2: '#616b7a', mt3: '#8791a0', mt4: '#aeb8c6', mt5: '#d7dfea',
  // foliage: trees, bushes
  lf0: '#1b3f1c', lf1: '#2c6127', lf2: '#3d8636', lf3: '#57a648', lf4: '#77c862', lf5: '#9ee07f',
  // red / rust: barn, red container, slide tower
  rd0: '#5f1f1a', rd1: '#8a2f26', rd2: '#b34034', rd3: '#d55a48',
  // gold / yellow: slide chute, hay, crane, lamp, sand
  gd0: '#9a6a12', gd1: '#c8952c', gd2: '#e6bb46', gd3: '#f6da79',
  // blue: blue container, swing frame, barrel, water
  bl0: '#20405f', bl1: '#356291', bl2: '#5487bd', bl3: '#82b0dd',
  // vehicle / dumpster green: tractor, dumpster, green container
  gr0: '#1c4a22', gr1: '#2c6e30', gr2: '#3e9440', gr3: '#5cb85a',
  // glass + accents
  gl0: '#3a5a78', gl1: '#6fa8cc', gl2: '#b3ddf0',
  cy:  '#41f0d8', glow: '#ffd75e',

  // suburban houses (cream / tan / brick walls)
  wl0: '#b8a582', wl1: '#d8c8a4', wl2: '#efe2c2',   // cream wall
  wt0: '#a67c56', wt1: '#c49a70', wt2: '#e0bb8e',   // tan wall
  br0: '#8a3a2e', br1: '#b0503e', br2: '#c86a52',   // brick wall

  // tropical foliage (richer/darker than lf)
  jg0: '#123a17', jg1: '#1f5622', jg2: '#2c7830', jg3: '#45a03f', jg4: '#67c85e',
  // volcanic rock
  vrk0: '#2a2530', vrk1: '#3d3742', vrk2: '#544b58', vrk3: '#6e6472',
  // lava
  lav0: '#7a1a10', lav1: '#c23a12', lav2: '#f07018', lav3: '#ffc23a',
  // ash / smoke
  ash: '#b8b0a8', ash2: '#8a8078',
};

/* ============================ PLAYER ============================ */
// CIA field agent: dark navy suit, white shirt, red tie, sunglasses, earpiece.
const P = {
  k: '#141019', // outline
  H: '#241a15', // hair
  h: '#3c2c22', // hair shine
  s: '#e3a877', // skin
  d: '#bd855a', // skin shade
  L: '#f2c99b', // skin highlight
  g: '#0b0b12', // sunglass lens
  G: '#3a5273', // lens glint
  n: '#2b3654', // suit navy
  N: '#1b2540', // suit dark / trousers
  u: '#3e4f74', // suit highlight
  w: '#eef1f7', // shirt
  W: '#c3ccda', // shirt shade
  t: '#b23a2f', // tie
  T: '#801f19', // tie dark
  o: '#15151c', // dress shoe
  c: '#c8ccd6', // earpiece
};

const PLAYER_DOWN = [
  '....kkkk....',
  '...kHHHHk...',
  '..kHhhhhHk..',
  '..kHssssHk..',
  '..kssssssk..',
  '..kGgkkgGk..',
  '..ksssssdk..',
  '...kssddk...',
  '.knnwwwwnnk.',
  '.knuwttwunk.',
  '.knnwttwnnk.',
  '..knwttwnk..',
  '...NN..NN...',
  '...NN..NN...',
  '...oo..oo...',
  '............',
];

const PLAYER_UP = [
  '....kkkk....',
  '...kHHHHk...',
  '..kHhhhhHk..',
  '..kHHHHHHk..',
  '..kHhhhHHk..',
  '..kHHHHHHk..',
  '..kHHHHHHk..',
  '...kHHHHk...',
  '.knnnnnnnnk.',
  '.knunnnnunk.',
  '.knnnNNnnnk.',
  '..knnNNnnk..',
  '...NN..NN...',
  '...NN..NN...',
  '...oo..oo...',
  '............',
];

// Facing right; left is a mirror.
const PLAYER_SIDE = [
  '...kkkk.....',
  '..kHHHHk....',
  '.kHhhhHHk...',
  '.kHHHssssk..',
  '.kHHksssdk..',
  '.kHkgggsdk..',
  '.kckssssdk..',
  '..kkssssk...',
  '..knwwwwk...',
  '.knnwttwk...',
  '.knnnwwnk...',
  '..knnnnk....',
  '...NN.NN....',
  '...NN.NN....',
  '...oo.oo....',
  '............',
];

// Lying face-down after a missed dive (horizontal, head to the right).
const PLAYER_PRONE = [
  '................',
  '................',
  '................',
  '..........ss....',
  '....oNNnnnnHHHk.',
  '..ooNNnnnnnHssk.',
  '..ooNNnnnnnHssgk',
  '....oNNnnnnHHHk.',
  '......s.....s...',
  '................',
  '................',
];

// Mid-air dive pose (horizontal, arms out, head to the right).
const PLAYER_DIVE = [
  '................',
  '..........sss...',
  '....oNNnnnnHHHk.',
  '..ooNNnnnnnHssgk',
  '....oNNnnnnHsssk',
  '..........ss....',
  '................',
];

/* ============================ ALIENS ============================ */
// Classic grey-alien build: teardrop head, big almond eyes, small body.
// A = body, a = body highlight (top-left), B = body shade, g = eye, G = eye shine.
const ALIEN_DOWN = [
  '...kkkk...',
  '..kAAAAk..',
  '.kAaaaaAk.',
  'kAaAAAAaAk',
  'kAggAAggAk',
  'kAgGAAGgAk',
  '.kAAAAAAk.',
  '..kAAAAk..',
  '.kABBBBAk.',
  '.kABBBBAk.',
  '..kA..Ak..',
  '..kk..kk..',
];

const ALIEN_UP = [
  '...kkkk...',
  '..kAAAAk..',
  '.kAaaaaAk.',
  'kAaaAAaaAk',
  'kAAAAAAAAk',
  'kAAAAAAAAk',
  '.kAAAAAAk.',
  '..kAAAAk..',
  '.kABBBBAk.',
  '.kABBBBAk.',
  '..kA..Ak..',
  '..kk..kk..',
];

const ALIEN_SIDE = [
  '...kkkk...',
  '..kAAAAk..',
  '.kAaaaAAk.',
  '.kAaAAAAk.',
  '.kAAAggAk.',
  '.kAAAgGAk.',
  '.kAAAAAAk.',
  '..kAAAAk..',
  '.kABBBAk..',
  '.kABBBAk..',
  '..kA.Ak...',
  '..kk.kk...',
];

// Tier palettes: main, highlight, shade.
const ALIEN_TIERS = {
  grunt:   { A: '#6bd34f', a: '#8fe870', B: '#3f9e32', name: 'Grunt' },
  scout:   { A: '#4fb8ee', a: '#82d2f7', B: '#2f7fbf', name: 'Scout' },
  trooper: { A: '#aeb8c4', a: '#cfd8e2', B: '#7c8794', name: 'Trooper' },
  elite:   { A: '#9a5ff0', a: '#bf8cf7', B: '#6a34c4', name: 'Elite' },
};

const ALIEN_BASE_PAL = { k: '#141019', g: '#0b0b12', G: '#e8f6ff' };

// Trooper helmet (metal dome that caps the head, rows 0-2).
const HELMET = [
  '...MMMM...',
  '.MMmmmmMM.',
  '.dMMMMMMd.',
];
// Elite visor (glowing band over the eyes, drawn at y=4).
const VISOR = [
  'kVVVVVVVVk',
  'kvvvvvvvvk',
];

/* ============================ BUILDERS ============================ */

export function buildActors() {
  const player = {
    down: makeSprite(PLAYER_DOWN, P),
    up: makeSprite(PLAYER_UP, P),
    right: makeSprite(PLAYER_SIDE, P),
    left: flipX(makeSprite(PLAYER_SIDE, P)),
    proneR: makeSprite(PLAYER_PRONE, P),
    proneL: flipX(makeSprite(PLAYER_PRONE, P)),
    diveR: makeSprite(PLAYER_DIVE, P),
    diveL: flipX(makeSprite(PLAYER_DIVE, P)),
  };

  const aliens = {};
  for (const [tier, tp] of Object.entries(ALIEN_TIERS)) {
    const pal = { ...ALIEN_BASE_PAL, A: tp.A, a: tp.a, B: tp.B };
    const down = makeSprite(ALIEN_DOWN, pal);
    const up = makeSprite(ALIEN_UP, pal);
    const right = makeSprite(ALIEN_SIDE, pal);

    // Accessories baked onto copies
    const deco = (src, isUp) => {
      const [c, ctx] = canvas(src.width, src.height);
      ctx.drawImage(src, 0, 0);
      if (tier === 'trooper') {
        const helm = makeSprite(HELMET, { M: C.mt3, m: C.mt4, d: C.mt1 });
        ctx.drawImage(helm, 0, 0);
      }
      if (tier === 'elite' && !isUp) {
        const vis = makeSprite(VISOR, { k: C.ink, V: C.cy, v: '#1f9e8e' });
        ctx.drawImage(vis, 0, 4);
      }
      return c;
    };
    aliens[tier] = {
      down: deco(down, false),
      up: deco(up, true),
      right: deco(right, false),
      left: flipX(deco(right, false)),
      name: tp.name,
      color: tp.A,
    };
  }
  return { player, aliens };
}

export function buildVan() {
  const [c, ctx] = canvas(46, 30);
  const px = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  // Unmarked black surveillance van, top-3/4 view, nose left, open rear right.
  // roof wheels (top)
  px(6, 2, 7, 3, '#0c0d12'); px(33, 2, 7, 3, '#0c0d12');
  // body shell + outline
  px(1, 4, 44, 22, C.ink);
  px(2, 5, 42, 20, '#20242e');
  px(2, 5, 42, 2, '#2f3542');            // roof crown highlight
  px(2, 5, 42, 1, '#3a4152');
  px(2, 22, 42, 3, '#161922');           // lower body shadow
  // hood / nose (left)
  px(2, 8, 10, 14, '#262b36');
  px(2, 8, 1, 14, '#333a48');
  px(11, 6, 1, 18, C.ink);               // cab divider
  // windshield
  px(3, 9, 7, 4, C.gl1); px(3, 9, 7, 1, C.gl2); px(4, 12, 5, 1, C.gl0);
  // roof AC / sensor pod
  px(22, 10, 7, 4, '#333a4a'); px(22, 10, 7, 1, '#3f4658');
  // side door seam + handle
  px(20, 7, 1, 16, '#171a22');
  px(30, 13, 3, 1, C.mt3);
  // surveillance dish
  px(24, 2, 2, 4, C.mt2); px(22, 1, 6, 1, C.mt3); px(23, 0, 4, 1, C.mt2);
  // rear doors seam + open interior glow (deposit hint)
  px(40, 6, 1, 18, C.ink);
  px(42, 8, 1, 14, '#2f7d52');
  px(43, 8, 2, 14, '#59d98c');
  // ground wheels (bottom)
  px(6, 25, 7, 4, '#0c0d12'); px(33, 25, 7, 4, '#0c0d12');
  px(7, 26, 5, 2, '#2b2f38'); px(34, 26, 5, 2, '#2b2f38');
  return c;
}

export function buildUfo() {
  const [c, ctx] = canvas(48, 22);
  const px = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  // glass dome
  px(19, 0, 10, 1, C.gl2);
  px(17, 1, 14, 2, C.gl1);
  px(16, 3, 16, 2, C.gl0);
  px(20, 1, 3, 1, '#e2f4ff');            // dome glint
  px(15, 5, 18, 1, C.mt4);               // dome rim
  // saucer disc (top face, catching light)
  px(9, 6, 30, 2, C.mt4);
  px(5, 8, 38, 2, C.mt3);
  px(2, 10, 44, 3, C.mt2);
  px(1, 11, 46, 1, C.mt1);               // widest edge line
  // underside (in shadow)
  px(5, 13, 38, 2, C.mt1);
  px(9, 15, 30, 2, C.mt0);
  px(14, 17, 20, 1, C.ink);
  // running lights along the mid band
  for (let i = 0; i < 6; i++) px(6 + i * 7, 11, 3, 2, i % 2 ? C.glow : C.cy);
  // bottom tractor emitter
  px(21, 17, 6, 2, C.cy); px(22, 19, 4, 1, '#a9f7ee');
  return c;
}

/* ============================ GROUND TILES ============================ */

export const T = {
  GRASS: 0, GRASS2: 1, WOODCHIP: 2, SAND: 3, DIRT: 4, CONCRETE: 5,
  ASPHALT: 6, PLANK: 7, WATER: 8, GRAVEL: 9, CORNFIELD: 10, PATH: 11,
  JUNGLE: 12, FLOWERS: 13, LAVAROCK: 14,
  // PNG road tiles (Maple Street only, filled in from pngProps.js once loaded —
  // buildTiles() below leaves these slots as a plain-asphalt placeholder).
  ROAD_PNG: 15, CROSSWALK_H: 16, CROSSWALK_V: 17, LANE_H: 18, LANE_V: 19,
  MANHOLE: 20, DRAIN: 21,
  // Stage 1 farm fields: tilled soil + crop rows, forest floor, dirt road
  SOIL: 22, WHEAT: 23, CABBAGE: 24, LETTUCE: 25, CARROT: 26, PUMPKIN: 27,
  FOREST: 28, ROAD_DIRT: 29, MEADOW: 30, ROAD_DIRT2: 31,
};

/* ---- Stage 1 crop tiles ----
   Every crop is planted in horizontal rows on an 8px pitch, so a plot tiles
   seamlessly and lines up with the tall corn / sunflower row props that sit
   on the same tilled soil. Anything drawn near a tile edge is wrapped so the
   texture has no seams. */
const SOIL_RAMP = ['#8f673c', '#7d5836', '#72502f', '#654429', '#553a24', '#46301e', '#5a3d25', '#6e4c2d'];

function cropTile(seed, drawBand) {
  const [c, ctx] = canvas(TILE, TILE);
  for (let y = 0; y < TILE; y++) { ctx.fillStyle = SOIL_RAMP[y % 8]; ctx.fillRect(0, y, TILE, 1); }
  const rnd = mulberry(seed);
  // clods + pebbles
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = rnd() < 0.5 ? '#9a7448' : '#3e2a1a';
    ctx.fillRect(Math.floor(rnd() * TILE), Math.floor(rnd() * TILE), 1, 1);
  }
  // wrapped pixel: anything poking past an edge reappears on the far side
  const px = (x, y, w, h, col) => {
    ctx.fillStyle = col;
    for (const ox of [-TILE, 0, TILE]) for (const oy of [-TILE, 0, TILE]) ctx.fillRect(x + ox, y + oy, w, h);
  };
  if (drawBand) for (const by of [0, 8]) drawBand(px, by, by === 8, rnd);
  return c;
}

function speckleTile(base, specks, seed, density = 14) {
  const [c, ctx] = canvas(TILE, TILE);
  ctx.fillStyle = base; ctx.fillRect(0, 0, TILE, TILE);
  const rnd = mulberry(seed);
  for (let i = 0; i < density; i++) {
    const col = specks[Math.floor(rnd() * specks.length)];
    ctx.fillStyle = col;
    ctx.fillRect(Math.floor(rnd() * TILE), Math.floor(rnd() * TILE), 1 + Math.floor(rnd() * 2), 1);
  }
  return c;
}

export function buildTiles() {
  const tiles = [];
  tiles[T.GRASS] = speckleTile('#4a9a42', ['#419039', '#54a345', '#3b8034'], 11, 11);
  tiles[T.GRASS2] = speckleTile('#479641', ['#3f8636', '#51a043', '#5cae4d'], 27, 12);
  tiles[T.WOODCHIP] = speckleTile('#7a5230', ['#96683c', '#5c3d22', '#3b2716'], 33, 22);
  tiles[T.SAND] = speckleTile('#e2ca83', ['#d3b972', '#eed9a0'], 44, 10);
  tiles[T.DIRT] = speckleTile('#8a6238', ['#7a5230', '#96683c', '#5c3d22'], 55, 14);
  tiles[T.CONCRETE] = (() => {
    const t = speckleTile('#9aa1ab', ['#8b929c', '#a9b0ba'], 66, 7);
    const x = t.getContext('2d');
    x.fillStyle = '#7f868f'; x.fillRect(0, 5, 16, 1); x.fillRect(9, 6, 1, 10); // control joints
    return t;
  })();
  tiles[T.ASPHALT] = speckleTile('#464b55', ['#3d424b', '#525862'], 77, 8);
  tiles[T.PLANK] = (() => {
    const [c, ctx] = canvas(TILE, TILE);
    ctx.fillStyle = C.wd3; ctx.fillRect(0, 0, TILE, TILE);
    for (let y = 0; y < TILE; y += 4) { ctx.fillStyle = C.wd1; ctx.fillRect(0, y, TILE, 1); }
    ctx.fillStyle = C.wd4; ctx.fillRect(0, 1, TILE, 1); ctx.fillRect(0, 5, TILE, 1);
    ctx.fillStyle = C.wd4; ctx.fillRect(0, 9, TILE, 1); ctx.fillRect(0, 13, TILE, 1);
    ctx.fillStyle = C.wd2; ctx.fillRect(5, 0, 1, TILE); ctx.fillRect(11, 0, 1, TILE);
    return c;
  })();
  tiles[T.WATER] = (() => {
    const [c, ctx] = canvas(TILE, TILE);
    ctx.fillStyle = '#2f5f8a'; ctx.fillRect(0, 0, TILE, TILE);
    ctx.fillStyle = C.bl2;
    ctx.fillRect(2, 3, 5, 1); ctx.fillRect(9, 8, 5, 1); ctx.fillRect(4, 12, 4, 1);
    ctx.fillStyle = '#26527a';
    ctx.fillRect(8, 2, 4, 1); ctx.fillRect(1, 9, 4, 1); ctx.fillRect(10, 13, 4, 1);
    return c;
  })();
  tiles[T.GRAVEL] = speckleTile('#7d838b', ['#6d7278', '#8d9298', '#5d6268'], 88, 20);
  tiles[T.CORNFIELD] = (() => {
    const [c, ctx] = canvas(TILE, TILE);
    ctx.fillStyle = '#6a4a2c'; ctx.fillRect(0, 0, TILE, TILE);
    const rnd = mulberry(99);
    for (let x = 1; x < TILE; x += 4) {
      ctx.fillStyle = C.lf1; ctx.fillRect(x, 0, 2, TILE);
      ctx.fillStyle = C.lf3;
      for (let y = 1; y < TILE; y += 3) ctx.fillRect(x + (rnd() > 0.5 ? 1 : 0), y, 1, 1);
      ctx.fillStyle = C.gd2; ctx.fillRect(x, 2 + Math.floor(rnd() * 8), 1, 2);
    }
    return c;
  })();
  tiles[T.PATH] = speckleTile('#b8a888', ['#a89878', '#c8b898', '#9a8a6a'], 111, 9);
  tiles[T.JUNGLE] = speckleTile('#2c7830', ['#1f5622', '#45a03f', '#123a17'], 123, 16);
  tiles[T.FLOWERS] = (() => {
    // jungle-toned base so it blends with JUNGLE — only the blossoms stand out
    const t = speckleTile('#2c7830', ['#1f5622', '#45a03f'], 131, 12);
    const x = t.getContext('2d');
    const rnd = mulberry(77);
    for (const col of ['#f4dd7a', '#e05a48', '#eef1f7', '#d585d0']) {
      const fx = Math.floor(rnd() * 14) + 1, fy = Math.floor(rnd() * 14) + 1;
      x.fillStyle = col; x.fillRect(fx, fy, 1, 1);
      x.fillRect(fx - 1, fy, 1, 1); x.fillRect(fx + 1, fy, 1, 1);
      x.fillRect(fx, fy - 1, 1, 1); x.fillRect(fx, fy + 1, 1, 1);
      x.fillStyle = '#f6da79'; x.fillRect(fx, fy, 1, 1);
    }
    return t;
  })();
  tiles[T.LAVAROCK] = speckleTile('#3d3742', ['#2a2530', '#544b58', '#7a1a10'], 141, 18);

  // ---- Stage 1 farm fields ----
  tiles[T.SOIL] = cropTile(161);
  tiles[T.CABBAGE] = cropTile(171, (px, by, alt) => {
    // two fat heads per band, the second band staggered half a plant
    for (const hx of alt ? [4, 12] : [0, 8]) {
      px(hx + 1, by + 6, 6, 1, '#3e2a1a');                 // shadow on the soil
      px(hx + 2, by + 1, 4, 1, '#2f6e2c');
      px(hx + 1, by + 2, 6, 3, '#2f6e2c');                 // outer leaves
      px(hx + 2, by + 5, 4, 1, '#2f6e2c');
      px(hx + 2, by + 2, 4, 3, '#78bf55');                 // head
      px(hx + 2, by + 2, 2, 1, '#b8e68a');                 // top-left light
      px(hx + 5, by + 4, 1, 1, '#4f9a3f');
    }
  });
  tiles[T.LETTUCE] = cropTile(181, (px, by, alt) => {
    // frilly heads, green and red-leaf planted in alternating rows
    const [o, m, h] = alt ? ['#5a2238', '#9a3a5c', '#c8628a'] : ['#3e9440', '#8fdc62', '#c8f29a'];
    for (const hx of alt ? [4, 12] : [0, 8]) {
      px(hx + 1, by + 6, 6, 1, '#3e2a1a');
      px(hx + 1, by + 1, 1, 1, o); px(hx + 3, by + 1, 2, 1, o); px(hx + 6, by + 1, 1, 1, o);
      px(hx + 1, by + 2, 6, 3, o);
      px(hx + 2, by + 5, 4, 1, o);
      px(hx + 2, by + 2, 4, 2, m); px(hx + 3, by + 4, 2, 1, m);
      px(hx + 2, by + 2, 1, 1, h); px(hx + 4, by + 2, 1, 1, h);
    }
  });
  tiles[T.CARROT] = cropTile(191, (px, by, alt) => {
    // feathery tops every 4px with orange shoulders poking out of the ridge
    for (let i = 0; i < 4; i++) {
      const x = i * 4 + (alt ? 2 : 0);
      px(x + 1, by + 5, 2, 1, '#e8782a'); px(x + 1, by + 5, 1, 1, '#f6a24a');
      px(x + 1, by + 3, 1, 2, '#3e9440'); px(x + 2, by + 2, 1, 3, '#2c6e30');
      px(x, by + 2, 1, 1, '#5cb85a'); px(x + 3, by + 1, 1, 1, '#5cb85a');
      px(x + 1, by + 1, 1, 1, '#77c862');
    }
  });
  tiles[T.PUMPKIN] = (() => {
    const t = cropTile(201);
    const x = t.getContext('2d');
    const px = (a, b, w, h, col) => {
      x.fillStyle = col;
      for (const ox of [-TILE, 0, TILE]) for (const oy of [-TILE, 0, TILE]) x.fillRect(a + ox, b + oy, w, h);
    };
    // winding vine + leaves, then two ribbed pumpkins on a diagonal
    for (let i = 0; i < 16; i++) px(i, 3 + Math.round(Math.sin(i * 0.8) * 1.5), 1, 1, '#2c6e30');
    for (let i = 0; i < 16; i++) px(i, 11 + Math.round(Math.cos(i * 0.7) * 1.5), 1, 1, '#2c6e30');
    for (const [lx, ly] of [[5, 1], [13, 5], [1, 9], [9, 13]]) {
      px(lx, ly, 3, 2, '#3e9440'); px(lx, ly, 1, 1, '#5cb85a');
    }
    for (const [ox, oy] of [[8, 4], [0, 12]]) {
      px(ox + 3, oy - 1, 1, 1, '#5c3d22');                  // stem
      px(ox + 1, oy, 5, 1, '#7a3a10');
      px(ox, oy + 1, 7, 3, '#7a3a10');
      px(ox + 1, oy + 4, 5, 1, '#7a3a10');
      px(ox + 1, oy + 1, 5, 3, '#e8781e');
      px(ox + 2, oy + 1, 1, 3, '#c45a12'); px(ox + 4, oy + 1, 1, 3, '#c45a12');   // ribs
      px(ox + 1, oy + 1, 1, 1, '#f6a24a');
    }
    return t;
  })();
  tiles[T.WHEAT] = (() => {
    const [c, ctx] = canvas(TILE, TILE);
    ctx.fillStyle = '#c29a44'; ctx.fillRect(0, 0, TILE, TILE);
    const rnd = mulberry(211);
    // a dense mat of stalks in gold shades
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = ['#d0aa52', '#a8822f', '#dcb75e', '#9a7430'][Math.floor(rnd() * 4)];
      ctx.fillRect(Math.floor(rnd() * TILE), Math.floor(rnd() * 15), 1, 2);
    }
    // each row: a shadowed furrow line and a crest of bright grain heads
    for (const by of [0, 8]) {
      ctx.fillStyle = '#86652a'; ctx.fillRect(0, by + 7, TILE, 1);
      for (let x = 0; x < TILE; x++) {
        const y = by + 1 + ((x * 5) % 3);
        ctx.fillStyle = x % 2 ? '#f2d680' : '#e6c064';
        ctx.fillRect(x, y, 1, 2);
        if (x % 3 === 0) { ctx.fillStyle = '#fbe9a8'; ctx.fillRect(x, y, 1, 1); }
      }
    }
    return c;
  })();
  tiles[T.FOREST] = speckleTile('#1a3a1f', ['#12301a', '#224a27', '#2b5a2d', '#0f2615'], 221, 24);
  // packed dirt road; two variants mixed by the map so no pebble pattern repeats
  const roadDirt = (seed, pebbles) => {
    const t = speckleTile('#a07a4c', ['#b58c5a', '#8a6640', '#c49c68', '#94704a'], seed, 26);
    const x = t.getContext('2d');
    const rnd = mulberry(seed + 2);
    for (let i = 0; i < pebbles; i++) {    // a pebble with a lit top
      const px = 1 + Math.floor(rnd() * 13), py = 1 + Math.floor(rnd() * 13);
      x.fillStyle = '#6e6a62'; x.fillRect(px, py + 1, 2, 1);
      x.fillStyle = '#b4afa4'; x.fillRect(px, py, 2, 1);
    }
    return t;
  };
  tiles[T.ROAD_DIRT] = roadDirt(231, 0);
  tiles[T.ROAD_DIRT2] = roadDirt(251, 0);
  tiles[T.MEADOW] = (() => {
    const t = speckleTile('#4a9a42', ['#419039', '#54a345', '#3b8034'], 241, 11);
    const x = t.getContext('2d');
    const rnd = mulberry(243);
    for (const col of ['#eef1f7', '#f6da79', '#eef1f7']) {
      x.fillStyle = col;
      x.fillRect(1 + Math.floor(rnd() * 14), 1 + Math.floor(rnd() * 14), 1, 1);
    }
    return t;
  })();
  // Placeholders for the Maple Street PNG road tiles — overwritten in main.js
  // once pngProps loads; kept as plain asphalt so a load failure still renders.
  for (const id of [T.ROAD_PNG, T.CROSSWALK_H, T.CROSSWALK_V, T.LANE_H, T.LANE_V, T.MANHOLE, T.DRAIN])
    tiles[id] = tiles[T.ASPHALT];
  return tiles;
}

/* ============================ PROPS ============================ */
// Each prop: img canvas, footprint solid box (px, relative to img top-left),
// jumpable (can be vaulted), hide (aliens can hide behind/inside),
// tall (draws over actors when behind).

function propCanvas(w, h, draw) {
  const [c, ctx] = canvas(w, h);
  const px = (x, y, ww, hh, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, ww, hh); };
  // outlined box: ink border with inset fill
  const box = (x, y, ww, hh, fill, ink = C.ink) => { px(x, y, ww, hh, ink); px(x + 1, y + 1, ww - 2, hh - 2, fill); };
  // filled + outlined organic blob from per-row [x0,x1] spans starting at y0
  const blob = (spans, y0, fill, ink = C.ink) => {
    spans.forEach((s, i) => px(s[0] - 1, y0 + i, s[1] - s[0] + 3, 1, ink));
    px(spans[0][0], y0 - 1, spans[0][1] - spans[0][0] + 1, 1, ink);
    const last = spans[spans.length - 1];
    px(last[0], y0 + spans.length, last[1] - last[0] + 1, 1, ink);
    spans.forEach((s, i) => px(s[0], y0 + i, s[1] - s[0] + 1, 1, fill));
  };
  draw(px, ctx, box, blob);
  return c;
}

export function buildProps() {
  const p = {};

  // ---- Playground ----
  p.tree = {
    img: propCanvas(30, 34, (px, ctx, box, blob) => {
      // trunk drawn tall (up into the canopy) so the blob painted after it
      // covers the top and the visible stub connects with no gap
      px(13, 14, 4, 19, C.wd1); px(13, 14, 1, 19, C.wd2); px(16, 14, 1, 19, C.wd0);
      px(12, 32, 6, 2, C.wd0);
      const spans = [
        [12, 17], [9, 20], [7, 22], [5, 24], [4, 25], [4, 25], [3, 26], [3, 26],
        [3, 26], [3, 26], [4, 25], [4, 25], [5, 24], [6, 23], [8, 21], [11, 18],
      ];
      blob(spans, 3, C.lf2);
      // core shadow bottom-right
      px(15, 12, 11, 6, C.lf1); px(17, 16, 8, 2, C.lf0);
      // highlight clusters top-left
      px(7, 5, 8, 3, C.lf3); px(8, 5, 5, 2, C.lf4);
      px(6, 9, 4, 3, C.lf3); px(12, 8, 4, 2, C.lf4);
      px(9, 6, 2, 1, C.lf5);
    }),
    solid: { x: 12, y: 26, w: 6, h: 6 }, jumpable: false, hide: true, tall: true,
  };

  p.bush = {
    img: propCanvas(20, 14, (px, ctx, box, blob) => {
      const spans = [[6, 13], [3, 16], [2, 17], [1, 18], [1, 18], [2, 17], [4, 15], [7, 12]];
      blob(spans, 3, C.lf2);
      px(9, 9, 8, 3, C.lf1); px(11, 11, 5, 1, C.lf0);
      px(3, 5, 6, 2, C.lf3); px(4, 5, 3, 1, C.lf4);
      px(12, 6, 3, 1, C.lf4);
    }),
    solid: { x: 2, y: 6, w: 16, h: 7 }, jumpable: true, hide: true, tall: false,
  };

  p.slide = {
    img: propCanvas(40, 30, (px, ctx, box) => {
      // support legs (metal)
      px(6, 12, 2, 16, C.mt1); px(13, 12, 2, 16, C.mt1);
      px(31, 18, 2, 10, C.mt1); px(24, 20, 2, 8, C.mt1);
      px(6, 12, 1, 16, C.mt2); px(31, 18, 1, 10, C.mt2);
      // climb tower (red) with roof
      box(4, 4, 14, 12, C.rd2);
      px(5, 5, 12, 2, C.rd3);              // top highlight
      px(5, 13, 12, 2, C.rd0);             // lower shade
      px(3, 1, 16, 4, C.rd1);              // canopy roof
      px(3, 1, 16, 1, C.rd3);
      // tube mouth
      box(6, 6, 8, 7, '#101018');
      px(7, 7, 6, 5, C.gl0);
      // slide chute sweeping down to the right (gold)
      px(15, 8, 4, 3, C.gd1);
      px(17, 10, 5, 3, C.gd1);
      px(20, 12, 5, 3, C.gd1);
      px(23, 14, 6, 4, C.gd1);
      px(27, 17, 6, 4, C.gd1);
      // chute rails (highlight) + shaded underside
      px(15, 8, 4, 1, C.gd3); px(17, 10, 5, 1, C.gd3); px(20, 12, 5, 1, C.gd3);
      px(23, 14, 6, 1, C.gd3); px(27, 17, 6, 1, C.gd3);
      px(23, 17, 6, 1, C.gd0); px(27, 20, 6, 1, C.gd0);
      // outline strokes
      px(3, 0, 16, 1, C.ink); px(3, 5, 1, 11, C.ink); px(18, 5, 1, 11, C.ink);
    }),
    solid: { x: 3, y: 10, w: 15, h: 16 }, jumpable: false, hide: true, tall: true,
  };

  p.swing = {
    img: propCanvas(36, 24, (px, ctx, box) => {
      // A-frame legs (steel)
      px(2, 3, 3, 19, C.mt2); px(4, 3, 1, 19, C.mt1);
      px(31, 3, 3, 19, C.mt2); px(33, 3, 1, 19, C.mt1);
      px(8, 20, 3, 2, C.mt1); px(25, 20, 3, 2, C.mt1);   // feet
      // top beam
      px(2, 1, 32, 3, C.mt3); px(2, 1, 32, 1, C.mt4); px(2, 3, 32, 1, C.mt1);
      // chains
      px(11, 4, 1, 10, C.mt4); px(15, 4, 1, 10, C.mt4);
      px(21, 4, 1, 11, C.mt4); px(25, 4, 1, 11, C.mt4);
      // seats
      px(10, 14, 7, 2, C.rd2); px(10, 14, 7, 1, C.rd3);
      px(20, 15, 7, 2, C.bl1); px(20, 15, 7, 1, C.bl2);
    }),
    solid: { x: 1, y: 16, w: 5, h: 7 }, jumpable: false, hide: false, tall: true,
    extraSolids: [{ x: 30, y: 16, w: 5, h: 7 }],
  };

  p.sandbox = {
    img: propCanvas(36, 26, (px, ctx, box) => {
      box(0, 0, 36, 26, C.wd2);            // wooden frame
      px(1, 1, 34, 1, C.wd4);
      px(3, 3, 30, 20, '#e2ca83');         // sand
      px(3, 3, 30, 1, '#eed9a0');
      px(3, 21, 30, 2, '#d0b673');
      // sand mounds / dimples
      px(8, 8, 5, 2, '#d3b972'); px(21, 14, 6, 2, '#d3b972'); px(13, 18, 4, 1, '#eed9a0');
      // toy bucket + shovel
      box(25, 4, 6, 5, C.rd2); px(26, 3, 4, 1, C.rd3);
      px(20, 5, 5, 1, C.gd2); px(24, 3, 1, 3, C.gd2);
    }),
    solid: null, jumpable: false, hide: true, tall: false,
  };

  p.junglegym = {
    img: propCanvas(38, 28, (px, ctx, box) => {
      const bar = C.mt2, hi = C.mt4, sh = C.mt1;
      // verticals
      for (let i = 0; i < 4; i++) { px(4 + i * 10, 4, 2, 22, bar); px(4 + i * 10, 4, 1, 22, hi); }
      // horizontals
      px(3, 4, 32, 2, bar); px(3, 4, 32, 1, hi);
      px(3, 13, 32, 2, bar); px(3, 13, 32, 1, hi);
      px(3, 22, 32, 2, sh);
      // diagonals suggested with stagger + coloured grips
      px(9, 7, 2, 4, C.rd2); px(25, 15, 2, 4, C.gd2); px(15, 16, 2, 4, C.bl2);
    }),
    solid: { x: 2, y: 18, w: 34, h: 8 }, jumpable: true, hide: true, tall: true,
  };

  p.bench = {
    img: propCanvas(24, 12, (px, ctx, box) => {
      px(2, 0, 20, 2, C.wd3); px(2, 0, 20, 1, C.wd4);   // backrest slat
      box(1, 4, 22, 4, C.wd3);                          // seat
      px(2, 5, 20, 1, C.wd4); px(2, 6, 20, 1, C.wd1);
      px(3, 2, 1, 2, C.wd2); px(20, 2, 1, 2, C.wd2);    // back posts
      px(2, 8, 3, 4, C.mt1); px(19, 8, 3, 4, C.mt1);    // legs
    }),
    solid: { x: 1, y: 4, w: 22, h: 7 }, jumpable: true, hide: false, tall: false,
  };

  // ---- Fences (shared wood) ----
  p.fenceH = {
    img: propCanvas(16, 10, (px) => {
      px(0, 2, 16, 2, C.wd2); px(0, 2, 16, 1, C.wd4);
      px(0, 6, 16, 2, C.wd2); px(0, 6, 16, 1, C.wd4);
      px(1, 0, 2, 10, C.wd1); px(13, 0, 2, 10, C.wd1);
      px(1, 0, 1, 10, C.wd3); px(13, 0, 1, 10, C.wd3);
    }),
    solid: { x: 0, y: 2, w: 16, h: 6 }, jumpable: true, hide: false, tall: false,
  };

  p.fenceV = {
    img: propCanvas(8, 16, (px) => {
      px(3, 0, 2, 16, C.wd1); px(3, 0, 1, 16, C.wd3);
      px(1, 2, 6, 2, C.wd2); px(1, 2, 6, 1, C.wd4);
      px(1, 11, 6, 2, C.wd2); px(1, 11, 6, 1, C.wd4);
    }),
    solid: { x: 2, y: 0, w: 4, h: 16 }, jumpable: true, hide: false, tall: false,
  };

  // ---- Farm ----
  p.hay = {
    img: propCanvas(22, 18, (px, ctx, box) => {
      box(1, 1, 20, 16, C.gd1);            // bale body
      px(2, 2, 18, 2, C.gd2);              // top-lit
      px(2, 14, 18, 2, C.gd0);             // base shade
      // binding twine + straw strands
      px(6, 2, 1, 14, C.gd0); px(15, 2, 1, 14, C.gd0);
      px(2, 6, 18, 1, C.gd2); px(2, 10, 18, 1, C.gd2);
      px(9, 4, 3, 1, C.gd3); px(4, 9, 3, 1, C.gd3); px(14, 12, 3, 1, C.gd3);
    }),
    solid: { x: 2, y: 6, w: 18, h: 11 }, jumpable: true, hide: true, tall: false,
  };

  p.barn = {
    img: propCanvas(76, 62, (px, ctx, box) => {
      // gambrel roof
      px(4, 4, 68, 6, C.rd0);
      px(0, 10, 76, 8, C.rd1);
      px(0, 10, 76, 2, C.rd2);             // roof top-light
      px(0, 16, 76, 2, C.rd0);
      px(34, 4, 8, 6, C.wd3); px(35, 2, 6, 4, C.wd4);   // cupola
      px(37, 3, 2, 2, C.ink);
      // walls
      box(3, 18, 70, 42, C.rd1);
      px(4, 19, 68, 3, C.rd2);             // wall top-light
      px(4, 55, 68, 4, C.rd0);             // base shade
      // plank lines
      for (let i = 1; i < 8; i++) px(4, 19 + i * 5, 68, 1, C.rd0);
      // big barn doors with white X-brace
      box(29, 34, 18, 25, C.wd1);
      px(30, 35, 16, 1, C.wd3);
      px(37, 35, 2, 23, C.wd2);            // centre seam
      px(30, 35, 16, 2, '#d8cdb8'); px(31, 45, 14, 1, '#d8cdb8'); // trim + brace
      // hay-loft window
      box(34, 22, 8, 8, C.wd1); px(35, 23, 6, 3, C.gd2); px(35, 26, 6, 3, C.gd1);
      // side windows
      box(10, 30, 11, 9, '#26303e'); px(11, 31, 9, 3, C.gl1); px(11, 34, 9, 4, C.gl0);
      box(55, 30, 11, 9, '#26303e'); px(56, 31, 9, 3, C.gl1); px(56, 34, 9, 4, C.gl0);
    }),
    solid: { x: 3, y: 24, w: 70, h: 34 }, jumpable: false, hide: false, tall: true,
    door: { x: 30, y: 50, w: 16, h: 10 },
  };

  p.silo = {
    img: propCanvas(26, 52, (px, ctx, box) => {
      // domed cap
      px(6, 0, 14, 3, C.mt3); px(8, 0, 10, 1, C.mt4);
      px(4, 3, 18, 3, C.mt2);
      // cylinder body with vertical light ramp
      box(3, 6, 20, 44, C.mt3);
      px(4, 7, 5, 42, C.mt4);              // left highlight
      px(9, 7, 8, 42, C.mt3);
      px(17, 7, 5, 42, C.mt2);             // right shade
      px(20, 7, 2, 42, C.mt1);
      // corrugation bands
      for (let y = 12; y < 48; y += 7) px(4, y, 18, 1, C.mt1);
      // access ladder
      px(12, 8, 2, 40, C.mt1);
      for (let y = 10; y < 46; y += 4) px(11, y, 4, 1, C.mt4);
    }),
    solid: { x: 4, y: 30, w: 18, h: 20 }, jumpable: false, hide: false, tall: true,
  };

  p.tractor = {
    img: propCanvas(34, 26, (px, ctx, box) => {
      // big rear wheel
      px(2, 10, 14, 14, C.ink); px(3, 11, 12, 12, '#1c1c24');
      px(6, 14, 6, 6, C.mt2); px(7, 15, 4, 4, C.mt4);   // hub
      // small front wheel
      px(24, 16, 8, 8, C.ink); px(25, 17, 6, 6, '#1c1c24');
      px(26, 18, 4, 4, C.mt2); px(27, 19, 2, 2, C.mt4);
      // body / hood
      box(14, 12, 18, 8, C.gr1);
      px(15, 13, 16, 1, C.gr3); px(15, 18, 16, 1, C.gr0);
      px(28, 13, 4, 6, C.gr0);             // engine cowl
      px(31, 8, 2, 5, C.mt1);              // exhaust stack
      // cab
      box(4, 3, 14, 11, C.gr1);
      px(5, 4, 12, 1, C.gr3);
      px(6, 5, 10, 6, C.gl1); px(6, 5, 10, 1, C.gl2); px(6, 9, 10, 2, C.gl0); // glass
      px(4, 12, 14, 2, C.gr0);
    }),
    solid: { x: 2, y: 12, w: 30, h: 13 }, jumpable: false, hide: true, tall: false,
  };

  // Scarecrow, with the shirt as a palette so Stage 1 can scatter a few
  // different ones (plaid, denim, one with a crow sat on its arm).
  const scarecrow = (shirt, hi, lo, { plaid = false, crow = false } = {}) => ({
    img: propCanvas(18, 26, (px, ctx, box) => {
      px(8, 6, 2, 18, C.wd1); px(8, 6, 1, 18, C.wd3);   // post
      px(2, 9, 14, 2, C.wd1); px(2, 9, 14, 1, C.wd3);   // cross-arm
      // straw poking out of sleeves
      px(1, 9, 2, 2, C.gd2); px(15, 9, 2, 2, C.gd2);
      // burlap shirt
      box(4, 10, 10, 9, shirt);
      px(5, 11, 8, 1, hi); px(5, 17, 8, 1, lo);
      if (plaid) { px(7, 11, 1, 7, lo); px(10, 11, 1, 7, lo); px(5, 15, 8, 1, lo); }
      px(6, 13, 6, 1, C.gd1);              // rope belt / patch
      // head (burlap sack)
      box(6, 2, 6, 6, '#d9c088');
      px(7, 4, 1, 1, C.ink); px(10, 4, 1, 1, C.ink);    // stitched eyes
      px(8, 6, 2, 1, C.ink);               // mouth
      // straw hat
      px(3, 1, 12, 2, C.gd1); px(3, 1, 12, 1, C.gd2);
      px(6, 0, 6, 1, C.gd0);
      if (crow) {
        px(13, 6, 3, 3, C.ink); px(12, 7, 1, 1, C.ink);   // body + tail
        px(16, 7, 1, 1, C.gd2);            // beak
        px(14, 6, 1, 1, '#e8ecf4');        // eye glint
      }
    }),
    solid: { x: 7, y: 18, w: 4, h: 6 }, jumpable: false, hide: false, tall: true,
  });
  p.scarecrow = scarecrow('#7a4aa0', '#9366c0', '#5e3382');
  p.scarecrowRed = scarecrow(C.rd2, C.rd3, C.rd0, { plaid: true, crow: true });
  p.scarecrowBlue = scarecrow(C.bl1, C.bl2, C.bl0, { plaid: false });

  p.coop = {
    img: propCanvas(30, 24, (px, ctx, box) => {
      // pitched roof
      px(1, 2, 28, 3, C.wd1); px(3, 0, 24, 2, C.wd2);
      px(1, 2, 28, 1, C.wd3);
      // body
      box(2, 5, 26, 17, C.wd3);
      px(3, 6, 24, 2, C.wd4); px(3, 19, 24, 2, C.wd1);
      // entrance hole + ramp
      box(11, 11, 8, 11, '#2a1c10');
      px(12, 21, 10, 2, C.wd2); px(12, 21, 10, 1, C.wd4);   // ramp
      for (let i = 0; i < 3; i++) px(13 + i * 3, 21, 1, 2, C.wd1); // ramp rungs
      // window
      box(5, 10, 5, 5, '#26303e'); px(6, 11, 3, 3, C.gl1);
    }),
    solid: { x: 2, y: 10, w: 26, h: 12 }, jumpable: false, hide: true, tall: false,
  };

  // ---- Shipyard ----
  const container = (main, shade, light) => propCanvas(52, 30, (px, ctx, box) => {
    box(0, 2, 52, 27, main);
    px(1, 3, 50, 3, light);                // top-lit lip
    px(1, 25, 50, 3, shade);               // base shadow
    // corrugation
    for (let i = 0; i < 12; i++) { px(3 + i * 4, 6, 1, 20, light); px(4 + i * 4, 6, 2, 20, shade); }
    // corner castings + door bars
    px(0, 2, 3, 27, C.mt1); px(49, 2, 3, 27, C.mt1);
    px(45, 6, 1, 20, C.mt2); px(47, 6, 1, 20, C.mt2);
    px(1, 2, 50, 1, C.ink); px(1, 28, 50, 1, C.ink);
  });
  p.containerR = { img: container(C.rd1, C.rd0, C.rd2), solid: { x: 1, y: 8, w: 50, h: 21 }, jumpable: false, hide: false, tall: true };
  p.containerB = { img: container(C.bl1, C.bl0, C.bl2), solid: { x: 1, y: 8, w: 50, h: 21 }, jumpable: false, hide: false, tall: true };
  p.containerG = { img: container(C.gr1, C.gr0, C.gr2), solid: { x: 1, y: 8, w: 50, h: 21 }, jumpable: false, hide: false, tall: true };

  p.containerOpen = {
    img: propCanvas(52, 30, (px, ctx, box) => {
      box(0, 2, 52, 27, C.gd1);
      px(1, 3, 39, 3, C.gd2);
      px(1, 25, 39, 3, C.gd0);
      for (let i = 0; i < 9; i++) { px(3 + i * 4, 6, 1, 20, C.gd2); px(4 + i * 4, 6, 2, 20, C.gd0); }
      px(0, 2, 3, 27, C.mt1);
      // open end — dark interior (hide inside)
      px(38, 3, 13, 24, '#0d0f14');
      px(40, 5, 9, 20, '#05070b');
      px(38, 3, 1, 24, C.mt2);             // door edge catching light
    }),
    solid: { x: 1, y: 8, w: 38, h: 21 }, jumpable: false, hide: true, tall: true,
  };

  p.crate = {
    img: propCanvas(16, 16, (px, ctx, box) => {
      box(0, 0, 16, 16, C.wd3);
      px(1, 1, 14, 2, C.wd4);              // top-lit
      px(1, 13, 14, 2, C.wd1);             // base shade
      // X brace + frame
      px(1, 1, 2, 14, C.wd4); px(13, 1, 2, 14, C.wd1);
      px(2, 2, 12, 1, C.wd2); px(2, 13, 12, 1, C.wd2);
      px(3, 3, 1, 1, C.wd2); px(12, 3, 1, 1, C.wd2);
      px(3, 12, 1, 1, C.wd2); px(12, 12, 1, 1, C.wd2);
    }),
    solid: { x: 1, y: 4, w: 14, h: 11 }, jumpable: true, hide: true, tall: false,
  };

  p.barrel = {
    img: propCanvas(12, 14, (px, ctx, box) => {
      box(1, 1, 10, 12, C.bl1);
      px(2, 1, 3, 12, C.bl2);              // left highlight
      px(8, 1, 2, 12, C.bl0);              // right shade
      px(2, 2, 8, 1, C.bl3);               // top rim
      px(2, 4, 8, 1, C.mt2); px(2, 8, 8, 1, C.mt2);   // steel bands
    }),
    solid: { x: 2, y: 5, w: 8, h: 8 }, jumpable: true, hide: false, tall: false,
  };

  p.pallet = {
    img: propCanvas(20, 14, (px) => {
      px(0, 0, 20, 14, C.wd2);
      // deck boards with gaps
      px(0, 1, 20, 3, C.wd3); px(0, 6, 20, 3, C.wd3); px(0, 11, 20, 3, C.wd3);
      px(0, 1, 20, 1, C.wd4); px(0, 6, 20, 1, C.wd4); px(0, 11, 20, 1, C.wd4);
      // stringers (verticals, darker)
      px(1, 0, 2, 14, C.wd1); px(9, 0, 2, 14, C.wd1); px(17, 0, 2, 14, C.wd1);
    }),
    solid: null, jumpable: false, hide: false, tall: false,
  };

  p.crane = {
    img: propCanvas(24, 60, (px, ctx, box) => {
      // lattice mast
      box(8, 8, 8, 50, C.gd1);
      px(9, 9, 2, 48, C.gd2);              // left highlight
      px(14, 9, 1, 48, C.gd0);             // right shade
      for (let y = 12; y < 56; y += 5) px(9, y, 6, 1, C.gd0);   // lattice rungs
      px(9, 12, 6, 1, C.gd0);
      // counter-jib + jib beam across the top
      box(0, 2, 24, 6, C.gd1);
      px(1, 3, 22, 1, C.gd3);
      px(1, 6, 22, 1, C.gd0);
      // operator cab
      box(9, 8, 7, 6, C.mt2); px(10, 9, 5, 3, C.gl1);
      // hoist cable + hook
      px(20, 8, 1, 16, C.mt4);
      box(18, 22, 5, 4, C.mt2); px(20, 26, 1, 3, C.mt3);
      // base
      px(5, 54, 14, 5, C.mt1); px(5, 54, 14, 1, C.mt3);
    }),
    solid: { x: 6, y: 50, w: 12, h: 9 }, jumpable: false, hide: false, tall: true,
  };

  p.boat = {
    img: propCanvas(56, 24, (px, ctx, box) => {
      // hull
      px(2, 6, 52, 2, C.ink);
      px(3, 8, 50, 10, C.wd2);
      px(6, 18, 44, 3, C.wd1);             // waterline shade
      px(3, 8, 50, 2, C.wd4);              // gunwale top-light
      px(2, 6, 6, 12, C.ink); px(48, 6, 6, 12, C.ink);   // bow/stern caps
      px(4, 8, 4, 9, C.wd3); px(48, 8, 4, 9, C.wd1);
      // deck opening
      px(20, 10, 16, 5, '#3a2818');
      // cabin
      box(30, 4, 12, 8, C.mt3); px(31, 5, 10, 3, C.gl1); px(31, 8, 10, 2, C.gl0);
      // mast + furled sail
      px(22, 1, 2, 10, C.wd3);
      px(15, 3, 8, 5, '#e6e2d6'); px(15, 3, 8, 1, '#f4f1e8'); px(15, 7, 8, 1, '#c8c3b4');
    }),
    solid: { x: 4, y: 8, w: 48, h: 13 }, jumpable: false, hide: true, tall: false,
  };

  // ---- Shared street props ----
  p.rock = {
    img: propCanvas(16, 12, (px, ctx, box, blob) => {
      const spans = [[3, 12], [2, 13], [1, 14], [2, 13], [3, 12]];
      blob(spans, 2, C.mt2);
      px(3, 3, 5, 2, C.mt4);               // top-left facet
      px(9, 6, 4, 3, C.mt1);               // shadow facet
      px(4, 4, 2, 1, C.mt5);
    }),
    solid: { x: 3, y: 5, w: 10, h: 6 }, jumpable: true, hide: false, tall: false,
  };

  p.lamppost = {
    img: propCanvas(10, 30, (px, ctx, box) => {
      px(4, 5, 2, 24, C.mt2); px(4, 5, 1, 24, C.mt3);   // post
      px(3, 27, 4, 2, C.mt1);              // base
      box(2, 0, 6, 6, C.mt1);              // lantern housing
      px(3, 1, 4, 4, C.glow); px(3, 1, 4, 1, '#fff0b8');
      px(3, 5, 4, 1, C.mt3);
    }),
    solid: { x: 3, y: 24, w: 4, h: 5 }, jumpable: false, hide: false, tall: true,
  };

  p.dumpster = {
    img: propCanvas(26, 18, (px, ctx, box) => {
      // lid
      px(0, 2, 26, 3, C.gr0); px(1, 2, 24, 1, C.gr2);
      // body (angled: wider at top)
      box(1, 5, 24, 11, C.gr1);
      px(2, 6, 22, 2, C.gr2);              // top-lit
      px(2, 13, 22, 2, C.gr0);             // base shade
      px(4, 9, 18, 1, C.gr0);              // ridge line
      // caster wheels
      px(2, 16, 4, 2, '#0c0d12'); px(20, 16, 4, 2, '#0c0d12');
    }),
    solid: { x: 2, y: 6, w: 22, h: 11 }, jumpable: true, hide: true, tall: false,
  };

  /* ---- Neighborhood ---- */
  // Suburban house. `windows` (relative rects) are read by the map so the
  // stealth system can light them up when the neighbours get suspicious.
  const house = (rD, rM, rH, w0, w1, w2, door) => ({
    img: propCanvas(64, 54, (px, ctx, box) => {
      // pitched roof
      box(2, 2, 60, 19, rM);
      px(3, 3, 58, 2, rH);                 // ridge highlight
      px(3, 18, 58, 2, rD);                // eave shadow
      for (const y of [7, 11, 15]) px(3, y, 58, 1, rD);   // shingle rows
      px(27, 0, 10, 3, rD);                // gable cap
      box(48, 0, 8, 9, C.br1); px(49, 0, 6, 2, C.br2);    // chimney
      // wall
      box(4, 20, 56, 32, w1);
      px(5, 21, 54, 2, w2);                // top-lit
      px(5, 49, 54, 2, w0);                // base shadow
      // front door + step
      box(28, 35, 10, 17, door);
      px(29, 36, 8, 1, C.wd4); px(35, 44, 1, 2, C.gd2);   // panel + knob
      px(26, 51, 14, 2, C.mt3);            // concrete stoop
      // windows (with muntins)
      for (const wx of [9, 41]) {
        box(wx, 26, 14, 11, C.mt1);
        px(wx + 1, 27, 12, 9, C.gl1); px(wx + 1, 27, 12, 3, C.gl2);
        px(wx + 6, 27, 1, 9, C.mt1); px(wx + 1, 31, 12, 1, C.mt1);
      }
    }),
    solid: { x: 3, y: 24, w: 58, h: 28 }, jumpable: false, hide: false, tall: true,
    windows: [{ x: 10, y: 27, w: 12, h: 9 }, { x: 42, y: 27, w: 12, h: 9 }],
  });
  p.houseCream = house('#7a4a3a', '#a8604a', '#c47a60', C.wl0, C.wl1, C.wl2, C.wd1);
  p.houseTan   = house('#3a5a78', '#4a7098', '#6a90b8', C.wt0, C.wt1, C.wt2, C.wd0);
  p.houseBrick = house('#4a4652', '#666074', '#847e94', C.br0, C.br1, C.br2, '#2a2530');

  const car = (body, bodyHi, bodyLo) => ({
    img: propCanvas(34, 18, (px, ctx, box) => {
      // wheels poking out
      px(3, 0, 6, 2, '#0c0d12'); px(3, 16, 6, 2, '#0c0d12');
      px(24, 0, 6, 2, '#0c0d12'); px(24, 16, 6, 2, '#0c0d12');
      box(1, 2, 32, 14, body);
      px(2, 3, 30, 2, bodyHi);             // roof top-light
      px(2, 13, 30, 2, bodyLo);            // sill shadow
      px(4, 4, 25, 3, C.gl1); px(4, 4, 25, 1, C.gl2);     // windshield (front=right)
      px(4, 10, 25, 3, C.gl0);             // rear glass
      px(3, 7, 28, 3, body);               // roof band
      px(31, 4, 2, 3, C.gd3); px(31, 11, 2, 3, C.rd2);    // head/tail lights
    }),
    solid: { x: 1, y: 2, w: 32, h: 14 }, jumpable: false, hide: true, tall: false,
  });
  p.carRed  = car(C.rd1, C.rd3, C.rd0);
  p.carBlue = car(C.bl1, C.bl3, C.bl0);
  p.carWhite = car('#c8cdd6', '#eef1f7', '#969ca8');

  p.mailbox = {
    img: propCanvas(10, 16, (px, ctx, box) => {
      px(4, 8, 2, 8, C.wd1); px(4, 8, 1, 8, C.wd3);       // post
      box(1, 3, 8, 6, C.mt2); px(2, 4, 6, 1, C.mt4);      // box
      px(2, 6, 5, 1, C.mt1);
      px(8, 4, 1, 3, C.rd2);                              // flag up
    }),
    solid: { x: 3, y: 9, w: 4, h: 6 }, jumpable: false, hide: false, tall: true,
  };

  p.trashcan = {
    img: propCanvas(12, 15, (px, ctx, box) => {
      px(1, 2, 10, 2, C.mt3); px(2, 1, 8, 1, C.mt4);      // lid
      box(2, 4, 8, 10, C.mt2);
      px(3, 5, 6, 1, C.mt4);
      px(3, 7, 6, 1, C.mt1); px(3, 10, 6, 1, C.mt1);      // ridges
    }),
    solid: { x: 2, y: 4, w: 8, h: 10 }, jumpable: false, hide: true, tall: false,
  };

  p.hedge = {
    img: propCanvas(30, 16, (px, ctx, box) => {
      box(0, 2, 30, 13, C.lf2);
      // bumpy top-lit crown
      for (let x = 1; x < 29; x += 4) px(x, 2, 3, 2, C.lf3);
      px(1, 13, 28, 2, C.lf1);             // base shade
      // leaf speckle
      px(5, 6, 2, 1, C.lf4); px(12, 9, 2, 1, C.lf1); px(18, 5, 2, 1, C.lf4);
      px(23, 10, 2, 1, C.lf1); px(9, 11, 2, 1, C.lf1); px(25, 6, 2, 1, C.lf4);
    }),
    solid: { x: 1, y: 4, w: 28, h: 10 }, jumpable: true, hide: true, tall: false,
  };

  /* ---- Tropical island ---- */
  p.volcano = {
    img: propCanvas(120, 96, (px, ctx, box) => {
      // rock cone: rows widen toward the base, lit from the left
      const top = 8, bot = 90, cx = 60;
      for (let y = top; y <= bot; y++) {
        const f = (y - top) / (bot - top);
        const half = Math.round(13 + 44 * f);
        const x0 = cx - half, x1 = cx + half;
        px(x0, y, x1 - x0 + 1, 1, C.vrk2);
        px(x0, y, Math.round(half * 0.7), 1, C.vrk3);          // left-lit slope
        px(cx + Math.round(half * 0.35), y, x1 - (cx + Math.round(half * 0.35)) + 1, 1, C.vrk1); // shade
        px(x0, y, 1, 1, C.ink); px(x1, y, 1, 1, C.ink);        // side outline
      }
      px(47, 7, 26, 1, C.ink);             // crater rim outline
      // crater + glowing lava
      px(46, 6, 28, 5, C.vrk1); px(48, 5, 24, 2, C.vrk3);
      px(50, 8, 20, 4, C.lav1); px(52, 8, 16, 3, C.lav2); px(54, 9, 12, 2, C.lav3);
      // lava spilling down the right flank
      px(60, 11, 3, 12, C.lav1); px(61, 11, 1, 18, C.lav2); px(62, 20, 2, 12, C.lav1);
      px(58, 26, 2, 10, C.lav0);
      // cracks + rubble texture
      px(38, 40, 2, 14, C.vrk0); px(78, 46, 2, 16, C.vrk0);
      px(30, 70, 4, 1, C.vrk3); px(88, 74, 4, 1, C.vrk3);
      // vegetated green skirt along the base
      for (let x = 8; x < 112; x += 9) {
        const yb = 84 + ((x * 7) % 4);
        px(x, yb, 6, 4, C.jg2); px(x + 1, yb, 3, 2, C.jg3);
      }
      px(6, 89, 108, 2, C.jg1);
    }),
    solid: { x: 26, y: 62, w: 68, h: 26 }, jumpable: false, hide: false, tall: true,
    crater: { x: 60, y: 8 },
  };

  p.palm = {
    img: propCanvas(28, 42, (px, ctx, box) => {
      // trunk (leans slightly), with segment notches
      px(12, 16, 3, 22, C.wd2); px(12, 16, 1, 22, C.wd3); px(14, 16, 1, 22, C.wd1);
      for (const y of [22, 27, 32]) px(12, y, 3, 1, C.wd0);
      px(10, 38, 8, 3, C.wd0);             // root flare
      // frond crown radiating from (13,10)
      px(3, 12, 8, 2, C.jg1); px(1, 14, 6, 2, C.jg1);      // left droops
      px(17, 12, 8, 2, C.jg1); px(21, 14, 6, 2, C.jg1);    // right droops
      px(5, 8, 7, 3, C.jg2); px(16, 8, 7, 3, C.jg2);       // mid fronds
      px(9, 3, 4, 6, C.jg3); px(15, 3, 4, 6, C.jg3);       // upright fronds
      px(11, 1, 6, 3, C.jg3); px(12, 0, 4, 2, C.jg4);      // top tuft
      px(12, 2, 1, 5, C.jg4); px(6, 9, 1, 3, C.jg4);       // highlights
      // coconuts
      px(12, 11, 2, 2, C.wd2); px(15, 11, 2, 2, C.wd1);
    }),
    solid: { x: 12, y: 32, w: 5, h: 8 }, jumpable: false, hide: true, tall: true,
  };

  p.fern = {
    img: propCanvas(26, 18, (px) => {
      px(6, 12, 14, 5, C.jg1);             // base clump
      px(2, 10, 4, 5, C.jg2); px(20, 10, 4, 5, C.jg2);     // outer fronds
      px(5, 6, 4, 7, C.jg2); px(17, 6, 4, 7, C.jg2);
      px(9, 3, 3, 10, C.jg3); px(14, 3, 3, 10, C.jg3);     // upright fronds
      px(11, 2, 4, 11, C.jg3);
      px(12, 3, 1, 8, C.jg4); px(6, 7, 1, 4, C.jg4); px(19, 7, 1, 4, C.jg4);
    }),
    solid: { x: 2, y: 8, w: 22, h: 8 }, jumpable: true, hide: true, tall: false,
  };

  p.hut = {
    img: propCanvas(46, 42, (px, ctx, box) => {
      // thatched roof (stacked straw layers)
      px(12, 2, 22, 5, C.gd1); px(6, 6, 34, 5, C.gd1); px(2, 10, 42, 6, C.gd1);
      px(12, 2, 22, 2, C.gd2); px(6, 6, 34, 1, C.gd2); px(2, 10, 42, 1, C.gd2);
      px(2, 14, 42, 2, C.gd0);             // eave shadow
      for (let x = 4; x < 42; x += 3) px(x, 11, 1, 4, C.gd0);   // straw strands
      px(22, 0, 2, 3, C.gd0);              // ridge tuft
      // bamboo walls
      box(6, 16, 34, 24, C.wd2);
      px(7, 17, 32, 2, C.wd3);
      for (let x = 8; x < 39; x += 3) px(x, 18, 1, 21, C.wd1);
      px(7, 37, 32, 2, C.wd0);
      // dark doorway + window
      box(18, 26, 11, 14, '#160f08');
      box(9, 22, 6, 6, '#160f08'); px(10, 23, 4, 2, C.gd1);
    }),
    solid: { x: 5, y: 20, w: 36, h: 18 }, jumpable: false, hide: true, tall: true,
  };

  p.tikitorch = {
    img: propCanvas(10, 28, (px, ctx, box) => {
      px(4, 10, 3, 17, C.wd2); px(4, 10, 1, 17, C.wd3);    // pole
      box(2, 10, 6, 8, C.wd1);                             // carved tiki head
      px(3, 12, 1, 1, C.ink); px(6, 12, 1, 1, C.ink);      // eyes
      px(3, 15, 4, 1, C.ink);                              // mouth
      px(3, 6, 4, 4, C.mt1);                               // fuel bowl
      px(4, 2, 3, 5, C.lav2); px(4, 1, 2, 4, C.lav3); px(5, 0, 1, 2, C.gd3); // flame
    }),
    solid: { x: 4, y: 22, w: 3, h: 5 }, jumpable: false, hide: false, tall: true,
  };

  p.log = {
    img: propCanvas(30, 14, (px, ctx, box) => {
      box(1, 3, 28, 9, C.wd2);
      px(2, 4, 26, 2, C.wd3);              // top-lit
      px(2, 9, 26, 2, C.wd1);              // shade
      box(23, 3, 6, 9, C.wd1);             // sawn end
      px(24, 5, 4, 5, C.wd3); px(25, 6, 2, 3, C.wd2);      // rings
      px(4, 6, 18, 1, C.wd1); px(6, 8, 14, 1, C.wd1);      // bark grain
    }),
    solid: { x: 2, y: 4, w: 26, h: 7 }, jumpable: true, hide: true, tall: false,
  };

  /* ---- Stage 1: farm fields ---- */
  // Conifer for the thick forest that walls the fields in; mixed in with the
  // round deciduous `tree` so the tree line doesn't read as one stamp.
  p.pine = {
    img: propCanvas(22, 36, (px) => {
      px(10, 26, 3, 8, C.wd1); px(10, 26, 1, 8, C.wd2); px(9, 33, 5, 2, C.wd0);   // trunk
      const tiers = [[1, 11, 1, 5], [7, 19, 3, 8], [14, 28, 5, 10]];
      for (const [y0, y1, w0, w1] of tiers) {
        px(11, y0 - 1, 1, 1, '#0b1a14');
        for (let y = y0; y <= y1; y++) {
          const half = Math.round(w0 + (w1 - w0) * (y - y0) / (y1 - y0));
          px(11 - half - 1, y, half * 2 + 3, 1, '#0b1a14');         // ink edge
          px(11 - half, y, half, 1, '#2f664b');                     // lit (left) side
          px(11, y, half + 1, 1, '#1d4436');                        // shade side
        }
        px(11 - w1, y1, w1 * 2 + 1, 1, '#153228');                  // tier underside
        px(11 - Math.round(w1 * 0.6), y1 - 3, 2, 1, '#4d8a63');     // needle highlights
        px(11 - Math.round(w1 * 0.3), y1 - 6, 1, 1, '#4d8a63');
      }
      px(11 - 1, 1, 1, 2, '#4d8a63');
    }),
    solid: { x: 8, y: 27, w: 7, h: 6 }, jumpable: false, hide: false, tall: true,
  };

  // A crashed alien escape pod, tail buried in the dirt, hatch blown off and
  // lying beside it. Shaded from a rotated ellipse so the capsule reads round.
  p.pod = {
    img: (() => {
      const [c, ctx] = canvas(28, 22);
      const px = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
      const cx = 13, cy = 10, rx = 9.5, ry = 5.8, ang = -0.42;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const at = (x, y) => {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
        return (u / rx) ** 2 + (v / ry) ** 2 <= 1 ? { u, v } : null;
      };
      // dirt thrown up round the buried tail
      px(1, 15, 13, 3, '#5c3f27'); px(3, 14, 8, 1, '#5c3f27'); px(2, 18, 10, 1, '#46301e');
      px(3, 14, 3, 1, '#8f673c'); px(1, 15, 2, 1, '#7d5836');
      for (let y = 0; y < 22; y++) {
        for (let x = 0; x < 28; x++) {
          const q = at(x, y);
          if (!q) continue;
          const edge = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
          let col;
          if (edge) col = C.ink;
          else if (q.u < -6.6) col = q.v < 0 ? C.mt2 : C.mt1;                    // thruster collar
          else if (q.u > 1.5 && q.u < 6.2 && q.v < -0.6 && q.v > -4.4) col = q.v < -3.2 ? '#a9f7ee' : C.cy;
          else if (Math.abs(q.u + 2.8) < 0.8) col = q.v < 0 ? '#b98cf5' : '#7a44cf'; // hull band
          else col = q.v < -3.2 ? C.mt5 : q.v < 0 ? C.mt4 : q.v < 3 ? C.mt3 : C.mt2;
          px(x, y, 1, 1, col);
        }
      }
      // re-entry scorching + a torn seam
      px(15, 12, 2, 1, '#4a4452'); px(18, 10, 1, 2, '#4a4452'); px(9, 13, 1, 1, '#4a4452');
      px(4, 16, 3, 1, C.ink);                                         // buried edge
      // the blown hatch, lying on the ground
      px(20, 16, 6, 3, C.ink); px(21, 15, 4, 1, C.ink); px(21, 19, 4, 1, C.ink);
      px(21, 16, 4, 2, C.mt4); px(21, 16, 4, 1, C.mt5); px(22, 18, 2, 1, '#7a44cf');
      return c;
    })(),
    solid: { x: 5, y: 8, w: 16, h: 10 }, jumpable: false, hide: false, tall: true,
  };

  return p;
}

/* ============================ STAGE 1 BUILDERS ============================ */

// Filled pixel disc (no anti-aliasing), for canopies and craters.
function disc(ctx, cx, cy, r, col) {
  ctx.fillStyle = col;
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy) + 0.35);
    ctx.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
}

// One row of tall crops `w` px wide, as a y-sorted prop with no collision:
// actors wade through the rows and the stalks in front of them overlap
// their legs. The row's base (where the stalks meet the soil) is the bottom
// pixel of the image.
const ROW_CACHE = new Map();
export function cropRow(kind, w, seed = 1) {
  const key = `${kind}:${w}:${seed}`;
  if (ROW_CACHE.has(key)) return ROW_CACHE.get(key);
  const rnd = mulberry(seed * 977 + w);
  let def;
  if (kind === 'corn') {
    const H = 18;
    def = {
      img: propCanvas(w, H, (px) => {
        const base = H - 1;
        px(0, base, w, 1, '#3e2a1a');                           // shadow line along the ridge
        for (let x = 1 + Math.floor(rnd() * 3); x < w - 1; x += 4 + (rnd() < 0.3 ? 1 : 0)) {
          const h = 11 + Math.floor(rnd() * 4);
          const top = base - h;
          px(x, top + 2, 1, h - 2, C.lf1);                      // stalk
          px(x, top + 2, 1, Math.round(h * 0.4), C.lf2);
          // three long leaves, alternating sides, drooping at the tips
          let side = rnd() < 0.5 ? -1 : 1;
          for (const f of [0.3, 0.55, 0.8]) {
            const ly = base - Math.round(h * f);
            const lx = side < 0 ? x - 3 : x + 1;
            px(lx, ly, 3, 1, C.lf2);
            px(side < 0 ? x - 3 : x + 3, ly + 1, 1, 1, C.lf1);   // drooping tip
            px(side < 0 ? x - 1 : x + 1, ly, 1, 1, C.lf3);       // lit where it leaves the stalk
            side = -side;
          }
          if (rnd() < 0.55) { px(x + 1, base - Math.round(h * 0.45), 1, 2, C.gd2); }   // ear
          // tassel
          px(x, top, 1, 2, C.gd2); px(x - 1, top + 1, 1, 1, C.gd1); px(x + 1, top + 1, 1, 1, C.gd1);
          px(x, top, 1, 1, C.gd3);
        }
      }),
    };
  } else {
    // sunflowers: taller and sparser, heads turned to face the camera
    const H = 26;
    def = {
      img: propCanvas(w, H, (px) => {
        const base = H - 1;
        for (let x = 3 + Math.floor(rnd() * 3); x < w - 3; x += 7 + Math.floor(rnd() * 3)) {
          const h = 16 + Math.floor(rnd() * 5);
          px(x - 1, base, 3, 1, C.wd0);
          px(x, base - h + 3, 1, h - 3, C.lf1);                 // stalk
          const ly = base - Math.round(h * 0.45);
          px(x - 3, ly, 3, 2, C.lf1); px(x - 3, ly, 2, 1, C.lf3);
          px(x + 1, ly - 3, 3, 2, C.lf1); px(x + 2, ly - 3, 2, 1, C.lf3);
          const hy = base - h;                                  // head, centred on the stalk top
          px(x - 1, hy - 3, 1, 1, C.gd1); px(x + 1, hy - 3, 1, 1, C.gd1);
          px(x - 2, hy - 2, 5, 1, '#f6c83a');
          px(x - 3, hy - 1, 7, 3, '#f6c83a');
          px(x - 2, hy + 2, 5, 1, '#f6c83a');
          px(x - 1, hy + 3, 1, 1, C.gd1); px(x + 1, hy + 3, 1, 1, C.gd1);
          px(x - 2, hy - 2, 2, 1, '#fbe07a');                   // petals catching the light
          px(x - 1, hy - 1, 3, 3, C.wd1); px(x, hy, 1, 1, C.wd0);   // seed disc
          px(x - 1, hy - 1, 1, 1, C.wd2);
        }
      }),
    };
  }
  Object.assign(def, { solid: null, jumpable: false, hide: false, tall: true });
  ROW_CACHE.set(key, def);
  return def;
}

// Paint a dense forest canopy into rect (x, y, w, h) of a ground canvas:
// overlapping crowns, round and pine, drawn back-to-front so the ones lower
// on screen sit in front. It's baked into the ground because nobody can walk
// in there; the tree props along the forest edge do the y-sorting.
export function paintForest(ctx, x, y, w, h, seed = 1) {
  const rnd = mulberry(seed);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 4, y - 4, w + 8, h + 8);
  ctx.clip();
  ctx.fillStyle = '#12301a';
  ctx.fillRect(x, y, w, h);
  const crowns = [];
  for (let cy = y + 4; cy < y + h + 6; cy += 8) {
    for (let cx = x + 3 + ((cy / 8) % 2) * 5; cx < x + w + 6; cx += 10) {
      crowns.push({
        x: Math.round(cx + (rnd() - 0.5) * 6), y: Math.round(cy + (rnd() - 0.5) * 4),
        r: 6 + Math.floor(rnd() * 4), pine: rnd() < 0.32,
      });
    }
  }
  crowns.sort((a, b) => a.y - b.y);
  for (const c of crowns) {
    if (c.pine) {
      // a conifer top seen from above-front: a stepped dark cone
      for (let i = 0; i <= c.r + 2; i++) {
        const half = Math.round(i * 0.75);
        ctx.fillStyle = '#0b1a14'; ctx.fillRect(c.x - half - 1, c.y - c.r + i, half * 2 + 3, 1);
        ctx.fillStyle = '#2f664b'; ctx.fillRect(c.x - half, c.y - c.r + i, half, 1);
        ctx.fillStyle = '#1d4436'; ctx.fillRect(c.x, c.y - c.r + i, half + 1, 1);
      }
      ctx.fillStyle = '#4d8a63'; ctx.fillRect(c.x - 1, c.y - c.r + 2, 1, 2);
    } else {
      disc(ctx, c.x, c.y, c.r + 1, '#0c1f10');                  // outline
      disc(ctx, c.x, c.y, c.r, C.lf0);                          // core shadow
      disc(ctx, c.x - 1, c.y - 1, c.r - 1, C.lf1);
      disc(ctx, c.x - Math.round(c.r * 0.3), c.y - Math.round(c.r * 0.35), Math.round(c.r * 0.55), C.lf2);
      ctx.fillStyle = C.lf3;
      ctx.fillRect(c.x - Math.round(c.r * 0.5), c.y - Math.round(c.r * 0.6), 2, 1);
    }
  }
  ctx.restore();
}

// Burnt, cratered ground where a pod came down: dark core, dithered rim and
// soil thrown out in streaks. Baked into the ground canvas under the pod.
export function scorchDecal(w, h, seed = 1) {
  const [c, ctx] = canvas(w, h);
  const rnd = mulberry(seed);
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot((x + 0.5 - cx) / (w / 2), (y + 0.5 - cy) / (h / 2));
      const ang = Math.atan2(y - cy, x - cx);
      const streak = 0.12 * Math.sin(ang * 7 + seed) + 0.08 * Math.sin(ang * 13 + seed * 2);
      const t = 1 - (d - streak);                                // 1 at the centre, 0 at the rim
      const thr = (B[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
      if (t < 0.05 || t * 1.6 < thr) continue;
      ctx.fillStyle = t > 0.62 ? '#1e1712' : t > 0.38 ? '#2e241c' : t > 0.2 ? '#3e2e20' : '#5a3f27';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // clods of soil flung out past the rim
  for (let i = 0; i < 12; i++) {
    const a = rnd() * Math.PI * 2, r = 0.85 + rnd() * 0.25;
    ctx.fillStyle = rnd() < 0.5 ? '#6b4a2e' : '#4a321f';
    ctx.fillRect(Math.round(cx + Math.cos(a) * r * w / 2), Math.round(cy + Math.sin(a) * r * h / 2), 1, 1);
  }
  return c;
}
