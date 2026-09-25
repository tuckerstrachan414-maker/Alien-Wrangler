// Hand-fired weapons ("gadgets"). One registry entry per gadget id:
//
//   fire(game, user, lv, opts) -> true if it went off
//   cooling(game, user, lv)    -> true while it can't be fired (HUD dims it)
//   decoyWants(game, d, lv, target) -> should a Decoy Agent fire it right now
//
// `user` is whoever pulls the trigger: the agent (Player) or a DecoyAgent.
// Both carry x, y, dir, a `cd` reload map, canAct and shieldT, so a decoy
// fires exactly the same weapon code the agent does.
//
// Tuning lives in data/missions.js (WEAPONS / NOISE_MAKER, index = level).
import { WEAPONS, NOISE_MAKER } from './data/missions.js';
import { collide } from './nav.js';
import { sfx } from './audio.js';

const DEG = Math.PI / 180;

// Aliens a weapon can hit: loose on the ground, not tucked in cover and not
// already under the agent's control.
export function targetable(a) {
  return a.free && a.state !== 'hiding' && !a.controlled && a.z < 16;
}

// Bend the user's aim onto the nearest alien inside reach and a cone of the
// way they're facing, so a near-miss still connects. With `lead` (projectile
// speed) it aims where a running alien will be when the shot gets there.
export function aimAssist(game, user, reach, coneDeg, filter = targetable, lead = 0) {
  const cone = Math.cos(coneDeg * DEG);
  let dir = { x: user.dir.x, y: user.dir.y }, target = null, bestD = 1e9;
  for (const a of game.aliens) {
    if (!filter(a)) continue;
    const ax = a.x - user.x, ay = a.y - user.y;
    const d = Math.hypot(ax, ay);
    if (d > reach || d < 0.001) continue;
    if ((ax * user.dir.x + ay * user.dir.y) / d < cone) continue;
    if (d < bestD) { bestD = d; target = a; dir = { x: ax / d, y: ay / d }; }
  }
  if (target && lead && target.state !== 'beaming') {
    const t = bestD / lead;
    const lx = target.x + target.vx * t - user.x, ly = target.y + target.vy * t - user.y;
    const l = Math.hypot(lx, ly);
    if (l > 0.001) dir = { x: lx / l, y: ly / l };
  }
  return { dir, target };
}

// Maple Street: how loud using a weapon is (0 = silent).
function loud(game, user, amount) {
  if (game.stealth && amount) game.noisePulse(user.x, user.y, amount);
}

const ready = (user, id) => !((user.cd[id] || 0) > 0) && user.canAct;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function burst(game, x, y, colors, n = 8, sp = 40, life = 0.45) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = sp * (0.5 + Math.random() * 0.7);
    game.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - 6,
      life, t: life, color: colors[i % colors.length], size: 1,
    });
  }
}

/* ============================== NET GUN ============================== */

function fireNet(game, user, lv) {
  const T = WEAPONS.netgun[lv];
  if (!T || !ready(user, 'netgun')) return false;
  user.cd.netgun = T.cd;
  sfx.net();
  const { dir } = aimAssist(game, user, 130, 22, a => a.grabbable && a.z < 16, 210);
  game.juice.muzzle(user, '#ffd75e', 5, dir);
  const base = Math.atan2(dir.y, dir.x);
  // Mk.III scatter net: three nets fanned out around the aim
  for (const off of T.nets > 1 ? [-15, 0, 15] : [0]) {
    const ang = base + off * DEG;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    game.projectiles.push({
      type: 'net', x: user.x + dx * 8, y: user.y - 4 + dy * 8,
      vx: dx * 210, vy: dy * 210, life: 0.65, pin: T.pin,
    });
  }
  return true;
}

/* ============================ NOISE MAKER ============================ */

// A deafening bang centred on the user. Anything hiding inside stunR is
// knocked out of cover and stunned; loose aliens there lose their cloak
// (Mk.III Sonic Boom stuns them too); hidden aliens out to pingR get marked.
function detonateNoise(game, user, lv) {
  const nm = NOISE_MAKER[lv];
  if (!nm || (user.cd.noisemaker || 0) > 0 || user.state === 'stunned' || user.state === 'prone') return false;
  user.cd.noisemaker = nm.cd;
  sfx.bang();
  const agent = !user.isDecoy;
  game.shake = agent ? 8 : 4;
  if (agent) game.juice.flash('#fff6e0', 0.55, 0.28);
  game.juice.noiseBlast(user, nm, agent);
  game.shockwaves.push({ x: user.x, y: user.y, r: 4, max: nm.stunR, t: 0.45, life: 0.45, col: '#ffffff' });
  game.shockwaves.push({ x: user.x, y: user.y, r: 4, max: nm.pingR, t: 0.8, life: 0.8, col: '#41f0d8' });
  burst(game, user.x, user.y - 4, ['#fff6c8', '#ffd75e'], 16, 80);
  game.popup(user.x, user.y - 26, nm.loose ? 'BOOM!' : 'BANG!', '#fff6c8');

  let stunned = 0, pinged = 0, revealed = 0;
  for (const a of game.aliens) {
    const d = dist(a, user);
    if (d <= nm.stunR) {
      if (a.state === 'beaming' && a.riseZ < 26) {
        // blasted out of the tractor beam: it drops back to the ground
        a.riseZ = 0;
        a.state = 'running';
        if (game.ufo && game.ufo.target === a) game.ufo.state = 'pick';
      }
      if (!a.free || a.controlled) continue;
      const wasHiding = a.state === 'hiding';
      if (wasHiding) {
        // blown out of cover: pop it a step toward the user so the
        // foliage/container isn't still hiding it
        a.flush(game);
        const len = d || 1;
        const pos = collide(game.map, a.x + (user.x - a.x) / len * 12, a.y + (user.y - a.y) / len * 12, a.r, false);
        a.x = pos.x; a.y = pos.y;
        a.zv = 100; a.z = 0.1;
      }
      a.revealT = nm.pingT;
      a.cloaked = false;
      if (a.state === 'netted') {
        a.stateT = Math.max(a.stateT, nm.stunT);
      } else if (wasHiding || (nm.loose && a.state !== 'stunned')) {
        a.stunned(nm.stunT);
        game.popup(a.x, a.y - 16, 'STUNNED!', '#fff6c8');
        stunned++;
      } else {
        game.popup(a.x, a.y - 16, 'REVEALED!', '#41f0d8');
        revealed++;
      }
    } else if (d <= nm.pingR && a.free) {
      a.revealT = nm.pingT;
      if (a.state === 'hiding') pinged++;
    }
  }
  if (agent && stunned + pinged + revealed === 0) game.popup(user.x, user.y - 34, 'NOTHING NEARBY', '#8fa0c4');

  // On Maple Street a bang is the loudest thing you can possibly do.
  loud(game, user, 70);
  return true;
}

