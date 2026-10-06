// The Field Locker tutorial. The first time the Stage 2 briefing hands over
// the story wallet, Voss walks you round the locker in a few short,
// hands-on steps. Each one lights up one thing (everything else dims and
// can't be tapped), points at it with a bouncing arrow, says one short line
// in a bubble with his face on it, and waits for you to actually do it:
//
//   balance  the balance counts up to the agency's money       tap
//   browse   the gear carousel                                 swipe it
//   inspect  a card                                            tap one open
//   buy      the BUY buttons you can afford light up           buy something
//   equip    (a gadget) it went straight into slot 1           tap
//   skills   the SKILLS tab                                    tap it
//   pay      alien -> van -> money, as a little animation      tap
//   deploy   DEPLOY                                            tap it
//
// SKIP TUTORIAL ends it any time. It sits over the UI rather than in it, so
// the shop redrawing itself (after a purchase, say) never wipes it, and it
// finds what it's pointing at afresh every frame.
import { LOCKER_TUTORIAL as TXT, STAGE2 } from './data/stage2.js';
import { GADGETS, GEAR } from './data/missions.js';
import { STORY } from './account.js';
import { sfx } from './audio.js';
import { inputMethod, getControlMode } from './input.js';
import { pixelText } from './data/storyArt.js';

const CPS = 55;              // the bubble's typing speed
const PAD = 6;               // breathing room round the lit-up target (px)
const COUNT_T = 1.3;         // the balance counting up

// How slot 1 is fired, for the "equipped" line.
const SLOT_WORD = { buttons: 'BUTTON 1', gestures: 'A TAP', keys: 'Q', pad: 'LB' };

function scheme() {
  const m = inputMethod();
  if (m === 'touch') return getControlMode() === 'gestures' ? 'gestures' : 'buttons';
  return m;
}

const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));

