// Stage 2, Scene 1 art: Quiet Oaks, a sleeping subdivision.
//
//   houseArt()        suburban houses in several builds and colours, each
//                     drawn three ways so the front door always faces its
//                     street: 'front' (door, porch and garage door toward
//                     us), 'back' (the back wall: slider, windows, AC unit;
//                     for a house whose street is behind it) and 'side' (the
//                     gable end toward us, the porch and garage on the end
//                     that faces the street)
//   carArt()          sedans, hatchbacks, SUVs, pickups and minivans, top
//                     down, in any of the four directions a car can face
//   buildQuietOaksProps()  everything else in the yards and on the street:
//                     the oaks (and the big Quiet Oak), hedges, bushes,
//                     fences, sheds, play sets, bins, mailboxes, hydrants,
//                     street lamps, signs, barricades, the entrance monument
//   ground painters   curbs, sidewalks, driveways, walks, decks, pools,
//                     flower beds, the road's paint
//
// Same rules as sprites.js: generated at boot, one light source top-left,
// a 1px near-black outline, colours from the shared material palette where
// one fits. Drawn in daylight colours; the night is laid over the top by the
// game (map.night).
import { C, canvas, mulberry } from './sprites.js';
import { pixelText } from './storyArt.js';

function art(w, h, draw) {
  const [c, ctx] = canvas(w, h);
  const px = (x, y, ww, hh, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), ww, hh); };
  draw(px, ctx);
  return c;
}

