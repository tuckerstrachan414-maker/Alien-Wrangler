// Pixel art for Stage 1, Scene 2 (the Barnyard): the big walk-in barn and
// the glass greenhouse, the stone well, everything inside the barn, and the
// mess baked into its floor (straw, mud tracks, dropped tools).
//
// Walk-in buildings are drawn in the same 3/4 view as every other prop: a
// point at ground (x, y) and height z lands on screen at (x, y - z). Each
// building comes in two layers that share one canvas frame:
//   shell : roof + front face. Drawn over everything inside; the game fades
//           it out while the agent is inside so the interior shows.
//   cut   : what's left standing once the shell is gone: wall tops, corner
//           posts and a knee-high stub of the front wall (a doll's-house
//           cutaway), so the building still reads while you're in it.
// The back wall's inner face is a separate y-sorted prop (the nest boxes
// hang on it in the barn), so things standing in front of it sort properly.
//
// Same art bible as sprites.js: one light, top-left; 1px ink outline;
// colours from the shared material palette.
import { C, canvas, mulberry } from './sprites.js';

const TRIM = '#ece5d6', TRIM2 = '#bdb4a2';          // white barn trim + its shade
const STONE = ['#77726c', '#6a655f', '#837d76'];
const MORTAR = '#4a4644';
const STRAW = ['#c8952c', '#e6bb46', '#d9a83a', '#f6da79'];
const MUD = '#3a2616', MUD2 = '#4e3620', MUD3 = '#63482e';
const DUSK = '#1e140c';                               // shadowed barn interior
// weathered galvanised roof, a notch darker than the steel ramp so the
// barn doesn't glare out of the grass
const ROOF = ['#2c3038', '#424852', '#59616d', '#707985', '#8a939e', '#a7afb8'];

function art(w, h, draw) {
  const [c, ctx] = canvas(w, h);
  const px = (x, y, ww, hh, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, ww, hh); };
  draw(px, ctx);
  return c;
}

