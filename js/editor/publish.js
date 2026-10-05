// Publishing: getting edits out of this browser and into the game for
// everyone, by writing them into the repo's maps/ folder. Four ways:
//   GitHub        one commit straight to the repo (Git Data API, a personal
//                 access token) - works from any device, a phone included
//   local server  `node tools/editor-server.mjs` serves the game + editor
//                 and writes the files into the repo on disk
//   folder        Chrome/Edge on a computer: pick the repo folder, the
//                 files are written into it
//   zip           download them, drop them into the repo yourself
// Plus export / import of maps and assets as .json or .zip.
import { MAP_INFO } from '../data/maps.js';
import { h, clear, modal, toast, download } from './dom.js';
import { canon, formatDoc, normalizeBundle } from './workspace.js';
import { makeZip, readZip } from './zip.js';
import { applyAssetBundle, ASSETS_FORMAT, MANIFEST_FORMAT } from '../edits.js';

const GH_KEY = 'aw-editor-github';
const API = 'https://api.github.com';

function guessRepo() {
  // https://<owner>.github.io/<repo>/editor.html
  const m = /^([a-z0-9-]+)\.github\.io$/i.exec(location.hostname);
  const seg = location.pathname.split('/').filter(Boolean)[0];
  if (m && seg && !seg.endsWith('.html')) return { owner: m[1], repo: seg };
  return { owner: 'tuckerstrachan414-maker', repo: 'Alien-Wrangler' };
}

function loadGh() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(GH_KEY) || '{}'); } catch { s = {}; }
  const g = guessRepo();
  return { owner: s.owner || g.owner, repo: s.repo || g.repo, branch: s.branch || '', token: s.token || '', remember: !!s.token };
}

/* ---------------- the publish dialog ---------------- */