/* ============================== STUN GUN ============================== */

// The stun gun can also tase an alien hiding in cover (you saw the bush
// rustle): it's knocked out into the open, stunned.
const zappable = (a) => targetable(a) || (a.state === 'hiding' && a.z < 16);

function shock(game, a, T, k, user) {
  a.cloaked = false;
  if (a.state === 'hiding') {
    a.flush(game);
    const d = dist(a, user) || 1;
    const pos = collide(game.map, a.x + (user.x - a.x) / d * 12, a.y + (user.y - a.y) / d * 12, a.r, false);
    a.x = pos.x; a.y = pos.y;
  }
  if (k === 1) {
    if (a.state === 'netted') a.stateT = Math.max(a.stateT, T.stun);
    else a.stunned(T.stun, 'zap');
    game.popup(a.x, a.y - 16, 'ZAPPED!', '#9fe8ff');
  } else {
    // Mk.III: the arc comes back round for a second hit
    a.stateT += T.stun * 0.6;
    if (a.helmet) {
      a.helmet = false;
      game.puff(a.x, a.y, '#9aa7b5');
      game.juice.helmetOff(a, user);
      game.popup(a.x, a.y - 22, 'ARMOR FRIED!', '#9fc7e8');
    } else {
      game.popup(a.x, a.y - 22, 'DOUBLE ZAP!', '#e8fbff');
    }
  }
  burst(game, a.x, a.y - 6, ['#9fe8ff', '#ffffff'], 6, 50, 0.3);
  game.juice.zapHit(a, k > 1);
}

function fireZap(game, user, lv) {
  const T = WEAPONS.stungun[lv];
  if (!T || !ready(user, 'stungun')) return false;
  user.cd.stungun = T.cd;
  sfx.zap();
  loud(game, user, 8);
  const ox = user.x + user.dir.x * 6, oy = user.y - 6 + user.dir.y * 6;
  const { dir, target } = aimAssist(game, user, T.range, 26, zappable);
  if (!target) {
    // nothing in reach: the prongs fizzle out halfway, and a miss only
    // takes a quick re-arm, not the full reload
    user.cd.stungun = Math.min(user.cd.stungun, 1);
    const end = { x: ox + dir.x * T.range * 0.5, y: oy + dir.y * T.range * 0.5 };
    game.zaps.push({ pts: [{ x: ox, y: oy }, end], t: 0.2, life: 0.2 });
    game.juice.muzzle(user, '#9fe8ff', 3, dir);
    game.juice.zapFizzle(end);
    return true;
  }
  game.juice.muzzle(user, '#9fe8ff', 5, dir);
  if (!user.isDecoy) game.juice.flash('#9fe8ff', 0.1, 0.08);
  // Chain: from each struck alien, jump to the nearest fresh one in reach.
  const seq = [target];
  while (seq.length < 1 + T.chain) {
    const last = seq[seq.length - 1];
    let next = null, best = T.chainR;
    for (const a of game.aliens) {
      if (seq.includes(a) || !zappable(a)) continue;
      const d = dist(a, last);
      if (d <= best) { best = d; next = a; }
    }
    if (!next) break;
    seq.push(next);
  }
  // Mk.III: the arc doubles back along the same path, so every one is hit twice
  const order = T.hits > 1 ? [...seq, ...seq.slice().reverse()] : seq;
  const hits = new Map();
  const pts = [{ x: ox, y: oy }];
  for (const a of order) {
    const k = (hits.get(a) || 0) + 1;
    hits.set(a, k);
    pts.push({ x: a.x + (k > 1 ? 2 : 0), y: a.y - 6 });
    shock(game, a, T, k, user);
  }
  game.zaps.push({ pts, t: 0.3, life: 0.3 });
  return true;
}

/* ============================= TRANQ DART ============================= */

function fireDart(game, user, lv) {
  const T = WEAPONS.dart[lv];
  if (!T || !ready(user, 'dart')) return false;
  user.cd.dart = T.cd;
  sfx.dart();                                  // silent on the noise meter
  const sp = 340;
  const { dir } = aimAssist(game, user, T.range, 18, targetable, sp);
  game.juice.muzzle(user, '#e8dcff', 2, dir);
  game.projectiles.push({
    type: 'dart', x: user.x + dir.x * 8, y: user.y - 4 + dir.y * 8,
    vx: dir.x * sp, vy: dir.y * sp, life: T.range / sp, lv,
  });
  return true;
}

