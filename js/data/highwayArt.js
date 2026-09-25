// Pixel art for Stage 1, Scene 3 (Highway 29): the woods the aliens fled
// into (boulders, stumps, mossy logs, bracken, birches), the creek, Highway
// 29 itself and the gas station across it, the armoured black semi parked
// there and its driver, a car going by, and the agent's last crawl.
//
// Same art bible as sprites.js: one light, top-left; 1px ink outline;
// colours from the shared material palette. Vehicles and buildings are in
// the same 3/4 view as every other prop: a point at ground (x, y) and
// height z lands on screen at (x, y - z), so a truck heading north shows its
// roof and the back of its trailer, a car heading south its roof, windscreen
// and grille.
import { C, T, canvas, makeSprite, flipX, mulberry, disc } from './sprites.js';
import { pixelText } from './storyArt.js';
import { hash } from '../terrain.js';

function art(w, h, draw) {
  const [c, ctx] = canvas(w, h);
  const px = (x, y, ww, hh, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, ww, hh); };
  draw(px, ctx);
  return c;
}

// Filled + outlined organic blob from per-row [x0, x1] spans starting at y0
// (the same helper sprites.js props are drawn with).
function blob(px, spans, y0, fill, ink = C.ink) {
  spans.forEach((s, i) => px(s[0] - 1, y0 + i, s[1] - s[0] + 3, 1, ink));
  px(spans[0][0], y0 - 1, spans[0][1] - spans[0][0] + 1, 1, ink);
  const last = spans[spans.length - 1];
  px(last[0], y0 + spans.length, last[1] - last[0] + 1, 1, ink);
  spans.forEach((s, i) => px(s[0], y0 + i, s[1] - s[0] + 1, 1, fill));
}

const LEAVES = ['#8a5a2c', '#9a6a30', '#7a4a26', '#a8803a', '#6a3f22', '#b8903e'];
const BARK = '#e8e4dc', BARK2 = '#c9c3b8';                  // birch

/* ============================ PROPS ============================ */