export async function openPublish(ws, { done }) {
  const plan = ws.publishFiles();
  const { pend } = plan;
  const n = pend.maps.length + (pend.assets ? 1 : 0);
  const changes = h('div.change-list',
    pend.maps.length || pend.assets ? [
      ...pend.maps.map(c => h(`div.${c.action === 'add' ? 'add' : c.action === 'delete' ? 'del' : 'mod'}`,
        `${c.action === 'add' ? '+' : c.action === 'delete' ? '−' : '~'} maps/${c.id}.json  (${ws.name(c.id)}${c.action === 'delete' ? (MAP_INFO[c.id] ? ': back to built-in' : ': deleted') : ''})`)),
      pend.assets ? h(`div.${pend.assets === 'delete' ? 'del' : 'mod'}`, `${pend.assets === 'delete' ? '−' : '~'} maps/assets.json  (repainted + new assets)`) : null,
      h('div', { style: { color: '#8f9bb8' } }, '~ maps/manifest.json  (the list of edits)'),
    ] : h('div', { style: { color: '#8f9bb8' } }, 'Nothing to publish: every map and asset matches what’s published.'));

  const status = h('div.note-box.hidden');
  const say = (msg, kind = '') => { status.className = `note-box${kind ? ' ' + kind : ''}`; clear(status).append(...[msg].flat(Infinity)); };
  const setBusy = (b) => { for (const x of box.querySelectorAll('button')) x.disabled = b; };

  // ---- GitHub ----
  const gh = loadGh();
  const owner = h('input', { type: 'text', value: gh.owner, style: { width: '45%' } });
  const repo = h('input', { type: 'text', value: gh.repo, style: { width: '45%' } });
  const branch = h('input', { type: 'text', value: gh.branch, placeholder: '(the repo’s default branch)' });
  const token = h('input', { type: 'password', value: gh.token, placeholder: 'github_pat_…', autocomplete: 'off', style: { flex: '1' } });
  const remember = h('input', { type: 'checkbox', checked: gh.remember });
  const message = h('input', { type: 'text', value: commitMessage(ws, pend) });
  const ghBtn = h('button.btn.primary', { type: 'button', disabled: !n }, 'PUBLISH TO GITHUB');
  ghBtn.addEventListener('click', async () => {
    const cfg = { owner: owner.value.trim(), repo: repo.value.trim(), branch: branch.value.trim(), token: token.value.trim(), message: message.value.trim() || 'Edit maps in the map editor' };
    if (!cfg.owner || !cfg.repo || !cfg.token) { say('Fill in the repo and a token first.', 'red'); return; }
    try { localStorage.setItem(GH_KEY, JSON.stringify({ owner: cfg.owner, repo: cfg.repo, branch: cfg.branch, token: remember.checked ? cfg.token : '' })); } catch { /* fine */ }
    setBusy(true);
    try {
      const r = await publishToGitHub(ws, cfg, (m) => say(m));
      if (!r) { setBusy(false); return; }
      ws.markPublished();
      done();
      say([h('b', 'Published. '), `One commit to ${cfg.owner}/${cfg.repo} on ${r.branch}: `, h('a', { href: r.url, target: '_blank', rel: 'noopener' }, r.sha.slice(0, 7)), '. ',
        r.deploys ? ['The game redeploys in about a minute (', h('a', { href: `https://github.com/${cfg.owner}/${cfg.repo}/actions`, target: '_blank', rel: 'noopener' }, 'watch it'), '). Until then this browser keeps playing your drafts, so nothing looks different here.']
          : `Heads up: the game deploys from ${r.deployBranch}, not ${r.branch}. Merge it there to put it in the game.`], 'gold');
      toast('Published to GitHub', 'ok');
    } catch (e) {
      say(`GitHub said no: ${e.message}`, 'red');
    }
    setBusy(false);
  });

  // ---- local server (node tools/editor-server.mjs) ----
  const server = await probeServer();
  const srvBtn = h('button.btn.primary', { type: 'button', disabled: !n }, 'SAVE INTO THE REPO');
  srvBtn.addEventListener('click', async () => {
    setBusy(true);
    try {
      const plan2 = ws.publishFiles();
      const res = await fetch('__editor/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Editor-Save': '1' },
        body: JSON.stringify({ files: plan2.files, deletions: plan2.deletions }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || res.status);
      ws.markPublished();
      done();
      say([h('b', 'Saved. '), `Wrote ${j.written.length} file${j.written.length === 1 ? '' : 's'} into ${j.root}${j.deleted.length ? ` and removed ${j.deleted.length}` : ''}. Commit and push them to put them in the game: `, h('code', 'git add maps && git commit -m "Map edits" && git push')], 'gold');
      toast('Saved into the repo', 'ok');
    } catch (e) { say(`Couldn’t save: ${e.message}`, 'red'); }
    setBusy(false);
  });

  // ---- a folder on this computer (File System Access API) ----
  const canFolder = typeof window.showDirectoryPicker === 'function';
  const dirBtn = h('button.btn', { type: 'button', disabled: !n }, 'CHOOSE THE REPO FOLDER…');
  dirBtn.addEventListener('click', async () => {
    try {
      const dir = await window.showDirectoryPicker({ mode: 'readwrite', id: 'alien-wrangler-repo' });
      setBusy(true);
      const r = await saveToFolder(ws, dir);
      ws.markPublished();
      done();
      say([h('b', 'Saved. '), `Wrote ${r.written} file${r.written === 1 ? '' : 's'} into ${dir.name}/maps. Commit and push them to put them in the game.`], 'gold');
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      say(`Couldn’t save: ${e.message}`, 'red');
    }
    setBusy(false);
  });

  // ---- zip ----
  const zipBtn = h('button.btn', { type: 'button' }, 'DOWNLOAD .ZIP');
  zipBtn.addEventListener('click', () => { exportZip(ws, true); say('Downloaded. Unzip it into the repo (it holds a maps/ folder), then commit and push.', ''); });

  const body = h('div',
    h('p', n ? `${n} change${n > 1 ? 's' : ''} to publish:` : 'Up to date.'), changes,
    server ? h('div.pub-option.best', h('h4', 'SAVE INTO THE REPO ON THIS COMPUTER'),
      h('p', 'The local editor server is running, so the files can go straight into ', h('code', server.root), '.'), srvBtn) : null,
    h(`div.pub-option${server ? '' : '.best'}`, h('h4', 'COMMIT TO GITHUB'),
      h('p', 'Commits the files to the repo in one go. Once they land on the branch the game deploys from, everyone gets your maps. Works from a phone too.'),
      h('div.field', h('div.k', 'Repo'), h('div.v', owner, h('span.xy', '/'), repo)),
      h('div.field', h('div.k', 'Branch'), h('div.v', branch)),
      h('div.field', h('div.k', 'Token'), h('div.v', token)),
      h('label.check', remember, h('span', 'Remember the token on this device', h('small', 'Kept in this browser only. Leave it off on a shared computer.'))),
      h('div.field', h('div.k', 'Message'), h('div.v', message)),
      h('details', { style: { margin: '6px 0 10px', fontSize: '12.5px', color: '#c9d1e4' } }, h('summary', { style: { cursor: 'pointer', color: '#6ec2ff' } }, 'How do I get a token?'),
        h('ol', h('li', 'On GitHub: your picture › ', h('b', 'Settings'), ' › ', h('b', 'Developer settings'), ' › ', h('b', 'Personal access tokens'), ' › ', h('b', 'Fine-grained tokens'), ' › ', h('b', 'Generate new token'),
          ' (', h('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener' }, 'direct link'), ').'),
          h('li', h('b', 'Repository access'), ': ', h('i', 'Only select repositories'), ' › this game’s repo.'),
          h('li', h('b', 'Permissions'), ' › ', h('b', 'Contents'), ': ', h('i', 'Read and write'), '. Nothing else.'),
          h('li', 'Generate, copy, paste it here.'))),
      ghBtn),
    canFolder ? h('div.pub-option', h('h4', 'SAVE INTO A FOLDER'), h('p', 'Pick your copy of the repo on this computer; the files are written into its maps/ folder. Then commit and push.'), dirBtn) : null,
    h('div.pub-option', h('h4', 'DOWNLOAD THE FILES'), h('p', 'A .zip with the maps/ folder to drop into the repo (or hand to whoever commits for you).'), zipBtn),
    status);
  const { box } = modal({ title: 'PUBLISH', body, wide: true, buttons: [{ label: 'Close' }] });
}

