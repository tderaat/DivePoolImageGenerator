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
// Color recoloring — map source jumper colors to user-picked hues
// ============================================================

const DEFAULT_COLORS = {
  point:   '#d23a28',
  tail:    '#f0cd2a',
  inside:  '#3182ce',
  outside: '#4aa04a',
};

let currentColors = { ...DEFAULT_COLORS };
const sourceImageCache = new Map();   // src -> ImageData
let recolorGeneration = 0;            // invalidates stale renders when colors change

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s; const l = (max + min) / 2;
  if (max === min) { h = 0; s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r)      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else                h = ((r - g) / d + 4) / 6;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  if (s === 0) return [Math.round(l * 255), Math.round(l * 255), Math.round(l * 255)];
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

// Classify a pixel by hue — returns 'point' | 'tail' | 'inside' | 'outside' | null.
// Filters out greyscale (low saturation) and near-black/near-white (extreme lightness).
function classifyHue(r, g, b) {
  const [h, s, l] = rgbToHsl(r, g, b);
  if (s < 0.18) return null;
  if (l < 0.15 || l > 0.92) return null;
  const hDeg = h * 360;
  if (hDeg < 22 || hDeg > 340)  return 'point';    // red
  if (hDeg >= 35 && hDeg < 75)  return 'tail';     // yellow
  if (hDeg >= 85 && hDeg < 170) return 'outside';  // green
  if (hDeg >= 180 && hDeg < 250) return 'inside';  // blue
  return null;
}

function recolorPixels(data, colorMap) {
  const targetHues = {};
  for (const key of Object.keys(colorMap)) {
    const [r, g, b] = hexToRgb(colorMap[key]);
    targetHues[key] = rgbToHsl(r, g, b)[0];
  }
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const cat = classifyHue(r, g, b);
    if (cat !== null) {
      const [, s, l] = rgbToHsl(r, g, b);
      const [nr, ng, nb] = hslToRgb(targetHues[cat], s, l);
      data[i] = nr; data[i + 1] = ng; data[i + 2] = nb;
    }
  }
}

function colorsMatchDefaults() {
  return Object.keys(DEFAULT_COLORS).every(
    k => currentColors[k].toLowerCase() === DEFAULT_COLORS[k].toLowerCase()
  );
}

async function getSourceImageData(src) {
  if (sourceImageCache.has(src)) return sourceImageCache.get(src);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  sourceImageCache.set(src, data);
  return data;
}

async function applyColorsToImg(imgEl, src) {
  // If colors match defaults, just show raw source (no recolor overhead, no canvas risk).
  if (colorsMatchDefaults()) {
    imgEl.src = src;
    return;
  }
  const generation = recolorGeneration;
  try {
    const original = await getSourceImageData(src);
    if (generation !== recolorGeneration) return; // a newer color change superseded this
    const copy = new ImageData(
      new Uint8ClampedArray(original.data),
      original.width,
      original.height
    );
    recolorPixels(copy.data, currentColors);
    const canvas = document.createElement('canvas');
    canvas.width = copy.width;
    canvas.height = copy.height;
    canvas.getContext('2d').putImageData(copy, 0, 0);
    imgEl.src = canvas.toDataURL();
  } catch (e) {
    // Canvas tainted (e.g. opened via file://) — fall back to raw image.
    imgEl.src = src;
  }
}

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
  img.dataset.src = src;
  img.alt = alt;
  img.onerror = () => {
    img.classList.add('missing');
    img.removeAttribute('src');
    img.textContent = alt;
  };
  applyColorsToImg(img, src);
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