export function buildHighwayProps() {
  const p = {};

  // A big lichen-grey boulder with moss on its crown, too high to hop.
  p.boulder = {
    img: art(28, 22, (px) => {
      const spans = [[9, 18], [6, 21], [4, 23], [3, 24], [2, 25], [2, 25], [1, 26], [1, 26],
        [1, 26], [2, 25], [2, 25], [3, 24], [4, 23], [6, 21]];
      blob(px, spans, 5, C.mt2);
      px(4, 9, 12, 5, C.mt3); px(6, 7, 8, 2, C.mt3);          // lit face, top-left
      px(6, 8, 5, 2, C.mt4); px(7, 8, 2, 1, C.mt5);
      px(15, 13, 10, 5, C.mt1); px(18, 16, 6, 2, C.mt0);        // core shadow
      px(12, 12, 1, 4, C.mt1); px(13, 15, 3, 1, C.mt1);         // a crack
      // moss draped over the top
      px(9, 5, 10, 2, C.lf1); px(7, 6, 4, 2, C.lf1); px(17, 6, 4, 3, C.lf1);
      px(10, 5, 5, 1, C.lf2); px(18, 6, 2, 1, C.lf2); px(8, 6, 2, 1, C.lf2);
      px(11, 4, 3, 1, C.lf3);
      px(3, 18, 3, 1, C.lf1); px(22, 18, 3, 1, C.lf1);          // moss at the foot
    }),
    solid: { x: 3, y: 11, w: 22, h: 8 }, jumpable: false, hide: false, tall: true,
  };

  // A small mossy rock you can hop.
  p.mossRock = {
    img: art(16, 12, (px) => {
      blob(px, [[3, 12], [2, 13], [1, 14], [2, 13], [3, 12]], 3, C.mt2);
      px(3, 4, 5, 2, C.mt4); px(4, 4, 2, 1, C.mt5);
      px(9, 6, 4, 2, C.mt1);
      px(5, 2, 5, 1, C.lf1); px(4, 3, 7, 1, C.lf2); px(6, 3, 2, 1, C.lf3);
    }),
    solid: { x: 3, y: 5, w: 10, h: 6 }, jumpable: true, hide: false, tall: false,
  };

  // An old sawn stump: ring face on top, bark down the sides.
  p.stump = {
    img: art(16, 13, (px) => {
      px(2, 4, 12, 8, C.ink);
      px(3, 5, 10, 6, C.wd1); px(3, 5, 2, 6, C.wd2); px(11, 5, 2, 6, C.wd0);
      px(4, 8, 1, 3, C.wd0); px(8, 7, 1, 4, C.wd0);              // bark furrows
      px(1, 11, 3, 1, C.wd0); px(12, 11, 3, 1, C.wd0);           // roots
      // the cut face, an ellipse
      px(3, 1, 10, 1, C.ink); px(2, 2, 12, 3, C.ink); px(3, 5, 10, 1, C.ink);
      px(3, 2, 10, 3, C.wd4); px(4, 2, 4, 1, C.wd5);
      px(5, 3, 6, 1, C.wd3); px(7, 3, 2, 1, C.wd2);              // rings
      px(10, 2, 1, 1, C.wd3);
      px(2, 10, 2, 1, C.lf2);                                    // moss
    }),
    solid: { x: 3, y: 5, w: 10, h: 6 }, jumpable: true, hide: false, tall: false,
  };

  // A fallen trunk gone soft with moss, a snapped branch off one side.
  p.logMoss = {
    img: art(36, 15, (px) => {
      px(1, 4, 33, 10, C.ink);
      px(2, 5, 31, 8, C.wd2);
      px(2, 5, 31, 2, C.wd3); px(2, 11, 31, 2, C.wd1);
      px(5, 8, 10, 1, C.wd1); px(18, 9, 9, 1, C.wd1);            // bark grain
      px(27, 4, 7, 10, C.ink); px(28, 5, 5, 8, C.wd1);           // broken end
      px(29, 6, 3, 6, C.wd3); px(30, 7, 1, 4, C.wd2);
      // moss along the top
      px(3, 4, 22, 2, C.lf1); px(4, 4, 9, 1, C.lf2); px(15, 4, 7, 1, C.lf2);
      px(6, 3, 4, 1, C.lf2); px(16, 3, 3, 1, C.lf3); px(7, 3, 1, 1, C.lf3);
      // a snapped branch sticking up
      px(11, 0, 2, 5, C.ink); px(11, 1, 1, 3, C.wd2);
      px(20, 13, 4, 1, C.lf1);                                   // moss at the foot
    }),
    solid: { x: 2, y: 5, w: 31, h: 8 }, jumpable: true, hide: true, tall: false,
  };

  // Birch: a pale trunk with black marks and a light, airy crown.
  p.birch = {
    img: art(24, 40, (px) => {
      px(11, 14, 3, 25, C.ink); px(11, 14, 2, 24, BARK); px(13, 14, 1, 24, BARK2);
      for (const y of [18, 23, 27, 31, 35]) px(11 + (y % 2), y, 2, 1, '#2a2530');
      px(10, 38, 5, 2, C.wd0);
      const spans = [[9, 14], [6, 17], [4, 19], [3, 20], [2, 21], [2, 21], [3, 20], [2, 21],
        [3, 20], [4, 19], [5, 18], [7, 16], [9, 14]];
      blob(px, spans, 2, C.lf3);
      px(12, 8, 8, 5, C.lf2); px(14, 11, 6, 3, C.lf1);
      px(5, 4, 6, 3, C.lf4); px(6, 4, 3, 1, C.lf5); px(4, 8, 3, 2, C.lf4);
      px(11, 3, 3, 1, C.lf4); px(15, 6, 2, 1, C.lf4);
      px(9, 10, 2, 1, BARK2);                                    // a branch showing through
    }),
    solid: { x: 10, y: 33, w: 5, h: 5 }, jumpable: false, hide: false, tall: true,
  };

  // A big old broadleaf, crown twice as wide as the others.
  p.bigTree = {
    img: art(42, 48, (px) => {
      px(18, 22, 7, 24, C.ink); px(19, 22, 5, 24, C.wd1); px(19, 22, 1, 24, C.wd2); px(23, 22, 1, 24, C.wd0);
      px(15, 44, 13, 3, C.ink); px(16, 44, 11, 2, C.wd0);        // roots
      px(14, 45, 3, 1, C.wd1); px(26, 45, 3, 1, C.wd1);
      const spans = [[15, 26], [11, 30], [8, 33], [6, 35], [4, 37], [3, 38], [2, 39], [2, 39], [1, 40],
        [1, 40], [1, 40], [2, 39], [2, 39], [3, 38], [4, 37], [6, 35], [8, 33], [11, 30], [14, 27], [17, 24]];
      blob(px, spans, 3, C.lf2);
      px(21, 14, 17, 8, C.lf1); px(24, 19, 12, 4, C.lf0); px(6, 17, 9, 4, C.lf1);
      px(6, 5, 12, 5, C.lf3); px(8, 5, 7, 2, C.lf4); px(10, 5, 2, 1, C.lf5);
      px(22, 7, 8, 3, C.lf3); px(24, 7, 3, 1, C.lf4);
      px(4, 11, 6, 4, C.lf3); px(5, 11, 2, 1, C.lf4);
      px(15, 12, 6, 3, C.lf3); px(29, 13, 4, 2, C.lf3);
    }),
    solid: { x: 18, y: 38, w: 7, h: 7 }, jumpable: false, hide: false, tall: true,
  };

  // A young tree, knee-high, nothing to stop you walking through it.
  p.sapling = {
    img: art(12, 16, (px) => {
      px(5, 7, 1, 8, C.wd1); px(4, 15, 3, 1, C.wd0);
      blob(px, [[4, 7], [2, 9], [1, 10], [2, 9], [3, 8]], 2, C.lf3);
      px(6, 4, 4, 2, C.lf2); px(3, 3, 2, 1, C.lf4); px(4, 2, 1, 1, C.lf5);
    }),
    solid: null, jumpable: false, hide: false, tall: false,
  };

  // Ground cover: a tuft of ferns and grass on the floor of the woods.
  p.tuft = {
    img: art(12, 8, (px) => {
      px(1, 7, 10, 1, '#34401f');
      for (const [x, h, col] of [[1, 3, C.lf1], [3, 5, C.lf2], [5, 6, C.lf2], [6, 4, C.lf3], [8, 5, C.lf1], [10, 3, C.lf2]]) {
        px(x, 7 - h, 1, h, col);
      }
      px(2, 4, 1, 1, C.lf3); px(4, 2, 1, 1, C.lf4); px(7, 3, 1, 1, C.lf4); px(9, 4, 1, 1, C.lf3);
    }),
    solid: null, jumpable: false, hide: false, tall: false,
  };

  // Bracken: a waist-high clump of ferns to duck into.
  p.bracken = {
    img: art(24, 16, (px) => {
      px(6, 11, 12, 4, C.ink); px(7, 11, 10, 3, C.lf0);
      const frond = (x0, y0, dx, len, col, lit) => {
        for (let i = 0; i < len; i++) {
          const x = x0 + Math.round(dx * i), y = y0 + i;
          px(x - 1, y, 3, 1, C.ink);
        }
        for (let i = 0; i < len; i++) {
          const x = x0 + Math.round(dx * i), y = y0 + i;
          px(x, y, 1, 1, i % 2 ? col : lit);
          if (i > 1 && i < len - 1) { px(x - 1, y, 1, 1, col); px(x + 1, y, 1, 1, col); }
        }
      };
      frond(4, 5, 0.45, 9, C.lf1, C.lf2);
      frond(19, 5, -0.45, 9, C.lf1, C.lf2);
      frond(8, 2, 0.25, 11, C.lf2, C.lf3);
      frond(15, 2, -0.25, 11, C.lf2, C.lf3);
      frond(12, 1, 0, 12, C.lf2, C.lf4);
      px(12, 1, 1, 1, C.lf5); px(8, 2, 1, 1, C.lf4); px(15, 2, 1, 1, C.lf4);
    }),
    solid: { x: 3, y: 8, w: 18, h: 7 }, jumpable: true, hide: true, tall: false,
  };

  // Cattails along the creek bank.
  p.reeds = {
    img: art(12, 17, (px) => {
      for (const [x, top, head] of [[2, 4, true], [5, 1, true], [8, 3, false], [10, 6, true], [4, 7, false]]) {
        px(x, top + 3, 1, 16 - top - 3, C.gr1);
        px(x, top + 3, 1, 3, C.gr2);
        if (head) { px(x - 1, top, 3, 4, C.ink); px(x, top, 1, 4, '#6b3a22'); px(x, top, 1, 1, '#8a5a30'); }
        else { px(x, top, 1, 3, C.gr2); }
      }
      px(1, 15, 11, 2, C.gr0);
      px(6, 9, 3, 1, C.gr2); px(1, 11, 2, 1, C.gr2);              // blades bending off
    }),
    solid: null, jumpable: false, hide: false, tall: false,
  };

  // A state route marker: a white shield on a steel post.
  p.sign29 = {
    img: art(18, 32, (px, ctx) => {
      px(8, 15, 2, 17, C.ink); px(8, 15, 1, 16, C.mt3);
      const rows = [[2, 15], [1, 16], [1, 16], [1, 16], [1, 16], [1, 16], [1, 16], [1, 16],
        [1, 16], [2, 15], [3, 14], [4, 13], [6, 11], [8, 9]];
      rows.forEach(([a, b], i) => px(a, 1 + i, b - a + 1, 1, C.ink));
      px(3, 0, 12, 1, C.ink);
      rows.forEach(([a, b], i) => { if (i < rows.length - 1) px(a + 1, 1 + i, b - a - 1, 1, '#eef1f7'); });
      px(3, 1, 12, 1, '#ffffff');
      px(15, 2, 1, 8, '#c3ccda');                                // shade on the right
      pixelText(ctx, '29', 5, 4, C.ink);
      px(6, 10, 6, 1, C.ink);                                    // underline
    }),
    solid: { x: 7, y: 28, w: 4, h: 3 }, jumpable: false, hide: false, tall: true,
  };

  // The gas station's pole sign: FUEL and two prices in red LED digits.
  p.priceSign = {
    img: art(26, 52, (px, ctx) => {
      px(11, 24, 4, 28, C.ink); px(12, 24, 2, 27, C.mt2); px(12, 24, 1, 27, C.mt3);
      px(9, 49, 8, 3, C.mt1);
      px(0, 0, 26, 25, C.ink);
      px(1, 1, 24, 7, C.rd2); px(1, 1, 24, 1, C.rd3);
      pixelText(ctx, 'FUEL', 6, 2, '#ffffff');
      px(1, 8, 24, 16, '#0c0d12');
      pixelText(ctx, '3.49', 6, 10, '#ff6a3a');
      pixelText(ctx, '3.89', 6, 17, '#ff6a3a');
      px(2, 9, 1, 14, '#1c1d25');
    }),
    solid: { x: 10, y: 47, w: 6, h: 4 }, jumpable: false, hide: false, tall: true,
  };

  // A white chest of bagged ice outside the store.
  p.iceBox = {
    img: art(22, 16, (px, ctx) => {
      px(0, 2, 22, 14, C.ink);
      px(1, 3, 20, 3, '#dfe6ee'); px(1, 3, 20, 1, '#ffffff');    // lid
      px(1, 6, 20, 9, '#c9d3de');
      px(1, 6, 20, 1, '#9aa7b5');
      pixelText(ctx, 'ICE', 5, 8, C.bl1);
      px(2, 14, 18, 1, '#9aa7b5');
    }),
    solid: { x: 1, y: 6, w: 20, h: 9 }, jumpable: false, hide: false, tall: false,
  };

  // The gas station's canopy: a white roof slab on steel posts with FUEL on
  // its red fascia, two pump islands in the shade underneath.
  p.canopy = {
    img: art(124, 74, (px, ctx) => {
      // shade on the ground under it
      ctx.fillStyle = 'rgba(10, 12, 20, 0.28)';
      ctx.fillRect(4, 42, 116, 32);
      // pump islands and pumps
      for (const ix of [30, 74]) {
        px(ix - 2, 62, 24, 8, C.ink); px(ix - 1, 63, 22, 6, '#b8bcc4'); px(ix - 1, 63, 22, 1, '#d6d9de');
        for (const [dx, col] of [[2, C.rd2], [12, C.bl1]]) {
          const x = ix + dx;
          px(x - 1, 46, 8, 18, C.ink);
          px(x, 47, 6, 16, '#e6e8ec'); px(x, 47, 1, 16, '#ffffff');
          px(x, 47, 6, 3, col);
          px(x + 1, 51, 4, 3, '#1e2a38'); px(x + 1, 51, 2, 1, C.gl1);      // screen
          px(x + 5, 55, 2, 4, C.ink); px(x + 5, 56, 1, 2, C.mt2);         // nozzle holster
          px(x + 1, 57, 3, 1, '#9aa7b5');
        }
      }
      // steel posts, front pair
      for (const x of [16, 104]) { px(x, 38, 5, 34, C.ink); px(x + 1, 38, 3, 33, C.mt3); px(x + 1, 38, 1, 33, C.mt4); }
      // roof slab, seen from above
      px(0, 0, 124, 42, C.ink);
      px(1, 1, 122, 31, '#e6e8ec');
      px(1, 1, 122, 1, '#ffffff'); px(1, 1, 1, 31, '#ffffff');
      for (let x = 21; x < 122; x += 20) px(x, 2, 1, 29, '#cfd3da');
      px(1, 30, 122, 2, '#bfc4cc');
      // the fascia, with a white pinstripe and the word FUEL
      px(1, 32, 122, 9, C.rd2); px(1, 32, 122, 1, C.rd3); px(1, 40, 122, 1, C.rd1);
      px(1, 34, 122, 1, '#ffffff');
      pixelText(ctx, 'FUEL', 55, 35, '#ffffff');
    }),
    solid: null, jumpable: false, hide: false, tall: true,
    // the pump islands and posts, as separate bodies (relative to the image)
    extraSolids: [{ x: 28, y: 62, w: 24, h: 8 }, { x: 72, y: 62, w: 24, h: 8 }, { x: 16, y: 66, w: 5, h: 6 }, { x: 104, y: 66, w: 5, h: 6 }],
  };

  // The store: gravel roof with an AC unit up top, a red sign band reading
  // HWY 29 MART over the windows, a glass door (`door` is where it is in the
  // image, for when the trucker comes out).
  p.store = {
    door: { x: 58, y: 64, w: 12, h: 22 },
    img: art(134, 88, (px, ctx) => {
      const rnd = mulberry(29);
      // roof, from above, with a parapet round it
      px(0, 0, 134, 50, C.ink);
      px(1, 1, 132, 48, '#b8b0a0');
      px(4, 4, 126, 42, '#8f8c86');
      for (let i = 0; i < 220; i++) px(4 + Math.floor(rnd() * 126), 4 + Math.floor(rnd() * 42), 1, 1, rnd() < 0.5 ? '#7e7b75' : '#a09c95');
      px(1, 1, 132, 1, '#d8d0c0'); px(1, 1, 1, 48, '#d8d0c0');
      // AC unit and a vent stack
      px(96, 12, 22, 16, C.ink); px(97, 13, 20, 14, C.mt3); px(97, 13, 20, 2, C.mt4);
      disc(ctx, 107, 20, 4, C.mt1); disc(ctx, 107, 20, 2, C.mt0);
      px(24, 16, 6, 8, C.ink); px(25, 16, 4, 7, C.mt2); px(25, 16, 1, 7, C.mt3);
      // the front wall
      px(0, 49, 134, 38, C.ink);
      px(1, 50, 132, 36, C.wl1); px(1, 50, 132, 1, C.wl2);
      px(1, 80, 132, 6, C.br1); px(1, 80, 132, 1, C.br2);        // brick skirting
      for (let x = 5; x < 133; x += 8) px(x, 81, 1, 5, C.br0);
      // sign band
      px(4, 52, 126, 10, C.ink); px(5, 53, 124, 8, C.rd2); px(5, 53, 124, 1, C.rd3);
      pixelText(ctx, 'HWY 29 MART', 45, 55, '#ffffff');
      px(4, 62, 126, 2, '#9a8f78');                              // shadow under the sign
      // windows, either side of the door
      for (const [x0, x1] of [[6, 54], [74, 128]]) {
        px(x0, 65, x1 - x0, 15, C.ink);
        px(x0 + 1, 66, x1 - x0 - 2, 13, C.gl0);
        px(x0 + 1, 66, x1 - x0 - 2, 3, C.gl1);
        for (let x = x0 + 3; x < x1 - 4; x += 9) px(x, 67, 2, 1, C.gl2);
        for (let x = x0 + 12; x < x1 - 2; x += 12) px(x, 66, 1, 13, C.ink);   // mullions
      }
      px(10, 70, 7, 5, C.gd2); px(11, 71, 5, 1, C.rd2);           // posters taped up
      px(84, 70, 8, 6, '#eef1f7'); px(85, 72, 6, 1, C.bl1); px(85, 74, 4, 1, C.bl1);
      // the door (closed): glass in a steel frame, a push bar
      px(57, 63, 14, 23, C.ink);
      px(58, 64, 12, 22, C.mt2);
      px(59, 65, 10, 19, C.gl0); px(59, 65, 10, 4, C.gl1); px(60, 66, 2, 1, C.gl2);
      px(59, 75, 10, 1, C.mt4);
    }),
    solid: { x: 1, y: 8, w: 132, h: 78 }, jumpable: false, hide: false, tall: true,
  };

  return p;
}

