// Mission ladder + equipment catalog.
// Pay rule: base pay for the mission, minus a deduction for every alien that escapes.

export const MISSIONS = [
  {
    id: 0, map: 'playground', name: 'First Contact',
    desc: '3 grunts spotted at the playground. Easy money. Probably.',
    brief: 'A small craft came down behind the swings and three Grunts scattered into Sunny Pines Playground. They hide in the bushes, the slide tower and the jungle gym, so watch for rustling leaves. Low risk and easy money, probably.',
    aliens: { grunt: 3 }, time: 170, pay: 120, escapeCost: 35,
  },
  {
    id: 1, map: 'playground', name: 'Recess Is Over',
    desc: 'More of them — and one is fast. Watch the bushes.',
    brief: 'The playground is crawling again, and this time one of them is a Scout that bolts the moment you get close. Check every bush and cut off its escape before you dive.',
    aliens: { grunt: 3, scout: 1 }, time: 160, pay: 180, escapeCost: 40,
  },
  {
    id: 2, map: 'neighborhood', name: 'Suburban Stakeout',
    desc: 'Aliens on Maple Street at 3am. Keep it quiet — sprinting near a house wakes the block. Watch the NOISE meter.',
    brief: 'Three Grunts landed on Maple Street while the whole block sleeps. Sprinting fills the NOISE meter, 3x faster outside a house, and dashes or missed dives spike it. Fill it and the block wakes up: the cops get called and the job is blown.',
    aliens: { grunt: 3 }, time: 170, pay: 260, escapeCost: 45,
  },
  {
    id: 3, map: 'farmhouse', name: 'Crop Circles',
    desc: 'They landed in the corn. The corn is a problem.',
    brief: 'Crop circles appeared overnight at Hollow Creek Farm and the occupants are dug into the corn. Visibility in the rows is near zero, so listen for rustling and use the barn to cut them off.',
    aliens: { grunt: 3, scout: 1 }, time: 160, pay: 260, escapeCost: 50,
  },
  {
    id: 4, map: 'farmhouse', name: 'Barnstormers',
    desc: 'Scouts everywhere and a Trooper with a stun pistol. Stay mobile.',
    brief: 'Two Scouts and a Trooper are loose around the barn. The Trooper is armored, so your first grab only knocks its helmet off, and its stun bolts make you drop whatever you are carrying. Stay mobile.',
    aliens: { grunt: 2, scout: 2, trooper: 1 }, time: 150, pay: 340, escapeCost: 55,
  },
  {
    id: 5, map: 'neighborhood', name: 'Quiet Hours',
    desc: 'More of them, and a Trooper — but the neighbours are lighter sleepers. Sneak, do not sprint.',
    brief: 'Back on Maple Street, now with Scouts and an armored Trooper. Sprinting, dashes and missed dives fill the NOISE meter, and a full meter wakes the block and blows the job. Walk near the houses and save the loud moves for the road.',
    aliens: { grunt: 2, scout: 2, trooper: 1 }, time: 155, pay: 460, escapeCost: 60,
  },
  {
    id: 6, map: 'shipyard', name: 'Dock Rats',
    desc: 'The container maze is crawling. Check the open containers.',
    brief: 'Stowaways from inbound cargo have infested the Rust Harbor container yard. Open containers are hiding spots and the steel walls make blind corners. Drive them north onto the dead-end dock.',
    aliens: { grunt: 2, scout: 2, trooper: 1 }, time: 150, pay: 420, escapeCost: 65,
  },
  {
    id: 7, map: 'tropical', name: 'Island Getaway',
    desc: 'They crashed on a jungle island. Lush cover everywhere — mind the volcano.',
    brief: 'A craft crashed into the jungle canopy on Isla Verde and the survivors scattered. Ferns and huts give cover everywhere, and the volcano at the center is impassable, so they will circle it to lose you.',
    aliens: { scout: 2, trooper: 1 }, time: 155, pay: 500, escapeCost: 65,
  },
  {
    id: 8, map: 'shipyard', name: 'Armored Cargo',
    desc: 'Troopers in force. Their armor shrugs off your first grab.',
    brief: 'Three armored Troopers are holed up in the container maze. Each one takes two grabs because the first only knocks the helmet off, and their stun bolts make you drop your catch. A net pins them so the armor does not matter.',
    aliens: { scout: 2, trooper: 3 }, time: 145, pay: 580, escapeCost: 75,
  },
  {
    id: 9, map: 'tropical', name: 'Volcano Rising',
    desc: 'Elites hiding in the ferns while the volcano rumbles. A Noise Maker will shake them loose.',
    brief: 'An Elite is hiding in the Isla Verde ferns while the volcano rumbles. Elites cloak while they run and fire stun bolts. A Noise Maker bang knocks the cloak off and shakes it out of cover.',
    aliens: { grunt: 1, scout: 2, trooper: 2, elite: 1 }, time: 145, pay: 720, escapeCost: 90,
  },
  {
    id: 10, map: 'playground', name: 'Night Shift',
    desc: 'An Elite is on-site: it cloaks. A Noise Maker bang knocks the cloak right off it.',
    brief: 'Night shift at Sunny Pines: an Elite is on site with Scouts and Troopers. Elites cloak while they run and are near-invisible, but a Noise Maker bang knocks the cloak right off.',
    aliens: { scout: 2, trooper: 2, elite: 1 }, time: 140, pay: 700, escapeCost: 90,
  },
  {
    id: 11, map: 'farmhouse', name: 'The Harvest',
    desc: 'Elites in the corn. This is what they pay you for.',
    brief: 'Two Elites are dug into the Hollow Creek corn alongside Troopers and Scouts. Visibility in the rows is near zero and the Elites cloak. This is what they pay you for.',
    aliens: { grunt: 1, scout: 2, trooper: 2, elite: 2 }, time: 140, pay: 840, escapeCost: 100,
  },
  {
    id: 12, map: 'shipyard', name: 'Full Invasion',
    desc: 'Everything at once. Bring everything you own.',
    brief: 'Everything they have is in the Rust Harbor container maze: Scouts, armored Troopers and two cloaking Elites. Bring everything you own.',
    aliens: { scout: 3, trooper: 3, elite: 2 }, time: 135, pay: 1050, escapeCost: 110,
  },
];

