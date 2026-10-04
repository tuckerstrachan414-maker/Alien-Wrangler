// The signal transcript: the case folder Voss hands over in Stage 2's
// briefing (and the SIGNAL FILE button on the Story menu brings it back).
// A manila folder flips open onto a classified page. The decoded words are
// printed in plain type, a line at a time, with the typewriter; the words
// nobody has cracked yet are runs of !@#$& symbols, the same length as the
// word, that never stop re-rolling.
//
// The words live in data/stage2.js (SIGNAL): a word in [square brackets] is
// one that hasn't been deciphered.
//
//   openTranscript(root, { onClose }) -> { el, close() }
//
// Tap the page to show every line at once; CLOSE FILE, a tap outside the
// folder, or close() (Esc / B from the cutscene) puts it away.
import { SIGNAL } from './data/stage2.js';
import { sfx } from './audio.js';
import { drawSeal } from './briefing.js';

const SYMBOLS = '!@#$&*%?';
const LINE_GAP = 0.32;      // seconds between lines appearing
const SCRAMBLE_MS = 80;     // how often the undeciphered symbols re-roll

const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function scramble(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  return s;
}

// One line of the page: plain words as text, [words] as scramble spans that
// remember how many symbols they show.
function lineHtml(line) {
  return line.split(/(\[[^\]]+\])/).map((part) => {
    const m = /^\[([^\]]+)\]$/.exec(part);
    if (!m) return esc(part);
    const n = m[1].length;
    return `<span class="scramble" data-n="${n}">${esc(scramble(n))}</span>`;
  }).join('');
}

export function openTranscript(root, { onClose } = {}) {
  const veil = document.createElement('div');
  veil.className = 'tx-veil';
  veil.innerHTML =
    '<div class="tx-folder">' +
      '<div class="tx-tab">CASE FILE</div>' +
      '<div class="tx-cover"><b>CLASSIFIED</b><small>PROPERTY OF THE DIRECTORATE</small></div>' +
      '<div class="paper tx-paper">' +
        '<div class="doc-class">TOP SECRET // EBE // NOFORN</div>' +
        '<div class="doc-head"><canvas class="doc-seal pixel-canvas" width="26" height="26"></canvas>' +
          '<div class="doc-org">CENTRAL INTELLIGENCE AGENCY<small>DIRECTORATE OF EXTRATERRESTRIAL AFFAIRS</small></div></div>' +
        `<div class="tx-title">${esc(SIGNAL.title)}<small>${esc(SIGNAL.sub)}</small></div>` +
        `<div class="doc-facts">${SIGNAL.meta.map(([k, v]) => `<div><i>${esc(k)}</i><b>${esc(v)}</b></div>`).join('')}</div>` +
        `<div class="tx-body">${SIGNAL.body.map(l => `<p class="tx-line">${lineHtml(l)}</p>`).join('')}</div>` +
        `<div class="doc-small tx-note">${esc(SIGNAL.note)}</div>` +
        '<div class="doc-class">TOP SECRET // EBE // NOFORN</div>' +
      '</div>' +
      '<button class="menu-btn primary tx-close">CLOSE FILE</button>' +
    '</div>';
  drawSeal(veil.querySelector('.doc-seal'));
  root.appendChild(veil);
  sfx.paper();

  const folder = veil.querySelector('.tx-folder');
  const paper = veil.querySelector('.tx-paper');
  const lines = [...veil.querySelectorAll('.tx-line')];
  const spans = [...veil.querySelectorAll('.scramble')];

  // the lines come up one at a time, each with a clack of the typewriter
  let shown = 0;
  const timers = [];
  const reveal = (i) => {
    if (i < shown) return;
    for (; shown <= i && shown < lines.length; shown++) lines[shown].classList.add('on');
    sfx.type();
  };
  lines.forEach((_, i) => timers.push(setTimeout(() => reveal(i), 450 + i * LINE_GAP * 1000)));

  // ...and the undeciphered words never sit still
  const roll = setInterval(() => {
    for (const s of spans) s.textContent = scramble(+s.dataset.n);
  }, SCRAMBLE_MS);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    timers.forEach(clearTimeout);
    clearInterval(roll);
    sfx.paper();
    veil.classList.add('out');
    setTimeout(() => veil.remove(), 220);
    if (onClose) onClose();
  };

  // taps inside the folder never reach whatever is underneath (the cutscene
  // moving on); a tap on the page shows the rest of it straight away
  folder.addEventListener('click', (e) => e.stopPropagation());
  paper.addEventListener('click', () => { if (shown < lines.length) reveal(lines.length - 1); });
  veil.querySelector('.tx-close').addEventListener('click', (e) => { e.stopPropagation(); sfx.click(); close(); });
  veil.addEventListener('click', (e) => { e.stopPropagation(); close(); });

  return { el: veil, close, get closed() { return closed; } };
}