function renderJump(parsed, resultsEl, jumpNumber) {
  if (parsed.errors.length > 0) {
    const row = document.createElement('div');
    row.className = 'error-row';

    const label = document.createElement('span');
    label.className = 'error-label';
    label.textContent = `Jump ${jumpNumber}: ${parsed.original}`;
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
  code.textContent = `Jump ${jumpNumber}: ${parsed.original}`;
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
// Persistence — jumps + colors saved to localStorage so the
// browser remembers them between sessions. URL params still
// take precedence for jumps (for sharing).
// ============================================================

const STORAGE_KEY_JUMPS = 'divepool.jumps';
const STORAGE_KEY_COLORS = 'divepool.colors';

function saveJumpsToStorage(text) {
  try { localStorage.setItem(STORAGE_KEY_JUMPS, text); } catch (_) {}
}
function readJumpsFromStorage() {
  try { return localStorage.getItem(STORAGE_KEY_JUMPS); } catch (_) { return null; }
}
function saveColorsToStorage(colors) {
  try { localStorage.setItem(STORAGE_KEY_COLORS, JSON.stringify(colors)); } catch (_) {}
}
function readColorsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_COLORS);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

// ============================================================
// URL sharing — jumps + colors in query params.
//   ?jumps=21+M+F|D-1-G-14
//   &colors=d23a28,f0cd2a,3182ce,4aa04a   (only when non-default)
// ============================================================

function syncUrl(jumpsText) {
  const lines = jumpsText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const url = new URL(window.location.href);
  if (lines.length === 0) {
    url.searchParams.delete('jumps');
  } else {
    url.searchParams.set('jumps', lines.map(encodeURIComponent).join('|'));
  }
  if (colorsMatchDefaults()) {
    url.searchParams.delete('colors');
  } else {
    const packed = ['point', 'tail', 'inside', 'outside']
      .map(k => currentColors[k].replace('#', ''))
      .join(',');
    url.searchParams.set('colors', packed);
  }
  window.history.replaceState(null, '', url.toString());
}

function readUrl() {
  const params = new URLSearchParams(window.location.search);
  const jumpsRaw = params.get('jumps');
  const colorsRaw = params.get('colors');
  const jumps = jumpsRaw
    ? jumpsRaw.split('|').map(decodeURIComponent).join('\n')
    : null;
  let colors = null;
  if (colorsRaw) {
    const parts = colorsRaw.split(',');
    if (parts.length === 4 && parts.every(p => /^[0-9a-fA-F]{6}$/.test(p))) {
      colors = {
        point:   '#' + parts[0],
        tail:    '#' + parts[1],
        inside:  '#' + parts[2],
        outside: '#' + parts[3],
      };
    }
  }
  return { jumps, colors };
}

// ============================================================
// Wiring
// ============================================================

function generate() {
  const input = document.getElementById('jumps-input').value;
  const results = document.getElementById('results');
  results.innerHTML = '';
  syncUrl(input);
  saveJumpsToStorage(input);

  const jumps = parseJumps(input);
  if (jumps.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Paste jumps above, then click Generate.';
    results.appendChild(empty);
    return;
  }

  jumps.forEach((jump, i) => renderJump(jump, results, i + 1));
}

function clearAll() {
  document.getElementById('jumps-input').value = '';
  document.getElementById('results').innerHTML = '';
  syncUrl('');
  saveJumpsToStorage('');
}

document.getElementById('generate-btn').addEventListener('click', generate);
document.getElementById('clear-btn').addEventListener('click', clearAll);
document.getElementById('print-btn').addEventListener('click', () => window.print());

// --- Color picker wiring ---

const COLOR_PICKER_IDS = {
  point:   'color-point',
  tail:    'color-tail',
  inside:  'color-inside',
  outside: 'color-outside',
};

let recolorScheduled = false;
function scheduleRecolorAll() {
  if (recolorScheduled) return;
  recolorScheduled = true;
  requestAnimationFrame(() => {
    recolorScheduled = false;
    recolorGeneration++;
    for (const img of document.querySelectorAll('.formation[data-src]')) {
      applyColorsToImg(img, img.dataset.src);
    }
  });
}

function onColorChange() {
  for (const key of Object.keys(COLOR_PICKER_IDS)) {
    currentColors[key] = document.getElementById(COLOR_PICKER_IDS[key]).value;
  }
  saveColorsToStorage(currentColors);
  syncUrl(document.getElementById('jumps-input').value);
  scheduleRecolorAll();
}

for (const id of Object.values(COLOR_PICKER_IDS)) {
  document.getElementById(id).addEventListener('input', onColorChange);
}

document.getElementById('reset-colors-btn').addEventListener('click', () => {
  for (const key of Object.keys(COLOR_PICKER_IDS)) {
    document.getElementById(COLOR_PICKER_IDS[key]).value = DEFAULT_COLORS[key];
    currentColors[key] = DEFAULT_COLORS[key];
  }
  saveColorsToStorage(currentColors);
  syncUrl(document.getElementById('jumps-input').value);
  scheduleRecolorAll();
});

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

// On load: restore colors + jumps. Priority: URL > localStorage > defaults.
(function init() {
  const { jumps: urlJumps, colors: urlColors } = readUrl();

  const effectiveColors = urlColors || readColorsFromStorage();
  if (effectiveColors) {
    for (const key of Object.keys(COLOR_PICKER_IDS)) {
      if (effectiveColors[key]) {
        currentColors[key] = effectiveColors[key];
        const input = document.getElementById(COLOR_PICKER_IDS[key]);
        if (input) input.value = effectiveColors[key];
      }
    }
  }

  if (urlJumps !== null) {
    document.getElementById('jumps-input').value = urlJumps;
  } else {
    const fromStorage = readJumpsFromStorage();
    if (fromStorage !== null && fromStorage.length > 0) {
      document.getElementById('jumps-input').value = fromStorage;
    }
  }
  generate();
})();
