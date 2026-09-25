// Stage 1, Scene 3 (Highway 29): the woods as an endless strip.
//
// The map is a fixed canvas NP pieces wide (CW px each) that slides along a
// strip of world with no end to it. World piece n covers [n*CW, (n+1)*CW)
// and `kinds[n]` says what it is:
//   start     where the agent comes into the woods, a thicket at his back
//   forest    thick woods: trees, bushes, boulders, logs, bracken to hide in
//   clearing  a sunny gap in the trees (with a spiral of leaves in it)
//   exit      the woods thinning out, the fire road turning off south
//   creek     the creek, bank to bank across the whole strip
//   woods     open woods beyond it, where the chase runs
//   final     Highway 29 and the gas station across it (FINAL_W pieces)
//   backdrop  the forest carrying on behind the station
// Once the agent is far enough along, the director calls shift(): the piece
// at the back drops off, the rest slides back a piece, and the next one is
// laid out at the front, and painted in over the next few frames (tick()). Everything is laid out and painted
// from world coordinates alone, so a piece comes out pixel-identical to the
// one that was there before the slide, and no seam ever shows. What's in
// the next piece is whatever's queued, then `after` for good; replaceAhead()
// rewrites the pieces the agent can't see yet (that's how the woods end
// once three aliens are in the van, and how Highway 29 turns up in time).
//
// The canvas always keeps a thicket down its left edge (THK px) so there's
// never an edge to walk off; it's repainted after every slide, while it's
// well off screen.
import { T, TILE } from './sprites.js';
import { TERRAIN, blendGround, paintPath, noise, hash, texOf } from '../terrain.js';
import { buildNav } from '../nav.js';
import {
  CANOPY_FLOOR, drawCrown, litterCell, spiralLeaves, strayLeaf, dapple, creekPixel, roadPixel, ROAD,
} from './highwayArt.js';

export const CW = 256;                  // piece width
export const NP = 7;                    // pieces in the canvas
export const TH = 28;                   // tile rows
export const H = TH * TILE;
export const FN = 56;                   // canopy along the north edge, above this
export const FS = 404;                  // ...and the south, below this
export const THK = 64;                  // thicket down the canvas's left edge
export const FINAL_W = 3;               // pieces Highway 29 + the station take up
const SLICE = 64;                       // streamed-in ground is painted this many columns a frame
const HUNT0 = 84, HUNT1 = 342;          // tree bases stay between these
const TRACK_Y = 380;                    // the fire road's middle
export const CREEK_HW = 17;             // half the creek's width
const CLEAR = { x: 128, y: 205, rx: 94, ry: 88 };     // the clearing, local to its piece
export const SPIRAL = { x: 184, y: 250 };             // ...and the leaves, off towards one edge of it
export const STATION = {                               // local to the final section
  stopX: 96,                            // the grass verge the aliens pull up at
  lanes: [ROAD.asphalt0 + ROAD.lane / 2, ROAD.asphalt1 - ROAD.lane / 2],   // southbound, northbound
  semi: { x: 244, base: 320 },          // left edge of the semi's image, ground line at its back
  store: { x: 284, base: 150 },
  canopy: { x: 300, base: 262 },
  woods: 604,                           // tree line behind the lot
};

const HUNT = new Set(['start', 'forest', 'clearing', 'exit']);

export class HighwayStrip {
  // props: the shared prop set (maps.js PROPS), X: highwayArt props
  constructor(map, props, X) {
    this.map = map;
    this.P = props;
    this.X = X;
    this.ox = 0;                        // world x of canvas column 0
    this.kinds = [];
    this.queue = [];                    // kinds to stream in next
    this.after = 'forest';              // ...and once they're used up
    this.clearingAt = null;             // world pieces where things ended up
    this.creekAt = null;
    this.finalAt = null;
    this.ctx = null;                    // the game's ground canvas, once it exists
    this.tiles = null;
    this.spiral = spiralLeaves();
    this.thicket = null;                // painted once, stamped after every slide
    this.work = [];                     // ground still to paint: [x0, x1) slices, nearest first
    this.w = NP * CW;
  }

  /* ---------------- where things are ---------------- */

  pieceOf(wx) { return Math.floor(wx / CW); }
  kindAt(wx) { return this.kinds[this.pieceOf(wx)] || 'backdrop'; }
  local(wx) { return wx - this.pieceOf(wx) * CW; }
  finalX(wx) { return wx - this.finalAt * CW; }   // across Highway 29's section

