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
fullscreen play with no browser bars.

## 🎮 Controls (iPhone)

| Zone | Control |
|---|---|
| Left thumb | Floating joystick — push to the **edge to SPRINT** (drains stamina) |
| Right thumb | **GRAB** (close range) · **DIVE** (long lunge — miss and you eat dirt for a second) · **DASH** (quick burst) · **JUMP** (clear fences, hay bales, crates) · **NET** (once you buy the Net Gun) |

Desktop testing: WASD/arrows + Shift sprint, J grab, L dive, K dash, Space jump, N net, P pause.

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
| 🟣 Elite | Cloaks while running, dashes, shoots. Bring the goggles. |

## 🗺️ Maps

- **Sunny Pines Playground** — slides, swings, sandbox, bushes everywhere.
- **Hollow Creek Farm** — the cornfield is basically alien heaven. Barn, silo, hay bales, animal pen.
- **Rust Harbor Shipyard** — a container maze with open containers to hide inside, cranes, and a dock.

9 missions, then endless **Overtime Shifts** that keep scaling up.

## 🧰 Equipment shop

Track Shoes · Field Training (stamina) · Grip Gloves · Kneepads · Alien Sack ·
Tracker Goggles · Net Gun · Stun-Proof Vest

### Gadget brainstorm (future)

Ideas on the table for the next batch — pick favorites:

- **Bait Burger** — drop it, nearby aliens can't resist sneaking out for a bite
- **Trap Cage** — place it in an alley, aliens that run over it get boxed
- **Cardboard Box** — crouch disguise; hidden aliens don't flush while you wear it
- **Grapple Hook** — yank yourself over containers / across the map
- **Drone Scout** — auto-pings one hidden alien at mission start
- **EMP Grenade** — disables Elite cloaks and Trooper pistols for 10s
- **Roller Shoes** — hold sprint downhill… everywhere
- **Decoy Agent** — inflatable agent that aliens flee from, herding them toward you

## 🛠️ Dev notes

Pure HTML5 canvas + ES modules. No build step, no dependencies, no external assets —
every sprite is generated from pixel grids in `js/data/sprites.js` at boot.

```
index.html          shell + HUD + touch controls
css/style.css       layout, safe-area insets (Dynamic Island / home indicator aware)
js/main.js          boot, game loop, integer-scaled low-res renderer
js/game.js          mission controller, capture/deposit, UFO beam, rendering
js/entities.js      player movement + alien AI (hide / run / attack)
js/nav.js           nav grid, BFS pathfinding, collision
js/input.js         floating joystick, buttons, keyboard fallback
js/ui.js            title / missions / shop / results / pause screens
js/data/sprites.js  all pixel art (palettes + grids + prop drawings)
js/data/maps.js     the three maps
js/data/missions.js mission ladder, alien stats, gear catalog
js/save.js          localStorage save
js/audio.js         WebAudio synth SFX
```

Run locally: any static server, e.g. `npx http-server` in the repo root.
