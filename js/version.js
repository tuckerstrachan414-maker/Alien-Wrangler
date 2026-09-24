// Tiny always-on build tag pinned to the very top of the screen, so it's
// obvious at a glance whether you're looking at a stale/cached page or an
// old branch. version.json is written fresh by the deploy workflow on every
// push (commit + branch + build time) — never hand-edited, so it can't go
// stale the way a manually bumped version number would.
export async function initVersionBadge() {
  const el = document.getElementById('build-version');
  if (!el) return;
  try {
    const res = await fetch('version.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`version.json ${res.status}`);
    const v = await res.json();
    const stamp = (v.built || '').slice(0, 16).replace('T', ' ');
    el.textContent = `${v.branch || '?'} · ${v.sha || '?'}${stamp ? ' · ' + stamp + 'z' : ''}`;
  } catch {
    // No version.json = this isn't a deployed build (local file server, no
    // workflow run yet). Say so plainly instead of showing stale/fake info.
    el.textContent = 'local dev build — no version.json';
  }
}
