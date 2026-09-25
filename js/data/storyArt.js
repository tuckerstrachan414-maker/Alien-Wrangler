// Pixel art for the story cutscenes: Handler Voss, the alien cruiser that
// breaks up over the fields, its escape pods and the space debris that hit
// it, plus a tiny 3x5 pixel font for the ops-room monitor read-outs.
// Same rules as sprites.js: generated at boot, one light source top-left,
// 1px near-black outline, colours from the shared material palette.
import { C, canvas, makeSprite, flipX, mulberry } from './sprites.js';

/* ============================ 3x5 PIXEL FONT ============================ */
// Canvas text is illegible at 1 buffer pixel, so monitor labels use this.
// Each glyph is 5 rows of 3 pixels.
const GLYPH_ROWS = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'], D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'], J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['##.', '#.#', '#.#', '#.#', '#.#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'], P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'], V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['##.', '..#', '.#.', '#..', '###'], 3: ['##.', '..#', '.#.', '..#', '##.'],
  4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '##.'],
  ':': ['...', '.#.', '...', '.#.', '...'], '.': ['...', '...', '...', '...', '.#.'],
  '-': ['...', '...', '###', '...', '...'], '!': ['.#.', '.#.', '.#.', '...', '.#.'],
  '/': ['..#', '..#', '.#.', '#..', '#..'], '>': ['#..', '.#.', '..#', '.#.', '#..'],
  '<': ['..#', '.#.', '#..', '.#.', '..#'], '+': ['...', '.#.', '###', '.#.', '...'],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'], '?': ['##.', '..#', '.#.', '...', '.#.'],
  "'": ['.#.', '.#.', '...', '...', '...'], ',': ['...', '...', '...', '.#.', '#..'],
  ' ': ['...', '...', '...', '...', '...'],
};
const GLYPHS = Object.fromEntries(Object.entries(GLYPH_ROWS).map(([k, rows]) => [k, rows.join('')]));

export function textWidth(s) { return s.length * 4 - 1; }

// Draw `s` (upper-case) at (x, y) with 1px letter spacing.
export function pixelText(ctx, s, x, y, color) {
  ctx.fillStyle = color;
  let cx = Math.round(x);
  const cy = Math.round(y);
  for (const ch of s.toUpperCase()) {
    const g = GLYPHS[ch] || GLYPHS['?'];
    for (let i = 0; i < 15; i++) if (g[i] === '#') ctx.fillRect(cx + (i % 3), cy + ((i / 3) | 0), 1, 1);
    cx += 4;
  }
}

/* ============================ HANDLER VOSS ============================ */
// A veteran field handler: swept-back silver hair, charcoal trench coat over
// shirt and black tie, and the radio headset they run every op through.
const V = {
  k: C.ink, H: '#8d939c', h: '#c3c8cf', s: '#d9a27a', d: '#b07a55', e: '#2a2230',
  g: '#2b2f38', m: C.cy, c: '#4a3f3a', C: '#2f2825', u: '#665650',
  w: '#dfe4ea', t: '#6a1f2a', N: '#26222a', o: '#15151c',
};

const VOSS_DOWN = [
  '....kkkk....',
  '...khhhHk...',
  '..khhHHHHk..',
  '..kHssssHk..',
  '.gkssssssk..',
  '.gksessesk..',
  '.gksssdssk..',
  '..mkssddk...',
  '.kcuwttwuck.',
  '.kccuttucck.',
  '.kcccttccck.',
  '.kcccttccck.',
  '..kCccccCk..',
  '...NN..NN...',
  '...oo..oo...',
  '............',
];

const VOSS_SIDE = [
  '...kkkk.....',
  '..khhhHk....',
  '.khhHHHHk...',
  '.kHHHsssk...',
  '.kHgssssdk..',
  '.kHgsssesk..',
  '.kkgssssdk..',
  '..kmmssdk...',
  '..kcwwwck...',
  '.kccwttck...',
  '.kcccwwck...',
  '.kcccccck...',
  '..kCcccCk...',
  '...NN.NN....',
  '...oo.oo....',
  '............',
];

// Back to the camera, looking up at the monitor.
const VOSS_UP = [
  '....kkkk....',
  '...khhhhk...',
  '..khHHHHhk..',
  '..kHHHHHHk..',
  '.gkHHHHHHk..',
  '.gkHHHHHHk..',
  '.gkHHHHHHk..',
  '...kHHHHk...',
  '.kcccccccck.',
  '.kcuccccuck.',
  '.kcccccccck.',
  '.kcccCCccck.',
  '..kcccccck..',
  '...NN..NN...',
  '...oo..oo...',
  '............',
];

