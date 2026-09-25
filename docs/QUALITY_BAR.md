# Quality Bar: Cutscenes, Story Scenes and Maps

Stage 1 (the intro cutscene, Farm Fields and the stampede) is the reference standard. Every new
cutscene, story scene and map has to be at least that good. This document says what "that good"
means in practice: the techniques that made it work, the numbers it hit, the mistakes that were
caught and fixed along the way, and the checks that prove a piece of work is done.

If something here conflicts with a quick way to finish, this document wins. Nothing ships until it
passes the Definition of Done at the bottom.

---

## 1. Non-negotiables

1. **Follow the writer's script exactly.** Story beats and dialogue come from the user word for word.
   Fix only typos and punctuation (for example "Earths" to "Earth's"), and list every change you made.
   Never cut, reorder or reword a line. Anything you add yourself (radio chatter, hints, labels) goes in
   the stage's data file so it can be edited, and gets pointed out when you report back.
2. **Do everything that was asked, in the order given.** If the spec says "view zooms out to show
   Handler Voss", there's a real camera pull-back that ends on Handler Voss. If it says "player shows
   exclamation marks and startles", there are exclamation marks *and* a physical startle.
3. **Check it with your own eyes.** Every beat gets screenshotted in a real browser, in portrait and
   landscape, and those screenshots get looked at and critiqued before anything is called done
   (see §7).
4. **Keep the systems a stage leaves out out of sight.** If a stage has no money or upgrades, then no bank, cash pill,
   shop, payout, fee or timer appears anywhere in it: HUD, pause menu or results.
5. **Don't break what already works.** Contracts, sandbox and every existing map must still play the same.
   Any new hook has to do nothing when a story director isn't attached.

---

## 2. Art bible (applies to everything)

- **One light source, top-left.** Highlights go on top/left faces, the core shadow on the bottom/right,
  and every object gets a 1px near-black outline (`C.ink`). Take colours from the shared palette `C` in
  `js/data/sprites.js`; add a new ramp only when there's no existing material to use.
- **Crisp pixels only.** Use integer positions, no anti-aliasing, and `imageSmoothingEnabled = false`.
  Draw circles with pixel `disc()` spans, never `arc()` fills. The single exception is the zoom *while*
  the camera is moving (see §4.3).
- **No canvas text at 1x.** It's unreadable. For text inside the world or a monitor, use the 3x5 pixel font
  (`pixelText()` in `js/data/storyArt.js`). Text meant to be read goes in the DOM, in the pixel font,
  and in **CAPITALS** like the rest of the UI.
- **Draw at the game's scale.** The low-res buffer's short side is about 165px (a phone in portrait is
  about 168x362). The agent is 12x16 and aliens are 10x12. Every sprite is designed at that scale; never
  scale a sprite to make it bigger.
- **Everything is generated in code**, from grids or `propCanvas()` drawing functions, at boot. No
  external image assets unless the user supplies them.
- **Check that the sprite reads as what it is.** Look at it at 5–6x and ask what it looks like at first
  glance. Real fixes from Stage 1:
  - a white shirt with a black tie read as a beard, so the shirt was narrowed and the tie made maroon;
  - a cyan mic tip on the cheek read as a tear, so it was moved beside the mouth;
  - a translucent orange glow read as a brown donut, so it became a solid layered flare.
- **Vary what repeats.** Use palette variants (three scarecrows, one with a crow on it), mixed
  species (round trees and pines), and per-seed crop rows. Never place the same prop in a visible grid.

---

## 3. Maps

### 3.1 Ground