  // The fire road through the woods: gentle bends, then in the exit piece a
  // turn off south out of the trees. null where there's no road.
  trackY(wx) {
    const kind = this.kindAt(wx);
    if (!HUNT.has(kind)) return null;
    const y = TRACK_Y + 5 * Math.sin(wx / 83) + 3 * Math.sin(wx / 37 + 1);
    if (kind !== 'exit') return y;
    const l = this.local(wx);
    if (l < 110) return y;
    const k = (l - 110) / 70;
    return k > 1.4 ? null : y + k * k * 120;
  }

  // Middle of the creek at height y (world x), if it's been laid out.
  creekCx(y) {
    if (this.creekAt === null) return null;
    return this.creekAt * CW + 128 + 9 * Math.sin(y / 41) + 4 * Math.sin(y / 17 + 1.3);
  }

  // Inside the clearing: a rough, lumpy oval, not a neat one.
  inClearing(wx, y) {
    if (this.kindAt(wx) !== 'clearing') return false;
    return this.inClearingLocal(this.local(wx), y, 0.85 + 0.3 * noise(wx * 0.03 + 5, y * 0.03));
  }

  // Is there canopy overhead at world (wx, y)? The bands along both edges
  // (with gaps where the fire road and the highway run out), the woods
  // behind the gas station, and past that the forest for good.
  canopyAt(wx, y) {
    const kind = this.kindAt(wx);
    if (kind === 'backdrop') return true;
    if (kind === 'final') {
      const lx = this.finalX(wx);
      if (lx >= STATION.woods) return true;
      if (lx >= 60 && lx < ROAD.lot0 + 4) return false;
    }
    if (kind === 'exit' && y > FS) {
      const l = this.local(wx);
      if (l > 150 && l < 216) return false;
    }
    return y < FN - 2 || y > FS + 4;
  }

  // Ground tile for world tile column starting at wx, row ty.
  tileAt(wx, ty) {
    const y = ty * TILE + 8, kind = this.kindAt(wx);
    const h = hash(wx >> 4, ty * 13 + 5);
    const n = noise(wx * 0.021, y * 0.027);
    const woods = h < 0.35 ? T.WOODS2 : T.WOODS;
    // grass in the woods is one soft texture, with patches of flowers (never
    // a checkerboard); the verge by the highway is mown farm-bright grass
    const grass = noise(wx * 0.04 + 9, y * 0.05) > 0.7 ? T.GLADE2 : T.GLADE;
    if (kind === 'backdrop') return T.FOREST;
    if (kind === 'final') {
      const lx = this.finalX(wx);
      if (lx >= STATION.woods) return T.FOREST;
      if (lx >= ROAD.verge && lx < ROAD.asphalt0) return T.GRAVEL;
      if (lx >= ROAD.asphalt0 && lx < ROAD.asphalt1) return T.ASPHALT;
      if (lx >= ROAD.asphalt1 && lx < ROAD.lot0) return T.GRAVEL;
      if (this.canopyAt(wx, y)) return T.FOREST;
      if (lx >= ROAD.lot0 && lx < ROAD.lot1 && y >= ROAD.lotY0 && y < ROAD.lotY1) return T.CONCRETE;
      if (lx < 60) return n < 0.45 ? woods : grass;
      if (lx < ROAD.verge) return T.GRASS2;
      return grass;
    }
    if (this.canopyAt(wx, y)) return T.FOREST;
    const l = this.local(wx);
    switch (kind) {
      case 'clearing': return this.inClearing(wx, y) ? grass : woods;
      case 'exit': return n < 0.62 - l / 256 * 0.45 ? woods : grass;
      case 'creek': return n < (l < 128 ? 0.3 : 0.42) ? woods : grass;
      case 'woods': return n < 0.44 ? woods : grass;
      default: return woods;
    }
  }

  // What to stream in at world piece n.
  nextKind(n) {
    const kind = this.queue.length ? this.queue.shift() : this.after;
    if (kind === 'clearing') this.clearingAt = n;
    if (kind === 'creek') this.creekAt = n;
    if (kind === 'final' && (this.finalAt === null || n >= this.finalAt + FINAL_W)) this.finalAt = n;
    return kind;
  }

  /* ---------------- building the first window ---------------- */

