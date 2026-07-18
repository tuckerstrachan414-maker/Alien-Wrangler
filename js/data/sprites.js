// All pixel art is generated at boot from string grids / draw code.
// No external assets — everything renders crisp at integer scale.
//
// ART BIBLE
//  * One light source, top-left. Highlights on top/left faces, core shadow
//    on bottom/right, plus a 1px near-black outline (C.ink) on every object.
//  * Shared material ramps (wood / steel / foliage / etc.) are reused across
//    every prop so the whole set reads like one artist drew it.

export const TILE = 16;

function canvas(w, h) {
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
function mulberry(seed) {
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
const C = {
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
};

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
      px(13, 24, 4, 9, C.wd1); px(13, 24, 1, 9, C.wd2); px(16, 24, 1, 9, C.wd0);
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

  p.scarecrow = {
    img: propCanvas(18, 26, (px, ctx, box) => {
      px(8, 6, 2, 18, C.wd1); px(8, 6, 1, 18, C.wd3);   // post
      px(2, 9, 14, 2, C.wd1); px(2, 9, 14, 1, C.wd3);   // cross-arm
      // straw poking out of sleeves
      px(1, 9, 2, 2, C.gd2); px(15, 9, 2, 2, C.gd2);
      // burlap shirt
      box(4, 10, 10, 9, '#7a4aa0');
      px(5, 11, 8, 1, '#9366c0'); px(5, 17, 8, 1, '#5e3382');
      px(6, 13, 6, 1, C.gd1);              // rope belt / patch
      // head (burlap sack)
      box(6, 2, 6, 6, '#d9c088');
      px(7, 4, 1, 1, C.ink); px(10, 4, 1, 1, C.ink);    // stitched eyes
      px(8, 6, 2, 1, C.ink);               // mouth
      // straw hat
      px(3, 1, 12, 2, C.gd1); px(3, 1, 12, 1, C.gd2);
      px(6, 0, 6, 1, C.gd0);
    }),
    solid: { x: 7, y: 18, w: 4, h: 6 }, jumpable: false, hide: false, tall: true,
  };

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

  return p;
}
