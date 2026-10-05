// The editor's map viewport: camera (pan / zoom), the map drawn the way the
// game draws it (ground canvas, y-sorted props, buildings, the van), and
// the editing overlays on top (collision, nav grid, hiding spots, ground-art
// handles, story markers, selection, the current tool's preview).
import { TILE, flipX } from '../data/sprites.js';
import { buildNav } from '../nav.js';
import { paintBox, objBox, PAINT_KINDS } from './schema.js';

const COL = {
  wall: '#ff5e6c', hop: '#ffd75e', glass: '#6ec2ff', inside: '#59d98c', behind: '#ffb35e',
  sel: '#ffd75e', hover: '#41f0d8', paint: '#d69bff', story: '#ff8ad8',
};

export class MapView {
  constructor(canvas, ed) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.ed = ed;
    this.z = 2;            // CSS px per world px
    this.ox = 0; this.oy = 0;
    this.dpr = 1;
    this.raf = 0;
    this.navCache = null;
    this.vanFlip = null;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  resize() {
    const r = this.cv.getBoundingClientRect();
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.cv.width = Math.max(1, Math.round(r.width * this.dpr));
    this.cv.height = Math.max(1, Math.round(r.height * this.dpr));
    this.request();
  }

  get cssW() { return this.cv.width / this.dpr; }
  get cssH() { return this.cv.height / this.dpr; }

  toWorld(clientX, clientY) {
    const r = this.cv.getBoundingClientRect();
    return { x: this.ox + (clientX - r.left) / this.z, y: this.oy + (clientY - r.top) / this.z };
  }

  zoomAt(f, clientX, clientY) {
    const r = this.cv.getBoundingClientRect();
    const cx = clientX ?? r.left + r.width / 2, cy = clientY ?? r.top + r.height / 2;
    const w = this.toWorld(cx, cy);
    this.z = Math.max(0.25, Math.min(24, this.z * f));
    // settle on whole-number zooms when close, for crisp pixels
    if (this.z > 1 && Math.abs(this.z - Math.round(this.z)) < 0.06) this.z = Math.round(this.z);
    this.ox = w.x - (cx - r.left) / this.z;
    this.oy = w.y - (cy - r.top) / this.z;
    this.request();
  }

  pan(dxCss, dyCss) {
    this.ox -= dxCss / this.z;
    this.oy -= dyCss / this.z;
    this.request();
  }

  fit(map) {
    if (!map) return;
    const pad = 24;
    const z = Math.min((this.cssW - pad * 2) / map.w, (this.cssH - pad * 2) / map.h);
    this.z = z >= 1 ? Math.max(1, Math.floor(z * 4) / 4) : Math.max(0.25, z);
    this.ox = map.w / 2 - this.cssW / 2 / this.z;
    this.oy = map.h / 2 - this.cssH / 2 / this.z;
    this.request();
  }

  centerOn(x, y) {
    this.ox = x - this.cssW / 2 / this.z;
    this.oy = y - this.cssH / 2 / this.z;
    this.request();
  }

