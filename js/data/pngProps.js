// PNG-based props + road tiles for Maple Street only, cropped from a
// user-supplied city asset pack (CP_V1.1.0 by nyknck). Every other map keeps
// the procedural art from sprites.js — these are used exclusively by
// buildNeighborhood().

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

// Flips a prop vertically (canvas + solid box + windows) so a house's door,
// drawn at the bottom of the source art, faces the road for a row of houses
// on the far side of the street.
function flipY(def) {
  const { img } = def;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.translate(0, img.height);
  ctx.scale(1, -1);
  ctx.drawImage(img, 0, 0);
  const flipRect = (r) => ({ x: r.x, y: img.height - r.y - r.h, w: r.w, h: r.h });
  return {
    ...def,
    img: c,
    solid: def.solid && flipRect(def.solid),
    windows: (def.windows || []).map(flipRect),
  };
}

export async function loadPngProps(base = 'assets/maple/') {
  const names = [
    'house_a', 'house_b', 'house_c', 'house_i', 'house_j', 'house_k',
    'car_red', 'car_blue', 'truck', 'truck2',
    'lamp', 'tree', 'trashcan', 'mailbox', 'trafficlight',
    'tile_road', 'tile_crosswalk_h', 'tile_crosswalk_v', 'tile_lane_h', 'tile_lane_v',
    'tile_manhole', 'tile_drain',
  ];
  const imgs = await Promise.all(names.map(n => loadImage(`${base}${n}.png`)));
  const byName = Object.fromEntries(names.map((n, i) => [n, imgs[i]]));

  const house = (img, windows) => ({
    img, solid: { x: 2, y: 24, w: img.width - 4, h: img.height - 26 },
    jumpable: false, hide: false, tall: true, windows,
  });
  // Tall apartment-style buildings (used sparingly, as corner/landmark buildings).
  const houseA = house(byName.house_a, [
    { x: 8, y: 35, w: 40, h: 11 }, { x: 8, y: 55, w: 40, h: 11 }, { x: 8, y: 75, w: 40, h: 11 },
  ]);
  const houseB = house(byName.house_b, [
    { x: 9, y: 35, w: 12, h: 11 }, { x: 34, y: 35, w: 12, h: 11 },
    { x: 9, y: 55, w: 12, h: 11 }, { x: 34, y: 55, w: 12, h: 11 },
    { x: 9, y: 75, w: 12, h: 11 }, { x: 34, y: 75, w: 12, h: 11 },
  ]);
  const houseC = house(byName.house_c, [
    { x: 8, y: 29, w: 38, h: 88 },
  ]);
  // Single-story family homes — the main building stock for the street.
  const smallHouse = (img) => ({
    img, solid: { x: 2, y: 16, w: img.width - 4, h: img.height - 18 },
    jumpable: false, hide: false, tall: true,
    windows: [
      { x: 8, y: 20, w: 12, h: 8 }, { x: 32, y: 20, w: 12, h: 8 },
      { x: 8, y: 30, w: 12, h: 8 }, { x: 32, y: 30, w: 12, h: 8 },
    ],
  });
  const houseI = smallHouse(byName.house_i);
  const houseJ = smallHouse(byName.house_j);
  const houseK = smallHouse(byName.house_k);

  const vehicle = (img) => ({
    img, solid: { x: 2, y: 4, w: img.width - 4, h: img.height - 8 },
    jumpable: false, hide: true, tall: false,
  });

  return {
    houseA, houseB, houseC, houseI, houseJ, houseK,
    // pre-flipped variants for the far side of the street (doors face the road)
    houseAFlipped: flipY(houseA), houseBFlipped: flipY(houseB), houseCFlipped: flipY(houseC),
    houseIFlipped: flipY(houseI), houseJFlipped: flipY(houseJ), houseKFlipped: flipY(houseK),

    carRed: vehicle(byName.car_red),
    carBlue: vehicle(byName.car_blue),
    truck: vehicle(byName.truck),
    truck2: vehicle(byName.truck2),

    lamp: { img: byName.lamp, solid: { x: 4, y: 28, w: 7, h: 6 }, jumpable: false, hide: false, tall: true },
    tree: { img: byName.tree, solid: { x: 6, y: 22, w: 10, h: 6 }, jumpable: false, hide: true, tall: true },
    trashcan: { img: byName.trashcan, solid: { x: 2, y: 6, w: 16, h: 14 }, jumpable: false, hide: true, tall: false },
    mailbox: { img: byName.mailbox, solid: { x: 3, y: 4, w: 16, h: 14 }, jumpable: false, hide: false, tall: true },
    trafficlight: { img: byName.trafficlight, solid: { x: 2, y: 28, w: 8, h: 6 }, jumpable: false, hide: false, tall: true },

    tiles: {
      road: byName.tile_road,
      crosswalkH: byName.tile_crosswalk_h,
      crosswalkV: byName.tile_crosswalk_v,
      laneH: byName.tile_lane_h,
      laneV: byName.tile_lane_v,
      manhole: byName.tile_manhole,
      drain: byName.tile_drain,
    },
  };
}