function dartHit(game, pr) {
  const T = WEAPONS.dart[pr.lv];
  for (const a of game.aliens) {
    if (!targetable(a) || a.drowsyT > 0) continue;
    if (Math.hypot(a.x - pr.x, a.y - 4 - pr.y) >= 8) continue;
    pr.life = 0;
    if (a.helmet && !T.pierce) {
      sfx.block();
      game.popup(a.x, a.y - 16, 'PLINK!', '#9aa7b5');
      game.juice.dartPlink(a, pr);
      return;
    }
    game.juice.dartHit(a);
    a.drowsyT = T.drowsy;
    a.sleepFor = T.sleep;
    a.snoreR = T.snore;
    game.popup(a.x, a.y - 16, 'TRANQ!', '#c9a8ff');
    return;
  }
}

// Mk.III: a sleeper snores out a cloud that knocks out everyone near it.
export function snoreCloud(game, src, r, dur) {
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2, s = 10 + Math.random() * 18;
    game.particles.push({
      x: src.x, y: src.y - 8, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - 4,
      grav: -4, life: 1.1, t: 1.1, color: i % 2 ? '#c9a8ff' : '#e8dcff', size: 2,
    });
  }
  game.shockwaves.push({ x: src.x, y: src.y, r: 4, max: r, t: 0.6, life: 0.6, col: '#c9a8ff' });
  for (const a of game.aliens) {
    if (a === src || !targetable(a) || dist(a, src) > r) continue;
    if (a.state === 'stunned' && a.look === 'zzz') continue;
    if (a.state === 'netted') a.stateT = Math.max(a.stateT, dur);
    else a.stunned(dur, 'zzz');
    game.popup(a.x, a.y - 16, 'ZZZ...', '#c9a8ff');
  }
}

/* ============================= BAIT BURGER ============================= */

function fireBait(game, user, lv, opts = {}) {
  const T = WEAPONS.bait[lv];
  if (!T || !ready(user, 'bait')) return false;
  user.cd.bait = T.cd;
  sfx.toss();
  game.juice.squash(user, 0.85, 1.15);
  const tx = opts.at ? opts.at.x : user.x + user.dir.x * 70;
  const ty = opts.at ? opts.at.y : user.y + user.dir.y * 70;
  game.projectiles.push({
    type: 'lob', kind: 'bait', lv, owner: user,
    sx: user.x, sy: user.y, tx, ty, x: user.x, y: user.y, vx: 0, vy: 0, h: 0,
    t: 0, dur: 0.45, arc: 26, life: 9,
  });
  return true;
}

function landBait(game, pr) {
  const pos = collide(game.map, pr.tx, pr.ty, 5, false);
  const T = WEAPONS.bait[pr.lv];
  game.deployables.push({ kind: 'bait', x: pos.x, y: pos.y, t: T.t, life: T.t, T, owner: pr.owner });
  game.puff(pos.x, pos.y, '#e0a050');
  game.juice.baitLand(pos.x, pos.y);
}

function updateBait(game, b, dt) {
  b.t -= dt;
  if (b.t <= 0) {
    b.dead = true;
    for (const a of game.aliens) {
      if (a.bait !== b) continue;
      a.bait = null;
      if (a.state !== 'lured') continue;
      if (b.T.coma && a.eatT > 0.8) {
        a.stunned(b.T.coma, 'zzz');
        game.popup(a.x, a.y - 16, 'FOOD COMA', '#ffb35e');
      } else {
        a.state = 'running'; a.chase = 0; a.repathT = 0;
      }
    }
    return;
  }
  for (const a of game.aliens) {
    if (a.bait) continue;
    const ok = a.state === 'hiding' || a.state === 'running' || (b.T.attackers && a.state === 'attack');
    if (!ok || dist(a, b) > b.T.lure) continue;
    a.lure(b);
    game.popup(a.x, a.y - 16, a.state === 'attack' ? 'FOOD?!' : 'FOOD?', '#ffb35e');
  }
}

/* ============================== TRAP CAGE ============================== */

function fireCage(game, user, lv, opts = {}) {
  const T = WEAPONS.cage[lv];
  if (!T || !ready(user, 'cage')) return false;
  const x = opts.at ? opts.at.x : user.x + user.dir.x * 12;
  const y = opts.at ? opts.at.y : user.y + user.dir.y * 12;
  const pos = collide(game.map, x, y, 6, false);
  // too many out: the oldest folds away (an empty one if there is one)
  const mine = game.deployables.filter(d => d.kind === 'cage' && !d.dead && d.owner === user);
  if (mine.length >= T.max) {
    const old = mine.find(c => !c.held) || mine[0];
    old.dead = true;
    if (old.held && old.held.cage === old) {
      old.held.cage = null;
      old.held.state = 'running';
      old.held.chase = -2;
    }
  }
  user.cd.cage = T.cd;
  sfx.cage();
  game.deployables.push({ kind: 'cage', x: pos.x, y: pos.y, armT: 0.6, held: null, T, owner: user, courierT: 0 });
  game.popup(pos.x, pos.y - 14, 'CAGE SET', '#ffb35e');
  game.juice.cageSet(pos.x, pos.y);
  return true;
}

