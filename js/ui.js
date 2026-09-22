import {
  MISSIONS, getMission, GEAR, MAP_LIST, SANDBOX_TIMES,
  sandboxMission, gearMaxLevel, abandonFee, gearEffects,
} from './data/missions.js';
import { save, persist, resetSave } from './save.js';
import { sfx } from './audio.js';
import { buildReport, buildDossier, typewrite } from './briefing.js';
import { resolveLoadout, equipGadget, cycleSlot, slotControl, ownedGadgets } from './loadout.js';

const MAP_NAMES = {
  playground: 'Sunny Pines Playground',
  farmhouse: 'Hollow Creek Farm',
  shipyard: 'Rust Harbor Shipyard',
  neighborhood: 'Maple Street (Stealth)',
  tropical: 'Isla Verde',
};

const TIER_NAMES = { grunt: 'Grunt', scout: 'Scout', trooper: 'Trooper', elite: 'Elite' };
const TIERS = ['grunt', 'scout', 'trooper', 'elite'];
const TIER_NOTES = {
  grunt: 'Slow, dumb, hides a lot',
  scout: 'Fast, dashes away',
  trooper: 'Armored, fires stun bolts',
  elite: 'Cloaks, fast, fires bolts',
};

const VOL_STEPS = [0, 25, 50, 75, 100];