// Endless "overtime" missions after the ladder
export function overtimeMission(n) {
  const maps = ['playground', 'farmhouse', 'shipyard', 'neighborhood', 'tropical'];
  const k = n - MISSIONS.length;
  return {
    id: n, map: maps[k % 3], name: `Overtime Shift ${k + 1}`,
    desc: 'The invasions never stop. Neither do you.',
    brief: 'Another landing, bigger than the last, with more Elites every shift. The invasions never stop. Neither do you.',
    aliens: {
      scout: 2 + Math.min(3, Math.floor(k / 2)),
      trooper: 2 + Math.min(3, Math.floor(k / 3)),
      elite: 2 + Math.min(4, Math.floor(k / 2)),
    },
    time: Math.max(110, 135 - k * 3),
    pay: 1000 + k * 200, escapeCost: 110 + k * 15,
  };
}

export function getMission(n) {
  return n < MISSIONS.length ? MISSIONS[n] : overtimeMission(n);
}

// Walking out on a contract costs you: the agency keeps a cleanup fee worth a
// quarter of the mission's base pay, and you bank nothing for the trip.
export function abandonFee(mission) {
  if (!mission || mission.sandbox) return 0;
  return Math.round(mission.pay * 0.25);
}

/* ------------------------- SANDBOX ------------------------- */
// Free play: any map, any roster, any loadout, no payout and no save changes.

export const MAP_LIST = [
  { id: 'playground', name: 'Sunny Pines Playground', note: 'Open ground, easy sightlines' },
  { id: 'farmhouse', name: 'Hollow Creek Farm', note: 'Tall corn, lots of cover' },
  { id: 'shipyard', name: 'Rust Harbor Shipyard', note: 'Container maze' },
  { id: 'neighborhood', name: 'Maple Street', note: 'Night + noise meter' },
  { id: 'tropical', name: 'Isla Verde', note: 'Jungle and a volcano' },
];

export const SANDBOX_TIMES = [120, 180, 300, 600, 0];   // 0 = no time limit

export function sandboxMission(cfg) {
  const aliens = {};
  for (const [tier, n] of Object.entries(cfg.aliens || {})) if (n > 0) aliens[tier] = n;
  const map = MAP_LIST.some(m => m.id === cfg.map) ? cfg.map : MAP_LIST[0].id;
  return {
    id: -1,
    map,
    name: 'Sandbox',
    desc: '',
    aliens,
    time: cfg.time > 0 ? cfg.time : 9999,
    endless: !(cfg.time > 0),
    pay: 0,
    escapeCost: 0,
    sandbox: true,
    gear: { ...(cfg.gear || {}) },
  };
}

export function gearMaxLevel(id) {
  const g = GEAR.find(x => x.id === id);
  return g ? g.levels.length : 0;
}

/* ------------------------- EQUIPMENT ------------------------- */
// Each item: levels with price + effect. Effects read by game via gearVal().

