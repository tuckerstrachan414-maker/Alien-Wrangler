// Stage 1: the tutorial. Order of events:
//
//   1. Intro cutscene. An alien ship falls out of the sky, breaking apart and
//      firing off escape pods. The view pulls back from that satellite replay
//      to the ops room, where Handler Voss briefs the agent. ACCEPT ORDERS.
//   2. Scene 1, Farm Fields. Learn the controls on 15 hiding Grunts. Once 3
//      are secured the other 12 break cover and bolt down the dirt road; the
//      agent jumps, then gives chase, and the scene ends.
//   3. Scene 2, Barnyard. The road leads to a farm: a big barn at the side of
//      the road, a glass greenhouse, a well, bushes. The 12 are hiding all
//      over it (the barn roof lifts off when you walk in). Secure 6 and the
//      rest run for the tree line; the agent jumps, fumes, follows them in,
//      and the scene ends.
//   4. Scene 3, Highway 29. Thick woods, heading east, and they don't end:
//      the 6 keep slipping further along from hiding place to hiding place,
//      and the van follows on a fire road. Secure 3 and the woods run out:
//      the other 3 bolt, leap a creek (the agent has to jump it), and lead
//      him on a chase they're always just too fast for. At Highway 29 they
//      turn and stun him with a shock gun, cross to a gas station and stow
//      away in an armoured black semi; its driver never notices and drives
//      off. The agent crawls after it, then puts his head down. Fade out.
//
// There is no money, shop or upgrade anywhere in this stage: base kit only,
// nothing to buy, no payout. All the words live here so they're easy to edit.

export const STAGE1 = {
  id: 1,
  name: 'STAGE 1',
  sub: 'TUTORIAL',
  blurb: 'An alien ship came down in the fields north of the city. Learn the ropes of wrangling.',
  intro: {
    speaker: 'HANDLER VOSS',
    // `screen` is what the ops-room monitor shows during the line; `pose` is
    // what Voss does in the room (talk to the agent, face the monitor, point)
    lines: [
      { text: "We picked up on an Alien space craft entering Earth's orbit a few hours ago.", screen: 'orbit', pose: 'talk' },
      { text: "We don't know how, but the ship managed to bypass our deep range warning systems and park at the far edge of our satellite systems.", screen: 'radar', pose: 'talk' },
      { text: 'We were observing it and devising counter measures when a large piece of space debris made direct contact with the hull.', screen: 'impact', pose: 'monitor' },
      { text: 'We have calculated its trajectory and determined its landing location in a rural field north of the city.', screen: 'map', pose: 'monitor' },
      { text: 'We are going to send YOU out there, and your job is to wrangle as many of those aliens as possible and subdue them for shipment and containment.', screen: 'target', pose: 'point' },
    ],
    choice: 'ACCEPT ORDERS',
  },
  // `fled` labels the results line for the ones that got away; `outro` is
  // the note under it
  scenes: [
    {
      num: 1, name: 'Farm Fields', map: 'farmfields', aliens: { grunt: 15 }, goal: 3,
      fled: 'Bolted down the road',
      outro: 'The rest of them ran north up the dirt road.<br>Scene 2 picks up where it leads.',
    },
    {
      num: 2, name: 'Barnyard', map: 'barnyard', aliens: { grunt: 12 }, goal: 6,
      fled: 'Ran for the tree line',
      outro: 'The rest of them vanished into the tree line.<br>Scene 3 picks up in the woods.',
    },
    {
      num: 3, name: 'Highway 29', map: 'highway29', aliens: { grunt: 6 }, goal: 3,
      fled: 'Got away in the semi',
      outro: 'TO BE CONTINUED<br>The last three are somewhere down Highway 29<br>in the back of a black semi.<br>Scene 4 is on its way.',
    },
  ],
};

// The mission object Game runs for a Stage 1 scene. Base kit only (gear: {}),
// no clock, no UFO, no pay.
export function stage1Scene(n = 1) {
  const s = STAGE1.scenes[n - 1];
  return {
    id: `s1-${n}`, story: true, tutorial: n === 1, stage: 1, scene: n,
    map: s.map, name: s.name, announce: `SCENE ${n}: ${s.name.toUpperCase()}`,
    aliens: { ...s.aliens }, goal: s.goal,
    time: 9999, endless: true, pay: 0, escapeCost: 0, gear: {},
  };
}

/* ---------------- Scene 1 tutorial script ---------------- */

// Handler Voss on the radio.
export const RADIO = {
  start: "You're on site, agent. Those pods came down all over these fields.",
  search: "They'll be hiding in the crops. Watch for rustling.",
  flushed: 'There! Grab it before it finds new cover.',
  grabbed: 'Got it. Now load it into the van.',
  secured1: "That's one secured. Two more.",
  secured2: 'Two down. One more.',
  tackled: 'Careful! Corner them too long and they fight back.',
  exitNag: 'Not yet, agent. Secure those aliens first.',
  lost: 'Take it slow. Look for the crops that are moving.',
};

export const OBJECTIVES = {
  move: 'LOOK AROUND',
  find: 'FIND A HIDING ALIEN',
  grab: 'GRAB THE ALIEN',
  load: 'LOAD IT INTO THE VAN',
  secure: 'SECURE 3 ALIENS',
};

