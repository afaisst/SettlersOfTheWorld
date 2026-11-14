// Static start-menu backdrop: an abstract, flat illustration of hex tiles,
// little ships and sheep on a soft sea (an SVG drawn once; redrawn on resize).
// It replaces the live 3D view behind the menu, so nothing renders meanwhile.

const TILE = {
  forest: { top: '#5e9e57', side: '#3f7340' },
  pasture: { top: '#a9d67a', side: '#7fae55' },
  field: { top: '#f1d277', side: '#c9a84f' },
  hills: { top: '#de9a6a', side: '#b1704a' },
  mountains: { top: '#b9bcc4', side: '#8d9099' },
};
const TYPES = Object.keys(TILE);
const SAILS = ['#e0574a', '#4f7fd1', '#f4f1ea', '#f29a3c'];

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const hexPts = (x, y, r) => Array.from({ length: 6 }, (_, k) => {
  const a = (Math.PI / 180) * (60 * k - 30);
  return `${(x + Math.cos(a) * r).toFixed(1)},${(y + Math.sin(a) * r).toFixed(1)}`;
}).join(' ');

function decor(type, x, y, r, rand) {
  const s = r / 46;
  const g = (inner) => `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(3)})">${inner}</g>`;
  if (type === 'forest') {
    const trees = [[-16, 4], [6, -8], [14, 10], [-4, 16], [-20, -12]].slice(0, 3 + Math.floor(rand() * 3));
    return g(trees.map(([tx, ty]) => `<path d="M${tx} ${ty - 18} l11 22 h-22 z" fill="#2f6a35"/><rect x="${tx - 2}" y="${ty + 4}" width="4" height="5" fill="#6b4a2b"/>`).join(''));
  }
  if (type === 'field') {
    return g([-14, -4, 6, 16].map((ty) => `<path d="M-26 ${ty} q26 -7 52 0" stroke="#d6ad48" stroke-width="3.5" fill="none" stroke-linecap="round"/>`).join(''));
  }
  if (type === 'pasture') return g(sheep(-6, 2, 1) + (rand() < 0.6 ? sheep(14, -10, 0.75) : ''));
  if (type === 'hills') return g(`<path d="M-28 12 q14 -22 28 0 q14 -18 28 0" fill="#c97f52"/><rect x="-6" y="-14" width="12" height="7" rx="1.5" fill="#a55436"/><rect x="2" y="-21" width="12" height="7" rx="1.5" fill="#a55436"/>`);
  if (type === 'mountains') return g(`<path d="M-30 16 L-8 -22 L8 6 L16 -8 L32 16 Z" fill="#8e929b"/><path d="M-8 -22 L-15 -10 L-9 -12 L-4 -8 L-1 -11 Z" fill="#fff"/><path d="M16 -8 L12 -1 L16 -3 L20 -1 Z" fill="#fff"/>`);
  return '';
}

function sheep(x, y, k = 1) {
  return `<g transform="translate(${x} ${y}) scale(${k})"><g fill="#fffaf2" stroke="#8b8172" stroke-width="1.5">
    <circle cx="-6" cy="0" r="6"/><circle cx="2" cy="-3" r="7"/><circle cx="8" cy="2" r="6"/><circle cx="0" cy="4" r="6"/></g>
    <ellipse cx="-12" cy="1" rx="4" ry="4.5" fill="#3b302a"/><rect x="-4" y="9" width="2.5" height="6" fill="#3b302a"/><rect x="5" y="8" width="2.5" height="6" fill="#3b302a"/></g>`;
}

