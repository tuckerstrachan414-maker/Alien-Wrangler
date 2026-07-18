// All pixel art is generated at boot from string grids / draw code.
// No external assets — everything renders crisp at integer scale.

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

/* ============================ PLAYER ============================ */

const P = {
  k: '#14141e', // outline / hair
  h: '#2c2c3a', // hair shine
  s: '#f0d5b0', // skin
  S: '#c9a26e', // skin shade
  g: '#dcecff', // lens light
  G: '#7fb3e8', // lens blue
  n: '#1f3d63', // suit navy
  N: '#152a46', // suit dark / pants
  w: '#f2f4f8', // shirt
  t: '#5a3fae', // tie
  b: '#4a2f1d', // shoes
};

const PLAYER_DOWN = [
  '....kkkk....',
  '...kkkkkk...',
  '..kkkkkkkk..',
  '..kkhkkhkk..',
  '..kssssssk..',
  '..kgGkkGgk..',
  '..kssssssk..',
  '...kssSsk...',
  '..nnnwwnnn..',
  '.nnnwttwnnn.',
  '.snnwttwnns.',
  '..NnwttwnN..',
  '...NN..NN...',
  '...NN..NN...',
  '...bb..bb...',
  '............',
];

const PLAYER_UP = [
  '....kkkk....',
  '...kkkkkk...',
  '..kkkkkkkk..',
  '..kkkkkkkk..',
  '..khkkkkhk..',
  '..kkkkkkkk..',
  '..kkkkkkkk..',
  '...kkkkkk...',
  '..nnnnnnnn..',
  '.nnnnNNnnnn.',
  '.snnnNNnnns.',
  '..NnnNNnnN..',
  '...NN..NN...',
  '...NN..NN...',
  '...bb..bb...',
  '............',
];

// Facing right; left is a mirror.
const PLAYER_SIDE = [
  '...kkkkk....',
  '..kkkkkkk...',
  '..kkkkkkkk..',
  '..kkkkkkkk..',
  '..kkkssssk..',
  '..kkskgGgk..',
  '..kkssssss..',
  '...kksssk...',
  '...nnnnnw...',
  '..nnnnnwtk..',
  '..nnnnnwts..',
  '..NnnnnnN...',
  '...NN.NN....',
  '...NN.NN....',
  '...bb.bb....',
  '............',
];

// Lying face-down after a missed dive (horizontal, head to the right)
const PLAYER_PRONE = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '....nnnnnnkkkk..',
  '..bNNnnnnnkkkkk.',
  '..bNNnnnnnksssk.',
  '....nnnnnnkkkk..',
  '......s..s......',
  '................',
];

// Mid-air dive pose (horizontal, arms out, head to the right)
const PLAYER_DIVE = [
  '................',
  '..........ss....',
  '..bNNnnnnnkkkk..',
  '..bNNnnnnnkkkkk.',
  '....nnnnnnksssk.',
  '..........sskk..',
  '................',
];

/* ============================ ALIENS ============================ */

// A = body, B = body shade, e = eye, E = eye shine
const ALIEN_DOWN = [
  '....kk....',
  '..kkAAkk..',
  '.kAAAAAAk.',
  'kAeeAAeeAk',
  'kAEeAAEeAk',
  '.kAAAAAAk.',
  '..kABBAk..',
  '.kAABBAAk.',
  '.kAABBAAk.',
  '..kAAAAk..',
  '..kA..Ak..',
  '..kk..kk..',
];

const ALIEN_UP = [
  '....kk....',
  '..kkAAkk..',
  '.kAAAAAAk.',
  'kAAAAAAAAk',
  'kAAAAAAAAk',
  '.kAAAAAAk.',
  '..kABBAk..',
  '.kAABBAAk.',
  '.kAABBAAk.',
  '..kAAAAk..',
  '..kA..Ak..',
  '..kk..kk..',
];

const ALIEN_SIDE = [
  '....kk....',
  '..kkAAkk..',
  '.kAAAAAAk.',
  '.kAAAeeAk.',
  '.kAAAEeAk.',
  '.kAAAAAAk.',
  '..kABBAk..',
  '..kABBAAk.',
  '..kABBAAk.',
  '..kAAAAk..',
  '...kA.Ak..',
  '...kk.kk..',
];