// Add the 1px ink outline round everything drawn so far.
function outline(c, col = C.ink) {
  const ctx = c.getContext('2d');
  const { width: w, height: h } = c;
  const d = ctx.getImageData(0, 0, w, h).data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
  ctx.fillStyle = col;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

function hash(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/* ============================ COLOURS ============================ */

// Wall colours: [shade, base, lit] and what goes with them.
export const HOUSE_COLORS = {
  sage: { wall: ['#6f8a6a', '#8fa889', '#a9c0a2'], roof: ['#34363e', '#4a4d58', '#62667a'], trim: '#eef0ea', door: '#8a2f2f', shutter: '#2e4a36' },
  cream: { wall: ['#c2b48c', '#e3d6b0', '#f0e6c8'], roof: ['#4a3228', '#6a4a3a', '#86604c'], trim: '#ffffff', door: '#2a3a5a', shutter: '#3a2a22' },
  blue: { wall: ['#617d9a', '#7f9bb8', '#9db6cf'], roof: ['#2c3038', '#3e4452', '#565e70'], trim: '#f2f4f6', door: '#b8862e', shutter: '#232b3a' },
  brick: { wall: ['#7a3528', '#9a4a3a', '#b4604c'], roof: ['#2b2a32', '#3b3a44', '#53525e'], trim: '#e8e2d6', door: '#1f3a2a', shutter: '#20242c', brick: true },
  yellow: { wall: ['#b8a05a', '#d9c27a', '#ead79a'], roof: ['#433630', '#5a4a42', '#76625a'], trim: '#ffffff', door: '#2f5a6a', shutter: '#2f4a5a' },
  grey: { wall: ['#9a9a92', '#b8b8b0', '#d0d0c8'], roof: ['#3a2a2a', '#4a3a3a', '#644e4c'], trim: '#ffffff', door: '#9a2f3a', shutter: '#30303a' },
  white: { wall: ['#c8c8c2', '#e8e8e4', '#f6f6f2'], roof: ['#22303e', '#2f3a4a', '#465466'], trim: '#ffffff', door: '#2a2a32', shutter: '#2a3550' },
  tan: { wall: [C.wt0, C.wt1, C.wt2], roof: ['#2e3238', '#43484f', '#5a6068'], trim: '#f4ecdc', door: '#5a2430', shutter: '#3a2a22' },
};

const GLASS = ['#1c2a3c', '#2c4058', '#46607e'];          // dark glass: [deep, base, glint]
const LIT = ['#c98a2e', '#ffd27a', '#fff2c0'];             // a light on inside
const CONCRETE = ['#8f9196', '#a9abb0', '#c4c6ca'];

/* ============================ HOUSES ============================ */
// Builds (all sizes in px):
//   ranch     one long storey under a hip roof, garage on the end
//   colonial  two storeys, symmetric windows, a portico over the door,
//             a one-storey garage wing
//   bungalow  one storey, deep gable, a porch across the front on columns
//   cape      one and a half storeys: a steep roof with two dormers
//   split     a two-storey half and a one-storey half with the garage
export const HOUSE_BUILDS = {
  ranch: { mainW: 64, storeys: 1, roof: 'hip', roofH: 20, garage: 30 },
  colonial: { mainW: 60, storeys: 2, roof: 'gable', roofH: 18, garage: 28, portico: true },
  bungalow: { mainW: 68, storeys: 1, roof: 'gable', roofH: 24, garage: 0, porch: true },
  cape: { mainW: 56, storeys: 1, roof: 'gable', roofH: 28, garage: 26, dormers: 2 },
  split: { mainW: 46, storeys: 2, roof: 'gable', roofH: 16, garage: 0, low: 46 },
};

const STOREY = [0, 26, 44];      // wall height by storeys
const WING_H = 24, WING_ROOF = 14;

// A strip of wall material: lap siding, brick, both lit from the top left.
function paintWall(px, x, y, w, h, col) {
  const [lo, base, hi] = col.wall;
  px(x, y, w, h, base);
  if (col.brick) {
    for (let yy = 0; yy < h; yy++) {
      const row = Math.floor(yy / 3), off = row % 2 ? 2 : 0;
      for (let xx = 0; xx < w; xx++) {
        if (yy % 3 === 2 || (xx + off) % 5 === 0) px(x + xx, y + yy, 1, 1, yy % 3 === 2 ? '#c8bfb2' : lo);
        else if (hash(x + xx, y + yy) < 0.08) px(x + xx, y + yy, 1, 1, hi);
      }
    }
  } else {
    for (let yy = 2; yy < h; yy += 3) px(x, y + yy, w, 1, lo);       // lap siding
    px(x, y, w, 1, hi);
  }
  px(x, y, 1, h, hi);                                                 // lit left edge
  px(x + w - 1, y, 1, h, lo);
}

// A window: trim frame, glass (or a light on), muntins, maybe shutters.
function paintWindow(px, x, y, w, h, col, { lit = false, shutters = false } = {}) {
  if (shutters) { px(x - 3, y, 2, h, col.shutter); px(x + w + 1, y, 2, h, col.shutter); }
  px(x - 1, y - 1, w + 2, h + 2, col.trim);
  const g = lit ? LIT : GLASS;
  px(x, y, w, h, g[1]);
  px(x, y, w, 1, g[2]);
  px(x, y + h - 1, w, 1, g[0]);
  if (lit) {
    // a curtain and a lamp shade inside
    px(x, y, 1, h, '#b06a3a'); px(x + w - 1, y, 1, h, '#b06a3a');
    px(x + Math.floor(w / 2) - 1, y + h - 3, 3, 2, '#fff6d8');
  }
  px(x + Math.floor(w / 2), y, 1, h, col.trim);                       // muntins
  if (h > 6) px(x, y + Math.floor(h / 2), w, 1, col.trim);
  px(x - 1, y + h + 1, w + 2, 1, '#00000040');                        // sill shadow
}

// A roof across [x, x+w), from y to y+h (the eave at the bottom). 'hip'
// tucks the ends in; shingle rows, the ridge catching the light.
function paintRoof(px, x, y, w, h, roofCol, kind) {
  const [lo, base, hi] = roofCol;
  for (let yy = 0; yy < h; yy++) {
    const inset = kind === 'hip' ? Math.max(0, Math.round((h - yy) * 0.7) - 2) : 0;
    const xx = x + inset, ww = w - inset * 2;
    if (ww <= 0) continue;
    const row = yy % 4 === 3;
    px(xx, y + yy, ww, 1, row ? lo : base);
    if (yy < 2) px(xx, y + yy, ww, 1, hi);                            // ridge in the light
    px(xx, y + yy, 1, 1, hi);                                         // lit left end
    px(xx + ww - 1, y + yy, 1, 1, lo);
    // a few shingle tabs, deterministic
    for (let k = 0; k < ww; k += 5) if (hash(xx + k, y + yy) < 0.15 && !row) px(xx + k, y + yy, 2, 1, lo);
  }
  px(x, y + h - 1, w, 1, '#1a1a22');                                  // the eave's drip edge
}

// The house's ground floor door with its porch light. Returns the light's
// position (local).
function paintDoor(px, x, y, col, base) {
  const h = base - y;
  px(x - 1, y - 1, 10, h + 1, col.trim);
  px(x, y, 8, h, col.door);
  px(x + 1, y + 1, 6, 1, '#ffffff30');
  px(x + 2, y + 3, 4, 3, GLASS[1]); px(x + 2, y + 3, 4, 1, GLASS[2]);  // the door's window
  px(x + 6, y + Math.floor(h * 0.55), 1, 1, '#e8c860');               // knob
  // the porch light beside it, burning
  px(x + 10, y + 3, 2, 3, '#2a2a30'); px(x + 10, y + 4, 2, 1, '#fff2c0');
  return { x: x + 11, y: y + 4 };
}

// Paneled garage door, a light over it.
function paintGarageDoor(px, x, y, w, base) {
  const h = base - y;
  px(x - 1, y - 1, w + 2, h + 1, '#eef0ea');
  px(x, y, w, h, '#d6d8da');
  for (let yy = 3; yy < h; yy += 4) px(x, y + yy, w, 1, '#a9abb0');
  for (let xx = 4; xx < w - 1; xx += 6) px(x + xx, y + 4, 4, 2, GLASS[1]);
  px(x, y, w, 1, '#f6f6f6');
  px(x, base - 1, w, 1, '#7a7c82');
}

// A house drawn for one facing. Returns { img, solid, windows, door, porch,
// drive } in image-local px: `solid` is the walled footprint; `windows` the
// rects the noise system lights up when someone wakes; `door` where the
// front walk meets the house; `porch` the porch light; `drive` the x-range
// (or y-range for 'side') of the driveway at the garage.
export function houseArt({ build = 'ranch', color = 'sage', facing = 'front', garageSide = 'right', lit = [], seed = 1 }) {
  const B = HOUSE_BUILDS[build], col = HOUSE_COLORS[color];
  if (facing === 'side') return sideHouse(B, col, { garageSide, lit, seed });
  const gw = B.garage, mw = B.mainW;
  const lowW = B.low || 0;
  const W = mw + gw + lowW + 2;
  const wallH = STOREY[B.storeys];
  const H = 6 + B.roofH + wallH + 3;        // 6: headroom for the chimney
  const base = H - 2;                       // y of the wall's foot
  const mainX = 1 + (garageSide === 'left' ? gw + lowW : 0);
  const sideX = garageSide === 'left' ? 1 : 1 + mw;       // garage wing / low half
  const windows = [];
  let door = null, porch = null, drive = null;
  const litSet = new Set(lit);
  let wi = 0;                               // window counter (for `lit`)
  const win = (px, x, y, w, h, opts = {}) => {
    const on = litSet.has(wi++);
    paintWindow(px, x, y, w, h, col, { ...opts, lit: on });
    windows.push({ x, y, w, h, lit: on });
  };

  const img = art(W, H, (px) => {
    // ---- the garage wing or the low half (behind the main mass's edge) ----
    if (gw || lowW) {
      const ww = gw || lowW;
      const lowWall = lowW ? STOREY[1] : WING_H;
      const top = base - lowWall;
      paintRoof(px, sideX, top - WING_ROOF, ww, WING_ROOF, col.roof, 'gable');
      paintWall(px, sideX, top, ww, lowWall, col);
      px(sideX, top, ww, 2, col.wall[0]);                             // eave shadow
      if (facing === 'front') {
        if (gw) {
          paintGarageDoor(px, sideX + 3, top + 6, ww - 6, base);
          drive = { x0: sideX + 2, x1: sideX + ww - 2 };
          px(sideX + Math.floor(ww / 2) - 1, top + 3, 2, 2, '#fff2c0'); // light over the door
        } else {
          win(px, sideX + 6, top + 8, 10, 8, { shutters: true });
          paintGarageDoor(px, sideX + 22, top + 6, ww - 25, base);
          drive = { x0: sideX + 21, x1: sideX + ww - 2 };
        }
      } else {
        win(px, sideX + Math.floor(ww / 2) - 4, top + 8, 8, 7);
        px(sideX + 3, top + 7, 7, base - top - 7, col.door);            // the side door
        px(sideX + 4, top + 9, 5, 3, GLASS[1]);
      }
    }

    // ---- the main mass ----
    const top = base - wallH;
    paintRoof(px, mainX, top - B.roofH, mw, B.roofH, col.roof, B.roof);
    // a chimney poking up at one end
    const chx = garageSide === 'left' ? mainX + mw - 12 : mainX + 6;
    px(chx, top - B.roofH - 5, 7, 9, '#7a3a2e'); px(chx, top - B.roofH - 5, 7, 2, '#9a4a3a'); px(chx + 6, top - B.roofH - 3, 1, 7, '#5a2a22');
    if (B.dormers) {
      for (let d = 0; d < B.dormers; d++) {
        const dx = mainX + Math.round(mw * (d + 1) / (B.dormers + 1)) - 6;
        const dy = top - B.roofH + 7;
        px(dx, dy + 3, 12, 11, col.wall[1]); px(dx, dy + 3, 1, 11, col.wall[2]);
        for (let k = 0; k < 4; k++) px(dx - 1 + k, dy + 3 - k, 14 - k * 2, 1, col.roof[k < 2 ? 2 : 1]);
        if (facing === 'front') win(px, dx + 3, dy + 6, 6, 6);
        else px(dx + 3, dy + 6, 6, 6, GLASS[1]);
      }
    }
    paintWall(px, mainX, top, mw, wallH, col);
    px(mainX, top, mw, 2, col.wall[0]);                               // shadow under the eaves
    const mid = mainX + Math.floor(mw / 2);
    if (facing === 'front') {
      // door: in the middle (colonial, bungalow) or off to one side
      const dx = B.portico || B.porch ? mid - 4 : (garageSide === 'left' ? mainX + 8 : mainX + mw - 18);
      porch = paintDoor(px, dx, base - 16, col, base);
      door = { x: dx + 4, y: base };
      // ground-floor windows either side of the door
      const gy = base - 17;
      for (const wx of B.porch || B.portico ? [mainX + 7, mainX + mw - 19] : (garageSide === 'left' ? [mainX + mw - 34, mainX + mw - 18] : [mainX + 8, mainX + 24])) {
        if (Math.abs(wx + 6 - (dx + 4)) < 12) continue;
        win(px, wx, gy, 12, 10, { shutters: !B.porch });
      }
      if (B.storeys === 2) {
        const uy = top + 5;
        for (const wx of [mainX + 7, mid - 6, mainX + mw - 19]) win(px, wx, uy, 12, 10, { shutters: true });
      }
      if (B.portico) {
        // a little gabled roof over the door on two posts
        px(dx - 4, base - 21, 16, 3, col.trim); px(dx - 4, base - 21, 16, 1, '#ffffff');
        px(dx - 3, base - 18, 2, 16, col.trim); px(dx + 9, base - 18, 2, 16, col.trim);
      }
      if (B.porch) {
        // the porch roof across the front, columns down to the floor
        px(mainX, base - 22, mw, 4, col.roof[1]); px(mainX, base - 22, mw, 1, col.roof[2]);
        px(mainX, base - 18, mw, 1, '#1a1a22');
        for (const cx of [mainX + 2, mainX + 20, mainX + mw - 22, mainX + mw - 4]) px(cx, base - 17, 2, 17, col.trim);
        px(mainX + 1, base - 5, mw - 2, 1, col.trim);                  // the rail
      }
    } else {
      // the back: a slider out to the deck, a back door, windows
      px(mid - 9, base - 18, 18, 18, col.trim);
      px(mid - 8, base - 17, 16, 17, GLASS[1]); px(mid - 8, base - 17, 16, 1, GLASS[2]); px(mid, base - 17, 1, 17, col.trim);
      porch = { x: mid + 11, y: base - 14 };
      px(mid + 10, base - 15, 2, 3, '#2a2a30'); px(mid + 10, base - 14, 2, 1, '#fff2c0');
      door = { x: mid, y: base };
      const gy = base - 17;
      for (const wx of [mainX + 6, mainX + mw - 18]) win(px, wx, gy, 12, 10);
      if (B.storeys === 2) for (const wx of [mainX + 7, mainX + mw - 19]) win(px, wx, top + 5, 12, 10);
      // the air conditioner humming against the wall
      const ax = garageSide === 'left' ? mainX + mw - 12 : mainX + 3;
      px(ax, base - 6, 9, 6, '#9a9ea6'); px(ax, base - 6, 9, 1, '#c4c8ce');
      for (let k = 1; k < 8; k += 2) px(ax + k, base - 4, 1, 3, '#6a6e76');
    }
    // the foundation along the bottom
    px(1, base, W - 2, 2, '#6a6a70');
    px(1, base, W - 2, 1, '#8a8a90');
  });
  outline(img);
  const footD = wallH + 2;
  // where the garage door is along the house (whichever way it faces):
  // the driveway runs up to it
  const garage = gw ? { x0: sideX + 2, x1: sideX + gw - 2 }
    : lowW ? { x0: sideX + 21, x1: sideX + lowW - 2 } : null;
  return {
    img, windows, door, porch, drive, garage, w: W, h: H, mainX, mainW: mw,
    solid: { x: 1, y: H - footD, w: W - 2, h: footD - 1 },
    jumpable: false, hide: false, tall: true,
  };
}

// The gable end of a house toward us; the porch and garage on the end that
// faces the street (`garageSide` = which end that is: 'left' or 'right').
function sideHouse(B, col, { garageSide, lit, seed }) {
  const depth = 58;                                     // how deep the house is, seen side on
  const wallH = STOREY[B.storeys];
  const gable = 14, band = 14;
  const W = depth + 14 + 2, H = band + gable + wallH + 3;
  const base = H - 2;
  const street = garageSide === 'right';
  const x0 = street ? 1 : 15;                           // the house body; the porch sticks out on the street end
  const windows = [];
  let wi = 0;
  const litSet = new Set(lit);
  const win = (px, x, y, w, h) => {
    const on = litSet.has(wi++);
    paintWindow(px, x, y, w, h, col, { lit: on });
    windows.push({ x, y, w, h, lit: on });
  };
  let porch = null;
  const img = art(W, H, (px) => {
    const top = base - wallH;
    // the roof: its two slopes run away from us (up the screen) from the
    // gable's raked edges, the ridge down the middle catching the light
    const [lo, mid, hi] = col.roof;
    const hw = depth / 2 + 2, rx = x0 + depth / 2;
    for (let y = 0; y < band + gable; y++) {
      const inner = y < band ? -1 : Math.round(hw * (y - band + 1) / gable);   // the gable wall's half-width on this row
      for (let x = Math.round(rx - hw); x < Math.round(rx + hw); x++) {
        const d = x - rx;
        if (inner >= 0 && Math.abs(d) < inner) continue;
        const shingle = (y + (d < 0 ? 0 : 2)) % 4 === 3;
        let c = d < 0 ? (shingle ? mid : hi) : (shingle ? lo : mid);
        if (Math.abs(d) < 1) c = hi;                                  // the ridge
        px(x, y, 1, 1, c);
      }
      if (inner >= 0) { px(rx - inner - 1, y, 1, 1, '#1a1a22'); px(rx + inner, y, 1, 1, '#1a1a22'); }   // the raked eaves
    }
    // the gable triangle in the wall colour, with an attic vent
    for (let y = 0; y < gable; y++) {
      const half = Math.round(hw * (y + 1) / gable);
      px(rx - half, band + y, half * 2, 1, col.wall[y % 3 === 2 ? 0 : 1]);
    }
    const cx = x0 + Math.floor(depth / 2);
    px(cx - 3, band + 6, 6, 5, col.trim); px(cx - 2, band + 7, 4, 3, col.wall[0]);
    // the wall
    paintWall(px, x0, top, depth, wallH, col);
    px(x0, top, depth, 1, col.wall[0]);
    win(px, x0 + 8, base - 17, 12, 10);
    win(px, x0 + depth - 20, base - 17, 12, 10);
    if (B.storeys === 2) win(px, cx - 6, top + 5, 12, 10);
    // the porch on the street end: a stoop, the front door seen edge on, the light
    const sx = street ? x0 + depth : 1;
    px(sx, base - 18, 13, 3, col.roof[1]); px(sx, base - 18, 13, 1, col.roof[2]);
    px(street ? sx + 10 : sx + 1, base - 15, 2, 15, col.trim);
    px(street ? sx : sx + 11, base - 15, 2, 15, col.door);
    porch = { x: street ? sx + 5 : sx + 7, y: base - 12 };
    px(porch.x - 1, base - 14, 2, 3, '#2a2a30'); px(porch.x - 1, base - 13, 2, 1, '#fff2c0');
    px(sx, base - 2, 13, 2, CONCRETE[1]); px(sx, base - 2, 13, 1, CONCRETE[2]);
    // foundation
    px(x0, base, depth, 2, '#6a6a70'); px(x0, base, depth, 1, '#8a8a90');
  });
  outline(img);
  const footD = wallH + 2;
  return {
    img, windows, porch, w: W, h: H, body: { x0, x1: x0 + depth }, wallH,
    door: { x: street ? W - 2 : 1, y: base - 6 },
    drive: { y0: base - wallH + 4, y1: base - 2 },      // the garage end of the house, side on
    solid: { x: x0, y: H - footD, w: depth, h: footD - 1 },
    jumpable: false, hide: false, tall: true,
  };
}

/* ============================ CARS ============================ */
// Top down, so a car turned any way round is the same car: every part is
// laid out along the car (u, from the nose) and across it (v), then shaded
// in screen space so the light stays top-left whichever way it faces.
//   face: 'left' | 'right' | 'up' | 'down' (which way the nose points)

export const CAR_TYPES = {
  sedan: { L: 32, Wd: 16, cab: [10, 24], wind: 3, rear: 2 },
  hatch: { L: 28, Wd: 16, cab: [9, 24], wind: 3, rear: 2 },
  suv: { L: 34, Wd: 18, cab: [8, 31], wind: 3, rear: 2, rails: true },
  pickup: { L: 36, Wd: 17, cab: [10, 20], wind: 3, rear: 1, bed: [21, 34] },
  minivan: { L: 34, Wd: 18, cab: [6, 32], wind: 4, rear: 2, slide: true },
};

export const CAR_COLORS = {
  red: ['#7a1e1e', '#b03434', '#d85a50'],
  blue: ['#1e3a6a', '#2f5a9a', '#5a86c4'],
  silver: ['#7a808a', '#a8aeb8', '#d4d8de'],
  white: ['#a8acb4', '#dfe2e6', '#f6f7f8'],
  black: ['#14161c', '#262a32', '#444a56'],
  green: ['#1e4a32', '#2f6e4a', '#4f9a6c'],
  beige: ['#8a7a5a', '#c4b088', '#e0d0aa'],
  maroon: ['#4a1a24', '#6e2834', '#944050'],
};

export function carArt(type = 'sedan', color = 'red', face = 'left') {
  const T = CAR_TYPES[type], K = CAR_COLORS[color];
  const { L, Wd } = T;
  const horiz = face === 'left' || face === 'right';
  const w = (horiz ? L : Wd) + 2, h = (horiz ? Wd : L) + 2;
  // screen pixel -> (u along from the nose, v across)
  const toLocal = (x, y) => {
    const X = x - 1, Y = y - 1;
    if (face === 'left') return [X, Y];
    if (face === 'right') return [L - 1 - X, Y];
    if (face === 'up') return [Y, X];
    return [L - 1 - Y, X];                                    // down: nose at the bottom
  };
  const part = (u, v) => {
    if (u < 0 || v < 0 || u >= L || v >= Wd) return null;
    // rounded corners
    const cu = Math.min(u, L - 1 - u), cv = Math.min(v, Wd - 1 - v);
    if (cu + cv < 2) return null;
    // wheels show just past the body's sides
    const wheel = (u >= 4 && u <= 8) || (u >= L - 9 && u <= L - 5);
    if ((v === 0 || v === Wd - 1)) return wheel ? 'wheel' : null;
    if (u <= 1 && (v === 2 || v === Wd - 3)) return 'head';
    if (u >= L - 2 && (v === 2 || v === Wd - 3)) return 'tail';
    const [c0, c1] = T.cab;
    if (T.bed && u >= T.bed[0] && u <= T.bed[1] && v >= 3 && v <= Wd - 4) return u === T.bed[0] || u === T.bed[1] || v === 3 || v === Wd - 4 ? 'bedrim' : 'bed';
    if (u >= c0 && u <= c1 && v >= 2 && v <= Wd - 3) {
      if (u < c0 + T.wind) return 'glassF';
      if (u > c1 - T.rear) return 'glassR';
      if (v === 2 || v === Wd - 3) return 'glassS';
      if (T.rails && (v === 4 || v === Wd - 5)) return 'rail';
      return 'roof';
    }
    if (T.slide && u === Math.round((c0 + c1) / 2) && (v === 1 || v === Wd - 2)) return 'seam';
    if (u >= 3 && u < c0 - 1 && (v === Math.floor(Wd / 2) - 2 || v === Math.ceil(Wd / 2) + 1)) return 'seam';   // creases down the hood
    return 'body';
  };
  const img = art(w, h, (px) => {
    const at = (x, y) => { const [u, v] = toLocal(x, y); return part(u, v); };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = at(x, y);
        if (!p) continue;
        let c;
        switch (p) {
          case 'wheel': c = '#0c0d12'; break;
          case 'head': c = '#fff2c0'; break;
          case 'tail': c = '#d8303e'; break;
          case 'glassF': c = GLASS[2]; break;
          case 'glassR': c = GLASS[1]; break;
          case 'glassS': c = GLASS[0]; break;
          case 'rail': c = '#2a2a30'; break;
          case 'bed': c = '#1a1c22'; break;
          case 'bedrim': c = K[0]; break;
          case 'seam': c = K[0]; break;
          default: {
            // lit from the top left: edges facing up or left catch it
            const up = at(x, y - 1), lf = at(x - 1, y), dn = at(x, y + 1), rt = at(x + 1, y);
            const same = (q) => q === p;
            if (!same(up) || !same(lf)) c = K[2];
            else if (!same(dn) || !same(rt)) c = K[0];
            else c = K[1];
            if (p === 'roof' && c === K[1] && hash(x, y) < 0.04) c = K[2];
          }
        }
        px(x, y, 1, 1, c);
      }
    }
  });
  outline(img);
  return {
    img, w, h, face, type, color,
    solid: { x: 1, y: 1, w: w - 2, h: h - 2 },
    jumpable: false, hide: true, tall: false,
  };
}

