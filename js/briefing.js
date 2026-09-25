// Mission brief: a short classified CIA-style memo that types itself out
// (with typewriter sound) next to the agent's personnel file.
//
//   buildReport(mission, assets) -> paper DOM: 2-3 sentence situation, the
//                                   op's numbers, and a card per alien type
//                                   (sprite + count) that opens an intel popup
//   buildDossier(assets, fx, gear, onLoadout) -> personnel file DOM
//   typewrite(paper, opts)       -> blanks the paper's text and types it back in
import { GEAR, STAT_GEAR } from './data/missions.js';
import { save } from './save.js';
import { sfx } from './audio.js';
import { resolveLoadout, ownedGadgets, cycleSlot, swapSlots, slotControl } from './loadout.js';
import { resolveAdvanced } from './advancedGear.js';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const redact = (n) => `<span class="redact">${'█'.repeat(n)}</span>`;

/* ---------------- per-map intelligence ---------------- */

const MAP_INTEL = {
  playground: { code: 'SPP', location: `SUNNY PINES PLAYGROUND, ${redact(7)} COUNTY` },
  farmhouse: { code: 'HCF', location: `HOLLOW CREEK FARM, RURAL ROUTE ${redact(2)}` },
  shipyard: { code: 'RHS', location: `RUST HARBOR SHIPYARD, PIER ${redact(2)}` },
  neighborhood: { code: 'MPL', location: `MAPLE STREET, ${redact(6)}, 0300 HRS` },
  tropical: { code: 'ISV', location: `ISLA VERDE, ${redact(6)} ARCHIPELAGO` },
};

// What the popup says when you tap an alien card.
export const TIER_INTEL = {
  grunt: { name: 'GRUNT', threat: 'LOW', cls: 'lo', tags: ['SLOW', 'TACKLES'],
    counters: ['BAIT', 'CAGE', 'DART', 'HYPNO'],
    notes: 'The rank and file. Slow on its feet and hides a lot, so check the bushes. Corner one for too long and it will tackle you.' },
  scout: { name: 'SCOUT', threat: 'MODERATE', cls: 'md', tags: ['FAST', 'DASHES', 'TACKLES'],
    counters: ['NET', 'ZAP', 'DART', 'CAGE', 'HOOK'],
    notes: 'Quick and jumpy. It panic-dashes away the moment you get close, so cut off its escape before you dive.' },
  trooper: { name: 'TROOPER', threat: 'HIGH', cls: 'hi', tags: ['ARMORED', 'STUN BOLTS'],
    counters: ['ZAP III', 'DART II', 'CAGE', 'CRYO II', 'SHIELD', 'NET'],
    notes: 'Armored: your first grab only knocks the helmet off. Fires stun bolts that make you drop whatever you carry, and the UFO beams it out faster.' },
  elite: { name: 'ELITE', threat: 'SEVERE', cls: 'sv', tags: ['CLOAKS', 'FAST', 'STUN BOLTS'],
    counters: ['NOISE', 'ZAP II', 'CRYO', 'SHIELD', 'HOOK II'],
    notes: 'Cloaks while running and is near-invisible. Dashes, fires stun bolts and beams out fastest. A Noise Maker bang knocks the cloak off.' },
};
export const TIER_ORDER = ['grunt', 'scout', 'trooper', 'elite'];

function todayStamp() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function caseNo(m) {
  const intel = MAP_INTEL[m.map];
  return `AW-${String(m.id + 1).padStart(4, '0')}-${intel ? intel.code : 'UNK'}`;
}

/* ---------------- report ---------------- */

