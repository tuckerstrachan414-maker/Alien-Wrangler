# Alien Wrangler: notes for Claude

Before building or changing **any cutscene, story scene or map**, read
[`docs/QUALITY_BAR.md`](docs/QUALITY_BAR.md) and meet every item in its Definition of Done.
Stage 1 (`js/intro.js`, `js/tutorial.js`, `buildFarmFields` in `js/data/maps.js`) is the reference
for how good it has to be.

- Story text comes from the user word for word; it lives in the stage's data file (`js/data/stage1.js`).
- Check your work in a real browser (portrait and landscape) and look at the screenshots
  before calling anything done.
- No build step, no dependencies: plain ES modules served as static files (see README → Dev notes).
