// Mission brief: a classified CIA-style memo that types itself out (with
// typewriter sound) next to the agent's personnel file.
//
//   buildReport(mission, fx)  -> paper DOM (text still fully present)
//   buildDossier(assets, fx)  -> personnel file DOM (agent, stats, tools)
//   typewrite(paper, opts)    -> blanks the paper's text and types it back in
import { GEAR, abandonFee } from './data/missions.js';
import { save } from './save.js';
import { sfx } from './audio.js';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const redact = (n) => `<span class="redact">${'█'.repeat(n)}</span>`;

/* ---------------- per-map intelligence ---------------- */

const MAP_INTEL = {
  playground: {
    code: 'SPP',
    location: `SUNNY PINES PLAYGROUND, ${redact(7)} COUNTY`,
    conditions: 'DAYLIGHT. PARK CLEARED UNDER A "GAS LEAK" COVER STORY.',
    situation: 'A SMALL CRAFT CAME DOWN BEHIND THE SWINGS. OCCUPANTS HAVE DISPERSED INTO THE PARK.',
    terrain: [
      'OPEN LAWNS, LONG SIGHTLINES. HOSTILES WILL SEE YOU COMING. USE THE TREES TO CLOSE DISTANCE.',
      'BUSHES, THE SLIDE TOWER AND THE JUNGLE GYM ARE PRIME HIDING SPOTS. WATCH FOR RUSTLING LEAVES.',
      'THE FENCES AT THE PARK ENTRANCE, BENCHES AND BUSHES ARE LOW ENOUGH TO JUMP.',
      'EXTRACTION VAN IS PARKED ON THE SOUTH LOT. SECURE CAPTURES AT ITS REAR DOOR.',
    ],
  },
  farmhouse: {
    code: 'HCF',
    location: `HOLLOW CREEK FARM, RURAL ROUTE ${redact(2)}`,
    conditions: 'DAYLIGHT. THE FAMILY HAS BEEN RELOCATED TO A MOTEL.',
    situation: 'CROP FORMATIONS REPORTED OVERNIGHT. HOSTILES ARE DUG IN AMONG THE CROPS AND OUTBUILDINGS.',
    terrain: [
      'CORNFIELD (WEST): DENSE CROP WITH SEVERAL HIDING POSITIONS IN THE ROWS. VISIBILITY NEAR ZERO.',
      'THE BARN AND SILO ARE SOLID. HOSTILES WILL USE THEM TO BREAK LINE OF SIGHT.',
      'HAY BALES AND THE ANIMAL PEN FENCE CAN BE JUMPED. THE PEN IS A GOOD PLACE TO CORNER THEM.',
      'EXTRACTION VAN IS ON THE DIRT ROAD, SOUTH EDGE OF THE PROPERTY.',
    ],
  },
  shipyard: {
    code: 'RHS',
    location: `RUST HARBOR SHIPYARD, PIER ${redact(2)}`,
    conditions: 'DAYLIGHT. DOCKWORKERS SENT HOME FOR A "SAFETY INSPECTION".',
    situation: 'HOSTILES STOWED AWAY IN INBOUND CARGO. THE CONTAINER YARD IS NOW INFESTED.',
    terrain: [
      'CONTAINER MAZE: SOLID STEEL WALLS AND BLIND CORNERS. OPEN CONTAINERS ARE HIDING SPOTS.',
      'HARBOR WATER TO THE NORTH IS IMPASSABLE. THE DOCK IS A DEAD END: DRIVE THEM TOWARD IT.',
      'CRATES, BARRELS AND DUMPSTERS CAN BE JUMPED. CONTAINERS AND THE CRANE CANNOT.',
      'EXTRACTION VAN IS ON THE SOUTH LOADING LANE.',
    ],
  },
  neighborhood: {
    code: 'MPL',
    location: `MAPLE STREET, ${redact(8)} (RESIDENTIAL)`,
    conditions: '0300 HRS LOCAL. NIGHT. RESIDENTS ARE ASLEEP. THIS IS A STEALTH OPERATION.',
    situation: 'HOSTILES LANDED ON A SLEEPING SUBURBAN BLOCK. THE AGENCY CANNOT AFFORD WITNESSES.',
    terrain: [
      'A NOISE METER TRACKS HOW MUCH ATTENTION YOU ARE DRAWING. KEEP IT OUT OF THE RED.',
      'SPRINTING RAISES NOISE THE WHOLE TIME YOU DO IT, UP TO 3X FASTER RIGHT OUTSIDE A HOUSE. WALK AND IT DRAINS BACK DOWN.',
      'DASHES, MISSED DIVES AND GETTING STUNNED EACH CAUSE A SPIKE. A NOISE MAKER BANG IS HEARD BY THE WHOLE BLOCK.',
      'FILL THE METER AND THE BLOCK WAKES UP: EVERY HIDING HOSTILE BOLTS FROM COVER AND YOU ARE FINED FOR THE COMPLAINT.',
      'LAWNS, HEDGES AND PARKED CARS GIVE COVER. SAVE THE LOUD MOVES FOR THE MIDDLE OF THE ROAD, AWAY FROM WINDOWS.',
      'EXTRACTION VAN IS PARKED ON THE MAIN STREET, WEST OF THE INTERSECTION.',
    ],
  },
  tropical: {
    code: 'ISV',
    location: `ISLA VERDE, ${redact(6)} ARCHIPELAGO`,
    conditions: 'DAYLIGHT. VOLCANIC HAZE. THE ISLAND IS UNINHABITED.',
    situation: 'A CRAFT CRASHED INTO THE JUNGLE CANOPY. SURVIVORS HAVE SCATTERED ACROSS THE ISLAND.',
    terrain: [
      'OCEAN ON ALL SIDES. NOBODY LEAVES THE ISLAND EXCEPT IN THE VAN OR THE UFO.',
      'AN ACTIVE VOLCANO SITS AT THE CENTER. IT IS IMPASSABLE, AND HOSTILES WILL CIRCLE IT TO SHAKE YOU.',
      'FERNS, HUTS AND PALMS GIVE DENSE COVER EVERYWHERE. FERNS, LOGS AND ROCKS CAN BE JUMPED.',
      'EXTRACTION VAN IS BEACHED ON THE WEST SHORE.',
    ],
  },
};