/* ============================ SCENE ACTORS ============================ */

// The trucker who never looks in the back of his trailer: red cap, beard,
// flannel, jeans, and a coffee in his hand.
const DR = {
  k: C.ink, C: '#c43a2e', c: '#8a2a22', W: '#eef1f7', H: '#5a3a22', s: '#e3a877', d: '#bd855a',
  e: '#2a2230', B: '#6a4428', b: '#4e3020', F: '#b23a2f', f: '#5a1c18', j: '#3a5a8a', J: '#2a4064',
  o: '#4a3020', w: '#f2f2f2', v: '#6b3a22',
};
const DRIVER_DOWN = [
  '....kkkkk....',
  '...kCCWCCk...',
  '..kCCWWWCCk..',
  '..kcccccccck.',
  '...kssssssk..',
  '...ksesesdk..',
  '...kBsssBdk..',
  '...kBBBBBBk..',
  '..kkFbBBbFkk.',
  '.kFFfFFFfFFk.',
  '.kFfFFFFFfFkw',
  '.ksFFfFFfFFsw',
  '..kFFFFFFFkv.',
  '...kjjjjjjk..',
  '...jjJ..Jjj..',
  '...jjJ..Jjj..',
  '...ooo..ooo..',
];
const DRIVER_UP = [
  '....kkkkk....',
  '...kCCCCCk...',
  '..kCCCCCCCk..',
  '..kcCCCCCck..',
  '...kHHHHHHk..',
  '...kHHHHHHk..',
  '...kHHHHHHk..',
  '...kssssssk..',
  '..kkFFFFFFkk.',
  '.kFFfFFFfFFk.',
  '.kFfFFFFFfFFk',
  '.ksFFfFFfFFsk',
  '..kFFFFFFFFk.',
  '...kjjjjjjk..',
  '...jjJ..Jjj..',
  '...jjJ..Jjj..',
  '...ooo..ooo..',
];
// facing right; left is a mirror
const DRIVER_SIDE = [
  '...kkkkk.....',
  '..kCCCCWk....',
  '.kCCCCWWWk...',
  '.kccccccccck.',
  '..kHHssssk...',
  '..kHHssesk...',
  '..kHssssdk...',
  '..kHBBBBBk...',
  '..kkFFBBkk...',
  '..kFFfFFFk...',
  '.kFFfFFFFFk..',
  '.kFFFfFFswwk.',
  '..kFFFFFkvk..',
  '...kjjjjk....',
  '...jjJjj.....',
  '...jjJjj.....',
  '...oo.ooo....',
];