- **No hard 16px tile staircases anywhere.** Set `map.blend = true` and make sure every ground tile
  the map uses is in the `TERRAIN` table in `js/terrain.js`, with a group and a priority. The
  higher-priority terrain bleeds into the lower. The edge:
  - is solid up to a wavy line whose depth is 1–8px (world-space noise, so it's continuous across tiles);
  - finishes with a thin Bayer-dithered fringe, about 2.5px;
  - wide checkerboard dither bands look noisy, so don't use them.
- **Roads and paths are painted as curves.** Use `paintPath(ctx, tiles, points, { halfW, texIds, rut })`,
  never road tiles, because tiles can only turn in 16px steps. You get a wobbly dithered edge, a
  packed shoulder, wheel ruts and scattered pebbles. Mix two or more texture variants per tile so no
  pattern repeats.
- **Tile textures must tile seamlessly.** Wrap anything that crosses an edge (`cropTile()`'s wrapped
  `px`). Line row crops up on the same 8px pitch as the tall row props that sit on them.
- **Never repeat a feature per tile.** A pebble at the same spot in every tile makes a visible grid.
  Scatter small details per pixel with `hash()`, or across variants.
- **Bake decals and art nobody can walk on** into the ground canvas through `map.paintGround(g, tiles)`:
  scorch craters (`scorchDecal`), forest canopy (`paintForest`), painted roads.

### 3.2 Depth and props

- **Tall vegetation is a y-sorted row prop you wade through**, not a flat tile. Use `cropRow(kind, width, seed)`,
  one prop per row: corn every 8px, sunflowers every 16px. Actors between rows get their legs covered
  by the stalks in front. Stalks need gaps so the actor can still be seen.
- **Borders are real places, not invisible walls.**
  - Thick forest runs 3 tiles deep: canopy baked into the ground, plus a front row of individual
    tree props (every 14–17px, mixed species, slight jitter) that y-sort with the actors.
  - Solids cover the band, so nothing walks into the trees.
  - Exits are real gaps with the road running through them.
- **Tie the map to the story.** Things that happened in the cutscene should show on the map. The pods
  from the crash are lying in the fields with scorch craters and smoke columns (`map.smoke`). The
  van is parked where the agent drove in. The exit leads to the next scene (`map.exit`, `map.road`,
  `map.roadX`).
- **Place things with intent, then check the full-map render.** Keep grass paths between plots so the
  edges blend cleanly. Make sure no prop's solid covers a hiding spot, and that fences and bales sit
  where they teach something (the fence south of the tutorial patch teaches JUMP).

### 3.3 Gameplay fit

- **Hiding spots:** at least 3x the alien count and spread across the map (Farm Fields has 66 for 15),
  mostly inside tall crops, wheat, pods and bales. None may sit inside a solid.
- **The first find is easy.** Story maps have a `tutorSpot` close to spawn (Farm Fields' is about 150px
  away) that is partly on screen when the scene starts.
- **Van and spawn** sit on open ground next to the road, with a clear walk from spawn to the first
  objective.

### 3.4 Performance budget (desktop headless Chromium, 168x362 view)

| Measure | Farm Fields | Budget |
|---|---|---|
| `game.render` per frame | 0.16 ms | < 0.5 ms |
| `game.update` per frame | 0.07 ms | < 0.3 ms |
| Map build (ground + blend + paint) | 116 ms | < 250 ms, hidden behind a title card or fade |

Props off screen are culled in `Game.render`, so a map can afford a few hundred. Measure every new map
(§7.3).

---

## 4. Cutscenes

### 4.1 Structure

- **Break it into named phases with clear beats** and a timeline you can tune (Stage 1's intro:
  `FEED_T 7.0`, `ZOOM_T 2.2`, `SETTLE_T 0.7`, then the dialogue). Every beat has a visual *and* a sound.
- **It can always be skipped.** There's a SKIP button in the top-right. A tap advances the scene
  (it finishes the line being typed first). Enter/Space/A advance; Esc/P/Start skip. Skipping lands on
  the player's choice or the end of the scene, never somewhere broken.
- **Tell it with pictures first.** The crash plays out as an event: burn-in, first hit, pods ejecting,
  break-up with a white flash, a second explosion, then fires glowing on the horizon.
- **Hand off cleanly.** Fade to black, show a title card (`STAGE n` / `SCENE n: NAME`), then start the
  scene behind the card and fade the card off it.

### 4.2 Dialogue

- **Put all the words in the stage's data file** (`js/data/stage1.js`): lines, speaker, choice
  text, and what the background does for each line (`screen`, `pose`).
- Text is typed out at about 42 characters a second with a voice blip every third letter, and a
  portrait with closed, open (talking) and blink frames.
- **Words the script writes in capitals keep their punch.** "YOU" is highlighted, because everything
  else is capitalised too.
- **Lock the dialogue box to the height of the longest line** (`fitBox`) so the scene laid out above
  it never jumps between lines. Measure it again on resize.
- **The background reacts to every line.** The ops-room monitor switches, with a burst of static,
  between the orbit track, the radar, the impact replay, the trajectory map and the landing zone.
  Characters change pose: talking to the agent, facing the monitor, pointing at "YOU". The
  agent turns to face the speaker, then turns to camera and hops when accepting.
- **The player's choice floats just above the dialogue box and pulses.**

### 4.3 Camera and composition

- **Camera moves are real moves.** The pull-back scales the room and the replay together around one
  fixed pivot, `P = (screenCentre − monitorCentre·Zc) / (1 − Zc)`. The replay is rendered at the
  monitor's aspect ratio, sized to cover the screen, so it's pixel-for-pixel at full zoom and ends up
  exactly in the monitor. Smoothing is allowed only while the camera is moving.
- **Work in every orientation.** Lay out from the live view size and the *measured* top of the
  dialogue box.
  - Portrait: the agency seal above the monitor, the characters out on the floor, and a foreground
    desk (with a mug) to fill the space.
  - Landscape: everything in one band above the box, with racks either side.
  - Never leave a big empty area, and never put anyone behind the box.
- **On-screen labels avoid the SKIP button** and fade out as the camera pulls back.
- **Cutscenes inside a map:**
  - Letterbox bars slide in (10% of the view height each).
  - The HUD and controls step aside (`#hud.cinematic`, `#controls` hidden).
  - The camera follows the action (`game.camTarget`, `game.camEase`), then pans back to the agent.
  - Cut through black to reposition the scene when the geography demands it (for example, the agent
    already out on the road).

### 4.4 Motion and effects

- **Emit particles at a fixed rate, not per frame** (an accumulator at 120Hz), so the effect looks
  the same at any frame rate.
- **Fire has a colour ramp.** White, yellow, orange, red, then grey smoke that grows as it fades.
  Young particles are 3px and old ones 1–2px.
- **Nothing important is a 1px line.** Clouds are lumpy shapes lit from below, not thin strokes (thin
  horizontal strokes read as lasers). Trails are dense enough to read on a phone.
- **Impacts get weight:** screen shake, a flash, sparks, and a boom sound.
- **Actors keep acting during cutscenes.** Scripted aliens run their routes (the `scripted` state:
  path, speed, wait, face) and hop fences. A double-take is a jump, a second hop, a shake and
  exclamation marks popping in one at a time — one of them red.

---

## 5. Story scenes (tutorial and direction)

- **One director per scene** (for example `Tutorial` in `js/tutorial.js`), attached by `main.js`. It
  implements `on(evt)`, `update(dt)`, `renderWorld(ctx, camX, camY, vw, vh)`, `renderScreen(ctx, vw, vh)`
  and `destroy()`, plus the properties `locked`, `ownsPlayer` and `moveInput`. It listens for the game's events: `flush`, `attack`, `hit`, `grab`,
  `secure`, `dive`, `diveMiss`, `jump`, `dash`. It ends the scene with `game.finishStory(extra)`.
- **Objectives are short.** A panel shows `OBJECTIVE` plus a verb phrase, with a counter where there is one.
- **Hints fit the controls in use.** Every hint has wording for touch `buttons`, `gestures`,
  `keys` and `pad` (`CONTROL_HINTS`), follows `inputMethod()` live, and makes the named control glow
  (`GLOW_TARGETS`).
- **Tips show up once, when they matter:** sprint when falling behind, dive when close, jump when
  walking into a fence, what a tackle does, what a missed dive does.
- **The handler's radio stays current.** Lines are short and capitalised, only the newest line waits,
  and the current one is cut short when something newer is queued (a stale "GRAB IT!" after it's
  already been grabbed was a real Stage 1 bug).
- **Nobody gets lost.** A marker and edge arrow point to the first target; a ping points to the nearest
  hiding alien after 25s with no progress; a gentle nag plays if the player heads for the exit early.
- **Results screens have no money lines** in a stage without money. They say what happened
  ("Aliens secured", "Bolted down the road") and what comes next ("To be continued").

---

## 6. Mistakes Stage 1 caught (check for every one of them)

| Mistake | What fixed it |
|---|---|
| Road stair-stepping in 16px tiles | Painted with `paintPath` as a smooth curve |
| Same pebble in every road tile (visible grid) | Per-pixel hashed scatter, texture variants |
| Wide checkerboard dither band read as noise | Solid wavy edge plus a thin 2.5px fringe |
| Corn read as a wall of vertical reeds | Leaf clusters, drooping tips, tassels, 4px spacing |
| Clouds read as laser lines | Lumpy shapes with a lit underside |
| Nose glow read as a brown donut | Solid layered flare |
| Fire trail too thin to see on a phone | Two emitters, 3px young particles |
| "REC" drawn under the SKIP button | Labels kept to the left |
| Portrait room was mostly empty floor | Characters lower on the floor, foreground desk |
| Dialogue box height jumped between lines | Box locked to the longest line |
| Radio lines played late, out of date | Newest-wins queue, early cut-off |
| Lowercase radio text in an all-caps UI | Capitalised at the source |
| Handler's shirt and tie read as a beard | Narrower shirt, maroon tie |

---

## 7. Checks (the proof)

Don't mark anything done until every check below has run and its screenshots have actually been looked at.

### 7.1 Art review while building
- Build a scratch preview page, kept outside the repo, that imports `js/data/*.js` and draws every new
  tile (as a 3x2 block to reveal seams), prop and sprite at 5–6x. Iterate there before building the map.
- Render the whole map to a PNG at 1.5–2x (draw `game.render` into a canvas the size of the map), then
  zoomed crops at 5x around the spawn, the plot edges and the roads.

### 7.2 Screenshot every beat, in five viewports
Use Playwright's Chromium, driven through the `window.__aw` debug hook (`game`, `ui`, `save`, `state`,
`intro`):