// Facing right, one arm out toward the agent.
const VOSS_POINT = [
  '...kkkk.....',
  '..khhhHk....',
  '.khhHHHHk...',
  '.kHHHsssk...',
  '.kHgssssdk..',
  '.kHgsssesk..',
  '.kkgssssdk..',
  '..kmmssdk...',
  '..kcwwwckkk.',
  '.kccwttcccsk',
  '.kcccwwckkk.',
  '.kcccccck...',
  '..kCcccCk...',
  '...NN.NN....',
  '...oo.oo....',
  '............',
];

export function buildVoss() {
  const right = makeSprite(VOSS_SIDE, V);
  const point = makeSprite(VOSS_POINT, V);
  return {
    down: makeSprite(VOSS_DOWN, V),
    up: makeSprite(VOSS_UP, V),
    right, left: flipX(right),
    pointR: point, pointL: flipX(point),
    portrait: buildVossPortrait(),
  };
}

// 28x30 bust for the dialogue box: frames closed / open (talking) / blink.
function buildVossPortrait() {
  const frame = (mode) => {
    const [c, ctx] = canvas(28, 30);
    const px = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
    const spans = (rows, y0, col) => rows.forEach(([a, b], i) => px(a, y0 + i, b - a + 1, 1, col));

    // coat, shoulders, collar (under the head)
    spans([[8, 19], [4, 23], [2, 25], [1, 26], [1, 26], [1, 26], [1, 26], [1, 26]], 22, C.ink);
    spans([[9, 18], [5, 22], [3, 24], [2, 25], [2, 25], [2, 25], [2, 25], [2, 25]], 22, V.c);
    px(3, 24, 6, 1, V.u); px(19, 25, 5, 1, V.C);              // lit left shoulder, shaded right
    px(2, 27, 24, 3, V.C);
    // shirt V + tie, lapel edges
    spans([[11, 16], [11, 16], [12, 15], [12, 15], [13, 14], [13, 14]], 22, V.w);
    px(13, 23, 2, 7, V.t); px(13, 23, 2, 1, '#8a2f3a');
    px(10, 22, 1, 5, V.u); px(17, 22, 1, 5, V.C);
    // neck
    px(11, 19, 6, 4, V.d); px(11, 19, 3, 3, V.s);

    // head: outline, skin, jaw shade
    const head = [[10, 17], [8, 19], [7, 20], [7, 20], [7, 20], [7, 20], [7, 20], [7, 20], [7, 20],
      [7, 20], [7, 20], [7, 20], [8, 19], [8, 19], [9, 18], [10, 17], [11, 16]];
    head.forEach(([a, b], i) => px(a - 1, 4 + i, b - a + 3, 1, C.ink));
    px(10, 3, 8, 1, C.ink); px(11, 21, 6, 1, C.ink);
    head.forEach(([a, b], i) => px(a, 4 + i, b - a + 1, 1, V.s));
    px(18, 11, 2, 7, V.d); px(17, 16, 2, 3, V.d);            // right cheek/jaw in shade
    px(9, 9, 2, 3, '#ecc29e');                                // lit brow bone / cheek
    // ears
    px(5, 10, 2, 4, C.ink); px(6, 11, 1, 2, V.d);
    px(21, 10, 2, 4, C.ink); px(21, 11, 1, 2, V.d);

    // silver hair, swept back, short at the sides
    spans([[10, 17], [8, 19], [7, 20], [7, 20]], 4, V.H);
    px(7, 8, 2, 3, V.H); px(19, 8, 2, 3, V.H);                // temples
    px(13, 8, 2, 1, V.H);                                     // widow's peak
    px(9, 4, 5, 1, V.h); px(8, 5, 4, 1, V.h); px(8, 6, 2, 1, V.h);   // sheen
    px(15, 5, 1, 2, V.h); px(17, 6, 3, 1, '#5f646c'); px(19, 5, 1, 2, '#5f646c');

    // brows: low and angled in, a stern stare
    px(9, 10, 3, 1, '#5f646c'); px(12, 11, 1, 1, '#5f646c');
    px(16, 10, 3, 1, '#5f646c'); px(15, 11, 1, 1, '#5f646c');
    // eyes (or a blink)
    if (mode === 'blink') {
      px(10, 12, 2, 1, V.d); px(16, 12, 2, 1, V.d);
    } else {
      px(10, 12, 2, 1, V.e); px(16, 12, 2, 1, V.e);
      px(10, 12, 1, 1, '#4a5a78'); px(16, 12, 1, 1, '#4a5a78');
    }
    px(10, 13, 2, 1, V.d); px(16, 13, 2, 1, V.d);             // tired lower lids
    // nose + lines
    px(14, 13, 1, 3, V.d); px(13, 16, 2, 1, V.d);
    px(9, 16, 1, 2, V.d); px(18, 16, 1, 1, '#9a6a48');
    // mouth
    if (mode === 'open') {
      px(11, 18, 6, 2, '#3a1414'); px(12, 18, 4, 1, '#e8ecf4'); px(12, 20, 4, 1, V.d);
    } else {
      px(11, 18, 6, 1, '#7a3a2e'); px(12, 19, 4, 1, V.d);
    }

    // headset: band over the crown, cup on the right ear, mic to the mouth
    px(8, 3, 12, 1, V.g); px(7, 4, 1, 2, V.g); px(20, 4, 1, 2, V.g);
    px(4, 9, 3, 6, V.g); px(4, 9, 1, 6, '#616b7a'); px(5, 10, 1, 1, '#8791a0');
    px(6, 15, 1, 2, V.g); px(7, 17, 1, 1, V.g); px(8, 18, 1, 1, V.g);
    px(9, 19, 2, 1, V.g); px(10, 19, 1, 1, V.m);
    return c;
  };
  return { closed: frame('closed'), open: frame('open'), blink: frame('blink') };
}

