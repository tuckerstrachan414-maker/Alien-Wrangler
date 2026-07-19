// PNG-based props for Maple Street only, cropped from a user-supplied city
// asset pack (CP_V1.1.0 by nyknck). Every other map keeps the procedural art
// from sprites.js — these are loaded and used exclusively by buildNeighborhood().

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

export async function loadPngProps(base = 'assets/maple/') {
  const names = ['house_a', 'house_b', 'house_c', 'car_red', 'car_blue', 'truck', 'lamp', 'tree', 'trashcan', 'mailbox'];
  const imgs = await Promise.all(names.map(n => loadImage(`${base}${n}.png`)));
  const [houseA, houseB, houseC, carRed, carBlue, truck, lamp, tree, trashcan, mailbox] = imgs;

  const house = (img, windows) => ({
    img, solid: { x: 2, y: 24, w: img.width - 4, h: img.height - 26 },
    jumpable: false, hide: false, tall: true, windows,
  });

  return {
    houseA: house(houseA, [
      { x: 8, y: 35, w: 40, h: 11 }, { x: 8, y: 55, w: 40, h: 11 }, { x: 8, y: 75, w: 40, h: 11 },
    ]),
    houseB: house(houseB, [
      { x: 9, y: 35, w: 12, h: 11 }, { x: 34, y: 35, w: 12, h: 11 },
      { x: 9, y: 55, w: 12, h: 11 }, { x: 34, y: 55, w: 12, h: 11 },
      { x: 9, y: 75, w: 12, h: 11 }, { x: 34, y: 75, w: 12, h: 11 },
    ]),
    houseC: house(houseC, [
      { x: 8, y: 29, w: 38, h: 88 },
    ]),
    carRed: { img: carRed, solid: { x: 2, y: 4, w: 48, h: 20 }, jumpable: false, hide: true, tall: false },
    carBlue: { img: carBlue, solid: { x: 2, y: 4, w: 48, h: 20 }, jumpable: false, hide: true, tall: false },
    truck: { img: truck, solid: { x: 2, y: 4, w: 62, h: 24 }, jumpable: false, hide: true, tall: false },
    lamp: { img: lamp, solid: { x: 4, y: 28, w: 7, h: 6 }, jumpable: false, hide: false, tall: true },
    tree: { img: tree, solid: { x: 6, y: 22, w: 10, h: 6 }, jumpable: false, hide: true, tall: true },
    trashcan: { img: trashcan, solid: { x: 2, y: 6, w: 16, h: 14 }, jumpable: false, hide: true, tall: false },
    mailbox: { img: mailbox, solid: { x: 3, y: 4, w: 16, h: 14 }, jumpable: false, hide: false, tall: true },
  };
}
