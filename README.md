# 👽 Alien Wrangler

You're a CIA field agent. Aliens keep crash-landing in the suburbs, and it's your job
to track them down, wrangle them, and lock them in the back of your unmarked van —
before their UFO shows up and beams them home.

Low-res pixel art, top-down, built for playing on your phone.

## ▶️ Play it

**https://tuckerstrachan414-maker.github.io/Alien-Wrangler/**

### One-time setup (repo owner)

The game deploys automatically with GitHub Actions, but Pages has to be switched on once:

1. Open this repo on GitHub → **Settings** → **Pages**
2. Under **Build and deployment → Source**, pick **GitHub Actions**
3. Wait for the "Deploy to GitHub Pages" action to finish (Actions tab), then open the link above

Tip: on iPhone, open the link in Safari and use **Share → Add to Home Screen** for
fullscreen play with no browser bars. Works in both **portrait and landscape** —
rotate the phone and the controls and camera adapt (landscape shows a wider strip of
the map at the same zoom).

## 📖 Story — Stage 1 (tutorial)

**STORY** on the title screen. Stage 1 teaches the controls and the basics of the job. There's
no money, shop or upgrades anywhere in it: base kit only, no clock, no UFO, no payout.

1. **Intro cutscene.** A satellite replay: an alien cruiser burns into the atmosphere, takes a
   hit, breaks apart and scatters escape pods over the fields. The camera pulls back and it's
   playing on the wall monitor of an ops room, where **Handler Voss** briefs you (typed-out lines
   with a talking portrait; the monitor follows along: orbit track, radar, the debris impact,
   the trajectory, the landing zone). Tap to move it along, **SKIP** for the whole thing.
   Choose **ACCEPT ORDERS**.
2. **Scene 1: Farm Fields.** Rows and rows of corn, sunflowers, wheat, cabbages, lettuce,
   carrots and pumpkins either side of a dirt road, scarecrows scattered about, crashed pods
   still smoking, all walled in by thick forest. 15 Grunts are hiding in the crops. The tutorial
   walks you through moving, finding a hiding alien, grabbing it and loading it into the van,
   with every hint worded for the controls you're actually using (touch buttons, no-buttons
   gestures, keyboard or gamepad) and the control it names glowing. Sprint, dive, jump, dash and
   "cornered aliens fight back" tips turn up the first time they matter, and Voss chimes in on
   the radio. **Secure 3** and the other twelve break cover and bolt north down the dirt road;
   you do a double-take (**! ! !**) and give chase, and the scene ends.
3. **Scene 2: Barnyard.** A black title card, then the agent jogs in up the same dirt road to a
   farm: a big red barn at the side of the road, a glass greenhouse across from it, a stone well in
   the yard, bushes scattered about, all hemmed in by forest with a deep tree line to the north. The
   12 that got away are hiding all over it (four in the barn, two in the greenhouse, the rest outside).
   **Walk into the barn and its roof lifts off** so you can see inside: a wreck of scattered tools and
   hay, empty animal pens with their gates hanging open, mud tracked everywhere, and three rows of
   nest boxes up the back wall, every one of them emptied. The greenhouse is glass, so you can always
   see in; step inside and the frame fades back too. No tutorial this time, just Voss on the radio.
   **Secure 6** and every alien still out there breaks cover and bolts for the tree line (the barn
   roof lifts so you see them scramble out of it) and melts into the trees. The agent jumps (**!?**),
   then loses his temper: stamps his feet, a vein pops, steam, a **#\*%!**, and he charges in after
   them. Cut to the edge of the woods, he plunges in behind the last two, and the scene ends.