  init() {
    const m = this.map;
    for (const s of m.solids) s.fixed = true;          // the map's border walls
    // the thicket at the back: a wall of trunks the agent can't get past
    m.solids.push({ x: -8, y: -8, w: THK - 4 + 8, h: H + 16, jumpable: false, fixed: true });
    for (let y = FN + 10, i = 0; y < FS + 20; y += 13 + (i % 3) * 2, i++) {
      const key = i % 3 === 1 ? 'pine' : 'tree';
      const img = this.P[key].img;
      m.prop(key, Math.round(THK - 8 + (i % 2) * 5 - img.width / 2), y - img.height, { noHide: true, noSolid: true });
      m.props[m.props.length - 1].fixed = true;
    }
    this.kinds[0] = 'start';
    for (let n = 1; n < NP; n++) this.kinds[n] = this.nextKind(n);
    for (let s = 0; s < NP; s++) this.layOut(s);
  }

  // The game has drawn and blended the first window's tiles into its ground
  // canvas; paint the rest of it, and keep the canvas for pieces to come.
  paintGround(ctx, tiles) {
    this.ctx = ctx;
    this.tiles = tiles;
    this.decorate(0, this.w);
    this.paintThicket();
  }

  /* ---------------- laying out a piece ---------------- */

  // Tiles, bodies, props and hiding spots for the piece in canvas slot s.
  layOut(s) {
    const m = this.map, n = this.ox / CW + s, kind = this.kinds[n];
    const x0 = s * CW, wx0 = n * CW;
    const mark = [m.props.length, m.solids.length, m.hideSpots.length];
    for (let tx = 0; tx < CW / TILE; tx++) {
      for (let ty = 0; ty < TH; ty++) m.ground[ty * m.tw + x0 / TILE + tx] = this.tileAt(wx0 + tx * TILE, ty);
    }
    // the canopy bands are solid, with gaps where the canopy has them
    for (const band of ['n', 's']) {
      let run = null;
      for (let x = 0; x <= CW; x += 4) {
        const on = x < CW && this.canopyAt(wx0 + x + 2, band === 'n' ? 0 : H - 1);
        if (on && run === null) run = x;
        if (!on && run !== null) {
          m.solids.push(band === 'n'
            ? { x: x0 + run, y: -8, w: x - run, h: FN + 14, jumpable: false }
            : { x: x0 + run, y: FS + 2, w: x - run, h: H - FS + 6, jumpable: false });
          run = null;
        }
      }
    }
    // wall-to-wall canopy (behind the gas station and on) is solid all the way down
    const deep = kind === 'backdrop' ? 0 : kind === 'final' ? this.finalAt * CW + STATION.woods - 2 - wx0 : CW;
    if (deep < CW) m.solids.push({ x: x0 + Math.max(0, deep), y: -8, w: CW - Math.max(0, deep), h: H + 16, jumpable: false });
    this.edgeTrees(s, wx0, kind);
    if (HUNT.has(kind) || kind === 'woods') this.growWoods(wx0, wx0 + CW, kind);
    else if (kind === 'creek') this.layCreek(wx0);
    else if (kind === 'final') this.layStation(s, wx0);
    for (let i = mark[0]; i < m.props.length; i++) m.props[i].piece = n;
    for (let i = mark[1]; i < m.solids.length; i++) m.solids[i].piece = n;
    for (let i = mark[2]; i < m.hideSpots.length; i++) { m.hideSpots[i].piece = n; m.hideSpots[i].fresh = true; }
  }

  // Put a prop down at world x (canvas x = wx - ox).
  put(def, wx, y, opts = {}) {
    this.map.customProp(def, Math.round(wx - this.ox), Math.round(y), opts);
    return this.map.props[this.map.props.length - 1];
  }

  // A hiding spot tucked in just behind something solid: in the row of nav
  // cells above the one its base is in, so a fleeing alien can path there.
  spotBehind(wx, baseY, rustle) {
    this.map.hideSpots.push({ x: Math.round(wx - this.ox), y: Math.floor(baseY / TILE) * TILE - 4, inside: false, rustle });
  }