// The agent on his stomach, head to the right, as he tries to crawl after
// them: one arm reaching past his head, then the other; and at the last,
// head down in the dirt.
const P = {
  k: '#141019', H: '#241a15', h: '#3c2c22', s: '#e3a877', d: '#bd855a', g: '#0b0b12',
  n: '#2b3654', N: '#1b2540', u: '#3e4f74', o: '#15151c',
};
const CRAWL_A = [
  '....................',
  '..........kkkkkkk...',
  '..........knnnnnssk.',
  '..........kkkkkkkk..',
  '....oNNnnnnHHHk.....',
  '..ooNNnnnnnHssk.....',
  '..ooNNnnnnnHssgk....',
  '....oNNnnnnHHHk.....',
  '.......ss...........',
  '....................',
  '....................',
];
const CRAWL_B = [
  '....................',
  '....................',
  '.........ss.........',
  '....................',
  '....oNNnnnnHHHk.....',
  '..ooNNnnnnnHssk.....',
  '..ooNNnnnnnHssgk....',
  '....oNNnnnnHHHk.....',
  '..........kkkkkkkk..',
  '..........knnnnnssk.',
  '..........kkkkkkk...',
];
const HEAD_DOWN = [
  '....................',
  '..........kkkkkkk...',
  '..........knnnnnssk.',
  '..........kkkkkkkk..',
  '....oNNnnnnkHHHk....',
  '..ooNNnnnnnkHhHHk...',
  '..ooNNnnnnnkHHhHk...',
  '....oNNnnnnkHHHk....',
  '..........kkkkkkkk..',
  '..........knnnnnssk.',
  '..........kkkkkkk...',
];
// Mid-zap: the agent lit up like an x-ray, skull, shades and all.
const ZAPPED = [
  '....kkkk....',
  '...kWWWWk...',
  '..kWWWWWWk..',
  '..kWggggWk..',
  '..kWWWWWWk..',
  '...kWkWkk...',
  '....kWWk....',
  '.kBBBWWBBBk.',
  '.kBWWWWWWBk.',
  '.kBBWWWWBBk.',
  '.kBWWWWWWBk.',
  '..kBBWWBBk..',
  '...WW..WW...',
  '...WW..WW...',
  '...WW..WW...',
  '............',
];
const ZAP_PAL = { k: '#0d2a3a', W: '#ffffff', g: '#0b0b12', B: '#7fe3ff' };