4. **Scene 3: Highway 29.** The agent pushes out of the undergrowth into thick woods (trees, bushes,
   boulders, mossy logs, bracken), and they don't end. The woods keep coming in from the right however
   far he goes, the six that got away keep slipping on east from one hiding place to the next (and run
   that way when he flushes them), and the van follows along a fire road so there's always somewhere to
   load them. Tree crowns thin out while he's underneath so he never gets lost under the canopy. Somewhere
   about halfway there's a small sunny clearing with fewer trees. **Secure 3** and the woods run out:
   the other three break cover and bolt, the trees thin to a creek, and they leap it and wait on the far
   bank. **The agent has to jump it too.** He stops at the water's edge if he just walks up to it, and a
   jump that comes up short puts him in the creek, so he has to climb out and try again with a run-up.
   Then a chase through open woods: they're always just too quick, keeping their lead and bursting clear
   if he dives. After about 15 seconds they reach **Highway 29**, turn, and one of them drops him with
   a shock gun. Cutscene: the agent flat on the verge, crackling with electricity; across the road to a
   gas station, where the three leap into the open back of an armoured black semi and pull the doors
   shut; the trucker strolls out of the store with his coffee, whistling, climbs in without a clue and
   drives off up the highway. Back to the agent, dragging himself after it on his stomach, until he puts
   his head down in the dirt. Fade to black. No radio in this one: he's on his own out there.

Scene 4 is on its way. All the story text lives in `js/data/stage1.js`.

## 📺 Menus

- **STORY** — Stage 1: **PLAY STAGE 1** from the briefing, or tap a scene to jump straight into it once
  it's open (Scene 1 after the briefing, each later scene once the one before is cleared). Clearing a scene offers
  **CONTINUE** straight into the next one.