/* ============================ PROPS ============================ */

// Small helper for hand-drawn props: draw, then outline.
function prop(w, h, draw, rest) {
  return { img: outline(art(w, h, draw)), ...rest };
}

// A round broadleaf crown: a lumpy disc lit from the top left, darker
// clusters bottom right, a few bright leaves.
function crown(px, cx, cy, r, ramp, seed) {
  const rnd = mulberry(seed);
  const lumps = Array.from({ length: 9 }, (_, i) => {
    const a = i / 9 * Math.PI * 2 + rnd() * 0.4;
    return { x: cx + Math.cos(a) * r * 0.62, y: cy + Math.sin(a) * r * 0.55, r: r * (0.42 + rnd() * 0.12) };
  });
  lumps.push({ x: cx, y: cy, r: r * 0.7 });
  const inside = (x, y) => lumps.some(l => (x - l.x) ** 2 + ((y - l.y) * 1.08) ** 2 <= l.r * l.r);
  for (let y = Math.floor(cy - r * 1.2); y <= cy + r * 1.2; y++) {
    for (let x = Math.floor(cx - r * 1.2); x <= cx + r * 1.2; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      const lx = (x - cx) / r, ly = (y - cy) / r;
      const lit = -lx * 0.6 - ly * 0.8 + (hash(x >> 1, y >> 1) - 0.5) * 0.5;
      const c = lit > 0.55 ? ramp[4] : lit > 0.15 ? ramp[3] : lit > -0.3 ? ramp[2] : lit > -0.7 ? ramp[1] : ramp[0];
      px(x, y, 1, 1, c);
    }
  }
}