function updateCage(game, c, dt) {
  if (c.armT > 0) c.armT -= dt;
  if (!c.held) {
    if (c.armT > 0) return;
    for (const a of game.aliens) {
      if (!['running', 'attack', 'lured', 'stunned'].includes(a.state)) continue;
      if (dist(a, c) > 8 + a.r) continue;
      c.held = a;
      a.state = 'netted';
      a.stateT = c.T.hold;
      a.cage = c;
      a.bait = null;
      a.x = c.x; a.y = c.y; a.vx = 0; a.vy = 0;
      a.cloaked = false;
      sfx.cage();
      game.popup(a.x, a.y - 18, 'CAGED!', '#ffb35e');
      game.juice.cageSnap(c, a);
      return;
    }
    return;
  }
  const a = c.held;
  if (a.state !== 'netted' || a.cage !== c) { c.dead = true; return; }   // grabbed or broke out
  a.x = c.x; a.y = c.y;
  if (!c.T.courier) return;
  // Mk.III: a courier drone comes and flies the whole cage to the van
  c.courierT += dt;
  if (c.courierT >= c.T.courier) {
    c.dead = true;
    a.cage = null;
    a.state = 'airlift';
    a.riseZ = 0;
    game.deployables.push({ kind: 'courier', a, x: c.x, y: c.y, lift: 0 });
    sfx.evac();
    game.popup(a.x, a.y - 18, 'AIRLIFT!', '#59d98c');
    game.juice.courierLift(c.x, c.y);
  }
}

function updateCourier(game, d, dt) {
  const a = d.a;
  d.lift = Math.min(18, d.lift + dt * 30);
  const v = game.vanDoor;
  const dx = v.x - d.x, dy = v.y - d.y, len = Math.hypot(dx, dy);
  if (d.lift >= 18) {
    const sp = 150 * dt;
    if (len <= sp) {
      d.dead = true;
      a.riseZ = 0;
      game.secureAlien(a);
      sfx.deposit();
      game.popup(v.x, v.y - 24, '+1 AIRLIFTED', '#59d98c');
      game.puff(v.x, v.y - 8, '#59d98c');
      game.juice.secured(v.x, v.y, 1);
      return;
    }
    d.x += dx / len * sp; d.y += dy / len * sp;
  } else if (Math.random() < 0.5) {
    // rotor wash kicking up dust as it lifts off
    game.juice.dust(d.x, d.y, 1, 30, { life: 0.6 });
  }
  a.x = d.x; a.y = d.y; a.riseZ = d.lift;
}

/* ============================= GRAPPLE HOOK ============================= */

const hookable = (T) => (a) =>
  (targetable(a)) || (a.state === 'beaming' && a.riseZ < T.beamZ);

function fireHook(game, user, lv) {
  const T = WEAPONS.hook[lv];
  if (!T || !ready(user, 'hook')) return false;
  user.cd.hook = T.cd;
  sfx.hook();
  loud(game, user, 6);
  const sp = 380;
  const { dir } = aimAssist(game, user, T.range, 20, hookable(T), sp);
  game.juice.muzzle(user, '#d7dfea', 3, dir);
  game.projectiles.push({
    type: 'hook', x: user.x + dir.x * 6, y: user.y - 4 + dir.y * 6,
    vx: dir.x * sp, vy: dir.y * sp, life: T.range / sp, lv, owner: user, hits: [],
  });
  return true;
}

function reel(game, a, owner) {
  if (a.state === 'beaming') {
    a.riseZ = 0;
    if (game.ufo && game.ufo.target === a) game.ufo.state = 'pick';
    game.popup(a.x, a.y - 20, 'SNATCHED!', '#59d98c');
    game.juice.snatched(a);
  }
  game.juice.hookHit(a);
  a.cage = null;
  a.bait = null;
  a.state = 'reeled';
  a.reelTo = owner;
  a.reelT = 1.2;
  a.vx = 0; a.vy = 0;
  a.cloaked = false;
  sfx.reel();
}

function hookHit(game, pr) {
  const T = WEAPONS.hook[pr.lv];
  const can = hookable(T);
  for (const a of game.aliens) {
    if (pr.hits.includes(a) || !can(a)) continue;
    if (Math.hypot(a.x - pr.x, a.y - 4 - pr.y) >= 12) continue;
    reel(game, a, pr.owner);
    pr.hits.push(a);
    // Mk.III chain hook: the line carries on to a second alien
    if (T.chain && pr.hits.length < 2) {
      let next = null, best = 1e9;
      for (const b of game.aliens) {
        if (pr.hits.includes(b) || !can(b)) continue;
        const d = dist(a, b);
        if (d < T.chain && d < best) { best = d; next = b; }
      }
      if (next) {
        const dx = next.x - pr.x, dy = next.y - 4 - pr.y, d = Math.hypot(dx, dy) || 1;
        pr.vx = dx / d * 380; pr.vy = dy / d * 380;
        pr.life = d / 380 + 0.08;
        return;
      }
    }
    pr.life = 0;
    return;
  }
}

// The hook hit a wall: zip the agent there (a decoy never carries a hook).
function hookWall(game, pr, at) {
  if (pr.hits.length || pr.owner !== game.player) return;
  const d = Math.hypot(pr.vx, pr.vy) || 1;
  if (game.player.zipTo(at.x - pr.vx / d * 7, at.y + 4 - pr.vy / d * 7)) {
    sfx.reel();
    game.popup(game.player.x, game.player.y - 20, 'ZIP!', '#d7dfea');
    game.juice.zip(game.player);
  }
}

/* ============================= DECOY AGENT ============================= */

function fireDecoy(game, user, lv) {
  const T = WEAPONS.decoy[lv];
  if (!T || user.isDecoy || !ready(user, 'decoy')) return false;
  user.cd.decoy = T.cd;
  sfx.inflate();
  loud(game, user, 10);
  game.spawnDecoys(lv);
  return true;
}

/* ============================= RIOT SHIELD ============================= */

