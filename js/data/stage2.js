// Stage 2: the signal. Order of events:
//
//   1. Briefing cutscene. The ops room, days after the escape: Handler Voss,
//      the agent, and an analyst at her desk with her back to us, decoding.
//      Voss explains the signal going out across the continent, hands the
//      agent a folder with what's been decoded of it (a popup: the decoded
//      words in plain type, the rest still scrambling), and sends him after
//      the three that got away in the truck. He turns to go; "But before you
//      go..." and Voss sends him to pick up some gear.
//   2. The Field Locker. The agency opens a story wallet with $500 in it,
//      and a short hands-on tutorial covers browsing, buying, equipping,
//      skills, and that every alien you bag pays. DEPLOY.
//   3. Scene 1, Quiet Oaks. A sleeping subdivision at night, with Maple
//      Street's noise rules: three of them hiding in the yards. Grab the
//      third and the signal comes through: more of them creep out of the
//      bushes and in from the dark, stand round the agent taking in the
//      message, then march off together out of the subdivision gate. He
//      keeps hold of the one he's got.
//
// Money: from here on a story scene pays per alien secured, banked into the
// story wallet when the scene is cleared (the first clear only). A scene
// that's failed or quit banks nothing. All the words live here so they're
// easy to edit.

export const STAGE2 = {
  id: 2,
  name: 'STAGE 2',
  sub: 'THE SIGNAL',
  blurb: 'Something is broadcasting to every alien on the continent. Find the three who got away in the truck.',
  startCash: 500,              // what the agency puts in the story wallet
  intro: {
    speaker: 'HANDLER VOSS',
    // `screen` is what the ops-room monitor shows during the line; `pose`
    // is what Voss does (talk to the agent, face the monitor, point at it);
    // `beat` is a piece of staging that goes with the line:
    //   folder  - Voss walks over and hands the agent the transcript, which
    //             opens once the line is said (the scene waits for it)
    //   walkout - before the line the agent turns and heads for the door,
    //             and stops when Voss calls him back
    lines: [
      { text: 'In the days following the escape we have picked up a signal being mass broadcasted across the continent.', screen: 'broadcast', pose: 'talk' },
      { text: 'While our interpreters have been working around the clock we have only managed to decode snippets of the message', screen: 'decode', pose: 'monitor' },
      { text: 'You can read through it if you want', screen: 'decode', pose: 'talk', beat: 'folder' },
      { text: 'As you can see the message seems to be instructions to study earth and prepare it for invasion', screen: 'invasion', pose: 'monitor' },
      { text: 'We assume the message was sent from one of the aliens that escaped on that truck so we\u2019re sending you to go capture them and bring them into custody for examination', screen: 'truck', pose: 'point' },
      { text: 'Do not fail this time agent', screen: 'target', pose: 'talk' },
      { text: 'But before you go…', screen: 'target', pose: 'talk', beat: 'walkout' },
      { text: 'You might need some gear', screen: 'target', pose: 'talk' },
    ],
  },
  // `fled` labels the results line for the ones that got away; `outro` is
  // the note under it
  scenes: [
    {
      num: 1, name: 'Quiet Oaks', map: 'quietoaks', aliens: { grunt: 3 }, goal: 3, payPerAlien: 150,
      fled: 'Marched out the gate',
      outro: 'TO BE CONTINUED<br>Whatever that signal said, they all heard it.<br>Scene 2 is on its way.',
    },
  ],
};

// The mission object Game runs for a Stage 2 scene. It uses the story
// wallet's gear and gadget slots; `paid` = this scene has already paid out
// once, so a replay pays nothing. No clock, no UFO.
export function stage2Scene(n, wallet, paid = false) {
  const s = STAGE2.scenes[n - 1];
  return {
    id: `s2-${n}`, story: true, stage: 2, scene: n,
    map: s.map, name: s.name, announce: `SCENE ${n}: ${s.name.toUpperCase()}`,
    aliens: { ...s.aliens }, goal: s.goal,
    time: 9999, endless: true, pay: 0, escapeCost: 0,
    gear: { ...(wallet && wallet.gear) }, loadoutPref: wallet ? wallet.loadout.slice() : [],
    payPerAlien: paid ? 0 : s.payPerAlien,
  };
}