// Oak leaves: a deeper, browner green than the farm's trees.
const OAK = ['#1a3a1e', '#24502a', '#336a36', '#4a8644', '#6aa25a'];
const MAPLE = ['#1c3f22', '#2a5a2c', '#3c7a3a', '#56984c', '#7ab866'];

export function buildQuietOaksProps() {
  const p = {};

  // ---- trees ----
  const tree = (w, h, r, trunkW, ramp, seed) => prop(w, h, (px) => {
    const cx = Math.floor(w / 2);
    px(cx - Math.floor(trunkW / 2), h - Math.round(r * 1.1) - 6, trunkW, Math.round(r * 1.1) + 4, C.wd1);
    px(cx - Math.floor(trunkW / 2), h - Math.round(r * 1.1) - 6, 1, Math.round(r * 1.1) + 4, C.wd2);
    px(cx + Math.ceil(trunkW / 2) - 1, h - Math.round(r * 1.1) - 6, 1, Math.round(r * 1.1) + 4, C.wd0);
    px(cx - Math.floor(trunkW / 2) - 2, h - 3, trunkW + 4, 2, C.wd0);              // the root flare
    crown(px, cx, r + 2, r, ramp, seed);
  }, {
    solid: { x: Math.floor(w / 2) - Math.ceil(trunkW / 2) - 1, y: h - 7, w: trunkW + 2, h: 5 },
    jumpable: false, hide: false, tall: true,
  });
  p.oak = tree(44, 52, 19, 6, OAK, 11);
  p.oak2 = tree(40, 48, 17, 5, OAK, 23);
  p.maple = tree(28, 36, 12, 4, MAPLE, 37);
  p.maple2 = tree(26, 34, 11, 4, MAPLE, 41);
  // the Quiet Oak: the old giant on the island the street goes round
  p.quietOak = tree(84, 96, 37, 12, OAK, 53);

  // ---- hedges and shrubs ----
  const hedge = (w, h, seed) => prop(w, h, (px) => {
    for (let y = 2; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const top = y < 4 && hash(x >> 1, seed) < 0.45;
        if (y === 2 && hash(x, seed + 1) < 0.5) continue;
        const lit = (y < 5 ? 1 : 0) + (x < 3 ? 1 : 0) - (y > h - 4 ? 1 : 0) - (x > w - 3 ? 1 : 0);
        const c = top ? C.lf4 : lit > 0 ? C.lf3 : lit < 0 ? C.lf1 : (hash(x, y + seed) < 0.12 ? C.lf3 : C.lf2);
        px(x, y, 1, 1, c);
      }
    }
  }, { solid: { x: 1, y: 4, w: w - 2, h: h - 5 }, jumpable: true, hide: true, tall: false });
  p.hedgeH = hedge(32, 14, 3);
  p.hedgeShort = hedge(20, 14, 5);
  p.hedgeV = prop(12, 32, (px) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 12; x++) {
      const lit = (x < 3 ? 1 : 0) + (y < 3 ? 1 : 0) - (x > 8 ? 1 : 0) - (y > 28 ? 1 : 0);
      px(x, y, 1, 1, lit > 0 ? C.lf3 : lit < 0 ? C.lf1 : (hash(x, y) < 0.14 ? C.lf3 : C.lf2));
    }
  }, { solid: { x: 1, y: 2, w: 10, h: 29 }, jumpable: true, hide: true, tall: false });
  const shrub = (w, h, ramp, seed, flowers) => prop(w, h, (px) => {
    crown(px, w / 2, h / 2 + 1, Math.min(w, h) / 2 - 1, ramp, seed);
    if (flowers) for (let i = 0; i < 6; i++) px(2 + Math.floor(hash(i, seed) * (w - 4)), 2 + Math.floor(hash(seed, i) * (h - 5)), 1, 1, flowers[i % flowers.length]);
  }, { solid: { x: 2, y: Math.floor(h / 2) - 1, w: w - 4, h: Math.ceil(h / 2) }, jumpable: true, hide: true, tall: false });
  p.shrub = shrub(16, 13, [C.lf0, C.lf1, C.lf2, C.lf3, C.lf4], 7);
  p.shrubFlower = shrub(16, 13, [C.lf0, C.lf1, C.lf2, C.lf3, C.lf4], 9, ['#e8607a', '#f0d070', '#ffffff']);
  p.azalea = shrub(18, 14, ['#3a1a2a', '#5a2a40', '#8a3a5a', '#b45a7a', '#d880a0'], 13);

  // ---- fences ----
  // white pickets, low enough to hop
  p.picketH = prop(16, 11, (px) => {
    px(0, 4, 16, 1, '#c8ccd2'); px(0, 8, 16, 1, '#c8ccd2');
    for (let x = 0; x < 16; x += 4) { px(x + 1, 1, 2, 10, '#f2f4f6'); px(x + 2, 0, 1, 1, '#f2f4f6'); px(x + 2, 1, 1, 10, '#c8ccd2'); }
  }, { solid: { x: 0, y: 4, w: 16, h: 6 }, jumpable: true, hide: false, tall: false });
  p.picketV = prop(6, 16, (px) => {
    px(2, 0, 2, 16, '#f2f4f6'); px(3, 0, 1, 16, '#c8ccd2');
    for (let y = 1; y < 16; y += 5) px(1, y, 4, 2, '#f2f4f6');
  }, { solid: { x: 1, y: 0, w: 4, h: 16 }, jumpable: true, hide: false, tall: false });
  // a backyard privacy fence: tall cedar boards
  p.privacyH = prop(16, 20, (px) => {
    for (let x = 0; x < 16; x++) {
      const k = x % 4;
      px(x, (x % 4 === 1 ? 0 : 1), 1, 19, k === 0 ? C.wd1 : k === 1 ? C.wd4 : C.wd3);
    }
    px(0, 5, 16, 1, C.wd1); px(0, 14, 16, 1, C.wd1);
  }, { solid: { x: 0, y: 13, w: 16, h: 6 }, jumpable: true, hide: false, tall: true });
  p.privacyV = prop(6, 20, (px) => {
    px(1, 0, 4, 20, C.wd3); px(1, 0, 1, 20, C.wd4); px(4, 0, 1, 20, C.wd1);
    for (let y = 3; y < 20; y += 6) px(1, y, 4, 1, C.wd1);
  }, { solid: { x: 1, y: 4, w: 4, h: 16 }, jumpable: true, hide: false, tall: true });

  // ---- backyards ----
  p.shed = prop(34, 34, (px) => {
    // gambrel roof, board walls, double doors, a little window
    for (let y = 0; y < 12; y++) {
      const inset = y < 4 ? 4 - y : 0;
      px(1 + inset, y, 32 - inset * 2, 1, y < 2 ? '#7a8a6a' : y % 3 === 2 ? '#4a5a42' : '#5e6e54');
    }
    px(1, 11, 32, 1, '#1a1a22');
    for (let x = 2; x < 32; x++) px(x, 12, 1, 20, x % 3 === 0 ? '#8a6a4a' : '#b08a5e');
    px(2, 12, 30, 1, '#c8a070');
    px(9, 15, 16, 17, '#f2f0ea'); px(10, 16, 6, 16, '#a07a50'); px(18, 16, 6, 16, '#a07a50');
    px(16, 16, 2, 16, '#f2f0ea');
    px(11, 18, 4, 1, '#f2f0ea'); px(19, 18, 4, 1, '#f2f0ea');                     // the X bracing
    px(27, 15, 4, 4, GLASS[1]); px(27, 15, 4, 1, GLASS[2]);
  }, { solid: { x: 2, y: 18, w: 30, h: 14 }, jumpable: false, hide: true, tall: true });
  p.swingSet = prop(44, 32, (px) => {
    // A-frame ends, the top bar, two swings and a slide off the end
    px(2, 3, 40, 2, '#c84040'); px(2, 3, 40, 1, '#e86060');
    for (const x of [3, 39]) { px(x - 2, 5, 2, 25, '#a8aeb8'); px(x + 1, 5, 2, 25, '#7a808a'); }
    for (const [x, len] of [[14, 18], [26, 18]]) {
      px(x, 5, 1, len, '#4a4a52'); px(x + 5, 5, 1, len, '#4a4a52');
      px(x - 1, 5 + len, 8, 2, '#2a2a32'); px(x, 5 + len, 6, 1, '#ffd75e');
    }
  }, { solid: { x: 1, y: 26, w: 42, h: 4 }, jumpable: true, hide: false, tall: true });
  p.trampoline = prop(36, 22, (px) => {
    const cx = 18, cy = 10, rx = 16, ry = 8;
    for (let y = 0; y < 22; y++) for (let x = 0; x < 36; x++) {
      const q = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (q <= 1) px(x, y, 1, 1, q > 0.78 ? '#2f6aa8' : (x + y) % 6 === 0 ? '#2a2a32' : '#1a1a22');
    }
    for (const x of [6, 18, 30]) px(x, 17, 2, 5, '#7a808a');                        // legs
  }, { solid: { x: 4, y: 6, w: 28, h: 10 }, jumpable: true, hide: true, tall: false });
  p.doghouse = prop(20, 20, (px) => {
    for (let y = 0; y < 7; y++) px(9 - y - 1, y, (y + 1) * 2 + 2, 1, y < 2 ? '#a83a30' : '#8a2f26');
    px(2, 7, 16, 12, '#c49a6a'); px(2, 7, 16, 1, '#d8b484'); px(2, 7, 1, 12, '#d8b484');
    px(7, 11, 6, 8, '#1a140e'); px(7, 11, 6, 1, '#2a2018');
    px(5, 9, 10, 1, '#8a6a4a');
  }, { solid: { x: 2, y: 11, w: 16, h: 8 }, jumpable: false, hide: true, tall: false });
  p.kiddiePool = prop(22, 12, (px) => {
    for (let y = 0; y < 12; y++) for (let x = 0; x < 22; x++) {
      const q = ((x + 0.5 - 11) / 11) ** 2 + ((y + 0.5 - 6) / 6) ** 2;
      if (q <= 1) px(x, y, 1, 1, q > 0.7 ? '#e86090' : q < 0.2 ? '#9ad8f0' : '#5ab0d8');
    }
  }, { solid: { x: 2, y: 2, w: 18, h: 8 }, jumpable: true, hide: false, tall: false });
  p.patioSet = prop(22, 16, (px) => {
    px(6, 2, 10, 2, '#e8e2d6'); px(10, 4, 2, 6, '#7a808a');                         // umbrella table
    for (let i = 0; i < 12; i++) px(5 + i % 12, 0, 1, 2, i % 2 ? '#c84040' : '#f2f0ea');
    px(4, 8, 14, 3, '#7a808a'); px(4, 8, 14, 1, '#a8aeb8');
    for (const x of [0, 18]) { px(x, 9, 4, 5, '#4a5a6a'); px(x, 9, 4, 1, '#6a7a8a'); }
  }, { solid: { x: 4, y: 8, w: 14, h: 4 }, jumpable: true, hide: false, tall: false });
  p.gnome = prop(7, 11, (px) => {
    px(2, 0, 3, 1, '#c84040'); px(1, 1, 5, 3, '#c84040'); px(2, 4, 3, 2, '#f0c8a0');
    px(1, 6, 5, 3, '#2f5a9a'); px(2, 5, 3, 2, '#f2f2f2'); px(1, 9, 5, 1, '#3a2a1a');
  }, { jumpable: true, hide: false, tall: false });
  p.bike = prop(18, 10, (px) => {
    for (const cx of [4, 13]) for (let a = 0; a < 16; a++) px(cx + Math.round(Math.cos(a / 16 * Math.PI * 2) * 3), 5 + Math.round(Math.sin(a / 16 * Math.PI * 2) * 3), 1, 1, '#2a2a32');
    px(4, 4, 9, 1, '#3a8ad8'); px(8, 2, 1, 3, '#3a8ad8'); px(7, 1, 3, 1, '#2a2a32'); px(12, 2, 1, 3, '#3a8ad8'); px(11, 1, 3, 1, '#a8aeb8');
  }, { jumpable: true, hide: false, tall: false });
  p.hoop = prop(16, 40, (px) => {
    px(7, 8, 2, 31, '#7a808a'); px(7, 8, 1, 31, '#a8aeb8');
    px(1, 0, 14, 9, '#f2f4f6'); px(4, 3, 8, 4, '#e86040'); px(5, 4, 6, 2, '#f2f4f6');
    px(5, 9, 6, 1, '#e86040'); for (let x = 5; x < 11; x += 2) px(x, 10, 1, 3, '#d8dce2');
  }, { solid: { x: 5, y: 35, w: 6, h: 4 }, jumpable: false, hide: false, tall: true });

  // ---- the curb ----
  p.mailbox = prop(12, 18, (px) => {
    px(5, 8, 2, 10, C.wd1); px(5, 8, 1, 10, C.wd3);
    px(1, 2, 10, 7, '#2a2a32'); px(2, 1, 8, 1, '#2a2a32'); px(2, 2, 8, 2, '#4a4a56'); px(1, 8, 10, 1, '#14141a');
    px(10, 2, 1, 4, '#d8303e'); px(9, 2, 1, 1, '#d8303e');                          // the flag
  }, { solid: { x: 4, y: 13, w: 4, h: 4 }, jumpable: false, hide: false, tall: true });
  const bin = (body, hi, lo, lid) => prop(11, 15, (px) => {
    px(1, 1, 9, 3, lid); px(1, 1, 9, 1, hi);
    px(1, 4, 9, 9, body); px(1, 4, 1, 9, hi); px(9, 4, 1, 9, lo); px(2, 6, 7, 1, lo);
    px(1, 13, 3, 2, '#0c0d12'); px(7, 13, 3, 2, '#0c0d12');
  }, { solid: { x: 1, y: 6, w: 9, h: 8 }, jumpable: false, hide: true, tall: false });
  p.binTrash = bin('#2f5a3a', '#4f8a5a', '#1e3a26', '#25482e');
  p.binRecycle = bin('#2f5a9a', '#5a86c4', '#1e3a6a', '#264c84');
  p.hydrant = prop(10, 13, (px) => {
    px(2, 3, 6, 9, '#c83030'); px(2, 3, 1, 9, '#e85a50'); px(7, 3, 1, 9, '#8a1e1e');
    px(3, 1, 4, 2, '#c83030'); px(4, 0, 2, 1, '#e85a50');
    px(0, 6, 10, 2, '#c83030'); px(0, 6, 10, 1, '#e85a50');
    px(1, 12, 8, 1, '#8a1e1e');
  }, { solid: { x: 2, y: 8, w: 6, h: 4 }, jumpable: false, hide: false, tall: false });
  // a street lamp on the verge: a pole, an arm out over the road, the head
  const lamp = (armDir) => prop(22, 44, (px) => {
    const pole = armDir > 0 ? 4 : 16;
    px(pole, 4, 2, 39, '#4a4e58'); px(pole, 4, 1, 39, '#7a808a');
    px(pole - 1, 41, 4, 2, '#2a2a32');
    const hx = armDir > 0 ? pole + 8 : pole - 8;
    for (let i = 0; i < 9; i++) px(pole + armDir * i, 3 - (i > 6 ? 1 : 0), 1, 2, '#4a4e58');
    px(hx - 3, 1, 8, 3, '#2a2a32'); px(hx - 2, 4, 6, 1, '#fff2c0'); px(hx - 1, 4, 4, 2, '#ffe590');
  }, { solid: { x: (armDir > 0 ? 3 : 15), y: 39, w: 4, h: 4 }, jumpable: false, hide: false, tall: true, head: { x: armDir > 0 ? 13 : 9, y: 5 } });
  p.lampR = lamp(1);
  p.lampL = lamp(-1);
  p.stopSign = prop(19, 34, (px, ctx) => {
    px(8, 14, 2, 19, '#7a808a'); px(8, 14, 1, 19, '#a8aeb8');
    for (let y = 0; y < 17; y++) {
      const inset = y < 4 ? 4 - y : y > 12 ? y - 12 : 0;
      px(1 + inset, y, 17 - inset * 2, 1, '#f2f2f2');
      if (y > 0 && y < 16) px(2 + Math.max(0, inset - (y < 4 ? 0 : 0)), y, 15 - inset * 2, 1, '#c82828');
    }
    // STOP, in the 3x5 letters
    ctx.fillStyle = '#f2f2f2';
    const G = { S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'], P: ['##.', '#.#', '##.', '#..', '#..'] };
    let x = 2;
    for (const ch of 'STOP') { G[ch].forEach((r, j) => { for (let i = 0; i < 3; i++) if (r[i] === '#') ctx.fillRect(x + i, 6 + j, 1, 1); }); x += 4; }
  }, { solid: { x: 7, y: 29, w: 4, h: 4 }, jumpable: false, hide: false, tall: true });
  // the corner's street sign: two green blades on a post
  p.streetSign = prop(44, 34, (px, ctx) => {
    px(21, 8, 2, 25, '#7a808a'); px(21, 8, 1, 25, '#a8aeb8');
    px(5, 1, 34, 8, '#2f6e4a'); px(5, 1, 34, 1, '#4f9a6c');
    pixelText(ctx, 'ACORN LN', 6, 3, '#f2f2f2');
    px(1, 10, 42, 8, '#2f6e4a'); px(1, 10, 42, 1, '#4f9a6c');
    pixelText(ctx, 'OAK HOLLOW', 2, 12, '#f2f2f2');
  }, { solid: { x: 20, y: 29, w: 4, h: 4 }, jumpable: false, hide: false, tall: true });
  p.slowSign = prop(14, 32, (px) => {
    px(6, 12, 2, 19, '#7a808a'); px(6, 12, 1, 19, '#a8aeb8');
    for (let y = 0; y < 13; y++) { const half = y < 7 ? y : 12 - y; px(7 - half, y, half * 2 + 1, 1, '#f0c828'); }
    px(5, 5, 1, 3, '#14141a'); px(8, 4, 1, 4, '#14141a'); px(6, 8, 2, 1, '#14141a');   // a running kid
  }, { solid: { x: 5, y: 27, w: 4, h: 4 }, jumpable: false, hide: false, tall: true });
  p.barricade = prop(34, 16, (px) => {
    for (let x = 0; x < 34; x++) px(x, 2, 1, 6, Math.floor((x + 2) / 4) % 2 ? '#f2f2f2' : '#d83030');
    px(0, 2, 34, 1, '#ffffff80');
    for (const x of [3, 29]) px(x, 8, 2, 7, '#7a808a');
    px(15, 0, 3, 2, '#ffb030');
  }, { solid: { x: 0, y: 6, w: 34, h: 8 }, jumpable: true, hide: false, tall: false });

  // ---- the subdivision's entrance: a brick monument wall with the name
  //      on a stone plaque, pillars with lanterns either side ----
  p.monument = prop(96, 34, (px, ctx) => {
    for (let y = 8; y < 32; y++) for (let x = 6; x < 90; x++) {
      const row = Math.floor((y - 8) / 3), off = row % 2 ? 2 : 0;
      px(x, y, 1, 1, (y - 8) % 3 === 2 || (x + off) % 5 === 0 ? '#c8bfb2' : hash(x, y) < 0.1 ? '#b4604c' : '#9a4a3a');
    }
    px(6, 6, 84, 3, '#d8d2c6'); px(6, 6, 84, 1, '#f2ece2');                          // the cap
    for (const x of [0, 84]) {
      px(x, 0, 12, 32, '#8a3a2e'); px(x, 0, 12, 32, '#9a4a3a');
      for (let y = 2; y < 32; y += 3) px(x, y, 12, 1, '#c8bfb2');
      px(x - 1, 0, 14, 3, '#d8d2c6'); px(x - 1, 0, 14, 1, '#f2ece2');
    }
    px(24, 11, 48, 14, '#e2dccf'); px(24, 11, 48, 1, '#f6f2ea'); px(24, 24, 48, 1, '#b8b0a2');   // the plaque
    // QUIET OAKS, in the 3x5 letters, dark bronze
    ctx.fillStyle = '#3a2e22';
    const G = { Q: ['.#.', '#.#', '#.#', '##.', '.##'], U: ['#.#', '#.#', '#.#', '#.#', '###'], I: ['###', '.#.', '.#.', '.#.', '###'],
      E: ['###', '#..', '##.', '#..', '###'], T: ['###', '.#.', '.#.', '.#.', '.#.'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
      A: ['.#.', '#.#', '###', '#.#', '#.#'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], S: ['.##', '#..', '.#.', '..#', '##.'], ' ': ['...', '...', '...', '...', '...'] };
    let x = 28;
    for (const ch of 'QUIET OAKS') { G[ch].forEach((r, j) => { for (let i = 0; i < 3; i++) if (r[i] === '#') ctx.fillRect(x + i, 16 + j, 1, 1); }); x += 4; }
    // a little oak leaf on each side
    for (const lx of [27, 66]) { px(lx, 13, 3, 2, '#4a8644'); px(lx + 1, 12, 1, 1, '#4a8644'); }
  }, { solid: { x: 0, y: 22, w: 96, h: 10 }, jumpable: false, hide: false, tall: true });
  p.lantern = prop(10, 16, (px) => {
    px(2, 0, 6, 2, '#2a2a32'); px(2, 2, 6, 7, '#2a2a32'); px(3, 3, 4, 5, '#ffe590'); px(3, 3, 4, 1, '#fff6d8');
    px(4, 9, 2, 7, '#2a2a32');
  }, { jumpable: true, hide: false, tall: true, head: { x: 5, y: 5 } });

  return p;
}

/* ============================ GROUND ============================ */
// Painted straight into the ground canvas, in world px.

export const GROUND = {
  asphalt: ['#2f333b', '#383d46', '#43484f'],
  concrete: CONCRETE,
  curb: ['#6a6e76', '#b4b8be', '#d4d8dc'],
};

// Asphalt with a little grain (world-space, so it never seams).
export function paintAsphalt(g, x, y, w, h, inside = null) {
  const [a0, a1, a2] = GROUND.asphalt;
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (inside && !inside(xx + 0.5, yy + 0.5)) continue;
      const n = hash(xx, yy);
      g.fillStyle = n < 0.06 ? a2 : n < 0.5 ? a1 : a0;
      g.fillRect(xx, yy, 1, 1);
    }
  }
}