| Viewport | CSS size | Scale factor | Input |
|---|---|---|---|
| Phone portrait | 390x844 | 3 | touch |
| Phone landscape | 844x390 | 3 | touch |
| Small phone | 375x667 | 2 | touch |
| Tablet | 1024x768 | 2 | touch |
| Desktop | 1280x720 | 1 | keyboard |

Capture every phase of every cutscene (several frames of anything moving), every dialogue line, the
choice, the title card, the scene start, each tutorial step and hint, the in-map cutscene start to
finish, and the results screen. Put them side by side in contact sheets and critique them against
§2–§6. Fix what you find and capture again.

### 7.3 Behaviour, regressions and performance
- Play the scene through for real: walk with the keyboard, press the action keys, and use the hook
  only to skip travel time. Check the step order, the counters, the save progress
  (`save.story`) and that the scene ends.
- **No-buttons controls:** the hints use gesture wording and the right legend element glows.
- **Pause:** resume, restart the scene (the old director's DOM is gone, a new one is running), and
  quit with the two-tap confirm.
- **Skip:** the SKIP button and Esc go to the choice, and Enter accepts.
- **Regressions:** a contract mission still pays out, and every map starts in sandbox.
- **Performance:** benchmark 300 renders and 300 updates, plus the build time, against the budget in §3.4.
- **Zero** `pageerror`s and zero console errors, apart from the local `version.json` 404.
- Lint the new modules for undefined variables.

---

## Definition of Done

- [ ] Every beat of the user's spec is in, in their order, with their exact lines (typo fixes listed).
- [ ] Nothing a stage leaves out (money, upgrades, timer) shows anywhere in that stage.
- [ ] Art follows §2: top-left light, outlines, shared palette, crisp pixels, reads as intended at a glance.
- [ ] Map ground has no hard tile edges, roads are painted curves, textures are seamless, nothing repeats in a grid.
- [ ] Map has depth (row props, a front row of trees along the borders), story props, real exits, enough hiding spots, and fits the performance budget.
- [ ] Cutscenes are skippable, beat-driven, have sound, use real camera moves, work in portrait and landscape, and never jump.
- [ ] Dialogue is typed, voiced, has a talking portrait, a background that reacts, and a height-locked box.
- [ ] Hints are right for all four control schemes; tips, markers and radio stay current.
- [ ] Every item in §6 was checked on the new work.
- [ ] §7 checks are done: contact sheets reviewed in all five viewports, playthrough, regressions, performance, zero errors.
- [ ] README updated; all text lives in the stage's data file.