// Tier body palettes
const ALIEN_TIERS = {
  grunt:   { A: '#7ede63', B: '#54b23f', name: 'Grunt' },
  scout:   { A: '#63c2f0', B: '#3f92c4', name: 'Scout' },
  trooper: { A: '#b9c2cc', B: '#8a95a3', name: 'Trooper' },
  elite:   { A: '#a06df0', B: '#7645c4', name: 'Elite' },
};

const ALIEN_BASE_PAL = { k: '#14141e', e: '#14141e', E: '#e8f6ff' };

// Trooper helmet overlay (metal dome)
const HELMET = [
  '..MMMMMM..',
  '.MMmmmmMM.',
  '.MmmmmmmM.',
];
// Elite visor overlay (sits over the eye rows)
const VISOR = [
  'vVVVVVVVVv',
  'vVVVVVVVVv',
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
    const pal = { ...ALIEN_BASE_PAL, A: tp.A, B: tp.B };
    const down = makeSprite(ALIEN_DOWN, pal);
    const up = makeSprite(ALIEN_UP, pal);
    const right = makeSprite(ALIEN_SIDE, pal);

    // Accessories baked onto copies
    const deco = (src, isUp) => {
      const [c, ctx] = canvas(src.width, src.height);
      ctx.drawImage(src, 0, 0);
      if (tier === 'trooper') {
        const helm = makeSprite(HELMET, { M: '#6b7684', m: '#9aa7b5' });
        ctx.drawImage(helm, 0, 0);
      }
      if (tier === 'elite' && !isUp) {
        const vis = makeSprite(VISOR, { v: '#14141e', V: '#41f0d8' });
        ctx.drawImage(vis, 0, 3);
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
  // Shadow handled by renderer. Van seen from top-3/4, nose to the left.
  px(1, 4, 44, 22, '#14141e');            // outline
  px(2, 5, 42, 20, '#23252e');            // body
  px(2, 5, 42, 4, '#33363f');             // roof highlight
  px(3, 9, 8, 12, '#2b2e37');             // hood
  px(3, 6, 7, 3, '#9fc7e8');              // windshield
  px(13, 6, 2, 18, '#14141e');            // cab divider
  px(40, 6, 3, 18, '#14141e');            // rear doors line
  px(16, 8, 22, 2, '#3d414c');            // side trim
  px(16, 20, 22, 2, '#3d414c');
  // wheels
  px(6, 24, 7, 4, '#0c0c12'); px(33, 24, 7, 4, '#0c0c12');
  px(6, 2, 7, 3, '#0c0c12'); px(33, 2, 7, 3, '#0c0c12');
  // antenna dish
  px(24, 3, 6, 4, '#5a6270'); px(26, 1, 2, 3, '#8a93a3');
  // open rear door glow (capture zone hint)
  px(43, 9, 2, 12, '#59d98c');
  return c;
}

export function buildUfo() {
  const [c, ctx] = canvas(48, 22);
  const px = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  // dome
  px(18, 0, 12, 2, '#bfeaff'); px(16, 2, 16, 3, '#8fd4f5'); px(14, 5, 20, 2, '#6db8dd');
  // saucer
  px(6, 7, 36, 3, '#aab6c6'); px(2, 10, 44, 4, '#7d8a9c'); px(6, 14, 36, 3, '#5a6577');
  px(12, 17, 24, 2, '#434c5c');
  // lights
  for (let i = 0; i < 6; i++) px(7 + i * 7, 11, 3, 2, i % 2 ? '#ffd75e' : '#41f0d8');
  return c;
}

/* ============================ GROUND TILES ============================ */

export const T = {
  GRASS: 0, GRASS2: 1, WOODCHIP: 2, SAND: 3, DIRT: 4, CONCRETE: 5,
  ASPHALT: 6, PLANK: 7, WATER: 8, GRAVEL: 9, CORNFIELD: 10, PATH: 11,
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
  tiles[T.GRASS] = speckleTile('#4f9e46', ['#458c3c', '#5cb052', '#3f7f37'], 11);
  tiles[T.GRASS2] = speckleTile('#478f3f', ['#3f7f37', '#54a34a'], 22);
  tiles[T.WOODCHIP] = speckleTile('#7a5836', ['#8f6a44', '#66482c', '#553b23'], 33, 20);
  tiles[T.SAND] = speckleTile('#e0c98c', ['#d4ba7c', '#ecd7a0'], 44, 10);
  tiles[T.DIRT] = speckleTile('#8a6a45', ['#7a5c3a', '#9a7850'], 55);
  tiles[T.CONCRETE] = speckleTile('#9aa0a8', ['#8b9199', '#a8aeb6'], 66, 8);
  tiles[T.ASPHALT] = speckleTile('#4a4e58', ['#41454e', '#555a64'], 77, 8);
  tiles[T.PLANK] = (() => {
    const [c, ctx] = canvas(TILE, TILE);
    ctx.fillStyle = '#8a6a45'; ctx.fillRect(0, 0, TILE, TILE);
    ctx.fillStyle = '#6f5436';
    for (let y = 0; y < TILE; y += 4) ctx.fillRect(0, y, TILE, 1);
    ctx.fillStyle = '#9a7850'; ctx.fillRect(0, 1, TILE, 1); ctx.fillRect(0, 9, TILE, 1);
    return c;
  })();
  tiles[T.WATER] = (() => {
    const [c, ctx] = canvas(TILE, TILE);
    ctx.fillStyle = '#2e5f8a'; ctx.fillRect(0, 0, TILE, TILE);
    ctx.fillStyle = '#3a739e';
    ctx.fillRect(2, 3, 5, 1); ctx.fillRect(9, 8, 5, 1); ctx.fillRect(4, 12, 4, 1);
    return c;
  })();
  tiles[T.GRAVEL] = speckleTile('#7d8288', ['#6d7278', '#8d9298', '#5d6268'], 88, 18);
  tiles[T.CORNFIELD] = (() => {
    const [c, ctx] = canvas(TILE, TILE);
    ctx.fillStyle = '#7a5836'; ctx.fillRect(0, 0, TILE, TILE);
    const rnd = mulberry(99);
    for (let x = 1; x < TILE; x += 4) {
      ctx.fillStyle = '#3f7f37';
      ctx.fillRect(x, 0, 2, TILE);
      ctx.fillStyle = '#54a34a';
      for (let y = 1; y < TILE; y += 3) ctx.fillRect(x + (rnd() > 0.5 ? 1 : 0), y, 1, 1);
      ctx.fillStyle = '#e8c85a';
      ctx.fillRect(x, 2 + Math.floor(rnd() * 8), 1, 2);
    }
    return c;
  })();
  tiles[T.PATH] = speckleTile('#b8a888', ['#a89878', '#c8b898'], 111, 8);
  return tiles;
}

/* ============================ PROPS ============================ */
// Each prop: img canvas, footprint solid box (px, relative to img top-left),
// jumpable (can be vaulted), hide (aliens can hide behind/inside), tall (draws over actors when behind)

function propCanvas(w, h, draw) {
  const [c, ctx] = canvas(w, h);
  const px = (x, y, ww, hh, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, ww, hh); };
  draw(px, ctx);
  return c;
}

export function buildProps() {
  const p = {};

  p.tree = {
    img: propCanvas(30, 34, (px) => {
      px(13, 24, 4, 9, '#5c3f24'); px(12, 30, 6, 3, '#4a3119');
      px(5, 4, 20, 18, '#14141e');
      px(6, 5, 18, 16, '#2f6e2a'); px(8, 3, 14, 4, '#2f6e2a');
      px(8, 7, 14, 10, '#3f8f37'); px(10, 5, 10, 4, '#3f8f37');
      px(11, 8, 6, 4, '#54a34a'); px(18, 12, 4, 3, '#54a34a');
    }),
    solid: { x: 12, y: 26, w: 6, h: 6 }, jumpable: false, hide: true, tall: true,
  };

  p.bush = {
    img: propCanvas(20, 14, (px) => {
      px(1, 3, 18, 10, '#14141e');
      px(2, 4, 16, 8, '#2f6e2a'); px(4, 2, 12, 4, '#2f6e2a');
      px(5, 5, 6, 3, '#3f8f37'); px(12, 7, 5, 3, '#3f8f37');
      px(6, 3, 3, 2, '#54a34a');
    }),
    solid: { x: 2, y: 6, w: 16, h: 7 }, jumpable: true, hide: true, tall: false,
  };

  p.slide = {
    img: propCanvas(40, 30, (px) => {
      px(4, 2, 12, 14, '#c8433a');            // tower
      px(3, 1, 14, 3, '#a83229');
      px(6, 5, 8, 6, '#14141e');              // tube opening
      px(7, 6, 6, 4, '#0a0c14');
      px(16, 8, 20, 6, '#e8b93e');            // slide ramp
      px(16, 14, 18, 4, '#d0a22f');
      px(32, 16, 6, 4, '#e8b93e');
      px(4, 16, 3, 12, '#8a8f99'); px(13, 16, 3, 12, '#8a8f99'); // legs
      px(34, 20, 3, 8, '#8a8f99');
    }),
    solid: { x: 3, y: 10, w: 15, h: 16 }, jumpable: false, hide: true, tall: true,
  };

  p.swing = {
    img: propCanvas(36, 24, (px) => {
      px(2, 2, 3, 20, '#3a6ea8'); px(31, 2, 3, 20, '#3a6ea8');
      px(2, 1, 32, 3, '#2c5480');
      px(10, 4, 1, 10, '#c8c8d0'); px(15, 4, 1, 10, '#c8c8d0');
      px(21, 4, 1, 12, '#c8c8d0'); px(26, 4, 1, 12, '#c8c8d0');
      px(9, 14, 8, 3, '#c8433a'); px(20, 16, 8, 3, '#e8b93e');
    }),
    solid: { x: 1, y: 16, w: 5, h: 7 }, jumpable: false, hide: false, tall: true,
    extraSolids: [{ x: 30, y: 16, w: 5, h: 7 }],
  };

  p.sandbox = {
    img: propCanvas(36, 26, (px) => {
      px(0, 0, 36, 26, '#8a6a45');
      px(2, 2, 32, 22, '#e0c98c');
      px(6, 6, 4, 2, '#d4ba7c'); px(20, 14, 6, 2, '#d4ba7c'); px(12, 18, 4, 2, '#ecd7a0');
      px(26, 4, 5, 4, '#c8433a'); px(27, 2, 3, 3, '#e8b93e'); // bucket
    }),
    solid: null, jumpable: false, hide: true, tall: false,
  };

  p.junglegym = {
    img: propCanvas(38, 28, (px) => {
      const bar = '#3a6ea8';
      for (let i = 0; i < 4; i++) { px(3 + i * 10, 4, 2, 22, bar); }
      px(3, 4, 32, 2, bar); px(3, 12, 32, 2, bar); px(3, 20, 32, 2, bar);
      px(8, 6, 2, 6, '#c8433a'); px(24, 14, 2, 6, '#e8b93e');
    }),
    solid: { x: 2, y: 18, w: 34, h: 8 }, jumpable: true, hide: true, tall: true,
  };

  p.bench = {
    img: propCanvas(24, 12, (px) => {
      px(1, 1, 22, 4, '#8a6a45'); px(1, 6, 22, 3, '#7a5c3a');
      px(2, 9, 3, 3, '#5c5f66'); px(19, 9, 3, 3, '#5c5f66');
    }),
    solid: { x: 1, y: 4, w: 22, h: 7 }, jumpable: true, hide: false, tall: false,
  };

  p.fenceH = {
    img: propCanvas(16, 10, (px) => {
      px(0, 2, 16, 2, '#8a6a45'); px(0, 6, 16, 2, '#8a6a45');
      px(1, 0, 2, 10, '#6f5436'); px(13, 0, 2, 10, '#6f5436');
    }),
    solid: { x: 0, y: 2, w: 16, h: 6 }, jumpable: true, hide: false, tall: false,
  };

  p.fenceV = {
    img: propCanvas(8, 16, (px) => {
      px(3, 0, 2, 16, '#8a6a45');
      px(1, 2, 6, 2, '#6f5436'); px(1, 11, 6, 2, '#6f5436');
    }),
    solid: { x: 2, y: 0, w: 4, h: 16 }, jumpable: true, hide: false, tall: false,
  };

  p.hay = {
    img: propCanvas(22, 18, (px) => {
      px(1, 1, 20, 16, '#14141e');
      px(2, 2, 18, 14, '#d8b855');
      px(2, 5, 18, 2, '#c2a244'); px(2, 11, 18, 2, '#c2a244');
      px(5, 3, 2, 12, '#e8cc70'); px(14, 3, 2, 12, '#e8cc70');
    }),
    solid: { x: 2, y: 6, w: 18, h: 11 }, jumpable: true, hide: true, tall: false,
  };

  p.barn = {
    img: propCanvas(76, 62, (px) => {
      px(2, 20, 72, 40, '#14141e');
      px(4, 22, 68, 36, '#9e3630');            // walls
      px(4, 22, 68, 4, '#7c2a25');
      px(0, 4, 76, 18, '#6e2521');             // roof
      px(0, 2, 76, 4, '#5a1e1b');
      for (let i = 0; i < 9; i++) px(4 + i * 8, 6, 2, 14, '#5a1e1b');
      px(30, 36, 16, 22, '#5c3f24');           // door
      px(31, 37, 14, 20, '#4a3119');
      px(37, 37, 2, 20, '#5c3f24');
      px(10, 30, 10, 8, '#e8e4d8'); px(56, 30, 10, 8, '#e8e4d8'); // windows
      px(11, 31, 8, 6, '#3a5a78'); px(57, 31, 8, 6, '#3a5a78');
    }),
    solid: { x: 3, y: 24, w: 70, h: 34 }, jumpable: false, hide: false, tall: true,
    door: { x: 30, y: 50, w: 16, h: 10 },
  };

  p.silo = {
    img: propCanvas(26, 52, (px) => {
      px(3, 8, 20, 42, '#14141e');
      px(4, 9, 18, 40, '#aab6c6');
      px(4, 9, 5, 40, '#c6d0dc');
      px(17, 9, 5, 40, '#7d8a9c');
      px(5, 0, 16, 10, '#8a95a3');
      px(7, 14, 12, 2, '#7d8a9c'); px(7, 26, 12, 2, '#7d8a9c'); px(7, 38, 12, 2, '#7d8a9c');
    }),
    solid: { x: 4, y: 30, w: 18, h: 20 }, jumpable: false, hide: false, tall: true,
  };

  p.tractor = {
    img: propCanvas(34, 26, (px) => {
      px(4, 4, 14, 10, '#2a7a34');            // cab
      px(6, 6, 8, 6, '#9fc7e8');
      px(2, 12, 28, 8, '#2a7a34');            // body
      px(24, 8, 8, 6, '#1f5c27');             // engine
      px(2, 18, 8, 8, '#14141e'); px(4, 20, 4, 4, '#5c5f66');   // big wheel
      px(24, 20, 6, 6, '#14141e'); px(26, 22, 2, 2, '#5c5f66'); // small wheel
      px(30, 6, 2, 6, '#14141e');             // exhaust
    }),
    solid: { x: 2, y: 12, w: 30, h: 13 }, jumpable: false, hide: true, tall: false,
  };

  p.scarecrow = {
    img: propCanvas(18, 26, (px) => {
      px(8, 6, 2, 18, '#5c3f24');
      px(2, 9, 14, 2, '#5c3f24');
      px(5, 10, 8, 8, '#7a4aa0');             // shirt
      px(6, 2, 6, 6, '#e0c98c');              // head
      px(7, 4, 1, 1, '#14141e'); px(10, 4, 1, 1, '#14141e');
      px(4, 0, 10, 3, '#8a6a45');             // hat
    }),
    solid: { x: 7, y: 18, w: 4, h: 6 }, jumpable: false, hide: false, tall: true,
  };

  p.coop = {
    img: propCanvas(30, 24, (px) => {
      px(1, 8, 28, 15, '#14141e');
      px(2, 9, 26, 13, '#8a6a45');
      px(0, 2, 30, 8, '#6f5436');
      px(11, 12, 8, 10, '#3a2a18');
      px(4, 12, 5, 5, '#e8e4d8');
    }),
    solid: { x: 2, y: 10, w: 26, h: 12 }, jumpable: false, hide: true, tall: false,
  };

  const container = (main, shade) => propCanvas(52, 30, (px) => {
    px(0, 2, 52, 27, '#14141e');
    px(1, 3, 50, 25, main);
    px(1, 3, 50, 5, shade);
    for (let i = 0; i < 12; i++) px(3 + i * 4, 9, 2, 18, shade);
    px(48, 8, 3, 20, '#14141e');
  });
  p.containerR = { img: container('#b0483c', '#8a352c'), solid: { x: 1, y: 8, w: 50, h: 21 }, jumpable: false, hide: false, tall: true };
  p.containerB = { img: container('#3a6ea8', '#2c5480'), solid: { x: 1, y: 8, w: 50, h: 21 }, jumpable: false, hide: false, tall: true };
  p.containerG = { img: container('#3f8f37', '#2f6e2a'), solid: { x: 1, y: 8, w: 50, h: 21 }, jumpable: false, hide: false, tall: true };

  p.containerOpen = {
    img: propCanvas(52, 30, (px) => {
      px(0, 2, 52, 27, '#14141e');
      px(1, 3, 50, 25, '#8a6f2c');
      px(1, 3, 50, 5, '#6e571f');
      for (let i = 0; i < 12; i++) px(3 + i * 4, 9, 2, 18, '#6e571f');
      px(40, 6, 11, 22, '#0a0c14');           // open end (hide inside)
      px(41, 8, 9, 18, '#050608');
    }),
    solid: { x: 1, y: 8, w: 38, h: 21 }, jumpable: false, hide: true, tall: true,
  };

  p.crate = {
    img: propCanvas(16, 16, (px) => {
      px(0, 0, 16, 16, '#14141e');
      px(1, 1, 14, 14, '#a3814f');
      px(1, 1, 14, 2, '#b9945e'); px(1, 13, 14, 2, '#8a6a3f');
      px(1, 1, 2, 14, '#b9945e'); px(13, 1, 2, 14, '#8a6a3f');
      px(3, 7, 10, 2, '#8a6a3f');
    }),
    solid: { x: 1, y: 4, w: 14, h: 11 }, jumpable: true, hide: true, tall: false,
  };

  p.barrel = {
    img: propCanvas(12, 14, (px) => {
      px(1, 1, 10, 12, '#14141e');
      px(2, 2, 8, 10, '#3a6ea8');
      px(2, 4, 8, 2, '#2c5480'); px(2, 8, 8, 2, '#2c5480');
      px(3, 2, 2, 10, '#5a8ec8');
    }),
    solid: { x: 2, y: 5, w: 8, h: 8 }, jumpable: true, hide: false, tall: false,
  };

  p.pallet = {
    img: propCanvas(20, 14, (px) => {
      px(0, 0, 20, 14, '#8a6a45');
      px(0, 3, 20, 1, '#6f5436'); px(0, 7, 20, 1, '#6f5436'); px(0, 11, 20, 1, '#6f5436');
    }),
    solid: null, jumpable: false, hide: false, tall: false,
  };

  p.crane = {
    img: propCanvas(24, 60, (px) => {
      px(8, 10, 8, 48, '#14141e');
      px(9, 11, 6, 46, '#d8a83c');
      px(10, 11, 2, 46, '#e8bc55');
      px(0, 0, 24, 6, '#d8a83c');
      px(0, 1, 24, 2, '#e8bc55');
      px(20, 6, 1, 14, '#c8c8d0');
      px(18, 20, 5, 4, '#5c5f66');            // hook block
      px(6, 54, 12, 5, '#5c5f66');            // base
    }),
    solid: { x: 6, y: 50, w: 12, h: 9 }, jumpable: false, hide: false, tall: true,
  };

  p.boat = {
    img: propCanvas(56, 24, (px) => {
      px(2, 4, 52, 18, '#14141e');
      px(4, 6, 48, 14, '#7c4a32');
      px(4, 6, 48, 3, '#9a5c3e');
      px(8, 9, 40, 8, '#5c3a26');
      px(22, 2, 3, 10, '#8a6a45');            // mast
      px(26, 3, 12, 6, '#e8e4d8');            // sail furl
    }),
    solid: { x: 4, y: 8, w: 48, h: 13 }, jumpable: false, hide: true, tall: false,
  };

  p.rock = {
    img: propCanvas(16, 12, (px) => {
      px(2, 2, 12, 9, '#14141e');
      px(3, 3, 10, 7, '#7d8288');
      px(4, 4, 4, 3, '#9da2a8');
    }),
    solid: { x: 3, y: 5, w: 10, h: 6 }, jumpable: true, hide: false, tall: false,
  };

  p.lamppost = {
    img: propCanvas(10, 30, (px) => {
      px(4, 4, 2, 25, '#3a3e46');
      px(2, 0, 6, 5, '#3a3e46');
      px(3, 1, 4, 3, '#ffd75e');
    }),
    solid: { x: 3, y: 24, w: 4, h: 5 }, jumpable: false, hide: false, tall: true,
  };

  p.dumpster = {
    img: propCanvas(26, 18, (px) => {
      px(1, 3, 24, 14, '#14141e');
      px(2, 4, 22, 12, '#2a7a34');
      px(2, 4, 22, 3, '#1f5c27');
      px(4, 8, 18, 1, '#1f5c27');
      px(0, 15, 4, 3, '#0c0c12'); px(22, 15, 4, 3, '#0c0c12');
    }),
    solid: { x: 2, y: 6, w: 22, h: 11 }, jumpable: true, hide: true, tall: false,
  };

  return p;
}