// Concrete slabs with joints every `slab` px along the run.
export function paintConcrete(g, x, y, w, h, { slab = 16, along = 'x' } = {}) {
  const [c0, c1, c2] = CONCRETE;
  g.fillStyle = c1; g.fillRect(x, y, w, h);
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    if (hash(xx * 3, yy) < 0.07) { g.fillStyle = hash(xx, yy * 3) < 0.5 ? c0 : c2; g.fillRect(xx, yy, 1, 1); }
  }
  g.fillStyle = c0;
  if (along === 'x') for (let xx = x + slab; xx < x + w; xx += slab) g.fillRect(xx, y, 1, h);
  else for (let yy = y + slab; yy < y + h; yy += slab) g.fillRect(x, yy, w, 1);
  g.fillStyle = c2; g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, h);
}

// A curb along one edge of the road: the lit top, the face into the road.
export function paintCurb(g, x, y, w, h) {
  const [lo, mid, hi] = GROUND.curb;
  g.fillStyle = mid; g.fillRect(x, y, w, h);
  g.fillStyle = hi; g.fillRect(x, y, w, 1);
  if (w > h) { g.fillStyle = lo; g.fillRect(x, y + h - 1, w, 1); }
  else { g.fillStyle = lo; g.fillRect(x + w - 1, y, 1, h); }
}