/* ---------------- the signal transcript (the folder Voss hands over) ---------------- */
// FILLER: placeholder text until the real transcript is written.
//
// How to write it: one string per line of the page. Put a word in [square
// brackets] and it hasn't been deciphered yet: it shows as a run of !@#$&
// symbols the same length as the word, re-rolling all the time. Everything
// else is printed as decoded.
export const SIGNAL = {
  title: 'SIGNAL INTERCEPT 2-A',
  sub: 'TRANSCRIPT (PARTIAL)',
  meta: [
    ['SOURCE', 'MASS BROADCAST, CONTINENTAL'],
    ['ORIGIN', 'UNCONFIRMED'],
    ['DECODED', '41%'],
  ],
  body: [
    '[ATTENTION] ALL [UNITS] NOW ON EARTH.',
    'STUDY THE [HUMANS]. STUDY THEIR [CITIES], THEIR [MACHINES] AND THEIR [WEAKNESSES].',
    'STAY [HIDDEN]. DO NOT BE [TAKEN].',
    'WHEN THE [CALL] COMES, [GATHER] AND LISTEN.',
    'PREPARE EARTH FOR THE [FLEET]. THE INVASION [BEGINS] AT [THE] [SIGN].',
    '[END] [OF] [MESSAGE]',
  ],
  note: 'ANALYST NOTE: UNDECIPHERED SEGMENTS SHOWN AS SYMBOLS.',
};

/* ---------------- the Field Locker tutorial ---------------- */
// One short line per step (the bubble next to Voss's face). {CASH} is the
// starting balance, {PAY} the per-alien pay, {SLOT} how slot 1 is fired
// with the controls in use.
export const LOCKER_TUTORIAL = {
  balance: 'THE AGENCY GAVE YOU ${CASH}.',
  browse: 'SWIPE TO BROWSE THE GEAR.',
  inspect: 'TAP A CARD TO SEE WHAT IT DOES.',
  buy: 'BUY ONE. LIT = YOU CAN AFFORD IT.',
  equip: 'EQUIPPED! {SLOT} FIRES IT.',
  skills: 'SKILLS MAKE YOU FASTER AND STRONGER.',
  pay: 'EVERY ALIEN YOU BAG PAYS ${PAY}.',
  deploy: 'SPEND IT HERE BETWEEN SCENES. READY?',
  tapOn: 'TAP TO CONTINUE',
  skip: 'SKIP TUTORIAL',
};

/* ---------------- Scene 1 (Quiet Oaks) script ---------------- */

// Handler Voss on the radio. `secured` is indexed by how many are in the van.
export const RADIO_QO = {
  start: 'Quiet Oaks. We tracked those three here, agent.',
  goal: 'Find all three. And keep it down. People are sleeping.',
  spotted: "There's one. Quietly now.",
  secured: ['', "That's one. Two to go.", 'Two down. One more out there.'],
  noise50: "Easy, agent. You're getting loud.",
  noise80: 'Lights are coming on! Quiet down!',
  tackled: 'Careful! Corner them too long and they fight back.',
  lost: 'Nothing moving? Try the hedges and the backyards.',
  exitNag: "That's the way out, agent. We still need all three.",
  aftermath: "Agent? Agent, what's going on down there?",
};

export const OBJECTIVES_QO = {
  catch: 'CATCH 3 ALIENS',
};

// How to use the gadget in slot 1, per control scheme ({G} = its name).
export const HINTS_QO = {
  gadget: {
    buttons: 'TAP {G} TO USE YOUR GADGET', gestures: 'TAP THE RIGHT HALF TO USE {G}',
    keys: 'PRESS Q TO USE {G}', pad: 'PRESS LB TO USE {G}',
  },
};

export const GLOW_QO = {
  buttons: { gadget: 'btn-g1' },
  gestures: { gadget: 'hint-g1' },
};

// One-off tips. `quiet` lists the gadgets that make no noise at all.
export const TIPS_QO = {
  noise: 'SPRINTING NEAR HOUSES FILLS THE NOISE METER',
  quiet: ['dart', 'bait', 'cage', 'shield', 'hypno', 'netgun'],
  silent: '{G} IS SILENT. PERFECT FOR SNEAKING',
  loud: 'CAREFUL: THE {G} WILL WAKE THE STREET',
};

// The scene failing: what the results screen says happened.
export const FAILS = {
  noise: 'The neighbors called the cops.',
};