  request() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); });
  }

  invalidateNav() { this.navCache = null; }

  draw() {
    const { ctx, cv, ed } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#06080e';
    ctx.fillRect(0, 0, cv.width, cv.height);
    const map = ed.map;
    if (!map) return;
    const k = this.z * this.dpr;
    const hair = 1 / k;
    ctx.setTransform(k, 0, 0, k, -this.ox * k, -this.oy * k);
    ctx.imageSmoothingEnabled = false;
    const L = ed.layers;
    const view = { x0: this.ox, y0: this.oy, x1: this.ox + this.cssW / this.z, y1: this.oy + this.cssH / this.z };
    const onScreen = (x, y, w, h) => x < view.x1 && x + w > view.x0 && y < view.y1 && y + h > view.y0;
    const labels = [];

    ctx.fillStyle = '#0a0c14';
    ctx.fillRect(0, 0, map.w, map.h);
    if (L.ground && ed.ground) ctx.drawImage(ed.ground, 0, 0);
    if (map.tint === 'night' && L.night) {
      ctx.fillStyle = 'rgba(14, 20, 54, 0.44)';
      ctx.fillRect(0, 0, map.w, map.h);
    }

    // ---- the world, y-sorted like the game ----
    const items = [];
    if (L.props) for (const pr of map.props) {
      if (onScreen(pr.x, pr.y, pr.img.width, pr.img.height)) items.push({ y: pr.baseY, pr });
    }
    if (L.buildings) for (const b of map.buildings) items.push({ y: b.baseY, b });
    if (L.van) {
      items.push({ y: map.van.y + 28, van: true });
      items.push({ y: map.spawn.y, spawn: true });
    }
    items.sort((a, b) => a.y - b.y);
    const roof = L.roofs;   // 'on' | 'fade' | 'off'
    for (const it of items) {
      if (it.pr) {
        ctx.drawImage(it.pr.img, it.pr.x, it.pr.y);
      } else if (it.b) {
        const b = it.b;
        if (roof !== 'on') ctx.drawImage(b.cut, b.ax, b.ay);
        if (roof !== 'off') {
          ctx.globalAlpha = roof === 'fade' ? 0.3 : 1;
          ctx.drawImage(b.shell, b.ax, b.ay);
          ctx.globalAlpha = 1;
        }
      } else if (it.van) {
        const v = map.van;
        let img = ed.assets.van;
        if (v.flip) {
          if (!this.vanFlip || this.vanFlip.src !== img) this.vanFlip = { src: img, img: flipX(img) };
          img = this.vanFlip.img;
        }
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(v.x + 23, v.y + 27, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.drawImage(img, v.x, v.y);
        const door = v.flip ? { x: v.x - 4, y: v.y + 15 } : { x: v.x + 50, y: v.y + 15 };
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#59d98c';
        ctx.beginPath(); ctx.arc(door.x, door.y, 24, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (it.spawn) {
        const img = ed.assets.actors.player.down;
        ctx.drawImage(img, Math.round(map.spawn.x - 6), Math.round(map.spawn.y - 15));
      }
    }

    // ---- overlays ----
    ctx.lineWidth = hair;
    if (L.grid && this.z >= 1.5) {
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.beginPath();
      const tx0 = Math.max(0, Math.floor(view.x0 / TILE)), tx1 = Math.min(map.tw, Math.ceil(view.x1 / TILE));
      const ty0 = Math.max(0, Math.floor(view.y0 / TILE)), ty1 = Math.min(map.th, Math.ceil(view.y1 / TILE));
      for (let tx = tx0; tx <= tx1; tx++) { ctx.moveTo(tx * TILE, ty0 * TILE); ctx.lineTo(tx * TILE, ty1 * TILE); }
      for (let ty = ty0; ty <= ty1; ty++) { ctx.moveTo(tx0 * TILE, ty * TILE); ctx.lineTo(tx1 * TILE, ty * TILE); }
      ctx.stroke();
    }
    if (L.nav) {
      if (!this.navCache || this.navCache.map !== map) this.navCache = { map, nav: buildNav(map) };
      const { gw, gh, cells } = this.navCache.nav;
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
        const c = cells[y * gw + x];
        if (!c) continue;
        ctx.fillStyle = c === 1 ? 'rgba(255, 70, 90, 0.33)' : 'rgba(255, 215, 94, 0.28)';
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
    if (L.solids) {
      for (const s of map.solids) {
        if (s.src === undefined && (s.x < -1 || s.y < -1 || s.x + s.w > map.w + 1 || s.y + s.h > map.h + 1)) continue; // world border
        if (!onScreen(s.x, s.y, s.w, s.h)) continue;
        const own = s.src !== undefined && ed.doc.objects[s.src] && ed.doc.objects[s.src].t === 'solid';
        const col = s.glass ? COL.glass : s.jumpable ? COL.hop : COL.wall;
        ctx.globalAlpha = own ? 0.22 : 0.13;
        ctx.fillStyle = col;
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.globalAlpha = own ? 0.95 : 0.6;
        ctx.strokeStyle = col;
        ctx.setLineDash(own ? [] : [3 * hair, 2 * hair]);
        ctx.strokeRect(s.x + hair / 2, s.y + hair / 2, s.w - hair, s.h - hair);
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      if (map.vanSolid && L.van) {
        const s = map.vanSolid;
        ctx.strokeStyle = COL.wall; ctx.globalAlpha = 0.5;
        ctx.strokeRect(s.x, s.y, s.w, s.h);
        ctx.globalAlpha = 1;
      }
    }
    if (L.paint) {
      ctx.strokeStyle = COL.paint;
      ed.doc.paint.forEach((o, i) => {
        if (o.pts) {
          ctx.globalAlpha = 0.85;
          ctx.setLineDash([4 * hair, 3 * hair]);
          ctx.beginPath();
          o.pts.forEach((p, j) => (j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
          ctx.stroke();
          ctx.setLineDash([]);
          const r = 3 / this.z + 1;
          for (const p of o.pts) {
            ctx.fillStyle = o.id === 'road' ? COL.story : COL.paint;
            ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
          }
          ctx.globalAlpha = 1;
          if (o.id === 'road' && L.story) labels.push({ x: o.pts[Math.floor(o.pts.length / 2)].x, y: o.pts[Math.floor(o.pts.length / 2)].y, text: 'STORY ROAD', col: COL.story });
        } else {
          const b = paintBox(o);
          if (!onScreen(b.x, b.y, b.w, b.h)) return;
          ctx.globalAlpha = 0.7;
          ctx.setLineDash([3 * hair, 3 * hair]);
          ctx.strokeRect(b.x, b.y, b.w, b.h);
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
      });
    }
    if (L.fx) {
      for (const s of map.smoke) this.puff(s.x, s.y, '#b8b0a8');
      for (const v of map.volcanoes) this.puff(v.x, v.y, '#ff9a4a');
      if (map.stealth || map.homes.length) {
        ctx.strokeStyle = '#ffe58a'; ctx.globalAlpha = 0.8;
        for (const hm of map.homes) ctx.strokeRect(hm.x, hm.y, hm.w, hm.h);
        ctx.globalAlpha = 1;
      }
    }
    if (L.hides) {
      for (const s of map.hideSpots) {
        if (!onScreen(s.x - 6, s.y - 6, 12, 12)) continue;
        const r = Math.max(2.5 / this.z, Math.min(4, 6 / this.z));   // ~4-6 screen px at any zoom
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath(); ctx.arc(s.x, s.y, r + hair * 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = s.inside ? COL.inside : COL.behind;
        ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
        if (!s.inside) { ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.beginPath(); ctx.arc(s.x, s.y, r * 0.45, 0, Math.PI * 2); ctx.fill(); }
        if (s.tutor) labels.push({ x: s.x, y: s.y - 8, text: 'TUTORIAL HIDER', col: COL.story });
        if (s.zone && this.z >= 2) labels.push({ x: s.x, y: s.y + 10, text: s.zone, col: '#9fb0d0', small: true });
      }
    }
    if (L.story) {
      const st = ed.doc.story || {};
      if (typeof st.treeLine === 'number') {
        ctx.strokeStyle = COL.story; ctx.globalAlpha = 0.9;
        ctx.setLineDash([6 * hair, 4 * hair]);
        ctx.beginPath(); ctx.moveTo(0, st.treeLine); ctx.lineTo(map.w, st.treeLine); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
        labels.push({ x: Math.max(view.x0 + 60 / this.z, 40), y: st.treeLine - 3, text: 'TREE LINE: aliens flee past this', col: COL.story, left: true });
      }
      if (st.arrive) {
        this.flag(st.arrive.x, st.arrive.y, COL.story);
        labels.push({ x: st.arrive.x, y: st.arrive.y + 10, text: 'WALK-IN START', col: COL.story });
      }
      if (map.exit) {
        this.flag(map.exit.x, Math.max(4, map.exit.y + 40), COL.story);
        labels.push({ x: map.exit.x, y: Math.max(4, map.exit.y + 40) + 10, text: 'STAMPEDE EXIT', col: COL.story });
      }
    }
    if (L.van) labels.push({ x: map.spawn.x, y: map.spawn.y + 9, text: 'SPAWN', col: '#e8ecf4', small: true });

    // map edge
    ctx.strokeStyle = 'rgba(110, 194, 255, 0.55)';
    ctx.strokeRect(-hair, -hair, map.w + hair * 2, map.h + hair * 2);

    // ---- hover + selection ----
    const outline = (box, col, w = 1.5) => {
      ctx.strokeStyle = col; ctx.lineWidth = hair * w;
      ctx.strokeRect(box.x - hair, box.y - hair, box.w + hair * 2, box.h + hair * 2);
      ctx.lineWidth = hair;
    };
    if (ed.hover && !ed.isSelected(ed.hover)) {
      const b = ed.boxOf(ed.hover);
      if (b) outline(b, COL.hover);
    }
    for (const s of ed.sel) {
      const b = ed.boxOf(s);
      if (!b) continue;
      outline(b, COL.sel, 2);
      if (ed.sel.length === 1 && ed.resizable(s)) {
        const r = 3.5 / this.z;
        ctx.fillStyle = COL.sel;
        for (const [hx, hy] of handlesOf(b)) ctx.fillRect(hx - r, hy - r, r * 2, r * 2);
      }
    }
    if (ed.marquee) {
      const m = ed.marquee;
      ctx.fillStyle = 'rgba(110, 194, 255, 0.12)';
      ctx.fillRect(Math.min(m.x0, m.x1), Math.min(m.y0, m.y1), Math.abs(m.x1 - m.x0), Math.abs(m.y1 - m.y0));
      ctx.strokeStyle = COL.glass;
      ctx.strokeRect(Math.min(m.x0, m.x1), Math.min(m.y0, m.y1), Math.abs(m.x1 - m.x0), Math.abs(m.y1 - m.y0));
    }
    if (ed.tool && ed.tool.overlay) ed.tool.overlay(ctx, this, hair);

    // ---- labels, in screen space ----
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (const lb of labels) {
      const sx = (lb.x - this.ox) * this.z, sy = (lb.y - this.oy) * this.z;
      if (sx < -200 || sy < -20 || sx > this.cssW + 200 || sy > this.cssH + 20) continue;
      ctx.font = `${lb.small ? 9 : 10}px ui-monospace, Menlo, monospace`;
      const w = ctx.measureText(lb.text).width;
      const x = lb.left ? sx : sx - w / 2;
      ctx.fillStyle = 'rgba(6, 8, 14, 0.75)';
      ctx.fillRect(x - 3, sy - 10, w + 6, 13);
      ctx.fillStyle = lb.col;
      ctx.fillText(lb.text, x, sy);
    }
  }

  puff(x, y, col) {
    const { ctx } = this;
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.75;
    for (const [dx, dy, r] of [[0, 0, 2.5], [2, -4, 2], [-1, -8, 1.6]]) {
      ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  flag(x, y, col) {
    const { ctx } = this;
    ctx.fillStyle = col;
    ctx.fillRect(x - 0.5, y - 12, 1.5, 12);
    ctx.beginPath(); ctx.moveTo(x + 1, y - 12); ctx.lineTo(x + 8, y - 9); ctx.lineTo(x + 1, y - 6); ctx.fill();
  }
}

// Resize handles of a box: corners then edge midpoints (index order matters
// to the select tool).
export function handlesOf(b) {
  const x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  return [[x0, y0], [x1, y0], [x0, y1], [x1, y1], [mx, y0], [mx, y1], [x0, my], [x1, my]];
}

export { COL, PAINT_KINDS };