// Crosswalk: white bars across the road, `vertical` = bars run up the screen.
export function paintCrosswalk(g, x, y, w, h, vertical) {
  g.fillStyle = '#d8dce2';
  if (vertical) for (let xx = x + 2; xx < x + w - 2; xx += 8) g.fillRect(xx, y, 4, h);
  else for (let yy = y + 2; yy < y + h - 2; yy += 8) g.fillRect(x, yy, w, 4);
}

// A wooden deck off the back of a house.
export function paintDeck(g, x, y, w, h) {
  g.fillStyle = C.wd0; g.fillRect(x - 1, y - 1, w + 2, h + 2);
  for (let yy = y; yy < y + h; yy++) { g.fillStyle = (yy - y) % 4 === 3 ? C.wd1 : (yy - y) % 4 === 0 ? C.wd4 : C.wd3; g.fillRect(x, yy, w, 1); }
  g.fillStyle = C.wd1;
  for (let xx = x + 3; xx < x + w; xx += 11) g.fillRect(xx, y, 1, h);
  g.fillStyle = C.wd4; g.fillRect(x, y + h - 2, w, 1);
}

// An in-ground pool: coping, blue tiles, the water with a glint.
export function paintPool(g, x, y, w, h) {
  g.fillStyle = '#d8d2c6'; g.fillRect(x - 3, y - 3, w + 6, h + 6);
  g.fillStyle = '#f2ece2'; g.fillRect(x - 3, y - 3, w + 6, 1);
  g.fillStyle = '#2a6aa0'; g.fillRect(x, y, w, h);
  g.fillStyle = '#3a8ac8'; g.fillRect(x + 1, y + 2, w - 2, h - 3);
  g.fillStyle = '#5aaee0';
  for (let i = 0; i < w * h / 40; i++) g.fillRect(x + 2 + Math.floor(hash(i, x) * (w - 6)), y + 3 + Math.floor(hash(y, i) * (h - 6)), 3, 1);
  g.fillStyle = '#1e4a78'; g.fillRect(x, y, w, 2);
  // the ladder
  g.fillStyle = '#c4c8ce'; g.fillRect(x + w - 6, y - 2, 1, 5); g.fillRect(x + w - 3, y - 2, 1, 5);
}