const fmtClock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export class UI {
  constructor(root, assets, actions) {
    this.root = root;
    this.assets = assets;
    // { startMission(n), startSandbox(cfg), resume(), restart(),
    //   abandonMission(), quitToMenu(), applySettings() }
    this.actions = actions;
  }

  clear() { this.root.innerHTML = ''; }

  el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  btn(label, cls, fn) {
    const b = this.el('button', `menu-btn ${cls || ''}`, label);
    b.addEventListener('click', () => { sfx.click(); fn(); });
    return b;
  }

  // A menu button with a small explanatory second line.
  bigBtn(label, sub, cls, fn) {
    return this.btn(`${label}<span class="sub">${sub}</span>`, cls, fn);
  }

  screen(cls = '') {
    this.clear();
    const s = this.el('div', `screen ${cls}`);
    this.root.appendChild(s);
    return s;
  }

  /* ---------------- title ---------------- */

  showTitle() {
    const s = this.screen();
    s.appendChild(this.el('div', 'game-title', 'ALIEN<br>WRANGLER'));
    s.appendChild(this.el('div', 'title-badge', 'CIA FIELD OPS'));

    // pixel art hero: the agent + an alien
    const art = document.createElement('canvas');
    art.className = 'title-art';
    const SC = 7;
    art.width = 34 * SC; art.height = 18 * SC;
    art.style.width = `${34 * SC}px`;
    const ctx = art.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.scale(SC, SC);
    ctx.drawImage(this.assets.actors.player.down, 2, 1);
    ctx.drawImage(this.assets.actors.aliens.grunt.down, 21, 5);
    ctx.restore();
    s.appendChild(art);

    s.appendChild(this.el('div', 'money-tag', `BANK: $${save.cash}`));

    s.appendChild(this.bigBtn('PLAY', 'Contracts &amp; equipment', 'primary', () => this.showPlay()));
    s.appendChild(this.bigBtn('SETTINGS', 'Sound &amp; controls', '', () => this.showSettings('title')));
    s.appendChild(this.bigBtn('SANDBOX', 'Any map, any gear &mdash; free play', '', () => this.showSandbox()));

    s.appendChild(this.el('div', 'tip',
      save.controlMode === 'gestures'
        ? 'NO-BUTTONS CONTROLS: left half walks, right half acts.<br>Change it any time in Settings.'
        : 'Left thumb moves, right thumb acts. Prefer gestures?<br>Switch to no-buttons controls in Settings.'));
  }

  /* ---------------- play hub ---------------- */

  showPlay() {
    const s = this.screen();
    s.appendChild(this.el('div', 'game-title', 'FIELD OPS'));
    s.appendChild(this.el('div', 'money-tag', `BANK: $${save.cash}`));
    s.appendChild(this.bigBtn('DEPLOY',
      `Mission ${Math.min(save.missionsCleared + 1, 99)} &mdash; take a contract`,
      'primary', () => this.showMissions()));
    s.appendChild(this.bigBtn('EQUIPMENT', 'Spend your bank on upgrades', '', () => this.showShop('play')));
    s.appendChild(this.el('div', 'menu-spacer'));
    s.appendChild(this.btn('BACK', '', () => this.showTitle()));
  }

  /* ---------------- mission select ---------------- */

  missionRoster(m) {
    return Object.entries(m.aliens)
      .map(([t, n]) => `${n}&times; ${TIER_NAMES[t]}`)
      .join(', ');
  }

  showMissions() {
    const s = this.screen();
    s.appendChild(this.el('div', 'game-title', 'MISSIONS'));
    s.appendChild(this.el('div', 'money-tag', `BANK: $${save.cash}`));
    const list = this.el('div', 'card-list');
    s.appendChild(list);

    const maxShown = Math.max(MISSIONS.length, save.missionsCleared + 1);
    for (let i = 0; i < maxShown; i++) {
      const m = getMission(i);
      const locked = i > save.missionsCleared;
      const clearedBefore = i < save.missionsCleared;
      const card = this.el('div', `card ${locked ? 'locked' : ''}`);
      const head = this.el('div', 'card-head');
      head.appendChild(this.el('div', 'card-title', `${i + 1}. ${m.name}`));
      head.appendChild(this.el('div', 'card-pay', `$${m.pay}`));
      card.appendChild(head);
      card.appendChild(this.el('div', 'card-desc',
        `${MAP_NAMES[m.map]}<br>${this.missionRoster(m)} &middot; ${m.time}s &middot; -$${m.escapeCost}/escape` +
        (locked ? '<br>Clear the previous mission to unlock.' : '') +
        (m.desc && !locked ? `<br><i>${m.desc}</i>` : '')));
      if (!locked) {
        const row = this.el('div', 'card-row');
        if (clearedBefore) row.appendChild(this.el('div', 'done', `CLEARED &middot; best $${save.bestPay[m.id] || 0}`));
        const play = this.btn(clearedBefore ? 'REPLAY' : 'DEPLOY', clearedBefore ? '' : 'primary', () => this.showBriefing(i));
        row.appendChild(play);
        card.appendChild(row);
      }
      list.appendChild(card);
    }
    s.appendChild(this.btn('BACK', '', () => this.showPlay()));
  }

  /* ---------------- mission brief ---------------- */

  // Classified memo for contract n: personnel file on the left, the report
  // typing itself out on the right. `instant` skips the typing (coming back
  // from the shop, say).
  showBriefing(n, { instant = false } = {}) {
    const m = getMission(n);
    this._briefN = n;
    const s = this.screen('brief');

    const head = this.el('div', 'brief-head');
    head.appendChild(this.el('div', 'brief-title', 'MISSION BRIEFING'));
    head.appendChild(this.el('div', 'brief-op', `OP ${String(n + 1).padStart(2, '0')} &middot; ${m.name.toUpperCase()}`));
    s.appendChild(head);

    const body = this.el('div', 'brief-body');
    const dossierPane = this.el('div', 'brief-pane dossier-pane');
    // re-draw just the file when a gadget slot changes, so the report keeps typing
    const fillDossier = () => {
      const top = dossierPane.scrollTop;
      dossierPane.innerHTML = '';
      dossierPane.appendChild(buildDossier(this.assets, gearEffects(save.gear), save.gear, fillDossier));
      dossierPane.scrollTop = top;
    };
    fillDossier();
    const reportPane = this.el('div', 'brief-pane report-pane');
    const paper = buildReport(m, this.assets);
    reportPane.appendChild(paper);
    const skip = this.el('div', 'brief-skip', 'TAP REPORT TO SKIP');
    reportPane.appendChild(skip);
    body.appendChild(dossierPane);
    body.appendChild(reportPane);
    s.appendChild(body);

    const foot = this.el('div', 'brief-foot');
    foot.appendChild(this.btn('BACK', '', () => this.showMissions()));
    foot.appendChild(this.btn('GEAR UP', '', () => this.showShop('brief')));
    const go = this.btn('BEGIN OP', 'primary go', () => this.actions.startMission(n));
    foot.appendChild(go);
    s.appendChild(foot);

    const done = () => {
      skip.classList.add('hidden');
      go.classList.add('ready');
    };
    if (instant) {
      paper.classList.add('typed', 'instant');
      done();
      return;
    }
    const tw = typewrite(paper, { scroller: reportPane, onDone: done });
    reportPane.addEventListener('click', () => { if (!tw.done) tw.finish(); });
  }

  /* ---------------- shop ---------------- */

  showShop(backTo = 'play') {
    const s = this.screen();
    s.appendChild(this.el('div', 'game-title', 'EQUIPMENT'));
    s.appendChild(this.el('div', 'money-tag', `BANK: $${save.cash}`));
    const list = this.el('div', 'card-list');
    s.appendChild(list);

    const groups = [
      ['GEAR', GEAR.filter(g => !g.gadget && !g.perk)],
      ['GADGETS &middot; EQUIP 2', GEAR.filter(g => g.gadget)],
      ['PERKS', GEAR.filter(g => g.perk)],
    ];
    const loadout = resolveLoadout(save.gear);
    for (const [label, items] of groups) {
      list.appendChild(this.el('div', 'section-label wide', label));
      for (const g of items) list.appendChild(this.gearCard(g, loadout, backTo));
    }
    const back = {
      missions: () => this.showMissions(),
      title: () => this.showTitle(),
      brief: () => this.showBriefing(this._briefN, { instant: true }),
    }[backTo] || (() => this.showPlay());
    if (backTo === 'brief') s.appendChild(this.btn('BACK TO BRIEFING', 'primary', back));
    if (backTo !== 'brief') s.appendChild(this.btn('BACK', '', back));
  }

  // Re-open the shop where it was scrolled to (after a purchase or an equip).
  redrawShop(backTo) {
    const old = this.root.querySelector('.screen');
    const top = old ? old.scrollTop : 0;
    this.showShop(backTo);
    const fresh = this.root.querySelector('.screen');
    if (fresh) fresh.scrollTop = top;
  }

  // One shop card: level stars, the next upgrade and BUY, plus the slot
  // picker once you own a gadget.
  gearCard(g, loadout, backTo) {
    const lv = save.gear[g.id] || 0;
    const maxed = lv >= g.levels.length;
    const next = maxed ? null : g.levels[lv];
    const card = this.el('div', 'card');
    const head = this.el('div', 'card-head');
    head.appendChild(this.el('div', 'card-title', `${g.icon} ${g.name}`));
    head.appendChild(this.el('div', 'stars', '&#9733;'.repeat(lv) + '<span style="opacity:0.25">' + '&#9733;'.repeat(g.levels.length - lv) + '</span>'));
    card.appendChild(head);
    card.appendChild(this.el('div', 'card-desc',
      `${g.desc}<br>${maxed ? '<b>MAXED OUT</b>' : `Next: ${next.label}`}`));
    const row = this.el('div', 'card-row');
    if (!maxed) {
      const afford = save.cash >= next.price;
      const buy = this.btn(`BUY &mdash; $${next.price}`, afford ? 'primary' : '', () => {
        if (save.cash < next.price) return;
        save.cash -= next.price;
        save.gear[g.id] = lv + 1;
        persist();
        sfx.cash();
        this.redrawShop(backTo);
      });
      buy.disabled = !afford;
      row.appendChild(buy);
    } else {
      row.appendChild(this.el('div', 'done', 'FULLY UPGRADED'));
    }
    card.appendChild(row);
    if (g.gadget && lv > 0) card.appendChild(this.slotPicker(g.id, loadout, () => this.redrawShop(backTo)));
    return card;
  }

  // "EQUIP TO" row on an owned gadget's shop card: one chip per slot.
  slotPicker(id, loadout, redraw) {
    const row = this.el('div', 'card-row slot-row');
    row.appendChild(this.el('div', 'slot-row-label', 'EQUIP'));
    for (const i of [0, 1]) {
      const on = loadout[i] === id;
      row.appendChild(this.chip(`SLOT ${i + 1}`, slotControl(i), on, 'narrow', () => {
        if (on) return;
        equipGadget(save.gear, i, id);
        redraw();
      }));
    }
    if (!loadout.includes(id)) row.appendChild(this.el('div', 'slot-row-note', 'IN LOCKER'));
    return row;
  }

  /* ---------------- settings ---------------- */

  // Row with a label, optional sub-label and a right-hand control cluster.
  optRow(name, sub, ...ctl) {
    const row = this.el('div', 'opt-row');
    row.appendChild(this.el('div', 'opt-name', sub ? `${name}<small>${sub}</small>` : name));
    const box = this.el('div', 'opt-ctl');
    ctl.forEach(c => box.appendChild(c));
    row.appendChild(box);
    return row;
  }

  stepBtn(label, fn) {
    const b = this.el('button', 'step-btn', label);
    b.addEventListener('click', () => { sfx.click(); fn(); });
    return b;
  }

  chip(label, sub, on, cls, fn) {
    const c = this.el('button', `chip ${cls || ''} ${on ? 'on' : ''}`, sub ? `${label}<small>${sub}</small>` : label);
    c.addEventListener('click', () => { sfx.click(); fn(); });
    return c;
  }

  meter(value, max) {
    const m = this.el('div', 'meter');
    for (let i = 0; i < max; i++) m.appendChild(this.el('i', i < value ? 'on' : ''));
    return m;
  }

  // ON/OFF switch that reads its own state.
  toggle(isOn, onFlip) {
    const b = this.el('button', 'step-btn toggle-btn', '');
    const paint = () => {
      const on = isOn();
      b.textContent = on ? 'ON' : 'OFF';
      b.classList.toggle('on', on);
      b.classList.toggle('off', !on);
    };
    b.addEventListener('click', () => { onFlip(); paint(); sfx.click(); });
    paint();
    return b;
  }

  showSettings(from = 'title') {
    const s = this.screen(from === 'pause' ? 'dim' : '');
    s.appendChild(this.el('div', 'game-title', 'SETTINGS'));

    /* ---- sound ---- */
    s.appendChild(this.el('div', 'section-label', 'SOUND'));

    s.appendChild(this.optRow('SOUND', 'All game audio',
      this.toggle(() => !save.muted, () => { save.muted = !save.muted; persist(); })));

    const volRow = this.el('div', 'opt-row');
    volRow.appendChild(this.el('div', 'opt-name', 'SFX VOLUME<small>Effects loudness</small>'));
    const volCtl = this.el('div', 'opt-ctl');
    const PIPS = VOL_STEPS.length - 1;   // so 0% lights nothing
    let volMeter = this.meter(VOL_STEPS.indexOf(save.sfxVolume), PIPS);
    const stepVol = (d) => {
      let i = VOL_STEPS.indexOf(save.sfxVolume);
      if (i < 0) i = VOL_STEPS.length - 1;
      i = Math.max(0, Math.min(VOL_STEPS.length - 1, i + d));
      save.sfxVolume = VOL_STEPS[i];
      persist();
      const fresh = this.meter(i, PIPS);
      volCtl.replaceChild(fresh, volMeter);
      volMeter = fresh;
      if (!save.muted) sfx.grab();   // audition the new level
    };
    volCtl.appendChild(this.stepBtn('&minus;', () => stepVol(-1)));
    volCtl.appendChild(volMeter);
    volCtl.appendChild(this.stepBtn('+', () => stepVol(1)));
    volRow.appendChild(volCtl);
    s.appendChild(volRow);

    /* ---- controls ---- */
    s.appendChild(this.el('div', 'section-label', 'CONTROLS'));

    const grid = this.el('div', 'chip-grid');
    const detail = this.el('div', 'opt-row');
    const hintRow = this.el('div', 'opt-row');

    const describe = () => {
      detail.innerHTML = '';
      const gestures = save.controlMode === 'gestures';
      detail.appendChild(this.el('div', 'opt-name', gestures
        ? 'NO BUTTONS<small>' +
          'Screen splits down the middle, portrait or landscape.<br>' +
          'LEFT (legs) &mdash; drag anywhere to walk &middot; push your thumb out past the ring to sprint. ' +
          'Walk into a fence, bale or crate to vault it, and into an alien to grab it.<br>' +
          'RIGHT (hands) &mdash; TAP gadget 1 &middot; SWIPE RIGHT gadget 2 &middot; SWIPE UP jump &middot; ' +
          'SWIPE DOWN dive &middot; SWIPE LEFT dash. Dive and dash go the way you&rsquo;re running.' +
          '</small>'
        : 'BUTTONS<small>' +
          'Floating joystick on the left, action buttons on the right.<br>' +
          'GRAB &middot; DIVE &middot; DASH &middot; JUMP &middot; SPRINT toggle &middot; a button for each equipped gadget.' +
          '</small>'));
      hintRow.classList.toggle('hidden', !gestures);
    };

    const pick = (mode) => {
      if (save.controlMode === mode) return;
      save.controlMode = mode;
      persist();
      this.actions.applySettings();
      for (const c of grid.children) c.classList.toggle('on', c.dataset.mode === save.controlMode);
      describe();
    };

    const cButtons = this.chip('BUTTONS', 'Joystick + buttons', save.controlMode === 'buttons', '', () => pick('buttons'));
    cButtons.dataset.mode = 'buttons';
    const cGestures = this.chip('NO BUTTONS', 'Split-screen gestures', save.controlMode === 'gestures', '', () => pick('gestures'));
    cGestures.dataset.mode = 'gestures';
    grid.appendChild(cButtons);
    grid.appendChild(cGestures);
    s.appendChild(grid);
    s.appendChild(detail);

    hintRow.appendChild(this.el('div', 'opt-name', 'GESTURE HINTS<small>On-screen gesture legend</small>'));
    const hintCtl = this.el('div', 'opt-ctl');
    hintCtl.appendChild(this.toggle(() => save.gestureHints, () => {
      save.gestureHints = !save.gestureHints;
      persist();
      this.actions.applySettings();
    }));
    hintRow.appendChild(hintCtl);
    s.appendChild(hintRow);
    describe();

    s.appendChild(this.el('div', 'tip',
      'Controls can be switched mid-mission &mdash; pause and open Settings.'));

    /* ---- save data (out of the way, not on the title screen) ---- */
    if (from !== 'pause') {
      s.appendChild(this.el('div', 'section-label', 'SAVE DATA'));
      s.appendChild(this.el('div', 'tip',
        `Bank $${save.cash} &middot; ${save.missionsCleared} mission${save.missionsCleared === 1 ? '' : 's'} cleared ` +
        `&middot; ${save.totalCaptured} aliens captured.`));
      const reset = this.btn('RESET SAVE', 'danger', () => {
        if (this._confirmReset) {
          resetSave();
          this.actions.applySettings();
          this.showTitle();
        } else {
          this._confirmReset = true;
          reset.textContent = 'TAP AGAIN TO WIPE EVERYTHING';
        }
      });
      reset.style.fontSize = '9px';
      this._confirmReset = false;
      s.appendChild(reset);
    }

    s.appendChild(this.el('div', 'menu-spacer'));
    s.appendChild(this.btn('BACK', '', () => from === 'pause' ? this.showPause() : this.showTitle()));
  }

  /* ---------------- sandbox ---------------- */

  showSandbox() {
    const cfg = save.sandbox;
    const s = this.screen();
    s.appendChild(this.el('div', 'game-title', 'SANDBOX'));
    s.appendChild(this.el('div', 'game-sub', 'FREE PLAY &mdash; NO PAY, NO PENALTIES, NOTHING SAVED'));

    /* map */
    s.appendChild(this.el('div', 'section-label', 'MAP'));
    const mapGrid = this.el('div', 'chip-grid');
    for (const m of MAP_LIST) {
      const c = this.chip(m.name.toUpperCase(), m.note, cfg.map === m.id, '', () => {
        cfg.map = m.id;
        persist();
        for (const ch of mapGrid.children) ch.classList.toggle('on', ch.dataset.map === cfg.map);
      });
      c.dataset.map = m.id;
      mapGrid.appendChild(c);
    }
    s.appendChild(mapGrid);

    /* roster */
    s.appendChild(this.el('div', 'section-label', 'ALIENS'));
    const totalNote = this.el('div', 'warn-note hidden', 'Add at least one alien to start.');
    const refreshTotal = () => {
      const total = TIERS.reduce((n, t) => n + (cfg.aliens[t] || 0), 0);
      totalNote.classList.toggle('hidden', total > 0);
      startBtn.disabled = total === 0;
      return total;
    };

    for (const tier of TIERS) {
      const val = this.el('div', 'step-val', `${cfg.aliens[tier] || 0}`);
      const step = (d) => {
        cfg.aliens[tier] = Math.max(0, Math.min(12, (cfg.aliens[tier] || 0) + d));
        val.textContent = `${cfg.aliens[tier]}`;
        persist();
        refreshTotal();
      };
      s.appendChild(this.optRow(TIER_NAMES[tier].toUpperCase(), TIER_NOTES[tier],
        this.stepBtn('&minus;', () => step(-1)), val, this.stepBtn('+', () => step(1))));
    }
    s.appendChild(totalNote);

    /* time */
    s.appendChild(this.el('div', 'section-label', 'TIME LIMIT'));
    const timeGrid = this.el('div', 'chip-grid');
    for (const t of SANDBOX_TIMES) {
      const c = this.chip(t > 0 ? fmtClock(t) : 'NO LIMIT', t > 0 ? '' : 'UFO never comes',
        cfg.time === t, 'narrow', () => {
          cfg.time = t;
          persist();
          for (const ch of timeGrid.children) ch.classList.toggle('on', +ch.dataset.time === cfg.time);
        });
      c.dataset.time = t;
      timeGrid.appendChild(c);
    }
    s.appendChild(timeGrid);

    /* loadout */
    s.appendChild(this.el('div', 'section-label', 'LOADOUT'));
    const gearRows = [];
    for (const g of GEAR) {
      const max = g.levels.length;
      const box = this.el('div', 'opt-ctl');
      let meter = this.meter(cfg.gear[g.id] || 0, max);
      const redraw = () => {
        const fresh = this.meter(cfg.gear[g.id] || 0, max);
        box.replaceChild(fresh, meter);
        meter = fresh;
      };
      const step = (d) => {
        cfg.gear[g.id] = Math.max(0, Math.min(max, (cfg.gear[g.id] || 0) + d));
        persist();
        redraw();
        if (g.gadget) drawSlots();
      };
      box.appendChild(this.stepBtn('&minus;', () => step(-1)));
      box.appendChild(meter);
      box.appendChild(this.stepBtn('+', () => step(1)));
      const row = this.el('div', 'opt-row');
      row.appendChild(this.el('div', 'opt-name', `${g.icon} ${g.name}<small>${g.desc}</small>`));
      row.appendChild(box);
      s.appendChild(row);
      gearRows.push(redraw);
    }

    // which two gadgets ride along (tap a slot to cycle through the ones loaded above)
    const slotRow = this.el('div', 'opt-row');
    slotRow.appendChild(this.el('div', 'opt-name', 'GADGET SLOTS<small>Two ride along &middot; tap a slot to change it</small>'));
    const slotBox = this.el('div', 'opt-ctl');
    slotRow.appendChild(slotBox);
    const drawSlots = () => {
      slotBox.innerHTML = '';
      const lo = resolveLoadout(cfg.gear);
      const many = ownedGadgets(cfg.gear).length > 1;
      for (const i of [0, 1]) {
        const g = GEAR.find(x => x.id === lo[i]);
        const c = this.chip(g ? `${g.icon} ${g.short}` : 'EMPTY', slotControl(i), !!g, 'narrow', () => {
          if (!many) return;
          cycleSlot(cfg.gear, i);
          drawSlots();
        });
        slotBox.appendChild(c);
      }
    };
    gearRows.push(drawSlots);
    drawSlots();
    s.appendChild(slotRow);

    const bulk = this.el('div', 'chip-grid');
    bulk.appendChild(this.chip('MAX ALL GEAR', '', false, '', () => {
      for (const g of GEAR) cfg.gear[g.id] = gearMaxLevel(g.id);
      persist();
      gearRows.forEach(fn => fn());
    }));
    bulk.appendChild(this.chip('NO GEAR', '', false, '', () => {
      for (const g of GEAR) cfg.gear[g.id] = 0;
      persist();
      gearRows.forEach(fn => fn());
    }));
    s.appendChild(bulk);

    s.appendChild(this.el('div', 'menu-spacer'));
    const startBtn = this.btn('START SANDBOX', 'primary', () => {
      if (refreshTotal() === 0) return;
      this.actions.startSandbox(sandboxMission(cfg));
    });
    s.appendChild(startBtn);
    s.appendChild(this.btn('BACK', '', () => this.showTitle()));
    refreshTotal();
  }

  /* ---------------- results ---------------- */

  showResults(r) {
    const s = this.screen();
    const sandbox = !!r.mission.sandbox;
    const verdict = sandbox ? 'SANDBOX ENDED'
      : r.abandoned ? 'MISSION ABANDONED'
      : r.cleared ? 'MISSION CLEARED' : 'MISSION FAILED';
    s.appendChild(this.el('div', `result-verdict ${r.cleared && !r.abandoned ? 'ok' : 'bad'}`, verdict));
    s.appendChild(this.el('div', 'game-sub',
      sandbox ? MAP_NAMES[r.mission.map].toUpperCase() : r.mission.name.toUpperCase()));

    const line = (label, val, cls = '') =>
      s.appendChild(this.el('div', 'result-line', `<span>${label}</span><b class="${cls}">${val}</b>`));

    line('Aliens captured', `${r.captured}/${r.total}`, r.captured ? 'pos' : '');
    line('Aliens escaped', `${r.escaped}`, r.escaped ? 'neg' : '');

    if (sandbox) {
      if (r.fines) line('Noise complaints', `${r.fines}`, 'neg');
      s.appendChild(this.el('div', 'result-line result-total', '<span>PAYOUT</span><b>SANDBOX &mdash; $0</b>'));
      s.appendChild(this.btn('RUN IT AGAIN', 'primary', () => this.actions.startSandbox(r.mission)));
      s.appendChild(this.btn('SANDBOX SETUP', '', () => this.showSandbox()));
      s.appendChild(this.btn('MAIN MENU', '', () => this.showTitle()));
      return;
    }

    if (r.abandoned) {
      line('Contract payout', 'FORFEIT', 'neg');
      if (r.fee) line('Cleanup fee', `-$${r.fee}`, 'neg');
      s.appendChild(this.el('div', 'result-line result-total', `<span>NET</span><b class="neg">-$${r.fee}</b>`));
    } else {
      const escDed = r.escaped * r.mission.escapeCost;
      const fineDed = (r.fines || 0) * r.mission.escapeCost;
      line('Base pay', `$${r.basePay}`);
      line('Escape deductions', `-$${escDed}`, escDed ? 'neg' : '');
      if (r.fines) line('Noise fines', `${r.fines} &times; -$${r.mission.escapeCost}`, 'neg');
      s.appendChild(this.el('div', 'result-line result-total', `<span>PAYOUT</span><b class="pos">$${r.pay}</b>`));
    }
    s.appendChild(this.el('div', 'money-tag', `BANK: $${save.cash}`));

    if (r.cleared && !r.abandoned) {
      s.appendChild(this.btn('NEXT MISSION', 'primary', () => this.showBriefing(Math.min(save.missionsCleared, r.mission.id + 1))));
    }
    s.appendChild(this.btn(r.cleared && !r.abandoned ? 'REPLAY' : 'RETRY', r.cleared && !r.abandoned ? '' : 'primary',
      () => this.actions.startMission(r.mission.id)));
    s.appendChild(this.btn('EQUIPMENT', '', () => this.showShop('missions')));
    s.appendChild(this.btn('MISSION SELECT', '', () => this.showMissions()));
    s.appendChild(this.btn('MAIN MENU', '', () => this.showTitle()));
    if (r.abandoned) {
      s.appendChild(this.el('div', 'tip', 'Abandoning a contract forfeits the payout and costs a cleanup fee.<br>Ride it out next time &mdash; even one capture clears a mission.'));
    } else if (!r.cleared) {
      s.appendChild(this.el('div', 'tip', 'You need at least one capture to clear a mission.<br>Missed dives leave you on the ground &mdash; grab when close, dive when they bolt.'));
    }
  }

  /* ---------------- pause ---------------- */

  showPause() {
    const mission = this.actions.currentMission();
    const sandbox = !!(mission && mission.sandbox);
    const fee = abandonFee(mission);

    const s = this.screen('dim');
    s.appendChild(this.el('div', 'game-title', 'PAUSED'));
    if (mission) {
      s.appendChild(this.el('div', 'game-sub',
        sandbox ? `SANDBOX &mdash; ${MAP_NAMES[mission.map].toUpperCase()}` : mission.name.toUpperCase()));
    }
    s.appendChild(this.btn('RESUME', 'primary', () => this.actions.resume()));
    s.appendChild(this.btn(sandbox ? 'RESTART RUN' : 'RESTART MISSION', '', () => this.actions.restart()));
    s.appendChild(this.btn('SETTINGS', '', () => this.showSettings('pause')));
    s.appendChild(this.el('div', 'menu-spacer'));

    if (sandbox) {
      s.appendChild(this.btn('END SANDBOX', 'danger', () => this.actions.abandonMission()));
    } else {
      const label = fee > 0
        ? `ABANDON MISSION<span class="sub">Forfeit the payout &middot; cleanup fee -$${fee}</span>`
        : 'ABANDON MISSION';
      const b = this.btn(label, 'danger', () => {
        if (this._confirmAbandon) { this.actions.abandonMission(); return; }
        this._confirmAbandon = true;
        b.innerHTML = `TAP AGAIN TO ABANDON<span class="sub">This costs you $${fee}</span>`;
      });
      this._confirmAbandon = false;
      s.appendChild(b);
    }
  }
}
