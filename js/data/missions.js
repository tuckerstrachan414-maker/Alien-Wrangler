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
  if (!mission || mission.sandbox || mission.story) return 0;
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
  { id: 'farmfields', name: 'Farm Fields', note: 'Stage 1 crash site' },
  { id: 'barnyard', name: 'Barnyard', note: 'Walk-in barn + greenhouse' },
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
      { price: 1200, label: 'Mk.II — stun 2.8s in 100px, ping 220px, 10s reload' },
      { price: 2600, label: 'Mk.III SONIC BOOM — 120px, and it stuns running aliens too' },
    ],
  },
  {
    id: 'netgun', name: 'Net Gun', icon: '\u{1F578}', gadget: true, short: 'NET',
    desc: 'Fire a net that pins an alien for 3s. Pinned aliens can be grabbed straight through their armor.',
    levels: [
      { price: 800, label: '3s pin, 6s reload' },
      { price: 1600, label: 'Mk.II — 4s pin, 4.5s reload' },
      { price: 3000, label: 'Mk.III SCATTER NET — fires 3 nets in a spread' },
    ],
  },
  {
    id: 'stungun', name: 'Stun Gun', icon: '⚡', gadget: true, short: 'ZAP',
    desc: 'Taser shot with aim assist. Stuns the alien it hits, even one hiding in a bush. Upgrades turn it into chain lightning that jumps between aliens.',
    levels: [
      { price: 500, label: 'Stuns one alien 3s, 4.5s reload' },
      { price: 1200, label: 'Mk.II CHAIN — jumps to 3 more aliens nearby' },
      { price: 2600, label: 'Mk.III ARC — up to 5 targets, each hit twice, fries helmets, 4s reload' },
    ],
  },
  {
    id: 'dart', name: 'Tranq Dart', icon: '\u{1F489}', gadget: true, short: 'DART',
    desc: 'Silent long-range dart. The alien gets drowsy, then falls asleep where it stands. Makes no noise at all.',
    levels: [
      { price: 400, label: 'Sleep 2.5s, bounces off helmets, 4s reload' },
      { price: 1000, label: 'Mk.II — armor-piercing, sleep 4s, 3s reload' },
      { price: 2200, label: 'Mk.III SNORE CLOUD — sleepers knock out aliens around them' },
    ],
  },
  {
    id: 'bait', name: 'Bait Burger', icon: '\u{1F354}', gadget: true, short: 'BAIT',
    desc: 'Toss a burger. Hidden and running aliens nearby sneak over to eat it, and while they chew they ignore you.',
    levels: [
      { price: 300, label: 'Lures within 110px for 8s' },
      { price: 800, label: 'Mk.II DOUBLE STACK — 170px, 12s, pulls attackers off you' },
      { price: 1800, label: 'Mk.III FOOD COMA — eaters pass out for 4s after' },
    ],
  },
  {
    id: 'cage', name: 'Trap Cage', icon: '\u{1FAA4}', gadget: true, short: 'CAGE',
    desc: 'Drop a spring cage. The first loose alien to run over it is locked in, armor and all, until you come for it.',
    levels: [
      { price: 500, label: '1 cage, holds 10s' },
      { price: 1200, label: 'Mk.II — 2 cages out, holds 18s' },
      { price: 2800, label: 'Mk.III COURIER — a drone flies caged aliens to the van' },
    ],
  },
  {
    id: 'hook', name: 'Grapple Hook', icon: '\u{1FA9D}', gadget: true, short: 'HOOK',
    desc: 'Fire a hook line. Hit an alien and it is reeled into your hands, even out of the UFO beam. Hit a wall and it zips you there.',
    levels: [
      { price: 700, label: '150px, snatches low in the beam, 6s reload' },
      { price: 1500, label: 'Mk.II — 200px, snatches at any beam height, 4.5s reload' },
      { price: 3000, label: 'Mk.III CHAIN HOOK — reels in a second alien too' },
    ],
  },
  {
    id: 'decoy', name: 'Decoy Agent', icon: '\u{1F388}', gadget: true, short: 'DECOY',
    desc: 'Inflate a decoy agent that runs around hunting aliens and herding them toward you. It cannot grab, but it uses your gear, and aliens attack it instead of you.',
    levels: [
      { price: 800, label: '3 HP, 12s, uses your other equipped gadget' },
      { price: 1800, label: 'Mk.II — 5 HP, 20s, uses every gadget you own' },
      { price: 3400, label: 'Mk.III SQUAD — deploys two decoy agents' },
    ],
  },
  {
    id: 'shield', name: 'Riot Shield', icon: '\u{1FAE7}', gadget: true, short: 'SHIELD',
    desc: 'Energy bubble that blocks stun bolts and tackles, so you keep hold of what you are carrying. Tacklers bounce off stunned for 2s, right in grabbing range.',
    levels: [
      { price: 650, label: '4s bubble, 12s reload' },
      { price: 1500, label: 'Mk.II — 6s, reflects bolts back at the shooter, 9s reload' },
      { price: 2800, label: 'Mk.III SHIELD BASH — run into aliens to bowl them over' },
    ],
  },
  {
    id: 'cryo', name: 'Cryo Sprayer', icon: '❄️', gadget: true, short: 'CRYO',
    desc: 'Spray a cone of freezing mist. Every loose alien caught in it freezes solid.',
    levels: [
      { price: 900, label: '70px cone, freeze 2.2s, 7s reload' },
      { price: 1900, label: 'Mk.II — 90px, 3.2s, shatters helmets, 5s reload' },
      { price: 3400, label: 'Mk.III BLIZZARD — a 360° freeze nova around you' },
    ],
  },
  {
    id: 'hypno', name: 'Hypno Ray', icon: '\u{1F300}', gadget: true, short: 'HYPNO',
    desc: 'A spiral beam that hypnotizes an alien into following you like a duckling. Lead it into the van glow to secure it. It does not count against your carry limit.',
    levels: [
      { price: 900, label: 'One follower for 10s, 12s reload' },
      { price: 2000, label: 'Mk.II — up to 2 followers for 16s, 10s reload' },
      { price: 3600, label: 'Mk.III SLEEPWALK — they walk themselves to the van' },
    ],
  },
  {
    id: 'evac', name: 'Evac Beacon', icon: '\u{1F681}', gadget: true, short: 'EVAC',
    desc: 'Beam every alien you are carrying straight into the van from wherever you are. Only fires when there is something to evac.',
    levels: [
      { price: 1200, label: 'Evac what you carry, 45s reload' },
      { price: 2400, label: 'Mk.II — 25s reload' },
      { price: 4000, label: 'Mk.III MASS EVAC — also beams up stunned, pinned and caged aliens around you' },
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
    id: 'drones', name: 'Field Drones', icon: '\u{1F4E1}', advanced: true,
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

// Advanced gear (e.g. Field Drones) is passive kit with its own single slot,
// separate from the shared gadget slots (see advancedGear.js).
export const ADVANCED_SLOTS = 1;
export const ADVANCED_GEAR = GEAR.filter(g => g.advanced);

// Everything else: plain stat-boosting gear shown on the Skills screen.
export const STAT_GEAR = GEAR.filter(g => !g.gadget && !g.advanced);

// Noise Maker tuning per level (index = level). Radii are world px.
export const NOISE_MAKER = [
  null,
  { stunR: 72, stunT: 2.0, pingR: 140, pingT: 5, cd: 14 },
  { stunR: 100, stunT: 2.8, pingR: 220, pingT: 7, cd: 10 },
  { stunR: 120, stunT: 3.0, pingR: 260, pingT: 8, cd: 9, loose: true },
];

// Tuning for every hand-fired weapon (index = level, 0 = not owned).
// Distances are world px, times are seconds. Read by weapons.js / decoy.js.
export const WEAPONS = {
  netgun: [null,
    { pin: 3, cd: 6, nets: 1 },
    { pin: 4, cd: 4.5, nets: 1 },
    { pin: 4, cd: 4.5, nets: 3 },
  ],
  stungun: [null,
    { range: 120, stun: 3.0, chain: 0, chainR: 0, hits: 1, cd: 4.5 },
    { range: 125, stun: 3.0, chain: 3, chainR: 60, hits: 1, cd: 4.5 },
    { range: 130, stun: 3.2, chain: 4, chainR: 66, hits: 2, cd: 4 },
  ],
  dart: [null,
    { range: 240, drowsy: 1.2, sleep: 2.5, pierce: false, snore: 0, cd: 4 },
    { range: 250, drowsy: 1.0, sleep: 4.0, pierce: true, snore: 0, cd: 3 },
    { range: 270, drowsy: 1.0, sleep: 4.0, pierce: true, snore: 40, cd: 3 },
  ],
  bait: [null,
    { lure: 110, t: 8, attackers: false, coma: 0, cd: 10 },
    { lure: 170, t: 12, attackers: true, coma: 0, cd: 9 },
    { lure: 170, t: 12, attackers: true, coma: 4, cd: 8 },
  ],
  cage: [null,
    { max: 1, hold: 10, courier: 0, cd: 6 },
    { max: 2, hold: 18, courier: 0, cd: 5 },
    { max: 2, hold: 18, courier: 3, cd: 5 },
  ],
  hook: [null,
    { range: 150, beamZ: 26, chain: 0, cd: 6 },
    { range: 200, beamZ: 99, chain: 0, cd: 4.5 },
    { range: 200, beamZ: 99, chain: 60, cd: 4.5 },
  ],
  decoy: [null,
    { hp: 3, t: 12, count: 1, reach: 130, allOwned: false, cd: 18 },
    { hp: 5, t: 20, count: 1, reach: 170, allOwned: true, cd: 16 },
    { hp: 5, t: 20, count: 2, reach: 170, allOwned: true, cd: 16 },
  ],
  shield: [null,
    { t: 4, reflect: false, bash: false, cd: 12 },
    { t: 6, reflect: true, bash: false, cd: 9 },
    { t: 6, reflect: true, bash: true, cd: 9 },
  ],
  cryo: [null,
    { range: 70, cone: 35, t: 2.2, shatter: false, nova: false, cd: 7 },
    { range: 90, cone: 35, t: 3.2, shatter: true, nova: false, cd: 5 },
    { range: 80, cone: 180, t: 3.2, shatter: true, nova: true, cd: 5 },
  ],
  hypno: [null,
    { range: 100, cone: 26, t: 10, max: 1, walk: false, cd: 12 },
    { range: 110, cone: 40, t: 16, max: 2, walk: false, cd: 10 },
    { range: 110, cone: 40, t: 16, max: 2, walk: true, cd: 10 },
  ],
  evac: [null,
    { cd: 45, mass: 0 },
    { cd: 25, mass: 0 },
    { cd: 25, mass: 80 },
  ],
};

// Compute an effect value from gear levels (lv = 0 means not owned)
export function gearEffects(levels) {
  const lv = (id) => levels[id] || 0;
  return {
    speedMul: 1 + [0, 0.08, 0.16, 0.25][lv('shoes')],
    staminaMax: 100 + [0, 30, 60, 100][lv('stamina')],
    grabMul: 1 + [0, 0.2, 0.4, 0.65][lv('gloves')],
    recoveryMul: [1, 0.65, 0.4][lv('kneepads')],
    carryMax: [1, 2, 3][lv('sack')],
    noisemaker: lv('noisemaker'), // 0 none, 1 mk1, 2 mk2, 3 mk3
    drones: lv('drones'),         // 0 none, 1 mk1, 2 mk2
    netgun: lv('netgun'),         // 0 none, 1 mk1, 2 mk2, 3 mk3
    stunMul: [1, 0.6, 0.3][lv('vest')],
    // every item's level by id (weapons.js reads its tier from here)
    lv: Object.fromEntries(GEAR.map(g => [g.id, lv(g.id)])),
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