// A mulch bed with flowers dotted in it.
export function paintFlowerBed(g, x, y, w, h, seed = 1) {
  g.fillStyle = '#3a2618'; g.fillRect(x, y, w, h);
  g.fillStyle = '#4a321e';
  for (let i = 0; i < w * h / 6; i++) g.fillRect(x + Math.floor(hash(i, seed) * w), y + Math.floor(hash(seed, i) * h), 1, 1);
  const cols = ['#e8607a', '#f0d070', '#f2f2f2', '#b070d8', '#e88a40'];
  for (let i = 0; i < w * h / 14; i++) {
    const fx = x + 1 + Math.floor(hash(i * 7, seed + 3) * (w - 2)), fy = y + 1 + Math.floor(hash(seed + 5, i * 7) * (h - 2));
    g.fillStyle = '#2c6127'; g.fillRect(fx, fy + 1, 1, 1);
    g.fillStyle = cols[Math.floor(hash(i, seed + 9) * cols.length)]; g.fillRect(fx, fy, 1, 1);
  }
}

// Mowed lawn stripes, faint, across a front yard.
export function paintLawnStripes(g, x, y, w, h, along = 'x') {
  g.fillStyle = 'rgba(120, 190, 100, 0.12)';
  if (along === 'x') for (let yy = y; yy < y + h; yy += 8) g.fillRect(x, yy, w, 4);
  else for (let xx = x; xx < x + w; xx += 8) g.fillRect(xx, y, 4, h);
}

// A ring of mulch round a tree's foot.
export function paintMulchRing(g, cx, cy, r) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    if (x * x + (y * 1.4) ** 2 > r * r) continue;
    g.fillStyle = hash(cx + x, cy + y) < 0.3 ? '#4a321e' : '#3a2618';
    g.fillRect(cx + x, cy + y, 1, 1);
  }
}

// An oil stain on a driveway.
export function paintStain(g, cx, cy) {
  g.fillStyle = 'rgba(30, 30, 36, 0.35)';
  g.fillRect(cx - 3, cy - 1, 6, 3); g.fillRect(cx - 2, cy - 2, 4, 5);
}