function commitMessage(ws, pend) {
  const names = pend.maps.map(c => ws.name(c.id));
  const bits = [];
  if (names.length) bits.push(names.length <= 3 ? names.join(', ') : `${names.length} maps`);
  if (pend.assets) bits.push('assets');
  return bits.length ? `Map editor: update ${bits.join(' + ')}` : 'Map editor edits';
}

/* ---------------- GitHub (Git Data API) ---------------- */

async function api(cfg, path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    method: opts.method || 'GET',
    headers: {
      Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 404 && opts.allow404) return null;
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const why = res.status === 401 ? 'the token was refused (expired, or mistyped?)'
      : res.status === 403 ? `no permission (${j.message || 'forbidden'}): the token needs Contents: Read and write on this repo`
        : res.status === 404 ? 'not found: check the repo name and branch, and that the token can see this repo'
          : (j.message || `HTTP ${res.status}`);
    const err = new Error(why);
    err.status = res.status;
    throw err;
  }
  return j;
}

const b64decode = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, '')), c => c.charCodeAt(0)));

async function remoteText(cfg, path, ref) {
  const j = await api(cfg, `/repos/${cfg.owner}/${cfg.repo}/contents/${path}?ref=${encodeURIComponent(ref)}`, { allow404: true });
  if (!j) return null;
  if (j.content) return b64decode(j.content);
  // over 1MB: fetch the blob
  const blob = await api(cfg, `/repos/${cfg.owner}/${cfg.repo}/git/blobs/${j.sha}`);
  return b64decode(blob.content);
}