function fireShield(game, user, lv) {
  const T = WEAPONS.shield[lv];
  if (!T || (user.cd.shield || 0) > 0 || user.state === 'stunned' || user.state === 'prone') return false;
  user.cd.shield = T.cd;
  user.shieldT = T.t;
  user.shieldLv = lv;
  sfx.shield();
  game.popup(user.x, user.y - 24, 'SHIELD UP', '#7fe3ff');
  game.juice.shieldUp(user);
  return true;
}

// Mk.III: while the bubble is up, anything you run into gets bowled over.
function shieldBash(game, user) {
  if (!(user.shieldT > 0) || !WEAPONS.shield[user.shieldLv].bash) return;
  for (const a of game.aliens) {
    if (!targetable(a) || a.state === 'stunned' || a.state === 'netted') continue;
    const d = dist(a, user);
    if (d > user.r + a.r + 6) continue;
    a.stunned(1.5);
    const len = d || 1;
    const pos = collide(game.map, a.x + (a.x - user.x) / len * 10, a.y + (a.y - user.y) / len * 10, a.r, true);
    a.x = pos.x; a.y = pos.y;
    a.zv = 90; a.z = 0.1;
    sfx.thud();
    game.shake = Math.max(game.shake, 3);
    game.popup(a.x, a.y - 16, 'BASH!', '#7fe3ff');
    game.juice.shieldBash(a, user);
  }
}

/* ============================= CRYO SPRAYER ============================= */

function freeze(game, a, T) {
  a.cloaked = false;
  if (a.state === 'netted') a.stateT = Math.max(a.stateT, T.t);
  else a.stunned(T.t, 'ice');
  if (T.shatter && a.helmet) {
    a.helmet = false;
    game.puff(a.x, a.y, '#bfefff');
    game.juice.iceShatter(a);
    game.popup(a.x, a.y - 16, 'SHATTER!', '#bfefff');
  } else {
    game.popup(a.x, a.y - 16, 'FROZEN!', '#bfefff');
  }
}

function fireCryo(game, user, lv) {
  const T = WEAPONS.cryo[lv];
  if (!T || !ready(user, 'cryo')) return false;
  user.cd.cryo = T.cd;
  sfx.cryo();
  loud(game, user, 8);
  let froze = 0;
  // a spray that catches nobody only takes a quick re-arm
  const refund = () => { if (!froze) user.cd.cryo = Math.min(user.cd.cryo, 1.5); };
  if (T.nova) {
    // Mk.III blizzard: a freezing ring all the way round
    game.shockwaves.push({ x: user.x, y: user.y, r: 4, max: T.range, t: 0.5, life: 0.5, col: '#bfefff' });
    burst(game, user.x, user.y - 4, ['#bfefff', '#ffffff', '#7fd0ff'], 26, T.range * 1.4, 0.55);
    game.juice.cryoNova(user, T);
    for (const a of game.aliens) if (targetable(a) && dist(a, user) <= T.range) { freeze(game, a, T); froze++; }
    refund();
    return true;
  }
  const { dir } = aimAssist(game, user, T.range, 40);
  const cone = Math.cos(T.cone * DEG);
  const base = Math.atan2(dir.y, dir.x);
  game.juice.cryoSpray(user, dir, T);
  for (let i = 0; i < 22; i++) {
    const ang = base + (Math.random() - 0.5) * 2 * T.cone * DEG;
    const s = T.range * (1.2 + Math.random() * 0.6);
    game.particles.push({
      x: user.x + dir.x * 6, y: user.y - 5 + dir.y * 6,
      vx: Math.cos(ang) * s, vy: Math.sin(ang) * s, grav: 0,
      life: 0.5, t: 0.5, color: i % 3 ? '#bfefff' : '#ffffff', size: i % 4 ? 1 : 2,
    });
  }
  for (const a of game.aliens) {
    if (!targetable(a)) continue;
    const ax = a.x - user.x, ay = a.y - user.y, d = Math.hypot(ax, ay);
    if (d > T.range) continue;
    if (d > 10 && (ax * dir.x + ay * dir.y) / d < cone) continue;
    freeze(game, a, T);
    froze++;
  }
  refund();
  return true;
}

/* ============================== HYPNO RAY ============================== */

function hypnotize(game, a, T) {
  a.cage = null;
  a.bait = null;
  a.cloaked = false;
  a.drowsyT = 0;
  a.state = 'hypno';
  a.hypnoT = T.walk ? 40 : T.t;
  a.hypnoWalk = T.walk;
  a.hypnoIdx = game.hypnoSeq++;
  a.vx = 0; a.vy = 0;
  a.seekT = 0;
  game.popup(a.x, a.y - 16, T.walk ? 'SLEEPWALKING' : 'HYPNOTIZED', '#e08bff');
}

function fireHypno(game, user, lv) {
  const T = WEAPONS.hypno[lv];
  if (!T || !ready(user, 'hypno')) return false;
  user.cd.hypno = T.cd;
  sfx.hypno();
  const { dir } = aimAssist(game, user, T.range, T.cone + 10);
  const cone = Math.cos(T.cone * DEG);
  const picks = game.aliens
    .filter(a => {
      if (!targetable(a)) return false;
      const ax = a.x - user.x, ay = a.y - user.y, d = Math.hypot(ax, ay);
      return d <= T.range && (d < 12 || (ax * dir.x + ay * dir.y) / d >= cone);
    })
    .sort((a, b) => dist(a, user) - dist(b, user))
    .slice(0, T.max);
  const from = { x: user.x + dir.x * 6, y: user.y - 6 + dir.y * 6 };
  game.juice.muzzle(user, '#e08bff', 4, dir);
  if (!picks.length) {
    game.zaps.push({ pts: [from, { x: from.x + dir.x * T.range * 0.6, y: from.y + dir.y * T.range * 0.6 }], t: 0.3, life: 0.3, style: 'hypno' });
    return true;
  }
  for (const a of picks) {
    hypnotize(game, a, T);
    game.zaps.push({ pts: [from, { x: a.x, y: a.y - 6 }], t: 0.4, life: 0.4, style: 'hypno' });
  }
  return true;
}