export const GEAR = [
  {
    id: 'shoes', name: 'Track Shoes', icon: '\u{1F45F}',
    desc: 'Run and sprint faster.',
    levels: [
      { price: 150, label: '+8% speed' },
      { price: 400, label: '+16% speed' },
      { price: 900, label: '+25% speed' },
    ],
  },
  {
    id: 'stamina', name: 'Field Training', icon: '\u{1F4AA}',
    desc: 'Bigger stamina pool for sprinting, dashing and diving.',
    levels: [
      { price: 150, label: '+30 stamina' },
      { price: 400, label: '+60 stamina' },
      { price: 900, label: '+100 stamina' },
    ],
  },
  {
    id: 'gloves', name: 'Grip Gloves', icon: '\u{1F9E4}',
    desc: 'Wider grab reach. Aliens hate these.',
    levels: [
      { price: 200, label: '+20% grab range' },
      { price: 500, label: '+40% grab range' },
      { price: 1100, label: '+65% grab range' },
    ],
  },
  {
    id: 'kneepads', name: 'Kneepads', icon: '\u{1F6E1}',
    desc: 'Get up faster after a missed dive.',
    levels: [
      { price: 180, label: '-35% recovery' },
      { price: 550, label: '-60% recovery' },
    ],
  },
  {
    id: 'sack', name: 'Alien Sack', icon: '\u{1F392}',
    desc: 'Carry more aliens before returning to the van.',
    levels: [
      { price: 350, label: 'Carry 2 aliens' },
      { price: 1000, label: 'Carry 3 aliens' },
    ],
  },
  {
    id: 'noisemaker', name: 'Noise Maker', icon: '\u{1F4A5}', gadget: true, short: 'NOISE',
    desc: 'Set off a deafening BANG: hidden aliens close by are knocked out of cover and stunned; loose ones close by just lose their cloak; hidden ones further out get pinged.',
    levels: [
      { price: 450, label: 'Stun 2s in 72px, ping 140px, 14s reload' },
      { price: 1200, label: 'Mk.II \u2014 stun 2.8s in 100px, ping 220px, 10s reload' },
    ],
  },
  {
    id: 'netgun', name: 'Net Gun', icon: '\u{1F578}', gadget: true, short: 'NET',
    desc: 'Fire a net that pins an alien for 3s. 6s reload.',
    levels: [
      { price: 800, label: 'Net Gun Mk.I' },
      { price: 1600, label: 'Mk.II — 4s pin, faster reload' },
    ],
  },
  {
    id: 'vest', name: 'Stun-Proof Vest', icon: '\u{1F9BA}',
    desc: 'Shrug off alien stun bolts faster.',
    levels: [
      { price: 300, label: '-40% stun time' },
      { price: 800, label: '-70% stun time' },
    ],
  },
  {
    id: 'drones', name: 'Field Drones', icon: '\u{1F4E1}', perk: true,
    desc: 'A pair of recon drones rides with you and marks loose aliens off-screen with an arrow. Hidden aliens stay hidden.',
    levels: [
      { price: 600, label: 'Arrows to loose aliens off-screen' },
      { price: 1400, label: 'Mk.II \u2014 tracks cloaked Elites, tier colors + range' },
    ],
  },
];

// Gadgets are the gear you fire by hand. Only GADGET_SLOTS of them ride
// along on a mission (see loadout.js); the rest stay in the locker.
export const GADGET_SLOTS = 2;
export const GADGETS = GEAR.filter(g => g.gadget);

// Noise Maker tuning per level (index = level). Radii are world px.
export const NOISE_MAKER = [
  null,
  { stunR: 72, stunT: 2.0, pingR: 140, pingT: 5, cd: 14 },
  { stunR: 100, stunT: 2.8, pingR: 220, pingT: 7, cd: 10 },
];

// Compute an effect value from gear levels (lv = 0 means not owned)
export function gearEffects(levels) {
  const lv = (id) => levels[id] || 0;
  return {
    speedMul: 1 + [0, 0.08, 0.16, 0.25][lv('shoes')],
    staminaMax: 100 + [0, 30, 60, 100][lv('stamina')],
    grabMul: 1 + [0, 0.2, 0.4, 0.65][lv('gloves')],
    recoveryMul: [1, 0.65, 0.4][lv('kneepads')],
    carryMax: [1, 2, 3][lv('sack')],
    noisemaker: lv('noisemaker'), // 0 none, 1 mk1, 2 mk2
    drones: lv('drones'),         // 0 none, 1 mk1, 2 mk2
    netgun: lv('netgun'), // 0 none, 1 mk1, 2 mk2
    stunMul: [1, 0.6, 0.3][lv('vest')],
  };
}

/* ------------------------- ALIEN TIER STATS ------------------------- */

export const ALIEN_STATS = {
  grunt: {
    run: 62, sprint: 92, accel: 300, detectR: 55, hideSeekR: 150,
    chaseToAttack: 7, attackType: 'tackle', jumpy: 0.5, dashPower: 0,
    cloak: false, armored: false, beamBonus: 0,
  },
  scout: {
    run: 74, sprint: 112, accel: 380, detectR: 60, hideSeekR: 180,
    chaseToAttack: 6.5, attackType: 'tackle', jumpy: 0.8, dashPower: 200,
    cloak: false, armored: false, beamBonus: 0,
  },
  trooper: {
    run: 60, sprint: 88, accel: 300, detectR: 65, hideSeekR: 160,
    chaseToAttack: 4.5, attackType: 'bolt', jumpy: 0.4, dashPower: 0,
    cloak: false, armored: true, beamBonus: 0.5,
  },
  elite: {
    run: 72, sprint: 108, accel: 400, detectR: 70, hideSeekR: 200,
    chaseToAttack: 4, attackType: 'bolt', jumpy: 0.9, dashPower: 230,
    cloak: true, armored: false, beamBonus: 1,
  },
};