export function runLockerTutorial(ui, { onDone } = {}) {
  const assets = ui.assets;
  const q = (sel) => document.querySelector(sel);
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  };

  /* ---------- DOM ---------- */
  const root = el('div', 'coach');
  const blocks = ['t', 'l', 'r', 'b'].map(k => el('div', `coach-block ${k}`));
  const catcher = el('div', 'coach-catch hidden');
  const ring = el('div', 'coach-ring');
  const arrow = el('div', 'coach-arrow');
  const bubble = el('div', 'coach-bubble');
  const face = el('canvas', 'coach-face pixel-canvas');
  face.width = 28; face.height = 30;
  const body = el('div', 'coach-body');
  const text = el('div', 'coach-text');
  const anim = el('canvas', 'coach-anim pixel-canvas hidden');
  anim.width = 96; anim.height = 34;
  const tap = el('div', 'coach-tap hidden', TXT.tapOn);
  const skipBtn = el('button', 'coach-skip', TXT.skip);
  body.appendChild(text); body.appendChild(anim); body.appendChild(tap);
  bubble.appendChild(face); bubble.appendChild(body);
  blocks.forEach(b => root.appendChild(b));
  [catcher, ring, arrow, bubble, skipBtn].forEach(e => root.appendChild(e));
  document.body.appendChild(root);

  /* ---------- the steps ---------- */
  const cash = STORY.cash;
  const vars = { CASH: String(cash), PAY: String(STAGE2.scenes[0].payPerAlien), SLOT: SLOT_WORD[scheme()] || 'BUTTON 1' };
  let bought = null;          // id of what was bought in the buy step
  let navTapped = false;
  const onNav = (e) => { if (e.target.closest('.carousel-nav')) navTapped = true; };
  document.addEventListener('click', onNav, true);

  const cheapest = () => Math.min(...[...GEAR].map(g => g.levels[STORY.gear[g.id] || 0]).filter(Boolean).map(l => l.price));
  const tab = (label) => [...document.querySelectorAll('.view-tab')].find(b => b.textContent === label) || null;

  const STEPS = [
    {
      id: 'balance', target: () => q('.acct-cash'), line: TXT.balance, tap: true,
      enter: (s) => { s.count = 0; },
    },
    {
      id: 'browse', target: () => q('.carousel-wrap'), line: TXT.browse,
      enter: (s) => { const c = q('.carousel'); s.left = c ? c.scrollLeft : 0; navTapped = false; },
      done: (s) => { const c = q('.carousel'); return navTapped || (c && Math.abs(c.scrollLeft - s.left) > 30); },
    },
    {
      id: 'inspect', target: () => q('.carousel'), line: TXT.inspect,
      done: () => !!q('.carousel-wrap .intel-pop'),
    },
    {
      id: 'buy', target: () => q('.carousel-wrap'), line: TXT.buy,
      skip: () => STORY.cash < cheapest(),
      enter: (s) => { s.cash = STORY.cash; s.gear = { ...STORY.gear }; },
      done: (s) => {
        if (STORY.cash >= s.cash) return false;
        bought = GEAR.map(g => g.id).find(id => (STORY.gear[id] || 0) > (s.gear[id] || 0)) || null;
        return true;
      },
    },
    {
      id: 'equip', target: () => q(`.carousel-item[data-gear-id="${bought}"] .slot-row`), line: TXT.equip, tap: true,
      skip: () => !bought || !GADGETS.some(g => g.id === bought),
      enter: () => {
        const card = q(`.carousel-item[data-gear-id="${bought}"]`);
        if (card) card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      },
    },
    {
      id: 'skills', target: () => tab('SKILLS'), line: TXT.skills,
      done: () => !!q('.skills-view'),
    },
    { id: 'pay', target: () => null, line: TXT.pay, tap: true, anim: true },
    {
      id: 'deploy', target: () => q('.deploy-btn'), line: TXT.deploy,
      enter: () => { const b = q('.deploy-btn'); if (b) b.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); },
      // over when DEPLOY takes you off the locker (the frame loop sees that)
    },
  ];

  let idx = -1, step = null, st = {}, ended = false, raf = 0;
  let typed = 0, full = '', clock = 0, last = performance.now();
  let blinkT = 1.5, blinking = 0, faceFrame = null;

  function go(n) {
    idx = n;
    while (idx < STEPS.length && STEPS[idx].skip && STEPS[idx].skip()) idx++;
    if (idx >= STEPS.length) { finish(); return; }
    step = STEPS[idx];
    st = {};
    if (step.enter) step.enter(st);
    full = fill(step.line, vars);
    typed = 0;
    text.textContent = '';
    tap.classList.add('hidden');
    anim.classList.toggle('hidden', !step.anim);
    root.classList.toggle('tap-step', !!step.tap);
    st.t = 0;
    sfx.objective();
  }

  function next() {
    if (!step || !step.tap) return;
    if (typed < full.length) { typed = full.length; text.textContent = full; return; }
    if (step.id === 'balance' && st.count < 1) { st.count = 1; return; }
    sfx.click();
    go(idx + 1);
  }

  function finish() {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(raf);
    document.removeEventListener('click', onNav, true);
    window.removeEventListener('resize', place);
    root.remove();
    const scr = q('.locker-screen');
    if (scr) scr.classList.remove('coach-buy');
    const tag = q('.acct-cash');
    if (tag) tag.textContent = `${STORY.label}: $${STORY.cash}`;
    if (onDone) onDone();
  }

  // a tap on the dimmed screen: moves a "tap" step along, otherwise nudges
  // the arrow at what to do
  const onBlock = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (step && step.tap) next();
    else { arrow.classList.remove('nudge'); void arrow.offsetWidth; arrow.classList.add('nudge'); }
  };
  blocks.forEach(b => b.addEventListener('click', onBlock));
  catcher.addEventListener('click', onBlock);
  bubble.addEventListener('click', (e) => { e.stopPropagation(); if (step && step.tap) next(); });
  skipBtn.addEventListener('click', (e) => { e.stopPropagation(); sfx.click(); finish(); });

  /* ---------- layout, every frame ---------- */
  function place() {
    if (ended) return;
    const W = window.innerWidth, H = window.innerHeight;
    const tgt = step && step.target();
    const r = tgt ? tgt.getBoundingClientRect() : null;
    if (r && r.width > 0) {
      const x0 = Math.max(0, r.left - PAD), y0 = Math.max(0, r.top - PAD);
      const x1 = Math.min(W, r.right + PAD), y1 = Math.min(H, r.bottom + PAD);
      const set = (b, x, y, w, h) => { b.style.cssText = `left:${x}px;top:${y}px;width:${Math.max(0, w)}px;height:${Math.max(0, h)}px`; };
      set(blocks[0], 0, 0, W, y0);
      set(blocks[1], 0, y0, x0, y1 - y0);
      set(blocks[2], x1, y0, W - x1, y1 - y0);
      set(blocks[3], 0, y1, W, H - y1);
      ring.style.cssText = `left:${x0}px;top:${y0}px;width:${x1 - x0}px;height:${y1 - y0}px`;
      ring.classList.remove('hidden');
      catcher.style.cssText = `left:${x0}px;top:${y0}px;width:${x1 - x0}px;height:${y1 - y0}px`;
      catcher.classList.toggle('hidden', !step.tap);
      // bubble on whichever side has more room; the arrow between it and the target
      const below = (y0 + y1) / 2 < H / 2;
      const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
      const cx = Math.max(10, Math.min(W - bw - 10, (x0 + x1) / 2 - bw / 2));
      const by = below ? Math.min(H - bh - 10, y1 + 24) : Math.max(10, y0 - 24 - bh);
      bubble.style.left = `${cx}px`; bubble.style.top = `${by}px`;
      arrow.classList.remove('hidden');
      arrow.classList.toggle('up', below);
      arrow.style.left = `${Math.round((x0 + x1) / 2) - 8}px`;
      arrow.style.top = `${below ? y1 + 4 : y0 - 20}px`;
    } else {
      // nothing to point at: dim it all, bubble in the middle
      blocks[0].style.cssText = `left:0;top:0;width:${W}px;height:${H}px`;
      for (const b of blocks.slice(1)) b.style.cssText = 'width:0;height:0';
      ring.classList.add('hidden'); arrow.classList.add('hidden'); catcher.classList.add('hidden');
      bubble.style.left = `${Math.max(10, W / 2 - bubble.offsetWidth / 2)}px`;
      bubble.style.top = `${Math.max(10, H / 2 - bubble.offsetHeight / 2)}px`;
    }
  }
  window.addEventListener('resize', place);

  function drawFace(frame) {
    if (frame === faceFrame) return;
    faceFrame = frame;
    const x = face.getContext('2d');
    x.clearRect(0, 0, 28, 30);
    x.drawImage(assets.voss.portrait[frame], 0, 0);
  }

  // alien -> into the van -> "+$150" pops up over it, on a loop
  function drawPay(t) {
    const x = anim.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, anim.width, anim.height);
    const k = t % 2.6;
    x.drawImage(assets.van, 2, 3);
    const alien = assets.actors.aliens.grunt.left;
    if (k < 1.1) {
      const ax = Math.round(90 - (90 - 50) * (k / 1.1)), hop = Math.round(Math.abs(Math.sin(k * 9)) * 2);
      x.drawImage(alien, ax, 20 - hop);
    }
    if (k > 1.15 && k < 2.3) {
      const r = (k - 1.15) / 1.15;
      x.globalAlpha = r < 0.75 ? 1 : 1 - (r - 0.75) / 0.25;
      const y = Math.round(14 - r * 10);
      x.fillStyle = '#14141e'; x.fillRect(53, y - 1, 7, 7);
      x.fillStyle = '#ffd75e'; x.fillRect(54, y, 5, 5);
      x.fillStyle = '#fff2c0'; x.fillRect(55, y + 1, 1, 3);
      pixelText(x, `+$${vars.PAY}`, 62, y, '#ffd75e');
      x.globalAlpha = 1;
    }
    if (k >= 1.15 && !st.dinged) { st.dinged = true; sfx.deposit(); }
    if (k < 1.15) st.dinged = false;
  }

  function frame(now) {
    if (ended) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;
    // left the locker (DEPLOY, or anything else): the tutorial's done
    if (!q('.locker-screen')) { finish(); return; }
    st.t = (st.t || 0) + dt;

    // the line typing on, Voss's mouth going while it does
    if (typed < full.length) {
      const before = Math.floor(typed);
      typed = Math.min(full.length, typed + dt * CPS);
      const now2 = Math.floor(typed);
      if (now2 !== before) {
        text.textContent = full.slice(0, now2);
        if (now2 % 4 === 0 && /[A-Z]/.test(full[now2 - 1] || '')) sfx.voice();
      }
    }
    const talking = typed < full.length;
    blinkT -= dt;
    if (blinkT <= 0) { blinking = 0.13; blinkT = 2 + Math.random() * 2.5; }
    blinking = Math.max(0, blinking - dt);
    drawFace(blinking > 0 ? 'blink' : talking && Math.floor(clock * 9) % 2 ? 'open' : 'closed');

    // the balance counting up to what the agency put in
    if (step && step.id === 'balance') {
      const tag = q('.acct-cash');
      if (st.count < 1) {
        const prev = st.count;
        st.count = Math.min(1, st.t / COUNT_T);
        if (Math.floor(prev * 20) !== Math.floor(st.count * 20)) sfx.coin();
      }
      if (tag) tag.textContent = `${STORY.label}: $${Math.round(cash * Math.min(1, st.count))}`;
    }
    // the buy step: what you can afford pulses
    if (step && step.id === 'buy') { const scr = q('.locker-screen'); if (scr) scr.classList.add('coach-buy'); }
    else { const scr = q('.locker-screen'); if (scr) scr.classList.remove('coach-buy'); }
    if (step && step.anim) drawPay(st.t);

    const ready = !talking && (step.id !== 'balance' || st.count >= 1);
    tap.classList.toggle('hidden', !(step && step.tap && ready));
    if (step && step.done && step.done(st)) { go(idx + 1); return; }
    place();
  }

  go(0);
  place();
  raf = requestAnimationFrame(frame);
  return { finish };
}