// The aliens' shock gun (muzzle to the left, the way they turn to shoot).
const GUN = ['.kkkkk', 'kCmmmk', '.kkmmk', '...kk.'];
const GUN_PAL = { k: C.ink, m: C.mt3, C: C.cy };

export function buildHighwayActors() {
  const driver = {
    down: makeSprite(DRIVER_DOWN, DR),
    up: makeSprite(DRIVER_UP, DR),
    right: makeSprite(DRIVER_SIDE, DR),
    left: flipX(makeSprite(DRIVER_SIDE, DR)),
  };
  return {
    driver,
    crawl: [makeSprite(CRAWL_A, P), makeSprite(CRAWL_B, P)],
    headDown: makeSprite(HEAD_DOWN, P),
    zapped: makeSprite(ZAPPED, ZAP_PAL),
    gun: makeSprite(GUN, GUN_PAL),
    semi: buildSemi(),
    car: buildCar(),
  };
}

/* ---- the semi ---- */
// Heading north, so from up here it's the cab's roof and stacks, the long
// armoured roof of the trailer, and the trailer's back doors facing us.
// Three frames of those doors: open (a black hold), swinging, shut.
// Image 38 x 150; the body is 32 wide from x = 3; the ground line at the
// back is y = 146 (`base`).
const SEMI_W = 38, SEMI_H = 150;
const BK = ['#0e1015', '#15171d', '#1b1e26', '#242832', '#2f3440', '#3b4250'];   // black steel, dark to lit