const TIER_INTEL = {
  grunt: { name: 'GRUNT', threat: 'LOW', cls: 'lo',
    notes: 'SLOW. HIDES OFTEN. TACKLES IF YOU CORNER IT FOR TOO LONG.' },
  scout: { name: 'SCOUT', threat: 'MODERATE', cls: 'md',
    notes: 'FAST. PANIC-DASHES AWAY WHEN YOU GET CLOSE. TACKLES.' },
  trooper: { name: 'TROOPER', threat: 'HIGH', cls: 'hi',
    notes: 'ARMORED. YOUR FIRST GRAB ONLY KNOCKS THE HELMET OFF. FIRES STUN BOLTS. BEAMS OUT FASTER.' },
  elite: { name: 'ELITE', threat: 'SEVERE', cls: 'sv',
    notes: 'CLOAKS WHILE RUNNING. DASHES. FIRES STUN BOLTS. BEAMS OUT FASTEST.' },
};
const TIER_ORDER = ['grunt', 'scout', 'trooper', 'elite'];

function todayStamp() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function caseNo(m) {
  const intel = MAP_INTEL[m.map];
  return `AW-${String(m.id + 1).padStart(4, '0')}-${intel ? intel.code : 'UNK'}`;
}

// Equipment advisory tailored to what the agent actually owns.
function advisories(m, fx) {
  const out = [];
  const has = (t) => (m.aliens[t] || 0) > 0;
  const total = Object.values(m.aliens).reduce((a, b) => a + b, 0);
  if (has('elite')) {
    out.push(fx.noisemaker
      ? 'ELITES CLOAK. YOUR NOISE MAKER KNOCKS THEM OUT OF CLOAK AND STUNS THEM. SET IT OFF WHEN ONE IS IN REACH.'
      : 'ELITES CLOAK AND ARE NEAR-INVISIBLE WHILE RUNNING. A NOISE MAKER IS STRONGLY ADVISED. NOT CURRENTLY ISSUED.');
    if (fx.drones >= 2) out.push('YOUR FIELD DRONES MK.II WILL TRACK CLOAKED ELITES OFF-SCREEN.');
    else if (fx.drones) out.push('FIELD DRONES MK.I LOSE ELITES WHILE THEY ARE CLOAKED. MK.II DOES NOT.');
  }
  if (has('trooper') || has('elite')) {
    out.push(fx.stunMul < 1
      ? 'HOSTILES CARRY STUN PISTOLS. YOUR VEST WILL SHORTEN ANY STUN.'
      : 'HOSTILES CARRY STUN PISTOLS. A STUN MAKES YOU DROP EVERYTHING YOU ARE CARRYING. JUMP THE BOLTS OR BREAK LINE OF SIGHT.');
  }
  if (has('trooper') && !fx.netgun) {
    out.push('A NET PINS A TROOPER SO ITS ARMOR DOES NOT MATTER. THE NET GUN IS NOT CURRENTLY ISSUED.');
  }
  if (total >= 4 && fx.carryMax < 2) {
    out.push(`${total} TARGETS AND YOU CAN CARRY ONE AT A TIME. AN ALIEN SACK WOULD SAVE YOU TRIPS TO THE VAN.`);
  }
  if (m.map === 'neighborhood' && fx.noisemaker) {
    out.push('NOISE MAKER USE ON MAPLE STREET WILL ALMOST CERTAINLY WAKE THE BLOCK. ONLY IF YOU MUST.');
  }
  if (!fx.drones && total >= 5) {
    out.push('FIELD DRONES WOULD POINT YOU TO LOOSE HOSTILES OFF-SCREEN. NOT CURRENTLY ISSUED.');
  }
  if (!out.length) out.push('CURRENT LOADOUT IS ADEQUATE FOR THIS OPERATION.');
  return out;
}