// 1px pixel line (Bresenham) through a px() painter.
function line(px, x0, y0, x1, y1, col) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    px(x0, y0, 1, 1, col);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function hash(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Red barn siding: vertical boards with a dark seam and a lit edge, a few
// weathered pixels, a stone foundation along the bottom 3 rows.
function sidingColor(x, hgt) {
  if (hgt <= 3) {
    if (hgt === 3) return (x % 7 === 0) ? MORTAR : '#948e86';
    return ((x + (hgt === 2 ? 3 : 0)) % 7 === 0) ? MORTAR : STONE[Math.floor(hash(x >> 2, hgt) * 3)];
  }
  const k = ((x % 6) + 6) % 6;
  if (k === 0) return C.rd0;
  if (k === 1) return C.rd2;
  return hash(x, hgt) < 0.05 ? C.rd0 : C.rd1;
}

/* ============================ THE BIG BARN ============================ */
// Footprint w x d (px), eaves H high, a gambrel roof rising another G to a
// ridge running front to back, so the iconic gable faces the camera.
// south: [a, b) the big doorway in the front wall (local x);
// east:  [a, b) a side door in the east wall (local y).
export function barnArt({ w, d, H, G, t, south, east }) {
  const OV = 4;                                        // roof overhang past the side walls
  const TOP = H + G + 2;                               // room above the footprint
  const W = w + OV * 2, HT = d + TOP;
  const cx = w / 2, half = w / 2 + OV;
  const uOf = (x) => Math.min(1, Math.abs(x + 0.5 - cx) / half);     // 0 ridge .. 1 eave
  const prof = (u) => (u >= 0.5 ? 0.72 * (1 - u) / 0.5 : 0.72 + 0.28 * (0.5 - u) / 0.5);
  const zOf = (x) => Math.round(H + G * prof(uOf(x)));
  const [da, db] = south;
  const DH = 26;                                       // doorway height

  const shell = art(W, HT, (px, ctx) => {
    const P = (x, y, ww, hh, col) => px(x + OV, y + TOP, ww, hh, col);
    const rnd = mulberry(311);

    // ---- roof: corrugated steel, four gambrel facets lit from the left ----
    for (let x = -OV; x < w + OV; x++) {
      const z = zOf(x), u = uOf(x), left = x + 0.5 < cx, lower = u >= 0.5;
      const R = ROOF;
      const [base, rib, lit] = left
        ? (lower ? [R[3], R[2], R[4]] : [R[4], R[3], R[5]])
        : (lower ? [R[1], R[0], R[2]] : [R[2], R[1], R[3]]);
      const seam = lower !== (uOf(x + (left ? 1 : -1)) >= 0.5);       // the gambrel break
      for (let dep = 0; dep < d; dep++) {
        let col = base;
        const k = dep % 6;
        if (k === 0) col = rib; else if (k === 1) col = lit;
        if (seam) col = left ? R[2] : R[0];
        P(x, dep - z, 1, 1, col);
      }
      if (Math.abs(x + 0.5 - cx) < 1) {                               // ridge cap
        for (let dep = 0; dep < d; dep++) P(x, dep - z, 1, 1, left ? R[5] : R[3]);
      }
      P(x, -z - 1, 1, 1, C.ink);                                     // back edge
      // white rake board along the front edge of the roof
      P(x, d - z - 2, 1, 1, TRIM); P(x, d - z - 1, 1, 1, TRIM2);
      if (x === -OV || x === w + OV - 1) for (let dep = -1; dep < d; dep++) P(x, dep - z, 1, 1, C.ink);
    }
    // rust running down the lower slopes
    for (let i = 0; i < 16; i++) {
      const left = rnd() < 0.5;
      const dep = 4 + Math.floor(rnd() * (d - 12));
      const len = 3 + Math.floor(rnd() * 7);
      const x0 = left ? -OV + 2 + Math.floor(rnd() * 20) : w + OV - 3 - Math.floor(rnd() * 20);
      for (let k = 0; k < len; k++) {
        const x = left ? x0 + k : x0 - k;
        if (x < -OV + 1 || x > w + OV - 2) continue;
        if (Math.abs(x + 0.5 - cx) < 3) continue;
        P(x, dep - zOf(x) + (k % 3 === 2 ? 1 : 0), 1, 1, k < 2 ? '#8a5a3e' : '#6e4632');
      }
    }

    // ---- front face: the gable end ----
    for (let x = 0; x < w; x++) {
      const z = zOf(x);
      for (let y = d - z; y < d; y++) {
        const hgt = d - y;
        let col = sidingColor(x, hgt);
        if (hgt > 3) {
          if (y < d - z + 2) col = C.rd0;                             // shadow under the rake
          if (z > H + 3 && (hgt === H || hgt === H + 1)) col = hgt === H + 1 ? TRIM : TRIM2;   // belt trim
          if (x <= 2 || x >= w - 3) col = (x === 2 || x === w - 1 - 2) ? TRIM2 : TRIM;       // corner boards
        }
        if (x === 0 || x === w - 1 || hgt === 1) col = C.ink;
        P(x, y, 1, 1, col);
      }
    }

    // windows either side of the doors
    for (const wx of [18, w - 30]) {
      P(wx, d - 20, 12, 11, TRIM);
      P(wx + 1, d - 19, 10, 9, '#26303e');
      P(wx + 1, d - 19, 10, 3, '#3d5570'); P(wx + 1, d - 19, 3, 2, '#6f8fae');
      P(wx + 5, d - 19, 1, 9, TRIM2); P(wx + 1, d - 15, 10, 1, TRIM2);
      P(wx - 1, d - 9, 14, 1, TRIM2);                                // sill
    }

    // sliding doors, slid open along their rail either side of the opening
    const DW = 22;
    P(da - DW - 3, d - DH - 3, (db - da) + DW * 2 + 6, 2, C.mt1);    // rail
    P(da - DW - 3, d - DH - 3, (db - da) + DW * 2 + 6, 1, C.mt3);
    for (const x0 of [da - DW, db]) {
      P(x0, d - DH - 1, DW, DH - 1, C.ink);
      P(x0 + 1, d - DH, DW - 2, DH - 3, C.rd2);
      for (let k = 4; k < DW - 2; k += 4) P(x0 + k, d - DH + 2, 1, DH - 6, C.rd1);
      // white frame + X brace
      P(x0 + 1, d - DH, DW - 2, 2, TRIM); P(x0 + 1, d - 5, DW - 2, 2, TRIM2);
      P(x0 + 1, d - DH, 2, DH - 3, TRIM); P(x0 + DW - 3, d - DH, 2, DH - 3, TRIM2);
      P(x0 + 1, d - DH / 2 - 2, DW - 2, 1, TRIM);
      line(P, x0 + 3, d - DH + 2, x0 + DW - 4, d - 6, TRIM);
      line(P, x0 + DW - 4, d - DH + 2, x0 + 3, d - 6, TRIM);
      P(x0 + 4, d - DH - 2, 2, 2, C.mt0); P(x0 + DW - 6, d - DH - 2, 2, 2, C.mt0);   // rollers
    }
    // the open doorway: dim, so you can just make out the floor inside
    ctx.clearRect(da + OV, d - DH + TOP, db - da, DH - 1);
    for (let k = 0; k < DH - 1; k++) {
      const a = 0.86 - 0.4 * (k / (DH - 1));
      ctx.fillStyle = `rgba(22, 14, 9, ${a.toFixed(3)})`;
      ctx.fillRect(da + OV, d - DH + TOP + k, db - da, 1);
    }
    P(da - 1, d - DH - 1, db - da + 2, 2, TRIM);                      // header trim
    P(da - 1, d - DH + 1, db - da + 2, 1, C.ink);

    // hayloft door up in the gable, straw poking out under it
    const hx = Math.round(cx) - 9;
    P(hx, d - H - 21, 18, 17, TRIM);
    P(hx + 2, d - H - 19, 14, 13, C.rd0);
    line(P, hx + 2, d - H - 19, hx + 15, d - H - 7, TRIM2);
    line(P, hx + 15, d - H - 19, hx + 2, d - H - 7, TRIM2);
    P(hx + 8, d - H - 19, 1, 13, C.ink);
    for (let k = 0; k < 7; k++) P(hx + 3 + Math.floor(rnd() * 12), d - H - 5, 1, 1 + Math.floor(rnd() * 2), STRAW[k % 4]);
    P(Math.round(cx) - 2, d - H - 25, 4, 2, C.wd1);                   // hay-hook beam
    P(Math.round(cx) - 2, d - H - 25, 4, 1, C.wd3);
    P(Math.round(cx) - 1, d - H - 23, 1, 2, C.mt1);

    // ---- cupola + rooster weathervane on the ridge ----
    const icx = Math.round(cx);
    const ry = Math.round(d * 0.4) - (H + G);
    P(icx - 10, ry - 14, 20, 15, C.ink);
    P(icx - 9, ry - 13, 18, 13, C.rd1);
    P(icx - 9, ry - 13, 18, 1, TRIM); P(icx - 9, ry - 1, 18, 1, TRIM2);
    P(icx - 9, ry - 13, 2, 13, TRIM); P(icx + 7, ry - 13, 2, 13, TRIM2);
    for (const ly of [-10, -8, -6, -4]) { P(icx - 6, ry + ly, 12, 1, C.rd0); P(icx - 6, ry + ly + 1, 12, 1, C.rd2); }  // louvres
    for (let i = 0; i < 8; i++) {
      const hw = 2 + Math.round(i * 1.4);
      P(icx - hw - 1, ry - 22 + i, hw * 2 + 2, 1, C.ink);
      P(icx - hw, ry - 22 + i, hw, 1, ROOF[4]);
      P(icx, ry - 22 + i, hw, 1, ROOF[2]);
    }
    P(icx, ry - 30, 1, 8, C.mt1);                                     // vane pole
    P(icx - 5, ry - 26, 11, 1, C.mt1); P(icx + 5, ry - 27, 1, 3, C.mt1);   // arrow
    P(icx - 5, ry - 27, 1, 1, C.mt1); P(icx - 5, ry - 25, 1, 1, C.mt1);
    const rooster = ['.##....', '###..#.', '.#####.', '..###..', '...#.#.'];
    rooster.forEach((row, ry2) => { for (let k = 0; k < row.length; k++) if (row[k] === '#') P(icx - 3 + k, ry - 35 + ry2, 1, 1, C.ink); });
    P(icx - 3, ry - 35, 1, 1, C.rd2);                                  // comb
  });

  // ---- cutaway: what stands while the shell is faded out ----
  const hc = 8;
  const cut = art(W, HT, (px) => {
    const P = (x, y, ww, hh, col) => px(x + OV, y + TOP, ww, hh, col);
    // side walls: cut on a slant, full height at the back down to knee
    // height at the front, with a gap at the east door
    const hz = (dep) => H - (H - hc) * (dep / (d - t));             // cut height at a depth
    const yTop = (dep) => Math.round(dep - hz(Math.min(dep, d - t)));
    for (const [x0, ea] of [[0, null], [w - t, east]]) {
      for (let dep = 0; dep < d - t; dep++) {
        if (ea && dep >= ea[0] && dep < ea[1]) continue;
        const y0 = yTop(dep), y1 = Math.max(y0 + 1, yTop(dep + 1));
        for (let y = y0; y < y1; y++) {
          P(x0, y, t, 1, C.wd2);
          P(x0 + (x0 ? t - 1 : 0), y, 1, 1, C.ink);
          P(x0 + (x0 ? 0 : t - 1), y, 1, 1, C.wd1);
          P(x0 + 1, y, 1, 1, C.wd3);
          if (dep % 10 === 0 && y === y0) P(x0 + 1, y, t - 2, 1, C.wd1);   // plank ends
        }
      }
      P(x0, yTop(0) - 1, t, 1, C.ink);
      if (ea) {
        P(x0, yTop(ea[0]) - 1, t, 1, C.ink);
        P(x0, yTop(ea[1]), t, 1, C.ink);
      }
    }
    // the front wall, cut down to knee height, with the doorway gap
    for (let x = 0; x < w; x++) {
      if (x >= da && x < db) continue;
      for (let y = d - t - hc; y < d - hc; y++) P(x, y, 1, 1, y === d - t - hc ? C.wd4 : y === d - hc - 1 ? C.wd1 : C.wd2);
      P(x, d - t - hc - 1, 1, 1, C.ink);
      for (let y = d - hc; y < d; y++) {
        const hgt = d - y;
        let col = hgt === 1 ? C.ink : hgt === hc ? C.rd0 : sidingColor(x, hgt);
        if (hgt > 3 && hgt < hc && (x <= 2 || x >= w - 3)) col = TRIM;           // corner boards
        P(x, y, 1, 1, x === 0 || x === w - 1 ? C.ink : col);
      }
      if (x === 0 || x === w - 1) P(x, d - t - hc, 1, t, C.ink);
    }
    for (const x of [da - 1, db]) P(x, d - t - hc - 1, 1, t + hc + 1, C.ink);   // jambs
    // the doorway threshold: a worn sill board
    P(da, d - 3, db - da, 2, C.wd1);
    P(da, d - 3, db - da, 1, C.wd3);
  });

  // top(lx): the roof's upper edge on screen at local x, for "is the agent
  // hidden behind it" checks
  return { shell, cut, ox: -OV, oy: -TOP, top: (lx) => -zOf(Math.max(-OV, Math.min(w + OV - 1, Math.floor(lx)))) - 1 };
}

// The barn's back wall, seen from inside: the timber top of the wall, then
// its inner face with three stacked rows of nest boxes (every one of them
// empty, straw pulled out and hanging), a ladder up to the loft, a coil of
// rope and a lantern on the hooks. Prop spans the wall top + inner face;
// its base is where the wall meets the floor.
export function nestWall(w, H, t) {
  const img = art(w, H + t, (px) => {
    const rnd = mulberry(331);
    // wall top
    px(0, 0, w, t, C.wd2);
    px(0, 0, w, 1, C.wd4);
    px(0, t - 1, w, 1, C.wd1);
    for (let x = 6; x < w; x += 10) px(x, 1, 1, t - 2, C.wd1);
    // inner face: unpainted boards in shadow
    const F = t;
    for (let x = 0; x < w; x++) {
      const k = x % 6;
      const col = k === 0 ? '#34231a' : k === 1 ? '#5e4128' : '#4a3220';
      px(x, F, 1, H, col);
    }
    px(0, F, w, 2, C.wd1); px(0, F, w, 1, C.wd2);                    // top girt
    px(0, F + H - 2, w, 1, '#3a2818'); px(0, F + H - 1, w, 1, '#24180f');   // floor shadow
    for (let i = 0; i < 9; i++) px(Math.floor(rnd() * w), F + 3 + Math.floor(rnd() * (H - 6)), 2, 1, '#3c2818');  // knots

    // ---- the nest boxes: 3 rows, stacked ----
    const cols = 13, x0 = 8, stride = 11;
    for (let r = 0; r < 3; r++) {
      const y = F + 3 + r * 9;
      for (let c = 0; c < cols; c++) {
        const x = x0 + c * stride;
        px(x - 1, y - 1, 12, 9, C.ink);
        px(x, y, 10, 7, C.wd3);
        px(x, y, 10, 1, C.wd4);
        px(x + 1, y + 1, 8, 5, DUSK);                                // inside, in shadow
        // what's left of the bedding: a thin layer, pulled about
        const left = rnd();
        if (left > 0.2) {
          px(x + 1, y + 5, 8, 1, C.gd0);
          for (let k = 0; k < 4; k++) px(x + 1 + Math.floor(rnd() * 8), y + 4, 1, 1, STRAW[Math.floor(rnd() * 3)]);
        }
        if (rnd() < 0.12) line(px, x + 1, y + 1, x + 8, y + 5, C.wd1);   // a split board
      }
      // perch plank under the row, straw hanging over its lip
      px(x0 - 2, y + 7, cols * stride + 2, 1, C.wd4);
      px(x0 - 2, y + 8, cols * stride + 2, 1, '#2c1d12');
      for (let k = 0; k < 16; k++) {
        const sx = x0 + Math.floor(rnd() * (cols * stride - 2));
        px(sx, y + 7, 1, 1 + Math.floor(rnd() * 3), STRAW[Math.floor(rnd() * 4)]);
      }
    }

    // ---- the east end: ladder to the loft, rope and lantern on hooks ----
    const lx = x0 + cols * stride + 8;
    for (const rx of [lx, lx + 8]) { px(rx, F - t, 2, H + t, C.wd3); px(rx + 1, F - t, 1, H + t, C.wd1); }
    for (let y = F - t + 2; y < F + H - 1; y += 4) px(lx + 2, y, 6, 1, C.wd4);
    const rx = lx + 16;
    px(rx + 4, F + 3, 1, 2, C.mt1);                                   // hook
    const coil = ['.####.', '#....#', '#.##.#', '#....#', '.####.', '..##..'];
    coil.forEach((row, ry) => { for (let k = 0; k < 6; k++) if (row[k] === '#') px(rx + 2 + k, F + 5 + ry, 1, 1, ry < 2 ? '#c8aa6a' : '#9a7c44'); });
    const lan = rx + 13;
    if (lan + 5 < w) {
      px(lan + 2, F + 3, 1, 2, C.mt1);
      px(lan, F + 5, 5, 7, C.ink);
      px(lan + 1, F + 6, 3, 5, '#8a7a50');
      px(lan + 1, F + 6, 1, 2, '#c8b878');
      px(lan + 1, F + 12, 3, 1, C.mt1);
    }
    // a horseshoe nailed up for luck, points up
    const hs = rx + 3;
    px(hs, F + 16, 1, 3, C.mt3); px(hs + 4, F + 16, 1, 3, C.mt3); px(hs + 1, F + 19, 3, 1, C.mt3);
  });
  return { img, solid: null, jumpable: false, hide: false, tall: true };
}

/* ============================ THE GREENHOUSE ============================ */
// A glass house with a brick knee wall, white glazing bars and a ridge
// running east-west. The glass is baked in translucent, so you can always
// see in; walking inside fades the frame right back.
// south: [a, b) the front doorway (local x); the back one is cut into
// greenhouseBackWall().
export function greenhouseArt({ w, d, H, G, t, south }) {
  const TOP = H + 2;
  const HT = d + TOP;
  const hc = 5;                                        // brick knee wall height
  const rs = Math.round(d / 2) - H - G;                // ridge, on screen
  const FRAME = '#e4ecee', FRAME2 = '#aebcc2';
  const glass = (a, r = 178, g = 226, b = 238) => `rgba(${r}, ${g}, ${b}, ${a})`;
  const brick = (x, hgt) => {
    if (hgt === hc) return '#c8c0b4';                               // coping
    const row = hgt % 2, off = row ? 3 : 0;
    if (((x + off) % 6) === 0) return '#d8cfc0';
    return hash(x >> 1, hgt) < 0.5 ? '#9a4a36' : '#b35a42';
  };

  const shell = art(w, HT, (px, ctx) => {
    const P = (x, y, ww, hh, col) => px(x, y + TOP, ww, hh, col);
    const rnd = mulberry(353);
    // side knee walls (their tops), opaque, under the glass
    for (const x0 of [0, w - t]) P(x0, -hc, t, d - hc + 1, '#c8c0b4');
    // back slope (foreshortened, tilted to the sky): mostly reflection
    P(0, -H, w, rs + H, glass(0.8, 168, 206, 220));
    for (let y = -H + 3; y < rs; y += 3) P(1, y, w - 2, 1, glass(0.35, 214, 238, 246));
    // front slope, catching the sky
    P(0, rs + 2, w, d - H - rs - 4, glass(0.4, 200, 238, 246));
    // front face glass
    P(0, d - H, w, H - hc, glass(0.28, 170, 220, 232));
    // glazing bars
    for (let x = 0; x < w; x += 14) {
      P(x, -H, 1, rs + H, FRAME2);
      P(x, rs + 2, 1, d - H - rs - 4, FRAME);
      P(x, d - H, 1, H - hc, FRAME);
    }
    P(0, -H, w, 2, FRAME2); P(0, -H - 1, w, 1, C.ink);               // back eave
    P(0, rs, w, 1, FRAME); P(0, rs + 1, w, 1, FRAME2);                 // ridge
    P(0, Math.round((rs + d - H) / 2), w, 1, FRAME2);                  // purlin
    P(0, d - H - 2, w, 1, C.mt4); P(0, d - H - 1, w, 1, C.mt2);        // gutter
    P(0, d - H + 9, w, 1, FRAME);                                      // transom
    // reflections: a few diagonal glints
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    for (let i = 0; i < 7; i++) {
      const gx = 4 + Math.floor(rnd() * (w - 16)), gy = rs + 4 + Math.floor(rnd() * (d - H - rs - 14));
      const len = 4 + Math.floor(rnd() * 5);
      for (let k = 0; k < len; k++) ctx.fillRect(gx + k, gy + TOP + len - k, 1, 1);
    }
    for (let i = 0; i < 4; i++) {
      const gx = 3 + Math.floor(rnd() * (w - 10));
      for (let k = 0; k < 4; k++) ctx.fillRect(gx + k, d - H + 2 + TOP + 4 - k, 1, 1);
    }
    // brick knee wall along the front
    for (let x = 0; x < w; x++) for (let hgt = 1; hgt <= hc; hgt++) P(x, d - hgt, 1, 1, brick(x, hgt));
    // corner posts + verges
    for (const x0 of [0, w - 2]) { P(x0, -H, 2, d + H, FRAME); P(x0 + (x0 ? 1 : 0), -H, 1, d + H, FRAME2); }
    P(0, -H - 1, 1, d + H + 1, C.ink); P(w - 1, -H - 1, 1, d + H + 1, C.ink);
    P(0, d - 1, w, 1, C.ink);
    // the doorway: no glass, no bricks, a white frame
    const [a, b] = south;
    ctx.clearRect(a, d - 19 + TOP, b - a, 19);
    P(a - 2, d - 21, b - a + 4, 2, FRAME);
    P(a - 2, d - 19, 2, 19, FRAME); P(b, d - 19, 2, 19, FRAME2);
    P(a - 3, d - 21, 1, 21, C.ink); P(b + 2, d - 21, 1, 21, C.ink);
    // a little plaque over the door
    P(a + 2, d - H + 3, b - a - 4, 4, C.wd2); P(a + 2, d - H + 3, b - a - 4, 1, C.wd4);
  });

  const cut = art(w, HT, (px) => {
    const P = (x, y, ww, hh, col) => px(x, y + TOP, ww, hh, col);
    // side knee walls
    for (const x0 of [0, w - t]) {
      P(x0, -hc, t, d, '#c8c0b4');
      P(x0 + (x0 ? t - 1 : 0), -hc, 1, d, C.ink);
      P(x0 + (x0 ? 0 : t - 1), -hc, 1, d, '#a89e90');
      P(x0, d - hc, t, hc, FRAME);
    }
    // front knee wall stub, doorway left open
    const [a, b] = south;
    for (let x = t; x < w - t; x++) {
      if (x >= a && x < b) continue;
      P(x, d - t - hc, 1, t, '#c8c0b4');
      P(x, d - t - hc - 1, 1, 1, C.ink);
      for (let hgt = 1; hgt < hc; hgt++) P(x, d - hgt, 1, 1, brick(x, hgt));
      P(x, d - 1, 1, 1, C.ink);
    }
    for (const x of [a - 1, b]) P(x, d - t - hc - 1, 1, t + hc + 1, C.ink);
    // corner posts, cut at the frame
    for (const x0 of [0, w - 2]) P(x0, d - hc - t, 2, hc + t, FRAME);
  });

  return { shell, cut, ox: 0, oy: -TOP, top: () => -H - 1 };
}

// The greenhouse's back knee wall from inside: coping, then brick, with the
// north doorway left open.
export function greenhouseBackWall(w, t, north) {
  const hc = 5;
  const img = art(w, t + hc, (px) => {
    const [a, b] = north;
    for (let x = 0; x < w; x++) {
      if (x >= a && x < b) continue;
      px(x, 0, 1, t, '#c8c0b4');
      px(x, 0, 1, 1, '#ddd6ca');
      for (let hgt = 1; hgt <= hc; hgt++) {
        const row = hgt % 2, off = row ? 3 : 0;
        const col = ((x + off) % 6) === 0 ? '#d8cfc0' : hash(x >> 1, hgt + 9) < 0.5 ? '#8a4230' : '#a2503c';
        px(x, t + hc - hgt, 1, 1, col);
      }
    }
    for (const x of [a - 1, b]) px(x, 0, 1, t + hc, C.ink);
    px(0, t + hc - 1, w, 1, '#5a3a2a');
  });
  return { img, solid: null, jumpable: false, hide: false, tall: true };
}

/* ============================ PROPS ============================ */

export function buildBarnyardProps() {
  const p = {};

  // Stone well: round rim of fieldstone, a shingled roof on two posts, a
  // crank, and the bucket up on its rope.
  p.well = {
    img: art(30, 38, (px) => {
      const cx = 15;
      // posts
      px(3, 8, 3, 22, C.wd1); px(3, 8, 1, 22, C.wd3);
      px(24, 8, 3, 22, C.wd1); px(24, 8, 1, 22, C.wd3);
      // roof: two shingled slopes seen from the front
      px(0, 5, 30, 1, C.ink);
      for (let y = 0; y < 5; y++) {
        const hw = 6 + y * 2;
        px(cx - hw - 1, y, hw * 2 + 2, 1, C.ink);
        px(cx - hw, y, hw, 1, C.rd2);
        px(cx, y, hw, 1, C.rd1);
      }
      px(1, 5, 28, 3, C.rd1); px(1, 5, 28, 1, C.rd3);
      for (let x = 2; x < 28; x += 4) px(x, 6, 1, 2, C.rd0);
      px(0, 8, 30, 1, C.ink);
      // crank axle + handle, rope down to the bucket
      px(5, 12, 20, 2, C.wd2); px(5, 12, 20, 1, C.wd4);
      px(26, 10, 1, 5, C.mt2); px(27, 10, 2, 1, C.mt3);
      px(14, 14, 1, 5, '#b89a5c');
      px(11, 19, 7, 5, C.ink); px(12, 19, 5, 4, C.wd2); px(12, 19, 5, 1, C.wd4); px(12, 21, 5, 1, C.mt2);
      // stone rim: an ellipse top with the dark water in it, then the wall
      const ex = 15, ey = 26, rx = 13, ry = 5;
      for (let y = ey - ry - 1; y <= ey + ry + 1; y++) {
        for (let x = ex - rx - 1; x <= ex + rx + 1; x++) {
          const q = ((x + 0.5 - ex) / (rx + 0.5)) ** 2 + ((y + 0.5 - ey) / (ry + 0.5)) ** 2;
          const qi = ((x + 0.5 - ex) / (rx - 3)) ** 2 + ((y + 0.5 - ey) / (ry - 1.6)) ** 2;
          if (q > 1.25) continue;
          if (q > 1) { px(x, y, 1, 1, C.ink); continue; }
          if (qi <= 1) { px(x, y, 1, 1, qi < 0.5 && x < ex ? '#24384c' : '#15202c'); continue; }
          px(x, y, 1, 1, ((x * 3 + y * 5) % 7 === 0) ? MORTAR : (y < ey ? '#a8a298' : '#8a847c'));
        }
      }
      px(ex - 5, ey - 1, 3, 1, '#4a6a88');                            // glint on the water
      for (let y = ey + 1; y < 37; y++) {
        const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - ((Math.min(y, ey + ry) - ey) / (ry + 0.5)) ** 2)));
        const w2 = y > ey + ry ? rx : hw;
        for (let x = ex - w2; x <= ex + w2; x++) {
          if (y <= ey + ry && Math.abs(x - ex) < hw - 1 && y < ey + ry) continue;
          const brickRow = Math.floor((y - ey) / 3), off = brickRow % 2 ? 2 : 0;
          let col = ((x + off) % 5 === 0 || (y - ey) % 3 === 0) ? MORTAR : STONE[Math.floor(hash(x >> 2, brickRow) * 3)];
          if (x < ex - w2 + 3 && col !== MORTAR) col = '#948e86';
          if (x === ex - w2 || x === ex + w2 || y === 36) col = C.ink;
          px(x, y, 1, 1, col);
        }
      }
      px(ex - rx + 1, 37, rx * 2 - 1, 1, C.ink);
    }),
    solid: { x: 2, y: 24, w: 26, h: 12 }, jumpable: false, hide: true, tall: true,
  };

  // A loose heap of hay, low enough to wade into.
  p.haypile = {
    img: art(28, 14, (px) => {
      const spans = [[9, 18], [5, 22], [3, 24], [2, 25], [1, 26], [1, 26], [2, 25], [4, 23]];
      spans.forEach(([a, b], i) => { px(a - 1, 3 + i, b - a + 3, 1, C.ink); });
      px(spans[0][0], 2, spans[0][1] - spans[0][0] + 1, 1, C.ink);
      spans.forEach(([a, b], i) => { px(a, 3 + i, b - a + 1, 1, i < 3 ? C.gd2 : i > 5 ? C.gd0 : C.gd1); });
      const rnd = mulberry(371);
      for (let i = 0; i < 26; i++) {
        const y = 3 + Math.floor(rnd() * 8);
        const [a, b] = spans[y - 3];
        px(a + Math.floor(rnd() * (b - a)), y, 2, 1, STRAW[Math.floor(rnd() * 4)]);
      }
      for (const [x, y] of [[0, 10], [26, 9], [5, 1], [20, 1], [13, 0]]) px(x, y, 2, 1, C.gd2);
    }),
    solid: null, jumpable: false, hide: true, tall: false,
  };

  // Water trough knocked on its side.
  p.trough = {
    img: art(22, 12, (px) => {
      px(1, 2, 20, 9, C.ink);
      px(2, 3, 18, 7, C.wd2);
      px(2, 3, 18, 1, C.wd4);
      px(2, 8, 18, 2, C.wd1);
      px(4, 5, 14, 3, '#2a1c10');                                     // the open top, facing us
      px(2, 5, 1, 3, C.wd3); px(19, 5, 1, 3, C.wd1);
      px(6, 2, 2, 9, C.mt2); px(15, 2, 2, 9, C.mt2);                  // iron bands
    }),
    solid: { x: 2, y: 4, w: 18, h: 6 }, jumpable: true, hide: false, tall: false,
  };

  // A pen gate hanging open off one hinge, bottom rail dropped.
  p.gateOpen = {
    img: art(18, 12, (px) => {
      px(0, 0, 2, 11, C.wd1); px(0, 0, 1, 11, C.wd3);
      px(1, 2, 16, 2, C.wd2); px(1, 2, 16, 1, C.wd4);
      line(px, 2, 7, 16, 10, C.wd2); line(px, 2, 6, 16, 9, C.wd4);
      px(15, 1, 2, 10, C.wd1); px(15, 1, 1, 10, C.wd3);
      line(px, 2, 4, 15, 9, C.wd1);                                   // brace
    }),
    solid: { x: 1, y: 3, w: 16, h: 6 }, jumpable: true, hide: false, tall: false,
  };

  // Workbench along the east wall, seen end-on, cluttered: vice, hammer,
  // a hand saw, a paint tin with its lid off.
  p.workbench = {
    img: art(20, 54, (px) => {
      px(1, 0, 18, 46, C.ink);
      px(2, 1, 16, 44, C.wd3);
      for (let y = 4; y < 45; y += 5) px(2, y, 16, 1, C.wd2);
      px(2, 1, 1, 44, C.wd4); px(17, 1, 1, 44, C.wd1);
      // front end + legs
      px(1, 46, 18, 3, C.wd1); px(1, 46, 18, 1, C.wd2);
      px(2, 49, 3, 5, C.wd0); px(15, 49, 3, 5, C.wd0);
      // vice at the north end
      px(5, 2, 8, 4, C.mt1); px(6, 2, 6, 1, C.mt3); px(8, 6, 2, 3, C.mt2);
      // hammer
      px(6, 12, 1, 9, C.wd1); px(4, 11, 5, 3, C.mt2); px(4, 11, 5, 1, C.mt4);
      // hand saw
      px(10, 20, 5, 4, C.wd4); px(11, 21, 3, 2, C.wd1);
      px(11, 24, 4, 11, C.mt3); px(11, 24, 1, 11, C.mt5);
      for (let y = 25; y < 35; y += 2) px(15, y, 1, 1, C.mt1);
      // paint tin, lid beside it, a dribble down the side
      px(4, 36, 6, 6, C.ink); px(5, 37, 4, 4, C.mt3); px(5, 37, 4, 2, '#3e7ab8');
      px(11, 38, 5, 3, C.mt2); px(11, 38, 5, 1, C.mt4);
      px(9, 41, 1, 5, '#3e7ab8');
    }),
    solid: { x: 1, y: 2, w: 18, h: 46 }, jumpable: true, hide: true, tall: false,
  };

  // Wheelbarrow tipped over on its side, wheel in the air.
  p.wheelbarrow = {
    img: art(26, 16, (px) => {
      // tray, on its side: we see the inside
      px(3, 2, 16, 11, C.ink);
      px(4, 3, 14, 9, C.gr1);
      px(4, 3, 14, 2, C.gr3);
      px(6, 5, 10, 5, C.gr0);
      px(7, 9, 7, 1, '#4a3620');                                      // a little dirt left in it
      // handles sticking out
      px(18, 5, 7, 2, C.wd2); px(18, 5, 7, 1, C.wd4);
      px(18, 9, 6, 2, C.wd1);
      // wheel
      px(0, 3, 5, 9, C.ink); px(1, 4, 3, 7, '#1c1c24'); px(2, 6, 1, 3, C.mt3);
    }),
    solid: { x: 1, y: 4, w: 22, h: 9 }, jumpable: true, hide: true, tall: false,
  };

  // Burlap feed sacks: one standing, one slumped and torn open.
  p.sack = {
    img: art(12, 15, (px) => {
      px(1, 3, 10, 12, C.ink);
      px(2, 4, 8, 10, '#b89a6a');
      px(2, 4, 3, 10, '#ccb07e'); px(8, 4, 2, 10, '#9a7e52');
      px(3, 1, 6, 3, C.ink); px(4, 1, 4, 2, '#ccb07e');                 // gathered neck
      px(4, 3, 4, 1, C.wd1);                                          // twine
      px(3, 8, 6, 3, '#8a6e44'); px(4, 9, 4, 1, '#c8aa6a');             // stencil
    }),
    solid: { x: 1, y: 7, w: 10, h: 7 }, jumpable: true, hide: false, tall: false,
  };
  p.sackTorn = {
    img: art(16, 10, (px) => {
      px(0, 2, 15, 8, C.ink);
      px(1, 3, 13, 6, '#b89a6a');
      px(1, 3, 13, 2, '#ccb07e'); px(1, 7, 13, 2, '#9a7e52');
      px(9, 3, 4, 4, '#3a2a1a');                                      // the tear
      px(10, 4, 2, 2, '#d8c070'); px(13, 6, 3, 2, '#d8c070');          // grain
    }),
    solid: null, jumpable: false, hide: false, tall: false,
  };

  // Potting bench: slatted top crowded with clay pots, tomato vines staked
  // up, seedlings, a flowering pot or two. Aliens duck underneath.
  const bench = (seed) => ({
    img: art(40, 24, (px) => {
      const rnd = mulberry(seed);
      // shadow underneath + legs
      px(2, 16, 36, 6, '#2a2018');
      px(2, 16, 3, 8, C.wd0); px(35, 16, 3, 8, C.wd0);
      px(3, 16, 1, 8, C.wd2); px(36, 16, 1, 8, C.wd2);
      // a sack of compost under it
      px(12, 18, 10, 5, '#5a3e24'); px(12, 18, 10, 1, '#7a5836');
      // top
      px(0, 11, 40, 6, C.ink);
      px(1, 12, 38, 4, C.wd3);
      px(1, 12, 38, 1, C.wd4);
      for (let x = 6; x < 38; x += 6) px(x, 12, 1, 4, C.wd2);
      px(1, 15, 38, 1, C.wd1);
      // pots
      let x = 2;
      while (x < 34) {
        const kind = rnd();
        const pw = 5;
        px(x, 9, pw, 4, C.ink);
        px(x + 1, 9, pw - 2, 3, '#c8683c'); px(x + 1, 9, 1, 3, '#e08a58');
        px(x, 8, pw, 1, '#a84e2a');
        if (kind < 0.4) {
          // tomato plant on a cane
          px(x + 2, 0, 1, 9, C.wd3);
          for (const [lx, ly] of [[0, 2], [3, 3], [0, 5], [3, 6], [1, 1]]) px(x + lx, ly, 2, 2, C.lf2);
          px(x + 1, 2, 1, 1, C.lf4);
          px(x + 3, 4, 2, 2, '#d8402e'); px(x, 6, 2, 2, '#e8603e'); px(x + 3, 4, 1, 1, '#ff9a7a');
        } else if (kind < 0.7) {
          // seedlings
          for (const lx of [1, 3]) { px(x + lx, 6, 1, 2, C.lf3); px(x + lx - 1, 5, 2, 1, C.lf4); }
        } else {
          // something in flower
          px(x + 1, 4, 3, 4, C.lf2); px(x + 1, 4, 1, 1, C.lf4);
          const fc = rnd() < 0.5 ? '#e87ab8' : '#f6da79';
          px(x + 1, 3, 1, 1, fc); px(x + 3, 4, 1, 1, fc); px(x + 2, 2, 1, 1, fc);
        }
        x += pw + 1 + Math.floor(rnd() * 2);
      }
    }),
    solid: { x: 1, y: 13, w: 38, h: 9 }, jumpable: true, hide: true, tall: false,
  });
  p.benchA = bench(401);
  p.benchB = bench(409);
  p.benchC = bench(417);
  p.benchD = bench(425);

  return p;
}