  // The ragged front row of trunks along each canopy band (these y-sort
  // with everyone; the canopy behind them is painted in), and down the edge
  // of the woods behind the gas station.
  edgeTrees(s, wx0, kind) {
    const tree = (wx, baseY, k) => {
      const key = k < 0.45 ? 'pine' : 'tree';
      const img = this.P[key].img;
      // no body of its own: the canopy band behind it is solid already
      this.put(this.P[key], wx - img.width / 2, baseY - img.height, { noHide: true, noSolid: true });
    };
    for (let i = 0; i < CW / 14; i++) {
      const wx = wx0 + i * 14 + Math.floor(hash(wx0 / 14 + i, 3) * 6);
      if (this.canopyAt(wx, 0) && this.canopyAt(wx + 8, 0) && this.canopyAt(wx - 8, 0) && this.kindAt(wx) !== 'backdrop' &&
          !(kind === 'final' && this.finalX(wx) >= STATION.woods - 8)) {
        tree(wx, FN + 3 + hash(wx, 7) * 6, hash(wx, 5));
      }
      const wx2 = wx0 + i * 14 + 7 + Math.floor(hash(wx0 / 14 + i, 9) * 6);
      if (this.canopyAt(wx2, H - 1) && this.canopyAt(wx2 + 8, H - 1) && this.canopyAt(wx2 - 8, H - 1) && this.kindAt(wx2) !== 'backdrop' &&
          !(kind === 'final' && this.finalX(wx2) >= STATION.woods - 8)) {
        tree(wx2, FS + 27 + hash(wx2, 8) * 6, hash(wx2, 6));
      }
    }
    if (kind === 'final') {
      const x = this.finalAt * CW + STATION.woods;
      if (x >= wx0 && x < wx0 + CW) {
        for (let y = FN + 14, i = 0; y < FS + 12; y += 12 + (i % 3) * 2, i++) tree(x - 4 + (i % 2) * 6, y, hash(i, 41));
      }
    }
  }

  // Trees, bushes and the rest on a jittered grid (so neighbouring pieces
  // never crowd each other), thick in groves and thinner between them. A
  // spot to hide behind comes with some trees and every boulder; bushes,
  // bracken and hollow logs are hiding spots already. Ferns and saplings
  // fill in the floor without getting in anyone's way.
  growWoods(wx0, wx1, kind) {
    const X = this.X, P = this.P;
    const open = kind === 'woods';
    const cw = open ? 46 : 28, ch = open ? 44 : 30;
    for (let i = Math.ceil(wx0 / cw); i * cw < wx1; i++) {
      const cx = i * cw;
      for (let j = 0; HUNT0 + j * ch <= HUNT1; j++) {
        const h = hash(i * 7 + 3, j * 11 + 1), pick = hash(i * 13 + 5, j * 3 + 7);
        const wx = cx + 2 + hash(i, j * 5 + 2) * (cw - 4);
        const base = Math.min(HUNT1 + 6, HUNT0 + j * ch + hash(i * 3, j + 4) * (ch - 8));
        const l = this.local(wx);
        const grove = noise(wx * 0.011 + 40, base * 0.016);
        let dens = open ? 0.46 : 0.5 + grove * 0.6;
        if (kind === 'exit') dens *= 1 - 0.7 * l / CW;
        if (!open && hash(i * 5 + 2, j * 9) < 0.5 * dens) {
          // ground cover, offset half a cell
          const fx = cx + cw / 2 + (hash(i, j + 61) - 0.5) * cw * 0.8, fy = base + ch / 2 - 4;
          if (fy < HUNT1 + 4 && !(kind === 'clearing' && this.inClearingLocal(this.local(fx), fy, 0.9)) &&
              !(kind === 'start' && fx < THK + 150 && fy > 150 && fy < 320)) {
            const def = hash(i * 3, j * 7 + 5) < 0.72 ? X.tuft : X.sapling;
            this.put(def, fx - def.img.width / 2, fy - def.img.height);
          }
        }
        if (h > dens) continue;
        if (kind === 'start' && wx < THK + 150 && base > 150 && base < 320) continue;   // where he walks in
        if (kind === 'clearing' && this.inClearingLocal(l, base, 1.08)) continue;
        if (kind === 'woods' && this.creekCx(base) !== null && wx < this.creekCx(base) + 70) continue;   // landing room
        const treeAt = (key, def, solidY, spotChance) => {
          const img = def.img;
          const x = wx - img.width / 2, y = base - img.height;
          this.put(def, x, y, { noHide: true, see: true });
          if (!open && hash(i + 17, j * 7) < spotChance) this.spotBehind(wx, y + solidY, '#57a648');
        };
        if (open) {
          // open woods: trees, the odd log or rock across the way to hop
          if (pick < 0.34) treeAt('tree', P.tree, 26, 0);
          else if (pick < 0.56) treeAt('pine', P.pine, 27, 0);
          else if (pick < 0.7) treeAt('birch', X.birch, 33, 0);
          else if (pick < 0.84) this.put(X.logMoss, wx - 18, base - 15, { noHide: true });
          else if (pick < 0.92) this.put(X.mossRock, wx - 8, base - 12);
          else this.put(X.bracken, wx - 12, base - 16, { noHide: true });
          continue;
        }
        if (pick < 0.26) treeAt('tree', P.tree, 26, 0.4);
        else if (pick < 0.46) treeAt('pine', P.pine, 27, 0.35);
        else if (pick < 0.52) treeAt('birch', X.birch, 33, 0.3);
        else if (pick < 0.59) treeAt('bigTree', X.bigTree, 38, 0.5);
        else if (pick < 0.7) this.put(P.bush, wx - 10, base - 14);
        else if (pick < 0.78) { this.put(X.bracken, wx - 12, base - 16); this.lastSpot().rustle = '#57a648'; }
        else if (pick < 0.83) this.put(X.mossRock, wx - 8, base - 12);
        else if (pick < 0.87) { this.put(X.boulder, wx - 14, base - 22); this.spotBehind(wx, base - 22 + 11, '#8791a0'); }
        else if (pick < 0.93) { this.put(X.logMoss, wx - 18, base - 15); this.lastSpot().rustle = '#6f9048'; }
        else this.put(X.stump, wx - 8, base - 13);
      }
    }
    if (kind === 'clearing') {
      // a couple of old stumps and a rock round the edge of the clearing
      for (const [lx, y, def] of [[40, 160, X.stump], [214, 250, X.stump], [70, 272, X.mossRock], [196, 138, X.bracken]]) {
        this.put(def, wx0 + lx - def.img.width / 2, y - def.img.height);
      }
    }
  }

