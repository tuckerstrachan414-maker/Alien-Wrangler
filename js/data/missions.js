// Mission ladder + equipment catalog.
// Pay rule: base pay for the mission, minus a deduction for every alien that escapes.

export const MISSIONS = [
  {
    id: 0, map: 'playground', name: 'First Contact',
    desc: '3 grunts spotted at the playground. Easy money. Probably.',
    aliens: { grunt: 3 }, time: 170, pay: 120, escapeCost: 35,
  },
  {
    id: 1, map: 'playground', name: 'Recess Is Over',
    desc: 'More of them — and one is fast. Watch the bushes.',
    aliens: { grunt: 3, scout: 1 }, time: 160, pay: 180, escapeCost: 40,
  },
  {
    id: 2, map: 'farmhouse', name: 'Crop Circles',
    desc: 'They landed in the corn. The corn is a problem.',
    aliens: { grunt: 3, scout: 1 }, time: 160, pay: 240, escapeCost: 50,
  },
  {
    id: 3, map: 'farmhouse', name: 'Barnstormers',
    desc: 'Scouts everywhere and a Trooper with a stun pistol. Stay mobile.',
    aliens: { grunt: 2, scout: 2, trooper: 1 }, time: 150, pay: 320, escapeCost: 55,
  },
  {
    id: 4, map: 'shipyard', name: 'Dock Rats',
    desc: 'The container maze is crawling. Check the open containers.',
    aliens: { grunt: 2, scout: 2, trooper: 1 }, time: 150, pay: 400, escapeCost: 65,
  },
  {
    id: 5, map: 'shipyard', name: 'Armored Cargo',
    desc: 'Troopers in force. Their armor shrugs off your first grab.',
    aliens: { scout: 2, trooper: 3 }, time: 145, pay: 500, escapeCost: 75,
  },
  {
    id: 6, map: 'playground', name: 'Night Shift',
    desc: 'An Elite is on-site: it cloaks. Goggles strongly advised.',
    aliens: { scout: 2, trooper: 2, elite: 1 }, time: 140, pay: 620, escapeCost: 90,
  },
  {
    id: 7, map: 'farmhouse', name: 'The Harvest',
    desc: 'Elites in the corn. This is what they pay you for.',
    aliens: { grunt: 1, scout: 2, trooper: 2, elite: 2 }, time: 140, pay: 780, escapeCost: 100,
  },
  {
    id: 8, map: 'shipyard', name: 'Full Invasion',
    desc: 'Everything at once. Bring everything you own.',
    aliens: { scout: 3, trooper: 3, elite: 2 }, time: 135, pay: 1000, escapeCost: 110,
  },
];

// Endless "overtime" missions after the ladder
export function overtimeMission(n) {
  const maps = ['playground', 'farmhouse', 'shipyard'];
  const k = n - MISSIONS.length;
  return {
    id: n, map: maps[k % 3], name: `Overtime Shift ${k + 1}`,
    desc: 'The invasions never stop. Neither do you.',
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
    id: 'goggles', name: 'Tracker Goggles', icon: '\u{1F97D}',
    desc: 'Reveals hidden and cloaked aliens with a marker when nearby.',
    levels: [
      { price: 450, label: 'Detect at 110px' },
      { price: 1200, label: 'Detect anywhere' },
    ],
  },
  {
    id: 'netgun', name: 'Net Gun', icon: '\u{1F578}',
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
    goggleRange: [0, 110, 9999][lv('goggles')],
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