/* ============================= EVAC BEACON ============================= */

function evacList(game, T) {
  const p = game.player;
  const list = [...p.carried];
  if (T.mass) {
    for (const a of game.aliens) {
      if ((a.state === 'stunned' || a.state === 'netted') && dist(a, p) <= T.mass) list.push(a);
    }
  }
  return list;
}

function fireEvac(game, user, lv) {
  const T = WEAPONS.evac[lv];
  if (!T || user.isDecoy || (user.cd.evac || 0) > 0 || user.state === 'stunned' || user.state === 'prone') return false;
  const list = evacList(game, T);
  if (!list.length) {
    if (game.time - (game.evacNagT || -9) > 1.2) {
      game.evacNagT = game.time;
      game.popup(user.x, user.y - 24, 'NOTHING TO EVAC', '#8fa0c4');
    }
    return false;
  }
  user.cd.evac = T.cd;
  sfx.evac();
  loud(game, user, 16);
  const p = game.player;
  for (const a of list) {
    const carried = p.carried.includes(a);
    const x = carried ? p.x : a.x, y = carried ? p.y : a.y;
    game.deployables.push({ kind: 'beam', x, y, t: 0.7, life: 0.7 });
    game.juice.evac(x, y);
    game.secureAlien(a);
  }
  p.carried.length = 0;
  const v = game.vanDoor;
  game.deployables.push({ kind: 'beam', x: v.x, y: v.y, t: 0.9, life: 0.9 });
  game.juice.evac(v.x, v.y);
  game.juice.secured(v.x, v.y, list.length);
  game.juice.flash('#8cffbe', 0.2, 0.2);
  game.popup(p.x, p.y - 26, `+${list.length} EVAC'D`, '#59d98c');
  game.popup(v.x, v.y - 24, `+${list.length} SECURED`, '#59d98c');
  sfx.cash();
  return true;
}

/* ============================== REGISTRY ============================== */

const cdCooling = (id) => (game, user) => (user.cd[id] || 0) > 0;
const loose = (t) => t && targetable(t) && t.state !== 'stunned' && t.state !== 'netted';

export const REGISTRY = {
  netgun: {
    fire: fireNet, cooling: cdCooling('netgun'),
    decoyWants: (game, d, lv, t) => loose(t) && dist(t, d) < 110,
  },
  noisemaker: {
    fire: detonateNoise, cooling: cdCooling('noisemaker'),
    decoyWants: (game, d, lv) => {
      const nm = NOISE_MAKER[lv];
      return game.aliens.some(a => (a.state === 'hiding' && dist(a, d) < nm.stunR * 0.9) ||
        (nm.loose && loose(a) && dist(a, d) < nm.stunR * 0.6));
    },
  },
  stungun: {
    fire: fireZap, cooling: cdCooling('stungun'),
    decoyWants: (game, d, lv, t) => loose(t) && dist(t, d) < WEAPONS.stungun[lv].range * 0.9,
  },
  dart: {
    fire: fireDart, cooling: cdCooling('dart'),
    decoyWants: (game, d, lv, t) => loose(t) && !(t.drowsyT > 0) && dist(t, d) < 200 &&
      (WEAPONS.dart[lv].pierce || !t.helmet),
  },
  bait: {
    fire: fireBait, cooling: cdCooling('bait'),
    decoyWants: (game, d, lv, t) => loose(t) && t.state !== 'lured' && dist(t, d) < 150 &&
      !game.deployables.some(b => b.kind === 'bait' && !b.dead && b.owner === d),
  },
  cage: {
    fire: fireCage, cooling: cdCooling('cage'),
    decoyWants: (game, d, lv, t) => loose(t) && t.state === 'running' && dist(t, d) < 70,
  },
  hook: { fire: fireHook, cooling: cdCooling('hook') },
  decoy: { fire: fireDecoy, cooling: cdCooling('decoy') },
  shield: {
    fire: fireShield, cooling: cdCooling('shield'),
    decoyWants: (game, d) => !(d.shieldT > 0) &&
      game.aliens.some(a => a.state === 'attack' && dist(a, d) < 100),
  },
  cryo: {
    fire: fireCryo, cooling: cdCooling('cryo'),
    decoyWants: (game, d, lv, t) => loose(t) && dist(t, d) < WEAPONS.cryo[lv].range * 0.8,
  },
  hypno: {
    fire: fireHypno, cooling: cdCooling('hypno'),
    decoyWants: (game, d, lv, t) => loose(t) && dist(t, d) < WEAPONS.hypno[lv].range * 0.9,
  },
  evac: {
    fire: fireEvac,
    cooling: (game, user, lv) => (user.cd.evac || 0) > 0 || !evacList(game, WEAPONS.evac[lv]).length,
  },
};

export function fireWeapon(game, user, id, lv, opts) {
  const w = REGISTRY[id];
  return !!(w && lv > 0 && w.fire(game, user, lv, opts));
}

export function weaponCooling(game, user, id, lv) {
  const w = REGISTRY[id];
  return !!(w && lv > 0 && w.cooling(game, user, lv));
}