function buildSemi() {
  const frame = (doors) => art(SEMI_W, SEMI_H, (px) => {
    // ---- cab ----
    px(2, 5, 3, 8, C.ink); px(33, 5, 3, 8, C.ink);                // front tyres showing past the body
    px(8, 0, 22, 12, C.ink);
    px(9, 1, 20, 3, C.mt3); px(9, 1, 20, 1, C.mt4);               // push bar across the nose
    px(9, 4, 20, 7, BK[2]); px(9, 4, 20, 1, BK[4]);               // hood
    px(4, 10, 30, 19, C.ink);
    px(5, 11, 28, 3, '#1e2a38'); px(6, 11, 6, 1, C.gl0);          // tinted glass, top edge of the windscreen
    px(5, 14, 28, 14, BK[2]); px(5, 14, 28, 1, BK[4]); px(5, 14, 1, 14, BK[3]);
    px(9, 16, 20, 9, BK[3]); px(9, 16, 20, 1, BK[5]);             // roof fairing
    px(31, 15, 2, 13, BK[0]);
    // mirrors on stalks
    px(0, 11, 5, 4, C.ink); px(1, 12, 2, 2, C.mt2);
    px(33, 11, 5, 4, C.ink); px(35, 12, 2, 2, C.mt1);
    // chrome stacks at the back corners of the cab
    for (const x of [4, 32]) { px(x, 5, 3, 24, C.ink); px(x + 1, 6, 1, 22, C.mt4); px(x + 1, 6, 1, 2, C.mt1); }
    // ---- the gap and the trailer's roof ----
    px(6, 29, 26, 3, BK[0]);
    px(3, 31, 32, 94, C.ink);
    px(4, 32, 30, 92, BK[1]);
    px(4, 32, 2, 92, BK[3]); px(32, 32, 2, 92, BK[0]);
    for (let y = 44; y < 122; y += 13) { px(4, y, 30, 1, BK[0]); px(4, y + 1, 30, 1, BK[3]); }   // plate seams
    for (let y = 34; y < 122; y += 4) { px(5, y, 1, 1, BK[5]); px(32, y, 1, 1, BK[4]); }         // rivets
    for (const y of [52, 92]) { px(12, y, 14, 9, C.ink); px(13, y + 1, 12, 7, BK[2]); px(13, y + 1, 12, 1, BK[4]); }  // roof hatches
    px(1, 104, 2, 12, C.ink); px(35, 104, 2, 12, C.ink);          // rear tyres past the body
    // ---- the back of the trailer ----
    px(3, 124, 32, 23, C.ink);
    px(4, 125, 30, 3, BK[3]); px(4, 125, 30, 1, BK[5]);           // header
    for (const x of [8, 18, 28]) px(x, 126, 2, 1, '#ffb35e');      // marker lights
    if (doors === 'open') {
      px(4, 128, 30, 16, '#050508');                               // the hold, black
      px(7, 131, 7, 6, '#0d0e13'); px(7, 131, 7, 1, '#15161c');    // cargo far inside
      px(22, 130, 8, 7, '#0d0e13'); px(22, 130, 8, 1, '#15161c');
      px(4, 141, 30, 3, '#121319'); px(4, 141, 30, 1, '#1a1b22');  // floor
      // the doors swung right back against the sides
      px(0, 127, 4, 18, C.ink); px(1, 128, 2, 16, BK[3]); px(1, 131, 2, 1, C.mt3); px(1, 139, 2, 1, C.mt3);
      px(34, 127, 4, 18, C.ink); px(35, 128, 2, 16, BK[2]); px(35, 131, 2, 1, C.mt2); px(35, 139, 2, 1, C.mt2);
    } else if (doors === 'half') {
      px(4, 128, 30, 16, '#050508');
      px(4, 141, 30, 3, '#121319');
      px(1, 127, 9, 18, C.ink); px(2, 128, 7, 16, BK[3]); px(3, 130, 1, 12, C.mt3);
      px(28, 127, 9, 18, C.ink); px(29, 128, 7, 16, BK[2]); px(34, 130, 1, 12, C.mt2);
    } else {
      px(4, 128, 30, 16, BK[2]);
      px(18, 128, 2, 16, C.ink);                                   // the seam between the doors
      for (const x of [8, 13, 23, 28]) { px(x, 128, 1, 16, C.mt2); px(x, 131, 2, 1, C.mt3); px(x, 139, 2, 1, C.mt3); }
      px(5, 129, 12, 1, BK[4]); px(21, 129, 12, 1, BK[4]);
    }
    px(4, 142, 3, 2, '#d8303e'); px(31, 142, 3, 2, '#d8303e');   // tail lights
    // under-ride guard and the rear wheels under it
    px(3, 144, 32, 3, C.ink); px(4, 145, 30, 1, C.mt2); px(4, 144, 30, 1, C.mt3);
    px(5, 147, 8, 3, '#0c0d12'); px(25, 147, 8, 3, '#0c0d12');
  });
  return {
    open: frame('open'), half: frame('half'), closed: frame('closed'),
    w: SEMI_W, h: SEMI_H, base: 146, body: 3,
    exhaust: [{ x: 5, y: 5 }, { x: 33, y: 5 }],   // stack tips
    cabDoor: { x: 3, y: 14 },                      // driver's door hinge, west side
  };
}

/* ---- a car on the highway ---- */
// Southbound, so its nose is toward us: roof, windscreen, hood and grille.
function buildCar() {
  return art(20, 34, (px) => {
    const B = ['#1f4f5a', '#2e6f7c', '#3e8f9c', '#6cb8c4'];
    px(3, 3, 3, 6, C.ink); px(14, 3, 3, 6, C.ink); px(3, 24, 3, 6, C.ink); px(14, 24, 3, 6, C.ink);   // tyres
    px(1, 1, 18, 32, C.ink);
    px(2, 2, 16, 4, B[1]); px(2, 2, 16, 1, B[2]);                 // boot lid
    px(3, 6, 14, 4, '#1e2a38'); px(4, 6, 4, 1, C.gl0);            // rear window
    px(2, 10, 16, 9, B[2]); px(2, 10, 16, 1, B[3]); px(2, 10, 1, 9, B[3]); px(16, 10, 2, 9, B[1]);   // roof
    px(3, 19, 14, 5, C.gl1); px(3, 19, 14, 1, C.gl2); px(4, 20, 3, 1, '#e2f4ff');   // windscreen
    px(2, 24, 16, 5, B[2]); px(2, 24, 16, 1, B[3]); px(9, 25, 1, 3, B[1]);           // hood
    px(2, 29, 16, 3, B[0]);
    px(3, 29, 3, 2, '#fff2c0'); px(14, 29, 3, 2, '#fff2c0');       // headlights
    px(7, 30, 6, 1, '#141019');                                    // grille
    px(2, 32, 16, 1, C.mt3);                                       // bumper
  });
}