export async function publishToGitHub(ws, cfg, progress) {
  progress('Checking the repo…');
  const info = await api(cfg, `/repos/${cfg.owner}/${cfg.repo}`);
  const branch = cfg.branch || info.default_branch;
  if (info.permissions && !info.permissions.push) throw new Error('this token (or account) can’t push to the repo');
  const plan = ws.publishFiles();
  // the repo may have moved on since the editor loaded (published from
  // another device): merge with its manifest, and don't clobber a map
  // someone else changed without asking
  progress('Reading what’s published there now…');
  const remoteManifestText = await remoteText(cfg, 'maps/manifest.json', branch);
  let remote = { maps: [], assets: false };
  try { if (remoteManifestText) remote = JSON.parse(remoteManifestText); } catch { /* treat as empty */ }
  const changedThere = [];
  for (const c of plan.pend.maps) {
    if (!(remote.maps || []).includes(c.id)) continue;
    const t = await remoteText(cfg, `maps/${c.id}.json`, branch);
    let theirs = null;
    try { theirs = t && JSON.parse(t); } catch { /* unreadable */ }
    const ours = ws.published.maps[c.id];
    if (theirs && (!ours || canon(theirs) !== canon(ours))) changedThere.push(c.id);
  }
  if (changedThere.length && !confirm(`These maps were changed on GitHub since this editor loaded them:\n\n${changedThere.map(id => ws.name(id)).join('\n')}\n\nPublishing replaces those changes with yours. Go ahead?`)) {
    progress('Not published (nothing changed on GitHub).');
    return null;
  }
  const maps = new Set(remote.maps || []);
  for (const c of plan.pend.maps) { if (c.action === 'delete') maps.delete(c.id); else maps.add(c.id); }
  const assetsOn = plan.pend.assets ? plan.pend.assets !== 'delete' : !!remote.assets || !!plan.manifest.assets;
  const files = { ...plan.files };
  files['maps/manifest.json'] = JSON.stringify({ format: MANIFEST_FORMAT, version: 1, maps: [...maps].sort(), assets: assetsOn }, null, 2) + '\n';

  for (let attempt = 0; attempt < 2; attempt++) {
    progress(`Writing ${Object.keys(files).length + plan.deletions.length} file${Object.keys(files).length + plan.deletions.length > 1 ? 's' : ''}…`);
    const ref = await api(cfg, `/repos/${cfg.owner}/${cfg.repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    const head = await api(cfg, `/repos/${cfg.owner}/${cfg.repo}/git/commits/${ref.object.sha}`);
    const tree = Object.entries(files).map(([path, content]) => ({ path, mode: '100644', type: 'blob', content }));
    for (const path of plan.deletions) {
      // only delete what's actually there
      const there = await api(cfg, `/repos/${cfg.owner}/${cfg.repo}/contents/${path}?ref=${encodeURIComponent(branch)}`, { allow404: true });
      if (there) tree.push({ path, mode: '100644', type: 'blob', sha: null });
    }
    const newTree = await api(cfg, `/repos/${cfg.owner}/${cfg.repo}/git/trees`, { method: 'POST', body: { base_tree: head.tree.sha, tree } });
    const commit = await api(cfg, `/repos/${cfg.owner}/${cfg.repo}/git/commits`, { method: 'POST', body: { message: cfg.message, tree: newTree.sha, parents: [head.sha] } });
    try {
      await api(cfg, `/repos/${cfg.owner}/${cfg.repo}/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', body: { sha: commit.sha, force: false } });
    } catch (e) {
      if (e.status === 422 && attempt === 0) { progress('Someone pushed at the same moment; trying again…'); continue; }
      throw e;
    }
    const deployBranches = ['Alien-Wrangler-Main', 'main'];
    return { sha: commit.sha, url: commit.html_url || `https://github.com/${cfg.owner}/${cfg.repo}/commit/${commit.sha}`, branch,
      deploys: deployBranches.includes(branch), deployBranch: info.default_branch };
  }
  throw new Error('the branch kept moving; try again');
}

/* ---------------- local server + folder ---------------- */