/* ============================ FLOOR DECALS ============================ */
// Painted straight into the ground canvas (under everything), so the agent
// and the aliens walk over them.

// Loose straw strands kicked about over a rect.
export function strawScatter(ctx, x, y, w, h, count, seed) {
  const rnd = mulberry(seed);
  for (let i = 0; i < count; i++) {
    const sx = Math.round(x + rnd() * w), sy = Math.round(y + rnd() * h);
    const len = 2 + Math.floor(rnd() * 3);
    const diag = rnd();
    ctx.fillStyle = '#4a3620';
    for (let k = 0; k < len; k++) ctx.fillRect(sx + k, sy + 1 + (diag < 0.3 ? k >> 1 : 0), 1, 1);
    ctx.fillStyle = STRAW[Math.floor(rnd() * 4)];
    for (let k = 0; k < len; k++) ctx.fillRect(sx + k, sy + (diag < 0.3 ? k >> 1 : diag > 0.8 ? -(k >> 1) : 0), 1, 1);
  }
}

// A trodden patch of mud, dithered at the edge.
export function mudPatch(ctx, cx, cy, rx, ry, seed) {
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = Math.floor(cy - ry - 2); y <= cy + ry + 2; y++) {
    for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
      const ang = Math.atan2(y - cy, x - cx);
      const wob = 0.14 * Math.sin(ang * 5 + seed) + 0.08 * Math.sin(ang * 9 + seed * 3);
      const q = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry) - wob;
      const t = 1 - q;
      const thr = (B[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
      if (t < 0 || t * 3 < thr) continue;
      ctx.fillStyle = t > 0.45 ? MUD : t > 0.2 ? MUD2 : MUD3;
      if (t > 0.5 && hash(x, y * 3 + seed) < 0.05) ctx.fillStyle = '#6e5a4a';   // wet glint
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

// Muddy prints along a route: three toes and a heel, left-right, and the
// mud wearing off the further they go.
export function footprints(ctx, pts, seed, { step = 7, start = 0 } = {}) {
  const rnd = mulberry(seed);
  let n = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    for (let s = (i === 0 ? start : 0); s < len; s += step) {
      n++;
      const fade = Math.min(1, n / 40);
      if (rnd() < fade * 0.55) continue;
      const side = n % 2 ? 1 : -1;
      const x = Math.round(a.x + ux * s - uy * 2 * side), y = Math.round(a.y + uy * s + ux * 2 * side);
      ctx.fillStyle = fade > 0.6 ? MUD2 : MUD;
      // heel, then the three toes spread ahead of it
      ctx.fillRect(x, y, 2, 2);
      ctx.fillRect(Math.round(x + ux * 3 - uy * 2), Math.round(y + uy * 3 + ux * 2), 1, 1);
      ctx.fillRect(Math.round(x + ux * 3.5), Math.round(y + uy * 3.5), 1, 1);
      ctx.fillRect(Math.round(x + ux * 3 + uy * 2), Math.round(y + uy * 3 - ux * 2), 1, 1);
    }
  }
}

// Tools dropped on the floor. (x, y) is the end of the handle; the tool
// lies along angle `ang` (radians).
export function floorTool(ctx, kind, x, y, ang) {
  const px = (a, b, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(a, b, w, h); };
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const L = kind === 'hammer' ? 7 : 20;
  const hx = x + ux * L, hy = y + uy * L;
  line(px, x + 1, y + 1, hx + 1, hy + 1, '#2a1c10');                  // shadow
  line(px, x, y, hx, hy, C.wd3);
  const nx = -uy, ny = ux;                                            // across the tool
  if (kind === 'pitchfork') {
    for (const k of [-2, 0, 2]) {
      const bx = hx + nx * k, by = hy + ny * k;
      line(px, bx, by, bx + ux * 6, by + uy * 6, C.mt4);
    }
    line(px, hx + nx * -2, hy + ny * -2, hx + nx * 2, hy + ny * 2, C.mt2);
  } else if (kind === 'rake') {
    line(px, hx + nx * -5, hy + ny * -5, hx + nx * 5, hy + ny * 5, C.mt2);
    for (let k = -5; k <= 5; k += 2) px(Math.round(hx + nx * k + ux * 1.5), Math.round(hy + ny * k + uy * 1.5), 1, 1, C.mt4);
  } else if (kind === 'shovel') {
    for (let k = 0; k < 6; k++) {
      const w2 = k < 4 ? 2 : 1;
      line(px, hx + ux * k - nx * w2, hy + uy * k - ny * w2, hx + ux * k + nx * w2, hy + uy * k + ny * w2, k === 0 ? C.mt2 : C.mt3);
    }
    px(Math.round(hx + ux * 2), Math.round(hy + uy * 2), 1, 1, C.mt5);
  } else if (kind === 'hammer') {
    line(px, hx - nx * 2, hy - ny * 2, hx + nx * 2, hy + ny * 2, C.mt2);
    px(Math.round(hx - nx * 2), Math.round(hy - ny * 2), 1, 1, C.mt4);
  }
}

// A bucket knocked over, its water soaked into the floor.
export function spilledBucket(ctx, x, y) {
  mudPatch(ctx, x + 10, y + 4, 9, 4, 17);
  const px = (a, b, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(a, b, w, h); };
  px(x, y, 7, 7, C.ink);
  px(x + 1, y + 1, 5, 5, C.mt3); px(x + 1, y + 1, 5, 1, C.mt4);
  px(x + 5, y + 2, 2, 3, '#1c1c24');                                  // the open mouth
  px(x + 2, y + 3, 3, 1, C.mt2);
}

// Grain spilled out of a torn sack.
export function grainSpill(ctx, x, y, w, h, seed) {
  const rnd = mulberry(seed);
  for (let i = 0; i < w * h * 0.35; i++) {
    const gx = Math.round(x + rnd() * w), gy = Math.round(y + rnd() * h * (0.4 + 0.6 * rnd()));
    ctx.fillStyle = rnd() < 0.5 ? '#d8c070' : '#b89a4a';
    ctx.fillRect(gx, gy, 1, 1);
  }
}

// Broken boards lying about.
export function brokenBoards(ctx, x, y) {
  const px = (a, b, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(a, b, w, h); };
  px(x, y + 1, 12, 3, '#2a1c10'); px(x, y, 12, 3, C.wd2); px(x, y, 12, 1, C.wd4);
  px(x + 12, y, 1, 2, C.wd2);
  line(px, x + 5, y + 7, x + 14, y + 4, C.wd1);
  line(px, x + 5, y + 6, x + 14, y + 3, C.wd3);
}

// The eggs, every last one of them, set down together in a little ring of
// straw. Nothing in the barn is in one piece except these.
export function eggClutch(ctx, x, y) {
  const px = (a, b, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(a, b, w, h); };
  // a small, neat ring of straw
  for (let k = 0; k < 22; k++) {
    const a = k / 22 * Math.PI * 2;
    px(Math.round(x + 7 + Math.cos(a) * 8), Math.round(y + 4 + Math.sin(a) * 4), 2, 1, STRAW[k % 4]);
  }
  px(x + 1, y + 2, 12, 5, '#8a6a34');
  // eggs, packed in three tidy rows
  const rows = [[2, 5, 8], [0.5, 3.5, 6.5, 9.5], [2, 5, 8]];
  rows.forEach((xs, r) => {
    for (const ex of xs) {
      const qx = Math.round(x + 1 + ex), qy = y + r * 2;
      px(qx, qy + 1, 3, 2, '#b4a68c');
      px(qx, qy, 2, 2, '#d2c6ae');
      px(qx, qy, 1, 1, '#e2d8c4');
    }
  });
}

// Terracotta shards and soil from a pot that got knocked off a bench.
export function brokenPot(ctx, x, y) {
  mudPatch(ctx, x + 4, y + 3, 5, 3, 29);
  const px = (a, b, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(a, b, w, h); };
  px(x, y, 3, 2, '#c8683c'); px(x + 6, y + 4, 2, 2, '#a84e2a'); px(x + 3, y + 6, 2, 1, '#e08a58');
  px(x + 5, y, 2, 1, C.lf3); px(x + 6, y - 1, 1, 1, C.lf4);            // the seedling, uprooted
}