/* ---------------- report ---------------- */

export function buildReport(m, fx) {
  const intel = MAP_INTEL[m.map] || MAP_INTEL.playground;
  const total = Object.values(m.aliens).reduce((a, b) => a + b, 0);
  const fee = abandonFee(m);
  const best = save.bestPay[m.id];

  const paper = document.createElement('div');
  paper.className = 'paper';

  const html = [];
  // letterhead + banners appear instantly (no-type); everything else is typed
  html.push(`<div class="doc-class no-type">TOP SECRET // EBE // NOFORN</div>`);
  html.push(`<div class="doc-head no-type"><canvas class="doc-seal pixel-canvas" width="26" height="26"></canvas>` +
    `<div class="doc-org">CENTRAL INTELLIGENCE AGENCY<small>DIRECTORATE OF EXTRATERRESTRIAL AFFAIRS</small></div></div>`);

  html.push(`<div class="doc-meta tw-block">` +
    `<div><i>MEMO FOR:</i> FIELD AGENT "WRANGLER"</div>` +
    `<div><i>FROM:</i> DEPUTY DIRECTOR ${redact(6)}</div>` +
    `<div><i>DATE:</i> ${todayStamp()}</div>` +
    `<div><i>CASE NO:</i> ${caseNo(m)}</div>` +
    `<div><i>SUBJECT:</i> OPERATION ${m.name.toUpperCase()}</div>` +
    `<div><i>LOCATION:</i> ${intel.location}</div>` +
    `</div>`);

  const sec = (n, title, body) =>
    html.push(`<div class="doc-sec tw-block"><div class="doc-h">${n}. ${title}</div>${body}</div>`);
  const p = (t) => `<p>${t}</p>`;
  const li = (items) => `<ul>${items.map(t => `<li>${t}</li>`).join('')}</ul>`;

  sec(1, 'SITUATION', p(intel.situation) + (m.desc ? p(m.desc.toUpperCase()) : '') + p(`CONDITIONS: ${intel.conditions}`));

  const rows = TIER_ORDER.filter(t => m.aliens[t]).map(t => {
    const ti = TIER_INTEL[t];
    return `<div class="hostile"><div class="hostile-row"><b>${ti.name} &times;${m.aliens[t]}</b>` +
      `<span class="threat ${ti.cls}">THREAT: ${ti.threat}</span></div><p>${ti.notes}</p></div>`;
  }).join('');
  sec(2, 'HOSTILE FORCES', rows +
    p(`TOTAL: ${total} EBE${total === 1 ? '' : 'S'} (EXTRATERRESTRIAL BIOLOGICAL ENTITIES). ` +
      'CORNER ONE FOR TOO LONG AND IT WILL TURN ON YOU.'));

  sec(3, 'TIMEFRAME', li([
    `OPERATIONAL WINDOW: ${clock(m.time)} (${m.time} SEC) FROM INSERTION.`,
    'UFO INBOUND WARNING AT T-0:30. LOCATOR ARROWS TO EVERY LOOSE HOSTILE COME ONLINE AT T-0:25.',
    'AT T-0:00 A RETRIEVAL CRAFT ARRIVES AND BEAMS SURVIVORS OUT ONE AT A TIME. YOU CAN STILL SNATCH ONE OUT OF THE BEAM IF YOU ARE FAST.',
  ]));

  sec(4, 'AREA OF OPERATIONS', li(intel.terrain));

  const pay = [
    `BASE PAY: $${m.pay}.`,
    `DEDUCTION: -$${m.escapeCost} PER ESCAPED EBE${m.map === 'neighborhood' ? ' AND PER NOISE COMPLAINT' : ''}.`,
    'AT LEAST ONE CAPTURE IS REQUIRED TO CLEAR THE OPERATION.',
  ];
  if (fee) pay.push(`ABANDONING THE OPERATION FORFEITS ALL PAY AND COSTS A $${fee} CLEANUP FEE.`);
  if (best !== undefined) pay.push(`YOUR BEST PAYOUT ON THIS CONTRACT: $${best}.`);
  sec(5, 'COMPENSATION', li(pay));

  sec(6, 'EQUIPMENT ADVISORY', li(advisories(m, fx)));

  sec(7, 'ORDERS', p('LOCATE, CAPTURE AND SECURE ALL EBES IN THE EXTRACTION VAN BEFORE THE RETRIEVAL CRAFT ARRIVES.' +
    (m.map === 'neighborhood' ? ' DO NOT WAKE THE RESIDENTS.' : ' NO WITNESSES. NO PHOTOGRAPHS.')));

  html.push(`<div class="doc-sign tw-block"><div class="sig">/s/ ${redact(10)}</div>` +
    `<div>DEPUTY DIRECTOR, EXTRATERRESTRIAL AFFAIRS</div><div class="doc-small">DESTROY AFTER READING.</div></div>`);
  html.push(`<div class="doc-class no-type">TOP SECRET // EBE // NOFORN</div>`);
  html.push(`<div class="stamp no-type">APPROVED<small>FOR DEPLOYMENT</small></div>`);

  paper.innerHTML = html.join('');
  drawSeal(paper.querySelector('.doc-seal'));
  return paper;
}