  lastSpot() { return this.map.hideSpots[this.map.hideSpots.length - 1]; }

  inClearingLocal(l, y, grow = 1) {
    return ((l - CLEAR.x) / (CLEAR.rx * grow)) ** 2 + ((y - CLEAR.y) / (CLEAR.ry * grow)) ** 2 < 1;
  }

  // Grassy banks either side, reeds along the water, the woods thin on the
  // near side (room for a run-up) and open on the far side.
  layCreek(wx0) {
    const X = this.X;
    for (let y = FN + 12, i = 0; y < FS - 8; y += 18 + Math.floor(hash(i, 51) * 10), i++) {
      const cx = this.creekCx(y);
      if (hash(i, 53) < 0.7) this.put(X.reeds, cx - CREEK_HW - 12 - hash(i, 55) * 4, y - 17);
      if (hash(i, 57) < 0.6) this.put(X.reeds, cx + CREEK_HW + 2 + hash(i, 59) * 4, y - 17);
    }
    // a few trees well back from the water on the near side
    for (const [lx, y, key] of [[20, 110, 'tree'], [44, 300, 'pine'], [12, 214, 'birch']]) {
      const def = key === 'birch' ? X.birch : this.P[key];
      this.put(def, wx0 + lx - def.img.width / 2, y - def.img.height, { noHide: true, see: true });
    }
    this.growWoods(wx0 + 176, wx0 + CW, 'woods');
  }

  // Highway 29 and the gas station, one piece of the section at a time
  // (each thing belongs to the piece its left edge falls in).
  layStation(s, wx0) {
    const X = this.X, F0 = this.finalAt * CW;
    const here = (lx) => F0 + lx >= wx0 && F0 + lx < wx0 + CW;
    const at = (lx, def, base, opts) => { if (here(lx)) this.put(def, F0 + lx, base - def.img.height, opts); };
    at(82, X.sign29, 158);
    at(STATION.store.x, X.store, STATION.store.base);
    at(STATION.canopy.x, X.canopy, STATION.canopy.base);
    at(420, X.iceBox, 150);
    at(270, this.P.trashcan, 150);
    at(214, X.priceSign, 392);
    at(440, this.P.lamppost, 112);
    at(440, this.P.lamppost, 386);
    // a few bushes round the back of the lot, and along the woods' edge on
    // the near side of the road (never in the middle, where the chase ends)
    for (const [lx, y] of [[478, 120], [516, 300], [552, 190], [490, 380], [30, 96], [44, 372], [8, 330]]) {
      at(lx, this.P.bush, y);
    }
  }

