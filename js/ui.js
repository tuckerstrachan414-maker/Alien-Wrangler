import { MISSIONS, getMission, GEAR } from './data/missions.js';
import { save, persist, resetSave } from './save.js';
import { sfx } from './audio.js';

const MAP_NAMES = {
  playground: 'Sunny Pines Playground',
  farmhouse: 'Hollow Creek Farm',
  shipyard: 'Rust Harbor Shipyard',
};

const TIER_NAMES = { grunt: 'Grunt', scout: 'Scout', trooper: 'Trooper', elite: 'Elite' };

export class UI {
  constructor(root, assets, actions) {
    this.root = root;
    this.assets = assets;
    this.actions = actions;   // { startMission(n), resume(), restart(), quitToMenu() }
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
    s.appendChild(this.el('div', 'game-sub', 'CIA FIELD OPS &mdash; RETRIEVAL DIVISION'));

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
    s.appendChild(this.btn('DEPLOY', 'primary', () => this.showMissions()));
    s.appendChild(this.btn('EQUIPMENT', '', () => this.showShop()));
    s.appendChild(this.btn(save.muted ? 'SOUND: OFF' : 'SOUND: ON', '', () => {
      save.muted = !save.muted; persist(); this.showTitle();
    }));
    s.appendChild(this.el('div', 'tip',
      'Left thumb: move. Tap SPRINT to toggle running (drains stamina).<br>' +
      'Right thumb: GRAB up close &middot; DIVE for distance &middot; DASH to close gaps &middot; JUMP fences.<br>' +
      'Haul aliens back to the van before the UFO beams them out.'));
    const reset = this.btn('RESET SAVE', 'danger', () => {
      if (this._confirmReset) { resetSave(); this.showTitle(); }
      else { this._confirmReset = true; reset.textContent = 'TAP AGAIN TO CONFIRM'; }
    });
    reset.style.marginTop = '26px';
    reset.style.fontSize = '12px';
    this._confirmReset = false;
    s.appendChild(reset);
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
        const play = this.btn(clearedBefore ? 'REPLAY' : 'DEPLOY', clearedBefore ? '' : 'primary', () => this.actions.startMission(i));
        row.appendChild(play);
        card.appendChild(row);
      }
      list.appendChild(card);
    }
    s.appendChild(this.btn('BACK', '', () => this.showTitle()));
  }

  /* ---------------- shop ---------------- */

  showShop(backTo = 'title') {
    const s = this.screen();
    s.appendChild(this.el('div', 'game-title', 'EQUIPMENT'));
    s.appendChild(this.el('div', 'money-tag', `BANK: $${save.cash}`));
    const list = this.el('div', 'card-list');
    s.appendChild(list);

    for (const g of GEAR) {
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
          this.showShop(backTo);
        });
        buy.disabled = !afford;
        row.appendChild(buy);
      } else {
        row.appendChild(this.el('div', 'done', 'FULLY UPGRADED'));
      }
      card.appendChild(row);
      list.appendChild(card);
    }
    s.appendChild(this.btn('BACK', '', () => backTo === 'missions' ? this.showMissions() : this.showTitle()));
  }

  /* ---------------- results ---------------- */

  showResults(r) {
    const s = this.screen();
    s.appendChild(this.el('div', `result-verdict ${r.cleared ? 'ok' : 'bad'}`,
      r.cleared ? 'MISSION CLEARED' : 'MISSION FAILED'));
    s.appendChild(this.el('div', 'game-sub', r.mission.name.toUpperCase()));

    const line = (label, val, cls = '') =>
      s.appendChild(this.el('div', 'result-line', `<span>${label}</span><b class="${cls}">${val}</b>`));
    line('Aliens captured', `${r.captured}/${r.total}`, r.captured ? 'pos' : '');
    line('Aliens escaped', `${r.escaped}`, r.escaped ? 'neg' : '');
    line('Base pay', `$${r.basePay}`);
    line('Escape deductions', `-$${r.deduction}`, r.deduction ? 'neg' : '');
    const total = this.el('div', 'result-line result-total', `<span>PAYOUT</span><b class="pos">$${r.pay}</b>`);
    s.appendChild(total);
    s.appendChild(this.el('div', 'money-tag', `BANK: $${save.cash}`));

    if (r.cleared) s.appendChild(this.btn('NEXT MISSION', 'primary', () => this.actions.startMission(Math.min(save.missionsCleared, r.mission.id + 1))));
    s.appendChild(this.btn(r.cleared ? 'REPLAY' : 'RETRY', r.cleared ? '' : 'primary', () => this.actions.startMission(r.mission.id)));
    s.appendChild(this.btn('EQUIPMENT', '', () => this.showShop('missions')));
    s.appendChild(this.btn('MISSION SELECT', '', () => this.showMissions()));
    if (!r.cleared) s.appendChild(this.el('div', 'tip', 'You need at least one capture to clear a mission.<br>Missed dives leave you on the ground &mdash; grab when close, dive when they bolt.'));
  }

  /* ---------------- pause ---------------- */

  showPause() {
    const s = this.screen('dim');
    s.appendChild(this.el('div', 'game-title', 'PAUSED'));
    s.appendChild(this.btn('RESUME', 'primary', () => this.actions.resume()));
    s.appendChild(this.btn('RESTART MISSION', '', () => this.actions.restart()));
    s.appendChild(this.btn(save.muted ? 'SOUND: OFF' : 'SOUND: ON', '', () => {
      save.muted = !save.muted; persist(); this.showPause();
    }));
    s.appendChild(this.btn('ABANDON MISSION', 'danger', () => this.actions.quitToMenu()));
  }
}