// 26x26 pixel agency seal: ring, star field and a tiny saucer.
function drawSeal(cv) {
  if (!cv) return;
  const x = cv.getContext('2d');
  const px = (a, b, w, h, c) => { x.fillStyle = c; x.fillRect(a, b, w, h); };
  for (let yy = 0; yy < 26; yy++) {
    for (let xx = 0; xx < 26; xx++) {
      const d = Math.hypot(xx - 12.5, yy - 12.5);
      if (d < 12.6 && d > 10.6) px(xx, yy, 1, 1, '#2a3a5c');
      else if (d <= 10.6 && d > 9.6) px(xx, yy, 1, 1, '#b99a4a');
      else if (d <= 9.6) px(xx, yy, 1, 1, '#1d2a44');
    }
  }
  // star
  px(12, 5, 2, 2, '#e8d9a0'); px(10, 7, 6, 1, '#e8d9a0'); px(11, 8, 4, 1, '#e8d9a0');
  px(10, 9, 2, 1, '#e8d9a0'); px(14, 9, 2, 1, '#e8d9a0');
  // saucer
  px(11, 13, 4, 1, '#9fd8ff'); px(8, 14, 10, 2, '#aab6c6'); px(9, 16, 8, 1, '#5a6577');
  px(9, 15, 1, 1, '#41f0d8'); px(12, 15, 1, 1, '#ffd75e'); px(15, 15, 1, 1, '#41f0d8');
  // beam
  x.globalAlpha = 0.5;
  px(11, 17, 4, 1, '#9ff5ff'); px(10, 18, 6, 1, '#9ff5ff'); px(10, 19, 6, 1, '#9ff5ff');
  x.globalAlpha = 1;
}