- **PLAY** — the field-ops hub: **DEPLOY** for the mission ladder, **EQUIPMENT** for the upgrade shop.
- **MISSION BRIEFING** — deploying on a contract opens a short classified CIA memo that types itself out
  (with typewriter sound) beside your personnel file: a 2-3 sentence situation report (including map rules
  like Maple Street's noise meter), the time window, pay and deductions, and a card for each alien type with
  its sprite and count. **Tap an alien card** for a small intel popup: threat level, traits and how to handle it.
  The personnel file shows your agent, clearance, record, field stats, your two gadget slots (tap a slot to
  change it, or SWAP) and your other tools.
  Tap the report to skip the typing, **GEAR UP** to visit the shop and come back, **BEGIN OP** to deploy.
- **SETTINGS** — sound on/off, SFX volume, control scheme, gesture hints, and save data.
- **SANDBOX** — free play. Pick any map, any alien roster, any time limit (including **no limit**,
  so the UFO never comes) and any gear level, with everything unlocked. Nothing is paid out and
  nothing is written to your save — it's for testing and messing around.

## 🎮 Controls (iPhone)

Two schemes, switchable any time in **Settings** (even mid-mission, from the pause menu).
Both work in portrait and landscape.

### Buttons mode (default)

| Zone | Control |
|---|---|
| Left thumb | Floating joystick to move |
| Right thumb | **SPRINT** (toggle running on/off — drains stamina) · **GRAB** (close range) · **DIVE** (long lunge — miss and you eat dirt for a second) · **DASH** (quick burst) · **JUMP** (clear fences, hay bales, crates) · one button per equipped **gadget** (labelled with its name, e.g. ZAP / NET) |

### No-buttons mode

The screen splits down the middle: the left thumb is your **legs**, the right thumb is your **hands**.
Nothing the right thumb does ever interrupts walking, and the left thumb has no taps or flicks, so steering
can never misfire an action.

| Half | Gesture | Action |
|---|---|---|
| Left | Drag anywhere | Move (the stick spawns under your thumb) |
| Left | Push out past the **ring** | Sprint. The ring sits a good way past full walking speed, so you only sprint on purpose. Run out of stamina and it goes red: ease back inside the ring and push out again to re-arm |
| Left | Walk into a fence / bale / crate | Vault it automatically |
| Left | Walk into an alien | Grab it automatically (same reach as the GRAB button) |
| Right | **Tap** | Gadget in slot 1 (a plain grab if the slot is empty) |
| Right | Swipe **right** | Gadget in slot 2 |
| Right | Swipe **up** | Jump |
| Right | Swipe **down** | Dive the way you're running, bent slightly toward an alien that's roughly ahead |
| Right | Swipe **left** | Dash the way you're running |

One swipe per touch, so a thumb bouncing back after a flick can't fire a second action. The legend in the
bottom corners is laid out as a cross (each label on the side you swipe toward), shows which gadget is on TAP
and SWIPE RIGHT, and dims when an action is on cooldown. Turn it off in Settings once you know it.

Desktop testing: WASD/arrows to move, hold Shift to sprint, J grab, L dive, K dash, Space jump, Q/N gadget 1, E/B gadget 2, P pause.

**Gamepad**: plug in an Xbox, PlayStation, Switch Pro, or other standard USB/Bluetooth controller and it just works, no setup —
left stick or D-pad to move, A/Cross grab, X/Square dive, B/Circle dash, Y/Triangle jump, LB/L1 gadget 1, RB/R1 gadget 2,
either trigger or stick click to sprint, Start/Select to pause. Multiple controllers can be connected at once.

## ⏸️ Pausing

**| |** in the top-left corner pauses. From there you can resume, restart the mission,
open Settings, or **abandon the mission** — which forfeits the payout *and* costs a
cleanup fee of 25% of the mission's base pay, so it takes two taps to confirm.

## 🛸 How a mission works

1. Aliens start **Hiding** — bushes, corn rows, hay bales, open containers, under the slide. Watch for rustling.
2. Get close and they're flushed into **Running** — they sprint, juke, hop fences, and look for a new hiding spot away from you.
3. Corner one long enough and it flips to **Attack** — Grunts and Scouts tackle, Troopers and Elites fire stun bolts. Getting stunned makes you **drop every alien you're carrying**.
4. Grab or dive on an alien to carry it (you can carry more with the Alien Sack), then haul it to the **van's glowing door** to secure it.
5. When the clock hits zero the **UFO arrives** and beams survivors up one at a time. You can still **snatch an alien out of the beam** if you're fast.

**Pay**: each mission has a base payout for its difficulty; every alien that escapes is
deducted from it. You need at least one capture to clear a mission and unlock the next.

## 👾 The targets

| Tier | Trouble |
|---|---|
| 🟢 Grunt | Basic. Slow-ish. Still slippery. |
| 🔵 Scout | Fast, with a panic dash when you get close. |
| ⚪ Trooper | Armored — your first grab knocks the helmet off. Fires stun bolts. |
| 🟣 Elite | Cloaks while running, dashes, shoots. A Noise Maker bang knocks it out of cloak. |

## 🗺️ Maps

- **Sunny Pines Playground** — slides, swings, sandbox, bushes everywhere.
- **Hollow Creek Farm** — the cornfield is basically alien heaven. Barn, silo, hay bales, animal pen.
- **Rust Harbor Shipyard** — a container maze with open containers to hide inside, cranes, and a dock.
- **Maple Street** *(stealth)* — a sleeping suburb at 3am. Catch the aliens **without waking the
  neighbours**: sprinting, dashing, diving and getting stunned make noise, and it's much louder right
  next to a house. Fill the **NOISE** meter and the block wakes up — the aliens scatter and you get
  fined. Sneak on the lawns, use the hedges and parked cars for cover, save the loud moves for the road.
- **Isla Verde** — a lush jungle island with a smoking **volcano** in the middle. Palms, ferns, tiki
  torches and huts everywhere for the aliens to duck behind; ocean on all sides.
- **Farm Fields** *(Stage 1)* — the crash site. Tall corn and sunflower rows you wade through, low crops
  in between, a winding dirt road out through the forest to the north. Ground textures fade into each
  other instead of meeting on a hard tile edge. Also playable in Sandbox.

- **Barnyard** *(Stage 1)* — a big red barn and a glass greenhouse you can walk into (their roofs fade
  away while you're inside), a stone well, bushes and a north tree line. Also playable in Sandbox.
- **Highway 29** *(Stage 1, story only)* — endless woods that stream in as you go, a creek, open woods,
  and a two-lane highway with a gas station across it. It's built around Scene 3's script (the woods
  only end when the director says so), so it isn't in Sandbox.

13 missions across the five maps, then endless **Overtime Shifts** (rotating every map) that keep scaling up.

## 🧰 Equipment shop

Track Shoes · Field Training (stamina) · Grip Gloves · Kneepads · Alien Sack · Stun-Proof Vest

**Gadgets** are the weapons you fire by hand. There are twelve, each with **three upgrade tiers** (Mk.I → Mk.II → Mk.III),
and the Mk.III of every one changes *how* it plays, not just its numbers. You can own them all, but only
**two ride along** on a mission: slot 1 (TAP / button 1) and slot 2 (SWIPE RIGHT / button 2). Pick the slots
on the gadget's shop card, in the briefing's personnel file, or in the Sandbox loadout. Buying your first
gadgets fills empty slots automatically. Tap a gadget's card in the shop to see all three tiers.

| Gadget (button) | Mk.I | Mk.II | Mk.III |
|---|---|---|---|
| 💥 **Noise Maker** (NOISE) | Deafening BANG: hidden aliens within 72px are knocked out of cover and stunned 2s, loose ones lose their cloak, hidden ones out to 140px get pinged. 14s reload | 100px, 2.8s stun, 220px ping, 10s reload | **Sonic Boom**: 120px, and it stuns running aliens too |
| 🕸 **Net Gun** (NET) | Net pins an alien 3s; pinned aliens are grabbed straight through armor. 6s reload | 4s pin, 4.5s reload | **Scatter Net**: three nets in a spread |
| ⚡ **Stun Gun** (ZAP) | Instant taser shot, stuns one alien 3s, even one hiding in a bush. 4.5s reload (a miss only takes a 1s re-arm) | **Chain lightning**: jumps to up to 3 more aliens within 60px | **Arc**: up to 5 targets and the arc doubles back, hitting each twice. A second hit fries a Trooper's helmet off |
| 💉 **Tranq Dart** (DART) | Silent long-range dart: drowsy (half speed), then asleep 2.5s. Bounces off helmets. 4s reload | Armor-piercing, 4s sleep, 3s reload | **Snore Cloud**: a sleeper knocks out every alien within 40px of it |
| 🍔 **Bait Burger** (BAIT) | Toss a burger: hidden and running aliens within 110px sneak over to eat it for 8s, ignoring you while they chew | **Double Stack**: 170px, 12s, and it even pulls attacking aliens off you | **Food Coma**: aliens that ate pass out for 4s after |
| 🪤 **Trap Cage** (CAGE) | Spring cage at your feet: the first loose alien over it is locked in for 10s, grabbable through armor. Full cages get an edge arrow | Two cages out at once, 18s hold | **Courier**: a drone airlifts caged aliens straight to the van |
| 🪝 **Grapple Hook** (HOOK) | 150px line: reels an alien into your hands, even out of a low UFO beam. Hit a wall and it zips you there, over fences and bales. 6s reload | 200px, snatches at *any* beam height, 4.5s reload | **Chain Hook**: carries on to a second alien and reels in both |
| 🎈 **Decoy Agent** (DECOY) | Inflatable agent that **hunts aliens**: it swings round to the far side of one and drives it toward you, flushes hiders, and aliens caught between you and it are **CORNERED** (they cower, ready to grab). It can't grab. Aliens shoot and tackle it instead of you (3 HP, 12s). It fires the **other gadget in your loadout** | 5 HP, 20s, and it uses **every gadget you own** (cages, darts, nets, zaps, bait, cryo, noise, hypno, shield) | **Squad**: two decoy agents at once |
| 🫧 **Riot Shield** (SHIELD) | 4s bubble that blocks stun bolts and tackles, so you keep what you carry. Tacklers bounce off stunned for 2s, right in grabbing range. 12s reload | 6s, reflects bolts back to stun the shooter, 9s reload | **Shield Bash**: run into aliens to bowl them over |
| ❄️ **Cryo Sprayer** (CRYO) | 70px cone of freezing mist: every loose alien in it freezes solid 2.2s. 7s reload (a spray that hits nothing only takes a 1.5s re-arm) | 90px, 3.2s, shatters helmets, 5s reload | **Blizzard**: a 360° freeze nova around you |
| 🌀 **Hypno Ray** (HYPNO) | Hypnotizes an alien into following you in a conga line for 10s. It doesn't count against your carry limit; walk it into the van glow to secure it. Getting stunned breaks the trance, and the UFO can't take it. 12s reload | Up to 2 followers, 16s, 10s reload | **Sleepwalk**: hypnotized aliens walk themselves to the van |
| 🚁 **Evac Beacon** (EVAC) | Beams everything you're carrying straight into the van from wherever you are. Only fires (and only spends its reload) when there's something to evac; the button dims otherwise. 45s reload | 25s reload | **Mass Evac**: also beams up every stunned, pinned, caged, sleeping or frozen alien within 80px |

On Maple Street the Dart, Bait, Cage, Shield and Hypno are silent. The Stun Gun, Hook, Cryo, Decoy and Evac
make a little noise, and the Noise Maker is still the loudest thing you can do.

The mission brief's alien intel popups list **COUNTERS**: the gadgets that work best on that tier.

If you owned the old Tracker Goggles, you keep that level as a Noise Maker.

**Perks**

- **Field Drones**: two little recon drones ride along above you. When a loose alien (one that isn't
  hiding) is off-screen, the drones pin an arrow to the screen edge pointing at it. Mk.I loses Elites while
  they're cloaked. Mk.II sees through the cloak, colours each arrow by alien tier and shows the range in metres.

### Gadget brainstorm (future)

Ideas still on the table:

- **Cardboard Box**: crouch disguise; hidden aliens don't flush while you wear it
- **Roller Shoes**: hold sprint downhill… everywhere

## 🛠️ Dev notes

Pure HTML5 canvas + ES modules. No build step, no dependencies, no external network —
every sprite is generated from pixel grids in `js/data/sprites.js` at boot, and the UI
uses the **Press Start 2P** pixel font (OFL 1.1, base64-embedded in `css/font.css`;
license in `fonts/OFL.txt`). The whole UI is styled with beveled, notched-corner pixel
frames to match the game art, and adapts to portrait or landscape. The menus sit over an
animated pixel night sky (stars, moon and a drifting UFO) drawn into the same low-res
buffer the game world renders to.

```
index.html          shell + HUD + touch controls
css/style.css       layout, safe-area insets (Dynamic Island / home indicator aware)
js/main.js          boot, game loop, integer-scaled low-res renderer
js/game.js          mission controller, capture/deposit, UFO beam, rendering
js/entities.js      player movement + alien AI (hide / run / attack)
js/nav.js           nav grid, BFS pathfinding, collision
js/input.js         joystick + buttons, split-screen gesture scheme, keyboard fallback
js/ui.js            title / play hub / missions / briefing / shop / settings / sandbox / results / pause
js/briefing.js      mission brief: CIA memo builder, alien intel cards, typewriter effect, personnel file
js/loadout.js       two-slot gadget loadout (resolve against owned gear, equip / cycle / swap)
js/weapons.js       every hand-fired gadget: fire / cooldown / world fx, shared by the agent and decoys
js/decoy.js         Decoy Agent AI (flank-and-herd hunting, uses your gear, can't grab)
js/intro.js         Stage 1 opening cutscene: satellite replay, pull-back to the ops room, Voss's briefing
js/director.js      shared story-scene director: objective panel, hints, Voss's radio, markers, cutscene letterbox
js/tutorial.js      Stage 1 Scene 1 director: tutorial steps, hints, radio, the stampede cutscene
js/barnyard.js      Stage 1 Scene 2 director: arrival, secure 6, the run for the tree line
js/highway.js       Stage 1 Scene 3 director: the endless hunt, the van on the fire road, the creek, the chase, the shock gun, the getaway
js/terrain.js       dithered fades between ground textures + smooth painted roads
js/data/sprites.js  all pixel art (palettes + grids + prop drawings)
js/data/storyArt.js story art: Handler Voss, the alien cruiser + pods, 3x5 pixel font
js/data/barnyardArt.js  Scene 2 art: walk-in barn + greenhouse (roof shell + cutaway), nest wall, well, barn clutter, floor decals
js/data/highwayArt.js   Scene 3 art: woods props, the semi, the trucker, a car, gas station + store, the agent's crawl, ground painters
js/data/highwayStrip.js Scene 3 streaming world: lays out and paints the woods a piece at a time from world coordinates, slides the canvas along
js/data/stage1.js   Stage 1 script: briefing lines, objectives, hints, radio lines (every scene)
js/data/maps.js     the seven maps, and walk-in buildings (MapBuilder.building)
js/data/missions.js mission ladder, sandbox builder, alien stats, gear catalog + weapon tuning
js/save.js          localStorage save (progress + settings + sandbox loadout)
js/audio.js         WebAudio synth SFX
```

Run locally: any static server, e.g. `npx http-server` in the repo root.
