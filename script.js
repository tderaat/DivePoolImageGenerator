// ============================================================
// FS4 Dive Pool Generator
// ============================================================
// Each formation has its own PNG under /images/randoms/ or /images/blocks/.
// Rebuild them by running `node tools/crop.js` after editing the composites.
// ============================================================

const RANDOM_IMG = (code) => `images/randoms/${code}.png`;
const BLOCK_IMG = (n) => `images/blocks/${n}.png`;

// 16 randoms — A–H, J–Q (no I).
const RANDOM_CODES = [
  'A', 'B', 'C', 'D',
  'E', 'F', 'G', 'H',
  'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q',
];

const VALID_RANDOM = new Set(RANDOM_CODES);

// ============================================================
// Parser
// ============================================================

function parseJump(line) {
  const tokens = line.split(/[-\s]+/).map(t => t.trim()).filter(t => t.length > 0);
  const elements = [];
  const errors = [];

  if (tokens.length === 0) {
    errors.push('empty jump');
    return { original: line, elements, errors };
  }

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      const n = parseInt(token, 10);
      if (n >= 1 && n <= 22) {
        elements.push({ type: 'block', number: n });
      } else {
        errors.push(`"${token}" is not a valid block (1–22)`);
      }
    } else if (/^[A-Za-z]$/.test(token)) {
      const letter = token.toUpperCase();
      if (VALID_RANDOM.has(letter)) {
        elements.push({ type: 'random', code: letter });
      } else {
        errors.push(`"${token}" is not a valid random (A–H, J–Q)`);
      }
    } else {
      errors.push(`"${token}" is not a recognized token`);
    }
  }

  return { original: line, elements, errors };
}

function parseJumps(text) {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(parseJump);
}

// ============================================================
// Renderer
// ============================================================

function makeFormationCell(src, alt) {
  const img = document.createElement('img');
  img.className = 'formation';
  img.src = src;
  img.alt = alt;
  img.onerror = () => {
    img.classList.add('missing');
    img.removeAttribute('src');
    img.textContent = alt;
  };
  return img;
}

function renderRandom(code, container) {
  const img = makeFormationCell(RANDOM_IMG(code), code);
  img.classList.add('random');
  container.appendChild(img);
}

function renderBlock(n, container) {
  const img = makeFormationCell(BLOCK_IMG(n), String(n));
  img.classList.add('block');
  container.appendChild(img);
}

function renderJump(parsed, resultsEl) {
  if (parsed.errors.length > 0) {
    const row = document.createElement('div');
    row.className = 'error-row';

    const label = document.createElement('span');
    label.className = 'error-label';
    label.textContent = parsed.original;
    row.appendChild(label);

    const msg = document.createElement('span');
    msg.textContent = parsed.errors.join('; ');
    row.appendChild(msg);

    resultsEl.appendChild(row);
    return;
  }

  const row = document.createElement('div');
  row.className = 'jump-row';

  const code = document.createElement('div');
  code.className = 'jump-code';
  code.textContent = `Jump: ${parsed.original}`;
  row.appendChild(code);

  const seq = document.createElement('div');
  seq.className = 'jump-sequence';

  for (const element of parsed.elements) {
    if (element.type === 'random') {
      renderRandom(element.code, seq);
    } else {
      renderBlock(element.number, seq);
    }
  }

  row.appendChild(seq);
  resultsEl.appendChild(row);
}

// ============================================================
// URL sharing — jumps stored in `?jumps=` as pipe-separated lines
// ============================================================

function writeUrl(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const url = new URL(window.location.href);
  if (lines.length === 0) {
    url.searchParams.delete('jumps');
  } else {
    url.searchParams.set('jumps', lines.map(encodeURIComponent).join('|'));
  }
  window.history.replaceState(null, '', url.toString());
}

function readUrl() {
  const raw = new URLSearchParams(window.location.search).get('jumps');
  if (!raw) return null;
  return raw.split('|').map(decodeURIComponent).join('\n');
}

// ============================================================
// Wiring
// ============================================================

function generate() {
  const input = document.getElementById('jumps-input').value;
  const results = document.getElementById('results');
  results.innerHTML = '';
  writeUrl(input);

  const jumps = parseJumps(input);
  if (jumps.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Paste jumps above, then click Generate.';
    results.appendChild(empty);
    return;
  }

  for (const jump of jumps) {
    renderJump(jump, results);
  }
}

function clearAll() {
  document.getElementById('jumps-input').value = '';
  document.getElementById('results').innerHTML = '';
  writeUrl('');
}

document.getElementById('generate-btn').addEventListener('click', generate);
document.getElementById('clear-btn').addEventListener('click', clearAll);
document.getElementById('print-btn').addEventListener('click', () => window.print());

// Ctrl/Cmd+Enter inside the textarea also generates.
document.getElementById('jumps-input').addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    generate();
  }
});

// Auto-generate after a paste — wait a tick so the pasted text is in the value.
document.getElementById('jumps-input').addEventListener('paste', () => {
  setTimeout(generate, 0);
});

// On load: if URL has jumps, overwrite the default and render.
(function init() {
  const fromUrl = readUrl();
  if (fromUrl !== null) {
    document.getElementById('jumps-input').value = fromUrl;
  }
  generate();
})();