/* ---------------- personnel file ---------------- */

// Each stat bar maps the gear level onto 10 segments: base kit sits at 4.
function statRow(label, value, lv, max) {
  const segs = 4 + Math.round(6 * (max ? lv / max : 0));
  let bar = '';
  for (let i = 0; i < 10; i++) bar += `<i class="${i < segs ? 'on' : ''}"></i>`;
  return `<div class="stat"><div class="stat-top"><span>${label}</span><b>${value}</b></div><div class="stat-bar">${bar}</div></div>`;
}

export function buildDossier(assets, fx, gear) {
  const lv = (id) => gear[id] || 0;
  const maxLv = (id) => (GEAR.find(g => g.id === id) || { levels: [] }).levels.length;
  const clearance = Math.min(5, 1 + Math.floor(save.missionsCleared / 3));

  const d = document.createElement('div');
  d.className = 'dossier';
  const pct = (m) => `${m >= 1 ? '+' : ''}${Math.round((m - 1) * 100)}%`;

  const tools = [];
  tools.push(`<div class="tool on"><span class="tool-ico">\u{270B}</span><span>GRAB &amp; DIVE<small>STANDARD ISSUE</small></span></div>`);
  for (const g of GEAR) {
    if (['shoes', 'stamina', 'gloves', 'kneepads', 'vest'].includes(g.id)) continue;   // shown as stats
    const l = lv(g.id);
    const tag = l ? (g.levels.length > 1 ? `MK.${'I'.repeat(l)}` : 'ISSUED') : 'NOT ISSUED';
    tools.push(`<div class="tool ${l ? 'on' : 'off'}"><span class="tool-ico">${g.icon}</span>` +
      `<span>${g.name.toUpperCase()}${g.perk ? ' <em>PERK</em>' : ''}<small>${tag}</small></span></div>`);
  }

  d.innerHTML =
    `<div class="dos-tab">PERSONNEL FILE</div>` +
    `<div class="mug"><div class="mug-lines"></div><canvas class="mug-sprite pixel-canvas"></canvas>` +
      `<div class="mug-plate">AGENT "WRANGLER"<br>ID 07-${String(4400 + save.totalCaptured % 600).padStart(4, '0')}</div></div>` +
    `<div class="dos-lines">` +
      `<div><span>CLEARANCE</span><b>LVL ${clearance}</b></div>` +
      `<div><span>OPS CLEARED</span><b>${save.missionsCleared}</b></div>` +
      `<div><span>CAPTURES</span><b>${save.totalCaptured}</b></div>` +
      `<div><span>BANK</span><b class="cash">$${save.cash}</b></div>` +
    `</div>` +
    `<div class="dos-sec">FIELD STATS</div>` +
    statRow('SPEED', pct(fx.speedMul), lv('shoes'), maxLv('shoes')) +
    statRow('STAMINA', `${fx.staminaMax}`, lv('stamina'), maxLv('stamina')) +
    statRow('GRAB REACH', pct(fx.grabMul), lv('gloves'), maxLv('gloves')) +
    statRow('GET-UP TIME', `${(1.05 * fx.recoveryMul).toFixed(2)}s`, lv('kneepads'), maxLv('kneepads')) +
    statRow('STUN TIME', `${Math.round(fx.stunMul * 100)}%`, lv('vest'), maxLv('vest')) +
    statRow('CARRY', `${fx.carryMax}`, lv('sack'), maxLv('sack')) +
    `<div class="dos-sec">TOOLS</div>` +
    `<div class="tools">${tools.join('')}</div>`;

  // the agent's mugshot, scaled up crisp
  const cv = d.querySelector('.mug-sprite');
  const spr = assets.actors.player.down;
  const SC = 5;
  cv.width = spr.width * SC; cv.height = spr.height * SC;
  const x = cv.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(spr, 0, 0, spr.width * SC, spr.height * SC);
  return d;
}