function ship(x, y, k, color, flip) {
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${flip ? -k : k} ${k})">
    <path d="M-30 10 H30 L22 24 H-22 Z" fill="#8a5a32" stroke="#5d3c22" stroke-width="2" stroke-linejoin="round"/>
    <path d="M-26 14 H26" stroke="${color}" stroke-width="3"/>
    <path d="M0 -34 V10" stroke="#5a3d24" stroke-width="3"/>
    <path d="M2 -32 C20 -24 22 -6 18 6 H2 Z" fill="${color}" stroke="#5d3c22" stroke-width="2" stroke-linejoin="round"/>
    <path d="M-2 -26 C-14 -16 -15 -4 -12 6 H-2 Z" fill="#fff6e4" stroke="#5d3c22" stroke-width="2" stroke-linejoin="round"/>
    <path d="M-40 28 q10 -5 20 0 t20 0 t20 0 t20 0" stroke="#e8f6fb" stroke-width="2.5" fill="none" stroke-linecap="round"/></g>`;
}

/** Build the backdrop SVG for a w×h viewport. */
export function menuBackgroundSVG(w, h, seed = 7) {
  const rand = mulberry32(seed);
  const r = Math.max(38, Math.min(62, Math.min(w, h) / 11));
  const dx = Math.sqrt(3) * r, dy = 1.5 * r;
  const parts = [];
  // gentle wave strokes on the sea
  for (let i = 0; i < Math.round((w * h) / 26000); i++) {
    const x = rand() * w, y = rand() * h, l = 14 + rand() * 18;
    parts.push(`<path d="M${x.toFixed(0)} ${y.toFixed(0)} q${(l / 2).toFixed(0)} -6 ${l.toFixed(0)} 0 t${l.toFixed(0)} 0" stroke="#bfe6f0" stroke-width="2.5" fill="none" stroke-linecap="round" opacity="0.7"/>`);
  }
  // a few islands of hex tiles spread over the screen (the centre stays calm for the menu card)
  const tiles = [];
  // island anchors all around the menu card (fractions of the screen), a little jittered
  const anchors = [[0.1, 0.16], [0.08, 0.55], [0.16, 0.9], [0.3, 0.1], [0.72, 0.12], [0.9, 0.3], [0.88, 0.75], [0.66, 0.92], [0.33, 0.62]]
    .filter(([ax]) => w > 900 || ax < 0.2 || ax > 0.8);
  for (const [ax, ay] of anchors) {
    const cx = (ax + (rand() - 0.5) * 0.06) * w, cy = (ay + (rand() - 0.5) * 0.06) * h;
    if (Math.abs(cx - w / 2) < Math.min(260, w * 0.2) && Math.abs(cy - h / 2) < h * 0.42) continue; // keep clear of the card
    const col = Math.round(cx / dx), row = Math.round(cy / dy);
    const size = 3 + Math.floor(rand() * 4);
    const cells = [[col, row]];
    for (let k = 0; k < size * 4 && cells.length < size; k++) {
      const [c0, r0] = cells[Math.floor(rand() * cells.length)];
      const odd = r0 & 1;
      const nb = [[1, 0], [-1, 0], [odd ? 1 : 0, -1], [odd ? 0 : -1, -1], [odd ? 1 : 0, 1], [odd ? 0 : -1, 1]][Math.floor(rand() * 6)];
      const c = [c0 + nb[0], r0 + nb[1]];
      if (!cells.some(([a, b]) => a === c[0] && b === c[1])) cells.push(c);
    }
    // every island gets a mix: a pasture (with sheep) and a forest first, then random
    const mix = ['pasture', 'forest', ...Array.from({ length: cells.length }, () => TYPES[Math.floor(rand() * TYPES.length)])];
    cells.forEach(([c, rr], i) => { if (!tiles.some((t) => t.c === c && t.r === rr)) tiles.push({ c, r: rr, type: mix[i] }); });
  }
  tiles.sort((a, b) => a.r - b.r);
  for (const t of tiles) {
    const x = t.c * dx + (t.r & 1 ? dx / 2 : 0), y = t.r * dy;
    const T = TILE[t.type];
    parts.push(`<polygon points="${hexPts(x, y + r * 0.2, r * 1.04)}" fill="#e8f7fb" opacity="0.55"/>`); // surf
    parts.push(`<polygon points="${hexPts(x, y + r * 0.16, r * 0.97)}" fill="${T.side}"/>`);
    parts.push(`<polygon points="${hexPts(x, y, r * 0.97)}" fill="${T.top}"/>`);
    parts.push(decor(t.type, x, y, r, rand));
  }
  // ships out on the open water
  const free = (x, y) => !tiles.some((t) => Math.hypot(t.c * dx + (t.r & 1 ? dx / 2 : 0) - x, t.r * dy - y) < r * 1.3)
    && !(Math.abs(x - w / 2) < w * 0.2 && Math.abs(y - h / 2) < h * 0.36);
  let ships = 0;
  const placed = [];
  for (let k = 0; k < 400 && ships < 7; k++) {
    const x = rand() * w, y = rand() * h;
    if (!free(x, y) || placed.some(([px, py]) => Math.hypot(px - x, py - y) < r * 2.6)) continue;
    placed.push([x, y]);
    parts.push(ship(x, y, r / 52 * (0.8 + rand() * 0.4), SAILS[ships % SAILS.length], rand() < 0.5));
    ships++;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">
    <defs><radialGradient id="sea" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#9bd6e4"/><stop offset="1" stop-color="#4f9fbd"/></radialGradient></defs>
    <rect width="100%" height="100%" fill="url(#sea)"/>${parts.join('')}</svg>`;
}

/** Paint the backdrop into element `el` (and keep it fitting the window). */
export function applyMenuBackground(el) {
  const paint = () => {
    const svg = menuBackgroundSVG(Math.max(320, innerWidth), Math.max(320, innerHeight));
    el.style.backgroundImage = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
  };
  paint();
  let timer = null;
  window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(paint, 200); });
}