/* ============================ WORLD UPDATE ============================ */

// Projectiles owned by this module. Returns true if it handled `pr`.
export function updateProjectile(game, pr, dt) {
  if (pr.type === 'lob') {
    pr.t += dt;
    const k = Math.min(1, pr.t / pr.dur);
    pr.x = pr.sx + (pr.tx - pr.sx) * k;
    pr.y = pr.sy + (pr.ty - pr.sy) * k;
    pr.h = Math.sin(k * Math.PI) * pr.arc;
    if (k >= 1) {
      pr.life = 0;
      if (pr.kind === 'bait') landBait(game, pr);
    }
    return true;
  }
  if (pr.type === 'dart') dartHit(game, pr);
  else if (pr.type === 'hook') hookHit(game, pr);
  else if (pr.type === 'rbolt') {
    for (const a of game.aliens) {
      if (!targetable(a) || Math.hypot(a.x - pr.x, a.y - 4 - pr.y) >= 8) continue;
      a.stunned(2);
      game.popup(a.x, a.y - 16, 'REFLECTED!', '#7fe3ff');
      game.juice.zapHit(a, false);
      pr.life = 0;
      break;
    }
  } else return false;
  return false;   // still let the caller run the wall check
}

// A projectile flew into a wall.
export function projectileWall(game, pr, at) {
  if (pr.type === 'hook') hookWall(game, pr, at);
}

export function updateWeapons(game, dt) {
  for (const d of game.deployables) {
    if (d.dead) continue;
    if (d.kind === 'bait') updateBait(game, d, dt);
    else if (d.kind === 'cage') updateCage(game, d, dt);
    else if (d.kind === 'courier') updateCourier(game, d, dt);
    else if (d.kind === 'beam') { d.t -= dt; if (d.t <= 0) d.dead = true; }
  }
  game.deployables = game.deployables.filter(d => !d.dead);

  // hypno conga line: each follower trails the one in front of it
  let lead = game.player;
  const line = game.aliens.filter(a => a.state === 'hypno' && !a.hypnoWalk).sort((a, b) => a.hypnoIdx - b.hypnoIdx);
  for (const a of line) { a.hypnoLead = lead; lead = a; }

  shieldBash(game, game.player);
  for (const d of game.decoys) shieldBash(game, d);

  for (const z of game.zaps) z.t -= dt;
  game.zaps = game.zaps.filter(z => z.t > 0);
}

/* =============================== RENDER =============================== */

function px(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }

function drawBurger(ctx, x, y, scale = 1) {
  const s = scale;
  px(ctx, x - 4 * s, y - 6 * s, 8 * s, 2 * s, '#d98b3a');   // top bun
  px(ctx, x - 3 * s, y - 7 * s, 6 * s, 1 * s, '#e8a54e');
  px(ctx, x - 4 * s, y - 4 * s, 8 * s, 1 * s, '#59b84a');   // lettuce
  px(ctx, x - 4 * s, y - 3 * s, 8 * s, 1 * s, '#6b3a22');   // patty
  px(ctx, x - 4 * s, y - 2 * s, 8 * s, 2 * s, '#c7782f');   // bottom bun
  px(ctx, x - 2 * s, y - 7 * s, 1, 1, '#fff2c8');           // sesame
  px(ctx, x + 1 * s, y - 6 * s, 1, 1, '#fff2c8');
}

// Ground-level stuff, drawn under everything that moves.
export function renderGround(game, ctx, camX, camY) {
  for (const d of game.deployables) {
    if (d.kind === 'bait') {
      const x = d.x - camX, y = d.y - camY;
      // lure radius, faint while it lasts
      ctx.globalAlpha = 0.12 + 0.06 * Math.sin(game.time * 4);
      ctx.strokeStyle = '#ffb35e';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(Math.round(x), Math.round(y), d.T.lure, d.T.lure * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = d.t < 2 ? 0.5 + 0.5 * Math.sin(game.time * 14) : 1;
      drawBurger(ctx, x, y + 1);
      // steam
      if (Math.floor(game.time * 3) % 2) px(ctx, x - 1, y - 10, 1, 2, '#ffffff');
      else px(ctx, x + 1, y - 11, 1, 2, '#ffffff');
      ctx.globalAlpha = 1;
    } else if (d.kind === 'beam') {
      const k = d.t / d.life;
      const x = Math.round(d.x - camX), y = Math.round(d.y - camY);
      const grad = ctx.createLinearGradient(0, y - 90, 0, y);
      grad.addColorStop(0, 'rgba(89, 217, 140, 0)');
      grad.addColorStop(1, `rgba(140, 255, 190, ${0.6 * k})`);
      ctx.fillStyle = grad;
      const w = 6 + 10 * k;
      ctx.fillRect(x - w / 2, y - 90, w, 92);
      ctx.globalAlpha = k;
      ctx.strokeStyle = '#8cffbe';
      ctx.beginPath();
      ctx.ellipse(x, y, w, w * 0.4, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

// A cage stands up in the world, so it's y-sorted with the actors (drawn just
// after the alien standing in it, so the bars sit in front).
export function drawCage(game, ctx, c, camX, camY) {
  const x = Math.round(c.x - camX), y = Math.round(c.y - camY);
  const armed = c.armT <= 0;
  const col = c.held ? '#ffb35e' : armed ? '#c9b48a' : '#6f6552';
  if (!c.held) {
    // open cage: floor plate + folded-back lid, pulses when armed
    ctx.globalAlpha = armed ? 0.75 + 0.25 * Math.sin(game.time * 6) : 0.6;
    px(ctx, x - 7, y - 1, 14, 2, '#3a3326');
    px(ctx, x - 7, y - 2, 14, 1, col);
    for (let i = -6; i <= 6; i += 3) px(ctx, x + i, y - 5, 1, 3, col);
    px(ctx, x - 7, y - 6, 14, 1, col);
    ctx.globalAlpha = 1;
    return;
  }
  // shut cage around the alien
  px(ctx, x - 7, y - 16, 14, 1, col);
  px(ctx, x - 7, y, 14, 1, col);
  for (let i = -7; i <= 7; i += 3) px(ctx, x + i, y - 15, 1, 15, col);
  // hold timer
  const k = Math.max(0, Math.min(1, c.held.stateT / c.T.hold));
  px(ctx, x - 7, y + 2, 14, 2, '#0d0f1a');
  px(ctx, x - 7, y + 2, Math.round(14 * k), 2, '#ffb35e');
}

// Grapple line: alternating light / dark links, crawling when reeling in.
function chain(ctx, x0, y0, x1, y1, crawl = 0) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.round(d / 2));
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    px(ctx, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, 1, 1, (i + Math.floor(crawl)) % 3 ? '#9aa7b5' : '#e8f0ff');
  }
}

function jagged(ctx, pts, amp, col, w) {
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.beginPath();
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const segs = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 7));
    if (i === 0) ctx.moveTo(a.x, a.y);
    for (let s = 1; s <= segs; s++) {
      const k = s / segs;
      const j = s === segs ? 0 : (Math.random() - 0.5) * amp;
      ctx.lineTo(a.x + (b.x - a.x) * k + j, a.y + (b.y - a.y) * k + j);
    }
  }
  ctx.stroke();
}