export function buildReport(m, assets) {
  const intel = MAP_INTEL[m.map] || MAP_INTEL.playground;

  const paper = document.createElement('div');
  paper.className = 'paper';

  const html = [];
  // letterhead + banners appear instantly (no-type); everything else is typed
  html.push(`<div class="doc-class no-type">TOP SECRET // EBE // NOFORN</div>`);
  html.push(`<div class="doc-head no-type"><canvas class="doc-seal pixel-canvas" width="26" height="26"></canvas>` +
    `<div class="doc-org">CENTRAL INTELLIGENCE AGENCY<small>DIRECTORATE OF EXTRATERRESTRIAL AFFAIRS</small></div></div>`);

  html.push(`<div class="doc-meta tw-block">` +
    `<div><i>SUBJECT:</i> OPERATION ${m.name.toUpperCase()}</div>` +
    `<div><i>LOCATION:</i> ${intel.location}</div>` +
    `<div><i>CASE:</i> ${caseNo(m)} &middot; ${todayStamp()}</div>` +
    `</div>`);

  html.push(`<div class="doc-sec tw-block"><div class="doc-h">SITUATION</div>` +
    `<p>${(m.brief || m.desc || '').toUpperCase()}</p></div>`);

  // the op's numbers on one strip: time on the clock, pay and what an escape costs
  const facts = [
    ['WINDOW', clock(m.time)],
    ['PAY', `$${m.pay}`],
    ['PER ESCAPE', `-$${m.escapeCost}`],
  ];
  if (m.map === 'neighborhood') facts.push(['NOISE METER FULL', 'JOB BLOWN']);
  html.push(`<div class="doc-facts tw-block">${facts.map(([k, v]) =>
    `<div><i>${k}</i><b>${v}</b></div>`).join('')}</div>`);

  const cards = TIER_ORDER.filter(t => m.aliens[t]).map(t =>
    `<button class="alien-card" data-tier="${t}"><canvas class="pixel-canvas"></canvas>` +
    `<b>&times;${m.aliens[t]}</b><span>${TIER_INTEL[t].name}</span></button>`).join('');
  html.push(`<div class="doc-sec tw-block"><div class="doc-h">HOSTILES <small>TAP ONE FOR INTEL</small></div>` +
    `<div class="alien-cards">${cards}</div></div>`);

  html.push(`<div class="doc-foot no-type"><span class="doc-small">DESTROY AFTER READING.</span>` +
    `<div class="stamp">APPROVED<small>FOR DEPLOYMENT</small></div></div>`);
  html.push(`<div class="doc-class no-type">TOP SECRET // EBE // NOFORN</div>`);

  paper.innerHTML = html.join('');
  drawSeal(paper.querySelector('.doc-seal'));
  for (const card of paper.querySelectorAll('.alien-card')) {
    drawAlien(card.querySelector('canvas'), assets.actors.aliens[card.dataset.tier].down, 3);
  }
  wireIntel(paper, m, assets);
  return paper;
}

function drawAlien(cv, spr, sc) {
  cv.width = spr.width * sc; cv.height = spr.height * sc;
  const x = cv.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(spr, 0, 0, cv.width, cv.height);
}

// Tap an alien card -> a small intel popup under it. Tap it again, the X, or
// anywhere else on the paper to close.
function wireIntel(paper, m, assets) {
  let pop = null, openTier = null;
  const close = () => {
    if (pop) pop.remove();
    pop = null; openTier = null;
    paper.style.marginBottom = '';
  };
  paper.addEventListener('click', (e) => {
    const card = e.target.closest('.alien-card');
    if (!card) { if (pop && !e.target.closest('.intel-pop')) close(); return; }
    e.stopPropagation();                   // don't let the pane treat it as "skip"
    const tier = card.dataset.tier;
    if (openTier === tier) { close(); sfx.click(); return; }
    close();
    sfx.click();
    openTier = tier;
    const ti = TIER_INTEL[tier];
    pop = document.createElement('div');
    pop.className = 'intel-pop';
    pop.innerHTML =
      `<div class="intel-top"><canvas class="pixel-canvas"></canvas>` +
      `<div><b>${ti.name} &times;${m.aliens[tier]}</b><span class="threat ${ti.cls}">THREAT: ${ti.threat}</span></div>` +
      `<button class="intel-x" aria-label="Close">&times;</button></div>` +
      `<div class="intel-tags">${ti.tags.map(t => `<i>${t}</i>`).join('')}</div>` +
      `<div class="intel-tags counters"><span>COUNTERS:</span>${ti.counters.map(t => `<i>${t}</i>`).join('')}</div>` +
      `<p>${ti.notes.toUpperCase()}</p>`;
    drawAlien(pop.querySelector('canvas'), assets.actors.aliens[tier].down, 2);
    pop.querySelector('.intel-x').addEventListener('click', (ev) => { ev.stopPropagation(); close(); sfx.click(); });
    paper.appendChild(pop);
    // Sit just under the card, kept inside the paper. If the visible part of
    // the report has no room below (landscape, small phones) flip it above
    // the card; if neither side fits, stay below and scroll it into view.
    const pr = paper.getBoundingClientRect(), cr = card.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    const left = Math.max(6, Math.min(pr.width - w - 6, cr.left - pr.left + cr.width / 2 - w / 2));
    pop.style.left = `${left}px`;
    pop.style.setProperty('--arrow-x', `${cr.left - pr.left + cr.width / 2 - left}px`);
    const scroller = paper.parentElement;
    const sr = scroller ? scroller.getBoundingClientRect() : { top: -1e9, bottom: 1e9 };
    const below = sr.bottom - cr.bottom, above = cr.top - sr.top;
    if (h + 8 > below && h + 8 <= above) {
      pop.classList.add('above');
      pop.style.top = `${cr.top - pr.top - h - 6}px`;
    } else {
      pop.style.top = `${cr.bottom - pr.top + 6}px`;
      // make sure the page is long enough to scroll the whole popup into view
      const overhang = (cr.bottom + 6 + h) - pr.bottom + 6;
      if (overhang > 0) paper.style.marginBottom = `${overhang}px`;
      if (scroller && h + 8 > below) scroller.scrollTop += h + 8 - below;
    }
  });
}