async function probeServer() {
  try {
    const r = await fetch('__editor/ping', { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.ok ? j : null;
  } catch { return null; }
}

async function saveToFolder(ws, dir) {
  // make sure it's the game's repo
  try { await dir.getFileHandle('index.html'); await dir.getDirectoryHandle('js'); }
  catch { throw new Error('that folder doesn’t look like the game’s repo (no index.html + js/ in it)'); }
  const mapsDir = await dir.getDirectoryHandle('maps', { create: true });
  const plan = ws.publishFiles();
  // merge with the manifest already on disk
  let disk = { maps: [], assets: false };
  try { disk = JSON.parse(await (await (await mapsDir.getFileHandle('manifest.json')).getFile()).text()); } catch { /* none yet */ }
  const maps = new Set(disk.maps || []);
  for (const c of plan.pend.maps) { if (c.action === 'delete') maps.delete(c.id); else maps.add(c.id); }
  const files = { ...plan.files };
  files['maps/manifest.json'] = JSON.stringify({ format: MANIFEST_FORMAT, version: 1, maps: [...maps].sort(),
    assets: plan.pend.assets ? plan.pend.assets !== 'delete' : !!disk.assets || !!plan.manifest.assets }, null, 2) + '\n';
  let written = 0;
  for (const [path, content] of Object.entries(files)) {
    const name = path.replace(/^maps\//, '');
    const fh = await mapsDir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(content);
    await w.close();
    written++;
  }
  for (const path of plan.deletions) { try { await mapsDir.removeEntry(path.replace(/^maps\//, '')); } catch { /* already gone */ } }
  return { written };
}

/* ---------------- export / import ---------------- */

// Every edited map (published + drafts) and the assets, as a zip with a maps/ folder.
export function exportZip(ws, pendingOnly = false) {
  ws.flush();
  const files = [];
  const ids = new Set();
  if (pendingOnly) {
    const plan = ws.publishFiles();
    for (const [path, content] of Object.entries(plan.files)) files.push({ name: path, data: content });
  } else {
    for (const id of ws.mapIds()) {
      const st = ws.status(id);
      if (!st.draft && !st.published) continue;
      ids.add(id);
      files.push({ name: `maps/${id}.json`, data: formatDoc(ws.doc(id)) });
    }
    const hasAssets = Object.values(ws.assetBundle).some(v => v && typeof v === 'object' && Object.keys(v).length);
    if (hasAssets) files.push({ name: 'maps/assets.json', data: JSON.stringify(normalizeBundle(ws.assetBundle), null, 1) + '\n' });
    files.push({ name: 'maps/manifest.json', data: JSON.stringify({ format: MANIFEST_FORMAT, version: 1, maps: [...ids].sort(), assets: hasAssets }, null, 2) + '\n' });
  }
  if (!files.length) { toast('Nothing edited yet', 'warn'); return; }
  download(`alien-wrangler-maps-${new Date().toISOString().slice(0, 10)}.zip`, makeZip(files), 'application/zip');
}

// .json map files, an assets.json, or a .zip of them.
export async function importFiles(ws, files) {
  const entries = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name) || f.type === 'application/zip') entries.push(...await readZip(await f.arrayBuffer()));
    else entries.push({ name: f.name, text: await f.text() });
  }
  const out = { maps: [], assets: false };
  for (const e of entries) {
    if (!/\.json$/i.test(e.name)) continue;
    let j;
    try { j = JSON.parse(e.text); } catch { throw new Error(`${e.name} isn’t valid JSON`); }
    if (j.format === MANIFEST_FORMAT) continue;
    if (j.format === ASSETS_FORMAT) {
      for (const k of ['props', 'customProps', 'tiles', 'customTiles', 'actors']) Object.assign(ws.assetBundle[k], j[k] || {});
      await applyAssetBundle(ws.assets, j);
      ws.assetsChanged();
      out.assets = true;
      continue;
    }
    if ((j.ground && j.objects) || j.strip) {
      const id = j.id || e.name.replace(/^.*\//, '').replace(/\.json$/i, '');
      const doc = ws.importDoc(j, id);
      out.maps.push(doc.id);
      continue;
    }
    throw new Error(`${e.name} isn’t a map or an assets file`);
  }
  return out;
}