// How to do each thing, per control scheme: touch buttons, touch gestures
// (no-buttons mode), keyboard, gamepad.
export const CONTROL_HINTS = {
  move: {
    buttons: 'DRAG ON THE LEFT SIDE TO WALK', gestures: 'DRAG ON THE LEFT HALF TO WALK',
    keys: 'WASD OR ARROW KEYS TO WALK', pad: 'LEFT STICK TO WALK',
  },
  find: {
    buttons: 'GET CLOSE TO RUSTLING CROPS', gestures: 'GET CLOSE TO RUSTLING CROPS',
    keys: 'GET CLOSE TO RUSTLING CROPS', pad: 'GET CLOSE TO RUSTLING CROPS',
  },
  grab: {
    buttons: 'GET CLOSE AND TAP GRAB', gestures: 'WALK INTO IT TO GRAB IT',
    keys: 'GET CLOSE AND PRESS J', pad: 'GET CLOSE AND PRESS A',
  },
  load: {
    buttons: "WALK INTO THE VAN'S GREEN GLOW", gestures: "WALK INTO THE VAN'S GREEN GLOW",
    keys: "WALK INTO THE VAN'S GREEN GLOW", pad: "WALK INTO THE VAN'S GREEN GLOW",
  },
  sprint: {
    buttons: 'TOO FAST? TAP SPRINT TO RUN', gestures: 'TOO FAST? PUSH PAST THE RING TO SPRINT',
    keys: 'TOO FAST? HOLD SHIFT TO SPRINT', pad: 'TOO FAST? HOLD A TRIGGER TO SPRINT',
  },
  dive: {
    buttons: 'TAP DIVE TO LUNGE AT IT', gestures: 'SWIPE DOWN ON THE RIGHT TO DIVE',
    keys: 'PRESS L TO DIVE AT IT', pad: 'PRESS X TO DIVE AT IT',
  },
  jump: {
    buttons: 'TAP JUMP TO HOP FENCES AND BALES', gestures: 'SWIPE UP ON THE RIGHT TO JUMP',
    keys: 'SPACE TO JUMP FENCES AND BALES', pad: 'PRESS Y TO JUMP FENCES AND BALES',
  },
  dash: {
    buttons: 'TAP DASH FOR A QUICK BURST', gestures: 'SWIPE LEFT ON THE RIGHT TO DASH',
    keys: 'PRESS K FOR A QUICK DASH', pad: 'PRESS B FOR A QUICK DASH',
  },
};

// One-off tips the director slips in when they become relevant.
export const TIPS = {
  tackled: "GETTING TACKLED MAKES YOU DROP WHAT YOU'RE CARRYING",
  diveMiss: 'A MISSED DIVE LEAVES YOU ON THE GROUND FOR A SECOND',
  stamina: 'SPRINTING DRAINS STAMINA (THE BAR UP TOP)',
};

// Which on-screen control to light up while it's being taught.
export const GLOW_TARGETS = {
  buttons: { grab: 'btn-grab', sprint: 'btn-sprint', dive: 'btn-dive', jump: 'btn-jump', dash: 'btn-dash' },
  gestures: { sprint: 'hint-sprint', dive: 'hint-dive', jump: 'hint-jump', dash: 'hint-dash' },
};

/* ---------------- Scene 2 (Barnyard) script ---------------- */

// Handler Voss on the radio. `secured` is indexed by how many are in the van.
export const RADIO2 = {
  start: 'They went to ground on this farm, agent. All twelve of them.',
  goal: "Van's parked by the barn. Round up six of them.",
  spotted: "There's one! Don't let it get away.",
  barn: 'Check that barn. Plenty of places to hide in there.',
  inBarn: "Mud tracks everywhere. They've been through here.",
  secured: ['', "That's one. Five to go.", 'Two down. Keep at it.', 'Halfway there, agent.', 'Four. Two more.', 'One more, agent.'],
  tackled: 'Careful! Corner them too long and they fight back.',
  lost: 'Nothing moving? Try the bushes, the barn and that greenhouse.',
  exitNag: 'Not yet, agent. We still need six.',
};

export const OBJECTIVES2 = {
  secure: 'SECURE 6 ALIENS',
};

/* ---------------- Scene 3 (Highway 29) script ---------------- */
// No radio this time: the agent is on his own out here.

export const OBJECTIVES3 = {
  secure: 'SECURE 3 ALIENS',
  follow: 'AFTER THEM!',
  creek: 'JUMP THE CREEK',
  chase: 'CATCH THEM!',
};

export const HINTS3 = {
  creek: {
    buttons: "TAP JUMP AT THE WATER'S EDGE", gestures: "SWIPE UP AT THE WATER'S EDGE",
    keys: "SPACE AT THE WATER'S EDGE", pad: "PRESS Y AT THE WATER'S EDGE",
  },
  // after a dunking: a run-up clears it easily
  runup: {
    buttons: 'SPRINT AT IT, THEN TAP JUMP', gestures: 'PUSH PAST THE RING, THEN SWIPE UP',
    keys: 'HOLD SHIFT, THEN SPACE AT THE EDGE', pad: 'HOLD A TRIGGER, THEN Y AT THE EDGE',
  },
};

export const GLOW3 = {
  buttons: { creek: 'btn-jump', runup: 'btn-sprint' },
  gestures: { creek: 'hint-jump', runup: 'hint-sprint' },
};