  /* ---------------- painting ---------------- */

  // Repaint canvas columns [x0, x1) (tile aligned) from scratch: tiles,
  // blended edges, then everything painted on top.
  paintRange(x0, x1) {
    const ctx = this.ctx, m = this.map;
    for (let tx = x0 / TILE; tx < x1 / TILE; tx++) {
      for (let ty = 0; ty < TH; ty++) ctx.drawImage(this.tiles[m.ground[ty * m.tw + tx]], tx * TILE, ty * TILE);
    }
    blendGround(ctx, m, this.tiles, TERRAIN, { tx0: x0 / TILE, tx1: x1 / TILE, ox: this.ox });
    this.decorate(x0, x1);
  }

  // Everything painted over the tiles in columns [x0, x1): sunlight, the
  // creek, the road and lot, the fire road, litter, the canopy.
  decorate(x0, x1) {
    const ctx = this.ctx, ox = this.ox;
    const w = x1 - x0;
    const img = ctx.getImageData(x0, 0, w, H);
    const out = img.data;
    const tex = (id) => texOf(this.tiles, id);
    // what each column is, and the (smooth) sunlight noise on a 2px grid
    const kinds = [];
    for (let x = 0; x < w; x++) kinds.push(this.kindAt(x0 + x + ox));
    const gw = (w >> 1) + 1, grid = new Float32Array(gw * ((H >> 1) + 1));
    for (let gy = (FN - 8) >> 1; gy <= (FS + 10) >> 1; gy++) {
      for (let gx = 0; gx < gw; gx++) grid[gy * gw + gx] = noise((x0 + ox + gx * 2) * 0.045, gy * 2 * 0.06);
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < w; x++) {
        const wx = x0 + x + ox, di = (y * w + x) * 4;
        const kind = kinds[x];
        if (kind === 'backdrop') continue;
        const band = y < FN - 8 || y > FS + 10;
        if (kind === 'final') {
          // the road runs right through the canopy bands, off both edges
          const lx = this.finalX(wx);
          if (roadPixel(out, di, lx, y, tex, noise(wx * 0.3, y * 0.3), hash(wx, y * 3 + 1))) continue;
          if (lx < STATION.woods && !band) dapple(out, di, wx, y, grid[(y >> 1) * gw + (x >> 1)], 0.8);
          continue;
        }
        if (band) continue;
        const n = grid[(y >> 1) * gw + (x >> 1)];
        if (kind === 'creek') {
          const d = wx - this.creekCx(y);
          if (Math.abs(d) < CREEK_HW + 8) {
            creekPixel(out, di, wx, y, d, CREEK_HW + 3 * (noise(wx * 0.2, y * 0.1) - 0.5), noise(wx * 0.25, y * 0.5), hash(wx * 5, y * 7));
            continue;
          }
        }
        const open = kind === 'clearing' ? 0.25 : kind === 'exit' ? this.local(wx) / CW * 0.6
          : kind === 'creek' || kind === 'woods' ? 0.6 : 0;
        dapple(out, di, wx, y, n, open);
      }
    }
    ctx.putImageData(img, x0, 0);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, 0, w, H);
    ctx.clip();

    // the fire road
    const pts = [];
    for (let wx = x0 + ox - 48; wx <= x1 + ox + 48; wx += 6) {
      const y = this.trackY(wx);
      if (y === null) { if (pts.length) break; continue; }
      pts.push({ x: wx - ox, y });
    }
    if (pts.length > 1) paintPath(ctx, this.tiles, pts, { halfW: 14, rut: 5, texIds: [T.ROAD_DIRT, T.ROAD_DIRT2], ox, clip: [x0, x1] });

    // litter: fallen leaves, twigs, pebbles and moss (just stray leaves on grass)
    for (let gy = Math.floor(FN / 8); gy * 8 < FS; gy++) {
      for (let gx = Math.floor((x0 + ox - 8) / 8); gx * 8 < x1 + ox + 4; gx++) {
        const wx = gx * 8 + Math.floor(hash(gx, gy * 3) * 7), y = gy * 8 + Math.floor(hash(gx * 3, gy) * 7);
        const kind = this.kindAt(wx);
        const ty = this.trackY(wx);
        if (ty !== null && Math.abs(y - ty) < 17) continue;
        if (this.canopyAt(wx, y)) continue;
        let amount = { start: 0.55, forest: 0.55, clearing: 0.3, exit: 0.4, creek: 0.3, woods: 0.35 }[kind] || 0;
        if (kind === 'creek' && Math.abs(wx - this.creekCx(y)) < CREEK_HW + 10) continue;
        if (kind === 'final') {
          const lx = this.finalX(wx);
          amount = lx < ROAD.verge - 4 ? 0.25 : 0;
        }
        if (!amount) continue;
        const tile = this.tileAt(wx - (wx & 15), y >> 4);
        const grass = tile === T.GLADE || tile === T.GLADE2 || tile === T.GRASS2;
        // leaves blown out across the grass (plenty in the clearing, so the
        // pile in it is just more of the same)
        if (grass) { if (hash(gx * 5, gy * 9) < (kind === 'clearing' ? 0.2 : amount * 0.18)) strayLeaf(ctx, wx - ox, y, gx * 31 + gy); }
        else litterCell(ctx, wx - ox, y, gx, gy, amount);
      }
    }

    // the leaves in the clearing
    if (this.clearingAt !== null) {
      const sx = this.clearingAt * CW + SPIRAL.x - ox;
      if (sx + 16 > x0 && sx - 16 < x1) ctx.drawImage(this.spiral, Math.round(sx - 16), SPIRAL.y - 11);
    }

    // the canopy: floor colour under it, then crowns back to front
    ctx.fillStyle = CANOPY_FLOOR;
    for (let x = x0; x < x1; x++) {
      const wx = x + ox;
      if (this.kindAt(wx) === 'backdrop' || (this.kindAt(wx) === 'final' && this.finalX(wx) >= STATION.woods + 6)) { ctx.fillRect(x, 0, 1, H); continue; }
      if (this.canopyAt(wx, 0)) ctx.fillRect(x, 0, 1, FN - 6);
      if (this.canopyAt(wx, H - 1)) ctx.fillRect(x, FS + 8, 1, H - FS - 8);
    }
    for (const c of this.crowns(x0 + ox - 14, x1 + ox + 14)) drawCrown(ctx, c.x - ox, c.y, c.r, c.pine);
    ctx.restore();
  }

  // Canopy crowns (world coords) whose centres fall in [wx0, wx1): a
  // staggered lattice, each crown jittered and sized from its own cell.
  crowns(wx0, wx1) {
    const list = [];
    for (let j = -1; j * 8 < H + 12; j++) {
      const cy0 = j * 8 + 4;
      for (let i = Math.floor(wx0 / 10) - 1; i * 10 < wx1 + 10; i++) {
        const cx0 = i * 10 + (j & 1) * 5;
        if (cx0 < wx0 || cx0 >= wx1 || !this.canopyAt(cx0, cy0)) continue;
        list.push({
          x: Math.round(cx0 + (hash(i, j * 7 + 3) - 0.5) * 6), y: Math.round(cy0 + (hash(i * 5 + 1, j) - 0.5) * 4),
          r: 6 + Math.floor(hash(i + 9, j * 3) * 4), pine: hash(i * 3, j * 11 + 2) < 0.32,
        });
      }
    }
    return list.sort((a, b) => a.y - b.y || a.x - b.x);
  }

  // The thicket down the canvas's left edge: canopy so dense it's solid.
  // The same every time, so it's painted once and stamped.
  paintThicket() {
    if (!this.thicket) {
      const c = document.createElement('canvas');
      c.width = THK + 16; c.height = H;
      const t = c.getContext('2d');
      t.fillStyle = CANOPY_FLOOR;
      t.fillRect(0, 0, THK - 6, H);
      const list = [];
      for (let j = -1; j * 7 < H + 10; j++) {
        for (let i = 0; i * 8 < THK + 2; i++) {
          list.push({
            x: i * 8 + (j & 1) * 4 + Math.round((hash(i, j + 91) - 0.5) * 4), y: j * 7 + 3 + Math.round((hash(j, i + 93) - 0.5) * 3),
            r: 7 + Math.floor(hash(i + 3, j * 5) * 4), pine: hash(i * 7, j + 95) < 0.36,
          });
        }
      }
      list.sort((a, b) => a.y - b.y || a.x - b.x);
      for (const q of list) drawCrown(t, q.x, q.y, q.r, q.pine);
      this.thicket = c;
    }
    this.ctx.drawImage(this.thicket, 0, 0);
  }

  // Ground to paint later, a slice a frame (it's always well off screen):
  // tick() does the next slice, flush() the lot.
  queuePaint(x0, x1) {
    for (let x = x0; x < x1; x += SLICE) this.work.push([x, Math.min(x1, x + SLICE)]);
  }
  tick() {
    const job = this.work.shift();
    if (job) this.paintRange(job[0], job[1]);
  }
  flush() {
    while (this.work.length) this.tick();
  }

  /* ---------------- streaming ---------------- */

  // Drop the piece at the back, slide the rest back CW px (the game slides
  // everything that moves: see Game.shiftWorld), lay out and paint the next
  // piece at the front, repaint the thicket. Whatever the director needs
  // out of the way (aliens, the van) it's already moved.
  shift() {
    const m = this.map, cut = CW + THK + 8;
    this.flush();
    this.ctx.drawImage(this.ctx.canvas, CW, 0, this.w - CW, H, 0, 0, this.w - CW, H);
    const step = CW / TILE;
    for (let ty = 0; ty < TH; ty++) m.ground.copyWithin(ty * m.tw, ty * m.tw + step, (ty + 1) * m.tw);
    const keep = (list, gone) => {
      let k = 0;
      for (const o of list) {
        if (o.fixed) { list[k++] = o; continue; }
        if (gone(o)) continue;
        o.x -= CW;
        list[k++] = o;
      }
      list.length = k;
    };
    keep(m.props, (pr) => pr.x + pr.img.width / 2 < cut);
    keep(m.solids, (sd) => sd !== m.vanSolid && sd.x + sd.w < cut);
    keep(m.hideSpots, (sp) => sp.x < cut + 16);
    m.van.x -= CW;
    this.ox += CW;
    const n = this.ox / CW + NP - 1;
    if (this.kinds[n] === undefined) this.kinds[n] = this.nextKind(n);
    this.layOut(NP - 1);
    this.queuePaint((NP - 1) * CW - TILE, this.w);
    this.paintThicket();
  }

  // Throw away the pieces from canvas x `fromX` (piece aligned) on and lay
  // out `kinds` there instead, then `after` for good. Only ever called on
  // pieces off screen.
  replaceAhead(fromX, kinds, after) {
    const m = this.map, n0 = this.ox / CW + fromX / CW;
    this.flush();
    const drop = (list) => {
      let k = 0;
      for (const o of list) if (o.fixed || o === m.vanSolid || !(o.piece >= n0)) list[k++] = o;
      list.length = k;
    };
    drop(m.props); drop(m.solids); drop(m.hideSpots);
    this.kinds.length = n0;
    if (this.clearingAt !== null && this.clearingAt >= n0) this.clearingAt = null;
    if (this.creekAt !== null && this.creekAt >= n0) this.creekAt = null;
    if (this.finalAt !== null && this.finalAt >= n0) this.finalAt = null;
    this.queue = kinds.slice();
    this.after = after;
    for (let s = fromX / CW; s < NP; s++) this.kinds[this.ox / CW + s] = this.nextKind(this.ox / CW + s);
    for (let s = fromX / CW; s < NP; s++) this.layOut(s);
    this.queuePaint(Math.max(0, fromX - TILE), this.w);
  }

  // After the pieces changed: a new nav grid for the game, and any hiding
  // spot that landed somewhere nothing can get to is dropped.
  settle(game) {
    const m = this.map;
    game.nav = buildNav(m);
    const { gw, cells } = game.nav;
    const bad = (sp) => {
      const c = cells[Math.floor(sp.y / TILE) * gw + Math.floor(sp.x / TILE)];
      if (c === 1) return true;
      return m.solids.some(sd => !sd.jumpable && sp.x > sd.x - 3 && sp.x < sd.x + sd.w + 3 && sp.y > sd.y - 3 && sp.y < sd.y + sd.h + 3);
    };
    let k = 0;
    for (const sp of m.hideSpots) {
      if (sp.fresh) { sp.fresh = false; if (bad(sp)) continue; }
      m.hideSpots[k++] = sp;
    }
    m.hideSpots.length = k;
  }
}