/* ============================ GROUND ============================ */
// These paint straight into the ground canvas. Anything that depends on
// where it is works from world coordinates, so the same pixel always comes
// out the same however the woods have been cut into pieces.

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
export const dither = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

// One crown of the canopy seen from above: a round broadleaf or a pine top
// (drawn the same way sprites.js paintForest does, so the woods match the
// forest round the farm). There are only a few sizes, so each is drawn once
// and stamped from then on.
const CROWNS = new Map();
export function drawCrown(ctx, x, y, r, pine) {
  const key = r * 2 + (pine ? 1 : 0);
  let c = CROWNS.get(key);
  if (!c) {
    const R = r + 3;
    const [cv, cx] = canvas(R * 2 + 1, R * 2 + 1);
    paintCrown(cx, R, R, r, pine);
    CROWNS.set(key, c = { cv, R });
  }
  ctx.drawImage(c.cv, x - c.R, y - c.R);
}

function paintCrown(ctx, x, y, r, pine) {
  if (pine) {
    for (let i = 0; i <= r + 2; i++) {
      const half = Math.round(i * 0.75);
      ctx.fillStyle = '#0b1a14'; ctx.fillRect(x - half - 1, y - r + i, half * 2 + 3, 1);
      ctx.fillStyle = '#2f664b'; ctx.fillRect(x - half, y - r + i, half, 1);
      ctx.fillStyle = '#1d4436'; ctx.fillRect(x, y - r + i, half + 1, 1);
    }
    ctx.fillStyle = '#4d8a63'; ctx.fillRect(x - 1, y - r + 2, 1, 2);
  } else {
    disc(ctx, x, y, r + 1, '#0c1f10');
    disc(ctx, x, y, r, C.lf0);
    disc(ctx, x - 1, y - 1, r - 1, C.lf1);
    disc(ctx, x - Math.round(r * 0.3), y - Math.round(r * 0.35), Math.round(r * 0.55), C.lf2);
    ctx.fillStyle = C.lf3;
    ctx.fillRect(x - Math.round(r * 0.5), y - Math.round(r * 0.6), 2, 1);
  }
}
export const CANOPY_FLOOR = '#12301a';

// Litter on the floor of the woods, a world grid cell at a time: fallen
// leaves, twigs, pebbles, a tuft of moss. `amount` 0..1 thins it out.
export function litterCell(ctx, cx, cy, wx, wy, amount) {
  const h = hash(wx * 3 + 7, wy * 5 + 1);
  if (h > amount * 0.9) return;
  const k = hash(wx + 11, wy * 7);
  if (k < 0.45) {                                   // a leaf or two
    const col = LEAVES[Math.floor(hash(wx, wy + 3) * LEAVES.length)];
    ctx.fillStyle = '#34401f'; ctx.fillRect(cx, cy + 1, 2, 1);
    ctx.fillStyle = col; ctx.fillRect(cx, cy, 2, 1);
    if (k < 0.2) { ctx.fillStyle = LEAVES[(Math.floor(k * 40)) % LEAVES.length]; ctx.fillRect(cx + 2, cy + 2, 1, 1); }
  } else if (k < 0.7) {                             // a twig
    const len = 3 + Math.floor(hash(wx, wy) * 3);
    const diag = hash(wy, wx) < 0.5 ? 1 : -1;
    for (let i = 0; i < len; i++) {
      ctx.fillStyle = '#3a2a18'; ctx.fillRect(cx + i, cy + 1 + ((i * diag) >> 1), 1, 1);
      ctx.fillStyle = '#6b4a2e'; ctx.fillRect(cx + i, cy + ((i * diag) >> 1), 1, 1);
    }
  } else if (k < 0.85) {                            // a pebble, lit on top
    ctx.fillStyle = '#4a4438'; ctx.fillRect(cx, cy + 1, 2, 1);
    ctx.fillStyle = '#9a948a'; ctx.fillRect(cx, cy, 2, 1);
  } else {                                          // moss
    ctx.fillStyle = '#56733a'; ctx.fillRect(cx - 1, cy, 4, 1); ctx.fillRect(cx, cy - 1, 2, 1);
    ctx.fillStyle = '#6f9048'; ctx.fillRect(cx, cy - 1, 1, 1);
  }
}

// The pile of leaves in the clearing, raked into a spiral: just leaves on
// the grass, like the ones blowing about round it, only laid out neatly.
// Returned as a decal canvas (32 x 22).
export function spiralLeaves() {
  const [c, ctx] = canvas(32, 22);
  const cx = 16, cy = 11;
  const rnd = mulberry(1729);
  const put = (x, y, col) => {
    x = Math.round(x); y = Math.round(y);
    ctx.fillStyle = '#35752f'; ctx.fillRect(x, y + 1, 2, 1);      // its shadow on the grass
    ctx.fillStyle = col; ctx.fillRect(x, y, 2, 1);
  };
  // an arm winding out 2.5 turns, a couple of leaves deep, heaped a little
  // higher towards the middle
  for (let th = 0.6; th < Math.PI * 5.1; th += 0.2) {
    const r = 0.85 * th + 0.5;
    const x = cx + Math.cos(th) * r, y = cy + Math.sin(th) * r * 0.62;
    put(x - 1 + rnd(), y - 0.5 + rnd() * 0.8, LEAVES[Math.floor(rnd() * LEAVES.length)]);
    if (rnd() < 0.55) put(x + rnd() * 1.5 - 0.5, y - 1, LEAVES[Math.floor(rnd() * 4)]);
  }
  ctx.fillStyle = '#b8903e'; ctx.fillRect(cx - 1, cy - 1, 2, 1);
  ctx.fillStyle = '#8a5a2c'; ctx.fillRect(cx, cy, 2, 1);
  return c;
}