// 26x26 pixel agency seal: ring, star field and a tiny saucer.
export function drawSeal(cv) {
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
export function statRow(label, value, lv, max) {
  const segs = 4 + Math.round(6 * (max ? lv / max : 0));
  let bar = '';
  for (let i = 0; i < 10; i++) bar += `<i class="${i < segs ? 'on' : ''}"></i>`;
  return `<div class="stat"><div class="stat-top"><span>${label}</span><b>${value}</b></div><div class="stat-bar">${bar}</div></div>`;
}

// Draw the agent's mugshot sprite crisp onto a canvas, scaled up SCx.
export function renderMugshot(cv, spr, sc = 5) {
  cv.width = spr.width * sc; cv.height = spr.height * sc;
  const x = cv.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(spr, 0, 0, spr.width * sc, spr.height * sc);
}

export function buildDossier(assets, fx, gear, onLoadout) {
  const lv = (id) => gear[id] || 0;
  const maxLv = (id) => (GEAR.find(g => g.id === id) || { levels: [] }).levels.length;
  const clearance = Math.min(5, 1 + Math.floor(save.missionsCleared / 3));
  const mk = (g, l) => (g.levels.length > 1 ? `MK.${'I'.repeat(l)}` : 'ISSUED');

  const d = document.createElement('div');
  d.className = 'dossier';
  const pct = (m) => `${m >= 1 ? '+' : ''}${Math.round((m - 1) * 100)}%`;

  // two gadget slots; tap one to cycle what's in it, or swap them
  const lo = resolveLoadout(gear);
  const owned = ownedGadgets(gear);
  const slots = [0, 1].map(i => {
    const g = lo[i] && GEAR.find(x => x.id === lo[i]);
    const body = g
      ? `<span class="tool-ico">${g.icon}</span><span>${g.name.toUpperCase()}<small>${mk(g, lv(g.id))}</small></span>`
      : `<span class="tool-ico">&middot;</span><span>EMPTY<small>${i === 0 ? 'TAP = GRAB' : 'BUY A GADGET'}</small></span>`;
    return `<button class="slot ${g ? 'on' : 'off'}" data-slot="${i}" ${owned.length > 1 ? '' : 'disabled'}>` +
      `<em>SLOT ${i + 1} &middot; ${slotControl(i)}</em><div class="slot-body">${body}</div></button>`;
  }).join('');
  const swap = owned.length > 1 ? `<button class="slot-swap">SWAP SLOTS</button>` : '';

  const tools = [];
  tools.push(`<div class="tool on"><span class="tool-ico">\u{270B}</span><span>GRAB &amp; DIVE<small>STANDARD ISSUE</small></span></div>`);
  for (const g of GEAR) {
    if (STAT_GEAR.some(s => s.id === g.id)) continue;                                     // shown as stats
    if (g.gadget && lo.includes(g.id)) continue;                                          // shown as a slot
    if (g.advanced && resolveAdvanced(gear) === g.id) continue;                           // shown as a slot
    const l = lv(g.id);
    const tag = (g.gadget || g.advanced) && l ? 'IN LOCKER' : l ? mk(g, l) : 'NOT ISSUED';
    tools.push(`<div class="tool ${l ? 'on' : 'off'}"><span class="tool-ico">${g.icon}</span>` +
      `<span>${g.name.toUpperCase()}${g.advanced ? ' <em>ADV</em>' : ''}<small>${tag}</small></span></div>`);
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
    `<div class="dos-sec">GADGETS <small>2 MAX</small></div>` +
    `<div class="slots">${slots}</div>${swap}` +
    `<div class="dos-sec">TOOLS</div>` +
    `<div class="tools">${tools.join('')}</div>`;

  const changed = () => { sfx.click(); if (onLoadout) onLoadout(); };
  d.querySelectorAll('.slot').forEach(b => b.addEventListener('click', () => {
    cycleSlot(gear, +b.dataset.slot); changed();
  }));
  const sw = d.querySelector('.slot-swap');
  if (sw) sw.addEventListener('click', () => { swapSlots(gear); changed(); });

  // the agent's mugshot, scaled up crisp
  renderMugshot(d.querySelector('.mug-sprite'), assets.actors.player.down);
  return d;
}

/* ---------------- typewriter ---------------- */

// Blank every typed text node in `paper`, then type them back in order. Tap
// anywhere on the scroller to finish instantly. Returns { finish, done }.
export function typewrite(paper, { scroller, cps = 150, onDone } = {}) {
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

