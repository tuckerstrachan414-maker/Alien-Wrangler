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

## 📺 Menus

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
| Right thumb | **SPRINT** (toggle running on/off — drains stamina) · **GRAB** (close range) · **DIVE** (long lunge — miss and you eat dirt for a second) · **DASH** (quick burst) · **JUMP** (clear fences, hay bales, crates) · one button per equipped **gadget** (labelled NET / NOISE) |

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

13 missions across the five maps, then endless **Overtime Shifts** (rotating every map) that keep scaling up.

## 🧰 Equipment shop

Track Shoes · Field Training (stamina) · Grip Gloves · Kneepads · Alien Sack · Stun-Proof Vest

**Gadgets** (Noise Maker, Net Gun) are the gear you fire by hand. You can own them all, but only
**two ride along** on a mission: slot 1 (TAP / button 1) and slot 2 (SWIPE RIGHT / button 2). Pick the slots
on the gadget's shop card, in the briefing's personnel file, or in the Sandbox loadout. Buying your first
gadgets fills empty slots automatically.

- **Noise Maker** (replaces the old Tracker Goggles; if you owned goggles, you keep that level as a Noise Maker)
  sets off a deafening **BANG** around you. Aliens close by are knocked out of hiding, out of cloak and
  even out of the UFO's beam, then stunned. Hidden aliens further out get pinged with a marker for a few seconds.
  Mk.I: 2s stun in 72px, ping 140px, 14s reload. Mk.II: 2.8s stun in 100px, ping 220px, 10s reload.
  On Maple Street a bang is the loudest thing you can do, so expect to wake the block.

**Perks**

- **Field Drones**: two little recon drones ride along above you. When a loose alien (one that isn't
  hiding) is off-screen, the drones pin an arrow to the screen edge pointing at it. Mk.I loses Elites while
  they're cloaked. Mk.II sees through the cloak, colours each arrow by alien tier and shows the range in metres.

### Gadget brainstorm (future)

Ideas on the table for the next batch — pick favorites:

- **Bait Burger** — drop it, nearby aliens can't resist sneaking out for a bite
- **Trap Cage** — place it in an alley, aliens that run over it get boxed
- **Cardboard Box** — crouch disguise; hidden aliens don't flush while you wear it
- **Grapple Hook** — yank yourself over containers / across the map
- **EMP Grenade** — disables Elite cloaks and Trooper pistols for 10s
- **Roller Shoes** — hold sprint downhill… everywhere
- **Decoy Agent** — inflatable agent that aliens flee from, herding them toward you

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
js/data/sprites.js  all pixel art (palettes + grids + prop drawings)
js/data/maps.js     the five maps
js/data/missions.js mission ladder, sandbox builder, alien stats, gear catalog
js/save.js          localStorage save (progress + settings + sandbox loadout)
js/audio.js         WebAudio synth SFX
```

Run locally: any static server, e.g. `npx http-server` in the repo root.
