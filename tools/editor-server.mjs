#!/usr/bin/env node
// Local server for the game + map editor, with saving.
//
//   node tools/editor-server.mjs [port]        (default 8080)
//
// Serves the repo like any static server (open http://localhost:8080/ for
// the game, /editor.html for the editor), and lets the editor's PUBLISH
// write its files straight into the repo's maps/ folder, ready to commit.
// It only listens on this computer (127.0.0.1), only writes maps/*.json,
// and only answers save requests from the editor's own page.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.argv[2] || process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};
const SAVE_PATH = /^maps\/[a-z0-9][a-z0-9_-]*\.json$/;
const MAX_BODY = 32 * 1024 * 1024;

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > MAX_BODY) throw new Error('too big');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function save(req, res) {
  // a custom header can't be sent cross-site without a CORS preflight,
  // which this server never approves: only the editor's own page gets here
  if (req.headers['x-editor-save'] !== '1') return send(res, 403, { ok: false, error: 'missing X-Editor-Save header' });
  let body;
  try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { ok: false, error: `bad request: ${e.message}` }); }
  const files = body && typeof body.files === 'object' ? body.files : {};
  const deletions = Array.isArray(body && body.deletions) ? body.deletions : [];
  for (const p of [...Object.keys(files), ...deletions]) {
    if (!SAVE_PATH.test(p)) return send(res, 400, { ok: false, error: `refusing to write ${p}: only maps/<name>.json` });
  }
  for (const [p, content] of Object.entries(files)) {
    if (typeof content !== 'string') return send(res, 400, { ok: false, error: `${p}: content must be text` });
    try { JSON.parse(content); } catch { return send(res, 400, { ok: false, error: `${p}: not valid JSON` }); }
  }
  await fs.mkdir(path.join(ROOT, 'maps'), { recursive: true });
  const written = [], deleted = [];
  for (const [p, content] of Object.entries(files)) {
    await fs.writeFile(path.join(ROOT, p), content);
    written.push(p);
  }
  for (const p of deletions) {
    try { await fs.unlink(path.join(ROOT, p)); deleted.push(p); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  for (const p of written) console.log(`  wrote   ${p}`);
  for (const p of deleted) console.log(`  removed ${p}`);
  send(res, 200, { ok: true, written, deleted, root: ROOT });
}

async function serve(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(ROOT, `.${rel}`);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(res, 403, 'forbidden', 'text/plain');
  if (path.relative(ROOT, file).split(path.sep).some(seg => seg.startsWith('.') && seg !== '.')) return send(res, 404, 'not found', 'text/plain');
  try {
    const data = await fs.readFile(file);
    send(res, 200, data, TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  } catch {
    send(res, 404, 'not found', 'text/plain');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/__editor/ping') return send(res, 200, { ok: true, root: ROOT });
    if (url.pathname === '/__editor/save') {
      if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'POST only' });
      return await save(req, res);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed', 'text/plain');
    return await serve(req, res, url.pathname);
  } catch (e) {
    console.error(e);
    send(res, 500, { ok: false, error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Alien Wrangler on http://localhost:${PORT}/  (editor: http://localhost:${PORT}/editor.html)`);
  console.log(`PUBLISH in the editor saves into ${path.join(ROOT, 'maps')}`);
});