/* ---------------- typewriter ---------------- */

// Blank every typed text node in `paper`, then type them back in order. Tap
// anywhere on the scroller to finish instantly. Returns { finish, done }.
export function typewrite(paper, { scroller, cps = 230, onDone } = {}) {
  const nodes = [];
  const walker = document.createTreeWalker(paper, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement.closest('.no-type')) continue;
    if (!n.nodeValue.length) continue;
    nodes.push({ node: n, full: n.nodeValue, block: n.parentElement.closest('.tw-block') });
    n.nodeValue = '';
  }
  const blocks = [...paper.querySelectorAll('.tw-block')];
  blocks.forEach(b => b.classList.add('tw-wait'));
  paper.classList.add('typing');

  const caret = document.createElement('span');
  caret.className = 'caret';

  let ni = 0, ci = 0, budget = 0, pause = 0.35, last = performance.now(), lastClick = 0;
  let finished = false;
  let curBlock = null;

  const place = () => {
    const cur = nodes[ni];
    if (!cur) return;
    if (cur.block !== curBlock) {
      curBlock = cur.block;
      if (curBlock) curBlock.classList.remove('tw-wait');
    }
    cur.node.parentNode.insertBefore(caret, cur.node.nextSibling);
  };

  const follow = () => {
    if (!scroller) return;
    const cr = caret.getBoundingClientRect();
    const sr = scroller.getBoundingClientRect();
    if (cr.bottom > sr.bottom - 34) scroller.scrollTop += cr.bottom - sr.bottom + 60;
  };

  const complete = () => {
    if (finished) return;
    finished = true;
    for (const n of nodes) n.node.nodeValue = n.full;
    blocks.forEach(b => b.classList.remove('tw-wait'));
    caret.remove();
    paper.classList.remove('typing');
    paper.classList.add('typed');
    sfx.stamp();
    if (onDone) onDone();
  };

  const step = (now) => {
    if (finished) return;
    if (!paper.isConnected) { finished = true; return; }   // screen was left
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (pause > 0) { pause -= dt; requestAnimationFrame(step); return; }
    budget += dt * cps;
    let typed = false;
    while (budget >= 1 && ni < nodes.length) {
      const cur = nodes[ni];
      if (ci === 0) place();
      const ch = cur.full[ci++];
      cur.node.nodeValue = cur.full.slice(0, ci);
      budget -= 1;
      if (ch !== ' ' && ch !== '█') typed = true;
      if (ch === '█') budget -= 0.4;         // redaction bars thunk down a bit slower
      if (ci >= cur.full.length) {
        const nextBlock = nodes[ni + 1] && nodes[ni + 1].block;
        ni++; ci = 0;
        if (ni < nodes.length && nextBlock !== cur.block) {
          // new section: carriage return
          pause = 0.18; budget = 0;
          sfx.typeReturn();
          break;
        }
      } else if (ch === '.' && cur.full[ci] === ' ') { pause = 0.04; budget = 0; break; }
    }
    if (typed && now - lastClick > 32) { lastClick = now; sfx.type(); }
    if (ni < nodes.length) place();
    follow();
    if (ni >= nodes.length) { complete(); return; }
    requestAnimationFrame(step);
  };
  place();
  requestAnimationFrame(step);

  return { finish: complete, get done() { return finished; } };
}

