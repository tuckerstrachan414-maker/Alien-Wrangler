// Small DOM helpers for the editor: element building, modals, toasts, menus,
// file download / pick.

export const $ = (sel, root = document) => root.querySelector(sel);

// h('div.cls#id', { onclick, title, ... }, child, 'text', [more]) -> element
export function h(spec, attrs, ...kids) {
  const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(spec) || [];
  const el = document.createElement(m[1] || 'div');
  for (const part of (m[2] || '').match(/[.#][\w-]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export function toast(msg, kind = 'info', ms = 2800) {
  const root = $('#toast-root');
  const t = h(`div.toast.${kind}`, msg);
  root.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity 0.3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, ms);
}

// modal({ title, body, buttons: [{ label, kind, onClick }], wide, onClose })
// onClick may return false (or a promise of false) to keep it open.
export function modal({ title, body, buttons = [{ label: 'OK' }], wide = false, onClose = null }) {
  const root = $('#modal-root');
  const foot = h('div.modal-foot');
  const box = h(`div.modal${wide ? '.wide' : ''}`, { role: 'dialog', 'aria-modal': 'true' },
    h('div.modal-title', title), h('div.modal-body', body), foot);
  const back = h('div.modal-back', box);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    back.remove();
    document.removeEventListener('keydown', onKey, true);
    if (onClose) onClose();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
  };
  for (const b of buttons) {
    const btn = h(`button.btn${b.kind ? '.' + b.kind : ''}`, b.label);
    btn.addEventListener('click', async () => {
      if (b.onClick) {
        btn.disabled = true;
        let keep;
        try { keep = await b.onClick(close); } finally { btn.disabled = false; }
        if (keep === false) return;
      }
      close();
    });
    foot.appendChild(btn);
  }
  back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
  document.addEventListener('keydown', onKey, true);
  root.appendChild(back);
  const first = box.querySelector('input, select, textarea');
  if (first) setTimeout(() => first.focus(), 30);
  return { close, box };
}

export function confirmBox(title, text, okLabel = 'OK', danger = false) {
  return new Promise((resolve) => {
    let answered = false;
    modal({
      title, body: h('p', text),
      buttons: [
        { label: 'Cancel', onClick: () => { answered = true; resolve(false); } },
        { label: okLabel, kind: danger ? 'danger' : 'primary', onClick: () => { answered = true; resolve(true); } },
      ],
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

// formBox(title, [{ key, label, type: 'text'|'number'|'select'|'checkbox', value, options, min, max, help }], okLabel)
export function formBox(title, fields, okLabel = 'OK', intro = null, validate = null) {
  return new Promise((resolve) => {
    const inputs = {};
    const err = h('div.note-box.red.hidden');
    const body = h('div', intro ? h('p', intro) : null, fields.map(f => {
      let input;
      if (f.type === 'select') {
        input = h('select', f.options.map(o => h('option', { value: o.value, selected: String(o.value) === String(f.value) }, o.label)));
      } else if (f.type === 'checkbox') {
        input = h('input', { type: 'checkbox', checked: !!f.value });
      } else {
        input = h('input', { type: f.type || 'text', value: f.value ?? '', min: f.min, max: f.max, placeholder: f.placeholder || '' });
        if (f.type !== 'number') input.style.width = '100%';
      }
      inputs[f.key] = input;
      return h('div.field', h('div.k', f.label), h('div.v', input, f.help ? h('div.hint', f.help) : null));
    }), err);
    let done = false;
    const read = () => {
      const out = {};
      for (const f of fields) {
        const i = inputs[f.key];
        out[f.key] = f.type === 'checkbox' ? i.checked : f.type === 'number' ? +i.value : i.value;
      }
      return out;
    };
    modal({
      title, body,
      buttons: [
        { label: 'Cancel', onClick: () => { done = true; resolve(null); } },
        {
          label: okLabel, kind: 'primary', onClick: () => {
            const v = read();
            const problem = validate && validate(v);
            if (problem) { err.textContent = problem; err.classList.remove('hidden'); return false; }
            done = true; resolve(v);
          },
        },
      ],
      onClose: () => { if (!done) resolve(null); },
    });
  });
}

// A little popup menu under an element: items [{ label, onClick, danger } | '-'].
export function popupMenu(anchor, items) {
  const r = anchor.getBoundingClientRect();
  const menu = h('div.menu', items.map(it => it === '-' ? h('hr') :
    h(`button${it.danger ? '.danger' : ''}`, { disabled: !!it.disabled, onclick: () => { close(); it.onClick(); } }, it.label)));
  document.body.appendChild(menu);
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  menu.style.left = `${Math.max(6, Math.min(window.innerWidth - mw - 6, r.right - mw))}px`;
  menu.style.top = `${Math.min(window.innerHeight - mh - 6, r.bottom + 4)}px`;
  const away = (e) => { if (!menu.contains(e.target)) close(); };
  const close = () => { menu.remove(); document.removeEventListener('pointerdown', away, true); };
  setTimeout(() => document.addEventListener('pointerdown', away, true), 0);
  return close;
}

export function download(name, data, type = 'application/json') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function pickFile(accept = '', multiple = false) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, multiple });
    input.addEventListener('change', () => resolve([...input.files]));
    input.click();
  });
}

// An image's pixels drawn at `scale` into a fresh canvas that fits w x h.
export function thumb(img, w, h2) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h2;
  if (!img) return c;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  const s = Math.min(w / img.width, h2 / img.height);
  const k = s >= 1 ? Math.floor(s) : s;
  const dw = img.width * k, dh = img.height * k;
  x.drawImage(img, Math.round((w - dw) / 2), Math.round((h2 - dh) / 2), dw, dh);
  return c;
}

export const slug = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