/* ============================ THE ALIEN CRUISER ============================ */

const SHIP_W = 56, SHIP_H = 22;

// Long saucer-hull cruiser seen side-on, nose to the left, with a raised
// dorsal fin, a row of lit ports and a violet drive at the tail.
export function buildShip() {
  const [c, ctx] = canvas(SHIP_W, SHIP_H);
  const px = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  const cx = 28, cy = 13, rx = 26.5, ry = 6.5;
  const hull = (x, y) => {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    // flatter belly, rounder back
    return dx * dx + (dy > 0 ? dy * dy * 1.6 : dy * dy) <= 1;
  };
  const fin = (x, y) => y >= 3 && y <= 8 && x >= 24 + (8 - y) && x <= 40 - (8 - y) * 0.5;
  const solid = (x, y) => hull(x, y) || fin(x, y);
  for (let y = 0; y < SHIP_H; y++) {
    for (let x = 0; x < SHIP_W; x++) {
      if (!solid(x, y)) continue;
      const edge = !solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1);
      let col;
      if (edge) col = C.ink;
      else if (y < 8) col = y < 6 ? '#8a7aa8' : '#6a5c88';     // fin + top catch the light
      else if (y < 11) col = '#5a4e72';
      else if (y < 15) col = '#3d3450';
      else col = '#262036';                                    // belly in shadow
      px(x, y, 1, 1, col);
    }
  }
  px(6, 10, 40, 1, '#7a6c98');                                  // panel seam highlight
  for (let i = 0; i < 7; i++) px(10 + i * 5, 12, 2, 1, i % 3 === 1 ? C.glow : C.cy);   // ports
  px(27, 5, 6, 2, '#b3ddf0'); px(27, 5, 2, 1, '#e2f4ff');       // bridge canopy on the fin
  px(51, 11, 3, 4, '#b98cf5'); px(53, 12, 2, 2, '#e8d4ff');     // drive glow
  px(3, 13, 3, 1, '#a9f7ee');                                   // nose light
  return c;
}

// Break a sprite into `n` jagged chunks (Voronoi cells of random seeds), each
// its own canvas the same size as the source so they can drift apart from a
// shared origin. Returns [{ img, cx, cy }] with each chunk's centre.
export function shatter(src, n, seed = 1) {
  const rnd = mulberry(seed);
  const w = src.width, h = src.height;
  const data = src.getContext('2d').getImageData(0, 0, w, h).data;
  const seeds = Array.from({ length: n }, () => ({ x: rnd() * w, y: rnd() * h }));
  const parts = seeds.map(() => {
    const [c, ctx] = canvas(w, h);
    return { img: c, ctx, sx: 0, sy: 0, count: 0, id: ctx.createImageData(w, h) };
  });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] === 0) continue;
      let best = 0, bd = 1e9;
      for (let k = 0; k < n; k++) {
        const d = (seeds[k].x - x) ** 2 + (seeds[k].y - y) ** 2 * 3;   // cells run across the hull
        if (d < bd) { bd = d; best = k; }
      }
      const p = parts[best];
      p.id.data.set(data.subarray(i, i + 4), i);
      p.sx += x; p.sy += y; p.count++;
    }
  }
  return parts.filter(p => p.count).map(p => {
    p.ctx.putImageData(p.id, 0, 0);
    return { img: p.img, cx: p.sx / p.count, cy: p.sy / p.count };
  });
}

// Escape pod as seen on the satellite feed: a tiny white capsule with a
// cyan porthole (the flame is drawn live).
export function buildMiniPod() {
  return makeSprite([
    '.kk.',
    'kwwk',
    'kcwk',
    'kwwk',
    'kggk',
    '.kk.',
  ], { k: C.ink, w: C.mt5, c: C.cy, g: C.mt3 });
}

// The chunk of space junk that hit the hull.
export function buildDebris() {
  return makeSprite([
    '..kkkk....',
    '.kbbaakk..',
    'kbaaabbbk.',
    'kbabbbbddk',
    'kbbbbdddk.',
    '.kbddddk..',
    '..kkkkk...',
  ], { k: C.ink, a: '#9a9088', b: '#6e6660', d: '#4a4440' });
}