// Everything that flies: zaps, beams, hook lines, darts, reflected bolts,
// lobbed burgers and courier drones.
export function renderTop(game, ctx, camX, camY) {
  // reel lines: agent -> aliens being pulled in
  for (const a of game.aliens) {
    if (a.state !== 'reeled') continue;
    const o = a.reelTo || game.player;
    chain(ctx, o.x - camX, o.y - 6 - camY, a.x - camX, a.y - 6 - camY, game.time * 40);
  }

  for (const z of game.zaps) {
    const pts = z.pts.map(p => ({ x: p.x - camX, y: p.y - camY }));
    ctx.globalAlpha = Math.max(0, z.t / z.life);
    if (z.style === 'hypno') {
      // wobbly rainbow-ish spiral beam
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const n = Math.max(4, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 3));
        for (let s = 0; s <= n; s++) {
          const k = s / n, ang = game.time * 14 + s * 0.9;
          px(ctx, a.x + (b.x - a.x) * k + Math.cos(ang) * 2, a.y + (b.y - a.y) * k + Math.sin(ang) * 2, 1, 1,
            s % 2 ? '#e08bff' : '#ffffff');
        }
      }
    } else {
      jagged(ctx, pts, 6, '#6ec2ff', 2);
      jagged(ctx, pts, 3, '#ffffff', 1);
    }
    ctx.globalAlpha = 1;
  }

  for (const pr of game.projectiles) {
    const x = Math.round(pr.x - camX), y = Math.round(pr.y - camY);
    if (pr.type === 'dart') {
      const d = Math.hypot(pr.vx, pr.vy) || 1;
      const tx = Math.round(x - pr.vx / d * 4), ty = Math.round(y - pr.vy / d * 4);
      ctx.strokeStyle = '#d7dfea';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
      px(ctx, tx - 1, ty - 1, 2, 2, '#c9a8ff');
    } else if (pr.type === 'hook') {
      const o = pr.owner;
      chain(ctx, o.x - camX, o.y - 6 - camY, x, y);
      // three-pronged grapple, pointing the way it flies
      const d = Math.hypot(pr.vx, pr.vy) || 1, ux = pr.vx / d, uy = pr.vy / d;
      px(ctx, x - 2, y - 2, 4, 4, '#d7dfea');
      px(ctx, x - 1, y - 1, 2, 2, '#5a6577');
      px(ctx, x + ux * 3 - uy * 3, y + uy * 3 + ux * 3, 1, 1, '#ffffff');
      px(ctx, x + ux * 3 + uy * 3, y + uy * 3 - ux * 3, 1, 1, '#ffffff');
      px(ctx, x + ux * 4, y + uy * 4, 1, 1, '#ffffff');
    } else if (pr.type === 'rbolt') {
      px(ctx, x - 2, y - 2, 4, 4, '#7fe3ff');
      px(ctx, x - 1, y - 1, 2, 2, '#ffffff');
    } else if (pr.type === 'lob') {
      // shadow on the ground, burger in the air
      ctx.globalAlpha = 0.25;
      px(ctx, x - 3, y, 6, 1, '#000000');
      ctx.globalAlpha = 1;
      drawBurger(ctx, x, y - pr.h);
    }
  }

  for (const d of game.deployables) {
    if (d.kind !== 'courier') continue;
    const x = Math.round(d.x - camX), y = Math.round(d.y - d.lift - 16 - camY);
    // tether + little quadcopter
    ctx.strokeStyle = '#8791a0';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.lineTo(x, y + 6); ctx.stroke();
    px(ctx, x - 5, y - 1, 11, 3, '#141019');
    px(ctx, x - 4, y, 9, 1, '#8791a0');
    px(ctx, x - 6, y - 2, 3, 1, '#d7dfea');
    px(ctx, x + 4, y - 2, 3, 1, '#d7dfea');
    px(ctx, x, y, 1, 1, Math.floor(game.time * 6) % 2 ? '#59d98c' : '#ffffff');
  }
}
