// Paints a map's ground into one canvas: every tile, the soft edges between
// textures (map.blend), then whatever the map paints on top (roads, forest
// canopy, decals). The game draws this once per mission; the map editor
// uses the same code, so the editor shows exactly what the game will.
import { TILE, canvas } from './data/sprites.js';
import { blendGround } from './terrain.js';

// A tile id with no texture (a custom tile that was deleted): a loud
// magenta check, so it can't go unnoticed.
let missing = null;
export function missingTile() {
  if (!missing) {
    const [c, x] = canvas(TILE, TILE);
    for (let y = 0; y < TILE; y += 4) for (let i = 0; i < TILE; i += 4) {
      x.fillStyle = ((i + y) / 4) % 2 ? '#2a0a2a' : '#e040e0';
      x.fillRect(i, y, 4, 4);
    }
    missing = c;
  }
  return missing;
}

export function paintMapGround(map, tiles, cv = document.createElement('canvas')) {
  cv.width = map.w; cv.height = map.h;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  for (let ty = 0; ty < map.th; ty++)
    for (let tx = 0; tx < map.tw; tx++)
      g.drawImage(tiles[map.ground[ty * map.tw + tx]] || missingTile(), tx * TILE, ty * TILE);
  if (map.blend) blendGround(g, map, tiles);
  if (map.paintGround) map.paintGround(g, tiles);
  return cv;
}