// A few stray leaves blown about on grass (the clearing), same colours as
// the spiral so it isn't the only thing there.
export function strayLeaf(ctx, x, y, seed) {
  ctx.fillStyle = '#35752f'; ctx.fillRect(x, y + 1, 2, 1);
  ctx.fillStyle = LEAVES[Math.floor(hash(seed, 3) * LEAVES.length)]; ctx.fillRect(x, y, 2, 1);
}

/* ---- per-pixel painters ----
   Each takes the pixel's world position and the RGB already there (in
   `out` at `di`) and paints over it; `tex(id)` is a tile's pixel data. */

// Sunlight coming through the canopy onto the floor of the woods, in soft
// dappled patches. `open` 0..1 is how thin the canopy is overhead.
export function dapple(out, di, wx, wy, n, open) {
  const lit = n + open * 0.35;
  if (lit > 0.7 && (lit - 0.7) * 6 > dither(wx, wy)) {
    out[di] = Math.min(255, out[di] * 1.14 + 6);
    out[di + 1] = Math.min(255, out[di + 1] * 1.14 + 8);
    out[di + 2] = Math.min(255, out[di + 2] * 1.08);
  } else if (lit < 0.3 && (0.3 - lit) * 5 > dither(wx + 2, wy + 1)) {
    out[di] *= 0.86; out[di + 1] *= 0.88; out[di + 2] *= 0.9;
  }
}

// The creek: `d` is how far the pixel sits from its middle, `hw` its half
// width; `n` a noise sample for the ripples. Deep water in the middle,
// muddy shallows, a wet bank of mud and pebbles.
export function creekPixel(out, di, wx, wy, d, hw, n, t) {
  const a = Math.abs(d);
  const set = (r, g, b) => { out[di] = r; out[di + 1] = g; out[di + 2] = b; };
  if (a < hw - 3) {
    const deep = 1 - a / hw;
    const r0 = 47 - deep * 10, g0 = 95 - deep * 14, b0 = 138 - deep * 8;
    if (n > 0.66 && (wy + Math.round(wx * 0.4)) % 5 === 0) set(96, 150, 196);
    else if (n < 0.24 && (wy + wx) % 7 === 0) set(34, 72, 108);
    else set(r0, g0, b0);
    // stones on the bottom showing through, and a few breaking the surface
    if (t > 0.985) set(78, 104, 120);
    else if (t > 0.975 && a < hw - 6) set(140, 136, 128);
  } else if (a < hw) {
    set(74, 118, 132);                              // shallows over mud
    if (dither(wx, wy) < 0.4) set(92, 136, 146);
  } else if (a < hw + 5) {
    set(78, 58, 36);                                // wet bank
    if (t > 0.9) set(138, 132, 124);
    else if (t > 0.8) set(96, 74, 46);
  } else if (a < hw + 8) {
    if ((hw + 8 - a) / 3 > dither(wx, wy)) set(86, 66, 42);
  }
}

// Highway 29, the gas station lot and what's round them, from a pixel's
// place across the section (`lx`, px east of where the section starts).
// Returns false if the pixel isn't road or lot.
export const ROAD = {
  verge: 104, shoulderW: 16, asphalt0: 120, asphalt1: 212, lane: 46,
  lot0: 228, lot1: 464, lotY0: 60, lotY1: 396,
};
export function roadPixel(out, di, lx, wy, tex, n, t) {
  const R = ROAD;
  const set = (r, g, b) => { out[di] = r; out[di + 1] = g; out[di + 2] = b; };
  const from = (id, k = 1) => {
    const s = tex(id), si = (((wy & 15) * 16) + (lx & 15)) * 4;
    set(s[si] * k, s[si + 1] * k, s[si + 2] * k);
  };
  const edge = 2 * (n - 0.5);                       // gravel meets grass raggedly
  if (lx >= R.verge + edge && lx < R.asphalt0) {
    from(T.GRAVEL, lx > R.asphalt0 - 3 ? 0.86 : 1);
    return true;
  }
  if (lx >= R.asphalt0 && lx < R.asphalt1) {
    from(T.ASPHALT);
    if (n > 0.72 && dither(lx, wy) < 0.5) set(58, 62, 70);           // patched
    if (t > 0.996) set(34, 36, 42);                                  // cracks
    // paint: white edge lines, a double yellow down the middle (dashes worn)
    const m = R.asphalt0 + R.lane;
    if (lx === R.asphalt0 + 2 || lx === R.asphalt1 - 3) { if (t < 0.93) set(226, 228, 222); }
    if (lx === m - 2 || lx === m + 1) { if (t < 0.95) set(232, 186, 58); }
    return true;
  }
  if (lx >= R.asphalt1 && lx < R.asphalt1 + R.shoulderW) {
    from(T.GRAVEL, lx < R.asphalt1 + 3 ? 0.86 : 1);
    return true;
  }
  if (lx >= R.lot0 && lx < R.lot1 && wy >= R.lotY0 && wy < R.lotY1) {
    from(T.CONCRETE);
    if ((lx - R.lot0) % 40 === 0 || (wy - R.lotY0) % 40 === 0) set(118, 124, 132);   // expansion joints
    if (n < 0.2 && dither(lx, wy) < 0.6) set(96, 100, 106);                            // oil stains
    return true;
  }
  return false;
}
